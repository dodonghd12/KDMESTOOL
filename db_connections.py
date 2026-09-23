import pg8000
import pg8000.exceptions
import queue
import threading
import time
from contextlib import contextmanager

class DatabaseError(Exception):
    """Lỗi cơ sở dữ liệu chung."""
    pass

class DatabaseConnectionError(DatabaseError):
    """Lỗi khi kết nối hoặc mất kết nối tới cơ sở dữ liệu."""
    pass

class DatabaseQueryError(DatabaseError):
    """Lỗi khi thực thi câu lệnh SQL."""
    pass

class PooledConnection:
    """Wrapper cho pg8000 connection để tự động trả connection về pool khi close() hoặc exit context."""
    def __init__(self, raw_conn, pool):
        self._raw_conn = raw_conn
        self._pool = pool
        self._closed = False

    def __getattr__(self, name):
        return getattr(self._raw_conn, name)

    def close(self):
        if not self._closed:
            self._closed = True
            self._pool.release_connection(self._raw_conn, discard=False)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        discard = exc_type is not None
        if not self._closed:
            self._closed = True
            self._pool.release_connection(self._raw_conn, discard=discard)

class PgConnectionPool:
    def __init__(self, host, port, user, password, database, max_connections=15, timeout=10.0, max_idle_time=300):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.database = database
        self.max_connections = max_connections
        self.timeout = timeout
        self.max_idle_time = max_idle_time
        
        self._pool = queue.LifoQueue(maxsize=max_connections)
        self._lock = threading.Lock()
        self._created_count = 0

    def _create_raw_connection(self):
        try:
            conn = pg8000.connect(
                user=self.user,
                password=self.password,
                database=self.database,
                host=self.host,
                port=self.port,
                timeout=None
            )
            # Tắt JIT compiler ở mức session kết nối để tối ưu latency cho các câu lệnh OLTP ngắn
            cur = conn.cursor()
            cur.execute("SET jit = off;")
            cur.close()
            return conn
        except Exception as e:
            raise DatabaseConnectionError(f"Không thể kết nối đến PostgreSQL {self.host}:{self.port}/{self.database}: {e}")

    def _is_conn_alive(self, conn):
        try:
            cur = conn.cursor()
            cur.execute("SELECT 1;")
            cur.fetchall()
            cur.close()
            return True
        except Exception:
            return False

    def get_connection(self, timeout=None):
        wait_timeout = timeout if timeout is not None else self.timeout
        start_time = time.time()
        
        while True:
            # 1. Thử lấy kết nối đang nhàn rỗi trong pool
            try:
                raw_conn, last_used = self._pool.get_nowait()
                now = time.time()
                if (now - last_used) > self.max_idle_time or not self._is_conn_alive(raw_conn):
                    try:
                        raw_conn.close()
                    except Exception:
                        pass
                    with self._lock:
                        self._created_count = max(0, self._created_count - 1)
                    continue
                return PooledConnection(raw_conn, self)
            except queue.Empty:
                pass

            # 2. Kiểm tra nếu pool chưa chạm trần max_connections thì tạo kết nối mới
            with self._lock:
                if self._created_count < self.max_connections:
                    self._created_count += 1
                    create_new = True
                else:
                    create_new = False

            if create_new:
                try:
                    raw_conn = self._create_raw_connection()
                    return PooledConnection(raw_conn, self)
                except Exception:
                    with self._lock:
                        self._created_count = max(0, self._created_count - 1)
                    raise

            # 3. Nếu pool đầy, chờ kết nối được giải phóng
            remaining = wait_timeout - (time.time() - start_time)
            if remaining <= 0:
                raise DatabaseConnectionError(f"Connection pool cạn kiệt (đạt giới hạn {self.max_connections} connections tới {self.host})")
            
            try:
                raw_conn, last_used = self._pool.get(timeout=min(remaining, 1.0))
                now = time.time()
                if (now - last_used) > self.max_idle_time or not self._is_conn_alive(raw_conn):
                    try:
                        raw_conn.close()
                    except Exception:
                        pass
                    with self._lock:
                        self._created_count = max(0, self._created_count - 1)
                    continue
                return PooledConnection(raw_conn, self)
            except queue.Empty:
                continue

    def release_connection(self, raw_conn, discard=False):
        if raw_conn is None:
            return
        if discard:
            try:
                raw_conn.close()
            except Exception:
                pass
            with self._lock:
                self._created_count = max(0, self._created_count - 1)
            return

        try:
            if getattr(raw_conn, 'in_transaction', False):
                raw_conn.rollback()
            self._pool.put_nowait((raw_conn, time.time()))
        except Exception:
            try:
                raw_conn.close()
            except Exception:
                pass
            with self._lock:
                self._created_count = max(0, self._created_count - 1)

    @contextmanager
    def connection(self):
        conn = self.get_connection()
        try:
            yield conn
        finally:
            conn.close()

# Khởi tạo singleton connection pools
prod_pool = PgConnectionPool(
    host="198.1.10.85",
    port=5432,
    user="postgres",
    password="kenda",
    database="kverp",
    max_connections=15
)

dev_pool = PgConnectionPool(
    host="198.1.10.3",
    port=5432,
    user="postgres",
    password="kenda",
    database="kverp_dev",
    max_connections=10
)

def get_pg_connection():
    """Context manager lấy kết nối Production từ connection pool."""
    return prod_pool.connection()

def get_pg_dev_connection():
    """Context manager lấy kết nối Dev từ connection pool."""
    return dev_pool.connection()

def connect_pg_db():
    """Lấy PooledConnection từ Production pool (tự động hoàn trả khi gọi conn.close())."""
    try:
        return prod_pool.get_connection()
    except Exception as e:
        print(f"Error getting connection from prod pool: {e}")
        return None

def connect_pg_db_dev():
    """Lấy PooledConnection từ Dev pool (tự động hoàn trả khi gọi conn.close())."""
    try:
        return dev_pool.get_connection()
    except Exception as e:
        print(f"Error getting connection from dev pool: {e}")
        return None
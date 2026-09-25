import json
from db_connections import (
    get_pg_connection,
    get_pg_dev_connection,
    DatabaseError,
    DatabaseConnectionError,
    DatabaseQueryError
)

def _classify_db_exception(e, db_name="PostgreSQL"):
    """Phân loại ngoại lệ thành DatabaseConnectionError hoặc DatabaseQueryError."""
    if isinstance(e, (DatabaseConnectionError, DatabaseQueryError)):
        return e
    err_str = str(e).lower()
    if any(k in err_str for k in ("connect", "broken pipe", "connection", "socket", "timeout", "network", "interfaceerror", "eof")):
        return DatabaseConnectionError(f"Lỗi kết nối tới {db_name}: {e}")
    return DatabaseQueryError(f"Lỗi truy vấn {db_name}: {e}")

# ==============================================================================
# PostgreSQL Production Select Query
# ==============================================================================
def execute_pg_select_query(query, params=()):
    """
    Thực thi câu lệnh SELECT trên Production PostgreSQL (198.1.10.85).
    Trả về: (result, column_names) nếu thành công (result có thể là [] nếu 0 dòng).
    Ném ngoại lệ: DatabaseConnectionError nếu mất kết nối/không kết nối được, DatabaseQueryError nếu lỗi SQL.
    """
    try:
        with get_pg_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            result = cursor.fetchall()
            column_names = [desc[0] for desc in cursor.description] if cursor.description else []
            cursor.close()
            return result, column_names
    except Exception as e:
        raise _classify_db_exception(e, "PostgreSQL Production (198.1.10.85)")

# ==============================================================================
# PostgreSQL Dev Select Query
# ==============================================================================
def execute_pg_dev_select_query(query, params=()):
    """
    Thực thi câu lệnh SELECT trên Dev PostgreSQL (198.1.10.3).
    """
    try:
        with get_pg_dev_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            result = cursor.fetchall()
            column_names = [desc[0] for desc in cursor.description] if cursor.description else []
            cursor.close()
            return result, column_names
    except Exception as e:
        raise _classify_db_exception(e, "PostgreSQL Dev (198.1.10.3)")

# ==============================================================================
# PostgreSQL Update Query
# ==============================================================================
def execute_pg_update_query(query, params):
    """
    Thực thi câu lệnh UPDATE / DELETE trên Production PostgreSQL.
    """
    try:
        with get_pg_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            conn.commit()
            cursor.close()
            return True
    except Exception as e:
        raise _classify_db_exception(e, "PostgreSQL Production (198.1.10.85)")

# ==============================================================================
# Helper format value cho câu lệnh INSERT
# ==============================================================================
def convert_value(val):
    if isinstance(val, dict):
        return json.dumps(val, ensure_ascii=False)
    
    if isinstance(val, (list, tuple)):
        if all(isinstance(v, (dict, list)) for v in val):
            return json.dumps(val, ensure_ascii=False)
        else:
            return "{" + ",".join(str(v) for v in val) + "}"
    
    if isinstance(val, str):
        stripped = val.strip()
        if stripped == "[]":
            return "[]"
        if (stripped.startswith("{") and stripped.endswith("}")) or \
           (stripped.startswith("[") and stripped.endswith("]")):
            return stripped
        return val
    
    return val

# ==============================================================================
# PostgreSQL Insert Query
# ==============================================================================
def execute_pg_insert_query(table_name, result, column_names):
    """
    Thực thi câu lệnh INSERT hàng loạt trên Production PostgreSQL.
    """
    try:
        with get_pg_connection() as conn:
            with conn.cursor() as cur:
                cols_str = ", ".join(column_names)
                placeholders = ", ".join(["%s"] * len(column_names))
                insert_sql = f"INSERT INTO {table_name} ({cols_str}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"

                for row in result:
                    row_processed = [convert_value(v) for v in row]
                    cur.execute(insert_sql, row_processed)

            conn.commit()
            return True
    except Exception as e:
        raise _classify_db_exception(e, f"PostgreSQL Insert vào {table_name}")
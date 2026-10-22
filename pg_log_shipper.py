import os
import sys
import re
import json
import time
import logging
from datetime import datetime

# Đảm bảo import được module từ thư mục gốc KDMESTOOL
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

POSTGRES_AUDIT_LOG_NETWORK_DIR = r"\\198.1.10.2\Vitinh\Thu\QUAN TRONG KHONG XOA\KvmesAuditDaemonLog"
POSTGRES_AUDIT_LOG_LOCAL_DIR = os.path.join(ROOT_DIR, "KvmesAuditDaemonLog")

TARGET_TABLES = {'material_resource', 'collect_record', 'work_order', 'batch', 'feed_record'}

LINE_REGEX = re.compile(
    r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\.\d+ \+\d+ \[(\d+)\] (\S+)@(\S+) (\S+?)(?:\(\d+\))? (LOG|DETAIL):\s+(.*)$'
)

logger = logging.getLogger("PgLogShipper")

def append_to_audit_jsonl(entry: dict):
    """Ghi 1 bản ghi audit vào file deleted_records_YYYY-MM-DD.jsonl."""
    target_dir = POSTGRES_AUDIT_LOG_NETWORK_DIR if os.path.exists(POSTGRES_AUDIT_LOG_NETWORK_DIR) else POSTGRES_AUDIT_LOG_LOCAL_DIR
    try:
        os.makedirs(target_dir, exist_ok=True)
    except Exception as e:
        print(f"[PgLogShipper] Error creating directory {target_dir}: {e}")
        return

    ts_str = entry.get('timestamp') or datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    date_str = ts_str[:10]
    file_path = os.path.join(target_dir, f"deleted_records_{date_str}.jsonl")
    
    line = json.dumps(entry, ensure_ascii=False) + '\n'
    try:
        with open(file_path, 'a', encoding='utf-8') as f:
            f.write(line)
        print(f"[PgLogShipper] [{ts_str}] Captured DELETE on {entry.get('table')} ID: {entry.get('record_oid')} (IP: {entry.get('client_ip')})")
    except Exception as e:
        print(f"[PgLogShipper] Error writing file {file_path}: {e}")

def run_log_shipper_stream():
    """Lắng nghe luồng log thời gian thực từ /var/log/postgresql/postgresql-17-main.log qua SSH."""
    import paramiko

    while True:
        client = None
        try:
            print("[PgLogShipper] Connecting SSH to PostgreSQL server 198.1.10.85...")
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            client.connect("198.1.10.85", port=22, username="root", password="kenda", timeout=15)
            print("[PgLogShipper] SSH connected. Listening to native PostgreSQL DELETE audit stream...")

            # Dùng tail -n 0 -F để theo dõi log real-time và hỗ trợ logrotate tự động
            cmd = "tail -n 0 -F /var/log/postgresql/postgresql-17-main.log"
            stdin, stdout, stderr = client.exec_command(cmd, get_pty=False)

            pending_deletes = {}

            for raw_line in iter(stdout.readline, ""):
                line_str = raw_line.strip()
                if not line_str:
                    continue

                m = LINE_REGEX.match(line_str)
                if not m:
                    continue

                ts, pid, user, db, ip, log_type, msg = m.groups()

                if log_type == 'LOG':
                    del_match = re.search(r'DELETE\s+FROM\s+(?:kvmes\.)?["\']?([a-zA-Z0-9_]+)["\']?', msg, re.IGNORECASE)
                    if del_match:
                        table = del_match.group(1).lower()
                        if table in TARGET_TABLES:
                            # 1. Trường hợp Simple query (DBeaver/raw SQL)
                            where_match = re.search(r'WHERE\s+(?:["\']?[a-zA-Z0-9_]+["\']?\.)?["\']?id["\']?\s*=\s*[\'"]([^\'"]+)[\'"]', msg, re.IGNORECASE)
                            if where_match:
                                item_id = where_match.group(1)
                                entry = {
                                    "timestamp": ts,
                                    "schema": "kvmes",
                                    "table": table,
                                    "client_ip": ip,
                                    "record_oid": item_id,
                                    "data": {
                                        "id": item_id,
                                        "user": user,
                                        "client_ip": ip,
                                        "statement": msg
                                    }
                                }
                                append_to_audit_jsonl(entry)
                            elif '$' in msg:
                                # 2. Trường hợp Prepared Statement -> lưu pid chờ dòng DETAIL tiếp theo
                                pending_deletes[pid] = {
                                    'ts': ts,
                                    'ip': ip,
                                    'user': user,
                                    'table': table,
                                    'msg': msg
                                }

                elif log_type == 'DETAIL' and pid in pending_deletes:
                    info = pending_deletes.pop(pid)
                    # Trích xuất các tham số: $1 = 'val1', $2 = 'val2'
                    params = re.findall(r"\$\d+\s*=\s*'([^']*)'", msg)
                    if params:
                        for p_val in params:
                            entry = {
                                "timestamp": info['ts'],
                                "schema": "kvmes",
                                "table": info['table'],
                                "client_ip": info['ip'],
                                "record_oid": p_val,
                                "data": {
                                    "id": p_val,
                                    "user": info['user'],
                                    "client_ip": info['ip'],
                                    "statement": info['msg']
                                }
                            }
                            append_to_audit_jsonl(entry)

        except Exception as e:
            print(f"[PgLogShipper] Connection interrupted ({e}). Retrying in 5s...")
            time.sleep(5)
        finally:
            if client:
                try:
                    client.close()
                except Exception:
                    pass

if __name__ == '__main__':
    run_log_shipper_stream()

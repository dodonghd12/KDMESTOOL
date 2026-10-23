import os
import sys
import re
import json
import time
import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime

# Đảm bảo import được module từ thư mục gốc KDMESTOOL và thư viện ocr_libs (paramiko)
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

OCR_LIBS = os.path.join(ROOT_DIR, "ocr_libs")
if os.path.exists(OCR_LIBS) and OCR_LIBS not in sys.path:
    sys.path.append(OCR_LIBS)

POSTGRES_AUDIT_LOG_NETWORK_DIR = r"\\198.1.10.2\Vitinh\Thu\QUAN TRONG KHONG XOA\KvmesAuditDaemonLog"
POSTGRES_AUDIT_LOG_LOCAL_DIR = os.path.join(ROOT_DIR, "KvmesAuditDaemonLog")

TARGET_TABLES = {
    'material_resource', 'collect_record', 'work_order', 'batch', 'feed_record',
    'recipe', 'recipe_process_definition', 'defective_code', 'defective_records', 'substitution_mapping'
}

LINE_REGEX = re.compile(
    r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\.\d+ \+\d+ \[(\d+)\] (\S+)@(\S+) (\S+?)(?:\(\d+\))? (LOG|DETAIL):\s+(.*)$'
)

# Cấu hình logging ra file pg_log_shipper.log
log_file = os.path.join(ROOT_DIR, "pg_log_shipper.log")
logger = logging.getLogger("PgLogShipper")
logger.setLevel(logging.INFO)
if not logger.handlers:
    try:
        fh = RotatingFileHandler(log_file, maxBytes=10 * 1024 * 1024, backupCount=3, encoding='utf-8')
        fh.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
        logger.addHandler(fh)
    except Exception:
        pass

# Trạng thái giám sát thời gian thực
shipper_status = {
    "active": False,
    "connected": False,
    "last_check": None,
    "last_captured": None,
    "total_captured": 0,
    "error": None
}

seen_keys = set()

def load_seen_keys(target_dir: str):
    """Đọc các bản ghi đã ghi trong ngày hôm nay vào bộ nhớ để chống trùng lặp khi catchup."""
    today_str = datetime.now().strftime('%Y-%m-%d')
    file_path = os.path.join(target_dir, f"deleted_records_{today_str}.jsonl")
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                for line in f:
                    try:
                        d = json.loads(line)
                        k = (d.get('timestamp', '')[:19], d.get('table', ''), str(d.get('record_oid', '')))
                        seen_keys.add(k)
                    except Exception:
                        pass
            logger.info(f"Loaded {len(seen_keys)} existing keys for today ({today_str}) to prevent duplicates.")
        except Exception as e:
            logger.error(f"Error loading existing keys: {e}")

def get_target_dir():
    return POSTGRES_AUDIT_LOG_NETWORK_DIR if os.path.exists(POSTGRES_AUDIT_LOG_NETWORK_DIR) else POSTGRES_AUDIT_LOG_LOCAL_DIR

def enrich_material_resource(oid_or_id: str, client_user: str = "system", id_key: str = "oid") -> dict:
    """Truy vấn collect_record và work_order để tái tạo đầy đủ 22 cột chuẩn của kvmes.material_resource."""
    now_ns = int(time.time() * 1e9)
    default_expiry_ns = now_ns + int(7 * 24 * 3600 * 1e9)

    record = {
        "oid": oid_or_id if id_key == "oid" else "",
        "id": oid_or_id,
        "product_id": "",
        "product_type": "",
        "quantity": 0.0,
        "status": 1,
        "expiry_time": default_expiry_ns,
        "info": {
            "unit": "",
            "grade": "",
            "remark": "",
            "purchase": {
                "item_no": "",
                "order_no": "",
                "delivery_count": ""
            },
            "change_log": None,
            "lot_number": "",
            "min_dosage": "0",
            "hold_reason": 0,
            "inspections": [],
            "deferrals_count": 0,
            "production_info": {
                "station": "",
                "recipe_id": "",
                "next_station": "",
                "process_name": "",
                "process_type": "PRODUCE",
                "production_time": datetime.now().isoformat() + "Z"
            },
            "planned_quantity": "0",
            "additional_fields": None,
            "is_special_approved": False,
            "inspection_serial_number": ""
        },
        "warehouse_id": "",
        "warehouse_location": "",
        "updated_at": now_ns,
        "updated_by": client_user or "system",
        "created_at": now_ns,
        "created_by": client_user or "system",
        "station": "",
        "feed_records_id": "{}",
        "batch_count": 0,
        "reprint_reason": 0,
        "collected": False,
        "erp_tire_barcode_synced": False,
        "standing_time": 0,
        "initial_quantity": 0.0
    }

    try:
        from db_connections import get_pg_connection
        with get_pg_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT cr.oid, cr.work_order, cr.lot_number, cr.station, cr.detail, cr.created_at,
                       wo.information, wo.recipe_id, wo.process_name, wo.process_type
                FROM kvmes.collect_record cr
                LEFT JOIN kvmes.work_order wo ON cr.work_order = wo.id
                WHERE cr.resource_oid::text = %s
                LIMIT 1
            """, (oid_or_id,))
            row = cur.fetchone()
            if row:
                cr_oid, wo_id, lot_no, station, detail, cr_created_at, wo_info, recipe_id, proc_name, proc_type = row
                record["collected"] = True
                if station:
                    record["station"] = station
                    record["info"]["production_info"]["station"] = station
                if lot_no:
                    record["info"]["lot_number"] = lot_no
                if recipe_id:
                    record["info"]["production_info"]["recipe_id"] = recipe_id
                if proc_name:
                    record["info"]["production_info"]["process_name"] = proc_name
                if proc_type:
                    record["info"]["production_info"]["process_type"] = proc_type

                if cr_created_at:
                    try:
                        c_ts = int(cr_created_at)
                        record["created_at"] = c_ts
                        record["updated_at"] = c_ts
                        record["standing_time"] = c_ts
                        record["expiry_time"] = c_ts + int(7 * 24 * 3600 * 1e9)
                        dt = datetime.fromtimestamp(c_ts / 1e9)
                        record["info"]["production_info"]["production_time"] = dt.isoformat() + "Z"
                    except Exception:
                        pass

                if isinstance(detail, dict):
                    qty = 0.0
                    try:
                        qty = float(detail.get("quantity", 0) or 0)
                    except (ValueError, TypeError):
                        pass
                    record["quantity"] = qty
                    record["initial_quantity"] = qty
                    record["batch_count"] = int(detail.get("batch_count", 0) or 0)
                    op_id = detail.get("operator_id") or client_user
                    if op_id:
                        record["created_by"] = op_id
                        record["updated_by"] = op_id

                if isinstance(wo_info, dict):
                    record["product_id"] = wo_info.get("product_id", "")
                    record["product_type"] = wo_info.get("product_type", "")
                    plan_qty = wo_info.get("plan_quantity", {})
                    if isinstance(plan_qty, dict):
                        record["info"]["planned_quantity"] = str(plan_qty.get("plan_quantity", "0"))
                    elif plan_qty:
                        record["info"]["planned_quantity"] = str(plan_qty)
    except Exception as e:
        logger.error(f"Error enriching material_resource {oid_or_id}: {e}")

    return record

def append_to_audit_jsonl(entry: dict):
    """Ghi 1 bản ghi audit vào file deleted_records_YYYY-MM-DD.jsonl."""
    ts_str = entry.get('timestamp') or datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    k = (ts_str[:19], entry.get('table', ''), str(entry.get('record_oid', '')))
    if k in seen_keys:
        return
    seen_keys.add(k)

    target_dir = get_target_dir()
    try:
        os.makedirs(target_dir, exist_ok=True)
    except Exception as e:
        logger.error(f"Error creating directory {target_dir}: {e}")
        return

    date_str = ts_str[:10]
    file_path = os.path.join(target_dir, f"deleted_records_{date_str}.jsonl")
    
    line = json.dumps(entry, ensure_ascii=False) + '\n'
    try:
        with open(file_path, 'a', encoding='utf-8') as f:
            f.write(line)
        shipper_status["last_captured"] = ts_str
        shipper_status["total_captured"] += 1
        logger.info(f"Captured DELETE on {entry.get('table')} ID: {entry.get('record_oid')} (IP: {entry.get('client_ip')})")
        print(f"[PgLogShipper] [{ts_str}] Captured DELETE on {entry.get('table')} ID: {entry.get('record_oid')} (IP: {entry.get('client_ip')})")
    except Exception as e:
        logger.error(f"Error writing file {file_path}: {e}")
        print(f"[PgLogShipper] Error writing file {file_path}: {e}")

def extract_delete_records(msg: str):
    """Trích xuất table, id_key và danh sách identifiers từ câu lệnh DELETE."""
    del_match = re.search(r'DELETE\s+FROM\s+(?:["\']?kvmes["\']?\.)?["\']?([a-zA-Z0-9_]+)["\']?', msg, re.IGNORECASE)
    if not del_match:
        return None, None, []
    
    table = del_match.group(1).lower()
    if table not in TARGET_TABLES:
        return None, None, []

    # 1. Kiểm tra WHERE (oid|id) IN ('val1', 'val2', ...)
    in_match = re.search(r'WHERE\s+(?:["\']?[a-zA-Z0-9_]+["\']?\.)?["\']?(oid|id)["\']?\s+IN\s*\(([^)]+)\)', msg, re.IGNORECASE | re.DOTALL)
    if in_match:
        id_key = in_match.group(1).lower()
        raw_vals = in_match.group(2)
        vals = re.findall(r"['\"]([^'\"]+)['\"]", raw_vals)
        return table, id_key, vals

    # 2. Kiểm tra WHERE (oid|id) = 'val'
    eq_match = re.search(r'WHERE\s+(?:["\']?[a-zA-Z0-9_]+["\']?\.)?["\']?(oid|id)["\']?\s*=\s*[\'"]([^\'"]+)[\'"]', msg, re.IGNORECASE)
    if eq_match:
        id_key = eq_match.group(1).lower()
        val = eq_match.group(2)
        return table, id_key, [val]

    # 3. Prepared statement $
    if '$' in msg:
        id_key_match = re.search(r'WHERE\s+(?:["\']?[a-zA-Z0-9_]+["\']?\.)?["\']?(oid|id)["\']?\s*(?:=|\bIN\b)', msg, re.IGNORECASE)
        id_key = id_key_match.group(1).lower() if id_key_match else 'id'
        return table, id_key, ['$PREPARED$']

    return table, 'unknown', []

def run_log_shipper_stream():
    """Lắng nghe luồng log thời gian thực từ /var/log/postgresql/postgresql-17-main.log qua SSH."""
    import paramiko

    shipper_status["active"] = True
    load_seen_keys(get_target_dir())

    while True:
        client = None
        try:
            shipper_status["connected"] = False
            shipper_status["error"] = None
            logger.info("Connecting SSH to PostgreSQL server 198.1.10.85...")
            print("[PgLogShipper] Connecting SSH to PostgreSQL server 198.1.10.85...")

            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            client.connect("198.1.10.85", port=22, username="root", password="kenda", timeout=15)
            
            shipper_status["connected"] = True
            shipper_status["last_check"] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            logger.info("SSH connected. Listening to native PostgreSQL DELETE audit stream with catchup...")
            print("[PgLogShipper] SSH connected. Listening to native PostgreSQL DELETE audit stream with catchup...")

            # Đọc 10,000 dòng gần nhất để catchup ngay lập tức mọi lệnh DELETE xảy ra trước đó, sau đó tiếp tục follow (-F)
            cmd = "tail -n 10000 -F /var/log/postgresql/postgresql-17-main.log"
            stdin, stdout, stderr = client.exec_command(cmd, get_pty=False)

            pending_prepared = {}
            current_entry = None

            def process_completed_entry(entry):
                if not entry:
                    return
                log_type = entry.get('log_type')
                pid = entry.get('pid')
                msg = entry.get('msg', '')

                if log_type == 'LOG':
                    table, id_key, vals = extract_delete_records(msg)
                    if table and vals:
                        if vals == ['$PREPARED$']:
                            # Chờ dòng DETAIL tiếp theo cho pid này
                            pending_prepared[pid] = {
                                'ts': entry['ts'],
                                'ip': entry['ip'],
                                'user': entry['user'],
                                'table': table,
                                'id_key': id_key,
                                'msg': msg
                            }
                        else:
                            # Trích xuất được trực tiếp (simple query / pgAdmin multi-line / IN (...))
                            for val in vals:
                                if table == 'material_resource':
                                    rec_data = enrich_material_resource(val, client_user=entry['user'], id_key=id_key)
                                else:
                                    rec_data = {
                                        id_key: val,
                                        'user': entry['user'],
                                        'client_ip': entry['ip'],
                                        'statement': msg.strip()
                                    }
                                audit_entry = {
                                    "timestamp": entry['ts'],
                                    "schema": "kvmes",
                                    "table": table,
                                    "client_ip": entry['ip'],
                                    "record_oid": val,
                                    "data": rec_data
                                }
                                append_to_audit_jsonl(audit_entry)

                elif log_type == 'DETAIL' and pid in pending_prepared:
                    info = pending_prepared.pop(pid)
                    params = re.findall(r"\$\d+\s*=\s*'([^']*)'", msg)
                    if params:
                        for p_val in params:
                            if info['table'] == 'material_resource':
                                rec_data = enrich_material_resource(p_val, client_user=info['user'], id_key=info['id_key'])
                            else:
                                rec_data = {
                                    info['id_key']: p_val,
                                    'user': info['user'],
                                    'client_ip': info['ip'],
                                    'statement': info['msg'].strip()
                                }
                            audit_entry = {
                                "timestamp": info['ts'],
                                "schema": "kvmes",
                                "table": info['table'],
                                "client_ip": info['ip'],
                                "record_oid": p_val,
                                "data": rec_data
                            }
                            append_to_audit_jsonl(audit_entry)

            for raw_line in iter(stdout.readline, ""):
                shipper_status["last_check"] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                line_str = raw_line.rstrip('\r\n')
                if not line_str:
                    continue

                m = LINE_REGEX.match(line_str)
                if m:
                    # Bắt đầu một log entry mới -> Xử lý entry trước đó nếu có
                    if current_entry:
                        process_completed_entry(current_entry)
                    ts, pid, user, db, ip, log_type, msg = m.groups()
                    current_entry = {
                        'ts': ts,
                        'pid': pid,
                        'user': user,
                        'db': db,
                        'ip': ip,
                        'log_type': log_type,
                        'msg': msg
                    }
                else:
                    # Dòng tiếp theo của câu lệnh nhiều dòng (multi-line statement pgAdmin/DBeaver)
                    if current_entry:
                        current_entry['msg'] += "\n" + line_str

            if current_entry:
                process_completed_entry(current_entry)

        except Exception as e:
            shipper_status["connected"] = False
            shipper_status["error"] = str(e)
            logger.error(f"Connection interrupted ({e}). Retrying in 5s...")
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

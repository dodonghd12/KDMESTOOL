from flask import Flask, render_template, request, jsonify, session, redirect, url_for, Response, make_response # type: ignore
from flask_session import Session
from decimal import Decimal
from functools import wraps
import pytz # type: ignore
import urllib3 # type: ignore
import requests # type: ignore
import json
import os
import base64
import yaml
from datetime import datetime, timezone, timedelta
import re
import glob
from typing import Optional
from db_execute import (execute_pg_select_query, execute_pg_update_query, execute_pg_dev_select_query, execute_pg_insert_query, execute_mssql_select_query)
from db_connections import (
    get_pg_connection,
    get_pg_dev_connection,
    DatabaseError,
    DatabaseConnectionError,
    DatabaseQueryError
)
import threading
from concurrent.futures import ThreadPoolExecutor
import difflib
import time
import uuid
from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter

_gitlab_session = None
_gitlab_session_lock = threading.Lock()
_recipe_path_cache = {}
_recipe_cache_lock = threading.Lock()

_actions_diff_cache = {}
_actions_diff_lock = threading.Lock()
_raw_actions_cache = {}
_raw_actions_lock = threading.Lock()
_actions_mr_cache = {}
_actions_mr_lock = threading.Lock()
_actions_pipeline_cache = {}
_actions_pipeline_lock = threading.Lock()

_technical_specifications_cache = {'timestamp': 0, 'data': None}
_technical_specifications_lock = threading.Lock()

LOG_YAML_DELETED_NETWORK_PATH = r"\\198.1.10.2\Vitinh\Thu\QUAN TRONG KHONG XOA\log_yaml_deleted_alerts.jsonl"
LOG_YAML_DELETED_LOCAL_PATH = os.path.join(os.path.dirname(__file__), "log_yaml_deleted_alerts.jsonl")

POSTGRES_AUDIT_LOG_NETWORK_DIR = r"\\198.1.10.2\Vitinh\Thu\QUAN TRONG KHONG XOA\KvmesAuditDaemonLog"
POSTGRES_AUDIT_LOG_LOCAL_DIR = os.path.join(os.path.dirname(__file__), "KvmesAuditDaemonLog")

def get_yaml_deleted_log_path():
    try:
        net_dir = os.path.dirname(LOG_YAML_DELETED_NETWORK_PATH)
        if os.path.exists(net_dir):
            return LOG_YAML_DELETED_NETWORK_PATH
    except Exception:
        pass
    return LOG_YAML_DELETED_LOCAL_PATH

def validate_actions_yaml_content(content: str, recipe_id: str) -> dict:
    """
    Kiểm tra tính hợp lệ về cú pháp và cấu trúc thụt lề của file actions.yaml.
    Quy tắc:
    - recipe:
        files: (bắt buộc thụt lề 2 khoảng trắng dưới recipe:)
          - <tên_file.yaml>
    """
    result = {
        'is_valid': True,
        'has_indent_error': False,
        'errors': [],
        'parsed_recipe_files': []
    }

    if not content or not content.strip():
        result['is_valid'] = False
        result['errors'].append('Nội dung actions.yaml rỗng')
        return result

    # 1. Parse YAML với PyYAML
    parsed_yaml = None
    try:
        parsed_yaml = yaml.safe_load(content)
    except Exception as e:
        result['is_valid'] = False
        result['errors'].append(f'Lỗi cú pháp YAML (YAML Syntax Error): {str(e)}')

    # 2. Phân tích cấu trúc YAML
    if isinstance(parsed_yaml, dict):
        recipe_block = parsed_yaml.get('recipe')
        root_files = parsed_yaml.get('files')

        if root_files is not None and (recipe_block is None or not isinstance(recipe_block, dict) or 'files' not in recipe_block):
            result['is_valid'] = False
            result['has_indent_error'] = True
            result['errors'].append("Khóa 'files:' đang nằm ở cấp ngoài cùng (root) thay vì thụt lề 2 khoảng trắng dưới 'recipe:'")

        if isinstance(recipe_block, dict):
            r_files = recipe_block.get('files', [])
            if isinstance(r_files, list):
                result['parsed_recipe_files'] = [str(f) for f in r_files]
        elif recipe_block is None and 'recipe' in parsed_yaml:
            result['is_valid'] = False
            result['has_indent_error'] = True
            result['errors'].append("Khối 'recipe:' bị rỗng (None) do các khóa con (như 'files:') không được thụt lề vào trong")

    # 3. Quét từng dòng kiểm tra thụt lề chính xác của 'files:' sau 'recipe:'
    lines = content.splitlines()
    in_recipe_section = False
    for idx, line in enumerate(lines):
        stripped = line.strip()
        if not stripped or stripped.startswith('#'):
            continue

        if line.startswith('recipe:'):
            in_recipe_section = True
            continue

        if in_recipe_section:
            if not line.startswith(' ') and not line.startswith('\t'):
                if stripped.startswith('files:'):
                    result['is_valid'] = False
                    result['has_indent_error'] = True
                    err_msg = f"Dòng {idx + 1}: 'files:' không được thụt lề 2 khoảng trắng dưới 'recipe:' (Đang ở lề ngoài cùng)"
                    if err_msg not in result['errors']:
                        result['errors'].append(err_msg)
                in_recipe_section = False
            else:
                if stripped.startswith('files:'):
                    indent_len = len(line) - len(line.lstrip(' '))
                    if indent_len < 2:
                        result['is_valid'] = False
                        result['has_indent_error'] = True
                        err_msg = f"Dòng {idx + 1}: 'files:' thụt lề không đúng ({indent_len} space thay vì tối thiểu 2 spaces)"
                        if err_msg not in result['errors']:
                            result['errors'].append(err_msg)

    # 4. Kiểm tra xem recipe_id có trong files hay không
    clean_rec = recipe_id.replace('.yaml', '').strip().lower()
    found_in_recipe_files = False
    for rf in result.get('parsed_recipe_files', []):
        if clean_rec in rf.lower():
            found_in_recipe_files = True
            break

    if result['is_valid'] and not found_in_recipe_files and result['parsed_recipe_files']:
        result['errors'].append(f"Không tìm thấy tên quy cách '{recipe_id}' trong danh sách files của 'recipe:'")

    if result['errors']:
        result['is_valid'] = False

    return result

def get_gitlab_token():
    token = os.environ.get('GITLAB_PRIVATE_TOKEN', '').strip()
    if token:
        return token

    # Check candidate paths for .env
    candidate_paths = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'),
        os.path.join(os.getcwd(), '.env'),
        r'E:\KV2_Services\KDMES\MATERIALMANAGEMENT_PUBLISH\.env',
        r'\\198.1.9.245\KV2_Services\KDMES\MATERIALMANAGEMENT_PUBLISH\.env'
    ]
    for env_path in candidate_paths:
        if os.path.exists(env_path):
            try:
                with open(env_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith('GITLAB_PRIVATE_TOKEN='):
                            val = line.split('=', 1)[1].strip().strip('"\'')
                            if val:
                                os.environ['GITLAB_PRIVATE_TOKEN'] = val
                                return val
            except Exception:
                pass

    return os.environ.get('GITLAB_PRIVATE_TOKEN', '')

gitlab_private_token = get_gitlab_token()

def get_gitlab_session():
    global _gitlab_session
    if _gitlab_session is None:
        with _gitlab_session_lock:
            if _gitlab_session is None:
                token = get_gitlab_token()
                s = requests.Session()
                retries = Retry(total=2, backoff_factor=0.2, status_forcelist=[500, 502, 503, 504])
                adapter = HTTPAdapter(pool_connections=50, pool_maxsize=50, max_retries=retries)
                s.mount('https://', adapter)
                s.mount('http://', adapter)
                s.headers.update({
                    'PRIVATE-TOKEN': token,
                    'User-Agent': 'KDMESTOOL-Client/1.0'
                })
                s.verify = False
                _gitlab_session = s
    else:
        token = get_gitlab_token()
        if token and _gitlab_session.headers.get('PRIVATE-TOKEN') != token:
            _gitlab_session.headers['PRIVATE-TOKEN'] = token
    return _gitlab_session

def get_prdexp_expdays() -> dict:
    """
    Truy vấn bảng [erp].[dbo].[prdexp] trên SQL Server 10.33 để lấy hạn sử dụng expday theo từng loại sản phẩm.
    """
    query = """
        SELECT [id], [subno], [factory], [ptype], [itcls], [rubkind], [rubno], [expday], [indat], [usrno]
        FROM [erp].[dbo].[prdexp]
        WHERE factory = 'V'
          AND ptype NOT IN ('RD', 'RR', 'RC', 'RB')
    """
    rubkind_map = {}
    try:
        rows, cols = execute_mssql_select_query(query)
        cols_lower = [str(c).lower() for c in cols]
        rubkind_idx = cols_lower.index('rubkind') if 'rubkind' in cols_lower else 5
        expday_idx = cols_lower.index('expday') if 'expday' in cols_lower else 7

        for r in rows:
            rk = str(r[rubkind_idx]).strip().upper() if len(r) > rubkind_idx and r[rubkind_idx] is not None else ""
            ed = r[expday_idx] if len(r) > expday_idx else None
            if rk and ed is not None:
                rubkind_map[rk] = ed
    except Exception as e:
        print(f"Error querying prdexp from SQL Server 10.33: {e}")
        return {}

    # Quy tắc ánh xạ Product Type -> danh sách rubkind
    product_type_rubkinds = {
        'STEEL_BELT': ['TRANG BO KEM'],
        'PLY': ['TRANG BO VAI'],
        'CARCASS_PLY': ['CAT BO VAI'],
        'INNER_LINER': ['KMT'],
        'BEAD': ['VONG TANH'],
        'BEAD_AND_BEAD_FILLER_PREASSEMBLY': ['TANH BA CANH'],
        'CHAFER': ['TANH CHONG CO'],
        'BELT_AND_EDGE_GUM_PREASSEMBLY': ['CAT BO KEM', 'CAT BO KEM (EDGE)'],
        'SQUEEZE': ['EDGE'],
        'CAP_PLY': ['SNOW', 'BIG SNOW'],
        'SIDEWALL': ['KH'],
        'TREAD': ['KMN'],
        'GREEN_TIRE': ['VO SONG'],
    }

    expday_map = {}
    for ptype, kinds in product_type_rubkinds.items():
        matched_expdays = []
        for k in kinds:
            val = rubkind_map.get(k.upper())
            if val is not None and val not in matched_expdays:
                matched_expdays.append(val)
        if matched_expdays:
            expday_map[ptype] = " / ".join(str(x) for x in matched_expdays) if len(matched_expdays) > 1 else str(matched_expdays[0])

    return expday_map

def get_technical_specifications_data(force_refresh: bool = False) -> dict:
    global _technical_specifications_cache
    now = time.time()
    with _technical_specifications_lock:
        cached = _technical_specifications_cache.get('data')
        if not force_refresh and cached and cached.get('expdays') and (now - _technical_specifications_cache.get('timestamp', 0) < 600):
            return cached

    s = get_gitlab_session()
    
    # 1. Fetch label-config.yml (Project 113)
    project_id_lc = 113
    encoded_path_lc = 'yamls%2Flabel-config.yml'
    ref = 'master'

    content_raw_lc = ''
    try:
        raw_url = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id_lc}/repository/files/{encoded_path_lc}/raw'
        r = s.get(raw_url, params={'ref': ref}, timeout=8)
        if r.status_code == 200:
            content_raw_lc = r.text
        elif r.status_code in [401, 403]:
            return {'auth_error': True}
        else:
            file_url = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id_lc}/repository/files/{encoded_path_lc}'
            r2 = s.get(file_url, params={'ref': ref}, timeout=8)
            if r2.status_code in [401, 403]:
                return {'auth_error': True}
            if r2.ok:
                c_b64 = r2.json().get('content', '')
                if c_b64:
                    content_raw_lc = base64.b64decode(c_b64).decode('utf-8')
    except Exception as e:
        print(f"Error fetching technical-specifications (label-config): {e}")

    # 2. Fetch limitary-hour.yaml (Project 99: tc/limitary-hour)
    project_id_lh = 99
    encoded_path_lh = 'yamls%2Flimitary-hour.yaml'
    content_raw_lh = ''
    try:
        raw_url_lh = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id_lh}/repository/files/{encoded_path_lh}/raw'
        r_lh = s.get(raw_url_lh, params={'ref': ref}, timeout=8)
        if r_lh.status_code == 200:
            content_raw_lh = r_lh.text
        elif r_lh.status_code in [401, 403]:
            return {'auth_error': True}
        else:
            file_url_lh = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id_lh}/repository/files/{encoded_path_lh}'
            r2_lh = s.get(file_url_lh, params={'ref': ref}, timeout=8)
            if r2_lh.status_code in [401, 403]:
                return {'auth_error': True}
            if r2_lh.ok:
                c_b64 = r2_lh.json().get('content', '')
                if c_b64:
                    content_raw_lh = base64.b64decode(c_b64).decode('utf-8')
    except Exception as e:
        print(f"Error fetching limitary-hour: {e}")

    if not content_raw_lc:
        with _technical_specifications_lock:
            return _technical_specifications_cache.get('data') or {'product_types': [], 'config_map': {}, 'keys_by_product_type': {}, 'limitary_hours': {}, 'expdays': {}}

    try:
        parsed_yaml = yaml.safe_load(content_raw_lc)
        product_types = []
        config_map = {}
        keys_by_product_type = {}

        if isinstance(parsed_yaml, list):
            for item in parsed_yaml:
                if not isinstance(item, dict):
                    continue
                ptype = item.get('product-type')
                if ptype:
                    product_types.append(ptype)
                    configs = item.get('configs', {})
                    req_labels = configs.get('required-labels', []) if isinstance(configs, dict) else []
                    rows = []
                    keys = []
                    for lbl in req_labels:
                        if isinstance(lbl, dict):
                            key = lbl.get('key', '')
                            langs = lbl.get('languages', {}) if isinstance(lbl.get('languages'), dict) else {}
                            if key:
                                keys.append(key)
                            if key or langs:
                                rows.append([
                                    key,
                                    langs.get('VI') or langs.get('VN') or '',
                                    langs.get('CN') or '',
                                    langs.get('TW') or '',
                                    langs.get('EN') or '',
                                    langs.get('ID') or ''
                                ])
                    config_map[ptype] = rows
                    keys_by_product_type[ptype] = keys

        limitary_hours = {}
        if content_raw_lh:
            try:
                parsed_lh = yaml.safe_load(content_raw_lh)
                if isinstance(parsed_lh, list):
                    for item in parsed_lh:
                        if isinstance(item, dict) and item.get('product-type'):
                            pt = str(item.get('product-type')).strip()
                            lh_obj = item.get('limitary-hour', {})
                            if isinstance(lh_obj, dict):
                                min_v = lh_obj.get('min')
                                max_v = lh_obj.get('max')
                                limitary_hours[pt.upper()] = {
                                    'standing_time': min_v,
                                    'limitary_hour': max_v
                                }
            except Exception as lh_err:
                print(f"Error parsing limitary-hour yaml: {lh_err}")

        # 3. Fetch expday from SQL Server 10.33/erp
        expdays = get_prdexp_expdays()

        data = {
            'product_types': product_types,
            'config_map': config_map,
            'keys_by_product_type': keys_by_product_type,
            'limitary_hours': limitary_hours,
            'expdays': expdays
        }
        with _technical_specifications_lock:
            _technical_specifications_cache['timestamp'] = now
            _technical_specifications_cache['data'] = data
        return data
    except Exception as e:
        print(f"Error parsing technical-specifications data: {e}")
        return {'product_types': [], 'config_map': {}, 'keys_by_product_type': {}, 'limitary_hours': {}, 'expdays': {}}

def resolve_recipe_path(project_id: int, recipe_id: str, product_type: str = '') -> Optional[str]:
    cache_key = (project_id, recipe_id)
    with _recipe_cache_lock:
        if cache_key in _recipe_path_cache:
            return _recipe_path_cache[cache_key]

    s = get_gitlab_session()
    clean_id = recipe_id.replace('.yaml', '').strip()
    
    # 1. Direct candidate path checks
    candidate_paths = []
    if product_type:
        pt_folder = product_type.lower().replace(' ', '_').replace('-', '_')
        for prefix in [f'yamls/{pt_folder}/KV/KV2', f'yamls/{pt_folder}/KV', f'yamls/{pt_folder}']:
            candidate_paths.append(f'{prefix}/{clean_id}.yaml')
            candidate_paths.append(f'{prefix}/{clean_id}')
    candidate_paths.append(f'yamls/{clean_id}.yaml')

    for cand in candidate_paths:
        try:
            enc = cand.replace('/', '%2F')
            head_url = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/repository/files/{enc}'
            r = s.head(head_url, params={'ref': 'master'}, timeout=3)
            if r.status_code == 200:
                with _recipe_cache_lock:
                    _recipe_path_cache[cache_key] = cand
                return cand
        except Exception:
            pass

    # 2. Fallback to blob search if direct guessing didn't match
    try:
        search_url = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/search'
        res = s.get(search_url, params={'scope': 'blobs', 'search': clean_id}, timeout=15)
        if res.ok:
            data = res.json()
            if data and isinstance(data, list):
                for item in data:
                    item_path = item.get('path', '')
                    if clean_id in item_path:
                        with _recipe_cache_lock:
                            _recipe_path_cache[cache_key] = item_path
                        return item_path
                fallback_path = data[0].get('path', '')
                if fallback_path:
                    with _recipe_cache_lock:
                        _recipe_path_cache[cache_key] = fallback_path
                    return fallback_path
    except Exception:
        pass

    return None

def json_serial_fallback(obj):
    if isinstance(obj, Decimal):
        return float(obj) if obj % 1 else int(obj)
    if isinstance(obj, (datetime, timedelta)):
        return str(obj)
    return str(obj)

def serialize_row(row):
    serialized = []
    for value in row:
        if isinstance(value, Decimal):
            serialized.append(float(value) if value % 1 else int(value))
        elif isinstance(value, dict):
            serialized.append(json.dumps(value, indent=2, ensure_ascii=False, default=json_serial_fallback))
        elif isinstance(value, (list, tuple)) and value and isinstance(value[0], (dict, list)):
            serialized.append(json.dumps(value, indent=2, ensure_ascii=False, default=json_serial_fallback))
        elif isinstance(value, (datetime, timedelta)):
            serialized.append(str(value))
        else:
            serialized.append(value)
    return serialized

def get_auth_headers(session):
    headers = {
        'accept': 'application/json',
        'x-mui-auth-key': session.get('user_token', '')
    }
    
    # Get Cookie string from session
    if 'user_cookie_string' in session:
        headers['Cookie'] = session['user_cookie_string']
    
    return headers

def get_client_ip():
    user_ip = request.headers.get("x-forwarded-for")
    if user_ip:
        return user_ip.split(",")[0].strip()
    
    return request.remote_addr


# --- Core Application Constants & Helpers ---
APP_VERSION = "2.1.0"

def get_asset_version():
    return f"{APP_VERSION}.{int(time.time())}"
VN_TZ = timezone(timedelta(hours=7))
API_LOG_FILE_PATH = r"\\198.1.10.2\Vitinh\Thu\QUAN TRONG KHONG XOA\log_kd_mes_tool.txt"

_config_cache = None
_config_date_modified = None

def convert_iso_datetime(value):
    if not value:
        return value
    try:
        val_str = str(value)
        if val_str.endswith('Z'):
            val_str = val_str[:-1] + '+00:00'
        dt = datetime.fromisoformat(val_str)
        if dt.tzinfo:
            dt = dt.astimezone(VN_TZ)
        return dt.strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        return value

def convert_timestamp(data, column_names=None, target_columns=None):
    def convert_single(value):
        if not value or not isinstance(value, (int, float)):
            return value
        ts = int(value)
        if ts > 1e18:
            ts = ts / 1e9
        elif ts > 1e15:
            ts = ts / 1e6
        elif ts > 1e12:
            ts = ts / 1e3
        dt = datetime.fromtimestamp(ts, VN_TZ)
        return dt.strftime("%Y-%m-%d %H:%M:%S")

    if column_names is None:
        return convert_single(data)

    new_result = []
    for row in data:
        row_list = list(row)
        for col in (target_columns or []):
            if col in column_names:
                idx = column_names.index(col)
                row_list[idx] = convert_single(row_list[idx])
        new_result.append(tuple(row_list))
    return new_result

def get_config_data(key):
    global _config_cache, _config_date_modified
    encoded_path = "XFwxOTguMS4xMC4yXFZpdGluaFxUaHVcUVVBTiBUUk9ORyBLSE9ORyBYT0FcY29uZmlnLmpzb24="
    config_path = base64.b64decode(encoded_path).decode("utf-8")
    
    if not os.path.exists(config_path):
        _config_cache = {}
        return []

    try:
        mtime = os.path.getmtime(config_path)
        if _config_cache is None or mtime != _config_date_modified:
            with open(config_path, "r", encoding='utf-8') as f:
                _config_cache = json.load(f)
            _config_date_modified = mtime
    except Exception:
        _config_cache = {}

    return _config_cache.get(key, []) if _config_cache else []

def _append_api_log_entry(log_line: str):
    try:
        dir_path = os.path.dirname(API_LOG_FILE_PATH)
        if dir_path and not os.path.exists(dir_path):
            os.makedirs(dir_path, exist_ok=True)
        with open(API_LOG_FILE_PATH, 'a', encoding='utf-8') as f:
            f.write(log_line + '\n')
    except Exception as e:
        print(f"[API_LOG_ERROR] Lỗi khi ghi file log: {e}", file=sys.stderr)

def write_api_log(api: str, user_ip: str, payload=None):
    try:
        now_str = datetime.now(VN_TZ).strftime("%Y-%m-%d %H:%M:%S")
        safe_payload = payload
        if safe_payload is None:
            safe_payload = {}
        elif isinstance(safe_payload, dict):
            if 'password' in safe_payload:
                safe_payload = dict(safe_payload)
                safe_payload['password'] = '******'

        log_obj = {
            "api": api or "",
            "user_ip": user_ip or "",
            "execution_time": now_str,
            "payload": safe_payload
        }
        log_line = json.dumps(log_obj, ensure_ascii=False, default=str)
        threading.Thread(target=_append_api_log_entry, args=(log_line,), daemon=True).start()
    except Exception as e:
        print(f"[API_LOG_ERROR] {e}", file=sys.stderr)


app = Flask(__name__)
app.secret_key = os.urandom(24)
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_FILE_DIR'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'flask_session')
Session(app)

def extract_request_payload():
    try:
        if request.is_json:
            return request.get_json(silent=True) or {}
        if request.form:
            return request.form.to_dict()
        if request.args:
            return request.args.to_dict()
        if request.data:
            try:
                return json.loads(request.data.decode('utf-8'))
            except Exception:
                return request.data.decode('utf-8', errors='ignore')
        return {}
    except Exception:
        return {}

@app.before_request
def log_api_requests():
    if request.path.startswith('/api/'):
        user_ip = session.get('user_ip')
        if user_ip:
            payload = extract_request_payload()
            write_api_log(api=request.path, user_ip=user_ip, payload=payload)

@app.after_request
def suppress_browser_auth_popup(response):
    response.headers.pop('WWW-Authenticate', None)
    response.headers.pop('www-authenticate', None)

    if request.path.startswith('/static/vendor/'):
        response.headers['Cache-Control'] = 'public, max-age=86400'
    elif request.path.startswith('/static/'):
        response.headers['Cache-Control'] = 'no-cache, must-revalidate, max-age=0'
    elif request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    else:
        if 'Cache-Control' not in response.headers:
            response.headers['Cache-Control'] = 'no-cache, must-revalidate'
    return response

def make_unauthorized_response(message='Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'):
    session.clear()
    response = make_response(jsonify({
        'error': True,
        'code': 'UNAUTHORIZED',
        'message': message
    }), 403)
    response.headers.pop('WWW-Authenticate', None)
    response.headers.pop('www-authenticate', None)
    return response


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
            return make_unauthorized_response()
        return f(*args, **kwargs)
    return decorated_function

CBK_PRODUCT_TYPES = {
    'BEAD', 'BEAD_AND_BEAD_FILLER_PREASSEMBLY', 'BEAD_WIRE', 'BEAD_FILLER',
    'CARCASS_PLY', 'CAP_PLY', 'CHAFER', 'INNER_LINER', 'PLY',
    'SIDEWALL', 'SQUEEZE', 'STEEL_BELT', 'STEEL_WIRE', 'TREAD'
}

def get_gitlab_project_id(product_type: str, default_id: int = 136) -> int:
    pt = (product_type or '').strip().upper()
    if pt == 'GREEN_TIRE':
        return 133
    elif pt == 'TIRE':
        return 134
    elif pt in CBK_PRODUCT_TYPES:
        return 135
    return default_id

@app.errorhandler(401)
def custom_401_handler(e):
    return make_unauthorized_response()

@app.errorhandler(403)
def custom_403_handler(e):
    return make_unauthorized_response()

@app.errorhandler(DatabaseConnectionError)
def custom_db_conn_error_handler(e):
    return jsonify({
        'success': False,
        'message': f'{str(e)}',
        'result': [],
        'columns': []
    }), 500

@app.errorhandler(DatabaseQueryError)
def custom_db_query_error_handler(e):
    return jsonify({
        'success': False,
        'message': f'{str(e)}',
        'result': [],
        'columns': []
    }), 500

@app.errorhandler(DatabaseError)
def custom_db_error_handler(e):
    return jsonify({
        'success': False,
        'message': f'{str(e)}',
        'result': [],
        'columns': []
    }), 500

@app.context_processor
def inject_global_context():
    return {
        'version': APP_VERSION + '.' + str(int(time.time())),
        'app_version': APP_VERSION
    }

# Default language
default_language = "vi"

@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('main'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':

        user_ip = get_client_ip()

        if request.is_json:
            data = request.get_json()
            user_id = data.get('user_id', '').strip() if data else ''
            password = data.get('password', '').strip() if data else ''
        else:
            user_id = request.form.get('user_id', '').strip()
            password = request.form.get('password', '').strip()
        
        if not user_id or not password:
            return jsonify({'success': False, 'message': 'Vui lòng nhập đầy đủ Tài khoản và mật khẩu.'})
        
        tool_status = get_config_data("available")
        if tool_status and tool_status[0] == "N":
            return jsonify({'success': False, 'message': 'Tool không khả dụng ở thời điểm hiện tại'})
        
        url = "https://198.1.10.85:8810/api/user/login"
        headers = {
            "accept": "application/json",
            "Content-Type": "application/json"
        }
        data = {
            "ID": user_id,
            "loginType": 0,
            "password": password
        }
        
        try:
            response = requests.post(url, headers=headers, json=data, verify=False)
            response_data = response.json()
            if response_data.get('data'):
                session['user_id'] = user_id
                session['user_token'] = response_data['data']['token']
                session['user_ip'] = user_ip
                
                cookie_parts = []
                if response.cookies:
                    for cookie in response.cookies:
                        cookie_parts.append(f"{cookie.name}={cookie.value}")
                
                if 'Set-Cookie' in response.headers:
                    set_cookie = response.headers['Set-Cookie']
                    if ';' in set_cookie:
                        cookie_parts.append(set_cookie.split(';')[0])
                    else:
                        cookie_parts.append(set_cookie)
                
                if cookie_parts:
                    session['user_cookie_string'] = '; '.join(cookie_parts)
                    
                return jsonify({'success': True})
        except Exception as e:
            pass
        
        return jsonify({'success': False, 'message': 'Tài khoản không tồn tại hoặc mật khẩu không đúng'})
    
    return render_template('login.html', version=get_asset_version(), app_version=APP_VERSION)

@app.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/check-auth', methods=['GET'])
@login_required
def check_auth():

    return jsonify({'success': True})

#========= PAGE ROUTES =========#
def render_page_or_shell(template_name, page_path, page_title="KDMES TOOL"):
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return redirect(url_for('login'))
    is_frame = request.args.get('frame') == '1'
    current_version = get_asset_version()
    if not is_frame:
        return render_template('spa_shell.html',
                               initial_path=page_path,
                               page_title=page_title,
                               user_id=session.get('user_id'),
                               user_ip=session.get('user_ip'),
                               version=current_version,
                               app_version=APP_VERSION)
    return render_template(template_name,
                           is_frame=True,
                           user_id=session.get('user_id'),
                           user_ip=session.get('user_ip'),
                           version=current_version,
                           app_version=APP_VERSION)

@app.route('/main')
def main():
    return render_page_or_shell('main.html', '/main', 'Main')

@app.route('/validate-scan-barcode')
def validate_scan_barcode():
    return render_page_or_shell('validate_scan_barcode.html', '/validate-scan-barcode', 'Kiểm tra tem đầu vào')

@app.route('/scan-barcode-history')
def scan_barcode_history():
    return render_page_or_shell('scan_barcode_history.html', '/scan-barcode-history', 'Lịch sử quét tem theo Máy')

@app.route('/print-barcode-history')
def print_barcode_history():
    return render_page_or_shell('print_barcode_history.html', '/print-barcode-history', 'Lịch sử in tem theo Máy')

@app.route('/reprint')
def reprint():
    return render_page_or_shell('reprint.html', '/reprint', 'Truy vấn in bù')

@app.route('/check-qc-data')
def check_qc_data():
    return render_page_or_shell('check_qc_data.html', '/check-qc-data', 'Check QC Data')

@app.route('/substitutions')
def substitutions():
    return render_page_or_shell('substitutions.html', '/substitutions', 'NVL thay thế')

@app.route('/check-mesync')
def check_mesync():
    return render_page_or_shell('check_mesync.html', '/check-mesync', 'Check Mesync')

@app.route('/station-configuration')
def station_configuration():
    return render_page_or_shell('station_configuration.html', '/station-configuration', 'Thiết lập máy')

@app.route('/technical-specifications')
def technical_specifications():
    return render_page_or_shell('technical_specifications.html', '/technical-specifications', 'Thông số kỹ thuật')

@app.route('/gitlab-deleted-files')
def gitlab_deleted_files():
    return render_page_or_shell('gitlab_deleted_files.html', '/gitlab-deleted-files', 'Gitlab Deleted Files')

@app.route('/postgres-deleted-data')
def postgres_deleted_data():
    return render_page_or_shell('postgres_deleted_data.html', '/postgres-deleted-data', 'Postgres Deleted Data')

@app.route('/magic-winx')
def magic_winx():
    return render_page_or_shell('magic_winx.html', '/magic-winx', 'Magic Winx')

#========= API =========#
def format_to_utc7_str(time_val) -> str:
    if not time_val or time_val == '-':
        return '-'
    try:
        s = str(time_val).strip()
        if 'T' in s or '+' in s or s.endswith('Z'):
            dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
            utc7_tz = timezone(timedelta(hours=7))
            return dt.astimezone(utc7_tz).strftime('%Y-%m-%d %H:%M:%S')
        if '.' in s:
            return s.split('.')[0]
        return s
    except Exception:
        return str(time_val)


def format_postgres_timestamp(time_val) -> str:
    if not time_val or time_val == '-':
        return '-'
    try:
        s = str(time_val).strip()
        if 'T' in s:
            s = s.replace('T', ' ')
        if '.' in s:
            s = s.split('.')[0]
        elif '+' in s:
            s = s.split('+')[0].strip()
        elif s.endswith('Z'):
            s = s[:-1].strip()
        return s
    except Exception:
        return str(time_val)


@app.route('/api/gitlab/webhook', methods=['POST'])
def gitlab_webhook():
    try:
        data = request.get_json(force=True, silent=True) or {}
        project = data.get('project') or {}
        project_name = project.get('name') or project.get('path_with_namespace') or 'unknown'
        
        commits = data.get('commits', [])
        deleted_records = []
        now_utc7 = datetime.now(timezone(timedelta(hours=7))).strftime('%Y-%m-%d %H:%M:%S')
        
        for commit in commits:
            removed_files = commit.get('removed', [])
            if not removed_files:
                continue
            
            author = commit.get('author') or {}
            author_name = author.get('name') or data.get('user_name') or 'unknown'
            author_email = author.get('email') or data.get('user_email') or ''
            commit_id = commit.get('id', '')
            commit_message = (commit.get('message') or '').strip()
            commit_url = commit.get('url') or ''
            raw_ts = commit.get('timestamp')
            timestamp = format_to_utc7_str(raw_ts) if raw_ts else now_utc7
            
            for f in removed_files:
                if f.lower().endswith(('.yaml', '.yml')):
                    record = {
                        'project': project_name,
                        'file': f,
                        'author': author_name,
                        'email': author_email,
                        'time': timestamp,
                        'commit_id': commit_id[:10] if commit_id else '',
                        'commit_message': commit_message,
                        'commit_url': commit_url,
                        'raw_commit_id': commit_id
                    }
                    deleted_records.append(record)
                    
        if deleted_records:
            log_path = get_yaml_deleted_log_path()
            try:
                with open(log_path, 'a', encoding='utf-8') as lf:
                    for rec in deleted_records:
                        lf.write(json.dumps(rec, ensure_ascii=False) + '\n')
            except Exception:
                local_path = LOG_YAML_DELETED_LOCAL_PATH
                if log_path != local_path:
                    try:
                        with open(local_path, 'a', encoding='utf-8') as lf:
                            for rec in deleted_records:
                                lf.write(json.dumps(rec, ensure_ascii=False) + '\n')
                    except Exception:
                        pass
                
        return jsonify({'status': 'ok', 'logged_count': len(deleted_records)})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/gitlab/get-deleted-files-log', methods=['POST', 'GET'])
@login_required
def get_deleted_files_log():
    columns = [
        'Project',
        'File Name',
        'deleted_by',
        'Email',
        'Thời gian',
        'File Path',
        'Commit URL',
        'Commit Message'
    ]
    
    found_lines = []
    log_paths = [LOG_YAML_DELETED_NETWORK_PATH, LOG_YAML_DELETED_LOCAL_PATH]
    
    for lp in log_paths:
        if os.path.exists(lp):
            try:
                with open(lp, 'r', encoding='utf-8') as lf:
                    for line in lf:
                        line = line.strip()
                        if line:
                            found_lines.append(line)
                if found_lines:
                    break
            except Exception:
                continue
                
    records = []
    seen = set()
    for line in found_lines:
        try:
            item = json.loads(line)
            key = (item.get('project'), item.get('file'), item.get('raw_commit_id') or item.get('commit_id'))
            if key not in seen:
                seen.add(key)
                full_path = item.get('file', '-')
                file_name = full_path.replace('\\', '/').split('/')[-1] if (full_path and full_path != '-') else '-'
                records.append([
                    item.get('project', '-'),
                    file_name,
                    item.get('author', '-'),
                    item.get('email', '-'),
                    format_to_utc7_str(item.get('time', '-')),
                    full_path,
                    item.get('commit_url', '-'),
                    item.get('commit_message', '-')
                ])
        except Exception:
            continue
            
    records.reverse()
    
    return jsonify({
        'result': records,
        'columns': columns
    })


@app.route('/api/postgres/get-deleted-records-log', methods=['POST', 'GET'])
@login_required
def get_postgres_deleted_records_log():
    columns = [
        'Table',
        'Time',
        'client_ip',
        'Database',
        'Data'
    ]
    
    dirs_to_check = [POSTGRES_AUDIT_LOG_NETWORK_DIR, POSTGRES_AUDIT_LOG_LOCAL_DIR]
    found_files = []
    
    for d in dirs_to_check:
        if os.path.exists(d):
            try:
                pattern = os.path.join(d, "deleted_records_*.jsonl")
                matched = glob.glob(pattern)
                if matched:
                    found_files = sorted(matched, reverse=True)
                    break
            except Exception:
                continue
                
    records = []
    seen = set()
    
    for fpath in found_files:
        try:
            with open(fpath, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        item = json.loads(line)
                        raw_ts = item.get('timestamp', '-')
                        ts = format_postgres_timestamp(raw_ts)
                        schema = item.get('schema', '-')
                        table = item.get('table', '-')
                        client_ip = item.get('client_ip') or item.get('ip') or '-'
                        record_oid = item.get('record_oid') or ''
                        data = item.get('data') or {}
                        
                        unique_key = (raw_ts, schema, table, client_ip, record_oid, str(data))
                        if unique_key in seen:
                            continue
                        seen.add(unique_key)
                        
                        if isinstance(data, (dict, list)):
                            data_str = json.dumps(data, ensure_ascii=False)
                        else:
                            data_str = str(data)
                            
                        records.append([
                            table,
                            ts,
                            client_ip,
                            schema,
                            data_str
                        ])
                    except Exception:
                        continue
        except Exception:
            continue
            
    records.sort(key=lambda x: str(x[1]), reverse=True)
    
    return jsonify({
        'result': records,
        'columns': columns
    })


_pg_table_columns_cache = {}
_pg_table_columns_lock = threading.Lock()

def get_pg_table_columns_meta(schema_name, table_name):
    key = (schema_name, table_name)
    with _pg_table_columns_lock:
        if key in _pg_table_columns_cache:
            return _pg_table_columns_cache[key]
    
    cols = []
    try:
        rows, _ = execute_pg_select_query("""
            SELECT column_name, data_type, udt_name 
            FROM information_schema.columns 
            WHERE table_schema = %s AND table_name = %s 
            ORDER BY ordinal_position
        """, (schema_name, table_name))
        cols = [{'name': r[0], 'type': r[1], 'udt': r[2]} for r in rows]
    except Exception as e:
        print(f"Error fetching table columns for {schema_name}.{table_name}: {e}")
            
    with _pg_table_columns_lock:
        _pg_table_columns_cache[key] = cols
    return cols

def format_pg_sql_literal(val, col_meta=None):
    if val is None:
        return 'NULL'
    if isinstance(val, bool):
        return 'TRUE' if val else 'FALSE'
    if isinstance(val, (int, float, Decimal)):
        return str(val)
    if isinstance(val, (dict, list)):
        j_str = json.dumps(val, ensure_ascii=False).replace("'", "''")
        return f"'{j_str}'"
    s = str(val).strip()
    if s == '' and col_meta and col_meta.get('type') in ['integer', 'bigint', 'smallint', 'numeric', 'uuid', 'date', 'timestamp without time zone', 'timestamp with time zone']:
        return 'NULL'
    escaped = s.replace("'", "''")
    return f"'{escaped}'"

@app.route('/api/postgres/generate-insert-query', methods=['POST'])
@login_required
def generate_postgres_insert_query():
    try:
        payload = request.get_json(force=True, silent=True) or {}
        rows = payload.get('rows') or []
        if not rows:
            return jsonify({'success': False, 'message': 'Không có dữ liệu để tạo câu lệnh Insert.'}), 400
        
        grouped = {}
        valid_count = 0
        for r in rows:
            if isinstance(r, dict):
                table = r.get('table') or 'material_resource'
                schema = r.get('schema') or r.get('database') or 'kvmes'
                data = r.get('data')
            elif isinstance(r, (list, tuple)):
                if len(r) >= 5:
                    table = r[0]
                    schema = r[3]
                    data = r[4]
                elif len(r) >= 4:
                    table = r[0]
                    schema = r[2]
                    data = r[3]
                else:
                    continue
            else:
                continue
            
            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except Exception:
                    continue
            if not isinstance(data, dict):
                continue
            
            k = (schema, table)
            if k not in grouped:
                grouped[k] = []
            grouped[k].append(data)
            valid_count += 1
            
        if not grouped:
            return jsonify({'success': False, 'message': 'Không tìm thấy dữ liệu hợp lệ dạng JSON để tạo câu lệnh Insert.'}), 400
            
        header_comment = [
            "-- ====================================================================",
            "-- KDMES POSTGRESQL INSERT QUERY RECOVERY SCRIPT",
            f"-- Thoi gian xuat: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"-- Tong so bang: {len(grouped)}, Tong so ban ghi: {valid_count}",
            "-- ====================================================================\n"
        ]
        
        statements = []
        for (schema, table), data_list in grouped.items():
            cols_meta = get_pg_table_columns_meta(schema, table)
            if cols_meta:
                active_cols = [c for c in cols_meta if any(c['name'] in d for d in data_list)]
            else:
                all_keys = []
                for d in data_list:
                    for k in d.keys():
                        if k not in all_keys:
                            all_keys.append(k)
                active_cols = [{'name': k, 'type': 'text', 'udt': 'text'} for k in all_keys]
                
            col_names = [c['name'] for c in active_cols]
            col_names_str = ', '.join(col_names)
            
            val_rows = []
            for d in data_list:
                row_vals = [format_pg_sql_literal(d.get(c['name']), c) for c in active_cols]
                val_rows.append(f"  ({', '.join(row_vals)})")
                
            stmt_header = f"-- Bang: {schema}.{table} ({len(data_list)} ban ghi)"
            stmt = f"{stmt_header}\nINSERT INTO {schema}.{table} ({col_names_str})\nVALUES\n" + ",\n".join(val_rows) + ";"
            statements.append(stmt)
            
        full_content = "\n".join(header_comment) + "\n\n".join(statements) + "\n"
        filename = f"postgres_insert_queries_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        
        return jsonify({
            'success': True,
            'filename': filename,
            'content': full_content,
            'count': valid_count
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/barcodes', methods=['POST'])
@login_required
def search_barcode():
    
    keyword = request.json.get('keyword', '').strip()
    if not keyword:
        return jsonify({'result': [], 'columns': []})
    
    query = """
        SELECT id, product_id, product_type, 
               quantity, status, expiry_time, 
               created_at, updated_at, updated_by, created_by, 
               standing_time, feed_records_id, info, oid,
               reprint_reason, collected, erp_tire_barcode_synced
        FROM kvmes.material_resource
        WHERE id ILIKE %s
        LIMIT 100;
    """
    result, column_names = execute_pg_select_query(query, (f"%{keyword}%",))
    if result:
        convert_columns = ["expiry_time", "updated_at", "created_at", "standing_time"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })

@app.route('/api/recipes', methods=['POST'])
@login_required
def search_work_order():
    
    keyword = request.json.get('keyword', '').strip()
    if not keyword:
        return jsonify({'result': [], 'columns': []})
    
    query = """
        SELECT
            r.id            AS recipe_id,
            r.product_type  AS product_type,
            r.product_id    AS product_id,
            r.released_at,
            cfg->'stations' AS stations,
            
            (
                SELECT jsonb_agg(mat)
                FROM jsonb_array_elements(cfg->'steps') step
                CROSS JOIN jsonb_array_elements(step->'materials') mat
            ) AS materials,

            (
                SELECT jsonb_agg(mat)
                FROM jsonb_array_elements(cfg->'steps') step
                CROSS JOIN jsonb_array_elements(step->'controls') mat
            ) AS controls,

            r.note,
            rpd.limitary_hour
            
        FROM kvmes.recipe r
        JOIN LATERAL jsonb_array_elements(r.processes::jsonb) proc ON TRUE
        JOIN kvmes.recipe_process_definition rpd ON rpd.oid = (proc->>'reference_oid')::uuid
        JOIN LATERAL jsonb_array_elements(rpd.configs::jsonb) cfg ON TRUE
        WHERE r.id ILIKE %s
        LIMIT 100;
    """
    result, column_names = execute_pg_select_query(query, (f"%{keyword}%",))
    if result:
        convert_columns = ["released_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })

@app.route('/api/feed_records', methods=['POST'])
@login_required
def search_feed_record():
    
    keyword = request.json.get('keyword', '').strip()
    if not keyword:
        return jsonify({'result': [], 'columns': []})
    
    query = """
        SELECT id, product_id, product_type,
               quantity, status, expiry_time,
               created_at, updated_at, updated_by, created_by,
               standing_time, feed_records_id, info, oid,
               reprint_reason, collected, erp_tire_barcode_synced
        FROM kvmes.material_resource
        WHERE kvmes.immutable_array_to_string(feed_records_id, ' ') ILIKE %s
        LIMIT 100;
    """
    result, column_names = execute_pg_select_query(query, (f"%{keyword}%",))
    if result:
        convert_columns = ["expiry_time", "updated_at", "created_at", "standing_time"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })
    
@app.route('/api/work-orders/get-details', methods=['POST'])
@login_required
def get_work_order_by_id():
    
    work_order_id = request.json.get('work_order_id', '').strip()
    if not work_order_id:
        return jsonify({'result': [], 'columns': []})
    
    query = """
        SELECT id, recipe_id, station, reserved_date::text AS reserved_date,
               status, process_type, department_id,
               process_name, reserved_sequence, information,
               updated_at, updated_by, created_at, created_by
        FROM kvmes.work_order
        WHERE id like %s
        ORDER BY reserved_date DESC;
    """

    result, column_names = execute_pg_select_query(query, (f"%{work_order_id}%",))
    if result:
        convert_columns = ["updated_at", "created_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })

@app.route('/api/station/scan-barcode-history', methods=['POST'])
@login_required
def search_scan_barcode_history_by_station():
    
    fromDate = request.json.get('fromDate', '').strip()
    toDate = request.json.get('toDate', '').strip()
    station = request.json.get('station', '').strip()
    if not station:
        return jsonify({'result': [], 'columns': []})
    
    params = [f"%{station}%"]
    
    if fromDate and toDate:
        params.extend([fromDate, toDate])

    query = """
        WITH base AS (
            SELECT
                a.station,
                a.name,
                a.content::jsonb,
                wo.recipe_id,

                to_timestamp(a.updated_at::numeric / 1e9)
                    AT TIME ZONE 'Asia/Ho_Chi_Minh'
                    AS updated_at_ts

            FROM kvmes.site_contents a
            JOIN kvmes.work_order wo
                ON wo.station = a.station
            JOIN kvmes.recipe_process_definition rpd
                ON rpd.recipe_id = wo.recipe_id

            WHERE a.station LIKE %s
            AND a.name <> ''
            AND to_timestamp(a.updated_at::numeric / 1e9)
                    AT TIME ZONE 'Asia/Ho_Chi_Minh'
                >= %s::date
            AND to_timestamp(a.updated_at::numeric / 1e9)
                    AT TIME ZONE 'Asia/Ho_Chi_Minh'
                <  (%s::date + INTERVAL '1 day')
        ),
        materials AS (
            SELECT
                b.recipe_id,
                b.station,
                b.name,
                b.updated_at_ts,

                b.content#>>'{slot,material,resource_id}' AS barcode,
                b.content#>>'{slot,material,material,id}' AS product_id
            FROM base b
            WHERE b.content ? 'slot'

            UNION ALL

            SELECT
                b.recipe_id,
                b.station,
                b.name,
                b.updated_at_ts,

                c->'material'->>'resource_id' AS barcode,
                c->'material'->'material'->>'id' AS product_id
            FROM base b
            CROSS JOIN LATERAL jsonb_array_elements(b.content->'container') c
            WHERE b.content ? 'container'
        )

        SELECT
            m.barcode,
            m.product_id,
            mr.quantity,
            to_char(MAX(m.updated_at_ts), 'YYYY-MM-DD HH24:MI:SS') AS last_updated_time,
            m.name,
            m.recipe_id,
            mr.expiry_time
        FROM materials m
        JOIN kvmes.recipe_process_definition rpd
            ON rpd.recipe_id = m.recipe_id
        LEFT JOIN kvmes.material_resource mr
            ON mr.id = m.barcode

        WHERE rpd.configs::jsonb @> jsonb_build_array(
                jsonb_build_object(
                    'steps', jsonb_build_array(
                        jsonb_build_object(
                            'materials', jsonb_build_array(
                                jsonb_build_object('name', m.product_id))))))

        GROUP BY
            m.barcode,
            m.product_id,
            m.recipe_id,
            m.name,
            mr.quantity,
            mr.expiry_time

        ORDER BY MAX(m.updated_at_ts) DESC
    """

    result, column_names = execute_pg_select_query(query, tuple(params))
    if result:
        convert_columns = ["expiry_time"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })

@app.route('/api/station/print-barcode-history', methods=['POST'])
@login_required
def search_print_barcode_history_by_station():
    
    fromDate = request.json.get('fromDate', '').strip()
    toDate = request.json.get('toDate', '').strip()

    station = request.json.get('station', '').strip()
    if not station:
        return jsonify({'result': [], 'columns': []})
    
    params = [f"%{station}%"]
    
    query = """
        WITH cr_ts AS (
            SELECT
                cr.work_order,
                cr.lot_number,
                to_char(cr.work_date, 'YYYY-MM-DD') AS work_date,
                cr.resource_oid,
                (cr.detail->>'quantity')::numeric AS quantity,
                cr.detail->>'operator_id' AS created_by,

                (
                    timestamp with time zone 'epoch'
                    + (cr.created_at / 1e9) * interval '1 second'
                ) AT TIME ZONE 'Asia/Ho_Chi_Minh' AS created_at_ts
            FROM kvmes.collect_record cr
            WHERE cr.station LIKE %s
        )

        SELECT
            mr.id,
            mr.product_id,
            cr.quantity,
            cr.work_order,
            cr.work_date,
            cr.lot_number,
            to_char(MAX(cr.created_at_ts), 'YYYY-MM-DD HH24:MI:SS') AS created_at,
            cr.created_by
        FROM cr_ts cr
        JOIN kvmes.material_resource mr
            ON mr.oid = cr.resource_oid
        """
    
    query += """
        GROUP BY
            mr.id,
            mr.product_id,
            cr.quantity,
            cr.work_order,
            cr.work_date,
            cr.lot_number,
            cr.created_by
        """

    if fromDate and toDate:
        query += """
            HAVING
                MAX(cr.created_at_ts) >= %s::date
            AND
                MAX(cr.created_at_ts) <  %s::date + INTERVAL '1 day'
            """
        
        params.extend([fromDate, toDate])

    query += """
       ORDER BY MAX(cr.created_at_ts) DESC;
    """
    
    result, column_names = execute_pg_select_query(query, tuple(params))
    if result:
        convert_columns = ["created_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })
 
@app.route('/api/barcodes/scan-in-station', methods=['POST'])
@login_required
def search_scan_barcode_history_by_barcode():
    
    resource_id = request.json.get('resource_id', '').strip()
    if not resource_id:
        return jsonify({'result': [], 'columns': []})
    
    query = """
        WITH target_sites AS MATERIALIZED (
            SELECT
                sc.station,
                sc.name AS site,
                sc.updated_at AS scan_at,
                sc.content
            FROM kvmes.site_contents sc
            JOIN kvmes.site s 
              ON s.station = sc.station AND s.name = sc.name AND s.index = sc.index
            WHERE (sc.content->'slot'->'material'->>'resource_id') = %s
              AND NOT EXISTS (
                  SELECT 1 
                  FROM kvmes.site_contents newer
                  WHERE newer.station = sc.station 
                    AND newer.name = sc.name 
                    AND newer.index = sc.index 
                    AND newer.updated_at > sc.updated_at
              )
        )
        SELECT *
        FROM (
            SELECT DISTINCT ON (rpd.oid)
                ts.station              AS station,
                ts.site                 AS site,
                ts.scan_at              AS scan_at,

                wo.id                   AS work_order_id,
                wo.status               AS work_order_status,
                wo.reserved_date::text  AS reserved_date,

                rpd.recipe_id,
                rpd.product_id,
                rpd.product_type
            FROM target_sites ts
            JOIN kvmes.work_order wo
                ON wo.station = ts.station
               AND wo.status <> 3
            JOIN kvmes.recipe_process_definition rpd
                ON rpd.recipe_id = wo.recipe_id
            WHERE EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(rpd.configs::jsonb) cfg
                    WHERE cfg->'stations' ? ts.station
                )
              AND EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(rpd.configs::jsonb) cfg
                    CROSS JOIN jsonb_array_elements(cfg->'steps') step
                    CROSS JOIN jsonb_array_elements(step->'materials') mat
                    WHERE mat->>'name' = ts.content->'slot'->'material'->'material'->>'id'
                      AND mat->>'site' = ts.site
                )
            ORDER BY
                rpd.oid,
                wo.updated_at DESC,
                ts.scan_at DESC
        ) sub
        ORDER BY scan_at DESC;
    """

    result, column_names = execute_pg_select_query(query, (resource_id,))
    if result:
        convert_columns = ["scan_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })
    
@app.route('/api/barcodes/fetch-work-orders', methods=['POST'])
@login_required
def fetch_work_order_by_barcode():
    
    fromDate = request.json.get('fromDate', '').strip()
    toDate = request.json.get('toDate', '').strip()
    resource_id = request.json.get('resource_id', '').strip()

    station = request.json.get('station', '').strip()
    if not station or not resource_id:
        return jsonify({'result': [], 'columns': []})
    
    params = [resource_id]
    
    query = """
        SELECT DISTINCT
            wo.id                  AS work_order,
            wo.recipe_id,
            wo.status,
            wo.station,
            wo.reserved_date::text AS reserved_date,
            wo.updated_at,
            wo.updated_by,
            wo.created_at,
            wo.created_by,
            wo.information,
            wo.department_id,
            wo.reserved_sequence,
            wo.process_name,
            wo.process_type
        FROM kvmes.material_resource mr
        JOIN kvmes.collect_record cr 
            ON cr.resource_oid = mr.oid
        JOIN kvmes.work_order wo 
            ON wo.id = TRIM(cr.work_order)::character(20)
        WHERE mr.id = %s
    """
    if station:
        query += """
            AND cr.station LIKE %s
        """
        params.append(f"%{station}%")

    if fromDate and toDate:
        query += """
            AND (
                    timestamp with time zone 'epoch'
                    + (cr.created_at / 1e9) * interval '1 second'
                ) AT TIME ZONE 'Asia/Ho_Chi_Minh'
                >= %s::date
            AND (
                    timestamp with time zone 'epoch'
                    + (cr.created_at / 1e9) * interval '1 second'
                ) AT TIME ZONE 'Asia/Ho_Chi_Minh'
                < %s::date + INTERVAL '1 day'
        """
        params.extend([fromDate, toDate])
    
    result, column_names = execute_pg_select_query(query, tuple(params))
    if result:
        convert_columns = ["created_at", "updated_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })
          
@app.route('/api/barcodes/fetch-input-barcodes', methods=['POST'])
def get_input_barcode():
    data = request.json
    material_id = data.get('id')
    product_type = data.get('product_type')

    if not material_id or not product_type:
        return jsonify({'error': 'Missing id or product_type'}), 400

    try:
        query = """
            SELECT
                fr_elem->>'resource_id'            AS barcode,
                fr_elem->>'product_id'             AS product_id,
                m_elem->'site'->>'name'            AS site_name,
                fr_elem->>'quantity'               AS quantity,
                m_elem->>'station'                 AS station
            FROM kvmes.material_resource mr
            JOIN kvmes.feed_record fr
                ON fr.id = ANY (mr.feed_records_id)
            CROSS JOIN LATERAL jsonb_array_elements(fr.materials) AS m_elem
            CROSS JOIN LATERAL jsonb_array_elements(m_elem->'feed_resources') AS fr_elem
            WHERE mr.id = %s
            AND mr.product_type = %s
        """

        result, column_names = execute_pg_select_query(query, (material_id, product_type))
        if result:
            serialized_result = [serialize_row(list(row)) for row in result]
            return jsonify({
                'success': True,
                'result': serialized_result,
                'columns': column_names
            })
        else:
            return jsonify({
                'success': True,
                'result': [],
                'columns': column_names
            })

    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

@app.route('/api/barcodes/check-used-history', methods=['POST'])
@login_required
def get_used_history_by_barcode():
    material_oid = request.json.get('material_oid')
    if not material_oid:
        return jsonify({'success': False, 'message': 'Thiếu material_oid'})
    
    material_type = request.json.get('material_type')
    if not material_type:
        return jsonify({'success': False, 'message': 'Thiếu material_type'})
    
    if material_type == "TIRE":
        return jsonify({'error': 'Không quản lý quét tem từ Ép Vỏ qua QC'}), 400

    columns = [
        'work_order',
        'recipe_id',
        'station',
        'reserved_date',
        'consumption',
        'total_barcode',
        'total_fail_barcode',
        'total_consumption'
    ]

    try:
        with get_pg_connection() as conn:
            cursor = conn.cursor()

            # 1. Get product_id from material_resource
            cursor.execute("""
                SELECT product_id 
                FROM kvmes.material_resource 
                WHERE id = %s AND product_type = %s
            """, (material_oid, material_type))
            mr_row = cursor.fetchone()
            if not mr_row:
                return jsonify({'success': True, 'result': [], 'columns': columns})
            
            product_id = mr_row[0]

            # 2. Get recipe_ids using this product_id
            cursor.execute("""
                SELECT DISTINCT rpd.recipe_id
                FROM kvmes.recipe_process_definition rpd
                CROSS JOIN LATERAL jsonb_array_elements(rpd.configs::jsonb) cfg
                CROSS JOIN LATERAL jsonb_array_elements(cfg->'steps') step
                CROSS JOIN LATERAL jsonb_array_elements(step->'materials') material_elem
                WHERE material_elem->>'name' = %s
            """, (product_id,))
            recipes = [r[0] for r in cursor.fetchall()]
            if not recipes:
                return jsonify({'success': True, 'result': [], 'columns': columns})

            # 3. Get candidate work orders and batches
            cursor.execute("""
                SELECT 
                    b.work_order,
                    b.number AS batch_seq,
                    b.status,
                    b.records_id,
                    wo.recipe_id,
                    wo.station,
                    wo.reserved_date
                FROM kvmes.work_order wo
                JOIN kvmes.batch b ON b.work_order = wo.id
                WHERE wo.recipe_id = ANY(%s)
            """, (recipes,))
            candidate_batches = cursor.fetchall()
            if not candidate_batches:
                return jsonify({'success': True, 'result': [], 'columns': columns})

            # 4. Map candidate batches to feed_record IDs
            feed_to_batches = {}
            all_feed_ids = set()
            for b in candidate_batches:
                wo, b_seq, status, records_id, recipe_id, station, res_date = b
                if records_id:
                    for fid in records_id:
                        all_feed_ids.add(fid)
                        if fid not in feed_to_batches:
                            feed_to_batches[fid] = []
                        feed_to_batches[fid].append((wo, b_seq, status, recipe_id, station, res_date))

            if not all_feed_ids:
                return jsonify({'success': True, 'result': [], 'columns': columns})

            # 5. Query feed_records matching material_oid
            cursor.execute("""
                SELECT 
                    f.id,
                    (elem->>'quantity')::numeric AS fed_quantity
                FROM kvmes.feed_record f
                CROSS JOIN LATERAL jsonb_array_elements(f.materials) site_elem
                CROSS JOIN LATERAL jsonb_array_elements(site_elem->'feed_resources') elem
                WHERE f.id = ANY(%s)
                  AND elem->>'resource_id' = %s
            """, (list(all_feed_ids), material_oid))
            matched_feeds = cursor.fetchall()
            if not matched_feeds:
                return jsonify({'success': True, 'result': [], 'columns': columns})

            # 6. Aggregate feed quantities for matched batches
            matched_work_orders = set()
            batch_data = {}
            for fid, fed_qty in matched_feeds:
                fed_qty = float(fed_qty or 0)
                for wo, b_seq, status, recipe_id, station, res_date in feed_to_batches.get(fid, []):
                    matched_work_orders.add(wo)
                    key = (wo, b_seq)
                    if key not in batch_data:
                        batch_data[key] = {
                            'wo': wo,
                            'batch_seq': b_seq,
                            'status': status,
                            'recipe_id': recipe_id,
                            'station': station,
                            'reserved_date': res_date,
                            'fed_qty': 0.0,
                            'output_qty': 0.0
                        }
                    batch_data[key]['fed_qty'] += fed_qty

            # 7. Fetch collect_records for matched work orders to get output quantities
            cursor.execute("""
                SELECT 
                    cr.work_order,
                    cr.sequence,
                    COALESCE((cr.detail->>'quantity')::numeric, 0) AS output_quantity
                FROM kvmes.collect_record cr
                WHERE cr.work_order = ANY(%s)
            """, (list(matched_work_orders),))
            for cr_wo, cr_seq, out_qty in cursor.fetchall():
                key = (cr_wo, cr_seq)
                if key in batch_data:
                    batch_data[key]['output_qty'] = float(out_qty or 0)

            # 8. Group by work order
            summary = {}
            for (wo, b_seq), binfo in batch_data.items():
                if wo not in summary:
                    res_date_str = binfo['reserved_date'].strftime('%Y-%m-%d') if hasattr(binfo['reserved_date'], 'strftime') else str(binfo['reserved_date']) if binfo['reserved_date'] else None
                    summary[wo] = {
                        'work_order': wo,
                        'recipe_id': binfo['recipe_id'],
                        'station': binfo['station'],
                        'reserved_date': res_date_str,
                        'total_barcode': 0,
                        'total_fail_barcode': 0,
                        'total_output_qty': 0.0,
                        'total_consumption': 0.0
                    }
                if binfo['status'] == 2:
                    summary[wo]['total_barcode'] += 1
                elif binfo['status'] == 1:
                    summary[wo]['total_fail_barcode'] += 1
                summary[wo]['total_output_qty'] += binfo['output_qty']
                summary[wo]['total_consumption'] += binfo['fed_qty']

            result_rows = []
            for wo in sorted(summary.keys()):
                s = summary[wo]
                if s['total_output_qty'] > 0:
                    consumption = str(round(s['total_consumption'] / s['total_output_qty'], 6))
                else:
                    consumption = "0"
                
                row = [
                    s['work_order'],
                    s['recipe_id'],
                    s['station'],
                    s['reserved_date'],
                    consumption,
                    s['total_barcode'],
                    s['total_fail_barcode'],
                    round(s['total_consumption'], 6)
                ]
                result_rows.append(serialize_row(row))

            return jsonify({
                'success': True,
                'result': result_rows,
                'columns': columns
            })

    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

@app.route('/api/workorders/fetch-output-barcodes', methods=['POST'])
@login_required
def fetch_output_barcode_by_work_order():

    data = request.get_json() or {}

    work_order_id = str(data.get('work_order_id') or '').strip()
    if not work_order_id:
        return jsonify({'success': False, 'message': 'Thiếu Work Order ID'})

    work_order_status = str(data.get('work_order_status') or '').strip()
    if not work_order_status:
        return jsonify({'success': False, 'message': 'Thiếu Work Order Status'})

    if work_order_status == "0":
        return jsonify({'success': False, 'message': 'Đơn điều động chưa được sản xuất'})

    try:
        query = """
            SELECT
                mr.id AS barcode,
                cr.detail->>'quantity' AS quantity,
                cr.created_at,
                cr.lot_number,
                cr.station
            FROM kvmes.collect_record cr
            LEFT JOIN kvmes.material_resource mr
                ON mr.oid = cr.resource_oid
            WHERE cr.work_order = %s
            ORDER BY cr.sequence ASC
        """

        result, column_names = execute_pg_select_query(query, (work_order_id,))
        if not result:
            return jsonify({'success': False, 'message': 'Đơn điều động không có tem đầu ra'})

        convert_columns = ["created_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(row) for row in result]

        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Lỗi: {str(e)}'
        })

output_barcode_tasks = {}
tasks_lock = threading.Lock()

def cleanup_expired_barcode_tasks():
    now = time.time()
    with tasks_lock:
        expired = [tid for tid, t in output_barcode_tasks.items() if now - t.get('created_at', now) > 1800]
        for tid in expired:
            output_barcode_tasks.pop(tid, None)

def run_output_barcode_query_task(task_id, resource_id, work_order):
    try:
        query = """
            WITH matched_batches AS (
                SELECT 
                    b.number AS batch_seq
                FROM kvmes.batch b
                JOIN kvmes.feed_record fr ON fr.id = ANY(b.records_id)
                CROSS JOIN LATERAL jsonb_array_elements(fr.materials) site_elem
                CROSS JOIN LATERAL jsonb_array_elements(site_elem->'feed_resources') elem
                WHERE b.work_order = %s
                  AND elem->>'resource_id' = %s
            ),
            matched_collects AS (
                SELECT 
                    cr.resource_oid,
                    cr.detail->>'quantity' AS original_quantity,
                    cr.lot_number AS cr_lot_number
                FROM kvmes.collect_record cr
                JOIN matched_batches mb ON mb.batch_seq = cr.sequence
                WHERE cr.work_order = %s
            )
            SELECT
                mr.id,
                mr.product_id,
                COALESCE(NULLIF(mc.original_quantity, '')::numeric, mr.quantity) AS quantity,
                mr.status,
                mr.created_at,
                COALESCE(mc.cr_lot_number, mr.info->>'lot_number') AS lot_number,
                mr.product_type
            FROM kvmes.material_resource mr
            JOIN matched_collects mc ON mr.oid = mc.resource_oid;
        """
        result, column_names = execute_pg_select_query(query, (work_order, resource_id, work_order))

        if result:
            convert_columns = ["expiry_time", "updated_at", "created_at", "standing_time"]
            result = convert_timestamp(result, column_names, convert_columns)
            serialized_result = [serialize_row(list(row)) for row in result]
        else:
            serialized_result = []

        with tasks_lock:
            if task_id in output_barcode_tasks:
                task_start = output_barcode_tasks[task_id].get('created_at', time.time())
                duration = round(time.time() - task_start, 2)
                output_barcode_tasks[task_id].update({
                    'status': 'completed',
                    'success': True,
                    'result': serialized_result,
                    'columns': column_names if result else ['id', 'product_id', 'quantity', 'status', 'created_at', 'lot_number', 'product_type'],
                    'count': len(serialized_result),
                    'message': 'Thành công' if serialized_result else 'Không tìm thấy tem đầu ra',
                    'completed_at': time.time(),
                    'duration': duration
                })

    except Exception as e:
        with tasks_lock:
            if task_id in output_barcode_tasks:
                task_start = output_barcode_tasks[task_id].get('created_at', time.time())
                duration = round(time.time() - task_start, 2)
                output_barcode_tasks[task_id].update({
                    'status': 'failed',
                    'success': False,
                    'message': f'Lỗi truy vấn: {str(e)}',
                    'completed_at': time.time(),
                    'duration': duration
                })

@app.route('/api/barcodes/fetch-output-barcodes', methods=['POST'])
@login_required
def get_output_barcode_by_barcode():
    
    resource_id = str(request.json.get('resource_id') or '').strip()
    if not resource_id:
        return jsonify({'success': False, 'message': 'Thiếu Resource ID'})
    
    work_order = str(request.json.get('work_order') or '').strip()
    if not work_order:
        return jsonify({'success': False, 'message': 'Thiếu MES ID'})

    cleanup_expired_barcode_tasks()

    task_id = uuid.uuid4().hex
    with tasks_lock:
        output_barcode_tasks[task_id] = {
            'task_id': task_id,
            'status': 'processing',
            'created_at': time.time(),
            'resource_id': resource_id,
            'work_order': work_order,
            'result': None,
            'columns': None,
            'success': None,
            'message': 'Đang tìm kiếm tem đầu ra trong cơ sở dữ liệu...'
        }

    worker = threading.Thread(
        target=run_output_barcode_query_task,
        args=(task_id, resource_id, work_order),
        daemon=True
    )
    worker.start()

    return jsonify({
        'success': True,
        'task_id': task_id,
        'status': 'processing',
        'message': 'Đã khởi tạo truy vấn tem đầu ra, hệ thống đang xử lý...'
    })

@app.route('/api/barcodes/fetch-output-barcodes/status/<task_id>', methods=['GET'])
@login_required
def get_output_barcode_task_status(task_id):

    with tasks_lock:
        task = output_barcode_tasks.get(task_id)

    if not task:
        return jsonify({
            'success': False,
            'status': 'not_found',
            'message': 'Yêu cầu không tồn tại hoặc đã hết hạn.'
        }), 404

    now = time.time()
    created_at = task.get('created_at', now)
    elapsed = round(now - created_at, 1)

    if task['status'] == 'completed':
        return jsonify({
            'success': True,
            'status': 'completed',
            'result': task.get('result', []),
            'columns': task.get('columns', []),
            'message': task.get('message', ''),
            'duration': task.get('duration', elapsed),
            'elapsed_seconds': elapsed
        })
    elif task['status'] == 'failed':
        return jsonify({
            'success': False,
            'status': 'failed',
            'message': task.get('message', 'Truy vấn thất bại'),
            'duration': task.get('duration', elapsed),
            'elapsed_seconds': elapsed
        })
    elif task['status'] == 'cancelled':
        return jsonify({
            'success': False,
            'status': 'cancelled',
            'message': 'Yêu cầu đã bị hủy bởi người dùng',
            'elapsed_seconds': elapsed
        })
    else:
        return jsonify({
            'success': True,
            'status': 'processing',
            'message': task.get('message', 'Đang truy vấn...'),
            'elapsed_seconds': elapsed
        })

@app.route('/api/barcodes/fetch-output-barcodes/stream', methods=['GET'])
@login_required
def stream_output_barcodes():
    
    resource_id = str(request.args.get('resource_id') or '').strip()
    work_order = str(request.args.get('work_order') or '').strip()
    
    if not resource_id or not work_order:
        def err_gen():
            yield f"data: {json.dumps({'status': 'failed', 'message': 'Thiếu Resource ID hoặc MES ID'}, ensure_ascii=False)}\n\n"
        return Response(err_gen(), mimetype='text/event-stream')

    def event_stream():
        task_data = {'status': 'processing', 'result': None, 'columns': None, 'error': None}
        
        def run_query():
            try:
                query = """
                    WITH matched_batches AS (
                        SELECT 
                            b.number AS batch_seq
                        FROM kvmes.batch b
                        JOIN kvmes.feed_record fr ON fr.id = ANY(b.records_id)
                        CROSS JOIN LATERAL jsonb_array_elements(fr.materials) site_elem
                        CROSS JOIN LATERAL jsonb_array_elements(site_elem->'feed_resources') elem
                        WHERE b.work_order = %s
                          AND elem->>'resource_id' = %s
                    ),
                    matched_collects AS (
                        SELECT 
                            cr.resource_oid,
                            cr.detail->>'quantity' AS original_quantity,
                            cr.lot_number AS cr_lot_number
                        FROM kvmes.collect_record cr
                        JOIN matched_batches mb ON mb.batch_seq = cr.sequence
                        WHERE cr.work_order = %s
                    )
                    SELECT
                        mr.id,
                        mr.product_id,
                        COALESCE(NULLIF(mc.original_quantity, '')::numeric, mr.quantity) AS quantity,
                        mr.status,
                        mr.created_at,
                        COALESCE(mc.cr_lot_number, mr.info->>'lot_number') AS lot_number,
                        mr.product_type
                    FROM kvmes.material_resource mr
                    JOIN matched_collects mc ON mr.oid = mc.resource_oid;
                """
                res, cols = execute_pg_select_query(query, (work_order, resource_id, work_order))

                if res:
                    convert_columns = ["expiry_time", "updated_at", "created_at", "standing_time"]
                    res = convert_timestamp(res, cols, convert_columns)
                    serialized = [serialize_row(list(row)) for row in res]
                else:
                    serialized = []

                task_data['result'] = serialized
                task_data['columns'] = cols if res else ['id', 'product_id', 'quantity', 'status', 'created_at', 'lot_number', 'product_type']
                task_data['status'] = 'completed'
            except Exception as e:
                task_data['error'] = str(e)
                task_data['status'] = 'failed'

        worker = threading.Thread(target=run_query, daemon=True)
        worker.start()

        start_time = time.time()
        
        # Stream keep-alive / progress events until query finishes
        while task_data['status'] == 'processing':
            worker.join(timeout=0.05)
            if task_data['status'] != 'processing':
                break
            elapsed = round(time.time() - start_time, 1)
            yield f"data: {json.dumps({'status': 'processing', 'elapsed': elapsed}, ensure_ascii=False)}\n\n"
            worker.join(timeout=0.95)

        duration = round(time.time() - start_time, 2)
        if task_data['status'] == 'completed':
            yield f"data: {json.dumps({'status': 'completed', 'result': task_data['result'], 'columns': task_data['columns'], 'duration': duration, 'count': len(task_data['result'])}, ensure_ascii=False, default=json_serial_fallback)}\n\n"
        else:
            err_msg = task_data.get('error') or 'Lỗi không xác định'
            yield f"data: {json.dumps({'status': 'failed', 'message': f'Lỗi: {err_msg}', 'duration': duration}, ensure_ascii=False, default=json_serial_fallback)}\n\n"

    response = Response(event_stream(), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    return response

@app.route('/api/barcodes/fetch-output-barcodes/cancel/<task_id>', methods=['POST'])
@login_required
def cancel_output_barcode_task(task_id):

    with tasks_lock:
        if task_id in output_barcode_tasks:
            output_barcode_tasks[task_id]['status'] = 'cancelled'

    return jsonify({'success': True, 'message': 'Đã hủy truy vấn'})

@app.route('/api/barcodes/check-transfer', methods=['POST'])
@login_required
def check_barcode_transfer():

    resource_id = request.json.get('resource_id')
    if not resource_id:
        return jsonify({'success': False, 'message': 'Thiếu Resource ID'})
    
    try:
        query = """
            SELECT
                mr.id AS barcode,
                lf.id AS from_location,
                lt.id AS to_location,
                mrt.created_at,
                mrt.created_by
            FROM kvmes.material_resource mr
            JOIN kvmes.material_resource_transaction mrt
                ON mr.oid = mrt.material_resource_oid
            LEFT JOIN kvmes.location lf 
                ON lf.oid = mrt.from_location_oid::INTEGER
            LEFT JOIN kvmes.location lt 
                ON lt.oid = mrt.to_location_oid::INTEGER
            WHERE mr.id = %s AND mrt.status = 'SUCCEEDED'
        """
        result, column_names = execute_pg_select_query(query, (resource_id,))
        if not result:
            return jsonify({'success': False, 'message': 'Không tìm thấy dữ liệu vận chuyển'})

        convert_columns = ["created_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        row = dict(zip(column_names, result[0]))

        message = (
            f"Barcode {resource_id} đã được chuyển từ {row.get('from_location')} qua {row.get('to_location')}, "
            f"lúc {row.get('created_at')} bởi {row.get('created_by')}"
        )

        return jsonify({'success': True, 'message': message})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

@app.route('/api/barcodes/check-extend-date-count', methods=['POST'])
@login_required
def check_barcode_extend_time():

    resource_id = request.json.get('resource_id')
    if not resource_id:
        return jsonify({'success': False, 'message': 'Thiếu Resource ID'})
    
    try:
        query = """
            SELECT 
                info->>'deferrals_count' AS count_extend_date,
                info->>'change_log' AS change_log
            FROM kvmes.material_resource
            WHERE id = %s;
        """
        result, column_names = execute_pg_select_query(query, (resource_id,))
        
        if not result:
            return jsonify({'success': False, 'message': 'Không tìm thấy barcode'})

        row = dict(zip(column_names, result[0]))
        count_extend = row.get('count_extend_date', '0')
        change_log_str = row.get('change_log', '[]')
        
        # Parse change_log JSON
        try:
            if isinstance(change_log_str, str):
                change_log = json.loads(change_log_str)
            else:
                change_log = change_log_str if change_log_str else []
        except json.JSONDecodeError:
            change_log = []
        
        # Build message
        if count_extend == "0" or not change_log:
            message = (
                f"Barcode {resource_id} chưa được gia hạn lần nào!\n"
                f"(Tối đa 2 lần)"
            )
        else:
            message_parts = [
                f"Barcode {resource_id} đã gia hạn {count_extend} lần!"
            ]
            
            # Add each extension detail
            for idx, log_entry in enumerate(change_log, start=1):
                updated_at = log_entry.get('updated_at')
                updated_by = log_entry.get('updated_by', 'N/A')
                
                # Convert timestamp to datetime
                if updated_at:
                    # Convert nanoseconds to datetime
                    formatted_time = convert_timestamp(updated_at)
                    message_parts.append(
                        f"Lần {idx} lúc {formatted_time} bởi {updated_by}"
                    )
            
            message_parts.append("(Tối đa 2 lần)")
            message = '\n'.join(message_parts)

        return jsonify({'success': True, 'message': message})
        
    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

# ── Global Server Cache for Static MES Metadata (Departments & Stations) ──────
_DEPARTMENTS_CACHE = {
    'data': None,
    'timestamp': 0,
    'ttl': 600  # 10 minutes cache
}
_STATIONS_CACHE = {}  # {department_oid: {'data': [...], 'timestamp': ...}}
_STATIONS_CACHE_TTL = 600  # 10 minutes cache

@app.route('/api/departments', methods=['GET'])
@login_required
def get_department_list():
    url = 'https://198.1.10.85:8810/api/departments'
    headers = get_auth_headers(session)
    
    try:
        response = requests.get(url, headers=headers, verify=False, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        dept_data = []
        if isinstance(data, dict) and 'data' in data:
            dept_data = data['data']
        elif isinstance(data, list):
            dept_data = data
        
        return jsonify({
            'error': False,
            'data': dept_data
        })
    
    except Exception as e:
        error_msg = str(e)
        if (hasattr(e, 'response') and e.response is not None and e.response.status_code in [401, 403]) or '401' in error_msg or '403' in error_msg or 'Unauthorized' in error_msg:
            return make_unauthorized_response('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')

        return jsonify({
            'error': True,
            'code': 'INTERNAL_ERROR',
            'message': error_msg
        }), 500

@app.route('/api/departments/stations', methods=['POST'])
@login_required
def get_station_list_by_department():
    
    user_token = session.get('user_token')
    if not user_token:
        return make_unauthorized_response()
    
    department_oid = request.json.get('department_oid', '').strip()
    if not department_oid:
        return jsonify({'stations': []})
    
    now = time.time()
    cached_entry = _STATIONS_CACHE.get(department_oid)
    if cached_entry and (now - cached_entry['timestamp'] < _STATIONS_CACHE_TTL):
        return jsonify({'stations': cached_entry['data']})
    
    url = f'https://198.1.10.85:8810/api/station-list/department-oid/{department_oid}'
    headers = get_auth_headers(session)
    
    try:
        response = requests.get(url, headers=headers, verify=False, timeout=10)
        data = response.json()
        stations = []
        if data.get('data'):
            for item in data['data']:
                stations.append({
                    'id': item.get('ID', ''),
                    'name': item.get('name', '')
                })
        
        _STATIONS_CACHE[department_oid] = {
            'data': stations,
            'timestamp': now
        }
        return jsonify({'stations': stations})
    except requests.RequestException as e:
        if cached_entry:
            return jsonify({'stations': cached_entry['data']})
        return jsonify({'stations': [], 'error': str(e)})

@app.route('/api/work-orders/get-active-list', methods=['POST'])
@login_required
def get_active_work_order_list():
    
    station = request.json.get('station', '').strip()
    
    if not station:
        return jsonify({'result': [], 'columns': []})
    
    query = """
        SELECT id, recipe_id, department_id, station, status, reserved_date::text AS reserved_date,
                created_at, updated_at, updated_by
        FROM kvmes.work_order
        WHERE station = %s
        AND status = 1
        AND reserved_date >= (CURRENT_DATE - INTERVAL '60 days')
        AND reserved_date <= CURRENT_DATE
        ORDER BY reserved_sequence
    """
    
    try:
        result, column_names = execute_pg_select_query(query, (station, ))
        convert_columns = ["created_at", "updated_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({'result': serialized_result, 'columns': column_names})
    except Exception as e:
        return jsonify({'result': [], 'columns': [], 'error': str(e)})

@app.route('/api/stations/validate-scan-barcode', methods=['POST'])
@login_required
def validate_scan_barcode_by_station():
    
    recipe_id = request.json.get('recipe_id', '').strip()
    station = request.json.get('station', '').strip()
    
    if not recipe_id or not station:
        return jsonify({'success': False, 'message': 'Thiếu thông tin'})
    
    try:
        # Get recipe configs
        recipe_query = """
            SELECT oid, recipe_id, name, type, configs, product_id, product_type, limitary_hour
            FROM kvmes.recipe_process_definition
            WHERE recipe_id = %s
        """

        recipe_result, recipe_columns = execute_pg_select_query(recipe_query, (recipe_id,))
        
        if not recipe_result:
            return jsonify({'success': False, 'message': 'Không tìm thấy recipe'})
        
        recipe_configs = recipe_result[0][recipe_columns.index('configs')]
        
        # Parse configs to get materials from steps
        recipe_materials = []
        if recipe_configs:
            try:
                if isinstance(recipe_configs, str):
                    configs_data = json.loads(recipe_configs)
                else:
                    configs_data = recipe_configs
                
                if isinstance(configs_data, list) and len(configs_data) > 0:
                    steps = configs_data[0].get('steps', [])
                    if steps and len(steps) > 0:
                        materials = steps[0].get('materials', [])
                        for mat in materials:
                            recipe_materials.append({
                                'name': mat.get('name', ''),
                                'site': mat.get('site', '')
                            })
            except Exception as e:
                return jsonify({'success': False, 'message': f'Lỗi parse configs: {str(e)}'})
            
        # Get site_view data
        site_query = """
            SELECT station, name, content, updated_at, updated_by
            FROM kvmes.site_view
            WHERE station = %s
        """
        site_result, site_columns = execute_pg_select_query(site_query, (station,))
        
        site_materials = []
        for row in site_result:
            row_dict = dict(zip(site_columns, row))
            name = row_dict.get('name', '')
            content = row_dict.get('content', '')
            
            if content:
                try:
                    if isinstance(content, str):
                        content_data = json.loads(content)
                    else:
                        content_data = content
                    
                    slot = content_data.get('slot', {})
                    material = slot.get('material', {})
                    material_obj = material.get('material', {})
                    
                    material_id = material_obj.get('id', '')
                    resource_id = material.get('resource_id', '')
                    
                    site_materials.append({
                        'name': name,
                        'id': material_id,
                        'barcode': resource_id
                    })
                except Exception as e:
                    continue

        # Compare and match
        comparison_result = []
        for recipe_mat in recipe_materials:
            recipe_name = recipe_mat['name']
            recipe_site = recipe_mat['site']
            
            # Find matching site material
            matched = False
            for site_mat in site_materials:
                if site_mat['name'] == recipe_site:
                    matched = True
                    is_match = (recipe_name == site_mat['id'])
                    comparison_result.append([
                        recipe_site,           # site
                        recipe_name,           # recipe_name
                        site_mat['id'],        # site_id
                        site_mat['barcode'],   # site_barcode
                        is_match,              # match
                        None,                   # expiry_time
                        None                    # quantity
                    ])
                    break
            
            if not matched:
                comparison_result.append([
                    recipe_site,    # site
                    recipe_name,    # recipe_name
                    None,           # site_id
                    None,           # site_barcode
                    False,          # match
                    None,            # expiry_time
                    None             # quantity
                ])
        
        # Get expiry_time for each barcode
        for item in comparison_result:
            site_barcode = item[3]  # index 3 is site_barcode
            if site_barcode:
                expiry_query = """
                    SELECT expiry_time, quantity
                    FROM kvmes.material_resource
                    WHERE id = %s
                """
                expiry_result, expiry_columns = execute_pg_select_query(expiry_query, (site_barcode,))
                
                if expiry_result and len(expiry_result) > 0:
                    item[5] = expiry_result[0][0]  # expiry_time
                    item[6] = expiry_result[0][1]  # quantity
        
        # Convert timestamp columns (expiry_time is at index 5)
        column_names = ['site', 'recipe_name', 'site_id', 'site_barcode', 'match', 'expiry_time', 'quantity']
        convert_columns = ['expiry_time']
        comparison_result = convert_timestamp(comparison_result, column_names, convert_columns)
        
        # Serialize the result
        serialized_result = [serialize_row(list(row)) for row in comparison_result]
        
        # Rebuild as list of dictionaries
        final_result = []
        for row in serialized_result:
            final_result.append({
                'site': row[0],
                'recipe_name': row[1],
                'site_id': row[2],
                'site_barcode': row[3],
                'match': row[4],
                'expiry_time': row[5],
                'quantity': row[6]
            })
        
        return jsonify({
            'success': True,
            'result': final_result
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})
    
@app.route('/api/barcodes/get-reprint-list', methods=['POST'])
@login_required
def get_reprint_barcode_list():

    from_date = request.json.get('from_date', '').strip()
    to_date = request.json.get('to_date', '').strip()

    if not from_date or not to_date:
        return jsonify({'result': [], 'columns': []})

    url = 'https://198.1.10.85:8810/api/resources/materials'
    params = {
        'reprintReason': -1,
        'createdAfter': from_date,
        'createdBefore': to_date
    }

    headers = get_auth_headers(session)

    try:
        response = requests.get(url, headers=headers, params=params, verify=False)
        response.raise_for_status()
        data = response.json()

        items = data.get('data', {}).get('items', [])
        if not items:
            return jsonify({'result': [], 'columns': []})

        DISPLAY_COLUMNS = [
            'ID',
            'resourceID',
            'quantity',
            'status',
            'reprintReason',
            'createdAt',
            'createdBy',
            'productType'
        ]
        
        DATE_COLUMNS = {
            'createdAt'
        }

        columns = DISPLAY_COLUMNS

        result = []
        for item in items:
            row = []
            for col in columns:
                value = item.get(col)

                if col in DATE_COLUMNS and isinstance(value, str):
                    value = convert_iso_datetime(value)
                
                if isinstance(value, (dict, list)):
                    row.append(json.dumps(value, ensure_ascii=False))
                else:
                    row.append(value)

            result.append(row)

        return jsonify({
            'result': result,
            'columns': columns
        })

    except Exception as e:
        return jsonify({
            'error': True,
            'code': 'INTERNAL_ERROR',
            'message': str(e)
        }), 500

@app.route('/api/get-qc-data-by-date', methods=['POST'])
@login_required
def get_qc_data_by_date():

    from_date  = request.json.get('fromDate', '').strip()
    to_date    = request.json.get('toDate', '').strip()
    # product_id = request.json.get('product_id', '').strip()

    if not from_date or not to_date:
        return jsonify({'success': False, 'message': 'Vui lòng chọn khoảng ngày'})

    try:
        params = [from_date, to_date]

        query = """
            SELECT
                mr.id                           AS barcode,
                mr.product_id                   AS mstp,
                dr.code                         AS code,
                dr.is_good                      AS is_good,
                dr.created_at                   AS created_at,
                dr.created_by                   AS created_by
            FROM kvmes.defective_records dr
            JOIN kvmes.material_resource mr
                ON dr.resource_oid = mr.oid
            WHERE dr.created_at >= EXTRACT(EPOCH FROM (%s::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')) * 1000000000
            AND dr.created_at <  EXTRACT(EPOCH FROM ((%s::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')) * 1000000000
            ORDER BY dr.created_at DESC;
        """

        result, column_names = execute_pg_select_query(query, tuple(params))
        if result:
            convert_columns = ['created_at']
            result = convert_timestamp(result, column_names, convert_columns)
            serialized_result = [serialize_row(list(row)) for row in result]
            return jsonify({
                'success': True,
                'result': serialized_result,
                'columns': column_names
            })
        else:
            return jsonify({
                'success': True,
                'result': [],
                'columns': column_names
            })

    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})
    
@app.route('/api/barcodes/get-substitutions-list', methods=['POST'])
@login_required
def search_substitutions():
    
    keyword = request.json.get('keyword', '').strip()
    if not keyword:
        return jsonify({'result': [], 'columns': []})
    
    query = """
        SELECT id, substitutions, updated_at, updated_by
	    FROM kvmes.substitution_mapping
        WHERE id ILIKE %s
        LIMIT 100;
    """
    result, column_names = execute_pg_select_query(query, (f"%{keyword}%",))
    if result:
        convert_columns = ["updated_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })
    
@app.route('/api/recipes/fetch-work-orders', methods=['POST'])
@login_required
def fetch_work_order_by_recipe():
    
    recipe_id = request.json.get('recipe_id')
    if not recipe_id:
        return jsonify({'success': False, 'message': 'Thiếu Recipe ID'})
    
    try:
        if '%' in recipe_id:
            query = """
                SELECT  id AS work_order, recipe_id, status, station, 
                        reserved_date::text AS reserved_date, 
                        updated_at, updated_by, created_at, created_by,
                        information, department_id, reserved_sequence,
                        process_name, process_type
                FROM kvmes.work_order
                WHERE recipe_id LIKE %s
                ORDER BY reserved_date DESC
                LIMIT 100;
            """
        else:
            query = """
                SELECT  id AS work_order, recipe_id, status, station, 
                        reserved_date::text AS reserved_date, 
                        updated_at, updated_by, created_at, created_by,
                        information, department_id, reserved_sequence,
                        process_name, process_type
                FROM kvmes.work_order
                WHERE recipe_id = %s
                ORDER BY reserved_date DESC
                LIMIT 100;
            """
        
        result, column_names = execute_pg_select_query(query, (recipe_id, ))
        if result:       
            convert_columns = ["updated_at", "created_at"]
            result = convert_timestamp(result, column_names, convert_columns)
            serialized_result = [serialize_row(list(row)) for row in result]
            return jsonify({
                'success': True,
                'result': serialized_result,
                'columns': column_names
            })
        else:
            return jsonify({
                'success': True,
                'result': [],
                'columns': column_names, 
                'message': 'Không tìm thấy mã MES'
            })
    
    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

@app.route('/api/recipes/fetch-commit-gitlab', methods=['POST'])
@login_required
def fetch_commit_gitlab():
    
    recipe_id = request.json.get('recipe_id', '').strip()
    product_type = request.json.get('product_type', '').strip()

    if not recipe_id or not product_type:
        return jsonify({'success': False, 'message': 'Thiếu recipe_id hoặc product_type'})

    project_id = get_gitlab_project_id(product_type)
    session['current_gitlab_project_id'] = project_id

    s = get_gitlab_session()

    try:
        # Step 1: Resolve the yaml file path in GitLab (using cache and direct check)
        path = resolve_recipe_path(project_id, recipe_id, product_type)
        if not path:
            return jsonify({'success': False, 'message': f'Không tìm thấy file YAML cho quy cách {recipe_id} trên GitLab'})

        encoded_path = path.replace('/', '%2F')

        # Step 2: Fetch commit history (Blame first for sub-second speed, fallback to commits endpoint)
        commits = []
        try:
            blame_url = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/repository/files/{encoded_path}/blame'
            blame_resp = s.get(blame_url, params={'ref': 'master'}, timeout=12)
            if blame_resp.ok:
                blame_data = blame_resp.json()
                seen_commit_ids = set()
                if isinstance(blame_data, list):
                    for blame_entry in blame_data:
                        commit = blame_entry.get('commit', {})
                        commit_id = commit.get('id', '')
                        if commit_id and commit_id not in seen_commit_ids:
                            seen_commit_ids.add(commit_id)
                            commits.append(commit)
        except Exception:
            pass

        if not commits:
            try:
                commits_url = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/repository/commits'
                commits_resp = s.get(commits_url, params={'path': path, 'ref_name': 'master', 'per_page': 50}, timeout=15)
                if commits_resp.status_code == 200 and isinstance(commits_resp.json(), list):
                    commits = commits_resp.json()
            except Exception:
                pass

        if not commits:
            return jsonify({'success': False, 'message': 'Không tìm thấy lịch sử commit nào cho quy cách này'})

        # Step 3: Concurrently fetch diff and pipeline info for each commit over pooled session
        def fetch_commit_file_diff(commit_item):
            cid = commit_item.get('id', '')
            if not cid:
                return commit_item, {}, {}
            
            def get_c_info():
                try:
                    c_info_resp = s.get(f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/repository/commits/{cid}', timeout=5)
                    if c_info_resp.status_code == 200:
                        return c_info_resp.json()
                except Exception:
                    pass
                return {}

            def get_diff_data():
                try:
                    diff_url = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/repository/commits/{cid}/diff'
                    diff_resp = s.get(diff_url, params={'per_page': 100}, timeout=4)
                    if diff_resp.status_code == 200:
                        return diff_resp.json()
                except Exception:
                    pass
                return []

            with ThreadPoolExecutor(max_workers=2) as sub_ex:
                f_info = sub_ex.submit(get_c_info)
                f_diff = sub_ex.submit(get_diff_data)
                commit_detail = f_info.result()
                diff_data = f_diff.result()

            last_pipe = commit_detail.get('last_pipeline') or {}
            p_status = commit_detail.get('status') or last_pipe.get('status') or commit_item.get('status') or 'none'
            pipeline_info = {
                'status': p_status,
                'id': last_pipe.get('id'),
                'web_url': last_pipe.get('web_url', '')
            }

            # Tier 1: Check commit diff endpoint
            if isinstance(diff_data, list):
                for d in diff_data:
                    new_p = d.get('new_path', '')
                    old_p = d.get('old_path', '')
                    if new_p == path or old_p == path or new_p.endswith('/' + recipe_id + '.yaml') or old_p.endswith('/' + recipe_id + '.yaml') or new_p.endswith(recipe_id + '.yaml'):
                        return commit_item, d, pipeline_info

            # Tier 2: Fallback for giant commits or commits where file was not on page 1
            try:
                parent_ids = commit_item.get('parent_ids')
                if parent_ids is None:
                    parent_ids = commit_detail.get('parent_ids', [])
                parent_id = parent_ids[0] if parent_ids else None
                raw_file_url = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/repository/files/{encoded_path}/raw'

                with ThreadPoolExecutor(max_workers=2) as sub_ex:
                    f_cur = sub_ex.submit(lambda: s.get(raw_file_url, params={'ref': cid}, timeout=5))
                    f_par = sub_ex.submit(lambda: s.get(raw_file_url, params={'ref': parent_id}, timeout=5) if parent_id else None)
                    cur_resp = f_cur.result()
                    parent_resp = f_par.result()

                cur_text = cur_resp.text if cur_resp and cur_resp.status_code == 200 else ''
                parent_text = parent_resp.text if parent_resp and parent_resp.status_code == 200 else ''
                parent_status = parent_resp.status_code if parent_resp else 404
                cur_status = cur_resp.status_code if cur_resp else 404

                is_new = (parent_status == 404 and cur_status == 200)
                is_deleted = (cur_status == 404)

                cur_lines = cur_text.splitlines(keepends=True)
                parent_lines = parent_text.splitlines(keepends=True)

                diff_gen = difflib.unified_diff(
                    parent_lines,
                    cur_lines,
                    fromfile=f"a/{path}",
                    tofile=f"b/{path}",
                    n=3
                )
                diff_lines = list(diff_gen)
                unified_lines = [l for l in diff_lines if not (l.startswith('---') or l.startswith('+++'))]
                diff_str = "".join(unified_lines).rstrip('\n')

                return commit_item, {
                    'diff': diff_str,
                    'new_path': path,
                    'old_path': path,
                    'new_file': is_new,
                    'renamed_file': False,
                    'deleted_file': is_deleted
                }, pipeline_info
            except Exception:
                return commit_item, {
                    'diff': '',
                    'new_path': path,
                    'old_path': path,
                    'new_file': False,
                    'renamed_file': False,
                    'deleted_file': False
                }, pipeline_info

        with ThreadPoolExecutor(max_workers=20) as executor:
            commit_diff_results = list(executor.map(fetch_commit_file_diff, commits))

        project_web_base = 'https://gitlabce.kenda.com.tw/tc/recipes/kitting' if project_id == 135 else (
            'https://gitlabce.kenda.com.tw/tc/recipes/green_tire' if project_id == 133 else (
                'https://gitlabce.kenda.com.tw/tc/recipes/tire' if project_id == 134 else f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}'
            )
        )

        column_names = [
            'message', 'authored_date', 'author_name', 'author_email', 
            'committed_date', 'committer_name', 'committer_email', 'id',
            'diff', 'new_path', 'old_path', 'new_file', 'renamed_file', 'deleted_file', 'web_url',
            'pipeline_status', 'pipeline_id', 'pipeline_web_url'
        ]

        result = []
        for item in commit_diff_results:
            if len(item) == 3:
                commit, file_diff, pipe_info = item
            else:
                commit, file_diff = item[0], item[1]
                pipe_info = {}
            cid = commit.get('id', '')
            commit_web_url = commit.get('web_url', '') or (f'{project_web_base}/-/commit/{cid}' if cid else '')
            row = [
                commit.get('message', ''),
                commit.get('authored_date', ''),
                commit.get('author_name', ''),
                commit.get('author_email', ''),
                commit.get('committed_date', ''),
                commit.get('committer_name', ''),
                commit.get('committer_email', ''),
                cid,
                file_diff.get('diff', ''),
                file_diff.get('new_path', path),
                file_diff.get('old_path', path),
                file_diff.get('new_file', False),
                file_diff.get('renamed_file', False),
                file_diff.get('deleted_file', False),
                commit_web_url,
                pipe_info.get('status', 'none') or 'none',
                pipe_info.get('id'),
                pipe_info.get('web_url', '') or ''
            ]
            result.append(row)

        result.sort(key=lambda row: row[column_names.index('authored_date')] or '', reverse=True)
        
        if result:
            convert_columns = ['authored_date', 'committed_date']
            
            new_result = []
            for row in result:
                row_list = list(row)
                for col in convert_columns:
                    if col in column_names:
                        idx = column_names.index(col)
                        row_list[idx] = convert_iso_datetime(str(row_list[idx])) if row_list[idx] else None
                new_result.append(tuple(row_list))
            
            serialized_result = [serialize_row(list(row)) for row in new_result]
            return jsonify({
                'success': True,
                'result': serialized_result,
                'columns': column_names,
                'file_path': path,
                'recipe_id': recipe_id
            })
        else:
            return jsonify({
                'success': True,
                'result': [],
                'columns': column_names,
                'message': 'Không tìm thấy commit nào'
            })

    except requests.RequestException as e:
        return jsonify({'success': False, 'message': f'Lỗi kết nối GitLab: {str(e)}'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

@app.route('/api/recipes/commit-gitlab/details', methods=['POST'])
@login_required
def fetch_commit_gitlab_details():

    global gitlab_private_token

    commit_id = request.json.get('commit_id', '').strip()
    if not commit_id:
        return jsonify({'success': False, 'message': 'Thiếu commit_id'})

    project_id = session.get('current_gitlab_project_id')
    if not project_id:
        return jsonify({'success': False, 'message': 'Chưa có project_id, vui lòng tải danh sách commit trước'})

    headers = {
        'PRIVATE-TOKEN': gitlab_private_token
    }

    try:
        diff_url = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/repository/commits/{commit_id}/diff'

        diff_response = requests.get(diff_url, headers=headers, params={'per_page': 100}, verify=False, timeout=20)
        diff_response.raise_for_status()
        diff_data = diff_response.json()

        if not diff_data:
            return jsonify({'success': False, 'message': 'Không tìm thấy diff cho commit này'})

        column_names = [
            'diff', 'new_path', 'old_path',
            'new_file', 'renamed_file', 'deleted_file'
        ]

        result = []
        for item in diff_data:
            row = [
                item.get('diff', ''),
                item.get('new_path', ''),
                item.get('old_path', ''),
                item.get('new_file', False),
                item.get('renamed_file', False),
                item.get('deleted_file', False)
            ]
            result.append(row)

        if result:
            serialized_result = [serialize_row(list(row)) for row in result]
            return jsonify({
                'success': True,
                'result': serialized_result,
                'columns': column_names
            })
        else:
            return jsonify({
                'success': True,
                'result': [],
                'columns': column_names,
                'message': 'Không có thay đổi trong commit này'
            })

    except requests.RequestException as e:
        return jsonify({'success': False, 'message': f'Lỗi kết nối GitLab: {str(e)}'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

@app.route('/api/recipes/fetch-yaml-content', methods=['POST'])
@login_required
def fetch_yaml_content():

    recipe_id = request.json.get('recipe_id', '').strip()
    product_type = request.json.get('product_type', '').strip()

    if not recipe_id or not product_type:
        return jsonify({'success': False, 'message': 'Thiếu recipe_id hoặc product_type'})

    project_id = get_gitlab_project_id(product_type)
    s = get_gitlab_session()

    try:
        path = resolve_recipe_path(project_id, recipe_id, product_type)
        if not path:
            return jsonify({'success': False, 'message': 'Không tìm thấy file yaml ở gitlab'})

        encoded_path = path.replace('/', '%2F')

        # Try raw endpoint directly for maximum speed
        raw_url = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/repository/files/{encoded_path}/raw'
        raw_response = s.get(raw_url, params={'ref': 'master'}, timeout=10)
        
        file_name = os.path.basename(path)
        last_commit_id = ''
        content_decoded = ''

        if raw_response.status_code == 200:
            content_decoded = raw_response.text
        else:
            file_url = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/repository/files/{encoded_path}'
            file_response = s.get(file_url, params={'ref': 'master'}, timeout=10)
            file_response.raise_for_status()
            file_data = file_response.json()
            if not file_data:
                return jsonify({'success': False, 'message': 'Không tìm thấy nội dung file yaml'})
            content_b64 = file_data.get('content', '')
            if not content_b64:
                return jsonify({'success': False, 'message': 'File yaml không có nội dung'})
            content_decoded = base64.b64decode(content_b64).decode('utf-8')
            file_name = file_data.get('file_name', file_name)
            last_commit_id = file_data.get('last_commit_id', '')

        # Detect product_type from YAML content if present
        actual_product_type = product_type
        pt_match = re.search(r'^\s*product-type\s*:\s*([^\s#\r\n]+)', content_decoded, re.MULTILINE)
        if pt_match:
            detected_pt = pt_match.group(1).strip('\'"')
            if detected_pt:
                actual_product_type = detected_pt

        spec_data = get_technical_specifications_data()
        keys_map = spec_data.get('keys_by_product_type', {})
        
        label_keys = keys_map.get(actual_product_type)
        if label_keys is None:
            label_keys = keys_map.get(actual_product_type.upper(), [])
            if label_keys:
                actual_product_type = actual_product_type.upper()
            else:
                label_keys = []

        return jsonify({
            'success': True,
            'content': content_decoded,
            'file_path': path,
            'file_name': file_name,
            'last_commit_id': last_commit_id,
            'product_type': actual_product_type,
            'label_config_keys': label_keys,
            'all_label_config_keys': keys_map
        })

    except requests.RequestException as e:
        return jsonify({'success': False, 'message': f'Lỗi kết nối GitLab: {str(e)}'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

def parse_yaml_metadata_from_path(item_path: str, project_id: int):
    file_name = os.path.basename(item_path)
    dir_part = os.path.dirname(item_path).replace('\\', '/')
    parts = [p for p in dir_part.split('/') if p and p.lower() != 'yamls']
    
    project_defaults = {
        136: ('MIXING', 'Mixing (BB)'),
        135: ('KITTING', 'Kitting (CBK)'),
        133: ('GREEN_TIRE', 'Building (TH)'),
        134: ('TIRE', 'Curing (EV)')
    }
    
    default_pt, proj_label = project_defaults.get(project_id, ('UNKNOWN', 'GitLab'))
    product_type = default_pt
    location = ''
    
    if project_id == 135:
        if len(parts) >= 1:
            product_type = parts[0].upper().replace('-', '_')
        if len(parts) > 1:
            location = " / ".join(parts[1:])
    elif project_id == 133:
        product_type = 'GREEN_TIRE'
        if len(parts) >= 1:
            loc_parts = [p for p in parts if p.lower() not in ['green-tire', 'green_tire']]
            location = " / ".join(loc_parts) if loc_parts else (parts[0] if parts else '')
    elif project_id in (134, 136):
        if parts:
            location = " / ".join(parts)
    else:
        if parts:
            product_type = parts[0].upper().replace('-', '_')
            if len(parts) > 1:
                location = " / ".join(parts[1:])

    if not location:
        location = proj_label

    return [file_name, product_type, location, item_path]

@app.route('/api/recipes/search-yaml-files', methods=['POST'])
@login_required
def search_recipe_yaml_files():
    keyword = (request.json.get('keyword') or request.json.get('query') or '').strip()
    project_id = request.json.get('project_id')

    if not keyword:
        return jsonify({'success': False, 'message': 'Thiếu từ khóa tìm kiếm'})

    try:
        project_id = int(project_id)
    except (TypeError, ValueError):
        project_id = 135

    s = get_gitlab_session()
    clean_keyword = keyword.replace('.yaml', '').strip()

    try:
        search_url = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/search'
        res = s.get(search_url, params={'scope': 'blobs', 'search': clean_keyword}, timeout=15)
        
        if res.status_code in [401, 403]:
            return jsonify({'success': False, 'message': 'Lỗi xác thực GitLab Token, vui lòng kiểm tra'})

        results = []
        seen_paths = set()

        if res.ok:
            data = res.json()
            if isinstance(data, list):
                for item in data:
                    item_path = item.get('path', '')
                    if not item_path or item_path in seen_paths:
                        continue
                    if item_path.endswith(('.yaml', '.yml')):
                        seen_paths.add(item_path)
                        results.append(parse_yaml_metadata_from_path(item_path, project_id))

        # If blob search returned nothing, also try direct candidate resolution
        if not results:
            resolved = resolve_recipe_path(project_id, clean_keyword)
            if resolved and resolved not in seen_paths:
                results.append(parse_yaml_metadata_from_path(resolved, project_id))

        return jsonify({
            'success': True,
            'columns': ['Tên file', 'Phân loại', 'Khu vực / Xưởng', 'Đường dẫn'],
            'result': results,
            'project_id': project_id
        })

    except requests.RequestException as e:
        return jsonify({'success': False, 'message': f'Lỗi kết nối GitLab: {str(e)}'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

@app.route('/api/recipes/search-actions-commit', methods=['POST'])
@login_required
def search_actions_commit():

    recipe_id = request.json.get('recipe_id', '').strip()
    product_type = request.json.get('product_type', '').strip()

    if not recipe_id:
        return jsonify({'success': False, 'message': 'Thiếu thông tin recipe_id'})

    project_id = get_gitlab_project_id(product_type)
    s = get_gitlab_session()

    clean_recipe_id = recipe_id.replace('.yaml', '').strip()

    try:
        # Step 1: Concurrently fetch 100 recent commits of actions.yaml AND resolve recipe path + Blame dates
        def get_recent_actions():
            try:
                commits_url = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/repository/commits'
                params = {
                    'path': 'actions.yaml',
                    'page': 1,
                    'per_page': 100
                }
                res = s.get(commits_url, params=params, timeout=5)
                if res.status_code in [401, 403]:
                    return {'auth_error': True}
                if res.ok:
                    commits_list = res.json()
                    if isinstance(commits_list, list):
                        return {'commits': commits_list}
            except Exception as e:
                print(f"Error fetching recent actions.yaml: {e}")
            return {'commits': []}

        def get_recipe_info():
            r_path = resolve_recipe_path(project_id, clean_recipe_id, product_type)
            rec_dates = []
            if r_path:
                try:
                    enc = r_path.replace('/', '%2F')
                    # Blame is sub-second fast (< 0.5s) compared to repository/commits?path (10-15s)
                    blame_res = s.get(
                        f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/repository/files/{enc}/blame',
                        params={'ref': 'master'},
                        timeout=4
                    )
                    if blame_res.ok and isinstance(blame_res.json(), list):
                        seen_ids = set()
                        for b in blame_res.json():
                            c = b.get('commit', {})
                            cid = c.get('id')
                            if cid and cid not in seen_ids:
                                seen_ids.add(cid)
                                dt = c.get('authored_date') or c.get('committed_date')
                                if dt:
                                    rec_dates.append(dt)
                except Exception as e:
                    print(f"Error getting recipe blame: {e}")
            return r_path, rec_dates

        with ThreadPoolExecutor(max_workers=2) as ex:
            f_recent = ex.submit(get_recent_actions)
            f_rec = ex.submit(get_recipe_info)
            res_recent = f_recent.result()
            recipe_file_path, rec_dates = f_rec.result()

        if res_recent.get('auth_error'):
            return jsonify({'success': False, 'message': 'Lỗi xác thực GitLab Token, vui lòng kiểm tra'})

        actual_filename = os.path.basename(recipe_file_path) if recipe_file_path else ''

        # Build search candidate set for matching diff lines in actions.yaml
        search_candidates = {clean_recipe_id.lower()}
        sanitized_id = re.sub(r'[:\\/*?"<>| ]', '_', clean_recipe_id)
        search_candidates.add(sanitized_id.lower())
        search_candidates.add(f"{clean_recipe_id.lower()}.yaml")
        search_candidates.add(f"{sanitized_id.lower()}.yaml")

        if actual_filename:
            search_candidates.add(actual_filename.lower())
            stem = os.path.splitext(actual_filename)[0]
            search_candidates.add(stem.lower())

        actions_commits_map = {}
        for c in res_recent.get('commits', []):
            if c.get('id'):
                actions_commits_map[c.get('id')] = c

        # Step 2: Fetch historical window commits based on recipe blame dates to catch all past versions
        if rec_dates:
            seen_date_keys = set()
            window_list = []
            for dt_str in rec_dates:
                clean_iso = dt_str.split('.')[0].replace('Z', '').split('+')[0]
                try:
                    r_dt = datetime.fromisoformat(clean_iso)
                    dkey = r_dt.strftime('%Y-%m-%d')
                    if dkey not in seen_date_keys:
                        seen_date_keys.add(dkey)
                        since_dt = (r_dt - timedelta(hours=8)).strftime('%Y-%m-%dT%H:%M:%SZ')
                        until_dt = (r_dt + timedelta(hours=10)).strftime('%Y-%m-%dT%H:%M:%SZ')
                        window_list.append((since_dt, until_dt))
                except Exception:
                    pass

            if window_list:
                def fetch_actions_window(w):
                    since_dt, until_dt = w
                    try:
                        url = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/repository/commits'
                        params = {'path': 'actions.yaml', 'since': since_dt, 'until': until_dt, 'per_page': 100}
                        res = s.get(url, params=params, timeout=4)
                        if res.ok and isinstance(res.json(), list):
                            return res.json()
                    except Exception as e:
                        print(f"Error fetching window {since_dt} - {until_dt}: {e}")
                    return []

                with ThreadPoolExecutor(max_workers=min(len(window_list), 10)) as executor:
                    for clist in executor.map(fetch_actions_window, window_list):
                        for c in clist:
                            cid = c.get('id')
                            if cid and cid not in actions_commits_map:
                                actions_commits_map[cid] = c

        # Step 3: Concurrently fetch diffs (with caching) and scan for matches across all commits
        def get_diff_items(cid):
            ckey = (project_id, cid)
            with _actions_diff_lock:
                if ckey in _actions_diff_cache:
                    return _actions_diff_cache[ckey]
            try:
                diff_res = s.get(
                    f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/repository/commits/{cid}/diff',
                    timeout=4
                )
                if diff_res.ok and isinstance(diff_res.json(), list):
                    items = diff_res.json()
                    with _actions_diff_lock:
                        _actions_diff_cache[ckey] = items
                    return items
            except Exception:
                pass
            return []

        def check_diff(commit_item):
            cid = commit_item.get('id')
            if not cid:
                return None
            diff_items = get_diff_items(cid)
            for d in diff_items:
                diff_text = d.get('diff', '')
                for line in diff_text.splitlines():
                    if line.startswith('+') and not line.startswith('+++'):
                        if any(cand in line.lower() for cand in search_candidates):
                            return (commit_item, d, 'add')
            return None

        matched_commits = []
        matched_seen_ids = set()
        all_candidates = list(actions_commits_map.values())
        with ThreadPoolExecutor(max_workers=35) as executor:
            for r in executor.map(check_diff, all_candidates):
                if r:
                    cid = r[0].get('id')
                    if cid and cid not in matched_seen_ids:
                        matched_seen_ids.add(cid)
                        matched_commits.append(r)

        if not matched_commits:
            return jsonify({
                'success': False,
                'message': f'Không tìm thấy commit thêm mới (add) của {clean_recipe_id} trong lịch sử actions.yaml'
            })

        # Step 4: Concurrently fetch Merge Request, Pipeline, and actions.yaml Validation
        def fetch_pipeline(sha):
            if not sha:
                return None
            ckey = (project_id, sha)
            with _actions_pipeline_lock:
                if ckey in _actions_pipeline_cache:
                    return _actions_pipeline_cache[ckey]
            try:
                c_res = s.get(
                    f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/repository/commits/{sha}',
                    timeout=4
                )
                if c_res.ok:
                    cdata = c_res.json()
                    last_p = cdata.get('last_pipeline')
                    status = cdata.get('status') or (last_p.get('status') if last_p else None)
                    web_url = last_p.get('web_url') if last_p else None
                    pid = last_p.get('id') if last_p else None
                    p_info = {
                        'id': pid,
                        'status': status,
                        'web_url': web_url
                    }
                    with _actions_pipeline_lock:
                        _actions_pipeline_cache[ckey] = p_info
                    return p_info
            except Exception as e:
                print(f"Error fetching pipeline for commit {sha}: {e}")
            return None

        def fetch_mr_and_pipeline_details(item):
            c_item, d_item, m_type = item
            cid = c_item.get('id')
            mr_obj = None
            mr_key = (project_id, cid)
            with _actions_mr_lock:
                if mr_key in _actions_mr_cache:
                    mr_obj = _actions_mr_cache[mr_key]
            
            if mr_obj is None:
                try:
                    mr_res = s.get(
                        f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/repository/commits/{cid}/merge_requests',
                        timeout=5
                    )
                    if mr_res.ok:
                        mrs = mr_res.json()
                        if mrs and isinstance(mrs, list) and len(mrs) > 0:
                            mr_obj = mrs[0]
                            with _actions_mr_lock:
                                _actions_mr_cache[mr_key] = mr_obj
                except Exception as e:
                    print(f"Error fetching MR for commit {cid}: {e}")

            edit_sha = mr_obj.get('sha') if (mr_obj and mr_obj.get('sha')) else cid
            merge_sha = mr_obj.get('merge_commit_sha') if mr_obj else None

            pipe_edit = None
            pipe_merge = None
            with ThreadPoolExecutor(max_workers=2) as sub_exec:
                f_edit = sub_exec.submit(fetch_pipeline, edit_sha)
                f_merge = sub_exec.submit(fetch_pipeline, merge_sha)
                pipe_edit = f_edit.result()
                pipe_merge = f_merge.result()

            # Validate actions.yaml content at edit_sha
            val_res = {'is_valid': True, 'errors': [], 'has_indent_error': False}
            val_key = (project_id, edit_sha)
            actions_raw = ''
            with _raw_actions_lock:
                if val_key in _raw_actions_cache:
                    actions_raw = _raw_actions_cache[val_key]
            
            if not actions_raw:
                try:
                    ar_res = s.get(
                        f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/repository/files/actions.yaml/raw',
                        params={'ref': edit_sha},
                        timeout=5
                    )
                    if ar_res.ok:
                        actions_raw = ar_res.text
                        with _raw_actions_lock:
                            _raw_actions_cache[val_key] = actions_raw
                except Exception:
                    actions_raw = ''

            if actions_raw:
                val_res = validate_actions_yaml_content(actions_raw, clean_recipe_id)

            return (c_item, d_item, m_type, mr_obj, pipe_edit, pipe_merge, val_res)

        with ThreadPoolExecutor(max_workers=10) as executor:
            full_matches = list(executor.map(fetch_mr_and_pipeline_details, matched_commits))

        # Sort matched results in reverse chronological order (newest commit first)
        def get_commit_datetime_sort_key(item):
            c_item = item[0]
            return c_item.get('authored_date') or c_item.get('committed_date') or ''

        full_matches.sort(key=get_commit_datetime_sort_key, reverse=True)

        project_web_base = 'https://gitlabce.kenda.com.tw/tc/recipes/kitting' if project_id == 135 else f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}'

        matches_data = []
        for matched_commit, matched_diff, match_type, mr_info, pipe_edit, pipe_merge, val_info in full_matches:
            edit_sha = mr_info.get('sha') if (mr_info and mr_info.get('sha')) else matched_commit.get('id', '')
            edit_short = edit_sha[:8] if edit_sha else ''
            author_name = (mr_info.get('author', {}).get('name') if (mr_info and mr_info.get('author')) else matched_commit.get('author_name', ''))
            author_username = (mr_info.get('author', {}).get('username') if (mr_info and mr_info.get('author')) else '')
            source_branch = mr_info.get('source_branch', '') if mr_info else ''
            target_branch = mr_info.get('target_branch', 'master') if mr_info else 'master'

            merge_sha = mr_info.get('merge_commit_sha', '') if mr_info else ''
            merge_short = merge_sha[:8] if merge_sha else ''
            merged_at = convert_iso_datetime(mr_info.get('merged_at', '')) if (mr_info and mr_info.get('merged_at')) else ''
            merged_by = (mr_info.get('merged_by', {}).get('name') if (mr_info and mr_info.get('merged_by')) else '')

            matches_data.append({
                'match_type': match_type,
                'validation': val_info,
                'commit_edit': {
                    'id': edit_sha,
                    'short_id': edit_short,
                    'title': mr_info.get('title') if mr_info else matched_commit.get('title', ''),
                    'message': matched_commit.get('message', ''),
                    'source_branch': source_branch,
                    'target_branch': target_branch,
                    'author_name': author_name,
                    'author_username': author_username,
                    'authored_date': convert_iso_datetime(matched_commit.get('authored_date', '')) if matched_commit.get('authored_date') else '',
                    'web_url': f"{project_web_base}/-/commit/{edit_sha}" if edit_sha else '',
                    'pipeline': pipe_edit
                },
                'commit_merge': {
                    'id': merge_sha,
                    'short_id': merge_short,
                    'merged_at': merged_at,
                    'merged_by': merged_by,
                    'web_url': f"{project_web_base}/-/commit/{merge_sha}" if merge_sha else '',
                    'pipeline': pipe_merge
                },
                'merge_request': {
                    'id': mr_info.get('id'),
                    'iid': mr_info.get('iid'),
                    'title': mr_info.get('title', ''),
                    'state': mr_info.get('state', ''),
                    'web_url': mr_info.get('web_url', ''),
                    'created_at': convert_iso_datetime(mr_info.get('created_at', '')) if mr_info.get('created_at') else '',
                    'updated_at': convert_iso_datetime(mr_info.get('updated_at', '')) if mr_info.get('updated_at') else '',
                } if mr_info else None,
                'diff': matched_diff.get('diff', '') if matched_diff else '',
                'diff_file': matched_diff.get('new_path', 'actions.yaml') if matched_diff else 'actions.yaml'
            })

        primary = matches_data[0]
        result_data = {
            'recipe_id': clean_recipe_id,
            'actual_filename': actual_filename or f'{clean_recipe_id}.yaml',
            'search_candidates': list(search_candidates),
            'project_id': project_id,
            'match_type': primary['match_type'],
            'commit_edit': primary['commit_edit'],
            'commit_merge': primary['commit_merge'],
            'merge_request': primary['merge_request'],
            'diff': primary['diff'],
            'diff_file': primary['diff_file'],
            'validation': primary['validation'],
            'total_matches_found': len(matches_data),
            'matches': matches_data
        }

        return jsonify({
            'success': True,
            'result': result_data
        })

    except requests.RequestException as e:
        return jsonify({'success': False, 'message': f'Lỗi kết nối GitLab: {str(e)}'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

@app.route('/api/technical-specifications/fetch', methods=['GET', 'POST'])
@login_required
def fetch_technical_specifications():
    force = request.json.get('force', False) if request.is_json and request.json else False
    data = get_technical_specifications_data(force_refresh=force)
    
    if data.get('auth_error'):
        return jsonify({
            'success': False,
            'error_type': 'auth',
            'message': 'Lỗi gitlab token, vui lòng kiểm tra'
        }), 200

    return jsonify({
        'success': True,
        'product_types': data.get('product_types', []),
        'config_map': data.get('config_map', {}),
        'keys_by_product_type': data.get('keys_by_product_type', {}),
        'limitary_hours': data.get('limitary_hours', {}),
        'expdays': data.get('expdays', {}),
        'columns': ['key', 'VN', 'CN', 'TW', 'EN', 'ID']
    })
    
@app.route('/api/barcodes/fetch-original-info', methods=['POST'])
@login_required
def fetch_original_info_by_barcode():

    data = request.get_json() or {}

    resource_id = data.get('resource_id')
    if not resource_id:
        return jsonify({'success': False, 'message': 'Thiếu Resource ID'})
    product_type = data.get('product_type')

    try:
        if product_type:
            query = """
                SELECT
                    mr.id                       AS barcode,
                    cr.detail->>'quantity'      AS quantity,
                    cr.work_date::text          AS work_date,
                    cr.detail->>'shift_group'   AS shift_group,
                    cr.lot_number,
                    cr.station                  AS station,
                    cr.created_at,
                    cr.detail->>'operator_id'   AS created_by
                FROM kvmes.material_resource mr
                JOIN kvmes.collect_record cr 
                    ON cr.resource_oid = mr.oid
                LEFT JOIN kvmes.work_order wo 
                    ON wo.id = TRIM(cr.work_order)::character(20)
                WHERE mr.id = %s
                  AND mr.product_type = %s
                ORDER BY
                    wo.reserved_date DESC NULLS LAST,
                    cr.sequence ASC;
            """
            result, column_names = execute_pg_select_query(query, (resource_id, product_type))
        else:
            query = """
                SELECT
                    mr.id                       AS barcode,
                    cr.detail->>'quantity'      AS quantity,
                    cr.work_date::text          AS work_date,
                    cr.detail->>'shift_group'   AS shift_group,
                    cr.lot_number,
                    cr.station                  AS station,
                    cr.created_at,
                    cr.detail->>'operator_id'   AS created_by
                FROM kvmes.material_resource mr
                JOIN kvmes.collect_record cr 
                    ON cr.resource_oid = mr.oid
                LEFT JOIN kvmes.work_order wo 
                    ON wo.id = TRIM(cr.work_order)::character(20)
                WHERE mr.id = %s
                ORDER BY
                    wo.reserved_date DESC NULLS LAST,
                    cr.sequence ASC;
            """
            result, column_names = execute_pg_select_query(query, (resource_id,))
        if not result:
            return jsonify({'success': False, 'message': 'Lỗi API'})

        convert_columns = ["created_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(row) for row in result]

        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Lỗi: {str(e)}'
        })
    
@app.route('/api/mesync/get-mesync-inbox-events', methods=['POST'])
@login_required
def get_mesync_inbox_events():

    keyword = request.json.get('keyword', '').strip()
    if not keyword:
        return jsonify({'result': [], 'columns': []})

    query = """
        SELECT event_type, payload, status, retry_count, 
            next_retry_at, created_at, last_error
        FROM kvmes.mesync_inbox_events
        WHERE payload::text ILIKE %s
        ORDER BY created_at desc
        LIMIT 200;
    """

    result, column_names = execute_pg_select_query(query, (f"%{keyword}%",))
    if result:
        convert_columns = ["next_retry_at", "created_at"]
        
        new_result = []
        for row in result:
            row_list = list(row)
            for col in convert_columns:
                if col in column_names:
                    idx = column_names.index(col)
                    row_list[idx] = convert_iso_datetime(str(row_list[idx])) if row_list[idx] else None
            new_result.append(tuple(row_list))
        
        serialized_result = [serialize_row(list(row)) for row in new_result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })

@app.route('/api/barcodes/get-station-configuration-list', methods=['POST'])
@login_required
def get_station_configuration_list():
    
    station = request.json.get('station', '').strip()
    
    if not station:
        return jsonify({'result': [], 'columns': []})
    
    query = """
        SELECT station_id, production, ui, updated_at, updated_by
	    FROM kvmes.station_configuration
        WHERE station_id = %s
        LIMIT 100;
    """
    result, column_names = execute_pg_select_query(query, (station, ))
    if result:
        convert_columns = ["updated_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })

@app.route('/api/barcodes/get-prdeba', methods=['POST'])
@login_required
def get_prdeba():

    resource_id = request.json.get('resource_id', '').strip()
    if not resource_id:
        return jsonify({'success': False, 'message': 'Thiếu Resource ID'})

    try:
        query = """
            SELECT
                m_elem->>'station'                 AS machno,
                cr.work_order                      AS mesid,
                mr.product_id                      AS partno,
                wo.information->'plan_quantity'->>'plan_quantity' AS preqty,
                fr_elem->>'resource_id'            AS barcode,
                fr_elem->>'product_id'             AS itnbr,
                fr_elem->>'quantity'               AS mqty,
                mr_res.quantity                    AS qty,
                m_elem->'site'->>'name'            AS purseq,
                to_char(to_timestamp(mr.created_at / 1000000000.0) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI:SS') AS intime,
                to_char(to_timestamp(mr.created_at / 1000000000.0) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMMDD') AS indat,
                mr.created_by                      AS usrno
            FROM kvmes.material_resource mr
            JOIN kvmes.feed_record fr
                ON fr.id = ANY (mr.feed_records_id)
            CROSS JOIN LATERAL jsonb_array_elements(fr.materials) AS m_elem
            CROSS JOIN LATERAL jsonb_array_elements(m_elem->'feed_resources') AS fr_elem
            LEFT JOIN kvmes.collect_record cr
                ON cr.resource_oid = mr.oid
                AND cr.station = m_elem->>'station'
            LEFT JOIN kvmes.work_order wo
                ON TRIM(wo.id) = TRIM(cr.work_order)
            LEFT JOIN kvmes.material_resource mr_res
                ON mr_res.id = fr_elem->>'resource_id'
            WHERE mr.id = %s
                -- AND mr.created_at BETWEEN
                --     (extract(epoch FROM '2026-08-10'::date AT TIME ZONE 'Asia/Ho_Chi_Minh') * 1000000000)::bigint
                --     AND
                --     (extract(epoch FROM ('2026-08-10'::date + 1) AT TIME ZONE 'Asia/Ho_Chi_Minh') * 1000000000)::bigint - 1;
                -- AND mr.product_type = 'BEAD'
                -- AND m_elem->>'station' LIKE '%P8300%'
        """
        result, column_names = execute_pg_select_query(query, (resource_id,))
        serialized_result = [serialize_row(list(row)) for row in result] if result else []
        return jsonify({'success': True, 'result': serialized_result, 'columns': column_names})

    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})


@app.route('/api/barcodes/get-prdebb', methods=['POST'])
@login_required
def get_prdebb():

    resource_id = request.json.get('resource_id', '').strip()
    if not resource_id:
        return jsonify({'success': False, 'message': 'Thiếu Resource ID'})

    try:
        query = """
            SELECT
                mr.info->'production_info'->>'station'   AS machno,
                cr.work_order                            AS mesid,
                mr.id                                    AS barcode,
                mr.product_id                            AS partno,
                mr.quantity                              AS qty,
                to_char(to_timestamp(mr.created_at / 1000000000.0) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI:SS') AS intime,
                to_char(to_timestamp(mr.created_at / 1000000000.0) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMMDD') AS indat,
                mr.updated_by                            AS usrno
            FROM kvmes.material_resource mr
            LEFT JOIN kvmes.collect_record cr
                ON cr.resource_oid = mr.oid
                AND cr.station = mr.info->'production_info'->>'station'
            WHERE mr.id = %s
                -- AND mr.product_type LIKE 'BEAD'
                -- AND mr.info->'production_info'->>'station' LIKE '%P8300%'
                -- AND (to_timestamp(mr.created_at / 1000000000.0) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date 
                --     BETWEEN '2026-08-10'::date AND '2026-08-10'::date
        """
        result, column_names = execute_pg_select_query(query, (resource_id,))
        serialized_result = [serialize_row(list(row)) for row in result] if result else []
        return jsonify({'success': True, 'result': serialized_result, 'columns': column_names})

    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})


@app.route('/api/barcodes/get-prdebc', methods=['POST'])
@login_required
def get_prdebc():

    resource_id = request.json.get('resource_id', '').strip()
    if not resource_id:
        return jsonify({'success': False, 'message': 'Thiếu Resource ID'})

    try:
        query = """
            SELECT
                m_elem->>'station'                 AS machno,
                cr.work_order                      AS mesid,
                mr.id                              AS barcode,
                mr.product_id                      AS partno,
                mr.quantity                        AS qty,
                fr_elem->>'resource_id'            AS bacode,
                fr_elem->>'product_id'             AS itnbr,
                fr_elem->>'quantity'               AS mqty,
                to_char(to_timestamp(mr.created_at / 1000000000.0) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI:SS') AS intime,
                to_char(to_timestamp(mr.created_at / 1000000000.0) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMMDD') AS indat,
                mr.created_by                      AS usrno
            FROM kvmes.material_resource mr
            JOIN kvmes.feed_record fr
                ON fr.id = ANY (mr.feed_records_id)
            CROSS JOIN LATERAL jsonb_array_elements(fr.materials) AS m_elem
            CROSS JOIN LATERAL jsonb_array_elements(m_elem->'feed_resources') AS fr_elem
            LEFT JOIN kvmes.collect_record cr
                ON cr.resource_oid = mr.oid
                AND cr.station = m_elem->>'station'
            LEFT JOIN kvmes.work_order wo
                ON TRIM(wo.id) = TRIM(cr.work_order)
            WHERE mr.id = %s
                -- AND mr.created_at BETWEEN
                --     (extract(epoch FROM '2026-08-10'::date AT TIME ZONE 'Asia/Ho_Chi_Minh') * 1000000000)::bigint
                --     AND
                --     (extract(epoch FROM ('2026-08-10'::date + 1) AT TIME ZONE 'Asia/Ho_Chi_Minh') * 1000000000)::bigint - 1;
                -- AND mr.product_type = 'BEAD'
                -- AND m_elem->>'station' LIKE '%P8300%'
        """
        result, column_names = execute_pg_select_query(query, (resource_id,))
        serialized_result = [serialize_row(list(row)) for row in result] if result else []
        return jsonify({'success': True, 'result': serialized_result, 'columns': column_names})

    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

@app.route('/api/magic-winx/work-order/fetch-collect-records', methods=['POST'])
@login_required
def magic_winx_fetch_collect_records():

    work_order_id = request.json.get('work_order_id', '').strip()
    if not work_order_id:
        return jsonify({'success': False, 'message': 'Thiếu Work Order ID'})

    try:
        # Work order info
        wo_query = """
            SELECT id, recipe_id, process_name, process_type, department_id, status,
                   station, reserved_date::text AS reserved_date, reserved_sequence,
                   information, updated_at, updated_by, created_at, created_by
            FROM kvmes.work_order
            WHERE id = %s
        """
        wo_result, wo_cols = execute_pg_select_query(wo_query, (work_order_id,))
        if not wo_result:
            return jsonify({'success': False, 'message': f'Không tìm thấy work order: {work_order_id}'})

        wo_row = dict(zip(wo_cols, wo_result[0]))

        import json as _json
        information = wo_row.get('information', {})

        if isinstance(information, str):
            information = _json.loads(information)

        product_id = information.get('product_id', '')
        if not product_id:
            parts = wo_row.get('recipe_id', '').split('-')
            product_id = parts[2] if len(parts) >= 3 else wo_row.get('recipe_id', '')

        # Toàn bộ collect_record
        cr_query = """
            SELECT work_order, sequence, lot_number, station, resource_oid,
                   detail, created_at, oid, work_date
            FROM kvmes.collect_record
            WHERE TRIM(work_order) = TRIM(%s)
            ORDER BY sequence ASC
        """
        cr_result, cr_cols = execute_pg_select_query(cr_query, (work_order_id,))

        cr_rows = []
        if cr_result:
            for row in cr_result:
                d = dict(zip(cr_cols, row))
                cr_rows.append({
                    'sequence':     d.get('sequence'),
                    'lot_number':   d.get('lot_number', ''),
                    'station':      d.get('station', ''),
                    'resource_oid': str(d.get('resource_oid', '')),
                    'work_date':    str(d.get('work_date', '')),
                    'created_at':   d.get('created_at'),
                })

        # Distinct lot_numbers để group
        lot_numbers = sorted(set(r['lot_number'] for r in cr_rows if r['lot_number']))

        return jsonify({
            'success':       True,
            'work_order':    wo_row,
            'recipe_id':     wo_row.get('recipe_id', ''),
            'product_id':    product_id,
            'reserved_date': wo_row.get('reserved_date', ''),
            'collect_records': cr_rows,
            'lot_numbers':   lot_numbers,
            'total':         len(cr_rows),
        })

    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

@app.route('/api/magic-winx/collect-record/material-resource-existed', methods=['POST'])
@login_required
def magic_winx_check_material_resource_existed():

    data = request.get_json() or {}
    resource_ids = data.get('resource_ids', [])

    if not resource_ids:
        return jsonify({'success': True, 'existed_oids': []})

    resource_ids = [str(x).strip() for x in resource_ids if x is not None and str(x).strip()]
    resource_ids = list(dict.fromkeys(resource_ids))

    if not resource_ids:
        return jsonify({'success': True, 'existed_oids': []})

    try:
        query = """
            SELECT oid
            FROM kvmes.material_resource
            WHERE oid = ANY(%s)
        """
        result, column_names = execute_pg_select_query(query, (resource_ids,))
        existed_oids = [str(row[0]) for row in result] if result else []

        return jsonify({'success': True, 'existed_oids': existed_oids})

    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})
    
@app.route('/api/magic-winx/prepare-insert-data', methods=['POST'])
@login_required
def magic_winx_prepare():

    data          = request.get_json() or {}
    work_order_id = data.get('work_order_id', '').strip()
    recipe_id     = data.get('recipe_id', '').strip()  
    selected_oids = data.get('selected_oids', [])   # danh sách resource_oid user chọn
    selected_seqs = data.get('selected_seqs', [])   # danh sách sequence tương ứng
    product_id    = data.get('product_id', '').strip()
    reserved_date = data.get('reserved_date', '').strip()

    if not work_order_id or not selected_oids:
        return jsonify({'success': False, 'message': 'Thiếu thông tin đầu vào'})

    try:
        from datetime import datetime, timedelta
        import json as _json

        seq_list = [int(s) for s in selected_seqs if s is not None]
        if not seq_list:
            return jsonify({'success': False, 'message': 'Không có sequence nào được chọn'})

        seq_min = min(seq_list)
        seq_max = max(seq_list)

        # collect_record chỉ lấy các dòng được chọn (theo resource_oid)
        cr_query = """
            SELECT work_order, sequence, lot_number, station, resource_oid,
                   detail, created_at, oid, work_date
            FROM kvmes.collect_record
            WHERE TRIM(work_order) = TRIM(%s)
              AND sequence = ANY(%s)
            ORDER BY sequence ASC
        """
        cr_result, cr_cols = execute_pg_select_query(cr_query, (work_order_id, seq_list))

        # batch — lấy theo khoảng number chứa các sequence đã chọn
        batch_query = """
            SELECT work_order, "number", status,
                   updated_at, updated_by, records_id, records
            FROM kvmes.batch
            WHERE TRIM(work_order) = TRIM(%s)
              AND "number" = ANY(%s)
            ORDER BY "number" ASC
        """
        batch_result, batch_cols = execute_pg_select_query(batch_query, (work_order_id, seq_list))

        # feed_record
        fr_query = """
            SELECT fr.* FROM kvmes.feed_record fr
            WHERE fr.id IN (
                SELECT UNNEST(records_id)
                FROM kvmes.batch
                WHERE TRIM(work_order) = TRIM(%s)
                  AND "number" = ANY(%s)
            )
        """
        fr_result, fr_cols = execute_pg_select_query(fr_query, (work_order_id, seq_list))

        # material_resource (GREEN_TIRE)
        rd = datetime.strptime(reserved_date, '%Y-%m-%d')
        date_from = (rd - timedelta(days=500)).strftime('%Y-%m-%d') + ' 00:00:00'
        date_to   = (rd + timedelta(days=500)).strftime('%Y-%m-%d') + ' 23:59:59'

        mr_query = """
            SELECT oid, id, product_id, product_type, quantity, status, expiry_time,
                   info, warehouse_id, warehouse_location, updated_at, updated_by,
                   created_at, created_by, station, feed_records_id, batch_count, reprint_reason,
                   collected, erp_tire_barcode_synced, standing_time, initial_quantity
            FROM kvmes.material_resource mr
            WHERE mr.product_id LIKE %s AND mr.id like '7%'
              AND LENGTH(mr.id) < 20
              AND mr.product_type = 'GREEN_TIRE'
              AND NOT EXISTS (
                  SELECT 1 FROM kvmes.material_resource mr2
                  WHERE mr2.id = mr.id AND mr2.product_type = 'TIRE'
              )
              AND to_timestamp(mr.created_at / 1000000000.0) AT TIME ZONE 'Asia/Ho_Chi_Minh'
                  BETWEEN %s AND %s
        """
        mr_result, mr_cols = execute_pg_select_query(
            mr_query, (f'%{product_id}%', date_from, date_to)
        )

        cr_count = len(cr_result) if cr_result else 0
        mr_slice = mr_result[:cr_count] if mr_result else []

        # batch map: sequence → feed_record id
        batch_map = {}
        if batch_result:
            for brow in batch_result:
                bdict = dict(zip(batch_cols, brow))
                rids  = bdict.get('records_id') or []
                batch_map[int(bdict['number'])] = rids[0] if rids else None

        # Build insert rows
        insert_rows = []
        for i, cr_row in enumerate(cr_result or []):
            cr_dict  = dict(zip(cr_cols, cr_row))
            mr_dict  = dict(zip(mr_cols, mr_slice[i])) if i < len(mr_slice) else {}
            sequence = int(cr_dict.get('sequence', 0))
            fr_id    = batch_map.get(sequence)

            production_time = cr_dict.get('created_at')

            info = {
                "unit": "",
                "grade": "",
                "remark": "",
                "purchase": {
                    "item_no": "",
                    "order_no": "",
                    "delivery_count": ""
                },
                "change_log": None,
                "lot_number": str(cr_dict.get('lot_number') or ""),
                "min_dosage": "0",
                "hold_reason": 0,
                "inspections": None,
                "deferrals_count": 0,
                "production_info": {
                    "station": str(cr_dict.get('station') or ""),
                    "recipe_id": recipe_id,
                    "next_station": "",
                    "process_name": "Tire-building",
                    "process_type": "PRODUCE",
                    "production_time": production_time
                },
                "planned_quantity": "0",
                "additional_fields": None
            }

            insert_rows.append({
                '_sequence':              sequence,
                'oid':                    str(cr_dict.get('resource_oid', '')),
                'id':                     str(mr_dict.get('id', '')),
                'product_id':             product_id,
                'product_type':           'TIRE',
                'quantity':               1.0,
                'status':                 3,
                'expiry_time':            mr_dict.get('expiry_time'),
                'info':                   info,
                'warehouse_id':           ' ',
                'warehouse_location':     ' ',
                'updated_at':             mr_dict.get('updated_at'),
                'updated_by':             'p8500',
                'created_at':             mr_dict.get('created_at'),
                'created_by':             mr_dict.get('created_by'),
                'station':                str(cr_dict.get('station', '')),
                'feed_records_id':        f'{{{fr_id}}}' if fr_id else '{}',
                'batch_count':            0,
                'reprint_reason':         0,
                'collected':              True,
                'erp_tire_barcode_synced': False,
                'standing_time':          mr_dict.get('standing_time'),
                'initial_quantity':       1,
            })

        return jsonify({
            'success':       True,
            'insert_rows':   insert_rows,
            'product_id':    product_id,
            'reserved_date': reserved_date,
            'cr_count':      cr_count,
            'mr_count':      len(mr_result) if mr_result else 0,
        })

    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

@app.route('/api/magic-winx/insert-material', methods=['POST'])
@login_required
def magic_winx_execute():

    data        = request.get_json() or {}

    default_cols_order = [
            'oid', 'id', 'product_id', 'product_type', 'quantity', 'status',
            'expiry_time', 'info', 'warehouse_id', 'warehouse_location',
            'updated_at', 'updated_by', 'created_at', 'created_by', 'station',
            'feed_records_id', 'batch_count', 'reprint_reason', 'collected',
            'erp_tire_barcode_synced', 'standing_time', 'initial_quantity']
    
    insert_rows = data.get('insert_rows', [])

    if isinstance(insert_rows, dict):
        insert_rows = [insert_rows]

    if not isinstance(insert_rows, list) or not insert_rows:
        return jsonify({
            'success': False,
            'message': 'Không có dữ liệu để insert'
        })

    normalized_rows = []

    for original_row in insert_rows:

        if not isinstance(original_row, dict):
            continue

        row = dict(original_row)

        is_special_bead_wire = bool(
            row.get('_special_bead_wire')
        )

        if (
            is_special_bead_wire
            and str(row.get('id') or '').startswith('7')
            and float(row.get('quantity') or 0) > 1
        ):
            if not row.get('oid'):
                row['oid'] = str(uuid.uuid4())

        info_val = row.get('info')

        if isinstance(info_val, dict):
            row['info'] = json.dumps(
                info_val,
                ensure_ascii=False
            )

        normalized_rows.append(row)

    if not normalized_rows:
        return jsonify({
            'success': False,
            'message': 'Không có dòng dữ liệu hợp lệ để insert'
        })

    cols_order = [
        c
        for c in default_cols_order
        if any(c in row for row in normalized_rows)
    ]

    if not cols_order:
        return jsonify({
            'success': False,
            'message': 'Không xác định được column để insert'
        })

    placeholders = ', '.join(['%s'] * len(cols_order))
    insert_sql = f"""
        INSERT INTO kvmes.material_resource ({', '.join(cols_order)})
        VALUES ({placeholders})
    """

    try:
        inserted = 0
        errors   = []
        with get_pg_connection() as conn:
            with conn.cursor() as cursor:
                for i, row in enumerate(normalized_rows):
                    vals = tuple(row.get(c) for c in cols_order)
                    try:
                        cursor.execute(insert_sql, vals)
                        inserted += 1
                    except Exception as row_err:
                        errors.append({'row': i + 1, 'error': str(row_err)})
                        conn.rollback()
            conn.commit()

        return jsonify({
            'success':  True,
            'inserted': inserted,
            'errors':   errors,
            'message':  f'Insert thành công {inserted}/{len(normalized_rows)} dòng'
        })

    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi kết nối DB: {str(e)}'})
    
@app.route('/api/magic-winx/update-feed-record-material', methods=['POST'])
@login_required
def magic_winx_update():

    data = request.get_json() or {}

    work_order_id = data.get('work_order_id', '').strip()
    updates = data.get('updates', [])

    if not work_order_id:
        return jsonify({
            'success': False,
            'message': 'Thiếu Work Order ID'
        })

    if not updates:
        return jsonify({
            'success': False,
            'message': 'Không có dữ liệu cần update'
        })

    try:
        import json as _json

        updated = 0
        errors = []

        with get_pg_connection() as conn:
            cursor = conn.cursor()

            for item in updates:
                sequence = item.get('sequence')
                new_resource_id = str(item.get('new_resource_id') or '').strip()
                station = str(item.get('station') or '').strip()

                if sequence is None:
                    errors.append({'sequence': sequence, 'error': 'Thiếu sequence'})
                    continue

                if not new_resource_id:
                    errors.append({'sequence': sequence, 'error': 'Thiếu new_resource_id'})
                    continue

                try:
                    sequence = int(sequence)

                    find_sql = """
                        SELECT fr.id, fr.materials
                        FROM kvmes.feed_record fr
                        WHERE fr.id IN (
                            SELECT UNNEST(records_id)
                            FROM kvmes.batch
                            WHERE TRIM(work_order) = TRIM(%s)
                              AND "number" = %s
                        )
                    """

                    cursor.execute(find_sql, (work_order_id, sequence))
                    feed_rows = cursor.fetchall()

                    if not feed_rows:
                        errors.append({'sequence': sequence, 'error': 'Không tìm thấy feed_record'})
                        continue

                    sequence_updated = False

                    for feed_id, materials in feed_rows:
                        if materials is None:
                            continue

                        if isinstance(materials, str):
                            materials = _json.loads(materials)

                        if not isinstance(materials, list):
                            continue

                        changed = False

                        for material in materials:
                            if not isinstance(material, dict):
                                continue

                            material_station = str(material.get('station') or '').strip()
                            if station and material_station != station:
                                continue

                            feed_resources = material.get('feed_resources', [])
                            if not isinstance(feed_resources, list):
                                continue

                            for feed_resource in feed_resources:
                                if not isinstance(feed_resource, dict):
                                    continue

                                if feed_resource.get('product_type') != 'GREEN_TIRE':
                                    continue

                                old_resource_id = feed_resource.get('resource_id')
                                if not old_resource_id:
                                    continue

                                feed_resource['resource_id'] = new_resource_id
                                changed = True

                        if changed:
                            update_sql = """
                                UPDATE kvmes.feed_record
                                SET materials = %s
                                WHERE id = %s
                            """
                            cursor.execute(update_sql, (_json.dumps(materials, ensure_ascii=False), feed_id))
                            updated += 1
                            sequence_updated = True

                    if not sequence_updated:
                        errors.append({'sequence': sequence, 'error': 'Không tìm thấy GREEN_TIRE phù hợp để update'})

                except Exception as row_err:
                    errors.append({'sequence': sequence, 'error': str(row_err)})

            conn.commit()

        return jsonify({
            'success': True,
            'updated': updated,
            'errors': errors,
            'message': (
                f'Update thành công '
                f'{updated}/{len(updates)} feed_record'
            )
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Lỗi update: {str(e)}'
        })

@app.route('/api/magic-winx/update-green-tire-quantity', methods=['POST'])
@login_required
def magic_winx_magic():
    API_NAME = 'update-green-tire-quantity'
    try:
        data = request.get_json() or {}
        ids = data.get('ids', [])
        if not ids:
            return jsonify({
                'success': False,
                'api': API_NAME,
                'message': f'{API_NAME} lỗi: Không có ID nào được gửi lên'
            })

        ids = [
            str(x).strip()
            for x in ids
            if x is not None and str(x).strip()
        ]

        ids = list(dict.fromkeys(ids))
        if not ids:
            return jsonify({
                'success': False,
                'api': API_NAME,
                'message': f'{API_NAME} lỗi: Danh sách ID rỗng sau khi xử lý'
            })

        mr_query = """
            SELECT *
            FROM kvmes.material_resource
            WHERE id = ANY(%s)
              AND product_type = 'GREEN_TIRE'
        """

        mr_result, mr_cols = execute_pg_select_query(
            mr_query,
            (ids,)
        )

        found_count = len(mr_result) if mr_result else 0
        requested_count = len(ids)

        if found_count != requested_count:
            found_ids = set()
            if mr_result:
                id_index = mr_cols.index('id')
                for row in mr_result:
                    found_ids.add(str(row[id_index]).strip())

            missing_ids = [
                x for x in ids
                if x not in found_ids
            ]

            return jsonify({
                'success': False,
                'api': API_NAME,
                'message': (
                    f'{API_NAME} lỗi: '
                    f'Số lượng GREEN_TIRE không khớp. '
                    f'Yêu cầu {requested_count} ID, '
                    f'nhưng tìm thấy {found_count} dòng.'
                ),
                'requested_count': requested_count,
                'found_count': found_count,
                'missing_ids': missing_ids
            })

        update_query = """
            UPDATE kvmes.material_resource
            SET quantity = 0
            WHERE id = ANY(%s)
              AND product_type = 'GREEN_TIRE'
        """

        try:
            update_result = execute_pg_update_query(
                update_query,
                (ids,)
            )
        except Exception as update_error:

            return jsonify({
                'success': False,
                'api': API_NAME,
                'message': (
                    f'{API_NAME} lỗi khi UPDATE quantity = 0: '
                    f'{str(update_error)}'
                ),
                'requested_count': requested_count,
                'found_count': found_count
            })

        return jsonify({
            'success': True,
            'api': API_NAME,
            'message': (
                f'{API_NAME} thành công. '
                f'Đã update quantity = 0 cho '
                f'{found_count} GREEN_TIRE.'
            ),
            'requested_count': requested_count,
            'found_count': found_count,
            'updated_count': found_count,
            'ids': ids
        })

    except Exception as e:

        return jsonify({
            'success': False,
            'api': API_NAME,
            'message': f'{API_NAME} lỗi: {str(e)}'
        })

@app.route('/api/magic-winx/check-work-orders-bulk', methods=['POST'])
@login_required
def magic_winx_check_work_orders_bulk():

    data = request.get_json() or {}
    work_order_ids = data.get('work_order_ids', [])

    if not work_order_ids:
        return jsonify({'success': False, 'message': 'Danh sách Work Order rỗng'})

    work_order_ids = [str(x).strip() for x in work_order_ids if x is not None and str(x).strip()]
    work_order_ids = list(dict.fromkeys(work_order_ids))

    if not work_order_ids:
        return jsonify({'success': False, 'message': 'Danh sách Work Order rỗng sau khi xử lý'})

    columns = ['work_order', 'cr_count', 'mr_count']
    result = []

    query = """
        WITH params AS (
            SELECT TRIM(x) AS work_order
            FROM unnest(%s::text[]) AS x
        ),

        cr_counts AS (
            SELECT
                TRIM(cr.work_order) AS work_order,
                COUNT(*) AS collect_record_count
            FROM kvmes.collect_record cr
            JOIN params p
                ON TRIM(cr.work_order) = p.work_order
            GROUP BY TRIM(cr.work_order)
        ),

        batch_data AS (
            SELECT
                TRIM(b.work_order) AS work_order,
                b.records_id
            FROM kvmes.batch b
            JOIN params p
                ON TRIM(b.work_order) = p.work_order
        ),

        batch_counts AS (
            SELECT
                work_order,
                COUNT(*) AS batch_count
            FROM batch_data
            GROUP BY work_order
        ),

        feed_counts AS (
            SELECT
                bd.work_order,
                COUNT(*) AS feed_record_count
            FROM batch_data bd
            CROSS JOIN LATERAL unnest(bd.records_id) AS fr_id
            JOIN kvmes.feed_record fr
                ON fr.id = fr_id
            GROUP BY bd.work_order
        ),

        mr_counts AS (
            SELECT
                TRIM(cr.work_order) AS work_order,
                COUNT(*) AS material_resource_count
            FROM kvmes.collect_record cr
            JOIN params p
                ON TRIM(cr.work_order) = p.work_order
            JOIN kvmes.material_resource mr
                ON mr.oid = cr.resource_oid
            GROUP BY TRIM(cr.work_order)
        )

        SELECT
            p.work_order,
            COALESCE(cr.collect_record_count, 0) AS collect_record_count,
            COALESCE(bc.batch_count, 0) AS batch_count,
            COALESCE(fc.feed_record_count, 0) AS feed_record_count,
            COALESCE(mc.material_resource_count, 0) AS material_resource_count
        FROM params p
        LEFT JOIN cr_counts cr
            ON cr.work_order = p.work_order
        LEFT JOIN batch_counts bc
            ON bc.work_order = p.work_order
        LEFT JOIN feed_counts fc
            ON fc.work_order = p.work_order
        LEFT JOIN mr_counts mc
            ON mc.work_order = p.work_order
        ORDER BY p.work_order;
    """


    wo_result, wo_cols = execute_pg_select_query(query, (work_order_ids,))

    result = []
    total_collect_record = 0
    total_batch = 0
    total_feed_record = 0
    total_material_resource = 0

    for row_data in wo_result:
        row = dict(zip(wo_cols, row_data))

        wo_id = row['work_order']

        cr_count = row['collect_record_count'] or 0
        batch_count = row['batch_count'] or 0
        feed_count = row['feed_record_count'] or 0
        mr_count = row['material_resource_count'] or 0

        total_collect_record += cr_count
        total_batch += batch_count
        total_feed_record += feed_count
        total_material_resource += mr_count

        if cr_count != mr_count:
            result.append([
                wo_id,
                cr_count,
                mr_count
            ])

    return jsonify({
        'success': True,
        'result': result,
        'columns': columns,
        'summary': {
            'collect_record': total_collect_record,
            'batch': total_batch,
            'feed_record': total_feed_record,
            'material_resource': total_material_resource
        }
    })

@app.route('/api/magic-winx/prepare-material-resource', methods=['POST'])
@login_required
def magic_winx_prepare_material_resource():

    data = request.get_json() or {}
    raw_input = data.get('raw_input', '').strip()

    id_val = str(data.get('id') or '').strip()
    product_id_val = str(data.get('product_id') or '').strip()
    station_val = str(data.get('station') or '').strip()
    quantity_val = data.get('quantity')
    lot_number_val = str(data.get('lot_number') or '').strip()
    created_at_val = str(data.get('created_at') or '').strip()
    expiry_time_val = str(data.get('expiry_time') or '').strip()
    created_by_val = str(data.get('created_by') or '').strip()


    special_bead_wire = bool(data.get('special_bead_wire'))

    try:
        special_qty = float(quantity_val)
    except (ValueError, TypeError):
        special_qty = 0.0

    is_special_bead_wire = (
        id_val.startswith('7') and
        special_qty > 1
    )

    if special_bead_wire or is_special_bead_wire:
        if (
            not id_val or
            not product_id_val or
            quantity_val is None or
            str(quantity_val).strip() == '' or
            not created_at_val or
            not expiry_time_val
        ):
            return jsonify({
                'success': False,
                'message': (
                    'Trường hợp BEAD_WIRE yêu cầu: '
                    'id, product_id, quantity, created_at, expiry_time'
                )
            })
        
        if not id_val.startswith('7'):
            return jsonify({
                'success': False,
                'message': 'BEAD_WIRE special case yêu cầu ID phải bắt đầu bằng 7'
            })

        if special_qty <= 1:
            return jsonify({
                'success': False,
                'message': 'BEAD_WIRE special case yêu cầu quantity > 1'
            })

        tz_vn = pytz.timezone('Asia/Ho_Chi_Minh')
        def parse_special_datetime(dt_str):
            if not dt_str:
                return None

            s = str(dt_str).strip()
            if s.isdigit():
                if len(s) >= 19:
                    return int(s)
                elif len(s) >= 13:
                    return int(s) * 1_000_000
                elif len(s) >= 10:
                    return int(s) * 1_000_000_000

            fmts = [
                '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%d %H:%M:%S.%f',
                '%Y-%m-%d %H:%M',
                '%Y/%m/%d %H:%M:%S',
                '%Y/%m/%d %H:%M:%S.%f',
                '%Y/%m/%d %H:%M',
                '%Y-%m-%dT%H:%M:%S',
                '%Y-%m-%dT%H:%M:%S.%f',
                '%Y-%m-%dT%H:%M:%SZ',
                '%Y-%m-%d',
                '%Y/%m/%d'
            ]

            for fmt in fmts:
                try:
                    return datetime.strptime(s, fmt)
                except ValueError:
                    continue

            return None

        parsed_created = parse_special_datetime(created_at_val)

        if isinstance(parsed_created, int):
            created_at_ns = parsed_created

        elif isinstance(parsed_created, datetime):
            created_dt_vn = (
                tz_vn.localize(parsed_created)
                if parsed_created.tzinfo is None
                else parsed_created.astimezone(tz_vn)
            )

            created_at_ns = (
                int(created_dt_vn.timestamp()) * 1_000_000_000
                + created_dt_vn.microsecond * 1000
            )

        else:
            return jsonify({
                'success': False,
                'message': f'Định dạng created_at không hợp lệ: {created_at_val}'
            })

        parsed_expiry = parse_special_datetime(expiry_time_val)

        if isinstance(parsed_expiry, int):
            expiry_time_ns = parsed_expiry

        elif isinstance(parsed_expiry, datetime):
            expiry_dt_vn = (
                tz_vn.localize(parsed_expiry)
                if parsed_expiry.tzinfo is None
                else parsed_expiry.astimezone(tz_vn)
            )

            expiry_time_ns = (
                int(expiry_dt_vn.timestamp()) * 1_000_000_000
                + expiry_dt_vn.microsecond * 1000
            )

        else:
            return jsonify({
                'success': False,
                'message': f'Định dạng expiry_time không hợp lệ: {expiry_time_val}'
            })

        info_dict = {
            "unit": "",
            "grade": "B",
            "remark": "",
            "purchase": {
                "item_no": "05",
                "order_no": "V603081",
                "delivery_count": "01"
            }
        }

        generated_oid = str(uuid.uuid4())

        preview_row = {
            'oid': generated_oid,
            'id': id_val,
            'product_id': product_id_val,
            'product_type': 'BEAD_WIRE',
            'quantity': special_qty,
            'status': 1,
            'expiry_time': expiry_time_ns,
            'info': info_dict,
            'warehouse_id': ' ',
            'warehouse_location': ' ',
            'updated_at': created_at_ns,
            'updated_by': '鄧氏化',
            'created_at': created_at_ns,
            'created_by': '鄧氏化',
            'station': ' ',
            'feed_records_id': '{}',
            'batch_count': 0,
            'reprint_reason': 0,
            'collected': False,
            'erp_tire_barcode_synced': False,

            'staning_time': 0,
            'initial_quantity': special_qty
        }

        return jsonify({
            'success': True,
            'preview_row': preview_row,
            'work_order': None,
            'recipe_id': None,
            'special_bead_wire': True,
            'message': (
                f'Chuẩn bị preview BEAD_WIRE thành công cho ID = {id_val}'
            )
        })
    
    if raw_input and (not id_val or not product_id_val or not station_val):
        parts = []
        if ',' in raw_input:
            parts = [p.strip() for p in raw_input.split(',')]
        elif '\t' in raw_input:
            parts = [p.strip() for p in raw_input.split('\t')]
        elif ';' in raw_input:
            parts = [p.strip() for p in raw_input.split(';')]
        elif '|' in raw_input:
            parts = [p.strip() for p in raw_input.split('|')]
        else:
            parts = [p.strip() for p in raw_input.split()]
            if len(parts) == 10:
                parts = [
                    parts[0], parts[1], parts[2], parts[3], parts[4],
                    f"{parts[5]} {parts[6]}",
                    f"{parts[7]} {parts[8]}",
                    parts[9]
                ]
        if len(parts) >= 8:
            id_val = parts[0]
            product_id_val = parts[1]
            station_val = parts[2]
            quantity_val = parts[3]
            lot_number_val = parts[4]
            created_at_val = parts[5]
            expiry_time_val = parts[6]
            created_by_val = parts[7]

    if not id_val or not product_id_val or not station_val or quantity_val is None or quantity_val == '' or not lot_number_val or not created_at_val or not expiry_time_val or not created_by_val:
        return jsonify({
            'success': False,
            'message': 'Vui lòng nhập đầy đủ: id, product_id, station, quantity, lot_number, created_at, expiry_time, created_by'
        })

    try:
        # Xử lý trước giá trị quantity dưới dạng số để so sánh
        try:
            qty_num = float(quantity_val)
        except (ValueError, TypeError):
            qty_num = 0.0

        # Bước 1: Query work_order
        wo_query = """
            SELECT id, recipe_id
            FROM kvmes.work_order wo
            WHERE wo.recipe_id LIKE %s
              AND wo.station LIKE %s
              AND (wo.reserved_date::date = '2026-08-23'::date OR wo.reserved_date::text LIKE '2026-08-24%')
            ORDER BY wo.updated_at DESC;
        """
        wo_result, wo_cols = execute_pg_select_query(wo_query, (f"%{product_id_val}%", f"%{station_val}%"))
        if not wo_result:
            return jsonify({
                'success': False,
                'message': f'Không tìm thấy Work Order phù hợp với recipe_id LIKE "%{product_id_val}%", station LIKE "%{station_val}%" và reserved_date = "2026-08-24"'
            })

        selected_wo_row = None

        if len(wo_result) > 1:
            for row_data in wo_result:
                r_dict = dict(zip(wo_cols, row_data))
                candidate_wo_id = r_dict.get('id')
                if not candidate_wo_id:
                    continue

                check_mr_query = """
                    SELECT COUNT(*) FROM kvmes.material_resource
                    WHERE oid IN (
                        SELECT resource_oid 
                        FROM kvmes.collect_record 
                        WHERE TRIM(work_order) = TRIM(%s)
                        ORDER BY "sequence" ASC
                    )
                """
                mr_check_result, _ = execute_pg_select_query(check_mr_query, (candidate_wo_id,))
                mr_count = mr_check_result[0][0] if mr_check_result and mr_check_result[0] else 0

                check_cr_query = """
                    SELECT COUNT(*)
                    FROM kvmes.collect_record
                    where TRIM(work_order) = TRIM(%s);
                """
                cr_check_result, _ = execute_pg_select_query(check_cr_query, (candidate_wo_id,))
                cr_count = cr_check_result[0][0] if cr_check_result and cr_check_result[0] else 0

                if cr_count != mr_count:
                    selected_wo_row = r_dict
                    break

            if not selected_wo_row:
                return jsonify({
                    'success': False,
                    'message': f'Tìm thấy {len(wo_result)} Work Order nhưng tất cả đều đã có đủ dữ liệu trong bảng material_resource'
                })
        else:
            selected_wo_row = dict(zip(wo_cols, wo_result[0]))

        recipe_id = selected_wo_row.get('recipe_id')
        work_order_id = selected_wo_row.get('id')

        if not recipe_id or not work_order_id:
            return jsonify({
                'success': False,
                'message': 'Không lấy được recipe_id hoặc id từ kết quả truy vấn work_order'
            })

        # Bước 2: Query recipe_process_definition
        rpd_query = """
            SELECT oid, recipe_id, name, type, configs, product_id, product_type, limitary_hour
            FROM kvmes.recipe_process_definition
            WHERE recipe_id = %s
            LIMIT 1;
        """
        rpd_result, rpd_cols = execute_pg_select_query(rpd_query, (recipe_id,))
        if not rpd_result:
            return jsonify({
                'success': False,
                'message': f'Không tìm thấy recipe_process_definition cho recipe_id = "{recipe_id}"'
            })

        rpd_row = dict(zip(rpd_cols, rpd_result[0]))
        rpd_recipe_id = rpd_row.get('recipe_id') or recipe_id
        rpd_name = rpd_row.get('name') or ''
        rpd_type = rpd_row.get('type') or ''
        rpd_product_type = rpd_row.get('product_type') or ''

        # Bước 3: Query collect_record
        cr_query = """
            SELECT work_order, sequence, lot_number, station, resource_oid, detail, 
                   created_at, oid, work_date
            FROM kvmes.collect_record
            WHERE TRIM(work_order) = TRIM(%s)
              AND (detail->>'quantity')::numeric = %s
              AND resource_oid NOT IN (
                  SELECT oid 
                  FROM kvmes.material_resource 
                  WHERE oid IN (
                      SELECT resource_oid 
                      FROM kvmes.collect_record 
                      WHERE TRIM(work_order) = TRIM(%s)
                  )
              )
            ORDER BY "sequence" ASC
            LIMIT 1;
        """
        cr_params = (work_order_id, qty_num, work_order_id)
        cr_result, cr_cols = execute_pg_select_query(cr_query, cr_params)
        if not cr_result:
            return jsonify({
                'success': False,
                'message': f'Không tìm thấy collect_record cho work_order = "{work_order_id}"'
            })

        cr_row = dict(zip(cr_cols, cr_result[0]))
        resource_oid = str(cr_row.get('resource_oid') or '')
        if not resource_oid:
            return jsonify({
                'success': False,
                'message': f'collect_record không có resource_oid cho work_order = "{work_order_id}"'
            })

        # Bước 4: Query batch
        batch_query = """
            SELECT work_order, "number", status, updated_at, updated_by, records_id, records
            FROM kvmes.batch
            WHERE TRIM(work_order) = TRIM(%s)
            ORDER BY "number" ASC;
        """
        batch_result, batch_cols = execute_pg_select_query(batch_query, (work_order_id,))

        # Bước 5: Query feed_record
        fr_query = """
            SELECT fr.* FROM kvmes.feed_record fr
            WHERE fr.id IN (
                SELECT UNNEST(b.records_id)
                FROM kvmes.batch b
                WHERE TRIM(b.work_order) = TRIM(%s)
                ORDER BY "number" ASC
            )
            LIMIT 1;
        """
        fr_result, fr_cols = execute_pg_select_query(fr_query, (work_order_id,))
        feed_record_id = ""
        if fr_result:
            fr_row = dict(zip(fr_cols, fr_result[0]))
            feed_record_id = str(fr_row.get('id') or '')

        # Xử lý thời gian và định dạng nano second (19 số)
        tz_vn = pytz.timezone('Asia/Ho_Chi_Minh')

        def parse_input_datetime(dt_str):
            if not dt_str:
                return None
            s = str(dt_str).strip()
            if s.isdigit():
                if len(s) >= 19:
                    return int(s)
                elif len(s) >= 13:
                    return int(s) * 1_000_000
                elif len(s) >= 10:
                    return int(s) * 1_000_000_000

            fmts = [
                '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%d %H:%M:%S.%f',
                '%Y-%m-%d %H:%M',
                '%Y/%m/%d %H:%M:%S',
                '%Y/%m/%d %H:%M:%S.%f',
                '%Y/%m/%d %H:%M',
                '%Y-%m-%dT%H:%M:%S',
                '%Y-%m-%dT%H:%M:%S.%f',
                '%Y-%m-%dT%H:%M:%SZ',
                '%Y-%m-%d',
                '%Y/%m/%d'
            ]
            for fmt in fmts:
                try:
                    return datetime.strptime(s, fmt)
                except ValueError:
                    continue
            return None

        parsed_expiry = parse_input_datetime(expiry_time_val)
        if isinstance(parsed_expiry, int):
            expiry_time_ns = parsed_expiry
        elif isinstance(parsed_expiry, datetime):
            dt_vn = tz_vn.localize(parsed_expiry) if parsed_expiry.tzinfo is None else parsed_expiry.astimezone(tz_vn)
            expiry_time_ns = int(dt_vn.timestamp()) * 1_000_000_000 + (dt_vn.microsecond * 1000)
        else:
            return jsonify({'success': False, 'message': f'Định dạng expiry_time không hợp lệ: {expiry_time_val}'})

        parsed_created = parse_input_datetime(created_at_val)
        if isinstance(parsed_created, int):
            created_at_ns = parsed_created
            created_dt_vn = datetime.fromtimestamp(created_at_ns / 1_000_000_000.0, tz=tz_vn)
        elif isinstance(parsed_created, datetime):
            created_dt_vn = tz_vn.localize(parsed_created) if parsed_created.tzinfo is None else parsed_created.astimezone(tz_vn)
            created_at_ns = int(created_dt_vn.timestamp()) * 1_000_000_000 + (created_dt_vn.microsecond * 1000)
        else:
            return jsonify({'success': False, 'message': f'Định dạng created_at không hợp lệ: {created_at_val}'})

        created_dt_utc = created_dt_vn.astimezone(timezone.utc)
        production_time_str = created_dt_utc.strftime('%Y-%m-%dT%H:%M:%S') + f'.{created_dt_vn.microsecond:06d}000Z'

        # Xây dựng JSON cho cột info
        info_dict = {
            "unit": "",
            "grade": "",
            "remark": "",
            "purchase": {
                "item_no": "",
                "order_no": "",
                "delivery_count": ""
            },
            "change_log": None,
            "lot_number": lot_number_val,
            "min_dosage": "0",
            "hold_reason": 0,
            "inspections": None,
            "deferrals_count": 0,
            "production_info": {
                "station": station_val,
                "recipe_id": rpd_recipe_id,
                "next_station": "",
                "process_name": rpd_name,
                "process_type": rpd_type,
                "production_time": production_time_str
            },
            "planned_quantity": "0",
            "additional_fields": None,
            "is_special_approved": False,
            "inspection_serial_number": ""
        }

        try:
            qty_num = float(quantity_val)
        except (ValueError, TypeError):
            qty_num = 0.0

        feed_records_id_param = f"{{{feed_record_id}}}" if feed_record_id else "{}"

        preview_row = {
            'oid': resource_oid,
            'id': id_val,
            'product_id': product_id_val,
            'product_type': rpd_product_type,
            'quantity': qty_num,
            'status': 1,
            'expiry_time': expiry_time_ns,
            'info': info_dict,
            'warehouse_id': ' ',
            'warehouse_location': ' ',
            'updated_at': created_at_ns,
            'updated_by': created_by_val,
            'created_at': created_at_ns,
            'created_by': created_by_val,
            'station': ' ',
            'feed_records_id': feed_records_id_param,
            'batch_count': 0,
            'reprint_reason': 0,
            'collected': True,
            'erp_tire_barcode_synced': False,
            'standing_time': created_at_ns,
            'initial_quantity': 0
        }

        return jsonify({
            'success': True,
            'preview_row': preview_row,
            'work_order': work_order_id,
            'recipe_id': rpd_recipe_id,
            'message': f'Chuẩn bị dữ liệu preview thành công cho ID = {id_val}'
        })

    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi thực thi: {str(e)}'})

@app.route('/api/magic-winx/insert-material-resource', methods=['POST'])
@login_required
def magic_winx_insert_material_resource():

    data = request.get_json() or {}

    cols_order = [
        'oid', 'id', 'product_id', 'product_type', 'quantity', 'status',
        'expiry_time', 'info', 'warehouse_id', 'warehouse_location',
        'updated_at', 'updated_by', 'created_at', 'created_by', 'station',
        'feed_records_id', 'batch_count', 'reprint_reason', 'collected',
        'erp_tire_barcode_synced', 'standing_time', 'initial_quantity'
    ]

    insert_row = data.get('insert_row')

    if insert_row and isinstance(insert_row, dict):
        row = dict(insert_row)
        info_val = row.get('info')
        if isinstance(info_val, dict):
            row['info'] = json.dumps(info_val, ensure_ascii=False)

        vals = tuple(row.get(c) for c in cols_order)
        id_val = str(row.get('id') or '')
    else:
        # Nếu gọi trực tiếp thì chạy prepare trước
        prep_res = magic_winx_prepare_material_resource()
        if hasattr(prep_res, 'get_json'):
            prep_data = prep_res.get_json()
        else:
            prep_data = prep_res[0].get_json() if isinstance(prep_res, tuple) else {}

        if not prep_data.get('success'):
            return prep_res

        row = dict(prep_data.get('preview_row') or {})
        info_val = row.get('info')
        if isinstance(info_val, dict):
            row['info'] = json.dumps(info_val, ensure_ascii=False)

        vals = tuple(row.get(c) for c in cols_order)
        id_val = str(row.get('id') or '')

    insert_sql = f"""
        INSERT INTO kvmes.material_resource ({', '.join(cols_order)})
        VALUES ({', '.join(['%s'] * len(cols_order))})
    """

    try:
        with get_pg_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(insert_sql, vals)
            conn.commit()

        return jsonify({
            'success': True,
            'message': f'Insert thành công material_resource với ID = {id_val}',
            'inserted_id': id_val
        })

    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi khi Insert vào kvmes.material_resource: {str(e)}'})

# ==============================================================================
# OCR IMAGE-TO-TEXT ENGINE (RAPIDOCR / PADDLEOCR ONNX AI ENGINE)
# ==============================================================================
import sys
_current_dir = os.path.dirname(os.path.abspath(__file__))
_ocr_libs_dir = os.path.join(_current_dir, 'ocr_libs')

import io
from PIL import Image
import numpy as np

_rapid_ocr_engine = None
_ocr_init_error = None
_ocr_lock = threading.Lock()

def get_rapid_ocr_engine():
    global _rapid_ocr_engine, _ocr_init_error
    if _rapid_ocr_engine is not None:
        return _rapid_ocr_engine, None
    with _ocr_lock:
        if _rapid_ocr_engine is not None:
            return _rapid_ocr_engine, None
        try:
            from rapidocr_onnxruntime import RapidOCR
            _rapid_ocr_engine = RapidOCR(Det_limit_type='max', Det_limit_side_len=720, use_angle_cls=False)
            print("[INFO] RapidOCR Engine initialized successfully from system packages.")
            return _rapid_ocr_engine, None
        except Exception as _sys_err:
            if os.path.exists(_ocr_libs_dir):
                if _ocr_libs_dir not in sys.path:
                    sys.path.insert(0, _ocr_libs_dir)
                if hasattr(os, 'add_dll_directory'):
                    for _sub in ['', 'onnxruntime', os.path.join('onnxruntime', 'capi'), 'cv2', 'numpy.libs', 'shapely.libs', 'PIL']:
                        _dll_p = os.path.join(_ocr_libs_dir, _sub) if _sub else _ocr_libs_dir
                        if os.path.isdir(_dll_p):
                            try:
                                os.add_dll_directory(_dll_p)
                            except Exception:
                                pass
                _extra_paths = [_ocr_libs_dir, os.path.join(_ocr_libs_dir, 'onnxruntime', 'capi')]
                os.environ["PATH"] = os.pathsep.join(_extra_paths) + os.pathsep + os.environ.get("PATH", "")
                try:
                    from rapidocr_onnxruntime import RapidOCR
                    _rapid_ocr_engine = RapidOCR(Det_limit_type='max', Det_limit_side_len=720, use_angle_cls=False)
                    print("[INFO] RapidOCR Engine initialized successfully from bundled ocr_libs.")
                    return _rapid_ocr_engine, None
                except Exception as _ocr_init_err:
                    _rapid_ocr_engine = None
                    import traceback
                    _ocr_init_error = f"{type(_ocr_init_err).__name__}: {_ocr_init_err}\n{traceback.format_exc()}"
                    print(f"[WARN] RapidOCR initialization warning: {_ocr_init_err}")
                    return None, _ocr_init_error
            else:
                _rapid_ocr_engine = None
                _ocr_init_error = str(_sys_err)
                return None, _ocr_init_error

def _warmup_rapid_ocr():
    try:
        engine, err = get_rapid_ocr_engine()
        if engine:
            dummy_img = np.zeros((64, 256, 3), dtype=np.uint8)
            engine(dummy_img, use_angle_cls=False)
            print("[INFO] RapidOCR Engine pre-warmed successfully in background.")
    except Exception as _w_err:
        print(f"[WARN] RapidOCR background warmup: {_w_err}")

# Launch background warmup immediately on module load so first request is instant
threading.Thread(target=_warmup_rapid_ocr, daemon=True, name="OCR-Warmup").start()

def clean_and_merge_ocr_results(result):
    """
    Sắp xếp các bounding boxes theo dòng ngang và tự động ghép / khử trùng lặp ký tự
    giữa các mảnh text bị đứt đoạn trên cùng một dòng tem / mã barcode.
    """
    if not result:
        return "", [], 0.0

    boxes_with_text = []
    for item in result:
        if not item or len(item) < 2:
            continue
        box = item[0]
        text = str(item[1]).strip()
        score = float(item[2]) if len(item) > 2 else 1.0
        if not text:
            continue

        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        center_y = (min_y + max_y) / 2.0
        box_h = max_y - min_y
        boxes_with_text.append({
            'min_x': min_x, 'max_x': max_x,
            'min_y': min_y, 'max_y': max_y,
            'center_y': center_y, 'height': box_h,
            'text': text, 'score': score
        })

    if not boxes_with_text:
        return "", [], 0.0

    avg_h = sum(b['height'] for b in boxes_with_text) / len(boxes_with_text)
    line_thresh = max(15.0, avg_h * 0.6)

    # Nhóm các box theo dòng ngang (Y-axis grouping)
    boxes_with_text.sort(key=lambda b: b['center_y'])
    lines = []
    current_line = [boxes_with_text[0]]
    for b in boxes_with_text[1:]:
        line_avg_y = sum(x['center_y'] for x in current_line) / len(current_line)
        if abs(b['center_y'] - line_avg_y) <= line_thresh:
            current_line.append(b)
        else:
            lines.append(current_line)
            current_line = [b]
    if current_line:
        lines.append(current_line)

    final_lines = []
    all_scores = [b['score'] for b in boxes_with_text]
    for line_boxes in lines:
        # Sắp xếp từ trái qua phải (X-axis)
        line_boxes.sort(key=lambda b: b['min_x'])

        merged_line = ""
        prev_box = None
        for b in line_boxes:
            txt = b['text']
            if not merged_line:
                merged_line = txt
            else:
                # Khử trùng lặp ký tự giữa 2 box kề nhau (ví dụ 'E3T' và 'T7S7...' -> 'E3T7S7...')
                overlap_len = 0
                max_check = min(len(merged_line), len(txt), 4)
                for k in range(max_check, 0, -1):
                    if merged_line[-k:] == txt[:k]:
                        overlap_len = k
                        break

                if overlap_len > 0:
                    merged_line += txt[overlap_len:]
                else:
                    gap = b['min_x'] - (prev_box['max_x'] if prev_box else b['min_x'])
                    char_w = (b['max_x'] - b['min_x']) / max(1, len(txt))
                    if gap > char_w * 1.5:
                        merged_line += " " + txt
                    else:
                        merged_line += txt
            prev_box = b

        # Loại bỏ các ký tự đặc biệt (*, #, $, @, etc.), chỉ giữ lại ký tự chữ cái và chữ số
        cleaned_line = re.sub(r'[^A-Za-z0-9]', '', merged_line)
        if cleaned_line:
            final_lines.append(cleaned_line)

    full_text = '\n'.join(final_lines)
    avg_conf = sum(all_scores) / len(all_scores) if all_scores else 0.0
    return full_text, final_lines, round(avg_conf, 3)

@app.route('/api/ocr/warmup', methods=['GET'])
def ocr_warmup():
    engine, err = get_rapid_ocr_engine()
    if engine is not None:
        dummy_img = np.zeros((64, 256, 3), dtype=np.uint8)
        engine(dummy_img, use_angle_cls=False)
        return jsonify({'success': True, 'warmed': True}), 200
    return jsonify({'success': False, 'error': err}), 500

@app.route('/api/ocr/recognize', methods=['POST'])
def ocr_recognize():
    engine, init_err = get_rapid_ocr_engine()
    if engine is None:
        return jsonify({
            'success': False,
            'engine_available': False,
            'init_error': init_err,
            'message': f'AI OCR Engine chưa được khởi tạo: {init_err}'
        }), 200

    image_bytes = None
    if 'file' in request.files:
        image_bytes = request.files['file'].read()
    elif 'image' in request.files:
        image_bytes = request.files['image'].read()
    elif request.is_json:
        data = request.get_json() or {}
        b64_str = data.get('image', '')
        if ',' in b64_str:
            b64_str = b64_str.split(',', 1)[1]
        try:
            image_bytes = base64.b64decode(b64_str)
        except Exception:
            image_bytes = None
    elif request.data:
        image_bytes = request.data

    if not image_bytes:
        return jsonify({'success': False, 'error': True, 'message': 'Không tìm thấy dữ liệu hình ảnh'}), 400

    try:
        t0 = time.perf_counter()

        img = Image.open(io.BytesIO(image_bytes))
        if img.mode != 'RGB':
            img = img.convert('RGB')
        # Tối ưu kích thước: Nếu ảnh quá lớn từ điện thoại/camera (>1280px), resize để tăng tốc độ nhận diện
        if max(img.width, img.height) > 1280:
            img.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
        img_np = np.array(img)

        result, elapse = engine(img_np, use_angle_cls=False)
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)

        if not result:
            return jsonify({
                'success': True,
                'engine_available': True,
                'text': '',
                'lines': [],
                'message': 'Không tìm thấy ký tự trong hình ảnh',
                'latency_ms': elapsed_ms
            })

        full_text, lines, avg_conf = clean_and_merge_ocr_results(result)

        return jsonify({
            'success': True,
            'engine_available': True,
            'text': full_text,
            'lines': lines,
            'confidence': avg_conf,
            'latency_ms': elapsed_ms
        })
    except Exception as e:
        return jsonify({'success': False, 'error': True, 'message': f'Lỗi nhận diện OCR: {str(e)}'}), 500

@app.errorhandler(404)
def page_not_found(e):
    if request.path.endswith('.map'):
        return ('', 204)
    if request.path.startswith('/api/'):
        return jsonify({'error': True, 'message': 'API endpoint not found'}), 404
    return render_template('404.html'), 404
   
if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)
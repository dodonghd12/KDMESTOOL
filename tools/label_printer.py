# -*- coding: utf-8 -*-
"""
KDMES TOOL - Module in lại tem & xuất PDF chuẩn MES (Code 39, Phông Arial 12pt, Biểu mẫu 2L-00-014)
Tự động trích xuất thông số kỹ thuật Dynamic theo recipe của đơn điều động.
Tối ưu chiều dài và khoảng cách vạch barcode chuẩn công nghiệp để máy PDA quét dễ dàng.
"""

import io
import os
import time
import requests
import yaml
import urllib3
from PIL import Image, ImageDraw, ImageFont

# Bảng mã Code 39 chuẩn (9 phần tử: 5 bars, 4 spaces; 3 Wide 'W', 6 Narrow 'N')
CODE39_PATTERNS = {
    '0': 'NNNWWNWNN', '1': 'WNNWNNNNW', '2': 'NNWWNNNNW', '3': 'WNWWNNNNN',
    '4': 'NNNWWNNNW', '5': 'WNNWWNNNN', '6': 'NNWWWNNNN', '7': 'NNNWNNWNW',
    '8': 'WNNWNNWNN', '9': 'NNWWNNWNN', 'A': 'WNNNNWNNW', 'B': 'NNWNNWNNW',
    'C': 'WNWNNWNNN', 'D': 'NNNNWWNNW', 'E': 'WNNNWWNNN', 'F': 'NNWNWWNNN',
    'G': 'NNNNNWWNW', 'H': 'WNNNNWWNN', 'I': 'NNWNNWWNN', 'J': 'NNNNWWWNN',
    'K': 'WNNNNNNWW', 'L': 'NNWNNNNWW', 'M': 'WNWNNNNWN', 'N': 'NNNNWNNWW',
    'O': 'WNNNWNNWN', 'P': 'NNWNWNNWN', 'Q': 'NNNNNNWWW', 'R': 'WNNNNNWWN',
    'S': 'NNWNNNWWN', 'T': 'NNNNWNWWN', 'U': 'WWNNNNNNW', 'V': 'NWWNNNNNW',
    'W': 'WWWNNNNNN', 'X': 'NWNNWNNNW', 'Y': 'WWNNWNNNN', 'Z': 'NWWNWNNNN',
    '-': 'NWNNNNWNW', '.': 'WWNNNNWNN', ' ': 'NWWNNNWNN', '$': 'NWNWNWNNN',
    '/': 'NWNWNNNWN', '+': 'NWNNNWNWN', '%': 'NNNWNWNWN', '*': 'NWNNWNWNN'
}

# Cấu hình chuẩn 15 loại bán thành phẩm từ bảng kvmes.material_resource_config (Hệ thống MES)
# Đảm bảo thứ tự hiển thị, mã nguồn và nhãn tiếng Việt chuẩn xác 100% như tem chính thống MES
BUILTIN_LABEL_CONFIGS = {
    'TREAD': [
        ('product code', 'Mã sản phẩm', 0),
        ('tire size', 'Quy cách', 0),
        ('width', 'Tổng rộng', 0),
        ('hump width', 'Rộng vai', 0),
        ('color-line', 'Đường chỉ', 0),
        ('spray-content', 'Nội dung phun chữ', 0),
        ('eco-friendly-oil', 'Dầu bảo vệ môi trường', 0),
    ],
    'STEEL_BELT': [
        ('product code', 'MSTP', 0),
        ('tire size', 'Quy cách', 0),
        ('width', 'Độ rộng', 0),
        ('thickness', 'Độ dày', 0),
        ('angle', 'Góc độ', 0),
        ('eco-friendly-oil', 'Dầu bảo vệ môi trường', 0),
        ('attachment-position', 'Phương thức dán', 2),
        ('direction 1B/2B', 'Hướng 1B/2B', 2),
    ],
    'BELT_AND_EDGE_GUM_PREASSEMBLY': [
        ('product code', 'MSTP', 0),
        ('tire size', 'Quy cách', 0),
        ('width', 'Độ rộng', 0),
        ('thickness', 'Độ dày', 0),
        ('angle', 'Góc độ', 0),
        ('attachment-position', 'Phương thức dán', 0),
        ('eco-friendly-oil', 'Dầu bảo vệ môi trường', 0),
        ('direction 1B/2B', 'Hướng 1B/2B', 2),
    ],
    'CARCASS_PLY': [
        ('width', 'Độ rộng', 0),
        ('thickness', 'Độ dày', 0),
        ('angle', 'Góc độ', 0),
        ('eco-friendly-oil', 'Dầu bảo vệ môi trường', 0),
        ('tire size', 'Quy cách', 0),
    ],
    'CAP_PLY': [
        ('width', 'Độ rộng', 0),
        ('thickness', 'Độ dày', 0),
        ('eco-friendly-oil', 'Dầu bảo vệ môi trường', 0),
    ],
    'PLY': [
        ('width', 'Độ rộng', 0),
        ('thickness', 'Độ dày', 0),
        ('eco-friendly-oil', 'Dầu bảo vệ môi trường', 0),
        ('net weight', 'Khối lượng', 2),
        ('gross weight', 'Tổng trọng lượng', 2),
    ],
    'INNER_LINER': [
        ('up-runner-width', 'Độ rộng  lớp trên', 0),
        ('up-runner-thickness', 'Độ dày lớp trên', 0),
        ('middle-runner-width', 'Độ rộng lớp dưới', 0),
        ('middle-runner-thickness', 'Độ dày lớp dưới', 0),
        ('GC-width', 'Độ rộng GC', 0),
        ('width', 'Tổng rộng', 0),
        ('thickness', 'Tổng dày', 0),
        ('eco-friendly-oil', 'Dầu bảo vệ môi trường', 0),
    ],
    'BEAD': [
        ('bead_sequence', 'Cấu trúc kẽm', 0),
        ('BIC', 'Chu vi trong', 0),
        ('width', 'Độ rộng', 0),
        ('thickness', 'Độ dày', 0),
        ('weight', 'Trọng lượng', 0),
        ('color-line', 'Đường chỉ', 0),
    ],
    'BEAD_AND_BEAD_FILLER_PREASSEMBLY': [
        ('product code', 'Mã sản phẩm', 0),
        ('bead-Filler-high', 'Độ cao', 0),
        ('flipper- width', 'Độ rộng vải chống cọ', 0),
        ('total-weight', 'Trọng lượng', 0),
        ('tire size', 'Quy cách', 0),
        ('color-line', 'Đường chỉ', 0),
        ('spray-content', '', 0),
    ],
    'BEAD_FILLER': [
        ('width', 'Độ rộng', 0),
        ('high', 'Độ cao', 0),
        ('eco-friendly-oil', 'Dầu bảo vệ môi trường', 0),
    ],
    'CHAFER': [
        ('width', 'Độ rộng', 0),
        ('thickness', 'Độ dày', 0),
    ],
    'GREEN_TIRE': [
        ('product code', 'Mã sản phẩm', 0),
        ('tire size', 'quy cách', 0),
        ('tread pattern', 'Hoa văn', 0),
        ('color-line', 'Đường chỉ', 0),
        ('weight', 'Trọng lượng', 0),
        ('rt location', 'Vị trí băng phản quang', 0),
        ('logo location', 'Vị trí tem', 0),
        ('inside paine', 'Dung dịch phun phủ mặt trong', 0),
        ('puncture', 'Đâm lỗ vỏ sống', 0),
    ],
    'RUBBER': [
        ('mooney spec', 'mooney spec', 0),
        ('eco-friendly-oil', 'Dầu bảo vệ môi trường', 0),
        ('batch', 'Số mẻ', 2),
        ('weight', 'Trọng lượng', 2),
        ('', '', 2),
    ],
    'SIDEWALL': [
        ('product code', 'MSTP', 0),
        ('tire size', '', 0),
        ('working side', 'Bên làm việc', 0),
        ('opposite working side', 'Bên làm việc đối diện', 0),
        ('eco-friendly-oil', 'Dầu bảo vệ môi trường', 0),
    ],
    'SQUEEZE': [
        ('up-runner-width', 'Độ rộng', 0),
        ('up-runner-thickness', 'Độ dày', 0),
        ('eco-friendly-oil', 'Dầu bảo vệ môi trường', 2),
    ],
}

# Từ điển ánh xạ nhãn tiếng Việt riêng biệt theo từng product_type (Không được dùng chung nhầm lẫn)
PRODUCT_TYPE_SPEC_TRANSLATIONS = {
    'TREAD': {
        'product code': 'Mã sản phẩm',
        'product Code': 'Mã sản phẩm',
        'tire size': 'Quy cách',
        'width': 'Tổng rộng',
        'hump width': 'Rộng vai',
        'color-line': 'Đường chỉ',
        'color line': 'Đường chỉ',
        'spray-content': 'Nội dung phun chữ',
        'spray content': 'Nội dung phun chữ',
        'eco-friendly-oil': 'Dầu bảo vệ môi trường',
    },
    'STEEL_BELT': {
        'product code': 'MSTP',
        'product Code': 'MSTP',
        'tire size': 'Quy cách',
        'width': 'Độ rộng',
        'thickness': 'Độ dày',
        'angle': 'Góc độ',
        'eco-friendly-oil': 'Dầu bảo vệ môi trường',
        'attachment-position': 'Phương thức dán',
        'direction 1B/2B': 'Hướng 1B/2B',
        'direction': 'Hướng 1B/2B',
    },
    'BELT_AND_EDGE_GUM_PREASSEMBLY': {
        'product code': 'MSTP',
        'product Code': 'MSTP',
        'tire size': 'Quy cách',
        'width': 'Độ rộng',
        'thickness': 'Độ dày',
        'angle': 'Góc độ',
        'attachment-position': 'Phương thức dán',
        'eco-friendly-oil': 'Dầu bảo vệ môi trường',
        'direction 1B/2B': 'Hướng 1B/2B',
        'direction': 'Hướng 1B/2B',
    },
    'GREEN_TIRE': {
        'product code': 'Mã sản phẩm',
        'product Code': 'Mã sản phẩm',
        'tire size': 'quy cách',
        'tread pattern': 'Hoa văn',
        'color-line': 'Đường chỉ',
        'color line': 'Đường chỉ',
        'weight': 'Trọng lượng',
        'rt location': 'Vị trí băng phản quang',
        'logo location': 'Vị trí tem',
        'inside paine': 'Dung dịch phun phủ mặt trong',
        'puncture': 'Đâm lỗ vỏ sống',
    },
    'BEAD_AND_BEAD_FILLER_PREASSEMBLY': {
        'product code': 'Mã sản phẩm',
        'product Code': 'Mã sản phẩm',
        'bead-Filler-high': 'Độ cao',
        'flipper- width': 'Độ rộng vải chống cọ',
        'total-weight': 'Trọng lượng',
        'tire size': 'Quy cách',
        'color-line': 'Đường chỉ',
        'color line': 'Đường chỉ',
        'spray-content': 'Nội dung phun chữ',
    },
    'INNER_LINER': {
        'up-runner-width': 'Độ rộng  lớp trên',
        'up-runner-thickness': 'Độ dày lớp trên',
        'middle-runner-width': 'Độ rộng lớp dưới',
        'middle-runner-thickness': 'Độ dày lớp dưới',
        'GC-width': 'Độ rộng GC',
        'width': 'Tổng rộng',
        'thickness': 'Tổng dày',
        'eco-friendly-oil': 'Dầu bảo vệ môi trường',
    },
    'BEAD': {
        'bead_sequence': 'Cấu trúc kẽm',
        'BIC': 'Chu vi trong',
        'width': 'Độ rộng',
        'thickness': 'Độ dày',
        'weight': 'Trọng lượng',
        'color-line': 'Đường chỉ',
        'color line': 'Đường chỉ',
    },
    'BEAD_FILLER': {
        'width': 'Độ rộng',
        'high': 'Độ cao',
        'eco-friendly-oil': 'Dầu bảo vệ môi trường',
    },
    'CARCASS_PLY': {
        'width': 'Độ rộng',
        'thickness': 'Độ dày',
        'angle': 'Góc độ',
        'eco-friendly-oil': 'Dầu bảo vệ môi trường',
        'tire size': 'Quy cách',
    },
    'CAP_PLY': {
        'width': 'Độ rộng',
        'thickness': 'Độ dày',
        'eco-friendly-oil': 'Dầu bảo vệ môi trường',
    },
    'PLY': {
        'width': 'Độ rộng',
        'thickness': 'Độ dày',
        'eco-friendly-oil': 'Dầu bảo vệ môi trường',
        'net weight': 'Khối lượng',
        'gross weight': 'Tổng trọng lượng',
    },
    'SIDEWALL': {
        'product code': 'MSTP',
        'product Code': 'MSTP',
        'tire size': 'Quy cách',
        'working side': 'Bên làm việc',
        'opposite working side': 'Bên làm việc đối diện',
        'eco-friendly-oil': 'Dầu bảo vệ môi trường',
    },
    'SQUEEZE': {
        'up-runner-width': 'Độ rộng',
        'up-runner-thickness': 'Độ dày',
        'eco-friendly-oil': 'Dầu bảo vệ môi trường',
    },
    'CHAFER': {
        'width': 'Độ rộng',
        'thickness': 'Độ dày',
    },
    'RUBBER': {
        'mooney spec': 'Tiêu chuẩn Mooney',
        'eco-friendly-oil': 'Dầu bảo vệ môi trường',
        'batch': 'Số mẻ',
        'weight': 'Trọng lượng',
    }
}

# Từ điển ánh xạ thông số kỹ thuật chung (fallback cấp cuối khi không xác định được product_type)
SPEC_KEY_TRANSLATIONS = {
    'product code': 'Mã sản phẩm',
    'product Code': 'Mã sản phẩm',
    'tire size': 'Quy cách',
    'width': 'Tổng rộng',
    'thickness': 'Độ dày',
    'angle': 'Góc độ',
    'attachment-position': 'Phương thức dán',
    'eco-friendly-oil': 'Dầu bảo vệ môi trường',
    'working side': 'Bên làm việc',
    'opposite working side': 'Bên làm việc đối diện',
    'direction': 'Hướng 1B/2B',
    'direction 1B/2B': 'Hướng 1B/2B',
    'direction 1b/2b': 'Hướng 1B/2B',
    'color line': 'Đường chỉ',
    'color-line': 'Đường chỉ',
    'weight': 'Trọng lượng',
    'total-weight': 'Tổng trọng lượng',
    'gross weight': 'Tổng trọng lượng',
    'net weight': 'Khối lượng',
    'GC-width': 'Bề rộng GC',
    'tread pattern': 'Hoa văn',
    'hump width': 'Rộng vai',
    'spray-content': 'Nội dung phun chữ',
    'middle-runner-thickness': 'Độ dày runner giữa',
    'middle-runner-width': 'Bề rộng runner giữa',
    'up-runner-thickness': 'Độ dày runner trên',
    'up-runner-width': 'Bề rộng runner trên',
    'bead-Filler-high': 'Chiều cao tanh',
    'bead-Filler-thickenss': 'Độ dày tanh',
    'bead-Filler-width': 'Bề rộng tanh',
    'flipper- width': 'Bề rộng flipper',
    'mooney spec': 'Tiêu chuẩn Mooney',
    'batch': 'Số mẻ',
    'bead_sequence': 'Cấu trúc kẽm',
    'BIC': 'Chu vi trong',
    'high': 'Chiều cao',
}


def normalize_spec_key(k: str) -> str:
    """Chuẩn hóa khóa thông số kỹ thuật (bỏ dấu gạch nối, khoảng trắng, viết thường)."""
    import re
    return re.sub(r'[\s_\-\/]+', '', str(k or '').lower().strip())


def get_translation_for_key(k: str, product_type: str = None) -> str:
    """
    Lấy tên nhãn hiển thị tiếng Việt chuẩn xác theo đúng product_type:
    - Nếu có product_type (ví dụ TREAD): tra cứu từ điển chuyên biệt của product_type đó
      (TREAD -> product code = 'Mã sản phẩm', width = 'Tổng rộng', hump width = 'Rộng vai', color-line = 'Đường chỉ').
    - Nếu không tìm thấy, tra cứu SPEC_KEY_TRANSLATIONS chung.
    """
    clean_k = str(k or '').strip()
    norm_k = normalize_spec_key(clean_k)
    clean_pt = str(product_type or '').strip().upper()

    # 1. Tra cứu theo cấu hình riêng của product_type
    if clean_pt and clean_pt in PRODUCT_TYPE_SPEC_TRANSLATIONS:
        pt_map = PRODUCT_TYPE_SPEC_TRANSLATIONS[clean_pt]
        if clean_k in pt_map:
            return pt_map[clean_k]
        for candidate_k, val in pt_map.items():
            if normalize_spec_key(candidate_k) == norm_k:
                return val

    # 2. Tra cứu theo từ điển chung
    if clean_k in SPEC_KEY_TRANSLATIONS:
        return SPEC_KEY_TRANSLATIONS[clean_k]
    for candidate_k, val in SPEC_KEY_TRANSLATIONS.items():
        if normalize_spec_key(candidate_k) == norm_k:
            return val

    # 3. Fallback định dạng Title
    return clean_k.replace('-', ' ').title()


# Cấu hình danh mục thông số kỹ thuật linh động từ PostgreSQL & GitLab CE
def get_gitlab_token() -> str:
    """Lấy token xác thực GitLab CE từ biến môi trường hoặc file cấu hình .env."""
    token = os.environ.get('GITLAB_PRIVATE_TOKEN', '').strip()
    if token:
        return token
    candidate_paths = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env'),
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


_LABEL_CONFIG_CACHE = {}
_LABEL_CONFIG_TIMESTAMP = 0
_CACHE_TTL_SECONDS = 300  # Cache 5 phút, tự động làm mới khi hết hạn


def load_db_label_config() -> dict:
    """
    Truy vấn cấu hình thông số kỹ thuật chuẩn trực tiếp từ bảng kvmes.material_resource_config
    của cơ sở dữ liệu PostgreSQL Kenda MES. Đây là nguồn dữ liệu chuẩn nhất từ hệ thống MES.
    """
    try:
        import json
        from db_execute import execute_pg_select_query
        rows, _ = execute_pg_select_query("SELECT product_type, config FROM kvmes.material_resource_config;")
        if not rows:
            return {}
        config_map = {}
        for pt, raw_cfg in rows:
            ptype = str(pt or '').strip().upper()
            if not ptype:
                continue
            cfg_dict = raw_cfg
            if isinstance(cfg_dict, str):
                try:
                    cfg_dict = json.loads(cfg_dict)
                except Exception:
                    continue
            if not isinstance(cfg_dict, dict):
                continue
            req_labels = cfg_dict.get('required-labels') or cfg_dict.get('required_labels') or []
            pair_list = []
            for lbl in req_labels:
                if isinstance(lbl, dict):
                    key = str(lbl.get('key') or '').strip()
                    if not key:
                        continue
                    langs = lbl.get('languages', {}) if isinstance(lbl.get('languages'), dict) else {}
                    l_lower = {str(k).lower(): str(v).strip() for k, v in langs.items() if v}
                    vi_label = l_lower.get('vi') or l_lower.get('vn') or ''
                    resource = lbl.get('resource')
                    pair_list.append((key, vi_label, resource))
            if pair_list:
                config_map[ptype] = pair_list
        return config_map
    except Exception:
        return {}


def load_gitlab_label_config() -> dict:
    """
    Tải danh mục thông số kỹ thuật từ GitLab CE (Project 113, yamls/label-config.yml)
    khi cần đồng bộ thêm cấu hình mới nhất từ kho git.
    """
    token = get_gitlab_token()
    headers = {'PRIVATE-TOKEN': token, 'User-Agent': 'KDMESTOOL-Client/1.0'} if token else {'User-Agent': 'KDMESTOOL-Client/1.0'}
    url = 'https://gitlabce.kenda.com.tw/api/v4/projects/113/repository/files/yamls%2Flabel-config.yml/raw'

    try:
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        resp = requests.get(url, params={'ref': 'master'}, headers=headers, timeout=5, verify=False)
        if resp.status_code == 200 and resp.text:
            parsed = yaml.safe_load(resp.text)
            config_map = {}
            if isinstance(parsed, list):
                for item in parsed:
                    if not isinstance(item, dict):
                        continue
                    ptype = str(item.get('product-type') or '').strip().upper()
                    if not ptype:
                        continue
                    configs = item.get('configs', {})
                    req_labels = configs.get('required-labels', []) if isinstance(configs, dict) else []
                    pair_list = []
                    for lbl in req_labels:
                        if isinstance(lbl, dict):
                            key = str(lbl.get('key') or '').strip()
                            if not key:
                                continue
                            langs = lbl.get('languages', {}) if isinstance(lbl.get('languages'), dict) else {}
                            l_lower = {str(k).lower(): str(v).strip() for k, v in langs.items() if v}
                            vi_label = l_lower.get('vi') or l_lower.get('vn') or ''
                            resource = lbl.get('resource')
                            pair_list.append((key, vi_label, resource))
                    if pair_list:
                        config_map[ptype] = pair_list
            return config_map
    except Exception:
        pass
    return {}


def get_label_config(force_refresh: bool = False) -> dict:
    """
    Lấy danh mục cấu hình in tem chuẩn xác theo cơ chế đa tầng (Multi-tier Failover):
    - Tầng 1: In-memory Cache 5 phút (tối ưu hóa hiệu năng in ấn liên tục).
    - Tầng 2: PostgreSQL kvmes.material_resource_config (nguồn dữ liệu chính thống từ MES Database nội bộ).
    - Tầng 3: GitLab CE API (đồng bộ từ file YAML cấu hình trên máy chủ mã nguồn).
    - Tầng 4: BUILTIN_LABEL_CONFIGS (cấu hình nhúng sẵn chuẩn 15 loại bán thành phẩm, bảo đảm 100% không bao giờ rỗng).
    """
    global _LABEL_CONFIG_CACHE, _LABEL_CONFIG_TIMESTAMP
    now = time.time()
    if not force_refresh and _LABEL_CONFIG_CACHE and (now - _LABEL_CONFIG_TIMESTAMP < _CACHE_TTL_SECONDS):
        return _LABEL_CONFIG_CACHE

    # Khởi tạo bản đồ cấu hình với BUILTIN_LABEL_CONFIGS làm nền tảng
    merged_config = dict(BUILTIN_LABEL_CONFIGS)

    # 1. Thử tải cấu hình từ PostgreSQL kvmes.material_resource_config
    db_cfg = load_db_label_config()
    if db_cfg:
        merged_config.update(db_cfg)

    # 2. Nếu thiếu loại nào, thử bổ sung từ GitLab CE
    if len(merged_config) < len(BUILTIN_LABEL_CONFIGS):
        gitlab_cfg = load_gitlab_label_config()
        if gitlab_cfg:
            for k, v in gitlab_cfg.items():
                if k not in merged_config:
                    merged_config[k] = v

    if merged_config:
        _LABEL_CONFIG_CACHE = merged_config
        _LABEL_CONFIG_TIMESTAMP = now

    return _LABEL_CONFIG_CACHE or BUILTIN_LABEL_CONFIGS


def get_gitlab_label_config(force_refresh: bool = False) -> dict:
    """Hàm bao bọc tương thích ngược 100% với các module cũ gọi get_gitlab_label_config()."""
    return get_label_config(force_refresh=force_refresh)


class DynamicRequiredLabels(dict):
    """
    Truy xuất danh mục thông số kỹ thuật linh động theo thời gian thực,
    thay thế dictionary tĩnh set cứng, tương thích ngược 100% với các hàm gọi cũ.
    """
    def __getitem__(self, key):
        cfg = get_label_config()
        return cfg.get(str(key or '').strip().upper(), [])

    def get(self, key, default=None):
        cfg = get_label_config()
        val = cfg.get(str(key or '').strip().upper())
        return val if val is not None else default

    def __contains__(self, key):
        cfg = get_label_config()
        return str(key or '').strip().upper() in cfg

    def items(self):
        return get_label_config().items()

    def keys(self):
        return get_label_config().keys()

    def values(self):
        return get_label_config().values()


# Đối tượng Dynamic thay thế dictionary tĩnh set cứng
PRODUCT_TYPE_REQUIRED_LABELS = DynamicRequiredLabels()


def parse_recipe_specs(note_list, product_type: str = None, label_config: dict = None):
    """
    Trích xuất danh sách thông số kỹ thuật chuẩn MES:
    - Tuyệt đối tuân thủ theo danh mục và thứ tự của product_type từ kvmes.material_resource_config / label-config.
      Chỉ hiển thị các trường có trong cấu hình của product_type đó.
      Ví dụ với TREAD:
        1. Mã sản phẩm (product code)
        2. Quy cách (tire size)
        3. Tổng rộng (width)
        4. Rộng vai (hump width)
        5. Đường chỉ (color-line)
        6. Nội dung phun chữ (spray-content)
        7. Dầu bảo vệ môi trường (eco-friendly-oil)
    - Nhãn tiếng Việt được lấy chính xác theo product_type chỉ định (ví dụ TREAD lấy 'Mã sản phẩm', STEEL_BELT lấy 'MSTP').
    - Nếu trong recipe.note có giá trị thì điền vào, nếu không có giá trị thì để trống "" đúng theo tem thực tế.
    - Trường hợp dự phòng: chỉ khi product_type hoàn toàn không có trong cấu hình mới fallback theo recipe note.
    """
    parsed_notes = {}
    raw_notes = []
    if note_list:
        for item in note_list:
            if not item or not isinstance(item, str):
                continue
            cleaned = item.strip()
            if not cleaned:
                continue
            if ':' in cleaned:
                k, v = cleaned.split(':', 1)
                k_clean = k.strip()
                v_clean = v.strip()
                norm_k = normalize_spec_key(k_clean)
                parsed_notes[norm_k] = (k_clean, v_clean)
            else:
                raw_notes.append(cleaned)

    specs = []
    clean_pt = str(product_type or '').strip().upper()

    # 1. Truy xuất danh mục thông số kỹ thuật chuẩn theo product_type
    active_config = label_config if label_config is not None else get_label_config()
    req_labels = active_config.get(clean_pt)
    if not req_labels and clean_pt in BUILTIN_LABEL_CONFIGS:
        req_labels = BUILTIN_LABEL_CONFIGS[clean_pt]

    if req_labels:
        for item in req_labels:
            if len(item) >= 3:
                req_key, label_vi, resource = item[0], item[1], item[2]
            else:
                req_key, label_vi = item[0], item[1]
                resource = None

            norm_req = normalize_spec_key(req_key)

            # Quy chuẩn hệ thống MES:
            # 0: recipe.note (mặc định)
            # 1: recipe.commonProperty
            # 2: value is blank (luôn để trống giá trị trên tem in ra)
            is_resource_blank = False
            if resource is not None:
                try:
                    is_resource_blank = (int(resource) == 2)
                except (ValueError, TypeError):
                    is_resource_blank = (str(resource).strip() == '2')

            val = ""
            if not is_resource_blank:
                if norm_req in parsed_notes:
                    val = parsed_notes[norm_req][1]
                else:
                    # Xử lý các bí danh phổ biến (Aliases)
                    alias_map = {
                        'direction1b2b': ['direction', 'direction1b2b', 'direction1b'],
                        'direction': ['direction', 'direction1b2b', 'direction1b'],
                        'colorline': ['colorline', 'color', 'colorline1'],
                        'spraycontent': ['spraycontent', 'spray', 'ptdata'],
                        'ecofriendlyoil': ['ecofriendlyoil', 'oil', 'ecooil'],
                        'productcode': ['productcode', 'product_code', 'item_no', 'mstp'],
                        'tiresize': ['tiresize', 'tire_size', 'size', 'spec'],
                        'humpwidth': ['humpwidth', 'hump_width'],
                        'totalweight': ['totalweight', 'weight']
                    }
                    if norm_req in alias_map:
                        for alt in alias_map[norm_req]:
                            if alt in parsed_notes:
                                val = parsed_notes[alt][1]
                                break

            # Phân giải nhãn tiếng Việt chuẩn xác theo product_type
            display_label = label_vi or get_translation_for_key(req_key, product_type=clean_pt)
            specs.append((display_label, val))
        return specs

    # 2. Dự phòng: Chỉ khi product_type hoàn toàn KHÔNG có trong cấu hình mới lấy theo recipe.note
    for norm_k, (k_orig, v_orig) in parsed_notes.items():
        display_label = get_translation_for_key(k_orig, product_type=clean_pt)
        specs.append((display_label, v_orig))

    # 3. Các dòng raw không có dấu hai chấm
    for r in raw_notes:
        specs.append((r, ''))

    return specs


def generate_code39(text, narrow_width=3, wide_width=8, height=105):
    """
    Sinh hình ảnh mã vạch Code 39 chuẩn công nghiệp.
    Mặc định narrow=3px, wide=8px (tỷ lệ 2.67:1) để vạch dày rõ, khoảng cách vạch rộng,
    giúp máy quét PDA dễ dàng quét mã kể cả trong điều kiện ánh sáng yếu hoặc rung lắc.
    """
    clean_text = text.upper().strip()
    full_text = f"*{clean_text}*"
    elements = []
    for i, char in enumerate(full_text):
        pattern = CODE39_PATTERNS.get(char)
        if not pattern:
            continue
        for idx, elem in enumerate(pattern):
            is_bar = (idx % 2 == 0)
            w = wide_width if elem == 'W' else narrow_width
            elements.append((is_bar, w))
        if i < len(full_text) - 1:
            elements.append((False, narrow_width))

    total_w = sum(w for _, w in elements)
    quiet_zone = narrow_width * 10
    img_w = total_w + 2 * quiet_zone
    img = Image.new('RGB', (img_w, height), 'white')
    draw = ImageDraw.Draw(img)

    cur_x = quiet_zone
    for is_bar, w in elements:
        if is_bar:
            draw.rectangle([cur_x, 0, cur_x + w - 1, height - 1], fill='black')
        cur_x += w

    return img


def get_arial_fonts(font_size_pt=12, dpi=300.0):
    """
    Lấy phông Arial chuẩn 12pt (tương đương 50px ở độ phân giải 300 DPI).
    """
    font_size_px = int(round(font_size_pt * dpi / 72.0)) # 12pt -> 50px
    code_size_px = int(round(11 * dpi / 72.0))           # 11pt -> 46px

    win_dir = os.environ.get('WINDIR', 'C:\\Windows')
    fonts_dir = os.path.join(win_dir, 'Fonts')
    arial_regular = os.path.join(fonts_dir, 'arial.ttf')
    arial_bold = os.path.join(fonts_dir, 'arialbd.ttf')

    try:
        font_regular = ImageFont.truetype(arial_regular, font_size_px)
        font_bold = ImageFont.truetype(arial_bold if os.path.exists(arial_bold) else arial_regular, font_size_px)
        font_code = ImageFont.truetype(arial_regular, code_size_px)
        return font_regular, font_bold, font_code
    except Exception:
        fallback = ImageFont.load_default()
        return fallback, fallback, fallback


def build_label_image(label_data):
    """
    Dựng hình ảnh con tem hoàn chỉnh chuẩn MES vừa vặn khổ A5 ngang (Landscape: 210mm x 148mm @ 300 DPI):
    - Khổ giấy A5 Landscape chuẩn: 2480px x 1748px (210mm x 148mm / 595.2pt x 419.5pt).
    - Biểu mẫu 2L-00-014 ở góc trên bên phải căn chuẩn theo mép phải của bảng.
    - Cột 1 (nhãn): 680px (~30% chiều rộng bảng, đủ rộng cho mọi nhãn tiếng Việt dài nhất).
    - Cột 2 (giá trị & barcode): 1600px (~70% chiều rộng bảng), mã vạch Code 39 trải dài, vạch to rõ, PDA quét siêu nhạy.
    - Chiều cao dòng tự co giãn thông minh (52px - 70px) đảm bảo không bao giờ bị tràn đáy 148mm kể cả khi recipe có nhiều thông số.
    """
    dpi = 300.0
    font_regular, font_bold, font_code = get_arial_fonts(font_size_pt=12, dpi=dpi)

    # Khổ giấy chuẩn A5 ngang (Landscape) ở 300 DPI: 210 mm x 148 mm
    canvas_w = 2480  # 210 mm (595.28 pt)
    canvas_h = 1748  # 148 mm (419.53 pt)

    margin_x = 100   # ~8.46 mm lề an toàn in ấn 2 bên trái/phải
    table_w = canvas_w - 2 * margin_x  # 2280 px (193.04 mm)

    col1_w = 680     # Cột nhãn
    col2_w = table_w - col1_w  # 1600 px (Cột giá trị & mã vạch)
    table_top = 80
    barcode_row_h = 175

    # 1. Danh sách các dòng cố định tiêu chuẩn (Dòng 1 đến 11)
    rows = [
        ("Mã máy", label_data.get("station", "") or ""),
        ("Mã máy tiếp theo", label_data.get("next_station", "next_station") or "next_station"),
        ("Mã sản phẩm", label_data.get("product_id", "") or ""),
        ("Lô sản xuất", label_data.get("lot_number", "") or ""),
        ("Ngày sản xuất", label_data.get("production_time", "") or ""),
        ("Ngày hết hạn", label_data.get("expiry_time", "") or ""),
        ("Số lượng", str(label_data.get("quantity", "") if label_data.get("quantity") is not None else "")),
        ("Tự kiểm điểm", "□ NG  □ OK"),
        ("Mã xe", ""),
        ("số seri", str(label_data.get("sequence", "") if label_data.get("sequence") is not None else "")),
        ("Bắt đầu và kết thúc", "")
    ]

    # 2. Danh sách các dòng thông số kỹ thuật HOÀN TOÀN DYNAMIC theo recipe của đơn điều động
    specs = label_data.get("specs", [])
    if specs:
        for lbl, val in specs:
            rows.append((lbl, str(val or "")))

    # Tự động tính toán chiều cao dòng để luôn vừa vặn 100% trong chiều cao A5 ngang (1748px)
    max_table_h = canvas_h - table_top - 60
    normal_row_h = min(70, max(52, int((max_table_h - barcode_row_h) / len(rows))))

    img = Image.new('RGB', (canvas_w, canvas_h), 'white')
    draw = ImageDraw.Draw(img)

    # Căn phải mã biểu mẫu 2L-00-014 thẳng hàng với mép phải bảng dữ liệu
    form_bbox = draw.textbbox((0, 0), "2L-00-014", font=font_code)
    form_w = form_bbox[2] - form_bbox[0]
    draw.text((margin_x + table_w - form_w, 28), "2L-00-014", fill='black', font=font_code)

    cur_y = table_top
    border_color = (0, 0, 0)
    line_w = 2

    # Vẽ từng dòng thông tin (Font size 12pt Arial)
    for lbl, val in rows:
        # Đường viền ô
        draw.rectangle([margin_x, cur_y, margin_x + table_w, cur_y + normal_row_h], outline=border_color, width=line_w)
        # Đường kẻ dọc phân cách 2 cột
        draw.line([margin_x + col1_w, cur_y, margin_x + col1_w, cur_y + normal_row_h], fill=border_color, width=line_w)

        # Chữ cột 1 (Tên trường) căn giữa theo chiều dọc
        draw.text((margin_x + 16, cur_y + int((normal_row_h - 45) / 2)), lbl, fill='black', font=font_regular)

        # Chữ cột 2 (Giá trị) căn giữa theo chiều dọc
        draw.text((margin_x + col1_w + 18, cur_y + int((normal_row_h - 45) / 2)), str(val), fill='black', font=font_regular)

        cur_y += normal_row_h

    # Vẽ dòng Mã vạch (Dòng cuối cùng)
    draw.rectangle([margin_x, cur_y, margin_x + table_w, cur_y + barcode_row_h], outline=border_color, width=line_w)
    draw.line([margin_x + col1_w, cur_y, margin_x + col1_w, cur_y + barcode_row_h], fill=border_color, width=line_w)
    draw.text((margin_x + 16, cur_y + int(barcode_row_h / 2) - 24), "Mã vạch", fill='black', font=font_regular)

    barcode_val = str(label_data.get("barcode", "") or "").strip().upper()
    if barcode_val:
        # Tự động tính độ rộng vạch tối ưu cho cột 2 (1600px)
        num_chars = len(barcode_val) + 2
        w38 = num_chars * (3 * 8 + 7 * 3) + 3 * 20
        w26 = num_chars * (3 * 6 + 7 * 2) + 2 * 20
        if w38 <= col2_w - 60:
            target_narrow, target_wide = 3, 8
        elif w26 <= col2_w - 60:
            target_narrow, target_wide = 2, 6
        else:
            target_narrow, target_wide = 2, 5

        bc_img = generate_code39(barcode_val, narrow_width=target_narrow, wide_width=target_wide, height=100)

        bc_x = margin_x + col1_w + int((col2_w - bc_img.width) / 2)
        bc_y = cur_y + 10
        img.paste(bc_img, (max(margin_x + col1_w + 10, bc_x), bc_y))

        # In chuỗi mã vạch bên dưới vạch barcode (Font 12pt Arial)
        bbox = draw.textbbox((0, 0), barcode_val, font=font_regular)
        txt_w = bbox[2] - bbox[0]
        txt_x = margin_x + col1_w + int((col2_w - txt_w) / 2)
        txt_y = bc_y + bc_img.height + 6
        draw.text((txt_x, txt_y), barcode_val, fill='black', font=font_regular)

    return img


def generate_label_pdf(label_data):
    """
    Sinh file PDF tem MES hoàn chỉnh 300 DPI và trả về dưới dạng io.BytesIO.
    """
    img = build_label_image(label_data)
    pdf_buffer = io.BytesIO()
    img.save(pdf_buffer, format="PDF", resolution=300.0)
    pdf_buffer.seek(0)
    return pdf_buffer

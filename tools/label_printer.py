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

# ══════════════════════════════════════════════════════════════════════════════
# CẤU HÌNH THÔNG SỐ KỸ THUẬT LINH ĐỘNG TỪ BẢNG KVMES.MATERIAL_RESOURCE_CONFIG
# ══════════════════════════════════════════════════════════════════════════════

_CONFIG_CACHE = {}
_CONFIG_CACHE_TIMESTAMP = 0
_CONFIG_CACHE_TTL = 60  # Cache 60 giây trong bộ nhớ để tối ưu hiệu năng in ấn


def normalize_spec_key(k: str) -> str:
    """Chuẩn hóa khóa thông số kỹ thuật (bỏ dấu gạch nối, khoảng trắng, viết thường)."""
    import re
    return re.sub(r'[\s_\-\/]+', '', str(k or '').lower().strip())


def load_material_resource_configs() -> dict:
    """
    Truy vấn cấu hình động 100% từ bảng kvmes.material_resource_config:
    SELECT product_type, config, updated_at, updated_by, source
        FROM kvmes.material_resource_config;
    """
    try:
        import json
        from db_execute import execute_pg_select_query, execute_pg_dev_select_query
        query = """
            SELECT product_type, config, updated_at, updated_by, source
            FROM kvmes.material_resource_config;
        """
        rows, _ = execute_pg_select_query(query)
        if not rows:
            rows, _ = execute_pg_dev_select_query(query)
        if not rows:
            return {}

        config_map = {}
        for row in rows:
            ptype = str(row[0] or '').strip().upper()
            if not ptype:
                continue
            raw_cfg = row[1]
            if isinstance(raw_cfg, str):
                try:
                    raw_cfg = json.loads(raw_cfg)
                except Exception:
                    continue
            if not isinstance(raw_cfg, dict):
                continue

            req_labels = raw_cfg.get('required-labels') or raw_cfg.get('required_labels') or []
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


def get_material_resource_config(force_refresh: bool = False) -> dict:
    """Lấy danh mục cấu hình in tem động từ bảng kvmes.material_resource_config (Cache 60s)."""
    global _CONFIG_CACHE, _CONFIG_CACHE_TIMESTAMP
    now = time.time()
    if not force_refresh and _CONFIG_CACHE and (now - _CONFIG_CACHE_TIMESTAMP < _CONFIG_CACHE_TTL):
        return _CONFIG_CACHE

    cfg = load_material_resource_configs()
    if cfg:
        _CONFIG_CACHE = cfg
        _CONFIG_CACHE_TIMESTAMP = now
    return _CONFIG_CACHE


def get_gitlab_label_config(force_refresh: bool = False) -> dict:
    """Tương thích ngược với các module gọi get_gitlab_label_config()."""
    return get_material_resource_config(force_refresh=force_refresh)


class DynamicRequiredLabels(dict):
    """Truy xuất danh mục thông số kỹ thuật động theo thời gian thực từ bảng material_resource_config."""
    def __getitem__(self, key):
        cfg = get_material_resource_config()
        return cfg.get(str(key or '').strip().upper(), [])

    def get(self, key, default=None):
        cfg = get_material_resource_config()
        val = cfg.get(str(key or '').strip().upper())
        return val if val is not None else default

    def __contains__(self, key):
        cfg = get_material_resource_config()
        return str(key or '').strip().upper() in cfg

    def items(self):
        return get_material_resource_config().items()

    def keys(self):
        return get_material_resource_config().keys()

    def values(self):
        return get_material_resource_config().values()


# Đối tượng Dynamic thay thế dictionary tĩnh
PRODUCT_TYPE_REQUIRED_LABELS = DynamicRequiredLabels()


def parse_recipe_specs(note_list, product_type: str = None, label_config: dict = None):
    """
    Trích xuất danh sách thông số kỹ thuật chuẩn MES:
    - Sử dụng linh động 100% từ bảng kvmes.material_resource_config theo product_type.
    - Hiển thị chính xác các trường và nhãn tiếng Việt được cấu hình cho product_type đó.
    - Nếu trong recipe.note có giá trị thì điền vào, nếu không có giá trị thì để trống "" đúng theo tem thực tế.
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

    active_config = label_config if label_config is not None else get_material_resource_config()
    req_labels = active_config.get(clean_pt, [])

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

            # Lấy nhãn tiếng Việt trực tiếp từ database kvmes.material_resource_config
            display_label = label_vi if label_vi else req_key.replace('-', ' ').title()
            specs.append((display_label, val))
        return specs

    # Dự phòng: Nếu product_type hoàn toàn không có trong kvmes.material_resource_config
    for norm_k, (k_orig, v_orig) in parsed_notes.items():
        specs.append((k_orig.replace('-', ' ').title(), v_orig))

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

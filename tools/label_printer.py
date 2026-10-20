# -*- coding: utf-8 -*-
"""
KDMES TOOL - Module in lại tem & xuất PDF chuẩn MES (Code 39, Phông Arial 12pt, Biểu mẫu 2L-00-014)
Tự động trích xuất thông số kỹ thuật Dynamic theo recipe của đơn điều động.
Tối ưu chiều dài và khoảng cách vạch barcode chuẩn công nghiệp để máy PDA quét dễ dàng.
"""

import io
import os
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
    '-': 'NWNNNNNNW', '.': 'WWNNNNNNN', ' ': 'NWWNNNNNN', '$': 'NWNWNWNNN',
    '/': 'NWNWNNNWN', '+': 'NWNNNWNWN', '%': 'NNNWNWNWN', '*': 'NWNNWNWNN'
}

# Từ điển ánh xạ thông số kỹ thuật tiếng Anh trong recipe note sang tiếng Việt chuẩn
SPEC_KEY_TRANSLATIONS = {
    'product code': 'MSTP',
    'product Code': 'MSTP',
    'tire size': 'Quy cách',
    'width': 'Độ rộng',
    'thickness': 'Độ dày',
    'angle': 'Góc độ',
    'attachment-position': 'Phương thức dán',
    'eco-friendly-oil': 'Dầu bảo vệ môi trường',
    'working side': 'Hướng làm việc',
    'opposite working side': 'Hướng đối diện',
    'direction': 'Hướng 1B/2B',
    'color line': 'Đường màu',
    'color-line': 'Đường màu',
    'weight': 'Trọng lượng',
    'total-weight': 'Tổng trọng lượng',
    'gross weight': 'Trọng lượng tổng',
    'net weight': 'Trọng lượng tịnh',
    'GC-width': 'Bề rộng GC',
    'tread pattern': 'Hoa lốp',
    'hump width': 'Bề rộng gù',
    'spray-content': 'Chất quét',
    'middle-runner-thickness': 'Độ dày runner giữa',
    'middle-runner-width': 'Bề rộng runner giữa',
    'up-runner-thickness': 'Độ dày runner trên',
    'up-runner-width': 'Bề rộng runner trên',
    'bead-Filler-high': 'Chiều cao tanh',
    'bead-Filler-thickenss': 'Độ dày tanh',
    'bead-Filler-width': 'Bề rộng tanh',
    'flipper- width': 'Bề rộng flipper',
    'mooney spec': 'Tiêu chuẩn Mooney',
}

def parse_recipe_specs(note_list):
    """
    Trích xuất danh sách thông số kỹ thuật dynamic từ cột recipe.note.
    Trả về list các tuple (label_tiếng_việt, giá_trị).
    """
    specs = []
    if not note_list:
        return specs

    for item in note_list:
        if not item or not isinstance(item, str):
            continue
        cleaned = item.strip()
        if not cleaned:
            continue
        if ':' in cleaned:
            k, v = cleaned.split(':', 1)
            k = k.strip()
            v = v.strip()
            label = SPEC_KEY_TRANSLATIONS.get(k, k.replace('-', ' ').title())
            specs.append((label, v))
        else:
            specs.append((cleaned, ''))
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
    Dựng hình ảnh con tem hoàn chỉnh chuẩn MES:
    - Font size: 12pt Arial (đúng chuẩn thiết kế biểu mẫu).
    - Biểu mẫu 2L-00-014 ở góc trên bên phải.
    - Cột 1 (nhãn): ~30% chiều rộng bảng (đủ cho nhãn dài nhất).
    - Cột 2 (giá trị & barcode): ~70% chiều rộng bảng, barcode trải dài và vạch dày, PDA quét siêu nhạy.
    """
    dpi = 300.0
    font_regular, font_bold, font_code = get_arial_fonts(font_size_pt=12, dpi=dpi)

    col1_w = 480
    col2_w = 1140
    table_w = col1_w + col2_w # 1620px
    margin_x = 40
    table_top = 75
    canvas_w = table_w + 2 * margin_x # 1700px

    normal_row_h = 70
    barcode_row_h = 165

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

    # Tính toán chiều cao tự co giãn dựa trên số lượng dòng thực tế
    total_table_h = len(rows) * normal_row_h + barcode_row_h
    canvas_h = table_top + total_table_h + 35

    img = Image.new('RGB', (canvas_w, canvas_h), 'white')
    draw = ImageDraw.Draw(img)

    # Vẽ mã form 2L-00-014 góc trên bên phải
    draw.text((canvas_w - margin_x - 170, 25), "2L-00-014", fill='black', font=font_code)

    cur_y = table_top
    border_color = (0, 0, 0)
    line_w = 2

    # Vẽ từng dòng thông tin (Font size 12pt Arial)
    for lbl, val in rows:
        # Đường viền ô
        draw.rectangle([margin_x, cur_y, margin_x + table_w, cur_y + normal_row_h], outline=border_color, width=line_w)
        # Đường kẻ dọc phân cách 2 cột
        draw.line([margin_x + col1_w, cur_y, margin_x + col1_w, cur_y + normal_row_h], fill=border_color, width=line_w)

        # Chữ cột 1 (Tên trường)
        draw.text((margin_x + 14, cur_y + 12), lbl, fill='black', font=font_regular)

        # Chữ cột 2 (Giá trị)
        draw.text((margin_x + col1_w + 16, cur_y + 12), str(val), fill='black', font=font_regular)

        cur_y += normal_row_h

    # Vẽ dòng Mã vạch (Dòng cuối cùng)
    draw.rectangle([margin_x, cur_y, margin_x + table_w, cur_y + barcode_row_h], outline=border_color, width=line_w)
    draw.line([margin_x + col1_w, cur_y, margin_x + col1_w, cur_y + barcode_row_h], fill=border_color, width=line_w)
    draw.text((margin_x + 14, cur_y + int(barcode_row_h / 2) - 24), "Mã vạch", fill='black', font=font_regular)

    barcode_val = str(label_data.get("barcode", "") or "").strip().upper()
    if barcode_val:
        # Tính toán độ rộng vạch tối ưu: ưu tiên narrow=3, wide=8 để vạch dày, nét rõ, PDA quét siêu nhạy
        target_narrow = 3
        target_wide = 8
        # Nếu barcode quá dài, tính độ rộng vạch tối đa vừa vặn cột 2 (không bao giờ < 2px)
        num_chars = len(barcode_val) + 2
        est_width = num_chars * (3 * target_wide + 7 * target_narrow) + target_narrow * 20
        if est_width > col2_w - 40:
            target_narrow = max(2, int((col2_w - 50) / (num_chars * 15)))
            target_wide = int(round(target_narrow * 2.67))

        bc_img = generate_code39(barcode_val, narrow_width=target_narrow, wide_width=target_wide, height=105)

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

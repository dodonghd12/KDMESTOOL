# -*- coding: utf-8 -*-
"""
KDMES TOOL - Module in lại tem & xuất PDF chuẩn MES (Code 39, Phông Arial, Biểu mẫu 2L-00-014)
Tự động trích xuất thông số kỹ thuật Dynamic theo recipe của đơn điều động.
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


def generate_code39(text, narrow_width=2, wide_width=5, height=65):
    """
    Sinh hình ảnh mã vạch Code 39 chuẩn công nghiệp.
    Bao gồm ký tự bắt đầu/kết thúc '*' và quiet zone hai đầu.
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
    quiet_zone = narrow_width * 8
    img_w = total_w + 2 * quiet_zone
    img = Image.new('RGB', (img_w, height), 'white')
    draw = ImageDraw.Draw(img)

    cur_x = quiet_zone
    for is_bar, w in elements:
        if is_bar:
            draw.rectangle([cur_x, 0, cur_x + w - 1, height - 1], fill='black')
        cur_x += w

    return img


def get_arial_fonts():
    """Lấy phông Arial từ hệ thống Windows hoặc fallback an toàn."""
    win_dir = os.environ.get('WINDIR', 'C:\\Windows')
    fonts_dir = os.path.join(win_dir, 'Fonts')
    arial_regular = os.path.join(fonts_dir, 'arial.ttf')
    arial_bold = os.path.join(fonts_dir, 'arialbd.ttf')

    try:
        font_header = ImageFont.truetype(arial_bold if os.path.exists(arial_bold) else arial_regular, 28)
        font_cell = ImageFont.truetype(arial_regular, 32)
        font_cell_bold = ImageFont.truetype(arial_bold if os.path.exists(arial_bold) else arial_regular, 32)
        font_bc_text = ImageFont.truetype(arial_bold if os.path.exists(arial_bold) else arial_regular, 28)
        return font_header, font_cell, font_cell_bold, font_bc_text
    except Exception:
        fallback = ImageFont.load_default()
        return fallback, fallback, fallback, fallback


def build_label_image(label_data):
    """
    Dựng hình ảnh con tem hoàn chỉnh với độ phân giải cao 300 DPI:
    - Biểu mẫu 2L-00-014 ở góc trên bên phải.
    - Bảng biểu 2 cột chuẩn phân cách bằng đường kẻ 2px.
    - Khối thông số cố định (Mã máy, Ngày SX, Hạn dùng, Số lượng, v.v.).
    - Khối thông số kỹ thuật động theo recipe.
    - Khối mã vạch Code 39 siêu nét, căn giữa.
    """
    font_header, font_cell, font_cell_bold, font_bc_text = get_arial_fonts()

    # Kích thước chiều rộng: 1180px (~100mm ở 300 DPI)
    canvas_w = 1180
    margin_x = 50
    table_top = 80
    table_w = canvas_w - 2 * margin_x
    normal_row_h = 72
    barcode_row_h = 135

    # 1. Danh sách các dòng cố định tiêu chuẩn (Dòng 1 đến 11)
    rows = [
        ("Mã máy", label_data.get("station", "") or ""),
        ("Mã máy tiếp theo", label_data.get("next_station", "next_station") or "next_station"),
        ("Mã sản phẩm", label_data.get("product_id", "") or ""),
        ("Lô sản xuất", label_data.get("lot_number", "") or ""),
        ("Ngày sản xuất", label_data.get("production_time", "") or ""),
        ("Ngày hết hạn", label_data.get("expiry_time", "") or ""),
        ("Số lượng", str(label_data.get("quantity", "") if label_data.get("quantity") is not None else "")),
        ("Tự kiểm điểm", "□ NG   OK"),
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
    canvas_h = table_top + total_table_h + 40

    img = Image.new('RGB', (canvas_w, canvas_h), 'white')
    draw = ImageDraw.Draw(img)

    # Vẽ mã form 2L-00-014 góc trên bên phải
    draw.text((canvas_w - margin_x - 145, 32), "2L-00-014", fill='black', font=font_header)

    # Chia tỷ lệ 2 cột: Cột 1 (Label) ~38%, Cột 2 (Value) ~62%
    col1_w = int(table_w * 0.38)
    col2_w = table_w - col1_w

    cur_y = table_top
    border_color = (0, 0, 0)
    line_w = 2

    # Vẽ từng dòng thông tin
    for lbl, val in rows:
        # Đường viền ô
        draw.rectangle([margin_x, cur_y, margin_x + table_w, cur_y + normal_row_h], outline=border_color, width=line_w)
        # Đường kẻ dọc phân cách 2 cột
        draw.line([margin_x + col1_w, cur_y, margin_x + col1_w, cur_y + normal_row_h], fill=border_color, width=line_w)

        # Chữ cột 1 (Tên trường)
        draw.text((margin_x + 16, cur_y + 18), lbl, fill='black', font=font_cell)

        # Chữ cột 2 (Giá trị)
        draw.text((margin_x + col1_w + 16, cur_y + 18), str(val), fill='black', font=font_cell)

        cur_y += normal_row_h

    # Vẽ dòng Mã vạch (Dòng cuối cùng)
    draw.rectangle([margin_x, cur_y, margin_x + table_w, cur_y + barcode_row_h], outline=border_color, width=line_w)
    draw.line([margin_x + col1_w, cur_y, margin_x + col1_w, cur_y + barcode_row_h], fill=border_color, width=line_w)
    draw.text((margin_x + 16, cur_y + int(barcode_row_h / 2) - 16), "Mã vạch", fill='black', font=font_cell)

    barcode_val = str(label_data.get("barcode", "") or "").strip().upper()
    if barcode_val:
        # Sinh mã vạch Code 39
        bc_img = generate_code39(barcode_val, narrow_width=2, wide_width=5, height=65)
        # Kiểm tra nếu mã vạch quá rộng so với cột 2, tự động co tỷ lệ
        if bc_img.width > col2_w - 20:
            bc_img = generate_code39(barcode_val, narrow_width=1, wide_width=3, height=65)

        bc_x = margin_x + col1_w + int((col2_w - bc_img.width) / 2)
        bc_y = cur_y + 14
        img.paste(bc_img, (max(margin_x + col1_w + 10, bc_x), bc_y))

        # In chuỗi mã vạch bên dưới vạch barcode
        bbox = draw.textbbox((0, 0), barcode_val, font=font_bc_text)
        txt_w = bbox[2] - bbox[0]
        txt_x = margin_x + col1_w + int((col2_w - txt_w) / 2)
        txt_y = bc_y + bc_img.height + 6
        draw.text((txt_x, txt_y), barcode_val, fill='black', font=font_bc_text)

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

from tkinter import messagebox
from datetime import datetime, timezone, timedelta
from dateutil import parser
from tkinter import ttk
import tkinter as tk
import pytz
import base64, os, json, socket, ast, re

############################################################################################################################################################

APP_VERSION = "1.5.1"
default_language = "vi"
VN_TZ = pytz.timezone('Asia/Ho_Chi_Minh')

# Từ điển ngôn ngữ
LANGUAGES = {
    "en": {
        # Cửa sổ chính
        "root_title": "KD MES Tool",
        "label_barcode": "Barcode",
        "label_product_id": "Product ID",
        "label_station": "Station",
        "processing_window_label": "Processing, please wait...",
        # "button_search": "Search",
        "button_update_standing_time": "Update Standing Time",
        "button_update_quantity": "Update Quantity",
        "button_update_expiry_time": "Update Expiry Time",
        "button_feed_records": "Feed Records",
        "button_search_product_id_pg": "Search by Product ID",
        "button_collect_records": "Collect Records",
        # "button_show_details": "Detail",

        # Cửa sổ thêm vật liệu
        "add_material_window_title": "Add Material",
        "label_department_id": "Department ID",
        "label_product_type": "Product Type",
        "label_material_product_id": "Product ID",
        "label_material_grade": "Grade",
        "label_quantity": "Quantity",
        "label_unit_of_measurement": "Measurement unit",
        "label_lot_number": "Lot number",
        "label_created_at": "Manufacturing Date",
        "label_expired_at": "Expiration date",
        "label_warehouse_type": "Warehouse type",
        "label_warehouse_id": "Warehouse ID",
        "button_add": "Add",

        # thông báo
        "message_box_info_title": "Info",
        "message_box_info_success_title": "Success",
        "message_box_error_title": "Error",
        "message_box_ask_title": "Ask",
        "message_box_warning_title": "Warning",
        "invalid_validate_tool_availability_file": "Invalid Validate Tool Availability File",
        "cant_read_validate_tool_availability_file": "Cannot read Validate Tool Availability File",
        "tool_not_available": "The tool is not Available at the moment",
        "invalid_login_error": "Invalid User ID or Password.",
        "missing_info_login_error": "Please enter both User ID and Password.",
        "database_error": "Database Error",
        "database_update_error": "Update fail!",
        "logout_ask": "Are you sure you want to Logout?",
        "empty_barcode_error": "Empty Barcode!",
        "invalid_barcode_error": "Invalid barcode",
        "missing_oid_warning": "Need to search Barcode first!",
        "update_ask": "Are you sure you want to Update?",
        "insert_ask": "Are you sure you want to Insert?",
        "delete_ask": "Are you sure you want to Delete?",
        "standing_time_update_info": "Material standing time updated successfully.",
        "quantity_update_info": "Material Quantity updated successfully.",
        "material_insert_info": "Material inserted successfully.",
        "empty_product_id_error": "Empty Product ID!",
        "empty_station_error": "Empty station!",
        "invalid_feed_records_id_error": "Invalid Feed records ID",
        "invalid_work_order_error": "Invalid Work order",
        "invalid_product_id_error": "Invalid Product ID",
        "invalid_recipe_error": "Invalid Recipe",
        "none_of_row_selected_error": "None of row selected.",
        "recipe_delete_info": "Deleted all recipes from the Excel file",
        "upload_load_info": "Upload successful!",
        "no_upload_file_error": "Not uploaded the file yet",
        "processing_wait_info": "Processing, please wait...",
        "close_file_before_process_warning": "Please close the file before proceeding",
        "insert_material_85_warning": "There is no more data that needs to be transferred from 92 to 85",
        "work_order_status_update_info": "Work Order Status updated successfully.",
        "work_order_status_error": "The MES code is not yet completed, it cannot be opened",
    },

    "vi": {
        # Cửa sổ chính
        "root_title": "KD MES Tool",
        "label_barcode": "Mã barcode",
        "label_product_id": "Quy Cách",
        "label_station": "Công trình",
        "processing_window_label": "Đang xử lý, vui lòng chờ...",
        # "button_search": "Tìm kiếm",
        "button_update_standing_time": "Cập nhật Th.gian chờ",
        "button_update_quantity": "Cập nhật số lượng",
        "button_update_expiry_time": "Cập nhập Th.gian hết hạn",
        "button_feed_records": "Lịch sử quét tem",
        "button_search_product_id_pg": "Tìm theo quy cách",
        "button_collect_records": "Lịch sử Mã MES",
        # "button_show_details": "Xem chi tiết",

        # Cửa sổ thêm vật liệu
        "add_material_window_title": "Thêm vật liệu",
        "label_department_id": "Mã bộ phận",
        "label_product_type": "Loại sản phẩm",
        "label_material_product_id": "Quy cách",
        "label_material_grade": "Cấp độ",
        "label_quantity": "Số lượng",
        "label_unit_of_measurement": "Đơn vị đo lường",
        "label_lot_number": "Số Lô",
        "label_created_at": "Ngày sản xuất",
        "label_expired_at": "Ngày hết hạn",
        "label_warehouse_type": "Loại kho",
        "label_warehouse_id": "Mã kho",
        "button_add": "Thêm",

        # thông báo
        "message_box_info_title": "Thông tin",
        "message_box_info_success_title": "Thành Công",
        "message_box_error_title": "Lỗi",
        "message_box_ask_title": "Hỏi",
        "message_box_warning_title": "Cảnh báo",
        "invalid_validate_tool_availability_file": "File kiểm tra tính khả dụng không tồn tại",
        "cant_read_validate_tool_availability_file": "Không thể đọc được File kiểm tra tính khả dụng",
        "tool_not_available": "Tool không khả dụng ở thời điểm hiện tại",
        "invalid_login_error": "Tài Khoản hoặc mật khẩu không đúng.",
        "missing_info_login_error": "Vui lòng nhập đầy đủ Tài khoản và mật khẩu.",
        "database_error": "Lỗi cơ sở dữ liệu",
        "database_update_error": "Cập nhập thất bại!",
        "logout_ask": "Bạn có chắc chắn muốn đăng xuất?",
        "empty_barcode_error": "Thiếu Barcode!",
        "invalid_barcode_error": "Barcode không tồn tại",
        "missing_oid_warning": "Cần tìm kiếm Barcode trước!",
        "update_ask": "Bạn có chắc chắn muốn cập nhật không?",
        "insert_ask": "Bạn có chắc chắn muốn thực hiện không?",
        "delete_ask": "Bạn có chắc chắn muốn xóa không?",
        "standing_time_update_info": "Thời gian chờ của vật liệu được cập nhật thành công.",
        "quantity_update_info": "Số lượng của vật liệu được cập nhật thành công.",
        "material_insert_info": "Thêm nguyên vật liệu thành công.",
        "empty_product_id_error": "Thiếu Quy Cách!",
        "empty_station_error": "Thiếu trạm!",
        "invalid_feed_records_id_error": "Lịch sử quét tem không tồn tại",
        "invalid_work_order_error": "Đơn điều động không tồn tại",
        "invalid_recipe_error": "Quy cách không tồn tại",
        "invalid_product_id_error": "Quy Cách không tồn tại",
        "none_of_row_selected_error": "Chưa chọn hàng dữ liệu.",
        "recipe_delete_info": "Đã xóa toàn bộ recipe từ file excel",
        "upload_load_info": "Upload thành công!",
        "no_upload_file_error": "Chưa upload file",
        "processing_wait_info": "Đang xử lý, vui lòng chờ...",
        "close_file_before_process_warning": "Vui lòng đóng file trước khi thực hiện",
        "insert_material_85_warning": "Không còn liệu cần chuyển từ 92 qua 85",
        "work_order_status_update_info": "Mã Mes được cập nhập thành công",
        "work_order_status_error": "Mã mes chưa hoàn thành, không thể mở lại mã mes",
    }
}

############################################################################################################################################################

config_cache = None
config_date_modified = None 

############################################################################################################################################################
# Hàm cập nhật ngôn ngữ
def update_language(language):
    global default_language
    default_language = language

    from ui_components import (
        root,
        label_barcode,
        label_product_id,
        label_station,
        # button_search,
        button_update_standing_time,
        button_update_quantity,
        button_update_expiry_time,
        button_search_product_id_pg,
        button_feed_records,
        button_collect_records,
        # button_show_details,
        add_material_window,
        label_department_id,
        label_product_type,
        label_material_product_id,
        label_material_grade,
        label_quantity,
        label_unit_of_measurement,
        label_lot_number,
        label_created_at,
        label_expired_at,
        label_warehouse_type,
        label_warehouse_id,
        button_add,
    )

    # Lấy từ điển ngôn ngữ
    lang_dict = LANGUAGES.get(language, LANGUAGES["en"])

    # Cập nhật menu bar

    # Cập nhật label và button
    root.title(lang_dict["root_title"])
    label_barcode.config(text=lang_dict["label_barcode"])
    label_product_id.config(text=lang_dict["label_product_id"])
    label_station.config(text=lang_dict["label_station"])
    # button_search.config(text=lang_dict["button_search"])
    button_update_standing_time.config(text=lang_dict["button_update_standing_time"])
    button_update_quantity.config(text=lang_dict["button_update_quantity"])
    button_update_expiry_time.config(text=lang_dict["button_update_expiry_time"])
    button_search_product_id_pg.config(text=lang_dict["button_search_product_id_pg"])
    button_feed_records.config(text=lang_dict["button_feed_records"])
    button_collect_records.config(text=lang_dict["button_collect_records"])
    # button_show_details.config(text=lang_dict["button_show_details"])

    # Nếu cửa sổ thêm vật liệu mở, cập nhật nội dung
    if add_material_window.winfo_exists():
        add_material_window.title(lang_dict["add_material_window_title"])
        label_department_id.config(text=lang_dict["label_department_id"])
        label_product_type.config(text=lang_dict["label_product_type"])
        label_material_product_id.config(text=lang_dict["label_material_product_id"])
        label_material_grade.config(text=lang_dict["label_material_grade"])
        label_quantity.config(text=lang_dict["label_quantity"])
        label_unit_of_measurement.config(text=lang_dict["label_unit_of_measurement"])
        label_lot_number.config(text=lang_dict["label_lot_number"])
        label_created_at.config(text=lang_dict["label_created_at"])
        label_expired_at.config(text=lang_dict["label_expired_at"])
        label_warehouse_type.config(text=lang_dict["label_warehouse_type"])
        label_warehouse_id.config(text=lang_dict["label_warehouse_id"])
        button_add.config(text=lang_dict["button_add"])
    
def display_result_as_table(result, column_names):
    from ui_components import treeview, row_count_label

    for row in treeview.get_children():
        treeview.delete(row)

    treeview["columns"] = column_names
    treeview["show"] = "headings"

    for col in column_names:
        treeview.heading(col, text=col)

    for row in result:
        formatted_row = []
        for value in row:
            if isinstance(value, str):
                parsed = None
                
                try:
                    parsed = json.loads(value)
                except Exception:
                    try:
                        cleaned = re.sub(r"\\+", "", value)
                        parsed = ast.literal_eval(cleaned)
                    except Exception:
                        pass
                
                if parsed is not None:
                    value = json.dumps(parsed, indent=2, ensure_ascii=False)

            formatted_row.append(value)

        treeview.insert("", "end", values=formatted_row)

    row_count_label.config(text=f"Số dòng: {len(treeview.get_children())}")

def require_valid_tool(func):
    from functools import wraps
    from event_handlers import validate_tool

    @wraps(func)
    def wrapper(*args, **kwargs):
        if not validate_tool():
            return None
        return func(*args, **kwargs)
    return wrapper

def display_result_as_table_mysql(result, column_names):
    from ui_components import treeview

    for row in treeview.get_children():
        treeview.delete(row)
    
    treeview["columns"] = column_names
    for col in column_names:
        treeview.heading(col, text=col)

    for row in result:
        cleaned_row = [clean_data(value) for value in row]  # Clean data before display
        treeview.insert("", "end", values=cleaned_row)

def clean_data(value):
    if isinstance(value, str):
        return value.replace("'", "").replace("(", "").replace(")", "").strip()
    return value

# Chuyển nội dung text box thành uppercase
def convert_to_uppercase(var_name, index, mode):
    from ui_components import barcode_var, product_id_var, station_var

    widget_map = {
        str(barcode_var): barcode_var,
        str(product_id_var): product_id_var,
        str(station_var): station_var,
    }

    for var in widget_map.values():
        if var._name == var_name:
            value = var.get()
            if value != value.upper():
                var.set(value.upper())
            break

def show_about():
    messagebox.showinfo("About", f"Tool Version: {APP_VERSION}")

# Hàm kiểm tra đầu vào chỉ cho phép nhập số
def validate_quantity_input(char):
    return char.isdigit() or char == ""

def convert_iso_datetime(value):
    if not value:
        return value

    try:
        dt = parser.isoparse(value)

        if dt.tzinfo:
            dt = dt.astimezone(VN_TZ)

        return dt.strftime('%Y-%m-%d %H:%M:%S')

    except Exception as e:
        return value
    
def validate_entry_max_length(value, max_length):
    return len(value) <= int(max_length)

def validate_required(entries):
    is_valid = True
    empty_entries = []

    for key, entry in entries.items():
        if not entry.get():
            empty_entries.append(key)
            is_valid = False
    
    if empty_entries:
        error_message = "Please fill in the following fields:\n"
        for key in empty_entries:
            error_message += f"- {key}\n"
        messagebox.showerror("Validation Error", error_message)
    
    return is_valid

def message_box_show_info(title, message):
    global default_language

    lang_dict = LANGUAGES.get(default_language, LANGUAGES["en"])
    messagebox.showinfo(lang_dict.get(title, "Info"), lang_dict.get(message, "Operation was successful"))

def message_box_show_error(title, message):
    global default_language

    lang_dict = LANGUAGES.get(default_language, LANGUAGES["en"])
    messagebox.showerror(lang_dict.get(title, "Error"), lang_dict.get(message, "An error occurred"))

def message_box_ask(title, message):
    global default_language

    lang_dict = LANGUAGES.get(default_language, LANGUAGES["en"])
    return messagebox.askyesno(lang_dict.get(title, "Ask"), lang_dict.get(message, "Are you sure?"))

def message_box_show_warning(title, message):
    global default_language

    lang_dict = LANGUAGES.get(default_language, LANGUAGES["en"])
    return messagebox.showwarning(lang_dict.get(title, "Warning"), lang_dict.get(message, "Warning!!!"))

def is_file_open(file_path):
    if not os.path.exists(file_path):
        return False

    try:
        f = open(file_path, "r+")
        f.close()
        return False
    except IOError:
        return True
    
def auto_resize_columns(tree):
    for col in tree["columns"]:
        max_width = max([len(str(tree.set(item, col))) for item in tree.get_children()] + [len(col)])
        tree.column(col, width=max_width*10)

def normalize_pg_values(row):
    new_row = []
    for val in row:
        if val is None:
            new_row.append(None)
            continue

        if val == [] or val == "[]":
            new_row.append("{}")
            continue

        if isinstance(val, list):
            try:
                pg_array = "{" + ",".join(str(v) for v in val) + "}"
                new_row.append(pg_array)
            except Exception:
                new_row.append("{}")
            continue

        new_row.append(val)
    return tuple(new_row)

def convert_timestamp(data, column_names=None, target_columns=None):

    def convert_single(value):
        if not value or not isinstance(value, (int, float)):
            return value

        ts = int(value)
        if ts > 1e18:   # nanosecond
            ts = ts / 1e9
        elif ts > 1e15: # microsecond
            ts = ts / 1e6
        elif ts > 1e12: # millisecond
            ts = ts / 1e3
        else:           # giây
            ts = ts

        tz = timezone(timedelta(hours=7))
        dt = datetime.fromtimestamp(ts, tz)
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
    global config_cache, config_date_modified

    encoded_path = "XFwxOTguMS4xMC4yXFZpdGluaFxUaHVcUVVBTiBUUk9ORyBLSE9ORyBYT0FcY29uZmlnLmpzb24="
    config_path = base64.b64decode(encoded_path).decode("utf-8")
    
    if not os.path.exists(config_path):
        message_box_show_error("message_box_error_title", "invalid_validate_tool_availability_file")
        config_cache = {}

    if config_cache is None:
        try:
            with open(config_path, "r") as f:
                config_cache = json.load(f)
            config_date_modified = os.path.getmtime(config_path)

        except Exception:
            message_box_show_error("message_box_error_title", "cant_read_validate_tool_availability_file")
            config_cache = {}
    
    else:
        latest_config_date_modified = os.path.getmtime(config_path)

        if latest_config_date_modified != config_date_modified:
            try:
                with open(config_path, "r") as f:
                    config_cache = json.load(f)

            except Exception:
                message_box_show_error("message_box_error_title", "cant_read_validate_tool_availability_file")
                config_cache = {}

    return config_cache.get(key, [])

def clear_treeview(treeview):
    for item in treeview.get_children():
        treeview.delete(item)
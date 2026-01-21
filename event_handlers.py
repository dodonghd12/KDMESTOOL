from tkinter import Text, messagebox, Toplevel, simpledialog, filedialog
import tkinter as tk
from tkinter import ttk
import json, openpyxl
from datetime import datetime, timezone, timedelta
import requests
import time
from tkcalendar import Calendar
import tkinter.font as tkFont
import base64, os, json, socket
import pytz

############################################################################################################################################################

from db_execute import execute_pg_select_query, execute_old_pg_select_query, execute_pg_update_query, execute_pg_insert_query
from utils import APP_VERSION, require_valid_tool, display_result_as_table, validate_required, convert_date_to_iso_format, message_box_show_info, message_box_show_error, message_box_ask, message_box_show_warning, is_file_open, auto_resize_columns, normalize_pg_values, convert_timestamp, get_config_data, clear_treeview

############################################################################################################################################################

current_details_window = None
delete_recipe_window = None
current_text_widget = None
material_oid = None
user_token = None
treeview_m3_clicked_selected_item = None
user_id = None
transfer_window = None

############################################################################################################################################################

def on_login_button_click(entry_user_id, entry_password):
    global user_id
    from ui_components import menu_bar

    if not entry_user_id or not entry_password:
        message_box_show_error("message_box_error_title", "missing_info_login_error")
        return

    user_id = entry_user_id.get()
    password = entry_password.get()

    if user_id:
        menu_bar.entryconfig("end", label=user_id)

    if not validate_tool():
        return
    
    if validate_user(user_id, password):
        login()
    else:
        message_box_show_error("message_box_error_title", "invalid_login_error")

def validate_tool():
    from ui_components import root
    
    tool_status = get_config_data("available")
    print(tool_status)
    if tool_status[0] == "N":
        message_box_show_error("message_box_error_title", "tool_not_available")
        root.after(100, root.destroy)
        return False
    
    tool_version = get_config_data("app_version")
    print(tool_version)
    if not tool_version[0] == APP_VERSION:
        messagebox.showerror("Lỗi", f"Phiên bản của bạn đang sử dụng ({APP_VERSION})\nVui lòng cập nhập phiên bản mới nhất ({tool_version[0]})")
        root.after(100, root.destroy)
        return False

    return True

def validate_user(user_id, password):
    global user_token

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
        response = requests.post(url, headers = headers, json = data, verify = False)
        response_data = response.json()
        if response_data['data']:
            user_token = response_data['data']['token']
            return True
        
    except Exception:
        return False

def login():
    from ui_components import login_window, root
    login_window.withdraw()
    root.deiconify()

def logout():    
    from ui_components import login_window, root
    response = message_box_ask("message_box_ask_title", "logout_ask")
    if response:
        root.withdraw()
        login_window.deiconify()
    else:
        return

def toggle_password_visibility():
    from ui_components import entry_password, eye_icon
    if entry_password.cget('show') == '*':
        entry_password.config(show='')
        eye_icon.config(text="👁️")
    else:
        entry_password.config(show='*')
        eye_icon.config(text="🙈")

# Thêm sự kiện nhấn Enter trong entry_password để thực hiện đăng nhập
def on_password_enter(entry_user_id, entry_password):
    on_login_button_click(entry_user_id, entry_password)

############################################################################################################################################################

@require_valid_tool
def add_material(add_material_entries):
    from ui_components import add_material_window, entry_barcode
    global user_token

    # Lấy giá trị từ các entry trong add_material_entries
    product_type = add_material_entries['product_type'].get()
    product_id = add_material_entries['product_id'].get()
    material_grade = add_material_entries['material_grade'].get()
    quantity = add_material_entries['quantity'].get()
    unit_of_measurement = add_material_entries['unit_of_measurement'].get()
    lot_number = add_material_entries['lot_number'].get()
    created_at = convert_date_to_iso_format(add_material_entries['created_at'].get())
    expired_at = convert_date_to_iso_format(add_material_entries['expired_at'].get())
    warehouse_type = add_material_entries['warehouse_type'].get()
    warehouse_id = add_material_entries['warehouse_id'].get()

    if not user_token:
        messagebox.showerror("Validation Error", "token")

    if not validate_required(add_material_entries):
        add_material_window.attributes("-topmost", 1)
        add_material_window.attributes("-topmost", 0)  
    else:
        response = messagebox.askyesno("Add", "Are you sure you want to Add material?")
        if response:
            url = f'https://kv2mes.kv.kenda.com.tw:8810/api/resource/material/stock'

            headers = {
                'accept': 'application/json, text/plain, */*',
                'x-mui-auth-key': user_token
            }
            
            data = {
                "warehouse": {
                    "ID": warehouse_type,
                    "location": warehouse_id
                },

                "resource": {
                    "productType": product_type,
                    "productID": product_id,
                    "grade": material_grade,
                    "quantity": quantity,
                    "unit": unit_of_measurement,
                    "lotNumber": lot_number,
                    "productionTime": created_at,
                    "expiryTime": expired_at
                }
            }

            try:
                stock_response = requests.post(url, headers=headers, json = data, verify=False)
                new_long_barcode = stock_response.json().get("data", {}).get("resourceID", "")

                messagebox.showinfo("Success", "Material Added successfully.\n")
                add_material_window.withdraw()

                # Gán giá trị của new_long_barcode vào entry_barcode
                new_long_barcode_response = messagebox.askyesno("Use", f"Are you sure you want to use this long barcode?\n {new_long_barcode}")
                if new_long_barcode_response:
                    entry_barcode.delete(0, tk.END)
                    entry_barcode.insert(0, new_long_barcode)

            except requests.RequestException as e:
                messagebox.showerror("Error", f"Failed to add product: {e}")

def show_add_material_window():
    from ui_components import add_material_window
    add_material_window.deiconify()

# Handle the close event of add_material_window
def on_add_material_window_close():
    from ui_components import add_material_window
    add_material_window.withdraw()

# Hàm xử lý sự kiện chọn Department ID
def on_department_id_change(event):
    from ui_components import department_id_var, entry_product_type

    department_id = department_id_var.get()
    if department_id:
        product_types = get_product_types(department_id)
        entry_product_type['values'] = product_types
        entry_product_type.current(None)

def get_product_types(department_id):
    global user_token

    url = f'https://kv2mes.kv.kenda.com.tw:8810/api/product/active-product-types/department-oid/{department_id}'
    headers = {
        'accept': 'application/json, text/plain, */*',
        'x-mui-auth-key': user_token
    }
    try:
        response = requests.get(url, headers=headers, verify=False)
        data = response.json()
        return [item['type'] for item in data.get('data', [])]
    except requests.RequestException as e:
        messagebox.showerror("Error", f"Failed to fetch product types: {e}")
        return []
    
# Hàm xử lý sự kiện chọn Department ID
def on_product_type_change(event):
    from ui_components import product_type_var, entry_material_product_id

    product_type = product_type_var.get()
    if product_type:
        product_ids = get_product_ids(product_type)
        entry_material_product_id['values'] = product_ids
        entry_material_product_id.current(None)

def get_product_ids(product_type):
    global user_token

    url = f'https://kv2mes.kv.kenda.com.tw:8810/api/product/active-products/product-type/{product_type}'
    headers = {
        'accept': 'application/json, text/plain, */*',
        'x-mui-auth-key': user_token
    }
    try:
        response = requests.get(url, headers=headers, verify=False)
        data = response.json()
        return [item for item in data.get('data', [])]
    except requests.RequestException as e:
        messagebox.showerror("Error", f"Failed to fetch product types: {e}")
        return []
    
############################################################################################################################################################

@require_valid_tool
def search_barcode(*args):
    from ui_components import barcode_var, treeview

    keyword = barcode_var.get().strip()
    if not keyword:
        for i in treeview.get_children():
            treeview.delete(i)
        return

    query = """
        SELECT *
        FROM kvmes.material_resource
        WHERE id ILIKE %s
        LIMIT 20;
    """
    result, column_names = execute_pg_select_query(query, (f"%{keyword}%",))

    convert_columns = ["expiry_time", "updated_at", "created_at", "standing_time"]
    result = convert_timestamp(result, column_names, convert_columns)
    
    display_result_as_table(result, column_names)

def on_type_search_barcode(*args):
    from ui_components import root

    if hasattr(root, "after_barcode"):
        root.after_cancel(root.after_barcode)
    root.after_barcode = root.after(300, search_barcode)

@require_valid_tool
def search_work_order(*args):
    from ui_components import product_id_var, treeview

    product_id = product_id_var.get().strip()

    if not product_id:
        for i in treeview.get_children():
            treeview.delete(i)
        return

    conditions = []
    params = []

    if product_id:
        conditions.append("information->>'product_id' LIKE %s")
        params.append(f"%{product_id}%")

    query = f"""
        SELECT id, recipe_id, station, reserved_date,
               status, process_type, department_id,
               process_name, reserved_sequence, information,
               updated_at, updated_by, created_at, created_by
        FROM kvmes.work_order
        WHERE {" AND ".join(conditions)}
        ORDER BY reserved_date DESC
        LIMIT 20;
    """
    result, column_names = execute_pg_select_query(query, tuple(params))

    convert_columns = ["updated_at", "created_at"]
    result = convert_timestamp(result, column_names, convert_columns)

    display_result_as_table(result, column_names)

def on_type_search_work_order(*args):
    from ui_components import root

    if hasattr(root, "after_work_order"):
        root.after_cancel(root.after_work_order)
    root.after_work_order = root.after(300, search_work_order)

@require_valid_tool
def search_site_content(*args):
    from ui_components import station_var, treeview

    station = station_var.get().strip()

    if not station:
        for i in treeview.get_children():
            treeview.delete(i)
        return

    params = [f"%{station}%"]

    query = """
        SELECT
            a.content::json -> 'slot' -> 'material' ->> 'resource_id' AS barcode,
            a.content::json -> 'slot' -> 'material' -> 'material' ->> 'id' AS product_id,
            wo.recipe_id,
            a.name,
            a.station,
            to_char(
                (
                    timestamp with time zone 'epoch'
                    + (a.updated_at::bigint / 1000) * interval '1 microsecond'
                ) AT TIME ZONE 'Asia/Ho_Chi_Minh',
                'YYYY-MM-DD HH24:MI:SS'
            ) AS updated_at_vn

            FROM kvmes.site_contents a 
            JOIN kvmes.work_order wo ON wo.status = '1' AND wo.station = a.station
            JOIN kvmes.recipe_process_definition rpd ON rpd.recipe_id = wo.recipe_id
            WHERE a.station LIKE %s
            AND a.name <> ''
            AND rpd.configs::jsonb @> jsonb_build_array(
                    jsonb_build_object('steps', jsonb_build_array(
                    jsonb_build_object('materials', jsonb_build_array(
                        jsonb_build_object('name', a.content::jsonb#>>'{slot,material,material,id}')
                    ))
                    ))
                )

            ORDER BY a.updated_at DESC
            LIMIT 50;
    """

    result, column_names = execute_pg_select_query(query, tuple(params))

    convert_columns = ["updated_at"]
    result = convert_timestamp(result, column_names, convert_columns)

    display_result_as_table(result, column_names)

def on_type_search_site_content(*args):
    from ui_components import root

    if hasattr(root, "after_site_content"):
        root.after_cancel(root.after_site_content)
    root.after_site_content = root.after(300, search_site_content)

def get_new_expiry_time(parent):
    dialog = tk.Toplevel(parent)
    dialog.title("Chọn ngày hết hạn")
    dialog.grab_set()
    dialog.minsize(400, 250)

    selected_datetime = None

    # CALENDAR FRAME
    cal_frame = ttk.Frame(dialog)
    cal_frame.pack(padx=15, pady=15, fill=tk.BOTH, expand=True)

    # Sửa date pattern thành dd/mm/y
    cal = Calendar(cal_frame, selectmode='day', date_pattern='dd/mm/y')
    cal.pack(fill=tk.BOTH, expand=True)

    # BUTTON FRAME
    btn_frame = ttk.Frame(dialog)
    btn_frame.pack(pady=15, fill=tk.X, padx=10)

    def on_confirm():
        nonlocal selected_datetime
        try:
            selected_datetime = cal.get_date()
        except Exception as e:
            messagebox.showerror("message_box_error_title", f"Lỗi khi chọn ngày: {str(e)}")
            return
        
        dialog.destroy()

    # Nút xác nhận
    btn_ok = ttk.Button(btn_frame, text="Xác nhận", command=on_confirm)
    btn_ok.pack(side=tk.RIGHT, padx=5)

    dialog.wait_window()
    return selected_datetime
  
@require_valid_tool  
def on_update_expiry_time_button_click(material_oid):
    from ui_components import root, treeview

    if not material_oid:
        message_box_show_warning("message_box_warning_title", "missing_oid_warning")
        return
    
    new_expiry_time = get_new_expiry_time(root)
    if new_expiry_time is None:
        return
    
    try:
        date_obj = datetime.strptime(new_expiry_time, "%d/%m/%Y")        # Chuyển chuỗi ngày thành datetime object với 00:00:00
        new_expiry_nanosecond_time = int(date_obj.timestamp() * 1e9)        # Chuyển thành timestamp (giây) và nhân 1e9 để lấy nanosecond
    except Exception as e:
        messagebox.showerror("Lỗi", f"Lỗi chuyển đổi thời gian: {str(e)}")
        return

    response = message_box_ask("message_box_ask_title", "update_ask")
    if response:
        clear_treeview(treeview)    
        query = "UPDATE kvmes.material_resource SET expiry_time = %s WHERE oid = %s"

        try:
            execute_pg_update_query(query, (new_expiry_nanosecond_time, material_oid,))
            message_box_show_info("message_box_info_success_title", "quantity_update_info")
        except Exception as e:
            message_box_show_error("message_box_error_title", "database_update_error")
    else:
        return

@require_valid_tool
def on_update_standing_time_button_click(material_oid):
    from ui_components import treeview
    if not material_oid:
        message_box_show_warning("message_box_warning_title", "missing_oid_warning")
        return
    
    try:
        select_created_at_query = "SELECT created_at FROM kvmes.material_resource WHERE oid = %s"
        result = execute_pg_select_query(select_created_at_query, (material_oid,))
        if not result:
            message_box_show_error("message_box_error_title", "database_error")
            return

        created_at_time = result[0][0][0]

    except Exception as e:
        message_box_show_error("message_box_error_title", f"Error retrieving created_at: {str(e)}")
        return
    
    response = message_box_ask("message_box_ask_title", "update_ask")
    if response:
        clear_treeview(treeview)
        try:
            query = "UPDATE kvmes.material_resource SET standing_time = %s WHERE oid = %s"
            execute_pg_update_query(query, (created_at_time, material_oid,))

            message_box_show_info("message_box_info_success_title", "standing_time_update_info")
            return
        
        except Exception as e:
            message_box_show_error("message_box_error_title", f"Error retrieving created_at: {str(e)}")
            return
    
    else:
        return

@require_valid_tool    
def on_update_quantity_button_click(material_oid):
    from ui_components import root, treeview

    if not material_oid:
        message_box_show_warning("message_box_warning_title", "missing_oid_warning")
        return
    
    new_quantity = simpledialog.askinteger("Update Quantity", "Enter new quantity:", parent=root, minvalue=0)
    if new_quantity is None:
        return
    if new_quantity < 0:
        messagebox.showerror("Error", "Quantity cannot be negative")
        return
        
    response = message_box_ask("message_box_ask_title", "update_ask")
    if response:
        clear_treeview(treeview)    
        query = "UPDATE kvmes.material_resource SET quantity = %s WHERE oid = %s"
        execute_pg_update_query(query, (float(new_quantity), material_oid,))

        message_box_show_info("message_box_info_success_title", "quantity_update_info")
    else:
        return

@require_valid_tool    
def on_insert_material_button_click(calendar):
    from ui_components import show_processing_window, treeview
    
    clear_treeview(treeview)
    date_str = calendar.get_date().strip()
    if not date_str:
        message_box_show_error("message_box_error_title", "empty_date_error")
        return
    
    messagebox.showwarning("Cảnh Báo", f"Bạn đang thực hiện chuyển liệu trong ngày\n {date_str}")

    response = message_box_ask("message_box_ask_title", "insert_ask")
    if not response:
        return

    tz = pytz.timezone('Asia/Bangkok')  # UTC+7
    start_datetime = tz.localize(datetime.strptime(f"{date_str} 00:00:00", "%Y-%m-%d %H:%M:%S"))
    end_datetime = tz.localize(datetime.strptime(f"{date_str} 23:59:59", "%Y-%m-%d %H:%M:%S"))
    params = [start_datetime, end_datetime]

    query = """
        SELECT *
        FROM kvmes.material_resource
        WHERE (info->'production_info'->>'production_time')::timestamptz BETWEEN %s AND %s
        AND quantity > '0'
        AND product_type IN('RUBBER','BEAD')
        AND length(product_id) <= 5
    """
    
    transfer_product_ids = get_config_data('product_ids')
    if transfer_product_ids:
        placeholders = ",".join(['%s'] * len(transfer_product_ids))
        query += f" AND product_id IN ({placeholders}) ORDER BY updated_at DESC"
        params.extend(transfer_product_ids)
    
    db92_result, db92_columns = execute_old_pg_select_query(query, tuple(params))
    if not db92_result:
        message_box_show_info("message_box_info_success_title", "insert_material_85_warning")
        return
    
    db92_ids = [row[db92_columns.index("id")] for row in db92_result]

    ids_placeholder = ",".join(["%s"] * len(db92_ids))
    check_query = f"SELECT id FROM kvmes.material_resource WHERE id IN ({ids_placeholder})"
    db85_existing, _ = execute_pg_select_query(check_query, tuple(db92_ids))
    db85_existing_ids = {row[0] for row in db85_existing}

    db92_result = [row for row in db92_result if row[db92_columns.index("id")] not in db85_existing_ids]

    failed_ids = []
    insert_ids = []

    processing_win = show_processing_window()
    
    for row in db92_result:
        id = row[db92_columns.index("id")]

        insert_ids.append(row)

        mr_query = "SELECT * FROM kvmes.material_resource WHERE id = %s"
        mr_result, mr_column_names = execute_old_pg_select_query(mr_query, (id,))
        if not mr_result:
            failed_ids.append(id)
            continue

        material_92_oid = mr_result[0][mr_column_names.index("oid")]
        feed_records_id = mr_result[0][mr_column_names.index("feed_records_id")]

        try:
            if isinstance(feed_records_id, list) and len(feed_records_id) > 0:    
                query_collect_record = "SELECT * FROM kvmes.collect_record WHERE resource_oid = %s"
                cr_result, cr_column_names = execute_old_pg_select_query(query_collect_record, (material_92_oid,))
                if not cr_result:
                    failed_ids.append(id)
                    continue

                work_order_id = cr_result[0][cr_column_names.index("work_order")]

                collect_record_2_query = "SELECT * FROM kvmes.collect_record WHERE work_order = %s"
                collect_record_2_result, collect_record_2_column_names = execute_old_pg_select_query(collect_record_2_query, (work_order_id,))

                batch_query = "SELECT * FROM kvmes.batch WHERE work_order = %s"
                batch_result, batch_column_names = execute_old_pg_select_query(batch_query, (work_order_id,))

                work_order_query = "SELECT * FROM kvmes.work_order WHERE id = %s"
                work_order_result, work_order_names = execute_old_pg_select_query(work_order_query, (work_order_id,))

                feed_record_result, feed_record_column_names = [], []
                if isinstance(feed_records_id, list) and len(feed_records_id) > 0:
                    feed_record_id = feed_records_id[0]
                    feed_record_query = "SELECT * FROM kvmes.feed_record WHERE id = %s"
                    feed_record_result, feed_record_column_names = execute_old_pg_select_query(feed_record_query, (feed_record_id,))

                tables_to_insert = [
                    ("kvmes.material_resource", mr_result, mr_column_names),
                    ("kvmes.collect_record", collect_record_2_result, collect_record_2_column_names),
                    ("kvmes.work_order", work_order_result, work_order_names),
                    ("kvmes.batch", [normalize_pg_values(r) for r in batch_result], batch_column_names),
                    ("kvmes.feed_record", feed_record_result, feed_record_column_names),
                ]

            else:
                tables_to_insert = [
                    ("kvmes.material_resource", mr_result, mr_column_names),
                ]

            for table, rows, cols in tables_to_insert:
                if rows:
                    try:
                        execute_pg_insert_query(table, rows, cols)
                    except Exception as e:
                        failed_ids.append(id)

        except Exception as e:
            failed_ids.append(id)
            continue
    
    if processing_win and processing_win.winfo_exists():
            processing_win.destroy()

    if insert_ids:
        display_result_as_table(insert_ids, db92_columns)
        message_box_show_info("message_box_info_success_title", "material_insert_info")   
    else:
        message_box_show_info("message_box_info_success_title", "insert_material_85_warning")

@require_valid_tool
def on_feed_records_button_click(material_oid):
    if not material_oid:
        message_box_show_warning("message_box_warning_title", "missing_oid_warning")
        return

    try:
        select_feed_records_id_query = "SELECT feed_records_id FROM kvmes.material_resource WHERE oid = %s"
        result = execute_pg_select_query(select_feed_records_id_query, (material_oid,))
        if not result:
            message_box_show_error("message_box_error_title", "database_error")
            return
        
        feed_records_id = result[0][0][0][0]

        try:
            query = "SELECT id as feed_records_id, operator_id, materials FROM kvmes.feed_record WHERE id = %s"
            result, column_names = execute_pg_select_query(query, (feed_records_id,))
            if result:
                display_result_as_table(result, column_names)
            else:
                message_box_show_error("message_box_error_title", "invalid_feed_records_id_error")
        
        except Exception as e:
            message_box_show_error("message_box_error_title", f"Error retrieving feed_records: {str(e)}")
            return
        
    except Exception as e:
        message_box_show_error("message_box_error_title", f"Error retrieving feed_records_id: {str(e)}")
        return

@require_valid_tool    
def on_collect_records_button_click(*args):
    from ui_components import treeview

    selected_item = treeview.selection()
    if not selected_item:
        message_box_show_error("message_box_warning_title", "none_of_row_selected_error")
        return
    
    work_order_id = treeview.item(selected_item[0], "values")[treeview["columns"].index("id")]

    try:
        query = """
            SELECT work_order, created_at, sequence, resource_oid, 
            lot_number, station, detail, oid 
            FROM kvmes.collect_record 
            WHERE work_order = %s 
            order by sequence asc
        """
        
        result, column_names = execute_pg_select_query(query, (work_order_id,))
        if not result:
            message_box_show_error("message_box_error_title", "invalid_work_order_error")
            return

        new_results = []
        new_column_names = ["barcode"] + list(column_names)

        convert_columns = ["expiry_time", "updated_at", "created_at", "standing_time"]
        result = convert_timestamp(result, column_names, convert_columns)

        for row in result:
            row_dict = dict(zip(column_names, row))
            material_oid = row_dict["resource_oid"]

            barcode_value = None
            if material_oid:
                barcode_query = "SELECT id FROM kvmes.material_resource WHERE oid = %s"
                barcode_result, _ = execute_pg_select_query(barcode_query, (material_oid,))
                if barcode_result:
                    barcode_value = barcode_result[0][0]
            
            row_list = list(row)

            new_results.append([barcode_value] + row_list)

        display_result_as_table(new_results, new_column_names)
        
    except Exception as e:
        message_box_show_error("message_box_error_title", f"Error retrieving feed_records: {str(e)}")
        return

@require_valid_tool    
def on_update_work_order_status_button_click(*args):
    from ui_components import treeview

    selected_item = treeview.selection()
    if not selected_item:
        message_box_show_error("message_box_warning_title", "none_of_row_selected_error")
        return
    
    work_order_id = treeview.item(selected_item[0], "values")[treeview["columns"].index("id")]
    work_order_status = treeview.item(selected_item[0], "values")[treeview["columns"].index("status")]
    if not work_order_status == '3':
        message_box_show_error("message_box_warning_title", "work_order_status_error")
        return

    response = message_box_ask("message_box_ask_title", "update_ask")
    if response:
        clear_treeview(treeview)    
        query = "UPDATE kvmes.work_order SET status = 5 WHERE id = %s"
        execute_pg_update_query(query, (work_order_id,))

        message_box_show_info("message_box_info_success_title", "work_order_status_update_info")
    else:
        return

@require_valid_tool    
def on_recipe_detail_button_click(*args):
    from ui_components import treeview

    selected_item = treeview.selection()
    if not selected_item:
        message_box_show_error("message_box_warning_title", "none_of_row_selected_error")
        return
    
    recipe_id = treeview.item(selected_item[0], "values")[treeview["columns"].index("recipe_id")]

    try:
        query = """
            SELECT recipe_id, product_id, 
                name, type,
                (configs::jsonb) AS configs
            FROM kvmes.recipe_process_definition 
            WHERE recipe_id = %s
        """
        
        result, column_names = execute_pg_select_query(query, (recipe_id,))
        if not result:
            message_box_show_error("message_box_error_title", "invalid_recipe_error")
            return

        display_result_as_table(result, column_names)
        
    except Exception as e:
        message_box_show_error("message_box_error_title", f"Error retrieving feed_records: {str(e)}")
        return

@require_valid_tool    
def on_double_click_show_details(*args):
    global current_details_window, current_text_widget
    from ui_components import treeview, root

    selected_item = treeview.selection()
    if not selected_item:
        message_box_show_error("message_box_error_title", "none_of_row_selected_error")
        return
    
    item_values = treeview.item(selected_item, "values")
    details_dict = dict(zip(treeview["columns"], item_values))

    details_json = json.dumps(details_dict, indent=4)    # Chuyển đổi thông tin chi tiết thành JSON

    if current_details_window and tk.Toplevel.winfo_exists(current_details_window):
        if current_text_widget is not None:
            current_text_widget.config(state="normal")
            current_text_widget.delete("1.0", "end")
            current_text_widget.insert("1.0", details_json)
            current_text_widget.config(state="disabled")
        current_details_window.lift()
    else:
        current_details_window = Toplevel(root)
        current_details_window.title("Material Details")

        current_text_widget = Text(current_details_window, wrap="word", width=60, height=20)    # Tạo Text widget trong cửa sổ mới
        current_text_widget.pack(padx=10, pady=10)
        current_text_widget.insert("1.0", details_json)    # Hiển thị JSON vào Text widget
        current_text_widget.config(state="disabled")

@require_valid_tool
def determine_treeview_result_type(treeview):
    columns = treeview["columns"]

    if "oid" in columns and "id" in columns:
        return "barcode"
    
    elif "recipe_id" in columns and "id" in columns:
        return "work_order"
    
    else:
        return ""

@require_valid_tool
def on_click_show_context_menu(event):
    global treeview_m3_clicked_selected_item
    from ui_components import treeview, treeview_m3_clicked_menu, barcode_context_functions, work_order_context_functions

    treeview_m3_clicked_selected_item = treeview.identify_row(event.y)
    if not treeview_m3_clicked_selected_item:
        return
    
    treeview_m3_clicked_menu.delete(0, tk.END)

    treeview.selection_set(treeview_m3_clicked_selected_item)
    treeview.focus(treeview_m3_clicked_selected_item)

    result_type = determine_treeview_result_type(treeview)

    if result_type == "barcode":
        try:
            item_id = treeview.item(treeview_m3_clicked_selected_item, "values")[treeview["columns"].index("oid")]
        except (IndexError, ValueError):
            return

        for label, func in barcode_context_functions.items():
            treeview_m3_clicked_menu.add_command(label=label, command=lambda f=func: f(item_id))
    
    else:
        try:
            item_id = treeview.item(treeview_m3_clicked_selected_item, "values")[treeview["columns"].index("recipe_id")]
        except (IndexError, ValueError):
            return
        
        for label, func in work_order_context_functions.items():
            treeview_m3_clicked_menu.add_command(label=label, command=lambda f=func: f(item_id))

    return treeview_m3_clicked_menu.post(event.x_root, event.y_root)

############################################################################################################################################################
# Add-on function

@require_valid_tool
def on_upload_excel_and_delete(file_path):
    from ui_components import show_processing_window
    failed_ids = []

    if is_file_open(file_path):
        message_box_show_warning("message_box_warning_title", "close_file_before_process_warning")
        return

    response = message_box_ask("message_box_ask_title", "delete_ask")
    if not response:
        return
    
    processing_win = show_processing_window()

    try:
        workbook = openpyxl.load_workbook(file_path)
        sheet = workbook.active

        row = 2
        while row <= sheet.max_row:
            recipe_id = sheet.cell(row=row, column=1).value
            if not recipe_id:
                row += 1
                continue

            try:
                delete_rpd = "DELETE FROM kvmes.recipe_process_definition WHERE recipe_id = %s"
                execute_pg_update_query(delete_rpd, (recipe_id,))

                delete_recipe = "DELETE FROM kvmes.recipe WHERE id = %s"
                execute_pg_update_query(delete_recipe, (recipe_id,))


                sheet.delete_rows(row, 1)
            except Exception:
                failed_ids.append(recipe_id)
                row += 1

        workbook.save(file_path)

        if processing_win and processing_win.winfo_exists():
            processing_win.destroy()

        if failed_ids:
            message_box_show_warning("message_box_warning_title", 
                f"Đã xử lý xong, nhưng các ID sau bị lỗi:\n{', '.join(map(str, failed_ids))}")
        else:
            message_box_show_info("message_box_info_success_title", "recipe_delete_info")

    except Exception as e:
        message_box_show_error("message_box_error_title", f"Không thể xử lý file Excel: {str(e)}")

@require_valid_tool
def open_delete_recipe_window():
    from ui_components import root
    global delete_recipe_window

    if delete_recipe_window is not None and delete_recipe_window.winfo_exists():
        delete_recipe_window.lift()
        delete_recipe_window.focus_force()
        return
    
    delete_recipe_window = tk.Toplevel()
    delete_recipe_window.title("Xóa Quy Cách")
    delete_recipe_window.update_idletasks()

    delete_recipe_window.transient(root)
    delete_recipe_window.grab_set()
    delete_recipe_window.focus_force()

    delete_recipe_window_height = 105
    delete_recipe_window_width = 445

    delete_recipe_screen_height = root.winfo_screenheight()
    delete_recipe_screen_width = root.winfo_screenwidth()

    delete_recipe_window_position_top = int(delete_recipe_screen_height / 2 - delete_recipe_window_height / 2)
    delete_recipe_window_position_left = int(delete_recipe_screen_width / 2 - delete_recipe_window_width / 2)
    delete_recipe_window.geometry(
        f"{delete_recipe_window_width}x{delete_recipe_window_height}+{delete_recipe_window_position_left}+{delete_recipe_window_position_top}")

    def on_close():
        global delete_recipe_window
        delete_recipe_window.destroy()
        delete_recipe_window = None

    delete_recipe_window.protocol("WM_DELETE_WINDOW", on_close)

    file_path_var = tk.StringVar(value="")

    def upload_file():
        filepath = filedialog.askopenfilename(
            title="Select Excel File",
            filetypes=[("Excel files", "*.xlsx *.xls")]
        )
        if filepath:
            file_path_var.set(filepath)
            message_box_show_info("message_box_info_success_title", "upload_load_info")

            delete_recipe_window.lift()
            delete_recipe_window.focus_force()

    def delete_action():
        filepath = file_path_var.get()
        if not filepath:
            message_box_show_error("message_box_error_title", "no_upload_file_error")
            return

        on_upload_excel_and_delete(filepath)

        delete_recipe_window.lift()
        delete_recipe_window.focus_force()

    file_entry = ttk.Entry(delete_recipe_window, textvariable=file_path_var, width=70, state="readonly", foreground="blue")
    file_entry.grid(row=0, column=0, padx=10, pady=5)

    upload_btn = ttk.Button(delete_recipe_window, text="Upload Excel", width=23, command=upload_file)
    upload_btn.grid(row=1, column=0, padx=10, pady=5)

    delete_btn = ttk.Button(delete_recipe_window, text="XÓA", width=20, style="delete.TButton", command=delete_action)
    delete_btn.grid(row=2, column=0, padx=10, pady=5)

    delete_recipe_window.lift()
    delete_recipe_window.focus_force()

@require_valid_tool
def open_transfer_by_date_window():
    global transfer_window
    from ui_components import root
    
    if transfer_window is not None and transfer_window.winfo_exists():
        transfer_window.lift()
        transfer_window.focus_force()
        return
    
    transfer_window = tk.Toplevel()
    transfer_window.title("Chuyển liệu theo ngày")
    transfer_window.resizable(False, False)

    transfer_window.transient(root)
    transfer_window.grab_set()
    transfer_window.focus_force()

    def on_close():
        global transfer_window
        if transfer_window is not None:
            transfer_window.destroy()
            transfer_window = None

    transfer_window.protocol("WM_DELETE_WINDOW", on_close)

    frame = ttk.Frame(transfer_window, padding=20)
    frame.pack(expand=True, fill="both")

    calendar = Calendar(frame, selectmode="day", date_pattern="yyyy-mm-dd")
    calendar.pack(pady=(5, 15))

    style = ttk.Style()
    style.configure(
        "Big.TButton", 
        font=("Segoe UI", 10, "bold"),
        padding=(15, 8)
    )

    transfer_btn = ttk.Button(
        frame,
        text="Chuyển liệu",
        style="Big.TButton",
        command=lambda: on_insert_material_button_click(calendar)
    )
    transfer_btn.pack(pady=(0, 5))

    transfer_window.update_idletasks()
    w = transfer_window.winfo_reqwidth()
    h = transfer_window.winfo_reqheight()
    x = (transfer_window.winfo_screenwidth() // 2) - (w // 2)
    y = (transfer_window.winfo_screenheight() // 2) - (h // 2)
    transfer_window.geometry(f"{w}x{h}+{x}+{y}")
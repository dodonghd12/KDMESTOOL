from tkinter import Tk, Toplevel, PhotoImage
import tkinter as tk
from tkinter import ttk
from tkcalendar import Calendar, DateEntry
import tkinter.font as tkFont

############################################################################################################################################################

from event_handlers import on_password_enter, toggle_password_visibility, on_login_button_click
from event_handlers import user_id, logout, add_material, show_add_material_window, on_add_material_window_close, on_department_id_change, on_product_type_change, open_delete_recipe_window
from event_handlers import on_type_search_barcode, on_type_search_work_order, on_type_search_site_content, on_update_expiry_time_button_click, on_update_standing_time_button_click, on_update_quantity_button_click, on_feed_records_button_click, on_recipe_detail_button_click, on_insert_material_button_click, open_transfer_by_date_window, on_collect_records_button_click, on_update_work_order_status_button_click, on_click_show_context_menu, on_double_click_show_details
from utils import APP_VERSION, convert_to_uppercase, show_about, validate_quantity_input, validate_entry_max_length, update_language

############################################################################################################################################################


root = Tk()

root.withdraw()

window_width = 1010
window_height = 445

screen_width = root.winfo_screenwidth()
screen_height = root.winfo_screenheight()

position_top = int(screen_height / 2 - window_height / 2)
position_left = int(screen_width / 2 - window_width / 2)

root.geometry(f'{window_width}x{window_height}+{position_left}+{position_top}')

root.title(f"KD MES Tool")

# current_directory = os.path.dirname(os.path.abspath(__file__))
# logo = PhotoImage(file=os.path.join(current_directory, 'library', 'main.png'))
# root.iconphoto(True, logo)

#style
style = ttk.Style()
style.configure("delete.TButton", foreground="red", font=("TkDefaultFont", 10, "bold"))


############################################################################################################################################################

login_window = Toplevel()

login_window_height = 110
login_window_width = 400

login_screen_height = root.winfo_screenheight()
login_screen_width = root.winfo_screenwidth()

login_window_position_top = int(login_screen_height / 2 - login_window_height / 2)
login_window_position_left = int(login_screen_width / 2 - login_window_width / 2)

login_window.geometry(f'{login_window_width}x{login_window_height}+{login_window_position_left}+{login_window_position_top}')
login_window.title(f"KD MES Tool")

# Tạo StringVar cho ID và Password
id_var = tk.StringVar()
password_var = tk.StringVar()

# Label và Entry cho User ID
label_id = ttk.Label(login_window, text="Tài Khoản:", width=10)
label_id.grid(row=0, column=0, padx=10, pady=5, sticky="e")
entry_id = ttk.Entry(login_window, textvariable=id_var, width=25)
entry_id.grid(row=0, column=1, padx=10, pady=5)

# Label và Entry cho Password
label_password = ttk.Label(login_window, text="Mật Khẩu:", width=10)
label_password.grid(row=1, column=0, padx=10, pady=5, sticky="e")
entry_password = ttk.Entry(login_window, textvariable=password_var, show="*", width=25)
entry_password.grid(row=1, column=1, padx=10, pady=5)

entry_password.bind("<Return>", lambda event: on_password_enter(entry_id, entry_password))   # Tạo sự kiện nhấn Enter cho entry_password

# Thêm biểu tượng mắt vào Entry (sử dụng label để chứa biểu tượng)
eye_icon = ttk.Label(login_window, text="🙈", font=("Arial", 16), cursor="hand2")
eye_icon.grid(row=1, column=2, padx=10, pady=5)
eye_icon.bind("<Button-1>", lambda e: toggle_password_visibility())

# Button Login
button_login = ttk.Button(login_window, text="ĐĂNG NHẬP", command=lambda: on_login_button_click(entry_id, entry_password), style="delete.TButton", width=15)
button_login.grid(row=2, column=1, padx=10, pady=5)

version_label = ttk.Label(
        login_window,
        text=f"Tool Version: {APP_VERSION}",
        font=("Arial", 9),
        foreground="gray"
    )
version_label.grid(row=2, column=0, sticky="e", padx=10, pady=5)

############################################################################################################################################################

# Menu Bar
menu_bar = tk.Menu(root)
root.config(menu=menu_bar)

# Thêm mục Logout vào Menu Bar
menu_logout = tk.Menu(menu_bar, tearoff=0)

addon_menu = tk.Menu(menu_bar, tearoff=0)
addon_menu.add_cascade(label="Thêm Vật Liệu", command=show_add_material_window, state="disabled")
addon_menu.add_command(label="Xóa Quy Cách", command=open_delete_recipe_window)
addon_menu.add_command(label="Chuyển liệu theo ngày", command=open_transfer_by_date_window)
# addon_menu.add_command(label="Mở đơn điều động", command=open_change_work_order_status_window)
menu_bar.add_cascade(label="Add-on", menu=addon_menu)

menu_bar.add_cascade(label="About", command=show_about)

user_menu = tk.Menu(menu_bar, tearoff=0)
user_menu.add_cascade(label="Đăng Xuất", command=logout)
menu_bar.add_cascade(label=user_id, menu=user_menu)

# language_menu = tk.Menu(menu_bar, tearoff=0)
# language_menu.add_command(label="Tiếng Việt", command=lambda: update_language("vi"))
# language_menu.add_command(label="English", command=lambda: update_language("en"))
# language_menu.add_command(label="CN", command=lambda: update_language("cn"))
# language_menu.add_command(label="TW", command=lambda: update_language("tw"))
# menu_bar.add_cascade(label="Ngôn Ngữ", menu=language_menu)

############################################################################################################################################################

# Frame bọc toàn bộ khu vực bảng
tree_container = ttk.Frame(root)
tree_container.place(x=1, y=55, relx=0.01, rely=0.128, width=1000, height=330)

# Treeview
treeview = ttk.Treeview(tree_container, show="headings")
treeview.grid(row=0, column=0, sticky="nsew")

# Scrollbars
scroll_y = ttk.Scrollbar(tree_container, orient="vertical", command=treeview.yview)
scroll_y.grid(row=0, column=1, sticky="ns")

scroll_x = ttk.Scrollbar(tree_container, orient="horizontal", command=treeview.xview)
scroll_x.grid(row=1, column=0, sticky="ew")

treeview.configure(yscrollcommand=scroll_y.set, xscrollcommand=scroll_x.set)

# Label đếm số dòng (ngay dưới scroll ngang)
row_count_label = ttk.Label(tree_container, text="Số dòng: 0", anchor="w")
row_count_label.grid(row=2, column=0, columnspan=2, sticky="w", padx=6, pady=(2, 0))

# Cho phép treeview giãn nở trong frame
tree_container.columnconfigure(0, weight=1)
tree_container.rowconfigure(0, weight=1)

barcode_context_functions = {
    # "Cập nhật số lượng": on_update_quantity_button_click,
    # "Cập nhật Th.gian chờ": on_update_standing_time_button_click,
    # "Cập nhập Th.gian hết hạn": on_update_expiry_time_button_click,
    "Lịch sử quét tem": on_feed_records_button_click,
}

work_order_context_functions = {
    "Lịch sử Mã MES": on_collect_records_button_click,
    "Mở lại Mã Mes": on_update_work_order_status_button_click,
    "Xem Quy Cách": on_recipe_detail_button_click,
}

treeview_m3_clicked_menu = tk.Menu(root, tearoff=0)
treeview.bind("<Button-3>", on_click_show_context_menu)
treeview.bind("<Double-1>", on_double_click_show_details)


#ROW 0

label_barcode = ttk.Label(root, text = "Mã barcode:", width=18)
label_barcode.grid(row=0, column=0, padx=10, pady=5, sticky="w")

barcode_var = tk.StringVar()
entry_barcode = ttk.Entry(root, width=50, textvariable=barcode_var)
entry_barcode.grid(row=0, column=1, padx=10, pady=5)
barcode_var.trace_add("write", convert_to_uppercase)
barcode_var.trace_add("write", on_type_search_barcode)


#ROW 1

label_product_id = ttk.Label(root, text="Quy Cách:", width=18)
label_product_id.grid(row=1, column=0, padx=10, pady=5, sticky="w")

product_id_var = tk.StringVar()
entry_product_id = ttk.Entry(root, width=50, textvariable=product_id_var)
entry_product_id.grid(row=1, column=1, padx=10, pady=5)
product_id_var.trace_add("write", convert_to_uppercase)
product_id_var.trace_add("write", on_type_search_work_order)


#ROW 2

label_station = ttk.Label(root, text="Công trình:", width=18)
label_station.grid(row=2, column=0, padx=10, pady=5, sticky="w")

station_var = tk.StringVar()
entry_station = ttk.Entry(root, width=50, textvariable=station_var)
entry_station.grid(row=2, column=1, padx=10, pady=5)
station_var.trace_add("write", convert_to_uppercase)
station_var.trace_add("write", on_type_search_site_content)


############################################################################################################################################################

# Create a new window for adding material
add_material_window = tk.Toplevel(root)

# Ẩn cửa sổ chính khi mở trang đăng nhập
add_material_window.withdraw()

add_material_window.title("Thêm vật liệu")
add_material_window.update_idletasks()

add_material_window_height = 400
add_material_window_width = 360

add_material_screen_height = root.winfo_screenheight()
add_material_screen_width = root.winfo_screenwidth()

add_material_position_top = int(add_material_screen_height / 2 - add_material_window_height / 2)
add_material_position_left = int(add_material_screen_width / 2 - add_material_window_width / 2)
add_material_window.geometry(f"{add_material_window_width}x{add_material_window_height}+{add_material_position_left}+{add_material_position_top}")

# Set the close protocol to handle the "X" button
add_material_window.protocol("WM_DELETE_WINDOW", on_add_material_window_close)

# Validate
validate_max_length = (add_material_window.register(lambda value, max_length: validate_entry_max_length(value, max_length)))    #Entry max length
validate_quantity = add_material_window.register(lambda char: validate_quantity_input(char))    #character Quantity

# Label and Entry for department
label_department_id = ttk.Label(add_material_window, width=20, text="Department ID:")
label_department_id.grid(row=0, column=0, padx=10, pady=5, sticky="w")

department_id_var = tk.StringVar()
entry_department_id = ttk.Combobox(add_material_window, textvariable=department_id_var, width=27, state="readonly")
entry_department_id['values'] = ["P0000", "P8000", "P8200", "P8300", "P8322", "P8330", "P8400", "P8500", "P8600", "P8700", "P8800", "P8830", "P9100"]
entry_department_id.grid(row=0, column=1, padx=10, pady=5)
entry_department_id.bind("<<ComboboxSelected>>", on_department_id_change)
entry_department_id.current(None)

# Label and Entry for Product Type
label_product_type = ttk.Label(add_material_window, width=20, text="Product Type:")
label_product_type.grid(row=1, column=0, padx=10, pady=5, sticky="w")

product_type_var = tk.StringVar()
entry_product_type = ttk.Combobox(add_material_window, textvariable=product_type_var, width=27, state="readonly")
entry_product_type.grid(row=1, column=1, padx=10, pady=5)
entry_product_type.bind("<<ComboboxSelected>>", on_product_type_change)

# Label and Entry for Product ID
label_material_product_id = ttk.Label(add_material_window, width=20, text="Product ID:")
label_material_product_id.grid(row=2, column=0, padx=10, pady=5, sticky="w")

material_product_id_var = tk.StringVar()
entry_material_product_id = ttk.Combobox(add_material_window, textvariable=material_product_id_var, width=27, state="readonly")
entry_material_product_id.grid(row=2, column=1, padx=10, pady=5)

# Label and Entry for Material Grade
label_material_grade = ttk.Label(add_material_window, width=20, text="Material Grade:")
label_material_grade.grid(row=3, column=0, padx=10, pady=5, sticky="w")

entry_material_grade = ttk.Entry(add_material_window, width=30)
entry_material_grade.grid(row=3, column=1, padx=10, pady=5)

# Label, Entry, Hint for Quantity
label_quantity = ttk.Label(add_material_window, width=20, text="Quantity:")
label_quantity.grid(row=4, column=0, padx=10, pady=5, sticky="w")

entry_quantity = ttk.Entry(add_material_window, width=30, validate="key", validatecommand=(validate_quantity, "%S"))
entry_quantity.grid(row=4, column=1, padx=10, pady=5)


# Label and Entry for Unit of Measurement
label_unit_of_measurement = ttk.Label(add_material_window, width=20, text="Unit of Measurement:")
label_unit_of_measurement.grid(row=5, column=0, padx=10, pady=5, sticky="w")

entry_unit_of_measurement = ttk.Entry(add_material_window, width=30)
entry_unit_of_measurement.grid(row=5, column=1, padx=10, pady=5)

# Label and Entry for Lot Num
label_lot_number = ttk.Label(add_material_window, width=20, text="Lot Num:")
label_lot_number.grid(row=6, column=0, padx=10, pady=5, sticky="w")

entry_lot_number = ttk.Entry(add_material_window, width=30)
entry_lot_number.grid(row=6, column=1, padx=10, pady=5)

# Label and Entry for Created At
label_created_at = ttk.Label(add_material_window, width=20, text="Created At:")
label_created_at.grid(row=7, column=0, padx=10, pady=5, sticky="w")

entry_created_at = DateEntry(add_material_window, width=27, background="white", foreground="black", date_pattern="dd/mm/yyyy", showweeknumbers=False)
entry_created_at.grid(row=7, column=1, padx=10, pady=5)

# Label and Entry for Expired At
label_expired_at = ttk.Label(add_material_window, width=20, text="Expired At:")
label_expired_at.grid(row=8, column=0, padx=10, pady=5, sticky="w")

entry_expired_at = DateEntry(add_material_window, width=27, background="white", foreground="black", date_pattern="dd/mm/yyyy", showweeknumbers=False)
entry_expired_at.grid(row=8, column=1, padx=10, pady=5)

# Label and Entry for Warehouse Type
label_warehouse_type = ttk.Label(add_material_window, width=20, text="Warehouse Type:")
label_warehouse_type.grid(row=9, column=0, padx=10, pady=5, sticky="w")

entry_warehouse_type = ttk.Entry(add_material_window, width=30, validate="key", validatecommand=(validate_max_length, "%P", 1))
entry_warehouse_type.grid(row=9, column=1, padx=10, pady=5)

# Label and Entry for Warehouse ID
label_warehouse_id = ttk.Label(add_material_window, width=20, text="Warehouse ID:")
label_warehouse_id.grid(row=10, column=0, padx=10, pady=5, sticky="w")

entry_warehouse_id = ttk.Entry(add_material_window, width=30, validate="key", validatecommand=(validate_max_length, "%P", 2))
entry_warehouse_id.grid(row=10, column=1, padx=10, pady=5)

# Entries
add_material_entries = {
    "department_id": entry_department_id,
    "product_type": entry_product_type,
    "product_id": entry_material_product_id,
    "material_grade": entry_material_grade,
    "quantity": entry_quantity,
    "unit_of_measurement": entry_unit_of_measurement,
    "lot_number": entry_lot_number,
    "created_at": entry_created_at,
    "expired_at": entry_expired_at,
    "warehouse_type": entry_warehouse_type,
    "warehouse_id": entry_warehouse_id,
    }

# Add button
button_add = ttk.Button(add_material_window, text="ADD", command=lambda: add_material(add_material_entries))
button_add.grid(row=11, column=1, padx=10, pady=20)


############################################################################################################################################################

#processing window
def show_processing_window():
    processing_window = tk.Toplevel()
    processing_window.title("Thông Tin")

    width = 300
    height = 110

    root.update_idletasks()
    x = root.winfo_x() + (root.winfo_width() // 2) - (width // 2)
    y = root.winfo_y() + (root.winfo_height() // 2) - (height // 2)
    processing_window.geometry(f"{width}x{height}+{x}+{y}")
    
    processing_window.transient(root)
    processing_window.grab_set()

    bold_font = tkFont.Font(family="Arial", size=14, weight="bold")
    processing_window_label = ttk.Label(processing_window, text="Đang xử lý, vui lòng chờ...", font=bold_font)
    processing_window_label.pack(expand=True)

    processing_window.update_idletasks()

    return processing_window
# CẨM NANG HƯỚNG DẪN SỬ DỤNG TOÀN DIỆN HỆ THỐNG KDMES TOOL
> **Phiên bản:** v2.3.91 | **Phát hành:** 2026 | **Đơn vị vận hành:** Đội ngũ Kỹ thuật & Quản trị Hệ thống KDMES KV1 & KV2  
> **Tài liệu tham chiếu nội bộ:** Cẩm nang tiêu chuẩn thao tác chuẩn (SOP), quản trị dữ liệu sản xuất, kiểm soát cấp liệu Poka-Yoke và xử lý sự cố.

---

## MỤC LỤC TỔNG QUAN

1. [Phân Hệ 1: Main Dashboard & Tra Cứu Toàn Năng](#phan-he-1-main-dashboard--tra-cuu-toan-nang)
2. [Phân Hệ 2: Tem Vận Chuyển Liên Xưởng (KV1 & KV2)](#phan-he-2-tem-van-chuyen-lien-xuong-kv1--kv2)
3. [Phân Hệ 3: Kiểm Tra Cấp Liệu & Chống Nhầm Lẫn (Poka-Yoke)](#phan-he-3-kiem-tra-cap-lieu--chong-nham-lan-poka-yoke)
4. [Phân Hệ 4: Truy Vấn Lịch Sử In Bù (Reprint Audit)](#phan-he-4-truy-van-lich-su-in-bu-reprint-audit)
5. [Phân Hệ 5: Thông Số Kỹ Thuật Sản Xuất (Recipe Specifications)](#phan-he-5-thong-so-ky-thuat-san-xuat-recipe-specifications)
6. [Phân Hệ 6: Dữ Liệu Đã Xóa & Phục Hồi (GitLab & PostgreSQL)](#phan-he-6-du-lieu-da-xoa--phuc-hoi-gitlab--postgresql)
7. [Phân Hệ 7: Quản Lý & Cấp Quyền Tài Khoản KDMES](#phan-he-7-quan-ly--cap-quyen-tai-khoan-kdmes)
8. [Phân Hệ 8: Quản Lý Nguyên Vật Liệu Thay Thế (Substitutions)](#phan-he-8-quan-ly-nguyen-vat-lieu-thay-the-substitutions)
9. [Phân Hệ 9: Lịch Sử Quét Cấp Liệu & In Tem Thời Gian Thực](#phan-he-9-lich-su-quet-cap-lieu--in-tem-thoi-gian-thuc)
10. [Phân Hệ 10: Tra Cứu Dữ Liệu Kiểm Định Chất Lượng (QC Data)](#phan-he-10-tra-cuu-du-lieu-kiem-dinh-chat-luong-qc-data)
11. [Phân Hệ 11: Kiểm Tra Trạng Thái Đồng Bộ MES-ERP (Mesync Audit)](#phan-he-11-kiem-tra-trang-thai-dong-bo-mes-erp-mesync-audit)
12. [Phân Hệ 12: Thiết Lập & Cấu Hình Máy / Trạm Cân (Station Config)](#phan-he-12-thiet-lap--cau-hinh-may--tram-can-station-config)
13. [Phân Hệ 13: Bộ Công Cụ Quản Trị Hệ Thống Nâng Cao (Elder Wand)](#phan-he-13-bo-cong-cu-quan-tri-he-thong-nang-cao-elder-wand)
14. [Phân Hệ 14: Tiện Ích Toàn Cục, Chuyển Database & Phím Tắt Hệ Thống](#phan-he-14-tien-ich-toan-cuc-chuyen-database--phim-tat-he-thong)

---

## PHÂN HỆ 1: MAIN DASHBOARD & TRA CỨU TOÀN NĂNG

### 1. Giới thiệu tổng quan
Main Dashboard là trung tâm chỉ huy số của KDMES TOOL. Hỗ trợ tra cứu nhanh bất kỳ mã vạch (Barcode ID / OID), phân loại vật tư (Cao su, Hóa chất, Vải, Tanh, Bán thành phẩm), trạng thái khóa, tiêu hao và truy vết chuỗi cung ứng sản xuất.

### 2. Các chức năng cốt lõi
* **Tra cứu nhanh Barcode:** Nhập Barcode ID (VD: `VDA8QTQC7E1NS71MQE9Q0`) hoặc quét bằng máy bắn mã vạch.
* **Xem chi tiết tem (Modal Details):** Hiển thị đầy đủ thông tin: Mã sản phẩm, Số mẻ (Lot No), Khối lượng thực tế / ban đầu, Hạn sử dụng, Máy sản xuất, Người thao tác, Trạng thái Khóa / Mở khóa / Gia hạn.
* **Thay đổi trạng thái tem:** Khóa (Lock), Mở khóa (Unlock), Hủy bỏ (Scrap) với ghi nhận lý do bắt buộc.
* **Gia hạn hạn sử dụng (Extend Expiry):** Dành cho tem bán thành phẩm được KCS phê duyệt nghiệm thu lại hạn dùng.
* **Kiểm tra tiêu thụ (Used History):** Tra cứu tem đã được đưa vào máy nào cân, thuộc Work Order (Lệnh sản xuất) nào, tiêu thụ bao nhiêu kg, tỷ lệ tiêu hao và danh sách tem đầu ra liên quan. Đối với tem đang gắn trên trạm (`Đang gắn`), cột `consumption` hiển thị trực tiếp số lượng thực tế tem đang gắn vào máy.
* **Cập nhật OID / Chuyển đổi mã liên kết:** Đồng bộ OID giữa bảng vật tư và bảng cân cấp liệu tự động.

### 3. Quy trình chuẩn
1. Nhập mã Barcode vào ô tìm kiếm chính $
ightarrow$ Nhấn **Enter** hoặc click biểu tượng Kính lúp.
2. Kiểm tra thông tin thẻ tóm tắt và bảng chi tiết thuộc tính.
3. Nếu cần đổi trạng thái: Click nút chức năng tương ứng $
ightarrow$ Điền lý do $
ightarrow$ Nhấn **Xác nhận**.
4. Nếu cần xem lịch sử tiêu hao: Click **"Kiểm tra tiêu thụ"** $
ightarrow$ Hệ thống tự động phân tích và liệt kê các mẻ máy đã nạp tem này.

---

## PHÂN HỆ 2: TEM VẬN CHUYỂN LIÊN XƯỞNG (KV1 & KV2)

### 1. Giới thiệu tổng quan
Phân hệ quản lý việc điều chuyển, giao nhận nguyên vật liệu và bán thành phẩm giữa Nhà máy 1 (KV1) và Nhà máy 2 (KV2), đảm bảo tem không bị thất thoát hoặc cập nhật sai trạng thái tồn kho trên hệ thống MES.

### 2. Các chức năng cốt lõi
* **Chuyển xưởng (Outbound Transfer):** Tạo phiếu xuất kho vận chuyển liên xưởng, gom danh sách các Barcode chuyển đi.
* **Nhập xưởng (Inbound Receive):** Quét kiểm tra mã tem tại cổng nhận hàng KV2/KV1, kích hoạt tem vào trạng thái sẵn sàng cấp liệu tại xưởng đích.
* **Tra cứu trạng thái tem vận chuyển:** Kiểm tra tem đang ở trạng thái *Đang vận chuyển*, *Đã nhập kho đích*, hay *Bị giữ lại do sai lệch số lượng*.
* **Báo cáo đối soát:** Xuất danh sách đối soát chênh lệch số lượng thực xuất - thực nhập.

---

## PHÂN HỆ 3: KIỂM TRA CẤP LIỆU & CHỐNG NHẦM LẪN (POKA-YOKE)

### 1. Giới thiệu tổng quan
Hệ thống phòng ngừa sai lỗi (Poka-Yoke) trong công đoạn cân chia và nạp liệu máy luyện (Mixer) / trạm đùn, cán tráng. Chặn đứng 100% rủi ro nạp nhầm mã hóa chất, cao su hết hạn hoặc sai mẻ quy định.

### 2. Quy tắc kiểm tra Poka-Yoke
| STT | Tiêu chí kiểm tra | Điều kiện hợp lệ | Xử lý khi vi phạm |
|:---:|:---|:---|:---|
| 1 | **Mã sản phẩm (Product ID)** | Đúng theo Recipe của Work Order đang chạy | Cảnh báo ĐỎ, khóa lệnh cân |
| 2 | **Hạn sử dụng (Expiry Date)** | Thời điểm nạp < Hạn sử dụng của tem | Báo tem hết hạn, cấm xuất |
| 3 | **Trạng thái tem (Status)** | Status = 1 (Bình thường / Sẵn sàng) | Khóa nếu tem đang bị HOLD (Status = 0 hoặc 2) |
| 4 | **Số lượng tồn (Quantity)** | Quantity > 0 và đủ trọng lượng mẻ | Cảnh báo thiếu liệu |
| 5 | **Mẻ sản xuất (Lot Matching)** | Lot hợp lệ theo lệnh phối liệu | Cảnh báo sai quy cách phối trộn |

---

## PHÂN HỆ 4: TRUY VẤN LỊCH SỬ IN BÙ (REPRINT AUDIT)

### 1. Giới thiệu tổng quan
Giám sát mọi thao tác in lại tem nhãn tem rách, tem mất hoặc in bổ sung nhằm ngăn chặn hành vi in khống, gian lận số lượng nguyên vật liệu.

### 2. Các trường thông tin truy vấn
* **Mã Barcode in bù:** Mã vạch mới và mã vạch gốc tương ứng.
* **Máy in (Printer ID):** IP / Tên máy in mạng thực hiện lệnh in.
* **Thời gian & Người in:** Dấu thời gian chính xác đến từng giây và Username người ấn lệnh.
* **Lý do in bù (Reprint Reason):** Bắt buộc chọn từ danh mục: *Tem rách, Mực mờ, Sai quy cách, Đổi mẻ, Thất lạc*.

---

## PHÂN HỆ 5: THÔNG SỐ KỸ THUẬT SẢN XUẤT (RECIPE SPECIFICATIONS)

### 1. Giới thiệu tổng quan
Tra cứu tiêu chuẩn công nghệ, công thức phối liệu (Recipe Master), dung sai cân định lượng và các bước gia công nhiệt luyện cho từng mã sản phẩm cao su, bán thành phẩm.

### 2. Thao tác thực hiện
* Tìm kiếm theo **Mã công thức (Recipe ID)** hoặc **Mã sản phẩm (Product ID)**.
* Xem bảng tỷ lệ thành phần nguyên liệu (Cao su thiên nhiên, Cao su tổng hợp, Than đen, Hóa chất trợ gia công, Lưu hóa, Dầu mềm).
* Tra cứu nhiệt độ xả keo, tốc độ rotor, thời gian nhào luyện tiêu chuẩn của buồng trộn.

---

## PHÂN HỆ 6: DỮ LIỆU ĐÃ XÓA & PHỤC HỒI (GITLAB & POSTGRESQL)

### 1. Giới thiệu tổng quan
Phân hệ audit an ninh và phục hồi dữ liệu dành riêng cho Quản trị viên khi xảy ra sự cố xóa nhầm file cấu hình trên GitLab hoặc bản ghi vật tư trong cơ sở dữ liệu PostgreSQL.

### 2. Tính năng chính
* **GitLab Deleted Files:** Quét commit log các nhánh repository, phát hiện file code/cấu hình bị xóa và hỗ trợ khôi phục tức thì.
* **Postgres Deleted Data:** Đọc log transaction và bảng audit lưu trữ tạm thời các bản ghi bị `DELETE` khỏi database để hoàn tác (`ROLLBACK / INSERT RESTORE`).

---

## PHÂN HỆ 7: QUẢN LÝ & CẤP QUYỀN TÀI KHOẢN KDMES

### 1. Giới thiệu tổng quan
Quản trị vòng đời tài khoản người dùng trên hệ thống KDMES nội bộ: Quản đốc, Tổ trưởng, KCS, Công nhân cân và Nhân viên IT.

### 2. Quy định phân quyền (RBAC)
* **Viewer (Chỉ xem):** Tra cứu thông tin tem, xem báo cáo, không có quyền sửa.
* **Operator (Vận hành):** Thao tác cân, quét mã vạch, chuyển xưởng, in bù có kiểm soát.
* **Supervisor / QC (Giám sát/KCS):** Đổi trạng thái tem, phê duyệt gia hạn hạn dùng, duyệt NVL thay thế.
* **Admin (Quản trị):** Toàn quyền cấu hình máy, trạm cân, can thiệp dữ liệu cấp cao.

---

## PHÂN HỆ 8: QUẢN LÝ NGUYÊN VẬT LIỆU THAY THẾ (SUBSTITUTIONS)

### 1. Giới thiệu tổng quan
Quản lý danh mục nguyên vật liệu thay thế tương đương khi mã chính thức bị hết hàng tồn kho, đảm bảo dây chuyền không bị dừng mà vẫn tuân thủ nghiêm ngặt tiêu chuẩn chất lượng của Phòng Kỹ Thuật (R&D).

### 2. Quy trình kích hoạt NVL thay thế
1. Tra cứu mã NVL chính đang thiếu.
2. Kiểm tra danh sách NVL thay thế đã được phê duyệt trong hồ sơ công nghệ.
3. Khai báo tỷ lệ quy đổi tương đương (Hệ số K).
4. Thiết lập thời hạn áp dụng (Từ ngày - Đến ngày) $
ightarrow$ Lưu cấu hình.

---

## PHÂN HỆ 9: LỊCH SỬ QUÉT CẤP LIỆU & IN TEM THỜI GIAN THỰC

### 1. Giới thiệu tổng quan
Nhật ký điện tử ghi nhận 100% luồng thao tác quét mã vạch cấp liệu vào máy và tạo mới tem đầu ra trên toàn bộ các dây chuyền KV1 & KV2.

### 2. Ứng dụng điều tra sự cố
* Khi phát hiện một mẻ keo hoặc bán thành phẩm bị lỗi chất lượng, mở ngay phân hệ này.
* Nhập số mẻ hoặc mã máy $
ightarrow$ Lọc ra chính xác danh sách các cuộn tem/thùng hóa chất đã được quét nạp vào mẻ đó cùng danh tính người thực hiện.

---

## PHÂN HỆ 10: TRA CỨU DỮ LIỆU KIỂM ĐỊNH CHẤT LƯỢNG (QC DATA)

### 1. Giới thiệu tổng quan
Tích hợp trực tiếp dữ liệu đo lường từ phòng thí nghiệm KCS / QC vào hệ thống KDMES: Độ nhớt Mooney, Đường cong lưu hóa (MDR / Rheometer), Độ cứng Shore A, Độ bền kéo đứt và Mật độ tỷ trọng.

### 2. Trạng thái nghiệm thu
* **PASS (Đạt chuẩn):** Tự động mở khóa tem cho phép công đoạn sau sử dụng.
* **FAIL (Không đạt):** Tự động khóa tem (Hold status), gửi cảnh báo cho Trưởng ca và KCS.
* **PENDING (Chờ kết quả):** Tem ở trạng thái cách ly tạm thời, máy cân sẽ từ chối nhận nếu quét mã.

---

## PHÂN HỆ 11: KIỂM TRA TRẠNG THÁI ĐỒNG BỘ MES-ERP (MESYNC AUDIT)

### 1. Giới thiệu tổng quan
Giám sát đường truyền đồng bộ hai chiều giữa cơ sở dữ liệu KDMES tại hiện trường sản xuất và hệ thống Quản trị nguồn lực doanh nghiệp SAP/ERP.

### 2. Các chỉ số theo dõi
* **Tiêu hao NVL thực tế (Backflush):** Đã trừ kho ERP thành công hay bị kẹt hàng đợi (Sync Queue).
* **Sản lượng nhập kho (Goods Receipt):** Số lượng bán thành phẩm nhập kho thành phẩm.
* **Cảnh báo lỗi đồng bộ:** Lỗi sai mã kho, lỗi âm kho ảo, lỗi định dạng số liệu mẻ.

---

## PHÂN HỆ 12: THIẾT LẬP & CẤU HÌNH MÁY / TRẠM CÂN (STATION CONFIG)

### 1. Giới thiệu tổng quan
Quản lý tham số kết nối phần cứng tại từng trạm sản xuất: Đầu đọc mã vạch không dây, Cân điện tử công nghiệp (Mettler Toledo, Ohaus, AND) qua RS232/TCP-IP và Máy in mã vạch Zebra ZPL.

### 2. Tham số kỹ thuật chuẩn
* **Baud rate Cân:** 9600, Data bits: 8, Parity: None, Stop bits: 1.
* **Giao thức máy in:** ZPL II qua cổng RAW 9100.
* **Cấu hình trạm cân:** Gán cố định Mã trạm (`KV-P9100-MIXER-...`) với IP máy tính và thiết bị đo tương ứng.

---

## PHÂN HỆ 13: BỘ CÔNG CỤ QUẢN TRỊ HỆ THỐNG NÂNG CAO (ELDER WAND)

> [!WARNING]
> Bộ công cụ Elder Wand chứa các chức năng can thiệp trực tiếp vào nhân dữ liệu cơ sở dữ liệu. Chỉ dành cho Quản trị viên hệ thống có thẩm quyền cao nhất.

### 1. Danh sách các câu thần chú quản trị (Admin Spells)
* **Switching Spell (Hoán Chuyển Mã):** Hoán đổi thông tin, điều chuyển mẻ hoặc thay thế thông số tem nhãn trong trường hợp sai sót nghiêm trọng của hệ thống cân.
* **Avada Kedavra (Tiêu Diệt Dữ Liệu Rác):** Dọn dẹp triệt để các bản ghi mồ côi, bản ghi lỗi sinh ra do đứt kết nối mạng trong quá trình sinh tem tự động.
* **Time Turner (Quay Ngược Thời Gian):** Điều chỉnh lại mốc thời gian sản xuất hoặc hoàn nguyên trạng thái tem về thời điểm trước khi bị thao tác nhầm.
* **Reparo Spell (Hàn Gắn & Sửa Lỗi Dữ Liệu):** Tự động quét kiểm tra toàn vẹn cấu trúc cơ sở dữ liệu, sửa chữa các khóa ngoại bị gãy hoặc khôi phục liên kết OID bị mất.

---

## PHÂN HỆ 14: TIỆN ÍCH TOÀN CỤC, CHUYỂN DATABASE & PHÍM TẮT HỆ THỐNG

### 1. Nút Chuyển Môi Trường Cơ Sở Dữ Liệu (KV1 / KV2 / DEV)
* **Vị trí tích hợp:** Nằm gọn gàng trong Speed Dial Menu (Nút tròn `+` tại góc dưới Sidebar).
* **3 Phân vùng máy chủ:**
  * **KV1:** Kết nối PostgreSQL Nhà máy 1 (`198.1.1.92:5432`).
  * **KV2:** Kết nối PostgreSQL Nhà máy 2 (`198.1.10.85:5432`).
  * **DEV:** Kết nối máy chủ Môi trường Thử nghiệm Kỹ thuật (`198.1.10.3:5432`).
* **Cơ chế hoạt động:** Khi người dùng chọn môi trường mới, hệ thống tự động lưu cookie `kdmes_db_env`, gửi API cập nhật phiên làm việc của Flask backend và hiển thị Toast thông báo trạng thái kết nối thành công/thất bại. Toàn bộ các API truy vấn tiếp theo sẽ tự động hướng sang máy chủ tương ứng.

### 2. Hướng Dẫn Sử Dụng In-App Modal
* **Vị trí mở nhanh:**
  * Nút **"Hướng dẫn sử dụng"** chuyên dụng tại `sidebar-footer` (ngay dưới Đếm ngược Tết, trên Avatar User).
  * Nút hành động **"Hướng dẫn"** trong Speed Dial menu.
* **Giao diện Modal siêu rộng (96vw):** Thiết kế hai cột thông minh, hỗ trợ thanh cuộn độc lập cho nội dung dài, tự động nhận diện trang hiện tại để mở đúng tab hướng dẫn tương ứng, kèm thanh tìm kiếm thời gian thực.

### 3. Danh mục Phím Tắt Tiện Ích
| Phím tắt | Thao tác | Mô tả |
|:---:|:---|:---|
| `Alt + H` | **Mở Hướng Dẫn** | Mở ngay Modal Hướng dẫn sử dụng |
| `Alt + F` | **Mở FYI Modal** | Mở bảng tra cứu nhanh thông tin |
| `Alt + S` | **Focus Tìm Kiếm** | Đưa con trỏ chuột vào ô nhập Barcode |
| `Esc` | **Đóng Modal** | Đóng ngay cửa sổ đang mở |
| `Ctrl + P` | **In Nhanh Tem** | Kích hoạt lệnh in nhãn tem hiện tại |

---
*Tài liệu được biên soạn và lưu trữ chính thức tại kho mã nguồn KDMES TOOL repository.*

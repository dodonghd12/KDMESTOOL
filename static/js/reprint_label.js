/**
 * ══════════════════════════════════════════════════════════════════════════
 * KDMES In Lại Tem (Reprint Label) Controller - v2.3.40
 * Standalone & Embeddable Page for External iframe Integration
 * - Default Light Mode, No Sidebar, No Table Footer, No Toolbar Action Button
 * - Direct Per-Row Print Action with Loading Spinner
 * - Bold Strong Barcode Column (matches Quy Cách column style)
 * - SQL Server 10.33 Printer Query (/api/printers/p8300)
 * - Default printerSelect: Empty, Force user selection before printing
 * - Red border highlight & Toast alert when printer not selected
 * - Quantity column strictly loaded from collect_record for both APIs
 * - Standardized Columns: Barcode, Quy Cách, Loại SP, Số lượng, Hạn Dùng, Ngày SX, Số Lô, Trạng thái, Người tạo
 * - CUPS IPP 2.0 Print Execution & Bottom-Right Toast Notifications
 * ══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // State Variables
    let currentPrinters = [];
    let currentTableRecords = [];
    let selectedBarcode = null;
    let isPrinting = false;
    let isSearching = false;
    let barcodeDebounceTimer = null;
    let mesDebounceTimer = null;

    // Status map
    const STATUS_MAP = {
        0: { text: 'Khởi tạo', cls: 'status-other' },
        1: { text: 'Sẵn sàng', cls: 'status-ready' },
        2: { text: 'Đang dùng', cls: 'status-ready' },
        3: { text: 'Hết hạn', cls: 'status-other' },
        4: { text: 'Đã hủy', cls: 'status-other' },
        5: { text: 'Đang khóa', cls: 'status-other' }
    };

    /* ══════════════════════════════════════════════════════════════════════
       1. INITIALIZATION ON DOM READY
       ══════════════════════════════════════════════════════════════════════ */
    document.addEventListener('DOMContentLoaded', () => {
        // Enforce Light Mode
        document.documentElement.setAttribute('data-theme', 'light');
        if (document.body) {
            document.body.classList.add('theme-light');
        }

        initEventListeners();
        loadPrintersFromCups();
        initUserBadge();
    });

    function getCurrentReprintUsername() {
        const urlParams = new URLSearchParams(window.location.search);
        return (urlParams.get('username') || window.REPRINT_CONFIG?.username || '').trim();
    }

    function initUserBadge() {
        const uname = getCurrentReprintUsername();
        const userBadge = document.getElementById('reprintUserBadge');
        const userNameText = document.getElementById('reprintUserNameText');
        if (uname && userBadge && userNameText) {
            userNameText.textContent = uname;
            userBadge.style.display = 'inline-flex';
        }
    }

    /* ══════════════════════════════════════════════════════════════════════
       2. EVENT LISTENERS SETUP
       ══════════════════════════════════════════════════════════════════════ */
    function initEventListeners() {
        const barcodeInput = document.getElementById('barcodeInput');
        const barcodeClearBtn = document.getElementById('barcodeClearBtn');
        const mesInput = document.getElementById('mesInput');
        const mesClearBtn = document.getElementById('mesClearBtn');
        const printerSelect = document.getElementById('printerSelect');

        // Clear red error border when user selects a printer
        if (printerSelect) {
            printerSelect.addEventListener('change', () => {
                if (printerSelect.value) {
                    printerSelect.classList.remove('input-error');
                    printerSelect.style.borderColor = '';
                    printerSelect.style.boxShadow = '';
                }
            });
        }

        // 1. Barcode Input Events
        if (barcodeInput) {
            barcodeInput.addEventListener('input', (e) => {
                const val = e.target.value.trim().toUpperCase();
                e.target.value = val;

                if (barcodeClearBtn) {
                    barcodeClearBtn.style.display = val ? 'flex' : 'none';
                }

                if (barcodeDebounceTimer) clearTimeout(barcodeDebounceTimer);

                if (!val) {
                    if (!mesInput || !mesInput.value.trim()) {
                        clearTableData();
                    }
                    return;
                }

                // Clear MES input when Barcode is typed
                if (mesInput && mesInput.value) {
                    mesInput.value = '';
                    if (mesClearBtn) mesClearBtn.style.display = 'none';
                }

                barcodeDebounceTimer = setTimeout(() => {
                    executeBarcodeSearch(val);
                }, 350);
            });

            barcodeInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (barcodeDebounceTimer) clearTimeout(barcodeDebounceTimer);
                    const val = barcodeInput.value.trim().toUpperCase();
                    if (val) executeBarcodeSearch(val);
                }
            });
        }

        if (barcodeClearBtn) {
            barcodeClearBtn.addEventListener('click', () => {
                if (barcodeInput) {
                    barcodeInput.value = '';
                    barcodeInput.focus();
                }
                barcodeClearBtn.style.display = 'none';
                if (!mesInput || !mesInput.value.trim()) {
                    clearTableData();
                }
            });
        }

        // 2. Mã Mes Input Events
        if (mesInput) {
            mesInput.addEventListener('input', (e) => {
                const val = e.target.value.trim().toUpperCase();
                e.target.value = val;

                if (mesClearBtn) {
                    mesClearBtn.style.display = val ? 'flex' : 'none';
                }

                if (mesDebounceTimer) clearTimeout(mesDebounceTimer);

                if (!val) {
                    if (!barcodeInput || !barcodeInput.value.trim()) {
                        clearTableData();
                    }
                    return;
                }

                // Clear Barcode input when MES is typed
                if (barcodeInput && barcodeInput.value) {
                    barcodeInput.value = '';
                    if (barcodeClearBtn) barcodeClearBtn.style.display = 'none';
                }

                mesDebounceTimer = setTimeout(() => {
                    executeMesSearch(val);
                }, 400);
            });

            mesInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (mesDebounceTimer) clearTimeout(mesDebounceTimer);
                    const val = mesInput.value.trim().toUpperCase();
                    if (val) executeMesSearch(val);
                }
            });
        }

        if (mesClearBtn) {
            mesClearBtn.addEventListener('click', () => {
                if (mesInput) {
                    mesInput.value = '';
                    mesInput.focus();
                }
                mesClearBtn.style.display = 'none';
                if (!barcodeInput || !barcodeInput.value.trim()) {
                    clearTableData();
                }
            });
        }
    }

    /* ══════════════════════════════════════════════════════════════════════
       3. LOAD PRINTERS FROM CUPS 2.4.7 (/api/switching-spell/available-printers)
       Format: [queue_name] — [description]
       Default: Empty (""), forcing user to select a printer
       ══════════════════════════════════════════════════════════════════════ */
    async function loadPrintersFromCups() {
        const select = document.getElementById('printerSelect');

        try {
            const resp = await fetch('/api/switching-spell/available-printers');
            const data = await resp.json();

            if (resp.ok && data.success && Array.isArray(data.printers)) {
                currentPrinters = data.printers;

                if (select) {
                    // Default empty option
                    select.innerHTML = '<option value="">-----</option>';

                    currentPrinters.forEach(p => {
                        const opt = document.createElement('option');
                        opt.value = p.queue_name;
                        opt.dataset.description = p.description || '';
                        opt.dataset.status = p.status || '';

                        // Format: KV2_P8300_STEEL-BELT_8.129 — B: cat bo kem + EDGE
                        const label = p.description && p.description !== p.queue_name
                            ? `${p.queue_name} — ${p.description}`
                            : p.queue_name;
                        opt.textContent = label;
                        select.appendChild(opt);
                    });

                    // Force default empty
                    select.value = '';
                }
            } else {
                throw new Error(data.message || 'Không thể lấy danh sách máy in CUPS');
            }
        } catch (err) {
            console.error('Lỗi load printers từ CUPS:', err);
            showToast('Cảnh báo', 'Không thể nạp danh sách máy in từ CUPS 2.4.7: ' + err.message, 'warning');
        }
    }

    /* ══════════════════════════════════════════════════════════════════════
       4. BARCODE SEARCH LOGIC (/api/barcodes)
       ══════════════════════════════════════════════════════════════════════ */
    async function executeBarcodeSearch(barcode) {
        if (!barcode || isSearching) return;
        isSearching = true;

        renderTableSkeleton();

        try {
            const resp = await fetch('/api/barcodes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword: barcode })
            });

            const data = await resp.json();

            if (resp.ok && data.success && Array.isArray(data.result) && data.result.length > 0) {
                // Find matching record or first
                const exactMatch = data.result.find(r => {
                    const id = (r[data.columns.indexOf('id')] || '').toUpperCase();
                    return id === barcode;
                }) || data.result[0];

                const mappedRecord = mapRowToObject(exactMatch, data.columns);
                currentTableRecords = [mappedRecord];
                selectedBarcode = mappedRecord.barcode || mappedRecord.id;

                renderTableData(currentTableRecords);
            } else {
                currentTableRecords = [];
                selectedBarcode = null;
                showEmptyTable(`Không tìm thấy dữ liệu tem với barcode: "${barcode}"`);
                showToast('Thông báo', `Không tìm thấy thông tin tem cho mã ${barcode}`, 'warning');
            }
        } catch (err) {
            console.error('Lỗi tra cứu barcode:', err);
            showEmptyTable('Lỗi kết nối khi tra cứu dữ liệu tem');
            showToast('Lỗi', 'Lỗi khi tra cứu barcode: ' + err.message, 'error');
        } finally {
            isSearching = false;
        }
    }

    /* ══════════════════════════════════════════════════════════════════════
       5. MÃ MES (WORK ORDER) SEARCH LOGIC (/api/workorders/fetch-output-barcodes)
       ══════════════════════════════════════════════════════════════════════ */
    async function executeMesSearch(workOrderId) {
        if (!workOrderId || isSearching) return;
        isSearching = true;

        renderTableSkeleton();

        try {
            const resp = await fetch('/api/workorders/fetch-output-barcodes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ work_order_id: workOrderId })
            });

            const data = await resp.json();

            if (resp.ok && data.success && Array.isArray(data.result) && data.result.length > 0) {
                currentTableRecords = data.result.map(row => mapRowToObject(row, data.columns));
                selectedBarcode = currentTableRecords[0].barcode || currentTableRecords[0].id;

                renderTableData(currentTableRecords);
                showToast('Thành công', `Đã tải ${currentTableRecords.length} tem đầu ra của mã MES: ${workOrderId}`, 'success');
            } else {
                currentTableRecords = [];
                selectedBarcode = null;
                showEmptyTable(`Không tìm thấy tem đầu ra nào cho mã MES: "${workOrderId}"`);
                showToast('Thông báo', data.message || `Mã MES ${workOrderId} không có tem đầu ra`, 'warning');
            }
        } catch (err) {
            console.error('Lỗi tra cứu mã MES:', err);
            showEmptyTable('Lỗi kết nối khi tra cứu mã MES');
            showToast('Lỗi', 'Lỗi khi tra cứu mã MES: ' + err.message, 'error');
        } finally {
            isSearching = false;
        }
    }

    function mapRowToObject(row, columns) {
        const obj = {};
        columns.forEach((col, idx) => {
            obj[col] = row[idx];
        });

        // Normalize barcode key
        if (!obj.barcode && obj.id) {
            obj.barcode = obj.id;
        }

        // Parse info JSON if present
        if (typeof obj.info === 'string') {
            try {
                obj.parsed_info = JSON.parse(obj.info);
            } catch (e) {
                obj.parsed_info = {};
            }
        } else if (typeof obj.info === 'object' && obj.info !== null) {
            obj.parsed_info = obj.info;
        } else {
            obj.parsed_info = {};
        }

        return obj;
    }

    /* ══════════════════════════════════════════════════════════════════════
       6. TABLE RENDERING FUNCTIONS
       Columns: Hành động, Barcode, Quy Cách, Loại SP, Số lượng, Hạn Dùng, Ngày SX, Số Lô, Trạng thái, Người tạo
       - Barcode is In đậm Strong (exactly like Quy Cách)
       - Quantity strictly from collect_record
       ══════════════════════════════════════════════════════════════════════ */
    function renderTableData(records) {
        const standby = document.getElementById('standbyGuide');
        const dataTable = document.getElementById('dataTable');
        const tbody = document.getElementById('tableBody');

        if (standby) standby.style.display = 'none';
        if (dataTable) dataTable.style.display = 'table';

        if (!tbody) return;
        tbody.innerHTML = '';

        records.forEach((item, index) => {
            const tr = document.createElement('tr');
            const bc = item.barcode || item.id || '';

            if (selectedBarcode === bc || (!selectedBarcode && index === 0)) {
                tr.classList.add('row-selected');
                selectedBarcode = bc;
            }

            // Quantity strictly from collect_record
            const collectQty = (item.collect_quantity !== undefined && item.collect_quantity !== null && item.collect_quantity !== '')
                ? item.collect_quantity
                : (item.quantity ?? '-');

            const lotNumber = item.lot_number || item.parsed_info?.lot_number || '-';
            const statusInfo = STATUS_MAP[item.status] || { text: `Trạng thái ${item.status}`, cls: 'status-other' };

            tr.innerHTML = `
                <td>
                    <button type="button" class="btn-reprint-action btn-row-reprint" data-barcode="${bc}">
                        <span class="material-symbols-outlined" style="font-size:15px;">print</span>
                        <span>In</span>
                    </button>
                </td>
                <td><strong>${bc}</strong></td>
                <td><strong>${item.product_id || '-'}</strong></td>
                <td><span style="font-size:11.5px; font-weight:600; color:#475569;">${item.product_type || '-'}</span></td>
                <td><strong style="color:#0f766e; font-size:14px;">${collectQty}</strong></td>
                <td>${formatDateTime(item.expiry_time)}</td>
                <td>${formatDateTime(item.created_at)}</td>
                <td>${lotNumber}</td>
                <td><span class="status-pill ${statusInfo.cls}">${statusInfo.text}</span></td>
                <td>${item.created_by || '-'}</td>
            `;

            // Row click selects row
            tr.addEventListener('click', () => {
                document.querySelectorAll('#tableBody tr').forEach(r => r.classList.remove('row-selected'));
                tr.classList.add('row-selected');
                selectedBarcode = bc;
            });

            // Row print button event
            const rowBtn = tr.querySelector('.btn-row-reprint');
            if (rowBtn) {
                rowBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectedBarcode = bc;
                    document.querySelectorAll('#tableBody tr').forEach(r => r.classList.remove('row-selected'));
                    tr.classList.add('row-selected');
                    executePrint(bc, rowBtn);
                });
            }

            tbody.appendChild(tr);
        });
    }

    function renderTableSkeleton() {
        const standby = document.getElementById('standbyGuide');
        const dataTable = document.getElementById('dataTable');
        const tbody = document.getElementById('tableBody');

        if (standby) standby.style.display = 'none';
        if (dataTable) dataTable.style.display = 'table';

        if (!tbody) return;
        tbody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align:center; padding: 32px 16px; color:#64748b;">
                    <div style="display:inline-flex; align-items:center; gap:8px;">
                        <span class="material-symbols-outlined spin" style="font-size:20px; color:#0d9488;">progress_activity</span>
                        <span style="font-weight:600;">Đang tra cứu dữ liệu...</span>
                    </div>
                </td>
            </tr>
        `;
    }

    function showEmptyTable(message) {
        const standby = document.getElementById('standbyGuide');
        const dataTable = document.getElementById('dataTable');
        const tbody = document.getElementById('tableBody');

        if (standby) standby.style.display = 'none';
        if (dataTable) dataTable.style.display = 'table';

        if (!tbody) return;
        tbody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align:center; padding: 40px 16px; color:#64748b;">
                    <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
                        <span class="material-symbols-outlined" style="font-size:30px; color:#94a3b8;">sentiment_dissatisfied</span>
                        <span style="font-size:13.5px; font-weight:500;">${message}</span>
                    </div>
                </td>
            </tr>
        `;
    }

    function clearTableData() {
        const standby = document.getElementById('standbyGuide');
        const dataTable = document.getElementById('dataTable');

        if (standby) standby.style.display = 'flex';
        if (dataTable) dataTable.style.display = 'none';
        currentTableRecords = [];
        selectedBarcode = null;
    }

    function formatDateTime(dtStr) {
        if (!dtStr) return '-';
        return dtStr;
    }

    /* ══════════════════════════════════════════════════════════════════════
       7. PRINTER SELECTION VALIDATION
       - Default empty
       - Red border & Toast alert if not selected
       ══════════════════════════════════════════════════════════════════════ */
    function validatePrinterSelected() {
        const select = document.getElementById('printerSelect');
        const selectedPrinter = select ? select.value.trim() : '';

        if (!selectedPrinter || selectedPrinter === '-----') {
            if (select) {
                select.classList.remove('input-error');
                void select.offsetWidth; // Force CSS reflow to re-trigger shake animation
                select.classList.add('input-error');
                select.focus();
            }
            showToast('Chưa chọn máy in', 'Vui lòng chọn máy in trước khi thực hiện in tem!', 'warning');
            return false;
        }

        if (select) {
            select.classList.remove('input-error');
            select.style.borderColor = '';
            select.style.boxShadow = '';
        }
        return selectedPrinter;
    }

    /* ══════════════════════════════════════════════════════════════════════
       8. PRINT ACTION HANDLER (/api/barcodes/print-label-cups)
       ══════════════════════════════════════════════════════════════════════ */
    async function executePrint(barcode, triggerBtn = null) {
        if (isPrinting) return;

        // Force user to pick a printer
        const selectedPrinter = validatePrinterSelected();
        if (!selectedPrinter) return;

        const select = document.getElementById('printerSelect');
        const selectedOpt = select?.options[select.selectedIndex];
        const printerLabel = selectedOpt ? selectedOpt.textContent : selectedPrinter;

        if (triggerBtn) {
            triggerBtn.disabled = true;
            triggerBtn.innerHTML = '<span class="material-symbols-outlined spin" style="font-size:15px;">progress_activity</span><span>Đang in...</span>';
        }
        isPrinting = true;

        try {
            showToast('Đang gửi lệnh in', `Đang gửi lệnh in tem ${barcode} tới máy in: ${printerLabel}...`, 'info');

            const currentUsername = getCurrentReprintUsername();

            const resp = await fetch('/api/barcodes/print-label-cups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    barcode: barcode,
                    printer_name: selectedPrinter,
                    username: currentUsername
                })
            });

            const result = await resp.json();

            if (resp.ok && result.success) {
                const jobStr = result.job_id ? ` (Job #${result.job_id})` : '';
                showToast('Thành công', `Đã gửi lệnh in tem ${barcode} tới máy in "${printerLabel}"${jobStr} thành công!`, 'success');
            } else {
                throw new Error(result.message || `Lỗi gửi lệnh in tới máy in (${resp.status})`);
            }
        } catch (err) {
            console.error('Lỗi in tem:', err);
            const errMsg = err.message || 'Không thể thực hiện in tem';
            const title = (errMsg.includes('không tồn tại') || errMsg.includes('không có quyền')) ? 'Cảnh báo tài khoản' : 'Lỗi in tem';
            showToast(title, errMsg, 'error');
        } finally {
            if (triggerBtn) {
                triggerBtn.disabled = false;
                triggerBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:15px;">print</span><span>In</span>';
            }
            isPrinting = false;
        }
    }

    /* ══════════════════════════════════════════════════════════════════════
       9. STANDALONE TOAST NOTIFICATION (BOTTOM-RIGHT CORNER)
       ══════════════════════════════════════════════════════════════════════ */
    function showToast(title, message, type = 'info') {
        const container = document.getElementById('reprintToastContainer');
        if (!container) return;

        const iconMap = {
            success: 'check_circle',
            error: 'error',
            warning: 'warning',
            info: 'info'
        };

        const toast = document.createElement('div');
        toast.className = `reprint-toast toast-${type}`;
        toast.innerHTML = `
            <span class="material-symbols-outlined toast-icon">${iconMap[type] || 'info'}</span>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-msg">${message}</div>
            </div>
        `;

        container.appendChild(toast);

        const duration = type === 'error' ? 8000 : 4000;
        setTimeout(() => {
            toast.style.transition = 'opacity 0.28s ease, transform 0.28s ease';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(15px) scale(0.96)';
            setTimeout(() => toast.remove(), 280);
        }, duration);
    }

    // Expose for external callers
    window.showReprintToast = showToast;
})();

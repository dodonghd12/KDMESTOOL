/**
 * ══════════════════════════════════════════════════════════════════════════
 * KDMES Tem Vận Chuyển (Material Transfer) Controller
 * Real-time query, debounced search, OCR paste/drop support, status badges,
 * race condition protection, Excel export hook, and light/dark theme support.
 * ══════════════════════════════════════════════════════════════════════════
 */

const LOCATION_NAME_MAP = {
    '1': 'KY',
    '2': 'KU',
    '3': 'KS',
    '4': 'KC',
    '5': 'KV1',
    '6': 'KV2',
    '7': 'KT1',
    '8': 'KT2',
    '9': 'KI'
};

const COLUMN_HEADERS_MAP = {
    'id': 'Barcode',
    'from_location_oid': 'Kho chuyển',
    'to_location_oid': 'Kho nhận',
    'status': 'Trạng thái',
    'product_id': 'Quy cách',
    'product_type': 'Loại SP',
    'quantity': 'Số lượng',
    'transaction_time': 'Thời gian giao dịch',
    'created_at': 'Thời gian tạo',
    'created_by': 'Người tạo',
    'material_resource_oid': 'Material Resource OID'
};

let currentRawCols = [];
let isDecorating = false;
let currentSearchSeq = 0;
let currentAbortController = null;

document.addEventListener('DOMContentLoaded', function () {
    initializeMaterialTransferEventListeners();
    initTableBodyObserver();
});

function initializeMaterialTransferEventListeners() {
    const barcodeInput = document.getElementById('barcode');
    if (barcodeInput) {
        // 1. Debounced search on input typing / pasting (500ms delay)
        barcodeInput.addEventListener(
            'input',
            debounceSearch(searchMaterialTransfer, 500)
        );

        // 2. Immediate visual feedback: uppercase + skeleton / clear
        barcodeInput.addEventListener('input', e => {
            e.target.value = e.target.value.toUpperCase();
            if (e.target.value.trim()) {
                if (typeof showTableSkeleton === 'function') {
                    showTableSkeleton(11, 8);
                }
            } else {
                clearTable();
                if (typeof resetOcrDropzone === 'function') {
                    resetOcrDropzone();
                }
            }
        });

        // 3. Immediate search on Enter key (e.g. barcode scanner gun)
        barcodeInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchMaterialTransfer();
            }
        });
    }

    // 4. Handle click on retry button in FAILED status rows
    document.addEventListener('click', async function (e) {
        const btn = e.target.closest('.material-transfer-retry-btn');
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        if (btn.disabled || btn.classList.contains('is-spinning')) return;

        const oid = (btn.getAttribute('data-oid') || '').trim();
        const quantity = (btn.getAttribute('data-quantity') || '').trim();
        if (!oid) {
            if (typeof Toast !== 'undefined') Toast.error('Lỗi', 'Không tìm thấy mã material_resource_oid');
            return;
        }

        // 1. Icon xoay vòng
        btn.disabled = true;
        btn.classList.add('is-spinning');

        try {
            const response = await fetch('/api/material-transfer/retry-failed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ material_resource_oid: oid, quantity: quantity })
            });
            const data = await response.json();

            if (!response.ok || !data || data.success === false) {
                btn.classList.remove('is-spinning');
                btn.disabled = false;
                const errMsg = (data && data.message) ? data.message : `Lỗi cập nhật (${response.status})`;
                if (typeof Toast !== 'undefined') Toast.error('Thất bại', errMsg);
                return;
            }

            // Dừng xoay
            btn.classList.remove('is-spinning');

            // 2. Cập nhật text trạng thái dòng hiển thị sang PREPARED
            const statusCell = btn.closest('td');
            const tr = btn.closest('tr');

            if (statusCell) {
                statusCell.setAttribute('data-full-value', 'PREPARED');
                const statusTextEl = statusCell.querySelector('.material-transfer-status-text');
                if (statusTextEl) {
                    statusTextEl.textContent = 'PREPARED';
                    statusTextEl.className = 'material-transfer-status-text status-pending';
                }
            }

            // Đồng bộ dữ liệu cache trong bộ nhớ
            if (tr && currentRawCols) {
                const statusIdx = currentRawCols.indexOf('status');
                const rowIndex = parseInt(tr.dataset.index, 10);
                if (!isNaN(rowIndex)) {
                    if (typeof rawTableData !== 'undefined' && Array.isArray(rawTableData) && rawTableData[rowIndex]) {
                        rawTableData[rowIndex][statusIdx] = 'PREPARED';
                    }
                    if (typeof filteredTableData !== 'undefined' && Array.isArray(filteredTableData) && filteredTableData[rowIndex]) {
                        filteredTableData[rowIndex][statusIdx] = 'PREPARED';
                    }
                }
            }

            // 3. Nút refresh đổi thành nút Dấu tích V (check)
            btn.classList.add('is-success');
            btn.title = 'Đã cập nhật PREPARED thành công';
            btn.innerHTML = '<span class="material-symbols-outlined check-icon">check</span>';

            if (typeof Toast !== 'undefined') {
                Toast.success('Thành công', 'Đã chuyển trạng thái sang PREPARED');
            }

            // 4. Sau tầm 3 giây thì nút dấu V thành công đó sẽ biến mất
            setTimeout(() => {
                btn.classList.add('fade-out');
                setTimeout(() => {
                    btn.remove();
                }, 300);
            }, 3000);

        } catch (err) {
            console.error('Lỗi khi cập nhật trạng thái tem vận chuyển:', err);
            btn.classList.remove('is-spinning');
            btn.disabled = false;
            if (typeof Toast !== 'undefined') Toast.error('Lỗi kết nối', 'Không thể gửi yêu cầu cập nhật trạng thái');
        }
    });
}

async function searchMaterialTransfer() {
    const barcodeInput = document.getElementById('barcode');
    if (!barcodeInput) return;

    const keyword = barcodeInput.value.trim();
    if (!keyword) {
        clearTable();
        if (typeof resetOcrDropzone === 'function') {
            resetOcrDropzone();
        }
        return;
    }

    // Cancel in-flight request if user is typing rapidly
    if (currentAbortController) {
        currentAbortController.abort();
    }
    currentAbortController = new AbortController();
    const seq = ++currentSearchSeq;

    if (typeof showTableSkeleton === 'function') {
        showTableSkeleton(11, 8);
    }

    try {
        const response = await fetch('/api/barcodes/material-transfer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword }),
            signal: currentAbortController.signal
        });

        // If a newer search was started while this was in-flight, discard stale result
        if (seq !== currentSearchSeq) return;

        let data = null;
        try {
            data = await response.json();
        } catch (e) { }

        if (typeof isUnauthorizedResponse === 'function' && isUnauthorizedResponse(response.status, data)) {
            if (typeof showAuthExpiredModal === 'function') {
                showAuthExpiredModal(data ? data.message : null);
            }
            clearTable();
            return;
        }

        if (!response.ok || (data && data.success === false)) {
            Toast.error('Lỗi kết nối cơ sở dữ liệu', (data && data.message) ? data.message : `Lỗi (${response.status})`);
            clearTable();
            return;
        }

        if (data && data.resolved_barcode && barcodeInput && barcodeInput.value.trim() !== data.resolved_barcode) {
            barcodeInput.value = data.resolved_barcode;
        }

        const rawRows = (data && Array.isArray(data.result)) ? data.result : [];
        const rawCols = (data && Array.isArray(data.columns)) ? data.columns : [];
        currentRawCols = rawCols;

        // Human-friendly columns
        const displayColumns = rawCols.map(c => COLUMN_HEADERS_MAP[c] || c);

        // Map location IDs to factory names in the rows for friendly display
        const fromLocIdx = rawCols.indexOf('from_location_oid');
        const toLocIdx = rawCols.indexOf('to_location_oid');

        const formattedRows = rawRows.map(row => {
            const newRow = Array.isArray(row) ? [...row] : Object.values(row);
            if (fromLocIdx !== -1 && newRow[fromLocIdx] != null) {
                const rawVal = String(newRow[fromLocIdx]).trim();
                const locName = LOCATION_NAME_MAP[rawVal];
                if (locName) newRow[fromLocIdx] = `${locName} (${rawVal})`;
            }
            if (toLocIdx !== -1 && newRow[toLocIdx] != null) {
                const rawVal = String(newRow[toLocIdx]).trim();
                const locName = LOCATION_NAME_MAP[rawVal];
                if (locName) newRow[toLocIdx] = `${locName} (${rawVal})`;
            }
            return newRow;
        });

        setTableData(
            formattedRows,
            displayColumns,
            'material_transfer',
            `Không tìm thấy tem vận chuyển nào với từ khóa "${keyword}"`,
            `Tìm thấy ${formattedRows.length} lượt vận chuyển cho tem "${keyword}"`
        );

        // Enhance cells with status badges & location pills
        applyMaterialTransferTableEnhancements();

    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Error searching material transfer:', error);
        Toast.error('Lỗi', 'Lỗi kết nối khi tìm kiếm Tem vận chuyển');
        clearTable();
    }
}

/**
 * Hook export Excel for custom file naming and sheet name
 */
window.getPageExportData = function () {
    const barcodeInput = document.getElementById('barcode');
    const kw = barcodeInput ? barcodeInput.value.trim() : '';
    const ts = (typeof getVietnamTimestamp === 'function') ? getVietnamTimestamp() : new Date().toISOString().slice(0, 10);
    const filename = kw 
        ? `Tem_Van_Chuyen_${kw}_${ts}.xlsx` 
        : `Tem_Van_Chuyen_${ts}.xlsx`;
    return {
        rows: (typeof filteredTableData !== 'undefined' && Array.isArray(filteredTableData) && filteredTableData.length > 0)
            ? filteredTableData
            : ((typeof rawTableData !== 'undefined' && Array.isArray(rawTableData)) ? rawTableData : []),
        columns: (typeof rawTableColumns !== 'undefined' && Array.isArray(rawTableColumns)) ? rawTableColumns : [],
        filename: filename,
        sheetName: 'Tem vận chuyển'
    };
};

/**
 * Apply status badges, location pills, product type badges, and monospaced font to table cells
 */
function applyMaterialTransferTableEnhancements() {
    if (isDecorating) return;
    const tbody = document.getElementById('tableBody');
    if (!tbody || !currentRawCols || currentRawCols.length === 0) return;

    isDecorating = true;
    try {
        const statusIdx = currentRawCols.indexOf('status');
        const fromLocIdx = currentRawCols.indexOf('from_location_oid');
        const toLocIdx = currentRawCols.indexOf('to_location_oid');
        const idIdx = currentRawCols.indexOf('id');
        const productTypeIdx = currentRawCols.indexOf('product_type');
        const qtyIdx = currentRawCols.indexOf('quantity');
        const oidIdx = currentRawCols.indexOf('material_resource_oid');

        const rows = tbody.querySelectorAll('tr');
        rows.forEach(tr => {
            const cells = tr.querySelectorAll('td');
            if (cells.length < currentRawCols.length) return;

            // 1. Status Text (no background, no border, no icon) + Refresh button for FAILED
            if (statusIdx !== -1 && cells[statusIdx]) {
                const cell = cells[statusIdx];
                const statusVal = (cell.getAttribute('data-full-value') || cell.textContent || '').trim().toUpperCase();
                const safeStatus = (typeof escapeHtml === 'function') ? escapeHtml(statusVal) : statusVal;

                // Lấy OID của material_resource từ ô material_resource_oid
                let rowOid = '';
                if (oidIdx !== -1 && cells[oidIdx]) {
                    rowOid = (cells[oidIdx].getAttribute('data-full-value') || cells[oidIdx].textContent || '').trim();
                }

                // Lấy giá trị quantity của dòng dữ liệu
                let rowQty = '';
                if (qtyIdx !== -1 && cells[qtyIdx]) {
                    rowQty = (cells[qtyIdx].getAttribute('data-full-value') || cells[qtyIdx].textContent || '').trim();
                }

                if (statusVal === 'SUCCEEDED' && !cell.querySelector('.material-transfer-status-text')) {
                    cell.innerHTML = `<span class="material-transfer-status-text status-succeeded">SUCCEEDED</span>`;
                } else if (statusVal === 'FAILED') {
                    if (!cell.querySelector('.material-transfer-retry-btn') && !cell.querySelector('.material-transfer-status-cell')) {
                        const safeOid = (typeof escapeHtml === 'function') ? escapeHtml(rowOid) : rowOid;
                        const safeQty = (typeof escapeHtml === 'function') ? escapeHtml(rowQty) : rowQty;
                        cell.innerHTML = `
                            <div class="material-transfer-status-cell">
                                <span class="material-transfer-status-text status-failed">FAILED</span>
                                <button type="button" class="material-transfer-retry-btn" data-oid="${safeOid}" data-quantity="${safeQty}" title="Đổi trạng thái sang PREPARED" aria-label="Đổi trạng thái sang PREPARED">
                                    <span class="material-symbols-outlined">refresh</span>
                                </button>
                            </div>
                        `;
                    }
                } else if (statusVal && statusVal !== '-' && !cell.querySelector('.material-transfer-status-text')) {
                    cell.innerHTML = `<span class="material-transfer-status-text status-pending">${safeStatus}</span>`;
                }
            }

            // 2. Location Text (no background, no border, no icon)
            [fromLocIdx, toLocIdx].forEach(locIdx => {
                if (locIdx !== -1 && cells[locIdx]) {
                    const cell = cells[locIdx];
                    const locText = cell.textContent.trim();
                    const safeLoc = (typeof escapeHtml === 'function') ? escapeHtml(locText) : locText;
                    if (locText && locText !== '-' && !cell.querySelector('.material-transfer-location-text')) {
                        cell.innerHTML = `<span class="material-transfer-location-text">${safeLoc}</span>`;
                    }
                }
            });

            // 3. Barcode text monospaced
            if (idIdx !== -1 && cells[idIdx]) {
                const cell = cells[idIdx];
                cell.classList.add('material-transfer-barcode-code');
            }

            // 4. Product Type Badge
            if (productTypeIdx !== -1 && cells[productTypeIdx]) {
                const cell = cells[productTypeIdx];
                const typeText = cell.textContent.trim();
                if (typeText && typeText !== '-' && !cell.querySelector('.mes-product-type-badge')) {
                    const safeType = (typeof escapeHtml === 'function') ? escapeHtml(typeText) : typeText;
                    cell.innerHTML = `<span class="mes-product-type-badge mes-badge-${typeText.toLowerCase()}">${safeType}</span>`;
                }
            }

            // 5. Quantity text right-alignment
            if (qtyIdx !== -1 && cells[qtyIdx]) {
                cells[qtyIdx].classList.add('text-right');
            }
        });
    } finally {
        isDecorating = false;
    }
}

/**
 * MutationObserver to automatically re-apply badges when table is filtered by clientSearch
 */
function initTableBodyObserver() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    const observer = new MutationObserver(() => {
        if (!isDecorating) {
            applyMaterialTransferTableEnhancements();
        }
    });

    observer.observe(tbody, { childList: true });
}

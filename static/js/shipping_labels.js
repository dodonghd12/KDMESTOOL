/**
 * ══════════════════════════════════════════════════════════════════════════
 * KDMES Tem Vận Chuyển (Shipping Labels) Controller
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
    'id': 'Mã Tem / Barcode',
    'from_location_oid': 'Kho chuyển (Từ)',
    'to_location_oid': 'Kho nhận (Đến)',
    'status': 'Trạng thái',
    'product_id': 'Quy cách (Product ID)',
    'product_type': 'Loại SP (Type)',
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
    initializeShippingLabelsEventListeners();
    initTableBodyObserver();
});

function initializeShippingLabelsEventListeners() {
    const barcodeInput = document.getElementById('barcode');
    if (barcodeInput) {
        // 1. Debounced search on input typing / pasting (500ms delay)
        barcodeInput.addEventListener(
            'input',
            debounceSearch(searchShippingLabels, 500)
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
                searchShippingLabels();
            }
        });
    }
}

async function searchShippingLabels() {
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
        const response = await fetch('/api/barcodes/shipping-labels', {
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
            'shipping_labels',
            `Không tìm thấy tem vận chuyển nào với từ khóa "${keyword}"`,
            `Tìm thấy ${formattedRows.length} lượt vận chuyển cho tem "${keyword}"`
        );

        // Enhance cells with status badges & location pills
        applyShippingTableEnhancements();

    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Error searching shipping labels:', error);
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
function applyShippingTableEnhancements() {
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

        const rows = tbody.querySelectorAll('tr');
        rows.forEach(tr => {
            const cells = tr.querySelectorAll('td');
            if (cells.length < currentRawCols.length) return;

            // 1. Status Badge
            if (statusIdx !== -1 && cells[statusIdx]) {
                const cell = cells[statusIdx];
                const statusText = cell.textContent.trim().toUpperCase();
                const safeStatus = (typeof escapeHtml === 'function') ? escapeHtml(statusText) : statusText;
                if (statusText === 'SUCCEEDED' && !cell.querySelector('.shipping-status-badge')) {
                    cell.innerHTML = `<span class="shipping-status-badge status-succeeded"><span class="badge-dot"></span>SUCCEEDED</span>`;
                } else if (statusText === 'FAILED' && !cell.querySelector('.shipping-status-badge')) {
                    cell.innerHTML = `<span class="shipping-status-badge status-failed"><span class="badge-dot"></span>FAILED</span>`;
                } else if (statusText && statusText !== '-' && !cell.querySelector('.shipping-status-badge')) {
                    cell.innerHTML = `<span class="shipping-status-badge status-pending"><span class="badge-dot"></span>${safeStatus}</span>`;
                }
            }

            // 2. Location Pills
            [fromLocIdx, toLocIdx].forEach(locIdx => {
                if (locIdx !== -1 && cells[locIdx]) {
                    const cell = cells[locIdx];
                    const locText = cell.textContent.trim();
                    const safeLoc = (typeof escapeHtml === 'function') ? escapeHtml(locText) : locText;
                    if (locText && locText !== '-' && !cell.querySelector('.shipping-location-pill')) {
                        cell.innerHTML = `<span class="shipping-location-pill"><span class="material-symbols-outlined location-icon">warehouse</span>${safeLoc}</span>`;
                    }
                }
            });

            // 3. Barcode text monospaced
            if (idIdx !== -1 && cells[idIdx]) {
                const cell = cells[idIdx];
                cell.classList.add('shipping-barcode-code');
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
            applyShippingTableEnhancements();
        }
    });

    observer.observe(tbody, { childList: true });
}

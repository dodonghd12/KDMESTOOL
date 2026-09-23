/**
 * ==============================================================================
 * KDMES TOOL — POSTGRES DELETED DATA CONTROLLER
 * Truy vấn & Lọc dữ liệu PostgreSQL bị xóa (Audit Log) và Xuất câu lệnh Insert Query
 * ==============================================================================
 */

let allFetchedRecords = [];
let tableColumns = ['Table', 'Time', 'client_ip', 'Database', 'Data'];
let selectedTableFilter = '';
let selectedFromDate = '';
let selectedToDate = '';
let flatpickrInstance = null;

const AUDIT_TABLES = [
    'material_resource',
    'work_order',
    'collect_record',
    'feed_record',
    'batch',
    'defective_code',
    'defective_records',
    'recipe',
    'recipe_process_definition'
];

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePostgresDeletedData);
} else {
    initializePostgresDeletedData();
}

function initializePostgresDeletedData() {
    initControls();
    initDatePicker();
    initTableDropdown();

    // Tự động tải dữ liệu khi vào trang
    fetchDeletedRecordsLog();
}

function resetAllFiltersAndTable() {
    // 1. Reset filter variables
    selectedTableFilter = '';
    selectedFromDate = '';
    selectedToDate = '';

    // 2. Reset DOM controls
    const tableInput = document.getElementById('table_filter');
    if (tableInput) {
        tableInput.value = '';
        const box = tableInput.closest('.input-box');
        if (box) box.classList.remove('has-value');
    }

    const dateInput = document.getElementById('dateRange');
    const fromDateEl = document.getElementById('fromDate');
    const toDateEl = document.getElementById('toDate');
    if (flatpickrInstance) {
        flatpickrInstance.clear();
    }
    if (dateInput) dateInput.value = '';
    if (fromDateEl) fromDateEl.value = '';
    if (toDateEl) toDateEl.value = '';

    const searchInput = document.getElementById('clientSearch');
    if (searchInput) {
        searchInput.value = '';
    }

    // 3. Clear table container state
    allFetchedRecords = [];
    rawTableData = [];
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    const rowCount = document.getElementById('rowCount');
    if (thead) thead.innerHTML = '';
    if (tbody) tbody.innerHTML = '';
    if (rowCount) rowCount.textContent = '0';

    const tableFooter = document.querySelector('.table-footer');
    if (tableFooter) tableFooter.classList.add('hidden');

    const insertBtn = document.getElementById('btnInsertQuery');
    if (insertBtn) insertBtn.disabled = true;
}

function initControls() {
    const checkBtn = document.getElementById('btnCheckDeletedData');
    if (checkBtn) {
        checkBtn.addEventListener('click', () => {
            resetAllFiltersAndTable();
            fetchDeletedRecordsLog();
        });
    }

    const searchInput = document.getElementById('clientSearch');
    if (searchInput) {
        searchInput.disabled = false;
        searchInput.removeAttribute('disabled');
        searchInput.addEventListener('input', () => {
            applyAllFilters();
        });
    }

    // Override updateClientSearchState trên page này để clientSearch luôn luôn enable
    window.updateClientSearchState = function () {
        const input = document.getElementById('clientSearch');
        if (input) {
            input.disabled = false;
            input.removeAttribute('disabled');
        }
    };

    const insertQueryBtn = document.getElementById('btnInsertQuery');
    if (insertQueryBtn) {
        insertQueryBtn.addEventListener('click', () => {
            generateInsertQueries();
        });
    }

    // Đảm bảo bật clientSearch ngay lập tức và sau DOM update
    ensureClientSearchEnabled();
    setTimeout(ensureClientSearchEnabled, 50);
    setTimeout(ensureClientSearchEnabled, 250);
}

function ensureClientSearchEnabled() {
    const searchInput = document.getElementById('clientSearch');
    if (searchInput) {
        searchInput.disabled = false;
        searchInput.removeAttribute('disabled');
    }
}

function initDatePicker() {
    const dateInput = document.getElementById('dateRange');
    const fromDateEl = document.getElementById('fromDate');
    const toDateEl = document.getElementById('toDate');

    if (!dateInput || typeof flatpickr === 'undefined') return;

    if (fromDateEl) fromDateEl.value = '';
    if (toDateEl) toDateEl.value = '';
    dateInput.value = '';

    flatpickrInstance = flatpickr(dateInput, {
        mode: "range",
        dateFormat: "Y-m-d",
        maxDate: "today",
        allowInput: false,
        clickOpens: true,
        defaultDate: null,
        locale: {
            rangeSeparator: "  →  ",
            firstDayOfWeek: 1,
            weekdays: {
                shorthand: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"],
                longhand: ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"]
            },
            months: {
                shorthand: ["Th1", "Th2", "Th3", "Th4", "Th5", "Th6", "Th7", "Th8", "Th9", "Th10", "Th11", "Th12"],
                longhand: ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"]
            }
        },
        onClose(selectedDates) {
            if (selectedDates.length === 1) {
                const dateStr = formatDateToStr(selectedDates[0]);
                selectedFromDate = dateStr;
                selectedToDate = dateStr;
                if (fromDateEl) fromDateEl.value = dateStr;
                if (toDateEl) toDateEl.value = dateStr;
                dateInput.value = dateStr;
            } else if (selectedDates.length === 2) {
                selectedFromDate = formatDateToStr(selectedDates[0]);
                selectedToDate = formatDateToStr(selectedDates[1]);
                if (fromDateEl) fromDateEl.value = selectedFromDate;
                if (toDateEl) toDateEl.value = selectedToDate;
            } else {
                selectedFromDate = '';
                selectedToDate = '';
                if (fromDateEl) fromDateEl.value = '';
                if (toDateEl) toDateEl.value = '';
                dateInput.value = '';
            }

            applyAllFilters();
        }
    });

    dateInput.addEventListener('click', function () {
        if (dateInput.value && flatpickrInstance) {
            flatpickrInstance.clear();
            selectedFromDate = '';
            selectedToDate = '';
            if (fromDateEl) fromDateEl.value = '';
            if (toDateEl) toDateEl.value = '';
            dateInput.value = '';
            applyAllFilters();
        }
    });
}

function formatDateToStr(date) {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function initTableDropdown() {
    const input = document.getElementById('table_filter');
    const dropdown = document.getElementById('table-filter-dropdown');
    if (!input || !dropdown) return;

    input.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTableDropdown();
    });

    input.addEventListener('input', () => {
        selectedTableFilter = input.value.trim();
        const box = input.closest('.input-box');
        if (box) {
            if (input.value && input.value.trim().length > 0) {
                box.classList.add('has-value');
            } else {
                box.classList.remove('has-value');
            }
        }
        applyAllFilters();
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });
}

function toggleTableDropdown() {
    const dropdown = document.getElementById('table-filter-dropdown');
    if (!dropdown) return;

    if (dropdown.classList.contains('show')) {
        dropdown.classList.remove('show');
        return;
    }

    renderTableDropdownItems();
    dropdown.classList.add('show');
}

function renderTableDropdownItems() {
    const dropdown = document.getElementById('table-filter-dropdown');
    const input = document.getElementById('table_filter');
    if (!dropdown || !input) return;

    dropdown.innerHTML = '';

    const items = ['Tất cả bảng', ...AUDIT_TABLES];

    items.forEach(tbl => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.textContent = tbl;
        item.dataset.value = tbl === 'Tất cả bảng' ? '' : tbl;

        const isSelected = (tbl === 'Tất cả bảng' && !selectedTableFilter) || (tbl === selectedTableFilter);
        if (isSelected) {
            item.classList.add('selected');
        }

        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            selectedTableFilter = item.dataset.value;
            input.value = selectedTableFilter ? selectedTableFilter : '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            dropdown.classList.remove('show');
            input.blur();
            applyAllFilters();
        });

        dropdown.appendChild(item);
    });
}

function applyAllFilters() {
    const searchInput = document.getElementById('clientSearch');
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';

    let filtered = allFetchedRecords.filter(row => {
        // row[0]: Table, row[1]: Time ("YYYY-MM-DD HH:MM:SS"), row[2]: client_ip, row[3]: Database, row[4]: Data
        const rowTable = String(row[0] || '').trim();
        const rowTime = String(row[1] || '').trim();

        // 1. Lọc theo Bảng
        if (selectedTableFilter && selectedTableFilter !== 'Tất cả bảng') {
            if (rowTable.toLowerCase() !== selectedTableFilter.toLowerCase()) {
                return false;
            }
        }

        // 2. Lọc theo Khoảng ngày (Date Range)
        if (selectedFromDate && selectedToDate) {
            const startBound = selectedFromDate + ' 00:00:00';
            const endBound = selectedToDate + ' 23:59:59';
            if (rowTime < startBound || rowTime > endBound) {
                return false;
            }
        } else if (selectedFromDate) {
            const startBound = selectedFromDate + ' 00:00:00';
            const endBound = selectedFromDate + ' 23:59:59';
            if (rowTime < startBound || rowTime > endBound) {
                return false;
            }
        }

        // 3. Lọc theo Client Search
        if (searchTerm) {
            const matches = row.some(cell => String(cell || '').toLowerCase().includes(searchTerm));
            if (!matches) {
                return false;
            }
        }

        return true;
    });

    rawTableData = filtered;
    rawTableColumns = tableColumns;

    displayTable(filtered, tableColumns);
    ensureClientSearchEnabled();

    const rowCount = document.getElementById('rowCount');
    if (rowCount) {
        rowCount.textContent = filtered.length.toLocaleString();
    }

    const tableFooter = document.querySelector('.table-footer');
    if (tableFooter) {
        if (filtered.length > 0) {
            tableFooter.classList.remove('hidden');
        } else {
            tableFooter.classList.add('hidden');
        }
    }

    const insertBtn = document.getElementById('btnInsertQuery');
    if (insertBtn) {
        insertBtn.disabled = (filtered.length === 0);
    }
}

async function fetchDeletedRecordsLog() {
    const checkBtn = document.getElementById('btnCheckDeletedData');
    if (checkBtn) {
        checkBtn.disabled = true;
    }

    if (typeof showTableSkeleton === 'function') {
        showTableSkeleton(5, 5);
    }

    try {
        const response = await fetch('/api/postgres/get-deleted-records-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });

        let data = null;
        try {
            data = await response.json();
        } catch (e) {}

        if (typeof isUnauthorizedResponse === 'function' && isUnauthorizedResponse(response.status, data)) {
            if (typeof showAuthExpiredModal === 'function') {
                showAuthExpiredModal(data ? data.message : null);
            }
            return;
        }

        if (data && Array.isArray(data.result)) {
            allFetchedRecords = data.result;
            tableColumns = data.columns || ['Table', 'Time', 'client_ip', 'Database', 'Data'];

            applyAllFilters();

            if (typeof Toast !== 'undefined' && Toast.success) {
                Toast.success('Thành công', `Đã tải ${allFetchedRecords.length.toLocaleString()} bản ghi PostgreSQL bị xóa`);
            }
        } else {
            allFetchedRecords = [];
            tableColumns = data ? (data.columns || ['Table', 'Time', 'client_ip', 'Database', 'Data']) : ['Table', 'Time', 'client_ip', 'Database', 'Data'];
            applyAllFilters();

            if (typeof Toast !== 'undefined' && Toast.warning) {
                Toast.warning('Không có dữ liệu', (data && data.message) ? data.message : 'Chưa có bản ghi PostgreSQL nào bị xóa được ghi nhận.');
            }
        }
    } catch (error) {
        console.error('Error fetching postgres deleted records log:', error);
        if (typeof Toast !== 'undefined' && Toast.error) {
            Toast.error('Lỗi kết nối', 'Không thể kết nối tới máy chủ để đọc file audit log.');
        }
        allFetchedRecords = [];
        applyAllFilters();
    } finally {
        if (checkBtn) {
            checkBtn.disabled = false;
        }
        document.body.classList.remove('app-loading-state');
    }
}

async function generateInsertQueries() {
    if (!rawTableData || rawTableData.length === 0) {
        if (typeof Toast !== 'undefined' && Toast.warning) {
            Toast.warning('Không có dữ liệu', 'Không có bản ghi nào trên bảng để tạo câu lệnh Insert.');
        }
        return;
    }

    const insertBtn = document.getElementById('btnInsertQuery');
    if (insertBtn) {
        insertBtn.disabled = true;
    }

    if (typeof showLoading === 'function') {
        showLoading();
    }

    try {
        const rowsToSend = rawTableData.map(r => ({
            table: r[0],
            time: r[1],
            client_ip: r[2],
            schema: r[3],
            data: r[4]
        }));

        const res = await fetch('/api/postgres/generate-insert-query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                rows: rowsToSend
            })
        });

        let result = null;
        try {
            result = await res.json();
        } catch (e) {}

        if (typeof isUnauthorizedResponse === 'function' && isUnauthorizedResponse(res.status, result)) {
            if (typeof showAuthExpiredModal === 'function') {
                showAuthExpiredModal(result ? result.message : null);
            }
            return;
        }

        if (!res.ok || !result || !result.success) {
            const msg = (result && result.message) ? result.message : `Lỗi khi tạo câu lệnh Insert (HTTP ${res.status})`;
            if (typeof Toast !== 'undefined' && Toast.error) {
                Toast.error('Lỗi tạo Insert Query', msg);
            }
            return;
        }

        // Tải file .txt về máy người dùng
        const content = result.content || '';
        const filename = result.filename || `postgres_insert_queries_${new Date().toISOString().slice(0, 10)}.txt`;

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);

        if (typeof Toast !== 'undefined' && Toast.success) {
            Toast.success('Thành công', `Đã xuất file câu lệnh Insert (${result.count || rowsToSend.length} bản ghi)`);
        }
    } catch (err) {
        console.error('Error generating insert queries:', err);
        if (typeof Toast !== 'undefined' && Toast.error) {
            Toast.error('Lỗi hệ thống', err.message || 'Không thể tạo file câu lệnh Insert.');
        }
    } finally {
        if (typeof hideLoading === 'function') {
            hideLoading();
        }
        if (insertBtn) {
            insertBtn.disabled = (rawTableData.length === 0);
        }
    }
}

let winxInsertRows   = [];
let winxWorkOrderId  = '';
let winxRecipeId     = '';
let winxProductId    = '';
let winxReservedDate = '';
let winxAllCRRows    = [];
let winxFilteredSeqs = [];
let winxCRResourceOids = [];
let winxExistingResourceOidSet = new Set();
let winxBulkRawResult = [];
let winxBulkColumns   = [];
let cachedDepartments = [];
let selectedDepartmentOid = null;
let cachedStations = [];
let cachedStationsDeptKey = null;

document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('sidebar:logout', handleLogout);
    document.addEventListener('sidebar:about',  showAbout);

    const inp = document.getElementById('workOrderInput');
    if (inp) {
        inp.addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') fetchCollectRecords(); });
    }

    const mrInputIds = ['mr_id', 'mr_product_id', 'mr_station', 'mr_quantity', 'mr_lot_number', 'mr_created_at', 'mr_expiry_time', 'mr_created_by'];
    mrInputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('keydown', e => { if (e.key === 'Enter') handleInsertMaterialResource(); });
        }
    });

    initMRFormUI();

    setTimeout(() => {
        speechBubble.show('✨ Magic Winx — Chọn sequence để insert TIRE từ GREEN_TIRE!', {
            duration: 8000, animation: 'bounce'
        });
    }, 800);
});

// ── STEP 1: fetch toàn bộ collect_records ────────────────────────────────────
async function fetchCollectRecords() {
    const wo = document.getElementById('workOrderInput').value.trim();
    if (!wo) {
        showAlert('Vui lòng nhập Work Order ID', 'warning');
        return;
    }
    winxWorkOrderId = wo;

    const data = await apiFetch('/api/magic-winx/work-order/fetch-collect-records', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ work_order_id: wo })
    });

    if (!data.success) {
        showAlert(data.message || 'Lỗi khi tải dữ liệu', 'error');
        return;
    }

    winxProductId    = data.product_id;
    winxReservedDate = data.reserved_date;
    winxRecipeId     = data.recipe_id || '';
    winxAllCRRows    = data.collect_records || [];

    winxCRResourceOids = winxAllCRRows.map(r => r.resource_oid).filter(Boolean);
    await checkExistingMaterialResources();

    buildLotFilterBar(data.lot_numbers || []);
    renderSelectTable(winxAllCRRows);
    updateSelectedCount();

    document.getElementById('selectModal').style.display = 'flex';

    speechBubble.show(
        `📋 Tìm thấy ${data.total} collect records — hãy chọn các dòng cần xử lý`,
        { duration: 6000, animation: 'bounce' }
    );
}

async function checkExistingMaterialResources() {
    winxExistingResourceOidSet = new Set();

    if (!winxCRResourceOids.length) return;

    const uniqueOids = [...new Set(winxCRResourceOids)];

    const data = await apiFetch('/api/magic-winx/collect-record/material-resource-existed', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ resource_ids: uniqueOids })
    });

    if (data.success && Array.isArray(data.existed_oids)) {
        winxExistingResourceOidSet = new Set(data.existed_oids);
    }
}

// ── BUILD LOT FILTER ──────────────────────────────────────────────────────────
function buildLotFilterBar(lotNumbers) {
    const bar = document.getElementById('lotFilterBar');
    bar.innerHTML = `
        <span class="winx-lot-label">Lọc theo Lot:</span>
        <button class="winx-lot-btn active" data-lot="ALL" onclick="filterByLot('ALL', this)">Tất cả</button>
    `;
    lotNumbers.forEach(lot => {
        const btn = document.createElement('button');
        btn.className   = 'winx-lot-btn';
        btn.dataset.lot = lot;
        btn.textContent = lot;
        btn.onclick     = function() { filterByLot(lot, this); };
        bar.appendChild(btn);
    });
}

// ── FILTER BY LOT ─────────────────────────────────────────────────────────────
const activeLots = new Set();

function filterByLot(lot, btn) {
    deselectAll();

    const allBtn = document.querySelector('.winx-lot-btn[data-lot="ALL"]');
    if (lot === 'ALL') {
        activeLots.clear();
        document.querySelectorAll('.winx-lot-btn').forEach(b => b.classList.remove('active'));
        allBtn.classList.add('active');

    } else {
        if (activeLots.has(lot)) {
            activeLots.delete(lot);
            btn.classList.remove('active');
        } else {
            activeLots.add(lot);
            btn.classList.add('active');
        }

        if (activeLots.size === 0) {
            allBtn.classList.add('active');
        } else {
            allBtn.classList.remove('active');
        }
    }

    const rows = document.querySelectorAll('#selectTableBody tr');
    rows.forEach(tr => {
        const show = activeLots.size === 0 || activeLots.has(tr.dataset.lot);
        tr.classList.toggle('hidden-row', !show);
    });

    updateSelectedCount();
}

// ── RENDER SELECT TABLE ───────────────────────────────────────────────────────
function renderSelectTable(rows) {
    const tbody = document.getElementById('selectTableBody');
    tbody.innerHTML = '';

    rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.dataset.seq = row.sequence;
        tr.dataset.oid = row.resource_oid;
        tr.dataset.lot = row.lot_number;

        const isExisted = winxExistingResourceOidSet.has(row.resource_oid);
        if (isExisted) {
            tr.classList.add('winx-row-existed');
        }

        const checkboxCell = isExisted
            ? ''
            : `<input type="checkbox" class="cr-check" data-seq="${row.sequence}" data-oid="${row.resource_oid}"
                       onchange="onRowCheck(this)">`;

        tr.innerHTML = `
            <td style="text-align:center;">${checkboxCell}</td>
            <td class="winx-cell-warn">${row.sequence}</td>
            <td>${row.lot_number || ''}</td>
            <td>${row.station   || ''}</td>
            <td>${row.work_date || ''}</td>
            <td class="winx-oid-cell">${row.resource_oid}</td>
        `;

        tr.addEventListener('click', e => {
            if (e.target.type === 'checkbox') return;
            const cb = tr.querySelector('.cr-check');
            if (!cb) return;
            cb.checked = !cb.checked;
            onRowCheck(cb);
        });

        tbody.appendChild(tr);
    });

    document.getElementById('masterCheck').checked = false;
}

function onRowCheck(cb) {
    const tr = cb.closest('tr');
    if (cb.checked) {
        tr.classList.add('selected-row');
    } else {
        tr.classList.remove('selected-row');
        document.getElementById('masterCheck').checked = false;
    }
    updateSelectedCount();
}

function updateSelectedCount() {

    const visible  = Array.from(document.querySelectorAll('#selectTableBody tr:not(.hidden-row)'));
    const checked  = visible.filter(tr => tr.querySelector('.cr-check')?.checked);
    const total    = document.querySelectorAll('.cr-check:checked').length;

    document.getElementById('selectedCount').textContent = total;
    document.getElementById('footerCount').textContent   = total;

    const continueBtn = document.getElementById('continueBtn');
    if (continueBtn) continueBtn.disabled = (total === 0);

    const hasAnyCheckbox = document.querySelectorAll('#selectTableBody .cr-check').length > 0;

    const masterCheckEl = document.getElementById('masterCheck');
    if (masterCheckEl) {
        masterCheckEl.style.visibility = hasAnyCheckbox ? 'visible' : 'hidden';
    }

    const msgEl = document.getElementById('selectFooterMessage');
    if (msgEl) {
        if (activeLots.size === 0 && !hasAnyCheckbox) {
            msgEl.textContent = '// Tất cả collect_record đều đã có material_resource';
        } else {
            msgEl.textContent = '';
        }
    }
}

function toggleMaster(masterCb) {
    const visibleRows = document.querySelectorAll('#selectTableBody tr:not(.hidden-row)');
    visibleRows.forEach(tr => {
        const cb   = tr.querySelector('.cr-check');
        if (!cb) return;
        cb.checked = masterCb.checked;
        if (cb.checked) {
            tr.classList.add('selected-row');
        } else {
            tr.classList.remove('selected-row');
        }
    });
    updateSelectedCount();
}

function deselectAll() {
    document.querySelectorAll('.cr-check').forEach(cb => {
        cb.checked = false;
        cb.closest('tr').classList.remove('selected-row');
    });
    document.getElementById('masterCheck').checked = false;
    updateSelectedCount();
}

// ── MODAL CONTROLS ────────────────────────────────────────────────────────────
function closeSelectModal() {
    document.getElementById('selectModal').style.display = 'none';
}

// ── STEP 2: prepare với các dòng đã chọn ─────────────────────────────────────
async function runPrepareFromSelection() {
    const checked = document.querySelectorAll('.cr-check:checked');
    if (!checked.length) {
        showAlert('Vui lòng chọn ít nhất 1 dòng', 'warning');
        return;
    }

    const selectedOids = [];
    const selectedSeqs = [];
    checked.forEach(cb => {
        selectedOids.push(cb.dataset.oid);
        selectedSeqs.push(parseInt(cb.dataset.seq));
    });

    closeSelectModal();

    const data = await apiFetch('/api/magic-winx/prepare-insert-data', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
            work_order_id: winxWorkOrderId,
            recipe_id:     winxRecipeId,
            selected_oids: selectedOids,
            selected_seqs: selectedSeqs,
            product_id:    winxProductId,
            reserved_date: winxReservedDate,
        })
    });

    if (!data.success) {
        showAlert(data.message || 'Lỗi khi chuẩn bị dữ liệu', 'error');
        return;
    }

    winxInsertRows = data.insert_rows || [];

    // Format collect_record.created_at → UTC ISO 8601
    winxInsertRows.forEach(row => {
        if (
            row.info &&
            row.info.production_info &&
            row.info.production_info.production_time !== null &&
            row.info.production_info.production_time !== undefined
        ) {
            row.info.production_info.production_time =
                formatCreatedAtUTC(row.info.production_info.production_time);
        }
    });

    renderStatusPanel(data, selectedSeqs.length);
    renderPreviewTable(winxInsertRows);

    document.getElementById('statusPanel').style.display = 'flex';

    speechBubble.show(
        `⚡ Đã chọn ${selectedSeqs.length} sequences — sẽ insert ${winxInsertRows.length} dòng`,
        { duration: 6000, animation: 'bounce' }
    );
}

function renderStatusPanel(data, selectedCount) {
    document.getElementById('statWO').textContent      = winxWorkOrderId;
    document.getElementById('statProduct').textContent = data.product_id   || '—';
    document.getElementById('statDate').textContent    = data.reserved_date || '—';
    document.getElementById('statCR').textContent      = selectedCount;
    document.getElementById('statMR').textContent      = data.mr_count ?? '—';
    document.getElementById('statInsert').textContent  = winxInsertRows.length;
    
    const statMREl = document.getElementById('statMR');
    const mrCount = data.mr_count ?? 0;
    const insertCount = winxInsertRows.length;

    statMREl.classList.remove('winx-accent', 'winx-stat-danger');
    if (mrCount < insertCount) {
        statMREl.classList.add('winx-stat-danger');
    } else {
        statMREl.classList.add('winx-accent');
    }
}

function renderPreviewTable(rows) {
    const thead = document.getElementById('previewHead');
    const tbody = document.getElementById('previewBody');
    const count = document.getElementById('previewCount');

    thead.innerHTML = '';
    tbody.innerHTML = '';

    if (!rows || rows.length === 0) {
        count.textContent = '0 dòng';
        return;
    }

    const displayCols = [
        '_sequence','oid','id','product_id','product_type','quantity','status',
        'warehouse_id','warehouse_location','updated_by','created_at','created_by',
        'station','feed_records_id','batch_count','reprint_reason',
        'collected','erp_tire_barcode_synced','initial_quantity'
    ];

    const tr = document.createElement('tr');
    displayCols.forEach(c => {
        const th = document.createElement('th');
        th.textContent = c;
        tr.appendChild(th);
    });
    thead.appendChild(tr);

    rows.forEach(row => {
        const tr = document.createElement('tr');
        displayCols.forEach(c => {
            const td = document.createElement('td');
            const v  = row[c];
            td.textContent = v === null || v === undefined ? '' : String(v);
            if (c === 'product_type') td.classList.add('winx-cell-accent');
            if (c === '_sequence')    td.classList.add('winx-cell-warn');
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    count.textContent = `${rows.length} dòng`;
}

// ── CONFIRM MODAL ─────────────────────────────────────────────────────────────
async function openConfirmModal() {
    if (!winxInsertRows.length) {
        showAlert('Không có dữ liệu để insert', 'warning');
        return;
    }

    const insertCount = parseInt(document.getElementById('statInsert').textContent, 10) || 0;
    const mrCount = parseInt(document.getElementById('statMR').textContent, 10) || 0;

    if (insertCount > mrCount) {
        await showAlert(
            'Số lượng insert nhiều hơn số lượng GREEN_TIRE đang tồn tại',
            'error'
        );
        return;
    }

    document.getElementById('confirmCount').textContent = winxInsertRows.length;
    document.getElementById('confirmModal').style.display = 'flex';
}

function closeConfirmModal() {
    document.getElementById('confirmModal').style.display = 'none';
}

// ── EXECUTE ───────────────────────────────────────────────────────────────────
async function runExecute() {
    closeConfirmModal();

    let data;

    try {

        data = await apiFetch('/api/magic-winx/insert-material',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    insert_rows: winxInsertRows
                })
            }
        );

    } catch (error) {
        showAlert(`API execute lỗi: ${error.message}`, 'error');
        return;
    }

    if (!data.success) {
        showAlert(`API execute lỗi: ${data.message || 'Không xác định'}`, 'error');
        return;
    }

    const errMsg = data.errors?.length
        ? `\n${data.errors.length} dòng lỗi.`
        : '';

    if (data.errors?.length) {
        showAlert(
            `API execute cảnh báo: ${data.message}${errMsg}`,
            'warning'
        );
        return;
    }

    await showAlert(`${data.message}`, 'success');

    const updateSuccess = await runMagicWinxUpdate();
    if (!updateSuccess) {
        return;
    }
}

async function downloadInsertMaterialLog() {
    if (!winxInsertRows.length) {
        showAlert('Chưa có dữ liệu để export', 'warning');
        return;
    }

    const confirmed = await showConfirm('Bạn có chắc chắn muốn download file log của dữ liệu trên?');
    if (!confirmed) return;

    performDownloadInsertMaterialLog();
}

function performDownloadInsertMaterialLog() {
    const exportCols = [
        'oid','id','product_id','product_type','quantity','status',
        'expiry_time','info','warehouse_id','warehouse_location',
        'updated_at','updated_by','created_at','created_by','station',
        'feed_records_id','batch_count','reprint_reason','collected',
        'erp_tire_barcode_synced','standing_time','initial_quantity','_sequence'
    ];

    const wsData = [exportCols];
    winxInsertRows.forEach(row => {
        wsData.push(exportCols.map(c => {
            const v = row[c];
            if (v === null || v === undefined) return '';
            if (typeof v === 'object') return JSON.stringify(v);
            return v;
        }));
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'InsertLog');

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    XLSX.writeFile(wb, `log_work_order_${winxWorkOrderId}.xlsx`);
}

function formatCreatedAtUTC(createdAt) {
    if (createdAt === null || createdAt === undefined || createdAt === '') {
        return '';
    }

    // PostgreSQL BIGINT nanoseconds
    const ns = BigInt(String(createdAt));

    const seconds = ns / 1000000000n;
    const nanoseconds = ns % 1000000000n;

    // Date trong JS chỉ có millisecond
    const date = new Date(Number(seconds) * 1000);

    const year   = date.getUTCFullYear();
    const month  = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day    = String(date.getUTCDate()).padStart(2, '0');
    const hour   = String(date.getUTCHours()).padStart(2, '0');
    const minute = String(date.getUTCMinutes()).padStart(2, '0');
    const second = String(date.getUTCSeconds()).padStart(2, '0');

    const nano = nanoseconds.toString().padStart(9, '0');

    return `${year}-${month}-${day}T${hour}:${minute}:${second}.${nano}Z`;
}

function buildUpdateRows() {
    return winxInsertRows.map(row => {

        const sequence = Number(row._sequence);
        const crRow = winxAllCRRows.find(
            cr => Number(cr.sequence) === sequence
        );

        return {
            sequence: sequence,
            station: crRow
                ? String(crRow.station || '')
                : '',
            new_resource_id: String(row.id || '')
        };
    });
}

async function runMagicWinxUpdate() {
    const updates = buildUpdateRows();
    if (!updates.length) {
        showAlert(
            'API update lỗi: Không có dữ liệu để update feed_record',
            'error'
        );
        return false;
    }

    let data;
    try {
        data = await apiFetch('/api/magic-winx/update-feed-record-material',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    work_order_id: winxWorkOrderId,
                    updates: updates
                })
            }
        );
    } catch (error) {
        showAlert(
            `API Update feed_record lỗi: ${error.message}`,
            'error'
        );
        return false;
    }

    if (!data.success) {
        showAlert(
            `API Update feed_record lỗi: ${data.message || 'Không xác định'}`,
            'error'
        );
        return false;
    }

    const errMsg = data.errors?.length
        ? `\n⚠ ${data.errors.length} dòng lỗi.`
        : '';

    if (errMsg) {
        showAlert(
            `API Update feed_record cảnh báo: ${data.message}${errMsg}`,
            'warning'
        );
        return false;
    }

    return await runUpdateGreenTireQuantity();
}

async function runUpdateGreenTireQuantity() {
    const ids = winxInsertRows
        .map(row => String(row.id || '').trim())
        .filter(Boolean);

    if (!ids.length) {
        showAlert(
            'API Update GREEN_TIRE quantity lỗi: Không có material_resource ID để xử lý',
            'error'
        );
        return false;
    }

    let data;
    try {

        data = await apiFetch('/api/magic-winx/update-green-tire-quantity',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ids: ids
                })
            }
        );

    } catch (error) {
        showAlert(`API Update GREEN_TIRE quantity lỗi: ${error.message}`, 'error');
        return false;
    }

    if (!data.success) {
        showAlert(
            `API Update GREEN_TIRE quantity lỗi: ${data.message || 'Không xác định'}`,
            'error'
        );
        return false;
    }

    showAlert(`${data.message}`, 'success');

    speechBubble.show(
        `✨ Update GREEN_TIRE quantity hoàn tất! Đã reset ${data.updated_count} GREEN_TIRE.`,
        {duration: 6000, animation: 'bounce'}
    );

    return true;
}

function triggerBulkFileInput() {
    document.getElementById('bulkFileInput').click();
}

async function handleBulkFileSelected(event) {
    const file = event.target.files[0];
    event.target.value = ''; // cho phép chọn lại cùng file lần sau

    if (!file) return;

    if (!/\.(xlsx|xls)$/i.test(file.name)) {
        await showAlert('Vui lòng chọn file Excel (.xlsx hoặc .xls)', 'error');
        return;
    }

    let workOrderIds;
    try {
        workOrderIds = await parseWorkOrderExcelFile(file);
    } catch (err) {
        await showAlert(err.message || 'Lỗi khi đọc file Excel', 'error');
        return;
    }

    if (!workOrderIds.length) {
        await showAlert('Không tìm thấy dữ liệu hợp lệ trong cột work_order_list', 'warning');
        return;
    }

    await runBulkCheckWorkOrders(workOrderIds);
}

function parseWorkOrderExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

                if (!rows.length) {
                    reject(new Error('File Excel trống'));
                    return;
                }

                const headerCell = String(rows[0][0] || '').trim().toLowerCase();
                if (headerCell !== 'work_order_list') {
                    reject(new Error('Cột A dòng 1 phải là "work_order_list"'));
                    return;
                }

                const ids = [];
                for (let i = 1; i < rows.length; i++) {
                    const val = String(rows[i][0] || '').trim();
                    if (val) ids.push(val.toUpperCase());
                }

                resolve([...new Set(ids)]);
            } catch (err) {
                reject(new Error('Không đọc được file Excel'));
            }
        };

        reader.onerror = () => reject(new Error('Không đọc được file'));
        reader.readAsArrayBuffer(file);
    });
}

function downloadWorkOrderTemplate() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['work_order_list']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'template_work_order_list.xlsx');
}

async function runBulkCheckWorkOrders(workOrderIds) {
    const data = await apiFetch('/api/magic-winx/check-work-orders-bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ work_order_ids: workOrderIds })
    });

    if (!data.success) {
        await showAlert(data.message || 'Lỗi khi kiểm tra Work Order', 'error');
        return;
    }

    winxBulkRawResult = data.result || [];
    winxBulkColumns   = data.columns || [];

    if (!winxBulkRawResult.length) {
        const summary = data.summary || {};

        const totalCollectRecord = summary.collect_record || 0;
        const totalBatch = summary.batch || 0;
        const totalFeedRecord = summary.feed_record || 0;
        const totalMaterialResource = summary.material_resource || 0;

        await showAlert(
            `Không có Work Order nào lệch số lượng
            Tổng số lượng đã đếm được:
            • Collect Record: ${totalCollectRecord.toLocaleString()}
            • Feed Record: ${totalFeedRecord.toLocaleString()}
            • Batch: ${totalBatch.toLocaleString()}
            • Material Resource: ${totalMaterialResource.toLocaleString()}`,
            'info'
        );

        return;
    }

    document.getElementById('bulkClientSearch').value = '';
    renderBulkResultTable(winxBulkRawResult);
    document.getElementById('bulkCheckModal').classList.remove('hidden');
}

function renderBulkResultTable(rows) {
    const tbody = document.getElementById('bulkResultTableBody');
    tbody.innerHTML = '';

    rows.forEach(row => {
        const [workOrder, crCount, mrCount] = row;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${workOrder}</td>
            <td>${crCount}</td>
            <td>${mrCount}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('bulkResultCount').textContent = rows.length;
}

function closeBulkCheckModal() {
    document.getElementById('bulkCheckModal').classList.add('hidden');
}

function filterBulkResult(keyword) {
    if (!keyword) {
        renderBulkResultTable(winxBulkRawResult);
        return;
    }

    const filtered = winxBulkRawResult.filter(row =>
        row.some(val => val !== null && val !== undefined &&
            String(val).toLowerCase().includes(keyword))
    );

    renderBulkResultTable(filtered);
}

document.addEventListener('DOMContentLoaded', () => {
    const bulkSearchInput   = document.getElementById('bulkClientSearch');
    const bulkSearchIconBtn = document.getElementById('bulkSearchIconBtn');

    if (bulkSearchInput && bulkSearchIconBtn) {
        bulkSearchIconBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (document.activeElement === bulkSearchInput) {
                bulkSearchInput.value = '';
                bulkSearchInput.blur();
                filterBulkResult('');
            } else {
                bulkSearchInput.focus();
            }
        });

        bulkSearchInput.addEventListener('input', function () {
            filterBulkResult(this.value.trim().toLowerCase());
        });
    }
});

// ── MR FORM UI, AUTO UPPERCASE, DROPDOWN & MASKS ──────────────────────────────
let cachedMRStations = [];

async function initMRFormUI() {
    // Load departments as soon as the page loads (not lazily on focus)
    loadDepartments();

    // 1. Auto Uppercase for mr_id and mr_product_id
    ['mr_id', 'mr_product_id'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', e => {
                const start = e.target.selectionStart;
                const end = e.target.selectionEnd;
                e.target.value = e.target.value.toUpperCase();
                if (start !== null && end !== null) {
                    e.target.setSelectionRange(start, end);
                }
            });
        }
    });

    // 2. Created By Dropdown & Filter (backed by /api/departments)
    const createdByInp = document.getElementById('mr_created_by');
    const createdByDropdown = document.getElementById('mr_created_by_dropdown');

    function getDeptCode(dept) {
        return String(dept.departmentID || '').toUpperCase();
    }

    function getDeptOid(dept) {
        return getDeptCode(dept);
    }

    function tryResolveDepartmentFromInput() {
        const typed = (createdByInp.value || '').trim().toUpperCase();
        if (!typed) {
            selectedDepartmentOid = null;
            return;
        }
        const match = cachedDepartments.find(d => getDeptCode(d) === typed);
        selectedDepartmentOid = match ? getDeptOid(match) : null;
    }

    function renderCreatedByDropdown(filter = '') {
        if (!createdByDropdown) return;
        const upper = filter.trim().toUpperCase();
        const filtered = upper
            ? cachedDepartments.filter(d => getDeptCode(d).includes(upper))
            : cachedDepartments;

        createdByDropdown.innerHTML = '';
        if (filtered.length === 0) {
            createdByDropdown.innerHTML = '<div class="dropdown-item" style="color:#94a3b8;cursor:default;">Không tìm thấy Department</div>';
        } else {
            filtered.forEach(d => {
                const code = getDeptCode(d);
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                item.textContent = code;
                item.addEventListener('click', () => {
                    createdByInp.value = code;
                    selectedDepartmentOid = code;
                    createdByDropdown.classList.remove('show');

                    // Department changed → reset dependent Station selection
                    document.getElementById('mr_station').value = '';
                    cachedStations = [];
                    cachedStationsDeptKey = null;
                });
                createdByDropdown.appendChild(item);
            });
        }
        createdByDropdown.classList.add('show');
    }

    if (createdByInp && createdByDropdown) {
        createdByInp.addEventListener('focus', async () => {
            await loadDepartments();
            renderCreatedByDropdown(createdByInp.value);
        });

        createdByInp.addEventListener('click', async (e) => {
            e.stopPropagation();
            await loadDepartments();
            renderCreatedByDropdown(createdByInp.value);
        });

        createdByInp.addEventListener('input', async (e) => {
            const start = e.target.selectionStart;
            const end = e.target.selectionEnd;
            e.target.value = e.target.value.toUpperCase();
            if (start !== null && end !== null) {
                e.target.setSelectionRange(start, end);
            }
            await loadDepartments();
            renderCreatedByDropdown(e.target.value);
            tryResolveDepartmentFromInput();
        });

        document.addEventListener('click', (e) => {
            if (!createdByInp.contains(e.target) && !createdByDropdown.contains(e.target)) {
                createdByDropdown.classList.remove('show');
            }
        });
    }

    // 3. Station Dropdown & Filter (backed by /api/departments/stations, scoped to selected department)
    const stationInp = document.getElementById('mr_station');
    const stationDropdown = document.getElementById('mr_station_dropdown');

    async function loadStationsForDept(deptOid) {
        if (!deptOid) return;
        if (cachedStationsDeptKey === deptOid && cachedStations.length > 0) return;

        try {
            const data = await apiFetch('/api/departments/stations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ department_oid: deptOid })
            });
            if (data && Array.isArray(data.stations)) {
                cachedStations = data.stations;
                cachedStationsDeptKey = deptOid;
            } else {
                cachedStations = [];
                cachedStationsDeptKey = null;
            }
        } catch (e) {
            console.error('Error loading stations:', e);
            cachedStations = [];
            cachedStationsDeptKey = null;
        }
    }

    function renderMRStationDropdown(filter = '') {
        if (!stationDropdown) return;
        const upper = filter.trim().toUpperCase();
        const filtered = upper
            ? cachedStations.filter(s => s.id.toUpperCase().includes(upper) || (s.name && s.name.toUpperCase().includes(upper)))
            : cachedStations;

        stationDropdown.innerHTML = '';
        if (filtered.length === 0) {
            stationDropdown.innerHTML = '<div class="dropdown-item" style="color:#94a3b8;cursor:default;">Không tìm thấy Station</div>';
        } else {
            filtered.forEach(s => {
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                item.textContent = s.name && s.name !== s.id ? `${s.id} - ${s.name}` : s.id;
                item.addEventListener('click', () => {
                    stationInp.value = s.id;
                    stationDropdown.classList.remove('show');
                });
                stationDropdown.appendChild(item);
            });
        }
        stationDropdown.classList.add('show');
    }

    async function openStationDropdown(filter) {
        if (!selectedDepartmentOid) {
            stationDropdown.innerHTML = '<div class="dropdown-item" style="color:#94a3b8;cursor:default;">Vui lòng chọn Created By (Department) trước</div>';
            stationDropdown.classList.add('show');
            return;
        }
        await loadStationsForDept(selectedDepartmentOid);
        renderMRStationDropdown(filter);
    }

    if (stationInp && stationDropdown) {
        stationInp.addEventListener('focus', async () => {
            await openStationDropdown(stationInp.value);
        });

        stationInp.addEventListener('click', async (e) => {
            e.stopPropagation();
            await openStationDropdown(stationInp.value);
        });

        stationInp.addEventListener('input', async (e) => {
            const start = e.target.selectionStart;
            const end = e.target.selectionEnd;
            e.target.value = e.target.value.toUpperCase();
            if (start !== null && end !== null) {
                e.target.setSelectionRange(start, end);
            }
            await openStationDropdown(e.target.value);
        });

        document.addEventListener('click', (e) => {
            if (!stationInp.contains(e.target) && !stationDropdown.contains(e.target)) {
                stationDropdown.classList.remove('show');
            }
        });
    }

    // Helper: only allow digits and navigation keys
    function restrictToDigitsKeydown(e) {
        const allowedKeys = [
            'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
            'Tab', 'Enter', 'Home', 'End', 'Escape'
        ];
        if (allowedKeys.includes(e.key) || e.ctrlKey || e.metaKey) {
            return;
        }
        if (!/^\d$/.test(e.key)) {
            e.preventDefault();
        }
    }

    // 4. mr_lot_number: 204-0824 format
    const lotInp = document.getElementById('mr_lot_number');
    if (lotInp) {
        lotInp.addEventListener('keydown', restrictToDigitsKeydown);
        lotInp.addEventListener('input', (e) => {
            let digits = e.target.value.replace(/\D/g, '').slice(0, 7);
            if (digits.length > 3) {
                e.target.value = digits.slice(0, 3) + '-' + digits.slice(3);
            } else {
                e.target.value = digits;
            }
        });
    }

    // 5 & 6. mr_created_at & mr_expiry_time: YYYY-MM-DD HH:mm:ss format
    function formatDateTimeDigits(raw) {
        const d = raw.replace(/\D/g, '').slice(0, 14);
        if (d.length <= 4) return d;
        if (d.length <= 6) return d.slice(0, 4) + '-' + d.slice(4);
        if (d.length <= 8) return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6);
        if (d.length <= 10) return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8) + ' ' + d.slice(8);
        if (d.length <= 12) return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8) + ' ' + d.slice(8, 10) + ':' + d.slice(10);
        return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8) + ' ' + d.slice(8, 10) + ':' + d.slice(10, 12) + ':' + d.slice(12, 14);
    }

    const createdInp = document.getElementById('mr_created_at');
    const expiryInp = document.getElementById('mr_expiry_time');

    if (createdInp) {
        createdInp.addEventListener('keydown', restrictToDigitsKeydown);
        createdInp.addEventListener('input', (e) => {
            const formatted = formatDateTimeDigits(e.target.value);
            e.target.value = formatted;
            // if (formatted.length === 19 && expiryInp) {
            //     expiryInp.value = formatted;
            // }
        });

        // createdInp.addEventListener('blur', (e) => {
        //     if (e.target.value.length === 19 && expiryInp && !expiryInp.value) {
        //         expiryInp.value = e.target.value;
        //     }
        // });
    }

    if (expiryInp) {
        expiryInp.addEventListener('keydown', restrictToDigitsKeydown);
        expiryInp.addEventListener('input', (e) => {
            e.target.value = formatDateTimeDigits(e.target.value);
        });
    }
}

// ── Load /api/departments once, cache it ─────────────────────────────────────
async function loadDepartments() {
    if (cachedDepartments.length > 0) return;
    try {
        const data = await apiFetch('/api/departments', { method: 'GET' });
        if (data && !data.error && Array.isArray(data.data)) {
            cachedDepartments = data.data;
        }
    } catch (e) {
        console.error('Error loading departments:', e);
    }
}

// ── INSERT MATERIAL RESOURCE ──────────────────────────────────────────────────
async function handleInsertMaterialResource() {
    const idVal         = (document.getElementById('mr_id')?.value || '').trim();
    const productIdVal  = (document.getElementById('mr_product_id')?.value || '').trim();
    const stationVal    = (document.getElementById('mr_station')?.value || '').trim();
    const quantityVal   = (document.getElementById('mr_quantity')?.value || '').trim();
    const lotNumberVal  = (document.getElementById('mr_lot_number')?.value || '').trim();
    const createdAtVal  = (document.getElementById('mr_created_at')?.value || '').trim();
    const expiryTimeVal = (document.getElementById('mr_expiry_time')?.value || '').trim();
    const createdByVal  = (document.getElementById('mr_created_by')?.value || '').trim();

    const quantityNum = Number(quantityVal);

    const isBeadWireSpecial =
        idVal.startsWith('7') &&
        Number.isFinite(quantityNum) &&
        quantityNum > 1;
    
    if (isBeadWireSpecial) {

        // Chỉ bắt buộc 5 field
        if (!idVal || !productIdVal || !quantityVal || !createdAtVal || !expiryTimeVal) {
            showAlert(
                'Trường hợp ID bắt đầu bằng 7 và Quantity > 1 chỉ cần nhập: ID, Product ID, Quantity, Created At, Expiry Time',
                'warning'
            );
            return;
        }

        const payload = {
            special_bead_wire: true,
            id: idVal,
            product_id: productIdVal,
            quantity: quantityNum,
            created_at: createdAtVal,
            expiry_time: expiryTimeVal
        };

        try {
            const data = await apiFetch('/api/magic-winx/prepare-material-resource', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!data.success) {
                showAlert(
                    data.message || 'Lỗi khi chuẩn bị dữ liệu Insert Material Resource',
                    'error'
                );
                return;
            }

            singleMRInsertRow = data.preview_row;

            // Ẩn preview/status cũ nếu có
            const tireStatusPanel = document.getElementById('statusPanel');
            if (tireStatusPanel) {
                tireStatusPanel.style.display = 'none';
            }

            renderSingleMRPreviewTable(singleMRInsertRow);
            document.getElementById('mrPreviewPanel').style.display = 'flex';

            if (typeof speechBubble !== 'undefined' && speechBubble.show) {
                speechBubble.show(
                    `📋 Đã tạo preview BEAD_WIRE cho ID: ${idVal} — hãy kiểm tra và bấm Thực hiện Insert!`,
                    {
                        duration: 6000,
                        animation: 'bounce'
                    }
                );
            }

        } catch (err) {
            showAlert(`Lỗi: ${err.message || err}`, 'error');
        }

        return;
    }

    if (!idVal || !productIdVal || !stationVal || !quantityVal || !lotNumberVal || !createdAtVal || !expiryTimeVal || !createdByVal) {
        showAlert('Vui lòng nhập đầy đủ cả 8 thông tin: ID, Product ID, Station, Quantity, Lot Number, Created At, Expiry Time, Created By', 'warning');
        return;
    }

    const payload = {
        id: idVal,
        product_id: productIdVal,
        station: stationVal,
        quantity: quantityVal,
        lot_number: lotNumberVal,
        created_at: createdAtVal,
        expiry_time: expiryTimeVal,
        created_by: createdByVal.toLowerCase()
    };

    try {
        const data = await apiFetch('/api/magic-winx/prepare-material-resource', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!data.success) {
            showAlert(data.message || 'Lỗi khi chuẩn bị dữ liệu Insert Material Resource', 'error');
            return;
        }

        singleMRInsertRow = data.preview_row;

        // Ẩn status panel của Bùa liệu TIRE KD (nếu đang hiển thị)
        const tireStatusPanel = document.getElementById('statusPanel');
        if (tireStatusPanel) tireStatusPanel.style.display = 'none';

        renderSingleMRPreviewTable(singleMRInsertRow);
        document.getElementById('mrPreviewPanel').style.display = 'flex';

        if (typeof speechBubble !== 'undefined' && speechBubble.show) {
            speechBubble.show(`📋 Đã tạo preview dữ liệu cho ID: ${idVal} — hãy kiểm tra và bấm Thực hiện Insert!`, { duration: 6000, animation: 'bounce' });
        }
    } catch (err) {
        showAlert(`Lỗi: ${err.message || err}`, 'error');
    }
}

function renderSingleMRPreviewTable(row) {
    const thead = document.getElementById('mrPreviewHead');
    const tbody = document.getElementById('mrPreviewBody');
    const count = document.getElementById('mrPreviewCount');

    thead.innerHTML = '';
    tbody.innerHTML = '';

    if (!row) {
        count.textContent = '0 dòng';
        return;
    }

    const displayCols = [
        'oid','id','product_id','product_type','quantity','status',
        'expiry_time','warehouse_id','warehouse_location','updated_at','updated_by','created_at','created_by',
        'station','feed_records_id','batch_count','reprint_reason',
        'collected','erp_tire_barcode_synced','standing_time','initial_quantity'
    ];

    const trHead = document.createElement('tr');
    displayCols.forEach(c => {
        const th = document.createElement('th');
        th.textContent = c;
        trHead.appendChild(th);
    });
    thead.appendChild(trHead);

    const trBody = document.createElement('tr');
    displayCols.forEach(c => {
        const td = document.createElement('td');
        const v  = row[c];
        td.textContent = (v === null || v === undefined) ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
        if (c === 'product_type') td.classList.add('winx-cell-accent');
        if (c === 'id')           td.classList.add('winx-cell-warn');
        trBody.appendChild(td);
    });
    tbody.appendChild(trBody);

    count.textContent = '1 dòng';
}

function openSingleInsertConfirmModal() {
    if (!singleMRInsertRow) {
        showAlert('Không có dữ liệu để insert', 'warning');
        return;
    }
    document.getElementById('mrConfirmId').textContent = singleMRInsertRow.id || '';
    document.getElementById('mrConfirmModal').style.display = 'flex';
}

function closeSingleInsertConfirmModal() {
    document.getElementById('mrConfirmModal').style.display = 'none';
}

async function downloadSingleInsertMaterialLog() {
    if (!singleMRInsertRow) {
        showAlert('Chưa có dữ liệu để export', 'warning');
        return;
    }

    const confirmed = await showConfirm('Bạn có chắc chắn muốn download file log của dữ liệu trên?');
    if (!confirmed) return;

    const exportCols = [
        'oid','id','product_id','product_type','quantity','status',
        'expiry_time','info','warehouse_id','warehouse_location',
        'updated_at','updated_by','created_at','created_by','station',
        'feed_records_id','batch_count','reprint_reason','collected',
        'erp_tire_barcode_synced','standing_time','initial_quantity'
    ];

    const wsData = [exportCols];
    wsData.push(exportCols.map(c => {
        const v = singleMRInsertRow[c];
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return JSON.stringify(v);
        return v;
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'InsertLog');

    XLSX.writeFile(wb, `log_material_resource_${singleMRInsertRow.id || 'new'}.xlsx`);
}

async function executeSingleInsertMaterial() {
    closeSingleInsertConfirmModal();

    if (!singleMRInsertRow) {
        showAlert('Không có dữ liệu để insert', 'warning');
        return;
    }

    try {
        const data = await apiFetch('/api/magic-winx/insert-material-resource', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ insert_row: singleMRInsertRow })
        });

        if (!data.success) {
            showAlert(data.message || 'Lỗi khi thực hiện Insert Material Resource', 'error');
            return;
        }

        await showAlert(data.message || 'Insert material_resource thành công!', 'success');
        if (typeof speechBubble !== 'undefined' && speechBubble.show) {
            speechBubble.show(`✨ ${data.message}`, { duration: 6000, animation: 'bounce' });
        }
    } catch (err) {
        showAlert(`Lỗi: ${err.message || err}`, 'error');
    }
}
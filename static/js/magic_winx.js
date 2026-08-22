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

document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('sidebar:logout', handleLogout);
    document.addEventListener('sidebar:about',  showAbout);

    const inp = document.getElementById('workOrderInput');
    if (inp) {
        inp.addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') fetchCollectRecords(); });
    }

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
        await showAlert('Không có Work Order nào lệch số lượng Collect Record / Material Resource', 'info');
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
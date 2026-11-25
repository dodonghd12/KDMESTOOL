/**
 * ==============================================================================
 * KDMES TOOL — SITE RESET RECOVERY CONTROLLER
 * Tìm kiếm và trả lại quantity cho các barcode có quantity = 0 bị Uploader reset
 * ==============================================================================
 */
(function () {
    'use strict';

    const STATUS_OPTIONS = [
        { value: '', label: 'Tất cả' },
        { value: 'OK', label: 'OK' },
        { value: 'Warning', label: 'Warning' }
    ];

    let tableColumns = [];
    let allRows = [];
    let filteredRows = [];
    let allStations = [];
    let selectedKeys = new Set();
    let editedQtyMap = new Map();
    let activeStationFilter = '';
    let activeStatusFilter = '';
    let selectedFromDate = '';
    let selectedToDate = '';
    let flatpickrInstance = null;
    let searchDebounceTimer = null;
    let historyRecords = [];

    let isRestoring = false;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        initFlatpickr();
        initStationDropdown();
        initStatusDropdown();
        initControls();
        initHoldRestoreButton();
        initHistoryModal();
        setFilterControlsEnabled(false);
        window.updateClientSearchState = () => setFilterControlsEnabled(allRows.length > 0);
        document.body.classList.remove('app-loading-state');
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatNum(val) {
        if (val === null || val === undefined || val === '') return '-';
        const n = Number(val);
        if (!Number.isFinite(n)) return escapeHtml(val);
        return String(Number(n.toFixed(6)));
    }

    function formatDateStr(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function makeRowKey(r) {
        return `${r.station}||${r.site}||${r.site_index}||${r.reset_ts}||${r.barcode}`;
    }

    function setFilterControlsEnabled(enabled) {
        const flag = Boolean(enabled);
        ['dateRange', 'stationFilter', 'statusFilter', 'clientSearch'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = !flag;
        });
        if (flatpickrInstance) {
            flatpickrInstance.set('clickOpens', flag);
            if (!flag) flatpickrInstance.close();
        }
    }

    function resetFilterControls() {
        selectedFromDate = '';
        selectedToDate = '';
        activeStationFilter = '';
        activeStatusFilter = '';
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
        }
        if (flatpickrInstance) {
            flatpickrInstance.clear();
            flatpickrInstance.close();
        }
        ['fromDate', 'toDate'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.querySelectorAll('.dropdown-list.show').forEach(d => d.classList.remove('show'));
        ['dateRange', 'stationFilter', 'statusFilter', 'clientSearch'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.value = '';
            el.closest('.input-box, .input-wrapper')?.classList.remove('has-value');
            el.blur();
        });
        if (typeof updateClientSearchFocusRing === 'function') {
            updateClientSearchFocusRing(false);
        }
    }

    function initFlatpickr() {
        const dateInput = document.getElementById('dateRange');
        const fromEl = document.getElementById('fromDate');
        const toEl = document.getElementById('toDate');
        if (!dateInput || typeof flatpickr === 'undefined') return;

        if (fromEl) fromEl.value = '';
        if (toEl) toEl.value = '';
        dateInput.value = '';

        flatpickrInstance = flatpickr(dateInput, {
            mode: 'range',
            dateFormat: 'Y-m-d',
            maxDate: 'today',
            allowInput: false,
            clickOpens: true,
            locale: {
                rangeSeparator: '     ',
                firstDayOfWeek: 1,
                weekdays: {
                    shorthand: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
                    longhand: ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
                },
                months: {
                    shorthand: ['Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6', 'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12'],
                    longhand: ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']
                }
            },
            onClose(selectedDates) {
                const box = dateInput.closest('.input-box');
                if (selectedDates.length === 1) {
                    const d0 = selectedDates[0];
                    const ds = formatDateStr(d0);
                    selectedFromDate = ds;
                    selectedToDate = ds;
                    if (fromEl) fromEl.value = ds;
                    if (toEl) toEl.value = ds;
                    setTimeout(() => {
                        if (flatpickrInstance && selectedFromDate === ds && selectedToDate === ds) {
                            flatpickrInstance.setDate([d0, d0], false);
                            dateInput.value = ds;
                            if (box) box.classList.add('has-value');
                        }
                    }, 0);
                } else if (selectedDates.length === 2) {
                    selectedFromDate = formatDateStr(selectedDates[0]);
                    selectedToDate = formatDateStr(selectedDates[1]);
                    if (fromEl) fromEl.value = selectedFromDate;
                    if (toEl) toEl.value = selectedToDate;
                    if (box) box.classList.add('has-value');
                } else {
                    selectedFromDate = '';
                    selectedToDate = '';
                    if (fromEl) fromEl.value = '';
                    if (toEl) toEl.value = '';
                    dateInput.value = '';
                    if (box) box.classList.remove('has-value');
                }
                applyFilters();
            }
        });

        dateInput.addEventListener('click', () => {
            if (dateInput.disabled) return;
            if (dateInput.value && flatpickrInstance) {
                flatpickrInstance.clear();
                selectedFromDate = '';
                selectedToDate = '';
                if (fromEl) fromEl.value = '';
                if (toEl) toEl.value = '';
                dateInput.value = '';
                applyFilters();
            }
        });

        dateInput.addEventListener('change', () => {
            if (!dateInput.value && (selectedFromDate || selectedToDate)) {
                selectedFromDate = '';
                selectedToDate = '';
                applyFilters();
            }
        });
    }

    function bindFilterDropdown(inputId, dropdownId, getOptions, getSelected, onSelect) {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById(dropdownId);
        if (!input || !dropdown) return;

        input.value = '';
        input.closest('.input-box')?.classList.remove('has-value');

        const render = () => {
            dropdown.innerHTML = '';
            const currentVal = getSelected();
            getOptions().forEach(opt => {
                const div = document.createElement('div');
                div.className = 'dropdown-item';
                if (opt.value === currentVal && currentVal !== '') div.classList.add('selected');
                div.textContent = opt.label;
                div.addEventListener('mousedown', e => {
                    e.preventDefault();
                    dropdown.classList.remove('show');
                    input.blur();
                    onSelect(opt, input);
                });
                dropdown.appendChild(div);
            });
        };

        input.addEventListener('click', e => {
            e.stopPropagation();
            if (input.disabled) return;
            if (dropdown.classList.contains('show')) {
                dropdown.classList.remove('show');
                return;
            }
            document.querySelectorAll('.dropdown-list.show').forEach(d => d.classList.remove('show'));
            render();
            dropdown.classList.add('show');
        });

        input.addEventListener('input', () => {
            if (!input.value.trim() && getSelected()) {
                onSelect({ value: '', label: '' }, input);
            }
        });

        document.addEventListener('click', e => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
    }

    function initStationDropdown() {
        bindFilterDropdown(
            'stationFilter',
            'station-filter-dropdown',
            () => [{ value: '', label: 'Tất cả Station' }].concat(allStations.map(st => ({ value: st, label: st }))),
            () => activeStationFilter,
            (opt, input) => {
                activeStationFilter = opt.value;
                if (opt.value) {
                    input.value = opt.label;
                    input.closest('.input-box')?.classList.add('has-value');
                } else {
                    input.value = '';
                    input.closest('.input-box')?.classList.remove('has-value');
                }
                applyFilters();
            }
        );
    }

    function initStatusDropdown() {
        bindFilterDropdown(
            'statusFilter',
            'status-filter-dropdown',
            () => STATUS_OPTIONS,
            () => activeStatusFilter,
            (opt, input) => {
                activeStatusFilter = opt.value;
                if (opt.value) {
                    input.value = opt.label;
                    input.closest('.input-box')?.classList.add('has-value');
                } else {
                    input.value = '';
                    input.closest('.input-box')?.classList.remove('has-value');
                }
                applyFilters();
            }
        );
    }

    function initControls() {
        const btnLoad = document.getElementById('btnLoad');
        if (btnLoad) btnLoad.addEventListener('click', scanResetRows);

        // main.js initClientSearch() already invokes customClientSearchHandler on #clientSearch input
        window.customClientSearchHandler = () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => applyFilters(), 80);
        };

        const syncQty = inp => {
            const val = Number(inp.value);
            if (Number.isFinite(val) && val >= 0) {
                editedQtyMap.set(inp.dataset.key, Math.round(val * 1e6) / 1e6);
            }
        };

        const tbody = document.getElementById('tableBody');
        if (tbody) {
            tbody.addEventListener('change', e => {
                const target = e.target;
                if (!target) return;
                if (target.classList.contains('srr-row-cb')) {
                    const k = target.dataset.key;
                    if (target.checked) selectedKeys.add(k);
                    else selectedKeys.delete(k);
                    updateSelectionUI();
                    syncSelectAllCheckbox();
                } else if (target.classList.contains('srr-qty-input')) {
                    syncQty(target);
                }
            });
            tbody.addEventListener('input', e => {
                if (e.target && e.target.classList.contains('srr-qty-input')) syncQty(e.target);
            });
            tbody.addEventListener('mousedown', e => {
                if (e.target && e.target.classList.contains('srr-spin')) e.preventDefault();
            });
            tbody.addEventListener('click', e => {
                const spin = e.target && e.target.closest ? e.target.closest('.srr-spin') : null;
                if (!spin) return;
                const inp = spin.parentElement?.querySelector('.srr-qty-input');
                if (!inp || inp.disabled) return;
                const delta = spin.classList.contains('srr-spin-up') ? 1 : -1;
                const cur = Number(inp.value);
                const next = Math.max(0, Math.round(((Number.isFinite(cur) ? cur : 0) + delta) * 1e6) / 1e6);
                inp.value = next;
                syncQty(inp);
                inp.focus();
            });
        }
    }

    async function scanResetRows() {
        const btnLoad = document.getElementById('btnLoad');
        const loadIcon = document.getElementById('btnLoadIcon');
        const standby = document.getElementById('tableStandbyPlaceholder');
        const table = document.getElementById('recoveryTable');
        const footer = document.getElementById('tableFooter');

        resetFilterControls();
        setFilterControlsEnabled(false);

        if (btnLoad) btnLoad.disabled = true;
        if (loadIcon) loadIcon.classList.add('reprint-label-log-spin');
        if (typeof showTableLoadingState === 'function') {
            showTableLoadingState('Đang quét danh sách barcode mất quantity do SiteService.Upsert (mcom)...', Math.max(1, tableColumns.length + 1));
        }

        try {
            const res = await fetch('/api/site-reset-recovery/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error((data && data.message) || `Lỗi HTTP ${res.status}`);
            }

            tableColumns = Array.isArray(data.columns) ? data.columns : [];
            const rawResult = Array.isArray(data.result) ? data.result : [];
            const rawMeta = Array.isArray(data.meta) ? data.meta : [];

            const idx = name => tableColumns.indexOf(name);
            const iBarcode = idx('barcode');
            const iStation = idx('station');
            const iSite = idx('site');
            const iErrTime = idx('error_time (UTC+7)');
            const iQty = idx('qty');
            const iWipedQty = idx('qty_in_site');
            const iRecQty = idx('recovery_qty');
            const iInitQty = idx('initial_qty');
            const iStatus = idx('status');

            allRows = rawResult.map((cells, rIdx) => {
                const m = rawMeta[rIdx] || {};
                const rowObj = {
                    cells,
                    barcode: cells[iBarcode] ?? '',
                    station: cells[iStation] ?? '',
                    site: cells[iSite] ?? '',
                    error_time: cells[iErrTime] ?? '-',
                    qty: cells[iQty] ?? 0,
                    qty_in_site: cells[iWipedQty] ?? 0,
                    recovery_qty: cells[iRecQty] ?? 0,
                    initial_qty: cells[iInitQty],
                    status: cells[iStatus] ?? 'OK',
                    oid: m.oid || null,
                    reset_ts: m.reset_ts || '',
                    site_index: m.site_index || 0,
                    item_count: m.item_count || 1,
                    risk_level: m.risk_level || 'SAFE',
                    flag_summary: m.flag_summary || 'OK',
                };
                rowObj._key = makeRowKey(rowObj);
                rowObj._date = String(rowObj.error_time || '').slice(0, 10);
                rowObj._hay = `${rowObj.barcode} ${rowObj.station} ${rowObj.site} ${rowObj.error_time} ${rowObj.status} ${rowObj.flag_summary}`.toLowerCase();
                rowObj._tr = null;
                rowObj._cb = null;
                rowObj._visible = true;
                return rowObj;
            });

            allStations = Array.isArray(data.stations) ? data.stations : [];
            selectedKeys.clear();
            editedQtyMap.clear();

            renderTableHeader();
            renderTable();
            if (standby) standby.style.display = 'none';
            if (table) table.style.display = 'table';
            if (footer) footer.classList.remove('hidden');

            applyFilters();
            setFilterControlsEnabled(allRows.length > 0);
            if (typeof Toast !== 'undefined') {
                Toast.success('Quét hoàn tất', `Tìm thấy ${allRows.length} barcode có quantity = 0 bị uploader reset.`);
            }
        } catch (err) {
            console.error('[SiteResetRecovery] Scan error:', err);
            if (allRows.length === 0) {
                const tbody = document.getElementById('tableBody');
                if (tbody) tbody.innerHTML = '';
                if (standby) {
                    standby.classList.remove('has-data');
                    standby.style.display = '';
                }
                if (table) table.style.display = 'none';
            } else {
                renderTable();
                if (footer) footer.classList.remove('hidden');
            }
            if (typeof Toast !== 'undefined') Toast.error('Lỗi quét dữ liệu', err.message || 'Không thể kết nối server');
        } finally {
            if (btnLoad) btnLoad.disabled = false;
            if (loadIcon) loadIcon.classList.remove('reprint-label-log-spin');
        }
    }

    function renderTableHeader() {
        const thead = document.getElementById('tableHead');
        if (!thead) return;
        const rightCols = new Set(['qty', 'qty_in_site', 'recovery_qty', 'initial_qty']);
        const thCols = tableColumns.map(col => {
            const alignStyle = rightCols.has(col) ? ' style="text-align: right;"' : '';
            return `<th${alignStyle}>${escapeHtml(col)}</th>`;
        }).join('');
        thead.innerHTML = `
            <tr>
                <th style="width: 44px; min-width: 44px; text-align: center;">
                    <input type="checkbox" id="selectAllRows" title="Chọn/Bỏ chọn tất cả dòng đang hiển thị" aria-label="Chọn tất cả">
                </th>
                ${thCols}
            </tr>
        `;

        const selectAllRows = document.getElementById('selectAllRows');
        if (selectAllRows) {
            selectAllRows.addEventListener('change', () => {
                filteredRows.forEach(r => {
                    if (!r.oid) return;
                    if (selectAllRows.checked) selectedKeys.add(r._key);
                    else selectedKeys.delete(r._key);
                    if (r._cb) r._cb.checked = selectAllRows.checked;
                });
                updateSelectionUI();
            });
        }
    }

    function syncSelectAllCheckbox() {
        const selectAll = document.getElementById('selectAllRows');
        if (!selectAll) return;
        const selectable = filteredRows.filter(r => r.oid);
        selectAll.checked = selectable.length > 0 && selectable.every(r => selectedKeys.has(r._key));
    }

    function applyFilters() {
        const kw = (document.getElementById('clientSearch')?.value || '').trim().toLowerCase();
        const hasDateFilter = Boolean(selectedFromDate && selectedToDate);
        const nextFiltered = [];

        for (let i = 0; i < allRows.length; i++) {
            const r = allRows[i];
            let matched = true;
            if (hasDateFilter) {
                if (!r._date || r._date === '-' || r._date < selectedFromDate || r._date > selectedToDate) {
                    matched = false;
                }
            }
            if (matched && activeStationFilter && r.station !== activeStationFilter) matched = false;
            if (matched && activeStatusFilter && r.status !== activeStatusFilter) matched = false;
            if (matched && kw && !r._hay.includes(kw)) matched = false;

            if (r._tr && r._visible !== matched) {
                r._tr.style.display = matched ? '' : 'none';
                r._visible = matched;
            }
            if (matched) nextFiltered.push(r);
        }

        filteredRows = nextFiltered;
        const rowCountEl = document.getElementById('rowCount');
        if (rowCountEl) rowCountEl.textContent = filteredRows.length;

        const emptyRow = document.getElementById('srrEmptyRow');
        if (emptyRow) emptyRow.style.display = filteredRows.length === 0 ? '' : 'none';

        syncSelectAllCheckbox();
        updateSelectionUI();
    }

    function getTargetQty(row) {
        if (editedQtyMap.has(row._key)) return editedQtyMap.get(row._key);
        return row.recovery_qty;
    }

    function renderTable() {
        const tbody = document.getElementById('tableBody');
        const rowCountEl = document.getElementById('rowCount');
        if (!tbody) return;
        if (rowCountEl) rowCountEl.textContent = allRows.length;

        const colSpan = 1 + Math.max(1, tableColumns.length);
        const rowsHtml = allRows.map(r => {
            const checked = selectedKeys.has(r._key) ? 'checked' : '';
            const disabled = !r.oid ? 'disabled' : '';
            const statusCls = r.risk_level === 'SAFE' ? 'srr-status-safe' : 'srr-status-warn';
            const targetQty = getTargetQty(r);

            const cellsHtml = tableColumns.map((colName, idx) => {
                const val = r.cells[idx];
                if (colName === 'barcode') {
                    const cleanBc = escapeHtml(val == null ? '-' : val);
                    return `<td data-col="barcode" data-full-value="${cleanBc}" title="Click chuột trái để sao chép barcode">${cleanBc}</td>`;
                }
                if (colName === 'qty' || colName === 'initial_qty') {
                    return `<td class="srr-num">${formatNum(val)}</td>`;
                }
                if (colName === 'qty_in_site') {
                    const mult = r.item_count > 1 ? ` (×${r.item_count})` : '';
                    return `<td class="srr-num">${formatNum(val)}${mult}</td>`;
                }
                if (colName === 'recovery_qty') {
                    return `
                        <td class="srr-num">
                            <div class="srr-qty-wrap">
                                <input type="number" step="any" min="0" data-no-smooth-caret class="srr-qty-input" data-key="${escapeHtml(r._key)}" value="${escapeHtml(targetQty)}" ${disabled}>
                                <span class="srr-spin srr-spin-up" title="Tăng 1" aria-hidden="true"></span>
                                <span class="srr-spin srr-spin-down" title="Giảm 1" aria-hidden="true"></span>
                            </div>
                        </td>
                    `;
                }
                if (colName === 'status') {
                    const isWarn = r.risk_level !== 'SAFE' && r.flag_summary && r.flag_summary !== 'OK';
                    const titleAttr = isWarn ? ` title="${escapeHtml(r.flag_summary)}"` : '';
                    return `<td><span class="${statusCls}"${titleAttr}>${escapeHtml(val)}</span></td>`;
                }
                return `<td>${escapeHtml(val == null ? '-' : val)}</td>`;
            }).join('');

            return `
                <tr data-key="${escapeHtml(r._key)}">
                    <td style="text-align: center;">
                        <input type="checkbox" class="srr-row-cb" data-key="${escapeHtml(r._key)}" ${checked} ${disabled} aria-label="Chọn dòng ${escapeHtml(r.barcode)}">
                    </td>
                    ${cellsHtml}
                </tr>
            `;
        }).join('');

        const emptyDisplay = allRows.length === 0 ? '' : ' style="display: none;"';
        tbody.innerHTML = rowsHtml + `
            <tr id="srrEmptyRow"${emptyDisplay}>
                <td colspan="${colSpan}" style="text-align: center; padding: 40px; color: var(--color-text-muted, #94a3b8);">
                    Không có dòng dữ liệu nào phù hợp bộ lọc hiện tại.
                </td>
            </tr>
        `;

        const trEls = tbody.children;
        for (let i = 0; i < allRows.length; i++) {
            const tr = trEls[i];
            if (!tr || tr.id === 'srrEmptyRow') continue;
            allRows[i]._tr = tr;
            allRows[i]._cb = tr.querySelector('.srr-row-cb');
            allRows[i]._visible = true;
        }
    }

    function updateSelectionUI() {
        const count = selectedKeys.size;
        const countEl = document.getElementById('selectedCount');
        const holdBtn = document.getElementById('btnRestoreHold');
        if (countEl) countEl.textContent = count;
        if (holdBtn && holdBtn.dataset.holdBusy !== 'true') {
            holdBtn.disabled = count === 0 || isRestoring;
        }
    }

    function initHoldRestoreButton() {
        const btn = document.getElementById('btnRestoreHold');
        if (!btn || !window.HoldButton) return;

        window.HoldButton.init(btn, {
            idleLabel: 'Hold to Execute',
            waitingLabel: 'Keep holding...',
            confirmedLabel: 'Executed',
            theme: 'emerald',
            dialogTitle: 'Xác nhận khôi phục quantity vào PostgreSQL?',
            dialogConfirmLabel: 'Execute',
            onSettled: () => updateSelectionUI()
        });

        btn.addEventListener('holdconfirm', (e) => {
            if (isRestoring || selectedKeys.size === 0) return;
            const promise = executeRestore();
            if (e.detail && typeof e.detail.waitUntil === 'function') {
                e.detail.waitUntil(promise);
            }
        });
    }

    async function executeRestore() {
        if (isRestoring) return;
        const rowMap = new Map(allRows.map(r => [r._key, r]));
        const items = [];
        selectedKeys.forEach(k => {
            const r = rowMap.get(k);
            if (!r) return;
            items.push({
                oid: r.oid,
                barcode: r.barcode,
                station: r.station,
                site_name: r.site,
                reset_ts: r.reset_ts,
                expected_qty: r.qty,
                new_qty: getTargetQty(r)
            });
        });

        if (items.length === 0) return;

        isRestoring = true;

        try {
            const res = await fetch('/api/site-reset-recovery/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error((data && data.message) || `Lỗi HTTP ${res.status}`);
            }
            if (typeof Toast !== 'undefined') {
                Toast.success('Khôi phục thành công', `${data.message} (Mã đợt: ${data.recovery_id})`);
            }
            await scanResetRows();
        } catch (err) {
            console.error('[SiteResetRecovery] Restore error:', err);
            if (typeof Toast !== 'undefined') {
                Toast.error('Không thể khôi phục', err.message || 'Lỗi kết nối server');
            }
        } finally {
            isRestoring = false;
            updateSelectionUI();
        }
    }

    function initHistoryModal() {
        const btnOpen = document.getElementById('btnRecoveryHistory');
        const btnClose = document.getElementById('btnCloseHistoryModal');
        const modal = document.getElementById('srrHistoryModal');
        if (btnOpen) {
            btnOpen.addEventListener('click', () => {
                if (modal) modal.classList.add('show');
                loadRecoveryHistory();
            });
        }
        if (btnClose) {
            btnClose.addEventListener('click', () => modal && modal.classList.remove('show'));
        }
        if (modal) {
            modal.addEventListener('click', e => {
                if (e.target === modal) modal.classList.remove('show');
            });
        }
        const historyBody = document.getElementById('srrHistoryBody');
        if (historyBody) {
            historyBody.addEventListener('dblclick', e => {
                const tr = e.target && e.target.closest ? e.target.closest('tr[data-history-idx]') : null;
                if (!tr) return;
                const rec = historyRecords[Number(tr.dataset.historyIdx)];
                if (rec && typeof showDetailsModal === 'function') {
                    showDetailsModal(rec);
                }
            });
        }
    }

    async function loadRecoveryHistory() {
        const tbody = document.getElementById('srrHistoryBody');
        if (!tbody) return;
        historyRecords = [];
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 24px;">Đang tải lịch sử...</td></tr>';

        try {
            const res = await fetch('/api/site-reset-recovery/history');
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error((data && data.message) || 'Lỗi tải lịch sử');
            const recs = data.records || [];
            historyRecords = recs;
            if (recs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 28px; color: var(--color-text-muted);">Chưa có đợt khôi phục nào.</td></tr>';
                return;
            }
            tbody.innerHTML = recs.map((rec, idx) => {
                const barcodes = Array.isArray(rec.barcodes)
                    ? rec.barcodes
                    : (Array.isArray(rec.entries) ? rec.entries.map(e => e.barcode).filter(Boolean) : []);
                const barcodeJson = `"barcode" : {${barcodes.join(', ')}}`;
                return `
                <tr data-history-idx="${idx}" title="Double-click để xem chi tiết">
                    <td>${escapeHtml(rec.timestamp_vn)}</td>
                    <td>${escapeHtml(rec.env || 'KV2')}</td>
                    <td class="srr-num">${escapeHtml(rec.count)}</td>
                    <td class="srr-history-barcodes">${escapeHtml(barcodeJson)}</td>
                    <td>${escapeHtml(rec.operator_user)} (${escapeHtml(rec.operator_ip)})</td>
                    <td>
                        ${rec.rolled_back
                            ? `<span class="srr-status-warn">Đã hoàn tác (${escapeHtml(rec.rollback_at || '')})</span>`
                            : `<span class="srr-status-safe">Đang áp dụng</span>`}
                    </td>
                </tr>
                `;
            }).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px; color: #f87171;">${escapeHtml(err.message)}</td></tr>`;
        }
    }
})();

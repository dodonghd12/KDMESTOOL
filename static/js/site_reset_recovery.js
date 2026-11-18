/**
 * ==============================================================================
 * KDMES TOOL — SITE RESET RECOVERY CONTROLLER
 * Tìm kiếm và khôi phục số lượng cho tem bị mất quantity do Uploader SiteService.Upsert
 * ==============================================================================
 */
(function () {
    'use strict';

    const PAGE_SIZE = 50;
    const HOLD_DURATION_MS = 3000;

    const STATUS_OPTIONS = [
        { value: 'zero', label: 'Mất hết (Qty = 0)' },
        { value: 'partial', label: 'Partial (Qty > 0)' },
        { value: 'negative', label: 'Âm (Qty < 0)' },
        { value: 'safe_only', label: 'Chỉ dòng An toàn' },
        { value: 'warn_only', label: 'Cần kiểm tra (Cảnh báo)' },
        { value: 'all', label: 'Tất cả' }
    ];

    let allRows = [];
    let filteredRows = [];
    let allStations = [];
    let currentPage = 1;
    let totalPages = 1;
    let selectedKeys = new Set();
    let editedQtyMap = new Map();
    let restoreMode = 'quantity'; // 'quantity' | 'container'
    let activeStatusFilter = 'zero';
    let activeStationFilter = '';
    let selectedFromDate = '';
    let selectedToDate = '';
    let flatpickrInstance = null;
    let searchDebounceTimer = null;

    let holdStartTime = null;
    let holdAnimFrame = null;
    let holdCompleted = false;
    let isRestoring = false;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        ensureClientSearchAlwaysEnabled();
        initDefaultDateRange();
        initFlatpickr();
        initStatusDropdown();
        initStationDropdown();
        initControls();
        initHoldRestoreButton();
        initHistoryModal();
        setupExportHook();
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
        return `${r.station}||${r.site_name}||${r.site_index}||${r.reset_ts}||${r.barcode}`;
    }

    function ensureClientSearchAlwaysEnabled() {
        const el = document.getElementById('clientSearch');
        if (!el) return;
        el.disabled = false;
        el.removeAttribute('disabled');
        try {
            Object.defineProperty(el, 'disabled', {
                get: () => false,
                set: () => false,
                configurable: true
            });
        } catch (e) {}
        window.updateClientSearchState = function () {
            el.disabled = false;
        };
    }

    function initDefaultDateRange() {
        const today = new Date();
        const past = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        selectedFromDate = formatDateStr(past);
        selectedToDate = formatDateStr(today);
        const fromEl = document.getElementById('fromDate');
        const toEl = document.getElementById('toDate');
        const dateEl = document.getElementById('dateRange');
        if (fromEl) fromEl.value = selectedFromDate;
        if (toEl) toEl.value = selectedToDate;
        if (dateEl) dateEl.value = `${selectedFromDate}     ${selectedToDate}`;
    }

    function initFlatpickr() {
        const dateInput = document.getElementById('dateRange');
        const fromEl = document.getElementById('fromDate');
        const toEl = document.getElementById('toDate');
        if (!dateInput || typeof flatpickr === 'undefined') return;

        flatpickrInstance = flatpickr(dateInput, {
            mode: 'range',
            dateFormat: 'Y-m-d',
            maxDate: 'today',
            defaultDate: [selectedFromDate, selectedToDate],
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
                if (selectedDates.length === 1) {
                    const ds = formatDateStr(selectedDates[0]);
                    selectedFromDate = ds;
                    selectedToDate = ds;
                    if (fromEl) fromEl.value = ds;
                    if (toEl) toEl.value = ds;
                    dateInput.value = ds;
                } else if (selectedDates.length === 2) {
                    selectedFromDate = formatDateStr(selectedDates[0]);
                    selectedToDate = formatDateStr(selectedDates[1]);
                    if (fromEl) fromEl.value = selectedFromDate;
                    if (toEl) toEl.value = selectedToDate;
                } else {
                    selectedFromDate = '';
                    selectedToDate = '';
                    if (fromEl) fromEl.value = '';
                    if (toEl) toEl.value = '';
                    dateInput.value = '';
                }
            }
        });
    }

    function bindDropdown(inputId, dropdownId, getItems, onSelect) {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById(dropdownId);
        if (!input || !dropdown) return;

        const render = () => {
            dropdown.innerHTML = '';
            const items = getItems();
            items.forEach(opt => {
                const div = document.createElement('div');
                div.className = 'dropdown-item';
                if (opt.selected) div.classList.add('selected');
                div.textContent = opt.label;
                div.addEventListener('mousedown', e => {
                    e.preventDefault();
                    dropdown.classList.remove('show');
                    input.blur();
                    onSelect(opt);
                });
                dropdown.appendChild(div);
            });
        };

        input.addEventListener('click', e => {
            e.stopPropagation();
            if (dropdown.classList.contains('show')) {
                dropdown.classList.remove('show');
                return;
            }
            document.querySelectorAll('.dropdown-list.show').forEach(d => d.classList.remove('show'));
            render();
            dropdown.classList.add('show');
        });

        document.addEventListener('click', e => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
    }

    function initStatusDropdown() {
        const input = document.getElementById('statusFilter');
        const def = STATUS_OPTIONS.find(o => o.value === activeStatusFilter);
        if (input && def) {
            input.value = def.label;
            input.closest('.input-box')?.classList.add('has-value');
        }

        bindDropdown(
            'statusFilter',
            'status-filter-dropdown',
            () => STATUS_OPTIONS.map(o => ({ ...o, selected: o.value === activeStatusFilter })),
            opt => {
                activeStatusFilter = opt.value;
                if (input) {
                    input.value = opt.label;
                    input.closest('.input-box')?.classList.add('has-value');
                }
                syncQuickFilterPills();
                applyFilters(true);
            }
        );
    }

    function initStationDropdown() {
        const input = document.getElementById('stationFilter');
        if (input) {
            input.value = 'Tất cả Station';
            input.closest('.input-box')?.classList.add('has-value');
        }

        bindDropdown(
            'stationFilter',
            'station-filter-dropdown',
            () => {
                const list = [{ value: '', label: 'Tất cả Station', selected: activeStationFilter === '' }];
                allStations.forEach(st => {
                    list.push({ value: st, label: st, selected: activeStationFilter === st });
                });
                return list;
            },
            opt => {
                activeStationFilter = opt.value;
                if (input) {
                    input.value = opt.label;
                    input.closest('.input-box')?.classList.add('has-value');
                }
                applyFilters(true);
            }
        );
    }

    function syncQuickFilterPills() {
        document.querySelectorAll('.srr-pill[data-quick-filter]').forEach(pill => {
            pill.classList.toggle('is-active', pill.dataset.quickFilter === activeStatusFilter);
        });
    }

    function initControls() {
        const btnLoad = document.getElementById('btnLoad');
        if (btnLoad) btnLoad.addEventListener('click', scanResetRows);

        const searchEl = document.getElementById('clientSearch');
        if (searchEl) {
            searchEl.addEventListener('input', () => {
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(() => applyFilters(true), 150);
            });
        }
        window.customClientSearchHandler = () => applyFilters(true);

        document.querySelectorAll('.srr-pill[data-quick-filter]').forEach(pill => {
            pill.addEventListener('click', () => {
                activeStatusFilter = pill.dataset.quickFilter;
                const statusInput = document.getElementById('statusFilter');
                const matched = STATUS_OPTIONS.find(o => o.value === activeStatusFilter);
                if (statusInput && matched) statusInput.value = matched.label;
                syncQuickFilterPills();
                applyFilters(true);
            });
        });

        const selectAllPage = document.getElementById('selectAllPage');
        if (selectAllPage) {
            selectAllPage.addEventListener('change', () => {
                const start = (currentPage - 1) * PAGE_SIZE;
                const pageItems = filteredRows.slice(start, start + PAGE_SIZE);
                pageItems.forEach(r => {
                    if (!r.oid && restoreMode === 'quantity') return;
                    if (selectAllPage.checked) selectedKeys.add(r._key);
                    else selectedKeys.delete(r._key);
                });
                renderTablePage();
                updateSelectionUI();
            });
        }

        const btnSelectSafe = document.getElementById('btnSelectSafe');
        if (btnSelectSafe) {
            btnSelectSafe.addEventListener('click', () => {
                let added = 0;
                const seenOids = new Set();
                filteredRows.forEach(r => {
                    if (r.risk_level === 'SAFE' && r.oid) {
                        if (restoreMode === 'quantity') {
                            if (seenOids.has(r.oid)) return;
                            seenOids.add(r.oid);
                        }
                        selectedKeys.add(r._key);
                        added++;
                    }
                });
                renderTablePage();
                updateSelectionUI();
                if (typeof Toast !== 'undefined') {
                    Toast.info('Chọn tự động', `Đã chọn ${added} dòng An toàn.`);
                }
            });
        }

        const btnClearSel = document.getElementById('btnClearSelection');
        if (btnClearSel) {
            btnClearSel.addEventListener('click', () => {
                selectedKeys.clear();
                renderTablePage();
                updateSelectionUI();
            });
        }

        document.querySelectorAll('.srr-mode-btn[data-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                restoreMode = btn.dataset.mode;
                document.querySelectorAll('.srr-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
                renderTablePage();
                updateSelectionUI();
            });
        });
    }

    async function scanResetRows() {
        const btnLoad = document.getElementById('btnLoad');
        const loadIcon = document.getElementById('btnLoadIcon');
        const standby = document.getElementById('tableStandbyPlaceholder');
        const table = document.getElementById('recoveryTable');
        const footer = document.getElementById('tableFooter');

        if (btnLoad) btnLoad.disabled = true;
        if (loadIcon) loadIcon.classList.add('reprint-label-log-spin');

        try {
            const res = await fetch('/api/site-reset-recovery/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from_date: selectedFromDate,
                    to_date: selectedToDate,
                    status_filter: 'all'
                })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error((data && data.message) || `Lỗi HTTP ${res.status}`);
            }

            allRows = (data.rows || []).map(r => ({ ...r, _key: makeRowKey(r) }));
            allStations = Array.isArray(data.stations) ? data.stations : [];
            selectedKeys.clear();
            editedQtyMap.clear();

            updateSummaryBar(data.summary || {});
            if (standby) standby.style.display = 'none';
            if (table) table.style.display = 'table';
            if (footer) footer.classList.remove('hidden');

            const sumBar = document.getElementById('srrSummaryBar');
            if (sumBar) sumBar.style.display = 'flex';

            applyFilters(true);
            if (typeof Toast !== 'undefined') {
                Toast.success('Quét hoàn tất', `Phát hiện ${allRows.length} tem bị reset trong khoảng thời gian đã chọn.`);
            }
        } catch (err) {
            console.error('[SiteResetRecovery] Scan error:', err);
            if (typeof Toast !== 'undefined') Toast.error('Lỗi quét dữ liệu', err.message || 'Không thể kết nối server');
        } finally {
            if (btnLoad) btnLoad.disabled = false;
            if (loadIcon) loadIcon.classList.remove('reprint-label-log-spin');
        }
    }

    function updateSummaryBar(sum) {
        const set = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.textContent = v ?? 0;
        };
        set('sumTotal', sum.total || 0);
        set('sumZero', sum.zero_count || 0);
        set('sumPartial', sum.partial_count || 0);
        set('sumNegative', sum.negative_count || 0);
        set('sumSafe', sum.safe_count || 0);
        set('sumWarn', sum.warn_count || 0);
    }

    function applyFilters(resetPage = true) {
        const kw = (document.getElementById('clientSearch')?.value || '').trim().toLowerCase();
        filteredRows = allRows.filter(r => {
            if (activeStationFilter && r.station !== activeStationFilter) return false;
            if (activeStatusFilter === 'zero' && r.qty_status !== 'zero') return false;
            if (activeStatusFilter === 'partial' && r.qty_status !== 'partial') return false;
            if (activeStatusFilter === 'negative' && r.qty_status !== 'negative') return false;
            if (activeStatusFilter === 'safe_only' && r.risk_level !== 'SAFE') return false;
            if (activeStatusFilter === 'warn_only' && r.risk_level !== 'WARN') return false;

            if (kw) {
                const hay = `${r.barcode} ${r.product_id} ${r.product_type} ${r.station} ${r.site_name} ${r.flag_summary}`.toLowerCase();
                if (!hay.includes(kw)) return false;
            }
            return true;
        });

        totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
        if (resetPage || currentPage > totalPages) currentPage = 1;

        renderTablePage();
        renderPagination();
        updateSelectionUI();
    }

    function getTargetQty(row) {
        if (editedQtyMap.has(row._key)) return editedQtyMap.get(row._key);
        return row.proposed_qty;
    }

    function renderTablePage() {
        const tbody = document.getElementById('tableBody');
        const rowCountEl = document.getElementById('rowCount');
        if (!tbody) return;
        if (rowCountEl) rowCountEl.textContent = filteredRows.length;

        if (filteredRows.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="13" style="text-align: center; padding: 40px; color: var(--color-text-muted, #94a3b8);">
                        Không có dòng dữ liệu nào phù hợp bộ lọc hiện tại.
                    </td>
                </tr>
            `;
            const selectAll = document.getElementById('selectAllPage');
            if (selectAll) selectAll.checked = false;
            return;
        }

        const start = (currentPage - 1) * PAGE_SIZE;
        const pageItems = filteredRows.slice(start, start + PAGE_SIZE);

        tbody.innerHTML = pageItems.map((r, i) => {
            const idx = start + i + 1;
            const checked = selectedKeys.has(r._key) ? 'checked' : '';
            const disabled = (!r.oid && restoreMode === 'quantity') ? 'disabled' : '';
            const badgeCls = r.risk_level === 'SAFE'
                ? 'srr-badge-safe'
                : (r.risk_level === 'PARTIAL' ? 'srr-badge-partial' : 'srr-badge-warn');
            const badgeTxt = r.risk_level === 'SAFE' ? 'An toàn' : (r.risk_level === 'PARTIAL' ? 'Partial' : 'Cảnh báo');
            const targetQty = getTargetQty(r);

            return `
                <tr data-key="${escapeHtml(r._key)}">
                    <td style="text-align: center;">
                        <input type="checkbox" class="srr-row-cb" data-key="${escapeHtml(r._key)}" ${checked} ${disabled} aria-label="Chọn dòng ${escapeHtml(r.barcode)}">
                    </td>
                    <td style="text-align: center;">${idx}</td>
                    <td class="srr-mono">${escapeHtml(r.barcode)}</td>
                    <td>${escapeHtml(r.product_id)}</td>
                    <td>${escapeHtml(r.product_type)}</td>
                    <td>${escapeHtml(r.station)}</td>
                    <td>${escapeHtml(r.site_name)}</td>
                    <td class="srr-mono">${escapeHtml(r.reset_time_vn)}</td>
                    <td class="srr-num">${formatNum(r.mr_qty)}</td>
                    <td class="srr-num">${formatNum(r.wiped_qty)}${r.item_count > 1 ? ` <small>(×${r.item_count})</small>` : ''}</td>
                    <td class="srr-num">
                        ${restoreMode === 'quantity'
                            ? `<input type="number" step="any" min="0" class="srr-qty-input" data-key="${escapeHtml(r._key)}" value="${escapeHtml(targetQty)}" ${disabled}>`
                            : `<span style="color: var(--color-text-muted); font-size: 11.5px;">Giữ nguyên (Site)</span>`}
                    </td>
                    <td class="srr-num">${formatNum(r.initial_qty)}</td>
                    <td>
                        <span class="srr-badge ${badgeCls}">${badgeTxt}</span>
                        ${r.flag_summary && r.flag_summary !== 'An toàn' ? `<div class="srr-flag-detail">${escapeHtml(r.flag_summary)}</div>` : ''}
                    </td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('.srr-row-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                const k = cb.dataset.key;
                if (cb.checked) selectedKeys.add(k);
                else selectedKeys.delete(k);
                updateSelectionUI();
            });
        });

        tbody.querySelectorAll('.srr-qty-input').forEach(inp => {
            inp.addEventListener('change', () => {
                const k = inp.dataset.key;
                const val = Number(inp.value);
                if (Number.isFinite(val) && val >= 0) {
                    editedQtyMap.set(k, Math.round(val * 1e6) / 1e6);
                }
            });
        });

        const selectAll = document.getElementById('selectAllPage');
        if (selectAll) {
            const selectable = pageItems.filter(r => r.oid || restoreMode !== 'quantity');
            selectAll.checked = selectable.length > 0 && selectable.every(r => selectedKeys.has(r._key));
        }
    }

    function renderPagination() {
        const nav = document.getElementById('paginationNav');
        if (!nav) return;
        if (totalPages <= 1) {
            nav.innerHTML = '';
            return;
        }
        const mkBtn = (label, page, disabled, active) =>
            `<button type="button" class="page-btn ${active ? 'active' : ''}" ${disabled ? 'disabled' : ''} data-page="${page}">${label}</button>`;

        let html = mkBtn('‹', Math.max(1, currentPage - 1), currentPage <= 1, false);
        const startP = Math.max(1, currentPage - 2);
        const endP = Math.min(totalPages, currentPage + 2);
        for (let p = startP; p <= endP; p++) {
            html += mkBtn(String(p), p, false, p === currentPage);
        }
        html += mkBtn('›', Math.min(totalPages, currentPage + 1), currentPage >= totalPages, false);
        nav.innerHTML = html;

        nav.querySelectorAll('button[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = Number(btn.dataset.page);
                if (p && p !== currentPage) {
                    currentPage = p;
                    renderTablePage();
                    renderPagination();
                }
            });
        });
    }

    function updateSelectionUI() {
        const count = selectedKeys.size;
        const countEl = document.getElementById('selectedCount');
        const holdBtn = document.getElementById('btnRestoreHold');
        const holdTxt = document.getElementById('restoreHoldText');
        if (countEl) countEl.textContent = count;
        if (holdBtn) holdBtn.disabled = count === 0 || isRestoring;
        if (holdTxt && !isRestoring) {
            holdTxt.textContent = restoreMode === 'quantity'
                ? `Giữ 3s Trả Qty (${count})`
                : `Giữ 3s Khôi phục Site (${count})`;
        }
    }

    function initHoldRestoreButton() {
        const btn = document.getElementById('btnRestoreHold');
        const bar = document.getElementById('restoreHoldProgressBar');
        const txt = document.getElementById('restoreHoldText');
        if (!btn) return;

        const cancelHold = () => {
            if (holdAnimFrame) {
                cancelAnimationFrame(holdAnimFrame);
                holdAnimFrame = null;
            }
            holdStartTime = null;
            if (bar) bar.style.width = '0%';
            updateSelectionUI();
        };

        const tick = () => {
            if (!holdStartTime) return;
            const elapsed = performance.now() - holdStartTime;
            const pct = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
            if (bar) bar.style.width = `${pct}%`;
            if (elapsed >= HOLD_DURATION_MS) {
                holdCompleted = true;
                holdStartTime = null;
                holdAnimFrame = null;
                if (bar) bar.style.width = '100%';
                executeRestore();
                return;
            }
            holdAnimFrame = requestAnimationFrame(tick);
        };

        const startHold = e => {
            if (btn.disabled || isRestoring || selectedKeys.size === 0) return;
            if (e && e.type === 'mousedown' && e.button !== 0) return;
            holdCompleted = false;
            holdStartTime = performance.now();
            if (txt) txt.textContent = 'Đang giữ để xác nhận...';
            holdAnimFrame = requestAnimationFrame(tick);
        };

        const endHold = () => {
            if (holdStartTime && !holdCompleted) {
                cancelHold();
                if (typeof Toast !== 'undefined') {
                    Toast.info('Chưa đủ 3 giây', 'Vui lòng bấm và giữ nút đủ 3 giây để thực hiện khôi phục.');
                }
            }
        };

        btn.addEventListener('mousedown', startHold);
        btn.addEventListener('touchstart', startHold, { passive: true });
        window.addEventListener('mouseup', endHold);
        window.addEventListener('touchend', endHold);
        btn.addEventListener('mouseleave', () => {
            if (holdStartTime && !holdCompleted) cancelHold();
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
                site_name: r.site_name,
                site_index: r.site_index,
                reset_ts: r.reset_ts,
                prev_ts: r.prev_ts,
                expected_qty: r.mr_qty,
                new_qty: getTargetQty(r)
            });
        });

        if (items.length === 0) return;

        isRestoring = true;
        const holdBtn = document.getElementById('btnRestoreHold');
        const holdTxt = document.getElementById('restoreHoldText');
        const bar = document.getElementById('restoreHoldProgressBar');
        if (holdBtn) holdBtn.disabled = true;
        if (holdTxt) holdTxt.textContent = 'Đang xử lý...';

        try {
            const res = await fetch('/api/site-reset-recovery/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: restoreMode, items })
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
            if (bar) bar.style.width = '0%';
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
    }

    async function loadRecoveryHistory() {
        const tbody = document.getElementById('srrHistoryBody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 24px;">Đang tải lịch sử...</td></tr>';

        try {
            const res = await fetch('/api/site-reset-recovery/history');
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error((data && data.message) || 'Lỗi tải lịch sử');
            const recs = data.records || [];
            if (recs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 28px; color: var(--color-text-muted);">Chưa có đợt khôi phục nào.</td></tr>';
                return;
            }
            tbody.innerHTML = recs.map(rec => `
                <tr>
                    <td class="srr-mono">${escapeHtml(rec.recovery_id)}</td>
                    <td class="srr-mono">${escapeHtml(rec.timestamp_vn)}</td>
                    <td>${escapeHtml(rec.env || 'KV2')}</td>
                    <td>${escapeHtml(rec.mode === 'container' ? 'Site Contents' : 'MR Quantity')}</td>
                    <td class="srr-num">${escapeHtml(rec.count)}</td>
                    <td>${escapeHtml(rec.operator_user)} (${escapeHtml(rec.operator_ip)})</td>
                    <td>
                        ${rec.rolled_back
                            ? `<span class="srr-badge srr-badge-warn">Đã hoàn tác (${escapeHtml(rec.rollback_at || '')})</span>`
                            : `<span class="srr-badge srr-badge-safe">Đang áp dụng</span>`}
                    </td>
                    <td style="text-align: center;">
                        ${rec.rolled_back
                            ? '-'
                            : `<button type="button" class="srr-btn-sm is-danger btn-srr-rollback" data-id="${escapeHtml(rec.recovery_id)}">Hoàn tác</button>`}
                    </td>
                </tr>
            `).join('');

            tbody.querySelectorAll('.btn-srr-rollback').forEach(b => {
                b.addEventListener('click', async () => {
                    const id = b.dataset.id;
                    const ok = typeof showConfirm === 'function'
                        ? await showConfirm(`Xác nhận hoàn tác đợt <strong>${escapeHtml(id)}</strong> về giá trị trước khi khôi phục?`, 'Xác nhận hoàn tác')
                        : true;
                    if (!ok) return;
                    b.disabled = true;
                    try {
                        const rRes = await fetch('/api/site-reset-recovery/rollback', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ recovery_id: id })
                        });
                        const rData = await rRes.json();
                        if (!rRes.ok || !rData.success) throw new Error(rData.message || 'Lỗi hoàn tác');
                        if (typeof Toast !== 'undefined') Toast.success('Hoàn tác thành công', rData.message);
                        await loadRecoveryHistory();
                        if (allRows.length > 0) await scanResetRows();
                    } catch (err) {
                        if (typeof Toast !== 'undefined') Toast.error('Lỗi hoàn tác', err.message);
                        b.disabled = false;
                    }
                });
            });
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 24px; color: #f87171;">${escapeHtml(err.message)}</td></tr>`;
        }
    }

    function setupExportHook() {
        window.getPageExportData = function () {
            const columns = [
                'Barcode', 'Product ID', 'Loại NVL', 'Station', 'Site',
                'Thời điểm Reset (UTC+7)', 'MR Qty Hiện tại', 'Wiped Qty (Container)',
                'Qty Sau Khôi Phục', 'Initial Qty', 'Trạng thái', 'Chi tiết cảnh báo'
            ];
            const rows = (filteredRows || []).map(r => [
                r.barcode,
                r.product_id,
                r.product_type,
                r.station,
                r.site_name,
                r.reset_time_vn,
                r.mr_qty,
                r.wiped_qty,
                getTargetQty(r),
                r.initial_qty,
                r.risk_level,
                r.flag_summary
            ]);
            const nowStr = typeof getVietnamTimestamp === 'function'
                ? getVietnamTimestamp()
                : new Date().toISOString().slice(0, 10);
            return {
                rows,
                columns,
                filename: `Site_Reset_Recovery_${nowStr}.xlsx`,
                sheetName: 'Site_Reset_Recovery'
            };
        };
    }
})();

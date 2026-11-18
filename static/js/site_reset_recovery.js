/**
 * ==============================================================================
 * KDMES TOOL — SITE RESET RECOVERY CONTROLLER
 * Tìm kiếm và trả lại quantity cho các barcode có quantity = 0 bị Uploader reset
 * ==============================================================================
 */
(function () {
    'use strict';

    const HOLD_DURATION_MS = 3000;

    let allRows = [];
    let filteredRows = [];
    let allStations = [];
    let selectedKeys = new Set();
    let editedQtyMap = new Map();
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
        initFlatpickr();
        initStationDropdown();
        initControls();
        initHoldRestoreButton();
        initHistoryModal();
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

        dateInput.addEventListener('click', () => {
            if (dateInput.value && flatpickrInstance) {
                flatpickrInstance.clear();
                selectedFromDate = '';
                selectedToDate = '';
                if (fromEl) fromEl.value = '';
                if (toEl) toEl.value = '';
                dateInput.value = '';
            }
        });
    }

    function initStationDropdown() {
        const input = document.getElementById('stationFilter');
        const dropdown = document.getElementById('station-filter-dropdown');
        if (!input || !dropdown) return;

        input.value = 'Tất cả Station';
        input.closest('.input-box')?.classList.add('has-value');

        const render = () => {
            dropdown.innerHTML = '';
            const list = [{ value: '', label: 'Tất cả Station' }].concat(
                allStations.map(st => ({ value: st, label: st }))
            );
            list.forEach(opt => {
                const div = document.createElement('div');
                div.className = 'dropdown-item';
                if (opt.value === activeStationFilter) div.classList.add('selected');
                div.textContent = opt.label;
                div.addEventListener('mousedown', e => {
                    e.preventDefault();
                    activeStationFilter = opt.value;
                    input.value = opt.label;
                    input.closest('.input-box')?.classList.add('has-value');
                    dropdown.classList.remove('show');
                    input.blur();
                    applyFilters();
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

    function initControls() {
        const btnLoad = document.getElementById('btnLoad');
        if (btnLoad) btnLoad.addEventListener('click', scanResetRows);

        const searchEl = document.getElementById('clientSearch');
        if (searchEl) {
            searchEl.addEventListener('input', () => {
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(() => applyFilters(), 150);
            });
        }
        window.customClientSearchHandler = () => applyFilters();

        const selectAllRows = document.getElementById('selectAllRows');
        if (selectAllRows) {
            selectAllRows.addEventListener('change', () => {
                filteredRows.forEach(r => {
                    if (!r.oid) return;
                    if (selectAllRows.checked) selectedKeys.add(r._key);
                    else selectedKeys.delete(r._key);
                });
                renderTable();
                updateSelectionUI();
            });
        }
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
                    to_date: selectedToDate
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

            if (standby) standby.style.display = 'none';
            if (table) table.style.display = 'table';
            if (footer) footer.classList.remove('hidden');

            applyFilters();
            if (typeof Toast !== 'undefined') {
                Toast.success('Quét hoàn tất', `Tìm thấy ${allRows.length} barcode có quantity = 0 bị uploader reset.`);
            }
        } catch (err) {
            console.error('[SiteResetRecovery] Scan error:', err);
            if (typeof Toast !== 'undefined') Toast.error('Lỗi quét dữ liệu', err.message || 'Không thể kết nối server');
        } finally {
            if (btnLoad) btnLoad.disabled = false;
            if (loadIcon) loadIcon.classList.remove('reprint-label-log-spin');
        }
    }

    function applyFilters() {
        const kw = (document.getElementById('clientSearch')?.value || '').trim().toLowerCase();
        filteredRows = allRows.filter(r => {
            if (activeStationFilter && r.station !== activeStationFilter) return false;
            if (kw) {
                const hay = `${r.barcode} ${r.product_id} ${r.product_type} ${r.station} ${r.site_name} ${r.flag_summary}`.toLowerCase();
                if (!hay.includes(kw)) return false;
            }
            return true;
        });

        renderTable();
        updateSelectionUI();
    }

    function getTargetQty(row) {
        if (editedQtyMap.has(row._key)) return editedQtyMap.get(row._key);
        return row.proposed_qty;
    }

    function renderTable() {
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
            const selectAll = document.getElementById('selectAllRows');
            if (selectAll) selectAll.checked = false;
            return;
        }

        tbody.innerHTML = filteredRows.map((r, i) => {
            const idx = i + 1;
            const checked = selectedKeys.has(r._key) ? 'checked' : '';
            const disabled = !r.oid ? 'disabled' : '';
            const badgeCls = r.risk_level === 'SAFE' ? 'srr-badge-safe' : 'srr-badge-warn';
            const badgeTxt = r.risk_level === 'SAFE' ? 'An toàn' : 'Cảnh báo';
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
                        <input type="number" step="any" min="0" class="srr-qty-input" data-key="${escapeHtml(r._key)}" value="${escapeHtml(targetQty)}" ${disabled}>
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

        const selectAll = document.getElementById('selectAllRows');
        if (selectAll) {
            const selectable = filteredRows.filter(r => r.oid);
            selectAll.checked = selectable.length > 0 && selectable.every(r => selectedKeys.has(r._key));
        }
    }

    function updateSelectionUI() {
        const count = selectedKeys.size;
        const countEl = document.getElementById('selectedCount');
        const holdBtn = document.getElementById('btnRestoreHold');
        const holdTxt = document.getElementById('restoreHoldText');
        if (countEl) countEl.textContent = count;
        if (holdBtn) holdBtn.disabled = count === 0 || isRestoring;
        if (holdTxt && !isRestoring) {
            holdTxt.textContent = `Execute (${count})`;
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
            if (txt) txt.textContent = 'On Hold for Execution';
            holdAnimFrame = requestAnimationFrame(tick);
        };

        const endHold = () => {
            if (holdStartTime && !holdCompleted) {
                cancelHold();
                if (typeof Toast !== 'undefined') {
                    Toast.info('Chưa đủ 3 giây', 'Vui lòng nhấn và giữ nút đủ 3 giây để thực hiện khôi phục.');
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
                reset_ts: r.reset_ts,
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
        if (holdTxt) holdTxt.textContent = 'Executing...';

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
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px;">Đang tải lịch sử...</td></tr>';

        try {
            const res = await fetch('/api/site-reset-recovery/history');
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error((data && data.message) || 'Lỗi tải lịch sử');
            const recs = data.records || [];
            if (recs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 28px; color: var(--color-text-muted);">Chưa có đợt khôi phục nào.</td></tr>';
                return;
            }
            tbody.innerHTML = recs.map(rec => `
                <tr>
                    <td class="srr-mono">${escapeHtml(rec.recovery_id)}</td>
                    <td class="srr-mono">${escapeHtml(rec.timestamp_vn)}</td>
                    <td>${escapeHtml(rec.env || 'KV2')}</td>
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
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 24px; color: #f87171;">${escapeHtml(err.message)}</td></tr>`;
        }
    }
})();

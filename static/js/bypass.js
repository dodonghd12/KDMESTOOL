/**
 * ==============================================================================
 * KDMES TOOL — BYPASS CONTROLLER
 * Quản lý Bật/Tắt chế độ Strict Mode của MES từ xa (198.1.10.8) & Lưu Audit Log
 * ==============================================================================
 */

(function () {
    const PAGE_SIZE = 30;
    let isBypassActive = false;
    let isLoading = false;
    let currentServer = (localStorage.getItem('bypass_selected_server') === '198.1.10.8') ? '198.1.10.8' : '198.1.10.85';
    let allLogs = [];
    let filteredLogs = [];
    let currentPage = 1;
    let totalPages = 1;
    let stepTimers = [];
    let hideBadgeTimeout = null;
    let hasFetchedLogs = false;

    function showStandbyPlaceholder() {
        const ph = document.getElementById('tableStandbyPlaceholder');
        const tbl = document.getElementById('bypassLogTable') || document.querySelector('.table-container table');
        const tbody = document.getElementById('tableBody');
        const footer = document.querySelector('.table-footer');
        const paginationNav = document.getElementById('paginationNav');
        if (tbody) tbody.innerHTML = '';
        if (ph) {
            ph.classList.remove('has-data');
            ph.style.display = '';
        }
        if (tbl) tbl.style.display = 'none';
        if (footer) footer.classList.add('hidden');
        if (paginationNav) paginationNav.innerHTML = '';
    }

    function hideStandbyPlaceholder() {
        const ph = document.getElementById('tableStandbyPlaceholder');
        const tbl = document.getElementById('bypassLogTable') || document.querySelector('.table-container table');
        if (ph) {
            ph.classList.add('has-data');
            ph.style.display = 'none';
        }
        if (tbl) tbl.style.display = '';
    }

    document.addEventListener('DOMContentLoaded', initializeBypass);

    function initializeBypass() {
        const refreshBtn = document.getElementById('btnRefreshLogs');
        const searchInput = document.getElementById('clientSearch');
        const toggleServerBtn = document.getElementById('btnToggleServer');
        const serverBadge = document.getElementById('bypassMetaBadge');

        // Khởi tạo nhãn máy chủ ban đầu
        updateServerBadgeUI(currentServer);

        // Khởi tạo nút bấm giữ 3 giây (Hold 3s)
        initBypassHoldButton();

        // Đảm bảo clientSearch luôn luôn enable, không bị main.js vô hiệu hóa
        ensureClientSearchEnabled();
        window.updateClientSearchState = function () {
            ensureClientSearchEnabled();
        };
        window.customClientSearchHandler = function (keyword) {
            applyClientSearch(keyword);
        };

        // Hook cung cấp dữ liệu xuất Excel toàn bộ trang (All Pages / Filtered Logs)
        window.getPageExportData = function () {
            return {
                rows: filteredLogs.map(r => [
                    r.server || '198.1.10.8',
                    r.ip || '--',
                    r.time || '--',
                    r.note || '--'
                ]),
                columns: ['Máy chủ', 'Địa chỉ IP', 'Thời gian (UTC+7)', 'Ghi chú'],
                filename: 'KDMES_Bypass_Log_' + (typeof getVietnamTimestamp === 'function' ? getVietnamTimestamp() : new Date().toISOString().slice(0, 10)) + '.xlsx',
                sheetName: 'Bypass_Log'
            };
        };

        setTimeout(ensureClientSearchEnabled, 50);
        setTimeout(ensureClientSearchEnabled, 250);

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                fetchStatusAndLogs(true, false, true);
            });
        }

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                applyClientSearch(searchInput.value);
            });
        }

        // Bắt sự kiện chuyển đổi máy chủ (198.1.10.8 <-> 198.1.10.85)
        if (toggleServerBtn) {
            toggleServerBtn.addEventListener('click', handleToggleServerClick);
        }
        if (serverBadge) {
            serverBadge.addEventListener('click', (e) => {
                if (e.target.closest('#btnToggleServer')) return;
                handleToggleServerClick(e);
            });
        }

        // Tự động kiểm tra trạng thái và tải log ban đầu theo máy chủ đã chọn
                // Nút mở nội dung file docker-compose.yml theo máy chủ hiện tại (currentServer)
        const btnOpenComposeYaml = document.getElementById('btnOpenComposeYaml');
        if (btnOpenComposeYaml) {
            btnOpenComposeYaml.addEventListener('click', async () => {
                const labelEl = document.getElementById('currentServerLabel');
                const labelText = (labelEl ? labelEl.textContent : '').trim();
                let targetServer = currentServer;
                if (labelText.includes('198.1.10.85')) targetServer = '198.1.10.85';
                else if (labelText.includes('198.1.10.8')) targetServer = '198.1.10.8';

                showStepBadge(`Đang tải docker-compose.yml (${targetServer})...`, 'sync', 'progress');
                btnOpenComposeYaml.disabled = true;

                try {
                    const res = await fetch(`/api/bypass/compose-content?server=${encodeURIComponent(targetServer)}`);
                    const data = await res.json();
                    if (!data || !data.success) {
                        Toast.error('Lỗi', data?.message || 'Không thể tải docker-compose.yml');
                        showStepBadge('Lỗi tải docker-compose.yml', 'error', 'error');
                        return;
                    }

                    showStepBadge(`Đã tải docker-compose.yml (${targetServer})`, 'check_circle', 'success');
                    if (typeof openYamlViewerModal === 'function') {
                        openYamlViewerModal(`docker-compose.yml (root@${targetServer})`, data.content, data.compose_file);
                    } else if (typeof showDetailsModal === 'function') {
                        showDetailsModal({
                            'File': data.compose_file,
                            'Server': `root@${targetServer}`,
                            'Content': data.content
                        });
                    }
                } catch (err) {
                    Toast.error('Lỗi', `Lỗi kết nối tải docker-compose.yml: ${err.message}`);
                    showStepBadge('Lỗi kết nối tải docker-compose.yml', 'error', 'error');
                } finally {
                    btnOpenComposeYaml.disabled = false;
                }
            });
        }

        fetchStatusAndLogs(false, false);
    }

    /**
     * Cập nhật giao diện badge máy chủ đích
     */
    function updateServerBadgeUI(server) {
        const labelEl = document.getElementById('currentServerLabel');
        const btnTextEl = document.getElementById('btnToggleServerText');
        const btnEl = document.getElementById('btnToggleServer');
        const serverBadge = document.getElementById('bypassMetaBadge');

        if (labelEl) {
            labelEl.textContent = `root@${server}`;
        }

        const otherServer = (server === '198.1.10.8') ? '198.1.10.85' : '198.1.10.8';
        const otherShort = (server === '198.1.10.8') ? '10.85' : '10.8';

        if (btnTextEl) {
            btnTextEl.textContent = otherShort;
        }
        if (btnEl) {
            btnEl.title = `Chuyển sang ${otherServer}`;
        }
        if (serverBadge) {
            serverBadge.setAttribute('data-active-server', (server === '198.1.10.85') ? '10.85' : '10.8');
        }
    }

    /**
     * Xử lý khi nhấn nút chuyển đổi máy chủ
     */
    function handleToggleServerClick(e) {
        if (e) e.stopPropagation();
        if (isLoading) return;

        currentServer = (currentServer === '198.1.10.8') ? '198.1.10.85' : '198.1.10.8';
        localStorage.setItem('bypass_selected_server', currentServer);
        updateServerBadgeUI(currentServer);

        // Nạp lại trạng thái máy chủ mới với thông báo toast
        fetchStatusAndLogs(false, true);
    }

    /**
     * Tải trạng thái máy chủ và danh sách log
     */
    async function fetchStatusAndLogs(showToast = false, isSwitchingServer = false, forceRefresh = false) {
        const refreshBtn = document.getElementById('btnRefreshLogs');
        const refreshIcon = document.getElementById('btnRefreshLogsIcon');
        if (refreshBtn) refreshBtn.disabled = true;
        if (refreshIcon) refreshIcon.classList.add('btn-load-spin');

        if (typeof showTableLoadingState === 'function') {
            showTableLoadingState(`Đang tải trạng thái và nhật ký Bypass (${currentServer})...`, 4);
        }

        if (showToast) {
            showStepBadge(`Đang làm mới dữ liệu (${currentServer})...`, 'sync', 'progress');
        } else if (isSwitchingServer) {
            showStepBadge(`Đang kiểm tra root@${currentServer}...`, 'sync', 'progress');
        }

        try {
            const fetchFn = (window.top && window.top.getBypassServerStatus)
                || window.getBypassServerStatus
                || (async (server, force) => {
                    const res = await fetch(`/api/bypass/status?server=${encodeURIComponent(server)}`);
                    return await res.json();
                });

            const shouldForce = forceRefresh || showToast || isSwitchingServer;
            const data = await fetchFn(currentServer, shouldForce);

            if (data.success) {
                const status = data.status || {};
                isBypassActive = !!status.is_active;
                updateStatusUI(isBypassActive);

                try {
                    const topWin = (window.parent && window.parent !== window) ? window.parent : window;
                    topWin.__ak_server_status_cache = topWin.__ak_server_status_cache || {};
                    topWin.__ak_server_status_cache[currentServer] = { data: data, timestamp: Date.now() };
                } catch (e) {}

                allLogs = data.logs || [];
                hasFetchedLogs = allLogs.length > 0;
                applyClientSearch(document.getElementById('clientSearch')?.value || '');

                if (showToast || isSwitchingServer) {
                    const cInfo = status.container ? `mes: ${status.container.status || 'Up'}` : `Đã kết nối root@${currentServer}`;
                    showStepBadge(cInfo, 'check_circle', 'success');
                    hideStepBadgeAfterDelay(5000);

                    if (typeof Toast !== 'undefined') {
                        if (isSwitchingServer) {
                            Toast.info('Máy chủ', `Đã chuyển sang máy chủ ${currentServer}`);
                        } else if (showToast) {
                            Toast.success('Thành công', `Đã cập nhật trạng thái (${currentServer}) và lịch sử log mới nhất`);
                        }
                    }
                }
            } else {
                if (hasFetchedLogs && allLogs.length > 0) {
                    applyClientSearch(document.getElementById('clientSearch')?.value || '');
                } else {
                    showStandbyPlaceholder();
                }
                if (showToast || isSwitchingServer) {
                    showStepBadge(`Lỗi kiểm tra root@${currentServer}`, 'error', 'error');
                    hideStepBadgeAfterDelay(5000);
                    if (typeof Toast !== 'undefined') {
                        Toast.error('Lỗi', data.message || `Không thể kiểm tra trạng thái máy chủ ${currentServer}`);
                    }
                }
            }
        } catch (err) {
            console.error('[BYPASS] Lỗi khi tải trạng thái:', err);
            if (hasFetchedLogs && allLogs.length > 0) {
                applyClientSearch(document.getElementById('clientSearch')?.value || '');
            } else {
                showStandbyPlaceholder();
            }
            if (showToast || isSwitchingServer) {
                showStepBadge(`Lỗi kết nối root@${currentServer}`, 'error', 'error');
                hideStepBadgeAfterDelay(5000);
                if (typeof Toast !== 'undefined') {
                    Toast.error('Lỗi', `Lỗi kết nối khi tải trạng thái máy chủ ${currentServer}`);
                }
            }
        } finally {
            if (refreshBtn) refreshBtn.disabled = false;
            if (refreshIcon) refreshIcon.classList.remove('btn-load-spin');
            ensureClientSearchEnabled();
        }
    }

    /**
     * Cập nhật giao diện Trạng thái & Button
     */
    function updateStatusUI(isActive) {
        const btn = document.getElementById('btnBypassToggle') || document.getElementById('btnDarkMagicToggle');
        const statusPill = document.getElementById('bypassStatusPill') || document.getElementById('darkMagicStatusPill');
        const statusText = document.getElementById('statusText');

        if (btn) {
            btn.classList.remove('is-active', 'is-inactive', 'is-loading');
            btn.classList.add(isActive ? 'is-active' : 'is-inactive');
        }

        if (statusPill && statusText) {
            statusPill.classList.remove('status-active', 'status-inactive');
            if (isActive) {
                statusPill.classList.add('status-active');
                statusText.textContent = 'Bypass mode';
            } else {
                statusPill.classList.add('status-inactive');
                statusText.textContent = 'Strict mode';
            }
        }
    }

    /**
     * Hiển thị Badge tiến trình các bước cạnh statusPill
     */
    function showStepBadge(text, icon = 'sync', type = 'info') {
        const badge = document.getElementById('containerStatusBadge');
        const iconEl = document.getElementById('stepBadgeIcon');
        const textEl = document.getElementById('containerStatusText');
        if (!badge || !textEl) return;

        if (hideBadgeTimeout) {
            clearTimeout(hideBadgeTimeout);
            hideBadgeTimeout = null;
        }

        badge.classList.remove('is-step-info', 'is-step-success', 'is-step-error', 'is-step-progress', 'fade-out');
        badge.classList.add(`is-step-${type}`);

        if (iconEl && icon) {
            const safeIcon = (type === 'progress' && !['sync', 'progress_activity', 'refresh'].includes(icon))
                ? 'sync'
                : icon;
            iconEl.textContent = safeIcon;
        }

        textEl.textContent = text;
        badge.style.display = 'inline-flex';
        badge.style.opacity = '1';
    }

    /**
     * Ẩn badge sau thời gian xác định (mặc định 5s)
     */
    function hideStepBadgeAfterDelay(delayMs = 5000) {
        if (hideBadgeTimeout) clearTimeout(hideBadgeTimeout);
        hideBadgeTimeout = setTimeout(() => {
            const badge = document.getElementById('containerStatusBadge');
            if (badge) {
                badge.classList.add('fade-out');
                setTimeout(() => {
                    if (badge.classList.contains('fade-out')) {
                        badge.style.display = 'none';
                        badge.classList.remove('fade-out');
                    }
                }, 400);
            }
        }, delayMs);
    }

    function clearStepTimers() {
        stepTimers.forEach(t => clearTimeout(t));
        stepTimers = [];
    }

    /**
     * Khởi tạo nút bấm giữ 3 giây (Hold 3s) để kích hoạt / ngưng kích hoạt
     */
    function initBypassHoldButton() {
        const btn = document.getElementById('btnBypassToggle') || document.getElementById('btnDarkMagicToggle');
        if (!btn || !window.HoldButton) return;

        window.HoldButton.init(btn, {
            idleLabel: 'Hold to Execute',
            waitingLabel: 'Keep holding...',
            confirmedLabel: 'Executed',
            theme: 'danger',
            dialogTitle: 'Xác nhận thực thi Bypass?',
            dialogConfirmLabel: 'Execute'
        });

        btn.addEventListener('holdconfirm', (e) => {
            if (isLoading) return;
            const promise = executeToggleBypass();
            if (e.detail && typeof e.detail.waitUntil === 'function') {
                e.detail.waitUntil(promise);
            }
        });
    }

    /**
     * Thực thi Kích hoạt / Ngưng kích hoạt sau khi giữ đủ 3 giây
     */
    async function executeToggleBypass() {
        if (isLoading) return;

        const targetAction = isBypassActive ? 'deactivate' : 'activate';
        const actionLabel = (targetAction === 'activate') ? 'kích hoạt' : 'ngưng kích hoạt';

        // Bắt đầu thực thi trực tiếp, không qua customModal
        setLoadingState(true, targetAction);
        clearStepTimers();

        // Bước 1: Kết nối tới root@<currentServer>
        showStepBadge(`1. Kết nối root@${currentServer}...`, 'sync', 'progress');

        // Lên lịch các bước chuyển tiếp trực quan trong khi API xử lý
        stepTimers.push(setTimeout(() => {
            if (isLoading) {
                showStepBadge('2. Sửa file docker-compose.yml...', 'sync', 'progress');
            }
        }, 1200));

        stepTimers.push(setTimeout(() => {
            if (isLoading) {
                showStepBadge('3. Restart container MES...', 'sync', 'progress');
            }
        }, 2800));

        stepTimers.push(setTimeout(() => {
            if (isLoading) {
                showStepBadge('4. Kiểm tra Docker PS...', 'sync', 'progress');
            }
        }, 8500));

        try {
            const res = await fetch('/api/bypass/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: targetAction, server: currentServer })
            });

            const data = await res.json();
            clearStepTimers();

            if (data.success) {
                isBypassActive = !!data.is_active;

                // Xóa cache trạng thái trên window.top để lần kiểm tra sau lấy dữ liệu mới
                try {
                    const topWin = window.top || window;
                    if (topWin.__kd_ak_server_status_cache) {
                        delete topWin.__kd_ak_server_status_cache[currentServer];
                    }
                } catch (e) {}

                // Cập nhật giao diện Trạng thái & Button
                updateStatusUI(isBypassActive);

                // Hiển thị bước cuối cùng thành công
                showStepBadge(`mes (${currentServer}): Up (Hoàn tất)`, 'check_circle', 'success');
                // Tự động biến mất sau 5 giây
                hideStepBadgeAfterDelay(5000);

                // Cập nhật bảng log
                if (data.all_logs) {
                    allLogs = data.all_logs;
                    applyClientSearch(document.getElementById('clientSearch')?.value || '');
                }

                if (typeof Toast !== 'undefined') {
                    Toast.success('Thành công', data.message || `Đã ${actionLabel} thành công trên máy chủ ${currentServer}!`);
                }

            } else {
                clearStepTimers();
                showStepBadge(`Lỗi: ${data.message || 'Thất bại'}`, 'error', 'error');
                hideStepBadgeAfterDelay(5000);

                if (data.all_logs) {
                    allLogs = data.all_logs;
                    applyClientSearch(document.getElementById('clientSearch')?.value || '');
                }

                if (typeof Toast !== 'undefined') {
                    Toast.error('Lỗi', data.message || `Thao tác không thành công trên máy chủ ${currentServer}`);
                }
            }

        } catch (err) {
            clearStepTimers();
            console.error('[BYPASS] Lỗi thực thi toggle:', err);
            showStepBadge(`Lỗi: ${err.message || 'Lỗi kết nối'}`, 'error', 'error');
            hideStepBadgeAfterDelay(5000);

            if (typeof Toast !== 'undefined') {
                Toast.error('Lỗi', err.message || `Lỗi kết nối khi gửi yêu cầu tới ${currentServer}`);
            }
        } finally {
            setLoadingState(false, targetAction);
        }
    }

    function setLoadingState(loading, targetAction) {
        isLoading = loading;
    }

    /**
     * Đảm bảo ô tìm kiếm clientSearch luôn luôn enable, không bị main.js disable
     */
    function ensureClientSearchEnabled() {
        const searchInput = document.getElementById('clientSearch');
        if (searchInput) {
            searchInput.disabled = false;
            searchInput.removeAttribute('disabled');
        }
    }

    /**
     * Tính tổng số trang
     */
    function calculateTotalPages(totalItems, pageSize) {
        if (!totalItems || totalItems <= 0) return 0;
        return Math.ceil(totalItems / pageSize);
    }

    /**
     * Giới hạn trang hợp lệ
     */
    function clampPage(page, total) {
        if (total <= 0) return 1;
        return Math.max(1, Math.min(page, total));
    }

    /**
     * Tìm kiếm và render lại bảng log kèm phân trang
     */
    function applyClientSearch(keyword) {
        const kw = (keyword || '').toLowerCase().trim();
        if (!kw) {
            filteredLogs = [...allLogs];
        } else {
            filteredLogs = allLogs.filter(item => {
                const server = (item.server || '').toLowerCase();
                const ip = (item.ip || '').toLowerCase();
                const time = (item.time || '').toLowerCase();
                const note = (item.note || '').toLowerCase();
                return server.includes(kw) || ip.includes(kw) || time.includes(kw) || note.includes(kw);
            });
        }

        totalPages = calculateTotalPages(filteredLogs.length, PAGE_SIZE);
        currentPage = 1;
        renderCurrentPage();
    }

    /**
     * Hiển thị dữ liệu của trang hiện tại và cập nhật thanh phân trang
     */
    function renderCurrentPage() {
        const rowCountEl = document.getElementById('rowCount');
        const tableFooter = document.querySelector('.table-footer');
        const paginationNav = document.getElementById('paginationNav');

        if (!hasFetchedLogs || allLogs.length === 0) {
            if (rowCountEl) rowCountEl.textContent = '0';
            showStandbyPlaceholder();
            return;
        }

        hideStandbyPlaceholder();

        const page0 = Math.max(0, currentPage - 1);
        const startIdx = page0 * PAGE_SIZE;
        const endIdx = startIdx + PAGE_SIZE;
        const pageRows = filteredLogs.slice(startIdx, endIdx);

        renderTable(pageRows);

        if (rowCountEl) {
            rowCountEl.textContent = filteredLogs.length.toLocaleString();
        }

        if (tableFooter) {
            if (filteredLogs.length > 0) {
                tableFooter.classList.remove('hidden');
            } else {
                tableFooter.classList.add('hidden');
            }
        }

        if (paginationNav && typeof renderShadcnPagination === 'function') {
            renderShadcnPagination(paginationNav, currentPage, totalPages, (newPage) => {
                currentPage = clampPage(newPage, totalPages);
                renderCurrentPage();
                const tableScroll = document.querySelector('.table-scroll');
                if (tableScroll) {
                    tableScroll.scrollTop = 0;
                }
            });
        }
    }

    /**
     * Render bảng log (4 cột: Máy chủ, IP, Thời gian, Ghi chú - dạng chữ bình thường)
     */
    function renderTable(logs) {
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;

        if (!logs || logs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; padding: 40px; color: var(--color-text-muted);">
                        Không có lịch sử thao tác nào phù hợp.
                    </td>
                </tr>
            `;
            return;
        }

        const html = logs.map((row) => {
            const server = row.server || '198.1.10.8';
            const ip = row.ip || '--';
            const time = row.time || '--';
            const note = row.note || '--';

            return `
                <tr>
                    <td class="ak-table-server">${escapeHtml(server)}</td>
                    <td class="ak-table-ip">${escapeHtml(ip)}</td>
                    <td class="ak-table-time">${escapeHtml(time)}</td>
                    <td>${escapeHtml(note)}</td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = html;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

})();

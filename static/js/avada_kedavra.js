/**
 * ==============================================================================
 * KDMES TOOL — AVADA KEDAVRA CONTROLLER
 * Quản lý Bật/Tắt chế độ Strict Mode của MES từ xa (198.1.10.8) & Lưu Audit Log
 * ==============================================================================
 */

(function () {
    const PAGE_SIZE = 30;
    const HOLD_DURATION_MS = 3000;
    let holdStartTime = null;
    let holdAnimFrame = null;
    let isAvadaKedavraActive = false;
    let isLoading = false;
    let currentServer = (localStorage.getItem('ak_selected_server') === '198.1.10.85') ? '198.1.10.85' : '198.1.10.8';
    let allLogs = [];
    let filteredLogs = [];
    let currentPage = 1;
    let totalPages = 1;
    let stepTimers = [];
    let hideBadgeTimeout = null;

    document.addEventListener('DOMContentLoaded', initializeAvadaKedavra);

    function initializeAvadaKedavra() {
        const refreshBtn = document.getElementById('btnRefreshLogs');
        const searchInput = document.getElementById('clientSearch');
        const toggleServerBtn = document.getElementById('btnToggleServer');
        const serverBadge = document.getElementById('avadaKedavraMetaBadge');

        // Khởi tạo nhãn máy chủ ban đầu
        updateServerBadgeUI(currentServer);

        // Khởi tạo nút bấm giữ 3 giây (Hold 3s)
        initAvadaHoldButton();

        // Đảm bảo clientSearch luôn luôn enable, không bị main.js vô hiệu hóa
        ensureClientSearchEnabled();
        window.updateClientSearchState = function () {
            ensureClientSearchEnabled();
        };
        window.customClientSearchHandler = function (keyword) {
            applyClientSearch(keyword);
        };
        setTimeout(ensureClientSearchEnabled, 50);
        setTimeout(ensureClientSearchEnabled, 250);

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                fetchStatusAndLogs(true, false);
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
        fetchStatusAndLogs(false, false);
    }

    /**
     * Cập nhật giao diện badge máy chủ đích
     */
    function updateServerBadgeUI(server) {
        const labelEl = document.getElementById('currentServerLabel');
        const btnTextEl = document.getElementById('btnToggleServerText');
        const btnEl = document.getElementById('btnToggleServer');
        const serverBadge = document.getElementById('avadaKedavraMetaBadge');

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
        localStorage.setItem('ak_selected_server', currentServer);
        updateServerBadgeUI(currentServer);

        // Nạp lại trạng thái máy chủ mới với thông báo toast
        fetchStatusAndLogs(false, true);
    }

    /**
     * Tải trạng thái máy chủ và danh sách log
     */
    async function fetchStatusAndLogs(showToast = false, isSwitchingServer = false) {
        if (showToast) {
            showStepBadge(`Đang làm mới dữ liệu (${currentServer})...`, 'sync', 'progress');
        } else if (isSwitchingServer) {
            showStepBadge(`Đang kiểm tra root@${currentServer}...`, 'dns', 'progress');
        }

        try {
            const res = await fetch(`/api/avada-kedavra/status?server=${encodeURIComponent(currentServer)}`);
            const data = await res.json();

            if (data.success) {
                const status = data.status || {};
                isAvadaKedavraActive = !!status.is_active;
                updateStatusUI(isAvadaKedavraActive);

                allLogs = data.logs || [];
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
                if (showToast || isSwitchingServer) {
                    showStepBadge(`Lỗi kiểm tra root@${currentServer}`, 'error', 'error');
                    hideStepBadgeAfterDelay(5000);
                    if (typeof Toast !== 'undefined') {
                        Toast.error('Lỗi', data.message || `Không thể kiểm tra trạng thái máy chủ ${currentServer}`);
                    }
                }
            }
        } catch (err) {
            console.error('[AVADA_KEDAVRA] Lỗi khi tải trạng thái:', err);
            if (showToast || isSwitchingServer) {
                showStepBadge(`Lỗi kết nối root@${currentServer}`, 'error', 'error');
                hideStepBadgeAfterDelay(5000);
                if (typeof Toast !== 'undefined') {
                    Toast.error('Lỗi', `Lỗi kết nối khi tải trạng thái máy chủ ${currentServer}`);
                }
            }
        } finally {
            ensureClientSearchEnabled();
        }
    }

    /**
     * Cập nhật giao diện Trạng thái & Button
     * - Trạng thái: Strict Mode -> Button: Kích hoạt
     * - Trạng thái: Hắc ám -> Button: Ngưng kích hoạt
     */
    function updateStatusUI(isActive) {
        const btn = document.getElementById('btnAvadaKedavraToggle') || document.getElementById('btnDarkMagicToggle');
        const btnText = document.getElementById('avadaKedavraBtnText') || document.getElementById('darkMagicBtnText');
        const statusPill = document.getElementById('avadaKedavraStatusPill') || document.getElementById('darkMagicStatusPill');
        const statusText = document.getElementById('statusText');

        if (btn) {
            btn.classList.remove('is-active', 'is-inactive', 'is-loading');
            if (isActive) {
                btn.classList.add('is-active');
                if (btnText) btnText.textContent = 'Ngưng kích hoạt';
            } else {
                btn.classList.add('is-inactive');
                if (btnText) btnText.textContent = 'Kích hoạt';
            }
        }

        if (statusPill && statusText) {
            statusPill.classList.remove('status-active', 'status-inactive');
            if (isActive) {
                statusPill.classList.add('status-active');
                statusText.textContent = 'Trạng thái: Hắc ám';
            } else {
                statusPill.classList.add('status-inactive');
                statusText.textContent = 'Trạng thái: Strict Mode';
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
            iconEl.textContent = icon;
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
     * Tương tự cơ chế của btnSaveHold, không hiển thị confirmation modal
     */
    function initAvadaHoldButton() {
        const btn = document.getElementById('btnAvadaKedavraToggle') || document.getElementById('btnDarkMagicToggle');
        const progressBar = document.getElementById('avadaHoldProgressBar');
        if (!btn || !progressBar) return;

        function startHold(e) {
            if (e.button !== 0 && e.type !== 'touchstart') return; // Chỉ chuột trái hoặc cảm ứng
            if (isLoading) return;
            e.preventDefault();

            holdStartTime = performance.now();

            function updateProgress(now) {
                const elapsed = now - holdStartTime;
                const pct = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
                progressBar.style.width = `${pct}%`;

                if (elapsed >= HOLD_DURATION_MS) {
                    cancelHold();
                    executeToggleAvadaKedavra();
                } else {
                    holdAnimFrame = requestAnimationFrame(updateProgress);
                }
            }

            holdAnimFrame = requestAnimationFrame(updateProgress);
        }

        function cancelHold() {
            if (holdAnimFrame) {
                cancelAnimationFrame(holdAnimFrame);
                holdAnimFrame = null;
            }
            holdStartTime = null;
            if (progressBar) progressBar.style.width = '0%';
        }

        btn.addEventListener('mousedown', startHold);
        btn.addEventListener('touchstart', startHold, { passive: false });

        btn.addEventListener('mouseup', cancelHold);
        btn.addEventListener('mouseleave', cancelHold);
        btn.addEventListener('touchend', cancelHold);
        btn.addEventListener('touchcancel', cancelHold);
    }

    /**
     * Thực thi Kích hoạt / Ngưng kích hoạt sau khi giữ đủ 3 giây
     */
    async function executeToggleAvadaKedavra() {
        if (isLoading) return;

        const targetAction = isAvadaKedavraActive ? 'deactivate' : 'activate';
        const actionLabel = (targetAction === 'activate') ? 'kích hoạt' : 'ngưng kích hoạt';

        // Bắt đầu thực thi trực tiếp, không qua customModal
        setLoadingState(true, targetAction);
        clearStepTimers();

        // Bước 1: Kết nối tới root@<currentServer>
        showStepBadge(`1. Kết nối root@${currentServer}...`, 'dns', 'progress');

        // Lên lịch các bước chuyển tiếp trực quan trong khi API xử lý
        stepTimers.push(setTimeout(() => {
            if (isLoading) {
                showStepBadge('2. Sửa file docker-compose.yml...', 'edit_document', 'progress');
            }
        }, 1200));

        stepTimers.push(setTimeout(() => {
            if (isLoading) {
                showStepBadge('3. Restart container MES...', 'restart_alt', 'progress');
            }
        }, 2800));

        stepTimers.push(setTimeout(() => {
            if (isLoading) {
                showStepBadge('4. Kiểm tra Docker PS...', 'deployed_code', 'progress');
            }
        }, 8500));

        try {
            const res = await fetch('/api/avada-kedavra/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: targetAction, server: currentServer })
            });

            const data = await res.json();
            clearStepTimers();

            if (data.success) {
                isAvadaKedavraActive = !!data.is_active;

                // Cập nhật giao diện Trạng thái & Button
                updateStatusUI(isAvadaKedavraActive);

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
            console.error('[AVADA_KEDAVRA] Lỗi thực thi toggle:', err);
            showStepBadge(`Lỗi: ${err.message || 'Lỗi kết nối'}`, 'error', 'error');
            hideStepBadgeAfterDelay(5000);

            if (typeof Toast !== 'undefined') {
                Toast.error('Lỗi', err.message || `Lỗi kết nối khi gửi yêu cầu tới ${currentServer}`);
            }
        } finally {
            setLoadingState(false, targetAction);
        }
    }

    /**
     * Hiển thị trạng thái đang xử lý trên nút bấm
     * - Bấm Kích hoạt -> Đang kích hoạt...
     * - Bấm Ngưng kích hoạt -> Đang xử lý...
     */
    function setLoadingState(loading, targetAction) {
        isLoading = loading;
        const btn = document.getElementById('btnAvadaKedavraToggle') || document.getElementById('btnDarkMagicToggle');
        const btnText = document.getElementById('avadaKedavraBtnText') || document.getElementById('darkMagicBtnText');
        const progressBar = document.getElementById('avadaHoldProgressBar');

        if (progressBar) {
            progressBar.style.width = '0%';
        }

        if (btn) {
            if (loading) {
                btn.classList.add('is-loading');
                if (btnText) {
                    btnText.textContent = (targetAction === 'activate') ? 'Đang kích hoạt...' : 'Đang xử lý...';
                }
            } else {
                btn.classList.remove('is-loading');
                if (btnText) {
                    btnText.textContent = isAvadaKedavraActive ? 'Ngưng kích hoạt' : 'Kích hoạt';
                }
            }
        }
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
        const page0 = Math.max(0, currentPage - 1);
        const startIdx = page0 * PAGE_SIZE;
        const endIdx = startIdx + PAGE_SIZE;
        const pageRows = filteredLogs.slice(startIdx, endIdx);

        renderTable(pageRows);

        const rowCountEl = document.getElementById('rowCount');
        if (rowCountEl) {
            rowCountEl.textContent = filteredLogs.length.toLocaleString();
        }

        const tableFooter = document.querySelector('.table-footer');
        if (tableFooter) {
            if (filteredLogs.length > 0) {
                tableFooter.classList.remove('hidden');
            } else {
                tableFooter.classList.add('hidden');
            }
        }

        const paginationNav = document.getElementById('paginationNav');
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

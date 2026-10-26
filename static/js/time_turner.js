/**
 * ==============================================================================
 * KDMES TOOL — TIME TURNER CONTROLLER
 * Quản lý & Hiển thị Nhật ký in lại tem (reprint_label_log.txt)
 * Hiển thị bảng dạng chuẩn đồng bộ hoàn toàn với Postgres Deleted Data
 * Hỗ trợ Phân trang (30 dòng/trang), Tìm kiếm toàn cục, Xuất Excel
 * ==============================================================================
 */

(function () {
    'use strict';

    let allLogRecords = [];
    let currentFilteredRecords = [];
    const tableColumns = ['Thời gian in (UTC+7)', 'IP', 'Người in', 'Barcode', 'Ghi chú'];
    const PAGE_SIZE = 30;
    let currentPage = 1;
    let totalPages = 1;
    let clientSearchDebounceTimer = null;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTimeTurner);
    } else {
        initTimeTurner();
    }

    function initTimeTurner() {
        ensureClientSearchAlwaysEnabled();
        initControls();
        setupExportHook();
        fetchLogRecords();
    }

    /**
     * Đảm bảo ô ClientSearch KHÔNG BAO GIỜ bị disable dưới mọi tình huống
     */
    function ensureClientSearchAlwaysEnabled() {
        const clientSearchInput = document.getElementById('clientSearch');
        if (!clientSearchInput) return;

        clientSearchInput.disabled = false;
        clientSearchInput.removeAttribute('disabled');

        try {
            Object.defineProperty(clientSearchInput, 'disabled', {
                get: () => false,
                set: () => false,
                configurable: true
            });
        } catch (e) {}
    }

    // Ghi đè hàm updateClientSearchState của main.js cho trang Time Turner để không bao giờ disable ô tìm kiếm
    window.updateClientSearchState = function () {
        ensureClientSearchAlwaysEnabled();
    };

    function initControls() {
        const btnRefresh = document.getElementById('btnRefresh');
        const clientSearchInput = document.getElementById('clientSearch');

        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => {
                fetchLogRecords();
            });
        }

        if (clientSearchInput) {
            clientSearchInput.addEventListener('input', () => {
                clearTimeout(clientSearchDebounceTimer);
                clientSearchDebounceTimer = setTimeout(() => {
                    applyFilters(true);
                }, 150);
            });
        }

        // Hook global customClientSearchHandler if main.js calls it
        window.customClientSearchHandler = function () {
            applyFilters(true);
        };
    }

    function setupExportHook() {
        window.getPageExportData = function () {
            const rows = (currentFilteredRecords || []).map((rec) => [
                rec.timestamp || '',
                rec.ip || '',
                rec.username || '',
                rec.barcode || '',
                rec.note || 'Thành công'
            ]);

            const nowStr = typeof getVietnamTimestamp === 'function' 
                ? getVietnamTimestamp() 
                : new Date().toISOString().slice(0, 10);

            return {
                rows: rows,
                columns: tableColumns,
                filename: `Time_Turner_Reprint_Log_${nowStr}.xlsx`,
                sheetName: 'Reprint_Log'
            };
        };
    }

    async function fetchLogRecords() {
        const btnRefresh = document.getElementById('btnRefresh');
        const refreshIcon = document.getElementById('btnRefreshIcon');
        const tableBody = document.getElementById('tableBody');

        if (btnRefresh) btnRefresh.disabled = true;
        if (refreshIcon) refreshIcon.classList.add('time-turner-spin');

        if (typeof showTableSkeleton === 'function') {
            showTableSkeleton(5, 5);
        } else if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 36px 16px; color: var(--color-text-muted, #94a3b8);">
                        <span class="material-symbols-outlined time-turner-spin" style="font-size: 28px; vertical-align: middle;">sync</span>
                        <span style="margin-left: 8px;">Đang tải dữ liệu nhật ký in tem...</span>
                    </td>
                </tr>
            `;
        }

        try {
            const res = await fetch('/api/time-turner/get-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            const data = await res.json();
            if (data && data.success) {
                allLogRecords = Array.isArray(data.records) ? data.records : [];
            } else {
                allLogRecords = [];
                const errMsg = (data && data.message) || 'Không thể đọc file log';
                if (typeof showToast === 'function') showToast(errMsg, 'error');
            }
        } catch (err) {
            console.error('[TimeTurner] Fetch log error:', err);
            allLogRecords = [];
            if (typeof showToast === 'function') {
                showToast('Lỗi kết nối máy chủ khi đọc nhật ký in tem', 'error');
            }
        } finally {
            if (btnRefresh) btnRefresh.disabled = false;
            if (refreshIcon) refreshIcon.classList.remove('time-turner-spin');
            ensureClientSearchAlwaysEnabled();
            applyFilters(false);
            document.body.classList.remove('app-loading-state');
        }
    }

    function applyFilters(resetToFirstPage = true) {
        const clientSearchInput = document.getElementById('clientSearch');
        const searchVal = (clientSearchInput ? clientSearchInput.value : '').trim().toLowerCase();

        currentFilteredRecords = allLogRecords.filter(item => {
            if (!searchVal) return true;

            const itemId = String(item.id || item.line_no || '');
            const itemBarcode = (item.barcode || '').toLowerCase();
            const itemIp = (item.ip || '').toLowerCase();
            const itemUser = (item.username || '').toLowerCase();
            const itemTime = (item.timestamp || '').toLowerCase();
            const itemNote = (item.note || '').toLowerCase();
            const combined = `${itemId} ${itemTime} ${itemIp} ${itemUser} ${itemBarcode} ${itemNote}`;

            return combined.includes(searchVal);
        });

        // Cập nhật dữ liệu toàn cục để tương thích hệ thống
        if (typeof rawTableData !== 'undefined') {
            rawTableData = currentFilteredRecords;
            rawTableColumns = tableColumns;
        }
        if (typeof filteredTableData !== 'undefined') {
            filteredTableData = currentFilteredRecords;
        }

        totalPages = Math.max(1, Math.ceil(currentFilteredRecords.length / PAGE_SIZE));
        if (resetToFirstPage) {
            currentPage = 1;
        } else {
            currentPage = Math.min(Math.max(1, currentPage), totalPages);
        }

        renderCurrentPage();
        ensureClientSearchAlwaysEnabled();
    }

    function renderCurrentPage() {
        const rowCount = document.getElementById('rowCount');
        const tableFooter = document.querySelector('.table-footer');
        const paginationNav = document.getElementById('paginationNav');

        const totalRecords = currentFilteredRecords.length;
        if (rowCount) {
            rowCount.textContent = totalRecords.toLocaleString('vi-VN');
        }

        if (tableFooter) {
            if (totalRecords > 0) {
                tableFooter.classList.remove('hidden');
            } else {
                tableFooter.classList.add('hidden');
            }
        }

        if (totalRecords === 0) {
            if (typeof displayTable === 'function') {
                displayTable([], tableColumns);
            }
            if (paginationNav) paginationNav.innerHTML = '';
            ensureClientSearchAlwaysEnabled();
            return;
        }

        const startIndex = (currentPage - 1) * PAGE_SIZE;
        const pageRecords = currentFilteredRecords.slice(startIndex, startIndex + PAGE_SIZE);

        const pageRows = pageRecords.map((item) => [
            item.timestamp || '-',
            item.ip || 'Unknown',
            item.username || 'Unknown',
            item.barcode || '-',
            item.note || 'Thành công'
        ]);

        if (typeof displayTable === 'function') {
            displayTable(pageRows, tableColumns);
        }

        // Render phân trang đồng bộ với Postgres Deleted Data
        if (paginationNav) {
            if (typeof renderShadcnPagination === 'function') {
                renderShadcnPagination(paginationNav, currentPage, totalPages, (newPage) => {
                    currentPage = Math.min(Math.max(1, newPage), totalPages);
                    renderCurrentPage();
                    const tableScroll = document.querySelector('.table-scroll');
                    if (tableScroll) tableScroll.scrollTop = 0;
                });
            } else {
                renderSimplePagination(paginationNav);
            }
        }

        ensureClientSearchAlwaysEnabled();
    }

    function renderSimplePagination(container) {
        if (!container || totalPages <= 1) {
            if (container) container.innerHTML = '';
            return;
        }

        container.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <button type="button" class="winx-btn winx-btn-ghost" style="padding: 4px 10px; font-size: 12px;" ${currentPage <= 1 ? 'disabled' : ''} id="btnPrevPage">
                    Trước
                </button>
                <span style="font-size: 13px; color: #cbd5e1;">Trang ${currentPage} / ${totalPages}</span>
                <button type="button" class="winx-btn winx-btn-ghost" style="padding: 4px 10px; font-size: 12px;" ${currentPage >= totalPages ? 'disabled' : ''} id="btnNextPage">
                    Sau
                </button>
            </div>
        `;

        const prev = document.getElementById('btnPrevPage');
        const next = document.getElementById('btnNextPage');
        if (prev) {
            prev.addEventListener('click', () => {
                if (currentPage > 1) {
                    currentPage--;
                    renderCurrentPage();
                }
            });
        }
        if (next) {
            next.addEventListener('click', () => {
                if (currentPage < totalPages) {
                    currentPage++;
                    renderCurrentPage();
                }
            });
        }
    }


    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

})();

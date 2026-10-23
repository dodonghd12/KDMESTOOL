/**
 * ==============================================================================
 * KDMES TOOL — TIME TURNER CONTROLLER
 * Quản lý & Hiển thị Nhật ký in lại tem (reprint_label_log.txt)
 * Hỗ trợ Phân trang (30 dòng/trang), Lọc Barcode & Tìm kiếm toàn cục, Xuất Excel
 * ==============================================================================
 */

(function () {
    'use strict';

    let allLogRecords = [];
    let currentFilteredRecords = [];
    const PAGE_SIZE = 30;
    let currentPage = 1;
    let totalPages = 1;
    let barcodeDebounceTimer = null;
    let clientSearchDebounceTimer = null;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTimeTurner);
    } else {
        initTimeTurner();
    }

    function initTimeTurner() {
        initControls();
        setupExportHook();
        fetchLogRecords();
    }

    function initControls() {
        const btnRefresh = document.getElementById('btnRefresh');
        const barcodeInput = document.getElementById('barcode');
        const clientSearchInput = document.getElementById('clientSearch');

        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => {
                fetchLogRecords();
            });
        }

        if (barcodeInput) {
            barcodeInput.addEventListener('input', () => {
                clearTimeout(barcodeDebounceTimer);
                barcodeDebounceTimer = setTimeout(() => {
                    applyFilters(true);
                }, 250);
            });

            barcodeInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    clearTimeout(barcodeDebounceTimer);
                    applyFilters(true);
                }
            });
        }

        if (clientSearchInput) {
            clientSearchInput.addEventListener('input', () => {
                clearTimeout(clientSearchDebounceTimer);
                clientSearchDebounceTimer = setTimeout(() => {
                    applyFilters(true);
                }, 200);
            });
        }

        // Hook global customClientSearchHandler if main.js calls it
        window.customClientSearchHandler = function () {
            applyFilters(true);
        };
    }

    function setupExportHook() {
        window.getPageExportData = function () {
            const rows = (currentFilteredRecords || []).map((rec, idx) => ({
                'STT': idx + 1,
                'Thời gian in': rec.timestamp || '',
                'IP máy khách': rec.ip || '',
                'Người in': rec.username || '',
                'Mã Barcode': rec.barcode || ''
            }));

            const nowStr = typeof getVietnamTimestamp === 'function' 
                ? getVietnamTimestamp() 
                : new Date().toISOString().slice(0, 10);

            return {
                rows: rows,
                columns: ['STT', 'Thời gian in', 'IP máy khách', 'Người in', 'Mã Barcode'],
                filename: `Time_Turner_Reprint_Log_${nowStr}.xlsx`,
                sheetName: 'Reprint_Log'
            };
        };
    }

    async function fetchLogRecords() {
        const btnRefresh = document.getElementById('btnRefresh');
        const refreshIcon = document.getElementById('btnRefreshIcon');
        const tableBody = document.getElementById('tableBody');
        const logStatusText = document.getElementById('logStatusText');
        const logStatusDot = document.getElementById('logStatusDot');

        if (btnRefresh) btnRefresh.disabled = true;
        if (refreshIcon) refreshIcon.classList.add('time-turner-spin');

        if (typeof showTableSkeleton === 'function') {
            showTableSkeleton(6, 6);
        } else if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 36px 16px; color: #94a3b8;">
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
                if (logStatusText) {
                    logStatusText.textContent = `reprint_label_log.txt (${allLogRecords.length} lượt)`;
                }
                if (logStatusDot) {
                    logStatusDot.style.background = '#10b981';
                }
            } else {
                allLogRecords = [];
                const errMsg = (data && data.message) || 'Không thể đọc file log';
                if (typeof showToast === 'function') showToast(errMsg, 'error');
                if (logStatusText) logStatusText.textContent = 'Lỗi file log';
                if (logStatusDot) logStatusDot.style.background = '#ef4444';
            }
        } catch (err) {
            console.error('[TimeTurner] Fetch log error:', err);
            allLogRecords = [];
            if (typeof showToast === 'function') {
                showToast('Lỗi kết nối máy chủ khi đọc nhật ký in tem', 'error');
            }
            if (logStatusText) logStatusText.textContent = 'Mất kết nối log';
            if (logStatusDot) logStatusDot.style.background = '#ef4444';
        } finally {
            if (btnRefresh) btnRefresh.disabled = false;
            if (refreshIcon) refreshIcon.classList.remove('time-turner-spin');
            applyFilters(false);
        }
    }

    function applyFilters(resetToFirstPage = true) {
        const barcodeInput = document.getElementById('barcode');
        const clientSearchInput = document.getElementById('clientSearch');

        const barcodeVal = (barcodeInput ? barcodeInput.value : '').trim().toLowerCase();
        const searchVal = (clientSearchInput ? clientSearchInput.value : '').trim().toLowerCase();

        currentFilteredRecords = allLogRecords.filter(item => {
            const itemBarcode = (item.barcode || '').toLowerCase();
            const itemIp = (item.ip || '').toLowerCase();
            const itemUser = (item.username || '').toLowerCase();
            const itemTime = (item.timestamp || '').toLowerCase();

            // Lọc theo Barcode
            if (barcodeVal && !itemBarcode.includes(barcodeVal)) {
                return false;
            }

            // Lọc theo ô Client Search
            if (searchVal) {
                const combined = `${itemTime} ${itemIp} ${itemUser} ${itemBarcode}`;
                if (!combined.includes(searchVal)) {
                    return false;
                }
            }

            return true;
        });

        totalPages = Math.max(1, Math.ceil(currentFilteredRecords.length / PAGE_SIZE));
        if (resetToFirstPage) {
            currentPage = 1;
        } else {
            currentPage = Math.min(Math.max(1, currentPage), totalPages);
        }

        renderCurrentPage();
    }

    function renderCurrentPage() {
        const tableBody = document.getElementById('tableBody');
        const rowCount = document.getElementById('rowCount');
        const tableFooter = document.querySelector('.table-footer');
        const paginationNav = document.getElementById('paginationNav');

        if (!tableBody) return;

        const totalRecords = currentFilteredRecords.length;
        if (rowCount) rowCount.textContent = totalRecords.toLocaleString('vi-VN');

        if (tableFooter) {
            tableFooter.classList.remove('hidden');
        }

        if (totalRecords === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px 16px; color: #94a3b8;">
                        <span class="material-symbols-outlined" style="font-size: 32px; display: block; margin-bottom: 8px; color: #64748b;">hourglass_disabled</span>
                        <span>Không tìm thấy bản ghi nhật ký in tem nào phù hợp</span>
                    </td>
                </tr>
            `;
            if (paginationNav) paginationNav.innerHTML = '';
            return;
        }

        const startIndex = (currentPage - 1) * PAGE_SIZE;
        const pageRecords = currentFilteredRecords.slice(startIndex, startIndex + PAGE_SIZE);

        let html = '';
        pageRecords.forEach((item, idx) => {
            const stt = startIndex + idx + 1;
            const barcodeSafe = escapeHtml(item.barcode || '');
            const ipSafe = escapeHtml(item.ip || 'Unknown');
            const userSafe = escapeHtml(item.username || 'Unknown');
            const timeSafe = escapeHtml(item.timestamp || '-');

            html += `
                <tr>
                    <td style="text-align: center; color: #94a3b8; font-weight: 500;">${stt}</td>
                    <td style="white-space: nowrap; color: #e2e8f0; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 13px;">
                        <span class="material-symbols-outlined" style="font-size: 15px; vertical-align: -2px; margin-right: 4px; color: #94a3b8;">schedule</span>
                        ${timeSafe}
                    </td>
                    <td>
                        <span class="time-turner-badge time-turner-badge-ip">
                            <span class="material-symbols-outlined" style="font-size: 14px;">lan</span>
                            ${ipSafe}
                        </span>
                    </td>
                    <td>
                        <span class="time-turner-badge time-turner-badge-user">
                            <span class="material-symbols-outlined" style="font-size: 14px;">person</span>
                            ${userSafe}
                        </span>
                    </td>
                    <td>
                        <div class="time-turner-barcode-cell" title="Nhấp để sao chép mã Barcode" data-barcode="${barcodeSafe}">
                            <span class="material-symbols-outlined" style="font-size: 16px; color: #38bdf8;">barcode_reader</span>
                            <span>${barcodeSafe}</span>
                        </div>
                    </td>
                    <td style="text-align: center;">
                        <div style="display: inline-flex; align-items: center; gap: 6px;">
                            <button type="button" class="time-turner-btn-action btn-copy-barcode" title="Sao chép Barcode" data-barcode="${barcodeSafe}">
                                <span class="material-symbols-outlined" style="font-size: 16px;">content_copy</span>
                            </button>
                            <a href="/reprint-label?barcode=${encodeURIComponent(barcodeSafe)}" target="_blank" class="time-turner-btn-action" title="Mở trang In lại tem">
                                <span class="material-symbols-outlined" style="font-size: 16px;">print</span>
                            </a>
                        </div>
                    </td>
                </tr>
            `;
        });

        tableBody.innerHTML = html;

        // Gắn sự kiện copy barcode
        tableBody.querySelectorAll('.time-turner-barcode-cell, .btn-copy-barcode').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const code = el.getAttribute('data-barcode');
                if (code) {
                    copyToClipboardText(code);
                }
            });
        });

        // Render phân trang
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

    function copyToClipboardText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                if (typeof showToast === 'function') {
                    showToast(`Đã sao chép: ${text}`, 'success');
                }
            }).catch(() => fallbackCopy(text));
        } else {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            if (typeof showToast === 'function') {
                showToast(`Đã sao chép: ${text}`, 'success');
            }
        } catch (e) {
            console.error('Copy failed:', e);
        }
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
})();

/**
 * KDMES TOOL — Check KD Account Controller
 * Real-time Account & Password Inspector querying kvmes.account & kvmes.user
 * Integrated with Live Client Search, Password Decryption Resolver, and Standard Excel Export
 */

(function () {
    let allAccountRecords = [];
    let currentFilteredRecords = [];
    let searchDebounceTimeout = null;
    let isFetchingAccounts = false;
    let lastQueryTerm = '';

    document.addEventListener('DOMContentLoaded', () => {
        if (typeof showAbout === 'function') {
            document.addEventListener('sidebar:about', showAbout);
        }

        const accountInp = document.getElementById('accountIdInput');
        const exportBtn = document.getElementById('exportExcelBtn');

        if (accountInp) {
            // Live debounced search when user types
            accountInp.addEventListener('input', () => {
                if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);
                searchDebounceTimeout = setTimeout(() => {
                    const query = accountInp.value.trim();
                    if (query !== lastQueryTerm) {
                        fetchAccountRecords(query, false);
                    }
                }, 280);
            });

            // Instant search on Enter key
            accountInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);
                    fetchAccountRecords(accountInp.value.trim(), true);
                }
            });

            // Focus on load
            setTimeout(() => {
                if (document.activeElement !== accountInp && (!document.activeElement || document.activeElement.tagName === 'BODY')) {
                    accountInp.focus();
                }
            }, 100);
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', (e) => {
                e.preventDefault();
                exportAccountListToExcel();
            });
        }

        initCheckAccountClientSearch();
    });

    // ── 1. API CALL & DATA FETCHING ─────────────────────────────────────────────
    async function fetchAccountRecords(query, isManualSubmit = false) {
        if (isFetchingAccounts) return;
        lastQueryTerm = query;

        const container = document.getElementById('checkAccountTableContainer');
        const tbody = document.getElementById('checkAccountTableBody');
        const rowCount = document.getElementById('rowCount');

        if (!query) {
            allAccountRecords = [];
            currentFilteredRecords = [];
            if (container) container.style.display = 'none';
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; padding: 48px 16px; color: var(--color-text-muted);">
                            <span class="material-symbols-outlined" style="font-size: 36px; opacity: 0.4; display: block; margin-bottom: 8px;">search</span>
                            <span>Nhập tên tài khoản để bắt đầu tra cứu</span>
                        </td>
                    </tr>
                `;
            }
            if (rowCount) rowCount.textContent = '0';
            return;
        }

        isFetchingAccounts = true;
        if (typeof showLoading === 'function') showLoading();

        try {
            const res = await fetch('/api/account/check-kd-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ account_id: query })
            });

            let data = null;
            try {
                data = await res.json();
            } catch (e) {
                if (typeof isUnauthorizedResponse === 'function' && isUnauthorizedResponse(res.status, null)) {
                    if (typeof showAuthExpiredModal === 'function') showAuthExpiredModal();
                    throw new Error('Phiên đăng nhập đã hết hạn');
                }
                if (!res.ok) throw new Error(`Lỗi máy chủ (${res.status})`);
            }

            if (typeof isUnauthorizedResponse === 'function' && isUnauthorizedResponse(res.status, data)) {
                if (typeof showAuthExpiredModal === 'function') showAuthExpiredModal(data ? data.message : null);
                throw new Error(data ? data.message : 'Unauthorized');
            }

            if (!data || !data.success) {
                throw new Error(data ? data.message : 'Không nhận được dữ liệu từ máy chủ');
            }

            allAccountRecords = data.result || [];
            if (container) container.style.display = 'flex';
            applyClientFilter();

            if (isManualSubmit) {
                if (allAccountRecords.length > 0) {
                    Toast.success('Thành công', `Tìm thấy ${allAccountRecords.length} tài khoản khớp với "${query}"`);
                } else {
                    Toast.warning('Không có kết quả', `Không tìm thấy tài khoản nào khớp với "${query}"`);
                }
            }

        } catch (err) {
            console.error('Lỗi khi tra cứu tài khoản:', err);
            Toast.error('Lỗi tra cứu', err.message || 'Không thể kết nối đến máy chủ');
            if (container) container.style.display = 'flex';
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; padding: 48px 16px; color: #f87171;">
                            <span class="material-symbols-outlined" style="font-size: 36px; opacity: 0.7; display: block; margin-bottom: 8px;">error</span>
                            <span>${err.message || 'Lỗi kết nối cơ sở dữ liệu'}</span>
                        </td>
                    </tr>
                `;
            }
            if (rowCount) rowCount.textContent = '0';
        } finally {
            isFetchingAccounts = false;
            if (typeof hideLoading === 'function') hideLoading();
        }
    }

    // ── 2. CLIENT SEARCH FILTERING ──────────────────────────────────────────────
    function initCheckAccountClientSearch() {
        const clientSearchInp = document.getElementById('clientSearch');
        if (!clientSearchInp) return;

        clientSearchInp.disabled = false;
        clientSearchInp.removeAttribute('disabled');

        clientSearchInp.addEventListener('input', () => {
            applyClientFilter();
        });

        window.customClientSearchHandler = function () {
            applyClientFilter();
        };

        window.updateClientSearchState = function () {
            if (clientSearchInp) {
                clientSearchInp.disabled = false;
                clientSearchInp.removeAttribute('disabled');
            }
        };
    }

    function applyClientFilter() {
        const clientSearchInp = document.getElementById('clientSearch');
        const term = clientSearchInp ? clientSearchInp.value.trim().toLowerCase() : '';

        if (!term) {
            currentFilteredRecords = [...allAccountRecords];
        } else {
            currentFilteredRecords = allAccountRecords.filter(item => {
                return (
                    String(item.id || '').toLowerCase().includes(term) ||
                    String(item.password || '').toLowerCase().includes(term) ||
                    String(item.roles || '').toLowerCase().includes(term) ||
                    String(item.department_id || '').toLowerCase().includes(term) ||
                    String(item.active_directory_account || '').toLowerCase().includes(term)
                );
            });
        }

        renderTableBody();
    }

    // ── 3. RENDER TABLE ROWS ────────────────────────────────────────────────────
    function renderTableBody() {
        const tbody = document.getElementById('checkAccountTableBody');
        const rowCount = document.getElementById('rowCount');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!currentFilteredRecords.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="5" style="text-align: center; padding: 48px 16px; color: var(--color-text-muted);">
                    <span class="material-symbols-outlined" style="font-size: 36px; opacity: 0.4; display: block; margin-bottom: 8px;">search_off</span>
                    <span>${allAccountRecords.length > 0 ? 'Không tìm thấy kết quả nào khớp với bộ lọc' : 'Không tìm thấy tài khoản nào khớp với từ khóa'}</span>
                </td>
            `;
            tbody.appendChild(tr);
            if (rowCount) rowCount.textContent = '0';
            return;
        }

        currentFilteredRecords.forEach((row) => {
            const tr = document.createElement('tr');
            
            // Password display with clean styling (null displayed as '-')
            const isPlain = row.password && row.password !== '-' && row.password !== 'null';
            const displayPwd = isPlain ? row.password : '-';

            tr.innerHTML = `
                <td style="font-weight: 700; color: var(--color-text-primary); font-family: var(--font-family-mono); font-size: 13.5px;">${escapeHtml(row.id)}</td>
                <td style="font-family: var(--font-family-mono); font-size: 13px; color: ${isPlain ? '#38bdf8' : 'var(--color-text-muted)'};">
                    <span class="pwd-val" data-raw="${escapeHtml(displayPwd)}">${escapeHtml(displayPwd)}</span>
                </td>
                <td style="text-align: center;">
                    <span style="display: inline-block; padding: 3px 10px; border-radius: 6px; background: rgba(192, 132, 252, 0.12); color: #c084fc; border: 1px solid rgba(192, 132, 252, 0.3); font-family: var(--font-family-mono); font-weight: 700; font-size: 12.5px;">
                        ${escapeHtml(row.roles || '-')}
                    </span>
                </td>
                <td style="text-align: center; color: #34d399; font-weight: 600; font-family: var(--font-family-mono);">${escapeHtml(row.department_id || '-')}</td>
                <td style="color: var(--color-text-secondary); font-family: var(--font-family-mono);">${escapeHtml(row.active_directory_account || '-')}</td>
            `;

            // Row click selection
            tr.addEventListener('click', () => {
                tbody.querySelectorAll('tr.selected').forEach(el => el.classList.remove('selected'));
                tr.classList.add('selected');
            });

            tbody.appendChild(tr);
        });

        if (rowCount) {
            rowCount.textContent = currentFilteredRecords.length.toLocaleString();
        }
    }

    // ── 4. EXPORT EXCEL ─────────────────────────────────────────────────────────
    async function exportAccountListToExcel() {
        if (!currentFilteredRecords.length) {
            Toast.warning('Cảnh báo', 'Không có dữ liệu tài khoản để xuất Excel');
            return;
        }

        const confirmed = (typeof showConfirm === 'function')
            ? await showConfirm('Bạn có chắc chắn muốn xuất dữ liệu tài khoản ra file Excel?')
            : confirm('Bạn có chắc chắn muốn xuất dữ liệu tài khoản ra file Excel?');
        if (!confirmed) return;

        try {
            const wsData = [
                ['Tài Khoản (id)', 'Mật Khẩu (password)', 'Phân Quyền (roles)', 'Bộ Phận (department_id)', 'Active Directory (active_directory_account)']
            ];

            currentFilteredRecords.forEach((r) => {
                wsData.push([
                    r.id,
                    r.password || '-',
                    r.roles || '-',
                    r.department_id || '-',
                    r.active_directory_account || '-'
                ]);
            });

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, 'TaiKhoanMES');

            const dateStr = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, `danh_sach_tai_khoan_kdmes_${dateStr}.xlsx`);
            Toast.success('Thành công', 'Xuất file Excel danh sách tài khoản thành công!');
        } catch (err) {
            console.error('Lỗi khi xuất Excel:', err);
            Toast.error('Lỗi', 'Không thể tạo file Excel');
        }
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    window.fetchAccountRecords = fetchAccountRecords;
    window.exportAccountListToExcel = exportAccountListToExcel;
})();

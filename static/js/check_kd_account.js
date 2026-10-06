/**
 * ==============================================================================
 * KDMES TOOL — Check KD Account Controller
 * Real-time Account & Password Inspector querying kvmes.account & kvmes.user
 * Features:
 * - Masked / Revealed Passwords with Inline Double-Click Editing (Confirm/Cancel)
 * - Granular Role Badge Management with Remove (x) and Add (+) Popover
 * - 3-Second Hold to Save Button with Progress Animation
 * - Full Undo Support & Client Search Filtering
 * ==============================================================================
 */

(function () {
    // ── 1. ROLE DEFINITIONS & MAPPINGS ──────────────────────────────────────────
    const ROLE_DEFINITIONS = [
        { id: 0, name: "Tài khoản chưa được chỉ định" },
        { id: 1, name: "IT" },
        { id: 2, name: "Chủ quản" },
        { id: 3, name: "Sinh quản" },
        { id: 4, name: "Sinh quản điều động TGCP" },
        { id: 5, name: "Nhân viên test keo nhanh" },
        { id: 6, name: "Nhân viên QLCL" },
        { id: 7, name: "Nhân viên thao tác" },
        { id: 8, name: "Nhân viên vận chuyển" },
        { id: 12, name: "Nhân viên Vi tính" }
    ];

    const ALL_ALLOWED_ROLE_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 12];
    const ROLE_MAP = {};
    ROLE_DEFINITIONS.forEach(r => { ROLE_MAP[r.id] = r.name; });

    function getRoleName(id) {
        const num = Number(id);
        return ROLE_MAP[num] !== undefined ? ROLE_MAP[num] : `Quyền ${id}`;
    }

    // ── 2. STATE VARIABLES ──────────────────────────────────────────────────────
    let allAccountRecords = [];
    let currentFilteredRecords = [];
    let searchDebounceTimeout = null;
    let isFetchingAccounts = false;
    let lastQueryTerm = '';
    let activeRoleDropdown = null;

    // 3-Second Hold to Save State
    let holdStartTime = null;
    let holdAnimFrame = null;
    const HOLD_DURATION_MS = 3000;

    // ── 3. INITIALIZATION ───────────────────────────────────────────────────────
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
        initSaveHoldButton();
        initUndoButton();
        initGlobalClickCloser();
    });

    // ── 4. API CALL & DATA FETCHING ─────────────────────────────────────────────
    async function fetchAccountRecords(query, isManualSubmit = false) {
        if (isFetchingAccounts) return;
        lastQueryTerm = query;

        const container = document.getElementById('checkAccountTableContainer');
        const tbody = document.getElementById('checkAccountTableBody');
        const rowCount = document.getElementById('rowCount');

        // Close any active dropdown
        closeRoleDropdown();

        if (!query) {
            allAccountRecords = [];
            currentFilteredRecords = [];
            checkAndUpdateDirtyState();
            if (container) container.style.display = 'none';
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" style="text-align: center; padding: 48px 16px; color: var(--color-text-muted);">
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

            // Map and initialize record objects
            allAccountRecords = (data.result || []).map(item => {
                let initialRoles = [];
                if (Array.isArray(item.roles_list)) {
                    initialRoles = item.roles_list.map(Number).filter(n => !isNaN(n));
                } else if (typeof item.roles === 'string' && item.roles.startsWith('{')) {
                    initialRoles = item.roles.replace(/[{}]/g, '').split(',').map(x => parseInt(x.trim(), 10)).filter(x => !isNaN(x));
                }
                initialRoles.sort((a, b) => a - b);

                const pwd = item.password !== undefined && item.password !== null ? String(item.password) : '-';

                return {
                    id: String(item.id || '').trim(),
                    department_id: String(item.department_id || '-').trim(),
                    originalPassword: pwd,
                    originalRoles: [...initialRoles],
                    currentPassword: pwd,
                    currentRoles: [...initialRoles],
                    isRevealed: false,
                    isEditingPassword: false,
                    editPasswordValue: pwd,
                    passwordModified: false,
                    rolesModified: false,
                    isDirty: false
                };
            });

            checkAndUpdateDirtyState();
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
                        <td colspan="4" style="text-align: center; padding: 48px 16px; color: #f87171;">
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

    // ── 5. CLIENT SEARCH FILTERING ──────────────────────────────────────────────
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
                const roleNames = item.currentRoles.map(r => getRoleName(r).toLowerCase()).join(' ');
                return (
                    String(item.id || '').toLowerCase().includes(term) ||
                    String(item.currentPassword || '').toLowerCase().includes(term) ||
                    String(item.department_id || '').toLowerCase().includes(term) ||
                    roleNames.includes(term) ||
                    item.currentRoles.some(r => String(r) === term)
                );
            });
        }

        renderTableBody();
    }

    // ── 6. DIRTY STATE CHECK & FOOTER BUTTON VISIBILITY ──────────────────────────
    function checkAndUpdateDirtyState() {
        let hasAnyDirty = false;

        allAccountRecords.forEach(acc => {
            const pwdChanged = acc.currentPassword !== acc.originalPassword;
            const origSorted = [...acc.originalRoles].sort((a, b) => a - b);
            const currSorted = [...acc.currentRoles].sort((a, b) => a - b);
            const rolesChanged = JSON.stringify(origSorted) !== JSON.stringify(currSorted);

            acc.passwordModified = pwdChanged;
            acc.rolesModified = rolesChanged;
            acc.isDirty = pwdChanged || rolesChanged;

            if (acc.isDirty) {
                hasAnyDirty = true;
            }
        });

        const btnSave = document.getElementById('btnSaveHold');
        const btnUndo = document.getElementById('btnUndoChanges');
        if (btnSave) btnSave.style.display = hasAnyDirty ? 'inline-flex' : 'none';
        if (btnUndo) btnUndo.style.display = hasAnyDirty ? 'inline-flex' : 'none';
    }

    // ── 7. RENDER TABLE ROWS ────────────────────────────────────────────────────
    function renderTableBody() {
        const tbody = document.getElementById('checkAccountTableBody');
        const rowCount = document.getElementById('rowCount');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!currentFilteredRecords.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="4" style="text-align: center; padding: 48px 16px; color: var(--color-text-muted);">
                    <span class="material-symbols-outlined" style="font-size: 36px; opacity: 0.4; display: block; margin-bottom: 8px;">search_off</span>
                    <span>${allAccountRecords.length > 0 ? 'Không tìm thấy kết quả nào khớp với bộ lọc' : 'Không tìm thấy tài khoản nào khớp với từ khóa'}</span>
                </td>
            `;
            tbody.appendChild(tr);
            if (rowCount) rowCount.textContent = '0';
            return;
        }

        currentFilteredRecords.forEach((acc) => {
            const tr = document.createElement('tr');
            if (acc.isDirty) {
                tr.style.background = 'rgba(56, 189, 248, 0.04)';
            }

            // ── Cột 1: Tài Khoản ───────────────────
            const tdAcc = document.createElement('td');
            tdAcc.style.cssText = 'font-weight: 700; color: var(--color-text-primary); font-family: var(--font-family-mono); font-size: 13.5px;';
            tdAcc.textContent = acc.id;
            tr.appendChild(tdAcc);

            // ── Cột 2: Mật Khẩu (Blur / Reveal / Inline Edit) ──
            const tdPwd = document.createElement('td');
            tdPwd.style.cssText = 'font-family: var(--font-family-mono); font-size: 13px; position: relative;';

            if (acc.isEditingPassword) {
                const editWrap = document.createElement('div');
                editWrap.style.cssText = 'display: inline-flex; align-items: center; gap: 6px;';

                const inp = document.createElement('input');
                inp.type = 'text';
                inp.value = acc.editPasswordValue;
                inp.style.cssText = 'width: 120px; height: 28px; padding: 0 8px; font-size: 13px; font-family: var(--font-family-mono); border-radius: 4px; border: 1px solid #38bdf8; background: #0f172a; color: #f8fafc; outline: none; box-shadow: 0 0 8px rgba(56, 189, 248, 0.3);';

                // Nút V (Confirm)
                const btnConfirm = document.createElement('button');
                btnConfirm.type = 'button';
                btnConfirm.title = 'Xác nhận đổi mật khẩu';
                btnConfirm.textContent = '✔';
                btnConfirm.style.cssText = 'width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; border: 1px solid #10b981; background: rgba(16, 185, 129, 0.25); color: #34d399; cursor: pointer; font-size: 13px; font-weight: bold; transition: all 0.15s;';
                btnConfirm.addEventListener('mouseenter', () => { btnConfirm.style.background = '#10b981'; btnConfirm.style.color = '#fff'; });
                btnConfirm.addEventListener('mouseleave', () => { btnConfirm.style.background = 'rgba(16, 185, 129, 0.25)'; btnConfirm.style.color = '#34d399'; });

                // Nút X (Cancel / Undo)
                const btnCancel = document.createElement('button');
                btnCancel.type = 'button';
                btnCancel.title = 'Hủy';
                btnCancel.textContent = '✖';
                btnCancel.style.cssText = 'width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; border: 1px solid #ef4444; background: rgba(239, 68, 68, 0.25); color: #f87171; cursor: pointer; font-size: 13px; font-weight: bold; transition: all 0.15s;';
                btnCancel.addEventListener('mouseenter', () => { btnCancel.style.background = '#ef4444'; btnCancel.style.color = '#fff'; });
                btnCancel.addEventListener('mouseleave', () => { btnCancel.style.background = 'rgba(239, 68, 68, 0.25)'; btnCancel.style.color = '#f87171'; });

                const doConfirm = () => {
                    const val = inp.value.trim();
                    acc.currentPassword = val !== '' ? val : acc.originalPassword;
                    acc.isEditingPassword = false;
                    checkAndUpdateDirtyState();
                    renderTableBody();
                };

                const doCancel = () => {
                    acc.isEditingPassword = false;
                    renderTableBody();
                };

                btnConfirm.addEventListener('click', (e) => { e.stopPropagation(); doConfirm(); });
                btnCancel.addEventListener('click', (e) => { e.stopPropagation(); doCancel(); });

                inp.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); doConfirm(); }
                    else if (e.key === 'Escape') { e.preventDefault(); doCancel(); }
                });

                editWrap.appendChild(inp);
                editWrap.appendChild(btnConfirm);
                editWrap.appendChild(btnCancel);
                tdPwd.appendChild(editWrap);

                // Auto-focus input
                setTimeout(() => { inp.focus(); inp.select(); }, 50);

            } else {
                const pwdSpan = document.createElement('span');
                const isPlain = acc.currentPassword && acc.currentPassword !== '-' && acc.currentPassword !== 'null';
                const displayPwd = isPlain ? acc.currentPassword : '-';

                pwdSpan.textContent = displayPwd;

                // Base style with Blur / Revealed transitions
                if (acc.isRevealed) {
                    pwdSpan.style.cssText = `
                        filter: none;
                        color: ${acc.passwordModified ? '#fbbf24' : '#38bdf8'};
                        background: ${acc.passwordModified ? 'rgba(251, 191, 36, 0.12)' : 'rgba(56, 189, 248, 0.1)'};
                        border: 1px solid ${acc.passwordModified ? '#fbbf24' : 'rgba(56, 189, 248, 0.3)'};
                        padding: 2px 8px;
                        border-radius: 5px;
                        cursor: pointer;
                        display: inline-block;
                        user-select: text;
                        font-weight: 600;
                        transition: all 0.2s ease;
                    `;
                    pwdSpan.title = 'Nhấp 1 lần để làm mờ | Nhấp đúp chuột để sửa mật khẩu';
                } else {
                    pwdSpan.style.cssText = `
                        filter: blur(5px);
                        color: ${acc.passwordModified ? '#fbbf24' : '#94a3b8'};
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px dashed ${acc.passwordModified ? '#fbbf24' : 'rgba(255, 255, 255, 0.12)'};
                        padding: 2px 8px;
                        border-radius: 5px;
                        cursor: pointer;
                        display: inline-block;
                        user-select: none;
                        transition: all 0.2s ease;
                    `;
                    pwdSpan.title = 'Nhấp 1 lần để xem mật khẩu';
                }

                // 1 Click: Toggle blur / reveal
                pwdSpan.addEventListener('click', (e) => {
                    e.stopPropagation();
                    acc.isRevealed = !acc.isRevealed;
                    renderTableBody();
                });

                // Double Click: Enter Edit Mode when revealed (Guarded by Security Gate)
                pwdSpan.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    if (acc.isRevealed) {
                        const startEdit = () => {
                            acc.isEditingPassword = true;
                            acc.editPasswordValue = acc.currentPassword === '-' ? '' : acc.currentPassword;
                            renderTableBody();
                        };

                        if (typeof window.ensureAccountSecurityUnlocked === 'function') {
                            window.ensureAccountSecurityUnlocked(startEdit);
                        } else {
                            startEdit();
                        }
                    }
                });

                tdPwd.appendChild(pwdSpan);
            }
            tr.appendChild(tdPwd);

            // ── Cột 3: Bộ Phận ─────────────────────
            const tdDept = document.createElement('td');
            tdDept.style.cssText = 'text-align: center; color: #34d399; font-weight: 600; font-family: var(--font-family-mono); font-size: 13px;';
            tdDept.textContent = acc.department_id || '-';
            tr.appendChild(tdDept);

            // ── Cột 4: Phân Quyền (Roles Badges with x and +) ──
            const tdRoles = document.createElement('td');
            const roleContainer = document.createElement('div');
            roleContainer.style.cssText = 'display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 4px 0;';

            // Render each role badge
            acc.currentRoles.forEach(roleId => {
                const badge = document.createElement('span');
                badge.style.cssText = 'display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 6px; background: rgba(192, 132, 252, 0.12); color: #c084fc; border: 1px solid rgba(192, 132, 252, 0.3); font-size: 12px; font-weight: 600; line-height: 1.3; transition: all 0.15s;';

                // Nút x nhỏ bên trái (Pixel-perfect centered SVG, Guarded by Security Gate)
                const btnRemove = document.createElement('span');
                btnRemove.title = `Xóa quyền "${getRoleName(roleId)}"`;
                btnRemove.style.cssText = 'cursor: pointer; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 50%; background: rgba(239, 68, 68, 0.25); color: #f87171; box-sizing: border-box; flex-shrink: 0; transition: all 0.15s; padding: 0;';
                btnRemove.innerHTML = `<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" style="display: block; pointer-events: none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

                btnRemove.addEventListener('mouseenter', () => {
                    btnRemove.style.background = '#ef4444';
                    btnRemove.style.color = '#ffffff';
                    btnRemove.style.transform = 'scale(1.15)';
                });
                btnRemove.addEventListener('mouseleave', () => {
                    btnRemove.style.background = 'rgba(239, 68, 68, 0.25)';
                    btnRemove.style.color = '#f87171';
                    btnRemove.style.transform = 'scale(1)';
                });

                btnRemove.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const removeRoleAction = () => {
                        acc.currentRoles = acc.currentRoles.filter(r => r !== roleId);
                        checkAndUpdateDirtyState();
                        renderTableBody();
                    };

                    if (typeof window.ensureAccountSecurityUnlocked === 'function') {
                        window.ensureAccountSecurityUnlocked(removeRoleAction);
                    } else {
                        removeRoleAction();
                    }
                });

                const roleText = document.createElement('span');
                roleText.textContent = getRoleName(roleId);

                badge.appendChild(btnRemove);
                badge.appendChild(roleText);
                roleContainer.appendChild(badge);
            });

            // Nút + (Add Role) nếu chưa có đủ 10 roles (Pixel-perfect centered SVG, Guarded by Security Gate)
            const missingRoles = ROLE_DEFINITIONS.filter(r => !acc.currentRoles.includes(r.id));
            if (missingRoles.length > 0) {
                const btnAdd = document.createElement('button');
                btnAdd.type = 'button';
                btnAdd.title = 'Thêm phân quyền cho tài khoản này';
                btnAdd.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 5px; border: 1px dashed rgba(56, 189, 248, 0.5); background: rgba(56, 189, 248, 0.1); color: #38bdf8; cursor: pointer; padding: 0; box-sizing: border-box; flex-shrink: 0; transition: all 0.2s;';
                btnAdd.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display: block; pointer-events: none;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

                btnAdd.addEventListener('mouseenter', () => {
                    btnAdd.style.background = 'rgba(56, 189, 248, 0.25)';
                    btnAdd.style.borderColor = '#38bdf8';
                    btnAdd.style.transform = 'scale(1.08)';
                });
                btnAdd.addEventListener('mouseleave', () => {
                    btnAdd.style.background = 'rgba(56, 189, 248, 0.1)';
                    btnAdd.style.borderColor = 'rgba(56, 189, 248, 0.5)';
                    btnAdd.style.transform = 'scale(1)';
                });

                btnAdd.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const openRoleDropdownAction = () => {
                        showRoleSelectDropdown(btnAdd, acc, missingRoles);
                    };

                    if (typeof window.ensureAccountSecurityUnlocked === 'function') {
                        window.ensureAccountSecurityUnlocked(openRoleDropdownAction);
                    } else {
                        openRoleDropdownAction();
                    }
                });

                roleContainer.appendChild(btnAdd);
            }

            tdRoles.appendChild(roleContainer);
            tr.appendChild(tdRoles);

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

    // ── 8. ROLE SELECTION POPUP DROPDOWN ─────────────────────────────────────────
    function showRoleSelectDropdown(targetBtn, account, availableRoles) {
        closeRoleDropdown();

        const dropdown = document.createElement('div');
        dropdown.className = 'floating-role-dropdown';
        dropdown.style.cssText = `
            position: absolute;
            z-index: 99999;
            background: #0f172a;
            border: 1px solid rgba(56, 189, 248, 0.3);
            border-radius: 8px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(56, 189, 248, 0.15);
            max-height: 240px;
            overflow-y: auto;
            min-width: 230px;
            padding: 4px;
            backdrop-filter: blur(12px);
        `;

        availableRoles.forEach(r => {
            const item = document.createElement('div');
            item.style.cssText = `
                padding: 6px 10px;
                font-size: 12.5px;
                color: #e2e8f0;
                cursor: pointer;
                border-radius: 5px;
                display: flex;
                align-items: center;
                gap: 8px;
                transition: all 0.15s;
            `;
            item.innerHTML = `
                <span style="color: #38bdf8; font-weight: bold; font-family: var(--font-family-mono); font-size: 11px; background: rgba(56, 189, 248, 0.15); padding: 1px 5px; border-radius: 4px;">#${r.id}</span>
                <span>${escapeHtml(r.name)}</span>
            `;

            item.addEventListener('mouseenter', () => {
                item.style.background = 'rgba(56, 189, 248, 0.18)';
                item.style.color = '#38bdf8';
            });
            item.addEventListener('mouseleave', () => {
                item.style.background = 'transparent';
                item.style.color = '#e2e8f0';
            });

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                account.currentRoles.push(r.id);
                account.currentRoles.sort((a, b) => a - b);
                checkAndUpdateDirtyState();
                closeRoleDropdown();
                renderTableBody();
            });

            dropdown.appendChild(item);
        });

        document.body.appendChild(dropdown);
        activeRoleDropdown = dropdown;

        // Position dropdown relative to targetBtn
        const rect = targetBtn.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
        dropdown.style.left = `${rect.left + window.scrollX}px`;

        // Check if dropdown goes outside viewport
        const dropdownRect = dropdown.getBoundingClientRect();
        if (dropdownRect.right > window.innerWidth) {
            dropdown.style.left = `${window.innerWidth - dropdownRect.width - 12}px`;
        }
    }

    function closeRoleDropdown() {
        if (activeRoleDropdown) {
            if (activeRoleDropdown.parentNode) {
                activeRoleDropdown.parentNode.removeChild(activeRoleDropdown);
            }
            activeRoleDropdown = null;
        }
    }

    function initGlobalClickCloser() {
        document.addEventListener('click', (e) => {
            if (activeRoleDropdown && !activeRoleDropdown.contains(e.target)) {
                closeRoleDropdown();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && activeRoleDropdown) {
                closeRoleDropdown();
            }
        });
    }

    // ── 9. 3-SECOND HOLD TO SAVE BUTTON CONTROLLER ──────────────────────────────
    function initSaveHoldButton() {
        const btn = document.getElementById('btnSaveHold');
        const progressBar = document.getElementById('saveProgressBar');
        const btnText = document.getElementById('saveBtnText');
        if (!btn || !progressBar || !btnText) return;

        function startHold(e) {
            if (e.button !== 0 && e.type !== 'touchstart') return; // Only Left Mouse Button or Touch
            e.preventDefault();

            holdStartTime = performance.now();

            function updateProgress(now) {
                const elapsed = now - holdStartTime;
                const pct = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
                progressBar.style.width = `${pct}%`;

                if (elapsed >= HOLD_DURATION_MS) {
                    // Completed 3-second hold!
                    cancelHold();
                    executeSaveAccountChanges();
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
            if (btnText) btnText.textContent = 'Save';
        }

        btn.addEventListener('mousedown', startHold);
        btn.addEventListener('touchstart', startHold, { passive: false });

        btn.addEventListener('mouseup', cancelHold);
        btn.addEventListener('mouseleave', cancelHold);
        btn.addEventListener('touchend', cancelHold);
        btn.addEventListener('touchcancel', cancelHold);
    }

    async function executeSaveAccountChanges() {
        const dirtyAccounts = allAccountRecords.filter(acc => acc.isDirty);
        if (!dirtyAccounts.length) return;

        const saveIndicator = document.getElementById('saveStatusIndicator');
        const btnSave = document.getElementById('btnSaveHold');
        const btnUndo = document.getElementById('btnUndoChanges');

        if (btnSave) btnSave.disabled = true;
        if (btnUndo) btnUndo.disabled = true;

        try {
            const payload = {
                updates: dirtyAccounts.map(acc => ({
                    id: acc.id,
                    password: acc.passwordModified ? acc.currentPassword : null,
                    roles: acc.currentRoles
                }))
            };

            const res = await fetch('/api/account/update-kd-accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            let data = null;
            try {
                data = await res.json();
            } catch (e) {
                if (!res.ok) throw new Error(`Lỗi máy chủ (${res.status})`);
            }

            if (res.ok && data && data.success) {
                // Update original snapshot
                dirtyAccounts.forEach(acc => {
                    acc.originalPassword = acc.currentPassword;
                    acc.originalRoles = [...acc.currentRoles];
                    acc.isDirty = false;
                    acc.passwordModified = false;
                    acc.rolesModified = false;
                });

                checkAndUpdateDirtyState();
                renderTableBody();

                // Show "Saved changes" success indicator text
                if (saveIndicator) {
                    saveIndicator.style.display = 'inline-flex';
                    saveIndicator.style.color = '#34d399';
                    saveIndicator.innerHTML = `
                        <span class="material-symbols-outlined" style="font-size: 16px;">check_circle</span>
                        <span>Saved changes</span>
                    `;
                    setTimeout(() => {
                        saveIndicator.style.display = 'none';
                    }, 4500);
                }

                if (typeof Toast !== 'undefined' && Toast.success) {
                    Toast.success('Thành công', data.message || 'Đã lưu thay đổi tài khoản thành công!');
                }
            } else {
                throw new Error((data && data.message) ? data.message : 'Lỗi khi cập nhật cơ sở dữ liệu');
            }
        } catch (err) {
            console.error('Lỗi khi lưu thay đổi:', err);
            if (saveIndicator) {
                saveIndicator.style.display = 'inline-flex';
                saveIndicator.style.color = '#f87171';
                saveIndicator.innerHTML = `
                    <span class="material-symbols-outlined" style="font-size: 16px;">error</span>
                    <span>Error</span>
                `;
                setTimeout(() => {
                    saveIndicator.style.display = 'none';
                }, 4500);
            }
            if (typeof Toast !== 'undefined' && Toast.error) {
                Toast.error('Lỗi lưu thay đổi', err.message || 'Không thể lưu thay đổi vào cơ sở dữ liệu');
            }
        } finally {
            if (btnSave) btnSave.disabled = false;
            if (btnUndo) btnUndo.disabled = false;
        }
    }

    // ── 10. UNDO BUTTON CONTROLLER ──────────────────────────────────────────────
    function initUndoButton() {
        const btnUndo = document.getElementById('btnUndoChanges');
        if (!btnUndo) return;

        btnUndo.addEventListener('click', () => {
            allAccountRecords.forEach(acc => {
                acc.currentPassword = acc.originalPassword;
                acc.currentRoles = [...acc.originalRoles];
                acc.isEditingPassword = false;
                acc.passwordModified = false;
                acc.rolesModified = false;
                acc.isDirty = false;
            });

            checkAndUpdateDirtyState();
            renderTableBody();

            const saveIndicator = document.getElementById('saveStatusIndicator');
            if (saveIndicator) saveIndicator.style.display = 'none';

            if (typeof Toast !== 'undefined' && Toast.info) {
                Toast.info('Đã hoàn tác', 'Đã khôi phục lại tất cả các thay đổi chưa lưu');
            }
        });
    }

    // ── 11. EXPORT EXCEL ────────────────────────────────────────────────────────
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
                ['Tài Khoản', 'Mật Khẩu', 'Mã Phân Quyền', 'Tên Phân Quyền', 'Bộ Phận']
            ];

            currentFilteredRecords.forEach((r) => {
                const roleNamesStr = r.currentRoles.map(id => getRoleName(id)).join(', ');
                const roleIdsStr = '{' + r.currentRoles.join(',') + '}';
                wsData.push([
                    r.id,
                    r.currentPassword || '-',
                    roleIdsStr,
                    roleNamesStr || '-',
                    r.department_id || '-'
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

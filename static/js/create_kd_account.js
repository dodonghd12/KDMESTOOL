/**
 * KDMES TOOL — Create KD Account Controller
 * Single & Bulk Excel Account Provisioning with Postgres kvmes.account / kvmes.user & Roles
 * Integrated with Department Validation (Auto Uppercase, P-prefix constraint), Standard Table, Filters & Pagination
 */

(function () {
    let accountUploadedFile = null;
    let accountParsedList = [];
    let accountUploadProgressInterval = null;
    let accountSearchTimeout = null;
    let isCreatingSingleAccount = false;
    let isBulkCreating = false;

    // Records & Filter State
    let accountAllProcessedRecords = [];
    let accountCurrentFilteredRecords = [];
    let accountSelectedStatusFilter = '';

    const ACCOUNT_STATUS_OPTIONS = [
        { label: 'Tất cả trạng thái', value: '' },
        { label: 'Thành công', value: 'Thành công' },
        { label: 'Thất bại', value: 'Thất bại' }
    ];

    document.addEventListener('DOMContentLoaded', () => {
        if (typeof showAbout === 'function') {
            document.addEventListener('sidebar:about', showAbout);
        }

        const singleInp = document.getElementById('singleAccountInput');
        const deptInp = document.getElementById('singleDepartmentInput');
        const createBtn = document.getElementById('createSingleBtn');

        // Department validation & uppercase on input
        if (deptInp) {
            deptInp.addEventListener('input', validateDepartmentInput);
            deptInp.addEventListener('change', validateDepartmentInput);
            deptInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateSingleAccount();
                }
            });
        }

        if (singleInp) {
            singleInp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateSingleAccount();
                }
            });
        }

        if (createBtn) {
            createBtn.addEventListener('click', (e) => {
                e.preventDefault();
                handleCreateSingleAccount();
            });
        }

        initAccountDropzone();
        initStatusDropdown();
        initAccountClientSearch();
    });

    // ── 0. DEPARTMENT INPUT VALIDATION & AUTO UPPERCASE ─────────────────────────
    function validateDepartmentInput() {
        const deptInp = document.getElementById('singleDepartmentInput');
        const deptWrapper = document.getElementById('singleDepartmentInputWrapper');
        const errorMsg = document.getElementById('deptErrorMsg');
        const createBtn = document.getElementById('createSingleBtn');
        if (!deptInp) return true;

        // Auto uppercase
        const rawVal = deptInp.value;
        const upperVal = rawVal.toUpperCase();
        if (rawVal !== upperVal) {
            const start = deptInp.selectionStart;
            const end = deptInp.selectionEnd;
            deptInp.value = upperVal;
            if (start !== null && end !== null) {
                deptInp.setSelectionRange(start, end);
            }
        }

        const trimmed = upperVal.trim();

        // Bắt buộc nếu user có nhập thì chữ cái đầu tiên phải là 'P' hoặc 'B'
        if (trimmed.length > 0 && !trimmed.startsWith('P') && !trimmed.startsWith('B')) {
            if (deptWrapper) deptWrapper.classList.add('has-error');
            deptInp.classList.add('has-error');
            if (errorMsg) errorMsg.style.display = 'flex';
            if (createBtn) {
                createBtn.disabled = true;
                createBtn.title = 'Bộ phận bắt đầu bằng P hoặc B';
            }
            return false;
        } else {
            if (deptWrapper) deptWrapper.classList.remove('has-error');
            deptInp.classList.remove('has-error');
            if (errorMsg) errorMsg.style.display = 'none';
            if (createBtn) {
                createBtn.disabled = false;
                createBtn.removeAttribute('title');
            }
            return true;
        }
    }

    // ── 0b. DEDICATED API CALL HELPER (PREVENTS DOUBLE TOASTS) ───────────────────
    async function callAccountCreateApi(payload) {
        if (typeof showLoading === 'function') showLoading();
        try {
            const res = await fetch('/api/account/create-kd-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            let data = null;
            try {
                data = await res.json();
            } catch (e) {
                if (typeof isUnauthorizedResponse === 'function' && isUnauthorizedResponse(res.status, null)) {
                    if (typeof showAuthExpiredModal === 'function') showAuthExpiredModal();
                    throw new Error('Phiên đăng nhập đã hết hạn');
                }
                if (!res.ok) {
                    throw new Error(`Lỗi hệ thống (${res.status})`);
                }
            }

            if (typeof isUnauthorizedResponse === 'function' && isUnauthorizedResponse(res.status, data)) {
                if (typeof showAuthExpiredModal === 'function') showAuthExpiredModal(data ? data.message : null);
                throw new Error(data ? data.message : 'Unauthorized');
            }

            return data;
        } finally {
            if (typeof hideLoading === 'function') hideLoading();
        }
    }

    // ── 1. SINGLE ACCOUNT CREATION ───────────────────────────────────────────────
    async function handleCreateSingleAccount() {
        if (isCreatingSingleAccount) return;
        const singleInp = document.getElementById('singleAccountInput');
        const deptInp = document.getElementById('singleDepartmentInput');
        const createBtn = document.getElementById('createSingleBtn');
        if (!singleInp) return;

        const accountName = singleInp.value.trim();
        const isDeptValid = validateDepartmentInput();

        if (!isDeptValid) {
            Toast.error('Lỗi định dạng', 'Bộ phận bắt đầu bằng P hoặc B');
            if (deptInp) deptInp.focus();
            return;
        }

        const departmentName = (deptInp ? deptInp.value.trim().toUpperCase() : '') || 'B2210';

        if (!accountName) {
            Toast.warning('Cảnh báo', 'Vui lòng nhập tên tài khoản');
            singleInp.focus();
            return;
        }

        isCreatingSingleAccount = true;
        const originalBtnHtml = createBtn ? createBtn.innerHTML : '';
        if (createBtn) {
            createBtn.disabled = true;
            createBtn.innerHTML = `
                <span class="material-symbols-outlined spin-toggle">sync</span>
                <span>Đang tạo...</span>
            `;
        }

        try {
            const data = await callAccountCreateApi({
                accounts: [{
                    account: accountName,
                    department: departmentName
                }]
            });

            if (!data) {
                Toast.error('Lỗi', 'Không nhận được phản hồi từ máy chủ');
                return;
            }

            if (!data.success) {
                const errorTitle = (data.message && data.message.includes('Bộ phận'))
                    ? 'Lỗi định dạng'
                    : ((data.message && data.message.includes('đã tồn tại')) ? 'Tài khoản đã tồn tại' : 'Tạo tài khoản thất bại');
                Toast.error(errorTitle, data.message || `Không thể tạo tài khoản ${accountName}`);
            } else {
                Toast.success('Thành công', data.message || `Tạo tài khoản "${accountName}" thành công!`);
                singleInp.value = '';
                if (deptInp) deptInp.value = '';
                validateDepartmentInput();
            }

            // Render table results
            renderAccountResults(data);

        } catch (err) {
            console.error('Lỗi khi tạo tài khoản đơn lẻ:', err);
            Toast.error('Lỗi tạo tài khoản', err.message || 'Không thể kết nối đến máy chủ.');
        } finally {
            isCreatingSingleAccount = false;
            if (createBtn) {
                createBtn.disabled = false;
                createBtn.innerHTML = originalBtnHtml;
                validateDepartmentInput();
            }
        }
    }

    // ── 2. EXCEL TEMPLATE DOWNLOAD ───────────────────────────────────────────────
    function downloadAccountTemplate() {
        try {
            const wb = XLSX.utils.book_new();
            const wsData = [
                ['accounts', 'department'],
                ['kvp9100', 'B2210'],
                ['user1', 'B2210']
            ];
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, 'Accounts');
            XLSX.writeFile(wb, 'template_create_kd_account.xlsx');
            Toast.success('Thành công', 'Đã tải xuống file mẫu Excel!');
        } catch (err) {
            console.error('Lỗi download template:', err);
            Toast.error('Lỗi', 'Không thể tạo file mẫu Excel.');
        }
    }

    // ── 3. BULK EXCEL DROPZONE LOGIC ─────────────────────────────────────────────
    function formatBytes(bytes, decimals = 1) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function initAccountDropzone() {
        const dropzone = document.getElementById('accountDropzone');
        const fileInput = document.getElementById('bulkAccountFileInput');
        if (!dropzone || !fileInput) return;

        dropzone.addEventListener('click', (e) => {
            if (e.target.closest('#dropzoneRemoveBtn') || e.target.closest('#startBulkCreateBtn')) {
                return;
            }
            if (dropzone.classList.contains('is-preview') || dropzone.classList.contains('is-loading')) {
                return;
            }
            fileInput.click();
        });

        dropzone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                if (!dropzone.classList.contains('is-preview') && !dropzone.classList.contains('is-loading')) {
                    e.preventDefault();
                    fileInput.click();
                }
            }
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dropzone.classList.contains('is-loading')) return;
                dropzone.classList.add('drag-over');
                const titleEl = document.getElementById('dropzoneTitle');
                const subEl = document.getElementById('dropzoneSubtitle');
                if (titleEl) titleEl.textContent = 'Thả file Excel vào đây';
                if (subEl) subEl.textContent = 'Sẵn sàng tải lên file (.xlsx, .xls)';
            }, false);
        });

        ['dragleave', 'dragend'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('drag-over');
                const titleEl = document.getElementById('dropzoneTitle');
                const subEl = document.getElementById('dropzoneSubtitle');
                if (titleEl) titleEl.textContent = 'Drop your file';
                if (subEl) subEl.textContent = 'XLSX, XLS — up to 50 MB';
            }, false);
        });

        dropzone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('drag-over');
            const titleEl = document.getElementById('dropzoneTitle');
            const subEl = document.getElementById('dropzoneSubtitle');
            if (titleEl) titleEl.textContent = 'Drop your file';
            if (subEl) subEl.textContent = 'XLSX, XLS — up to 50 MB';

            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files.length > 0) {
                await processSelectedAccountExcelFile(dt.files[0]);
            }
        }, false);
    }

    async function handleBulkAccountFileSelected(event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        await processSelectedAccountExcelFile(file);
    }

    async function processSelectedAccountExcelFile(file) {
        if (!file) return;

        if (!/\.(xlsx|xls)$/i.test(file.name)) {
            Toast.error('Lỗi định dạng', 'Chỉ chấp nhận file Excel (.xlsx hoặc .xls)');
            resetAccountDropzone();
            return;
        }

        if (file.size > 50 * 1024 * 1024) {
            Toast.error('Lỗi dung lượng', 'Dung lượng file vượt quá giới hạn 50MB');
            resetAccountDropzone();
            return;
        }

        let accounts;
        try {
            accounts = await parseAccountExcelFile(file);
        } catch (err) {
            Toast.error('Sai định dạng mẫu', err.message || 'Lỗi khi đọc file Excel');
            resetAccountDropzone();
            return;
        }

        if (!accounts || !accounts.length) {
            Toast.warning('Không có dữ liệu', 'Không tìm thấy tài khoản nào trong file Excel');
            resetAccountDropzone();
            return;
        }

        accountUploadedFile = file;
        accountParsedList = accounts;

        const dropzone = document.getElementById('accountDropzone');
        const idleState = document.getElementById('dropzoneIdle');
        const loadingState = document.getElementById('dropzoneLoading');
        const previewState = document.getElementById('dropzonePreview');
        const loadingFileName = document.getElementById('loadingFileName');
        const loadingFileSize = document.getElementById('loadingFileSize');
        const loadingPercent = document.getElementById('loadingPercent');
        const progressBar = document.getElementById('dropzoneProgressBar');

        if (dropzone) {
            dropzone.classList.remove('is-preview');
            dropzone.classList.add('is-loading');
        }
        if (idleState) idleState.style.display = 'none';
        if (previewState) previewState.style.display = 'none';
        if (loadingState) loadingState.style.display = 'flex';

        if (loadingFileName) loadingFileName.textContent = file.name;
        if (loadingFileSize) loadingFileSize.textContent = formatBytes(file.size);
        if (loadingPercent) loadingPercent.textContent = '0%';
        if (progressBar) progressBar.style.width = '0%';

        const startTime = performance.now();
        const duration = 750;

        if (accountUploadProgressInterval) clearInterval(accountUploadProgressInterval);

        accountUploadProgressInterval = setInterval(() => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(100, Math.round((elapsed / duration) * 100));

            if (progressBar) progressBar.style.width = `${progress}%`;
            if (loadingPercent) loadingPercent.textContent = `${progress}%`;

            if (progress >= 100) {
                clearInterval(accountUploadProgressInterval);
                accountUploadProgressInterval = null;
                setTimeout(() => {
                    showAccountDropzonePreview(file, accounts.length);
                }, 100);
            }
        }, 20);
    }

    function parseAccountExcelFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    if (!workbook.SheetNames || !workbook.SheetNames.length) {
                        reject(new Error('File Excel trống'));
                        return;
                    }

                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

                    if (!rows.length) {
                        reject(new Error('File Excel trống'));
                        return;
                    }

                    const colAHeader = String(rows[0][0] || '').trim().toLowerCase();
                    const colBHeader = String(rows[0][1] || '').trim().toLowerCase();

                    if (colAHeader !== 'accounts' || colBHeader !== 'department') {
                        reject(new Error('Cột A1 phải là "accounts" và B1 phải là "department"'));
                        return;
                    }

                    const list = [];
                    const seen = new Set();

                    for (let i = 1; i < rows.length; i++) {
                        const acc = String(rows[i][0] || '').trim();
                        const dept = String(rows[i][1] || '').trim() || 'B2210';
                        if (acc && !seen.has(acc)) {
                            seen.add(acc);
                            list.push({ account: acc, department: dept });
                        }
                    }

                    resolve(list);
                } catch (err) {
                    reject(new Error(err.message || 'Không đọc được file Excel'));
                }
            };

            reader.onerror = () => reject(new Error('Không thể đọc file'));
            reader.readAsArrayBuffer(file);
        });
    }

    function showAccountDropzonePreview(file, count) {
        const dropzone = document.getElementById('accountDropzone');
        const idleState = document.getElementById('dropzoneIdle');
        const loadingState = document.getElementById('dropzoneLoading');
        const previewState = document.getElementById('dropzonePreview');
        const previewFileName = document.getElementById('previewFileName');
        const previewFileSize = document.getElementById('previewFileSize');
        const previewAccountCountText = document.getElementById('previewAccountCountText');

        if (dropzone) {
            dropzone.classList.remove('is-loading');
            dropzone.classList.add('is-preview');
        }
        if (idleState) idleState.style.display = 'none';
        if (loadingState) loadingState.style.display = 'none';
        if (previewState) previewState.style.display = 'grid';

        if (previewFileName) {
            previewFileName.textContent = file.name;
            previewFileName.title = file.name;
        }
        if (previewFileSize) {
            previewFileSize.textContent = formatBytes(file.size);
        }
        if (previewAccountCountText) {
            previewAccountCountText.textContent = `${count} tài khoản`;
        }

        Toast.success('Thành công', `Tải lên file "${file.name}" (${count} tài khoản) thành công!`);
    }

    function resetAccountDropzone(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (accountUploadProgressInterval) {
            clearInterval(accountUploadProgressInterval);
            accountUploadProgressInterval = null;
        }
        accountUploadedFile = null;
        accountParsedList = [];

        const fileInput = document.getElementById('bulkAccountFileInput');
        if (fileInput) fileInput.value = '';

        const dropzone = document.getElementById('accountDropzone');
        const idleState = document.getElementById('dropzoneIdle');
        const loadingState = document.getElementById('dropzoneLoading');
        const previewState = document.getElementById('dropzonePreview');

        if (dropzone) {
            dropzone.classList.remove('is-loading', 'is-preview', 'drag-over');
        }
        if (loadingState) loadingState.style.display = 'none';
        if (previewState) previewState.style.display = 'none';
        if (idleState) idleState.style.display = 'flex';
    }

    async function executeUploadedBulkAccountCreation(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (isBulkCreating) return;

        if (!accountParsedList || !accountParsedList.length) {
            Toast.warning('Cảnh báo', 'Vui lòng chọn file Excel chứa danh sách tài khoản hợp lệ');
            return;
        }

        isBulkCreating = true;
        const startBtn = document.getElementById('startBulkCreateBtn');
        const originalHtml = startBtn ? startBtn.innerHTML : '';
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.innerHTML = `
                <span class="material-symbols-outlined spin-toggle">sync</span>
                <span>Đang tạo ${accountParsedList.length} tài khoản...</span>
            `;
        }

        try {
            const data = await callAccountCreateApi({ accounts: accountParsedList });

            if (!data) {
                Toast.error('Lỗi', 'Không nhận được phản hồi từ máy chủ');
                return;
            }

            const createdCount = (data.created_accounts || []).length;
            const failedCount = (data.failed_accounts || []).length;

            if (createdCount > 0 && failedCount === 0) {
                Toast.success('Thành công', data.message || `Tạo thành công toàn bộ ${createdCount} tài khoản!`);
            } else if (createdCount > 0 && failedCount > 0) {
                Toast.warning('Hoàn thành có lỗi', data.message || `Tạo thành công ${createdCount} tài khoản, ${failedCount} tài khoản bị lỗi/trùng.`);
            } else {
                Toast.error('Tạo tài khoản thất bại', data.message || 'Không tạo được tài khoản nào.');
            }

            renderAccountResults(data);
            resetAccountDropzone();

        } catch (err) {
            console.error('Lỗi tạo tài khoản hàng loạt:', err);
            Toast.error('Lỗi hệ thống', err.message || 'Không thể tạo tài khoản');
        } finally {
            isBulkCreating = false;
            if (startBtn) {
                startBtn.disabled = false;
                startBtn.innerHTML = originalHtml;
            }
        }
    }

    // ── 4. STATUS FILTER & CLIENT SEARCH LOGIC ──────────────────────────────────
    function initStatusDropdown() {
        const input = document.getElementById('status_filter');
        const dropdown = document.getElementById('status-filter-dropdown');
        if (!input || !dropdown) return;

        input.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleStatusDropdown();
        });

        input.addEventListener('input', () => {
            accountSelectedStatusFilter = input.value.trim();
            const box = input.closest('.input-box');
            if (box) {
                if (input.value && input.value.trim().length > 0) {
                    box.classList.add('has-value');
                } else {
                    box.classList.remove('has-value');
                }
            }
            applyAllFilters(true);
        });

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
    }

    function toggleStatusDropdown() {
        const dropdown = document.getElementById('status-filter-dropdown');
        if (!dropdown) return;

        if (dropdown.classList.contains('show')) {
            dropdown.classList.remove('show');
            return;
        }

        renderStatusDropdownItems();
        dropdown.classList.add('show');
    }

    function renderStatusDropdownItems() {
        const dropdown = document.getElementById('status-filter-dropdown');
        const input = document.getElementById('status_filter');
        if (!dropdown || !input) return;

        dropdown.innerHTML = '';

        ACCOUNT_STATUS_OPTIONS.forEach(opt => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.textContent = opt.label;
            item.dataset.value = opt.value;

            const isSelected = (!accountSelectedStatusFilter && !opt.value) || (accountSelectedStatusFilter === opt.value);
            if (isSelected) {
                item.classList.add('selected');
            }

            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                accountSelectedStatusFilter = opt.value;
                input.value = opt.value ? opt.label : '';
                const box = input.closest('.input-box');
                if (box) {
                    if (opt.value) {
                        box.classList.add('has-value');
                    } else {
                        box.classList.remove('has-value');
                    }
                }
                dropdown.classList.remove('show');
                input.blur();
                applyAllFilters(true);
            });

            dropdown.appendChild(item);
        });
    }

    function initAccountClientSearch() {
        const searchInput = document.getElementById('clientSearch');
        if (!searchInput) return;

        searchInput.disabled = false;
        searchInput.removeAttribute('disabled');

        searchInput.addEventListener('input', () => {
            if (accountSearchTimeout) clearTimeout(accountSearchTimeout);
            accountSearchTimeout = setTimeout(() => {
                applyAllFilters(true);
            }, 150);
        });

        // Hook custom search handler and override main.js updateClientSearchState
        window.customClientSearchHandler = function () {
            applyAllFilters(true);
        };

        window.updateClientSearchState = function () {
            ensureAccountClientSearchEnabled();
        };

        ensureAccountClientSearchEnabled();
        setTimeout(ensureAccountClientSearchEnabled, 50);
        setTimeout(ensureAccountClientSearchEnabled, 250);
    }

    function ensureAccountClientSearchEnabled() {
        const searchInput = document.getElementById('clientSearch');
        if (searchInput) {
            searchInput.disabled = false;
            searchInput.removeAttribute('disabled');
        }
    }

    // ── 5. RENDER RESULTS, FILTERING & SHADCN PAGINATION ─────────────────────────
    function renderAccountResults(data) {
        const section = document.getElementById('accountResultSection');
        const statTotalReq = document.getElementById('statTotalReq');
        const statCreated = document.getElementById('statCreated');
        const statFailed = document.getElementById('statFailed');

        if (!section) return;

        const created = data.created_accounts || [];
        const failed = data.failed_accounts || [];
        const total = data.total_requested || (created.length + failed.length);

        if (statTotalReq) statTotalReq.textContent = total;
        if (statCreated) statCreated.textContent = created.length;
        if (statFailed) statFailed.textContent = failed.length;

        accountAllProcessedRecords = [];
        const nowStr = new Date().toLocaleString('vi-VN');

        // Add created accounts
        created.forEach(item => {
            const acc = typeof item === 'object' ? item.account : item;
            const dept = (typeof item === 'object' && item.department) ? item.department : 'B2210';
            const roles = (typeof item === 'object' && item.roles) ? item.roles : '{7}';

            accountAllProcessedRecords.push({
                account: acc,
                department: dept,
                roles: roles,
                status: 'Thành công',
                statusCode: 'SUCCESS',
                note: 'Khởi tạo tài khoản thành công',
                time: nowStr
            });
        });

        // Add failed accounts
        failed.forEach(item => {
            const acc = typeof item === 'object' ? item.account : item;
            const dept = (typeof item === 'object' && item.department) ? item.department : 'B2210';
            const reason = (typeof item === 'object' && item.reason) ? item.reason : 'Tài khoản đã tồn tại';

            accountAllProcessedRecords.push({
                account: acc,
                department: dept,
                roles: '-',
                status: 'Thất bại',
                statusCode: 'FAILED',
                note: reason,
                time: nowStr
            });
        });

        section.style.display = 'flex';

        // Reset status filter and search on new result
        const statusInp = document.getElementById('status_filter');
        if (statusInp) {
            statusInp.value = '';
            const box = statusInp.closest('.input-box');
            if (box) box.classList.remove('has-value');
        }
        accountSelectedStatusFilter = '';

        const clientSearchInp = document.getElementById('clientSearch');
        if (clientSearchInp) {
            clientSearchInp.value = '';
            clientSearchInp.disabled = false;
            clientSearchInp.removeAttribute('disabled');
        }

        applyAllFilters(true);
    }

    function applyAllFilters() {
        const searchInput = document.getElementById('clientSearch');
        const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';

        accountCurrentFilteredRecords = accountAllProcessedRecords.filter(row => {
            // 1. Filter by Status
            if (accountSelectedStatusFilter) {
                const rowStatus = String(row.status || '').toLowerCase();
                const filterLower = accountSelectedStatusFilter.toLowerCase();
                if (!rowStatus.includes(filterLower)) {
                    return false;
                }
            }

            // 2. Filter by Client Search across all columns
            if (searchTerm) {
                const match =
                    String(row.account || '').toLowerCase().includes(searchTerm) ||
                    String(row.department || '').toLowerCase().includes(searchTerm) ||
                    String(row.roles || '').toLowerCase().includes(searchTerm) ||
                    String(row.status || '').toLowerCase().includes(searchTerm) ||
                    String(row.note || '').toLowerCase().includes(searchTerm) ||
                    String(row.time || '').toLowerCase().includes(searchTerm);
                if (!match) {
                    return false;
                }
            }

            return true;
        });

        renderAllRows();
        ensureAccountClientSearchEnabled();
    }

    function renderAllRows() {
        const tbody = document.getElementById('accountResultTableBody');
        const rowCount = document.getElementById('rowCount');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!accountCurrentFilteredRecords.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="7" style="text-align: center; padding: 32px 16px; color: var(--color-text-muted);">
                    <span class="material-symbols-outlined" style="font-size: 32px; opacity: 0.5; display: block; margin-bottom: 6px;">search_off</span>
                    <span>Không tìm thấy tài khoản nào khớp với bộ lọc</span>
                </td>
            `;
            tbody.appendChild(tr);

            if (rowCount) rowCount.textContent = '0';
            return;
        }

        accountCurrentFilteredRecords.forEach((row, idx) => {
            const isSuccess = row.statusCode === 'SUCCESS' || row.status === 'Thành công';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align: center; color: var(--color-text-muted); font-weight: 600;">${idx + 1}</td>
                <td style="font-weight: 700; color: ${isSuccess ? 'var(--color-text-primary)' : 'var(--color-text-muted)'}; font-family: var(--font-family-mono);">${row.account}</td>
                <td style="color: #38bdf8; font-weight: 600;">${row.department}</td>
                <td style="text-align: center; color: #c084fc; font-weight: 700; font-family: var(--font-family-mono);">${row.roles}</td>
                <td style="text-align: center;">
                    <span class="account-badge" style="${isSuccess ? 'background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35);' : 'background: rgba(244, 63, 94, 0.15); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.35);'}">
                        <span class="material-symbols-outlined" style="font-size: 13px; margin-right: 4px;">${isSuccess ? 'check_circle' : 'error'}</span>
                        ${row.status}
                    </span>
                </td>
                <td style="color: ${isSuccess ? '#34d399' : '#fb7185'}; font-size: 12.5px;">${row.note}</td>
                <td style="text-align: center; color: var(--color-text-muted); font-size: 12px; font-family: var(--font-family-mono);">${row.time}</td>
            `;
            tbody.appendChild(tr);
        });

        if (rowCount) {
            rowCount.textContent = accountCurrentFilteredRecords.length.toLocaleString();
        }
    }

    // ── 6. DOWNLOAD CREATION LOG ─────────────────────────────────────────────────
    async function downloadAccountCreationLog() {
        if (!accountAllProcessedRecords.length) {
            Toast.warning('Cảnh báo', 'Chưa có dữ liệu để export');
            return;
        }

        const confirmed = (typeof showConfirm === 'function')
            ? await showConfirm('Bạn có muốn tải xuống file log kết quả tạo tài khoản?')
            : confirm('Bạn có muốn tải xuống file log kết quả tạo tài khoản?');
        if (!confirmed) return;

        try {
            const wsData = [
                ['STT', 'Tên Tài Khoản', 'Bộ Phận', 'Phân Quyền (Roles)', 'Trạng Thái', 'Chi Tiết Ghi Chú', 'Thời Gian']
            ];

            const recordsToExport = accountCurrentFilteredRecords.length ? accountCurrentFilteredRecords : accountAllProcessedRecords;

            recordsToExport.forEach((r, idx) => {
                wsData.push([
                    idx + 1,
                    r.account,
                    r.department,
                    r.roles,
                    r.status,
                    r.note,
                    r.time
                ]);
            });

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, 'KetQuaTaoTaiKhoan');

            const dateStr = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, `log_tao_tai_khoan_kdmes_${dateStr}.xlsx`);
            Toast.success('Thành công', 'Xuất file log thành công!');
        } catch (err) {
            console.error('Lỗi export log:', err);
            Toast.error('Lỗi', 'Không thể xuất file log.');
        }
    }

    // Expose functions to window for template inline handlers and global access
    window.handleCreateSingleAccount = handleCreateSingleAccount;
    window.validateDepartmentInput = validateDepartmentInput;
    window.downloadAccountTemplate = downloadAccountTemplate;
    window.handleBulkAccountFileSelected = handleBulkAccountFileSelected;
    window.resetAccountDropzone = resetAccountDropzone;
    window.executeUploadedBulkAccountCreation = executeUploadedBulkAccountCreation;
    window.downloadAccountCreationLog = downloadAccountCreationLog;
})();

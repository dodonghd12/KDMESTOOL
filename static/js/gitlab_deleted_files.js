/**
 * ==============================================================================
 * KDMES TOOL — GITLAB DELETED FILES CONTROLLER
 * Truy vấn & Lọc danh sách file YAML bị xóa trên GitLab (Audit Log)
 * ==============================================================================
 */

let allFetchedRecords = [];
let tableColumns = [
    'Project',
    'File Name',
    'deleted_by',
    'Email',
    'Thời gian',
    'File Path',
    'Commit URL',
    'Commit Message'
];
let selectedProjectFilter = '';

const PROJECT_ITEMS = [
    'kitting',
    'building',
    'curing'
];

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGitlabDeletedFiles);
} else {
    initializeGitlabDeletedFiles();
}

function initializeGitlabDeletedFiles() {
    initControls();
    initProjectDropdown();

    // Tự động tải dữ liệu ban đầu khi mở trang
    fetchDeletedFilesLog();
}

function resetAllFiltersAndTable() {
    // 1. Reset biến lưu trạng thái lọc
    selectedProjectFilter = '';

    // 2. Reset DOM controls và gỡ bỏ class has-value để ẩn nút clear-btn (x)
    const projectInput = document.getElementById('project_filter');
    if (projectInput) {
        projectInput.value = '';
        const box = projectInput.closest('.input-box');
        if (box) box.classList.remove('has-value');
    }

    const searchInput = document.getElementById('clientSearch');
    if (searchInput) {
        searchInput.value = '';
        const box = searchInput.closest('.input-box');
        if (box) box.classList.remove('has-value');
    }

    // 3. Clear toàn bộ nội dung table container
    allFetchedRecords = [];
    rawTableData = [];
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    const rowCount = document.getElementById('rowCount');
    if (thead) thead.innerHTML = '';
    if (tbody) tbody.innerHTML = '';
    if (rowCount) rowCount.textContent = '0';

    const tableFooter = document.querySelector('.table-footer');
    if (tableFooter) tableFooter.classList.add('hidden');
}

function initControls() {
    const checkBtn = document.getElementById('btnCheckDeletedFiles');
    if (checkBtn) {
        checkBtn.addEventListener('click', () => {
            resetAllFiltersAndTable();
            fetchDeletedFilesLog();
        });
    }

    const searchInput = document.getElementById('clientSearch');
    if (searchInput) {
        searchInput.disabled = false;
        searchInput.removeAttribute('disabled');
        searchInput.addEventListener('input', () => {
            applyAllFilters();
        });
    }

    // Override updateClientSearchState trên page này để clientSearch luôn luôn enable
    window.updateClientSearchState = function () {
        const input = document.getElementById('clientSearch');
        if (input) {
            input.disabled = false;
            input.removeAttribute('disabled');
        }
    };

    ensureClientSearchEnabled();
    setTimeout(ensureClientSearchEnabled, 50);
    setTimeout(ensureClientSearchEnabled, 250);
}

function ensureClientSearchEnabled() {
    const searchInput = document.getElementById('clientSearch');
    if (searchInput) {
        searchInput.disabled = false;
        searchInput.removeAttribute('disabled');
    }
}

function initProjectDropdown() {
    const input = document.getElementById('project_filter');
    const dropdown = document.getElementById('project-filter-dropdown');
    if (!input || !dropdown) return;

    input.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleProjectDropdown();
    });

    // Lắng nghe sự kiện input khi người dùng bấm nút xóa (x) của input-box
    input.addEventListener('input', () => {
        selectedProjectFilter = input.value.trim();
        const box = input.closest('.input-box');
        if (box) {
            if (input.value && input.value.trim().length > 0) {
                box.classList.add('has-value');
            } else {
                box.classList.remove('has-value');
            }
        }
        applyAllFilters();
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });
}

function toggleProjectDropdown() {
    const dropdown = document.getElementById('project-filter-dropdown');
    if (!dropdown) return;

    if (dropdown.classList.contains('show')) {
        dropdown.classList.remove('show');
        return;
    }

    renderProjectDropdownItems();
    dropdown.classList.add('show');
}

function renderProjectDropdownItems() {
    const dropdown = document.getElementById('project-filter-dropdown');
    const input = document.getElementById('project_filter');
    if (!dropdown || !input) return;

    dropdown.innerHTML = '';

    const items = ['Tất cả project', ...PROJECT_ITEMS];

    items.forEach(proj => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.textContent = proj;
        item.dataset.value = proj === 'Tất cả project' ? '' : proj;

        const isSelected = (proj === 'Tất cả project' && !selectedProjectFilter) || (proj.toLowerCase() === selectedProjectFilter.toLowerCase());
        if (isSelected) {
            item.classList.add('selected');
        }

        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            selectedProjectFilter = item.dataset.value;
            input.value = selectedProjectFilter ? selectedProjectFilter : '';
            const box = input.closest('.input-box');
            if (box) {
                if (input.value && input.value.trim().length > 0) {
                    box.classList.add('has-value');
                } else {
                    box.classList.remove('has-value');
                }
            }
            dropdown.classList.remove('show');
            applyAllFilters();
        });

        dropdown.appendChild(item);
    });
}

function applyAllFilters() {
    const searchInput = document.getElementById('clientSearch');
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';

    let filtered = allFetchedRecords.filter(row => {
        // row[0]: Project, row[1]: File Name, ...
        const rowProject = String(row[0] || '').trim();

        // 1. Lọc theo Project
        if (selectedProjectFilter && selectedProjectFilter !== 'Tất cả project') {
            if (rowProject.toLowerCase() !== selectedProjectFilter.toLowerCase()) {
                return false;
            }
        }

        // 2. Lọc theo Client Search (toàn bộ các cột)
        if (searchTerm) {
            const matches = row.some(cell => String(cell || '').toLowerCase().includes(searchTerm));
            if (!matches) {
                return false;
            }
        }

        return true;
    });

    rawTableData = filtered;
    rawTableColumns = tableColumns;

    displayTable(filtered, tableColumns);
    ensureClientSearchEnabled();

    const rowCount = document.getElementById('rowCount');
    if (rowCount) {
        rowCount.textContent = filtered.length.toLocaleString();
    }

    const tableFooter = document.querySelector('.table-footer');
    if (tableFooter) {
        if (filtered.length > 0) {
            tableFooter.classList.remove('hidden');
        } else {
            tableFooter.classList.add('hidden');
        }
    }
}

async function fetchDeletedFilesLog() {
    const checkBtn = document.getElementById('btnCheckDeletedFiles');
    if (checkBtn) {
        checkBtn.disabled = true;
    }

    if (typeof showTableSkeleton === 'function') {
        showTableSkeleton(8, 5);
    }

    try {
        const response = await fetch('/api/gitlab/get-deleted-files-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });

        let data = null;
        try {
            data = await response.json();
        } catch (e) {}

        if (typeof isUnauthorizedResponse === 'function' && isUnauthorizedResponse(response.status, data)) {
            if (typeof showAuthExpiredModal === 'function') {
                showAuthExpiredModal(data ? data.message : null);
            }
            return;
        }

        if (data && Array.isArray(data.result)) {
            allFetchedRecords = data.result;
            tableColumns = data.columns || [
                'Project',
                'File Name',
                'deleted_by',
                'Email',
                'Thời gian',
                'File Path',
                'Commit URL',
                'Commit Message'
            ];

            applyAllFilters();

            if (typeof Toast !== 'undefined' && Toast.success) {
                Toast.success('Thành công', `Đã tải ${allFetchedRecords.length.toLocaleString()} bản ghi file bị xóa`);
            }
        } else {
            allFetchedRecords = [];
            tableColumns = data ? (data.columns || []) : [];
            applyAllFilters();

            if (typeof Toast !== 'undefined' && Toast.warning) {
                Toast.warning('Không có dữ liệu', (data && data.message) ? data.message : 'Chưa có file YAML nào bị xóa được ghi nhận trong log.');
            }
        }
    } catch (error) {
        console.error('Error fetching gitlab deleted files log:', error);
        if (typeof Toast !== 'undefined' && Toast.error) {
            Toast.error('Lỗi kết nối', 'Không thể kết nối tới máy chủ để đọc file log.');
        }
        allFetchedRecords = [];
        applyAllFilters();
    } finally {
        if (checkBtn) {
            checkBtn.disabled = false;
        }
        document.body.classList.remove('app-loading-state');
    }
}

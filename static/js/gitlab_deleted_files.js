/**
 * ==============================================================================
 * KDMES TOOL — GITLAB DELETED FILES CONTROLLER
 * Truy vấn & Lọc danh sách file YAML bị xóa trên GitLab (Audit Log)
 * Hỗ trợ Phân trang (shadcn/ui Pagination) & Tìm kiếm toàn cục trên tất cả các trang
 * ==============================================================================
 */

let allFetchedRecords = [];
let currentFilteredRecords = [];
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

// Pagination State (1-based for user display, clamped, 0-based for slicing)
const PAGE_SIZE = 30;
let currentPage = 1;
let totalPages = 1;

/**
 * Chuyển đổi số trang 1-based (người dùng) sang page index 0-based (backend/offset slice).
 * DUY NHẤT một nơi trong code thực hiện việc chuyển đổi này.
 * @param {number} page1 - Số trang 1-based (>= 1)
 * @returns {number} - Page index 0-based (>= 0)
 */
function toZeroBasedPageIndex(page1) {
    return Math.max(0, (parseInt(page1, 10) || 1) - 1);
}

function calculateTotalPages(totalRecords, pageSize) {
    if (!totalRecords || totalRecords <= 0) return 1;
    return Math.ceil(totalRecords / pageSize);
}

function clampPage(page, total) {
    if (total <= 0) return 1;
    return Math.min(Math.max(1, page), total);
}

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

    // Hook custom search handler cho main.js clientSearch
    window.customClientSearchHandler = function () {
        applyAllFilters(true);
    };

    // Tự động tải dữ liệu ban đầu khi mở trang
    fetchDeletedFilesLog();
}

function resetAllFiltersAndTable() {
    // 1. Reset biến lưu trạng thái lọc và phân trang
    selectedProjectFilter = '';
    currentPage = 1;
    totalPages = 1;

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

    // 3. Clear toàn bộ nội dung table container và pagination nav
    allFetchedRecords = [];
    currentFilteredRecords = [];
    rawTableData = [];
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    const rowCount = document.getElementById('rowCount');
    if (thead) thead.innerHTML = '';
    if (tbody) tbody.innerHTML = '';
    if (rowCount) rowCount.textContent = '0';

    const paginationNav = document.getElementById('paginationNav');
    if (paginationNav) {
        paginationNav.innerHTML = '';
        paginationNav.classList.add('hidden');
    }

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
            applyAllFilters(true);
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
        applyAllFilters(true);
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
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            dropdown.classList.remove('show');
            input.blur();
            applyAllFilters(true);
        });

        dropdown.appendChild(item);
    });
}

/**
 * Áp dụng bộ lọc (Project + Client Search) trên toàn bộ danh sách dữ liệu gốc
 * Sau đó tính toán lại tổng số trang và clamp trang hiện tại
 * @param {boolean} resetPageToOne - true nếu cần đưa về trang 1 khi lọc thay đổi
 */
function applyAllFilters(resetPageToOne = false) {
    const searchInput = document.getElementById('clientSearch');
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';

    currentFilteredRecords = allFetchedRecords.filter(row => {
        // row[0]: Project, row[1]: File Name, ...
        const rowProject = String(row[0] || '').trim();

        // 1. Lọc theo Project
        if (selectedProjectFilter && selectedProjectFilter !== 'Tất cả project') {
            if (rowProject.toLowerCase() !== selectedProjectFilter.toLowerCase()) {
                return false;
            }
        }

        // 2. Lọc theo Client Search (toàn bộ các cột trên toàn bộ dữ liệu)
        if (searchTerm) {
            const matches = row.some(cell => String(cell || '').toLowerCase().includes(searchTerm));
            if (!matches) {
                return false;
            }
        }

        return true;
    });

    // rawTableData luôn chứa toàn bộ danh sách đã lọc (phục vụ Xuất Excel toàn bộ)
    rawTableData = currentFilteredRecords;
    rawTableColumns = tableColumns;

    // 1. Tính toán lại tổng số trang (total pages)
    totalPages = calculateTotalPages(currentFilteredRecords.length, PAGE_SIZE);

    // 2. Đảm bảo trang hiện tại (current page) không vượt quá tổng số trang mới bằng cách điều chỉnh (clamp)
    if (resetPageToOne) {
        currentPage = 1;
    } else {
        currentPage = clampPage(currentPage, totalPages);
    }

    renderCurrentPage();
}

/**
 * Hiển thị dữ liệu của trang hiện tại và cập nhật khu vực phân trang
 */
function renderCurrentPage() {
    // Chuyển 1-based currentPage sang 0-based page index tại một nơi duy nhất
    const page0 = toZeroBasedPageIndex(currentPage);
    const startIdx = page0 * PAGE_SIZE;
    const endIdx = startIdx + PAGE_SIZE;
    const pageRows = currentFilteredRecords.slice(startIdx, endIdx);

    displayTable(pageRows, tableColumns);
    ensureClientSearchEnabled();

    const rowCount = document.getElementById('rowCount');
    if (rowCount) {
        rowCount.textContent = currentFilteredRecords.length.toLocaleString();
    }

    const tableFooter = document.querySelector('.table-footer');
    if (tableFooter) {
        if (currentFilteredRecords.length > 0) {
            tableFooter.classList.remove('hidden');
        } else {
            tableFooter.classList.add('hidden');
        }
    }

    // Render component Pagination shadcn/ui ở chính giữa table-footer
    const paginationNav = document.getElementById('paginationNav');
    if (paginationNav) {
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

            applyAllFilters(true);

            if (typeof Toast !== 'undefined' && Toast.success) {
                Toast.success('Thành công', `Đã tải ${allFetchedRecords.length.toLocaleString()} bản ghi file bị xóa`);
            }
        } else {
            allFetchedRecords = [];
            tableColumns = data ? (data.columns || []) : [];
            applyAllFilters(true);

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
        applyAllFilters(true);
    } finally {
        if (checkBtn) {
            checkBtn.disabled = false;
        }
        document.body.classList.remove('app-loading-state');
    }
}

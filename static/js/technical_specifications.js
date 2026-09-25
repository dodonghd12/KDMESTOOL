/**
 * ==============================================================================
 * KDMES TOOL — THÔNG SỐ KỸ THUẬT (TECHNICAL SPECIFICATIONS) CONTROLLER
 * Tra cứu thông số kỹ thuật (required-labels) & limitary-hour từ GitLab
 * ==============================================================================
 */

let productTypes = [];
let configMap = {};
let limitaryHoursMap = {};
let currentProductType = '';
let productTypeSearchTimeout = null;

document.addEventListener('DOMContentLoaded', async function () {
    initializeTechnicalSpecificationsEventListeners();
    await loadTechnicalSpecifications();
});

function initializeTechnicalSpecificationsEventListeners() {
    const productTypeInput = document.getElementById('product_type');
    if (!productTypeInput) return;

    // Click to open dropdown
    productTypeInput.addEventListener('click', () => {
        showFilteredDropdown();
    });

    // Focus to open dropdown
    productTypeInput.addEventListener('focus', () => {
        showFilteredDropdown();
    });

    // Blur to close dropdown after short delay
    productTypeInput.addEventListener('blur', () => {
        setTimeout(() => {
            hideProductTypeDropdown();
            // If user typed an exact match, auto-select it
            const val = productTypeInput.value.trim().toUpperCase();
            if (val && productTypes.includes(val) && val !== currentProductType) {
                selectProductType(val);
            }
        }, 220);
    });

    // Typing to filter dropdown items
    productTypeInput.addEventListener('input', (e) => {
        const val = e.target.value.trim().toUpperCase();
        clearTimeout(productTypeSearchTimeout);

        showFilteredDropdown();

        // If exact match while typing, load table
        if (val && productTypes.includes(val)) {
            if (val !== currentProductType) {
                productTypeSearchTimeout = setTimeout(() => {
                    selectProductType(val);
                }, 300);
            }
        } else if (!val) {
            // Cleared input
            clearTable();
        }
    });
}

function showFilteredDropdown() {
    const input = document.getElementById('product_type');
    if (!input) return;

    const val = input.value.trim().toUpperCase();
    if (!val) {
        showProductTypeDropdown(productTypes);
        return;
    }

    const filtered = productTypes.filter(pt => pt.toUpperCase().includes(val));
    if (filtered.length > 0) {
        showProductTypeDropdown(filtered);
    } else {
        hideProductTypeDropdown();
    }
}

function showProductTypeDropdown(items) {
    const dropdown = document.getElementById('product-type-dropdown');
    if (!dropdown) return;

    dropdown.innerHTML = '';

    if (!items || items.length === 0) {
        dropdown.classList.remove('show');
        return;
    }

    items.forEach(pt => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.textContent = pt;
        item.dataset.value = pt;

        if (pt === currentProductType) {
            item.classList.add('selected');
        }

        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            clearTimeout(productTypeSearchTimeout);
            const input = document.getElementById('product_type');
            input.value = pt;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            clearTimeout(productTypeSearchTimeout);
            hideProductTypeDropdown();
            input.blur();
            selectProductType(pt);
        });

        dropdown.appendChild(item);
    });

    dropdown.classList.add('show');
}

function hideProductTypeDropdown() {
    const dropdown = document.getElementById('product-type-dropdown');
    if (dropdown) {
        dropdown.classList.remove('show');
    }
}

async function loadTechnicalSpecifications() {
    try {
        const res = await apiFetch('/api/technical-specifications/fetch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });

        if (!res || !res.success) {
            if (res && res.error_type === 'auth') {
                Toast.error('Lỗi GitLab Token', 'Lỗi gitlab token, vui lòng kiểm tra');
            } else {
                Toast.error('Lỗi GitLab', (res && res.message) ? res.message : 'Lỗi gitlab');
            }
            renderInitialEmptyState('Không thể tải dữ liệu thông số kỹ thuật từ GitLab.');
            return;
        }

        productTypes = res.product_types || [];
        configMap = res.config_map || {};
        limitaryHoursMap = res.limitary_hours || {};

        if (productTypes.length === 0) {
            Toast.warning('Thông báo', 'Không tìm thấy loại sản phẩm nào trong file cấu hình.');
            renderInitialEmptyState('Không có dữ liệu trong file cấu hình.');
            return;
        }

        Toast.success('Thành công', `Đã tải ${productTypes.length} loại sản phẩm từ GitLab`);
        renderInitialEmptyState('Vui lòng chọn Loại sản phẩm (Product Type) để xem thông số kỹ thuật.');

    } catch (err) {
        console.error('Error loading technical specifications:', err);
        Toast.error('Lỗi GitLab', err.message || 'Lỗi gitlab');
        renderInitialEmptyState('Lỗi kết nối khi tải dữ liệu từ GitLab.');
    }
}

function updateLimitaryHoursDisplay(ptype) {
    const standingTimeVal = document.getElementById('standingTimeVal');
    const limitaryHourVal = document.getElementById('limitaryHourVal');

    if (!standingTimeVal || !limitaryHourVal) return;

    if (!ptype) {
        standingTimeVal.textContent = '-';
        limitaryHourVal.textContent = '-';
        return;
    }

    const key = ptype.trim().toUpperCase();
    const lh = limitaryHoursMap[key] || limitaryHoursMap[ptype];

    if (lh) {
        standingTimeVal.textContent = (lh.standing_time !== null && lh.standing_time !== undefined) ? lh.standing_time : '-';
        limitaryHourVal.textContent = (lh.limitary_hour !== null && lh.limitary_hour !== undefined) ? lh.limitary_hour : '-';
    } else {
        standingTimeVal.textContent = '-';
        limitaryHourVal.textContent = '-';
    }
}

function selectProductType(ptype, force = false) {
    if (!ptype) return;
    clearTimeout(productTypeSearchTimeout);

    if (!force && ptype === currentProductType) {
        return;
    }
    currentProductType = ptype;

    const rows = configMap[ptype] || [];
    const columns = ['key', 'VN', 'CN', 'TW', 'EN', 'ID'];

    // Update standing-time and limitary-hour stats in table footer
    updateLimitaryHoursDisplay(ptype);

    setTableData(
        rows,
        columns,
        'technical_specifications',
        `Không có thông số kỹ thuật nào cho loại sản phẩm: ${ptype}`,
        `Tải thành công thông số kỹ thuật: ${ptype} (${rows.length} dòng)`
    );
}

function renderInitialEmptyState(message = 'Vui lòng chọn loại sản phẩm') {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    const rowCount = document.getElementById('rowCount');
    const tableFooter = document.querySelector('.table-footer');

    // Reset limitary hour stats display
    updateLimitaryHoursDisplay(null);

    if (thead) thead.innerHTML = '';
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 56px 20px;">
                    <div class="table-empty-state">
                        <div class="empty-state-icon-wrapper">
                            <span class="material-symbols-outlined empty-state-icon">tune</span>
                        </div>
                        <div class="empty-state-title">Thông số kỹ thuật (Technical Specifications)</div>
                        <div class="empty-state-desc">${message}</div>
                    </div>
                </td>
            </tr>
        `;
    }
    if (rowCount) rowCount.textContent = '0';
    if (tableFooter) tableFooter.classList.add('hidden');
}

function clearTable() {
    clearTimeout(productTypeSearchTimeout);
    currentProductType = '';
    renderInitialEmptyState('Vui lòng chọn Loại sản phẩm (Product Type) để xem thông số kỹ thuật.');
}

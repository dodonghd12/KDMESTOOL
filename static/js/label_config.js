/**
 * ==============================================================================
 * KDMES TOOL — THÔNG SỐ KỸ THUẬT (LABEL CONFIG) CONTROLLER
 * Tra cứu thông số kỹ thuật / required-labels từ file label-config.yml trên GitLab
 * ==============================================================================
 */

let productTypes = [];
let configMap = {};
let currentProductType = '';
let productTypeSearchTimeout = null;

document.addEventListener('DOMContentLoaded', async function () {
    initializeLabelConfigEventListeners();
    await loadLabelConfig();
});

function initializeLabelConfigEventListeners() {
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
            productTypeSearchTimeout = setTimeout(() => {
                selectProductType(val);
            }, 300);
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
            e.preventDefault(); // Prevent blur before selection
            document.getElementById('product_type').value = pt;
            hideProductTypeDropdown();
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

async function loadLabelConfig() {
    try {
        const res = await apiFetch('/api/label-config/fetch', {
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
            renderInitialEmptyState('Không thể tải dữ liệu cấu hình từ GitLab.');
            return;
        }

        productTypes = res.product_types || [];
        configMap = res.config_map || {};

        if (productTypes.length === 0) {
            Toast.warning('Thông báo', 'Không tìm thấy loại sản phẩm nào trong file cấu hình.');
            renderInitialEmptyState('Không có dữ liệu trong file cấu hình.');
            return;
        }

        Toast.success('Thành công', `Đã tải ${productTypes.length} loại sản phẩm từ GitLab`);
        renderInitialEmptyState('Vui lòng chọn Loại sản phẩm (Product Type) để xem thông số kỹ thuật.');

    } catch (err) {
        console.error('Error loading label config:', err);
        Toast.error('Lỗi GitLab', err.message || 'Lỗi gitlab');
        renderInitialEmptyState('Lỗi kết nối khi tải dữ liệu từ GitLab.');
    }
}

function selectProductType(ptype) {
    if (!ptype) return;
    currentProductType = ptype;

    const rows = configMap[ptype] || [];
    const columns = ['key', 'VN', 'CN', 'TW', 'EN', 'ID'];

    setTableData(
        rows,
        columns,
        'label_config',
        `Không có thông số kỹ thuật nào cho loại sản phẩm: ${ptype}`,
        `Tải thành công thông số kỹ thuật: ${ptype} (${rows.length} dòng)`
    );
}

function renderInitialEmptyState(message = 'Vui lòng chọn loại sản phẩm') {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    const rowCount = document.getElementById('rowCount');
    const tableFooter = document.querySelector('.table-footer');

    if (thead) thead.innerHTML = '';
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 56px 20px;">
                    <div class="table-empty-state">
                        <div class="empty-state-icon-wrapper">
                            <span class="material-symbols-outlined empty-state-icon">tune</span>
                        </div>
                        <div class="empty-state-title">Thông số kỹ thuật nhãn (Label Config)</div>
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
    currentProductType = '';
    renderInitialEmptyState('Vui lòng chọn Loại sản phẩm (Product Type) để xem thông số kỹ thuật.');
}

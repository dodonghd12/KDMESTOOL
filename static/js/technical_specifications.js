/**
 * ==============================================================================
 * KDMES TOOL — THÔNG SỐ KỸ THUẬT (TECHNICAL SPECIFICATIONS) CONTROLLER
 * Tra cứu thông số kỹ thuật (required-labels) & limitary-hour từ GitLab
 * ==============================================================================
 */

const PRODUCT_TYPE_DISPLAY_MAP = {
    'INNER_LINER': 'I - INNER_LINER',
    'CARCASS_PLY': 'P - CARCASS_PLY',
    'SIDEWALL': 'S - SIDEWALL',
    'TREAD': 'T - TREAD',
    'BEAD': 'W - BEAD',
    'BEAD_AND_BEAD_FILLER_PREASSEMBLY': 'W0 - BEAD_AND_BEAD_FILLER_PREASSEMBLY',
    'CHAFER': 'W2 - CHAFER',
    'GREEN_TIRE': 'G - GREEN_TIRE',
    'STEEL_BELT': 'D - STEEL_BELT',
    'PLY': 'D - PLY',
    'BELT_AND_EDGE_GUM_PREASSEMBLY': 'B - BELT_AND_EDGE_GUM_PREASSEMBLY',
    'SQUEEZE': 'R - SQUEEZE',
    'CAP_PLY': 'N - CAP_PLY'
};

const PREFERRED_ORDER = [
    'INNER_LINER',
    'CARCASS_PLY',
    'SIDEWALL',
    'TREAD',
    'BEAD',
    'BEAD_AND_BEAD_FILLER_PREASSEMBLY',
    'CHAFER',
    'GREEN_TIRE',
    'STEEL_BELT',
    'PLY',
    'BELT_AND_EDGE_GUM_PREASSEMBLY',
    'SQUEEZE',
    'CAP_PLY'
];

let productTypes = [];
let configMap = {};
let limitaryHoursMap = {};
let expdaysMap = {};
let currentProductType = '';
let productTypeSearchTimeout = null;

function getProductTypeLabel(pt) {
    if (!pt) return '';
    return PRODUCT_TYPE_DISPLAY_MAP[pt.toUpperCase()] || pt;
}

function findProductType(val) {
    if (!val) return null;
    const clean = val.trim().toUpperCase();

    // 1. Exact match against display label (e.g. "I - INNER_LINER")
    for (const pt of productTypes) {
        if (getProductTypeLabel(pt).toUpperCase() === clean) {
            return pt;
        }
    }

    // 2. Exact match against raw product type (e.g. "INNER_LINER")
    for (const pt of productTypes) {
        if (pt.toUpperCase() === clean) {
            return pt;
        }
    }

    // 3. Match against unique prefix code (e.g. "I", "W0", "W2")
    const prefixMatches = productTypes.filter(pt => {
        const label = getProductTypeLabel(pt).toUpperCase();
        const parts = label.split(' - ');
        return parts.length === 2 && parts[0].trim() === clean;
    });
    if (prefixMatches.length === 1) {
        return prefixMatches[0];
    }

    return null;
}

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
            // If user typed an exact match, auto-select it and format label
            const val = productTypeInput.value.trim().toUpperCase();
            if (val) {
                const matched = findProductType(val);
                if (matched) {
                    productTypeInput.value = getProductTypeLabel(matched);
                    const box = productTypeInput.closest('.input-box');
                    if (box) box.classList.add('has-value');

                    if (matched !== currentProductType) {
                        selectProductType(matched);
                    }
                }
            }
        }, 220);
    });

    // Typing to filter dropdown items
    productTypeInput.addEventListener('input', (e) => {
        const val = e.target.value.trim().toUpperCase();
        clearTimeout(productTypeSearchTimeout);

        showFilteredDropdown();

        // If exact match while typing, load table
        const matched = findProductType(val);
        if (matched) {
            if (matched !== currentProductType) {
                productTypeSearchTimeout = setTimeout(() => {
                    selectProductType(matched);
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

    const filtered = productTypes.filter(pt => {
        const label = getProductTypeLabel(pt).toUpperCase();
        const raw = pt.toUpperCase();
        return label.includes(val) || raw.includes(val);
    });

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
        const label = getProductTypeLabel(pt);
        item.textContent = label;
        item.title = label;
        item.dataset.value = pt;

        if (pt === currentProductType) {
            item.classList.add('selected');
        }

        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            clearTimeout(productTypeSearchTimeout);
            const input = document.getElementById('product_type');
            input.value = label;
            const box = input.closest('.input-box');
            if (box) box.classList.add('has-value');
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

        let rawTypes = res.product_types || [];
        rawTypes.sort((a, b) => {
            const idxA = PREFERRED_ORDER.indexOf(a);
            const idxB = PREFERRED_ORDER.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
        });

        productTypes = rawTypes;
        configMap = res.config_map || {};
        limitaryHoursMap = res.limitary_hours || {};
        expdaysMap = res.expdays || {};

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

function hoursToDays(hours) {
    if (hours === null || hours === undefined || hours === '' || isNaN(hours)) return '-';
    const num = Number(hours);
    const days = num / 24;
    return Number.isInteger(days) ? days : +(days.toFixed(2));
}

function updateLimitaryHoursDisplay(ptype) {
    const standingTimeVal = document.getElementById('standingTimeVal');
    const limitaryHourVal = document.getElementById('limitaryHourVal');
    const expdayVal = document.getElementById('expdayVal');

    if (!standingTimeVal || !limitaryHourVal) return;

    if (!ptype) {
        standingTimeVal.textContent = '-';
        limitaryHourVal.textContent = '-';
        if (expdayVal) expdayVal.textContent = '-';
        return;
    }

    const key = ptype.trim().toUpperCase();
    const lh = limitaryHoursMap[key] || limitaryHoursMap[ptype];

    if (lh) {
        standingTimeVal.textContent = (lh.standing_time !== null && lh.standing_time !== undefined) ? lh.standing_time : '-';
        limitaryHourVal.textContent = (lh.limitary_hour !== null && lh.limitary_hour !== undefined) ? hoursToDays(lh.limitary_hour) : '-';
    } else {
        standingTimeVal.textContent = '-';
        limitaryHourVal.textContent = '-';
    }

    if (expdayVal) {
        const ed = expdaysMap[key] || expdaysMap[ptype];
        expdayVal.textContent = (ed !== null && ed !== undefined && ed !== '') ? ed : '-';
    }
}

function selectProductType(ptype, force = false) {
    if (!ptype) return;
    clearTimeout(productTypeSearchTimeout);

    if (!force && ptype === currentProductType) {
        return;
    }
    currentProductType = ptype;

    const label = getProductTypeLabel(ptype);
    const rows = configMap[ptype] || [];
    const columns = ['key', 'VN', 'CN', 'TW', 'EN', 'ID'];

    // Update standing-time and limitary-hour stats in table footer
    updateLimitaryHoursDisplay(ptype);

    setTableData(
        rows,
        columns,
        'technical_specifications',
        `Không có thông số kỹ thuật nào cho loại sản phẩm: ${label}`,
        `Tải thành công thông số kỹ thuật: ${label} (${rows.length} dòng)`
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

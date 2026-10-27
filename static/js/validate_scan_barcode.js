let stations = [];
let currentDepartmentOid = null;
let departmentSearchTimeout = null;
let stationSearchTimeout = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    if (typeof getDepartments === 'function') {
        departments = await getDepartments();
    }
    initializeValidateScanBarcodeEventListeners();
    
    // Initialize: disable station on load
    document.getElementById('station').disabled = true;
    
    // Context menu outside click handled by main.js
    
    // Close comparison modal on outside click
    document.getElementById('comparisonModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeComparisonModal();
        }
    });
});

function initializeValidateScanBarcodeEventListeners() {
    document.addEventListener('sidebar:about', () => {
        showAbout();
    });

    // Department search
    const departmentInput = document.getElementById('department'); 
    departmentInput.addEventListener('click', () => {
        departmentInput.value = '';
        departmentInput.closest('.input-box')?.classList.remove('has-value');
        departmentInput.focus();

        const stationInput = document.getElementById('station');
        stationInput.value = '';
        stationInput.disabled = true;
        stationInput.closest('.input-box')?.classList.remove('has-value');
        hideStationDropdown();

        stations = [];
        currentDepartmentOid = null;
        clearTable();
        showDepartmentDropdown(departments);
    });

    departmentInput.addEventListener('input', (e) => {
        const value = e.target.value.trim().toUpperCase();
        clearTimeout(departmentSearchTimeout);

        if (!value) {
            currentDepartmentOid = null;
            stations = [];

            const stationInput = document.getElementById('station');
            stationInput.value = '';
            stationInput.disabled = true;
            stationInput.closest('.input-box')?.classList.remove('has-value');
            hideStationDropdown();

            clearTable();
            showDepartmentDropdown(departments);
            return;
        }
        // Filter and show dropdown immediately
        const keyword = value.toUpperCase();
        const filtered = departments.filter(dept => {
            const id = (dept.id || dept.departmentId || dept.departmentID || '').toUpperCase();
            return id.includes(keyword);
        });
        
        if (filtered.length > 0) {
            showDepartmentDropdown(filtered);
        } else {
            hideDepartmentDropdown();
        }
        
        // Check if value matches a complete department ID (with delay)
        departmentSearchTimeout = setTimeout(() => {
            checkAndLoadStations();
        }, 500);
    });
    
    departmentInput.addEventListener('focus', () => {
        showDepartmentDropdown(departments);
    });
    
    departmentInput.addEventListener('blur', () => {
        setTimeout(() => {
            hideDepartmentDropdown();
            checkAndLoadStations();
        }, 200);
    });
    
    // Station search
    const stationInput = document.getElementById('station');
    stationInput.addEventListener('click', () => {
        // Only show dropdown if station is enabled
        if (!stationInput.disabled) {
            showStationDropdown(stations);
        }
    });
    
    stationInput.addEventListener('input', (e) => {
        // Prevent input if disabled
        if (stationInput.disabled) {
            e.preventDefault();
            return;
        }
        
        const value = e.target.value.trim();
        clearTimeout(stationSearchTimeout);

        // Always update dropdown immediately when typing
        if (!value) {
            clearTable();
            showStationDropdown(stations);
            return;
        }
        
        // Filter and show dropdown immediately
        const keyword = value.toUpperCase();
        const filtered = stations.filter(station => {
            const id = (station.id || '').toUpperCase();
            const name = (station.name || '').toUpperCase();
            return id.includes(keyword) || name.includes(keyword);
        });
            
        filtered.length
        ? showStationDropdown(filtered)
        : hideStationDropdown();
    });
    
    stationInput.addEventListener('focus', () => {
        if (!stationInput.disabled) {
            showStationDropdown(stations);
        }
    });
    
    stationInput.addEventListener('blur', () => {
        hideStationDropdown();
    });
    
    // Table row selection
    document.getElementById('tableBody').addEventListener('click', handleRowClick);
    document.getElementById('tableBody').addEventListener('contextmenu', handleContextMenu);
    
    // Context menu item for validate_scan_barcode
    const validateMenuItem = document.querySelector('.context-menu-item[data-action="validate_scan_barcode"]');
    if (validateMenuItem) {
        validateMenuItem.addEventListener('click', (e) => {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            handleContextMenuAction(e);
        });
    }
}

function showDepartmentDropdown(items) {
    const dropdown = document.getElementById('department-dropdown');
    dropdown.innerHTML = '';
    
    if (items.length === 0) {
        dropdown.classList.remove('show');
        return;
    }
    
    items.forEach(dept => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        const deptId = dept.id || dept.departmentId || dept.departmentID || '';
        item.textContent = deptId;
        item.dataset.value = deptId;
        item.addEventListener('mousedown', async (e) => {
            e.preventDefault();
            const input = document.getElementById('department');
            input.value = deptId;
            input.closest('.input-box')?.classList.add('has-value');
            currentDepartmentOid = dept.id;
            hideDepartmentDropdown();
            input.blur();

            const stationInput = document.getElementById('station');
            stationInput.value = '';
            stationInput.disabled = true;
            stationInput.closest('.input-box')?.classList.remove('has-value');
            hideStationDropdown();
            clearTable();

            // Load stations when department is selected
            await loadStations(currentDepartmentOid);
            stationInput.disabled = false;
        });
        dropdown.appendChild(item);
    });
    
    dropdown.classList.add('show');
}

function hideDepartmentDropdown() {
    document.getElementById('department-dropdown').classList.remove('show');
}

function handleDepartmentSearch() {
    const keyword = document.getElementById('department').value.trim().toUpperCase();
    
    if (!keyword) {
        // If no keyword, show all departments
        showDepartmentDropdown(departments);
        return;
    }
    
    // Filter departments
    const filtered = departments.filter(dept => {
        const id = (dept.id || dept.departmentId || dept.departmentID || '').toUpperCase();
        return id.includes(keyword);
    });
    
    // Always show dropdown if we have results, even if filtered
    if (filtered.length > 0) {
        showDepartmentDropdown(filtered);
    } else {
        // If no results, still show dropdown but empty (or hide it)
        hideDepartmentDropdown();
    }
}

async function handleDepartmentChange() {
    const departmentValue = document.getElementById('department').value.trim();
    const stationInput = document.getElementById('station');
    if (!departmentValue) {
        stationInput.disabled = true;
        stationInput.value = '';
        stationInput.closest('.input-box')?.classList.remove('has-value');
        hideStationDropdown();
        stations = [];
        currentDepartmentOid = null;
        clearTable();
        return;
    }
    
    // Find department OID - try exact match first
    let dept = departments.find(d => (d.id || d.departmentId || d.departmentID) === departmentValue);
    
    // If not found, try case-insensitive match
    if (!dept) {
        dept = departments.find(d => {
            const id = (d.id || d.departmentId || d.departmentID || '').toUpperCase();
            return id === departmentValue.toUpperCase();
        });
    }
    
    if (!dept) {
        stationInput.disabled = true;
        stationInput.value = '';
        stationInput.closest('.input-box')?.classList.remove('has-value');
        hideStationDropdown();
        stations = [];
        currentDepartmentOid = null;
        clearTable();
        return;
    }
    
    currentDepartmentOid = dept.id;
    stationInput.value = '';
    stationInput.disabled = true;
    stationInput.closest('.input-box')?.classList.remove('has-value');
    hideStationDropdown();
    clearTable();
    await loadStations(currentDepartmentOid);
    stationInput.disabled = false;
}

// Check if department value is complete and trigger station load
async function checkAndLoadStations() {
    const departmentValue = document.getElementById('department').value.trim();
    const stationInput = document.getElementById('station');
    if (!departmentValue) {
        stationInput.disabled = true;
        stationInput.value = '';
        stationInput.closest('.input-box')?.classList.remove('has-value');
        hideStationDropdown();
        stations = [];
        currentDepartmentOid = null;
        clearTable();
        return;
    }
    
    // Check if the value matches exactly with a department
    const dept = departments.find(d => {
        const id = (d.id || d.departmentId || d.departmentID || '').toUpperCase();
        return id === departmentValue.toUpperCase();
    });
    
    if (dept) {
        // Found exact match, load stations
        const deptOid = dept.id || dept.departmentId || dept.departmentID;
        if (currentDepartmentOid !== deptOid || stations.length === 0) {
            currentDepartmentOid = deptOid;
            stationInput.value = '';
            stationInput.disabled = true;
            stationInput.closest('.input-box')?.classList.remove('has-value');
            hideStationDropdown();
            clearTable();
            await loadStations(currentDepartmentOid);
            stationInput.disabled = false;
        }
    } else {
        stationInput.disabled = true;
        stationInput.value = '';
        stationInput.closest('.input-box')?.classList.remove('has-value');
        hideStationDropdown();
        stations = [];
        currentDepartmentOid = null;
        clearTable();
    }
}

async function loadStations(departmentOid) {
    try {
        const response = await fetch('/api/departments/stations', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({department_oid: departmentOid})
        });
        let data = null;
        try {
            data = await response.json();
        } catch (e) {}

        if (typeof isUnauthorizedResponse === 'function' && isUnauthorizedResponse(response.status, data)) {
            if (typeof showAuthExpiredModal === 'function') {
                showAuthExpiredModal(data ? data.message : null);
            }
            stations = [];
            return;
        }
        stations = (data && data.stations) || [];
    } catch (error) {
        console.error('Error loading stations:', error);
        stations = [];
    }
}

function showStationDropdown(items) {
    const dropdown = document.getElementById('station-dropdown');
    dropdown.innerHTML = '';
    
    if (items.length === 0) {
        dropdown.classList.remove('show');
        return;
    }
    
    items.forEach(station => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        const stationId = station.id || station.ID || station.name || (typeof station === 'string' ? station : '');
        item.textContent = stationId;
        item.dataset.value = stationId;
        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const input = document.getElementById('station');
            input.value = stationId;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            hideStationDropdown();
            input.blur();
            checkAndSearchWorkOrders();
        });
        dropdown.appendChild(item);
    });
    
    dropdown.classList.add('show');
}

function hideStationDropdown() {
    document.getElementById('station-dropdown').classList.remove('show');
}

function checkAndSearchWorkOrders() {
    const department = document.getElementById('department').value.trim();
    const station = document.getElementById('station').value.trim();


    if (!department || !station) {
        clearTable();
        return;
    }

    searchWorkOrders(station);
}

async function searchWorkOrders(station) {
    try {
        if (typeof showTableSkeleton === 'function') {
            showTableSkeleton(6, 5);
        }

        const data = await apiFetch('/api/work-orders/get-active-list', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({station})
        });
        
        if (!data || !data.result || data.result.length === 0) {
            setTableData([], data ? data.columns : [], null, `Máy ${station} đang không có đơn điều động nào đang hoạt động`);
            return;
        }

        setTableData(data.result, data.columns, null, null, `Tìm thấy ${data.result.length} đơn điều động`);

    } catch (error) {
        console.error('Error searching work orders:', error);
        clearTable();
    }
}

function handleRowClick(e) {
    const row = (e && e.target) ? e.target.closest('tr') : (e && e.closest ? e.closest('tr') : (selectedRow || null));
    if (!row || row.querySelector('.table-empty-state') || row.classList.contains('skeleton-row')) return;
    
    // Remove previous selection
    document.querySelectorAll('#tableBody tr, .table-container tbody tr').forEach(r => r.classList.remove('selected'));
    
    // Add selection to current row
    row.classList.add('selected');
    selectedRow = row;
    
    // Get row data
    const cells = row.querySelectorAll('td');
    const columns = Array.from(document.querySelectorAll('#tableHead th')).map(th => th.textContent.trim());
    const rawData = {};
    columns.forEach((col, index) => {
        const cell = cells[index];
        rawData[col] = (cell?.dataset?.fullValue !== undefined) ? cell.dataset.fullValue : (cell?.textContent.trim() || '');
    });
    if (typeof normalizeRowData === 'function') {
        selectedRowData = normalizeRowData(rawData);
    } else {
        selectedRowData = rawData;
    }
    window.selectedRowData = selectedRowData;
}

function handleContextMenu(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const row = (e && e.target) ? e.target.closest('tr') : (selectedRow || null);
    if (!row) return;
    
    handleRowClick(e);
    
    if (typeof handleContextMenuUnified === 'function') {
        handleContextMenuUnified(e, 'main');
    } else {
        const contextMenu = document.getElementById('contextMenu');
        if (contextMenu) {
            const item = contextMenu.querySelector('[data-action="validate_scan_barcode"]');
            if (item) item.style.display = 'flex';
            contextMenu.style.display = 'block';
            contextMenu.style.left = ((e && e.pageX) || 10) + 'px';
            contextMenu.style.top = ((e && e.pageY) || 10) + 'px';
        }
    }
}

function handleContextMenuAction(e) {
    if (e && typeof e.stopPropagation === 'function') {
        e.stopPropagation();
    }
    const item = (e && e.target) ? e.target.closest('.context-menu-item') : null;
    const action = item ? item.dataset.action : null;
    
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) contextMenu.style.display = 'none';

    if (!action) return;

    if (action === 'validate_scan_barcode') {
        validateScanBarcode();
    }
}
window.handleContextMenuAction = handleContextMenuAction;

async function validateScanBarcode() {
    let rowData = selectedRowData;
    if (!rowData && selectedRow) {
        handleRowClick({ target: selectedRow });
        rowData = selectedRowData;
    }

    const recipeId = rowData ? (rowData['recipe_id'] || rowData['recipeId'] || rowData['recipe'] || '') : '';
    const station = rowData ? (rowData['station'] || '') : (document.getElementById('station')?.value || '');
    
    if (!recipeId || !station) {
        showAlert('Thiếu thông tin recipe_id hoặc station', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/api/stations/validate-scan-barcode', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({recipe_id: recipeId, station: station})
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
        
        if (data && data.success) {
            const workOrderId = rowData ? (rowData['id'] || rowData['ID'] || '') : '';
            displayComparison(data.result, recipeId, station, workOrderId);
        } else {
            showAlert((data && data.message) || 'Có lỗi xảy ra', 'error');
        }
    } catch (error) {
        console.error('Error checking recipe:', error);
        showAlert('Lỗi kết nối', 'error');
    }
}

function getValidationStatusText(item) {
    if (!item._hasBarcode) {
        return 'Chưa quét tem';
    }
    const reasons = [];
    if (!item._isMatch) {
        reasons.push('Sai quy cách');
    }
    if (item._isEmptyQuantity) {
        reasons.push('Hết số lượng');
    }
    if (item._isExpired) {
        reasons.push('Hết Hạn');
    }
    return reasons.length > 0 ? reasons.join(', ') : 'Sai quy cách';
}

async function copyValidationRowText(event, btnElement) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const textToCopy = btnElement?.dataset?.copyText;
    if (!textToCopy) return;

    try {
        await navigator.clipboard.writeText(textToCopy);
    } catch (err) {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
        } catch (e) {
            console.error('Copy fallback failed:', e);
        }
        document.body.removeChild(textarea);
    }

    // Visual feedback
    if (btnElement) {
        const originalHTML = btnElement.innerHTML;
        btnElement.classList.add('copied');
        btnElement.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">check</span><span>Đã copy!</span>';
        
        setTimeout(() => {
            btnElement.classList.remove('copied');
            btnElement.innerHTML = originalHTML;
        }, 2000);
    }
}
window.copyValidationRowText = copyValidationRowText;

function displayComparison(result, recipeId, station, workOrderId) {
    const modal = document.getElementById('comparisonModal');
    const content = document.getElementById('comparisonContent');
    const badgesEl = document.getElementById('comparisonBadges');
    const footerInfoEl = document.getElementById('comparisonFooterInfo');
    const modalWorkOrderIdEl = document.getElementById('modalWorkOrderId');
    const modalStationEl = document.getElementById('modalStation');
    const modalRecipeIdEl = document.getElementById('modalRecipeId');
    
    if (!result || !Array.isArray(result)) {
        result = [];
    }

    // Populate Work Order ID (Mã MES), Station and Recipe ID in Header
    const currentWorkOrderId = workOrderId || (selectedRowData ? (selectedRowData['id'] || selectedRowData['ID'] || '') : '') || '--';
    const currentRecipeId = recipeId || (selectedRowData ? selectedRowData['recipe_id'] : '') || '--';
    const currentStation = station || (selectedRowData ? selectedRowData['station'] : '') || (document.getElementById('station')?.value || '') || '--';

    if (modalWorkOrderIdEl) {
        modalWorkOrderIdEl.textContent = currentWorkOrderId;
    }
    if (modalStationEl) {
        modalStationEl.textContent = currentStation;
    }
    if (modalRecipeIdEl) {
        modalRecipeIdEl.textContent = currentRecipeId;
    }

    // Get current time in UTC+7 (Asia/Ho_Chi_Minh)
    const now = new Date();
    const utc7Offset = 7 * 60; // minutes
    const localOffset = now.getTimezoneOffset(); // minutes
    const currentTimeUTC7 = new Date(now.getTime() + (utc7Offset + localOffset) * 60 * 1000);
    
    // Evaluate validity for each item
    // An item is valid ONLY if:
    // 1. Has barcode
    // 2. Recipe matches YAML (item.match === true)
    // 3. Not expired (!isExpired)
    // 4. Has remaining quantity (> 0)
    const evaluatedItems = result.map(item => {
        const hasBarcode = Boolean(item.site_barcode && String(item.site_barcode).trim());
        const isMatch = Boolean(item.match);
        const isExpired = item.expiry_time
            ? new Date(item.expiry_time) < currentTimeUTC7
            : false;
        const isEmptyQuantity = (item.quantity !== null && item.quantity !== undefined)
            ? Number(item.quantity) <= 0
            : false;

        const isValid = hasBarcode && isMatch && !isExpired && !isEmptyQuantity;

        return {
            ...item,
            _hasBarcode: hasBarcode,
            _isMatch: isMatch,
            _isExpired: isExpired,
            _isEmptyQuantity: isEmptyQuantity,
            _isValid: isValid
        };
    });

    // Calculate statistics
    const totalCount = evaluatedItems.length;
    const validCount = evaluatedItems.filter(item => item._isValid).length;
    const issueCount = totalCount - validCount;

    if (badgesEl) {
        badgesEl.innerHTML = `
            <span class="comparison-badge total">Tổng: ${totalCount}</span>
            <span class="comparison-badge match"><span class="material-symbols-outlined">check_circle</span> OK: ${validCount}</span>
            ${issueCount > 0 ? `<span class="comparison-badge mismatch"><span class="material-symbols-outlined">warning</span> NG: ${issueCount}</span>` : ''}
        `;
    }

    // Create comparison table
    let html = '<table class="comparison-table">';
    html += '<thead><tr>';
    html += '<th style="width: 24%;">Site (Trạm)</th>';
    html += '<th style="width: 42%;">Tem Đầu Vào</th>';
    html += '<th style="width: 22%;">Quy Cách YAML</th>';
    html += '<th style="width: 12%; text-align: center;">Trạng thái</th>';
    html += '</tr></thead>';
    html += '<tbody>';
    
    evaluatedItems.forEach(item => {
        let rowClass = 'row-match';
        if (!item._isValid) {
            if (!item._hasBarcode || !item._isMatch) {
                rowClass = 'row-mismatch';
            } else if (item._isExpired) {
                rowClass = 'row-mismatch row-expired';
            } else if (item._isEmptyQuantity) {
                rowClass = 'row-mismatch row-empty-quantity';
            } else {
                rowClass = 'row-mismatch';
            }
        }
        
        html += `<tr class="comparison-row ${rowClass}">`;
        
        // 1. Site
        html += `<td class="site-cell"><strong>${escapeHtml(item.site || '')}</strong></td>`;
        
        // 2. NVL column - show site_id (recipe name), barcode, quantity, expiry
        html += '<td class="material-cell">';
        const isMismatch = Boolean(item._hasBarcode && !item._isMatch);
        const isSubstitute = Boolean(item.is_substitute || item.substituted);
        let siteBadgeHtml = '';
        if (isMismatch) {
            siteBadgeHtml = ' <span class="badge-tag-mismatch">SAI QUY CÁCH</span>';
        } else if (isSubstitute) {
            siteBadgeHtml = ` <span class="badge-tag-substitute" title="Nguyên liệu thay thế hợp lệ cho quy cách ${escapeHtml(item.recipe_name || '')}">THAY THẾ</span>`;
        }
        html += `<div class="site-id-text${isMismatch ? ' mismatch' : (isSubstitute ? ' substitute' : '')}">${item.site_id ? escapeHtml(item.site_id) : '<span class="empty-cell">N/A</span>'}${siteBadgeHtml}</div>`;
        
        // Copy error button helper
        const renderCopyBtn = () => {
            if (!item._isMatch || !item._isValid || item.match === false) {
                const statusText = getValidationStatusText(item);
                const copyText = `Trạm ${item.site || ''} Tem ${item.site_barcode || ''} ${statusText}`.replace(/\s+/g, ' ').trim();
                return `<button type="button" class="comparison-copy-btn" data-copy-text="${escapeHtml(copyText)}" onclick="copyValidationRowText(event, this)" title="Sao chép thông tin lỗi: ${escapeHtml(copyText)}" aria-label="Sao chép thông tin lỗi">` +
                    `<span class="material-symbols-outlined" aria-hidden="true">content_copy</span>` +
                    `<span>Copy</span>` +
                `</button>`;
            }
            return '';
        };

        if (item._hasBarcode) {
            let barcodeClass = 'barcode-highlight';
            if (item._isEmptyQuantity) {
                barcodeClass += ' empty-quantity';
            } else if (item._isExpired) {
                barcodeClass += ' expired';
            }

            // barcode row with inline copy button
            html += `<div class="barcode-row-wrap">`;
            html += `<div class="${barcodeClass}"><span class="material-symbols-outlined barcode-icon">qr_code_2</span>${escapeHtml(item.site_barcode)}</div>`;
            html += renderCopyBtn();
            html += `</div>`;

            // Số lượng & HSD
            const quantityText = (item.quantity !== null && item.quantity !== undefined)
                ? item.quantity
                : 'N/A';
            const expiryText = item.expiry_time
                ? new Date(item.expiry_time).toLocaleString('vi-VN')
                : 'N/A';

            html += `<div class="barcode-meta-row">`;
            html += `<span class="meta-item${item._isEmptyQuantity ? ' empty-quantity' : ''}"><span class="material-symbols-outlined">inventory_2</span> SL: <strong>${escapeHtml(String(quantityText))}</strong>${item._isEmptyQuantity ? ' <span class="badge-tag-empty-qty">HẾT SỐ LƯỢNG</span>' : ''}</span>`;
            html += `<span class="meta-item${item._isExpired ? ' expired' : ''}"><span class="material-symbols-outlined">schedule</span> HSD: <strong>${escapeHtml(expiryText)}</strong>${item._isExpired ? ' <span class="badge-tag-expired">HẾT HẠN</span>' : ''}</span>`;
            html += `</div>`;
        } else {
            html += `<div class="barcode-row-wrap">`;
            html += `<div class="empty-cell">Chưa quét tem</div>`;
            html += renderCopyBtn();
            html += `</div>`;
        }
        html += '</td>';
        
        // 3. YAML column - show recipe_name (line 1) and Hao dùng (line 2)
        const usageVal = (item.mid !== null && item.mid !== undefined && item.mid !== '')
            ? item.mid
            : ((item.usage !== null && item.usage !== undefined && item.usage !== '')
                ? item.usage
                : ((item.hao_dung !== null && item.hao_dung !== undefined && item.hao_dung !== '') ? item.hao_dung : null));

        let yamlHtml = `<div class="yaml-recipe-name">${item.recipe_name ? escapeHtml(item.recipe_name) : '<span class="empty-cell">N/A</span>'}</div>`;
        if (usageVal !== null && usageVal !== undefined && usageVal !== '') {
            const unitTitle = item.unit ? ` title="Đơn vị: ${escapeHtml(String(item.unit))}"` : '';
            yamlHtml += `<div class="yaml-usage-text"${unitTitle}>Hao dùng : ${escapeHtml(String(usageVal))}</div>`;
        }
        html += `<td class="yaml-cell">${yamlHtml}</td>`;
        
        // 4. Status
        html += '<td class="status-cell" style="text-align: center;">';
        if (!item._hasBarcode) {
            html += '<span class="status-pill status-missing"><span class="material-symbols-outlined">qr_code_scanner</span> CHƯA QUÉT</span>';
        } else if (!item._isMatch) {
            html += '<span class="status-pill status-mismatch"><span class="material-symbols-outlined">close</span> SAI QUY CÁCH</span>';
        } else if (item._isExpired && item._isEmptyQuantity) {
            html += '<span class="status-pill status-expired"><span class="material-symbols-outlined">schedule</span> HẾT HẠN & SL</span>';
        } else if (item._isExpired) {
            html += '<span class="status-pill status-expired"><span class="material-symbols-outlined">schedule</span> HẾT HẠN</span>';
        } else if (item._isEmptyQuantity) {
            html += '<span class="status-pill status-empty-qty"><span class="material-symbols-outlined">production_quantity_limits</span> HẾT SỐ LƯỢNG</span>';
        } else if (item.is_substitute || item.substituted) {
            html += `<span class="status-pill status-substitute" title="Quy cách chuẩn: ${escapeHtml(item.recipe_name || '')} - Sử dụng NVL thay thế hợp lệ"><span class="material-symbols-outlined">swap_horiz</span> THAY THẾ (OK)</span>`;
        } else {
            html += '<span class="status-pill status-match"><span class="material-symbols-outlined">check</span> OK</span>';
        }
        html += '</td>';

        html += '</tr>';
    });
    
    html += '</tbody></table>';
    content.innerHTML = html;
    modal.classList.remove('hidden');
    modal.classList.add('show');
}

function closeComparisonModal() {
    const modal = document.getElementById('comparisonModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('show');
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('comparisonModal');
    if (event.target === modal) {
        closeComparisonModal();
    }
};
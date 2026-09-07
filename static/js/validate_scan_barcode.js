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
    
    // Close context menu on click outside
    document.addEventListener('click', function() {
        document.getElementById('contextMenu').style.display = 'none';
    });
    
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

    document.addEventListener('sidebar:logout', () => {
        handleLogout();
    });

    // Department search
    const departmentInput = document.getElementById('department'); 
    departmentInput.addEventListener('click', () => {
        showDepartmentDropdown(departments);
    })

    departmentInput.addEventListener('input', (e) => {
        const value = e.target.value.trim().toUpperCase();
        clearTimeout(departmentSearchTimeout);

        if (!value) {
            showDepartmentDropdown(departments);
            
            document.getElementById('station').disabled = true;
            document.getElementById('station').value = '';
            hideStationDropdown();
            
            stations = [];
            return;
        }
        // Filter and show dropdown immediately
        const keyword = value.toUpperCase();
        const filtered = departments.filter(dept => {
            const id = (dept.id || '').toUpperCase();
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
    
    // Context menu item
    document.querySelector('.context-menu-item').addEventListener('click', handleContextMenuAction);
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
        const deptId = dept.id || '';
        item.textContent = deptId;
        item.dataset.value = deptId;
        item.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent blur event
            document.getElementById('department').value = deptId;
            currentDepartmentOid = dept.id;
            hideDepartmentDropdown();
            // Load stations when department is selected
            loadStations(currentDepartmentOid).then(() => {
                document.getElementById('station').disabled = false;
            });
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
        const id = (dept.id || '').toUpperCase();
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
    if (!departmentValue) {
        document.getElementById('station').disabled = true;
        document.getElementById('station').value = '';
        stations = [];
        return;
    }
    
    // Find department OID - try exact match first
    let dept = departments.find(d => (d.id) === departmentValue);
    
    // If not found, try case-insensitive match
    if (!dept) {
        dept = departments.find(d => {
            const id = (d.id || '').toUpperCase();
            return id === departmentValue.toUpperCase();
        });
    }
    
    if (!dept) {
        document.getElementById('station').disabled = true;
        return;
    }
    
    currentDepartmentOid = dept.id;
    await loadStations(currentDepartmentOid);
    document.getElementById('station').disabled = false;
}

// Check if department value is complete and trigger station load
async function checkAndLoadStations() {
    const departmentValue = document.getElementById('department').value.trim();
    if (!departmentValue) {
        return;
    }
    
    // Check if the value matches exactly with a department
    const dept = departments.find(d => {
        const id = (d.id || '').toUpperCase();
        return id === departmentValue.toUpperCase();
    });
    
    if (dept) {
        // Found exact match, load stations
        const deptOid = dept.id;
        if (currentDepartmentOid !== deptOid || stations.length === 0) {
            currentDepartmentOid = deptOid;
            await loadStations(currentDepartmentOid);
            document.getElementById('station').disabled = false;
        }
    }
}

async function loadStations(departmentOid) {
    try {
        const response = await fetch('/api/departments/stations', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({department_oid: departmentOid})
        });
        const data = await response.json();
        stations = data.stations || [];
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
        const stationId = station.id || '';
        item.textContent = stationId;
        item.dataset.value = stationId;
        item.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent blur event
            document.getElementById('station').value = stationId;
            hideStationDropdown();
            checkAndSearchWorkOrders()
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
        
        if (Array.isArray(data.result) && data.result.length === 0) {
            await showAlert(`Máy ${station} đang không có đơn điều động nào đang hoạt động`, 'error');
            clearTable();
            return;
        }

        setTableData(data.result, data.columns, null);

    } catch (error) {
        console.error('Error searching work orders:', error);
        clearTable();
    }
}

function handleRowClick(e) {
    const row = e.target.closest('tr');
    if (!row) return;
    
    // Remove previous selection
    document.querySelectorAll('#tableBody tr').forEach(r => r.classList.remove('selected'));
    
    // Add selection to current row
    row.classList.add('selected');
    selectedRow = row;
    
    // Get row data
    const cells = row.querySelectorAll('td');
    const columns = Array.from(document.querySelectorAll('#tableHead th')).map(th => th.textContent);
    selectedRowData = {};
    columns.forEach((col, index) => {
        selectedRowData[col] = cells[index]?.textContent || '';
    });
}

function handleContextMenu(e) {
    e.preventDefault();
    const row = e.target.closest('tr');
    if (!row) return;
    
    handleRowClick(e);
    
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.style.display = 'block';
    contextMenu.style.left = e.pageX + 'px';
    contextMenu.style.top = e.pageY + 'px';
}

function handleContextMenuAction(e) {
    const action = e.target.dataset.action;
    if (!selectedRowData) return;
    
    if (action === 'validate_scan_barcode') {
        validateScanBarcode();
    }
    
    document.getElementById('contextMenu').style.display = 'none';
}

async function validateScanBarcode() {
    const recipeId = selectedRowData ? (selectedRowData['recipe_id'] || '') : '';
    const station = selectedRowData ? (selectedRowData['station'] || '') : (document.getElementById('station')?.value || '');
    
    if (!recipeId || !station) {
        alert('Thiếu thông tin recipe_id hoặc station');
        return;
    }
    
    try {
        const response = await fetch('/api/stations/validate-scan-barcode', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({recipe_id: recipeId, station: station})
        });
        
        const data = await response.json();
        if (data.success) {
            displayComparison(data.result, recipeId, station);
        } else {
            alert(data.message || 'Có lỗi xảy ra');
        }
    } catch (error) {
        console.error('Error checking recipe:', error);
        alert('Lỗi kết nối');
    }
}

function displayComparison(result, recipeId, station) {
    const modal = document.getElementById('comparisonModal');
    const content = document.getElementById('comparisonContent');
    const badgesEl = document.getElementById('comparisonBadges');
    const footerInfoEl = document.getElementById('comparisonFooterInfo');
    const modalStationEl = document.getElementById('modalStation');
    const modalRecipeIdEl = document.getElementById('modalRecipeId');
    
    if (!result || !Array.isArray(result)) {
        result = [];
    }

    // Populate Station and Recipe ID in Header
    const currentRecipeId = recipeId || (selectedRowData ? selectedRowData['recipe_id'] : '') || '--';
    const currentStation = station || (selectedRowData ? selectedRowData['station'] : '') || (document.getElementById('station')?.value || '') || '--';

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
        html += `<div class="site-id-text">${item.site_id ? escapeHtml(item.site_id) : '<span class="empty-cell">N/A</span>'}</div>`;
        if (item._hasBarcode) {
            let barcodeClass = 'barcode-highlight';
            if (item._isEmptyQuantity) {
                barcodeClass += ' empty-quantity';
            } else if (item._isExpired) {
                barcodeClass += ' expired';
            }

            // barcode
            html += `<div class="${barcodeClass}"><span class="material-symbols-outlined barcode-icon">qr_code_2</span>${escapeHtml(item.site_barcode)}</div>`;

            // Số lượng & HSD
            const quantityText = (item.quantity !== null && item.quantity !== undefined)
                ? item.quantity
                : 'N/A';
            const expiryText = item.expiry_time
                ? new Date(item.expiry_time).toLocaleString('vi-VN')
                : 'N/A';

            html += `<div class="barcode-meta-row">`;
            html += `<span class="meta-item"><span class="material-symbols-outlined">inventory_2</span> SL: <strong>${escapeHtml(String(quantityText))}</strong></span>`;
            html += `<span class="meta-item${item._isExpired ? ' expired' : ''}"><span class="material-symbols-outlined">schedule</span> HSD: <strong>${escapeHtml(expiryText)}</strong>${item._isExpired ? ' <span class="badge-tag-expired">HẾT HẠN</span>' : ''}</span>`;
            html += `</div>`;
        } else {
            html += '<div class="empty-cell">Chưa quét tem</div>';
        }
        html += '</td>';
        
        // 3. YAML column - only show recipe_name
        html += `<td class="yaml-cell">${item.recipe_name ? escapeHtml(item.recipe_name) : '<span class="empty-cell">N/A</span>'}</td>`;
        
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
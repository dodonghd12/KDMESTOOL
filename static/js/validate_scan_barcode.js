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
    const recipeId = selectedRowData['recipe_id'];
    const station = selectedRowData['station'];
    
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
            displayComparison(data.result);
        } else {
            alert(data.message || 'Có lỗi xảy ra');
        }
    } catch (error) {
        console.error('Error checking recipe:', error);
        alert('Lỗi kết nối');
    }
}

function displayComparison(result) {
    const modal = document.getElementById('comparisonModal');
    const content = document.getElementById('comparisonContent');
    
    // Get current time in UTC+7 (Asia/Ho_Chi_Minh)
    const now = new Date();
    const utc7Offset = 7 * 60; // minutes
    const localOffset = now.getTimezoneOffset(); // minutes
    const currentTimeUTC7 = new Date(now.getTime() + (utc7Offset + localOffset) * 60 * 1000);
    
    // Create comparison table
    let html = '<table class="comparison-table">';
    html += '<thead><tr><th style="width: 30%;">Site</th><th style="width: 35%;">Tem Đầu vào</th><th style="width: 35%;">YAML</th></tr></thead>';
    html += '<tbody>';
    
    result.forEach(item => {
        const rowClass = item.match ? 'match' : 'mismatch';
        
        // Check if expired
        const isExpired = item.expiry_time
            ? new Date(item.expiry_time) < currentTimeUTC7
            : false;

        // Check if quantity <= 0
        const isEmptyQuantity = item.quantity !== null 
            && item.quantity !== undefined 
            && Number(item.quantity) <= 0;
        
        html += `<tr class="${rowClass}">`;
        html += `<td>${item.site || ''}</td>`;
        
        // NVL column - show recipe name (site) and barcode (resource_id)
        html += '<td>';
        html += `<div>${item.site_id || '<span class="empty-cell">N/A</span>'}</div>`;
        if (item.site_barcode) {
            let barcodeClass = 'barcode-highlight';
            if (isEmptyQuantity) {
                barcodeClass += ' empty-quantity';
            } else if (isExpired) {
                barcodeClass += ' expired';
            }

            // barcode
            html += `<div class="${barcodeClass}">${item.site_barcode}</div>`;

            // Số lượng
            const quantityText = (item.quantity !== null && item.quantity !== undefined)
                ? item.quantity
                : 'N/A';
            html += `<div class="barcode-meta">Số lượng: ${quantityText}</div>`;

            // Thời hạn
            const expiryText = item.expiry_time
                ? new Date(item.expiry_time).toLocaleString('vi-VN')
                : 'N/A';
            html += `<div class="barcode-meta${isExpired ? ' expired-text' : ''}">HSD: ${expiryText}</div>`;
        } else {
            html += '<div class="empty-cell">N/A</div>';
        }
        html += '</td>';
        
        // YAML column - only show site_id (name)
        html += '<td>';
        html += `<div>${item.recipe_name || '<span class="empty-cell">N/A</span>'}</div>`;
        html += '</td>';
        
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    content.innerHTML = html;
    modal.classList.add('show');

    speechBubble.show('💡Tip: Barcode màu Xanh là khớp, màu đỏ là không khớp, màu vàng là hết hạn, màu tím là số lượng hết', {
            duration: 20000,
            animation: 'bounce'
        })
}

function closeComparisonModal() {
    const modal = document.getElementById('comparisonModal');
    modal.classList.remove('show');
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('comparisonModal');
    if (event.target === modal) {
        closeComparisonModal();
    }
}
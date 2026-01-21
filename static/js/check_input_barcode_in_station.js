let departments = [];
let stations = [];
let currentDepartmentOid = null;
let departmentSearchTimeout = null;
let stationSearchTimeout = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeCheckMaterialEventListeners();
    
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

function initializeCheckMaterialEventListeners() {
    setTimeout(() => {
        speechBubble.show(`ℹ️ Chức năng này CHỈ sử dụng kiểm tra tem đầu vào của đơn điều động ĐANG HOẠT ĐỘNG trên máy (status = 1)!`, {
            duration: 100000,
            animation: 'bounce'
        });
    }, 1000);

    document.querySelector('.input-box')?.addEventListener('mouseenter', () => {
        speechBubble.show('💡Tip: Chọn bộ phận, sau đó chọn số máy của bộ phận (Có thể nhập để lọc kết quả)!', {
            duration: 10000,
            animation: 'bounce'
        })
    })

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
            // Disable station when department is empty
            hideTableContainer();
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
            hideTableContainer();
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
        const response = await fetch('/api/department/getStationList', {
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
        const data = await apiFetch('/api/getActiveWorkorderList', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({station})
        });
        
        if (Array.isArray(data.result) && data.result.length === 0) {
            await showAlert(`Máy ${station} đang không có đơn điều động nào đang hoạt động`, 'error');
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
    
    if (action === 'check_recipe') {
        checkRecipe();
    }
    
    document.getElementById('contextMenu').style.display = 'none';
}

async function checkRecipe() {
    const recipeId = selectedRowData['recipe_id'];
    const station = selectedRowData['station'];
    
    if (!recipeId || !station) {
        alert('Thiếu thông tin recipe_id hoặc station');
        return;
    }
    
    try {
        const response = await fetch('/api/checkRecipe', {
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
    
    // Create comparison table
    let html = '<table class="comparison-table">';
    html += '<thead><tr><th style="width: 30%;">Site</th><th style="width: 35%;">Tem Đầu vào</th><th style="width: 35%;">YAML</th></tr></thead>';
    html += '<tbody>';
    
    result.forEach(item => {
        const rowClass = item.match ? 'match' : 'mismatch';
        html += `<tr class="${rowClass}">`;
        html += `<td>${item.site || ''}</td>`;
        
        // NVL column - show recipe name (site) and barcode (resource_id)
        html += '<td>';
        html += `<div>${item.recipe_name || '<span class="empty-cell">N/A</span>'}</div>`;
        if (item.site_barcode) {
            html += `<div class="barcode-highlight">${item.site_barcode}</div>`;
        } else {
            html += '<div class="empty-cell">N/A</div>';
        }
        html += '</td>';
        
        // YAML column - only show site_id (name)
        html += '<td>';
        html += `<div>${item.site_id || '<span class="empty-cell">N/A</span>'}</div>`;
        html += '</td>';
        
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    content.innerHTML = html;
    modal.classList.add('show');
}

function closeComparisonModal() {
    document.getElementById('comparisonModal').classList.remove('show');
}
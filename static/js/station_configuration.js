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
    // document.addEventListener('click', function() {
    //     document.getElementById('contextMenu').style.display = 'none';
    // });
    
    // Close comparison modal on outside click
    // document.getElementById('comparisonModal').addEventListener('click', function(e) {
    //     if (e.target === this) {
    //         closeComparisonModal();
    //     }
    // });
});

function initializeValidateScanBarcodeEventListeners() {
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
    
    // Context menu item
    // document.querySelector('.context-menu-item').addEventListener('click', handleContextMenuAction);
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
    const stationInput = document.getElementById('station');

    if (!departmentValue) {
        stationInput.disabled = true;
        stationInput.value = '';
        stationInput.closest('.input-box')?.classList.remove('has-value');
        hideStationDropdown();
        clearTable();
        stations = [];
        currentDepartmentOid = null;
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
        stationInput.disabled = true;
        stationInput.value = '';
        stationInput.closest('.input-box')?.classList.remove('has-value');
        hideStationDropdown();
        clearTable();
        stations = [];
        currentDepartmentOid = null;
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
        clearTable();
        stations = [];
        currentDepartmentOid = null;
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
        clearTable();
        stations = [];
        currentDepartmentOid = null;
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
        const stationId = station.id || '';
        item.textContent = stationId;
        item.dataset.value = stationId;
        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const input = document.getElementById('station');
            input.value = stationId;
            input.closest('.input-box')?.classList.add('has-value');
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

    searchStationConfigurations(station);
}

async function searchStationConfigurations(station) {
    try {
        if (typeof showTableSkeleton === 'function') {
            showTableSkeleton(6, 5);
        }

        const data = await apiFetch('/api/barcodes/get-station-configuration-list', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({station})
        });
        
        if (!data || !data.result || data.result.length === 0) {
            setTableData([], data ? data.columns : [], null, `Máy ${station} chưa có thiết lập nào, cần phải thiết lập!`);
            return;
        }

        setTableData(data.result, data.columns, null, null, `Tìm thấy ${data.result.length} cấu hình máy`);

    } catch (error) {
        console.error('Error searching station configuration:', error);
        clearTable();
    }
}
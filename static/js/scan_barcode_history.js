let departments = [];
let stations = [];
let currentDepartmentOid = null;
let departmentSearchTimeout = null;
let stationSearchTimeout = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeCheckScanHistoryByStationEventListeners();
    initDateRangePicker("scan_barcode_history");

    // Initialize: disable station and dateRange on load
    document.getElementById('station').disabled = true;
    document.getElementById('dateRange').disabled = true;
});

function initializeCheckScanHistoryByStationEventListeners() {

    setTimeout(() => {
        speechBubble.show(`ℹ️ Chức năng này để xem toàn bộ tem đã quét vào máy trong khoảng thời gian nhất định!`, {
            duration: 100000,
            animation: 'bounce'
        });
    }, 1000);

    document.querySelector('.input-box')?.addEventListener('mouseenter', () => {
        speechBubble.show('💡Tip: Chọn bộ phận, sau đó chọn số máy của bộ phận (Có thể nhập để lọc kết quả), và chọn khoảng thời gian!', {
            duration: 10000,
            animation: 'bounce'
        })
    })

    document.querySelector('thead')?.addEventListener('mouseenter', () => {
        speechBubble.show('💡Tip: Click đúp chuột trái để xem chi tiết!', {
            duration: 10000,
            animation: 'bounce'
        })
    })

    document.addEventListener(
        'contextmenu',
        function (e) {
            const tableContainer = document.querySelector('.scan-history-page .table-container');
            if (!tableContainer) return;

            if (tableContainer.contains(e.target)) {
                e.preventDefault();
                e.stopImmediatePropagation();
                return false;
            }
        },
        true
    );

    // Department search
    const departmentInput = document.getElementById('department'); 
    departmentInput.addEventListener('click', () => {
        showDepartmentDropdown(departments);
    })

    departmentInput.addEventListener('input', (e) => {
        const value = e.target.value.trim().toUpperCase();
        clearTimeout(departmentSearchTimeout);

        if (!value) {
            // Show all departments when input is cleared
            hideTableContainer()
            showDepartmentDropdown(departments);

            document.getElementById('station').disabled = true;
            document.getElementById('station').value = '';
            hideStationDropdown();
            
            document.getElementById('dateRange').disabled = true;
            resetDateRange();

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
        if (stationInput.disabled) {
            e.preventDefault();
            return;
        }

        const value = e.target.value.trim();
        clearTimeout(stationSearchTimeout);

        // Always update dropdown immediately when typing
        if (!value) {
            hideTableContainer()
            showStationDropdown(stations);
            
            // Disable dateRange when station is empty
            document.getElementById('dateRange').disabled = true;
            resetDateRange();
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
        showStationDropdown(stations);

    });
    stationInput.addEventListener('blur', () => {
        hideStationDropdown();
    });

    document.getElementById('dateRange')
    ?.addEventListener('input', e => {
        if (!e.target.value) {
            document.getElementById('fromDate').value = '';
            document.getElementById('toDate').value = '';
            checkAndSearchHistoryScanByStation();
        }
    });

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
    const departmentPicked = document.getElementById('department').value.trim();
    const stationPicked = document.getElementById('station').value.trim();
    const fromDatePicked = document.getElementById('fromDate')?.value || '';
    const toDatePicked   = document.getElementById('toDate')?.value || '';

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
            document.getElementById('station').value = stationId;
            document.getElementById('dateRange').disabled = false;
            hideStationDropdown();
            checkAndSearchHistoryScanByStation();
        });
        
        dropdown.appendChild(item);
    });
    
    dropdown.classList.add('show');
}

function hideStationDropdown() {
    document.getElementById('station-dropdown').classList.remove('show');
}

function checkAndSearchHistoryScanByStation() {
    const department = document.getElementById('department').value.trim();
    const station = document.getElementById('station').value.trim();
    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate   = document.getElementById('toDate')?.value || '';

    if (!department || !station || !fromDate || !toDate) {
        clearTable();
        return;
    }
    
    SearchHistoryScanByStation(station, fromDate, toDate);
}

async function SearchHistoryScanByStation(station, fromDate, toDate) {
    if (!station) {
        clearTable();
        return;
    }

    const payload = { station }
    
    if (fromDate && toDate) {
        payload.fromDate = fromDate;
        payload.toDate = toDate;
    }

    const data = await apiFetch('/api/station/searchScanBarcodeHistory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (Array.isArray(data.result) && data.result.length === 0) {
        await showAlert(`Máy ${station} không có lịch sử quét tem từ ${fromDate} đến ${toDate}`, 'error');
        return;
    }

    setTableData(data.result, data.columns, null);
}

function formatDate(date) {
    if (!(date instanceof Date)) return '';

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;
}

function resetDateRange() {
    const dateRangeEl = document.getElementById('dateRange');
    document.getElementById('fromDate').value = '';
    document.getElementById('toDate').value = '';
    dateRangeEl.value = '';
    dateRangeEl.classList.remove('has-value');
    dateRangeEl.disabled = true;
}
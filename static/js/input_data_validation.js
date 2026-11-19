let stations = [];
let currentDepartmentOid = null;
let departmentSearchTimeout = null;
let stationSearchTimeout = null;
let isSelectingDepartment = false;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    if (typeof getDepartments === 'function') {
        departments = await getDepartments();
    }
    initializeInputDataValidationEventListeners();

    // Initialize: disable station on load
    document.getElementById('station').disabled = true;

    // Context menu outside click handled by main.js

    // Close comparison modal on outside click
    document.getElementById('comparisonModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeComparisonModal();
        }
    });

    // Click vào Mã MES (modalWorkOrderId) hoặc Recipe (modalRecipeId) để chuyển về Main và điền vào ô tìm kiếm tương ứng
    const bindMetaTagJump = (tagId, valueId, targetField) => {
        const tagEl = document.getElementById(tagId);
        if (!tagEl) return;
        const triggerJump = () => {
            const valEl = document.getElementById(valueId);
            navigateToMainWithField(targetField, valEl ? valEl.textContent : '');
        };
        tagEl.addEventListener('click', triggerJump);
        tagEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                triggerJump();
            }
        });
    };
    bindMetaTagJump('modalWorkOrderTag', 'modalWorkOrderId', 'work_order');
    bindMetaTagJump('modalRecipeTag', 'modalRecipeId', 'product_id');

});

function navigateToMainWithField(field, rawValue) {
    const val = String(rawValue || '').trim();
    if (!val || val === '--') return;

    const topWin = (window.top && window.top !== window) ? window.top : null;
    const mainFrame = topWin ? topWin.document.getElementById('view-main') : null;
    const mainWin = mainFrame ? mainFrame.contentWindow : null;

    try {
        sessionStorage.setItem('kdmes_main_prefill', JSON.stringify({ field, value: val }));
    } catch (e) {}

    if (topWin && topWin.spaNavigator && typeof topWin.spaNavigator.switchTo === 'function') {
        topWin.spaNavigator.switchTo('/main', true);
        if (mainWin && typeof mainWin.applyMainPrefill === 'function') {
            try { sessionStorage.removeItem('kdmes_main_prefill'); } catch (e) {}
            mainWin.applyMainPrefill(field, val);
        }
        return;
    }

    window.location.href = '/main';
}

function initializeInputDataValidationEventListeners() {
    document.addEventListener('sidebar:about', () => {
        showAbout();
    });

    // Department search
    const departmentInput = document.getElementById('department');
    departmentInput.addEventListener('click', () => {
        departmentInput.value = '';
        departmentInput.closest('.input-box')?.classList.remove('has-value');
        if (departmentInput.readOnly && departmentInput.dataset.autofillGuarded) {
            departmentInput.readOnly = false;
        }
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
            if (!isSelectingDepartment && document.activeElement !== document.getElementById('station')) {
                checkAndLoadStations();
            }
        }, 200);
    });

    // Station search
    const stationInput = document.getElementById('station');
    stationInput.addEventListener('click', () => {
        // Only show dropdown if station is enabled
        if (!stationInput.disabled) {
            stationInput.value = '';
            stationInput.closest('.input-box')?.classList.remove('has-value');
            stationInput.focus();
            setTimeout(() => {
                stationInput.focus();
            }, 0);
            clearTable();
            currentWorkOrderErrors = null;
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

    stationInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            hideStationDropdown();
            checkAndSearchWorkOrders();
        }
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

    // Context menu item for input_data_validation
    const validateMenuItem = document.querySelector('.context-menu-item[data-action="input_data_validation"]');
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
            isSelectingDepartment = true;
            clearTimeout(departmentSearchTimeout);
            const input = document.getElementById('department');
            input.value = deptId;
            input.closest('.input-box')?.classList.add('has-value');
            currentDepartmentOid = dept.id;
            hideDepartmentDropdown();

            const stationInput = document.getElementById('station');
            stationInput.value = '';
            stationInput.disabled = true;
            stationInput.closest('.input-box')?.classList.remove('has-value');
            hideStationDropdown();
            clearTable();

            try {
                // Load stations when department is selected
                await loadStations(currentDepartmentOid);
            } finally {
                stationInput.disabled = false;
                if (stationInput.readOnly && stationInput.dataset.autofillGuarded) {
                    stationInput.readOnly = false;
                }
                stationInput.focus();
                showStationDropdown(stations);
                isSelectingDepartment = false;
            }
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

    searchWorkOrders(station, department);
}

let currentWorkOrderErrors = null;

function highlightDefectiveWorkOrders(errorData) {
    if (errorData !== undefined) {
        currentWorkOrderErrors = errorData;
    }
    const errData = currentWorkOrderErrors;
    if (!errData || !errData.has_error || !errData.error_work_order_ids || errData.error_work_order_ids.length === 0) {
        return;
    }

    const errorWoIds = new Set(errData.error_work_order_ids.map(id => String(id).trim()));
    const errorsByWo = errData.errors_by_work_order || {};

    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    if (!thead || !tbody) return;

    const ths = Array.from(thead.querySelectorAll('th'));
    let idIdx = ths.findIndex(th => th.textContent.trim().toLowerCase() === 'id');
    if (idIdx === -1) idIdx = 0;
    const recipeIdx = ths.findIndex(th => th.textContent.trim().toLowerCase() === 'recipe_id');
    const colHeaders = ths.map(th => th.textContent.trim());

    const rows = tbody.querySelectorAll('tr');
    rows.forEach(tr => {
        if (tr.querySelector('.table-empty-state') || tr.classList.contains('skeleton-row')) return;
        const tds = tr.querySelectorAll('td');
        if (tds.length <= idIdx) return;

        const idTd = tds[idIdx];
        if (!idTd.dataset.rawId) {
            idTd.dataset.rawId = idTd.textContent.trim().split(/\s+/)[0];
        }
        const woId = idTd.dataset.rawId;

        if (errorWoIds.has(woId)) {
            tr.classList.add('row-wo-defective');

            if (!idTd.querySelector('.badge-wo-error')) {
                const errList = errorsByWo[woId] || ['Lỗi cấu hình MES'];
                const recipeId = (recipeIdx >= 0 && recipeIdx < tds.length) ? tds[recipeIdx].textContent.trim() : '';

                const badge = document.createElement('span');
                badge.className = 'badge-wo-error';
                badge.title = 'Chi tiết lỗi cấu hình MES:\n' + errList.join('\n');
                badge.innerHTML = `<span class="material-symbols-outlined">warning</span>`;
                badge.addEventListener('click', (e) => {
                    e.stopPropagation();

                    // Extract row fields
                    const rowData = {};
                    tds.forEach((td, idx) => {
                        const col = colHeaders[idx] || `col_${idx}`;
                        rowData[col] = (td.dataset.fullValue !== undefined) ? td.dataset.fullValue : td.textContent.trim();
                    });

                    // Build error payload to display in shared Details Modal
                    const detailPayload = {
                        "CẢNH BÁO": "PHÁT HIỆN LỖI CẤU HÌNH MES (GÂY CRASH KHI MÁY THAO TÁC)",
                        "Mã đơn điều động": woId,
                        "Mã quy cách": recipeId,
                        "Danh sách lỗi": errList,
                        "Hướng khắc phục": "Kiểm tra file YAML quy cách trên GitLab hoặc bảng kvmes.recipe_process_definition. Trường định lượng 'mid' của nguyên liệu không được để chuỗi rỗng \"\", phải nhập số thập phân chuẩn.",
                        ...rowData
                    };

                    if (typeof showDetailsModal === 'function') {
                        showDetailsModal(detailPayload);
                        const titleEl = document.getElementById('detailsModalTitle');
                        if (titleEl) {
                            titleEl.textContent = `Chi tiết lỗi cấu hình MES — ${woId}`;
                        }
                    }
                });
                idTd.appendChild(badge);
            }
        }
    });
}

// Hook displayTable to re-apply error highlights when table re-renders (e.g. clientSearch)
if (typeof window.displayTable === 'function') {
    const origDisplayTable = window.displayTable;
    window.displayTable = function(...args) {
        const res = origDisplayTable.apply(this, args);
        if (currentWorkOrderErrors && currentWorkOrderErrors.has_error) {
            setTimeout(() => highlightDefectiveWorkOrders(currentWorkOrderErrors), 0);
        }
        return res;
    };
}

async function searchWorkOrders(station, department = null) {
    try {
        if (typeof showTableSkeleton === 'function') {
            showTableSkeleton(6, 5);
        }

        const deptVal = department || document.getElementById('department')?.value?.trim() || '';

        // Concurrently run active list and error check
        const [data, errorData] = await Promise.all([
            apiFetch('/api/work-orders/get-active-list', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({station, department: deptVal})
            }),
            apiFetch('/api/work-orders/check-errors', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({station, department: deptVal})
            }).catch(err => {
                console.warn('Error checking work order errors:', err);
                return { success: false, has_error: false, error_work_order_ids: [], errors_by_work_order: {} };
            })
        ]);

        currentWorkOrderErrors = errorData;

        if (!data || !data.result || data.result.length === 0) {
            setTableData([], data ? data.columns : [], null, `Máy ${station} đang không có đơn điều động nào đang hoạt động`);
            return;
        }

        setTableData(data.result, data.columns, null, null, `Tìm thấy ${data.result.length} đơn điều động`);
        highlightDefectiveWorkOrders(errorData);

    } catch (error) {
        console.error('Error searching work orders:', error);
        clearTable();
        currentWorkOrderErrors = null;
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
            const item = contextMenu.querySelector('[data-action="input_data_validation"]');
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

    if (action === 'input_data_validation') {
        inputDataValidation();
    }
}
window.handleContextMenuAction = handleContextMenuAction;

async function inputDataValidation() {
    let rowData = selectedRowData;
    if (!rowData && selectedRow) {
        handleRowClick({ target: selectedRow });
        rowData = selectedRowData;
    }

    const recipeId = rowData ? (rowData['recipe_id'] || rowData['recipeId'] || rowData['recipe'] || '') : '';
    const station = (rowData && rowData['station']) ? rowData['station'] : (document.getElementById('station')?.value?.trim() || '');

    if (!recipeId || !station) {
        showAlert('Thiếu thông tin recipe_id hoặc station', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/stations/input-data-validation', {
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

const _comparisonCopyTimers = new WeakMap();

async function copyTextWithFallback(text) {
    if (!text) return false;
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (err) { /* fallback below for non-HTTPS intranet */ }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.cssText = 'position:fixed;inset-block-start:0;opacity:0;pointer-events:none;';
    document.body.appendChild(textarea);
    textarea.select();
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch (e) {
        console.error('Copy fallback failed:', e);
    } finally {
        textarea.remove();
    }
    return ok;
}

async function copyValidationRowText(event, btnElement) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const textToCopy = btnElement?.dataset?.copyText;
    if (!textToCopy) return;

    const ok = await copyTextWithFallback(textToCopy);
    if (!ok) {
        if (typeof Toast !== 'undefined' && Toast.error) {
            Toast.error('Lỗi sao chép', 'Không thể sao chép nội dung vào clipboard');
        }
        return;
    }

    if (btnElement) {
        clearTimeout(_comparisonCopyTimers.get(btnElement));
        const iconEl = btnElement.querySelector('.material-symbols-outlined');
        const labelEl = btnElement.querySelector('span:not(.material-symbols-outlined)');
        btnElement.classList.add('copied');
        if (iconEl) iconEl.textContent = 'check';
        if (labelEl) labelEl.textContent = 'Đã copy!';

        _comparisonCopyTimers.set(btnElement, setTimeout(() => {
            btnElement.classList.remove('copied');
            if (iconEl) iconEl.textContent = 'content_copy';
            if (labelEl) labelEl.textContent = 'Copy';
        }, 2000));
    }
}
window.copyValidationRowText = copyValidationRowText;

async function copyComparisonBarcode(el) {
    const barcode = el?.dataset?.barcode?.trim();
    if (!barcode) return;

    const ok = await copyTextWithFallback(barcode);
    if (!ok) {
        if (typeof Toast !== 'undefined' && Toast.error) {
            Toast.error('Lỗi sao chép', 'Không thể sao chép barcode vào clipboard');
        }
        return;
    }

    clearTimeout(_comparisonCopyTimers.get(el));
    const iconEl = el.querySelector('.barcode-icon');
    el.classList.add('copied');
    if (iconEl) iconEl.textContent = 'check';

    if (typeof Toast !== 'undefined' && Toast.success) {
        Toast.success('Đã sao chép', `Đã copy barcode: ${barcode}`);
    }

    _comparisonCopyTimers.set(el, setTimeout(() => {
        el.classList.remove('copied');
        if (iconEl) iconEl.textContent = 'qr_code_2';
    }, 1600));
}
window.copyComparisonBarcode = copyComparisonBarcode;

function bindComparisonBarcodeCopy(contentEl) {
    if (!contentEl || contentEl.dataset.barcodeCopyBound === '1') return;
    contentEl.dataset.barcodeCopyBound = '1';

    contentEl.addEventListener('click', (event) => {
        if (event.button !== 0) return;
        const target = event.target.closest('.barcode-highlight[data-barcode]');
        if (target && contentEl.contains(target)) {
            copyComparisonBarcode(target);
        }
    });

    contentEl.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const target = event.target.closest('.barcode-highlight[data-barcode]');
        if (target && contentEl.contains(target)) {
            event.preventDefault();
            copyComparisonBarcode(target);
        }
    });
}

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
    html += '<th style="width: 20%;">Site (Trạm)</th>';
    html += '<th style="width: 22%;">Tiêu Chuẩn YAML</th>';
    html += '<th style="width: 44%;">Tem Đầu Vào</th>';
    html += '<th style="width: 14%; text-align: center;">Trạng thái</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    // Group evaluatedItems by site (to support rowspan when a site has multiple barcodes in CONTAINER mode)
    const siteGroups = [];
    const siteGroupMap = new Map();

    evaluatedItems.forEach(item => {
        const key = item.site || '__empty__';
        if (!siteGroupMap.has(key)) {
            const group = {
                site: item.site || '',
                recipe_name: item.recipe_name,
                mid: item.mid,
                unit: item.unit,
                usage: item.usage,
                hao_dung: item.hao_dung,
                items: []
            };
            siteGroupMap.set(key, group);
            siteGroups.push(group);
        }
        siteGroupMap.get(key).items.push(item);
    });

    siteGroups.forEach(group => {
        const rowCount = group.items.length;

        // Pre-generate YAML HTML for this site (shared across rows in this group)
        const usageVal = (group.mid !== null && group.mid !== undefined && group.mid !== '')
            ? group.mid
            : ((group.usage !== null && group.usage !== undefined && group.usage !== '')
                ? group.usage
                : ((group.hao_dung !== null && group.hao_dung !== undefined && group.hao_dung !== '') ? group.hao_dung : null));

        let yamlHtml = `<div class="yaml-recipe-name">${group.recipe_name ? escapeHtml(group.recipe_name) : '<span class="empty-cell">N/A</span>'}</div>`;
        if (usageVal !== null && usageVal !== undefined && usageVal !== '') {
            const unitTitle = group.unit ? ` title="Đơn vị: ${escapeHtml(String(group.unit))}"` : '';
            yamlHtml += `<div class="yaml-usage-text"${unitTitle}>Hao dùng : ${escapeHtml(String(usageVal))}</div>`;
        }

        group.items.forEach((item, itemIdx) => {
            const isFirst = (itemIdx === 0);
            const isLast = (itemIdx === rowCount - 1);

            let rowClass = 'comparison-row';
            if (!item._isValid) {
                if (!item._hasBarcode || !item._isMatch) {
                    rowClass += ' row-mismatch';
                } else if (item._isExpired) {
                    rowClass += ' row-mismatch row-expired';
                } else if (item._isEmptyQuantity) {
                    rowClass += ' row-mismatch row-empty-quantity';
                } else {
                    rowClass += ' row-mismatch';
                }
            } else {
                rowClass += ' row-match';
            }

            if (rowCount > 1) {
                rowClass += ' has-multi-barcodes';
                if (!isLast) {
                    rowClass += ' group-inner-row';
                } else {
                    rowClass += ' group-last-row';
                }
            }

            html += `<tr class="${rowClass}">`;

            // 1. Site (Trạm) & 2. YAML - Rowspan on first row
            if (isFirst) {
                const rowspanAttr = rowCount > 1 ? ` rowspan="${rowCount}"` : '';
                const countBadge = rowCount > 1
                    ? `<span class="badge-tag-site-count" title="Trạm dạng CONTAINER: Có ${rowCount} tem quét vào"><span class="material-symbols-outlined count-icon">layers</span> ${rowCount} tem</span>`
                    : '';
                const isSiteGroupValid = group.items.every(it => it._isValid);
                const siteStateClass = isSiteGroupValid ? ' side-ok' : ' side-ng';
                html += `<td class="site-cell${siteStateClass}"${rowspanAttr}>`;
                html += `<div class="site-title-row">`;
                html += `<span class="site-name"><strong>${escapeHtml(group.site || '')}</strong></span>`;
                if (countBadge) html += countBadge;
                html += `</div></td>`;

                // 2. YAML column - Rowspan on first row (Cột thứ 2)
                html += `<td class="yaml-cell"${rowspanAttr}>${yamlHtml}</td>`;
            }

            // Copy error button helper (positioned top-right of material-cell)
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

            const copyBtnHtml = renderCopyBtn();

            // 2. NVL column - show site_id (recipe name), barcode, quantity, expiry
            html += `<td class="material-cell${copyBtnHtml ? ' has-copy-btn' : ''}">`;
            if (copyBtnHtml) {
                html += copyBtnHtml;
            }
            const isMismatch = Boolean(item._hasBarcode && !item._isMatch);
            const isSubstitute = Boolean(item.is_substitute || item.substituted);
            let siteBadgeHtml = '';
            if (isMismatch) {
                siteBadgeHtml = ' <span class="badge-tag-mismatch">SAI QUY CÁCH</span>';
            } else if (isSubstitute) {
                siteBadgeHtml = ` <span class="badge-tag-substitute" title="Nguyên liệu thay thế hợp lệ cho quy cách ${escapeHtml(group.recipe_name || '')}">THAY THẾ</span>`;
            }

            const seqPill = rowCount > 1 ? `<span class="barcode-seq-pill">#${itemIdx + 1}</span> ` : '';
            html += `<div class="site-id-text${isMismatch ? ' mismatch' : (isSubstitute ? ' substitute' : '')}">${seqPill}${item.site_id ? escapeHtml(item.site_id) : '<span class="empty-cell">N/A</span>'}${siteBadgeHtml}</div>`;

            if (item._hasBarcode) {
                let barcodeClass = 'barcode-highlight';
                if (isMismatch) {
                    barcodeClass += ' mismatch';
                } else if (item._isEmptyQuantity) {
                    barcodeClass += ' empty-quantity';
                } else if (item._isExpired) {
                    barcodeClass += ' expired';
                }

                // Clickable barcode row (left-click copies barcode to clipboard)
                html += `<div class="barcode-row-wrap">`;
                html += `<div class="${barcodeClass}" role="button" tabindex="0" data-barcode="${escapeHtml(item.site_barcode)}" title="Nhấp chuột trái để sao chép barcode: ${escapeHtml(item.site_barcode)}" aria-label="Sao chép barcode ${escapeHtml(item.site_barcode)}"><span class="material-symbols-outlined barcode-icon" aria-hidden="true">qr_code_2</span><span class="barcode-value-text">${escapeHtml(item.site_barcode)}</span></div>`;
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
                html += `</div>`;
            }
            html += '</td>';



            // 4. Status (chỉ 2 trạng thái OK xanh lá / NG đỏ)
            html += '<td class="status-cell" style="text-align: center;">';
            if (item._isValid) {
                html += '<span class="status-pill status-match"><span class="material-symbols-outlined">check</span> OK</span>';
            } else {
                html += '<span class="status-pill status-mismatch"><span class="material-symbols-outlined">close</span> NG</span>';
            }
            html += '</td>';

            html += '</tr>';
        });
    });

    html += '</tbody></table>';
    content.innerHTML = html;
    bindComparisonBarcodeCopy(content);
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
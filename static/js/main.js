let searchTimeout = null;
let selectedRow = null;
let selectedRowData = null;
let selectedOutputRow = null;
let selectedOutputRowData = null;
let originalTableHTML = null;
let currentRowClickType = null;
let currentTableType = null;
let currentOutputTableType = null;
let rawTableData = [];
let rawTableColumns = [];
let filteredTableData = [];
let feed_records_material_id = null;
let tableViewStack = [];
let outputBarcodeRawData = [];
let outputBarcodeColumns = [];
let activeSearchContext = 'main';
let apiLoadingCount = 0;
let currentBarcodeDetailType = null;
let countdownConfirm = null;
let totalOutputBarcode = null;

// ===== PAGE TRANSITION - GLITCH EFFECT =====
function initPageTransition() {
    // Check if overlay already exists
    if (document.getElementById('pageTransitionOverlay')) {
        return;
    }
    // Create overlay structure
    const overlay = document.createElement('div');
    overlay.id = 'pageTransitionOverlay';
    overlay.className = 'page-transition-overlay';
    overlay.innerHTML = `
        <div class="glitch-layer glitch-layer-3">
            <div class="glitch-text" data-text="LOADING">LOADING</div>
            <div class="scanlines"></div>
            <div class="rgb-bars">
                <div class="rgb-bar"></div>
                <div class="rgb-bar"></div>
                <div class="rgb-bar"></div>
                <div class="rgb-bar"></div>
                <div class="rgb-bar"></div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
}

/**
 * Play page transition effect
 * @param {Function} callback - Function to execute after transition
 * @param {number} duration - Transition duration in milliseconds (default: 600)
 */
function playPageTransition(callback, duration = 600) {
    const overlay = document.getElementById('pageTransitionOverlay');
    
    if (!overlay) {
        console.warn('Page transition overlay not found. Initializing...');
        initPageTransition();
        // Retry after initialization
        setTimeout(() => playPageTransition(callback, duration), 10);
        return;
    }

    // Activate overlay
    overlay.classList.add('active');
    
    // Lock body scroll
    document.body.style.overflow = 'hidden';

    // Execute callback and remove overlay after transition
    setTimeout(() => {
        if (callback && typeof callback === 'function') {
            callback();
        }
        
        // Remove overlay after a brief delay
        setTimeout(() => {
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }, 100);
    }, duration);
}

/**
 * Navigate to URL with transition effect
 * @param {string} url - Target URL
 * @param {number} duration - Transition duration (default: 600)
 */
function navigateWithTransition(url, duration = 600) {
    playPageTransition(() => {
        window.location.href = url;
    }, duration);
}

/**
 * Attach transition to all sidebar links
 */
function attachTransitionToSidebarLinks() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachTransitionToSidebarLinks);
        return;
    }

    const sidebar = document.getElementById('sidebar');
    if (!sidebar) {
        console.warn('Sidebar not found');
        return;
    }

    // Get all links in sidebar
    const links = sidebar.querySelectorAll('a[href]');
    
    links.forEach(link => {
        // Skip logout and external links
        const href = link.getAttribute('href');
        if (!href || href === '#' || href.startsWith('javascript:') || href.includes('logout')) {
            return;
        }

        // Add click event with transition
        link.addEventListener('click', function(e) {
            // Only apply to internal navigation
            if (href.startsWith('/') || href.startsWith(window.location.origin)) {
                e.preventDefault();
                navigateWithTransition(href);
            }
        });
    });
}

/**
 * Play entrance transition on page load (DISABLED - removed glitch after page load)
 */
function playEntranceTransition() {
    // DISABLED - No transition on page load to avoid double glitch effect
    // Just ensure overlay is hidden
    const overlay = document.getElementById('pageTransitionOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// ===== AUTO INITIALIZATION =====

// Type declaration for TypeScript
/** @type {{init: Function, play: Function, navigate: Function}} */
window.pageTransition = window.pageTransition || {};

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initPageTransition();
        attachTransitionToSidebarLinks();
        playEntranceTransition(); // Just cleanup, no animation
    });
} else {
    initPageTransition();
    attachTransitionToSidebarLinks();
    playEntranceTransition(); // Just cleanup, no animation
}

// Export functions for manual use
window.pageTransition = {
    init: initPageTransition,
    play: playPageTransition,
    navigate: navigateWithTransition
};

// Custom Modal Functions
function showModal(type, title, message, buttons = []) {
    const modal = document.getElementById('customModal');
    const icon = document.getElementById('modalIcon');
    const titleEl = document.getElementById('modalTitle');
    const messageEl = document.getElementById('modalMessage');
    const footer = document.getElementById('modalFooter');

    // Set icon and color
    icon.className = 'custom-modal-icon ' + type;
    const icons = {
        'info': 'ℹ️',
        'success': '✓',
        'error': '✕',
        'warning': '⚠'
    };
    icon.textContent = icons[type] || 'ℹ️';

    titleEl.textContent = title;
    messageEl.textContent = message;
    messageEl.style.whiteSpace = 'pre-line'; // Allow line breaks in message

    // Clear and add buttons
    footer.innerHTML = '';
    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.className = 'custom-modal-btn ' + btn.class;
        button.textContent = btn.text;
        footer.appendChild(button);
    });

    modal.classList.add('show');

    // Lock body scroll
    document.body.style.overflow = 'hidden';

    // Return promise for confirm dialogs
    return new Promise((resolve) => {
        buttons.forEach((btn, index) => {
            const button = footer.children[index];
            if (button) {
                button.onclick = () => {
                    closeModal();
                    resolve(btn.value !== false);
                };
            }
        });
    });
}

function closeModal() {
    const modal = document.getElementById('customModal');
    modal.classList.remove('show');

    // Unlock body scroll
    document.body.style.overflow = '';
}

// Replace alert/confirm functions
function showAlert(message, type = 'info') {
    const titles = {
        'info': 'Thông tin',
        'success': 'Thành công',
        'error': 'Lỗi',
        'warning': 'Cảnh báo'
    };

    return showModal(type, titles[type] || 'Thông tin', message, [
        { text: 'OK', class: 'custom-modal-btn-primary', value: true }
    ]);
}

function showConfirm(message, title = 'Xác nhận') {
    return showModal('warning', title, message, [
        { text: 'Hủy', class: 'custom-modal-btn-secondary', value: false },
        { text: 'OK', class: 'custom-modal-btn-primary', value: true }
    ]);
}

function showCountdownConfirm(type, title, message, seconds) {
    countdownConfirm = seconds;
    showModal(type, title, message, [{
        text: `Xác nhận (${countdownConfirm})`,
        class: 'custom-modal-btn-primary',
        value: true
    }]);

    setTimeout(() => {
        const btn = document.querySelector('#modalFooter button');
        if (!btn) return;

        btn.disabled = true;

        const timer = setInterval(() => {
            countdownConfirm--;
            btn.textContent = `Xác nhận (${countdownConfirm})`;

            if (countdownConfirm <= 0) {
                clearInterval(timer);
                btn.textContent = 'Xác nhận';
                btn.disabled = false;
            }
        }, 1000);
    }, 0);
}

document.addEventListener('DOMContentLoaded', function () {
    checkAuth();
    initializeMainEventListeners();
    initClientSearch();
    initDetailsModal();

    // ===== BLOCK ESC KEY WHEN MODAL IS OPEN =====
    document.addEventListener('keydown', function (e) {
        const modal = document.getElementById('customModal');
        if (modal && modal.classList.contains('show')) {
            if (e.key === 'Escape' || e.keyCode === 27) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }
    }, true);
});

document.querySelectorAll('.label[data-text]').forEach(label => {
    const text = label.dataset.text;
    label.innerHTML = '';

    [...text].forEach((char, index) => {
        const span = document.createElement('span');
        span.className = 'char';
        span.style.setProperty('--index', index);
        span.textContent = char === ' ' ? '\u00A0' : char;
        label.appendChild(span);
    });
});

async function checkAuth() {
    try {
        const response = await fetch('/api/fetchDepartmentList');
        const result = await response.json();
        if (result.error) {
            await showAlert(
                'Phiên đăng nhập hết hạn, Vui lòng đăng nhập lại',
                'error'
            );
            window.location.href = '/login';
            return;
        }

        const items = result.data || [];
        departments = items.map(item => ({
            id: item.departmentID || ''
        }));

    } catch (error) {
        console.error('Error loading departments:', error);
    }
}

function initializeMainEventListeners() {

    // ===== MAIN PAGE INPUTS =====
    const barcodeInput = document.getElementById('barcode');
    const productInput = document.getElementById('product_id');

    if (barcodeInput) {
        barcodeInput.addEventListener(
            'input',
            debounceSearch(searchBarcode, 500)
        );

        barcodeInput.addEventListener('input', e => {
            e.target.value = e.target.value.toUpperCase();
            if (productInput) productInput.value = '';
        });

    }

    if (productInput) {
        productInput.addEventListener(
            'input',
            debounceSearch(searchWorkOrder, 500)
        );

        productInput.addEventListener('input', e => {
            e.target.value = e.target.value.toUpperCase();
            if (barcodeInput) barcodeInput.value = '';
        });
    }

    // ===== SIDEBAR EVENTS =====
    document.addEventListener('sidebar:about', showAbout);
    document.addEventListener('sidebar:logout', handleLogout);

    // ===== MODAL CLOSE BUTTONS =====
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', function () {
            const modal = this.closest('.modal');
            if (modal) modal.style.display = 'none';
        });
    });

    // ===== TABLE EVENTS =====
    const tableBody = document.getElementById('tableBody');
    if (tableBody) {
        tableBody.addEventListener('click', handleRowClick);
        tableBody.addEventListener('dblclick', handleRowDoubleClick);
        tableBody.addEventListener('contextmenu', (e) => {
            handleContextMenuUnified(e, 'main');
        });
    }

    // ===== OUTPUT TABLE EVENTS =====
    const outputTableBody = document.getElementById('outputBarcodeTableBody');
    if (outputTableBody) {
        outputTableBody.addEventListener('click', handleOutputRowClick);
        outputTableBody.addEventListener('dblclick', handleOutputRowDoubleClick);
        outputTableBody.addEventListener('contextmenu', (e) => {
            handleContextMenuUnified(e, 'output');
        });
    }

    // ===== CONTEXT MENU =====
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) {
        document.addEventListener('click', () => {
            contextMenu.style.display = 'none';
        });
    }

    document.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', handleContextMenuAction);
    });

    enhanceContextMenu();

    // ===== SPEECH BUBBLE =====
    speechBubble.init();

    setTimeout(() => {
        speechBubble.show(`Xin Chào! 👋`, {
            duration: 10000,
            animation: 'bounce'
        });
    }, 1000);

    document.querySelector('thead')?.addEventListener('mouseenter', () => {
        speechBubble.show('💡Tip: Click đúp chuột trái để xem chi tiết và click chuột phải vào dòng dữ liệu để xem thêm chức năng!', {
            duration: 10000,
            animation: 'bounce'
        })
    })

    document.querySelector('.input-box')?.addEventListener('mouseenter', () => {
        speechBubble.show('💡Tip: Search barcode, Search đơn điều động theo quy cách!', {
            duration: 10000,
            animation: 'bounce'
        })
    })

    document.querySelector('.output-header')?.addEventListener('mouseenter', () => {
        speechBubble.show('💡Tip: Nhớ tắt Bảng Chi Tiết Barcode để trở về ban đầu!', {
            duration: 10000,
            animation: 'bounce'
        })
    })

    document.querySelector('.btn-export-excel')?.addEventListener('mouseenter', () => {
        speechBubble.show('💡Tip: Xuất file Excel gồm toàn bộ dữ liệu của bảng phía trên!', {
            duration: 10000,
            animation: 'bounce'
        })
    })
}

function debounceSearch(func, delay) {
    return function (...args) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => func.apply(this, args), delay);
    };
}

async function searchBarcode() {
    closeShowBarcodeWindow();
    const keyword = document.getElementById('barcode').value.trim();
    if (!keyword) {
        clearTable();
        return;
    }

    try {
        const response = await fetch('/api/searchBarcode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword })
        });

        const data = await response.json();
        if (data.result) {
            setTableData(data.result, data.columns, 'barcode');
        }
    } catch (error) {
        console.error('Error searching barcode:', error);
    }
}

async function searchWorkOrder() {
    closeShowBarcodeWindow();
    const keyword = document.getElementById('product_id').value.trim();
    if (!keyword) {
        clearTable();
        return;
    }

    try {
        const response = await fetch('/api/searchWorkOrder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword })
        });

        const data = await response.json();
        if (data.result) {
            setTableData(data.result, data.columns, 'recipe');
        }
    } catch (error) {
        console.error('Error searching work order:', error);
    }
}

function displayTable(result, columns) {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    const rowCount = document.getElementById('rowCount');

    // Clear existing content
    thead.innerHTML = '';
    tbody.innerHTML = '';

    if (!result || result.length === 0) {
        rowCount.textContent = '0';
        return;
    }

    // Table header
    const headerRow = document.createElement('tr');
    columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    // Table body
    const truncateThreshold = 50; // chỉ truncate nếu dài hơn ngưỡng này
    const displayLength = 30; // số ký tự hiển thị

    result.forEach((row, index) => {
        const tr = document.createElement('tr');
        tr.dataset.index = index;
        row.forEach((cell, cellIndex) => {
            const td = document.createElement('td');

            // Format cell value - if it's an object, convert to JSON
            let cellValue = '';
            let fullValue = '';

            if (cell !== null && cell !== undefined) {
                if (typeof cell === 'object') {
                    try {
                        fullValue = JSON.stringify(cell, null, 2);
                        cellValue = fullValue;
                    } catch (e) {
                        fullValue = String(cell);
                        cellValue = fullValue;
                    }
                } else {
                    fullValue = String(cell);
                    cellValue = fullValue;
                }
            }

            if (cellValue.length > truncateThreshold) {
                // Only truncate long strings
                td.textContent = cellValue.substring(0, displayLength) + '...';
                td.title = fullValue; // Show full value on hover
                td.classList.add('truncated-cell');
            } else {
                // Display short strings fully
                td.textContent = cellValue;
            }

            // Always store full value for double-click and operations
            td.dataset.fullValue = fullValue;

            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    rowCount.textContent = result.length;
    updateVisibleRowCount()
}

function clearTable() {
    document.getElementById('tableHead').innerHTML = '';
    document.getElementById('tableBody').innerHTML = '';
    document.getElementById('rowCount').textContent = '0';

    selectedRow = null;
    selectedRowData = null;

    updateClientSearchState(false);
    updateVisibleRowCount();
}

function handleRowClick(e) {
    const row = e.target.closest('tr');
    if (!row) return;

    // Remove previous selection
    document.querySelectorAll('#tableBody tr').forEach(r => r.classList.remove('selected'));

    // Add selection to current row
    row.classList.add('selected');
    selectedRow = row;

    // Get row data - use fullValue from data attribute if available
    const cells = row.querySelectorAll('td');
    const columns = Array.from(document.querySelectorAll('#tableHead th')).map(th => th.textContent);
    selectedRowData = {};
    columns.forEach((col, index) => {
        const cell = cells[index];
        const fullValue = cell?.dataset.fullValue;
        selectedRowData[col] = fullValue !== undefined ? fullValue : (cell?.textContent || '');
    });
}

function handleOutputRowClick(e) {
    const row = e.target.closest('tr');
    if (!row) return;

    // Remove previous selection
    document.querySelectorAll('#outputBarcodeTableBody tr').forEach(r => r.classList.remove('selected'));

    // Add selection to current row
    row.classList.add('selected');
    selectedOutputRow = row;

    // Get row data
    const cells = row.querySelectorAll('td');
    const columns = Array.from(document.querySelectorAll('#outputBarcodeTable thead th')).map(th => th.textContent);
    selectedOutputRowData = {};
    columns.forEach((col, index) => {
        const cell = cells[index];
        const fullValue = cell?.dataset.fullValue;
        selectedOutputRowData[col] = fullValue !== undefined ? fullValue : (cell?.textContent || '');
    });
}

function handleRowDoubleClick(e) {
    const row = e.target.closest('tr');
    if (!row) return;

    handleRowClick(e);
    showDetails();
}

function handleOutputRowDoubleClick(e) {
    const row = e.target.closest('tr');
    if (!row) return;

    handleOutputRowClick(e);
    showOutputDetails();
}

// ===== CONTEXT MENU =====

/**
 * Unified context menu handler
 * @param {Event} e - Context menu event
 * @param {string} tableType - 'main' | 'output'
 */
function handleContextMenuUnified(e, tableType = 'main') {
    e.preventDefault();
    
    const row = e.target.closest('tr');
    if (!row) return;

    // Select row based on table type
    if (tableType === 'main') {
        handleRowClick(e);
    } else {
        handleOutputRowClick(e);
    }

    // Check if we have valid table type before showing menu
    const hasValidType = tableType === 'main' 
        ? currentTableType !== null 
        : currentOutputTableType !== null;

    if (!hasValidType) {
        return;
    }

    // Show context menu
    showContextMenu(e.pageX, e.pageY, tableType);
}

/**
 * Show context menu at position
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {string} tableType - 'main' | 'output'
 */
function showContextMenu(x, y, tableType) {
    const contextMenu = document.getElementById('contextMenu');
    if (!contextMenu) return;

    // Update menu items visibility
    let allowedActions = [];
    if (tableType === 'main') {
        allowedActions = updateContextMenu();
    } else {
        allowedActions = updateOutputContextMenu();
    }

    // Don't show menu if no items available
    if (!allowedActions || allowedActions.length === 0) {
        contextMenu.style.display = 'none';
        return;
    }

    // Position menu
    contextMenu.style.display = 'block';
    
    // Adjust position if menu would overflow viewport
    const menuRect = contextMenu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let menuX = x;
    let menuY = y;

    // Prevent horizontal overflow
    if (x + menuRect.width > viewportWidth) {
        menuX = viewportWidth - menuRect.width - 10;
    }

    // Prevent vertical overflow
    if (y + menuRect.height > viewportHeight) {
        menuY = viewportHeight - menuRect.height - 10;
    }

    contextMenu.style.left = menuX + 'px';
    contextMenu.style.top = menuY + 'px';
}

/**
 * Update context menu items based on current table type
 * @returns {string[]} Array of allowed actions
 */
function updateContextMenu() {
    // Define menu configurations
    const menuConfig = {
        'barcode': [
            'inputBarcode',
            'feedRecords',
            'checkScanBarcodeHistory',
            'checkBarcodeWorkOrder',
            'checkBarcodeTransfer',
            'checkBarcodeExtendDateTime'
        ],
        'recipe': [
            'searchWorkOrderByRecipe'
        ],
        'outputBarcodeByFeedRecords': [
            'outputBarcodeByFeedRecords'
        ]
    };

    const allowedActions = menuConfig[currentTableType] || [];     // Get allowed actions for current table type
    setMenuItemsVisibility(allowedActions);    // Show/hide menu items
    return allowedActions;    // Return allowed actions for validation
}

/**
 * Update output context menu items based on output table type
 * @returns {string[]} Array of allowed actions
 */
function updateOutputContextMenu() {
    const menuConfig = {
        'workOrderOutputByBarcode': ['outputByBarcode'],
        'workOrderOutputByRecipe': ['outputByRecipe']
    };

    const allowedActions = menuConfig[currentOutputTableType] || [];
    setMenuItemsVisibility(allowedActions);

    // Return allowed actions for validation
    return allowedActions;
}

/**
 * Set visibility for context menu items
 * @param {string[]} allowedActions - Array of allowed action names
 */
function setMenuItemsVisibility(allowedActions) {
    const allItems = document.querySelectorAll('.context-menu-item');
    
    allItems.forEach(item => {
        const action = item.dataset.action;
        item.style.display = allowedActions.includes(action) ? 'block' : 'none';
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

    updateContextMenu();
}

function handleOutputContextMenu(e) {
    e.preventDefault();
    const row = e.target.closest('tr');
    if (!row) return;

    handleOutputRowClick(e);

    const contextMenu = document.getElementById('contextMenu');
    contextMenu.style.display = 'block';
    contextMenu.style.left = e.pageX + 'px';
    contextMenu.style.top = e.pageY + 'px';

    updateOutputContextMenu();
}

function handleContextMenuAction(e) {
    const action = e.target.dataset.action;
      
    // Xác định sử dụng data từ table nào
    const isOutputTable = ['outputByBarcode', 'outputByRecipe'].includes(action);
    const rowData = isOutputTable ? selectedOutputRowData : selectedRowData;
    
    if (!rowData) return;

    switch (action) {
        // currentTableType === 'barcode'
        case 'inputBarcode':
            openOutputTable('inputBarcode', rowData);
            break;
        case 'feedRecords':
            showFeedRecords();
            break;
        case 'checkScanBarcodeHistory':
            fetchScanBarcodeHistoryByBarcode();
            break;
        case 'checkBarcodeWorkOrder':
            openOutputTable('workOrderByBarcode', rowData);
            break;
        case 'checkBarcodeTransfer':
            checkBarcodeTransfer();
            break;
        case 'checkBarcodeExtendDateTime':
            checkBarcodeExtendDateTime();
            break;

        // currentTableType === 'outputBarcode'
        case 'outputBarcodeByFeedRecords':
            openOutputTable('outputBarcodeByFeedRecords', rowData);
            break;

        // currentTableType === 'recipe'      
        case 'searchWorkOrderByRecipe':
            openOutputTable('workOrderByRecipe', rowData);
            break;
            
        // currentOutputTableType 
        case 'outputByBarcode':
            fetchOutputBarcodeByWorkOrder('outputByBarcode', rowData);
            break;
        case 'outputByRecipe':
            fetchOutputBarcodeByWorkOrder('outputByRecipe', rowData);
            break;
    }

    document.getElementById('contextMenu').style.display = 'none';
}

/**
 * Enhanced context menu với keyboard navigation và visual highlight
 */
function enhanceContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    if (!contextMenu) return;

    let focusedItemIndex = -1;
    const getVisibleItems = () => 
        Array.from(contextMenu.querySelectorAll('.context-menu-item'))
            .filter(item => item.style.display !== 'none');

    /**
     * Highlight item được chọn
     */
    function highlightItem(index) {
        const visibleItems = getVisibleItems();
        
        // Remove highlight từ tất cả items
        visibleItems.forEach(item => {
            item.classList.remove('context-menu-focused');
            item.style.backgroundColor = '';
            item.style.color = '';
        });

        // Add highlight vào item hiện tại
        if (index >= 0 && index < visibleItems.length) {
            const item = visibleItems[index];
            item.classList.add('context-menu-focused');
            // Thêm màu nổi bật
            item.style.backgroundColor = 'rgba(22, 160, 133, 0.5)';
            
            // Scroll item vào view nếu cần
            item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (contextMenu.style.display !== 'block') return;

        const visibleItems = getVisibleItems();
        if (visibleItems.length === 0) return;

        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                focusedItemIndex = (focusedItemIndex + 1) % visibleItems.length;
                highlightItem(focusedItemIndex);
                break;

            case 'ArrowUp':
                e.preventDefault();
                focusedItemIndex = focusedItemIndex <= 0 
                    ? visibleItems.length - 1 
                    : focusedItemIndex - 1;
                highlightItem(focusedItemIndex);
                break;

            case 'Enter':
                e.preventDefault();
                if (focusedItemIndex >= 0 && focusedItemIndex < visibleItems.length) {
                    visibleItems[focusedItemIndex].click();
                }
                break;

            case 'Escape':
                e.preventDefault();
                closeContextMenu();
                break;
        }
    });

    // Mouse hover cũng update highlight
    contextMenu.addEventListener('mousemove', (e) => {
        const item = e.target.closest('.context-menu-item');
        if (!item || item.style.display === 'none') return;

        const visibleItems = getVisibleItems();
        const index = visibleItems.indexOf(item);
        
        if (index !== -1 && index !== focusedItemIndex) {
            focusedItemIndex = index;
            highlightItem(focusedItemIndex);
        }
    });

    // Reset khi đóng menu
    function closeContextMenu() {
        contextMenu.style.display = 'none';
        focusedItemIndex = -1;
        
        // Remove tất cả highlight
        getVisibleItems().forEach(item => {
            item.classList.remove('context-menu-focused');
            item.style.backgroundColor = '';
            item.style.color = '';
        });
    }

    // Click ra ngoài để đóng
    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target)) {
            closeContextMenu();
        }
    });

    // Khi mở menu, auto-highlight item đầu tiên
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'style') {
                if (contextMenu.style.display === 'block') {
                    const visibleItems = getVisibleItems();
                    if (visibleItems.length > 0) {
                        focusedItemIndex = 0;
                        highlightItem(0);
                    }
                }
            }
        });
    });

    observer.observe(contextMenu, { 
        attributes: true, 
        attributeFilter: ['style'] 
    });
}

async function showFeedRecords() {
    closeShowBarcodeWindow();
    const material_oid = selectedRowData['id'];
    if (!material_oid) {
        await showAlert('Thiếu OID', 'error');
        return;
    }

    const material_type = selectedRowData['product_type'];
    if (!material_type) {
        await showAlert('Thiếu product_type', 'error');
        return;
    }

    if (material_type == "TIRE") {
        await showAlert('Không quản lý quét tem từ Ép Vỏ qua QC', 'error');
        return;
    }

    feed_records_material_id = material_oid

    const data = await apiFetch('/api/barcode/checkUsedHistory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ material_oid, material_type })
    });

    if (Array.isArray(data.result) && data.result.length === 0) {
        await showAlert("Barcode chưa quét tem lần nào", 'error');
        return;
    }

    if (data.success) {
        setTableData(data.result, data.columns, 'outputBarcodeByFeedRecords');
    } else {
        await showAlert(data.message, 'error');
    }
}

async function fetchWorkOrderByBarcode() {
    const resource_id = selectedRowData['id'];
    if (!resource_id) {
        await showAlert('Chưa chọn hàng dữ liệu.', 'warning');
        return;
    }

    const payload = { resource_id };

    let info_obj = selectedRowData['info'];
    if (typeof info_obj === 'string') {
        try {
            info_obj = JSON.parse(info_obj);
        } catch {
            return null;
        }
    }

    const prod_info = info_obj.production_info;
    if (!prod_info) return null;

    const station = prod_info.station;
    const production_time = prod_info.production_time;
    if (!station || !production_time) {
        ;
        clearTable();
        return;
    }

    const vietNameDate = convertISOToVietNamDate(production_time)

    payload.station = station;
    payload.fromDate = vietNameDate;
    payload.toDate = vietNameDate;

    const data = await apiFetch('/api/barcode/fetchWorkOrder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (data.success) {
        if (data.result && data.result.length > 0) {
            outputBarcodeRawData = data.result;
            outputBarcodeColumns = data.columns;

            currentOutputTableType = 'workOrderOutputByBarcode'
            renderOutputBarcodeTable(outputBarcodeRawData, outputBarcodeColumns);
        } else {
            await showAlert(`Barcode không được in ra từ bất kỳ đơn điều động nào`, 'error');
        }
    } else {
        await showAlert(data.message, 'error');
    }
}

async function fetchInputBarcode(id, product_type) {
    try {
        const data = await apiFetch('/api/barcode/fetchInputBarcode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, product_type })
        });

        if (data.success) {
        if (data.result && data.result.length > 0) {
            outputBarcodeRawData = data.result;
            outputBarcodeColumns = data.columns;

            currentOutputTableType = null;
            renderOutputBarcodeTable(outputBarcodeRawData, outputBarcodeColumns);
        } else {
            await showAlert(`Không tải được tem đầu vào`, 'error');
        }
    } else {
        await showAlert(data.message, 'error');
    }

    } catch (err) {
        showAlert('error', 'Lỗi', err.message);
    }
}

async function fetchOutputBarcode() {
    const resource_id = feed_records_material_id;
    if (!resource_id) {
        await showAlert('Thiếu Resource ID', 'error');
        return;
    }

    const work_order = selectedRowData['work_order'];
    totalOutputBarcode = selectedRowData['total_barcode'];

    const data = await apiFetch('/api/barcode/fetchOutputBarcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_id, work_order })
    });

    if (data.success) {
        if (data.result && data.result.length > 0) {
            outputBarcodeRawData = data.result;
            outputBarcodeColumns = data.columns;
            renderOutputBarcodeTable(outputBarcodeRawData, outputBarcodeColumns);
        } else {
            await showAlert(data.message || 'Không tìm thấy tem đầu ra', 'info');
        }
    } else {
        await showAlert(data.message, 'error');
    }
}

async function checkBarcodeTransfer() {
    closeShowBarcodeWindow();
    const resource_id = selectedRowData['id'];
    if (!resource_id) {
        await showAlert('Thiếu Resource ID', 'error');
        return;
    }

    fetch('/api/checkBarcodeTransfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_id })
    })
        .then(res => res.json())
        .then(async data => {
            if (data.success) {
                await showAlert(data.message, 'info');
            } else {
                await showAlert(data.message || 'Không tìm thấy dữ liệu vận chuyển', 'info');
            }
        })
        .catch(async () => {
            await showAlert('Lỗi khi kiểm tra vận chuyển tem', 'error');
        });
}

async function checkBarcodeExtendDateTime() {
    closeShowBarcodeWindow();
    const resource_id = selectedRowData['id'];
    if (!resource_id) {
        await showAlert('Thiếu Resource ID', 'error');
        return;
    }

    fetch('/api/checkBarcodeExtendDateTime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_id })
    })
        .then(res => res.json())
        .then(async data => {
            if (data.success) {
                await showAlert(data.message, 'info');
            } else {
                await showAlert(data.message || 'Lỗi API', 'info');
            }
        })
        .catch(async () => {
            await showAlert('Lỗi khi kiểm tra số lần gia hạn của tem', 'error');
        });
}

async function fetchOutputBarcodeByWorkOrder(type, rowData) {
    const work_order_id = rowData['work_order'];
    if (!work_order_id) {
        await showAlert('Chưa chọn hàng dữ liệu.', 'warning');
        return;
    }

    const work_order_status = rowData['status'];
    if (!work_order_status) {
        await showAlert('Chưa chọn hàng dữ liệu.', 'warning');
        return;
    }

    activeSearchContext = type;
    let outputHeaderContentEl = document.getElementById('outputHeaderContent');

    if (type && type === 'outputByBarcode') {
        outputHeaderContentEl.textContent = 'Tem đầu ra theo Barcode';
    } else if (type && type === 'outputByRecipe') { 
        outputHeaderContentEl.textContent = 'Tem đầu ra theo quy cách';
    }

    const data = await apiFetch('/api/workorder/fetchOutputBarcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ work_order_id, work_order_status })
    });

    if (data.success) {
        if (data.result && data.result.length > 0) {
            outputBarcodeRawData = data.result;
            outputBarcodeColumns = data.columns;

            currentOutputTableType = null
            renderOutputBarcodeTable(outputBarcodeRawData, outputBarcodeColumns);
        } else {
            await showAlert(data.message || 'Không tìm thấy tem đầu ra', 'info');
        }
    } else {
        await showAlert(data.message, 'error');
    }
}

function initDetailsModal() {
    const modal = document.getElementById('detailsModal');
    if (!modal) return;

    const closeBtn = modal.querySelector('.details-modal-close');
    const content = modal.querySelector('.details-modal-content');

    // click nút X
    closeBtn?.addEventListener('click', closeDetailsModal);

    // click ra ngoài modal-content => đóng
    modal.addEventListener('click', e => {
        if (!content.contains(e.target)) {
            closeDetailsModal();
        }
    });

    // ESC để đóng
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeDetailsModal();
        }
    });
}

function showDetails() {
    if (!selectedRow) return;

    const cells = selectedRow.querySelectorAll('td');
    const columns = Array.from(
        document.querySelectorAll('#tableHead th')
    ).map(th => th.textContent);

    const fullRowData = {};
    columns.forEach((col, index) => {
        const cell = cells[index];
        fullRowData[col] =
            cell?.dataset.fullValue || cell?.textContent || '';
    });

    showDetailsModal(fullRowData);
}

function showOutputDetails() {
    if (!selectedOutputRow) return;

    const cells = selectedOutputRow.querySelectorAll('td');
    const columns = Array.from(
        document.querySelectorAll('#outputBarcodeTable thead th')
    ).map(th => th.textContent);

    const fullRowData = {};
    columns.forEach((col, index) => {
        const cell = cells[index];
        fullRowData[col] = cell?.dataset.fullValue || cell?.textContent || '';
    });

    showDetailsModal(fullRowData);
}

function showDetailsModal(data) {
    const modal = document.getElementById('detailsModal');
    if (!modal) return;

    const body = modal.querySelector('.details-modal-body');
    if (!body) return;

    const processedData = {};
    for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (
                (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                (trimmed.startsWith('[') && trimmed.endsWith(']'))
            ) {
                try {
                    processedData[key] = JSON.parse(trimmed);
                } catch {
                    processedData[key] = value;
                }
            } else {
                processedData[key] = value;
            }
        } else {
            processedData[key] = value;
        }
    }

    // Format JSON with syntax highlighting
    const jsonString = JSON.stringify(processedData, null, 2);
    body.innerHTML = formatJSON(jsonString);

    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

/**
 * Format JSON string with syntax highlighting
 * @param {string} json - JSON string
 * @returns {string} HTML formatted JSON
 */
function formatJSON(json) {
    // Escape HTML
    json = json
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Apply syntax highlighting
    return json.replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
        function (match) {
            let cls = 'json-number';

            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    // Key
                    cls = 'json-key';
                } else {
                    // String value
                    cls = 'json-string';
                }
            } else if (/true|false/.test(match)) {
                cls = 'json-boolean';
            } else if (/null/.test(match)) {
                cls = 'json-null';
            }

            return '<span class="' + cls + '">' + match + '</span>';
        }
    );
}

function closeDetailsModal() {
    const modal = document.getElementById('detailsModal');
    modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
}

async function handleLogout() {
    const confirmed = await showConfirm('Bạn có chắc chắn muốn đăng xuất?');
    if (!confirmed) return;

    try {
        const response = await fetch('/logout', { method: 'POST' });
        const data = await response.json();
        if (data.success) {
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
}

function showAbout() {
    // Use global version variable if available, otherwise fallback
    const appVersion = typeof version !== 'undefined' ? version : '0.11.01';
    showAlert('Tool Version: ' + appVersion, 'info');
}

function showAddMaterialModal() {
    document.getElementById('addMaterialModal').style.display = 'block';
}

function showTransferModal() {
    document.getElementById('transferModal').style.display = 'block';
    document.getElementById('transferDate').valueAsDate = new Date();
}

async function fetchWorkOrderByRecipe() {
    const recipe_id = selectedRowData['recipe_id'];

    const data = await apiFetch('/api/recipe/fetchWorkOrder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_id })
    });

    if (data.success) {
        if (data.result && data.result.length > 0) {
            outputBarcodeRawData = data.result;
            outputBarcodeColumns = data.columns;

            currentOutputTableType = 'workOrderOutputByRecipe';
            renderOutputBarcodeTable(outputBarcodeRawData, outputBarcodeColumns);
        } else {
            await showAlert(data.message || 'Không tìm thấy đơn điều động', 'info');
        }
    } else {
        await showAlert(data.message, 'error');
    }
}

function filterClientResult(keyword) {
    if (['inputBarcode', 'outputBarcodeByFeedRecords', 'workOrderByRecipe', 'workOrderByBarcode', 'outputByBarcode', 'outputByRecipe'].includes(activeSearchContext)) {
        filterOutputBarcode(keyword);
        return;
    }

    if (!keyword) {
        displayTable(rawTableData, rawTableColumns);
        return;
    }

    const filtered = rawTableData.filter(row =>
        Object.values(row).some(val =>
            val !== null &&
            val !== undefined &&
            String(val).toLowerCase().includes(keyword)
        )
    );

    displayTable(filtered, rawTableColumns);
}

function filterOutputBarcode(keyword) {
    if (!keyword) {
        renderOutputBarcodeTable(outputBarcodeRawData, outputBarcodeColumns);
        return;
    }

    const filtered = outputBarcodeRawData.filter(row =>
        row.some(val =>
            val !== null &&
            val !== undefined &&
            String(val).toLowerCase().includes(keyword)
        )
    );

    renderOutputBarcodeTable(filtered, outputBarcodeColumns);
}

function openOutputTable(type, rowData) {
    // Nếu đang mở 1 loại khác → đóng trước
    if (activeSearchContext && activeSearchContext !== type) {
        closeShowBarcodeWindow();
    }

    enterSingleRowMode();

    const container = document.getElementById('outputContainer');
    container.style.display = 'flex';

    activeSearchContext = type;

    clearOutputBarcodeTable();
    const outputHeaderContentEl = document.getElementById('outputHeaderContent');

    if (type === 'inputBarcode') {
        outputHeaderContentEl.textContent = 'Tem đầu vào';
        fetchInputBarcode(rowData.id, rowData.product_type);
    }

    if (type === 'outputBarcodeByFeedRecords') {
        outputHeaderContentEl.textContent = 'Tem đầu ra'
        fetchOutputBarcode(rowData.work_order);
    }

    if (type === 'workOrderByRecipe') {
        outputHeaderContentEl.textContent = 'Đơn điều động theo quy cách'
        fetchWorkOrderByRecipe(rowData.recipe_id);
    }

    if (type === 'workOrderByBarcode') {
        outputHeaderContentEl.textContent = 'Đơn điều động theo barcode'
        fetchWorkOrderByBarcode(rowData.id, rowData.info);
    }
}

function closeShowBarcodeWindow() {
    const container = document.getElementById('outputContainer');
    if (!container) return;

    clearOutputBarcodeTable();

    container.style.display = 'none';
    activeSearchContext = 'main';

    exitSingleRowMode();
}

function clearOutputBarcodeTable() {
    const table = document.getElementById('outputBarcodeTable');
    table.querySelector('thead').innerHTML = '';
    table.querySelector('tbody').innerHTML = '';

    const count = document.getElementById('outputBarcodeCount');
    if (count) count.innerHTML = '';

    // Clear output table selection
    selectedOutputRow = null;
    selectedOutputRowData = null;
}

function renderOutputBarcodeTable(rows, columns) {
    const thead = document.querySelector('#outputBarcodeTable thead');
    const tbody = document.querySelector('#outputBarcodeTable tbody');
    const rowCount = document.getElementById('outputRowCount');

    thead.innerHTML = '';
    tbody.innerHTML = '';

    // ===== HEADER =====
    const trHead = document.createElement('tr');
    columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        trHead.appendChild(th);
    });
    thead.appendChild(trHead);

    // ===== BODY =====
    rows.forEach(row => {
        const tr = document.createElement('tr');
        row.forEach(val => {
            const td = document.createElement('td');
            td.textContent = val;
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    const count = rows.length;
    rowCount.textContent = count;

    if (count === 36) {
        speechBubble.show(`Tôi tìm thấy ${count}☘️ kết quả! ✅`, {
            duration: 2000
        });
    } else {
        speechBubble.show(`Tôi tìm thấy ${count} kết quả! ✅`, {
            duration: 2000
        });
    }

    if (count > totalOutputBarcode && totalOutputBarcode > 0) {
        const dif = count - totalOutputBarcode;

        document.querySelector('.output-table-scroll')?.addEventListener('mouseenter', () => {
            speechBubble.show(`⚠️ Có ${dif} tem in bù!`, {
                duration: 5000,
                animation: 'shake'
            })
        })
    }
}

function initClientSearch() {
    const searchInput = document.getElementById('clientSearch');
    const searchIconBtn = document.querySelector('.search-icon-btn');
    const inputWrapper = document.querySelector('.input-wrapper');

    // Disable clientSearch khi vừa load page
    if (searchInput) {
        searchInput.disabled = true;
    }
    if (searchIconBtn) {
        searchIconBtn.style.cursor = 'not-allowed';
    }

    if (searchInput && searchIconBtn) {
        // Click icon để toggle: nếu đang focus thì đóng + clear, nếu chưa thì mở
        searchIconBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            // Không cho click nếu disabled
            if (searchInput.disabled) return;

            if (document.activeElement === searchInput) {
                // Đang focus → đóng và clear
                searchInput.value = '';
                searchInput.blur();
                filterClientResult(''); // Reset filter
            } else {
                // Chưa focus → mở
                searchInput.focus();
            }
        });

        // Đóng search khi click bên ngoài và input rỗng
        document.addEventListener('click', (e) => {
            const clickedInside = inputWrapper.contains(e.target);
            if (!clickedInside && searchInput.value.trim() === '') {
                searchInput.blur();
            }
        });
    }

    if (!searchInput) return;

    // Filter khi người dùng nhập
    searchInput.addEventListener('input', function () {
        const keyword = this.value.trim().toLowerCase();
        filterClientResult(keyword);
    });

    // Ẩn button khi search mở
    searchInput.addEventListener('focus', () => {
        if (searchInput.disabled) return;
        searchIconBtn.style.pointerEvents = 'none';
    });

    // Hiện button khi search đóng
    searchInput.addEventListener('blur', () => {
        if (searchInput.disabled) {
            searchIconBtn.style.cursor = 'not-allowed';
        } else {
            searchIconBtn.style.pointerEvents = 'auto';
            searchIconBtn.style.cursor = 'pointer';
        }
    });
}

/**
 * Enable hoặc disable clientSearch dựa trên số dòng trong table
 * @param {boolean} hasData - true nếu table có dữ liệu gốc từ server
 */
function updateClientSearchState(hasData = false) {
    const searchInput = document.getElementById('clientSearch');
    const searchIconBtn = document.querySelector('.search-icon-btn');

    if (!searchInput || !searchIconBtn) return;

    if (hasData) {
        // Enable clientSearch khi có dữ liệu
        searchInput.disabled = false;
        searchIconBtn.style.cursor = 'pointer';
    } else {
        // Disable clientSearch khi không có dữ liệu
        searchInput.disabled = true;
        searchInput.value = ''; // Clear input
        searchIconBtn.style.cursor = 'not-allowed';
    }
}

function setTableData(result, columns, tableType = null) {
    rawTableData = result;
    rawTableColumns = columns;
    currentTableType = tableType;
    updateClientSearchState(true);
    displayTable(result, columns);
}

async function apiFetch(url, options = {}) {
    showLoading();

    try {
        const res = await fetch(url, options);

        if (!res.ok) {
            throw new Error(`HTTP error ${res.status}`);
        }

        return await res.json();
    } finally {
        hideLoading();
    }
}

function showLoading() {
    const loader = document.getElementById('apiLoading');
    if (!loader) return;

    apiLoadingCount++;
    loader.style.display = 'flex';
}

function hideLoading() {
    const loader = document.getElementById('apiLoading');
    if (!loader) return;

    apiLoadingCount--;

    if (apiLoadingCount <= 0) {
        apiLoadingCount = 0;
        loader.style.display = 'none';
    }
}

function updateVisibleRowCount() {
    const tbody = document.getElementById('tableBody');
    const tableFooter = document.querySelector('.table-footer');
    const rowCount = document.getElementById('rowCount');

    if (!tbody || !tableFooter || !rowCount) return;

    const count = tbody.querySelectorAll('tr').length;
    rowCount.textContent = count;

    if (count === 36) {
        speechBubble.show(`Tôi tìm thấy ${count}☘️ kết quả! ✅`, {
            duration: 2000
        });
    } else {
        speechBubble.show(`Tôi tìm thấy ${count} kết quả! ✅`, {
            duration: 2000
        });
    }

    // Ẩn toàn bộ table-footer nếu không có dòng
    tableFooter.classList.toggle('hidden', count === 0);
}

document.addEventListener('click', function (e) {
    const button = e.target.closest('.btn-export-excel');
    if (!button) return;

    const buttonId = button.id;
    if (buttonId === 'exportExcelBtn') {
        handleExportExcel();
    }

    if (buttonId === 'exportOutputExcelBtn') {
        handleExportOutputBarcodeExcel();
    }
});

async function handleExportExcel() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    if (rows.length === 0) return;

    const confirmed = await showConfirm('Bạn có chắc chắn muốn xuất file Excel của dữ liệu trên?');
    if (!confirmed) return;

    exportTableToExcel();
}

function exportTableToExcel() {
    const table = document.querySelector('.table-container table');
    if (!table) return;

    const cloneTable = table.cloneNode(true);

    cloneTable.querySelectorAll('td[data-full-value]').forEach(td => {
        td.textContent = td.dataset.fullValue;
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.table_to_sheet(cloneTable, { raw: true });
    XLSX.utils.book_append_sheet(wb, ws, 'Data');

    const fileName =
        'KDMES_TOOL_' +
        getVietnamTimestamp() +
        '.xlsx';

    XLSX.writeFile(wb, fileName);
}

async function handleExportOutputBarcodeExcel() {
    const tbody = document.getElementById('outputBarcodeTableBody');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    if (rows.length === 0) return;

    const confirmed = await showConfirm(
        'Bạn có chắc chắn muốn xuất file Excel của dữ liệu trên?'
    );
    if (!confirmed) return;

    exportOutputBarcodeToExcel();
}

function exportOutputBarcodeToExcel() {
    const table = document.getElementById('outputBarcodeTable');
    if (!table) return;

    const cloneTable = table.cloneNode(true);

    cloneTable.querySelectorAll('td[data-full-value]').forEach(td => {
        td.textContent = td.dataset.fullValue;
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.table_to_sheet(cloneTable, { raw: true });
    XLSX.utils.book_append_sheet(wb, ws, 'Barcode_Detail');

    const fileName =
        'KDMES_TOOL_' +
        getVietnamTimestamp() +
        '.xlsx';

    XLSX.writeFile(wb, fileName);
}

function getVietnamTimestamp() {
    const now = new Date();

    const parts = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(now);

    const get = (type) => parts.find(p => p.type === type)?.value;

    return (
        get('year') +
        get('month') +
        get('day') +
        '_' +
        get('hour') +
        get('minute') +
        get('second')
    );
}

document.addEventListener('DOMContentLoaded', () => {
    const autoClearInputs = [
        '#clientSearch',
        '#department',
        '#station'
    ];

    autoClearInputs.forEach(selector => {
        const input = document.querySelector(selector);
        if (!input) return;

        input.addEventListener('mousedown', e => {
            if (e.button !== 0) return;

            if (input.value.trim() !== '') {
                e.preventDefault();
                input.value = '';

                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    });
});

function enterSingleRowMode() {
    const tbody = document.getElementById('tableBody');
    if (!tbody || !selectedRow) return;

    // backup table lần đầu
    if (!originalTableHTML) {
        originalTableHTML = tbody.innerHTML;
    }

    // giữ lại đúng dòng đã chọn
    tbody.innerHTML = '';
    tbody.appendChild(selectedRow);

    updateVisibleRowCount();
}

function exitSingleRowMode() {
    const tbody = document.getElementById('tableBody');
    if (!tbody || !originalTableHTML) return;

    tbody.innerHTML = originalTableHTML;

    originalTableHTML = null;
    selectedRow = null;
    selectedRowData = null;

    updateVisibleRowCount();
}

/**
 * Speech Bubble Controller
 * Sử dụng để hiển thị message từ NES button
 */
const speechBubble = {
    element: null,
    textElement: null,
    hideTimeout: null,

    init () {
        this.element = document.getElementById('speech-bubble');
        this.textElement = document.getElementById('speech-bubble-text');

        if (!this.element || !this.textElement) {
            console.warn('Speech bubble elements not found');
            return false;
        }

        // Add click event to hide
        this.element.addEventListener('click', () => {
            this.hide();
        });

        // Add cursor pointer style
        this.element.style.cursor = 'pointer';

        return true;
    },

    /**
     * Hiển thị speech bubble với message tùy chỉnh
     * @param {string} message - Nội dung hiển thị
     * @param {Object} options - Tùy chọn
     * @param {number} options.duration - Thời gian hiển thị (ms), 0 = không tự động ẩn
     * @param {string} options.animation - 'bounce' | 'shake' | 'none'
     * @param {boolean} options.pixelStyle - Sử dụng pixel art style
     */
    show (message, options = {}) {
        if (!this.element || !this.textElement) {
            if (!this.init()) return;
        }

        // Bear Speak
        document.querySelector('.loader')?.classList.add('talking');

        const {
            duration = 3000,
            animation = 'bounce',
            pixelStyle = false
        } = options;

        // Clear previous timeout
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }

        // Set message
        this.textElement.innerHTML = message;

        // Apply pixel style if needed
        if (pixelStyle) {
            this.element.classList.add('pixel-style');
        } else {
            this.element.classList.remove('pixel-style');
        }

        // Remove previous animation classes
        this.element.classList.remove('animate-bounce', 'animate-shake');

        // Show bubble
        this.element.classList.remove('hidden');

        // Add animation
        if (animation === 'bounce') {
            this.element.classList.add('animate-bounce');
        } else if (animation === 'shake') {
            this.element.classList.add('animate-shake');
        }

        // Auto hide after duration
        if (duration > 0) {
            this.hideTimeout = setTimeout(() => {
                this.hide();
            }, duration);
        }
    },

    /**
     * Ẩn speech bubble
     * @param {boolean} immediate - Ẩn ngay lập tức không có animation
     */
    hide (immediate = false) {
        if (!this.element) return;

        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }

        if (immediate) {
            this.element.style.transition = 'none';
            this.element.classList.add('hidden');
            // hide bear talking
            document.querySelector('.loader')?.classList.remove('talking')

            setTimeout(() => {
                this.element.style.transition = '';
            }, 10);
        } else {
            this.element.classList.add('hidden');
            // hide bear talking
            document.querySelector('.loader')?.classList.remove('talking')
        }
    },

    /**
     * Toggle speech bubble
     */
    toggle (message, options = {}) {
        if (!this.element) {
            if (!this.init()) return;
        }

        if (this.element.classList.contains('hidden')) {
            this.show(message, options);
        } else {
            this.hide();
        }
    },

    /**
     * Update message without hiding/showing
     */
    updateMessage (message) {
        if (!this.textElement) return;
        this.textElement.innerHTML = message;
    }
};

function initDateRangePicker(type) {
    const dateInput = document.getElementById('dateRange');
    const fromDateEl = document.getElementById('fromDate');
    const toDateEl = document.getElementById('toDate');

    if (!dateInput) return;

    // explicit reset
    fromDateEl.value = '';
    toDateEl.value = '';
    dateInput.value = '';

    const flatpickrInstance = flatpickr(dateInput, {
        mode: "range",
        dateFormat: "Y-m-d",
        maxDate: "today",
        allowInput: false, // tránh user gõ tay
        clickOpens: true,
        defaultDate: null,
        locale: {
            rangeSeparator: " → "
        },

        onClose(selectedDates) {
            // chưa chọn đủ range → reset
            if (selectedDates.length !== 2) {
                fromDateEl.value = '';
                toDateEl.value = '';
                return;
            }

            fromDateEl.value = formatDate(selectedDates[0]);
            toDateEl.value = formatDate(selectedDates[1]);

            if (type == 'scan_barcode_history') { checkAndSearchHistoryScanByStation() }

            if (type == 'print_barcode_history') { checkAndSearchHistoryPrintByStation() }

            if (type == 'reprint') { checkQueryReprintBarcode() }
        }
    });
    // Event click để clear calendar
    dateInput.addEventListener('click', function (e) {
        if (dateInput.value) {
            e.preventDefault();
            flatpickrInstance.clear();
            dateInput.value = '';
            fromDateEl.value = '';
            toDateEl.value = '';
            clearTable();
        }
    });

    return flatpickrInstance;
}

/**
 * Sort result theo tên cột
 * @param {Array[]} result - data dạng [ [..], [..] ]
 * @param {string[]} columns - danh sách tên cột
 * @param {string} columnName - tên cột cần sort
 * @param {'asc' | 'desc'} order - thứ tự sort
 * @param {'date' | 'number' | 'string'} type - kiểu dữ liệu
 */
function sortResultByColumn(result, columns, columnName, order = 'desc', type = 'date') {
    const colIndex = columns.indexOf(columnName);
    if (colIndex === -1) return result;
    return [...result].sort((a, b) => {
        let valA = a[colIndex];
        let valB = b[colIndex];

        if (valA == null) return 1;
        if (valB == null) return -1;

        switch (type) {
            case 'number':
                valA = Number(valA);
                valB = Number(valB);
                break;
            case 'string':
                valA = String(valA).toLowerCase();
                valB = String(valB).toLowerCase();
                break;
            case 'date':
            default:
                valA = new Date(valA).getTime();
                valB = new Date(valB).getTime();
                break;
        }

        return order === 'asc' ? valA - valB : valB - valA;
    });
}

function convertISOToVietNamDate(isoString) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date(isoString));
}

async function getWorkOrderDetails() {
    const work_order_id = selectedRowData['work_order'];
    if (!work_order_id) {
        await showAlert('Chưa chọn hàng dữ liệu.', 'warning');
        return;
    }

    const data = await apiFetch('/api/getWorkOrder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: work_order_id })
    });

    if (data.success) {
        setTableData(data.result, data.columns, null);
    } else {
        await showAlert(data.message, 'error');
    }
}

async function fetchScanBarcodeHistoryByBarcode() {
    const resource_id = selectedRowData['id'];
    if (!resource_id) {
        await showAlert('Chưa chọn hàng dữ liệu.', 'warning');
        return;
    }

    const data = await apiFetch('/api/barcode/searchScanBarcodeHistory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_id })
    });

    if (Array.isArray(data.result) && data.result.length === 0) {
        await showAlert(`Barcode ${resource_id} đang không được quét vào bất kỳ máy nào`, 'info');
        return;
    }

    if (data.success) {
        setTableData(data.result, data.columns, null);;
    } else {
        await showAlert(data.message, 'error');
    }
}

const canvas = document.getElementById("starfield");
const ctx = canvas.getContext("2d");
let w, h;
let speed = 2;
const stars = [];
let mouseX = 0;
let isMouseInWindow = true;
let animationId = null;

function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    
    // Redraw background immediately after resize
    ctx.fillStyle = "rgba(2, 1, 17, 1)";
    ctx.fillRect(0, 0, w, h);
    
    // Reinitialize stars proportionally to new size
    stars.forEach(star => {
        // Keep stars within new bounds
        if (Math.abs(star.x) > w / 2) {
            star.x = (Math.random() - 0.5) * w;
        }
        if (Math.abs(star.y) > h / 2) {
            star.y = (Math.random() - 0.5) * h;
        }
        if (star.z > w) {
            star.z = Math.random() * w;
        }
    });
}

// Debounce resize để tránh quá nhiều redraws
let resizeTimeout;
window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        resize();
    }, 100);
});

resize();

// Initialize stars
for (let i = 0; i < 400; i++) {
    stars.push({
        x: Math.random() * w - w / 2,
        y: Math.random() * h - h / 2,
        z: Math.random() * w
    });
}

// Mouse move effect - chỉ cập nhật mouseX
document.addEventListener("mousemove", e => {
    mouseX = e.clientX;
    isMouseInWindow = true;
});

// Detect khi chuột rời khỏi window
document.addEventListener("mouseleave", () => {
    isMouseInWindow = false;
    // Reset speed về giá trị mặc định khi chuột rời window
    speed = 2;
});

// Detect khi chuột quay lại window
document.addEventListener("mouseenter", () => {
    isMouseInWindow = true;
});

// Detect khi tab/window bị blur (chuyển sang app khác)
window.addEventListener("blur", () => {
    isMouseInWindow = false;
    speed = 2;
});

// Detect khi tab/window được focus lại
window.addEventListener("focus", () => {
    isMouseInWindow = true;
});

// Visibility API - detect khi tab bị ẩn/hiện
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        // Tab bị ẩn - tạm dừng animation
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        speed = 2;
    } else {
        // Tab được hiện lại - tiếp tục animation
        if (!animationId) {
            animate();
        }
    }
});

function animate() {
    // Semi-transparent black for trail effect
    ctx.fillStyle = "rgba(2, 1, 17, 0.4)";
    ctx.fillRect(0, 0, w, h);

    // Chỉ update speed khi chuột trong window
    if (isMouseInWindow) {
        speed = (mouseX / window.innerWidth) * 8 + 1;
    } else {
        // Smooth transition về speed mặc định
        speed += (2 - speed) * 0.1;
    }

    // Draw stars
    ctx.fillStyle = "#fff";
    stars.forEach(s => {
        s.z -= speed;
        if (s.z <= 0) {
            s.z = w;
            s.x = Math.random() * w - w / 2;
            s.y = Math.random() * h - h / 2;
        }

        const x = (s.x / s.z) * w + w / 2;
        const y = (s.y / s.z) * h + h / 2;
        const size = (1 - s.z / w) * 2.5;

        // Draw star
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();

        // Draw trail
        const px = (s.x / (s.z + speed * 2)) * w + w / 2;
        const py = (s.y / (s.z + speed * 2)) * h + h / 2;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 * (1 - s.z / w)})`;
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(px, py);
        ctx.stroke();
    });

    animationId = requestAnimationFrame(animate);
}

animate();
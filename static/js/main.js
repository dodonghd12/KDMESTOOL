// ===== INSTANT THEME & TABLE DENSITY SYNC =====
(function syncInitialThemeAndDensity() {
    try {
        // Theme Sync (default: dark)
        const savedTheme = localStorage.getItem('kd_theme') || 'dark';
        const isLight = (savedTheme === 'light');
        document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
        if (document.body) {
            document.body.classList.toggle('theme-light', isLight);
        }

        // Density Sync (default: default [48px], supported: compact, default, comfortable)
        const savedDensity = localStorage.getItem('kd_table_density') || 'default';
        if (document.body) {
            document.body.classList.remove('density-compact', 'density-default', 'density-comfortable');
            document.body.classList.add(`density-${savedDensity}`);
        }
    } catch (e) {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (document.body) {
            document.body.classList.add('density-default');
        }
    }
})();

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
    // Skip if in SPA shell or inside sub-frame to allow instant 0ms switching
    if (document.body.classList.contains('spa-shell-body') || document.body.classList.contains('is-spa-frame') || window !== window.top) {
        return;
    }

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
    if (!modal) return Promise.resolve(false);

    const content = modal.querySelector('.custom-modal-content');
    const icon = document.getElementById('modalIcon');
    const titleEl = document.getElementById('modalTitle');
    const messageEl = document.getElementById('modalMessage');
    const footer = document.getElementById('modalFooter');

    const validTypes = ['info', 'success', 'error', 'warning'];
    const currentType = validTypes.includes(type) ? type : 'info';

    // Set modal content theme class
    if (content) {
        content.className = 'custom-modal-content type-' + currentType;
    }

    // Set icon badge with Material Symbols
    if (icon) {
        icon.className = 'custom-modal-icon ' + currentType;
        const icons = {
            'info': '<span class="material-symbols-outlined">info</span>',
            'success': '<span class="material-symbols-outlined">check_circle</span>',
            'error': '<span class="material-symbols-outlined">error</span>',
            'warning': '<span class="material-symbols-outlined">warning</span>'
        };
        icon.innerHTML = icons[currentType] || '<span class="material-symbols-outlined">info</span>';
    }

    if (titleEl) titleEl.textContent = title;
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.style.whiteSpace = 'pre-line'; // Allow line breaks in message
    }

    // Clear and add buttons
    if (footer) {
        footer.innerHTML = '';
        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.className = 'custom-modal-btn ' + (btn.class || 'custom-modal-btn-primary');
            button.textContent = btn.text;
            footer.appendChild(button);
        });
    }

    modal.classList.add('show');

    // Lock body scroll
    document.body.style.overflow = 'hidden';

    // Auto-focus primary/confirm button for great keyboard UX
    setTimeout(() => {
        if (footer) {
            const primaryBtn = footer.querySelector('.custom-modal-btn-primary') || footer.firstElementChild;
            if (primaryBtn) primaryBtn.focus();
        }
    }, 40);

    // Return promise for confirm dialogs
    return new Promise((resolve) => {
        if (!footer) {
            resolve(true);
            return;
        }
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

// ===== WORK ORDER STATUS MAPPING =====
const WORK_ORDER_STATUS_MAP = {
    '0': 'Đã điều động',
    '1': 'Đã chọn máy',
    '3': 'Hoàn thành',
    '4': 'Xoá điều động',
    '5': 'Tạm ngưng'
};

function mapWorkOrderStatus(rows, columns) {
    const statusIndex = columns.indexOf('status');
    if (statusIndex === -1) return rows;

    return rows.map(row => {
        const newRow = [...row];
        const statusVal = String(newRow[statusIndex]);
        newRow[statusIndex] = WORK_ORDER_STATUS_MAP[statusVal] ?? `Unknown (${statusVal})`;
        return newRow;
    });
}

function closeModal() {
    const modal = document.getElementById('customModal');
    modal.classList.remove('show');

    // Unlock body scroll
    document.body.style.overflow = '';
}

// ===== TOAST NOTIFICATION CONTROLLER (BOTTOM-RIGHT, 4 TYPES, SPRING PHYSICS, MAX 3) =====
const Toast = {
    DURATIONS: {
        info: 4000,     // 4s
        warning: 8000,  // 8s
        success: 4000,  // 4s
        error: 20000    // 20s
    },

    TITLES: {
        info: 'Thông tin',
        warning: 'Cảnh báo',
        success: 'Thành công',
        error: 'Lỗi'
    },

    ICONS: {
        info: 'info',
        warning: 'warning',
        success: 'check_circle',
        error: 'error'
    },

    init() {
        return this.getContainer().container;
    },

    getContainer() {
        let targetDoc = document;
        try {
            if (window.top && window.top.document) {
                targetDoc = window.top.document;
            }
        } catch (e) {
            targetDoc = document;
        }

        let cont = targetDoc.getElementById('toastContainer');
        if (!cont) {
            cont = targetDoc.createElement('div');
            cont.id = 'toastContainer';
            targetDoc.body.appendChild(cont);
        }
        return { container: cont, doc: targetDoc };
    },

    show(titleOrMessage, messageOrType, type = 'info', customDuration = null) {
        let title = '';
        let message = '';
        let toastType = 'info';

        // Support flexible call patterns:
        // 1. Toast.show('Title', 'Message', 'success', 4000)
        // 2. Toast.show('Message only', 'warning')
        // 3. Toast.show('error', 'Title', 'Message')
        if (['info', 'warning', 'success', 'error'].includes(titleOrMessage)) {
            toastType = titleOrMessage;
            title = typeof messageOrType === 'string' ? messageOrType : (this.TITLES[toastType] || 'Thông báo');
            message = typeof type === 'string' ? type : '';
        } else if (['info', 'warning', 'success', 'error'].includes(messageOrType)) {
            toastType = messageOrType;
            message = String(titleOrMessage || '');
            title = this.TITLES[toastType] || 'Thông tin';
        } else if (['info', 'warning', 'success', 'error'].includes(type)) {
            toastType = type;
            title = String(titleOrMessage || this.TITLES[toastType]);
            message = String(messageOrType || '');
        } else {
            toastType = 'info';
            title = String(titleOrMessage || this.TITLES.info);
            message = String(messageOrType || '');
        }

        const duration = (typeof customDuration === 'number' && customDuration > 0)
            ? customDuration
            : (this.DURATIONS[toastType] || 4000);

        const { container, doc } = this.getContainer();
        const iconName = this.ICONS[toastType] || 'info';

        // Stacking limit: Maximum 3 toasts at any time (dismiss oldest top toast)
        const activeToasts = container.querySelectorAll('.toast-item:not(.removing)');
        if (activeToasts.length >= 3) {
            for (let i = 0; i <= activeToasts.length - 3; i++) {
                const oldToast = activeToasts[i];
                oldToast.classList.add('removing');
                setTimeout(() => {
                    try { oldToast.remove(); } catch (e) {}
                }, 150);
            }
        }

        const toast = doc.createElement('div');
        toast.className = `toast-item toast-${toastType}`;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'polite');
        toast.title = 'Click để đóng thông báo';

        toast.innerHTML = `
            <span class="material-symbols-outlined toast-icon" aria-hidden="true">${iconName}</span>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" type="button" title="Đóng" aria-label="Đóng thông báo">
                <svg class="close-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
            <div class="toast-progress" style="animation-duration: ${duration}ms;"></div>
        `;

        const progressBar = toast.querySelector('.toast-progress');
        const closeBtn = toast.querySelector('.toast-close');

        let timer = null;
        let isDismissed = false;
        let remainingTime = duration;
        let lastStartTime = performance.now();

        const dismiss = (fast = false) => {
            if (isDismissed) return;
            isDismissed = true;
            if (timer) clearTimeout(timer);

            toast.classList.add('removing');
            if (fast) {
                toast.style.animationDuration = '0.15s';
            }
            setTimeout(() => {
                try { toast.remove(); } catch (e) {}
            }, fast ? 150 : 280);
        };

        const startTimer = () => {
            lastStartTime = performance.now();
            if (progressBar) progressBar.style.animationPlayState = 'running';
            timer = setTimeout(() => {
                dismiss();
            }, remainingTime);
        };

        const pauseTimer = () => {
            if (timer) clearTimeout(timer);
            const elapsed = performance.now() - lastStartTime;
            remainingTime = Math.max(0, remainingTime - elapsed);
            if (progressBar) progressBar.style.animationPlayState = 'paused';
        };

        // Start countdown timer
        startTimer();

        // Hover to pause auto-dismiss and progress bar
        toast.addEventListener('mouseenter', pauseTimer);
        toast.addEventListener('mouseleave', startTimer);

        // Click anywhere to dismiss
        toast.addEventListener('click', () => {
            dismiss();
        });

        // Close button click
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dismiss();
            });
        }

        // Append new toast to the bottom (pushes older toasts upwards)
        container.appendChild(toast);

        return {
            element: toast,
            dismiss: dismiss
        };
    },

    info(titleOrMsg, msg, duration) {
        return this.show(titleOrMsg, msg, 'info', duration);
    },
    warning(titleOrMsg, msg, duration) {
        return this.show(titleOrMsg, msg, 'warning', duration);
    },
    success(titleOrMsg, msg, duration) {
        return this.show(titleOrMsg, msg, 'success', duration);
    },
    error(titleOrMsg, msg, duration) {
        return this.show(titleOrMsg, msg, 'error', duration);
    }
};
window.Toast = Toast;

// Unified showAlert wrapper converting all alerts across the project to Toasts
function showAlert(message, type = 'info', onOk = null) {
    let finalType = 'info';
    let finalMsg = '';
    let finalTitle = null;

    if (['info', 'warning', 'success', 'error'].includes(message)) {
        finalType = message;
        finalTitle = typeof type === 'string' ? type : null;
        finalMsg = typeof onOk === 'string' ? onOk : (typeof type === 'string' ? type : '');
    } else {
        finalType = ['info', 'warning', 'success', 'error'].includes(type) ? type : 'info';
        finalMsg = String(message || '');
    }

    Toast[finalType](finalTitle || Toast.TITLES[finalType] || 'Thông báo', finalMsg);

    if (typeof onOk === 'function') {
        setTimeout(onOk, 10);
    }

    return Promise.resolve(true);
}
window.showAlert = showAlert;

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

// ===== INPUT CLEAR BUTTONS (x) & FLOATING LABELS TRACKER =====
function initInputClearButtons() {
    document.querySelectorAll('.input-box').forEach(box => {
        const input = box.querySelector('.input');
        if (!input) return;

        // Ensure placeholder is set for CSS :not(:placeholder-shown) floating label support
        if (!input.placeholder || input.placeholder === '') {
            input.placeholder = ' ';
        }

        let clearBtn = box.querySelector('.clear-btn');
        if (!clearBtn) {
            clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'clear-btn';
            clearBtn.innerHTML = '<svg class="clear-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
            clearBtn.title = 'Xóa nội dung';
            box.appendChild(clearBtn);

            clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                input.value = '';
                box.classList.remove('has-value');
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.focus();
            });
        }

        const updateClearState = () => {
            if (input.value && input.value.trim().length > 0) {
                box.classList.add('has-value');
            } else {
                box.classList.remove('has-value');
            }
        };

        input.addEventListener('input', updateClearState);
        input.addEventListener('change', updateClearState);
        input.addEventListener('keyup', updateClearState);
        input.addEventListener('blur', updateClearState);
        input.addEventListener('focus', updateClearState);
        updateClearState();
    });
}

// ===== CLEAR INPUT HELPER =====
function clearInputBox(inputEl) {
    if (!inputEl) return;
    inputEl.value = '';
    const box = inputEl.closest('.input-box');
    if (box) {
        box.classList.remove('has-value');
    }
}
window.clearInputBox = clearInputBox;

// ===== AUTO UPPERCASE =====
function initAutoUppercase() {
    const uppercaseIds = ['barcode', 'product_id', 'feed_record_id', 'workOrderInput', 'substitutions', 'mr_id', 'mr_product_id', 'mr_station', 'station', 'department'];
    uppercaseIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.dataset.uppercaseInit) {
            el.dataset.uppercaseInit = 'true';
            el.addEventListener('input', (e) => {
                const start = e.target.selectionStart;
                const end = e.target.selectionEnd;
                e.target.value = e.target.value.toUpperCase();
                if (start !== null && end !== null) {
                    e.target.setSelectionRange(start, end);
                }
            });
        }
    });
}

// ===== KEYBOARD SHORTCUTS =====
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl + K -> Focus main search input
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            const searchInp = document.getElementById('barcode') ||
                              document.getElementById('product_id') ||
                              document.getElementById('clientSearch') ||
                              document.getElementById('workOrderInput') ||
                              document.querySelector('.input-box .input');
            if (searchInp) {
                searchInp.focus();
                searchInp.select?.();
            }
            return;
        }

        // Ctrl + Enter -> Execute search / submit
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const searchBtn = document.getElementById('searchBtn') ||
                              document.getElementById('insertMaterialBtn');
            if (searchBtn) {
                searchBtn.click();
            }
            return;
        }

        // Ctrl + D -> View details for selected row
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            if (selectedRow) {
                showDetails();
            } else if (selectedOutputRow) {
                showOutputDetails();
            } else {
                Toast.info('Thông báo', 'Vui lòng click chọn 1 dòng dữ liệu để xem chi tiết');
            }
            return;
        }

        // Ctrl + E -> Export Excel
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
            e.preventDefault();
            const exportBtn = document.getElementById('exportExcelBtn') || document.getElementById('exportOutputExcelBtn');
            if (exportBtn && !exportBtn.closest('.hidden')) {
                exportBtn.click();
            }
            return;
        }

        // Escape -> Close Context Menu, Modals, Dropdowns, or Output Barcode
        if (e.key === 'Escape') {
            const contextMenu = document.getElementById('contextMenu');
            if (contextMenu && contextMenu.style.display !== 'none') {
                contextMenu.style.display = 'none';
                return;
            }
            const detailsModal = document.getElementById('detailsModal');
            if (detailsModal && !detailsModal.classList.contains('hidden')) {
                closeDetailsModal();
                return;
            }
            const comparisonModal = document.getElementById('comparisonModal');
            if (comparisonModal && !comparisonModal.classList.contains('hidden') && comparisonModal.style.display !== 'none') {
                if (typeof closeComparisonModal === 'function') {
                    closeComparisonModal();
                } else {
                    comparisonModal.classList.add('hidden');
                    comparisonModal.classList.remove('show');
                }
                return;
            }
            const openDropdowns = document.querySelectorAll('.dropdown-list.show');
            if (openDropdowns.length > 0) {
                openDropdowns.forEach(dd => dd.classList.remove('show'));
                return;
            }
            const outputContainer = document.getElementById('outputContainer');
            if (outputContainer && outputContainer.style.display === 'flex') {
                if (typeof closeShowBarcodeWindow === 'function') {
                    closeShowBarcodeWindow();
                }
                return;
            }
        }
    });
}

// ===== DROPDOWN LIST KEYBOARD NAVIGATION (MỤC 4) =====
function initDropdownKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
        const openDropdown = document.querySelector('.dropdown-list.show');
        if (!openDropdown) return;

        const items = Array.from(openDropdown.querySelectorAll('.dropdown-item:not([style*="cursor:default"])'));
        if (items.length === 0) return;

        let currentIndex = items.findIndex(item => item.classList.contains('highlight'));

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            const nextIndex = (currentIndex + 1) % items.length;
            items.forEach((item, idx) => {
                if (idx === nextIndex) {
                    item.classList.add('highlight');
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('highlight');
                }
            });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            const prevIndex = (currentIndex - 1 + items.length) % items.length;
            items.forEach((item, idx) => {
                if (idx === prevIndex) {
                    item.classList.add('highlight');
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('highlight');
                }
            });
        } else if (e.key === 'Enter') {
            let target = null;
            if (currentIndex >= 0 && currentIndex < items.length) {
                target = items[currentIndex];
            } else {
                const hoveredItem = openDropdown.querySelector('.dropdown-item:hover');
                if (hoveredItem && !hoveredItem.getAttribute('style')?.includes('cursor:default')) {
                    target = hoveredItem;
                } else if (items.length === 1) {
                    target = items[0];
                }
            }

            if (target) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                // 1. Dispatch mousedown (cho các trang dùng mousedown listener)
                target.dispatchEvent(new MouseEvent('mousedown', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    buttons: 1
                }));

                // 2. Dispatch mouseup
                target.dispatchEvent(new MouseEvent('mouseup', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    buttons: 1
                }));

                // 3. Dispatch click (cho các trang dùng click listener)
                target.click();

                // Đóng dropdown và xóa highlight
                openDropdown.classList.remove('show');
                items.forEach(item => item.classList.remove('highlight'));
            }
        }
    }, true);
}

// ===== CONTEXT MENU KEYBOARD NAVIGATION =====
let contextMenuNavIndex = -1;

function initContextMenuKeyboard() {
    document.addEventListener('keydown', (e) => {
        const contextMenu = document.getElementById('contextMenu');
        if (!contextMenu || contextMenu.style.display === 'none') return;

        const visibleItems = Array.from(contextMenu.querySelectorAll('.context-menu-item'))
            .filter(item => item.style.display !== 'none');
        if (visibleItems.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            contextMenuNavIndex = (contextMenuNavIndex + 1) % visibleItems.length;
            updateContextMenuFocus(visibleItems);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            contextMenuNavIndex = (contextMenuNavIndex - 1 + visibleItems.length) % visibleItems.length;
            updateContextMenuFocus(visibleItems);
        } else if (e.key === 'Enter') {
            if (contextMenuNavIndex >= 0 && contextMenuNavIndex < visibleItems.length) {
                e.preventDefault();
                visibleItems[contextMenuNavIndex].click();
                contextMenu.style.display = 'none';
                contextMenuNavIndex = -1;
            }
        }
    });
}

function updateContextMenuFocus(items) {
    items.forEach((item, idx) => {
        if (idx === contextMenuNavIndex) {
            item.classList.add('focused');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('focused');
        }
    });
}

// ===== ENHANCE CONTEXT MENU WITH MATERIAL ICONS =====
function enhanceContextMenu() {
    const actionIcons = {
        'inputBarcode': 'barcode_scanner',
        'feedRecords': 'history',
        'checkScanBarcodeHistory': 'receipt_long',
        'checkBarcodeWorkOrder': 'assignment',
        'checkBarcodeTransfer': 'local_shipping',
        'checkBarcodeExtendDateTime': 'update',
        'fetchOriginalInfo': 'info',
        'getPrdeba': 'dataset',
        'getPrdebb': 'dataset',
        'getPrdebc': 'dataset',
        'outputBarcodeByFeedRecords': 'output',
        'searchWorkOrderByRecipe': 'assignment',
        'searchCommitGitlabByRecipe': 'source',
        'fetchYamlDetails': 'code',
        'outputByBarcode': 'qr_code_2',
        'outputByRecipe': 'qr_code_2',
        'commitDetailByRecipe': 'history_edu'
    };

    document.querySelectorAll('.context-menu-item').forEach(item => {
        const action = item.dataset.action;
        if (action && actionIcons[action] && !item.querySelector('.material-symbols-outlined')) {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'material-symbols-outlined';
            iconSpan.textContent = actionIcons[action];
            item.prepend(iconSpan);
        }
    });
}

// ===== TABLE SKELETON LOADING HELPER =====
function showTableSkeleton(columnsCount = 6, rowsCount = 5, targetTbodyId = 'tableBody') {
    const tbody = typeof targetTbodyId === 'string' ? document.getElementById(targetTbodyId) : targetTbodyId;
    if (!tbody) return;

    // Check if table has thead columns
    const table = tbody.closest('table') || document.querySelector('.table-container table');
    let cols = columnsCount;
    if (table) {
        const headerThs = table.querySelectorAll('thead th');
        if (headerThs && headerThs.length > 0) {
            cols = headerThs.length;
        }
    }

    tbody.innerHTML = '';
    const widths = [65, 80, 50, 70, 60, 75, 55, 85, 45, 68];

    for (let i = 0; i < rowsCount; i++) {
        const tr = document.createElement('tr');
        tr.className = 'skeleton-row';
        for (let j = 0; j < cols; j++) {
            const td = document.createElement('td');
            const skeletonDiv = document.createElement('div');
            skeletonDiv.className = 'skeleton-cell';
            const widthPct = widths[(i * 3 + j) % widths.length];
            skeletonDiv.style.width = `${widthPct}%`;
            td.appendChild(skeletonDiv);
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
}
window.showTableSkeleton = showTableSkeleton;

// ===== UNIVERSAL BROWSER AUTOFILL & SAVED INFO SUPPRESSOR =====
function initAutofillSuppressor() {
    function guardInput(input) {
        if (!input || input.type === 'checkbox' || input.type === 'radio' || input.type === 'file' || input.type === 'button' || input.type === 'submit') {
            return;
        }

        // Set anti-autofill attributes
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('spellcheck', 'false');
        input.setAttribute('data-lpignore', 'true');
        input.setAttribute('data-form-type', 'other');
        input.setAttribute('data-1p-ignore', 'true');
        input.setAttribute('aria-autocomplete', 'none');

        // Prevent Edge/Chrome saved info popup via readonly toggle on pointerdown / focus
        if (!input.dataset.autofillGuarded) {
            input.dataset.autofillGuarded = 'true';

            // Set readonly initially if not active element
            if (document.activeElement !== input && !input.readOnly) {
                input.readOnly = true;
            }

            input.addEventListener('focus', function () {
                if (this.readOnly) {
                    this.readOnly = false;
                }
            });

            input.addEventListener('pointerdown', function () {
                if (document.activeElement !== this && !this.readOnly) {
                    this.readOnly = true;
                    setTimeout(() => {
                        this.readOnly = false;
                    }, 40);
                }
            });

            input.addEventListener('blur', function () {
                // Re-lock to readonly on blur so next click is clean
                if (!this.readOnly && this.type !== 'hidden') {
                    this.readOnly = true;
                }
            });
        }
    }

    // Apply to all current inputs
    document.querySelectorAll('input').forEach(guardInput);

    // Watch for dynamically added inputs
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) {
                    if (node.tagName === 'INPUT') {
                        guardInput(node);
                    } else if (node.querySelectorAll) {
                        node.querySelectorAll('input').forEach(guardInput);
                    }
                }
            });
        });
    });

    observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
    });
}

function initSkeletonState() {
    // 1. Check if top window already marked all pages as loaded
    try {
        if (window.top && window.top.__kd_all_pages_loaded) {
            document.body.classList.remove('app-loading-state');
            return;
        }
    } catch (e) {}

    // 2. Listen for broadcast from spa_shell
    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'SPA_ALL_PAGES_LOADED') {
            document.body.classList.remove('app-loading-state');
        }
    });

    // 3. If standalone (not embedded in an iframe)
    if (window.self === window.top) {
        window.addEventListener('load', () => {
            setTimeout(() => {
                document.body.classList.remove('app-loading-state');
            }, 300);
        });
    }
}

// ===== TABLE STICKY OFFSETS SYNC =====
function updateTableStickyOffsets() {
    requestAnimationFrame(() => {
        // Main table
        const mainTable = document.querySelector('.table-scroll table');
        if (mainTable) {
            const firstTh = mainTable.querySelector('thead th:first-child');
            if (firstTh) {
                const width = firstTh.getBoundingClientRect().width || firstTh.offsetWidth;
                if (width > 0) {
                    mainTable.style.setProperty('--col-1-width', `${width}px`);
                }
            }
        }
        // Output Barcode Table
        const outputTable = document.querySelector('#outputBarcodeTable');
        if (outputTable) {
            const firstTh = outputTable.querySelector('thead th:first-child');
            if (firstTh) {
                const width = firstTh.getBoundingClientRect().width || firstTh.offsetWidth;
                if (width > 0) {
                    outputTable.style.setProperty('--output-col-1-width', `${width}px`);
                }
            }
        }
    });
}
window.updateTableStickyOffsets = updateTableStickyOffsets;

function initTableStickySync() {
    window.addEventListener('resize', updateTableStickyOffsets);
    document.addEventListener('density:changed', updateTableStickyOffsets);

    if (typeof ResizeObserver !== 'undefined') {
        const resizeObs = new ResizeObserver(() => {
            updateTableStickyOffsets();
        });
        const mainScroll = document.querySelector('.table-scroll');
        if (mainScroll) resizeObs.observe(mainScroll);
        const outputScroll = document.querySelector('.output-table-scroll');
        if (outputScroll) resizeObs.observe(outputScroll);
    }
}

initSkeletonState();

document.addEventListener('DOMContentLoaded', function () {
    initSkeletonState();
    initAutofillSuppressor();
    Toast.init();
    checkAuth();
    initializeMainEventListeners();
    initClientSearch();
    initDetailsModal();
    initInputClearButtons();
    initAutoUppercase();
    initKeyboardShortcuts();
    initContextMenuKeyboard();
    initDropdownKeyboardNavigation();
    enhanceContextMenu();
    initTableStickySync();
    updateTableStickyOffsets();

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

let departments = [];

/**
 * Check if an API response indicates Token Expiration / Unauthorized
 */
function isUnauthorizedResponse(status, result) {
    if (status === 401 || status === 403 || status === 419) return true;
    if (!result) return false;
    if (result.code === 'UNAUTHORIZED' || result.error === 'Unauthorized') return true;
    if (result.error) {
        const msg = String(result.message || result.error || '').toLowerCase();
        if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('user not logged in') || msg.includes('token') || msg.includes('hết hạn') || msg.includes('expired')) {
            return true;
        }
    }
    return false;
}
window.isUnauthorizedResponse = isUnauthorizedResponse;
if (window.top) window.top.isUnauthorizedResponse = isUnauthorizedResponse;

/**
 * Show Full-Screen Lockout Modal when Token is Expired with Auto-Redirect
 */
function showAuthExpiredModal(message) {
    let topWin = window;
    try {
        topWin = window.top || window;
    } catch (e) {
        topWin = window;
    }

    if (topWin.__kd_auth_modal_shown) return;
    topWin.__kd_auth_modal_shown = true;

    try {
        sessionStorage.clear();
        localStorage.removeItem('kd_departments_cache');
    } catch (e) {}

    const topDoc = topWin.document;
    const existingModal = topDoc.getElementById('kdAuthExpiredModal');
    if (existingModal) existingModal.remove();

    let countdown = 3;

    const modalOverlay = topDoc.createElement('div');
    modalOverlay.id = 'kdAuthExpiredModal';
    modalOverlay.className = 'kd-auth-expired-overlay';
    modalOverlay.setAttribute('role', 'alertdialog');
    modalOverlay.setAttribute('aria-modal', 'true');
    modalOverlay.setAttribute('aria-labelledby', 'authModalTitle');
    modalOverlay.setAttribute('aria-describedby', 'authModalMsg');

    const displayMsg = message || 'Phiên làm việc của bạn đã hết hạn. Vui lòng đăng nhập lại để tiếp tục sử dụng.';

    modalOverlay.innerHTML = `
        <div class="kd-auth-expired-card">
            <div class="kd-auth-expired-icon-wrap">
                <span class="material-symbols-outlined kd-auth-expired-icon">lock_clock</span>
            </div>
            <div class="kd-auth-expired-title" id="authModalTitle">Phiên Đăng Nhập Hết Hạn</div>
            <div class="kd-auth-expired-message" id="authModalMsg">
                ${displayMsg}<br>
                <span style="display: inline-block; margin-top: 6px; font-size: 13px; color: var(--color-text-muted, #94a3b8);">
                    Tự động chuyển về trang Đăng nhập sau <b id="kdAuthCountdown" style="color: #f43f5e; font-size: 15px;">${countdown}</b>s...
                </span>
            </div>
            <div class="kd-auth-expired-actions">
                <button type="button" class="kd-auth-expired-btn" id="kdAuthLoginRedirectBtn">
                    <span class="material-symbols-outlined">login</span>
                    Đăng nhập lại ngay
                </button>
            </div>
        </div>
    `;

    topDoc.body.appendChild(modalOverlay);
    topDoc.body.style.overflow = 'hidden';

    // Disable pointer events on all iframes in shell
    const iframes = topDoc.querySelectorAll('iframe');
    iframes.forEach(f => {
        try {
            f.style.pointerEvents = 'none';
        } catch (e) {}
    });

    const redirectBtn = modalOverlay.querySelector('#kdAuthLoginRedirectBtn');
    const countdownEl = modalOverlay.querySelector('#kdAuthCountdown');

    const doRedirect = () => {
        topWin.location.href = '/login';
    };

    if (redirectBtn) {
        setTimeout(() => redirectBtn.focus(), 50);
        redirectBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            doRedirect();
        });
    }

    const timer = setInterval(() => {
        countdown--;
        if (countdownEl) countdownEl.textContent = countdown;
        if (countdown <= 0) {
            clearInterval(timer);
            doRedirect();
        }
    }, 1000);

    // Lock down keyboard and click interactions completely
    const keyBlocker = (e) => {
        if (e.target === redirectBtn && (e.key === 'Enter' || e.key === ' ')) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        redirectBtn?.focus();
        return false;
    };

    topWin.addEventListener('keydown', keyBlocker, true);
    topWin.addEventListener('keyup', keyBlocker, true);
    topWin.addEventListener('keypress', keyBlocker, true);

    modalOverlay.addEventListener('click', (e) => {
        if (e.target !== redirectBtn && !redirectBtn.contains(e.target)) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            redirectBtn?.focus();
        }
    }, true);

    modalOverlay.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
    }, true);
}
window.showAuthExpiredModal = showAuthExpiredModal;
if (window.top) window.top.showAuthExpiredModal = showAuthExpiredModal;

/**
 * Shared Global Department Cache & Single-Flight Request Deduplicator
 */
async function getDepartments(forceRefresh = false) {
    let topWin = window;
    try {
        topWin = window.top || window;
    } catch (e) {
        topWin = window;
    }

    if (topWin.__kd_auth_modal_shown) {
        return [];
    }

    if (!forceRefresh) {
        // 1. Check in-memory in top window or current window
        if (topWin.__kd_departments && Array.isArray(topWin.__kd_departments) && topWin.__kd_departments.length > 0) {
            departments = topWin.__kd_departments;
            window.departments = topWin.__kd_departments;
            return topWin.__kd_departments;
        }

        // 2. Check sessionStorage
        try {
            const cached = sessionStorage.getItem('kd_departments_cache');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    topWin.__kd_departments = parsed;
                    departments = parsed;
                    window.departments = parsed;
                    return parsed;
                }
            }
        } catch (e) {}

        // 3. Deduplicate concurrent in-flight requests across iframes
        if (topWin.__kd_departments_promise) {
            const depts = await topWin.__kd_departments_promise;
            departments = depts || [];
            window.departments = departments;
            return departments;
        }
    }

    topWin.__kd_departments_promise = (async () => {
        try {
            const response = await fetch('/api/departments');
            let result = null;
            try {
                result = await response.json();
            } catch (e) {
                result = { error: true, message: `HTTP ${response.status}` };
            }

            // Check if Token Expired / Unauthorized (401 or 500 with 401 in message)
            if (isUnauthorizedResponse(response.status, result)) {
                topWin.__kd_departments = [];
                sessionStorage.removeItem('kd_departments_cache');
                showAuthExpiredModal(result?.message);
                return [];
            }

            if (result && result.error) {
                console.error('Error from /api/departments:', result.message);
                return [];
            }

            const items = (result && result.data) || [];
            const depts = items.map(item => {
                const idVal = item.departmentID || item.id || '';
                return {
                    id: idVal,
                    departmentID: idVal
                };
            });

            if (depts.length > 0) {
                topWin.__kd_departments = depts;
                departments = depts;
                window.departments = depts;
                try {
                    sessionStorage.setItem('kd_departments_cache', JSON.stringify(depts));
                } catch (e) {}
            }

            return depts;
        } catch (error) {
            console.error('Error loading departments:', error);
            const errStr = String(error.message || error);
            if (errStr.includes('401') || errStr.toLowerCase().includes('unauthorized')) {
                showAuthExpiredModal(errStr);
            }
            return [];
        } finally {
            topWin.__kd_departments_promise = null;
        }
    })();

    const result = await topWin.__kd_departments_promise;
    departments = result || [];
    window.departments = departments;
    return departments;
}

window.getDepartments = getDepartments;

async function checkAuth() {
    await getDepartments();
}

function initializeMainEventListeners() {
    // ===== MAIN PAGE INPUTS =====
    const barcodeInput = document.getElementById('barcode');
    const productInput = document.getElementById('product_id');
    const feedRecordInput = document.getElementById('feed_record_id');

    if (barcodeInput) {
        barcodeInput.addEventListener(
            'input',
            debounceSearch(searchBarcode, 500)
        );

        barcodeInput.addEventListener('input', e => {
            e.target.value = e.target.value.toUpperCase();
            if (productInput) clearInputBox(productInput);
            if (feedRecordInput) clearInputBox(feedRecordInput);
            if (e.target.value.trim()) {
                showTableSkeleton(10, 5);
            } else {
                clearTable();
            }
        });

    }

    if (productInput) {
        productInput.addEventListener(
            'input',
            debounceSearch(searchRecipes, 500)
        );

        productInput.addEventListener('input', e => {
            e.target.value = e.target.value.toUpperCase();
            if (barcodeInput) clearInputBox(barcodeInput);
            if (feedRecordInput) clearInputBox(feedRecordInput);
            if (e.target.value.trim()) {
                showTableSkeleton(7, 5);
            } else {
                clearTable();
            }
        });
    }

    if (feedRecordInput) {
        feedRecordInput.addEventListener(
            'input',
            debounceSearch(searchByFeedRecord, 500)
        );

        feedRecordInput.addEventListener('input', e => {
            e.target.value = e.target.value.toUpperCase();
            if (barcodeInput) clearInputBox(barcodeInput);
            if (productInput) clearInputBox(productInput);
            if (e.target.value.trim()) {
                showTableSkeleton(10, 5);
            } else {
                clearTable();
            }
        });
    }

    // ===== SIDEBAR EVENTS =====
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

    showTableSkeleton(10, 5);

    try {
        const response = await fetch('/api/barcodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword })
        });

        let data = null;
        try {
            data = await response.json();
        } catch (e) {}

        if (isUnauthorizedResponse(response.status, data)) {
            showAuthExpiredModal(data ? data.message : null);
            clearTable();
            return;
        }

        if (data && Array.isArray(data.result)) {
            setTableData(data.result, data.columns, 'barcode', `Không tìm thấy tem barcode nào với từ khóa "${keyword}"`);
        } else {
            setTableData([], data ? data.columns : [], 'barcode', `Không tìm thấy tem barcode nào với từ khóa "${keyword}"`);
        }
    } catch (error) {
        console.error('Error searching barcode:', error);
        Toast.error('Lỗi', 'Lỗi kết nối khi tìm kiếm Barcode');
        clearTable();
    }
}

async function searchRecipes() {
    closeShowBarcodeWindow();
    const keyword = document.getElementById('product_id').value.trim();
    if (!keyword) {
        clearTable();
        return;
    }

    showTableSkeleton(7, 5);

    try {
        const response = await fetch('/api/recipes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword })
        });

        let data = null;
        try {
            data = await response.json();
        } catch (e) {}

        if (isUnauthorizedResponse(response.status, data)) {
            showAuthExpiredModal(data ? data.message : null);
            clearTable();
            return;
        }

        if (data && Array.isArray(data.result)) {
            setTableData(data.result, data.columns, 'recipe', `Không tìm thấy quy cách nào với từ khóa "${keyword}"`);
        } else {
            setTableData([], data ? data.columns : [], 'recipe', `Không tìm thấy quy cách nào với từ khóa "${keyword}"`);
        }
    } catch (error) {
        console.error('Error searching work order:', error);
        Toast.error('Lỗi', 'Lỗi kết nối khi tìm kiếm Quy cách');
        clearTable();
    }
}

async function searchByFeedRecord() {
    closeShowBarcodeWindow();
    const keyword = document.getElementById('feed_record_id').value.trim();
    if (!keyword) {
        clearTable();
        return;
    }

    showTableSkeleton(10, 5);

    try {
        const response = await fetch('/api/feed_records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword })
        });

        let data = null;
        try {
            data = await response.json();
        } catch (e) {}

        if (isUnauthorizedResponse(response.status, data)) {
            showAuthExpiredModal(data ? data.message : null);
            clearTable();
            return;
        }

        if (data && Array.isArray(data.result)) {
            setTableData(data.result, data.columns, 'barcode', `Không tìm thấy liệu nạp nào với từ khóa "${keyword}"`);
        } else {
            setTableData([], data ? data.columns : [], 'barcode', `Không tìm thấy liệu nạp nào với từ khóa "${keyword}"`);
        }
    } catch (error) {
        console.error('Error searching by feed record:', error);
        Toast.error('Lỗi', 'Lỗi kết nối khi tìm kiếm Liệu nạp');
        clearTable();
    }
}

function displayTable(result, columns) {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    const rowCount = document.getElementById('rowCount');

    // Clear existing content
    thead.innerHTML = '';
    tbody.innerHTML = '';

    // Khi không có dữ liệu: Không hiển thị header và footer, chỉ hiển thị empty state
    if (!result || result.length === 0) {
        if (rowCount) rowCount.textContent = '0';
        const emptyTr = document.createElement('tr');
        const emptyTd = document.createElement('td');
        emptyTd.colSpan = (columns && columns.length > 0) ? columns.length : 1;
        emptyTd.style.textAlign = 'center';
        emptyTd.style.padding = '56px 20px';
        emptyTd.innerHTML = `
            <div class="table-empty-state">
                <div class="empty-state-icon-wrapper">
                    <span class="material-symbols-outlined empty-state-icon">search_off</span>
                </div>
                <div class="empty-state-title">Không có dữ liệu hiển thị</div>
                <div class="empty-state-desc">Không tìm thấy bản ghi nào khớp với điều kiện tra cứu hoặc dữ liệu dưới hệ thống rỗng.</div>
            </div>
        `;
        emptyTr.appendChild(emptyTd);
        tbody.appendChild(emptyTr);
        updateVisibleRowCount();
        updateTableStickyOffsets();
        return;
    }

    // Table header (chỉ render khi có dữ liệu)
    if (columns && columns.length > 0) {
        const headerRow = document.createElement('tr');
        columns.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
    }

    // Table body
    const truncateThreshold = 50; // chỉ truncate nếu dài hơn ngưỡng này
    const displayLength = 45; // số ký tự hiển thị

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
    updateVisibleRowCount();
    updateTableStickyOffsets();
}

function clearTable() {
    document.getElementById('tableHead').innerHTML = '';
    document.getElementById('tableBody').innerHTML = '';
    document.getElementById('rowCount').textContent = '0';

    selectedRow = null;
    selectedRowData = null;

    updateClientSearchState(false);
    updateVisibleRowCount();
    updateTableStickyOffsets();
}

function handleRowClick(e) {
    const row = e.target.closest('tr');
    if (!row || row.querySelector('.table-empty-state') || row.classList.contains('skeleton-row')) return;

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
    if (!row || row.querySelector('.table-empty-state') || row.classList.contains('skeleton-row')) return;

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
    if (!row || row.querySelector('.table-empty-state') || row.classList.contains('skeleton-row')) return;

    handleRowClick(e);
    showDetails();
}

function handleOutputRowDoubleClick(e) {
    const row = e.target.closest('tr');
    if (!row || row.querySelector('.table-empty-state') || row.classList.contains('skeleton-row')) return;

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
    if (!row || row.querySelector('.table-empty-state') || row.classList.contains('skeleton-row')) return;

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
            'checkBarcodeExtendDateTime',
            'fetchOriginalInfo',
            'getPrdeba',
            'getPrdebb',
            'getPrdebc'
        ],
        'recipe': [
            'searchWorkOrderByRecipe',
            'searchCommitGitlabByRecipe',
            'fetchYamlDetails'
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
        'workOrderOutputByRecipe': ['outputByRecipe'],
        'commitDetailByRecipe': ['commitDetailByRecipe']
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
    const isOutputTable = ['outputByBarcode', 'outputByRecipe', 'commitDetailByRecipe'].includes(action);
    const rowData = isOutputTable ? selectedOutputRowData : selectedRowData;
    
    if (!rowData) return;

    switch (action) {
        // currentTableType === 'barcode'
        case 'inputBarcode':
            openOutputTable('inputBarcode', rowData);
            break;
        case 'feedRecords':
            showFeedRecords(rowData);
            break;
        case 'checkScanBarcodeHistory':
            fetchScanBarcodeHistoryByBarcode(rowData);
            break;
        case 'checkBarcodeWorkOrder':
            openOutputTable('workOrderByBarcode', rowData);
            break;
        case 'checkBarcodeTransfer':
            checkBarcodeTransfer(rowData);
            break;
        case 'checkBarcodeExtendDateTime':
            checkBarcodeExtendDateTime(rowData);
            break;
        case 'fetchOriginalInfo':
            openOutputTable('fetchOriginalInfoByBarcode', rowData);
            break;
        case 'getPrdeba':
            fetchPrde('prdeba', rowData);
            break;
        case 'getPrdebb':
            fetchPrde('prdebb', rowData);
            break;
        case 'getPrdebc':
            fetchPrde('prdebc', rowData);
            break;

        // currentTableType === 'outputBarcode'
        case 'outputBarcodeByFeedRecords':
            openOutputTable('outputBarcodeByFeedRecords', rowData);
            break;

        // currentTableType === 'recipe'      
        case 'searchWorkOrderByRecipe':
            openOutputTable('workOrderByRecipe', rowData);
            break;
        case 'searchCommitGitlabByRecipe':
            openOutputTable('commitGitlabByRecipe', rowData);
            break;
        case 'fetchYamlDetails':
            fetchYamlContent(rowData);
            break;
            
        // currentOutputTableType 
        case 'outputByBarcode':
            fetchOutputBarcodeByWorkOrder('outputByBarcode', rowData);
            break;
        case 'outputByRecipe':
            fetchOutputBarcodeByWorkOrder('outputByRecipe', rowData);
            break;
        case 'commitDetailByRecipe':
            fetchCommitGitlabDetail('commitDetailByRecipe', rowData);
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

async function showFeedRecords(rowData = null) {
    const dataObj = rowData || selectedRowData;
    const material_oid = dataObj ? dataObj['id'] : null;
    if (!material_oid) {
        Toast.warning('Cảnh báo', 'Thiếu OID');
        return;
    }

    const material_type = dataObj['product_type'];
    if (!material_type) {
        Toast.warning('Cảnh báo', 'Thiếu product_type');
        return;
    }

    if (material_type === "TIRE") {
        Toast.warning('Thông báo', 'Không quản lý quét tem từ Ép Vỏ qua QC');
        return;
    }

    feed_records_material_id = material_oid;

    try {
        const data = await apiFetch('/api/barcodes/check-used-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ material_oid, material_type })
        });

        if (!data || !data.result || data.result.length === 0) {
            Toast.warning('Không có dữ liệu', 'Barcode chưa quét tem lần nào');
            clearOutputBarcodeTable();
            return;
        }

        if (data.success) {
            setTableData(data.result, data.columns, 'outputBarcodeByFeedRecords');
        } else {
            Toast.error('Lỗi', data.message || 'Lỗi khi kiểm tra lịch sử sử dụng tem');
        }
    } catch (err) {
        Toast.error('Lỗi', err.message || 'Lỗi kết nối');
    }
}

async function fetchWorkOrderByBarcode(id = null, info = null) {
    const resource_id = id || (selectedRowData ? selectedRowData['id'] : null);
    if (!resource_id) {
        Toast.warning('Cảnh báo', 'Chưa chọn hàng dữ liệu.');
        return;
    }

    const payload = { resource_id };

    let info_obj = info || (selectedRowData ? selectedRowData['info'] : null);
    if (typeof info_obj === 'string') {
        try {
            info_obj = JSON.parse(info_obj);
        } catch {
            info_obj = null;
        }
    }

    const prod_info = info_obj ? info_obj.production_info : null;
    if (!prod_info) {
        renderOutputBarcodeTable([], []);
        Toast.warning('Không có dữ liệu', 'Barcode không có thông tin sản xuất (production_info)');
        return null;
    }

    const station = prod_info.station;
    const production_time = prod_info.production_time;
    if (!station || !production_time) {
        renderOutputBarcodeTable([], []);
        Toast.warning('Không có dữ liệu', 'Thiếu thông tin trạm hoặc ngày sản xuất trong Barcode');
        return;
    }

    const vietNameDate = convertISOToVietNamDate(production_time);

    payload.station = station;
    payload.fromDate = vietNameDate;
    payload.toDate = vietNameDate;

    try {
        const data = await apiFetch('/api/barcodes/fetch-work-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (data.success) {
            if (data.result && data.result.length > 0) {
                outputBarcodeRawData = mapWorkOrderStatus(data.result, data.columns);
                outputBarcodeColumns = data.columns;

                currentOutputTableType = 'workOrderOutputByBarcode';
                renderOutputBarcodeTable(outputBarcodeRawData, outputBarcodeColumns);
                Toast.success('Thành công', `Tải thành công ${data.result.length} đơn điều động`);
            } else {
                renderOutputBarcodeTable([], data.columns || []);
                Toast.warning('Không có dữ liệu', `Barcode không được in ra từ bất kỳ đơn điều động nào`);
            }
        } else {
            Toast.error('Lỗi', data.message || 'Lỗi khi tải đơn điều động');
        }
    } catch (err) {
        Toast.error('Lỗi', err.message || 'Lỗi kết nối khi tải đơn điều động');
    }
}

async function fetchInputBarcode(id = null, product_type = null) {
    const targetId = id || (selectedRowData ? selectedRowData['id'] : null);
    const targetProductType = product_type || (selectedRowData ? selectedRowData['product_type'] : null);

    if (!targetId) {
        Toast.warning('Cảnh báo', 'Chưa chọn hàng dữ liệu.');
        return;
    }

    try {
        const data = await apiFetch('/api/barcodes/fetch-input-barcodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: targetId, product_type: targetProductType })
        });

        if (data.success) {
            if (data.result && data.result.length > 0) {
                outputBarcodeRawData = data.result;
                outputBarcodeColumns = data.columns;

                currentOutputTableType = null;
                renderOutputBarcodeTable(outputBarcodeRawData, outputBarcodeColumns);
                Toast.success('Thành công', `Tải thành công ${data.result.length} tem đầu vào`);
            } else {
                renderOutputBarcodeTable([], data.columns || []);
                Toast.warning('Không có dữ liệu', `Không tìm thấy tem đầu vào nào`);
            }
        } else {
            Toast.error('Lỗi', data.message || 'Lỗi khi tải tem đầu vào');
        }

    } catch (err) {
        Toast.error('Lỗi', err.message || 'Lỗi khi tải tem đầu vào');
    }
}

// ── STREAMING TASK PROGRESS CONTROLLER ──────────────────────────────────────
let currentBarcodeEventSource = null;

function fetchOutputBarcode(workOrder = null) {
    const resource_id = feed_records_material_id || (selectedRowData ? selectedRowData['id'] : null);
    if (!resource_id) {
        Toast.warning('Cảnh báo', 'Thiếu Resource ID');
        return;
    }

    const work_order = workOrder || (selectedRowData ? selectedRowData['work_order'] : null);
    if (!work_order) {
        Toast.warning('Cảnh báo', 'Thiếu Work Order / MES ID');
        return;
    }

    totalOutputBarcode = (selectedRowData && selectedRowData['total_barcode']) ? selectedRowData['total_barcode'] : 0;

    showLoading();

    if (currentBarcodeEventSource) {
        currentBarcodeEventSource.close();
        currentBarcodeEventSource = null;
    }

    const streamUrl = `/api/barcodes/fetch-output-barcodes/stream?resource_id=${encodeURIComponent(resource_id)}&work_order=${encodeURIComponent(work_order)}`;
    currentBarcodeEventSource = new EventSource(streamUrl);

    currentBarcodeEventSource.onmessage = function (event) {
        try {
            const data = JSON.parse(event.data);

            if (data.status === 'processing') {
                return;
            }

            // Stream completed or failed
            if (currentBarcodeEventSource) {
                currentBarcodeEventSource.close();
                currentBarcodeEventSource = null;
            }
            hideLoading();

            if (data.status === 'completed') {
                if (data.result && data.result.length > 0) {
                    outputBarcodeRawData = data.result;
                    outputBarcodeColumns = data.columns;
                    renderOutputBarcodeTable(outputBarcodeRawData, outputBarcodeColumns);
                    Toast.success('Thành công', `Tìm thấy ${data.result.length} tem đầu ra`);
                } else {
                    renderOutputBarcodeTable([], data.columns || []);
                    Toast.warning('Không có dữ liệu', data.message || 'Không tìm thấy tem đầu ra nào');
                }
            } else if (data.status === 'failed') {
                Toast.error('Lỗi', data.message || 'Lỗi khi tìm kiếm tem đầu ra');
            }
        } catch (err) {
            console.error('Lỗi phân tích dữ liệu SSE:', err);
            hideLoading();
        }
    };

    currentBarcodeEventSource.onerror = function (err) {
        console.warn('SSE stream error or connection closed:', err);
        if (currentBarcodeEventSource) {
            currentBarcodeEventSource.close();
            currentBarcodeEventSource = null;
        }
        hideLoading();
        Toast.error('Lỗi', 'Lỗi kết nối khi truyền dữ liệu tem đầu ra');
    };
}

async function checkBarcodeTransfer(rowData = null) {
    const dataObj = rowData || selectedRowData;
    const resource_id = dataObj ? dataObj['id'] : null;
    if (!resource_id) {
        Toast.warning('Cảnh báo', 'Thiếu Resource ID');
        return;
    }

    fetch('/api/barcodes/check-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_id })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                Toast.success('Thành công', data.message || 'Kiểm tra vận chuyển tem thành công');
            } else {
                Toast.warning('Không có dữ liệu', data.message || 'Không tìm thấy dữ liệu vận chuyển');
            }
        })
        .catch(() => {
            Toast.error('Lỗi', 'Lỗi khi kiểm tra vận chuyển tem');
        });
}

async function checkBarcodeExtendDateTime(rowData = null) {
    const dataObj = rowData || selectedRowData;
    const resource_id = dataObj ? dataObj['id'] : null;
    if (!resource_id) {
        Toast.warning('Cảnh báo', 'Thiếu Resource ID');
        return;
    }

    fetch('/api/barcodes/check-extend-date-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_id })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                Toast.info('Thông báo', data.message || 'Kiểm tra gia hạn thành công');
            } else {
                Toast.warning('Không có dữ liệu', data.message || 'Không tìm thấy dữ liệu gia hạn');
            }
        })
        .catch(() => {
            Toast.error('Lỗi', 'Lỗi khi kiểm tra số lần gia hạn của tem');
        });
}

async function fetchOriginalInfoByBarcode(id = null, product_type = null) {
    const resource_id = id || (selectedRowData ? selectedRowData['id'] : null);
    if (!resource_id) {
        Toast.warning('Cảnh báo', 'Chưa chọn hàng dữ liệu.');
        return;
    }

    const prod_type = product_type || (selectedRowData ? selectedRowData['product_type'] : null);

    try {
        const data = await apiFetch('/api/barcodes/fetch-original-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resource_id, product_type: prod_type })
        });

        if (data.success && data.result && data.result.length > 0) {
            outputBarcodeRawData = data.result;
            outputBarcodeColumns = data.columns;
            currentOutputTableType = null;
            renderOutputBarcodeTable(outputBarcodeRawData, outputBarcodeColumns);
            Toast.success('Thành công', `Tải thành công ${data.result.length} dòng thông tin gốc.`);
        } else {
            renderOutputBarcodeTable([], data.columns || []);
            Toast.warning('Không có dữ liệu', (data && data.message) ? data.message : 'Không tìm thấy thông tin gốc');
        }

    } catch (err) {
        Toast.error('Lỗi', err.message || 'Lỗi khi tải thông tin gốc');
    }
}

async function fetchPrde(type, rowData = null) {
    const dataObj = rowData || selectedRowData;
    const resource_id = dataObj ? dataObj['id'] : null;
    if (!resource_id) {
        Toast.warning('Cảnh báo', 'Chưa chọn hàng dữ liệu.');
        return;
    }

    const urlMap = {
        'prdeba': '/api/barcodes/get-prdeba',
        'prdebb': '/api/barcodes/get-prdebb',
        'prdebc': '/api/barcodes/get-prdebc'
    };

    const headerMap = {
        'prdeba': 'PRDEBA',
        'prdebb': 'PRDEBB',
        'prdebc': 'PRDEBC'
    };

    const outputHeaderContentEl = document.getElementById('outputHeaderContent');
    if (outputHeaderContentEl) {
        outputHeaderContentEl.textContent = headerMap[type] || type.toUpperCase();
    }

    const container = document.getElementById('outputContainer');
    if (container) container.style.display = 'flex';

    enterSingleRowMode();
    clearOutputBarcodeTable();
    activeSearchContext = type;

    try {
        const data = await apiFetch(urlMap[type], {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resource_id })
        });

        if (!data || !data.success) {
            Toast.error('Lỗi', (data && data.message) ? data.message : `Không tải được dữ liệu ${type.toUpperCase()}`);
            return;
        }

        if (!data.result || data.result.length === 0) {
            renderOutputBarcodeTable([], data.columns || []);
            Toast.warning('Không có dữ liệu', `Không có dữ liệu ${type.toUpperCase()} cho barcode này`);
            return;
        }

        outputBarcodeRawData = data.result;
        outputBarcodeColumns = data.columns;
        currentOutputTableType = null;
        renderOutputBarcodeTable(outputBarcodeRawData, outputBarcodeColumns);
        Toast.success('Thành công', `Tải thành công ${data.result.length} dòng dữ liệu ${type.toUpperCase()}`);
    } catch (err) {
        Toast.error('Lỗi', err.message || `Lỗi khi tải dữ liệu ${type.toUpperCase()}`);
    }
}

async function fetchOutputBarcodeByWorkOrder(type, rowData = null) {
    const dataObj = rowData || selectedOutputRowData || selectedRowData;
    const work_order_id = dataObj ? dataObj['work_order'] : null;
    if (!work_order_id) {
        Toast.warning('Cảnh báo', 'Chưa chọn hàng dữ liệu.');
        return;
    }

    const work_order_status = dataObj ? dataObj['status'] : null;
    if (!work_order_status) {
        Toast.warning('Cảnh báo', 'Chưa chọn hàng dữ liệu.');
        return;
    }

    activeSearchContext = type;
    const outputHeaderContentEl = document.getElementById('outputHeaderContent');

    if (outputHeaderContentEl) {
        if (type && type === 'outputByBarcode') {
            outputHeaderContentEl.textContent = 'Tem đầu ra theo Barcode';
        } else if (type && type === 'outputByRecipe') { 
            outputHeaderContentEl.textContent = 'Tem đầu ra theo quy cách';
        }
    }

    try {
        const data = await apiFetch('/api/workorders/fetch-output-barcodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ work_order_id, work_order_status })
        });

        if (data.success) {
            if (data.result && data.result.length > 0) {
                outputBarcodeRawData = data.result;
                outputBarcodeColumns = data.columns;

                currentOutputTableType = null;
                renderOutputBarcodeTable(outputBarcodeRawData, outputBarcodeColumns);
                Toast.success('Thành công', `Tải thành công ${data.result.length} tem đầu ra`);
            } else {
                renderOutputBarcodeTable([], data.columns || []);
                Toast.warning('Không có dữ liệu', data.message || 'Không tìm thấy tem đầu ra nào');
            }
        } else {
            Toast.error('Lỗi', data.message || 'Lỗi khi tải tem đầu ra');
        }
    } catch (err) {
        Toast.error('Lỗi', err.message || 'Lỗi kết nối khi tải tem đầu ra');
    }
}

async function fetchCommitGitlabDetail(type, rowData = null) {
    const dataObj = rowData || selectedOutputRowData || selectedRowData;
    const commit_id = dataObj ? dataObj['id'] : null;
    if (!commit_id) {
        Toast.warning('Cảnh báo', 'Chưa chọn hàng dữ liệu.');
        return;
    }

    try {
        const data = await apiFetch('/api/recipes/commit-gitlab/details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commit_id })
        });

        if (data.success) {
            if (data.result && data.result.length > 0) {
                outputBarcodeRawData = data.result;
                outputBarcodeColumns = data.columns;

                currentOutputTableType = null;
                renderOutputBarcodeTable(outputBarcodeRawData, outputBarcodeColumns);
                Toast.success('Thành công', `Tải thành công ${data.result.length} chi tiết commit`);
            } else {
                renderOutputBarcodeTable([], data.columns || []);
                Toast.warning('Không có dữ liệu', data.message || 'Không tìm thấy chi tiết commit nào');
            }
        } else {
            Toast.error('Lỗi', data.message || 'Lỗi khi tải chi tiết commit');
        }
    } catch (err) {
        Toast.error('Lỗi', err.message || 'Lỗi kết nối khi tải chi tiết commit');
    }
}

function initDetailsModal() {
    const modal = document.getElementById('detailsModal');
    if (!modal) return;

    const closeBtn = modal.querySelector('.details-modal-close');
    const copyBtn = document.getElementById('copyDetailsBtn');
    const content = modal.querySelector('.details-modal-content');

    // click nút X
    closeBtn?.addEventListener('click', closeDetailsModal);

    // click nút Copy
    copyBtn?.addEventListener('click', (event) => {
        event.stopPropagation();
        event.preventDefault();
        copyDetailsData(event);
    });

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
        } else if (e.ctrlKey && e.key === 'c') {
                // Chỉ copy nếu không có text được select
                const selection = window.getSelection().toString();
                if (!selection) {
                    e.preventDefault();
                    copyDetailsData();
                }
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

    if (data.hasOwnProperty('diff') && data['diff']) {
        body.innerHTML = renderDiffViewer(data);
        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        return;
    }

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

    const jsonString = JSON.stringify(processedData, null, 2);
    body.innerHTML = formatJSON(jsonString);

    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

function renderDiffViewer(data) {
    const diffText = data['diff'] || '';
    const newPath = data['new_path'] || '';
    const oldPath = data['old_path'] || '';
    const isNewFile = data['new_file'] === 'true' || data['new_file'] === true;
    const isRenamed = data['renamed_file'] === 'true' || data['renamed_file'] === true;
    const isDeleted = data['deleted_file'] === 'true' || data['deleted_file'] === true;

    let fileInfoHtml = `
        <div class="diff-file-info">
            <span class="diff-file-path">${newPath}</span>
            ${isNewFile ? '<span class="diff-badge diff-badge-new">New File</span>' : ''}
            ${isRenamed ? `<span class="diff-badge diff-badge-renamed">Renamed from: ${oldPath}</span>` : ''}
            ${isDeleted ? '<span class="diff-badge diff-badge-deleted">Deleted</span>' : ''}
        </div>
    `;

    const lines = diffText.split('\n');
    let diffHtml = '<div class="diff-viewer">';

    lines.forEach(line => {
        if (line.startsWith('@@')) {
            diffHtml += `<div class="diff-line diff-hunk">${escapeHtml(line)}</div>`;
        } else if (line.startsWith('+')) {
            diffHtml += `<div class="diff-line diff-added"><span class="diff-sign">+</span>${escapeHtml(line.substring(1))}</div>`;
        } else if (line.startsWith('-')) {
            diffHtml += `<div class="diff-line diff-removed"><span class="diff-sign">-</span>${escapeHtml(line.substring(1))}</div>`;
        } else {
            diffHtml += `<div class="diff-line diff-unchanged"><span class="diff-sign"> </span>${escapeHtml(line)}</div>`;
        }
    });

    diffHtml += '</div>';

    return fileInfoHtml + diffHtml;
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Copy dữ liệu từ Details Modal
 */
async function copyDetailsData() {
    const copyBtn = document.getElementById('copyDetailsBtn');
    const modalBody = document.querySelector('.details-modal-body');
    
    if (!modalBody) return;

    try {
        // Lấy text content (đã được format JSON)
        const textToCopy = modalBody.textContent;
        
        // Copy vào clipboard
        await navigator.clipboard.writeText(textToCopy);
        
        // Visual feedback
        if (copyBtn) {
            const originalHTML = copyBtn.innerHTML;
            copyBtn.classList.add('copied');
            copyBtn.innerHTML = '<span class="material-symbols-outlined">check</span> <span>Đã copy!</span>';
            if (typeof Toast !== 'undefined' && Toast.success) {
                Toast.success('Thành công', 'Đã sao chép dữ liệu vào bộ nhớ tạm');
            }
            
            // Reset button sau 2 giây
            setTimeout(() => {
                copyBtn.classList.remove('copied');
                copyBtn.innerHTML = originalHTML;
            }, 2000);
        }
        
    } catch (err) {
        console.error('Copy failed:', err);
        
        // Fallback: tạo textarea tạm để copy
        const textarea = document.createElement('textarea');
        textarea.value = modalBody.textContent;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
            document.execCommand('copy');
            
            if (copyBtn) {
                const originalHTML = copyBtn.innerHTML;
                copyBtn.classList.add('copied');
                copyBtn.innerHTML = '<span class="material-symbols-outlined">check</span> <span>Đã copy!</span>';
                
                setTimeout(() => {
                    copyBtn.classList.remove('copied');
                    copyBtn.innerHTML = originalHTML;
                }, 2000);
            }
            
        } catch (fallbackErr) {
            showAlert('Không thể copy dữ liệu. Vui lòng thử lại.', 'error');
        } finally {
            document.body.removeChild(textarea);
        }
    }
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
            (window.top || window).location.href = '/login';
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

async function fetchWorkOrderByRecipe(recipeId = null) {
    const recipe_id = recipeId || (selectedRowData ? selectedRowData['recipe_id'] : null);
    if (!recipe_id) {
        Toast.warning('Cảnh báo', 'Chưa chọn hàng dữ liệu.');
        return;
    }

    try {
        const data = await apiFetch('/api/recipes/fetch-work-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipe_id })
        });

        if (data.success) {
            if (data.result && data.result.length > 0) {
                outputBarcodeRawData = mapWorkOrderStatus(data.result, data.columns);
                outputBarcodeColumns = data.columns;

                currentOutputTableType = 'workOrderOutputByRecipe';
                renderOutputBarcodeTable(outputBarcodeRawData, outputBarcodeColumns);
                Toast.success('Thành công', `Tải thành công ${data.result.length} đơn điều động`);
            } else {
                renderOutputBarcodeTable([], data.columns || []);
                Toast.warning('Không có dữ liệu', data.message || 'Không tìm thấy đơn điều động');
            }
        } else {
            Toast.error('Lỗi', data.message || 'Lỗi khi tải đơn điều động');
        }
    } catch (err) {
        Toast.error('Lỗi', err.message || 'Lỗi kết nối khi tải đơn điều động');
    }
}

async function fetchCommitGitlabByRecipe(recipeId = null, productType = null) {
    const recipe_id = recipeId || (selectedRowData ? selectedRowData['recipe_id'] : null);
    const product_type = productType || (selectedRowData ? selectedRowData['product_type'] : null);
    if (!recipe_id || !product_type) {
        Toast.warning('Cảnh báo', 'Chưa chọn hàng dữ liệu hoặc thiếu thông tin quy cách.');
        return;
    }

    try {
        const data = await apiFetch('/api/recipes/fetch-commit-gitlab', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipe_id, product_type })
        });

        if (data.success) {
            if (data.result && data.result.length > 0) {
                outputBarcodeRawData = mapWorkOrderStatus(data.result, data.columns);
                outputBarcodeColumns = data.columns;

                currentOutputTableType = 'commitDetailByRecipe';
                renderOutputBarcodeTable(outputBarcodeRawData, outputBarcodeColumns);
                Toast.success('Thành công', `Tải thành công ${data.result.length} commit từ Gitlab`);
            } else {
                renderOutputBarcodeTable([], data.columns || []);
                Toast.warning('Không có dữ liệu', data.message || 'Không tìm thấy Commit ở Gitlab nào!');
            }
        } else {
            Toast.error('Lỗi', data.message || 'Lỗi khi tải Gitlab commit');
        }
    } catch (err) {
        Toast.error('Lỗi', err.message || 'Lỗi kết nối khi tải Gitlab commit');
    }
}

async function fetchYamlContent(rowData = null) {
    const dataObj = rowData || selectedRowData;
    const recipe_id = dataObj ? dataObj['recipe_id'] : null;
    const product_type = dataObj ? dataObj['product_type'] : null;

    if (!recipe_id || !product_type) {
        Toast.warning('Cảnh báo', 'Thiếu thông tin recipe_id hoặc product_type');
        return;
    }

    try {
        const data = await apiFetch('/api/recipes/fetch-yaml-content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipe_id, product_type })
        });

        if (!data || !data.success) {
            Toast.error('Lỗi', (data && data.message) ? data.message : 'Không tải được nội dung yaml');
            return;
        }

        Toast.success('Thành công', 'Đã tải nội dung YAML');
        const modal = document.getElementById('detailsModal');
        const body = modal.querySelector('.details-modal-body');
        const titleEl = modal.querySelector('.details-modal-title');

        if (titleEl) titleEl.textContent = `YAML: ${data.file_name || data.file_path}`;

        const errors = detectYamlErrors(data.content);
        body.innerHTML = renderYamlWithErrors(data.content, data.file_path, errors);
        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
    } catch (err) {
        Toast.error('Lỗi', err.message || 'Lỗi kết nối khi tải nội dung YAML');
    }
}

/**
 * Phát hiện lỗi trong nội dung YAML dựa theo các pattern lỗi thực tế từ pipeline
 * @param {string} content - Nội dung YAML raw
 * @returns {Array} - Mảng { lineIndex, type, message }
 */
function detectYamlErrors(content) {
    const lines = content.split('\n');
    const errors = [];

    // Danh sách tool type hợp lệ (từ pipeline error)
    const VALID_TOOL_TYPES = new Set([
        'MOLD', 'BLADDER', 'RING', 'BLOCK',
        'PREFORMER', 'PREFORMER-1', 'PREFORMER-2', 'PREFORMER-3', 'PREFORMER-4',
        'COLOR_LINE_LEFT_1', 'COLOR_LINE_LEFT_2', 'COLOR_LINE_LEFT_3',
        'COLOR_LINE_MIDDLE',
        'COLOR_LINE_RIGHT_1', 'COLOR_LINE_RIGHT_2', 'COLOR_LINE_RIGHT_3', 'COLOR_LINE_RIGHT_4',
        'MARKING'
    ]);

    let insideControls = false;
    let insideTools    = false;
    let insideSteps    = false;
    let currentIndent  = 0;

    const indentStack = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trimStart();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const indent = line.length - trimmed.length;

        while (indentStack.length > 0 && indentStack[indentStack.length - 1].indent >= indent) {
            indentStack.pop();
        }

        const currentContext = indentStack.map(s => s.type).join('.');

        const keyMatch = trimmed.match(/^-?\s*([\w\-]+)\s*:/);
        if (keyMatch) {
            const key = keyMatch[1];
            indentStack.push({ indent, type: key });
        }

        if (/^\s*value\s*:/.test(line)) {
            const isInControls = indentStack.some(s => s.type === 'controls');
            const isInSteps    = indentStack.some(s => s.type === 'steps');

            if (isInControls && isInSteps) {
                const valueStr = line.split(':').slice(1).join(':').trim();

                const isPlainNumber = /^-?\d+(\.\d+)?$/.test(valueStr);
                const isPlainString = /^['"]\w.*['"]$/.test(valueStr) && !/center/.test(valueStr);
                const isEmpty       = valueStr === '' || valueStr === 'null' || valueStr === '~';

                let nextNonEmpty = '';
                for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                    const t = lines[j].trim();
                    if (t) { nextNonEmpty = t; break; }
                }

                const hasCenter = nextNonEmpty.startsWith('center:') || nextNonEmpty.startsWith('center ');

                if (isPlainNumber || isEmpty || (valueStr !== '' && !hasCenter && !valueStr.startsWith('{'))) {
                    errors.push({
                        lineIndex: i,
                        type: 'controls_value',
                        message: 'value: 需符合至少一種結構（anyOf）— Chỉ hỗ trợ cấu trúc center value'
                    });
                }
            }
        }

        if (/^\s*type\s*:/.test(line)) {
            const isInTools = indentStack.some(s => s.type === 'tools');
            if (isInTools) {
                const typeValue = line.split(':').slice(1).join(':').trim()
                    .replace(/^['"]|['"]$/g, '');

                if (typeValue && !VALID_TOOL_TYPES.has(typeValue)) {
                    errors.push({
                        lineIndex: i,
                        type: 'tool_type',
                        message: `tools.type "${typeValue}" không hợp lệ — Phải là một trong: MOLD, BLADDER, RING, BLOCK, PREFORMER, PREFORMER-1~4, COLOR_LINE_*, MARKING`
                    });
                }
            }
        }

        if (/^\s*ID\s*:/.test(line)) {
            const isInTools = indentStack.some(s => s.type === 'tools');
            if (isInTools) {
                const idValue = line.split(':').slice(1).join(':').trim();
                const isNull  = idValue === '' || idValue === 'null' || idValue === '~';

                if (isNull) {
                    errors.push({
                        lineIndex: i,
                        type: 'tool_id_null',
                        message: 'tools.ID: null — ID phải là string, integer, hoặc number; không được để trống'
                    });
                }
            }
        }
    }

    return errors;
}

function renderYamlWithErrors(content, filePath, errors) {
    const errorLines = new Set(errors.map(e => e.lineIndex));
    const errorMap   = {};
    errors.forEach(e => {
        if (!errorMap[e.lineIndex]) errorMap[e.lineIndex] = [];
        errorMap[e.lineIndex].push(e.message);
    });

    const lines = content.split('\n');

    let summaryHtml = '';
    if (errors.length > 0) {
        const errorItems = errors.map(e =>
            `<div class="yaml-error-summary-item">
                <span class="yaml-error-line-badge">Dòng ${e.lineIndex + 1}</span>
                <span class="yaml-error-summary-text">${escapeHtml(e.message)}</span>
            </div>`
        ).join('');

        summaryHtml = `
            <div class="yaml-error-summary">
                <div class="yaml-error-summary-title">
                    ⚠️ Phát hiện ${errors.length} lỗi tiềm ẩn
                </div>
                ${errorItems}
            </div>
        `;
    } else {
        summaryHtml = `
            <div class="yaml-ok-summary">
                ✅ Không phát hiện lỗi trong file YAML
            </div>
        `;
    }

    const fileInfoHtml = `
        <div class="diff-file-info" style="margin-bottom:8px;">
            <span class="diff-file-path">${escapeHtml(filePath)}</span>
        </div>
        ${summaryHtml}
    `;

    let html = '<div class="yaml-viewer">';

    lines.forEach((line, i) => {
        const escaped   = escapeHtml(line);
        const isError   = errorLines.has(i);
        const errorMsgs = errorMap[i] || [];

        let lineClass  = 'yaml-line';
        let extraAttrs = '';
        let tooltip    = '';

        if (isError) {
            lineClass  += ' yaml-line-error';
            tooltip     = errorMsgs.join(' | ');
            extraAttrs  = `title="${escapeHtml(tooltip)}"`;
        }

        let displayLine = escaped;

        if (/^\s*#/.test(line)) {
            lineClass += ' yaml-comment';
        } else {
            displayLine = escaped.replace(
                /^(\s*-?\s*)([\w\-]+)(\s*:)/,
                (match, pre, key, colon) => {
                    const keyClass = isError ? 'yaml-key yaml-key-error' : 'yaml-key';
                    return `${pre}<span class="${keyClass}">${key}</span>${colon}`;
                }
            );
        }

        const lineNum = String(i + 1).padStart(4, ' ');

        html += `
            <div class="${lineClass}" ${extraAttrs}>
                <span class="yaml-line-num">${lineNum}</span>
                <span class="yaml-line-content">${displayLine}</span>
                ${isError ? '<span class="yaml-error-icon" title="' + escapeHtml(tooltip) + '">⚠</span>' : ''}
            </div>
        `;
    });

    html += '</div>';

    return fileInfoHtml + html;
}

function filterClientResult(keyword) {
    if (['inputBarcode', 'outputBarcodeByFeedRecords', 'workOrderByRecipe', 'commitGitlabByRecipe', 'workOrderByBarcode', 'outputByBarcode', 'outputByRecipe', 'commitDetailByRecipe'].includes(activeSearchContext)) {
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

function openOutputTable(type, rowData = null) {
    if (rowData) {
        selectedRowData = rowData;
    }

    enterSingleRowMode();

    const container = document.getElementById('outputContainer');
    if (container) container.style.display = 'flex';

    activeSearchContext = type;

    clearOutputBarcodeTable();
    const outputHeaderContentEl = document.getElementById('outputHeaderContent');

    const dataObj = rowData || selectedRowData || {};

    if (type === 'inputBarcode') {
        if (outputHeaderContentEl) outputHeaderContentEl.textContent = 'Tem đầu vào';
        fetchInputBarcode(dataObj.id, dataObj.product_type);
    } else if (type === 'outputBarcodeByFeedRecords') {
        if (outputHeaderContentEl) outputHeaderContentEl.textContent = 'Tem đầu ra';
        fetchOutputBarcode(dataObj.work_order);
    } else if (type === 'workOrderByRecipe') {
        if (outputHeaderContentEl) outputHeaderContentEl.textContent = 'Đơn điều động theo quy cách';
        fetchWorkOrderByRecipe(dataObj.recipe_id);
    } else if (type === 'commitGitlabByRecipe') {
        if (outputHeaderContentEl) outputHeaderContentEl.textContent = 'Commit Gitlab theo quy cách';
        fetchCommitGitlabByRecipe(dataObj.recipe_id, dataObj.product_type);
    } else if (type === 'workOrderByBarcode') {
        if (outputHeaderContentEl) outputHeaderContentEl.textContent = 'Đơn điều động theo barcode';
        fetchWorkOrderByBarcode(dataObj.id, dataObj.info);
    } else if (type === 'fetchOriginalInfoByBarcode') {
        if (outputHeaderContentEl) outputHeaderContentEl.textContent = 'Thông tin gốc của barcode';
        fetchOriginalInfoByBarcode(dataObj.id, dataObj.product_type);
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
    updateTableStickyOffsets();
}

function renderOutputBarcodeTable(rows, columns) {
    const thead = document.querySelector('#outputBarcodeTable thead');
    const tbody = document.querySelector('#outputBarcodeTable tbody');
    const rowCount = document.getElementById('outputRowCount');

    if (!thead || !tbody) return;

    thead.innerHTML = '';
    tbody.innerHTML = '';

    // Khi không có dữ liệu: Không hiển thị header và footer, chỉ hiển thị empty state
    if (!rows || rows.length === 0) {
        if (rowCount) rowCount.textContent = '0';
        const emptyTr = document.createElement('tr');
        const emptyTd = document.createElement('td');
        emptyTd.colSpan = (columns && columns.length > 0) ? columns.length : 1;
        emptyTd.style.textAlign = 'center';
        emptyTd.style.padding = '56px 20px';
        emptyTd.innerHTML = `
            <div class="table-empty-state">
                <div class="empty-state-icon-wrapper">
                    <span class="material-symbols-outlined empty-state-icon">inventory_2</span>
                </div>
                <div class="empty-state-title">Không có dữ liệu tem đầu ra</div>
                <div class="empty-state-desc">Không tìm thấy tem quét ra nào thuộc phạm vi đơn điều động hoặc barcode này.</div>
            </div>
        `;
        emptyTr.appendChild(emptyTd);
        tbody.appendChild(emptyTr);
        updateOutputVisibleRowCount();
        updateTableStickyOffsets();
        return;
    }

    // Table header (chỉ render khi có dữ liệu)
    if (columns && columns.length > 0) {
        const trHead = document.createElement('tr');
        columns.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col;
            trHead.appendChild(th);
        });
        thead.appendChild(trHead);
    }

    const truncateThreshold = 50;
    const displayLength = 45;

    rows.forEach(row => {
        const tr = document.createElement('tr');
        row.forEach(val => {
            const td = document.createElement('td');

            let cellValue = '';
            let fullValue = '';

            if (val !== null && val !== undefined) {
                if (typeof val === 'object') {
                    try {
                        fullValue = JSON.stringify(val, null, 2);
                        cellValue = fullValue;
                    } catch (e) {
                        fullValue = String(val);
                        cellValue = fullValue;
                    }
                } else {
                    fullValue = String(val);
                    cellValue = fullValue;
                }
            }

            if (cellValue.length > truncateThreshold) {
                td.textContent = cellValue.substring(0, displayLength) + '...';
                td.title = fullValue;
                td.classList.add('truncated-cell');
            } else {
                td.textContent = cellValue;
            }

            td.dataset.fullValue = fullValue;

            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    const count = rows.length;
    if (rowCount) rowCount.textContent = count;
    updateOutputVisibleRowCount();
    updateTableStickyOffsets();
}

function initClientSearch() {
    const searchInput = document.getElementById('clientSearch');
    if (!searchInput) return;

    // Disable clientSearch khi vừa load page
    searchInput.disabled = true;

    // Filter khi người dùng nhập
    searchInput.addEventListener('input', function () {
        const keyword = this.value.trim().toLowerCase();
        filterClientResult(keyword);
    });
}

/**
 * Enable hoặc disable clientSearch dựa trên số dòng trong table
 * @param {boolean} hasData - true nếu table có dữ liệu gốc từ server
 */
function updateClientSearchState(hasData = false) {
    const searchInput = document.getElementById('clientSearch');
    if (!searchInput) return;

    if (hasData) {
        // Enable clientSearch khi có dữ liệu
        searchInput.disabled = false;
    } else {
        // Disable clientSearch khi không có dữ liệu
        searchInput.disabled = true;
        searchInput.value = ''; // Clear input
    }
}

function setTableData(result, columns, tableType = null, customEmptyMsg = null, customSuccessMsg = null) {
    rawTableData = result || [];
    rawTableColumns = columns || [];
    currentTableType = tableType;
    updateClientSearchState(rawTableData.length > 0);
    displayTable(rawTableData, rawTableColumns);

    if (!rawTableData || rawTableData.length === 0) {
        Toast.warning('Không có dữ liệu', customEmptyMsg || 'Không có dữ liệu');
    } else {
        Toast.success('Thành công', customSuccessMsg || `Tải thành công ${rawTableData.length.toLocaleString()} dòng dữ liệu`);
    }
}

async function apiFetch(url, options = {}) {
    showLoading();

    try {
        const res = await fetch(url, options);
        let data = null;

        try {
            data = await res.json();
        } catch (e) {
            if (isUnauthorizedResponse(res.status, null)) {
                showAuthExpiredModal();
                throw new Error('Phiên đăng nhập đã hết hạn');
            }
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            return null;
        }

        if (isUnauthorizedResponse(res.status, data)) {
            showAuthExpiredModal(data ? data.message : null);
            throw new Error(data ? data.message : 'Unauthorized');
        }

        if (!res.ok) {
            const errMsg = (data && data.message) ? data.message : `HTTP error ${res.status}`;
            throw new Error(errMsg);
        }

        return data;
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

    const hasEmptyState = tbody.querySelector('.table-empty-state');
    const count = hasEmptyState ? 0 : tbody.querySelectorAll('tr').length;
    rowCount.textContent = count;

    // Ẩn table-footer khi không có dòng hoặc đang ở trạng thái rỗng
    tableFooter.classList.toggle('hidden', count === 0 || !!hasEmptyState);
}

function updateOutputVisibleRowCount() {
    const tbody = document.getElementById('outputBarcodeTableBody') || document.querySelector('#outputBarcodeTable tbody');
    const rowCount = document.getElementById('outputRowCount');
    const outputFooter = document.querySelector('.output-footer');

    if (!tbody || !rowCount) return;

    const hasEmptyState = tbody.querySelector('.table-empty-state');
    const count = hasEmptyState ? 0 : tbody.querySelectorAll('tr').length;
    rowCount.textContent = count;

    if (outputFooter) {
        // Ẩn output-footer khi không có dòng hoặc đang ở trạng thái rỗng
        outputFooter.classList.toggle('hidden', count === 0 || !!hasEmptyState);
    }
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

    const rows = tbody.querySelectorAll('tr:not(.table-empty-state)');
    if (rows.length === 0) {
        Toast.warning('Cảnh báo', 'Không có dữ liệu để xuất file Excel.');
        return;
    }

    const confirmed = await showConfirm('Bạn có chắc chắn muốn xuất file Excel của dữ liệu trên?');
    if (!confirmed) return;

    exportTableToExcel();
    Toast.success('Thành công', 'Xuất file Excel thành công!');
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

    const rows = tbody.querySelectorAll('tr:not(.table-empty-state)');
    if (rows.length === 0) {
        Toast.warning('Cảnh báo', 'Không có dữ liệu để xuất file Excel.');
        return;
    }

    const confirmed = await showConfirm(
        'Bạn có chắc chắn muốn xuất file Excel của dữ liệu trên?'
    );
    if (!confirmed) return;

    exportOutputBarcodeToExcel();
    Toast.success('Thành công', 'Xuất file Excel thành công!');
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

function formatDate(date) {
    if (!(date instanceof Date)) return '';

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;
}

document.addEventListener('DOMContentLoaded', () => {
    initOcrDropzone();

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
    if (!tbody) return;

    const mainTableContainer = document.querySelector('.table-container:not(.output-barcode)');
    const isAlreadySingleRow = mainTableContainer && mainTableContainer.classList.contains('single-row-mode');

    if (isAlreadySingleRow) {
        return;
    }

    if (!selectedRow) return;

    // backup table lần đầu
    if (!originalTableHTML) {
        originalTableHTML = tbody.innerHTML;
    }

    // giữ lại đúng dòng đã chọn
    tbody.innerHTML = '';
    tbody.appendChild(selectedRow);

    if (mainTableContainer) {
        mainTableContainer.classList.add('single-row-mode');
    }
    const container = document.querySelector('.container');
    if (container) {
        container.classList.add('has-output-barcode');
    }

    updateVisibleRowCount();
    updateTableStickyOffsets();
}

function exitSingleRowMode() {
    const tbody = document.getElementById('tableBody');
    if (!tbody || !originalTableHTML) return;

    tbody.innerHTML = originalTableHTML;

    originalTableHTML = null;
    selectedRow = null;
    selectedRowData = null;

    const mainTableContainer = document.querySelector('.table-container:not(.output-barcode)');
    if (mainTableContainer) {
        mainTableContainer.classList.remove('single-row-mode');
    }
    const container = document.querySelector('.container');
    if (container) {
        container.classList.remove('has-output-barcode');
    }

    updateVisibleRowCount();
    updateTableStickyOffsets();
}

function initDateRangePicker(type) {
    const dateInput = document.getElementById('dateRange');
    const fromDateEl = document.getElementById('fromDate');
    const toDateEl = document.getElementById('toDate');

    if (!dateInput) return;

    // explicit reset
    if (fromDateEl) fromDateEl.value = '';
    if (toDateEl) toDateEl.value = '';
    dateInput.value = '';

    const flatpickrInstance = flatpickr(dateInput, {
        mode: "range",
        dateFormat: "Y-m-d",
        maxDate: "today",
        allowInput: false,
        clickOpens: true,
        defaultDate: null,
        locale: {
            rangeSeparator: "  →  ",
            firstDayOfWeek: 1,
            weekdays: {
                shorthand: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"],
                longhand: ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"]
            },
            months: {
                shorthand: ["Th1", "Th2", "Th3", "Th4", "Th5", "Th6", "Th7", "Th8", "Th9", "Th10", "Th11", "Th12"],
                longhand: ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"]
            }
        },

        onClose(selectedDates) {
            if (selectedDates.length === 1) {
                const dateStr = formatDate(selectedDates[0]);
                if (fromDateEl) fromDateEl.value = dateStr;
                if (toDateEl) toDateEl.value = dateStr;
                dateInput.value = dateStr;
            } else if (selectedDates.length === 2) {
                if (fromDateEl) fromDateEl.value = formatDate(selectedDates[0]);
                if (toDateEl) toDateEl.value = formatDate(selectedDates[1]);
            } else {
                if (fromDateEl) fromDateEl.value = '';
                if (toDateEl) toDateEl.value = '';
                dateInput.value = '';
                return;
            }

            if (type == 'scan_barcode_history') { checkAndSearchHistoryScanByStation(); }
            if (type == 'print_barcode_history') { checkAndSearchHistoryPrintByStation(); }
            if (type == 'reprint') { checkQueryReprintBarcode(); }
            if (type == 'check_qc_data') { checkAndSearchQCData(); }
        }
    });

    // Event click để clear calendar
    dateInput.addEventListener('click', function (e) {
        if (dateInput.value) {
            e.preventDefault();
            flatpickrInstance.clear();
            dateInput.value = '';
            if (fromDateEl) fromDateEl.value = '';
            if (toDateEl) toDateEl.value = '';
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

async function getWorkOrderDetails(rowData = null) {
    const dataObj = rowData || selectedRowData;
    const work_order_id = dataObj ? dataObj['work_order'] : null;
    if (!work_order_id) {
        Toast.warning('Cảnh báo', 'Chưa chọn hàng dữ liệu.');
        return;
    }

    try {
        const data = await apiFetch('/api/work-orders/get-details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ work_order_id })
        });

        if (data.success) {
            if (data.result && data.result.length > 0) {
                setTableData(data.result, data.columns, null);
                Toast.success('Thành công', `Tải chi tiết đơn điều động thành công (${data.result.length} dòng)`);
            } else {
                setTableData([], data.columns || [], null);
                Toast.warning('Không có dữ liệu', data.message || 'Không tìm thấy chi tiết đơn điều động');
            }
        } else {
            Toast.error('Lỗi', data.message || 'Lỗi khi tải chi tiết đơn điều động');
        }
    } catch (err) {
        Toast.error('Lỗi', err.message || 'Lỗi kết nối khi tải chi tiết đơn điều động');
    }
}

async function fetchScanBarcodeHistoryByBarcode(rowData = null) {
    const dataObj = rowData || selectedRowData;
    const resource_id = dataObj ? dataObj['id'] : null;
    if (!resource_id) {
        Toast.warning('Cảnh báo', 'Chưa chọn hàng dữ liệu.');
        return;
    }

    try {
        const data = await apiFetch('/api/barcodes/scan-in-station', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resource_id })
        });

        if (data.success) {
            if (Array.isArray(data.result) && data.result.length === 0) {
                Toast.info('Thông báo', `Barcode ${resource_id} đang không được quét vào bất kỳ máy nào`);
                return;
            }
            setTableData(data.result, data.columns, null);
            Toast.success('Thành công', `Tải lịch sử quét thành công (${data.result.length} dòng)`);
        } else {
            Toast.error('Lỗi', data.message || 'Lỗi khi tải lịch sử quét barcode');
        }
    } catch (err) {
        Toast.error('Lỗi', err.message || 'Lỗi kết nối khi tải lịch sử quét barcode');
    }
}

// =========================================================================
// OCR IMAGE-TO-TEXT DROPZONE CONTROLLER (PAGE MAIN)
// =========================================================================
let lastOcrResultText = '';

function initOcrDropzone() {
    const dropzone = document.getElementById('ocrDropzone');
    const fileInput = document.getElementById('ocrFileInput');
    if (!dropzone || !fileInput) return;

    // 1. Single Click (1 click): Mở trực tiếp hộp thoại chọn file ảnh từ folder máy tính
    dropzone.addEventListener('click', (e) => {
        if (e.target.closest('#ocrCopyBtn') || e.target.closest('#ocrRemoveBtn') || e.target.closest('#ocrResultBox')) {
            return;
        }
        if (dropzone.classList.contains('is-loading')) return;
        fileInput.click();
    });

    // 2. Global Paste Handler: Khi trang web đang focus bất kỳ đâu, nếu user nhấn Ctrl+V ảnh -> OCR nhận luôn
    document.addEventListener('paste', async (e) => {
        const dropzoneEl = document.getElementById('ocrDropzone');
        if (!dropzoneEl || dropzoneEl.classList.contains('is-loading')) return;

        const clipboardData = e.clipboardData || window.clipboardData;
        if (!clipboardData) return;

        let imageFile = null;
        const items = clipboardData.items;

        if (items) {
            for (let i = 0; i < items.length; i++) {
                if (items[i].type && items[i].type.startsWith('image/')) {
                    imageFile = items[i].getAsFile();
                    break;
                }
            }
        }

        if (!imageFile && clipboardData.files && clipboardData.files.length > 0) {
            for (let i = 0; i < clipboardData.files.length; i++) {
                if (clipboardData.files[i].type.startsWith('image/')) {
                    imageFile = clipboardData.files[i];
                    break;
                }
            }
        }

        // Chỉ chặn sự kiện và xử lý khi clipboard thực sự có file hình ảnh
        if (imageFile) {
            e.preventDefault();
            e.stopPropagation();
            await processOcrImageFile(imageFile);
        }
    });

    // Hỗ trợ phím Enter / Space khi đang focus dropzone
    dropzone.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !dropzone.classList.contains('is-preview') && !dropzone.classList.contains('is-loading')) {
            e.preventDefault();
            fileInput.click();
        }
    });

    // 3. Kéo thả file (Drag & Drop)
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (dropzone.classList.contains('is-loading')) return;
            dropzone.classList.add('drag-over');
        }, false);
    });

    ['dragleave', 'dragend'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('drag-over');
        }, false);
    });

    dropzone.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-over');

        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length > 0) {
            const file = dt.files[0];
            await processOcrImageFile(file);
        }
    }, false);

    // 4. Nút Copy kết quả
    const copyBtn = document.getElementById('ocrCopyBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            copyOcrResultToClipboard();
        });
    }

    // 5. Nhấp vào khung kết quả text -> Tự động copy
    const resultBox = document.getElementById('ocrResultBox');
    if (resultBox) {
        resultBox.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            copyOcrResultToClipboard();
        });
    }
}

function handleOcrFileSelected(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = ''; // Reset input để cho phép chọn lại cùng 1 file
    if (!file) return;
    processOcrImageFile(file);
}

async function processOcrImageFile(file) {
    const dropzone = document.getElementById('ocrDropzone');
    if (!dropzone || !file) return;

    // Kiểm tra định dạng file ảnh
    const isImage = (file.type && file.type.startsWith('image/')) || /\.(png|jpe?g|webp|bmp|gif|tiff?|jfif|svg)$/i.test(file.name || '');
    if (!isImage) {
        Toast.error('Lỗi định dạng', 'Chỉ chấp nhận file hình ảnh (PNG, JPG, WEBP, BMP, v.v.)');
        resetOcrDropzone();
        return;
    }

    // Chuyển sang State Loading
    dropzone.classList.remove('is-preview');
    dropzone.classList.add('is-loading');

    const loadingNameEl = document.getElementById('ocrLoadingFileName');
    const statusEl = document.getElementById('ocrLoadingStatus');
    const pctEl = document.getElementById('ocrLoadingPercent');
    const barEl = document.getElementById('ocrProgressBar');

    if (loadingNameEl) loadingNameEl.textContent = file.name || 'Ảnh chụp màn hình';
    if (statusEl) statusEl.textContent = 'Khởi động AI OCR...';
    if (pctEl) pctEl.textContent = '15%';
    if (barEl) barEl.style.width = '15%';

    // Thanh tiến trình mượt mà
    let currentPct = 15;
    const progressTimer = setInterval(() => {
        if (currentPct < 90) {
            currentPct += Math.max(1, Math.floor((90 - currentPct) / 5));
            if (pctEl) pctEl.textContent = `${currentPct}%`;
            if (barEl) barEl.style.width = `${currentPct}%`;
        }
    }, 120);

    let rawText = '';

    try {
        // Stage 1: Thử giải mã mã vạch trực tiếp bằng native BarcodeDetector API (nếu trình duyệt hỗ trợ)
        if ('BarcodeDetector' in window) {
            try {
                if (statusEl) statusEl.textContent = 'Đang quét Barcode...';
                const detector = new BarcodeDetector({
                    formats: ['code_128', 'code_39', 'code_93', 'ean_13', 'qr_code', 'data_matrix']
                });
                const imgBitmap = await createImageBitmap(file);
                const barcodes = await detector.detect(imgBitmap);
                if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                    rawText = barcodes[0].rawValue.trim();
                }
            } catch (_bcErr) {
                console.log('[OCR] Native BarcodeDetector skipped, using Deep Learning OCR');
            }
        }

        // Stage 2: Nếu chưa có barcode, gọi Server-side AI OCR (RapidOCR / PaddleOCR ONNX)
        if (!rawText) {
            if (statusEl) statusEl.textContent = 'Đang nhận diện ký tự AI...';
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/ocr/recognize', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const data = await res.json();
                if (data && data.success && data.text) {
                    rawText = data.text.trim();
                }
            }
        }

        // Stage 3: Fallback client-side Tesseract nếu Server không phản hồi
        if (!rawText && typeof Tesseract !== 'undefined') {
            if (statusEl) statusEl.textContent = 'Quét bổ trợ (Tesseract)...';
            const result = await Tesseract.recognize(file, 'eng', {
                logger: m => {
                    if (m.status === 'recognizing text' && m.progress !== undefined) {
                        const pct = Math.min(95, Math.round(m.progress * 100));
                        if (pctEl) pctEl.textContent = `${pct}%`;
                        if (barEl) barEl.style.width = `${pct}%`;
                    }
                }
            });
            if (result && result.data && result.data.text) {
                // Lọc bỏ dòng nhiễu do sọc barcode
                const lines = result.data.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                if (lines.length > 0) {
                    const sorted = lines.slice().sort((a, b) => b.replace(/[^A-Za-z0-9]/g, '').length - a.replace(/[^A-Za-z0-9]/g, '').length);
                    rawText = sorted[0] || lines.join(' ');
                }
            }
        }

        clearInterval(progressTimer);
        if (pctEl) pctEl.textContent = '100%';
        if (barEl) barEl.style.width = '100%';

        if (!rawText) {
            Toast.warning('Không có ký tự', 'Không tìm thấy ký tự chữ hoặc số nào trong hình ảnh.');
            resetOcrDropzone();
            return;
        }

        lastOcrResultText = rawText;

        // Chuyển sang State Preview
        dropzone.classList.remove('is-loading');
        dropzone.classList.add('is-preview');

        const resultTextEl = document.getElementById('ocrResultText');
        if (resultTextEl) {
            resultTextEl.textContent = rawText;
            resultTextEl.setAttribute('title', rawText);
        }

        Toast.success('Nhận diện thành công', `Đã nhận diện: ${rawText}`);
    } catch (err) {
        clearInterval(progressTimer);
        console.error('OCR Processing Error:', err);
        Toast.error('Lỗi nhận diện OCR', err.message || 'Không thể đọc ký tự từ hình ảnh');
        resetOcrDropzone();
    }
}

async function copyTextToClipboard(text) {
    if (!text) return false;
    // 1. Thử dùng Modern Clipboard API (khi ở HTTPS hoặc context cho phép)
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (_e) {
            // Tiếp tục fallback nếu bị chặn quyền hoặc chạy trong iframe
        }
    }

    // 2. Fallback dùng textarea ẩn (hoạt động 100% trên HTTP mạng LAN, localhost và bên trong iframe)
    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.left = '0';
        textarea.style.width = '2em';
        textarea.style.height = '2em';
        textarea.style.padding = '0';
        textarea.style.border = 'none';
        textarea.style.outline = 'none';
        textarea.style.boxShadow = 'none';
        textarea.style.background = 'transparent';
        textarea.style.opacity = '0';
        textarea.setAttribute('readonly', '');
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        return successful;
    } catch (err) {
        console.error('execCommand copy error:', err);
        return false;
    }
}

async function copyOcrResultToClipboard() {
    const textEl = document.getElementById('ocrResultText');
    const textToCopy = (lastOcrResultText || (textEl ? textEl.textContent : '') || '').trim();
    if (!textToCopy || textToCopy === '...') return;

    const copyBtn = document.getElementById('ocrCopyBtn');
    const success = await copyTextToClipboard(textToCopy);

    if (success) {
        if (copyBtn) {
            copyBtn.classList.add('copied');
            const spanText = copyBtn.querySelector('span:not(.material-symbols-outlined)');
            const icon = copyBtn.querySelector('.material-symbols-outlined');
            if (spanText) spanText.textContent = 'Đã copy';
            if (icon) icon.textContent = 'check';

            setTimeout(() => {
                copyBtn.classList.remove('copied');
                if (spanText) spanText.textContent = 'Copy';
                if (icon) icon.textContent = 'content_copy';
            }, 2000);
        }
        if (typeof Toast !== 'undefined' && Toast.success) {
            Toast.success('Đã sao chép', `Đã copy: ${textToCopy}`);
        }
    } else {
        if (typeof Toast !== 'undefined' && Toast.error) {
            Toast.error('Lỗi sao chép', 'Không thể sao chép văn bản vào bộ nhớ tạm');
        }
    }
}

function resetOcrDropzone(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const dropzone = document.getElementById('ocrDropzone');
    if (!dropzone) return;

    dropzone.classList.remove('is-loading', 'is-preview', 'drag-over');

    const resultTextEl = document.getElementById('ocrResultText');
    if (resultTextEl) resultTextEl.textContent = '';
    lastOcrResultText = '';

    const fileInput = document.getElementById('ocrFileInput');
    if (fileInput) fileInput.value = '';
}
window.handleOcrFileSelected = handleOcrFileSelected;
window.resetOcrDropzone = resetOcrDropzone;
window.initOcrDropzone = initOcrDropzone;
window.copyOcrResultToClipboard = copyOcrResultToClipboard;
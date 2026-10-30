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
let selectedSubOutputRow = null;
let selectedSubOutputRowData = null;
let originalTableHTML = null;
let originalOutputTableHTML = null;
let originalOutputRowCount = null;
let currentRowClickType = null;
let currentTableType = null;
let currentOutputTableType = null;
let rawTableData = [];
let rawTableColumns = [];
let filteredTableData = [];
let filteredOutputBarcodeData = [];
let filteredSubOutputBarcodeData = [];
let feed_records_material_id = null;
let tableViewStack = [];
let outputBarcodeRawData = [];
let outputBarcodeColumns = [];
let subOutputRawData = [];
let subOutputColumns = [];
let activeSearchContext = 'main';
let apiLoadingCount = 0;
let currentBarcodeDetailType = null;
let countdownConfirm = null;
let totalOutputBarcode = null;

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
        // Deduplicate identical toasts (prevent double notifications from concurrent/catch triggers)
        const toastKey = `${toastType}:::${title}:::${message}`;
        const now = Date.now();
        if (!this._recentKeys) this._recentKeys = new Map();
        const lastTime = this._recentKeys.get(toastKey);
        if (lastTime && (now - lastTime < 1500)) {
            return null;
        }
        this._recentKeys.set(toastKey, now);

        if (this._recentKeys.size > 20) {
            for (const [k, t] of this._recentKeys.entries()) {
                if (now - t > 5000) this._recentKeys.delete(k);
            }
        }

        // Check if an identical toast is currently visible in DOM
        const visibleSameToasts = container.querySelectorAll(`.toast-item:not(.removing).toast-${toastType}`);
        for (const vt of visibleSameToasts) {
            const vtTitle = vt.querySelector('.toast-title')?.textContent?.trim() || '';
            const vtMsg = vt.querySelector('.toast-message')?.textContent?.trim() || '';
            if (vtTitle === title.trim() && vtMsg === message.trim()) {
                return null;
            }
        }

        const iconName = this.ICONS[toastType] || 'info';

        // Stacking limit: Maximum 3 toasts at any time (persistent toast occupies 1 fixed slot)
        const allActiveToasts = Array.from(container.querySelectorAll('.toast-item:not(.removing)'));
        const normalActiveToasts = allActiveToasts.filter(t => !t.classList.contains('toast-persistent'));
        const hasPersistent = allActiveToasts.length > normalActiveToasts.length;
        const maxNormalSlots = hasPersistent ? 2 : 3;

        if (normalActiveToasts.length >= maxNormalSlots) {
            for (let i = 0; i <= normalActiveToasts.length - maxNormalSlots; i++) {
                const oldToast = normalActiveToasts[i];
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
    },
    showPersistentYamlSearchToast(keyword) {
        const { container, doc } = this.getContainer();
        
        // Remove existing persistent toast if any
        const existing = container.querySelector('.toast-item.toast-persistent');
        if (existing) {
            existing.remove();
        }

        // Keep max 2 normal toasts when persistent toast enters
        const normalActiveToasts = Array.from(container.querySelectorAll('.toast-item:not(.removing):not(.toast-persistent)'));
        if (normalActiveToasts.length >= 2) {
            for (let i = 0; i <= normalActiveToasts.length - 2; i++) {
                const oldToast = normalActiveToasts[i];
                oldToast.classList.add('removing');
                setTimeout(() => {
                    try { oldToast.remove(); } catch (e) {}
                }, 150);
            }
        }

        const toast = doc.createElement('div');
        toast.className = 'toast-item toast-warning toast-persistent toast-persistent-vibrate';
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'polite');

        const cleanKeyword = (keyword || '').trim();

        toast.innerHTML = `
            <span class="toast-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path>
                    <circle cx="12" cy="13" r="3"></circle>
                    <path d="m14.5 15.5 2.5 2.5"></path>
                </svg>
            </span>
            <div class="toast-content">
                <div class="toast-title">Tìm kiếm Quy cách trong YAML</div>
                <div class="toast-message">Bạn đang muốn thực hiện tìm kiếm Quy cách / Recipe ở file yaml ở đâu?</div>
                <div class="toast-actions-grid">
                    <button class="toast-action-btn" data-project="136" data-name="Mixing (BB)" type="button" title="Dự án Mixing (136)">BB</button>
                    <button class="toast-action-btn" data-project="135" data-name="Kitting (CBK)" type="button" title="Dự án Kitting (135)">CBK</button>
                    <button class="toast-action-btn" data-project="133" data-name="Building (TH)" type="button" title="Dự án Building (133)">TH</button>
                    <button class="toast-action-btn" data-project="134" data-name="Curing (EV)" type="button" title="Dự án Curing (134)">EV</button>
                </div>
            </div>
            <button class="toast-close" type="button" title="Đóng" aria-label="Đóng thông báo">
                <svg class="close-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;

        const dismiss = () => {
            toast.classList.add('removing');
            setTimeout(() => {
                try { toast.remove(); } catch (e) {}
            }, 150);
        };

        const closeBtn = toast.querySelector('.toast-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dismiss();
            });
        }

        const buttons = toast.querySelectorAll('.toast-action-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const projectId = parseInt(btn.dataset.project, 10);
                const projectName = btn.dataset.name;
                dismiss();
                searchRecipeYamlFiles(cleanKeyword, projectId, projectName);
            });
        });

        container.appendChild(toast);
    }
};
window.Toast = Toast;

// Unified showAlert wrapper converting all alerts across the project to Toasts
function showAlert(message, type = 'info', onOk = null) {
    let finalType = ['info', 'warning', 'success', 'error'].includes(type) ? type : 'info';
    let finalMsg = String(message || '');
    let finalTitle = null;

    if (['info', 'warning', 'success', 'error'].includes(message)) {
        finalType = message;
        finalTitle = typeof type === 'string' ? type : null;
        finalMsg = typeof onOk === 'string' ? onOk : (typeof type === 'string' ? type : '');
    }

    Toast[finalType](finalTitle || Toast.TITLES[finalType] || 'Thông báo', finalMsg);
    if (typeof onOk === 'function') setTimeout(onOk, 10);
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
    function setupClearButton(box) {
        if (!box) return;
        const input = box.querySelector('.input, .winx-input, input[type="text"], input[type="search"], input[type="password"]');
        if (!input || input.type === 'hidden' || input.type === 'checkbox' || input.type === 'file') return;

        // Ensure placeholder is set for CSS :not(:placeholder-shown) floating label support
        if (!input.placeholder || input.placeholder === '') {
            input.placeholder = ' ';
        }

        let clearBtn = box.querySelector('.clear-btn');
        if (!clearBtn) {
            clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'clear-btn';
            clearBtn.setAttribute('tabindex', '-1');
            clearBtn.setAttribute('aria-label', 'Xóa nội dung');
            clearBtn.innerHTML = '<svg class="clear-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
            clearBtn.title = 'Xóa nội dung';
            box.appendChild(clearBtn);

            const handleClear = (e) => {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }

                // Unlock readOnly if autofill guarded so input can be cleared cleanly
                if (input.readOnly && input.dataset.autofillGuarded) {
                    input.readOnly = false;
                }

                input.value = '';
                box.classList.remove('has-value');

                // Nếu có Flatpickr (ví dụ ô dateRange)
                if (input._flatpickr) {
                    try {
                        input._flatpickr.clear();
                    } catch (err) {}
                }

                // Nếu là dateRange, xóa luôn 2 input ẩn fromDate và toDate
                if (input.id === 'dateRange') {
                    const fromDateEl = document.getElementById('fromDate');
                    const toDateEl = document.getElementById('toDate');
                    if (fromDateEl) fromDateEl.value = '';
                    if (toDateEl) toDateEl.value = '';
                }

                // Dispatch sự kiện input và change để các listener filter/search cập nhật kết quả
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));

                // Refocus vào input sau khi xóa
                try {
                    input.focus();
                } catch (err) {}

                updateClearState();
            };

            // Ngăn chặn blur làm ẩn nút hoặc hủy bỏ sự kiện click khi người dùng bấm chuột vào clearBtn
            clearBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleClear(e);
            });

            clearBtn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });

            clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (input.value !== '') {
                    handleClear(e);
                }
            });
        }

        const updateClearState = () => {
            // Không kiểm tra !input.readOnly vì autofill guard đặt readOnly=true khi input không active
            const hasText = input.value != null && String(input.value).trim().length > 0;
            if (!input.disabled && hasText) {
                box.classList.add('has-value');
            } else {
                box.classList.remove('has-value');
            }
        };

        if (!input._clearEventsBound) {
            input._clearEventsBound = true;
            input.addEventListener('input', updateClearState);
            input.addEventListener('change', updateClearState);
            input.addEventListener('keyup', updateClearState);
            input.addEventListener('blur', updateClearState);
            input.addEventListener('focus', updateClearState);

            box.addEventListener('mouseenter', updateClearState);

            const observer = new MutationObserver(() => {
                updateClearState();
            });
            observer.observe(input, { attributes: true, attributeFilter: ['disabled', 'value'] });
        }

        if (!box._boxClickBound) {
            box._boxClickBound = true;
            box.addEventListener('click', (e) => {
                const clear = box.querySelector('.clear-btn');
                if (clear && (e.target === clear || clear.contains(e.target))) return;
                if (e.target !== input && !input.disabled && !input.readOnly) {
                    input.focus();
                }
            });
        }

        updateClearState();
    }

    // Áp dụng cho cả .input-box, .input-wrapper và các container input khác
    document.querySelectorAll('.input-box, .input-wrapper, .winx-search-bar, .winx-input-row').forEach(box => {
        setupClearButton(box);
    });

    // Đồng bộ định kỳ để bắt kịp cả các trường hợp cập nhật input.value bằng code JS mà không bắn event
    if (!window._inputClearIntervalStarted) {
        window._inputClearIntervalStarted = true;
        setInterval(() => {
            document.querySelectorAll('.input-box, .input-wrapper, .winx-search-bar, .winx-input-row').forEach(box => {
                const input = box.querySelector('.input, .winx-input, input[type="text"], input[type="search"], input[type="password"]');
                if (!input || input.type === 'hidden' || input.type === 'checkbox' || input.type === 'file') return;
                
                if (!box.querySelector('.clear-btn')) {
                    setupClearButton(box);
                }

                const hasText = input.value != null && String(input.value).trim().length > 0;
                if (!input.disabled && hasText) {
                    if (!box.classList.contains('has-value')) box.classList.add('has-value');
                } else {
                    if (box.classList.contains('has-value')) box.classList.remove('has-value');
                }
            });
        }, 300);
    }
}

// ===== CLEAR INPUT HELPER =====
function clearInputBox(inputEl) {
    if (!inputEl) return;
    inputEl.value = '';
    const box = inputEl.closest('.input-box, .input-wrapper, .winx-search-bar, .winx-input-row');
    if (box) {
        box.classList.remove('has-value');
    }
}
window.clearInputBox = clearInputBox;

// ===== AUTO UPPERCASE =====
function initAutoUppercase() {
    const uppercaseIds = ['barcode', 'product_id', 'feed_record_id', 'work_order', 'workOrderInput', 'substitutions', 'mr_id', 'mr_product_id', 'mr_station', 'station', 'department'];
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
            const bSwitcher = document.getElementById('mainInputSwitcher');
            const rSwitcher = document.getElementById('recipeInputSwitcher');
            let searchInp = null;
            if (bSwitcher) {
                const bMode = bSwitcher.dataset.activeMode || 'barcode';
                searchInp = bMode === 'feed_record' ? document.getElementById('feed_record_id') : document.getElementById('barcode');
            }
            if (!searchInp && rSwitcher) {
                const rMode = rSwitcher.dataset.activeMode || 'recipe';
                searchInp = rMode === 'work_order' ? document.getElementById('work_order') : document.getElementById('product_id');
            }
            if (!searchInp) {
                searchInp = document.getElementById('barcode') ||
                            document.getElementById('feed_record_id') ||
                            document.getElementById('product_id') ||
                            document.getElementById('work_order') ||
                            document.getElementById('clientSearch') ||
                            document.getElementById('workOrderInput') ||
                            document.querySelector('.input-box .input');
            }
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
            const mesTrackingModal = document.getElementById('mesTrackingModal');
            if (mesTrackingModal && !mesTrackingModal.classList.contains('hidden') && mesTrackingModal.style.display !== 'none') {
                closeMesTrackingModal();
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
            const subOutputContainer = document.getElementById('subOutputContainer');
            if (subOutputContainer && subOutputContainer.style.display === 'flex') {
                if (typeof closeSubOutputWindow === 'function') {
                    closeSubOutputWindow();
                }
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

                // Bỏ focus khỏi input dropdown ngay sau khi chọn
                if (document.activeElement && typeof document.activeElement.blur === 'function') {
                    document.activeElement.blur();
                }
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
        'checkScanBarcodeHistory': 'precision_manufacturing',
        'checkBarcodeWorkOrder': 'assignment',
        'mesTracking': 'account_tree',
        'checkBarcodeTransfer': 'local_shipping',
        'checkBarcodeExtendDateTime': 'update',
        'fetchOriginalInfo': 'info',
        'getPrdeba': 'dataset',
        'getPrdebb': 'dataset',
        'getPrdebc': 'dataset',
        'reprintLabelPdf': 'print',
        'outputBarcodeByFeedRecords': 'output',
        'fetchOutputBarcodeByWorkOrder': 'qr_code_2',
        'searchWorkOrderByRecipe': 'assignment',
        'searchCommitGitlabByRecipe': 'source',
        'searchActionsCommitByRecipe': 'alt_route',
        'fetchYamlDetails': 'code',
        'outputByBarcode': 'qr_code_2',
        'outputByRecipe': 'qr_code_2',
        'inputByBarcode': 'input',
        'inputByRecipe': 'input'
    };

    document.querySelectorAll('.context-menu-item').forEach(item => {
        const action = item.dataset.action;
        if (action && actionIcons[action] && !item.querySelector('.context-menu-item-icon')) {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'material-symbols-outlined context-menu-item-icon';
            iconSpan.textContent = actionIcons[action];
            item.prepend(iconSpan);
        }
    });
}

// ===== TABLE SKELETON LOADING HELPER =====
function showTableSkeleton(columnsCount = 6, rowsCount = 5, targetTbodyId = 'tableBody') {
    const tbody = typeof targetTbodyId === 'string' ? document.getElementById(targetTbodyId) : targetTbodyId;
    if (!tbody) return;

    const placeholder = document.getElementById('tableStandbyPlaceholder');
    if (placeholder) {
        placeholder.classList.add('has-data');
        placeholder.style.display = 'none';
    }

    const tableContainer = tbody.closest('.table-container') || document.querySelector('.table-container');
    if (tableContainer) {
        tableContainer.classList.remove('hidden');
        tableContainer.style.display = '';
    }

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

        // Prevent browser/manager autofill popups cleanly via attributes without blocking virtual keyboards
        if (!input.dataset.autofillGuarded) {
            input.dataset.autofillGuarded = 'true';

            // Ensure input is not artificially locked to readOnly so mobile keyboards (iOS Safari / Android) appear immediately
            if (input.readOnly && !input.hasAttribute('readonly')) {
                input.readOnly = false;
            }
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
    const removeLoading = () => {
        document.body.classList.remove('app-loading-state');
    };

    // Remove loading state as soon as this frame's own DOM is ready
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(removeLoading, 150);
    } else {
        window.addEventListener('DOMContentLoaded', () => setTimeout(removeLoading, 150));
        window.addEventListener('load', removeLoading);
    }

    // Safety fallback timer: guarantee interactive state after max 800ms
    setTimeout(removeLoading, 800);

    // 1. Check if top window already marked all pages as loaded
    try {
        if (window.top && window.top.__kd_all_pages_loaded) {
            removeLoading();
            return;
        }
    } catch (e) {}

    // 2. Listen for broadcast from spa_shell
    window.addEventListener('message', (e) => {
        if (e.data && (e.data.type === 'SPA_ALL_PAGES_LOADED' || e.data.type === 'PRISMA_INTRO_FINISHED')) {
            removeLoading();
        }
    });
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
                    const currentVal = mainTable.style.getPropertyValue('--col-1-width');
                    const newVal = `${width}px`;
                    if (currentVal !== newVal) {
                        mainTable.style.setProperty('--col-1-width', newVal);
                    }
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
                    const currentVal = outputTable.style.getPropertyValue('--output-col-1-width');
                    const newVal = `${width}px`;
                    if (currentVal !== newVal) {
                        outputTable.style.setProperty('--output-col-1-width', newVal);
                    }
                }
            }
        }
        // Sub Output Barcode Table
        const subOutputTable = document.querySelector('#subOutputBarcodeTable');
        if (subOutputTable) {
            const firstTh = subOutputTable.querySelector('thead th:first-child');
            if (firstTh) {
                const width = firstTh.getBoundingClientRect().width || firstTh.offsetWidth;
                if (width > 0) {
                    const currentVal = subOutputTable.style.getPropertyValue('--sub-output-col-1-width');
                    const newVal = `${width}px`;
                    if (currentVal !== newVal) {
                        subOutputTable.style.setProperty('--sub-output-col-1-width', newVal);
                    }
                }
            }
        }
    });
}
window.updateTableStickyOffsets = updateTableStickyOffsets;

let _stickySyncDebounceTimer = null;
function initTableStickySync() {
    window.addEventListener('resize', () => {
        if (_stickySyncDebounceTimer) clearTimeout(_stickySyncDebounceTimer);
        _stickySyncDebounceTimer = setTimeout(updateTableStickyOffsets, 80);
    }, { passive: true });

    document.addEventListener('density:changed', updateTableStickyOffsets);
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
    const redirectCode = "try{sessionStorage.clear();localStorage.removeItem('kd_departments_cache');}catch(e){};(window.top||window).location.href='/login';";

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
                <button type="button" class="kd-auth-expired-btn" id="kdAuthLoginRedirectBtn" onclick="${redirectCode}">
                    <span class="material-symbols-outlined" style="pointer-events: none;">login</span>
                    <span style="pointer-events: none;">Đăng nhập lại ngay</span>
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
        try {
            sessionStorage.clear();
            localStorage.removeItem('kd_departments_cache');
        } catch (e) {}
        try {
            if (window.top && window.top.location) {
                window.top.location.href = '/login';
                return;
            }
        } catch (e) {}
        try {
            window.location.href = '/login';
        } catch (e) {}
    };

    if (redirectBtn) {
        setTimeout(() => {
            try { redirectBtn.focus(); } catch (e) {}
        }, 50);

        redirectBtn.onclick = function(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            doRedirect();
            return false;
        };

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

    const keyHandler = (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
            e.preventDefault();
            doRedirect();
        }
    };

    try {
        topWin.addEventListener('keydown', keyHandler, true);
    } catch (e) {}
    window.addEventListener('keydown', keyHandler, true);
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
        // 1. If already fetched and cached in top window's in-memory lifetime, return it immediately
        if (topWin.__kd_departments && Array.isArray(topWin.__kd_departments) && topWin.__kd_departments.length > 0 && (topWin.__kd_departments[0]?.id || topWin.__kd_departments[0]?.departmentId)) {
            departments = topWin.__kd_departments;
            window.departments = topWin.__kd_departments;
            return topWin.__kd_departments;
        }

        // 2. Deduplicate concurrent in-flight requests across iframes/modules during page load
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
                showAuthExpiredModal(result?.message);
                return [];
            }

            if (result && result.error) {
                console.error('Error from /api/departments:', result.message);
                return [];
            }

            const items = (result && result.data) || [];
            const depts = items.map(item => {
                const idVal = String(
                    item.departmentId ||
                    item.departmentID ||
                    item.id ||
                    item.department ||
                    (typeof item === 'string' ? item : '') ||
                    ''
                ).trim();
                return {
                    id: idVal,
                    departmentId: idVal,
                    departmentID: idVal
                };
            }).filter(d => d.id !== '');

            topWin.__kd_departments = depts;
            departments = depts;
            window.departments = depts;

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

let _lastBarcodeSwitchTime = 0;
function switchBarcodeMode(targetMode, focus = true) {
    const now = Date.now();
    if (!targetMode && now - _lastBarcodeSwitchTime < 200) return;
    _lastBarcodeSwitchTime = now;

    const barcodeSwitcher = document.getElementById('mainInputSwitcher');
    const barcodeToggleBtn = document.getElementById('toggleInputModeBtn');
    const barcodeToggleLabel = document.getElementById('toggleModeLabel');
    const barcodeInput = document.getElementById('barcode');
    const feedRecordInput = document.getElementById('feed_record_id');
    if (!barcodeSwitcher) return;

    const currentMode = barcodeSwitcher.dataset.activeMode || 'barcode';
    const newMode = targetMode || (currentMode === 'barcode' ? 'feed_record' : 'barcode');

    barcodeSwitcher.dataset.activeMode = newMode;

    if (newMode === 'barcode') {
        if (barcodeToggleBtn) barcodeToggleBtn.title = 'Chuyển sang tìm kiếm theo Lịch sử hao dùng (Feed Record)';
        if (barcodeToggleLabel) barcodeToggleLabel.textContent = 'Feed Record';
        if (focus && barcodeInput) {
            setTimeout(() => barcodeInput.focus(), 60);
        }
    } else {
        if (barcodeToggleBtn) barcodeToggleBtn.title = 'Chuyển sang tìm kiếm theo Tem / Barcode';
        if (barcodeToggleLabel) barcodeToggleLabel.textContent = 'Barcode';
        if (focus && feedRecordInput) {
            setTimeout(() => feedRecordInput.focus(), 60);
        }
    }
}
window.switchBarcodeMode = switchBarcodeMode;
window.switchMainInputMode = switchBarcodeMode;

let _lastRecipeSwitchTime = 0;
function switchRecipeMode(targetMode, focus = true) {
    const now = Date.now();
    if (!targetMode && now - _lastRecipeSwitchTime < 200) return;
    _lastRecipeSwitchTime = now;

    const recipeSwitcher = document.getElementById('recipeInputSwitcher');
    const recipeToggleBtn = document.getElementById('toggleRecipeModeBtn');
    const recipeToggleLabel = document.getElementById('toggleRecipeModeLabel');
    const productInput = document.getElementById('product_id');
    const workOrderInput = document.getElementById('work_order');
    if (!recipeSwitcher) return;

    const currentMode = recipeSwitcher.dataset.activeMode || 'recipe';
    const newMode = targetMode || (currentMode === 'recipe' ? 'work_order' : 'recipe');

    recipeSwitcher.dataset.activeMode = newMode;

    if (newMode === 'recipe') {
        if (recipeToggleBtn) recipeToggleBtn.title = 'Chuyển sang tìm kiếm theo Đơn điều động (Work Order)';
        if (recipeToggleLabel) recipeToggleLabel.textContent = 'Work Order';
        if (focus && productInput) {
            setTimeout(() => productInput.focus(), 60);
        }
    } else {
        if (recipeToggleBtn) recipeToggleBtn.title = 'Chuyển sang tìm kiếm theo Quy cách / Recipe';
        if (recipeToggleLabel) recipeToggleLabel.textContent = 'Recipe';
        if (focus && workOrderInput) {
            setTimeout(() => workOrderInput.focus(), 60);
        }
    }
}
window.switchRecipeMode = switchRecipeMode;

function initMainInputSwitcher() {
    // 1. Barcode ⇋ Feed Record Switcher
    const barcodeToggleBtn = document.getElementById('toggleInputModeBtn');
    if (barcodeToggleBtn && !barcodeToggleBtn._boundSwitch) {
        barcodeToggleBtn._boundSwitch = true;
        barcodeToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            switchBarcodeMode();
        });
    }

    // 2. Recipe ⇋ Work Order Switcher
    const recipeToggleBtn = document.getElementById('toggleRecipeModeBtn');
    if (recipeToggleBtn && !recipeToggleBtn._boundSwitch) {
        recipeToggleBtn._boundSwitch = true;
        recipeToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            switchRecipeMode();
        });
    }

    // 3. Ensure tapping anywhere on active switch items immediately focuses the input
    document.querySelectorAll('.input-switcher-container .input-switch-item').forEach(item => {
        if (!item._switchClickBound) {
            item._switchClickBound = true;
            item.addEventListener('click', (e) => {
                const clear = item.querySelector('.clear-btn');
                if (clear && (e.target === clear || clear.contains(e.target))) return;
                const inp = item.querySelector('.input');
                if (inp && e.target !== inp && !inp.disabled && !inp.readOnly) {
                    inp.focus();
                }
            });
        }
    });
}

function initializeMainEventListeners() {
    // ===== MAIN PAGE INPUT SWITCHERS (BARCODE ⇋ FEED RECORD, RECIPE ⇋ WORK ORDER) =====
    initMainInputSwitcher();

    // ===== MAIN PAGE INPUTS =====
    const barcodeInput = document.getElementById('barcode');
    const productInput = document.getElementById('product_id');
    const feedRecordInput = document.getElementById('feed_record_id');
    const workOrderInput = document.getElementById('work_order');

    if (barcodeInput && !document.body.classList.contains('material-transfer')) {
        barcodeInput.addEventListener(
            'input',
            debounceSearch(searchBarcode, 500)
        );

        barcodeInput.addEventListener('input', e => {
            e.target.value = e.target.value.toUpperCase();
            if (productInput) clearInputBox(productInput);
            if (feedRecordInput) clearInputBox(feedRecordInput);
            if (workOrderInput) clearInputBox(workOrderInput);
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
            if (workOrderInput) clearInputBox(workOrderInput);
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
            if (workOrderInput) clearInputBox(workOrderInput);
            if (e.target.value.trim()) {
                showTableSkeleton(10, 5);
            } else {
                clearTable();
            }
        });
    }

    if (workOrderInput) {
        workOrderInput.addEventListener(
            'input',
            debounceSearch(searchWorkOrders, 500)
        );

        workOrderInput.addEventListener('input', e => {
            e.target.value = e.target.value.toUpperCase();
            if (barcodeInput) clearInputBox(barcodeInput);
            if (productInput) clearInputBox(productInput);
            if (feedRecordInput) clearInputBox(feedRecordInput);
            if (e.target.value.trim()) {
                showTableSkeleton(10, 5);
            } else {
                clearTable();
            }
        });
    }

    // ===== MODAL CLOSE BUTTONS =====
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', function () {
            const modal = this.closest('.modal');
            if (modal) modal.style.display = 'none';
        });
    });

    // ===== TABLE EVENTS (DESKTOP & TOUCH MOBILE) =====
    const tableBody = document.getElementById('tableBody');
    if (tableBody) {
        tableBody.addEventListener('click', handleRowClick);
        tableBody.addEventListener('dblclick', handleRowDoubleClick);
        tableBody.addEventListener('contextmenu', (e) => {
            if (!isContextMenuAllowedOnCurrentPage()) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
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

    // ===== UNIVERSAL TOUCH INTERACTION ENGINE (DOUBLE-TAP & LONG-PRESS FOR ALL TABLES) =====
    initUniversalTableTouchGestures();

    // ===== SUB OUTPUT TABLE EVENTS =====
    const subOutputContainer = document.getElementById('subOutputContainer');
    if (subOutputContainer) {
        subOutputContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });
    }

    const subOutputTableBody = document.getElementById('subOutputBarcodeTableBody');
    if (subOutputTableBody) {
        subOutputTableBody.addEventListener('click', handleSubOutputRowClick);
        subOutputTableBody.addEventListener('dblclick', handleSubOutputRowDoubleClick);
        subOutputTableBody.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });
    }

    document.addEventListener('contextmenu', (e) => {
        const subContainer = document.getElementById('subOutputContainer');
        if (subContainer && subContainer.contains(e.target)) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }, true);

    // ===== CONTEXT MENU =====
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) {
        contextMenu.addEventListener('click', (e) => {
            const item = e.target.closest('.context-menu-item');
            if (item && item.style.display !== 'none') {
                handleContextMenuAction(e);
            }
        });

        contextMenu.addEventListener('touchend', (e) => {
            const item = e.target.closest('.context-menu-item');
            if (item && item.style.display !== 'none') {
                if (e.cancelable) e.preventDefault();
                handleContextMenuAction(e);
            }
        });
    }

    enhanceContextMenu();
}

function debounce(func, delay = 300) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}
window.debounce = debounce;
window.debounceSearch = debounce;

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

        if (!response.ok || (data && data.success === false)) {
            Toast.error('Lỗi kết nối cơ sở dữ liệu', (data && data.message) ? data.message : `Lỗi kết nối cơ sở dữ liệu (${response.status})`);
            clearTable();
            return;
        }

        if (data && Array.isArray(data.result)) {
            if (data.resolved_barcode && document.getElementById('barcode') && document.getElementById('barcode').value.trim() !== data.resolved_barcode) {
                document.getElementById('barcode').value = data.resolved_barcode;
            }
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

        if (!response.ok || (data && data.success === false)) {
            Toast.error('Lỗi kết nối cơ sở dữ liệu', (data && data.message) ? data.message : `Lỗi kết nối cơ sở dữ liệu (${response.status})`);
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

        if (!response.ok || (data && data.success === false)) {
            Toast.error('Lỗi kết nối cơ sở dữ liệu', (data && data.message) ? data.message : `Lỗi kết nối cơ sở dữ liệu (${response.status})`);
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

async function searchWorkOrders() {
    closeShowBarcodeWindow();
    const keyword = document.getElementById('work_order').value.trim();
    if (!keyword) {
        clearTable();
        return;
    }

    showTableSkeleton(10, 5);

    try {
        const response = await fetch('/api/work-orders', {
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

        if (!response.ok || (data && data.success === false)) {
            Toast.error('Lỗi kết nối cơ sở dữ liệu', (data && data.message) ? data.message : `Lỗi kết nối cơ sở dữ liệu (${response.status})`);
            clearTable();
            return;
        }

        if (data && Array.isArray(data.result)) {
            setTableData(data.result, data.columns, 'work_order', `Không tìm thấy đơn điều động nào với từ khóa "${keyword}"`);
        } else {
            setTableData([], data ? data.columns : [], 'work_order', `Không tìm thấy đơn điều động nào với từ khóa "${keyword}"`);
        }
    } catch (error) {
        console.error('Error searching work orders:', error);
        Toast.error('Lỗi', 'Lỗi kết nối khi tìm kiếm Đơn điều động');
        clearTable();
    }
}

/**
 * Trích xuất thông tin recipe_id và product_type từ rowData của bảng Recipes (cả Database và YAML mode)
 */
function getRecipeInfoFromRow(dataObj) {
    if (!dataObj) return { recipe_id: null, product_type: null, fileName: null, filePath: null };
    let recipe_id = dataObj.recipe_id || dataObj['recipe_id'] || null;
    let product_type = dataObj.product_type || dataObj['product_type'] || dataObj['Phân loại'] || null;
    const fileName = dataObj['Tên file'] || dataObj.file_name || null;
    const filePath = dataObj['Đường dẫn'] || dataObj.file_path || dataObj.path || null;

    if (!recipe_id && fileName) {
        recipe_id = fileName.replace(/\.ya?ml$/i, '').trim();
    }

    if (!product_type && filePath) {
        const match = filePath.match(/yamls\/([^/]+)/i);
        if (match && match[1]) {
            product_type = match[1].toUpperCase().replace(/-/g, '_');
        }
    }

    if (!product_type && window._currentYamlSearchProject) {
        const pId = Number(window._currentYamlSearchProject);
        if (pId === 133) product_type = 'GREEN_TIRE';
        else if (pId === 134) product_type = 'TIRE';
        else if (pId === 136) product_type = 'MIXING';
    }

    return { recipe_id, product_type, fileName, filePath };
}

async function searchRecipeYamlFiles(keyword, projectId = 135, projectName = 'GitLab') {
    closeShowBarcodeWindow();
    if (!keyword) {
        Toast.warning('Cảnh báo', 'Vui lòng nhập từ khóa quy cách cần tìm kiếm');
        return;
    }

    window._currentYamlSearchProject = projectId;
    showTableSkeleton(4, 5);

    try {
        const data = await apiFetch('/api/recipes/search-yaml-files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword, project_id: projectId })
        });

        if (data && data.success) {
            const results = data.result || [];
            const columns = data.columns || ['Tên file', 'Phân loại', 'Khu vực / Xưởng', 'Đường dẫn'];
            currentTableType = 'recipe';
            setTableData(results, columns, 'recipe', `Không tìm thấy file YAML nào khớp với "${keyword}" ở ${projectName}`, `Đã tìm thấy ${results.length} file YAML ở ${projectName}`);
        } else {
            setTableData([], ['Tên file', 'Phân loại', 'Khu vực / Xưởng', 'Đường dẫn'], 'recipe', (data && data.message) ? data.message : `Không tìm thấy file YAML nào ở ${projectName}`);
        }
    } catch (err) {
        console.error('Error searching YAML files in GitLab:', err);
        Toast.error('Lỗi', err.message || 'Lỗi kết nối khi tìm kiếm file YAML ở GitLab');
        clearTable();
    }
}

function formatPgArrayString(val) {
    if (val === null || val === undefined) {
        return '{}';
    }
    if (typeof val === 'boolean') {
        return '{}';
    }
    if (Array.isArray(val)) {
        const items = val
            .filter(x => x !== null && x !== undefined)
            .map(x => String(x).trim().replace(/^['"]|['"]$/g, ''))
            .filter(x => x.length > 0 && x !== 'null' && x !== 'NULL' && x !== 'None' && x !== '-');
        if (items.length === 0) return '{}';
        return `{${items.join(',')}}`;
    }
    let s = String(val).trim();
    if (!s || s === '-' || s === 'null' || s === 'NULL' || s === 'None') {
        return '{}';
    }
    // Unwrap outer quotes if any (e.g. "'...'" or '"..."')
    while (s.length >= 2 && ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"')))) {
        s = s.slice(1, -1).trim();
    }
    if (!s || s === '-' || s === 'null' || s === 'NULL' || s === 'None') {
        return '{}';
    }
    if (s.startsWith('[') && s.endsWith(']')) {
        try {
            const parsed = JSON.parse(s);
            if (Array.isArray(parsed)) {
                return formatPgArrayString(parsed);
            }
        } catch (e) {}
        const inner = s.slice(1, -1).trim();
        if (!inner) return '{}';
        const elements = inner.split(',')
            .map(e => e.trim().replace(/^['"]|['"]$/g, ''))
            .filter(e => e.length > 0 && e !== 'null' && e !== 'NULL' && e !== 'None');
        return elements.length > 0 ? `{${elements.join(',')}}` : '{}';
    }
    if (s.startsWith('{') && s.endsWith('}')) {
        const inner = s.slice(1, -1).trim();
        if (!inner) return '{}';
        const elements = inner.split(',')
            .map(e => e.trim().replace(/^['"]|['"]$/g, ''))
            .filter(e => e.length > 0 && e !== 'null' && e !== 'NULL' && e !== 'None');
        return elements.length > 0 ? `{${elements.join(',')}}` : '{}';
    }
    // Single bare element
    const cleaned = s.replace(/^['"]|['"]$/g, '').trim();
    if (!cleaned || cleaned === '-' || cleaned === 'null' || cleaned === 'NULL' || cleaned === 'None') {
        return '{}';
    }
    return `{${cleaned}}`;
}
window.formatPgArrayString = formatPgArrayString;

function displayTable(result, columns) {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    const rowCount = document.getElementById('rowCount');

    const placeholder = document.getElementById('tableStandbyPlaceholder');
    if (placeholder) {
        placeholder.classList.add('has-data');
        placeholder.style.display = 'none';
    }

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
        emptyTd.style.padding = '48px 20px';

        // Tùy biến empty state riêng cho tìm kiếm Quy cách / Recipe khi kết quả rỗng ở database
        const isRecipeDbSearch = (currentTableType === 'recipe' && (!columns || !columns.includes('Tên file')));
        if (isRecipeDbSearch) {
            const currentSearchInput = document.getElementById('product_id') ? document.getElementById('product_id').value.trim() : '';
            emptyTd.innerHTML = `
                <div class="recipe-empty-container">
                    <div class="recipe-empty-badge">
                        <span class="material-symbols-outlined" style="font-size: 15px;">database</span>
                        Database Không Có Dữ Liệu
                    </div>
                    <div class="recipe-empty-title">Không tìm thấy quy cách trong cơ sở dữ liệu</div>
                    <div class="recipe-empty-desc">
                        Quy cách <strong>"${escapeHtml(currentSearchInput || 'đang tra cứu')}"</strong> có thể chưa được đồng bộ xuống Database hoặc gặp lỗi cú pháp YAML / CI build trên GitLab.
                    </div>
                    <div class="recipe-yaml-fallback-box">
                        <div class="recipe-yaml-fallback-text">
                            Bạn có muốn chuyển sang tra cứu trực tiếp file trong kho lưu trữ <strong>GitLab</strong> không?
                        </div>
                        <button type="button" id="btnPromptYamlSearch" class="btn-yaml-fallback-search">
                            <span class="material-symbols-outlined">travel_explore</span>
                            Tìm kiếm Quy cách trong YAML GitLab
                        </button>
                    </div>
                </div>
            `;
            const promptBtn = emptyTd.querySelector('#btnPromptYamlSearch');
            if (promptBtn) {
                promptBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const kw = document.getElementById('product_id') ? document.getElementById('product_id').value.trim() : '';
                    Toast.showPersistentYamlSearchToast(kw);
                });
            }
        } else {
            emptyTd.innerHTML = `
                <div class="table-empty-state">
                    <div class="empty-state-icon-wrapper">
                        <span class="material-symbols-outlined empty-state-icon">search_off</span>
                    </div>
                    <div class="empty-state-title">Không có dữ liệu hiển thị</div>
                    <div class="empty-state-desc">Không tìm thấy bản ghi nào khớp với điều kiện tra cứu hoặc dữ liệu dưới hệ thống rỗng.</div>
                </div>
            `;
        }

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
            const colName = (columns && columns.length > cellIndex) ? String(columns[cellIndex]).trim() : '';

            // Format cell value - if it's an object, convert to JSON
            let cellValue = '';
            let fullValue = '';

            if (colName === 'feed_records_id') {
                fullValue = formatPgArrayString(cell);
                cellValue = fullValue;
            } else if (cell !== null && cell !== undefined) {
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

            if (colName === 'feed_records_id') {
                if (!cellValue || cellValue === '-' || cellValue.toLowerCase() === 'null') {
                    cellValue = '{}';
                    fullValue = '{}';
                }
            } else if (cell === null || cell === undefined || cellValue.trim() === '' || cellValue.trim().toLowerCase() === 'null' || cellValue.trim().toLowerCase() === 'undefined') {
                cellValue = '-';
                fullValue = '-';
            }

            const isUrl = String(cellValue).trim().startsWith('http://') || String(cellValue).trim().startsWith('https://') || (columns && columns[cellIndex] && String(columns[cellIndex]).toLowerCase().includes('url'));
            const urlToOpen = String(fullValue || cellValue).trim();

            if (isUrl && (urlToOpen.startsWith('http://') || urlToOpen.startsWith('https://'))) {
                const link = document.createElement('a');
                link.href = urlToOpen;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.className = 'table-cell-url-link';
                link.style.color = '#38bdf8';
                link.style.textDecoration = 'underline';
                link.style.fontWeight = '500';
                link.style.display = 'inline-flex';
                link.style.alignItems = 'center';
                link.style.gap = '4px';
                link.style.cursor = 'pointer';
                link.style.pointerEvents = 'auto';

                const textSpan = document.createElement('span');
                if (cellValue.length > truncateThreshold) {
                    textSpan.textContent = cellValue.substring(0, displayLength) + '...';
                    td.title = fullValue;
                    td.classList.add('truncated-cell');
                } else {
                    textSpan.textContent = cellValue;
                }
                link.appendChild(textSpan);

                const icon = document.createElement('span');
                icon.className = 'material-symbols-outlined';
                icon.style.fontSize = '14px';
                icon.style.lineHeight = '1';
                icon.style.verticalAlign = 'middle';
                icon.style.textDecoration = 'none';
                icon.textContent = 'open_in_new';
                link.appendChild(icon);

                link.addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.open(urlToOpen, '_blank', 'noopener,noreferrer');
                });

                td.appendChild(link);
            } else if (cellValue.length > truncateThreshold) {
                // Only truncate long strings
                td.textContent = cellValue.substring(0, displayLength) + '...';
                td.title = fullValue; // Show full value on hover
                td.classList.add('truncated-cell');
            } else {
                // Display short strings fully
                td.textContent = cellValue;
            }

            // Đổi màu vàng cho cột key ở trang Thông số kỹ thuật nếu key có resource: 2
            if ((currentTableType === 'technical_specifications' || document.body.classList.contains('technical-specifications')) && (colName === 'key' || cellIndex === 0)) {
                if (typeof window.isTechnicalSpecResource2 === 'function' && window.isTechnicalSpecResource2(cellValue)) {
                    td.style.color = '#facc15';
                    td.style.fontWeight = '700';
                    td.title = `${fullValue} (resource: 2 - Giá trị để trống trên tem / Value is blank)`;
                }
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
    closeShowBarcodeWindow();

    const placeholder = document.getElementById('tableStandbyPlaceholder');
    if (placeholder) {
        placeholder.classList.remove('has-data');
        placeholder.style.display = '';
    }



    document.getElementById('tableHead').innerHTML = '';
    document.getElementById('tableBody').innerHTML = '';
    document.getElementById('rowCount').textContent = '0';

    selectedRow = null;
    selectedRowData = null;
    rawTableData = [];
    rawTableColumns = [];
    currentTableType = null;

    updateClientSearchState(false);
    updateVisibleRowCount();
    updateTableStickyOffsets();

    // If on check-qc-data or check-mesync, hide table container and table footer
    if (document.body.classList.contains('check-qc-data') || document.body.classList.contains('check-mesync')) {
        const tableContainer = document.querySelector('.table-container');
        if (tableContainer) {
            tableContainer.classList.add('hidden');
            tableContainer.style.display = 'none';
        }
        const tableFooter = document.querySelector('.table-footer');
        if (tableFooter) {
            tableFooter.classList.add('hidden');
            tableFooter.style.display = 'none';
        }
    }
}

function isContextMenuAllowedOnCurrentPage() {
    // Explicitly block all sub-pages that must NEVER have a context menu
    if (document.body.classList.contains('station-configuration') ||
        document.body.classList.contains('scan-history-page') ||
        document.body.classList.contains('substitutions') ||
        document.body.classList.contains('reprint') ||
        document.body.classList.contains('material-transfer') ||
        document.body.classList.contains('check-qc-data') ||
        document.body.classList.contains('check-mesync') ||
        document.body.classList.contains('technical-specifications') ||
        document.body.classList.contains('check-kd-account') ||
        document.body.classList.contains('create-kd-account') ||
        document.body.classList.contains('gitlab-deleted-files') ||
        document.body.classList.contains('postgres-deleted-data')) {
        return false;
    }

    // 1. Only allow on Validate Scan Barcode page
    const isValidatePage = document.body.classList.contains('validate-scan-barcode') || 
                           document.body.classList.contains('validate-scan-barcode-page') ||
                           window.location.pathname.includes('validate-scan-barcode');
    if (isValidatePage) return 'validate';

    // 2. Only allow on Main page
    const isMainPage = document.body.classList.contains('main-page') || 
                       !!document.getElementById('mainInputSwitcher') || 
                       (!!document.getElementById('barcode') && !!document.getElementById('product_id')) ||
                       window.location.pathname === '/main' || 
                       window.location.pathname === '/';
    if (isMainPage) return 'main';

    // All other pages: NO context menu
    return false;
}

/**
 * Universal Touch & Pointer Interaction Engine: Double-tap & Long-press (Touch) 
 * + Double-click & Right-click (Desktop) for ALL table containers across system
 */
function initUniversalTableTouchGestures() {
    if (window._universalTableTouchGesturesInitialized) return;
    window._universalTableTouchGesturesInitialized = true;

    const tableRowSelector = '.table-container tbody tr, #tableBody tr, #outputBarcodeTableBody tr, #subOutputBarcodeTableBody tr, #checkAccountTableBody tr, #scanBarcodeTableBody tr';

    // 1. UNIVERSAL DESKTOP DOUBLE-CLICK (Left Double-Click -> View Details Modal)
    document.addEventListener('dblclick', (e) => {
        const tr = e.target.closest(tableRowSelector);
        if (!tr || tr.querySelector('.table-empty-state') || tr.classList.contains('skeleton-row')) return;
        if (document.body.classList.contains('switching-spell-page')) return;

        // Sub output container -> showSubOutputDetails
        const subContainer = document.getElementById('subOutputContainer');
        if (subContainer && subContainer.contains(tr)) {
            if (typeof handleSubOutputRowClick === 'function') handleSubOutputRowClick({ target: tr });
            if (typeof handleSubOutputRowDoubleClick === 'function') {
                handleSubOutputRowDoubleClick({ target: tr });
            } else if (typeof showSubOutputDetails === 'function') {
                showSubOutputDetails();
            }
            return;
        }

        // Output container -> showOutputDetails
        const tbody = tr.closest('tbody');
        const isOutput = tbody && tbody.id === 'outputBarcodeTableBody';
        if (isOutput) {
            if (typeof handleOutputRowClick === 'function') handleOutputRowClick({ target: tr });
            if (typeof handleOutputRowDoubleClick === 'function') {
                handleOutputRowDoubleClick({ target: tr });
            } else if (typeof showOutputDetails === 'function') {
                showOutputDetails();
            }
            return;
        }

        // Main table container -> showDetails
        if (typeof handleRowClick === 'function') handleRowClick({ target: tr });
        if (typeof handleRowDoubleClick === 'function') {
            handleRowDoubleClick({ target: tr });
        } else if (typeof showDetails === 'function') {
            showDetails();
        }
    });

    // 2. UNIVERSAL DESKTOP RIGHT-CLICK (Context Menu)
    document.addEventListener('contextmenu', (e) => {
        const tr = e.target.closest(tableRowSelector);
        if (!tr || tr.querySelector('.table-empty-state') || tr.classList.contains('skeleton-row')) return;
        
        // Strict page check: only show context menu if page actually supports it (matches desktop)
        const pageMenuType = isContextMenuAllowedOnCurrentPage();
        if (!pageMenuType) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }

        // Sub output container NEVER has context menu on desktop or mobile
        const subContainer = document.getElementById('subOutputContainer');
        if (subContainer && subContainer.contains(tr)) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }

        e.preventDefault();
        const tbody = tr.closest('tbody');
        const isOutput = tbody && tbody.id === 'outputBarcodeTableBody';
        handleContextMenuUnified(e, isOutput ? 'output' : 'main');
    });

    // 3. UNIVERSAL MOBILE TOUCH GESTURES (Double-tap & Long-press)
    let touchStartTargetTr = null;
    let touchStartPos = { x: 0, y: 0 };
    let touchStartTime = 0;
    let longPressTimer = null;
    let lastTapTime = 0;
    let lastTapRow = null;
    let isLongPressTriggered = false;

    document.addEventListener('touchstart', (e) => {
        const tr = e.target.closest(tableRowSelector);
        if (!tr || tr.querySelector('.table-empty-state') || tr.classList.contains('skeleton-row')) {
            clearTimeout(longPressTimer);
            touchStartTargetTr = null;
            isLongPressTriggered = false;
            return;
        }

        const touch = e.touches[0];
        touchStartTargetTr = tr;
        touchStartPos = { x: touch.clientX, y: touch.clientY };
        touchStartTime = Date.now();
        isLongPressTriggered = false;

        clearTimeout(longPressTimer);

        // Strict page check: do not start long-press context menu timer if page has no context menu
        const pageMenuType = isContextMenuAllowedOnCurrentPage();
        if (!pageMenuType) {
            return;
        }

        // Sub output container NEVER opens context menu (matches desktop right-click ban)
        const subContainer = document.getElementById('subOutputContainer');
        if (subContainer && subContainer.contains(tr)) {
            return;
        }

        longPressTimer = setTimeout(() => {
            isLongPressTriggered = true;
            const tbody = tr.closest('tbody');
            const isOutput = tbody && tbody.id === 'outputBarcodeTableBody';
            
            if (isOutput && typeof handleOutputRowClick === 'function') {
                handleOutputRowClick({ target: tr });
            } else if (typeof handleRowClick === 'function') {
                handleRowClick({ target: tr });
            }

            handleContextMenuUnified({
                preventDefault: () => {},
                stopPropagation: () => {},
                clientX: touchStartPos.x,
                clientY: touchStartPos.y,
                target: tr
            }, isOutput ? 'output' : 'main');

            try { navigator.vibrate?.(40); } catch (_) {}
        }, 420);
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!touchStartTargetTr) return;
        const touch = e.touches[0];
        if (Math.hypot(touch.clientX - touchStartPos.x, touch.clientY - touchStartPos.y) > 10) {
            clearTimeout(longPressTimer);
        }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        clearTimeout(longPressTimer);

        // If touch did not originate on a table row, do not intervene or prevent clicks
        if (!touchStartTargetTr) {
            return;
        }

        const tr = touchStartTargetTr;
        touchStartTargetTr = null;

        // If this touchend is lifting finger from the long-press:
        if (isLongPressTriggered) {
            isLongPressTriggered = false;
            if (e.cancelable) e.preventDefault();
            return;
        }

        const touch = e.changedTouches ? e.changedTouches[0] : null;
        if (touch && Math.hypot(touch.clientX - touchStartPos.x, touch.clientY - touchStartPos.y) > 15) {
            return; // Finger dragged/scrolled
        }

        const currentTime = Date.now();
        const tapDuration = currentTime - touchStartTime;

        if (tapDuration < 320) {
            const timeSinceLastTap = currentTime - lastTapTime;
            if (timeSinceLastTap < 350 && lastTapRow === tr) {
                // DOUBLE TAP DETECTED!
                if (e.cancelable) e.preventDefault();
                lastTapTime = 0;
                lastTapRow = null;
                try { navigator.vibrate?.(25); } catch (_) {}

                // Sub output container -> showSubOutputDetails
                const subContainer = document.getElementById('subOutputContainer');
                if (subContainer && subContainer.contains(tr)) {
                    if (typeof handleSubOutputRowClick === 'function') handleSubOutputRowClick({ target: tr });
                    if (typeof handleSubOutputRowDoubleClick === 'function') {
                        handleSubOutputRowDoubleClick({ target: tr });
                    } else if (typeof showSubOutputDetails === 'function') {
                        showSubOutputDetails();
                    }
                    tr.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
                    return;
                }

                // Output container -> showOutputDetails
                const tbody = tr.closest('tbody');
                const isOutput = tbody && tbody.id === 'outputBarcodeTableBody';
                if (isOutput) {
                    if (typeof handleOutputRowClick === 'function') handleOutputRowClick({ target: tr });
                    if (typeof handleOutputRowDoubleClick === 'function') {
                        handleOutputRowDoubleClick({ target: tr });
                    } else if (typeof showOutputDetails === 'function') {
                        showOutputDetails();
                    }
                    tr.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
                    return;
                }

                // Main table container -> showDetails
                if (typeof handleRowClick === 'function') handleRowClick({ target: tr });
                if (typeof handleRowDoubleClick === 'function') {
                    handleRowDoubleClick({ target: tr });
                } else if (typeof showDetails === 'function') {
                    showDetails();
                }
                tr.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
                return;
            }
            lastTapTime = currentTime;
            lastTapRow = tr;
        }
    }, { passive: false });

    document.addEventListener('touchcancel', () => {
        clearTimeout(longPressTimer);
        touchStartTargetTr = null;
        isLongPressTriggered = false;
    }, { passive: true });
}

/**
 * Universal Row Data Normalizer
 * Guarantees lowercase and canonical field aliases (id, barcode, product_id, product_type, recipe_id, work_order, info)
 * so context menu actions succeed regardless of backend casing or column translations.
 */
function normalizeRowData(rawData) {
    if (!rawData || typeof rawData !== 'object') return {};
    const normalized = { ...rawData };
    
    Object.keys(rawData).forEach(key => {
        const val = rawData[key];
        if (val === undefined || val === null) return;
        const lowerKey = key.toLowerCase().trim();
        if (normalized[lowerKey] === undefined) {
            normalized[lowerKey] = val;
        }

        // Canonical ID / Barcode alias
        if (['id', 'barcode', 'mã tem', 'ma tem', 'mã nvl', 'ma nvl', 'resource_id'].includes(lowerKey)) {
            if (!normalized.id) normalized.id = val;
            if (!normalized.barcode) normalized.barcode = val;
            if (!normalized.resource_id) normalized.resource_id = val;
        }

        // Canonical Product / Recipe alias
        if (['product_id', 'productid', 'mã quy cách', 'ma quy cach', 'quy cách', 'quy cach', 'recipe_id', 'recipeid'].includes(lowerKey)) {
            if (!normalized.product_id) normalized.product_id = val;
            if (!normalized.recipe_id) normalized.recipe_id = val;
        }

        // Canonical Product Type alias
        if (['product_type', 'producttype', 'loại nvl', 'loai nvl', 'product_category'].includes(lowerKey)) {
            if (!normalized.product_type) normalized.product_type = val;
        }

        // Canonical Work Order alias
        if (['work_order', 'workorder', 'mã đơn', 'ma don', 'đơn điều động', 'don dieu dong'].includes(lowerKey)) {
            if (!normalized.work_order) normalized.work_order = val;
        }

        // Canonical Info alias
        if (['info', 'thông tin', 'thong tin'].includes(lowerKey)) {
            if (!normalized.info) normalized.info = val;
        }

        // Canonical Feed Records ID alias
        if (['feed_records_id', 'feedrecordsid'].includes(lowerKey)) {
            if (!normalized.feed_records_id) normalized.feed_records_id = val;
        }
    });

    return normalized;
}
window.normalizeRowData = normalizeRowData;

function handleRowClick(e) {
    const row = (e && e.target) ? e.target.closest('tr') : (selectedRow || null);
    if (!row || row.querySelector('.table-empty-state') || row.classList.contains('skeleton-row')) return;

    // Remove previous selection
    const tbody = row.closest('tbody');
    if (tbody) {
        tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
    } else {
        document.querySelectorAll('#tableBody tr, .table-container tbody tr').forEach(r => r.classList.remove('selected'));
    }

    // Add selection to current row
    row.classList.add('selected');
    selectedRow = row;

    // Get row data - use fullValue from data attribute if available
    const cells = row.querySelectorAll('td');
    const table = row.closest('table');
    const columns = table ? Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim()) : Array.from(document.querySelectorAll('#tableHead th')).map(th => th.textContent.trim());
    const rawData = {};
    if (columns.length > 0) {
        columns.forEach((col, index) => {
            const cell = cells[index];
            const fullValue = cell?.dataset.fullValue;
            rawData[col] = fullValue !== undefined ? fullValue : (cell?.textContent.trim() || '');
        });
    } else {
        cells.forEach((cell, index) => {
            rawData[`col_${index}`] = cell.dataset.fullValue || cell.textContent.trim();
        });
    }

    selectedRowData = normalizeRowData(rawData);
    window.selectedRowData = selectedRowData;
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
    const table = row.closest('table');
    const columns = table ? Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim()) : Array.from(document.querySelectorAll('#outputBarcodeTable thead th')).map(th => th.textContent.trim());
    const rawData = {};
    columns.forEach((col, index) => {
        const cell = cells[index];
        const fullValue = cell?.dataset.fullValue;
        rawData[col] = fullValue !== undefined ? fullValue : (cell?.textContent || '');
    });

    selectedOutputRowData = normalizeRowData(rawData);
    window.selectedOutputRowData = selectedOutputRowData;
}

function handleRowDoubleClick(e) {
    const row = e.target.closest('tr');
    if (!row || row.querySelector('.table-empty-state') || row.classList.contains('skeleton-row')) return;
    if (document.body.classList.contains('switching-spell-page')) return;

    handleRowClick(e);
    showDetails();
}

function handleOutputRowDoubleClick(e) {
    const row = e.target.closest('tr');
    if (!row || row.querySelector('.table-empty-state') || row.classList.contains('skeleton-row')) return;

    handleOutputRowClick(e);
    showOutputDetails();
}

function handleSubOutputRowClick(e) {
    const row = e.target.closest('tr');
    if (!row || row.querySelector('.table-empty-state') || row.classList.contains('skeleton-row')) return;

    // Remove previous selection
    document.querySelectorAll('#subOutputBarcodeTableBody tr').forEach(r => r.classList.remove('selected'));

    // Add selection to current row
    row.classList.add('selected');
    selectedSubOutputRow = row;

    // Get row data
    const cells = row.querySelectorAll('td');
    const columns = Array.from(document.querySelectorAll('#subOutputBarcodeTable thead th')).map(th => th.textContent);
    const rawData = {};
    columns.forEach((col, index) => {
        const cell = cells[index];
        const fullValue = cell?.dataset.fullValue;
        rawData[col] = fullValue !== undefined ? fullValue : (cell?.textContent || '');
    });

    selectedSubOutputRowData = normalizeRowData(rawData);
    window.selectedSubOutputRowData = selectedSubOutputRowData;
}

function handleSubOutputRowDoubleClick(e) {
    const row = e.target.closest('tr');
    if (!row || row.querySelector('.table-empty-state') || row.classList.contains('skeleton-row')) return;

    handleSubOutputRowClick(e);
    showSubOutputDetails();
}

function showSubOutputDetails() {
    if (!selectedSubOutputRow) return;

    const cells = selectedSubOutputRow.querySelectorAll('td');
    const table = selectedSubOutputRow.closest('table');
    const columns = table 
        ? Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim()).filter(Boolean)
        : Array.from(document.querySelectorAll('#subOutputBarcodeTable thead th')).map(th => th.textContent.trim()).filter(Boolean);

    const fullRowData = {};
    if (columns.length > 0 && columns.length <= cells.length) {
        columns.forEach((col, index) => {
            const cell = cells[index];
            fullRowData[col] = cell?.dataset.fullValue !== undefined ? cell.dataset.fullValue : (cell?.textContent?.trim() || '');
        });
    } else if (selectedSubOutputRowData && Object.keys(selectedSubOutputRowData).length > 0) {
        Object.assign(fullRowData, selectedSubOutputRowData);
    } else {
        cells.forEach((cell, index) => {
            fullRowData[`Cột ${index + 1}`] = cell?.dataset.fullValue !== undefined ? cell.dataset.fullValue : (cell?.textContent?.trim() || '');
        });
    }

    showDetailsModal(fullRowData);
}

// ===== CONTEXT MENU =====

let currentContextMenuTableType = 'main';

/**
 * Unified context menu handler
 * @param {Event|Object} e - Context menu event or synthetic position object
 * @param {string} tableType - 'main' | 'output'
 */
function handleContextMenuUnified(e, tableType = 'main') {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    
    // Strict page check: only allow on pages that actually support context menu (Validate Scan Barcode & Main)
    const pageMenuType = isContextMenuAllowedOnCurrentPage();
    if (!pageMenuType) {
        const contextMenu = document.getElementById('contextMenu');
        if (contextMenu) contextMenu.style.display = 'none';
        return false;
    }

    const row = (e && e.target) ? e.target.closest('tr') : (tableType === 'main' ? selectedRow : selectedOutputRow);
    if (!row || row.querySelector('.table-empty-state') || row.classList.contains('skeleton-row')) return false;

    // Sub output container NEVER opens context menu (matches desktop right-click ban)
    const subContainer = document.getElementById('subOutputContainer');
    if (subContainer && subContainer.contains(row)) {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        return false;
    }

    currentContextMenuTableType = tableType;

    // Select row based on table type
    if (tableType === 'main') {
        handleRowClick(e);
    } else {
        handleOutputRowClick(e);
        // Nếu là bảng outputBarcodeByFeedRecords mà work_order rỗng/null/- thì chặn không mở context menu
        if (currentOutputTableType === 'outputBarcodeByFeedRecords') {
            const wo = selectedOutputRowData ? (selectedOutputRowData.work_order || selectedOutputRowData['work_order']) : null;
            const cleanWo = String(wo || '').trim();
            if (!cleanWo || cleanWo === '-' || cleanWo.toLowerCase() === 'null' || cleanWo.toLowerCase() === 'undefined') {
                const contextMenu = document.getElementById('contextMenu');
                if (contextMenu) contextMenu.style.display = 'none';
                return false;
            }
        }
    }

    let posX = (e && typeof e.clientX === 'number') ? e.clientX : (e && typeof e.pageX === 'number' ? e.pageX : (window.innerWidth / 2));
    let posY = (e && typeof e.clientY === 'number') ? e.clientY : (e && typeof e.pageY === 'number' ? e.pageY : (window.innerHeight / 2));

    showContextMenu(posX, posY, tableType);
}

/**
 * Show context menu at position
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {string} tableType - 'main' | 'output'
 */
function showContextMenu(x, y, tableType = 'main') {
    currentContextMenuTableType = tableType;
    const contextMenu = document.getElementById('contextMenu');
    if (!contextMenu) return;

    // Strict page check
    const pageMenuType = isContextMenuAllowedOnCurrentPage();
    if (!pageMenuType) {
        contextMenu.style.display = 'none';
        return;
    }

    // Update menu items visibility
    let allowedActions = [];
    if (tableType === 'output') {
        allowedActions = updateOutputContextMenu();
    } else {
        allowedActions = updateContextMenu();
    }

    // Don't show menu if no items available
    if (!allowedActions || allowedActions.length === 0) {
        contextMenu.style.display = 'none';
        return;
    }

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    const maxAllowedWidth = Math.min(300, viewportWidth - 20);
    const maxAllowedHeight = Math.min(480, viewportHeight - 24);

    if (typeof hideReprintPrinterSubmenu === 'function') hideReprintPrinterSubmenu(true);

    // Reset styles for clean measurement and ensure it never exceeds viewport
    contextMenu.style.position = 'fixed';
    contextMenu.style.zIndex = '99999';
    contextMenu.style.boxSizing = 'border-box';
    contextMenu.style.setProperty('max-width', maxAllowedWidth + 'px', 'important');
    contextMenu.style.setProperty('max-height', maxAllowedHeight + 'px', 'important');
    contextMenu.style.overflowY = 'auto';
    contextMenu.style.overscrollBehavior = 'contain';
    contextMenu.style.left = '0px';
    contextMenu.style.top = '0px';
    contextMenu.style.display = 'block';
    
    const menuRect = contextMenu.getBoundingClientRect();
    const menuWidth = Math.min(maxAllowedWidth, menuRect.width || 220);
    const menuHeight = Math.min(maxAllowedHeight, menuRect.height || 300);

    let targetX = Number(x) || 10;
    let targetY = Number(y) || 10;

    // 1. Horizontal Placement (Flip left if touch is near right edge or would overflow)
    if (targetX + menuWidth > viewportWidth - 10) {
        const flippedX = targetX - menuWidth;
        if (flippedX >= 10) {
            targetX = flippedX;
        } else {
            targetX = Math.max(10, viewportWidth - menuWidth - 10);
        }
    } else {
        targetX = Math.max(10, targetX);
    }

    // 2. Vertical Placement (Flip upward if touch is near bottom or would overflow)
    if (targetY + menuHeight > viewportHeight - 10) {
        const flippedY = targetY - menuHeight;
        if (flippedY >= 10) {
            targetY = flippedY;
        } else {
            targetY = Math.max(10, viewportHeight - menuHeight - 10);
        }
    } else {
        targetY = Math.max(10, targetY);
    }

    contextMenu.style.left = Math.round(targetX) + 'px';
    contextMenu.style.top = Math.round(targetY) + 'px';
}

/**
 * Update context menu items based on current table type and page context
 * @returns {string[]} Array of allowed actions
 */
function updateContextMenu() {
    const pageMenuType = isContextMenuAllowedOnCurrentPage();
    if (!pageMenuType) {
        setMenuItemsVisibility([]);
        return [];
    }

    if (pageMenuType === 'validate') {
        setMenuItemsVisibility(['validate_scan_barcode']);
        return ['validate_scan_barcode'];
    }

    const isRecipeYaml = (currentTableType === 'recipe' && Array.isArray(rawTableColumns) && rawTableColumns.includes('Tên file') && rawTableColumns.includes('Đường dẫn'));

    // Define menu configurations
    let barcodeActions = [
        'reprintLabelPdf',
        'inputBarcode',
        'feedRecords',
        'checkScanBarcodeHistory',
        'checkBarcodeWorkOrder',
        'mesTracking',
        'checkBarcodeTransfer',
        'checkBarcodeExtendDateTime',
        'fetchOriginalInfo'
    ];

    // Filter out reprintLabelPdf for specific product types
    if (currentTableType === 'barcode') {
        const prodType = String(selectedRowData?.product_type || selectedRowData?.['Loại NVL'] || selectedRowData?.productType || '').trim().toUpperCase();
        const EXCLUDED_REPRINT_PRODUCT_TYPES = [
            'GREEN_TIRE',
            'TIRE',
            'COMPOUNDING_INGREDIENT',
            'RUBBER',
            'ACCELERATOR_INGREDIENT',
            'RETURN_COMPOUND'
        ];
        if (EXCLUDED_REPRINT_PRODUCT_TYPES.includes(prodType)) {
            barcodeActions = barcodeActions.filter(action => action !== 'reprintLabelPdf');
        }
    }

    const menuConfig = {
        'barcode': barcodeActions,
        'recipe': isRecipeYaml ? [
            'searchCommitGitlabByRecipe',
            'searchActionsCommitByRecipe',
            'fetchYamlDetails'
        ] : [
            'searchWorkOrderByRecipe',
            'searchCommitGitlabByRecipe',
            'searchActionsCommitByRecipe',
            'fetchYamlDetails'
        ],
        'work_order': [
            'fetchOutputBarcodeByWorkOrder'
        ]
    };

    let allowedActions = menuConfig[currentTableType] || [];
    setMenuItemsVisibility(allowedActions);
    return allowedActions;
}

/**
 * Update output context menu items based on output table type
 * @returns {string[]} Array of allowed actions
 */
function updateOutputContextMenu() {
    const pageMenuType = isContextMenuAllowedOnCurrentPage();
    if (!pageMenuType) {
        setMenuItemsVisibility([]);
        return [];
    }

    const menuConfig = {
        'workOrderOutputByBarcode': ['outputByBarcode', 'inputByBarcode'],
        'workOrderOutputByRecipe': ['outputByRecipe', 'inputByRecipe'],
        'outputBarcodeByFeedRecords': ['outputBarcodeByFeedRecords']
    };

    let allowedActions = menuConfig[currentOutputTableType] || [];

    // Nếu là bảng 'outputBarcodeByFeedRecords' (Kiểm tra tiêu thụ tem)
    // Chỉ khi cột work_order có dữ liệu hợp lệ (không null, không '-') thì mới mở context menu ('Xem tem đầu ra')
    if (currentOutputTableType === 'outputBarcodeByFeedRecords') {
        const wo = selectedOutputRowData ? (selectedOutputRowData.work_order || selectedOutputRowData['work_order']) : null;
        const cleanWo = String(wo || '').trim();
        if (!cleanWo || cleanWo === '-' || cleanWo.toLowerCase() === 'null' || cleanWo.toLowerCase() === 'undefined') {
            allowedActions = [];
        }
    }

    setMenuItemsVisibility(allowedActions);

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
        const isVisible = Array.isArray(allowedActions) && allowedActions.includes(action);
        item.style.setProperty('display', isVisible ? 'flex' : 'none', 'important');
        if (isVisible && Array.isArray(allowedActions)) {
            item.style.order = allowedActions.indexOf(action);
        }
    });
}

function handleContextMenu(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const row = e.target ? e.target.closest('tr') : null;
    if (!row) return;

    handleRowClick(e);
    handleContextMenuUnified(e, 'main');
}

function handleOutputContextMenu(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const row = e.target ? e.target.closest('tr') : null;
    if (!row) return;

    handleOutputRowClick(e);
    handleContextMenuUnified(e, 'output');
}

let lastContextMenuActionTimestamp = 0;

function handleContextMenuAction(e) {
    const now = Date.now();
    if (now - lastContextMenuActionTimestamp < 250) {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        return;
    }
    lastContextMenuActionTimestamp = now;

    if (e && typeof e.stopPropagation === 'function') {
        e.stopPropagation();
    }

    const item = (e && e.target) ? e.target.closest('.context-menu-item') : null;
    const action = item ? item.dataset.action : null;
    if (!action) return;
      
    // Determine data source table:
    // If context menu was triggered from output table or is an output action, use selectedOutputRowData
    const isOutputTable = currentContextMenuTableType === 'output' || ['outputByBarcode', 'outputByRecipe', 'outputBarcodeByFeedRecords', 'inputByBarcode', 'inputByRecipe'].includes(action);
    let rowData = isOutputTable ? (selectedOutputRowData || selectedRowData) : (selectedRowData || selectedOutputRowData);
    if (!rowData && (selectedRow || selectedOutputRow) && typeof handleRowClick === 'function') {
        const fallbackTarget = isOutputTable ? selectedOutputRow : (selectedRow || selectedOutputRow);
        if (fallbackTarget) {
            handleRowClick({ target: fallbackTarget });
            rowData = isOutputTable ? (selectedOutputRowData || selectedRowData) : (selectedRowData || selectedOutputRowData);
        }
    }
    
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) contextMenu.style.display = 'none';

    if (!rowData) {
        console.warn('[ContextMenu] No rowData available for action:', action);
        return;
    }

    switch (action) {
        case 'validate_scan_barcode':
            if (typeof validateScanBarcode === 'function') {
                validateScanBarcode();
            }
            break;

        // currentTableType === 'barcode'
        case 'inputBarcode':
            if (typeof openOutputTable === 'function') openOutputTable('inputBarcode', rowData);
            break;
        case 'feedRecords':
            if (typeof openOutputTable === 'function') openOutputTable('feedRecords', rowData);
            break;
        case 'checkScanBarcodeHistory':
            if (typeof fetchScanBarcodeHistoryByBarcode === 'function') fetchScanBarcodeHistoryByBarcode(rowData);
            break;
        case 'checkBarcodeWorkOrder':
            if (typeof openOutputTable === 'function') openOutputTable('workOrderByBarcode', rowData);
            break;
        case 'mesTracking':
            if (typeof openMesTrackingModal === 'function') openMesTrackingModal(rowData);
            break;
        case 'checkBarcodeTransfer':
            if (typeof checkBarcodeTransfer === 'function') checkBarcodeTransfer(rowData);
            break;
        case 'checkBarcodeExtendDateTime':
            if (typeof checkBarcodeExtendDateTime === 'function') checkBarcodeExtendDateTime(rowData);
            break;
        case 'fetchOriginalInfo':
            if (typeof openOutputTable === 'function') openOutputTable('fetchOriginalInfoByBarcode', rowData);
            break;
        case 'getPrdeba':
            if (typeof fetchPrde === 'function') fetchPrde('prdeba', rowData);
            break;
        case 'getPrdebb':
            if (typeof fetchPrde === 'function') fetchPrde('prdebb', rowData);
            break;
        case 'getPrdebc':
            if (typeof fetchPrde === 'function') fetchPrde('prdebc', rowData);
            break;
        case 'reprintLabelPdf':
            if (typeof handleReprintLabelPdfClick === 'function') {
                handleReprintLabelPdfClick(rowData);
            } else if (typeof reprintLabelPdf === 'function') {
                reprintLabelPdf(rowData);
            }
            break;

        // currentOutputTableType === 'outputBarcodeByFeedRecords'
        case 'outputBarcodeByFeedRecords':
            if (typeof fetchOutputBarcode === 'function') fetchOutputBarcode(rowData ? (rowData.work_order || rowData.id) : null);
            break;

        // currentTableType === 'recipe'      
        case 'searchWorkOrderByRecipe':
            if (typeof openOutputTable === 'function') openOutputTable('workOrderByRecipe', rowData);
            break;
        case 'searchCommitGitlabByRecipe':
            if (typeof openOutputTable === 'function') openOutputTable('commitGitlabByRecipe', rowData);
            break;
        case 'searchActionsCommitByRecipe':
            if (typeof fetchActionsCommitByRecipe === 'function') fetchActionsCommitByRecipe(rowData);
            break;
        case 'fetchYamlDetails':
            if (typeof fetchYamlContent === 'function') fetchYamlContent(rowData);
            break;

        // currentTableType === 'work_order'
        case 'fetchOutputBarcodeByWorkOrder':
            if (typeof openOutputTable === 'function') openOutputTable('outputBarcodeByWorkOrder', rowData);
            break;
            
        // currentOutputTableType 
        case 'outputByBarcode':
            if (typeof fetchOutputBarcodeByWorkOrder === 'function') fetchOutputBarcodeByWorkOrder('outputByBarcode', rowData);
            break;
        case 'outputByRecipe':
            if (typeof fetchOutputBarcodeByWorkOrder === 'function') fetchOutputBarcodeByWorkOrder('outputByRecipe', rowData);
            break;
        case 'inputByBarcode':
            if (typeof fetchInputBarcodeByWorkOrder === 'function') fetchInputBarcodeByWorkOrder('inputByBarcode', rowData);
            break;
        case 'inputByRecipe':
            if (typeof fetchInputBarcodeByWorkOrder === 'function') fetchInputBarcodeByWorkOrder('inputByRecipe', rowData);
            break;
    }
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
        if (typeof hideReprintPrinterSubmenu === 'function') {
            hideReprintPrinterSubmenu(true);
        }
        focusedItemIndex = -1;
        
        // Remove tất cả highlight
        getVisibleItems().forEach(item => {
            item.classList.remove('context-menu-focused');
            item.style.backgroundColor = '';
            item.style.color = '';
        });
    }

    // Click hoặc chạm ra ngoài để đóng context menu
    document.addEventListener('click', (e) => {
        const reprintSub = document.getElementById('reprintPrinterSubmenu');
        const inSubmenu = reprintSub && reprintSub.contains(e.target);
        if (contextMenu.style.display === 'block' && !contextMenu.contains(e.target) && !inSubmenu) {
            closeContextMenu();
        }
    });

    document.addEventListener('touchstart', (e) => {
        const reprintSub = document.getElementById('reprintPrinterSubmenu');
        const inSubmenu = reprintSub && reprintSub.contains(e.target);
        if (contextMenu.style.display === 'block' && !contextMenu.contains(e.target) && !inSubmenu) {
            closeContextMenu();
        }
    }, { passive: true });

    if (typeof initReprintSubmenuEvents === 'function') {
        initReprintSubmenuEvents();
    }

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

    // 1. Mở outputContainer và thiết lập trạng thái giao diện
    closeSubOutputWindow();
    enterSingleRowMode();

    const container = document.getElementById('outputContainer');
    if (container) container.style.display = 'flex';

    clearOutputBarcodeTable();

    activeSearchContext = 'outputBarcodeByFeedRecords';
    const outputHeaderContentEl = document.getElementById('outputHeaderContent');
    if (outputHeaderContentEl) {
        outputHeaderContentEl.textContent = `Kiểm tra tiêu thụ tem (${material_oid})`;
    }

    showLoading();

    try {
        const data = await apiFetch('/api/barcodes/check-used-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ material_oid, material_type })
        });
        hideLoading();

        if (!data || !data.result || data.result.length === 0) {
            Toast.warning('Không có dữ liệu', 'Barcode chưa quét tem lần nào');
            currentOutputTableType = null;
            renderOutputBarcodeTable([], (data && data.columns) ? data.columns : []);
            return;
        }

        if (data.success) {
            outputBarcodeRawData = data.result;
            outputBarcodeColumns = data.columns;
            currentOutputTableType = 'outputBarcodeByFeedRecords';
            renderOutputBarcodeTable(outputBarcodeRawData, outputBarcodeColumns);
            const hasWO = data.result.some(r => r[0] && r[0] !== '-');
            const msg = hasWO 
                ? `Tìm thấy ${data.result.length} đơn điều động tiêu thụ & bind tem` 
                : `Tìm thấy thông tin bind tem trên trạm (${data.result.length} vị trí)`;
            Toast.success('Thành công', msg);
        } else {
            currentOutputTableType = null;
            renderOutputBarcodeTable([], []);
            Toast.error('Lỗi', data.message || 'Lỗi khi kiểm tra tiêu thụ tem');
        }
    } catch (err) {
        hideLoading();
        renderOutputBarcodeTable([], []);
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
    const resource_id = feed_records_material_id || (selectedOutputRowData ? selectedOutputRowData['id'] : (selectedRowData ? selectedRowData['id'] : null));
    if (!resource_id) {
        Toast.warning('Cảnh báo', 'Thiếu Resource ID');
        return;
    }

    const work_order = workOrder || (selectedOutputRowData ? (selectedOutputRowData['work_order'] || selectedOutputRowData['id']) : (selectedRowData ? (selectedRowData['work_order'] || selectedRowData['id']) : null));
    if (!work_order) {
        Toast.warning('Cảnh báo', 'Thiếu Work Order / MES ID');
        return;
    }

    totalOutputBarcode = (selectedOutputRowData && selectedOutputRowData['total_barcode']) ? selectedOutputRowData['total_barcode'] : ((selectedRowData && selectedRowData['total_barcode']) ? selectedRowData['total_barcode'] : 0);

    // 1. Enter Output Single Row Mode on outputContainer
    enterOutputSingleRowMode();

    // 2. Open subOutputContainer
    const subContainer = document.getElementById('subOutputContainer');
    if (subContainer) subContainer.style.display = 'flex';

    clearSubOutputBarcodeTable();

    activeSearchContext = 'outputBarcodeByFeedRecordsSub';
    const subOutputHeaderContentEl = document.getElementById('subOutputHeaderContent');
    if (subOutputHeaderContentEl) {
        subOutputHeaderContentEl.textContent = `Tem đầu ra của đơn điều động (${work_order})`;
    }

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
                    subOutputRawData = data.result;
                    subOutputColumns = data.columns;
                    renderSubOutputBarcodeTable(subOutputRawData, subOutputColumns);
                    Toast.success('Thành công', `Tìm thấy ${data.result.length} tem đầu ra`);
                } else {
                    renderSubOutputBarcodeTable([], data.columns || []);
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

        if (data && data.success && data.result && data.result.length > 0) {
            outputBarcodeRawData = data.result;
            outputBarcodeColumns = data.columns;
            currentOutputTableType = null;
            renderOutputBarcodeTable(outputBarcodeRawData, outputBarcodeColumns);
            Toast.success('Thành công', `Tải thành công ${data.result.length} dòng thông tin gốc.`);
        } else {
            renderOutputBarcodeTable([], data?.columns || []);
            Toast.warning('Không có dữ liệu', (data && data.message) ? data.message : 'Không tìm thấy thông tin gốc');
        }

    } catch (err) {
        console.error('Error fetching original info:', err);
    }
}

async function fetchPrde(type, rowData = null) {
    const dataObj = rowData || selectedRowData;
    const resource_id = dataObj ? (dataObj['id'] || dataObj['barcode'] || dataObj['resource_id']) : null;
    const product_type = dataObj ? (dataObj['product_type'] || dataObj['material_type']) : null;
    if (!resource_id) {
        Toast.warning('Cảnh báo', 'Chưa chọn hàng dữ liệu.');
        return;
    }

    const key = (type || '').toLowerCase().replace(/^get/, '');
    const urlMap = {
        'prdeba': '/api/barcodes/get-prdeba',
        'prdebb': '/api/barcodes/get-prdebb',
        'prdebc': '/api/barcodes/get-prdebc',
        'getprdeba': '/api/barcodes/get-prdeba',
        'getprdebb': '/api/barcodes/get-prdebb',
        'getprdebc': '/api/barcodes/get-prdebc'
    };

    const headerMap = {
        'prdeba': 'PRDEBA',
        'prdebb': 'PRDEBB',
        'prdebc': 'PRDEBC',
        'getprdeba': 'PRDEBA',
        'getprdebb': 'PRDEBB',
        'getprdebc': 'PRDEBC'
    };

    const targetUrl = urlMap[key] || urlMap[type] || `/api/barcodes/get-${key}`;
    const headerTitle = headerMap[key] || headerMap[type] || key.toUpperCase();

    const outputHeaderContentEl = document.getElementById('outputHeaderContent');
    if (outputHeaderContentEl) {
        outputHeaderContentEl.textContent = headerTitle;
    }

    // Tự động đóng và clear subOutputContainer khi outputContainer mở dữ liệu mới
    closeSubOutputWindow();

    const container = document.getElementById('outputContainer');
    if (container) container.style.display = 'flex';

    enterSingleRowMode();
    clearOutputBarcodeTable();
    activeSearchContext = key;

    try {
        const payload = { resource_id };
        if (product_type) {
            payload.product_type = product_type;
        }

        const data = await apiFetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!data || !data.success) {
            return;
        }

        if (!data.result || data.result.length === 0) {
            renderOutputBarcodeTable([], data.columns || []);
            Toast.warning('Không có dữ liệu', `Không có dữ liệu ${headerTitle} cho barcode này`);
            return;
        }

        outputBarcodeRawData = data.result;
        outputBarcodeColumns = data.columns;
        currentOutputTableType = null;
        renderOutputBarcodeTable(outputBarcodeRawData, outputBarcodeColumns);
        Toast.success('Thành công', `Tải thành công ${data.result.length} dòng dữ liệu ${headerTitle}`);
    } catch (err) {
        console.error(`Error fetching PRDE:`, err);
    }
}

async function reprintLabelPdf(rowData = null) {
    const dataObj = rowData || selectedRowData || {};
    const barcode = (dataObj.id || dataObj.barcode || '').trim();
    if (!barcode) {
        Toast.warning('Cảnh báo', 'Chưa chọn barcode để in lại tem.');
        return;
    }

    showLoading();
    try {
        const response = await fetch('/api/barcodes/reprint-label-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode })
        });

        if (!response.ok) {
            let errData = null;
            try { errData = await response.json(); } catch (e) {}
            const msg = (errData && errData.message) ? errData.message : `Lỗi khi tạo file PDF (${response.status})`;
            Toast.error('Lỗi in lại tem', msg);
            return;
        }

        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = `Tem_${barcode}.pdf`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            window.URL.revokeObjectURL(blobUrl);
            a.remove();
        }, 1500);

        Toast.success('Thành công', `Đã xuất file PDF tem: Tem_${barcode}.pdf`);
    } catch (err) {
        console.error('Error reprinting label PDF:', err);
        Toast.error('Lỗi in lại tem', err.message || 'Lỗi kết nối khi xuất PDF tem');
    } finally {
        hideLoading();
    }
}


// ===== CUPS PRINTERS & REPRINT LABEL SUBMENU =====
let _cupsPrintersCache = { timestamp: 0, printers: [] };
let _reprintSubmenuHideTimer = null;

const STATION_PRINTER_RECOMMEND_MAP = {
    // P5300
    'KV-P5300-CARCASS_PLY-3': 'KV2_P5300_CARCASS_PLY_16.243',
    'KV-P5300-CARCASS_PLY-4': 'KV2_P5300_CARCASS_PLY_16.243',
    'KV-P5300-CARCASS_PLY-1': 'KV2_P5300_CARCASS_PLY',
    'KV-P5300-CARCASS_PLY-2': 'KV2_P5300_CARCASS_PLY',
    'KV-P5300-BEAD-1': 'KV2_P5300_BEAD_16_205',
    'KV-P5300-BEAD-2': 'KV2_P5300_BEAD_16_205',
    'KV-P5300-BF-1': 'KV2_P5300_BEAD_16_205',
    'KV-P5300-TREAD-1': 'KV2_P5300_TREAD_16_206',
    'KV-P5300-TREAD-2': 'KV2_P5300_TREAD_16_206',
    'KV-P5300-INNER LINER-1': 'KV2_P5300_INNER_LINER_16_205',
    'KV-P5300-PLYBELT-GD0127-1': 'KV2_P5300_PLYBELT_16_81',
    'KV-P5300-MAYCAN-16': 'KV2_P5300_TREAD_16_206',
    'KV-P5300-XK-550-22': 'KV2_P5300_TREAD_16_206',
    // P8300
    'KV-P8300-INNER LINER-1': 'KV2_P8300_INNER_LINER_10.25',
    'KV-P8300-SIDEWALL-1': 'KV2_P8300_SIDEWELL_17.57',
    'KV-P8300-BF-QL1216-1': 'KV2_P8300_BF_8.97',
    'KV-P8300-BF-QL1622-2': 'KV2_P8300_BF_8.97',
    'KV-P8300-BF-QLPCR-3': 'KV2_P8300_BF_8.97',
    'KV-P8300-BF-HW1624-4': 'KV2_P8300_BF_8.97',
    'KV-P8300-BF-HW1220-5': 'KV2_P8300_BF_8.97',
    'KV-P8300-BEAD-AW-1224-1': 'KV2_P8300_BEAD-AW_8.96',
    'KV-P8300-BEAD-AW-1224-2': 'KV2_P8300_BEAD-AW_8.96',
    'KV-P8300-BEAD-AW-1224-3': 'KV2_P8300_BEAD-AW_8.96',
    'KV-P8300-STEEL BELT-FC-1': 'KV2_P8300_8.141',
    'KV-P8300-STEEL BELT-FC-2': 'KV2_P8300_STEEL-BELT_8.129',
    'KV-P8300-STEEL BELT-SL-3': 'KV2_P8300_STEEL-BELT_8.129',
    'KV-P8300-PLYBELT-COMERIO-1': 'KV2_P8300_PLYBELT-COMERIO_8.94',
    'KV-P8300-NYLON BAND-JLB-1': 'KV2_P8300_NYLON-BAND_15.11',
    'KV-P8300-NYLON BAND-SNOW-1': 'KV2_P8300_NYLON-BAND_15.11',
    'KV-P8300-NYLON BAND-SNOW-2': 'KV2_P8300_NYLON-BAND_15.11',
    'KV-P8300-NYLON BAND-SNOW-3': 'KV2_P8300_NYLON-BAND_15.11',
    'KV-P8300-TREAD-1': 'KV2_P8300_TREAD_8.100',
    'KV-P8300-TREAD-2': 'KV2_P8300_TREAD_8.100',
    'KV-P8300-CARCASSPLY-1': 'KV2_P8300_8.95',
    'KV-P8300-CARCASSPLY-2': 'KV2_P8300_CARCASSPLY_8.103',
    'KV-P8300-CARCASSPLY-3': 'KV2_P8300_CARCASSPLY_8.103',
    // P9100 / P8700
    'KV-P9100-MIXER-370-1': 'KV2_P9100_4.193',
    'KV-P9100-MIXER-370-2': 'KV2_P9100_4.193',
    'KV-P9100-MIXER-370-3': 'KV2_P9100_4.193',
    'KV-P9100-MIXER-370-4': 'KV2_P9100_4.193',
    'KV-P9100-MIXER-370-5': 'KV2_P9100_8.122',
    'KV-P9100-MIXER-370-6': 'KV2_P9100_8.122',
    'KV-P9100-MIXER-370-7': 'KV2_P9100_8.122',
    'KV-P8700-DRUG-CMPAUTO-1': 'KV2_P9100_8.122',
    'KV-P8700-DRUG-CMPAUTO-3': 'KV2_P9100_8.122',
    'KV-P8700-DRUG-ACLAUTO-2': 'KV2_P9100_8.111',
    'KV-P8700-DRUG-ACLAUTO-4': 'KV2_P9100_8.111',
    'KV-P9100-MIXER-370-8': 'KV2_P9100_4.140'
};

function getRecommendedPrinterName(station) {
    if (!station) return '';
    const stUpper = String(station).trim().toUpperCase();

    // 1. Khớp trực tiếp trong từ điển trích xuất từ printers-manager.yaml
    if (STATION_PRINTER_RECOMMEND_MAP[stUpper]) {
        return STATION_PRINTER_RECOMMEND_MAP[stUpper];
    }

    const stNorm = stUpper.replace(/[\s_-]+/g, '_');
    for (const [key, val] of Object.entries(STATION_PRINTER_RECOMMEND_MAP)) {
        if (key.replace(/[\s_-]+/g, '_') === stNorm) {
            return val;
        }
    }

    // 2. Heuristic quy trình & số máy (ví dụ CARCASS_PLY-3 -> KV2_P5300_CARCASS_PLY_16.243)
    if (stUpper.includes('CARCASS')) {
        if (stUpper.includes('3') || stUpper.includes('4')) return 'KV2_P5300_CARCASS_PLY_16.243';
        if (stUpper.includes('1') || stUpper.includes('2')) return 'KV2_P5300_CARCASS_PLY';
    }
    if (stUpper.includes('BEAD')) {
        if (stUpper.includes('P8300') || stUpper.includes('AW')) return 'KV2_P8300_BEAD-AW_8.96';
        return 'KV2_P5300_BEAD_16_205';
    }
    if (stUpper.includes('TREAD')) {
        if (stUpper.includes('P8300')) return 'KV2_P8300_TREAD_8.100';
        return 'KV2_P5300_TREAD_16_206';
    }
    if (stUpper.includes('INNER') || stUpper.includes('LINER')) {
        if (stUpper.includes('P8300')) return 'KV2_P8300_INNER_LINER_10.25';
        return 'KV2_P5300_INNER_LINER_16_205';
    }
    if (stUpper.includes('NYLON') || stUpper.includes('SNOW') || stUpper.includes('WF')) {
        return 'KV2_P8300_NYLON-BAND_15.11';
    }
    if (stUpper.includes('STEEL')) {
        if (stUpper.includes('1') && !stUpper.includes('2') && !stUpper.includes('3')) return 'KV2_P8300_8.141';
        return 'KV2_P8300_STEEL-BELT_8.129';
    }
    if (stUpper.includes('SIDEWALL') || stUpper.includes('SIDEWELL')) {
        return 'KV2_P8300_SIDEWELL_17.57';
    }
    if (stUpper.includes('PLYBELT')) {
        if (stUpper.includes('P8300') || stUpper.includes('COMERIO')) return 'KV2_P8300_PLYBELT-COMERIO_8.94';
        return 'KV2_P5300_PLYBELT_16_81';
    }
    if (stUpper.includes('BF')) {
        if (stUpper.includes('P8300')) return 'KV2_P8300_BF_8.97';
        return 'KV2_P5300_BEAD_16_205';
    }
    return '';
}

async function getAvailableCupsPrinters() {
    const now = Date.now();
    if (_cupsPrintersCache.printers.length > 0 && (now - _cupsPrintersCache.timestamp < 30000)) {
        return _cupsPrintersCache.printers;
    }
    try {
        const resp = await fetch('/api/switching-spell/available-printers');
        if (resp.ok) {
            const data = await resp.json();
            if (data && Array.isArray(data.printers)) {
                _cupsPrintersCache = { timestamp: now, printers: data.printers };
                return data.printers;
            }
        }
    } catch (e) {
        console.warn('Lỗi fetch danh sách máy in CUPS:', e);
    }
    return _cupsPrintersCache.printers || [];
}

function extractStationFromRowData(dataObj) {
    if (!dataObj) return '';
    if (dataObj.station && typeof dataObj.station === 'string') return dataObj.station.trim();
    if (dataObj.info) {
        try {
            const infoObj = typeof dataObj.info === 'string' ? JSON.parse(dataObj.info) : dataObj.info;
            if (infoObj?.production_info?.station) return String(infoObj.production_info.station).trim();
            if (infoObj?.station) return String(infoObj.station).trim();
        } catch (e) {}
    }
    return '';
}

function filterPrintersByStation(printers, station) {
    if (!Array.isArray(printers) || printers.length === 0) return [];
    const stUpper = (station || '').toUpperCase();

    // Trích xuất mã xưởng/trạm: P5300, P8300, P8400, P9100, P8700...
    const match = stUpper.match(/P\d{4}/);
    const pCode = match ? match[0] : '';

    let filtered = [];
    if (pCode) {
        filtered = printers.filter(p => {
            const q = (p.queue_name || '').toUpperCase();
            if (pCode === 'P9100' || pCode === 'P8700') {
                return q.includes('KV2_P9100') || q.includes('KV2-P9100') || q.includes('KV2_P8700') || q.includes('KV2-P8700');
            }
            return q.includes(`KV2_${pCode}`) || q.includes(`KV2-${pCode}`);
        });
    }

    if (filtered.length === 0) {
        filtered = [...printers];
    }

    // Sắp xếp danh sách printer theo dạng recommend đưa máy in phù hợp lên đầu
    const recommendedPrinter = getRecommendedPrinterName(stUpper);

    return filtered.map(p => {
        const isRecommend = Boolean(recommendedPrinter && p.queue_name.toUpperCase() === recommendedPrinter.toUpperCase());
        return { ...p, isRecommend };
    }).sort((a, b) => {
        if (a.isRecommend && !b.isRecommend) return -1;
        if (!a.isRecommend && b.isRecommend) return 1;
        return a.queue_name.localeCompare(b.queue_name);
    });
}

function positionReprintSubmenu(reprintItem, submenu) {
    if (!reprintItem || !submenu) return;
    const itemRect = reprintItem.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    // Chiều rộng thực tế tự động co giãn theo item dài nhất
    const subRect = submenu.getBoundingClientRect();
    const submenuWidth = Math.round(subRect.width) || 180;
    const actualHeight = Math.round(subRect.height) || 220;

    let left = itemRect.right + 2;
    if (left + submenuWidth > viewportWidth - 10) {
        left = Math.max(10, itemRect.left - submenuWidth - 2);
    }

    let top = itemRect.top;
    if (top + actualHeight > viewportHeight - 10) {
        top = Math.max(10, viewportHeight - actualHeight - 10);
    }

    submenu.style.left = `${Math.round(left)}px`;
    submenu.style.top = `${Math.round(top)}px`;
}

function scheduleHideReprintSubmenu() {
    if (_reprintSubmenuHideTimer) clearTimeout(_reprintSubmenuHideTimer);
    _reprintSubmenuHideTimer = setTimeout(() => {
        hideReprintPrinterSubmenu();
    }, 200);
}

function hideReprintPrinterSubmenu(immediate = false) {
    if (_reprintSubmenuHideTimer) {
        clearTimeout(_reprintSubmenuHideTimer);
        _reprintSubmenuHideTimer = null;
    }
    const submenu = document.getElementById('reprintPrinterSubmenu');
    if (submenu) {
        submenu.style.display = 'none';
    }
}

async function showReprintPrinterSubmenu(reprintItem) {
    if (!reprintItem) return;
    const submenu = document.getElementById('reprintPrinterSubmenu');
    if (!submenu) return;

    if (_reprintSubmenuHideTimer) {
        clearTimeout(_reprintSubmenuHideTimer);
        _reprintSubmenuHideTimer = null;
    }

    const listEl = document.getElementById('reprintPrinterList');
    if (!listEl) return;

    const rowData = selectedRowData || {};
    const station = extractStationFromRowData(rowData);

    listEl.innerHTML = '<div class="context-submenu-empty"><span class="material-symbols-outlined spin" style="font-size:16px; vertical-align:middle; margin-right:4px;">sync</span> Đang tải máy in...</div>';

    positionReprintSubmenu(reprintItem, submenu);
    submenu.style.display = 'block';

    const allPrinters = await getAvailableCupsPrinters();
    const filteredPrinters = filterPrintersByStation(allPrinters, station);

    if (filteredPrinters.length === 0) {
        listEl.innerHTML = '<div class="context-submenu-empty">Không tìm thấy máy in phù hợp</div>';
    } else {
        listEl.innerHTML = filteredPrinters.map(p => {
            const rawStatus = (p.status || 'Idle').toLowerCase();
            let badgeHtml = '';
            // Loại bỏ hoàn toàn printer-badge idle và recommended-tag
            if (rawStatus.includes('process') || rawStatus.includes('busy')) {
                badgeHtml = '<span class="printer-badge processing">Busy</span>';
            } else if (rawStatus.includes('stop') || rawStatus.includes('disabled')) {
                badgeHtml = '<span class="printer-badge stopped">Stopped</span>';
            }

            // Loại bỏ hoàn toàn icon print khỏi submenu-item-name
            return `
                <div class="context-submenu-item" data-printer="${p.queue_name}" role="menuitem">
                    <span class="submenu-item-name" title="${p.queue_name}">${p.queue_name}</span>
                    ${badgeHtml}
                </div>
            `;
        }).join('');

        listEl.querySelectorAll('.context-submenu-item').forEach(el => {
            el.addEventListener('click', async (e) => {
                e.stopPropagation();
                const printerName = el.dataset.printer;
                hideReprintPrinterSubmenu(true);
                const contextMenu = document.getElementById('contextMenu');
                if (contextMenu) contextMenu.style.display = 'none';
                await printLabelCups(printerName, selectedRowData);
            });
        });
    }

    positionReprintSubmenu(reprintItem, submenu);
}

function handleReprintLabelPdfClick(rowData = null) {
    const reprintItem = document.querySelector('.context-menu-item[data-action="reprintLabelPdf"]');
    const submenu = document.getElementById('reprintPrinterSubmenu');
    if (!reprintItem || !submenu) return;

    if (submenu.style.display === 'block') {
        hideReprintPrinterSubmenu(true);
    } else {
        showReprintPrinterSubmenu(reprintItem);
    }
}

async function printLabelCups(printerName, rowData = null) {
    const dataObj = rowData || selectedRowData || {};
    const barcode = (dataObj.id || dataObj.barcode || '').trim();
    if (!barcode) {
        Toast.warning('Cảnh báo', 'Chưa chọn barcode để in lại tem.');
        return;
    }
    if (!printerName) {
        Toast.warning('Cảnh báo', 'Chưa chọn máy in.');
        return;
    }

    const confirmed = (typeof showConfirm === 'function')
        ? await showConfirm(`Gửi lệnh in tem <strong>${barcode}</strong> tới máy in <strong>${printerName}</strong>?`, 'Xác nhận in tem CUPS')
        : true;
    if (!confirmed) return;

    showLoading();
    try {
        const response = await fetch('/api/barcodes/print-label-cups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode, printer_name: printerName })
        });
        const result = await response.json();
        if (response.ok && result.success) {
            const jobStr = result.job_id ? ` (Job #${result.job_id})` : '';
            Toast.success('Thành công', `Đã gửi lệnh in tem ${barcode} tới máy in ${printerName}${jobStr}`);
        } else {
            Toast.error('Lỗi in tem', result.message || `Lỗi khi gửi lệnh in tới máy in (${response.status})`);
        }
    } catch (err) {
        console.error('Error sending print job to CUPS:', err);
        Toast.error('Lỗi in tem', err.message || 'Lỗi kết nối khi gửi lệnh in CUPS');
    } finally {
        hideLoading();
    }
}

function initReprintSubmenuEvents() {
    const reprintItem = document.querySelector('.context-menu-item[data-action="reprintLabelPdf"]');
    const submenu = document.getElementById('reprintPrinterSubmenu');
    const downloadBtn = document.getElementById('reprintDownloadPdfOption');

    if (reprintItem && !reprintItem._hasSubmenuEvents) {
        reprintItem._hasSubmenuEvents = true;
        reprintItem.addEventListener('mouseenter', () => {
            showReprintPrinterSubmenu(reprintItem);
        });
        reprintItem.addEventListener('mouseleave', () => {
            scheduleHideReprintSubmenu();
        });
    }

    if (submenu && !submenu._hasSubmenuEvents) {
        submenu._hasSubmenuEvents = true;
        submenu.addEventListener('mouseenter', () => {
            if (_reprintSubmenuHideTimer) {
                clearTimeout(_reprintSubmenuHideTimer);
                _reprintSubmenuHideTimer = null;
            }
        });
        submenu.addEventListener('mouseleave', () => {
            scheduleHideReprintSubmenu();
        });
    }

    if (downloadBtn && !downloadBtn._hasClickEvent) {
        downloadBtn._hasClickEvent = true;
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hideReprintPrinterSubmenu(true);
            const contextMenu = document.getElementById('contextMenu');
            if (contextMenu) contextMenu.style.display = 'none';
            reprintLabelPdf(selectedRowData);
        });
    }
}
window.initReprintSubmenuEvents = initReprintSubmenuEvents;
window.hideReprintPrinterSubmenu = hideReprintPrinterSubmenu;
window.showReprintPrinterSubmenu = showReprintPrinterSubmenu;
window.handleReprintLabelPdfClick = handleReprintLabelPdfClick;
window.printLabelCups = printLabelCups;

// ===== MES TRACKING MASTER-DETAIL UNIFIED TREE TABLE IMPLEMENTATION =====
let mesModalNodeCounter = 0;

async function openMesTrackingModal(rowData = null) {
    const dataObj = rowData || selectedRowData || {};
    const resource_id = dataObj.id || dataObj.barcode || dataObj.resource_id;
    const product_id = dataObj.product_id || dataObj.recipe_id || dataObj.productID;

    if (!resource_id || !product_id) {
        Toast.warning('Cảnh báo', 'Không tìm thấy thông tin Resource ID hoặc Product ID để tra cứu MES Tracking.');
        return;
    }

    const modal = document.getElementById('mesTrackingModal');
    if (!modal) return;

    // Set meta info in modal header
    const modalBarcodeEl = document.getElementById('mesModalBarcode');
    const modalProductEl = document.getElementById('mesModalProduct');
    if (modalBarcodeEl) modalBarcodeEl.textContent = resource_id;
    if (modalProductEl) modalProductEl.textContent = product_id;

    // Reset search input
    const searchInput = document.getElementById('mesModalSearch');
    if (searchInput) searchInput.value = '';

    // Show modal
    modal.classList.remove('hidden');
    modal.classList.add('show');

    // Load initial root data
    await fetchMesTrackingModalData(resource_id, product_id);
}
window.openMesTrackingModal = openMesTrackingModal;

function closeMesTrackingModal() {
    const modal = document.getElementById('mesTrackingModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('show');
    }
}
window.closeMesTrackingModal = closeMesTrackingModal;

async function fetchMesTrackingModalData(resourceId, productId) {
    const tbody = document.getElementById('mesMasterTableBody');
    if (!tbody) return;

    mesModalNodeCounter = 0;
    tbody.innerHTML = `
        <tr>
            <td colspan="11" style="text-align: center; padding: 40px 20px;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 10px; color: var(--color-text-accent);">
                    <span class="mes-tree-spinner" style="width: 24px; height: 24px; border-width: 3px;"></span>
                    <span style="font-size: 13px;">Đang truy xuất lịch sử vật liệu MES...</span>
                </div>
            </td>
        </tr>
    `;

    try {
        const data = await apiFetch('/api/mes/material-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                resource_id: resourceId,
                product_id: productId,
                type: 0
            })
        });

        if (!data || !data.success) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="11" style="text-align: center; padding: 40px 20px; color: var(--rose-400);">
                        ${escapeHtml((data && data.message) ? data.message : 'Lỗi khi gọi API MES')}
                    </td>
                </tr>
            `;
            Toast.error('Lỗi', (data && data.message) ? data.message : 'Lỗi khi tải dữ liệu MES Tracking');
            return;
        }

        if (!data.data || data.data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="11" style="text-align: center; padding: 40px 20px;">
                        <div class="table-empty-state">
                            <div class="empty-state-icon-wrapper">
                                <span class="material-symbols-outlined empty-state-icon">account_tree</span>
                            </div>
                            <div class="empty-state-title">Không tìm thấy dữ liệu</div>
                            <div class="empty-state-desc">Không tìm thấy thông tin cấu trúc vật liệu cho Barcode ${escapeHtml(resourceId)}</div>
                        </div>
                    </td>
                </tr>
            `;
            Toast.warning('Không có dữ liệu', `Không tìm thấy lịch sử MES Tracking cho Barcode ${resourceId}`);
            return;
        }

        renderMesMasterTableRows(data.data, tbody, 0, null, []);
        Toast.success('Thành công', `Tải thành công ${data.data.length} bản ghi gốc`);
    } catch (err) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" style="text-align: center; padding: 40px 20px; color: var(--rose-400);">
                    ${escapeHtml(err.message || 'Lỗi kết nối')}
                </td>
            </tr>
        `;
        Toast.error('Lỗi kết nối', err.message || 'Lỗi khi gọi API MES Tracking');
    }
}

function renderMesMasterTableRows(items, tbody, level = 0, parentNodeId = null, ancestorIds = []) {
    if (!tbody) return;
    if (level === 0) {
        tbody.innerHTML = '';
    }

    const fragment = document.createDocumentFragment();
    items.forEach(item => {
        const rowEl = createMesTableRow(item, level, parentNodeId, ancestorIds);
        fragment.appendChild(rowEl);
    });
    tbody.appendChild(fragment);
}

function createMesTableRow(item, level = 0, parentNodeId = null, ancestorIds = []) {
    const nodeId = 'mes-node-' + (++mesModalNodeCounter);
    const clampedLevel = Math.min(level, 4);
    const tr = document.createElement('tr');
    tr.className = `mes-data-row mes-tree-row mes-level-${clampedLevel}`;
    tr.dataset.nodeId = nodeId;
    tr.dataset.level = String(level);
    tr.dataset.resourceId = item.resourceID || '';
    tr.dataset.productId = item.productID || '';
    tr.dataset.loaded = 'false';
    tr.dataset.expanded = 'false';
    tr.dataset.parentNodeId = parentNodeId || '';
    tr.dataset.ancestorIds = JSON.stringify(ancestorIds || []);

    // 1. Toggle Button
    const tdToggle = document.createElement('td');
    tdToggle.className = 'mes-toggle-td';
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'mes-tree-toggle-btn';
    toggleBtn.title = 'Mở rộng vật liệu con';
    toggleBtn.setAttribute('aria-label', 'Mở rộng vật liệu con');
    toggleBtn.innerHTML = '<span class="mes-toggle-arrow">›</span>';
    toggleBtn.onclick = (e) => {
        e.stopPropagation();
        handleMesRowToggle(toggleBtn, tr);
    };
    tdToggle.appendChild(toggleBtn);
    tr.appendChild(tdToggle);

    // 2. Product_type (Badge)
    const tdType = document.createElement('td');
    const rawType = (item.productType || 'N/A').toUpperCase();
    tdType.innerHTML = `<span class="mes-product-type-badge mes-badge-${rawType.toLowerCase()}">${escapeHtml(rawType)}</span>`;
    tdType.dataset.fullValue = rawType;
    tr.appendChild(tdType);

    // 3. Barcode (Resource ID)
    const tdResource = document.createElement('td');
    tdResource.className = 'font-mono text-cyan-400 font-medium';
    tdResource.textContent = item.resourceID || '-';
    tdResource.dataset.fullValue = item.resourceID || '';
    tdResource.title = item.resourceID || '';
    tr.appendChild(tdResource);

    // 4. Product_id (Product ID)
    const tdProduct = document.createElement('td');
    tdProduct.className = 'font-mono font-medium';
    tdProduct.textContent = item.productID || '-';
    tdProduct.dataset.fullValue = item.productID || '';
    tdProduct.title = item.productID || '';
    tr.appendChild(tdProduct);

    // 5. Số Lượng
    const tdQty = document.createElement('td');
    tdQty.className = 'text-right font-mono font-medium';
    tdQty.textContent = (item.quantity !== undefined && item.quantity !== null && item.quantity !== '') ? item.quantity : '-';
    tdQty.dataset.fullValue = String(item.quantity ?? '');
    tr.appendChild(tdQty);

    // 6. Số Lô
    const tdLot = document.createElement('td');
    tdLot.className = 'font-mono';
    tdLot.textContent = item.lotNumber || '-';
    tdLot.dataset.fullValue = item.lotNumber || '';
    tr.appendChild(tdLot);

    // 7. Trạm / Máy
    const tdStation = document.createElement('td');
    tdStation.className = 'font-mono';
    tdStation.textContent = item.stationID || '-';
    tdStation.dataset.fullValue = item.stationID || '';
    tr.appendChild(tdStation);

    // 8. Ngày SX
    const tdProdDate = document.createElement('td');
    tdProdDate.textContent = item.productionDate || '-';
    tdProdDate.dataset.fullValue = item.productionDate || '';
    tr.appendChild(tdProdDate);

    // 9. Thời Gian SX
    const tdProdTime = document.createElement('td');
    const formattedProdTime = item.productionTime ? formatIsoDateTimeStr(item.productionTime) : '-';
    tdProdTime.textContent = formattedProdTime;
    tdProdTime.dataset.fullValue = formattedProdTime;
    tdProdTime.title = item.productionTime || '';
    tr.appendChild(tdProdTime);

    // 10. NV Sản Xuất
    const tdStaff = document.createElement('td');
    const staffVal = item.productionStaff || (Array.isArray(item.boundResourceUserIDs) && item.boundResourceUserIDs.length > 0 ? item.boundResourceUserIDs.join(', ') : '-');
    tdStaff.textContent = staffVal;
    tdStaff.dataset.fullValue = staffVal;
    tr.appendChild(tdStaff);

    // 11. Hạn Dùng
    const tdExpiry = document.createElement('td');
    const formattedExpiry = item.expiryTime ? formatIsoDateTimeStr(item.expiryTime) : '-';
    tdExpiry.textContent = formattedExpiry;
    tdExpiry.dataset.fullValue = formattedExpiry;
    tdExpiry.title = item.expiryTime || '';
    tr.appendChild(tdExpiry);

    return tr;
}

async function handleMesRowToggle(btn, tr) {
    const isExpanded = tr.dataset.expanded === 'true';
    const isLoaded = tr.dataset.loaded === 'true';
    const resourceId = tr.dataset.resourceId;
    const productId = tr.dataset.productId;
    const level = parseInt(tr.dataset.level || '0', 10);
    const nodeId = tr.dataset.nodeId;
    const parentTbody = tr.closest('tbody');
    if (!parentTbody) return;

    if (isExpanded) {
        // Thu gọn: Ẩn tất cả con cháu trực tiếp & gián tiếp của node này
        tr.dataset.expanded = 'false';
        btn.classList.remove('expanded');

        const allRows = Array.from(parentTbody.querySelectorAll('tr.mes-tree-row'));
        allRows.forEach(r => {
            try {
                const ancestors = JSON.parse(r.dataset.ancestorIds || '[]');
                if (ancestors.includes(nodeId)) {
                    r.style.display = 'none';
                }
            } catch (e) {}
        });
        return;
    }

    if (isLoaded) {
        // Đã nạp dữ liệu con trước đó: Hiển thị lại cây con
        tr.dataset.expanded = 'true';
        btn.classList.add('expanded');

        showDescendantRows(parentTbody, nodeId);
        return;
    }

    // Chưa tải: gọi API MES lấy danh sách vật liệu con
    if (!resourceId || !productId) {
        btn.remove();
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="mes-tree-spinner"></span>';

    try {
        const data = await apiFetch('/api/mes/material-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                resource_id: resourceId,
                product_id: productId,
                type: 0
            })
        });

        if (!data || !data.success || !data.data || data.data.length === 0) {
            // Nút dropdown biến mất khi trả về data: []
            const parentTd = btn.parentElement;
            btn.remove();
            if (parentTd) {
                parentTd.innerHTML = '<span class="mes-leaf-spacer"></span>';
            }
            tr.dataset.isLeaf = 'true';
            tr.dataset.loaded = 'true';
            Toast.info('Thông báo', `Không có dữ liệu cấp con cho Barcode ${resourceId}`);
            return;
        }

        // Đã có data con: chèn trực tiếp các dòng con ngay sau dòng cha trong cùng thead/tbody
        tr.dataset.loaded = 'true';
        tr.dataset.expanded = 'true';
        btn.disabled = false;
        btn.classList.add('expanded');
        btn.innerHTML = '<span class="mes-toggle-arrow">›</span>';

        const childLevel = level + 1;
        let parentAncestors = [];
        try {
            parentAncestors = JSON.parse(tr.dataset.ancestorIds || '[]');
        } catch (e) {}
        const childAncestors = [...parentAncestors, nodeId];

        const fragment = document.createDocumentFragment();
        data.data.forEach(item => {
            const childRow = createMesTableRow(item, childLevel, nodeId, childAncestors);
            fragment.appendChild(childRow);
        });

        tr.after(fragment);

        // Áp dụng lại tìm kiếm highlight nếu đang có keyword
        const searchInput = document.getElementById('mesModalSearch');
        if (searchInput && searchInput.value.trim()) {
            highlightMesModalBarcode(searchInput.value.trim());
        }

        Toast.success('Thành công', `Tải thành công ${data.data.length} vật liệu con của ${resourceId}`);
    } catch (err) {
        btn.disabled = false;
        btn.classList.remove('expanded');
        btn.innerHTML = '<span class="mes-toggle-arrow">›</span>';
        Toast.error('Lỗi', err.message || 'Lỗi khi tải dữ liệu cấp con');
    }
}

/**
 * Hiển thị lại các dòng con trực tiếp và các dòng cháu nếu node cha của chúng đang mở (expanded)
 */
function showDescendantRows(tbody, parentNodeId) {
    const directChildren = tbody.querySelectorAll(`tr.mes-tree-row[data-parent-node-id="${parentNodeId}"]`);
    directChildren.forEach(childRow => {
        childRow.style.display = '';
        if (childRow.dataset.expanded === 'true') {
            showDescendantRows(tbody, childRow.dataset.nodeId);
        }
    });
}

/**
 * Highlight barcode tìm kiếm mà KHÔNG ẩn hay lọc dòng nào
 * @param {string} keyword
 */
function highlightMesModalBarcode(keyword) {
    const tbody = document.getElementById('mesMasterTableBody');
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll('tr.mes-tree-row'));
    const query = (keyword || '').trim();

    let firstMatchRow = null;

    rows.forEach(row => {
        const barcodeCell = row.querySelector('td:nth-child(3)');
        if (!barcodeCell) return;

        const rawBarcode = barcodeCell.dataset.fullValue || row.dataset.resourceId || '';

        if (!query) {
            row.classList.remove('has-search-match');
            barcodeCell.innerHTML = escapeHtml(rawBarcode);
        } else {
            const escapedQuery = escapeRegex(query);
            const regex = new RegExp(`(${escapedQuery})`, 'i');

            if (regex.test(rawBarcode)) {
                row.classList.add('has-search-match');
                const highlighted = escapeHtml(rawBarcode).replace(
                    new RegExp(`(${escapeRegex(escapeHtml(query))})`, 'gi'),
                    '<mark class="barcode-search-match">$1</mark>'
                );
                barcodeCell.innerHTML = highlighted;

                if (!firstMatchRow && row.style.display !== 'none') {
                    firstMatchRow = row;
                }
            } else {
                row.classList.remove('has-search-match');
                barcodeCell.innerHTML = escapeHtml(rawBarcode);
            }
        }
    });

    if (firstMatchRow) {
        firstMatchRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}
window.highlightMesModalBarcode = highlightMesModalBarcode;
window.filterMesModalTable = highlightMesModalBarcode;

/**
 * Highlight văn bản tìm kiếm trong Details Modal (JSON, YAML, Diff, Actions Commit) mà không phá vỡ cấu trúc DOM
 * @param {string} keyword
 */
function highlightDetailsModalText(keyword) {
    const modal = document.getElementById('detailsModal');
    if (!modal) return;
    const wrapper = modal.querySelector('.details-modal-body-wrapper');
    const body = modal.querySelector('.details-modal-body');
    const isActionsMode = wrapper && wrapper.classList.contains('has-actions-commit');
    const isYamlMode = wrapper && wrapper.classList.contains('has-yaml-content');
    const isGitlabDiffMode = wrapper && wrapper.classList.contains('has-gitlab-diff');

    const targetContainer = isYamlMode
        ? (wrapper.querySelector('.yaml-code-scroll') || wrapper)
        : (isGitlabDiffMode ? (wrapper.querySelector('.diff-split-container') || wrapper) : (isActionsMode ? wrapper : body));
    if (!targetContainer) return;

    if (!window._currentDetailsOriginalHTML) {
        window._currentDetailsOriginalHTML = targetContainer.innerHTML;
    }

    const query = (keyword || '').trim();
    if (!query) {
        targetContainer.innerHTML = window._currentDetailsOriginalHTML;
        return;
    }

    // Khôi phục nguyên trạng HTML ban đầu trước khi highlight mới
    targetContainer.innerHTML = window._currentDetailsOriginalHTML;

    // Duyệt qua tất cả các Text Node trong cây DOM của container modal
    const walker = document.createTreeWalker(targetContainer, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
        if (node.nodeValue && node.nodeValue.trim()) {
            textNodes.push(node);
        }
    }

    const escapedQuery = escapeRegex(query);
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    let firstMatchEl = null;

    textNodes.forEach(textNode => {
        const text = textNode.nodeValue;
        if (regex.test(text)) {
            const span = document.createElement('span');
            span.innerHTML = escapeHtml(text).replace(
                new RegExp(`(${escapeRegex(escapeHtml(query))})`, 'gi'),
                '<mark class="barcode-search-match details-search-match">$1</mark>'
            );

            const parent = textNode.parentNode;
            if (parent) {
                while (span.firstChild) {
                    const child = span.firstChild;
                    if (!firstMatchEl && child.nodeType === Node.ELEMENT_NODE && child.classList && child.classList.contains('details-search-match')) {
                        firstMatchEl = child;
                    }
                    parent.insertBefore(child, textNode);
                }
                parent.removeChild(textNode);
            }
        }
    });

    if (firstMatchEl) {
        firstMatchEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}
window.highlightDetailsModalText = highlightDetailsModalText;

function escapeRegex(str) {
    return (str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatIsoDateTimeStr(val) {
    if (!val) return '-';
    try {
        const d = new Date(val);
        if (isNaN(d.getTime())) return String(val);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        const s = String(d.getSeconds()).padStart(2, '0');
        return `${y}-${m}-${day} ${h}:${min}:${s}`;
    } catch (e) {
        return String(val);
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

    // 1. Enter Single Row Mode on outputContainer
    enterOutputSingleRowMode();

    // 2. Open subOutputContainer
    const subContainer = document.getElementById('subOutputContainer');
    if (subContainer) subContainer.style.display = 'flex';

    clearSubOutputBarcodeTable();

    activeSearchContext = type;
    const subOutputHeaderContentEl = document.getElementById('subOutputHeaderContent');

    if (subOutputHeaderContentEl) {
        if (type && type === 'outputByBarcode') {
            subOutputHeaderContentEl.textContent = `Tem đầu ra của mã MES (${work_order_id})`;
        } else if (type && type === 'outputByRecipe') {
            subOutputHeaderContentEl.textContent = `Tem đầu ra của mã MES (${work_order_id})`;
        } else {
            subOutputHeaderContentEl.textContent = `Tem đầu ra của mã MES (${work_order_id})`;
        }
    }

    try {
        const data = await apiFetch('/api/workorders/fetch-output-barcodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ work_order_id, work_order_status }),
            showErrorToast: false
        });

        if (data && data.success) {
            if (data.result && data.result.length > 0) {
                subOutputRawData = data.result;
                subOutputColumns = data.columns;

                renderSubOutputBarcodeTable(subOutputRawData, subOutputColumns);
                Toast.success('Thành công', `Tải thành công ${data.result.length} tem đầu ra`);
            } else {
                renderSubOutputBarcodeTable([], data.columns || []);
                Toast.warning('Không có dữ liệu', data.message || 'Không tìm thấy tem đầu ra nào');
            }
        } else {
            renderSubOutputBarcodeTable([], []);
            Toast.error('Lỗi', data.message || 'Lỗi khi tải tem đầu ra');
        }
    } catch (err) {
        renderSubOutputBarcodeTable([], []);
        if (!err.toastShown) {
            Toast.error('Lỗi', err.message || 'Lỗi kết nối khi tải tem đầu ra');
        }
    }
}

async function fetchInputBarcodeByWorkOrder(type, rowData = null) {
    const dataObj = rowData || selectedOutputRowData || selectedRowData;
    const work_order_id = dataObj ? (dataObj['work_order'] || dataObj['id']) : null;
    if (!work_order_id) {
        Toast.warning('Cảnh báo', 'Chưa chọn hàng dữ liệu.');
        return;
    }

    const work_order_status = dataObj ? dataObj['status'] : null;
    if (!work_order_status) {
        Toast.warning('Cảnh báo', 'Chưa chọn hàng dữ liệu.');
        return;
    }

    // 1. Enter Single Row Mode on outputContainer
    enterOutputSingleRowMode();

    // 2. Open subOutputContainer
    const subContainer = document.getElementById('subOutputContainer');
    if (subContainer) subContainer.style.display = 'flex';

    clearSubOutputBarcodeTable();

    activeSearchContext = type;
    const subOutputHeaderContentEl = document.getElementById('subOutputHeaderContent');
    if (subOutputHeaderContentEl) {
        subOutputHeaderContentEl.textContent = `Tem đầu vào của mã MES (${work_order_id})`;
    }

    // Trích xuất product_type từ information của work_order
    let infoObj = dataObj ? (dataObj['information'] || dataObj['info']) : null;
    if (typeof infoObj === 'string') {
        try {
            infoObj = JSON.parse(infoObj);
        } catch (e) {
            infoObj = null;
        }
    }
    const product_type = (infoObj && (infoObj.product_type || infoObj.productType)) || dataObj['product_type'] || '';

    try {
        // Bước 1: Call api/workorders/fetch-output-barcodes
        const outData = await apiFetch('/api/workorders/fetch-output-barcodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ work_order_id, work_order_status }),
            showErrorToast: false
        });

        if (!outData || !outData.success || !Array.isArray(outData.result) || outData.result.length === 0) {
            renderSubOutputBarcodeTable([], []);
            Toast.warning('Không có dữ liệu', outData?.message || 'Đơn điều động không có tem đầu ra để tra cứu tem đầu vào');
            return;
        }

        // Lưu vào 1 biến danh sách các barcode mà api/workorders/fetch-output-barcodes trả về
        const bcIdx = (outData.columns && Array.isArray(outData.columns)) 
            ? (outData.columns.indexOf('barcode') >= 0 ? outData.columns.indexOf('barcode') : 0) 
            : 0;

        const outputBarcodes = [];
        outData.result.forEach(row => {
            const bc = row[bcIdx];
            if (bc && String(bc).trim() && !outputBarcodes.includes(String(bc).trim())) {
                outputBarcodes.push(String(bc).trim());
            }
        });

        if (outputBarcodes.length === 0) {
            renderSubOutputBarcodeTable([], []);
            Toast.warning('Không có dữ liệu', 'Không trích xuất được danh sách tem đầu ra');
            return;
        }

        // Bước 2: Gọi tới API mới để lấy toàn bộ tem đầu vào của mã MES
        const inData = await apiFetch('/api/workorders/fetch-input-barcodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                barcode_ids: outputBarcodes,
                product_type: product_type,
                work_order_id: work_order_id
            }),
            showErrorToast: false
        });

        if (inData && inData.success) {
            if (inData.result && inData.result.length > 0) {
                subOutputRawData = inData.result;
                subOutputColumns = inData.columns;

                renderSubOutputBarcodeTable(subOutputRawData, subOutputColumns);
                Toast.success('Thành công', `Tải thành công ${inData.result.length} tem đầu vào`);
            } else {
                renderSubOutputBarcodeTable([], inData.columns || []);
                Toast.warning('Không có dữ liệu', inData.message || 'Không tìm thấy tem đầu vào nào');
            }
        } else {
            renderSubOutputBarcodeTable([], []);
            Toast.error('Lỗi', inData?.message || 'Lỗi khi tải tem đầu vào');
        }
    } catch (err) {
        renderSubOutputBarcodeTable([], []);
        if (!err.toastShown) {
            Toast.error('Lỗi', err.message || 'Lỗi kết nối khi tải tem đầu vào');
        }
    }
}

let currentMainWorkOrderId = null;
let currentSubWorkOrderId = null;

async function fetchOutputBarcodeByMainWorkOrder(workOrderId = null, workOrderStatus = null) {
    const targetId = workOrderId || (selectedRowData ? (selectedRowData['id'] || selectedRowData['work_order']) : null);
    currentMainWorkOrderId = targetId;
    const targetStatus = (workOrderStatus !== undefined && workOrderStatus !== null) ? workOrderStatus : (selectedRowData ? selectedRowData['status'] : null);

    if (!targetId) {
        Toast.warning('Cảnh báo', 'Chưa chọn đơn điều động.');
        return;
    }

    try {
        const data = await apiFetch('/api/workorders/fetch-output-barcodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ work_order_id: targetId, work_order_status: targetStatus }),
            showErrorToast: false
        });

        if (data && data.success) {
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
            renderOutputBarcodeTable([], []);
            Toast.error('Lỗi', data.message || 'Lỗi khi tải tem đầu ra');
        }
    } catch (err) {
        renderOutputBarcodeTable([], []);
        if (!err.toastShown) {
            Toast.error('Lỗi', err.message || 'Lỗi kết nối khi tải tem đầu ra');
        }
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

    // click ra ngoài modal-content => đóng (chỉ đóng khi click trực tiếp backdrop)
    modal.addEventListener('click', e => {
        if (e.target === modal) {
            closeDetailsModal();
        }
    });

    const mesModal = document.getElementById('mesTrackingModal');
    if (mesModal) {
        mesModal.addEventListener('click', e => {
            if (e.target === mesModal) {
                closeMesTrackingModal();
            }
        });
    }

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
    const table = selectedRow.closest('table');
    const columns = table 
        ? Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim()).filter(Boolean) 
        : Array.from(document.querySelectorAll('#tableHead th')).map(th => th.textContent.trim()).filter(Boolean);

    const fullRowData = {};
    if (columns.length > 0 && columns.length <= cells.length) {
        columns.forEach((col, index) => {
            const cell = cells[index];
            fullRowData[col] = cell?.dataset.fullValue !== undefined ? cell.dataset.fullValue : (cell?.textContent?.trim() || '');
        });
    } else if (selectedRowData && Object.keys(selectedRowData).length > 0) {
        Object.assign(fullRowData, selectedRowData);
    } else {
        cells.forEach((cell, index) => {
            fullRowData[`Cột ${index + 1}`] = cell?.dataset.fullValue !== undefined ? cell.dataset.fullValue : (cell?.textContent?.trim() || '');
        });
    }

    showDetailsModal(fullRowData);
}

function showOutputDetails() {
    if (!selectedOutputRow) return;

    const cells = selectedOutputRow.querySelectorAll('td');
    const table = selectedOutputRow.closest('table');
    const columns = table 
        ? Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim()).filter(Boolean) 
        : Array.from(document.querySelectorAll('#outputBarcodeTable thead th')).map(th => th.textContent.trim()).filter(Boolean);

    const fullRowData = {};
    if (columns.length > 0 && columns.length <= cells.length) {
        columns.forEach((col, index) => {
            const cell = cells[index];
            fullRowData[col] = cell?.dataset.fullValue !== undefined ? cell.dataset.fullValue : (cell?.textContent?.trim() || '');
        });
    } else if (selectedOutputRowData && Object.keys(selectedOutputRowData).length > 0) {
        Object.assign(fullRowData, selectedOutputRowData);
    } else {
        cells.forEach((cell, index) => {
            fullRowData[`Cột ${index + 1}`] = cell?.dataset.fullValue !== undefined ? cell.dataset.fullValue : (cell?.textContent?.trim() || '');
        });
    }

    showDetailsModal(fullRowData);
}

function resetDetailsModalBody(modal) {
    if (!modal) return;
    modal.classList.remove('actions-commit-mode');
    const body = modal.querySelector('.details-modal-body');
    const wrapper = modal.querySelector('.details-modal-body-wrapper');
    if (body) {
        body.style.display = '';
        body.classList.remove('details-modal-body-yaml', 'details-modal-body-actions', 'details-modal-body-diff');
        body.innerHTML = '';
    }
    if (wrapper) {
        wrapper.classList.remove('has-actions-commit', 'has-yaml-content', 'has-gitlab-diff');
        wrapper.querySelectorAll('.actions-version-tabs-bar, #actionsCommitCardsGrid, .actions-syntax-banner, #actionsDiffSection, .yaml-toolbar, .yaml-error-drawer, .yaml-code-scroll, .yaml-path-wrapper, .yaml-toolbar-status, .diff-compact-header, .diff-split-container, .diff-viewer-empty').forEach(el => el.remove());
    }
}

function showDetailsModal(data) {
    const modal = document.getElementById('detailsModal');
    if (!modal) return;

    const copyBtn = document.getElementById('copyDetailsBtn');
    const body = modal.querySelector('.details-modal-body');
    const titleEl = modal.querySelector('.details-modal-title');
    const content = modal.querySelector('.details-modal-content');
    if (!body) return;

    resetDetailsModalBody(modal);

    const isCommitRow = data.hasOwnProperty('diff') || (data.hasOwnProperty('id') && data.hasOwnProperty('message') && (data.hasOwnProperty('authored_date') || data.hasOwnProperty('committed_date')));
    if (isCommitRow) {
        const recipeId = selectedRowData?.recipe_id || (data['new_path'] || data['old_path'] || '').split('/').pop().replace(/\.ya?ml$/, '') || 'QUY CÁCH';
        if (titleEl) {
            titleEl.textContent = `GITLAB COMMIT (${recipeId})`;
        }
        if (copyBtn) copyBtn.style.display = 'none';
        if (content) content.classList.add('details-modal-diff-wide');
        const wrapper = modal.querySelector('.details-modal-body-wrapper');
        if (body) {
            body.style.display = 'none';
            body.classList.remove('details-modal-body-yaml', 'details-modal-body-actions', 'details-modal-body-diff');
            body.innerHTML = '';
        }

        window._currentRawYamlContent = data['diff'] || '';

        if (wrapper) {
            wrapper.classList.add('has-gitlab-diff');
            wrapper.querySelectorAll('.diff-compact-header, .diff-split-container, .diff-viewer-empty, .yaml-toolbar, .yaml-error-drawer, .yaml-code-scroll, .actions-version-tabs-bar, #actionsCommitCardsGrid, .actions-syntax-banner, #actionsDiffSection').forEach(el => el.remove());
            wrapper.insertAdjacentHTML('beforeend', renderDiffViewer(data));
            wrapper.scrollTop = 0;
            window._currentDetailsOriginalHTML = wrapper.innerHTML;
        }

        const searchInput = document.getElementById('detailsModalSearch');
        if (searchInput) searchInput.value = '';

        // 2D Scroll Synchronization: Horizontal (scrollLeft) AND Vertical (scrollTop)
        const leftPane = modal.querySelector('#diffPaneLeft');
        const rightPane = modal.querySelector('#diffPaneRight');
        const gutter = modal.querySelector('#diffGutter');

        if (leftPane && rightPane) {
            let isSyncing = false;

            const syncScroll = (source, targets, syncX = true, syncY = true) => {
                if (isSyncing) return;
                isSyncing = true;
                try {
                    targets.forEach(target => {
                        if (!target) return;
                        if (syncX && target.scrollLeft !== undefined && source.scrollLeft !== undefined) {
                            target.scrollLeft = source.scrollLeft;
                        }
                        if (syncY && target.scrollTop !== undefined && source.scrollTop !== undefined) {
                            target.scrollTop = source.scrollTop;
                        }
                    });
                } finally {
                    isSyncing = false;
                }
            };

            leftPane.onscroll = () => {
                syncScroll(leftPane, [rightPane, gutter], true, true);
            };

            rightPane.onscroll = () => {
                syncScroll(rightPane, [leftPane, gutter], true, true);
            };

            if (gutter) {
                gutter.onwheel = (e) => {
                    if (rightPane) {
                        rightPane.scrollTop += e.deltaY;
                        e.preventDefault();
                    }
                };
            }
        } else if (rightPane) {
            // Single pane mode (New File commit)
            rightPane.onscroll = () => {
                if (gutter) {
                    gutter.scrollTop = rightPane.scrollTop;
                }
            };

            if (gutter) {
                gutter.onwheel = (e) => {
                    rightPane.scrollTop += e.deltaY;
                    e.preventDefault();
                };
            }
        }

        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        return;
    }

    if (content) content.classList.remove('details-modal-diff-wide');
    if (copyBtn) copyBtn.style.display = '';
    if (titleEl) {
        titleEl.textContent = 'Chi tiết dữ liệu';
    }
    window._currentRawYamlContent = null;

    function normalizePgArraysInObject(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) {
            return obj.map(item => normalizePgArraysInObject(item));
        }
        for (const k of Object.keys(obj)) {
            if (k === 'feed_records_id' || k === 'records_id') {
                obj[k] = formatPgArrayString(obj[k]);
            } else if (obj[k] && typeof obj[k] === 'object') {
                normalizePgArraysInObject(obj[k]);
            }
        }
        return obj;
    }

    const processedData = {};
    for (const [key, value] of Object.entries(data)) {
        if (key === 'feed_records_id' || key === 'records_id') {
            processedData[key] = formatPgArrayString(value);
            continue;
        }

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

        if (processedData[key] && typeof processedData[key] === 'object') {
            normalizePgArraysInObject(processedData[key]);
        }
    }

    const jsonString = JSON.stringify(processedData, null, 2);
    body.innerHTML = formatJSON(jsonString);
    window._currentDetailsOriginalHTML = body.innerHTML;
    const searchInput = document.getElementById('detailsModalSearch');
    if (searchInput) searchInput.value = '';

    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

function parseSideBySideDiff(diffText) {
    if (!diffText || !diffText.trim()) return [];

    const lines = diffText.split(/\r?\n/);
    const result = [];

    let currentOldLine = 1;
    let currentNewLine = 1;

    let removedBuffer = [];
    let addedBuffer = [];

    function flushBuffers() {
        const count = Math.max(removedBuffer.length, addedBuffer.length);
        for (let i = 0; i < count; i++) {
            const left = i < removedBuffer.length ? removedBuffer[i] : null;
            const right = i < addedBuffer.length ? addedBuffer[i] : null;

            result.push({
                type: 'split-row',
                left: left ? {
                    lineNum: left.lineNum,
                    sign: '-',
                    content: left.content,
                    type: 'removed'
                } : {
                    lineNum: '',
                    sign: '',
                    content: '',
                    type: 'empty'
                },
                right: right ? {
                    lineNum: right.lineNum,
                    sign: '+',
                    content: right.content,
                    type: 'added'
                } : {
                    lineNum: '',
                    sign: '',
                    content: '',
                    type: 'empty'
                }
            });
        }
        removedBuffer = [];
        addedBuffer = [];
    }

    for (let line of lines) {
        if (line.startsWith('@@')) {
            flushBuffers();
            const match = line.match(/@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
            if (match) {
                currentOldLine = parseInt(match[1], 10);
                currentNewLine = parseInt(match[3], 10);
            }
            result.push({
                type: 'hunk',
                content: line
            });
            continue;
        }

        if (line.startsWith('-')) {
            removedBuffer.push({
                lineNum: currentOldLine++,
                content: line.substring(1)
            });
        } else if (line.startsWith('+')) {
            addedBuffer.push({
                lineNum: currentNewLine++,
                content: line.substring(1)
            });
        } else {
            flushBuffers();
            const text = line.startsWith(' ') ? line.substring(1) : line;
            result.push({
                type: 'split-row',
                left: {
                    lineNum: currentOldLine++,
                    sign: ' ',
                    content: text,
                    type: 'unchanged'
                },
                right: {
                    lineNum: currentNewLine++,
                    sign: ' ',
                    content: text,
                    type: 'unchanged'
                }
            });
        }
    }

    flushBuffers();
    return result;
}

function renderDiffViewer(data) {
    const diffText = (data['diff'] || '').trim();
    const newPath = data['new_path'] || '';
    const oldPath = data['old_path'] || '';
    const isNewFile = data['new_file'] === 'true' || data['new_file'] === true;
    const isRenamed = data['renamed_file'] === 'true' || data['renamed_file'] === true;
    const isDeleted = data['deleted_file'] === 'true' || data['deleted_file'] === true;

    const message = (data['message'] || '').trim();
    const firstLineMessage = message.split('\n')[0] || 'No commit message';
    const author = data['author_name'] || '';
    const date = data['authored_date'] || data['committed_date'] || '';
    const commitId = data['id'] || '';
    const commitWebUrl = data['web_url'] || (commitId ? `https://gitlabce.kenda.com.tw/tc/recipes/kitting/-/commit/${commitId}` : '#');

    const rawStatus = (data['pipeline_status'] || data['status'] || '').toLowerCase();
    const pipelineId = data['pipeline_id'] || '';
    const pipelineWebUrl = data['pipeline_web_url'] || '';

    let statusClass = 'dot-na';
    let statusText = 'Không có';
    if (rawStatus === 'success' || rawStatus === 'passed') {
        statusClass = 'dot-passed';
        statusText = 'Passed';
    } else if (rawStatus === 'failed') {
        statusClass = 'dot-failed';
        statusText = 'Failed';
    } else if (rawStatus === 'running') {
        statusClass = 'dot-running';
        statusText = 'Running';
    } else if (rawStatus === 'pending' || rawStatus === 'waiting_for_resource' || rawStatus === 'created') {
        statusClass = 'dot-pending';
        statusText = 'Pending';
    } else if (rawStatus === 'canceled' || rawStatus === 'cancelled') {
        statusClass = 'dot-canceled';
        statusText = 'Canceled';
    } else if (rawStatus === 'skipped') {
        statusClass = 'dot-skipped';
        statusText = 'Skipped';
    } else if (rawStatus === 'manual') {
        statusClass = 'dot-manual';
        statusText = 'Manual';
    }

    const idTooltip = pipelineId ? ` #${pipelineId}` : '';
    let pipelineDotHtml = '';
    if (pipelineWebUrl) {
        pipelineDotHtml = `<a class="pipeline-status-dot ${statusClass}" href="${escapeHtml(pipelineWebUrl)}" target="_blank" rel="noopener noreferrer" title="Pipeline: ${escapeHtml(statusText)}${escapeHtml(idTooltip)} (Nhấp để mở)"></a>`;
    } else {
        pipelineDotHtml = `<span class="pipeline-status-dot ${statusClass}" title="Pipeline: ${escapeHtml(statusText)}${escapeHtml(idTooltip)}"></span>`;
    }

    let headerHtml = `
        <div class="diff-compact-header">
            <div class="diff-header-top">
                <div class="diff-commit-title" title="${escapeHtml(message)}">${escapeHtml(firstLineMessage)}</div>
            </div>
            <div class="diff-header-bottom">
                <div class="diff-header-meta-group">
                    ${pipelineDotHtml}
                    ${commitId ? `<a class="diff-meta-sha-link" href="${escapeHtml(commitWebUrl)}" target="_blank" rel="noopener noreferrer" title="Mở trên GitLab: ${escapeHtml(commitId)}"><span class="material-symbols-outlined">commit</span> <span>Open Commit in Gitlabce</span> <span class="material-symbols-outlined yaml-link-open-icon" aria-hidden="true">open_in_new</span></a>` : ''}
                </div>
                <div class="diff-meta-info">
                    ${author ? `<span class="diff-meta-tag"><span class="material-symbols-outlined">person</span> ${escapeHtml(author)}</span>` : ''}
                    ${date ? `<span class="diff-meta-tag"><span class="material-symbols-outlined">schedule</span> ${escapeHtml(date)}</span>` : ''}
                </div>
            </div>
        </div>
    `;

    let diffHtml = '';
    if (!diffText) {
        diffHtml = `
            <div class="diff-viewer diff-viewer-empty">
                <div class="diff-empty-notice">
                    <span class="material-symbols-outlined">info</span>
                    <span>Không phát hiện thay đổi nội dung nào trong tệp này tại commit đã chọn.</span>
                </div>
            </div>
        `;
    } else {
        const parsed = parseSideBySideDiff(diffText);
        const hasRemovedLines = parsed.some(item => item.type === 'split-row' && item.left.type === 'removed');
        const hasAddedLines = parsed.some(item => item.type === 'split-row' && item.right.type === 'added');
        const isSingleNewFile = isNewFile || (!hasRemovedLines && hasAddedLines);

        let gutterRows = '';
        let leftRows = '';
        let rightRows = '';

        if (isSingleNewFile) {
            // Trường hợp commit thêm mới file hoàn toàn: chỉ hiển thị 1 pane duy nhất bên phải chiếm trọn 100% chiều rộng
            parsed.forEach(item => {
                if (item.type === 'hunk') {
                    gutterRows += `<div class="diff-gutter-num hunk-num">@@</div>`;
                    rightRows += `<div class="diff-line-row hunk"><span class="diff-sign"> </span><span class="diff-line-text">${escapeHtml(item.content)}</span></div>`;
                } else if (item.type === 'split-row') {
                    const lineNum = item.right.lineNum || item.left.lineNum || '';
                    gutterRows += `<div class="diff-gutter-num">${lineNum}</div>`;
                    const rightContent = item.right.type !== 'empty'
                        ? `<span class="diff-sign">${escapeHtml(item.right.sign)}</span><span class="diff-line-text">${escapeHtml(item.right.content)}</span>`
                        : (item.left.type !== 'empty' ? `<span class="diff-sign">+</span><span class="diff-line-text">${escapeHtml(item.left.content)}</span>` : '');
                    rightRows += `<div class="diff-line-row added">${rightContent}</div>`;
                }
            });

            diffHtml = `
                <div class="diff-split-container diff-single-new-mode">
                    <div class="diff-split-gutter-col" id="diffGutter">
                        <div class="diff-gutter-inner" id="diffGutterInner">
                            ${gutterRows}
                        </div>
                    </div>
                    <div class="diff-split-panes-wrapper">
                        <div class="diff-split-pane-half diff-pane-right diff-pane-full" id="diffPaneRight">
                            <div class="diff-pane-inner-table">
                                ${rightRows}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Trường hợp chỉnh sửa (Modify): hiển thị Side-by-Side Split 2 Pane trái/phải
            parsed.forEach(item => {
                if (item.type === 'hunk') {
                    gutterRows += `<div class="diff-gutter-num hunk-num">@@</div>`;
                    leftRows += `<div class="diff-line-row hunk"><span class="diff-sign"> </span><span class="diff-line-text">${escapeHtml(item.content)}</span></div>`;
                    rightRows += `<div class="diff-line-row hunk"><span class="diff-sign"> </span><span class="diff-line-text"></span></div>`;
                } else if (item.type === 'split-row') {
                    const lineNum = item.left.lineNum || item.right.lineNum || '';
                    const leftClass = item.left.type;
                    const rightClass = item.right.type;

                    gutterRows += `<div class="diff-gutter-num">${lineNum}</div>`;

                    const leftContent = item.left.type !== 'empty' 
                        ? `<span class="diff-sign">${escapeHtml(item.left.sign)}</span><span class="diff-line-text">${escapeHtml(item.left.content)}</span>` 
                        : '';
                    leftRows += `<div class="diff-line-row ${leftClass}">${leftContent}</div>`;

                    const rightContent = item.right.type !== 'empty' 
                        ? `<span class="diff-sign">${escapeHtml(item.right.sign)}</span><span class="diff-line-text">${escapeHtml(item.right.content)}</span>` 
                        : '';
                    rightRows += `<div class="diff-line-row ${rightClass}">${rightContent}</div>`;
                }
            });

            diffHtml = `
                <div class="diff-split-container">
                    <div class="diff-split-gutter-col" id="diffGutter">
                        <div class="diff-gutter-inner" id="diffGutterInner">
                            ${gutterRows}
                        </div>
                    </div>
                    <div class="diff-split-panes-wrapper">
                        <div class="diff-split-pane-half diff-pane-left" id="diffPaneLeft">
                            <div class="diff-pane-inner-table">
                                ${leftRows}
                            </div>
                        </div>
                        <div class="diff-split-pane-half diff-pane-right" id="diffPaneRight">
                            <div class="diff-pane-inner-table">
                                ${rightRows}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    return headerHtml + diffHtml;
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
        // Lấy raw content nếu có (khi xem YAML) hoặc text content mặc định
        const textToCopy = window._currentRawYamlContent || modalBody.textContent;
        
        // Copy vào clipboard
        await navigator.clipboard.writeText(textToCopy);
        
        // Visual feedback
        if (copyBtn) {
            const originalHTML = copyBtn.innerHTML;
            copyBtn.classList.add('copied');
            copyBtn.innerHTML = '<span class="material-symbols-outlined">check</span> <span>Copied!</span>';
            
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
        textarea.value = window._currentRawYamlContent || modalBody.textContent;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
            document.execCommand('copy');
            
            if (copyBtn) {
                const originalHTML = copyBtn.innerHTML;
                copyBtn.classList.add('copied');
                copyBtn.innerHTML = '<span class="material-symbols-outlined">check</span> <span>Copied!</span>';
                
                setTimeout(() => {
                    copyBtn.classList.remove('copied');
                    copyBtn.innerHTML = originalHTML;
                }, 2000);
            }
            
        } catch (fallbackErr) {
            showAlert('Unable to copy data. Please try again.', 'error');
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
                    const unquoted = match.slice(1, -1);
                    if (/^https?:\/\//i.test(unquoted)) {
                        return '<span class="' + cls + '">"<a href="' + unquoted + '" target="_blank" rel="noopener noreferrer" class="json-url-link" onclick="event.stopPropagation(); window.open(\'' + unquoted + '\', \'_blank\', \'noopener,noreferrer\'); return false;" style="color: #38bdf8; text-decoration: underline; cursor: pointer; pointer-events: auto; word-break: break-all;">' + unquoted + ' <span class="material-symbols-outlined" style="font-size: 13px; vertical-align: middle; text-decoration: none;">open_in_new</span></a>"</span>';
                    }
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
    if (modal) {
        modal.classList.add('hidden');
        const content = modal.querySelector('.details-modal-content');
        if (content) {
            content.classList.remove('details-modal-diff-wide');
        }
        resetDetailsModalBody(modal);
        const copyBtn = document.getElementById('copyDetailsBtn');
        if (copyBtn) {
            copyBtn.style.display = '';
        }
    }
    const searchInput = document.getElementById('detailsModalSearch');
    if (searchInput) {
        searchInput.value = '';
    }
    window._currentRawYamlContent = null;
    window._currentDetailsOriginalHTML = null;
    document.body.classList.remove('modal-open');
}

function showAbout() {
    // Use global version variable if available, otherwise fallback
    const appVersion = (typeof appVersion !== 'undefined' && appVersion) ? appVersion : ((typeof version !== 'undefined' && version) ? version : '2.3.0');
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
    const info = getRecipeInfoFromRow(selectedRowData);
    const recipe_id = recipeId || info.recipe_id;
    const product_type = productType || info.product_type;
    if (!recipe_id || !product_type) {
        Toast.warning('Cảnh báo', 'Chưa chọn hàng dữ liệu hoặc thiếu thông tin quy cách.');
        return;
    }

    try {
        const data = await apiFetch('/api/recipes/fetch-commit-gitlab', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipe_id, product_type }),
            showErrorToast: false
        });

        if (data && data.success) {
            if (data.result && data.result.length > 0) {
                outputBarcodeRawData = mapWorkOrderStatus(data.result, data.columns);
                outputBarcodeColumns = data.columns;

                currentOutputTableType = null;
                renderOutputBarcodeTable(outputBarcodeRawData, outputBarcodeColumns);
                Toast.success('Thành công', `Tải thành công ${data.result.length} commit từ Gitlab`);
            } else {
                renderOutputBarcodeTable([], data.columns || []);
                Toast.warning('Không có dữ liệu', data.message || 'Không tìm thấy Commit ở Gitlab nào!');
            }
        } else {
            Toast.error('Lỗi', (data && data.message) || 'Lỗi khi tải Gitlab commit');
        }
    } catch (err) {
        if (!err.toastShown) {
            Toast.error('Lỗi', err.message || 'Lỗi kết nối khi tải Gitlab commit');
        }
    }
}

/**
 * Mở modal chi tiết và hiển thị nội dung YAML/YML chuẩn format code highlight
 * Dùng chung cho: Avada Kedavra (docker-compose.yml), Switching Spell (printers-manager.yaml), Recipe YAML...
 */
function openYamlViewerModal(title, content, filePath = '', showToolbar = false) {
    const modal = document.getElementById('detailsModal');
    if (!modal) return;
    resetDetailsModalBody(modal);
    const copyBtn = document.getElementById('copyDetailsBtn');
    if (copyBtn) copyBtn.style.display = 'none';

    const body = modal.querySelector('.details-modal-body');
    const titleEl = modal.querySelector('.details-modal-title');

    if (titleEl) titleEl.textContent = title || (filePath ? filePath.split('/').pop() : '') || 'YAML Content';
    window._currentRawYamlContent = content || '';

    if (body) {
        body.style.display = 'none';
        body.classList.remove('details-modal-body-yaml', 'details-modal-body-actions', 'details-modal-body-diff');
        body.innerHTML = '';
    }

    const wrapper = modal.querySelector('.details-modal-body-wrapper');
    if (wrapper) {
        wrapper.classList.add('has-yaml-content');
        wrapper.querySelectorAll('.diff-compact-header, .diff-split-container, .diff-viewer-empty, .yaml-toolbar, .yaml-error-drawer, .yaml-code-scroll, .actions-version-tabs-bar, #actionsCommitCardsGrid, .actions-syntax-banner, #actionsDiffSection').forEach(el => el.remove());
        wrapper.insertAdjacentHTML('beforeend', renderYamlWithErrors(content || '', filePath || title, []));
        
        // Riêng detailModal xem printers-manager.yaml và docker-compose.yml thì loại bỏ yaml-toolbar
        if (!showToolbar) {
            wrapper.querySelectorAll('.yaml-toolbar, .yaml-error-drawer').forEach(el => el.remove());
        }

        wrapper.scrollTop = 0;
        const codeScroll = wrapper.querySelector('.yaml-code-scroll');
        window._currentDetailsOriginalHTML = codeScroll ? codeScroll.innerHTML : wrapper.innerHTML;
    }

    const searchInput = document.getElementById('detailsModalSearch');
    if (searchInput) searchInput.value = '';

    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
}
window.openYamlViewerModal = openYamlViewerModal;

async function fetchYamlContent(rowData = null) {
    const dataObj = rowData || selectedRowData;
    const info = getRecipeInfoFromRow(dataObj);
    const recipe_id = info.recipe_id;
    const product_type = info.product_type;

    if (!recipe_id || !product_type) {
        Toast.warning('Cảnh báo', 'Thiếu thông tin recipe_id hoặc product_type');
        return;
    }

    try {
        const data = await apiFetch('/api/recipes/fetch-yaml-content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipe_id, product_type }),
            showErrorToast: false
        });

        if (!data || !data.success) {
            Toast.error('Lỗi', (data && data.message) ? data.message : 'Không tải được nội dung yaml');
            return;
        }

        Toast.success('Thành công', 'Đã tải nội dung YAML');
        const modal = document.getElementById('detailsModal');
        if (!modal) return;
        resetDetailsModalBody(modal);
        const copyBtn = document.getElementById('copyDetailsBtn');
        if (copyBtn) copyBtn.style.display = 'none';

        const body = modal.querySelector('.details-modal-body');
        const titleEl = modal.querySelector('.details-modal-title');

        if (titleEl) titleEl.textContent = data.file_name || (data.file_path ? data.file_path.split('/').pop() : '') || 'Recipe YAML';

        // Lưu raw content để nút copy trong header chép chính xác raw YAML
        window._currentRawYamlContent = data.content;

        const resolvedProductType = data.product_type || product_type;
        const labelConfigKeys = data.label_config_keys || (data.all_label_config_keys ? data.all_label_config_keys[resolvedProductType] : null) || [];

        const clientErrors = detectYamlErrors(data.content, resolvedProductType, labelConfigKeys, data.all_label_config_keys);
        const serverErrors = (data.validation && data.validation.errors) || data.errors || [];
        
        // Merge and deduplicate errors by lineIndex and message
        const combinedErrors = [...clientErrors];
        serverErrors.forEach(sErr => {
            const idx = (typeof sErr.lineIndex === 'number') ? sErr.lineIndex : (sErr.line_number ? sErr.line_number - 1 : 0);
            const exists = combinedErrors.some(c => c.lineIndex === idx && (c.message === sErr.message || c.type === sErr.type));
            if (!exists) {
                combinedErrors.push({
                    lineIndex: idx,
                    type: sErr.type || 'server_validation_error',
                    message: sErr.message
                });
            }
        });

        // Sort errors by lineIndex
        combinedErrors.sort((a, b) => a.lineIndex - b.lineIndex);
        
        const wrapper = modal.querySelector('.details-modal-body-wrapper');
        if (body) {
            body.style.display = 'none';
            body.classList.remove('details-modal-body-yaml', 'details-modal-body-actions', 'details-modal-body-diff');
            body.innerHTML = '';
        }

        if (wrapper) {
            wrapper.classList.add('has-yaml-content');
            wrapper.querySelectorAll('.yaml-toolbar, .yaml-error-drawer, .yaml-code-scroll, .yaml-path-wrapper, .yaml-toolbar-status').forEach(el => el.remove());
            wrapper.insertAdjacentHTML('beforeend', renderYamlWithErrors(data.content, data.file_path, combinedErrors, resolvedProductType, labelConfigKeys, data.web_url));
            wrapper.scrollTop = 0;
            const codeScroll = wrapper.querySelector('.yaml-code-scroll');
            window._currentDetailsOriginalHTML = codeScroll ? codeScroll.innerHTML : wrapper.innerHTML;
        }
        const searchInput = document.getElementById('detailsModalSearch');
        if (searchInput) searchInput.value = '';
        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');

    } catch (err) {
        Toast.error('Lỗi', err.message || 'Lỗi kết nối khi tải nội dung YAML');
    }
}

/**
 * Tìm và hiển thị Commit liên quan đến actions.yaml của quy cách:
 * - Commit 1: Edit actions.yaml trên nhánh (source branch)
 * - Commit 2: Merge commit vào master
 * - Thông tin Merge Request và Diff chi tiết
 * - Hỗ trợ đa phiên bản (Multi-matches Version Tabs)
 * @param {Object} rowData 
 */
async function fetchActionsCommitByRecipe(rowData = null) {
    const dataObj = rowData || selectedRowData;
    const info = getRecipeInfoFromRow(dataObj);
    const recipe_id = info.recipe_id;
    const product_type = info.product_type;
    const actual_filename = info.fileName || (recipe_id ? (recipe_id.endsWith('.yaml') ? recipe_id : recipe_id + '.yaml') : null);

    if (!recipe_id) {
        Toast.warning('Cảnh báo', 'Thiếu thông tin recipe_id');
        return;
    }

    try {
        const data = await apiFetch('/api/recipes/search-actions-commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipe_id, product_type, actual_filename }),
            showErrorToast: false
        });

        if (!data || !data.success) {
            Toast.error('Lỗi', (data && data.message) ? data.message : 'Không tìm thấy commit actions.yaml');
            return;
        }

        const result = data.result;
        Toast.success('Thành công', `Đã tìm thấy ${result.total_matches_found || 1} commit actions.yaml cho quy cách ${result.recipe_id}`);

        const modal = document.getElementById('detailsModal');
        if (!modal) return;

        modal.classList.add('actions-commit-mode');

        const copyBtn = document.getElementById('copyDetailsBtn');
        if (copyBtn) copyBtn.style.display = 'none';

        const wrapper = modal.querySelector('.details-modal-body-wrapper');
        const body = modal.querySelector('.details-modal-body');
        const titleEl = modal.querySelector('.details-modal-title');

        if (titleEl) {
            if (result.actual_filename && result.actual_filename !== result.recipe_id + '.yaml' && result.actual_filename !== result.recipe_id) {
                titleEl.textContent = `Actions Commit: ${result.recipe_id} (${result.actual_filename})`;
            } else {
                titleEl.textContent = `Actions Commit: ${result.recipe_id}`;
            }
        }

        // Lưu dữ liệu toàn cục để hỗ trợ chuyển đổi giữa các version match
        window._currentActionsCommitData = result;
        window._currentActionsCommitIndex = 0;
        window._actionsDiffShowFull = false;
        window._actionsCommitShowAllVersions = false;

        // Cập nhật nội dung sao chép toàn bộ
        updateActionsCommitCopyReport(result, 0);

        if (body) {
            body.style.display = 'none';
            body.classList.remove('details-modal-body-yaml', 'details-modal-body-actions', 'details-modal-body-diff');
        }

        if (wrapper) {
            wrapper.classList.add('has-actions-commit');
            wrapper.querySelectorAll('.actions-version-tabs-bar, #actionsCommitCardsGrid, .actions-syntax-banner, #actionsDiffSection').forEach(el => el.remove());
            wrapper.insertAdjacentHTML('beforeend', renderActionsCommitModal(result, 0));
        }

        window._currentDetailsOriginalHTML = null;
        const commitSearchInput = document.getElementById('detailsModalSearch');
        if (commitSearchInput) commitSearchInput.value = '';

        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');

    } catch (err) {
        if (!err.toastShown) {
            Toast.error('Lỗi', err.message || 'Lỗi kết nối khi tìm kiếm commit actions.yaml');
        }
    }
}

/**
 * Render Pipeline Status Badge kèm liên kết trực tiếp sang GitLab Pipeline
 * @param {Object} [pipeline]
 * @returns {string} HTML markup
 */
function renderPipelineBadge(pipeline) {
    if (!pipeline || !pipeline.status) {
        return `<span class="pipeline-badge pipeline-na" title="Chưa có pipeline hoặc không tìm thấy"><span class="material-symbols-outlined pipeline-icon">remove</span><span>Không có</span></span>`;
    }
    const status = (pipeline.status || '').toLowerCase();
    let statusClass = 'pipeline-na';
    let icon = 'help_outline';
    let text = pipeline.status;

    if (status === 'success' || status === 'passed') {
        statusClass = 'pipeline-passed';
        icon = 'check_circle';
        text = 'Passed';
    } else if (status === 'failed') {
        statusClass = 'pipeline-failed';
        icon = 'cancel';
        text = 'Failed';
    } else if (status === 'running') {
        statusClass = 'pipeline-running';
        icon = 'progress_activity';
        text = 'Running';
    } else if (status === 'pending' || status === 'waiting_for_resource') {
        statusClass = 'pipeline-pending';
        icon = 'hourglass_empty';
        text = 'Pending';
    } else if (status === 'canceled' || status === 'cancelled') {
        statusClass = 'pipeline-canceled';
        icon = 'block';
        text = 'Canceled';
    } else if (status === 'skipped') {
        statusClass = 'pipeline-skipped';
        icon = 'fast_forward';
        text = 'Skipped';
    } else if (status === 'manual') {
        statusClass = 'pipeline-manual';
        icon = 'play_circle';
        text = 'Manual';
    }

    const idText = pipeline.id ? ` #${pipeline.id}` : '';
    const contentHtml = `<span class="material-symbols-outlined pipeline-icon ${status === 'running' ? 'spin' : ''}">${icon}</span><span>${escapeHtml(text)}${idText}</span>`;

    if (pipeline.web_url) {
        return `<a href="${escapeHtml(pipeline.web_url)}" target="_blank" rel="noopener noreferrer" class="pipeline-badge ${statusClass} pipeline-link" title="Mở GitLab Pipeline #${pipeline.id || ''}">${contentHtml}<span class="material-symbols-outlined pipeline-open-icon">open_in_new</span></a>`;
    }
    return `<span class="pipeline-badge ${statusClass}">${contentHtml}</span>`;
}

/**
 * Cập nhật nội dung văn bản sao chép cho nút Copy ở Details Modal Header
 */
function updateActionsCommitCopyReport(result, activeIndex = 0) {
    const matches = result.matches && result.matches.length > 0 ? result.matches : [result];
    const item = matches[activeIndex] || matches[0];

    let copyReport = `=== KẾT QUẢ KIỂM TRA ACTIONS.YAML ===\n` +
        `Quy cách: ${result.recipe_id}\n` +
        `File GitLab: ${result.actual_filename || (result.recipe_id + '.yaml')}\n` +
        `Phiên bản: Lần ${matches.length - activeIndex}/${matches.length} (Thêm mới)\n`;

    if (item.merge_request) {
        copyReport += `Merge Request: !${item.merge_request.iid} - ${item.merge_request.title} (${(item.merge_request.state || 'merged').toUpperCase()})\n` +
            `URL MR: ${item.merge_request.web_url}\n`;
    }

    copyReport += `\n1. Commit trên nhánh (Patch Branch):\n` +
        `   - Commit SHA: ${item.commit_edit.id}\n` +
        `   - Tên nhánh: ${item.commit_edit.source_branch || 'N/A'}\n` +
        `   - Pipeline: ${item.commit_edit.pipeline ? (item.commit_edit.pipeline.status || 'N/A').toUpperCase() + (item.commit_edit.pipeline.web_url ? ` (${item.commit_edit.pipeline.web_url})` : '') : 'N/A'}\n` +
        `   - Người tạo: ${item.commit_edit.author_name || 'N/A'}\n` +
        `   - Thời gian: ${item.commit_edit.authored_date || 'N/A'}\n` +
        `   - URL: ${item.commit_edit.web_url || 'N/A'}\n`;

    if (item.validation) {
        if (!item.validation.is_valid) {
            copyReport += `\n[CẢNH BÁO LỖI ACTIONS.YAML]\n` +
                `- Trạng thái: LỖI ĐỊNH DẠNG / THỤT LỀ\n` +
                `- Chi tiết: ${(item.validation.errors || []).join('; ')}\n`;
            if (item.validation.has_indent_error) {
                copyReport += `- Lưu ý: Dòng 'files:' phải thụt lề 2 khoảng trắng dưới 'recipe:'\n`;
            }
        } else {
            copyReport += `\n[CẤU TRÚC ACTIONS.YAML]: Hợp lệ (Chuẩn 2 spaces)\n`;
        }
    }

    if (item.diff) {
        copyReport += `\n=== DIFF ACTIONS.YAML ===\n${item.diff}\n`;
    }

    window._currentRawYamlContent = copyReport;
}

/**
 * Render nội dung các dòng diff của actions.yaml, tự động thu gọn các dòng không liên quan
 * @param {string} diffText
 * @param {string[]} candidates
 * @param {boolean} showFull
 * @returns {{ html: string, hasFolded: boolean, totalLines: number, hiddenCount: number }}
 */
function buildActionsDiffLinesHtml(diffText, candidates, showFull = false) {
    if (!diffText) {
        return {
            html: '<div class="diff-line diff-unchanged" style="padding: 12px 14px; justify-content: center; color: var(--color-text-muted);">Không có nội dung diff</div>',
            hasFolded: false,
            totalLines: 0,
            hiddenCount: 0
        };
    }

    // Loại bỏ hoàn toàn các dòng hunk header (@@ ... @@) theo yêu cầu người dùng
    const rawLines = diffText.split('\n').filter(line => !line.startsWith('@@'));
    const totalLines = rawLines.length;

    // Chuẩn hóa candidates để tìm kiếm
    const normCandidates = (candidates || [])
        .map(c => (c || '').trim().toLowerCase())
        .filter(c => c.length > 2);

    const parsed = rawLines.map((line, idx) => {
        const lineLower = line.toLowerCase();
        const isAdd = line.startsWith('+') && !line.startsWith('+++');
        const isDel = line.startsWith('-') && !line.startsWith('---');
        // Match target: Dòng thêm mới hoặc thay đổi chứa bất kỳ candidate nào
        const isTarget = (isAdd || isDel) && normCandidates.some(cand => {
            const candNoExt = cand.replace(/\.ya?ml$/i, '');
            return lineLower.includes(cand) || (candNoExt.length > 3 && lineLower.includes(candNoExt));
        });
        return { index: idx, line, isTarget, isAdd, isDel };
    });

    const targetIndices = parsed.filter(p => p.isTarget).map(p => p.index);
    let keptIndices = new Set();

    if (showFull || totalLines <= 10) {
        // Hiện tất cả khi được yêu cầu hoặc diff ngắn
        parsed.forEach(p => keptIndices.add(p.index));
    } else if (targetIndices.length === 0) {
        // Nếu không phát hiện target nhưng file dài: giữ 6 dòng đầu & 6 dòng cuối
        if (totalLines <= 16) {
            parsed.forEach(p => keptIndices.add(p.index));
        } else {
            for (let i = 0; i < 6; i++) keptIndices.add(i);
            for (let i = totalLines - 6; i < totalLines; i++) keptIndices.add(i);
        }
    } else {
        // Chế độ thu gọn thông minh: Giữ 3 dòng trước và 3 dòng sau mỗi target line
        targetIndices.forEach(tIdx => {
            const start = Math.max(0, tIdx - 3);
            const end = Math.min(totalLines - 1, tIdx + 3);
            for (let i = start; i <= end; i++) keptIndices.add(i);

            // Giữ header đầu file nếu gần (<= 5 dòng)
            if (tIdx <= 5) {
                for (let i = 0; i <= tIdx; i++) keptIndices.add(i);
            }
        });

        // Hợp nhất các khoảng trống nhỏ (<= 3 dòng) để tránh bị chia vụn
        const sorted = Array.from(keptIndices).sort((a, b) => a - b);
        for (let i = 0; i < sorted.length - 1; i++) {
            const gap = sorted[i+1] - sorted[i] - 1;
            if (gap > 0 && gap <= 3) {
                for (let fill = sorted[i] + 1; fill < sorted[i+1]; fill++) {
                    keptIndices.add(fill);
                }
            }
        }
    }

    const sortedKept = Array.from(keptIndices).sort((a, b) => a - b);
    const hiddenCount = totalLines - sortedKept.length;
    const hasFolded = hiddenCount > 0;

    let html = '';
    let prev = -1;

    for (const kIdx of sortedKept) {
        if (prev !== -1 && kIdx - prev > 1) {
            const count = kIdx - prev - 1;
            html += `
                <div class="diff-line diff-folded" onclick="toggleActionsDiffFullView(event)" title="Nhấp để xem toàn bộ ${totalLines} dòng">
                    <span class="diff-sign">⋯</span>
                    <span class="diff-line-code">
                        <span class="diff-folded-content">
                            <span>... (${count} dòng khác bị ẩn) ...</span>
                            <span class="diff-folded-badge">Nhấp để mở rộng</span>
                        </span>
                    </span>
                </div>
            `;
        } else if (prev === -1 && kIdx > 0) {
            const count = kIdx;
            html += `
                <div class="diff-line diff-folded" onclick="toggleActionsDiffFullView(event)" title="Nhấp để xem toàn bộ ${totalLines} dòng">
                    <span class="diff-sign">⋯</span>
                    <span class="diff-line-code">
                        <span class="diff-folded-content">
                            <span>... (${count} dòng trước đó bị ẩn) ...</span>
                            <span class="diff-folded-badge">Nhấp để mở rộng</span>
                        </span>
                    </span>
                </div>
            `;
        }

        const item = parsed[kIdx];
        const line = item.line;
        const escaped = escapeHtml(line);
        let lineClass = 'diff-line';
        let lineSign = ' ';

        if (item.isAdd) {
            lineClass += ' diff-added';
            lineSign = '+';
        } else if (item.isDel) {
            lineClass += ' diff-removed';
            lineSign = '-';
        } else {
            lineClass += ' diff-unchanged';
        }

        if (item.isTarget) {
            lineClass += ' diff-line-target';
        }

        const textOnly = (line.startsWith('+') || line.startsWith('-')) ? escaped.substring(1) : escaped;
        const targetBadge = item.isTarget ? '<span class="diff-target-badge">MATCH</span>' : '';

        html += `<div class="${lineClass}"><span class="diff-sign">${lineSign}</span><span class="diff-line-code">${textOnly}</span>${targetBadge}</div>`;
        prev = kIdx;
    }

    if (prev !== -1 && prev < totalLines - 1) {
        const count = totalLines - 1 - prev;
        html += `
            <div class="diff-line diff-folded" onclick="toggleActionsDiffFullView(event)" title="Nhấp để xem toàn bộ ${totalLines} dòng">
                <span class="diff-sign">⋯</span>
                <span class="diff-line-code">
                    <span class="diff-folded-content">
                        <span>... (${count} dòng sau đó bị ẩn) ...</span>
                        <span class="diff-folded-badge">Nhấp để mở rộng</span>
                    </span>
                </span>
            </div>
        `;
    }

    return { html, hasFolded, totalLines, hiddenCount };
}

/**
 * Render giao diện hiển thị thông tin commit actions.yaml và Diff trực quan
 * @param {Object} result 
 * @param {number} activeIndex 
 * @returns {string} HTML markup
 */
function renderActionsCommitModal(result, activeIndex = 0) {
    const matches = result.matches && result.matches.length > 0 ? result.matches : [result];
    const activeMatch = matches[activeIndex] || matches[0];

    const edit = activeMatch.commit_edit || {};
    const mr = activeMatch.merge_request;
    const diff = activeMatch.diff || '';
    const recipeId = result.recipe_id || '';
    const cleanRecipeId = recipeId.replace('.yaml', '').trim();
    const candidates = (result.search_candidates && result.search_candidates.length > 0)
        ? result.search_candidates
        : [result.actual_filename, cleanRecipeId].filter(Boolean);

    // Version Tabs Selector (USER RULE: actions-version-bar-meta loại bỏ, không cần thiết; giới hạn tối đa 5 commit gần nhất kèm nút Xem thêm)
    let versionTabsHtml = '';
    if (matches.length > 1) {
        const isExpanded = !!window._actionsCommitShowAllVersions || activeIndex >= 5;
        const visibleIndices = (matches.length > 5 && !isExpanded) ? [0, 1, 2, 3, 4] : matches.map((_, i) => i);

        const tabsList = visibleIndices.map(idx => {
            const m = matches[idx];
            const isAct = idx === activeIndex;
            const mEdit = m.commit_edit || {};
            const timeDate = mEdit.authored_date ? mEdit.authored_date.split(' ')[0] : '';
            const verNum = matches.length - idx;
            const label = `Lần ${verNum}${timeDate ? ` (${timeDate})` : ''}`;
            const badgeText = idx === 0 ? '<span class="tab-badge-new">Mới nhất</span>' : '';

            // Pipeline & Syntax validation error checks
            const mPipeStatus = (mEdit.pipeline && mEdit.pipeline.status) ? mEdit.pipeline.status.toLowerCase() : '';
            const isPipeSuccess = mPipeStatus === 'success' || mPipeStatus === 'passed';
            const isPipeError = !isPipeSuccess;
            const isSyntaxInvalid = m.validation && !m.validation.is_valid;
            const hasError = isSyntaxInvalid || isPipeError;

            let errorTooltip = '';
            if (isSyntaxInvalid && isPipeError) {
                errorTooltip = 'Cấu trúc actions.yaml có lỗi và Pipeline thất bại';
            } else if (isSyntaxInvalid) {
                errorTooltip = 'Cấu trúc actions.yaml có lỗi thụt lề / cú pháp';
            } else if (isPipeError) {
                errorTooltip = `Pipeline chưa thành công: ${mPipeStatus ? mPipeStatus.toUpperCase() : 'ERROR'}`;
            }

            const errorBadge = hasError ? `<span class="tab-badge-error" title="${escapeHtml(errorTooltip)}">Lỗi</span>` : '';
            return `<button type="button" class="actions-version-tab ${isAct ? 'active' : ''} ${hasError ? 'has-error' : ''}" onclick="switchActionsCommitVersion(${idx}, event)"><span>${escapeHtml(label)}</span>${badgeText}${errorBadge}</button>`;
        }).join('');

        let moreBtnHtml = '';
        if (matches.length > 5) {
            const hiddenCount = matches.length - 5;
            if (!isExpanded) {
                moreBtnHtml = `
                    <button type="button" class="actions-version-tab-more-btn" onclick="toggleActionsCommitShowAllVersions(event)" title="Xem thêm ${hiddenCount} commit cũ hơn">
                        <span>Xem thêm (+${hiddenCount})</span>
                        <span class="material-symbols-outlined">expand_more</span>
                    </button>
                `;
            } else {
                moreBtnHtml = `
                    <button type="button" class="actions-version-tab-more-btn active" onclick="toggleActionsCommitShowAllVersions(event)" title="Thu gọn chỉ xem 5 commit gần nhất">
                        <span>Thu gọn</span>
                        <span class="material-symbols-outlined">expand_less</span>
                    </button>
                `;
            }
        }

        versionTabsHtml = `<div class="actions-version-tabs-bar"><div class="actions-version-tabs">${tabsList}${moreBtnHtml}</div></div>`;
    }

    // Check pipeline status on commit_edit
    const pipeStatus = (edit.pipeline && edit.pipeline.status) ? edit.pipeline.status.toLowerCase() : '';
    const isPipelineSuccess = pipeStatus === 'success' || pipeStatus === 'passed';
    const isPipelineError = !isPipelineSuccess;

    // Diff Lines Processing with Smart Fold
    const showFull = !!window._actionsDiffShowFull;
    const diffResult = buildActionsDiffLinesHtml(diff, candidates, showFull);
    const diffLinesHtml = diffResult.html;

    let diffToggleBtnHtml = '';
    if (diffResult.totalLines > 8) {
        if (showFull) {
            diffToggleBtnHtml = `
                <button type="button" class="diff-toggle-view-btn active" onclick="toggleActionsDiffFullView(event)" title="Thu gọn chỉ xem dòng khớp và ngữ cảnh">
                    <span class="material-symbols-outlined">unfold_less</span>
                    <span>Thu gọn</span>
                </button>
            `;
        } else if (diffResult.hasFolded) {
            diffToggleBtnHtml = `
                <button type="button" class="diff-toggle-view-btn" onclick="toggleActionsDiffFullView(event)" title="Mở rộng toàn bộ ${diffResult.totalLines} dòng diff">
                    <span class="material-symbols-outlined">unfold_more</span>
                    <span>Hiện tất cả (${diffResult.totalLines} dòng)</span>
                </button>
            `;
        }
    }

    // YAML Syntax & Indentation Validation Banner
    const validation = activeMatch.validation;
    let validationBannerHtml = '';
    if (validation) {
        if (!validation.is_valid) {
            const errorItems = (validation.errors || []).map(err => `
                <li class="syntax-error-item">
                    <span class="material-symbols-outlined bullet-icon">cancel</span>
                    <span>${escapeHtml(err)}</span>
                </li>
            `).join('');
            const sampleFile = result.actual_filename || (cleanRecipeId ? cleanRecipeId + '.yaml' : 'filename.yaml');
            const hintText = validation.has_indent_error
                ? `<div class="syntax-error-hint">
                    <span class="material-symbols-outlined hint-icon">lightbulb</span>
                    <div class="hint-content">
                        <strong>Cách khắc phục lỗi thụt lề:</strong> Trong file <code>actions.yaml</code>, khóa <code>files:</code> và danh sách các file phải được thụt lề <strong>2 khoảng trắng (2 spaces)</strong> dưới khóa <code>recipe:</code>. Ví dụ chuẩn:
                        <pre class="yaml-example-code">recipe:
  files:
    - ${escapeHtml(sampleFile)}</pre>
                    </div>
                   </div>`
                : '';

            validationBannerHtml = `
                <div class="actions-syntax-banner invalid">
                    <div class="syntax-banner-header">
                        <div class="syntax-banner-title">
                            <span class="material-symbols-outlined banner-status-icon">error</span>
                            <span class="banner-title-text">Phát hiện lỗi actions.yaml tại commit này</span>
                        </div>
                        <span class="syntax-status-badge badge-danger">Lỗi</span>
                    </div>
                    <div class="syntax-banner-body">
                        <ul class="syntax-error-list">
                            ${errorItems}
                        </ul>
                        ${hintText}
                    </div>
                </div>
            `;
        } else {
            validationBannerHtml = `
                <div class="actions-syntax-banner valid">
                    <div class="syntax-banner-header">
                        <div class="syntax-banner-title">
                            <span class="material-symbols-outlined banner-status-icon">verified</span>
                            <span class="banner-title-text">Cấu trúc và nội dung actions.yaml tại commit này hợp lệ</span>
                        </div>
                        <span class="syntax-status-badge badge-success">OK</span>
                    </div>
                </div>
            `;
        }
    }

    // Commit Card on Patch Branch (Executive Dashboard Grid layout)
    const commitCardsGridHtml = `
        <div class="actions-commit-cards-grid" id="actionsCommitCardsGrid">
            <div class="actions-commit-card patch-card ${isPipelineError ? 'pipeline-error' : ''}">
                <div class="actions-card-header">
                    <div class="actions-card-title-wrap">
                        <div class="card-badge patch-badge">
                            <span class="material-symbols-outlined">fork_right</span>
                            <span>Commit trên nhánh Patch</span>
                        </div>
                    </div>
                    <div class="card-header-actions">
                        ${isPipelineError ? `
                            <span class="card-pipeline-error-tag" title="Pipeline chưa thành công: ${escapeHtml(pipeStatus ? pipeStatus.toUpperCase() : 'KHÔNG CÓ')}">
                                <span class="material-symbols-outlined">error</span>
                                <span>ERROR</span>
                            </span>
                        ` : ''}
                        ${edit.web_url ? `
                            <a href="${escapeHtml(edit.web_url)}" target="_blank" rel="noopener noreferrer" class="gitlab-link-btn" title="Xem commit trên GitLab">
                                <span>Open in GitLab</span>
                                <span class="material-symbols-outlined">open_in_new</span>
                            </a>
                        ` : ''}
                    </div>
                </div>
                <div class="actions-card-body">
                    <div class="actions-meta-grid">
                        <div class="actions-meta-cell">
                            <div class="actions-meta-label">
                                <span class="material-symbols-outlined">tag</span>
                                <span>Commit SHA</span>
                            </div>
                            <div class="actions-meta-value">
                                <code class="commit-sha" title="${escapeHtml(edit.id || '')}">${escapeHtml(edit.short_id || (edit.id ? edit.id.substring(0,8) : 'N/A'))}</code>
                                ${edit.id ? `
                                    <button type="button" class="btn-copy-mini" onclick="copyCommitValue('${escapeHtml(edit.id)}', this)" title="Sao chép Full SHA">
                                        <span class="material-symbols-outlined">content_copy</span>
                                    </button>
                                ` : ''}
                            </div>
                        </div>

                        <div class="actions-meta-cell">
                            <div class="actions-meta-label">
                                <span class="material-symbols-outlined">fork_left</span>
                                <span>Tên nhánh</span>
                            </div>
                            <div class="actions-meta-value">
                                <code class="branch-name" title="${escapeHtml(edit.source_branch || 'master')}">${escapeHtml(edit.source_branch || 'master')}</code>
                                ${edit.source_branch ? `
                                    <button type="button" class="btn-copy-mini" onclick="copyCommitValue('${escapeHtml(edit.source_branch)}', this)" title="Sao chép tên nhánh">
                                        <span class="material-symbols-outlined">content_copy</span>
                                    </button>
                                ` : ''}
                            </div>
                        </div>

                        <div class="actions-meta-cell">
                            <div class="actions-meta-label">
                                <span class="material-symbols-outlined">sync</span>
                                <span>Trạng thái Pipeline</span>
                            </div>
                            <div class="actions-meta-value">
                                ${renderPipelineBadge(edit.pipeline)}
                            </div>
                        </div>

                        <div class="actions-meta-cell">
                            <div class="actions-meta-label">
                                <span class="material-symbols-outlined">person</span>
                                <span>Người tạo</span>
                            </div>
                            <div class="actions-meta-value">
                                <span class="author-val">
                                    <span class="material-symbols-outlined user-icon">person</span>
                                    <span>${escapeHtml(edit.author_name || edit.author_username || 'N/A')}</span>
                                </span>
                            </div>
                        </div>

                        <div class="actions-meta-cell">
                            <div class="actions-meta-label">
                                <span class="material-symbols-outlined">schedule</span>
                                <span>Thời gian tạo</span>
                            </div>
                            <div class="actions-meta-value">
                                <span class="time-val">
                                    <span class="material-symbols-outlined time-icon">schedule</span>
                                    <span>${escapeHtml(edit.authored_date || 'N/A')}</span>
                                </span>
                            </div>
                        </div>

                        <div class="actions-meta-cell">
                            <div class="actions-meta-label">
                                <span class="material-symbols-outlined">merge</span>
                                <span>Merge Request</span>
                            </div>
                            <div class="actions-meta-value">
                                ${mr && mr.web_url ? `
                                    <a href="${escapeHtml(mr.web_url)}" target="_blank" rel="noopener noreferrer" class="mr-link-pill" title="Mở Merge Request trên GitLab">
                                        <span class="material-symbols-outlined mr-mini-icon">call_merge</span>
                                        <span class="mr-mini-text">MR !${escapeHtml(String(mr.iid))}</span>
                                        <span class="mr-mini-state ${escapeHtml(mr.state || 'merged')}">${escapeHtml((mr.state || 'merged').toUpperCase())}</span>
                                        <span class="material-symbols-outlined open-mini">open_in_new</span>
                                    </a>
                                ` : `
                                    <span class="no-mr-text">Không qua Merge Request</span>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const diffSectionHtml = `
        <div class="actions-diff-section" id="actionsDiffSection">
            <div class="diff-section-header">
                <div class="diff-section-title">
                    <span class="material-symbols-outlined">difference</span>
                    <span>Thay đổi trong file actions.yaml (Diff)</span>
                </div>
                <div class="diff-header-actions">
                    ${diffToggleBtnHtml}
                </div>
            </div>
            <div class="actions-diff-viewer" id="actionsDiffViewer">
                ${diffLinesHtml}
            </div>
        </div>
    `;

    // USER RULE: Hiển thị thẳng ở details-modal-body-wrapper, không bao bọc bởi container ngoài
    return `
        ${versionTabsHtml}
        ${commitCardsGridHtml}
        ${validationBannerHtml}
        ${diffSectionHtml}
    `;
}

/**
 * Chuyển đổi giữa chế độ xem rút gọn (chỉ dòng match + ngữ cảnh) và toàn bộ các dòng diff
 * @param {Event} [event]
 */
window.toggleActionsDiffFullView = function(event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    window._actionsDiffShowFull = !window._actionsDiffShowFull;
    if (!window._currentActionsCommitData) return;
    const modal = document.getElementById('detailsModal');
    if (!modal) return;
    const wrapper = modal.querySelector('.details-modal-body-wrapper');
    if (!wrapper) return;

    wrapper.querySelectorAll('.actions-version-tabs-bar, #actionsCommitCardsGrid, .actions-syntax-banner, #actionsDiffSection').forEach(el => el.remove());
    wrapper.insertAdjacentHTML('beforeend', renderActionsCommitModal(window._currentActionsCommitData, window._currentActionsCommitIndex || 0));

    // Trên màn hình desktop lớn, giữ wrapper ở đỉnh; trên điện thoại cho phép giữ vị trí cuộn của user
    if (window.innerWidth > 768 && window.innerHeight > 720) {
        wrapper.scrollTop = 0;
    }

    if (window._actionsDiffShowFull) {
        setTimeout(() => {
            const viewer = document.getElementById('actionsDiffViewer');
            const targetEl = viewer ? viewer.querySelector('.diff-line-target') : null;
            if (viewer && targetEl) {
                // Cuộn nội bộ NỘI DUNG bên trong actionsDiffViewer - TUYỆT ĐỐI KHÔNG dùng scrollIntoView để tránh che khuất banner và header
                const viewerRect = viewer.getBoundingClientRect();
                const targetRect = targetEl.getBoundingClientRect();
                const relativeTop = targetRect.top - viewerRect.top + viewer.scrollTop;
                const scrollPos = Math.max(0, relativeTop - (viewer.clientHeight / 2) + (targetEl.clientHeight / 2));
                viewer.scrollTo({
                    top: scrollPos,
                    behavior: 'smooth'
                });
            }
        }, 50);
    }

    window._currentDetailsOriginalHTML = null;
};

/**
 * Mở rộng hoặc thu gọn danh sách phiên bản commit actions (mặc định hiển thị tối đa 5 commit gần nhất)
 * @param {Event} [event]
 */
window.toggleActionsCommitShowAllVersions = function(event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    window._actionsCommitShowAllVersions = !window._actionsCommitShowAllVersions;
    if (!window._currentActionsCommitData) return;
    const modal = document.getElementById('detailsModal');
    if (!modal) return;
    const wrapper = modal.querySelector('.details-modal-body-wrapper');
    if (!wrapper) return;

    // Nếu thu gọn lại mà index hiện tại >= 5, reset về 0 (commit mới nhất) để tab active luôn hiển thị trong top 5
    if (!window._actionsCommitShowAllVersions && (window._currentActionsCommitIndex || 0) >= 5) {
        window._currentActionsCommitIndex = 0;
        updateActionsCommitCopyReport(window._currentActionsCommitData, 0);
    }

    const savedScrollTop = wrapper.scrollTop;
    const currentIndex = window._currentActionsCommitIndex || 0;

    wrapper.querySelectorAll('.actions-version-tabs-bar, #actionsCommitCardsGrid, .actions-syntax-banner, #actionsDiffSection').forEach(el => el.remove());
    wrapper.insertAdjacentHTML('beforeend', renderActionsCommitModal(window._currentActionsCommitData, currentIndex));

    wrapper.scrollTop = savedScrollTop;
    window._currentDetailsOriginalHTML = null;
};

/**
 * Chuyển đổi giữa các phiên bản commit match của quy cách
 * @param {number} index 
 * @param {Event} [event]
 */
window.switchActionsCommitVersion = function(index, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    if (!window._currentActionsCommitData) return;
    const modal = document.getElementById('detailsModal');
    if (!modal) return;
    const wrapper = modal.querySelector('.details-modal-body-wrapper');
    if (!wrapper) return;

    if (index >= 5) {
        window._actionsCommitShowAllVersions = true;
    }

    window._actionsDiffShowFull = false;
    window._currentActionsCommitIndex = index;
    updateActionsCommitCopyReport(window._currentActionsCommitData, index);

    wrapper.querySelectorAll('.actions-version-tabs-bar, #actionsCommitCardsGrid, .actions-syntax-banner, #actionsDiffSection').forEach(el => el.remove());
    wrapper.insertAdjacentHTML('beforeend', renderActionsCommitModal(window._currentActionsCommitData, index));
    wrapper.scrollTop = 0;

    window._currentDetailsOriginalHTML = null;
};

// Global copy helper with instant UI feedback for Actions Commit modal
window.copyCommitValue = async function(text, btnElement) {
    if (!text) return;
    const success = await copyTextToClipboard(text);
    if (success) {
        if (btnElement) {
            const icon = btnElement.querySelector('.material-symbols-outlined');
            if (icon) {
                const oldText = icon.textContent;
                icon.textContent = 'check';
                btnElement.classList.add('copied');
                setTimeout(() => {
                    icon.textContent = oldText;
                    btnElement.classList.remove('copied');
                }, 1500);
            }
        }
        if (typeof Toast !== 'undefined' && Toast.success) {
            const preview = text.length > 25 ? text.substring(0, 25) + '...' : text;
            Toast.success('Đã sao chép', `Đã copy: ${preview}`);
        }
    }
};

/**
 * Trích xuất key từ 1 dòng trong section note của YAML
 * Hỗ trợ các định dạng:
 * - "key: value" # comment
 * - 'key: value'
 * - key: value
 * - "key"
 * @param {string} line
 * @returns {string|null}
 */
function extractNoteKey(line) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('-')) return null;
    let content = trimmed.substring(1).trim();
    if (!content) return null;

    const quoteMatch = content.match(/^"([^"]*)"|^'([^']*)'/);
    if (quoteMatch) {
        const inner = quoteMatch[1] !== undefined ? quoteMatch[1] : quoteMatch[2];
        const colonIdx = inner.indexOf(':');
        if (colonIdx !== -1) {
            return inner.substring(0, colonIdx).trim();
        }
        return inner.trim();
    } else {
        const hashIdx = content.indexOf('#');
        if (hashIdx !== -1) {
            content = content.substring(0, hashIdx).trim();
        }
        const colonIdx = content.indexOf(':');
        if (colonIdx !== -1) {
            return content.substring(0, colonIdx).trim();
        }
        return content.trim();
    }
}

/**
 * Tìm gợi ý key gần đúng khi có lỗi sai định dạng (ví dụ bead-sequence vs bead_sequence)
 * @param {string} key 
 * @param {Array<string>} validKeys 
 * @returns {string|null}
 */
function findCloseLabelKeyMatch(key, validKeys) {
    if (!key || !validKeys || !validKeys.length) return null;
    const normalize = s => s.toLowerCase().replace(/[\s\-_/]/g, '');
    const normalizedKey = normalize(key);
    for (const vk of validKeys) {
        if (normalize(vk) === normalizedKey) {
            return vk;
        }
    }
    for (const vk of validKeys) {
        if (vk.toLowerCase() === key.toLowerCase()) {
            return vk;
        }
    }
    return null;
}

/**
 * Phát hiện lỗi trong nội dung YAML dựa theo các pattern lỗi thực tế từ pipeline & label-config
 * @param {string} content - Nội dung YAML raw
 * @param {string} productType - Loại sản phẩm (ví dụ BEAD, CARCASS_PLY, ...)
 * @param {Array<string>} labelConfigKeys - Danh sách key hợp lệ từ label-config.yml
 * @param {Object} allConfigKeysMap - Toàn bộ map key theo product-type (tùy chọn)
 * @returns {Array} - Mảng { lineIndex, type, message }
 */
function detectYamlErrors(content, productType = null, labelConfigKeys = null, allConfigKeysMap = null) {
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

    // Trích xuất product-type từ YAML nếu chưa có
    let resolvedPt = productType;
    if (!resolvedPt) {
        const ptMatch = content.match(/^\s*product-type\s*:\s*([^\s#\r\n]+)/m) || content.match(/^\s*product_type\s*:\s*([^\s#\r\n]+)/m);
        if (ptMatch) {
            resolvedPt = ptMatch[1].replace(/['"]/g, '').trim();
        }
    }

    // Lấy danh sách keys hợp lệ từ label-config
    let validKeys = labelConfigKeys;
    if ((!validKeys || validKeys.length === 0) && allConfigKeysMap && resolvedPt) {
        validKeys = allConfigKeysMap[resolvedPt] || allConfigKeysMap[resolvedPt.toUpperCase()] || [];
    }

    const validLabelKeySet = (validKeys && validKeys.length > 0) ? new Set(validKeys) : null;

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

        // 1. Kiểm tra các key trong version.note theo label-config
        const isInNote = indentStack.some(s => s.type === 'note');
        if (isInNote && trimmed.startsWith('-') && validLabelKeySet) {
            const noteKey = extractNoteKey(line);
            if (noteKey && !validLabelKeySet.has(noteKey)) {
                const suggestion = findCloseLabelKeyMatch(noteKey, validKeys);
                let msg = '';
                if (suggestion) {
                    msg = `Key "${noteKey}" trong note không đúng định dạng cho ${resolvedPt || 'sản phẩm'} — Gợi ý: "${suggestion}"`;
                } else {
                    msg = `Key "${noteKey}" trong note không thuộc cấu hình ${resolvedPt || 'sản phẩm'}`;
                }
                errors.push({
                    lineIndex: i,
                    type: 'note_label_config_key',
                    message: msg
                });
            }
        }

        // 2. Kiểm tra controls: Chỉ kiểm tra nếu không có dữ liệu thì bắt buộc phải khai báo controls: []
        if (/^\s*controls\s*:/.test(line)) {
            const afterColon = line.split(':')[1].trim();
            if (afterColon === '[]') {
                // Hợp lệ: controls: [] khi không có dữ liệu
            } else if (afterColon === 'null' || afterColon === '~') {
                errors.push({
                    lineIndex: i,
                    type: 'controls_empty',
                    message: "controls: Khóa controls không có dữ liệu, bắt buộc phải khai báo là 'controls: []'"
                });
            } else if (afterColon === '' || afterColon.startsWith('#')) {
                // Kiểm tra xem các dòng tiếp theo có nội dung con (thụt lề sâu hơn) hay không
                const currentLineIndent = line.length - line.trimStart().length;
                let hasChildren = false;
                for (let j = i + 1; j < lines.length; j++) {
                    const nextTrimmed = lines[j].trimStart();
                    if (!nextTrimmed || nextTrimmed.startsWith('#')) continue;
                    const nextIndent = lines[j].length - nextTrimmed.length;
                    if (nextIndent > currentLineIndent) {
                        hasChildren = true;
                    }
                    break;
                }
                if (!hasChildren) {
                    errors.push({
                        lineIndex: i,
                        type: 'controls_empty',
                        message: "controls: Khóa controls không có dữ liệu, bắt buộc phải khai báo là 'controls: []'"
                    });
                }
            }
        }

        // 3. Kiểm tra tools.type
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

        // 4. Kiểm tra tools.ID
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

        // 5. Kiểm tra ký tự TAB (\t)
        if (line.startsWith('\t') || (line.trimStart() !== line && line.match(/^\s*\t/))) {
            errors.push({
                lineIndex: i,
                type: 'tab_character',
                message: `Dòng ${i + 1}: Sử dụng ký tự TAB (\\t) để thụt lề. YAML yêu cầu dùng khoảng trắng (spaces).`
            });
        }
    }

    // 6. Quét cấu trúc processes -> out-product -> configs
    let inOutProduct = false;
    let outProductIndent = 0;
    let inProc = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trimStart();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const indent = line.length - trimmed.length;

        if (/^\s*-\s*name\s*:/.test(line) || (/^\s*name\s*:/.test(line) && line.includes('name:'))) {
            inProc = true;
            inOutProduct = false;
        }

        if (/^\s*out-product\s*:/.test(line)) {
            inOutProduct = true;
            outProductIndent = indent;
            continue;
        }

        const keyMatch = trimmed.match(/^-?\s*([\w\-]+)\s*:/);
        const currentKey = keyMatch ? keyMatch[1] : '';

        if (inOutProduct) {
            if (indent <= outProductIndent) {
                inOutProduct = false;
            } else if (currentKey) {
                const cleanK = currentKey.toLowerCase();
                if (['configs', 'batch-size', 'common-properties', 'steps', 'controls', 'materials', 'tools'].includes(cleanK)) {
                    errors.push({
                        lineIndex: i,
                        type: 'misplaced_configs_in_out_product',
                        message: `Dòng ${i + 1}: Khóa '${currentKey}:' đang bị thụt lề lồng bên trong 'out-product:' (${indent} spaces > ${outProductIndent} spaces). Khóa này phải nằm ngang cấp với 'out-product:' (${outProductIndent} spaces). Lỗi này sẽ khiến Go Uploader báo lỗi: 'field ${currentKey} not found in type snr.RecipeOutputProduct'.`
                    });
                }
            }
        }

        if (/^\s*configs\s*:/.test(line)) {
            if (inProc && outProductIndent > 0 && indent > outProductIndent) {
                errors.push({
                    lineIndex: i,
                    type: 'configs_indent_error',
                    message: `Dòng ${i + 1}: Khóa 'configs:' đang thụt lề ${indent} spaces (lớn hơn 'out-product:' ${outProductIndent} spaces). 'configs:' phải cùng cấp thụt lề ${outProductIndent} spaces như 'out-product:'.`
                });
            }
        }
    }

    return errors;
}

/**
 * Render giao diện xem nội dung YAML gọn gàng, hiện đại (Cyberpunk Pro)
 * Tích hợp thanh công cụ rút gọn, pill nhảy trực tiếp đến dòng lỗi, và drawer chi tiết có thể thu phóng
 * @param {string} content - Raw YAML string
 * @param {string} filePath - Đường dẫn file trên GitLab
 * @param {Array} errors - Danh sách { lineIndex, type, message }
 * @param {string} productType - Loại sản phẩm (ví dụ BEAD)
 * @param {Array} validKeys - Danh sách key hợp lệ theo quy cách
 * @returns {string} HTML markup
 */
function renderYamlWithErrors(content, filePath, errors, productType = '', validKeys = [], webUrl = '') {
    const errorLines = new Set(errors.map(e => e.lineIndex));
    const errorMap   = {};
    errors.forEach(e => {
        if (!errorMap[e.lineIndex]) errorMap[e.lineIndex] = [];
        errorMap[e.lineIndex].push(e.message);
    });

    const lines = content.split('\n');
    const hasErrors = errors.length > 0;

    // Drawer chi tiết (thu gọn mặc định)
    let drawerHtml = '';
    if (hasErrors) {
        const drawerItems = errors.map(e => {
            const lineNum = e.lineIndex + 1;
            return `<div class="yaml-error-item" onclick="jumpToYamlLine(${e.lineIndex})" title="Nhảy tới dòng ${lineNum}">` +
                `<span class="yaml-error-line-tag">Dòng ${lineNum}</span>` +
                `<span class="yaml-error-text">${escapeHtml(e.message)}</span>` +
                `<span class="material-symbols-outlined yaml-jump-icon" aria-hidden="true">arrow_forward</span>` +
            `</div>`;
        }).join('');

        let validKeysHtml = '';
        if (validKeys && validKeys.length > 0) {
            validKeysHtml = `<div class="yaml-valid-keys-bar">` +
                `<span class="tag">📋 Quy cách ${escapeHtml(productType || 'sản phẩm')} chấp nhận:</span>` +
                `<span>${escapeHtml(validKeys.join(', '))}</span>` +
            `</div>`;
        }

        drawerHtml = `<div class="yaml-error-drawer" id="yamlErrorDrawer">` +
            `<div class="yaml-drawer-header">` +
                `<span>⚠️ Danh sách ${errors.length} cảnh báo / lỗi tiềm ẩn:</span>` +
                `<button class="yaml-drawer-close" onclick="toggleYamlDrawer()" title="Thu gọn danh sách lỗi" type="button">✕</button>` +
            `</div>` +
            `<div class="yaml-drawer-list">${drawerItems}</div>` +
            `${validKeysHtml}` +
        `</div>`;
    }

    // Status Badge & Toggle Button (gọn gàng, không bị tràn toolbar)
    const statusBadgeHtml = hasErrors
        ? `<button class="yaml-status-badge has-error" onclick="toggleYamlDrawer()" title="Bấm để xem chi tiết ${errors.length} lỗi" type="button">⚠️ ${errors.length} lỗi</button>`
        : `<span class="yaml-status-badge is-ok">✓ Hợp lệ (0 lỗi)</span>`;

    const toggleBtnHtml = hasErrors
        ? `<button class="yaml-drawer-toggle-btn" id="toggleDrawerBtn" onclick="toggleYamlDrawer()" title="Xem/thu gọn chi tiết danh sách lỗi" type="button">` +
            `<span>Chi tiết</span>` +
            `<span class="material-symbols-outlined arrow-icon" aria-hidden="true">expand_more</span>` +
          `</button>`
        : '';

    const fileWebUrl = webUrl || (filePath ? `https://gitlabce.kenda.com.tw/tc/recipes/kitting/-/blob/master/${filePath}` : '');
    const pathBadgeHtml = fileWebUrl
        ? `<a class="yaml-path-badge yaml-path-link" href="${escapeHtml(fileWebUrl)}" target="_blank" rel="noopener noreferrer" title="Mở trên GitLab: ${escapeHtml(filePath)}">` +
              `<span class="material-symbols-outlined" aria-hidden="true">description</span>` +
              `<span>Open in Gitlabce</span>` +
              `<span class="material-symbols-outlined yaml-link-open-icon" aria-hidden="true">open_in_new</span>` +
          `</a>`
        : `<span class="yaml-path-badge" title="${escapeHtml(filePath)}">` +
              `<span class="material-symbols-outlined" aria-hidden="true">description</span>` +
              `<span>Open in Gitlabce</span>` +
          `</span>`;

    const toolbarHtml = `<div class="yaml-toolbar">` +
        `<div class="yaml-path-wrapper">` +
            pathBadgeHtml +
        `</div>` +
        `<div class="yaml-toolbar-status">${statusBadgeHtml}${toggleBtnHtml}</div>` +
    `</div>`;

    // Code lines không có khoảng trắng thừa giữa các thẻ div
    const linesHtml = lines.map((line, i) => {
        const escaped   = escapeHtml(line);
        const isError   = errorLines.has(i);
        const errorMsgs = errorMap[i] || [];

        let lineClass  = 'yaml-line';
        let extraAttrs = `id="yaml-line-${i}"`;
        let tooltip    = '';

        if (isError) {
            lineClass  += ' yaml-line-error';
            tooltip     = errorMsgs.join(' | ');
            extraAttrs += ` title="${escapeHtml(tooltip)}"`;
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

        return `<div class="${lineClass}" ${extraAttrs}><span class="yaml-line-num">${lineNum}</span><span class="yaml-line-content">${displayLine}</span>${isError ? '<span class="yaml-line-icon" title="' + escapeHtml(tooltip) + '">⚠</span>' : ''}</div>`;
    }).join('');

    const codeHtml = `<div class="yaml-code-scroll" id="yamlCodeScroll">${linesHtml}</div>`;

    // USER RULE: Hiển thị trực tiếp ở details-modal-body-wrapper, loại bỏ hoàn toàn yaml-container
    return `${toolbarHtml}${drawerHtml}${codeHtml}`;
}

// Global functions for interactive YAML viewer
window.toggleYamlDrawer = function() {
    const drawer = document.getElementById('yamlErrorDrawer');
    const btn = document.getElementById('toggleDrawerBtn');
    if (!drawer) return;
    drawer.classList.toggle('show');
    if (btn) btn.classList.toggle('expanded');
};

window.jumpToYamlLine = function(lineIdx) {
    const el = document.getElementById('yaml-line-' + lineIdx);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('yaml-line-pulse');
    void el.offsetWidth; // trigger reflow
    el.classList.add('yaml-line-pulse');
};

function filterClientResult(keyword) {
    if (typeof window.customClientSearchHandler === 'function') {
        window.customClientSearchHandler(keyword);
        return;
    }

    const subOutputContainer = document.getElementById('subOutputContainer');
    if (subOutputContainer && subOutputContainer.style.display === 'flex') {
        filterSubOutputBarcode(keyword);
        return;
    }

    const outputContainer = document.getElementById('outputContainer');
    if (outputContainer && outputContainer.style.display === 'flex') {
        filterOutputBarcode(keyword);
        return;
    }

    // Khi lọc dữ liệu trên main table-container, tự động đóng và clear outputContainer + subOutputContainer
    closeShowBarcodeWindow();

    if (!keyword) {
        filteredTableData = rawTableData;
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

    filteredTableData = filtered;
    displayTable(filtered, rawTableColumns);
}

function filterOutputBarcode(keyword) {
    if (!keyword) {
        filteredOutputBarcodeData = outputBarcodeRawData;
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

    filteredOutputBarcodeData = filtered;
    renderOutputBarcodeTable(filtered, outputBarcodeColumns);
}

function filterSubOutputBarcode(keyword) {
    if (!keyword) {
        filteredSubOutputBarcodeData = subOutputRawData;
        renderSubOutputBarcodeTable(subOutputRawData, subOutputColumns);
        return;
    }

    const filtered = subOutputRawData.filter(row =>
        row.some(val =>
            val !== null &&
            val !== undefined &&
            String(val).toLowerCase().includes(keyword)
        )
    );

    filteredSubOutputBarcodeData = filtered;
    renderSubOutputBarcodeTable(filtered, subOutputColumns);
}

function openOutputTable(type, rowData = null) {
    if (rowData) {
        selectedRowData = rowData;
    }

    // Tự động đóng và clear subOutputContainer khi outputContainer thay đổi dữ liệu
    closeSubOutputWindow();

    enterSingleRowMode();

    const container = document.getElementById('outputContainer');
    if (container) container.style.display = 'flex';

    activeSearchContext = type;

    clearOutputBarcodeTable();
    const outputHeaderContentEl = document.getElementById('outputHeaderContent');

    const dataObj = rowData || selectedRowData || {};

    if (type === 'inputBarcode') {
        if (outputHeaderContentEl) outputHeaderContentEl.textContent = 'Kiểm tra tem đầu vào';
        fetchInputBarcode(dataObj.id, dataObj.product_type);
    } else if (type === 'feedRecords' || type === 'outputBarcodeByFeedRecords') {
        if (outputHeaderContentEl) outputHeaderContentEl.textContent = `Kiểm tra tiêu thụ tem (${dataObj.id || ''})`;
        showFeedRecords(dataObj);
    } else if (type === 'workOrderByRecipe') {
        if (outputHeaderContentEl) outputHeaderContentEl.textContent = 'Đơn điều động theo quy cách';
        fetchWorkOrderByRecipe(dataObj.recipe_id);
    } else if (type === 'commitGitlabByRecipe') {
        if (outputHeaderContentEl) outputHeaderContentEl.textContent = 'Commit Gitlab theo quy cách';
        const info = getRecipeInfoFromRow(dataObj);
        fetchCommitGitlabByRecipe(info.recipe_id, info.product_type);
    } else if (type === 'workOrderByBarcode') {
        if (outputHeaderContentEl) outputHeaderContentEl.textContent = 'Đơn điều động theo barcode';
        fetchWorkOrderByBarcode(dataObj.id, dataObj.info);
    } else if (type === 'fetchOriginalInfoByBarcode') {
        if (outputHeaderContentEl) outputHeaderContentEl.textContent = 'Thông tin gốc của barcode';
        fetchOriginalInfoByBarcode(dataObj.id, dataObj.product_type);
    } else if (type === 'outputBarcodeByWorkOrder') {
        if (outputHeaderContentEl) outputHeaderContentEl.textContent = 'Tem đầu ra của mã MES';
        const workOrderId = dataObj.id || dataObj.work_order;
        const workOrderStatus = dataObj.status;
        fetchOutputBarcodeByMainWorkOrder(workOrderId, workOrderStatus);
    }
}

function closeShowBarcodeWindow() {
    closeSubOutputWindow();

    const container = document.getElementById('outputContainer');
    if (!container) return;

    clearOutputBarcodeTable();

    container.style.display = 'none';
    activeSearchContext = 'main';

    exitSingleRowMode();
}

function clearOutputBarcodeTable() {
    const table = document.getElementById('outputBarcodeTable');
    if (table) {
        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody');
        if (thead) thead.innerHTML = '';
        if (tbody) tbody.innerHTML = '';
    }

    const count = document.getElementById('outputRowCount');
    if (count) count.textContent = '0';

    // Clear output table selection
    selectedOutputRow = null;
    selectedOutputRowData = null;
    outputBarcodeRawData = [];
    outputBarcodeColumns = [];
    currentOutputTableType = null;
    updateOutputVisibleRowCount();
    updateTableStickyOffsets();
}

function renderOutputBarcodeTable(rows, columns) {
    const thead = document.querySelector('#outputBarcodeTable thead');
    const tbody = document.querySelector('#outputBarcodeTable tbody');
    const rowCount = document.getElementById('outputRowCount');

    if (!thead || !tbody) return;

    thead.innerHTML = '';
    tbody.innerHTML = '';

    const hiddenColumns = ['diff', 'new_path', 'old_path', 'new_file', 'renamed_file', 'deleted_file', 'a_mode', 'b_mode', 'web_url'];

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
                <div class="empty-state-title">Không có dữ liệu</div>
                <div class="empty-state-desc">Không tìm thấy bản ghi nào khớp với điều kiện tra cứu hoặc dữ liệu rỗng.</div>
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
            if (hiddenColumns.includes(col)) {
                th.style.display = 'none';
            }
            trHead.appendChild(th);
        });
        thead.appendChild(trHead);
    }

    const truncateThreshold = 50;
    const displayLength = 45;

    const barcodeColIdx = (columns && Array.isArray(columns)) ? (columns.indexOf('barcode') >= 0 ? columns.indexOf('barcode') : columns.indexOf('id')) : -1;
    const collectQtyIdx = (columns && Array.isArray(columns)) ? columns.indexOf('collect_quantity') : -1;

    rows.forEach(row => {
        const tr = document.createElement('tr');
        const rawCollectQty = (collectQtyIdx >= 0) ? row[collectQtyIdx] : null;
        const isMissingCollect = (collectQtyIdx >= 0 && (rawCollectQty === null || rawCollectQty === undefined || String(rawCollectQty).trim() === '' || String(rawCollectQty).trim() === '-'));
        if (isMissingCollect) {
            tr.classList.add('row-missing-collect');
            tr.style.backgroundColor = 'rgba(245, 158, 11, 0.09)';
            tr.style.borderLeft = '4px solid #f59e0b';
            tr.title = 'Lỗi MES: Tem này chưa lưu collect_record và chưa in tem giấy cho xưởng tiếp theo!';
        }

        row.forEach((val, valIdx) => {
            const td = document.createElement('td');
            const colName = (columns && columns.length > valIdx) ? String(columns[valIdx]).trim() : '';
            if (colName && hiddenColumns.includes(colName)) {
                td.style.display = 'none';
            }

            let cellValue = '';
            let fullValue = '';

            if (colName === 'feed_records_id') {
                fullValue = formatPgArrayString(val);
                cellValue = fullValue;
            } else if (colName === 'target_material_id' && Array.isArray(val)) {
                fullValue = JSON.stringify(val, null, 2);
                cellValue = val.join(', ');
            } else if (val !== null && val !== undefined) {
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

            if (colName === 'feed_records_id') {
                if (!cellValue || cellValue === '-' || cellValue.toLowerCase() === 'null') {
                    cellValue = '{}';
                    fullValue = '{}';
                }
            } else if (val === null || val === undefined || cellValue.trim() === '' || cellValue.trim().toLowerCase() === 'null' || cellValue.trim().toLowerCase() === 'undefined') {
                cellValue = '-';
                fullValue = '-';
            }

            td.dataset.fullValue = fullValue;

            if (colName === 'bind_status') {
                if (cellValue === 'Đang bind') {
                    td.innerHTML = `<span style="display:inline-flex; align-items:center; gap:5px; font-weight:600; color:#059669;"><span style="width:7px; height:7px; border-radius:50%; background:#10b981; display:inline-block;"></span>Đang bind</span>`;
                } else {
                    td.textContent = '-';
                }
            } else if (isMissingCollect && valIdx === barcodeColIdx && cellValue !== '-') {
                td.innerHTML = `<div style="display:inline-flex; align-items:center; gap:6px;">
                    <span style="font-weight:600; color:#b45309;">${escapeHtml(cellValue)}</span>
                    <span class="badge-missing-collect" data-barcode="${escapeHtml(cellValue)}" data-type="main" title="Nhấn giữ 2 giây để tự động khắc phục tem lỗi">
                        <span class="badge-text">LỖI</span>
                        <span class="material-symbols-outlined badge-icon">sync</span>
                        <span class="badge-hold-progress"></span>
                    </span>
                </div>`;
            } else if (isMissingCollect && valIdx === collectQtyIdx && cellValue === '-') {
                td.innerHTML = `<span style="color:#d97706; font-style:italic; font-size:12px;" title="Lỗi MES: Chưa lưu collect_record">- (Chưa lưu)</span>`;
            } else {
                if (cellValue.length > truncateThreshold) {
                    td.textContent = cellValue.substring(0, displayLength) + '...';
                    td.title = fullValue;
                    td.classList.add('truncated-cell');
                } else {
                    td.textContent = cellValue;
                }
            }

            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    const count = rows.length;
    if (rowCount) rowCount.textContent = count;



    updateOutputVisibleRowCount();
    updateTableStickyOffsets();
}

function closeSubOutputWindow() {
    const container = document.getElementById('subOutputContainer');
    if (!container) return;

    clearSubOutputBarcodeTable();
    container.style.display = 'none';

    exitOutputSingleRowMode();
}
window.closeSubOutputWindow = closeSubOutputWindow;

function clearSubOutputBarcodeTable() {
    const table = document.getElementById('subOutputBarcodeTable');
    if (table) {
        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody');
        if (thead) thead.innerHTML = '';
        if (tbody) tbody.innerHTML = '';
    }

    const rowCount = document.getElementById('subOutputRowCount');
    if (rowCount) rowCount.textContent = '0';

    subOutputRawData = [];
    subOutputColumns = [];
    selectedSubOutputRow = null;
    selectedSubOutputRowData = null;
    updateSubOutputVisibleRowCount();
    updateTableStickyOffsets();
}

function updateSubOutputVisibleRowCount() {
    const tbody = document.getElementById('subOutputBarcodeTableBody') || document.querySelector('#subOutputBarcodeTable tbody');
    const rowCount = document.getElementById('subOutputRowCount');
    const subOutputFooter = document.querySelector('#subOutputContainer .output-footer');

    if (!tbody || !rowCount) return;

    const hasEmptyState = tbody.querySelector('.table-empty-state');
    const count = hasEmptyState ? 0 : tbody.querySelectorAll('tr').length;
    rowCount.textContent = count;

    if (subOutputFooter) {
        subOutputFooter.classList.toggle('hidden', count === 0 || !!hasEmptyState);
    }
}

function renderSubOutputBarcodeTable(rows, columns) {
    const thead = document.querySelector('#subOutputBarcodeTable thead');
    const tbody = document.querySelector('#subOutputBarcodeTable tbody');
    const rowCount = document.getElementById('subOutputRowCount');

    if (!thead || !tbody) return;

    thead.innerHTML = '';
    tbody.innerHTML = '';

    const hiddenColumns = ['diff', 'new_path', 'old_path', 'new_file', 'renamed_file', 'deleted_file', 'a_mode', 'b_mode', 'web_url'];

    // Khi không có dữ liệu: hiển thị empty state
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
                <div class="empty-state-desc">Không tìm thấy tem quét ra nào thuộc phạm vi đơn điều động này.</div>
            </div>
        `;
        emptyTr.appendChild(emptyTd);
        tbody.appendChild(emptyTr);
        updateSubOutputVisibleRowCount();
        updateTableStickyOffsets();
        return;
    }

    // Table header
    if (columns && columns.length > 0) {
        const trHead = document.createElement('tr');
        columns.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col;
            if (hiddenColumns.includes(col)) {
                th.style.display = 'none';
            }
            trHead.appendChild(th);
        });
        thead.appendChild(trHead);
    }

    const truncateThreshold = 50;
    const displayLength = 45;

    const barcodeColIdx = (columns && Array.isArray(columns)) ? (columns.indexOf('barcode') >= 0 ? columns.indexOf('barcode') : columns.indexOf('id')) : -1;
    const collectQtyIdx = (columns && Array.isArray(columns)) ? columns.indexOf('collect_quantity') : -1;

    rows.forEach(row => {
        const tr = document.createElement('tr');
        const rawCollectQty = (collectQtyIdx >= 0) ? row[collectQtyIdx] : null;
        const isMissingCollect = (collectQtyIdx >= 0 && (rawCollectQty === null || rawCollectQty === undefined || String(rawCollectQty).trim() === '' || String(rawCollectQty).trim() === '-'));
        if (isMissingCollect) {
            tr.classList.add('row-missing-collect');
            tr.style.backgroundColor = 'rgba(245, 158, 11, 0.09)';
            tr.style.borderLeft = '4px solid #f59e0b';
            tr.title = 'Lỗi MES: Tem này chưa lưu collect_record và chưa in tem giấy cho xưởng tiếp theo!';
        }

        row.forEach((val, valIdx) => {
            const td = document.createElement('td');
            const colName = (columns && columns.length > valIdx) ? String(columns[valIdx]).trim() : '';
            if (colName && hiddenColumns.includes(colName)) {
                td.style.display = 'none';
            }

            let cellValue = '';
            let fullValue = '';

            if (colName === 'feed_records_id') {
                fullValue = formatPgArrayString(val);
                cellValue = fullValue;
            } else if (val !== null && val !== undefined) {
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

            if (colName === 'feed_records_id') {
                if (!cellValue || cellValue === '-' || cellValue.toLowerCase() === 'null') {
                    cellValue = '{}';
                    fullValue = '{}';
                }
            } else if (val === null || val === undefined || cellValue.trim() === '' || cellValue.trim().toLowerCase() === 'null' || cellValue.trim().toLowerCase() === 'undefined') {
                cellValue = '-';
                fullValue = '-';
            }

            td.dataset.fullValue = fullValue;

            if (colName === 'bind_status') {
                if (cellValue === 'Đang bind') {
                    td.innerHTML = `<span style="display:inline-flex; align-items:center; gap:5px; font-weight:600; color:#059669;"><span style="width:7px; height:7px; border-radius:50%; background:#10b981; display:inline-block;"></span>Đang bind</span>`;
                } else {
                    td.textContent = '-';
                }
            } else if (isMissingCollect && valIdx === barcodeColIdx && cellValue !== '-') {
                td.innerHTML = `<div style="display:inline-flex; align-items:center; gap:6px;">
                    <span style="font-weight:600; color:#b45309;">${escapeHtml(cellValue)}</span>
                    <span class="badge-missing-collect" data-barcode="${escapeHtml(cellValue)}" data-type="sub" title="Nhấn giữ 2 giây để tự động khắc phục tem lỗi">
                        <span class="badge-text">LỖI</span>
                        <span class="material-symbols-outlined badge-icon">sync</span>
                        <span class="badge-hold-progress"></span>
                    </span>
                </div>`;
            } else if (isMissingCollect && valIdx === collectQtyIdx && cellValue === '-') {
                td.innerHTML = `<span style="color:#d97706; font-style:italic; font-size:12px;" title="Lỗi MES: Chưa lưu collect_record">- (Chưa lưu)</span>`;
            } else {
                if (cellValue.length > truncateThreshold) {
                    td.textContent = cellValue.substring(0, displayLength) + '...';
                    td.title = fullValue;
                    td.classList.add('truncated-cell');
                } else {
                    td.textContent = cellValue;
                }
            }

            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    const count = rows.length;
    if (rowCount) rowCount.textContent = count;



    updateSubOutputVisibleRowCount();
    updateTableStickyOffsets();
}

async function triggerFixCollectBadge(badgeEl) {
    if (!badgeEl || badgeEl.classList.contains('is-loading')) return;

    const barcode = badgeEl.dataset.barcode;
    const type = badgeEl.dataset.type || 'main';
    const workOrderId = (type === 'main' ? currentMainWorkOrderId : currentSubWorkOrderId) || (selectedRowData ? (selectedRowData['id'] || selectedRowData['work_order']) : null);

    if (!workOrderId) {
        Toast.warning('Cảnh báo', 'Không xác định được mã đơn điều động!');
        return;
    }

    badgeEl.classList.add('is-loading');

    try {
        const resp = await apiFetch('/api/workorders/fix-missing-collect-records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                work_order_id: workOrderId,
                barcodes: barcode ? [barcode] : []
            })
        });

        if (resp && resp.success) {
            Toast.success('Thành công', resp.message || `Đã khắc phục thành công tem ${barcode || ''}!`);
            if (type === 'main') {
                if (typeof fetchOutputBarcodeByMainWorkOrder === 'function') {
                    fetchOutputBarcodeByMainWorkOrder(workOrderId);
                }
            } else {
                if (typeof fetchOutputBarcodeByRecipe === 'function') {
                    fetchOutputBarcodeByRecipe(selectedRowData || {});
                }
            }
        } else {
            badgeEl.classList.remove('is-loading');
            Toast.error('Lỗi', (resp && resp.message) ? resp.message : 'Không thể khắc phục tem lỗi');
        }
    } catch (err) {
        badgeEl.classList.remove('is-loading');
        Toast.error('Lỗi', err.message || 'Lỗi khi gọi API bổ sung collect_record');
    }
}
window.triggerFixCollectBadge = triggerFixCollectBadge;

// Global hold 2s listener for .badge-missing-collect
let activeHoldBadge = null;
let activeHoldTimer = null;

function clearBadgeHold() {
    if (activeHoldTimer) {
        clearTimeout(activeHoldTimer);
        activeHoldTimer = null;
    }
    if (activeHoldBadge) {
        activeHoldBadge.classList.remove('is-holding');
        activeHoldBadge = null;
    }
}

document.addEventListener('mousedown', (e) => {
    const badge = e.target.closest('.badge-missing-collect');
    if (!badge || e.button !== 0 || badge.classList.contains('is-loading')) return;

    clearBadgeHold();
    activeHoldBadge = badge;
    badge.classList.add('is-holding');

    activeHoldTimer = setTimeout(() => {
        const targetBadge = activeHoldBadge;
        clearBadgeHold();
        if (targetBadge) {
            triggerFixCollectBadge(targetBadge);
        }
    }, 2000);
});

document.addEventListener('mouseup', clearBadgeHold);
document.addEventListener('mouseleave', clearBadgeHold);

document.addEventListener('touchstart', (e) => {
    const badge = e.target.closest('.badge-missing-collect');
    if (!badge || badge.classList.contains('is-loading')) return;

    clearBadgeHold();
    activeHoldBadge = badge;
    badge.classList.add('is-holding');

    activeHoldTimer = setTimeout(() => {
        const targetBadge = activeHoldBadge;
        clearBadgeHold();
        if (targetBadge) {
            triggerFixCollectBadge(targetBadge);
        }
    }, 2000);
}, { passive: true });

document.addEventListener('touchend', clearBadgeHold);
document.addEventListener('touchcancel', clearBadgeHold);

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
        clearInputBox(searchInput);
    }
}

function setTableData(result, columns, tableType = null, customEmptyMsg = null, customSuccessMsg = null) {
    // Tự động đóng và clear outputContainer + subOutputContainer khi table-container thay đổi dữ liệu
    closeShowBarcodeWindow();

    rawTableData = result || [];
    rawTableColumns = columns || [];
    filteredTableData = rawTableData;
    currentTableType = tableType;

    // Reset ô client search mỗi khi nhận tập dữ liệu mới từ backend
    const searchInput = document.getElementById('clientSearch');
    if (searchInput) {
        clearInputBox(searchInput);
    }

    // Unhide table-container if hidden (e.g. check-qc-data or check-mesync)
    const tableContainer = document.querySelector('.table-container');
    if (tableContainer && (document.body.classList.contains('check-qc-data') || document.body.classList.contains('check-mesync'))) {
        tableContainer.classList.remove('hidden');
        tableContainer.style.display = '';
    }

    updateClientSearchState(rawTableData.length > 0);
    displayTable(rawTableData, rawTableColumns);

    if (!rawTableData || rawTableData.length === 0) {
        Toast.warning('Không có dữ liệu', customEmptyMsg || 'Không có dữ liệu');
    } else {
        Toast.success('Thành công', customSuccessMsg || `Tải thành công ${rawTableData.length.toLocaleString()} dòng dữ liệu`);
    }
}

/**
 * Render component Pagination chuẩn shadcn/ui với PaginationEllipsis
 * Landmark: <nav aria-label="pagination">
 * Hiển thị số trang 1-based, hỗ trợ Previous/Next, ellipsis (...), aria-current="page"
 * @param {HTMLElement} navElement - Thẻ <nav aria-label="pagination">
 * @param {number} currentPage - Trang hiện tại (1-based)
 * @param {number} totalPages - Tổng số trang (1-based)
 * @param {Function} onPageChange - Callback khi đổi trang (newPage: number)
 */
function renderShadcnPagination(navElement, currentPage, totalPages, onPageChange) {
    if (!navElement) return;

    if (!totalPages || totalPages <= 1) {
        navElement.classList.add('hidden');
        navElement.innerHTML = '';
        return;
    }

    navElement.classList.remove('hidden');

    // Standard shadcn/ui range algorithm (desktop and full-width mobile row)
    const items = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) items.push(i);
    } else {
        if (currentPage <= 4) {
            items.push(1, 2, 3, 4, 5, 'ellipsis', totalPages);
        } else if (currentPage >= totalPages - 3) {
            items.push(1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
        } else {
            items.push(1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages);
        }
    }

    let html = '<ul class="pagination-content">';

    // Previous Button
    const prevDisabled = (currentPage <= 1);
    html += `
        <li class="pagination-item">
            <button type="button" class="pagination-link pagination-previous" aria-label="Go to previous page" ${prevDisabled ? 'disabled aria-disabled="true"' : ''} data-page="${currentPage - 1}">
                <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>
                <span>Trước</span>
            </button>
        </li>
    `;

    // Page Links & Ellipsis
    items.forEach(item => {
        if (item === 'ellipsis') {
            html += `
                <li class="pagination-item">
                    <span aria-hidden="true" class="pagination-ellipsis" title="Thêm trang">
                        <span class="material-symbols-outlined">more_horiz</span>
                        <span class="sr-only">Thêm trang</span>
                    </span>
                </li>
            `;
        } else {
            const isCurrent = (item === currentPage);
            html += `
                <li class="pagination-item">
                    <button type="button" class="pagination-link" aria-label="Trang ${item}" ${isCurrent ? 'aria-current="page"' : ''} data-page="${item}">
                        ${item}
                    </button>
                </li>
            `;
        }
    });

    // Next Button
    const nextDisabled = (currentPage >= totalPages);
    html += `
        <li class="pagination-item">
            <button type="button" class="pagination-link pagination-next" aria-label="Go to next page" ${nextDisabled ? 'disabled aria-disabled="true"' : ''} data-page="${currentPage + 1}">
                <span>Sau</span>
                <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
            </button>
        </li>
    `;

    html += '</ul>';
    navElement.innerHTML = html;

    // Attach click listener
    navElement.querySelectorAll('.pagination-link:not([disabled]):not([aria-current="page"])').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetPage = parseInt(btn.dataset.page, 10);
            if (targetPage && targetPage >= 1 && targetPage <= totalPages && targetPage !== currentPage) {
                if (typeof onPageChange === 'function') {
                    onPageChange(targetPage);
                }
            }
        });
    });
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
            if (!res.ok) {
                const errMsg = `Lỗi hệ thống (${res.status})`;
                if (typeof Toast !== 'undefined' && Toast.error) {
                    Toast.error('Lỗi kết nối', errMsg);
                }
                throw new Error(errMsg);
            }
            return null;
        }

        if (isUnauthorizedResponse(res.status, data)) {
            showAuthExpiredModal(data ? data.message : null);
            throw new Error(data ? data.message : 'Unauthorized');
        }

        if (!res.ok || (data && data.success === false)) {
            const errMsg = (data && data.message) ? data.message : `Lỗi hệ thống (${res.status})`;
            let toastShown = false;
            if (options.showErrorToast !== false && !options.silent) {
                const errTitle = options.errorTitle || 'Lỗi';
                if (typeof Toast !== 'undefined' && Toast.error) {
                    Toast.error(errTitle, errMsg);
                    toastShown = true;
                }
            }
            const err = new Error(errMsg);
            err.data = data;
            err.status = res.status;
            err.toastShown = toastShown;
            throw err;
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
        handleExportExcel(button);
    }

    if (buttonId === 'exportOutputExcelBtn') {
        handleExportOutputBarcodeExcel(button);
    }

    if (buttonId === 'exportSubOutputExcelBtn') {
        handleExportSubOutputBarcodeExcel(button);
    }
});

/**
 * Xuất dữ liệu ra file Excel (.xlsx) chuẩn SheetJS
 * Hỗ trợ xuất toàn bộ trang (all pages / filtered pages) cho cả bảng phân trang và bảng thông thường
 * Tự động đồng bộ các cột hiển thị, định dạng text/object, loại bỏ cột ẩn
 * 
 * @param {Object} options
 * @param {Array} options.rows - Dữ liệu các dòng cần xuất (toàn bộ các dòng sau khi lọc)
 * @param {Array} options.columns - Danh sách tên cột
 * @param {HTMLElement} options.tableElement - Phần tử <table> trong DOM (để tham chiếu header hiển thị)
 * @param {string} options.sheetName - Tên sheet trong file Excel (mặc định 'Data')
 * @param {string} options.defaultFileName - Tên file tải về
 */
function exportDatasetToExcel({ rows = null, columns = null, tableElement = null, sheetName = 'Data', defaultFileName = null }) {
    const hiddenColumns = ['diff', 'new_path', 'old_path', 'new_file', 'renamed_file', 'deleted_file', 'a_mode', 'b_mode', 'web_url'];

    // 1. Xác định danh sách cột hiển thị (Visible Headers)
    const visibleColIndices = [];
    const visibleHeaders = [];

    const ths = tableElement ? Array.from(tableElement.querySelectorAll('thead th')) : [];
    if (ths.length > 0) {
        ths.forEach((th, idx) => {
            if (th.style.display !== 'none') {
                visibleColIndices.push(idx);
                visibleHeaders.push(th.textContent.trim());
            }
        });
    }

    if (visibleHeaders.length === 0 && Array.isArray(columns) && columns.length > 0) {
        columns.forEach((col, idx) => {
            if (!hiddenColumns.includes(col)) {
                visibleColIndices.push(idx);
                visibleHeaders.push(String(col));
            }
        });
    }

    // 2. Nếu có mảng rows (dữ liệu nguồn đầy đủ hoặc sau khi lọc)
    if (Array.isArray(rows) && rows.length > 0) {
        const wsData = [visibleHeaders];

        rows.forEach(row => {
            const rowValues = [];
            visibleColIndices.forEach((colIdx) => {
                let cell = null;
                if (Array.isArray(row)) {
                    cell = row[colIdx];
                } else if (row && typeof row === 'object') {
                    const colName = (columns && columns[colIdx]) || visibleHeaders[rowValues.length];
                    cell = (colName && row[colName] !== undefined) ? row[colName] : row[colIdx];
                }

                let valStr = '';
                if (cell !== null && cell !== undefined) {
                    if (typeof cell === 'object') {
                        try {
                            valStr = JSON.stringify(cell, null, 2);
                        } catch (e) {
                            valStr = String(cell);
                        }
                    } else {
                        valStr = String(cell);
                    }
                }

                if (cell === null || cell === undefined || valStr.trim() === '' || valStr.trim().toLowerCase() === 'null' || valStr.trim().toLowerCase() === 'undefined') {
                    valStr = '-';
                }

                rowValues.push(valStr);
            });
            wsData.push(rowValues);
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, defaultFileName || ('KDMES_TOOL_' + getVietnamTimestamp() + '.xlsx'));
        return;
    }

    // 3. Fallback: Nếu không có mảng rows, clone bảng trong DOM
    if (tableElement) {
        const cloneTable = tableElement.cloneNode(true);
        cloneTable.querySelectorAll('th, td').forEach(el => {
            if (el.style.display === 'none') {
                el.remove();
            }
        });
        cloneTable.querySelectorAll('td[data-full-value]').forEach(td => {
            td.textContent = td.dataset.fullValue;
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.table_to_sheet(cloneTable, { raw: true });
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, defaultFileName || ('KDMES_TOOL_' + getVietnamTimestamp() + '.xlsx'));
    }
}

async function handleExportExcel(button = null) {
    // 1. Kiểm tra hook cung cấp dữ liệu riêng của trang (nếu có)
    let exportInfo = null;
    if (typeof window.getPageExportData === 'function') {
        try {
            exportInfo = window.getPageExportData();
        } catch (e) {
            console.error('Lỗi khi gọi window.getPageExportData():', e);
        }
    }

    // 2. Xác định tập dữ liệu cần xuất
    let rowsToExport = null;
    let colsToExport = null;
    let customFileName = null;
    let customSheetName = null;

    if (exportInfo && Array.isArray(exportInfo.rows)) {
        rowsToExport = exportInfo.rows;
        colsToExport = exportInfo.columns || rawTableColumns;
        customFileName = exportInfo.filename;
        customSheetName = exportInfo.sheetName;
    } else if (Array.isArray(filteredTableData) && filteredTableData.length > 0) {
        rowsToExport = filteredTableData;
        colsToExport = rawTableColumns;
    } else if (Array.isArray(rawTableData) && rawTableData.length > 0) {
        rowsToExport = rawTableData;
        colsToExport = rawTableColumns;
    }

    // 3. Kiểm tra số dòng từ dataset hoặc fallback DOM
    const container = button ? button.closest('.table-container') : document.querySelector('.table-container');
    const tbody = document.getElementById('tableBody') || (container ? container.querySelector('tbody') : null);
    const domRows = tbody ? tbody.querySelectorAll('tr:not(.table-empty-state)') : [];

    const totalCount = (rowsToExport && rowsToExport.length > 0) ? rowsToExport.length : domRows.length;

    if (totalCount === 0) {
        Toast.warning('Cảnh báo', 'Không có dữ liệu để xuất file Excel.');
        return;
    }

    const confirmed = await showConfirm(
        `Bạn có chắc chắn muốn xuất file Excel cho toàn bộ ${totalCount.toLocaleString()} dòng dữ liệu?`
    );
    if (!confirmed) return;

    exportTableToExcel(rowsToExport, colsToExport, customFileName, customSheetName);
    Toast.success('Thành công', `Xuất file Excel thành công (${totalCount.toLocaleString()} dòng)!`);
}

function exportTableToExcel(rows = null, columns = null, customFileName = null, customSheetName = null) {
    const table = document.querySelector('.table-container table');

    let dataRows = rows;
    let dataCols = columns;

    if (!dataRows) {
        if (typeof window.getPageExportData === 'function') {
            try {
                const info = window.getPageExportData();
                if (info && Array.isArray(info.rows)) {
                    dataRows = info.rows;
                    dataCols = info.columns || rawTableColumns;
                    if (!customFileName) customFileName = info.filename;
                    if (!customSheetName) customSheetName = info.sheetName;
                }
            } catch (e) {}
        }
    }

    if (!dataRows) {
        if (Array.isArray(filteredTableData) && filteredTableData.length > 0) {
            dataRows = filteredTableData;
            dataCols = rawTableColumns;
        } else if (Array.isArray(rawTableData) && rawTableData.length > 0) {
            dataRows = rawTableData;
            dataCols = rawTableColumns;
        }
    }

    exportDatasetToExcel({
        rows: dataRows,
        columns: dataCols,
        tableElement: table,
        sheetName: customSheetName || 'Data',
        defaultFileName: customFileName || ('KDMES_TOOL_' + getVietnamTimestamp() + '.xlsx')
    });
}

async function handleExportOutputBarcodeExcel(button = null) {
    const tbody = document.getElementById('outputBarcodeTableBody');
    if (!tbody) return;

    const dataRows = (Array.isArray(filteredOutputBarcodeData) && filteredOutputBarcodeData.length > 0)
        ? filteredOutputBarcodeData
        : outputBarcodeRawData;

    const domRows = tbody.querySelectorAll('tr:not(.table-empty-state)');
    const totalCount = (Array.isArray(dataRows) && dataRows.length > 0) ? dataRows.length : domRows.length;

    if (totalCount === 0) {
        Toast.warning('Cảnh báo', 'Không có dữ liệu để xuất file Excel.');
        return;
    }

    const confirmed = await showConfirm(
        `Bạn có chắc chắn muốn xuất file Excel cho toàn bộ ${totalCount.toLocaleString()} dòng dữ liệu tem đầu ra?`
    );
    if (!confirmed) return;

    exportOutputBarcodeToExcel();
    Toast.success('Thành công', `Xuất file Excel thành công (${totalCount.toLocaleString()} dòng)!`);
}

function exportOutputBarcodeToExcel() {
    const table = document.getElementById('outputBarcodeTable');
    if (!table) return;

    const dataRows = (Array.isArray(filteredOutputBarcodeData) && filteredOutputBarcodeData.length > 0)
        ? filteredOutputBarcodeData
        : outputBarcodeRawData;

    exportDatasetToExcel({
        rows: dataRows,
        columns: outputBarcodeColumns,
        tableElement: table,
        sheetName: 'Barcode_Detail',
        defaultFileName: 'KDMES_TOOL_' + getVietnamTimestamp() + '.xlsx'
    });
}

async function handleExportSubOutputBarcodeExcel(button = null) {
    const tbody = document.getElementById('subOutputBarcodeTableBody');
    if (!tbody) return;

    const dataRows = (Array.isArray(filteredSubOutputBarcodeData) && filteredSubOutputBarcodeData.length > 0)
        ? filteredSubOutputBarcodeData
        : subOutputRawData;

    const domRows = tbody.querySelectorAll('tr:not(.table-empty-state)');
    const totalCount = (Array.isArray(dataRows) && dataRows.length > 0) ? dataRows.length : domRows.length;

    if (totalCount === 0) {
        Toast.warning('Cảnh báo', 'Không có dữ liệu để xuất file Excel.');
        return;
    }

    const confirmed = await showConfirm(
        `Bạn có chắc chắn muốn xuất file Excel cho toàn bộ ${totalCount.toLocaleString()} dòng dữ liệu tem đầu ra cấp 2?`
    );
    if (!confirmed) return;

    exportSubOutputBarcodeToExcel();
    Toast.success('Thành công', `Xuất file Excel thành công (${totalCount.toLocaleString()} dòng)!`);
}

function exportSubOutputBarcodeToExcel() {
    const table = document.getElementById('subOutputBarcodeTable');
    if (!table) return;

    const dataRows = (Array.isArray(filteredSubOutputBarcodeData) && filteredSubOutputBarcodeData.length > 0)
        ? filteredSubOutputBarcodeData
        : subOutputRawData;

    exportDatasetToExcel({
        rows: dataRows,
        columns: subOutputColumns,
        tableElement: table,
        sheetName: 'MES_Output_Barcode',
        defaultFileName: 'KDMES_TOOL_' + getVietnamTimestamp() + '.xlsx'
    });
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

function enterOutputSingleRowMode() {
    const tbody = document.getElementById('outputBarcodeTableBody') || document.querySelector('#outputBarcodeTable tbody');
    if (!tbody) return;

    const outputContainer = document.getElementById('outputContainer');
    const isAlreadySingleRow = outputContainer && outputContainer.classList.contains('single-row-mode');

    if (isAlreadySingleRow) {
        return;
    }

    if (!selectedOutputRow) return;

    // Backup table và row count lần đầu
    if (!originalOutputTableHTML) {
        originalOutputTableHTML = tbody.innerHTML;
        const countEl = document.getElementById('outputRowCount');
        originalOutputRowCount = countEl ? countEl.textContent : null;
    }

    // Giữ lại đúng dòng đã chọn
    tbody.innerHTML = '';
    tbody.appendChild(selectedOutputRow);

    if (outputContainer) {
        outputContainer.classList.add('single-row-mode');
    }

    updateOutputVisibleRowCount();
    updateTableStickyOffsets();
}

function exitOutputSingleRowMode() {
    const tbody = document.getElementById('outputBarcodeTableBody') || document.querySelector('#outputBarcodeTable tbody');
    if (!tbody || !originalOutputTableHTML) return;

    tbody.innerHTML = originalOutputTableHTML;

    originalOutputTableHTML = null;
    selectedOutputRow = null;
    selectedOutputRowData = null;

    const outputContainer = document.getElementById('outputContainer');
    if (outputContainer) {
        outputContainer.classList.remove('single-row-mode');
    }

    if (originalOutputRowCount !== null) {
        const countEl = document.getElementById('outputRowCount');
        if (countEl) countEl.textContent = originalOutputRowCount;
        originalOutputRowCount = null;
    } else {
        updateOutputVisibleRowCount();
    }

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
                Toast.info('Thông báo', `Barcode ${resource_id} đang không được nạp vào bất kỳ máy nào`);
                return;
            }
            setTableData(data.result, data.columns, null);
            Toast.success('Thành công', `Tải thông tin nạp tem thành công (${data.result.length} dòng)`);
        } else {
            Toast.error('Lỗi', data.message || 'Lỗi khi kiểm tra trạm nạp tem');
        }
    } catch (err) {
        Toast.error('Lỗi', err.message || 'Lỗi kết nối khi kiểm tra trạm nạp tem');
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

    // 2. Global Paste Handler: Khi trang web đang focus bất kỳ đâu hoặc đang focus vào input #barcode
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

            // Bắt lấy input đang được focus (ví dụ ô Tem / Barcode #barcode)
            const activeEl = document.activeElement;
            const targetInput = (e.target && e.target.tagName === 'INPUT')
                ? e.target
                : (activeEl && activeEl.tagName === 'INPUT' ? activeEl : null);

            await processOcrImageFile(imageFile, targetInput);
        }
    });

    // Hỗ trợ kéo thả ảnh trực tiếp vào ô input #barcode
    const barcodeInputEl = document.getElementById('barcode');
    if (barcodeInputEl) {
        ['dragenter', 'dragover'].forEach(eventName => {
            barcodeInputEl.addEventListener(eventName, (e) => {
                if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            });
        });

        barcodeInputEl.addEventListener('drop', async (e) => {
            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files.length > 0) {
                const file = dt.files[0];
                const isImage = (file.type && file.type.startsWith('image/')) || /\.(png|jpe?g|webp|bmp|gif|tiff?|jfif|svg)$/i.test(file.name || '');
                if (isImage) {
                    e.preventDefault();
                    e.stopPropagation();
                    await processOcrImageFile(file, barcodeInputEl);
                }
            }
        });
    }

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

async function processOcrImageFile(file, targetInput = null) {
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

        let detectedLabelData = null;

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
                if (data && data.success) {
                    rawText = data.text ? data.text.trim() : '';
                    detectedLabelData = data.label_data || null;
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

        // Giữ lại chữ cái Unicode (Tiếng Việt), chữ số, khoảng trắng và các ký tự đặc biệt: -, *, _, /, :, .
        if (rawText) {
            rawText = rawText.replace(/[^a-zA-Z0-9\u00C0-\u1EF9\-_*\/:\. \n]/g, '').trim();
        }

        if (!rawText) {
            Toast.warning('Không có ký tự', 'Không tìm thấy ký tự hợp lệ nào trong hình ảnh.');
            resetOcrDropzone();
            return;
        }

        lastOcrResultText = rawText;

        // Chuyển sang State Preview
        dropzone.classList.remove('is-loading');
        dropzone.classList.add('is-preview');

        const resultTextEl = document.getElementById('ocrResultText');
        const barcodeEl = document.getElementById('barcode');
        const activeEl = document.activeElement;
        const isActiveInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') && !activeEl.disabled && !activeEl.readOnly;
        const fillTarget = targetInput || (isActiveInput ? activeEl : (barcodeEl || null));

        // PHÂN NHÁNH XỬ LÝ SONG SONG:
        // TRƯỜNG HỢP 1: HÌNH ẢNH TEM BẢNG / NHIỀU CỘT (Mã máy, Mã SP, Lô SX, Số lượng, Barcode...)
        const isMultiColumnLabel = Boolean(detectedLabelData && (detectedLabelData.is_label || detectedLabelData.barcode));

        if (isMultiColumnLabel) {
            const isMaterialTransferPage = window.location.pathname.includes('material-transfer') ||
                (typeof searchMaterialTransfer === 'function' && typeof formatStatusCell === 'function');

            const infoSummary = `Mã SP: ${detectedLabelData.product_id || ''} | Máy: ${detectedLabelData.station || ''} | Lô: ${detectedLabelData.lot_number || ''} | SL: ${detectedLabelData.quantity || ''} | Barcode: ${detectedLabelData.barcode || ''}`;

            if (isMaterialTransferPage) {
                // Trang Tem vận chuyển: Tra cứu barcode từ material_resource rồi hiển thị lượt chuyển
                try {
                    const mtRes = await fetch('/api/barcodes/material-transfer', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ label_data: detectedLabelData })
                    });
                    const mtData = await mtRes.json();
                    const resolvedBc = (mtData && mtData.resolved_barcode) ? mtData.resolved_barcode : (detectedLabelData.barcode || '');
                    if (resolvedBc && fillTarget) {
                        fillTarget.value = resolvedBc;
                        if (typeof searchMaterialTransfer === 'function') {
                            searchMaterialTransfer();
                        }
                    } else if (fillTarget && detectedLabelData.product_id) {
                        fillTarget.value = detectedLabelData.product_id;
                    }
                    // Ảnh nhiều cột / tem: Không hiển thị kết quả ở ocrResultText, reset dropzone về sẵn sàng
                    resetOcrDropzone();
                    if (resolvedBc) {
                        Toast.success('Nhận diện tem thành công', `Đã tìm thấy mã tem: ${resolvedBc}`);
                    } else {
                        Toast.warning('Không tìm thấy', 'Không tìm thấy dữ liệu vận chuyển khớp với thông tin trên tem');
                    }
                    return;
                } catch (err) {
                    console.error('Error querying material transfer by label:', err);
                }
            } else {
                // Trang Main: Tra cứu trực tiếp bảng kvmes.material_resource theo các thuộc tính tem hoặc mã vạch
                showTableSkeleton(10, 5);
                try {
                    const bcRes = await fetch('/api/barcodes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ label_data: detectedLabelData })
                    });
                    const bcData = await bcRes.json();
                    const resolvedBc = (bcData && bcData.resolved_barcode) 
                        ? bcData.resolved_barcode 
                        : (bcData && bcData.result && bcData.result[0] 
                            ? (Array.isArray(bcData.result[0]) ? bcData.result[0][0] : bcData.result[0].id) 
                            : (detectedLabelData && detectedLabelData.barcode ? detectedLabelData.barcode : ''));

                    if (resolvedBc && fillTarget) {
                        fillTarget.value = resolvedBc;
                    } else if (fillTarget && detectedLabelData.product_id) {
                        fillTarget.value = detectedLabelData.product_id;
                    }

                    if (bcData && Array.isArray(bcData.result) && bcData.result.length > 0) {
                        if (typeof setTableData === 'function') {
                            setTableData(bcData.result, bcData.columns, 'barcode');
                        }
                    } else {
                        if (typeof clearTable === 'function') clearTable();
                        if (resolvedBc && fillTarget) {
                            fillTarget.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                    // Ảnh nhiều cột / tem: Không hiển thị kết quả ở ocrResultText, reset dropzone về sẵn sàng
                    resetOcrDropzone();
                    if (bcData && Array.isArray(bcData.result) && bcData.result.length > 0 && resolvedBc) {
                        Toast.success('Nhận diện tem thành công', `Đã tìm thấy mã tem: ${resolvedBc}`);
                    } else if (resolvedBc) {
                        Toast.info('Đã tìm thấy mã vạch', `Mã vạch trên tem: ${resolvedBc}`);
                    } else {
                        Toast.warning('Không tìm thấy', 'Không tìm thấy tem trong CSDL khớp với thông tin nhận diện');
                    }
                    return;
                } catch (err) {
                    console.error('Error querying barcode by label:', err);
                }
            }
        }

        // TRƯỜNG HỢP 2: HÌNH ẢNH MÃ TEM ĐƠN LẺ / TOÀN CHỮ SỐ (OCR Image-to-Text nguyên bản)
        // Hiển thị kết quả trong ocrResultText và giữ dropzone ở trạng thái Preview
        if (resultTextEl) {
            resultTextEl.textContent = rawText;
            resultTextEl.setAttribute('title', rawText);
        }

        if (fillTarget) {
            fillTarget.value = rawText.toUpperCase();
            fillTarget.dispatchEvent(new Event('input', { bubbles: true }));
            fillTarget.focus();
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

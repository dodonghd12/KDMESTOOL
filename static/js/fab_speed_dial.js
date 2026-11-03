/**
 * ==============================================================================
 * KDMES TOOL — FLOATING ACTION BUTTON (FAB) & SPEED DIAL CONTROLLER
 * Material UI <Fab> / Jetpack Compose FloatingActionButton & SpeedDialAction
 * Accessible Tabs (WAI-ARIA role="tablist", role="tab", role="tabpanel")
 * ==============================================================================
 */

(function () {
    if (window.__kdFabSpeedDialInitialized) return;
    window.__kdFabSpeedDialInitialized = true;

    // ──────────────────────────────────────────────────────────────────────────
    // 1. DATA DEFINITIONS
    // ──────────────────────────────────────────────────────────────────────────

    const PRODUCT_TYPES_DATA = [
        { code: 'I', id: 'INNER_LINER', name: 'Lót trong', label: 'I - INNER_LINER', color: '#38bdf8' },
        { code: 'P', id: 'CARCASS_PLY', name: 'Thân lốp', label: 'P - CARCASS_PLY', color: '#818cf8' },
        { code: 'S', id: 'SIDEWALL', name: 'Hông lốp', label: 'S - SIDEWALL', color: '#c084fc' },
        { code: 'T', id: 'TREAD', name: 'Gai lốp / Mặt lốp', label: 'T - TREAD', color: '#f472b6' },
        { code: 'W', id: 'BEAD', name: 'Tanh lốp', label: 'W - BEAD', color: '#fb923c' },
        { code: 'W0', id: 'BEAD_AND_BEAD_FILLER_PREASSEMBLY', name: 'Cụm tanh & chèn tanh', label: 'W0 - BEAD_AND_BEAD_FILLER_PREASSEMBLY', color: '#facc15' },
        { code: 'W2', id: 'CHAFER', name: 'Bố gia cường tanh', label: 'W2 - CHAFER', color: '#a3e635' },
        { code: 'G', id: 'GREEN_TIRE', name: 'Lốp mộc', label: 'G - GREEN_TIRE', color: '#34d399' },
        { code: 'D', id: 'STEEL_BELT', name: 'Đai thép', label: 'D - STEEL_BELT', color: '#2dd4bf' },
        { code: 'D', id: 'PLY', name: 'Lớp bố', label: 'D - PLY', color: '#22d3ee' },
        { code: 'B', id: 'BELT_AND_EDGE_GUM_PREASSEMBLY', name: 'Cụm đai & mép đai', label: 'B - BELT_AND_EDGE_GUM_PREASSEMBLY', color: '#60a5fa' },
        { code: 'R', id: 'SQUEEZE', name: 'Cao su ép', label: 'R - SQUEEZE', color: '#a78bfa' },
        { code: 'N', id: 'CAP_PLY', name: 'Lớp bao đỉnh', label: 'N - CAP_PLY', color: '#e879f9' },
        { code: 'WF', id: 'BEAD_FILLER', name: 'Chèn tanh', label: 'WF - BEAD_FILLER', color: '#fb7185' },
        { code: 'M', id: 'RUBBER', name: 'Cao su phối liệu', label: 'M - RUBBER', color: '#fdba74' }
    ];

    const BARCODE_PREFIXES_DATA = [
        { prefix: '75', desc: 'Mã vạch lốp mộc / thành phẩm (Green Tire / Cured Tire)', example: '753615400309800F' },
        { prefix: 'I', desc: 'Inner Liner (Lót trong cuộn/tấm)', example: 'I025918020' },
        { prefix: 'P', desc: 'Carcass Ply (Thân lốp)', example: 'P025919170' },
        { prefix: 'S', desc: 'Sidewall (Hông lốp)', example: 'S025918039' },
        { prefix: 'T', desc: 'Tread (Gai lốp)', example: 'T025919267' },
        { prefix: 'W', desc: 'Bead / Bead Assembly (Tanh)', example: 'W025919336' },
        { prefix: 'B', desc: 'Belt Preassembly (Đai thép)', example: 'B125919159' },
        { prefix: 'N', desc: 'Cap Ply (Bao đỉnh)', example: 'N025920009' },
        { prefix: 'G', desc: 'Feed Record ID (Mã cấp liệu thành phẩm)', example: 'G112509200041P840069' },
        { prefix: 'V', desc: 'Trạm / Máy / Pallet ID', example: 'V-B05, V-A26' }
    ];

    // ──────────────────────────────────────────────────────────────────────────
    // 2. SPEED DIAL CONTROLLER
    // ──────────────────────────────────────────────────────────────────────────

    let isSpeedDialOpen = false;

    function toggleSpeedDial() {
        if (isSpeedDialOpen) {
            closeSpeedDial();
        } else {
            openSpeedDial();
        }
    }

    function openSpeedDial() {
        const fab = document.getElementById('kdFabMain');
        const menu = document.getElementById('kdSpeedDialMenu');
        const backdrop = document.getElementById('kdSpeedDialBackdrop');
        if (!fab || !menu) return;

        isSpeedDialOpen = true;
        fab.classList.add('is-open');
        fab.setAttribute('aria-expanded', 'true');
        menu.classList.add('is-open');
        if (backdrop) backdrop.classList.add('is-open');
    }

    function closeSpeedDial() {
        const fab = document.getElementById('kdFabMain');
        const menu = document.getElementById('kdSpeedDialMenu');
        const backdrop = document.getElementById('kdSpeedDialBackdrop');
        if (!fab || !menu) return;

        isSpeedDialOpen = false;
        fab.classList.remove('is-open');
        fab.setAttribute('aria-expanded', 'false');
        menu.classList.remove('is-open');
        if (backdrop) backdrop.classList.remove('is-open');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. ACCESSIBLE TABS ENGINE (WAI-ARIA Specification)
    // ──────────────────────────────────────────────────────────────────────────

    function initAccessibleTabs(tablist) {
        if (!tablist || tablist.dataset.tabsInitialized) return;
        tablist.dataset.tabsInitialized = 'true';

        const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
        const indicator = tablist.querySelector('.kd-tab-indicator');
        const container = tablist.closest('.kd-utility-modal-content') || tablist.parentElement;

        function updateIndicator(activeTab) {
            if (!indicator || !activeTab) return;
            const tabRect = activeTab.getBoundingClientRect();
            const listRect = tablist.getBoundingClientRect();
            const offsetLeft = tabRect.left - listRect.left;
            indicator.style.width = `${tabRect.width}px`;
            indicator.style.transform = `translateX(${offsetLeft}px)`;
        }

        function selectTab(newTab, shouldFocus = true) {
            tabs.forEach(t => {
                const isTarget = (t === newTab);
                t.setAttribute('aria-selected', isTarget ? 'true' : 'false');
                t.setAttribute('tabindex', isTarget ? '0' : '-1');
                t.classList.toggle('active', isTarget);

                const panelId = t.getAttribute('aria-controls');
                if (panelId) {
                    const panel = document.getElementById(panelId);
                    if (panel) {
                        panel.classList.toggle('hidden', !isTarget);
                        panel.classList.toggle('active', isTarget);
                    }
                }
            });

            updateIndicator(newTab);
            if (shouldFocus) {
                newTab.focus();
            }
        }

        // Click handler
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                selectTab(tab, false);
            });
        });

        // Keyboard Navigation (ArrowLeft, ArrowRight, Home, End)
        tablist.addEventListener('keydown', (e) => {
            const currentTab = document.activeElement;
            const currentIndex = tabs.indexOf(currentTab);
            if (currentIndex === -1) return;

            let nextIndex = null;
            if (e.key === 'ArrowRight') {
                nextIndex = (currentIndex + 1) % tabs.length;
            } else if (e.key === 'ArrowLeft') {
                nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
            } else if (e.key === 'Home') {
                nextIndex = 0;
            } else if (e.key === 'End') {
                nextIndex = tabs.length - 1;
            }

            if (nextIndex !== null) {
                e.preventDefault();
                selectTab(tabs[nextIndex], true);
            }
        });

        // Initialize first active tab
        const activeTab = tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0];
        if (activeTab) {
            selectTab(activeTab, false);
        }

        // Window resize reposition
        window.addEventListener('resize', () => {
            const cur = tabs.find(t => t.getAttribute('aria-selected') === 'true');
            if (cur) updateIndicator(cur);
        });

        // Expose update function on tablist for modal opens
        tablist._updateIndicator = () => {
            const cur = tabs.find(t => t.getAttribute('aria-selected') === 'true');
            if (cur) updateIndicator(cur);
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. FYI MODAL CONTROLLER
    // ──────────────────────────────────────────────────────────────────────────

    function openFyiModal() {
        closeSpeedDial();
        const modal = document.getElementById('fyiModal');
        if (!modal) return;

        modal.classList.remove('hidden');
        renderProductTypesList('');

        // Recalculate tab indicator after display transition
        requestAnimationFrame(() => {
            const tablist = modal.querySelector('.kd-tablist');
            if (tablist && tablist._updateIndicator) {
                tablist._updateIndicator();
            }
        });
    }

    function closeFyiModal() {
        const modal = document.getElementById('fyiModal');
        if (modal) modal.classList.add('hidden');
    }

    function renderProductTypesList(query) {
        const container = document.getElementById('fyiProductTypeList');
        if (!container) return;

        const qRaw = (query || '').trim().toLowerCase();
        const q = qRaw.replace(/^wo\b/, 'w0');
        const filtered = PRODUCT_TYPES_DATA.filter(item => {
            if (!qRaw) return true;
            const codeLower = item.code.toLowerCase();
            const labelLower = item.label.toLowerCase();
            return codeLower.includes(q) || codeLower.includes(qRaw) ||
                codeLower.replace('w0', 'wo').includes(qRaw) ||
                item.id.toLowerCase().includes(q) ||
                item.name.toLowerCase().includes(q) ||
                labelLower.includes(q) || labelLower.includes(qRaw);
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="kd-empty-state">
                    <span class="material-symbols-outlined kd-empty-icon">search_off</span>
                    <div class="kd-empty-title">Không tìm thấy loại sản phẩm phù hợp</div>
                    <div class="kd-empty-desc">Thử tìm kiếm với từ khóa khác (ví dụ: INNER, TREAD, W...)</div>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(item => `
            <div class="kd-product-type-card" role="button" tabindex="0" data-code="${escapeHtml(item.id)}" data-label="${escapeHtml(item.label)}" title="Click để sao chép ${escapeHtml(item.label)}">
                <div class="kd-card-badge-wrap">
                    <span class="kd-code-pill" style="--pill-color: ${item.color}">${escapeHtml(item.code)}</span>
                </div>
                <div class="kd-card-body">
                    <div class="kd-card-label">${escapeHtml(item.label)}</div>
                    <div class="kd-card-sub">${escapeHtml(item.name)}</div>
                </div>
                <button type="button" class="kd-card-copy-btn" aria-label="Sao chép ${escapeHtml(item.label)}">
                    <span class="material-symbols-outlined" aria-hidden="true">content_copy</span>
                </button>
            </div>
        `).join('');

        // Bind copy click
        container.querySelectorAll('.kd-product-type-card').forEach(card => {
            card.addEventListener('click', () => {
                const label = card.dataset.label;
                copyToClipboard(label, `Đã sao chép: ${label}`);
            });
        });
    }

    function renderBarcodePrefixList() {
        const container = document.getElementById('fyiBarcodePrefixList');
        if (!container) return;

        container.innerHTML = BARCODE_PREFIXES_DATA.map(item => `
            <div class="kd-prefix-card">
                <div class="kd-prefix-badge">${escapeHtml(item.prefix)}</div>
                <div class="kd-prefix-info">
                    <div class="kd-prefix-desc">${escapeHtml(item.desc)}</div>
                    <div class="kd-prefix-example">Ví dụ: <code>${escapeHtml(item.example)}</code></div>
                </div>
            </div>
        `).join('');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. CONVERT MODAL CONTROLLER (Epoch & Datetime Conversion)
    // ──────────────────────────────────────────────────────────────────────────

    function openConvertModal() {
        closeSpeedDial();
        const modal = document.getElementById('convertModal');
        if (!modal) return;

        modal.classList.remove('hidden');

        // Populate current timestamp if empty
        const input = document.getElementById('epochInput');
        if (input && !input.value.trim()) {
            setEpochToNow();
        } else if (input) {
            handleEpochInputChange();
        }

        initDateToEpochInputs();

        // Recalculate tab indicator after display transition
        requestAnimationFrame(() => {
            const tablist = modal.querySelector('.kd-tablist');
            if (tablist && tablist._updateIndicator) {
                tablist._updateIndicator();
            }
        });
    }

    function closeConvertModal() {
        const modal = document.getElementById('convertModal');
        if (modal) modal.classList.add('hidden');
    }

    /**
     * Formats UTC date strictly as:
     * "Tuesday, November 3, 2026 at 5:51:05 AM"
     */
    function formatUtcFull(date) {
        const options = {
            timeZone: 'UTC',
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        };
        const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
        let weekday = '', month = '', day = '', year = '', hour = '', minute = '', second = '', dayPeriod = '';

        for (const p of parts) {
            if (p.type === 'weekday') weekday = p.value;
            else if (p.type === 'month') month = p.value;
            else if (p.type === 'day') day = p.value;
            else if (p.type === 'year') year = p.value;
            else if (p.type === 'hour') hour = p.value;
            else if (p.type === 'minute') minute = p.value;
            else if (p.type === 'second') second = p.value;
            else if (p.type === 'dayPeriod') dayPeriod = p.value.toUpperCase();
        }
        return `${weekday}, ${month} ${day}, ${year} at ${hour}:${minute}:${second} ${dayPeriod}`;
    }

    /**
     * Formats Local date strictly as:
     * "Tuesday, November 3, 2026 at 12:51:05 PM [UTC+07:00]"
     */
    function formatLocalFull(date) {
        const options = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        };
        const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
        let weekday = '', month = '', day = '', year = '', hour = '', minute = '', second = '', dayPeriod = '';

        for (const p of parts) {
            if (p.type === 'weekday') weekday = p.value;
            else if (p.type === 'month') month = p.value;
            else if (p.type === 'day') day = p.value;
            else if (p.type === 'year') year = p.value;
            else if (p.type === 'hour') hour = p.value;
            else if (p.type === 'minute') minute = p.value;
            else if (p.type === 'second') second = p.value;
            else if (p.type === 'dayPeriod') dayPeriod = p.value.toUpperCase();
        }

        // Timezone offset in +/-HH:MM
        const offsetMin = -date.getTimezoneOffset();
        const sign = offsetMin >= 0 ? '+' : '-';
        const absMin = Math.abs(offsetMin);
        const offH = String(Math.floor(absMin / 60)).padStart(2, '0');
        const offM = String(absMin % 60).padStart(2, '0');
        const tzStr = `[UTC${sign}${offH}:${offM}]`;

        return `${weekday}, ${month} ${day}, ${year} at ${hour}:${minute}:${second} ${dayPeriod} ${tzStr}`;
    }

    /**
     * Formats relative time (e.g. "24 seconds ago", "5 minutes ago", "in 2 days")
     */
    function formatRelative(date) {
        const now = new Date();
        const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);
        const absDiff = Math.abs(diffSeconds);
        const isPast = diffSeconds >= 0;

        if (absDiff < 5) return 'just now';
        if (absDiff < 60) return `${absDiff} seconds ${isPast ? 'ago' : 'from now'}`;
        if (absDiff < 3600) {
            const m = Math.floor(absDiff / 60);
            return `${m} minute${m > 1 ? 's' : ''} ${isPast ? 'ago' : 'from now'}`;
        }
        if (absDiff < 86400) {
            const h = Math.floor(absDiff / 3600);
            return `${h} hour${h > 1 ? 's' : ''} ${isPast ? 'ago' : 'from now'}`;
        }
        if (absDiff < 2592000) {
            const d = Math.floor(absDiff / 86400);
            return `${d} day${d > 1 ? 's' : ''} ${isPast ? 'ago' : 'from now'}`;
        }
        if (absDiff < 31536000) {
            const mo = Math.floor(absDiff / 2592000);
            return `${mo} month${mo > 1 ? 's' : ''} ${isPast ? 'ago' : 'from now'}`;
        }
        const y = Math.floor(absDiff / 31536000);
        return `${y} year${y > 1 ? 's' : ''} ${isPast ? 'ago' : 'from now'}`;
    }

    function handleEpochInputChange() {
        const input = document.getElementById('epochInput');
        const badge = document.getElementById('epochUnitBadge');
        if (!input) return;

        let raw = input.value.trim().replace(/[,_\s]/g, '');
        if (!raw) {
            if (badge) badge.textContent = 'Chờ nhập timestamp...';
            clearEpochResults();
            return;
        }

        // Validate pure digits
        if (!/^-?\d+$/.test(raw)) {
            if (badge) badge.textContent = 'Lỗi: Giá trị phải là chữ số';
            clearEpochResults('Giá trị không hợp lệ (vui lòng chỉ nhập số)');
            return;
        }

        const len = raw.replace('-', '').length;
        let millis = 0;
        let nanosStr = '';
        let detectedUnit = '';

        if (len >= 18) {
            // Nanoseconds (18-19 digits)
            detectedUnit = `Nanoseconds (${len} chữ số)`;
            nanosStr = raw;
            // First 13 digits for millis
            const factor = BigInt(1000000);
            const bn = BigInt(raw);
            millis = Number(bn / factor);
        } else if (len >= 15) {
            // Microseconds (15-16 digits)
            detectedUnit = `Microseconds (${len} chữ số)`;
            nanosStr = raw + '000';
            millis = Number(BigInt(raw) / BigInt(1000));
        } else if (len >= 12) {
            // Milliseconds (12-13 digits)
            detectedUnit = `Milliseconds (${len} chữ số)`;
            nanosStr = raw + '000000';
            millis = Number(raw);
        } else {
            // Seconds (10 digits)
            detectedUnit = `Seconds (${len} chữ số)`;
            nanosStr = raw + '000000000';
            millis = Number(raw) * 1000;
        }

        if (badge) {
            badge.textContent = `Đã nhận diện: ${detectedUnit}`;
        }

        const dateObj = new Date(millis);
        if (isNaN(dateObj.getTime())) {
            clearEpochResults('Dấu mốc thời gian ngoài phạm vi xử lý');
            return;
        }

        const utcStr = formatUtcFull(dateObj);
        const localStr = formatLocalFull(dateObj);
        const relativeStr = formatRelative(dateObj);

        const secStr = String(Math.floor(millis / 1000));
        const msStr = String(millis);

        renderEpochResults({
            utc: utcStr,
            local: localStr,
            relative: relativeStr,
            nanos: nanosStr,
            millis: msStr,
            seconds: secStr,
            iso: dateObj.toISOString()
        });
    }

    function renderEpochResults(data) {
        const container = document.getElementById('epochResultsContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="kd-result-row">
                <div class="kd-result-label"><span class="kd-label-tag tag-utc">UTC</span></div>
                <div class="kd-result-value font-mono" id="valUtc">${escapeHtml(data.utc)}</div>
                <button type="button" class="kd-copy-btn" onclick="copyResultText('valUtc', 'Đã copy UTC time')" title="Copy UTC">
                    <span class="material-symbols-outlined">content_copy</span>
                </button>
            </div>

            <div class="kd-result-row">
                <div class="kd-result-label"><span class="kd-label-tag tag-local">Local time</span></div>
                <div class="kd-result-value font-mono" id="valLocal">${escapeHtml(data.local)}</div>
                <button type="button" class="kd-copy-btn" onclick="copyResultText('valLocal', 'Đã copy Local time')" title="Copy Local">
                    <span class="material-symbols-outlined">content_copy</span>
                </button>
            </div>

            <div class="kd-result-row">
                <div class="kd-result-label"><span class="kd-label-tag tag-relative">Relative</span></div>
                <div class="kd-result-value" id="valRelative">${escapeHtml(data.relative)}</div>
                <button type="button" class="kd-copy-btn" onclick="copyResultText('valRelative', 'Đã copy Relative time')" title="Copy Relative">
                    <span class="material-symbols-outlined">content_copy</span>
                </button>
            </div>

            <div class="kd-breakdown-table-wrap">
                <table class="kd-breakdown-table">
                    <tbody>
                        <tr>
                            <td>Epoch Nanosecond (19 digits)</td>
                            <td class="font-mono text-cyan" id="valNanos">${escapeHtml(data.nanos)}</td>
                            <td><button type="button" class="kd-copy-mini" onclick="copyResultText('valNanos', 'Đã copy Nanosecond')">Copy</button></td>
                        </tr>
                        <tr>
                            <td>Epoch Millisecond (13 digits)</td>
                            <td class="font-mono" id="valMillis">${escapeHtml(data.millis)}</td>
                            <td><button type="button" class="kd-copy-mini" onclick="copyResultText('valMillis', 'Đã copy Millisecond')">Copy</button></td>
                        </tr>
                        <tr>
                            <td>Epoch Second (10 digits)</td>
                            <td class="font-mono" id="valSeconds">${escapeHtml(data.seconds)}</td>
                            <td><button type="button" class="kd-copy-mini" onclick="copyResultText('valSeconds', 'Đã copy Second')">Copy</button></td>
                        </tr>
                        <tr>
                            <td>ISO 8601</td>
                            <td class="font-mono text-muted" id="valIso">${escapeHtml(data.iso)}</td>
                            <td><button type="button" class="kd-copy-mini" onclick="copyResultText('valIso', 'Đã copy ISO 8601')">Copy</button></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    function clearEpochResults(errMsg) {
        const container = document.getElementById('epochResultsContainer');
        if (!container) return;
        if (errMsg) {
            container.innerHTML = `<div class="kd-result-error"><span class="material-symbols-outlined">warning</span> ${escapeHtml(errMsg)}</div>`;
        } else {
            container.innerHTML = '';
        }
    }

    function setEpochToNow() {
        const input = document.getElementById('epochInput');
        if (!input) return;
        const nowMs = Date.now();
        // Generates 19-digit nanoseconds with microsecond precision
        const nanos = String(BigInt(nowMs) * BigInt(1000000));
        input.value = nanos;
        handleEpochInputChange();
    }

    function setEpochToSample() {
        const input = document.getElementById('epochInput');
        if (!input) return;
        input.value = '1793685065000000000';
        handleEpochInputChange();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 6. DATE TO EPOCH (Reverse Conversion)
    // ──────────────────────────────────────────────────────────────────────────

    function initDateToEpochInputs() {
        const dateInput = document.getElementById('d2eDateInput');
        const timeInput = document.getElementById('d2eTimeInput');
        if (!dateInput || !timeInput) return;

        if (!dateInput.value) {
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            dateInput.value = `${y}-${m}-${d}`;

            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            const ss = String(now.getSeconds()).padStart(2, '0');
            timeInput.value = `${hh}:${mm}:${ss}`;
        }
        handleDateToEpochChange();
    }

    function handleDateToEpochChange() {
        const dateInput = document.getElementById('d2eDateInput');
        const timeInput = document.getElementById('d2eTimeInput');
        const tzSelect = document.getElementById('d2eTzSelect');
        const container = document.getElementById('d2eResultsContainer');
        if (!dateInput || !timeInput || !container) return;

        const dateVal = dateInput.value;
        const timeVal = timeInput.value || '00:00:00';
        const isUtc = tzSelect && tzSelect.value === 'UTC';

        if (!dateVal) {
            container.innerHTML = '<div class="kd-result-error">Vui lòng chọn ngày hợp lệ</div>';
            return;
        }

        let parsedDate;
        const [y, m, d] = dateVal.split('-').map(Number);
        const [hh, mm, ss] = timeVal.split(':').map(Number);

        if (isUtc) {
            parsedDate = new Date(Date.UTC(y, m - 1, d, hh || 0, mm || 0, ss || 0, 0));
        } else {
            parsedDate = new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0, 0);
        }

        if (isNaN(parsedDate.getTime())) {
            container.innerHTML = '<div class="kd-result-error">Thời gian đã chọn không hợp lệ</div>';
            return;
        }

        const millis = parsedDate.getTime();
        const seconds = Math.floor(millis / 1000);
        const nanos = String(BigInt(millis) * BigInt(1000000));
        const utcFormatted = formatUtcFull(parsedDate);
        const localFormatted = formatLocalFull(parsedDate);

        container.innerHTML = `
            <div class="kd-d2e-hero-card">
                <div class="kd-hero-header">
                    <span class="kd-hero-badge">Epoch Nanosecond (19 digits)</span>
                    <button type="button" class="btn-copy-hero" onclick="copyResultText('d2eNanosVal', 'Đã copy Nanoseconds!')">
                        <span class="material-symbols-outlined">content_copy</span> Sao chép Nanoseconds
                    </button>
                </div>
                <div class="kd-hero-value font-mono" id="d2eNanosVal">${nanos}</div>
            </div>

            <div class="kd-breakdown-table-wrap">
                <table class="kd-breakdown-table">
                    <tbody>
                        <tr>
                            <td>Epoch Milliseconds (13 digits)</td>
                            <td class="font-mono text-cyan" id="d2eMillisVal">${millis}</td>
                            <td><button type="button" class="kd-copy-mini" onclick="copyResultText('d2eMillisVal', 'Đã copy Milliseconds')">Copy</button></td>
                        </tr>
                        <tr>
                            <td>Epoch Seconds (10 digits)</td>
                            <td class="font-mono" id="d2eSecondsVal">${seconds}</td>
                            <td><button type="button" class="kd-copy-mini" onclick="copyResultText('d2eSecondsVal', 'Đã copy Seconds')">Copy</button></td>
                        </tr>
                        <tr>
                            <td>UTC Representation</td>
                            <td class="font-mono text-muted" id="d2eUtcVal">${escapeHtml(utcFormatted)}</td>
                            <td><button type="button" class="kd-copy-mini" onclick="copyResultText('d2eUtcVal', 'Đã copy UTC')">Copy</button></td>
                        </tr>
                        <tr>
                            <td>Local Representation</td>
                            <td class="font-mono text-muted" id="d2eLocalVal">${escapeHtml(localFormatted)}</td>
                            <td><button type="button" class="kd-copy-mini" onclick="copyResultText('d2eLocalVal', 'Đã copy Local')">Copy</button></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    function setDateToNow() {
        const dateInput = document.getElementById('d2eDateInput');
        const timeInput = document.getElementById('d2eTimeInput');
        if (!dateInput || !timeInput) return;

        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        dateInput.value = `${y}-${m}-${d}`;

        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        timeInput.value = `${hh}:${mm}:${ss}`;

        handleDateToEpochChange();
    }

    function setDatePreset(timeStr) {
        const timeInput = document.getElementById('d2eTimeInput');
        if (timeInput) {
            timeInput.value = timeStr;
            handleDateToEpochChange();
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 7. UTILITIES
    // ──────────────────────────────────────────────────────────────────────────

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function copyToClipboard(text, successMsg) {
        if (!navigator.clipboard) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast(successMsg || 'Đã sao chép');
            return;
        }

        navigator.clipboard.writeText(text).then(() => {
            showToast(successMsg || 'Đã sao chép');
        }).catch(err => {
            console.error('Clipboard error:', err);
            showToast('Không thể sao chép');
        });
    }

    window.copyResultText = function (elementId, msg) {
        const el = document.getElementById(elementId);
        if (el) {
            copyToClipboard(el.textContent.trim(), msg);
        }
    };

    function showToast(msg) {
        let toast = document.getElementById('kdToastNotification');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'kdToastNotification';
            toast.className = 'kd-toast-notification';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('show');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.classList.remove('show');
        }, 2200);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 8. INITIALIZATION & EVENT BINDINGS
    // ──────────────────────────────────────────────────────────────────────────

    function initFabSpeedDial() {
        // FAB Button Click
        const fab = document.getElementById('kdFabMain');
        if (fab) {
            fab.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSpeedDial();
            });
        }

        // Speed Dial Backdrop Click
        const backdrop = document.getElementById('kdSpeedDialBackdrop');
        if (backdrop) {
            backdrop.addEventListener('click', () => {
                closeSpeedDial();
            });
        }

        // Action 1: FYI (Button & Chip)
        const fyiBtn = document.getElementById('kdSpeedDialFyiBtn');
        const fyiChip = document.getElementById('kdSpeedDialFyiChip');
        if (fyiBtn) fyiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            openFyiModal();
        });
        if (fyiChip) fyiChip.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            openFyiModal();
        });

        // Action 2: Convert (Button & Chip)
        const convertBtn = document.getElementById('kdSpeedDialConvertBtn');
        const convertChip = document.getElementById('kdSpeedDialConvertChip');
        if (convertBtn) convertBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            openConvertModal();
        });
        if (convertChip) convertChip.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            openConvertModal();
        });

        // Close Speed Dial when clicking outside
        document.addEventListener('pointerdown', (e) => {
            if (!isSpeedDialOpen) return;
            const container = document.getElementById('kdFabContainer');
            if (container && !container.contains(e.target)) {
                closeSpeedDial();
            }
        });

        // Modal Close Buttons & Backdrops
        const fyiClose = document.getElementById('fyiModalCloseBtn');
        const fyiModal = document.getElementById('fyiModal');
        if (fyiClose) fyiClose.addEventListener('click', closeFyiModal);
        if (fyiModal) {
            fyiModal.addEventListener('click', (e) => {
                if (e.target === fyiModal) closeFyiModal();
            });
        }

        const convertClose = document.getElementById('convertModalCloseBtn');
        const convertModal = document.getElementById('convertModal');
        if (convertClose) convertClose.addEventListener('click', closeConvertModal);
        if (convertModal) {
            convertModal.addEventListener('click', (e) => {
                if (e.target === convertModal) closeConvertModal();
            });
        }

        // Global ESC key to close speed dial or modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (isSpeedDialOpen) {
                    closeSpeedDial();
                    return;
                }
                if (fyiModal && !fyiModal.classList.contains('hidden')) {
                    closeFyiModal();
                    return;
                }
                if (convertModal && !convertModal.classList.contains('hidden')) {
                    closeConvertModal();
                    return;
                }
            }
        });

        // Search in FYI Modal
        const fyiSearch = document.getElementById('fyiProductTypeSearch');
        if (fyiSearch) {
            fyiSearch.addEventListener('input', (e) => {
                renderProductTypesList(e.target.value);
            });
        }

        // Epoch Inputs
        const epochInput = document.getElementById('epochInput');
        if (epochInput) {
            epochInput.addEventListener('input', handleEpochInputChange);
        }
        const epochNowBtn = document.getElementById('epochBtnNow');
        if (epochNowBtn) epochNowBtn.addEventListener('click', setEpochToNow);
        const epochSampleBtn = document.getElementById('epochBtnSample');
        if (epochSampleBtn) epochSampleBtn.addEventListener('click', setEpochToSample);
        const epochClearBtn = document.getElementById('epochBtnClear');
        if (epochClearBtn) {
            epochClearBtn.addEventListener('click', () => {
                if (epochInput) {
                    epochInput.value = '';
                    epochInput.focus();
                    handleEpochInputChange();
                }
            });
        }

        // Date to Epoch Inputs
        const d2eDate = document.getElementById('d2eDateInput');
        const d2eTime = document.getElementById('d2eTimeInput');
        const d2eTz = document.getElementById('d2eTzSelect');
        if (d2eDate) d2eDate.addEventListener('change', handleDateToEpochChange);
        if (d2eTime) d2eTime.addEventListener('input', handleDateToEpochChange);
        if (d2eTz) d2eTz.addEventListener('change', handleDateToEpochChange);

        const d2eNowBtn = document.getElementById('d2eBtnNow');
        if (d2eNowBtn) d2eNowBtn.addEventListener('click', setDateToNow);

        const d2eShift1Btn = document.getElementById('d2eBtnShift1');
        if (d2eShift1Btn) d2eShift1Btn.addEventListener('click', () => setDatePreset('06:00:00'));

        const d2eShift2Btn = document.getElementById('d2eBtnShift2');
        if (d2eShift2Btn) d2eShift2Btn.addEventListener('click', () => setDatePreset('14:00:00'));

        const d2eShift3Btn = document.getElementById('d2eBtnShift3');
        if (d2eShift3Btn) d2eShift3Btn.addEventListener('click', () => setDatePreset('22:00:00'));

        // Initialize all Accessible Tabs
        document.querySelectorAll('.kd-tablist[role="tablist"]').forEach(initAccessibleTabs);

        // Pre-render static lists
        // Barcode prefix tab removed as requested

        // If this window is top-level (not embedded in an iframe), ensure FAB container is displayed
        if (window.self === window.top) {
            const fabContainer = document.getElementById('kdFabContainer');
            if (fabContainer) {
                fabContainer.style.setProperty('display', 'inline-flex', 'important');
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFabSpeedDial);
    } else {
        initFabSpeedDial();
    }

    // Expose helpers globally
    window.kdOpenFyiModal = openFyiModal;
    window.kdOpenConvertModal = openConvertModal;
    window.kdCloseSpeedDial = closeSpeedDial;
})();

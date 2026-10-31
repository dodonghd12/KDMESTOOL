/**
 * ==============================================================================
 * KDMES TOOL — SWITCHING SPELL CONTROLLER
 * Quản lý & tra cứu cấu hình máy in MES từ xa (printers-manager.yaml trên 10.85)
 * ==============================================================================
 */

(function () {
    const currentServer = '198.1.10.85';
    let originalGroups = [];
    let currentGroups = [];
    let filteredGroups = [];
    let selectedFolder = '';
    let isLoading = false;
    let hideBadgeTimeout = null;

    // Quản lý stations & floating dropdown
    const availableStationsCache = {}; // folder -> array of stations
    let activeGroupIndexForAdd = null;
    let activeAnchorBtn = null;
    const newlyAddedStations = new Set();

    // Quản lý printers & floating dropdown
    const availablePrintersCache = {}; // folder -> array of { queue_name, status }
    let activeGroupIndexForPrinter = null;
    let activePrinterAnchorBtn = null;

    function hideStandbyPlaceholder() {
        const ph = document.getElementById('tableStandbyPlaceholder');
        const tbl = document.getElementById('switchingSpellTable');
        const tableContainer = document.getElementById('switchingSpellTableContainer') || document.querySelector('.table-container');
        if (ph) {
            ph.classList.add('has-data');
            ph.style.display = 'none';
        }
        if (tbl) {
            tbl.style.display = '';
        }
        if (tableContainer) {
            tableContainer.classList.remove('hidden');
            tableContainer.style.display = '';
        }
    }

    function showStandbyPlaceholder() {
        const ph = document.getElementById('tableStandbyPlaceholder');
        const tbl = document.getElementById('switchingSpellTable');
        const footer = document.getElementById('tableFooter');
        const tableContainer = document.getElementById('switchingSpellTableContainer') || document.querySelector('.table-container');
        if (ph) {
            ph.classList.remove('has-data');
            ph.style.display = '';
        }
        if (tbl) {
            tbl.style.display = 'none';
        }
        if (footer) {
            footer.classList.add('hidden');
        }
        if (tableContainer) {
            tableContainer.classList.remove('hidden');
            tableContainer.style.display = '';
        }
    }
    document.addEventListener('DOMContentLoaded', initializeSwitchingSpell);

    function initializeSwitchingSpell() {
        const refreshBtn = document.getElementById('btnRefreshLogs');
        const folderSelect = document.getElementById('folderSelect');
        const searchInput = document.getElementById('clientSearch');

        // 1. Khởi tạo nhãn máy chủ ban đầu (198.1.10.85)
        updateServerBadgeUI();
        if (!selectedFolder) {
            showStandbyPlaceholder();
        }

        // 2. Quản lý trạng thái ô tìm kiếm clientSearch (chỉ enable khi đã chọn thư mục và có dữ liệu)
        updateClientSearchState();
        window.updateClientSearchState = function () {
            updateClientSearchState();
        };
        window.customClientSearchHandler = function (keyword) {
            applyClientSearch(keyword);
        };

        // 3. Lắng nghe chọn thư mục máy in: chọn xong bỏ focus dropdown
        if (folderSelect) {
            folderSelect.addEventListener('change', (e) => {
                selectedFolder = e.target.value;
                folderSelect.blur();
                const tableContainer = document.getElementById('switchingSpellTableContainer') || document.querySelector('.table-container');
                if (selectedFolder) {
                    hideStandbyPlaceholder();
                    fetchPrintersConfig(selectedFolder);
                } else {
                    showStandbyPlaceholder();
                    currentGroups = [];
                    originalGroups = [];
                    updateClientSearchState();
                }
            });
        }

                // Nút xem nội dung file printers-manager.yaml
        const btnOpenPrintersYaml = document.getElementById('btnOpenPrintersYaml');
        if (btnOpenPrintersYaml) {
            btnOpenPrintersYaml.addEventListener('click', async () => {
                const folder = selectedFolder || (folderSelect ? folderSelect.value : '');
                if (!folder) {
                    Toast.warning('Cảnh báo', 'Vui lòng chọn một thư mục máy in (p5300_ic, p8300, p8400, p9100) để xem printers-manager.yaml');
                    if (folderSelect) folderSelect.focus();
                    return;
                }

                showStepBadge(`Đang tải printers-manager.yaml (${folder})...`, 'description', 'progress');
                btnOpenPrintersYaml.disabled = true;

                try {
                    const res = await apiFetch('/api/switching-spell/printers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ folder, server: currentServer }),
                        showErrorToast: false
                    });

                    if (!res || !res.success || !res.raw_yaml) {
                        Toast.error('Lỗi', res?.message || 'Không thể đọc nội dung printers-manager.yaml');
                        showStepBadge('Lỗi tải printers-manager.yaml', 'error', 'error');
                        return;
                    }

                    showStepBadge(`Đã tải printers-manager.yaml (${folder})`, 'check_circle', 'success');
                    if (typeof openYamlViewerModal === 'function') {
                        openYamlViewerModal(`printers-manager.yaml (${folder})`, res.raw_yaml, res.yaml_path || `KV2/${folder}/assets/services/printers/printers-manager.yaml`);
                    } else if (typeof showDetailsModal === 'function') {
                        showDetailsModal({
                            'File': res.yaml_path || `KV2/${folder}/printers-manager.yaml`,
                            'Folder': folder,
                            'Content': res.raw_yaml
                        });
                    }
                } catch (err) {
                    Toast.error('Lỗi', `Lỗi kết nối tải printers-manager.yaml: ${err.message}`);
                    showStepBadge('Lỗi kết nối tải printers-manager.yaml', 'error', 'error');
                } finally {
                    btnOpenPrintersYaml.disabled = false;
                }
            });
        }

        // 4. Nút làm mới
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                checkServerStatus(true);
                if (selectedFolder) {
                    fetchPrintersConfig(selectedFolder, true);
                }
            });
        }

        // 5. Ô tìm kiếm
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                applyClientSearch(searchInput.value);
            });
        }

        // 6. Chặn double click trên bảng mở detailsModal
        const tbody = document.getElementById('tableBody');
        if (tbody) {
            tbody.addEventListener('dblclick', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }, true);
        }

        // 7. Khởi tạo các bộ điều khiển Station Floating Dropdown, Printer Floating Dropdown, Undo, SaveHold
        initFloatingDropdown();
        initPrinterFloatingDropdown();
        initUndoButton();
        initSaveHoldButton();

        // 8. Tự động kiểm tra trạng thái máy chủ (tận dụng cache từ Avada Kedavra nếu có)
        checkServerStatus(false);
    }

    /**
     * Cập nhật giao diện badge máy chủ đích
     */
    function updateServerBadgeUI() {
        const labelEl = document.getElementById('currentServerLabel');
        if (labelEl) {
            labelEl.textContent = `root@${currentServer}`;
        }
    }

    /**
     * Kiểm tra trạng thái máy chủ
     */
    async function checkServerStatus(forceRefresh = false) {
        showStepBadge(`Đang kiểm tra root@${currentServer}...`, 'dns', 'progress');

        try {
            const fetchFn = (window.top && window.top.getAvadaKedavraServerStatus)
                || window.getAvadaKedavraServerStatus
                || (async (server, force) => {
                    const res = await fetch(`/api/avada-kedavra/status?server=${encodeURIComponent(server)}`);
                    return await res.json();
                });

            const data = await fetchFn(currentServer, forceRefresh);

            if (data && data.success) {
                showStepBadge(`Đã kết nối root@${currentServer}`, 'check_circle', 'success');
                hideStepBadgeAfterDelay(4000);
            } else {
                showStepBadge(`Lỗi kết nối root@${currentServer}`, 'error', 'error');
                hideStepBadgeAfterDelay(5000);
            }
        } catch (err) {
            console.error('[SWITCHING_SPELL] Lỗi kiểm tra máy chủ:', err);
            showStepBadge(`Lỗi kết nối root@${currentServer}`, 'error', 'error');
            hideStepBadgeAfterDelay(5000);
        }
    }

    /**
     * Tải cấu hình printers-manager.yaml theo folder
     */
    async function fetchPrintersConfig(folder, isRefresh = false) {
        if (!folder) return;
        isLoading = true;

        hideStandbyPlaceholder();
        showStepBadge(`Đang đọc cấu hình (${folder})...`, 'sync', 'progress');
        showTableLoading(folder);
        closeStationFloatingDropdown();
        closePrinterFloatingDropdown();

        try {
            const res = await fetch(`/api/switching-spell/printers?folder=${encodeURIComponent(folder)}&server=${encodeURIComponent(currentServer)}`);
            const data = await res.json();

            if (data.success) {
                currentGroups = data.groups || [];
                originalGroups = JSON.parse(JSON.stringify(currentGroups));
                newlyAddedStations.clear();
                checkDirtyAndUpdateFooter();

                const totalSt = data.total_stations || sumStations(currentGroups);

                renderTable(currentGroups);
                applyClientSearch(document.getElementById('clientSearch')?.value || '');

                const successMsg = `Đã nạp ${currentGroups.length} nhóm máy in (${totalSt} trạm) - ${folder}`;
                showStepBadge(successMsg, 'check_circle', 'success');
                hideStepBadgeAfterDelay(5000);

                if (isRefresh && typeof Toast !== 'undefined') {
                    Toast.success('Thành công', `Đã làm mới cấu hình máy in cho ${folder}`);
                }
            } else {
                currentGroups = [];
                originalGroups = [];
                newlyAddedStations.clear();
                checkDirtyAndUpdateFooter();

                renderTable([]);
                showTableError(data.message || `Không thể tải cấu hình máy in ${folder}`);

                showStepBadge(`Lỗi đọc file (${folder})`, 'error', 'error');
                hideStepBadgeAfterDelay(5000);

                if (typeof Toast !== 'undefined') {
                    Toast.error('Lỗi', data.message || `Không tìm thấy file printers-manager.yaml`);
                }
            }
        } catch (err) {
            console.error('[SWITCHING_SPELL] Lỗi nạp cấu hình máy in:', err);
            currentGroups = [];
            originalGroups = [];
            newlyAddedStations.clear();
            checkDirtyAndUpdateFooter();

            renderTable([]);
            showTableError('Lỗi kết nối tới máy chủ khi tải cấu hình máy in');

            showStepBadge(`Lỗi kết nối (${folder})`, 'error', 'error');
            hideStepBadgeAfterDelay(5000);

            if (typeof Toast !== 'undefined') {
                Toast.error('Lỗi kết nối', 'Không thể gửi yêu cầu tới máy chủ MES');
            }
        } finally {
            isLoading = false;
            updateClientSearchState();
        }
    }

    function sumStations(groups) {
        return groups.reduce((acc, g) => acc + (Array.isArray(g.stations) ? g.stations.length : 1), 0);
    }

    /**
     * Render dữ liệu vào Table
     */
    function renderTable(groups) {
        const tbody = document.getElementById('tableBody');
        const footer = document.getElementById('tableFooter');
        const rowCountEl = document.getElementById('rowCount');
        const stationBadgeEl = document.getElementById('stationCountBadge');
        if (!tbody) return;

        hideStandbyPlaceholder();
        filteredGroups = groups;

        if (!groups || groups.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" class="switching-spell-empty-state">
                        <div class="empty-placeholder-box">
                            <span class="material-symbols-outlined empty-icon">search_off</span>
                            <span class="empty-title">Không có dữ liệu máy in phù hợp</span>
                            <span class="empty-subtitle">Không tìm thấy nhóm máy in hoặc công đoạn nào</span>
                        </div>
                    </td>
                </tr>
            `;
            if (footer) footer.classList.add('hidden');
            if (rowCountEl) rowCountEl.textContent = '0';
            if (stationBadgeEl) {
                stationBadgeEl.textContent = '';
                stationBadgeEl.style.display = 'none';
            }
            return;
        }

        let html = '';
        let totalStationsCount = 0;

        groups.forEach((group, index) => {
            const rawStations = Array.isArray(group.stations) ? group.stations : [group.stations];
            const stations = rawStations.filter(s => s != null && String(s).trim() !== '');
            totalStationsCount += stations.length;

            const realIndex = currentGroups.indexOf(group);
            const targetGroupIndex = realIndex !== -1 ? realIndex : index;

            const stationsHtml = stations.map(st => {
                const safeSt = escapeHtml(String(st).trim());
                const isNew = newlyAddedStations.has(`${targetGroupIndex}:${safeSt}`);
                return `
                    <div class="station-row ${isNew ? 'newly-added' : ''}" data-station="${safeSt}">
                        <span class="station-code">${safeSt}</span>
                        ${isNew ? '<span class="station-new-tag">Mới</span>' : ''}
                        <button type="button" class="btn-remove-station" data-group-index="${targetGroupIndex}" data-station="${safeSt}" title="Xóa station ${safeSt} khỏi nhóm này" aria-label="Xóa station">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                `;
            }).join('');

            const curPrinter = String(group.printerName || '--').trim();
            const defPrinter = String(group.defaultPrinterName || group.printerName || '--').trim();
            const isCustom = Boolean(group.isCustomPrinter) || (curPrinter !== defPrinter && defPrinter !== '--');
            const safePrinter = escapeHtml(curPrinter);
            const safeDefault = escapeHtml(defPrinter);

            html += `
                <tr data-group-index="${targetGroupIndex}">
                    <td style="text-align: center; font-weight: 600; color: var(--color-text-muted);">${index + 1}</td>
                    <td>
                        <div class="stations-cell-wrapper">
                            ${stationsHtml || '<span style="color: var(--color-text-muted); font-size: 11.5px; font-style: italic;">Chưa có trạm</span>'}
                            <button type="button" class="btn-add-station" data-group-index="${targetGroupIndex}" title="Thêm station vào nhóm này" aria-label="Thêm station">
                                <span class="material-symbols-outlined">add</span>
                            </button>
                        </div>
                    </td>
                    <td>
                        <div class="printer-cell-wrapper">
                            <div class="printer-badge-group">
                                <span class="printer-name-tag ${isCustom ? 'is-custom' : ''}">
                                    <span class="material-symbols-outlined printer-icon">print</span>
                                    <span class="printer-name-text">${safePrinter}</span>
                                </span>
                                ${isCustom ? `
                                    <button type="button" class="btn-return-default-printer" data-group-index="${targetGroupIndex}" title="Khôi phục máy in mặc định (${safeDefault})" aria-label="Khôi phục mặc định">
                                        <span class="material-symbols-outlined">replay</span>
                                    </button>
                                ` : ''}
                            </div>
                            <button type="button" class="btn-change-printer" data-group-index="${targetGroupIndex}" title="Chọn máy in từ danh sách CUPS" aria-label="Đổi máy in">
                                <span class="material-symbols-outlined">edit</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

        if (footer) footer.classList.remove('hidden');
        if (rowCountEl) rowCountEl.textContent = String(groups.length);
        if (stationBadgeEl) {
            stationBadgeEl.textContent = `Tổng số: ${totalStationsCount} trạm`;
            stationBadgeEl.style.display = 'inline-flex';
        }
        updateClientSearchState();

        if (typeof window.updateTableStickyOffsets === 'function') {
            window.updateTableStickyOffsets();
        }
    }

    /**
     * Lọc nhanh bảng theo từ khóa
     */
    function applyClientSearch(keyword) {
        const kw = (keyword || '').trim().toLowerCase();
        if (!kw) {
            renderTable(currentGroups);
            return;
        }

        const matched = currentGroups.filter(g => {
            const pMatch = (g.printerName || '').toLowerCase().includes(kw);
            const stMatch = Array.isArray(g.stations)
                ? g.stations.some(s => String(s || '').toLowerCase().includes(kw))
                : String(g.stations || '').toLowerCase().includes(kw);
            return pMatch || stMatch;
        });

        renderTable(matched);
    }

    /**
     * Khởi tạo Floating Dropdown cho việc thêm Station
     */
    function initFloatingDropdown() {
        const tbody = document.getElementById('tableBody');
        const dropdown = document.getElementById('stationFloatingDropdown');
        const searchInput = document.getElementById('stationDropdownSearch');
        const clearBtn = document.getElementById('stationDropdownClearSearch');
        const listEl = document.getElementById('stationDropdownList');
        if (!tbody || !dropdown) return;

        // Bắt sự kiện click trên các nút của từng dòng trong bảng
        tbody.addEventListener('click', (e) => {
            // 1. Xóa station khỏi nhóm
            const removeBtn = e.target.closest('.btn-remove-station');
            if (removeBtn) {
                e.preventDefault();
                e.stopPropagation();

                const groupIndex = parseInt(removeBtn.dataset.groupIndex, 10);
                const stationName = (removeBtn.dataset.station || '').trim();

                if (isNaN(groupIndex) || !stationName || !currentGroups[groupIndex]) return;

                const rawStations = Array.isArray(currentGroups[groupIndex].stations) 
                    ? currentGroups[groupIndex].stations 
                    : [currentGroups[groupIndex].stations];

                currentGroups[groupIndex].stations = rawStations.filter(
                    st => String(st || '').trim() !== stationName
                );

                // Xóa khỏi newlyAddedStations nếu trước đó vừa thêm
                newlyAddedStations.delete(`${groupIndex}:${stationName}`);

                // Cập nhật lại giao diện và kiểm tra trạng thái dirty (hiện Save / Undo)
                closeStationFloatingDropdown();
                renderTable(currentGroups);
                checkDirtyAndUpdateFooter();
                return;
            }

            // 2. Bấm nút '+' ở mỗi dòng để mở station dropdown
            const addBtn = e.target.closest('.btn-add-station');
            if (addBtn) {
                e.preventDefault();
                e.stopPropagation();
                closePrinterFloatingDropdown();
                const groupIndex = parseInt(addBtn.dataset.groupIndex, 10);
                toggleStationFloatingDropdown(groupIndex, addBtn);
                return;
            }

            // 3. Bấm nút return default printer để khôi phục máy in mặc định
            const returnBtn = e.target.closest('.btn-return-default-printer');
            if (returnBtn) {
                e.preventDefault();
                e.stopPropagation();
                const groupIndex = parseInt(returnBtn.dataset.groupIndex, 10);
                if (isNaN(groupIndex) || !currentGroups[groupIndex]) return;
                const defP = currentGroups[groupIndex].defaultPrinterName || currentGroups[groupIndex].printerName;
                currentGroups[groupIndex].printerName = defP;
                currentGroups[groupIndex].isCustomPrinter = false;
                closePrinterFloatingDropdown();
                closeStationFloatingDropdown();
                renderTable(currentGroups);
                checkDirtyAndUpdateFooter();
                if (typeof Toast !== 'undefined' && Toast.info) {
                    Toast.info('Đã hoàn tác máy in', `Đã khôi phục máy in mặc định (${defP}) cho nhóm #${groupIndex + 1}`);
                }
                return;
            }

            // 4. Bấm nút đổi máy in để mở printer floating dropdown
            const changePrinterBtn = e.target.closest('.btn-change-printer');
            if (changePrinterBtn) {
                e.preventDefault();
                e.stopPropagation();
                closeStationFloatingDropdown();
                const groupIndex = parseInt(changePrinterBtn.dataset.groupIndex, 10);
                togglePrinterFloatingDropdown(groupIndex, changePrinterBtn);
                return;
            }
        });

        // Tìm kiếm trong floating dropdown
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                if (clearBtn) clearBtn.style.display = searchInput.value ? 'inline-flex' : 'none';
                filterAndRenderDropdownStations();
            });
        }

        // Xóa text tìm kiếm
        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (searchInput) {
                    searchInput.value = '';
                    clearBtn.style.display = 'none';
                    filterAndRenderDropdownStations();
                    searchInput.focus();
                }
            });
        }

        // Chọn station từ list
        if (listEl) {
            listEl.addEventListener('click', (e) => {
                const item = e.target.closest('.station-dropdown-item');
                if (!item || item.classList.contains('is-disabled')) return;
                e.preventDefault();
                e.stopPropagation();

                const stationName = item.dataset.station;
                if (stationName && activeGroupIndexForAdd != null) {
                    addStationToGroup(activeGroupIndexForAdd, stationName);
                    closeStationFloatingDropdown();
                }
            });
        }

        // Bấm ngoài để đóng
        document.addEventListener('click', (e) => {
            if (dropdown.style.display === 'none') return;
            if (!dropdown.contains(e.target) && !e.target.closest('.btn-add-station')) {
                closeStationFloatingDropdown();
            }
        });

        // Phím Escape để đóng
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && dropdown.style.display !== 'none') {
                closeStationFloatingDropdown();
            }
        });

        // Căn chỉnh khi scroll / resize
        window.addEventListener('scroll', () => {
            if (activeAnchorBtn && dropdown.style.display !== 'none') {
                positionFloatingDropdown(activeAnchorBtn);
            }
        }, { passive: true });

        window.addEventListener('resize', () => {
            if (activeAnchorBtn && dropdown.style.display !== 'none') {
                positionFloatingDropdown(activeAnchorBtn);
            }
        }, { passive: true });
    }

    /**
     * Bật/Tắt Floating Dropdown
     */
    async function toggleStationFloatingDropdown(groupIndex, anchorBtn) {
        const dropdown = document.getElementById('stationFloatingDropdown');
        if (!dropdown) return;

        if (dropdown.style.display !== 'none' && activeGroupIndexForAdd === groupIndex) {
            closeStationFloatingDropdown();
            return;
        }

        activeGroupIndexForAdd = groupIndex;
        activeAnchorBtn = anchorBtn;

        dropdown.style.display = 'flex';
        positionFloatingDropdown(anchorBtn);

        const searchInput = document.getElementById('stationDropdownSearch');
        const clearBtn = document.getElementById('stationDropdownClearSearch');
        if (searchInput) {
            searchInput.value = '';
            if (clearBtn) clearBtn.style.display = 'none';
            setTimeout(() => searchInput.focus(), 30);
        }

        const currentStations = availableStationsCache[selectedFolder];
        if (currentStations == null) {
            await loadAvailableStations(selectedFolder);
        } else {
            filterAndRenderDropdownStations();
        }
    }

    function closeStationFloatingDropdown() {
        const dropdown = document.getElementById('stationFloatingDropdown');
        if (dropdown) dropdown.style.display = 'none';
        activeGroupIndexForAdd = null;
        activeAnchorBtn = null;
    }

    function positionFloatingDropdown(anchorBtn) {
        const dropdown = document.getElementById('stationFloatingDropdown');
        if (!dropdown || !anchorBtn) return;

        const rect = anchorBtn.getBoundingClientRect();
        const dropdownWidth = 290;
        const dropdownHeight = dropdown.offsetHeight || 300;

        let top = rect.bottom + 4;
        let left = rect.left;

        if (top + dropdownHeight > window.innerHeight - 10) {
            top = Math.max(10, rect.top - dropdownHeight - 4);
        }

        if (left + dropdownWidth > window.innerWidth - 10) {
            left = Math.max(10, window.innerWidth - dropdownWidth - 10);
        }

        dropdown.style.top = `${top}px`;
        dropdown.style.left = `${left}px`;
    }

    /**
     * Gọi API lấy danh sách stations từ kvmes.station theo folder hiện tại
     */
    async function loadAvailableStations(folder) {
        const targetFolder = folder || selectedFolder || '';
        const listEl = document.getElementById('stationDropdownList');
        const emptyEl = document.getElementById('stationDropdownEmpty');
        if (emptyEl) emptyEl.style.display = 'none';
        if (listEl) {
            listEl.innerHTML = `
                <div style="padding: 24px; text-align: center; color: var(--color-text-muted);">
                    <span class="material-symbols-outlined" style="animation: akStepSpin 1s infinite linear; font-size: 24px; color: #38bdf8;">progress_activity</span>
                    <div style="margin-top: 6px; font-size: 12px;">Đang tải danh sách station...</div>
                </div>
            `;
        }

        try {
            const url = targetFolder 
                ? `/api/switching-spell/available-stations?folder=${encodeURIComponent(targetFolder)}`
                : '/api/switching-spell/available-stations';
            const res = await fetch(url);
            const data = await res.json();
            if (data.success && Array.isArray(data.stations)) {
                availableStationsCache[targetFolder] = data.stations;
                filterAndRenderDropdownStations();
            } else {
                if (listEl) {
                    listEl.innerHTML = `
                        <div style="padding: 16px; text-align: center; color: #fb7185; font-size: 12px;">
                            ${escapeHtml(data.message || 'Không thể tải danh sách station')}
                        </div>
                    `;
                }
            }
        } catch (err) {
            console.error('[SWITCHING_SPELL] Lỗi tải stations:', err);
            if (listEl) {
                listEl.innerHTML = `
                    <div style="padding: 16px; text-align: center; color: #fb7185; font-size: 12px;">
                        Lỗi kết nối khi tải danh sách station
                    </div>
                `;
            }
        }
    }

    /**
     * Lọc và render danh sách station trong floating dropdown
     */
    function filterAndRenderDropdownStations() {
        const listEl = document.getElementById('stationDropdownList');
        const emptyEl = document.getElementById('stationDropdownEmpty');
        const searchInput = document.getElementById('stationDropdownSearch');
        const currentStations = availableStationsCache[selectedFolder] || [];
        if (!listEl) return;

        // Thu thập tất cả các station đã tồn tại trong TOÀN BỘ các nhóm máy in
        const existingStationsMap = new Map(); // stationUpper -> groupIndex
        currentGroups.forEach((g, gIdx) => {
            const raw = Array.isArray(g.stations) ? g.stations : [g.stations];
            raw.forEach(s => {
                if (s) {
                    const key = String(s).trim().toUpperCase();
                    if (!existingStationsMap.has(key)) {
                        existingStationsMap.set(key, gIdx);
                    }
                }
            });
        });

        const kw = (searchInput?.value || '').trim().toUpperCase();
        const filtered = currentStations.filter(st => !kw || st.toUpperCase().includes(kw));

        if (filtered.length === 0) {
            listEl.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'flex';
            return;
        }

        if (emptyEl) emptyEl.style.display = 'none';

        // Đưa các station khả dụng lên đầu, các station đã có (is-disabled) xuống cuối danh sách
        const enabledStations = [];
        const disabledStations = [];

        filtered.forEach(st => {
            if (existingStationsMap.has(st.toUpperCase())) {
                disabledStations.push(st);
            } else {
                enabledStations.push(st);
            }
        });

        const sortedStations = enabledStations.concat(disabledStations);

        const html = sortedStations.map(st => {
            const stUpper = st.toUpperCase();
            const existingInGroupIdx = existingStationsMap.get(stUpper);
            const isAlready = existingInGroupIdx !== undefined;
            const tooltip = isAlready 
                ? (existingInGroupIdx === activeGroupIndexForAdd 
                    ? 'Station đã có trong nhóm này' 
                    : `Station đã có trong nhóm #${existingInGroupIdx + 1}`)
                : 'Bấm để thêm station';

            return `
                <div class="station-dropdown-item ${isAlready ? 'is-disabled' : ''}" data-station="${escapeHtml(st)}" title="${escapeHtml(tooltip)}">
                    <span class="station-name">${escapeHtml(st)}</span>
                    ${isAlready ? '<span class="already-badge">(Đã có)</span>' : ''}
                </div>
            `;
        }).join('');

        listEl.innerHTML = html;
    }

    /**
     * Thêm station vào nhóm
     */
    function addStationToGroup(groupIndex, stationName) {
        const group = currentGroups[groupIndex];
        if (!group) return;

        if (!Array.isArray(group.stations)) {
            group.stations = group.stations != null ? [group.stations] : [];
        }

        // Kiểm tra tránh trùng lặp trong toàn bộ các nhóm
        for (let i = 0; i < currentGroups.length; i++) {
            const g = currentGroups[i];
            const gStations = Array.isArray(g.stations) ? g.stations : [g.stations];
            if (gStations.some(s => String(s || '').trim().toUpperCase() === stationName.toUpperCase())) {
                if (typeof Toast !== 'undefined') {
                    Toast.warning('Trùng lặp', `Station ${stationName} đã có trong nhóm #${i + 1}`);
                }
                return;
            }
        }

        group.stations.push(stationName);
        newlyAddedStations.add(`${groupIndex}:${stationName}`);

        renderTable(currentGroups);
        checkDirtyAndUpdateFooter();

        if (typeof Toast !== 'undefined') {
            Toast.success('Đã thêm station', `Đã thêm ${stationName} vào nhóm #${groupIndex + 1}`);
        }
    }

    /**
     * Khởi tạo Floating Dropdown cho việc chọn Máy in từ CUPS
     */
    function initPrinterFloatingDropdown() {
        const dropdown = document.getElementById('printerFloatingDropdown');
        const searchInput = document.getElementById('printerDropdownSearch');
        const clearBtn = document.getElementById('printerDropdownClearSearch');
        const listEl = document.getElementById('printerDropdownList');
        if (!dropdown) return;

        // Tìm kiếm trong printer floating dropdown
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                if (clearBtn) clearBtn.style.display = searchInput.value ? 'inline-flex' : 'none';
                filterAndRenderDropdownPrinters();
            });
        }

        // Xóa text tìm kiếm
        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (searchInput) {
                    searchInput.value = '';
                    clearBtn.style.display = 'none';
                    filterAndRenderDropdownPrinters();
                    searchInput.focus();
                }
            });
        }

        // Chọn printer từ list
        if (listEl) {
            listEl.addEventListener('click', (e) => {
                const item = e.target.closest('.printer-dropdown-item');
                if (!item || item.classList.contains('is-disabled')) return;
                e.preventDefault();
                e.stopPropagation();

                const printerName = item.dataset.printer;
                if (printerName && activeGroupIndexForPrinter != null) {
                    selectPrinterForGroup(activeGroupIndexForPrinter, printerName);
                }
            });
        }

        // Bấm ngoài để đóng
        document.addEventListener('click', (e) => {
            if (dropdown.style.display === 'none') return;
            if (!dropdown.contains(e.target) && !e.target.closest('.btn-change-printer')) {
                closePrinterFloatingDropdown();
            }
        });

        // Phím Escape để đóng
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && dropdown.style.display !== 'none') {
                closePrinterFloatingDropdown();
            }
        });

        // Căn chỉnh khi scroll / resize
        window.addEventListener('scroll', () => {
            if (activePrinterAnchorBtn && dropdown.style.display !== 'none') {
                positionPrinterFloatingDropdown(activePrinterAnchorBtn);
            }
        }, { passive: true });

        window.addEventListener('resize', () => {
            if (activePrinterAnchorBtn && dropdown.style.display !== 'none') {
                positionPrinterFloatingDropdown(activePrinterAnchorBtn);
            }
        }, { passive: true });
    }

    /**
     * Bật/Tắt Printer Floating Dropdown
     */
    async function togglePrinterFloatingDropdown(groupIndex, anchorBtn) {
        const dropdown = document.getElementById('printerFloatingDropdown');
        if (!dropdown) return;

        if (dropdown.style.display !== 'none' && activeGroupIndexForPrinter === groupIndex) {
            closePrinterFloatingDropdown();
            return;
        }

        closeStationFloatingDropdown();

        activeGroupIndexForPrinter = groupIndex;
        activePrinterAnchorBtn = anchorBtn;

        dropdown.style.display = 'flex';
        positionPrinterFloatingDropdown(anchorBtn);

        const searchInput = document.getElementById('printerDropdownSearch');
        const clearBtn = document.getElementById('printerDropdownClearSearch');
        if (searchInput) {
            searchInput.value = '';
            if (clearBtn) clearBtn.style.display = 'none';
            setTimeout(() => searchInput.focus(), 30);
        }

        const currentPrinters = availablePrintersCache[selectedFolder];
        if (currentPrinters == null) {
            await loadAvailablePrinters(selectedFolder);
        } else {
            filterAndRenderDropdownPrinters();
        }
    }

    function closePrinterFloatingDropdown() {
        const dropdown = document.getElementById('printerFloatingDropdown');
        if (dropdown) dropdown.style.display = 'none';
        activeGroupIndexForPrinter = null;
        activePrinterAnchorBtn = null;
    }

    function positionPrinterFloatingDropdown(anchorBtn) {
        const dropdown = document.getElementById('printerFloatingDropdown');
        if (!dropdown || !anchorBtn) return;

        const rect = anchorBtn.getBoundingClientRect();
        const dropdownWidth = 330;
        const dropdownHeight = dropdown.offsetHeight || 320;

        let top = rect.bottom + 4;
        let left = rect.left - dropdownWidth + rect.width;

        if (top + dropdownHeight > window.innerHeight - 10) {
            top = Math.max(10, rect.top - dropdownHeight - 4);
        }

        if (left < 10) {
            left = Math.max(10, rect.left);
        }

        if (left + dropdownWidth > window.innerWidth - 10) {
            left = Math.max(10, window.innerWidth - dropdownWidth - 10);
        }

        dropdown.style.top = `${top}px`;
        dropdown.style.left = `${left}px`;
    }

    /**
     * Gọi API lấy danh sách máy in CUPS theo folder hiện tại
     */
    async function loadAvailablePrinters(folder) {
        const targetFolder = folder || selectedFolder || '';
        const listEl = document.getElementById('printerDropdownList');
        const emptyEl = document.getElementById('printerDropdownEmpty');
        if (emptyEl) emptyEl.style.display = 'none';
        if (listEl) {
            listEl.innerHTML = `
                <div style="padding: 24px; text-align: center; color: var(--color-text-muted);">
                    <span class="material-symbols-outlined" style="animation: akStepSpin 1s infinite linear; font-size: 24px; color: #38bdf8;">progress_activity</span>
                    <div style="margin-top: 6px; font-size: 12px;">Đang tải danh sách máy in từ CUPS...</div>
                </div>
            `;
        }

        try {
            const url = targetFolder 
                ? `/api/switching-spell/available-printers?folder=${encodeURIComponent(targetFolder)}`
                : '/api/switching-spell/available-printers';
            const res = await fetch(url);
            const data = await res.json();
            if (data.success && Array.isArray(data.printers)) {
                availablePrintersCache[targetFolder] = data.printers;
                filterAndRenderDropdownPrinters();
            } else {
                if (listEl) {
                    listEl.innerHTML = `
                        <div style="padding: 16px; text-align: center; color: #fb7185; font-size: 12px;">
                            ${escapeHtml(data.message || 'Không thể tải danh sách máy in')}
                        </div>
                    `;
                }
            }
        } catch (err) {
            console.error('[SWITCHING_SPELL] Lỗi tải printers:', err);
            if (listEl) {
                listEl.innerHTML = `
                    <div style="padding: 16px; text-align: center; color: #fb7185; font-size: 12px;">
                        Lỗi kết nối khi tải danh sách máy in CUPS
                    </div>
                `;
            }
        }
    }

    /**
     * Lọc và render danh sách máy in trong floating dropdown
     */
    function filterAndRenderDropdownPrinters() {
        const listEl = document.getElementById('printerDropdownList');
        const emptyEl = document.getElementById('printerDropdownEmpty');
        const searchInput = document.getElementById('printerDropdownSearch');
        const currentPrinters = availablePrintersCache[selectedFolder] || [];
        if (!listEl) return;

        // Thu thập các máy in đang được sử dụng ở bất kỳ nhóm nào
        const inUsePrintersMap = new Map(); // printerNameUpper -> groupIndex
        currentGroups.forEach((g, gIdx) => {
            const p = String(g.printerName || '').trim();
            if (p && p !== '--') {
                inUsePrintersMap.set(p.toUpperCase(), gIdx);
            }
        });

        const kw = (searchInput?.value || '').trim().toUpperCase();
        const filtered = currentPrinters.filter(p => !kw || p.queue_name.toUpperCase().includes(kw));

        if (filtered.length === 0) {
            listEl.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'flex';
            return;
        }

        if (emptyEl) emptyEl.style.display = 'none';

        // Đưa các máy in khả dụng lên đầu, các máy in đã được dùng (is-disabled) xuống cuối danh sách
        const enabledPrinters = [];
        const disabledPrinters = [];

        filtered.forEach(p => {
            if (inUsePrintersMap.has(p.queue_name.toUpperCase())) {
                disabledPrinters.push(p);
            } else {
                enabledPrinters.push(p);
            }
        });

        const sortedPrinters = enabledPrinters.concat(disabledPrinters);

        const html = sortedPrinters.map(p => {
            const pUpper = p.queue_name.toUpperCase();
            const inUseInGroupIdx = inUsePrintersMap.get(pUpper);
            const isInUse = inUseInGroupIdx !== undefined;
            const isCurrentGroup = inUseInGroupIdx === activeGroupIndexForPrinter;

            const rawStatus = String(p.status || 'Idle').trim();
            const isIdle = rawStatus.toLowerCase() === 'idle';
            const statusText = isIdle ? 'Idle' : 'Error';
            const statusClass = isIdle ? 'is-idle' : 'is-error';
            const errorSuffix = isIdle ? '' : ` [Lỗi: ${rawStatus}]`;

            const tooltip = isInUse 
                ? (isCurrentGroup 
                    ? `Máy in đang được chọn cho nhóm này${errorSuffix}` 
                    : `Máy in đang được gán cho nhóm #${inUseInGroupIdx + 1}${errorSuffix}`)
                : (isIdle ? 'Chọn máy in (Sẵn sàng)' : `Máy in đang bị lỗi: ${rawStatus}`);

            return `
                <div class="printer-dropdown-item ${isInUse ? 'is-disabled' : ''}" data-printer="${escapeHtml(p.queue_name)}" title="${escapeHtml(tooltip)}">
                    <div class="printer-dropdown-item-main">
                        <span class="material-symbols-outlined printer-item-icon">print</span>
                        <span class="printer-queue-name">${escapeHtml(p.queue_name)}</span>
                    </div>
                    <div class="printer-dropdown-item-meta">
                        <span class="printer-status-badge ${statusClass}" title="${isIdle ? 'Trạng thái: Sẵn sàng (Idle)' : escapeHtml('Lỗi máy in: ' + rawStatus)}">${statusText}</span>
                        ${isInUse ? '<span class="already-badge">(Đang dùng)</span>' : ''}
                    </div>
                </div>
            `;
        }).join('');

        listEl.innerHTML = html;
    }

    /**
     * Gán máy in cho nhóm
     */
    function selectPrinterForGroup(groupIndex, printerName) {
        const group = currentGroups[groupIndex];
        if (!group) return;

        if (group.printerName === printerName) {
            closePrinterFloatingDropdown();
            return;
        }

        const def = group.defaultPrinterName || group.printerName;
        group.printerName = printerName;
        group.isCustomPrinter = (printerName !== def);

        closePrinterFloatingDropdown();
        renderTable(currentGroups);
        checkDirtyAndUpdateFooter();

        if (typeof Toast !== 'undefined' && Toast.success) {
            Toast.success('Đã chọn máy in', `Đã gán ${printerName} cho nhóm #${groupIndex + 1}`);
        }
    }

    /**
     * Kiểm tra trạng thái thay đổi và cập nhật hiển thị nút Undo, SaveHold
     */
    function checkDirtyAndUpdateFooter() {
        const btnSave = document.getElementById('btnSaveHold');
        const btnUndo = document.getElementById('btnUndoChanges');
        const dirty = isDirtyState();

        if (btnSave) btnSave.style.display = dirty ? 'inline-flex' : 'none';
        if (btnUndo) btnUndo.style.display = dirty ? 'inline-flex' : 'none';
    }

    function isDirtyState() {
        if (!originalGroups || originalGroups.length === 0) return false;
        if (currentGroups.length !== originalGroups.length) return true;

        for (let i = 0; i < currentGroups.length; i++) {
            const curG = currentGroups[i];
            const origG = originalGroups[i];

            // 1. So sánh printerName
            const curP = String(curG.printerName || '').trim();
            const origP = String(origG.printerName || '').trim();
            if (curP !== origP) return true;

            // 2. So sánh stations
            const curSt = Array.isArray(curG.stations) ? curG.stations : [curG.stations];
            const origSt = Array.isArray(origG.stations) ? origG.stations : [origG.stations];

            if (curSt.length !== origSt.length) return true;

            const setOrig = new Set(origSt.map(s => String(s || '').trim().toUpperCase()));
            for (const s of curSt) {
                if (!setOrig.has(String(s || '').trim().toUpperCase())) return true;
            }
        }
        return false;
    }

    /**
     * Khởi tạo nút Undo
     */
    function initUndoButton() {
        const btnUndo = document.getElementById('btnUndoChanges');
        if (!btnUndo) return;

        btnUndo.addEventListener('click', () => {
            currentGroups = JSON.parse(JSON.stringify(originalGroups));
            newlyAddedStations.clear();
            closeStationFloatingDropdown();
            closePrinterFloatingDropdown();
            renderTable(currentGroups);
            checkDirtyAndUpdateFooter();

            if (typeof Toast !== 'undefined' && Toast.info) {
                Toast.info('Đã hoàn tác', 'Đã khôi phục lại cấu hình máy in và stations ban đầu');
            }
        });
    }

    /**
     * Khởi tạo nút SaveHold (Giữ chuột 3 giây)
     */
    function initSaveHoldButton() {
        const btn = document.getElementById('btnSaveHold');
        const progressBar = document.getElementById('saveProgressBar');
        const btnText = document.getElementById('saveBtnText');
        if (!btn || !progressBar || !btnText) return;

        let holdStartTime = null;
        let holdAnimFrame = null;
        const HOLD_DURATION_MS = 3000;

        function startHold(e) {
            if (btn.disabled || btn.classList.contains('is-saving')) return;
            if (e.button !== 0 && e.type !== 'touchstart') return; // Left mouse or touch
            e.preventDefault();

            holdStartTime = performance.now();

            function updateProgress(now) {
                const elapsed = now - holdStartTime;
                const pct = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
                progressBar.style.width = `${pct}%`;

                if (elapsed >= HOLD_DURATION_MS) {
                    cancelHold();
                    executeSaveHold();
                } else {
                    holdAnimFrame = requestAnimationFrame(updateProgress);
                }
            }

            holdAnimFrame = requestAnimationFrame(updateProgress);
        }

        function cancelHold() {
            if (holdAnimFrame) {
                cancelAnimationFrame(holdAnimFrame);
                holdAnimFrame = null;
            }
            holdStartTime = null;
            if (progressBar) progressBar.style.width = '0%';
            if (btnText && !btn.classList.contains('is-saving')) btnText.textContent = 'Save';
        }

        btn.addEventListener('mousedown', startHold);
        btn.addEventListener('touchstart', startHold, { passive: false });

        btn.addEventListener('mouseup', cancelHold);
        btn.addEventListener('mouseleave', cancelHold);
        btn.addEventListener('touchend', cancelHold);
        btn.addEventListener('touchcancel', cancelHold);
    }

    /**
     * Thực thi lưu thay đổi cấu hình vào printers-manager.yaml trên server MES
     */
    async function executeSaveHold() {
        if (!selectedFolder) {
            if (typeof Toast !== 'undefined' && Toast.warning) {
                Toast.warning('Chưa chọn thư mục', 'Vui lòng chọn thư mục máy in trước khi lưu');
            }
            return;
        }

        const btnSave = document.getElementById('btnSaveHold');
        const btnUndo = document.getElementById('btnUndoChanges');
        const saveBtnText = document.getElementById('saveBtnText');
        const progressBar = document.getElementById('saveProgressBar');

        if (btnSave) {
            btnSave.disabled = true;
            btnSave.classList.add('is-saving');
        }
        if (btnUndo) btnUndo.disabled = true;
        if (saveBtnText) saveBtnText.textContent = 'Đang lưu...';
        if (progressBar) progressBar.style.width = '0%';

        showStepBadge(`Đang lưu printers-manager.yaml (${selectedFolder})...`, 'sync', 'progress');

        try {
            const payload = {
                folder: selectedFolder,
                groups: currentGroups,
                server: currentServer || '198.1.10.85'
            };

            const res = await fetch('/api/switching-spell/save-printers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (data.success) {
                originalGroups = JSON.parse(JSON.stringify(currentGroups));
                newlyAddedStations.clear();
                closeStationFloatingDropdown();
                closePrinterFloatingDropdown();
                renderTable(currentGroups);
                checkDirtyAndUpdateFooter();

                const cName = data.container_name || `mesage_kv2_${selectedFolder}`;
                const cStat = data.container_status || 'Up';
                const isRunning = data.is_running !== false && data.restart_success !== false;

                if (isRunning) {
                    if (typeof Toast !== 'undefined' && Toast.success) {
                        Toast.success('Lưu & Khởi động thành công', `Đã lưu file và khởi động lại ${cName} (${cStat})`);
                    }
                    showStepBadge(`${cName}: ${cStat}`, 'check_circle', 'success');
                    hideStepBadgeAfterDelay(8000);
                } else {
                    if (typeof Toast !== 'undefined' && Toast.warning) {
                        Toast.warning('Cảnh báo container', data.message || `Đã lưu file nhưng container ${cName} đang ở trạng thái ${cStat}`);
                    }
                    showStepBadge(`${cName}: ${cStat}`, 'warning', 'error');
                }

                if (data.docker_ps) {
                    console.log(`[SWITCHING_SPELL] Trạng thái docker ps (${cName}):\n`, data.docker_ps);
                    const badge = document.getElementById('containerStatusBadge');
                    if (badge) badge.title = data.docker_ps;
                }
            } else {
                if (typeof Toast !== 'undefined' && Toast.error) {
                    Toast.error('Lưu thất bại', data.message || 'Không thể lưu file printers-manager.yaml');
                }
                showStepBadge(`Lỗi lưu file (${selectedFolder})`, 'error', 'error');
            }
        } catch (err) {
            console.error('[SWITCHING_SPELL] Lỗi khi lưu cấu hình:', err);
            if (typeof Toast !== 'undefined' && Toast.error) {
                Toast.error('Lỗi kết nối', 'Không thể gửi yêu cầu lưu cấu hình tới server');
            }
            showStepBadge(`Lỗi kết nối khi lưu (${selectedFolder})`, 'error', 'error');
        } finally {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.classList.remove('is-saving');
            }
            if (btnUndo) btnUndo.disabled = false;
            if (saveBtnText) saveBtnText.textContent = 'Save';
            checkDirtyAndUpdateFooter();
        }
    }

    /**
     * Hiển thị trạng thái Loading trong Table
     */
    function showTableLoading(folder) {
        const tbody = document.getElementById('tableBody');
        const footer = document.getElementById('tableFooter');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="switching-spell-empty-state">
                    <div class="empty-placeholder-box">
                        <span class="material-symbols-outlined empty-icon" style="animation: akStepSpin 1s infinite linear;">progress_activity</span>
                        <span class="empty-title">Đang đọc printers-manager.yaml (${escapeHtml(folder)})...</span>
                        <span class="empty-subtitle">Kết nối SSH root@${escapeHtml(currentServer)}</span>
                    </div>
                </td>
            </tr>
        `;
        if (footer) footer.classList.add('hidden');
    }

    /**
     * Hiển thị trạng thái Lỗi trong Table
     */
    function showTableError(msg) {
        const tbody = document.getElementById('tableBody');
        const footer = document.getElementById('tableFooter');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="switching-spell-empty-state">
                    <div class="empty-placeholder-box">
                        <span class="material-symbols-outlined empty-icon" style="color: #f43f5e;">error</span>
                        <span class="empty-title" style="color: #fb7185;">Không thể tải cấu hình</span>
                        <span class="empty-subtitle">${escapeHtml(msg)}</span>
                    </div>
                </td>
            </tr>
        `;
        if (footer) footer.classList.add('hidden');
    }

    /**
     * Hiển thị Live Step Badge
     */
    function showStepBadge(text, icon = 'sync', type = 'info') {
        const badge = document.getElementById('containerStatusBadge');
        const iconEl = document.getElementById('stepBadgeIcon');
        const textEl = document.getElementById('containerStatusText');
        if (!badge || !textEl) return;

        if (hideBadgeTimeout) {
            clearTimeout(hideBadgeTimeout);
            hideBadgeTimeout = null;
        }

        badge.classList.remove('is-step-info', 'is-step-success', 'is-step-error', 'is-step-progress', 'fade-out');
        badge.classList.add(`is-step-${type}`);

        if (iconEl && icon) {
            iconEl.textContent = icon;
        }

        textEl.textContent = text;
        badge.style.display = 'inline-flex';
        badge.style.opacity = '1';
    }

    function hideStepBadgeAfterDelay(delay = 4000) {
        if (hideBadgeTimeout) clearTimeout(hideBadgeTimeout);
        hideBadgeTimeout = setTimeout(() => {
            const badge = document.getElementById('containerStatusBadge');
            if (badge) {
                badge.classList.add('fade-out');
                setTimeout(() => {
                    badge.style.display = 'none';
                    badge.classList.remove('fade-out');
                }, 350);
            }
        }, delay);
    }

    function updateClientSearchState() {
        const searchInput = document.getElementById('clientSearch');
        if (searchInput) {
            const canSearch = Boolean(selectedFolder && currentGroups && currentGroups.length > 0);
            searchInput.disabled = !canSearch;
            if (!canSearch) {
                searchInput.value = '';
            } else {
                searchInput.removeAttribute('disabled');
            }
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
})();

const SUB_COLUMNS = ['NVL gốc', 'NVL thay thế', 'Tỷ lệ', 'Cập nhật lúc', 'Người cập nhật'];
let allSubstitutionRows = [];
let visibleSubstitutionRows = [];
let activeSearchSeq = 0;

document.addEventListener('DOMContentLoaded', function () {
    initializeSubstitutionsEventListeners();
});

function initializeSubstitutionsEventListeners() {
    const substitutionsInput = document.getElementById('substitutions');
    if (substitutionsInput) {
        substitutionsInput.addEventListener('input', debounceSearch(searchSubstitutions, 500));

        substitutionsInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
            if (e.target.value.trim()) {
                if (typeof showTableLoadingState === 'function') {
                    showTableLoadingState('Đang tra cứu nguyên vật liệu thay thế...', SUB_COLUMNS.length);
                }
            } else {
                activeSearchSeq++;
                resetSubstitutionsState();
            }
        });
    }

    const tbody = document.getElementById('tableBody');
    if (tbody) {
        tbody.addEventListener('click', async (e) => {
            const copyPill = e.target.closest('.sub-material-pill[data-copy-id]');
            if (!copyPill) return;

            const subId = copyPill.dataset.copyId || '';
            if (!subId) return;

            const ok = typeof copyTextToClipboard === 'function'
                ? await copyTextToClipboard(subId)
                : await navigator.clipboard.writeText(subId).then(() => true).catch(() => false);

            if (ok && typeof Toast !== 'undefined' && Toast.success) {
                Toast.success('Đã sao chép', `Đã sao chép mã NVL thay thế: ${subId}`);
            }
        });
    }
}

function escapeSubHtml(str) {
    if (typeof escapeHtml === 'function') return escapeHtml(str);
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}

function resetSubstitutionsState() {
    allSubstitutionRows = [];
    visibleSubstitutionRows = [];
    const tableFooter = document.querySelector('.table-footer');
    if (tableFooter) {
        tableFooter.classList.add('hidden');
    }
    if (typeof clearTable === 'function') {
        clearTable();
    }
}

function resolveColIndex(columns, name, fallbackIdx) {
    if (Array.isArray(columns)) {
        const idx = columns.findIndex(c => String(c || '').trim().toLowerCase() === name);
        if (idx !== -1) return idx;
    }
    return fallbackIdx;
}

function flattenSubstitutionsResponse(result, columns) {
    if (!Array.isArray(result) || result.length === 0) return [];

    const idIdx = resolveColIndex(columns, 'id', 0);
    const subIdx = resolveColIndex(columns, 'substitutions', 1);
    const updatedAtIdx = resolveColIndex(columns, 'updated_at', 2);
    const updatedByIdx = resolveColIndex(columns, 'updated_by', 3);

    const flattened = [];
    result.forEach((row) => {
        const originId = String(row?.[idIdx] ?? '').trim();
        const rawSubCell = row?.[subIdx];
        const updatedAt = String(row?.[updatedAtIdx] ?? '').trim();
        const updatedBy = String(row?.[updatedByIdx] ?? '').trim();

        let parsedList = null;
        if (Array.isArray(rawSubCell)) {
            parsedList = rawSubCell;
        } else if (typeof rawSubCell === 'string') {
            const trimmed = rawSubCell.trim();
            if (trimmed) {
                try {
                    const candidate = JSON.parse(trimmed);
                    if (Array.isArray(candidate)) parsedList = candidate;
                } catch (parseErr) {
                    console.warn('Invalid substitutions JSON payload, falling back to raw text:', parseErr);
                    parsedList = null;
                }
            } else {
                parsedList = [];
            }
        } else if (rawSubCell == null) {
            parsedList = [];
        }

        if (Array.isArray(parsedList)) {
            if (parsedList.length === 0) {
                flattened.push({
                    id: originId,
                    subId: '',
                    proportion: '',
                    updatedAt,
                    updatedBy,
                    isEmptyList: true,
                    isRawFallback: false
                });
            } else {
                parsedList.forEach((entry) => {
                    const subId = String(entry?.ID ?? entry?.id ?? '').trim();
                    const proportionRaw = entry?.Proportion ?? entry?.proportion ?? '';
                    flattened.push({
                        id: originId,
                        subId,
                        proportion: proportionRaw === null || proportionRaw === undefined ? '' : String(proportionRaw).trim(),
                        updatedAt,
                        updatedBy,
                        isEmptyList: false,
                        isRawFallback: false
                    });
                });
            }
        } else {
            flattened.push({
                id: originId,
                subId: String(rawSubCell ?? '').trim(),
                proportion: '',
                updatedAt,
                updatedBy,
                isEmptyList: false,
                isRawFallback: true
            });
        }
    });

    return flattened;
}

function formatProportionBadge(val) {
    const str = String(val ?? '').trim();
    if (!str) {
        return { text: '-', html: '<span class="sub-empty-note">-</span>' };
    }

    const num = Number(str);
    if (!Number.isNaN(num) && Number.isFinite(num) && num > 0 && num <= 1) {
        const pct = String(Math.round(num * 10000) / 100);
        const label = `${str} (${pct}%)`;
        const cls = num === 1 ? 'is-full' : 'is-partial';
        return {
            text: label,
            html: `<span class="sub-ratio-badge ${cls}">${escapeSubHtml(label)}</span>`
        };
    }

    return {
        text: str,
        html: `<span class="sub-ratio-badge is-other">${escapeSubHtml(str)}</span>`
    };
}

function toPlainExportRows(rows) {
    return rows.map((r) => [
        r.id,
        r.isEmptyList ? '' : r.subId,
        r.proportion,
        r.updatedAt,
        r.updatedBy
    ]);
}

function renderSubstitutionsTable(rows, emptyMsg = 'Không tìm thấy NVL thay thế nào phù hợp') {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    const rowCount = document.getElementById('rowCount');
    const placeholder = document.getElementById('tableStandbyPlaceholder');
    if (!thead || !tbody) return;

    if (placeholder) {
        placeholder.classList.add('has-data');
        placeholder.style.display = 'none';
    }

    visibleSubstitutionRows = Array.isArray(rows) ? rows : [];
    rawTableColumns = [...SUB_COLUMNS];
    filteredTableData = toPlainExportRows(visibleSubstitutionRows);

    thead.innerHTML = '';
    tbody.innerHTML = '';

    if (visibleSubstitutionRows.length === 0) {
        if (rowCount) rowCount.textContent = '0';
        const emptyTr = document.createElement('tr');
        const emptyTd = document.createElement('td');
        emptyTd.colSpan = SUB_COLUMNS.length;
        emptyTd.style.textAlign = 'center';
        emptyTd.style.padding = '48px 20px';
        emptyTd.innerHTML = `
            <div class="table-empty-state">
                <div class="empty-state-icon-wrapper">
                    <span class="material-symbols-outlined empty-state-icon">search_off</span>
                </div>
                <div class="empty-state-title">Không có dữ liệu hiển thị</div>
                <div class="empty-state-desc">${escapeSubHtml(emptyMsg)}</div>
            </div>
        `;
        emptyTr.appendChild(emptyTd);
        tbody.appendChild(emptyTr);
        if (typeof updateVisibleRowCount === 'function') updateVisibleRowCount();
        if (typeof updateTableStickyOffsets === 'function') updateTableStickyOffsets();
        return;
    }

    const headerRow = document.createElement('tr');
    SUB_COLUMNS.forEach((col) => {
        const th = document.createElement('th');
        th.textContent = col;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    let prevOrigin = null;
    visibleSubstitutionRows.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.dataset.index = String(index);

        const isRepeatOrigin = prevOrigin !== null && item.id === prevOrigin;
        prevOrigin = item.id;

        const safeId = escapeSubHtml(item.id || '-');
        const safeSubId = escapeSubHtml(item.subId);
        const ratio = formatProportionBadge(item.proportion);
        const safeTime = escapeSubHtml(item.updatedAt || '-');
        const safeUser = escapeSubHtml(item.updatedBy || '-');

        const cells = [
            {
                label: SUB_COLUMNS[0],
                full: item.id || '-',
                html: `<span class="sub-origin-code ${isRepeatOrigin ? 'sub-origin-repeat' : ''}">${safeId}</span>`
            },
            {
                label: SUB_COLUMNS[1],
                full: item.isEmptyList ? 'Không có NVL thay thế' : (item.subId || '-'),
                html: item.isEmptyList
                    ? '<span class="sub-empty-note">Không có NVL thay thế</span>'
                    : (item.isRawFallback
                        ? `<span class="sub-raw-fallback">${safeSubId}</span>`
                        : `<button type="button" class="sub-material-pill" data-copy-id="${safeSubId}" title="Nhấp chuột trái để sao chép ${safeSubId}"><span>${safeSubId}</span><span class="material-symbols-outlined sub-copy-icon" aria-hidden="true">content_copy</span></button>`)
            },
            {
                label: SUB_COLUMNS[2],
                full: ratio.text,
                html: ratio.html
            },
            {
                label: SUB_COLUMNS[3],
                full: item.updatedAt || '-',
                html: `<span class="sub-meta-time">${safeTime}</span>`
            },
            {
                label: SUB_COLUMNS[4],
                full: item.updatedBy || '-',
                html: `<span class="sub-meta-user">${safeUser}</span>`
            }
        ];

        cells.forEach((cell) => {
            const td = document.createElement('td');
            td.setAttribute('data-label', cell.label);
            td.dataset.label = cell.label;
            td.dataset.fullValue = cell.full;
            td.innerHTML = cell.html;
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });

    if (typeof updateVisibleRowCount === 'function') updateVisibleRowCount();
    if (typeof updateTableStickyOffsets === 'function') updateTableStickyOffsets();
}

window.customClientSearchHandler = function (keyword) {
    const q = String(keyword || '').trim().toLowerCase();
    if (!q) {
        renderSubstitutionsTable(allSubstitutionRows);
        return;
    }

    const filtered = allSubstitutionRows.filter((row) =>
        [row.id, row.subId, row.proportion, row.updatedAt, row.updatedBy]
            .some((val) => val && String(val).toLowerCase().includes(q))
    );
    renderSubstitutionsTable(filtered, `Không tìm thấy kết quả phù hợp với "${keyword}"`);
};

window.getPageExportData = function () {
    const ts = typeof getVietnamTimestamp === 'function' ? getVietnamTimestamp() : Date.now();
    return {
        columns: [...SUB_COLUMNS],
        rows: toPlainExportRows(visibleSubstitutionRows),
        filename: `KDMES_NVL_Thay_The_${ts}.xlsx`,
        sheetName: 'NVL_Thay_The'
    };
};

async function searchSubstitutions() {
    const inputEl = document.getElementById('substitutions');
    const keyword = inputEl ? inputEl.value.trim() : '';
    if (!keyword) {
        resetSubstitutionsState();
        return;
    }

    const requestSeq = ++activeSearchSeq;
    if (typeof showTableLoadingState === 'function') {
        showTableLoadingState('Đang tra cứu nguyên vật liệu thay thế...', SUB_COLUMNS.length);
    }

    try {
        const response = await fetch('/api/barcodes/get-substitutions-list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword })
        });

        if (requestSeq !== activeSearchSeq) return;

        let data = null;
        try {
            data = await response.json();
        } catch (jsonErr) {
            console.warn('Failed to parse substitutions API JSON:', jsonErr);
            data = null;
        }

        if (typeof isUnauthorizedResponse === 'function' && isUnauthorizedResponse(response.status, data)) {
            if (typeof showAuthExpiredModal === 'function') {
                showAuthExpiredModal(data ? data.message : null);
            }
            resetSubstitutionsState();
            return;
        }

        if (!response.ok || (data && data.success === false)) {
            Toast.error('Lỗi kết nối cơ sở dữ liệu', (data && data.message) ? data.message : `Lỗi kết nối cơ sở dữ liệu (${response.status})`);
            resetSubstitutionsState();
            return;
        }

        const rawRows = (data && Array.isArray(data.result)) ? data.result : [];
        allSubstitutionRows = flattenSubstitutionsResponse(rawRows, data ? data.columns : null);
        rawTableData = toPlainExportRows(allSubstitutionRows);

        const searchInput = document.getElementById('clientSearch');
        if (searchInput && typeof clearInputBox === 'function') {
            clearInputBox(searchInput);
        }
        if (typeof updateClientSearchState === 'function') {
            updateClientSearchState(allSubstitutionRows.length > 0);
        }

        const emptyMsg = `Không tìm thấy NVL thay thế nào cho "${keyword}"`;
        renderSubstitutionsTable(allSubstitutionRows, emptyMsg);

        if (allSubstitutionRows.length === 0) {
            Toast.warning('Không có dữ liệu', emptyMsg);
        } else {
            Toast.success('Thành công', `Tìm thấy ${allSubstitutionRows.length.toLocaleString()} dòng NVL thay thế cho "${keyword}"`);
        }
    } catch (error) {
        if (requestSeq !== activeSearchSeq) return;
        console.error('Error searching substitutions:', error);
        Toast.error('Lỗi', 'Lỗi kết nối khi tìm kiếm NVL thay thế');
        resetSubstitutionsState();
    }
}

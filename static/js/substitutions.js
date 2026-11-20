const SUB_COLUMNS = ['id', 'substitutions', 'proportion', 'updated_at', 'updated_by'];
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
                clearTable();
            }
        });
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

    const rows = [];
    result.forEach((row) => {
        const originId = row?.[idIdx] ?? '';
        const rawSubCell = row?.[subIdx];
        const updatedAt = row?.[updatedAtIdx] ?? '';
        const updatedBy = row?.[updatedByIdx] ?? '';

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
                rows.push([originId, '', '', updatedAt, updatedBy]);
            } else {
                parsedList.forEach((entry) => {
                    const subId = entry?.ID ?? entry?.id ?? '';
                    const proportion = entry?.Proportion ?? entry?.proportion ?? '';
                    rows.push([
                        originId,
                        subId,
                        proportion === null || proportion === undefined ? '' : String(proportion),
                        updatedAt,
                        updatedBy
                    ]);
                });
            }
        } else {
            rows.push([originId, rawSubCell ?? '', '', updatedAt, updatedBy]);
        }
    });

    return rows;
}

async function searchSubstitutions() {
    const inputEl = document.getElementById('substitutions');
    const keyword = inputEl ? inputEl.value.trim() : '';
    if (!keyword) {
        clearTable();
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
            clearTable();
            return;
        }

        if (!response.ok || (data && data.success === false)) {
            Toast.error('Lỗi kết nối cơ sở dữ liệu', (data && data.message) ? data.message : `Lỗi kết nối cơ sở dữ liệu (${response.status})`);
            clearTable();
            return;
        }

        const rawRows = (data && Array.isArray(data.result)) ? data.result : [];
        const flattenedRows = flattenSubstitutionsResponse(rawRows, data ? data.columns : null);
        const emptyMsg = `Không tìm thấy NVL thay thế nào cho "${keyword}"`;
        const successMsg = `Tìm thấy ${flattenedRows.length.toLocaleString()} dòng NVL thay thế cho "${keyword}"`;
        setTableData(flattenedRows, [...SUB_COLUMNS], null, emptyMsg, successMsg);
    } catch (error) {
        if (requestSeq !== activeSearchSeq) return;
        console.error('Error searching barcode:', error);
        Toast.error('Lỗi', 'Lỗi kết nối khi tìm kiếm NVL thay thế');
        clearTable();
    }
}

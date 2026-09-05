const REPRINT_REASON_MAP = {
    1: 'Quét lố',
    2: 'Quét xót',
    3: 'Tem hư',
    4: 'TH làm mất',
    5: 'CBK làm mất'
};

function mapReprintReason(rows, columns) {
    const colIndex = columns.indexOf('reprintReason');
    if (colIndex === -1) return rows;

    return rows.map(row => {
        const newRow = [...row];
        const val = newRow[colIndex];
        newRow[colIndex] = REPRINT_REASON_MAP[val] ?? `Unknown (${val})`;
        return newRow;
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeReprintEventListeners();
    initDateRangePicker('reprint');
});

function initializeReprintEventListeners() {
    document.addEventListener('sidebar:about', () => {
        showAbout();
    });

    document.addEventListener('sidebar:logout', () => {
        handleLogout();
    });

    const dateRangeInput = document.getElementById('dateRange'); 
    dateRangeInput.addEventListener('input', e => {
        if (!e.target.value) {
            document.getElementById('fromDate').value = '';
            document.getElementById('toDate').value = '';
            checkQueryReprintBarcode();
        }
    });

}

function checkQueryReprintBarcode() {
    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate   = document.getElementById('toDate')?.value || '';

    if (!fromDate || !toDate) {
        clearTable();
        return;
    }

    queryReprintBarcode(fromDate, toDate);
}

async function queryReprintBarcode(fromDate, toDate) {
    if (!fromDate || !toDate) {
        clearTable();
        return;
    }

    // +1 ngày vì Api KD lấy data theo ngày trước 1 ngày toDate (CreatedBefore)
    const toDateExclusive = addOneDay(toDate);
    const data = await apiFetch('/api/barcodes/get-reprint-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({from_date: fromDate, to_date: toDateExclusive})
    });

    if (Array.isArray(data.result) && data.result.length === 0) {
        await showAlert(`Không có tem in bù từ ${fromDate} đến ${toDate}`, 'error');
        clearTable();
        return;
    }

    const mappedResult = mapReprintReason(data.result, data.columns);
    setTableData(mappedResult, data.columns, null);
}

function addOneDay(dateStr) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + 1);
    return formatDate(d);
}
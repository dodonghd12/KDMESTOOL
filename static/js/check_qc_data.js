document.addEventListener('DOMContentLoaded', function() {
    initializeQCDataEventListeners();
    initDateRangePicker('check_qc_data');
});

function initializeQCDataEventListeners() {
    document.addEventListener('sidebar:about', () => { showAbout(); });
    document.addEventListener('sidebar:logout', () => { handleLogout(); });

    // Clear table khi xóa ngày
    const dateRangeInput = document.getElementById('dateRange');
    if (dateRangeInput) {
        dateRangeInput.addEventListener('input', e => {
            if (!e.target.value) {
                document.getElementById('fromDate').value = '';
                document.getElementById('toDate').value = '';
                checkAndSearchQCData();
            }
        });
    }

    const productInput = document.getElementById('qc_product_id');
    if (productInput) {
        productInput.addEventListener('input', e => {
            e.target.value = e.target.value.toUpperCase();
        });

        productInput.addEventListener('keydown', async e => {
            if (e.key !== 'Enter') return;

            const fromDate = document.getElementById('fromDate').value;
            const toDate   = document.getElementById('toDate').value;

            if (!fromDate || !toDate) {
                await showAlert('Vui lòng chọn khoảng ngày trước', 'warning');
                return;
            }

            await fetchQCData(fromDate, toDate, productInput.value.trim());
        });
    }
}

function checkAndSearchQCData() {
    const fromDate  = document.getElementById('fromDate')?.value || '';
    const toDate    = document.getElementById('toDate')?.value || '';
    // const productId = document.getElementById('qc_product_id')?.value.trim() || '';

    if (!fromDate || !toDate) {
        clearTable();
        return;
    }

    fetchQCData(fromDate, toDate);
    // fetchQCData(fromDate, toDate, productId);
}

async function fetchQCData(fromDate, toDate, productId = '') {
    if (!fromDate || !toDate) {
        clearTable();
        return;
    }

    if (typeof showTableSkeleton === 'function') {
        showTableSkeleton(6, 5);
    }

    try {
        const data = await apiFetch('/api/get-qc-data-by-date', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fromDate, toDate, product_id: productId })
        });

        if (!data || !data.success) {
            Toast.error('Lỗi', (data && data.message) ? data.message : 'Lỗi khi tải dữ liệu QC');
            clearTable();
            return;
        }

        const dateRangeMsg = fromDate === toDate ? `trong ${fromDate}` : `từ ${fromDate} đến ${toDate}`;
        const emptyMsg = `Không có dữ liệu QC ${dateRangeMsg}` + (productId ? ` cho sản phẩm ${productId}` : '');

        if (!data.result || data.result.length === 0) {
            setTableData([], data.columns || [], 'qc_data', emptyMsg);
            return;
        }

        setTableData(data.result, data.columns, 'qc_data', null, `Tìm thấy ${data.result.length} bản ghi dữ liệu QC`);
    } catch (error) {
        console.error('Error fetching QC data:', error);
        clearTable();
    }
}
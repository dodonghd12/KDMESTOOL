document.addEventListener('DOMContentLoaded', function () {
    initializeCheckMesyncEventListeners();
});

function initializeCheckMesyncEventListeners() {
    const mesyncInput = document.getElementById('mesync_keyword');
    if (mesyncInput) {
        mesyncInput.addEventListener(
            'input',
            debounceSearch(fetchMesyncEvents, 500)
        );

        mesyncInput.addEventListener('input', e => {
            e.target.value = e.target.value.toUpperCase();
            if (e.target.value.trim() && typeof showTableSkeleton === 'function') {
                showTableSkeleton(6, 5);
            } else if (!e.target.value.trim()) {
                clearTable();
            }
        });
    }
}

async function fetchMesyncEvents() {
    const keyword = document.getElementById('mesync_keyword').value.trim();
    if (!keyword) {
        clearTable();
        return;
    }

    if (typeof showTableSkeleton === 'function') {
        showTableSkeleton(6, 5);
    }

    try {
        const response = await fetch('/api/mesync/get-mesync-inbox-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword })
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

        if (data && Array.isArray(data.result)) {
            setTableData(data.result, data.columns, null, `Không tìm thấy sự kiện Mesync nào cho "${keyword}"`);
        } else {
            setTableData([], data ? data.columns : [], null, `Không tìm thấy sự kiện Mesync nào cho "${keyword}"`);
        }
    } catch (error) {
        console.error('Error fetching mesync events:', error);
        Toast.error('Lỗi', 'Lỗi kết nối khi tìm kiếm Mesync');
        clearTable();
    }
}
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
        });
    }
}

async function fetchMesyncEvents() {
    const keyword = document.getElementById('mesync_keyword').value.trim();
    if (!keyword) {
        clearTable();
        return;
    }

    try {
        const response = await fetch('/api/mesync/get-mesync-inbox-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword })
        });

        const data = await response.json();
        if (data.result) {
            setTableData(data.result, data.columns, null);
        }
    } catch (error) {
        console.error('Error fetching mesync events:', error);
    }
}
document.addEventListener('DOMContentLoaded', function () {
    initializeCheckMesyncEventListeners();
});

function initializeCheckMesyncEventListeners() {

    setTimeout(() => {
        speechBubble.show(`ℹ️ Chức năng này để kiểm tra Mesync Inbox Events!`, {
            duration: 100000,
            animation: 'bounce'
        });
    }, 1000);

    document.querySelector('.input-box')?.addEventListener('mouseenter', () => {
        speechBubble.show('💡Tip: Nhập từ khóa để tìm kiếm trong payload!', {
            duration: 10000,
            animation: 'bounce'
        });
    });

    document.querySelector('thead')?.addEventListener('mouseenter', () => {
        speechBubble.show('💡Tip: Click đúp chuột trái để xem chi tiết!', {
            duration: 10000,
            animation: 'bounce'
        });
    });

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
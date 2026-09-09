document.addEventListener('DOMContentLoaded', function() {
    initializeSubstitutionsEventListeners();
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

function initializeSubstitutionsEventListeners() {
    const substitutionsInput = document.getElementById('substitutions');
    if (substitutionsInput) {
        substitutionsInput.addEventListener(
            'input',
            debounceSearch(searchSubstitutions, 500)
        );

        substitutionsInput.addEventListener('input', e => {
            e.target.value = e.target.value.toUpperCase();
            if (e.target.value.trim() && typeof showTableSkeleton === 'function') {
                showTableSkeleton(6, 5);
            } else if (!e.target.value.trim()) {
                clearTable();
            }
        });
    }
}

async function searchSubstitutions() {
    const keyword = document.getElementById('substitutions').value.trim();
    if (!keyword) {
        clearTable();
        return;
    }

    if (typeof showTableSkeleton === 'function') {
        showTableSkeleton(6, 5);
    }

    try {
        const response = await fetch('/api/barcodes/get-substitutions-list', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({keyword})
        });
        
        let data = null;
        try {
            data = await response.json();
        } catch (e) {}

        if (typeof isUnauthorizedResponse === 'function' && isUnauthorizedResponse(response.status, data)) {
            if (typeof showAuthExpiredModal === 'function') {
                showAuthExpiredModal(data ? data.message : null);
            }
            clearTable();
            return;
        }

        if (data && Array.isArray(data.result)) {
            setTableData(data.result, data.columns, null, `Không tìm thấy NVL thay thế nào cho "${keyword}"`);
        } else {
            setTableData([], data ? data.columns : [], null, `Không tìm thấy NVL thay thế nào cho "${keyword}"`);
        }
    } catch (error) {
        console.error('Error searching barcode:', error);
        Toast.error('Lỗi', 'Lỗi kết nối khi tìm kiếm NVL thay thế');
        clearTable();
    }
}
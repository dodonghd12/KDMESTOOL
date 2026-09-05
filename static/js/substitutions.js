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
        });
    }
}

async function searchSubstitutions() {
    const keyword = document.getElementById('substitutions').value.trim();
    if (!keyword) {
        clearTable();
        return;
    }

    try {
        const response = await fetch('/api/barcodes/get-substitutions-list', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({keyword})
        });
        
        const data = await response.json();
        if (data.result) {
            setTableData(data.result, data.columns, null);
        }
    } catch (error) {
        console.error('Error searching barcode:', error);
    }
}
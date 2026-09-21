document.addEventListener('DOMContentLoaded', function () {
    initializeCheckGitlabDeletedFiles();
});

function initializeCheckGitlabDeletedFiles() {
    const checkBtn = document.getElementById('btnCheckDeletedFiles');
    if (checkBtn) {
        checkBtn.addEventListener('click', () => {
            fetchDeletedFilesLog();
        });
    }

    // Auto-fetch initial data when page is loaded
    fetchDeletedFilesLog();
}

async function fetchDeletedFilesLog() {
    const checkBtn = document.getElementById('btnCheckDeletedFiles');
    if (checkBtn) {
        checkBtn.disabled = true;
    }

    if (typeof showTableSkeleton === 'function') {
        showTableSkeleton(6, 8);
    }

    try {
        const response = await fetch('/api/gitlab/get-deleted-files-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
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
            setTableData(
                data.result,
                data.columns,
                null,
                'Chưa có file YAML nào bị xóa được ghi nhận trong log.',
                `Đã tải ${data.result.length} bản ghi file bị xóa`
            );
        } else {
            setTableData(
                [],
                data ? data.columns : [],
                null,
                (data && data.message) ? data.message : 'Chưa có file YAML nào bị xóa được ghi nhận trong log.'
            );
        }
    } catch (error) {
        console.error('Error fetching gitlab deleted files log:', error);
        if (typeof Toast !== 'undefined' && Toast.error) {
            Toast.error('Lỗi kết nối', 'Không thể kết nối tới máy chủ để đọc file log.');
        }
        clearTable();
    } finally {
        if (checkBtn) {
            checkBtn.disabled = false;
        }
    }
}

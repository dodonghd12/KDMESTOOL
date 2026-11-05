/**
 * ==============================================================================
 * KDMES TOOL - IN-APP HELP & DOCUMENTATION MODAL (v2.3.78+)
 * Client Controller: Navigation & Context-Aware Auto-Detection
 * ==============================================================================
 */

(function () {
    'use strict';

    let helpModal = null;
    let navItems = [];
    let contentPanes = [];

    function initHelpModal() {
        helpModal = document.getElementById('helpModal');
        if (!helpModal) return;

        navItems = Array.from(helpModal.querySelectorAll('.help-nav-item'));
        contentPanes = Array.from(helpModal.querySelectorAll('.help-pane'));

        // Tab Navigation click handlers
        navItems.forEach(item => {
            item.addEventListener('click', function () {
                const targetId = this.getAttribute('data-target');
                switchHelpTab(targetId);
            });
        });

        // Close button handler
        const closeBtn = document.getElementById('helpModalCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', closeHelpModal);

        // Backdrop click to close
        helpModal.addEventListener('click', function (e) {
            if (e.target === helpModal) {
                closeHelpModal();
            }
        });

        // Escape key to close
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && helpModal.classList.contains('active')) {
                closeHelpModal();
            }
        });
    }

    /**
     * Switch active tab in the Help Modal
     */
    function switchHelpTab(targetId) {
        if (!targetId) return;

        navItems.forEach(btn => {
            const isMatch = (btn.getAttribute('data-target') === targetId);
            btn.classList.toggle('active', isMatch);
            if (isMatch) {
                btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        });

        contentPanes.forEach(pane => {
            const isMatch = (pane.id === targetId);
            pane.classList.toggle('active', isMatch);
        });

        // Scroll content area back to top
        const contentArea = document.querySelector('.help-content-area');
        if (contentArea) contentArea.scrollTop = 0;
    }

    /**
     * Context-aware detection of current page / route
     */
    function getContextAwareTab() {
        const path = window.location.pathname.toLowerCase();

        if (path.includes('material-transfer')) {
            return 'helpPaneTransfer';
        } else if (path.includes('validate-scan-barcode')) {
            return 'helpPaneValidate';
        } else if (path.includes('reprint')) {
            return 'helpPaneReprint';
        } else if (path.includes('technical-specifications')) {
            return 'helpPaneTechSpec';
        } else if (path.includes('gitlab-deleted-files') || path.includes('postgres-deleted-data')) {
            return 'helpPaneDeletedData';
        } else if (path.includes('create-kd-account') || path.includes('check-kd-account')) {
            return 'helpPaneAccount';
        } else if (path.includes('substitutions')) {
            return 'helpPaneSubstitutions';
        } else if (path.includes('scan-barcode-history') || path.includes('print-barcode-history')) {
            return 'helpPaneHistory';
        } else if (path.includes('check-qc-data')) {
            return 'helpPaneQC';
        } else if (path.includes('check-mesync')) {
            return 'helpPaneMesync';
        } else if (path.includes('station-configuration')) {
            return 'helpPaneStation';
        } else if (path.includes('switching-spell') || path.includes('avada-kedavra') || path.includes('time-turner') || path.includes('reparo-spell')) {
            return 'helpPaneElderWand';
        } else {
            return 'helpPaneMain';
        }
    }

    /**
     * Open the In-App Help Modal
     */
    function openHelpModal(tabId) {
        if (!helpModal) initHelpModal();
        if (!helpModal) return;

        const targetTab = tabId || getContextAwareTab();
        switchHelpTab(targetTab);

        helpModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    /**
     * Close the In-App Help Modal
     */
    function closeHelpModal() {
        if (!helpModal) return;
        helpModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Expose globally so sidebar or any child page can invoke it
    window.openHelpModal = openHelpModal;
    window.closeHelpModal = closeHelpModal;

    // Cross-frame handler if inside iframe
    window.addEventListener('message', function (e) {
        if (e.data && e.data.action === 'OPEN_HELP_MODAL') {
            openHelpModal(e.data.tabId);
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHelpModal);
    } else {
        initHelpModal();
    }
})();

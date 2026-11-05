/**
 * ==============================================================================
 * KDMES TOOL - IN-APP HELP & DOCUMENTATION MODAL (v2.3.77+)
 * Client Controller: Navigation, Full Context-Aware Detection & Real-Time Filter
 * ==============================================================================
 */

(function () {
    'use strict';

    let helpModal = null;
    let searchInput = null;
    let searchClearBtn = null;
    let navItems = [];
    let contentPanes = [];

    function initHelpModal() {
        helpModal = document.getElementById('helpModal');
        if (!helpModal) return;

        searchInput = document.getElementById('helpSearchInput');
        searchClearBtn = document.getElementById('helpSearchClear');
        navItems = Array.from(helpModal.querySelectorAll('.help-nav-item'));
        contentPanes = Array.from(helpModal.querySelectorAll('.help-pane'));

        // Tab Navigation click handlers
        navItems.forEach(item => {
            item.addEventListener('click', function () {
                const targetId = this.getAttribute('data-target');
                switchHelpTab(targetId);
            });
        });

        // Close handlers
        const closeBtn = document.getElementById('helpModalCloseBtn');
        const footerCloseBtn = document.getElementById('helpFooterCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', closeHelpModal);
        if (footerCloseBtn) footerCloseBtn.addEventListener('click', closeHelpModal);

        // Backdrop click
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

        // Search filtering
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                const query = this.value.trim().toLowerCase();
                if (searchClearBtn) {
                    searchClearBtn.classList.toggle('visible', query.length > 0);
                }
                filterHelpContent(query);
            });
        }

        if (searchClearBtn) {
            searchClearBtn.addEventListener('click', function () {
                if (searchInput) {
                    searchInput.value = '';
                    this.classList.remove('visible');
                    filterHelpContent('');
                    searchInput.focus();
                }
            });
        }
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
     * Detect current active page and auto-select relevant tab across all 14 modules
     */
    function getContextAwareTab() {
        let effectivePath = window.location.pathname || '';

        // Check SPA iframe path if running in parent shell
        const activeFrame = document.querySelector('iframe.spa-frame.active, #spaFrame, #contentFrame');
        try {
            if (activeFrame && activeFrame.contentWindow && activeFrame.contentWindow.location) {
                effectivePath = activeFrame.contentWindow.location.pathname;
            }
        } catch (e) {
            // cross-origin guard if any
        }

        if (effectivePath.includes('material-transfer')) {
            return 'helpPaneTransfer';
        } else if (effectivePath.includes('validate-scan-barcode')) {
            return 'helpPaneValidate';
        } else if (effectivePath.includes('reprint')) {
            return 'helpPaneReprint';
        } else if (effectivePath.includes('technical-specifications')) {
            return 'helpPaneTechSpec';
        } else if (effectivePath.includes('gitlab-deleted-files') || effectivePath.includes('postgres-deleted-data')) {
            return 'helpPaneDeletedData';
        } else if (effectivePath.includes('create-kd-account') || effectivePath.includes('check-kd-account')) {
            return 'helpPaneAccount';
        } else if (effectivePath.includes('substitutions')) {
            return 'helpPaneSubstitutions';
        } else if (effectivePath.includes('scan-barcode-history') || effectivePath.includes('print-barcode-history')) {
            return 'helpPaneHistory';
        } else if (effectivePath.includes('check-qc-data')) {
            return 'helpPaneQC';
        } else if (effectivePath.includes('check-mesync')) {
            return 'helpPaneMesync';
        } else if (effectivePath.includes('station-configuration')) {
            return 'helpPaneStation';
        } else if (effectivePath.includes('switching-spell') || effectivePath.includes('avada-kedavra') || effectivePath.includes('time-turner') || effectivePath.includes('reparo-spell')) {
            return 'helpPaneElderWand';
        } else {
            return 'helpPaneMain';
        }
    }

    /**
     * Filter help sections based on search query
     */
    function filterHelpContent(query) {
        if (!query) {
            // Reset visibility
            const allSections = document.querySelectorAll('.help-section, .help-step-item, .help-table tbody tr');
            allSections.forEach(el => el.style.display = '');
            return;
        }

        const activePane = document.querySelector('.help-pane.active');
        if (!activePane) return;

        // Check if query matches in active pane
        let foundInActive = false;
        const sections = activePane.querySelectorAll('.help-section');
        sections.forEach(sec => {
            const text = sec.textContent.toLowerCase();
            const matches = text.includes(query);
            sec.style.display = matches ? '' : 'none';
            if (matches) foundInActive = true;
        });

        // If not in current pane, find first pane with match and switch
        if (!foundInActive) {
            for (const pane of contentPanes) {
                if (pane.textContent.toLowerCase().includes(query)) {
                    switchHelpTab(pane.id);
                    pane.querySelectorAll('.help-section').forEach(sec => {
                        const matches = sec.textContent.toLowerCase().includes(query);
                        sec.style.display = matches ? '' : 'none';
                    });
                    break;
                }
            }
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

        if (searchInput) {
            searchInput.value = '';
            if (searchClearBtn) searchClearBtn.classList.remove('visible');
            filterHelpContent('');
        }

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

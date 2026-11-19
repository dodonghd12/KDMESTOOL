/**
 * ==============================================================================
 * KDMES TOOL - IN-APP HELP & DOCUMENTATION MODAL (v2.4.44+)
 * Client Controller: 1-to-1 Route Detection, Search, Lazy Screenshots & Lightbox
 * ==============================================================================
 */

(function () {
    'use strict';

    let helpModal = null;
    let navItems = [];
    let groupLabels = [];
    let contentPanes = [];
    let navSearchInput = null;
    let navEmptyState = null;
    let lightbox = null;
    let lightboxImg = null;
    let lightboxCaption = null;

    function normalizeSearchText(str) {
        return String(str || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .trim();
    }

    function initHelpModal() {
        helpModal = document.getElementById('helpModal');
        if (!helpModal) return;

        navItems = Array.from(helpModal.querySelectorAll('.help-nav-item'));
        groupLabels = Array.from(helpModal.querySelectorAll('.help-nav-group-label'));
        contentPanes = Array.from(helpModal.querySelectorAll('.help-pane'));
        navSearchInput = document.getElementById('helpNavSearch');
        navEmptyState = document.getElementById('helpNavEmpty');
        lightbox = document.getElementById('helpImageLightbox');
        lightboxImg = document.getElementById('helpLightboxImg');
        lightboxCaption = document.getElementById('helpLightboxCaption');

        // Tab Navigation click handlers
        navItems.forEach(item => {
            item.addEventListener('click', function () {
                const targetId = this.getAttribute('data-target');
                switchHelpTab(targetId);
            });
        });

        // Sidebar filter search
        if (navSearchInput) {
            navSearchInput.addEventListener('input', function () {
                filterHelpNav(this.value);
            });
        }

        // Screenshot lightbox triggers
        helpModal.addEventListener('click', function (e) {
            const shotBtn = e.target.closest('.help-screenshot-btn');
            if (shotBtn) {
                const img = shotBtn.querySelector('img');
                const cap = shotBtn.closest('.help-figure')?.querySelector('.help-figcaption-text')?.textContent || '';
                if (img && img.src) {
                    openLightbox(img.src, img.alt || cap, cap);
                }
                return;
            }
            if (e.target === helpModal) {
                closeHelpModal();
            }
        });

        // Close buttons
        const closeBtn = document.getElementById('helpModalCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', closeHelpModal);

        const lbCloseBtn = document.getElementById('helpLightboxCloseBtn');
        if (lbCloseBtn) lbCloseBtn.addEventListener('click', closeLightbox);
        if (lightbox) {
            lightbox.addEventListener('click', function (e) {
                if (e.target === lightbox) closeLightbox();
            });
        }

        // Escape key layering: close lightbox first, then helpModal
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            if (lightbox && lightbox.classList.contains('active')) {
                closeLightbox();
                return;
            }
            if (helpModal.classList.contains('active')) {
                closeHelpModal();
            }
        });
    }

    function filterHelpNav(query) {
        const q = normalizeSearchText(query);
        let visibleTotal = 0;

        navItems.forEach(item => {
            const haystack = normalizeSearchText((item.textContent || '') + ' ' + (item.dataset.keywords || ''));
            const match = !q || haystack.includes(q);
            item.style.display = match ? '' : 'none';
            if (match) visibleTotal++;
        });

        groupLabels.forEach(label => {
            const groupId = label.dataset.group;
            const hasVisible = navItems.some(
                item => item.dataset.group === groupId && item.style.display !== 'none'
            );
            label.style.display = hasVisible ? '' : 'none';
        });

        if (navEmptyState) {
            navEmptyState.style.display = visibleTotal === 0 ? 'block' : 'none';
        }
    }

    function lazyLoadPaneImages(pane) {
        if (!pane) return;
        pane.querySelectorAll('img[data-src]').forEach(img => {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
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
                btn.setAttribute('aria-current', 'true');
                btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                btn.removeAttribute('aria-current');
            }
        });

        contentPanes.forEach(pane => {
            const isMatch = (pane.id === targetId);
            pane.classList.toggle('active', isMatch);
            if (isMatch) {
                lazyLoadPaneImages(pane);
            }
        });

        const contentArea = helpModal?.querySelector('.help-content-area');
        if (contentArea) contentArea.scrollTop = 0;
    }

    /**
     * Context-aware 1-to-1 detection of current page / route
     */
    function getContextAwareTab() {
        const path = window.location.pathname.toLowerCase();

        // Match specific subpaths before shorter prefixes (e.g. reprint-label-log before reprint)
        if (path.includes('input-data-validation')) return 'helpPaneInputDataValidation';
        if (path.includes('technical-specifications')) return 'helpPaneTechnicalSpecifications';
        if (path.includes('gitlab-deleted-files')) return 'helpPaneGitlabDeletedFiles';
        if (path.includes('postgres-deleted-data')) return 'helpPanePostgresDeletedData';
        if (path.includes('create-kd-account')) return 'helpPaneCreateKdAccount';
        if (path.includes('check-kd-account')) return 'helpPaneCheckKdAccount';
        if (path.includes('reprint-label-log')) return 'helpPaneReprintLabelLog';
        if (path.includes('reprint')) return 'helpPaneReprint';
        if (path.includes('material-transfer')) return 'helpPaneMaterialTransfer';
        if (path.includes('substitutions')) return 'helpPaneSubstitutions';
        if (path.includes('scan-barcode-history')) return 'helpPaneScanBarcodeHistory';
        if (path.includes('print-barcode-history')) return 'helpPanePrintBarcodeHistory';
        if (path.includes('check-qc-data')) return 'helpPaneCheckQcData';
        if (path.includes('check-mesync')) return 'helpPaneCheckMesync';
        if (path.includes('station-configuration')) return 'helpPaneStationConfiguration';
        if (path.includes('bypass')) return 'helpPaneBypass';
        if (path.includes('printer-setup')) return 'helpPanePrinterSetup';
        if (path.includes('site-reset-recovery')) return 'helpPaneSiteResetRecovery';
        return 'helpPaneMain';
    }

    function openLightbox(src, alt, caption) {
        if (!lightbox || !lightboxImg) return;
        lightboxImg.src = src;
        lightboxImg.alt = alt || '';
        if (lightboxCaption) lightboxCaption.textContent = caption || '';
        lightbox.classList.add('active');
        lightbox.setAttribute('aria-hidden', 'false');
    }

    function closeLightbox() {
        if (!lightbox) return;
        lightbox.classList.remove('active');
        lightbox.setAttribute('aria-hidden', 'true');
        if (lightboxImg) lightboxImg.removeAttribute('src');
    }

    /**
     * Open the In-App Help Modal
     */
    function openHelpModal(tabId) {
        if (!helpModal) initHelpModal();
        if (!helpModal) return;

        if (navSearchInput && navSearchInput.value) {
            navSearchInput.value = '';
            filterHelpNav('');
        }

        const targetTab = tabId || getContextAwareTab();
        switchHelpTab(targetTab);

        helpModal.classList.add('active');
        helpModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    /**
     * Close the In-App Help Modal
     */
    function closeHelpModal() {
        if (!helpModal) return;
        closeLightbox();
        helpModal.classList.remove('active');
        helpModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    window.openHelpModal = openHelpModal;
    window.closeHelpModal = closeHelpModal;

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

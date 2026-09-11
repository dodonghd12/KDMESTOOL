/**
 * SPA Shell Controller - Handles instant preloaded page navigation across all sidebar items
 */
(function () {
    const SPA_ROUTES = [
        { path: '/main', frameId: 'view-main', title: 'Main' },
        { path: '/scan-barcode-history', frameId: 'view-scan-barcode-history', title: 'Lịch sử quét tem theo Máy' },
        { path: '/print-barcode-history', frameId: 'view-print-barcode-history', title: 'Lịch sử in tem theo Máy' },
        { path: '/validate-scan-barcode', frameId: 'view-validate-scan-barcode', title: 'Kiểm tra tem đầu vào' },
        { path: '/reprint', frameId: 'view-reprint', title: 'Truy vấn in bù' },
        { path: '/substitutions', frameId: 'view-substitutions', title: 'NVL thay thế' },
        { path: '/check-qc-data', frameId: 'view-check-qc-data', title: 'Check QC Data' },
        { path: '/check-mesync', frameId: 'view-check-mesync', title: 'Check Mesync' },
        { path: '/station-configuration', frameId: 'view-station-configuration', title: 'Thiết lập máy' },
        { path: '/magic-winx', frameId: 'view-magic-winx', title: 'Magic Winx' }
    ];

    let currentRoutePath = null;
    let isAllPagesLoaded = false;
    window.__kd_all_pages_loaded = false;

    // Prefetch departments once at top shell level so all child iframes share the same single-flight request
    if (typeof window.getDepartments === 'function') {
        window.getDepartments();
    }

    function getNormalizedPath(pathname) {
        if (!pathname || pathname === '/') return '/main';
        return pathname.replace(/\/+$/, '');
    }

    function switchPage(targetPath, pushState = true) {
        const normPath = getNormalizedPath(targetPath);
        const route = SPA_ROUTES.find(r => r.path === normPath) || SPA_ROUTES[0];

        if (currentRoutePath === route.path) return;
        currentRoutePath = route.path;

        // 1. Toggle iframe active class
        const allFrames = document.querySelectorAll('.spa-view-frame');
        allFrames.forEach(frame => {
            if (frame.id === route.frameId) {
                frame.classList.add('active');
                try {
                    frame.contentWindow?.focus();
                } catch (e) { }
            } else {
                frame.classList.remove('active');
            }
        });

        // 2. Update sidebar active item & expand dropdown if needed
        updateSidebarMenu(route.path);

        // 3. Update document title
        if (route.title) {
            document.title = `${route.title}`;
        }

        // 4. Update browser URL without reload
        if (pushState && window.location.pathname !== route.path) {
            window.history.pushState({ path: route.path }, '', route.path);
        }
    }

    function updateSidebarMenu(activePath) {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        const links = sidebar.querySelectorAll('a[href]');
        links.forEach(link => {
            const href = link.getAttribute('href');
            if (!href || href === '#' || href.startsWith('javascript:')) return;
            const linkPath = new URL(link.href, window.location.origin).pathname.replace(/\/+$/, '');
            const li = link.closest('li');
            if (!li) return;

            if (linkPath === activePath) {
                li.classList.add('active');
                const subMenu = li.closest('.sub-menu');
                if (subMenu) {
                    subMenu.classList.add('show');
                    const parentBtn = subMenu.previousElementSibling;
                    parentBtn?.classList.add('rotate');
                }
            } else {
                li.classList.remove('active');
            }
        });

        // Trigger smooth 280ms indicator slide
        if (typeof window.updateSidebarActiveIndicator === 'function') {
            window.updateSidebarActiveIndicator(true);
            setTimeout(() => window.updateSidebarActiveIndicator(true), 150);
            setTimeout(() => window.updateSidebarActiveIndicator(true), 320);
        } else {
            document.dispatchEvent(new CustomEvent('sidebar:update_indicator', { detail: { animate: true } }));
        }
    }

    function completeSpaPreloading() {
        if (isAllPagesLoaded) return;
        isAllPagesLoaded = true;
        window.__kd_all_pages_loaded = true;

        const counterEl = document.getElementById('spaPreloadCounter');
        const progressBar = document.getElementById('spaPreloadProgressBar');
        const badge = document.getElementById('spaPreloadBadge');
        const titleEl = document.getElementById('spaPreloadTitle');
        const msgEl = document.getElementById('spaPreloadMessage');
        const iconContainer = document.getElementById('spaPreloadIconContainer');

        if (counterEl) counterEl.textContent = `${SPA_ROUTES.length}/${SPA_ROUTES.length}`;
        if (progressBar) progressBar.style.width = '100%';

        if (badge) {
            badge.classList.remove('toast-info');
            badge.classList.add('toast-success');
        }
        if (titleEl) titleEl.textContent = 'Khởi tạo hoàn tất';
        if (msgEl) msgEl.textContent = `Tất cả ${SPA_ROUTES.length} trang đã sẵn sàng`;
        if (iconContainer) {
            iconContainer.innerHTML = '<span class="material-symbols-outlined" style="color: #34d399; font-size: 22px;">check_circle</span>';
        }

        // Notify and remove skeleton loading across all iframes
        const allFrames = document.querySelectorAll('.spa-view-frame');
        allFrames.forEach(frame => {
            try {
                const doc = frame.contentDocument || frame.contentWindow?.document;
                if (doc && doc.body) {
                    doc.body.classList.remove('app-loading-state');
                }
                frame.contentWindow?.postMessage({ type: 'SPA_ALL_PAGES_LOADED' }, '*');
            } catch (e) { }
        });

        // Hide preload toast with smooth spring out
        if (badge) {
            setTimeout(() => {
                badge.classList.add('removing');
                setTimeout(() => {
                    badge.style.display = 'none';
                }, 350);
            }, 1200);
        }

        // Notify Supercar Intro overlay
        if (window.SupercarIntro && typeof window.SupercarIntro.onAllLoaded === 'function') {
            window.SupercarIntro.onAllLoaded();
        }
    }

    function initPreloadTracker() {
        const allFrames = document.querySelectorAll('.spa-view-frame');
        const total = allFrames.length || SPA_ROUTES.length;
        let loadedCount = 0;
        const loadedSet = new Set();

        function onFrameLoaded(frameId) {
            if (loadedSet.has(frameId)) return;
            loadedSet.add(frameId);
            loadedCount = loadedSet.size;

            // Apply active theme and density to newly loaded frame
            try {
                const frameEl = document.getElementById(frameId);
                const isLight = (localStorage.getItem('kd_theme') || 'dark') === 'light';
                const savedDensity = localStorage.getItem('kd_table_density') || 'default';
                if (frameEl && frameEl.contentDocument) {
                    frameEl.contentDocument.documentElement?.setAttribute('data-theme', isLight ? 'light' : 'dark');
                    if (frameEl.contentDocument.body) {
                        frameEl.contentDocument.body.classList.toggle('theme-light', isLight);
                        frameEl.contentDocument.body.classList.remove('density-compact', 'density-default', 'density-comfortable');
                        frameEl.contentDocument.body.classList.add(`density-${savedDensity}`);
                    }
                }
            } catch (e) {}

            const counterEl = document.getElementById('spaPreloadCounter');
            const progressBar = document.getElementById('spaPreloadProgressBar');
            if (counterEl) counterEl.textContent = `${loadedCount}/${total}`;
            if (progressBar) {
                const percent = Math.min(100, Math.round((loadedCount / total) * 100));
                progressBar.style.width = `${percent}%`;
            }

            // Đồng bộ tiến trình với Supercar Intro Overlay
            if (window.SupercarIntro && typeof window.SupercarIntro.onProgress === 'function') {
                window.SupercarIntro.onProgress(loadedCount, total);
            }

            if (loadedCount >= total) {
                completeSpaPreloading();
            }
        }

        allFrames.forEach(frame => {
            // If iframe is already loaded
            try {
                if (frame.contentDocument && frame.contentDocument.readyState === 'complete') {
                    onFrameLoaded(frame.id);
                }
            } catch (e) {}

            frame.addEventListener('load', () => {
                onFrameLoaded(frame.id);
            });
        });

        // Listen for frame readiness messages
        window.addEventListener('message', (e) => {
            if (e.data && e.data.type === 'FRAME_PAGE_READY' && e.data.frameId) {
                onFrameLoaded(e.data.frameId);
            }
        });

        // Safety fallback timer: in case an iframe takes too long, complete after 8 seconds
        setTimeout(() => {
            if (!isAllPagesLoaded) {
                completeSpaPreloading();
            }
        }, 8000);
    }

    function initSpaNavigation() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        initPreloadTracker();

        // Intercept all sidebar link clicks
        sidebar.addEventListener('click', (e) => {
            const link = e.target.closest('a[href]');
            if (!link) return;

            const href = link.getAttribute('href');
            if (!href || href === '#' || href.startsWith('javascript:') || href.includes('logout')) {
                return;
            }

            try {
                const linkUrl = new URL(link.href, window.location.origin);
                const targetPath = linkUrl.pathname.replace(/\/+$/, '');
                const isSpaRoute = SPA_ROUTES.some(r => r.path === targetPath);

                if (isSpaRoute) {
                    e.preventDefault();
                    e.stopPropagation();
                    switchPage(targetPath, true);
                }
            } catch (err) {
                console.error('Error handling SPA navigation click:', err);
            }
        }, true);

        // Handle browser Back / Forward buttons
        window.addEventListener('popstate', (e) => {
            const path = e.state?.path || window.location.pathname;
            switchPage(path, false);
        });

        // Initial route setup
        const initialPath = window.initialRoutePath || window.location.pathname || '/main';
        switchPage(initialPath, false);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSpaNavigation);
    } else {
        initSpaNavigation();
    }

    // Export globally for programmatic page switching
    window.spaNavigator = {
        switchTo: switchPage,
        getRoutes: () => [...SPA_ROUTES]
    };
})();

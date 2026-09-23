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
        { path: '/technical-specifications', frameId: 'view-technical-specifications', title: 'Thông số kỹ thuật' },
        { path: '/gitlab-deleted-files', frameId: 'view-gitlab-deleted-files', title: 'Gitlab Deleted Files' },
        { path: '/check-gitlab-deleted-files', frameId: 'view-gitlab-deleted-files', title: 'Gitlab Deleted Files' },
        { path: '/postgres-deleted-data', frameId: 'view-postgres-deleted-data', title: 'Postgres Deleted Data' },
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
        let route = SPA_ROUTES.find(r => r.path === normPath);

        if (!route) {
            const derivedFrameId = 'view-' + normPath.replace(/^\/+/, '');
            const existingFrame = document.getElementById(derivedFrameId);
            if (existingFrame) {
                route = { path: normPath, frameId: derivedFrameId, title: existingFrame.title || document.title || 'KDMES TOOL' };
            } else {
                route = SPA_ROUTES[0];
            }
        }

        if (currentRoutePath === route.path) return;
        currentRoutePath = route.path;

        // 1. Toggle iframe active class & ensure src is loaded
        const allFrames = document.querySelectorAll('.spa-view-frame');
        allFrames.forEach(frame => {
            if (frame.id === route.frameId) {
                // If this frame was lazy-deferred with data-src, load it immediately on demand
                if (frame.dataset.src && (!frame.src || frame.src.endsWith('about:blank') || frame.src === window.location.href)) {
                    frame.src = frame.dataset.src;
                    frame.removeAttribute('data-src');
                }
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

        const allFrames = document.querySelectorAll('.spa-view-frame');
        const total = allFrames.length || SPA_ROUTES.length;

        const counterEl = document.getElementById('spaPreloadCounter');
        const progressBar = document.getElementById('spaPreloadProgressBar');
        const badge = document.getElementById('spaPreloadBadge');
        const titleEl = document.getElementById('spaPreloadTitle');
        const msgEl = document.getElementById('spaPreloadMessage');
        const iconContainer = document.getElementById('spaPreloadIconContainer');

        if (counterEl) counterEl.textContent = `${total}/${total}`;
        if (progressBar) progressBar.style.width = '100%';

        if (badge) {
            badge.classList.remove('toast-info');
            badge.classList.add('toast-success');
        }
        if (titleEl) titleEl.textContent = 'Khởi tạo hoàn tất';
        if (msgEl) msgEl.textContent = `Tất cả ${total} trang đã sẵn sàng`;
        if (iconContainer) {
            iconContainer.innerHTML = '<span class="material-symbols-outlined" style="color: #34d399; font-size: 22px;">check_circle</span>';
        }

        // Notify and remove skeleton loading across all iframes
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
            window.SupercarIntro.onAllLoaded(total);
        }
    }

    function initPreloadTracker() {
        const allFrames = document.querySelectorAll('.spa-view-frame');
        const total = allFrames.length || SPA_ROUTES.length;
        let loadedCount = 0;
        const loadedSet = new Set();

        if (window.SupercarIntro && typeof window.SupercarIntro.setTotalPages === 'function') {
            window.SupercarIntro.setTotalPages(total);
        }

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
                if (frame.contentDocument && frame.contentDocument.readyState === 'complete' && frame.src && !frame.src.endsWith('about:blank')) {
                    onFrameLoaded(frame.id);
                }
            } catch (e) {}

            frame.addEventListener('load', () => {
                if (frame.src && !frame.src.endsWith('about:blank')) {
                    onFrameLoaded(frame.id);
                }
            });
        });

        // Staggered background preloading for deferred data-src iframes
        const lazyFrames = Array.from(document.querySelectorAll('.spa-view-frame[data-src]'));
        let staggerDelay = 80;
        lazyFrames.forEach((frame) => {
            setTimeout(() => {
                if (frame.dataset.src && (!frame.src || frame.src.endsWith('about:blank') || frame.src === window.location.href)) {
                    frame.src = frame.dataset.src;
                    frame.removeAttribute('data-src');
                }
            }, staggerDelay);
            staggerDelay += 90; // Gentle 90ms interval with cached assets finishes all frames in < 1s
        });

        // Listen for frame readiness messages
        window.addEventListener('message', (e) => {
            if (e.data && e.data.type === 'FRAME_PAGE_READY' && e.data.frameId) {
                onFrameLoaded(e.data.frameId);
            }
        });

        // Safety fallback timer: in case an iframe takes too long, complete after 3.2 seconds
        setTimeout(() => {
            if (!isAllPagesLoaded) {
                completeSpaPreloading();
            }
        }, 3200);
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
                const isSpaRoute = SPA_ROUTES.some(r => r.path === targetPath) || !!document.getElementById('view-' + targetPath.replace(/^\/+/, ''));

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

    /**
     * Top-level Auth Expired Modal Handler
     */
    function showAuthExpiredModal(message) {
        if (window.__kd_auth_modal_shown) return;
        window.__kd_auth_modal_shown = true;

        try {
            sessionStorage.clear();
            localStorage.removeItem('kd_departments_cache');
        } catch (e) {}

        const existingModal = document.getElementById('kdAuthExpiredModal');
        if (existingModal) existingModal.remove();

        let countdown = 3;
        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'kdAuthExpiredModal';
        modalOverlay.className = 'kd-auth-expired-overlay';
        modalOverlay.setAttribute('role', 'alertdialog');
        modalOverlay.setAttribute('aria-modal', 'true');
        modalOverlay.setAttribute('aria-labelledby', 'authModalTitle');
        modalOverlay.setAttribute('aria-describedby', 'authModalMsg');

        const displayMsg = message || 'Phiên làm việc của bạn đã hết hạn. Vui lòng đăng nhập lại để tiếp tục sử dụng.';
        const redirectCode = "try{sessionStorage.clear();localStorage.removeItem('kd_departments_cache');}catch(e){};(window.top||window).location.href='/login';";

        modalOverlay.innerHTML = `
            <div class="kd-auth-expired-card">
                <div class="kd-auth-expired-icon-wrap">
                    <span class="material-symbols-outlined kd-auth-expired-icon">lock_clock</span>
                </div>
                <div class="kd-auth-expired-title" id="authModalTitle">Phiên Đăng Nhập Hết Hạn</div>
                <div class="kd-auth-expired-message" id="authModalMsg">
                    ${displayMsg}<br>
                    <span style="display: inline-block; margin-top: 6px; font-size: 13px; color: var(--color-text-muted, #94a3b8);">
                        Tự động chuyển về trang Đăng nhập sau <b id="kdAuthCountdown" style="color: #f43f5e; font-size: 15px;">${countdown}</b>s...
                    </span>
                </div>
                <div class="kd-auth-expired-actions">
                    <button type="button" class="kd-auth-expired-btn" id="kdAuthLoginRedirectBtn" onclick="${redirectCode}">
                        <span class="material-symbols-outlined" style="pointer-events: none;">login</span>
                        <span style="pointer-events: none;">Đăng nhập lại ngay</span>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);
        document.body.style.overflow = 'hidden';

        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(f => {
            try { f.style.pointerEvents = 'none'; } catch (e) {}
        });

        const redirectBtn = modalOverlay.querySelector('#kdAuthLoginRedirectBtn');
        const countdownEl = modalOverlay.querySelector('#kdAuthCountdown');

        const doRedirect = () => {
            try {
                sessionStorage.clear();
                localStorage.removeItem('kd_departments_cache');
            } catch (e) {}
            try {
                if (window.top && window.top.location) {
                    window.top.location.href = '/login';
                    return;
                }
            } catch (e) {}
            try {
                window.location.href = '/login';
            } catch (e) {}
        };

        if (redirectBtn) {
            setTimeout(() => {
                try { redirectBtn.focus(); } catch (e) {}
            }, 50);

            redirectBtn.onclick = function(e) {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                doRedirect();
                return false;
            };

            redirectBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                doRedirect();
            });
        }

        const timer = setInterval(() => {
            countdown--;
            if (countdownEl) countdownEl.textContent = countdown;
            if (countdown <= 0) {
                clearInterval(timer);
                doRedirect();
            }
        }, 1000);

        const keyHandler = (e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
                e.preventDefault();
                doRedirect();
            }
        };

        window.addEventListener('keydown', keyHandler, true);
    }

    window.showAuthExpiredModal = showAuthExpiredModal;
})();

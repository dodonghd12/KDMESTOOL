/**
 * ============================================================================
 * LUSION.CO AUTHENTIC PRELOADER & LOGO MORPHING + LIVE PORTAL REVEAL ENGINE
 * Real-time SPA Preload Synchronization | Letter 'O' Portal Reveal
 * Theme Background: var(--bg-main) | Accent: var(--color-text-accent)
 * ============================================================================
 */
(function () {
    'use strict';

    // ── Lusion Exact Mathematical Easing Curves ──
    const ease = {
        expoInOut(t) {
            if (t === 0) return 0;
            if (t === 1) return 1;
            if (t < 0.5) return Math.pow(2, 20 * t - 10) / 2;
            return (2 - Math.pow(2, -20 * t + 10)) / 2;
        },
        expoOut(t) {
            return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        },
        expoIn(t) {
            return t === 0 ? 0 : Math.pow(2, 10 * t - 10);
        }
    };

    function addRoundRect(ctx, x, y, w, h, r, counterClockwise = false) {
        const radius = Math.max(0, Math.min(r, w / 2, h / 2));
        const right = x + w;
        const bottom = y + h;

        if (counterClockwise) {
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x, y + radius);
            ctx.arcTo(x, bottom, x + radius, bottom, radius);
            ctx.arcTo(right, bottom, right, bottom - radius, radius);
            ctx.arcTo(right, y, right - radius, y, radius);
            ctx.arcTo(x, y, x + radius, y, radius);
            ctx.closePath();
        } else {
            ctx.moveTo(x + radius, y);
            ctx.arcTo(right, y, right, y + radius, radius);
            ctx.arcTo(right, bottom, right - radius, bottom, radius);
            ctx.arcTo(x, bottom, x, bottom - radius, radius);
            ctx.arcTo(x, y, x + radius, y, radius);
            ctx.closePath();
        }
    }

    class LusionPreloader {
        constructor() {
            this.canvas = null;
            this.ctx = null;
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            this.dpr = Math.min(window.devicePixelRatio || 1, 2);

            this.domContainer = null;

            this.percentTarget = 0.05;
            this.percent = 0.0;
            this.lineTransformRatio = 0.0;
            this.contentShowRatio = 0.0;

            this.lineTransformTime = 0;
            this.contentShowTime = 0;

            this.MORPH_DURATION = 0.60;
            this.REVEAL_DURATION = 0.75;

            this.isActive = true;
            this.isAllPreloaded = false;
            this.preloadedCount = 0;
            this.totalPages = 15;
            this.isFinished = false;

            this.lastTime = 0;
            this.animFrameId = null;

            this.render = this.render.bind(this);
            this.handleResize = this.handleResize.bind(this);
            this.skip = this.skip.bind(this);
        }

        init() {
            this.domContainer = document.getElementById('lusionPreloader');
            this.canvas = document.getElementById('lusionCanvas');
            if (!this.canvas) return;

            this.ctx = this.canvas.getContext('2d');
            this.handleResize();
            window.addEventListener('resize', this.handleResize);

            // Fast skip keybindings
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' || e.key === ' ') {
                    e.preventDefault();
                    this.skip();
                }
            }, { passive: false });

            // Launch RAF on Frame 0
            this.animFrameId = requestAnimationFrame(this.render);
        }

        resolveCssVar(varName, fallback) {
            const root = document.documentElement;
            let val = getComputedStyle(root).getPropertyValue(varName).trim();
            let attempts = 0;
            while (val.startsWith('var(') && attempts < 5) {
                attempts++;
                const inner = val.slice(4, -1).trim();
                val = getComputedStyle(root).getPropertyValue(inner).trim();
            }
            return val || fallback;
        }

        getBgColor() {
            const isLight = document.documentElement.getAttribute('data-theme') === 'light' || (document.body && document.body.classList.contains('theme-light'));
            const fallback = isLight ? '#f1f5f9' : '#0a0e27';
            return this.resolveCssVar('--bg-main', fallback);
        }

        getAccentColor() {
            const isLight = document.documentElement.getAttribute('data-theme') === 'light' || (document.body && document.body.classList.contains('theme-light'));
            const fallback = isLight ? '#0d9488' : '#3dd5c0';
            return this.resolveCssVar('--color-text-accent', fallback);
        }

        handleResize() {
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            this.dpr = Math.min(window.devicePixelRatio || 1, 2);

            if (this.canvas) {
                this.canvas.width = (this.width + 2) * this.dpr;
                this.canvas.height = (this.height + 2) * this.dpr;
                this.canvas.style.width = (this.width + 2) + 'px';
                this.canvas.style.height = (this.height + 2) + 'px';
            }
        }

        render(timestamp) {
            if (!this.isActive) return;
            const dt = this.lastTime ? Math.min(0.05, (timestamp - this.lastTime) / 1000) : 0.016;
            this.lastTime = timestamp;

            // ── Phase 1: Smooth progress loading synced to actual SPA frames ──
            const speed = this.isAllPreloaded ? 4.5 : 2.0;
            this.percent = Math.min(this.percentTarget, this.percent + (this.percentTarget > this.percent ? dt * speed : 0));

            // ── Phase 2: Morphing to Letter 'O' ONLY after 100% total pages loaded ──
            if (this.isAllPreloaded && this.percent >= 0.999) {
                this.lineTransformTime += dt;
                this.lineTransformRatio = ease.expoInOut(Math.min(1.0, this.lineTransformTime / this.MORPH_DURATION));

                // ── Phase 3: Live Portal Zoom & Scale-to-Fullscreen Reveal ──
                if (this.lineTransformRatio >= 1.0) {
                    this.contentShowTime += dt;
                    this.contentShowRatio = ease.expoInOut(Math.min(1.0, this.contentShowTime / this.REVEAL_DURATION));

                    if (this.contentShowRatio >= 1.0 && !this.isFinished) {
                        this.finish();
                        return;
                    }
                }
            }

            // ── Canvas Rendering Engine (Live Destination-Out Portal) ──
            const t = this.width + 2;
            const r = this.height + 2;
            const pixelWidth = Math.min(42, this.width / 30);
            const a = this.percent;
            const l = this.lineTransformRatio;
            const c = Math.sqrt(t * t + r * r) / pixelWidth;
            const u = this.ctx;
            const bgColor = this.getBgColor();
            const accentColor = this.getAccentColor();

            // Clear frame
            u.clearRect(0, 0, (t + 2) * this.dpr, (r + 2) * this.dpr);

            u.save();
            u.scale(this.dpr, this.dpr);

            // 1. Draw solid background base (var(--bg-main))
            u.fillStyle = bgColor;
            u.fillRect(0, 0, t, r);

            // 2. Camera Viewport Transformation
            const f = this.contentShowRatio; // 0 to 1 with expoInOut
            const p = (1 + f * c) * pixelWidth;

            u.translate(t * 0.5, r * 0.5);
            u.rotate(f * -0.15); // Dynamic rotational twist
            u.translate(pixelWidth * f * c * 0.12, -pixelWidth * 0.5 * f * c * 0.12);
            u.scale(p, p);

            if (l === 0) {
                // ── Initial State: Sleek Loading Bar in Accent Color ──
                u.save();
                u.fillStyle = accentColor;
                u.globalAlpha = 0.18;
                u.fillRect(-2.5, -0.4, 5, 0.8);
                u.globalAlpha = 1.0;
                u.fillRect(-2.5, -0.4, 5 * a, 0.8);
                u.restore();
            } else {
                // ── Morphing into Letter 'O' + Live Webpage Portal Cutout ──
                const w = 5.0 - 1.2 * l;        // 5.0 -> 3.8
                const h = 0.8 + 3.4 * l;        // 0.8 -> 4.2
                const r_out = 0.3 + 0.8 * l;    // 0.3 -> 1.1

                // Inner aperture / hole of the 'O'
                const holeExpansion = f * 14.0;
                const iw = (2.2 + holeExpansion) * l;
                const ih = (2.6 + holeExpansion) * l;
                const r_in = (0.4 + f * 3.0) * l;

                // Step A: PUNCH REAL TRANSPARENT HOLE THROUGH CANVAS (REVEALS WEBPAGE INSIDE 'O')
                if (iw > 0.02 && ih > 0.02) {
                    u.save();
                    u.globalCompositeOperation = 'destination-out';
                    u.fillStyle = '#000000';
                    u.beginPath();
                    addRoundRect(u, -iw / 2, -ih / 2, iw, ih, r_in, false);
                    u.fill();
                    u.restore();
                }

                // Step B: DRAW CRISP SOLID ACCENT RIM OF THE LETTER 'O'
                if (f < 0.99) {
                    u.save();
                    u.globalCompositeOperation = 'source-over';
                    u.globalAlpha = Math.max(0, 1 - f * 1.35);
                    u.fillStyle = accentColor;
                    u.beginPath();
                    addRoundRect(u, -w / 2, -h / 2, w, h, r_out, false);
                    if (iw > 0.02 && ih > 0.02) {
                        addRoundRect(u, -iw / 2, -ih / 2, iw, ih, r_in, true);
                    }
                    u.fill('evenodd');
                    u.restore();
                }
            }

            u.restore();

            if (!this.isFinished) {
                this.animFrameId = requestAnimationFrame(this.render);
            }
        }

        finish() {
            if (this.isFinished) return;
            this.isFinished = true;
            this.isActive = false;

            if (this.animFrameId) {
                cancelAnimationFrame(this.animFrameId);
                this.animFrameId = null;
            }

            window.removeEventListener('resize', this.handleResize);

            if (this.domContainer) {
                this.domContainer.classList.add('fade-out');
                setTimeout(() => {
                    this.domContainer.style.display = 'none';
                    this.domContainer.remove();
                }, 350);
            }

            window.__kd_intro_finished = true;
            document.dispatchEvent(new CustomEvent('kd_intro_finished'));
        }

        skip() {
            if (this.isFinished) return;
            this.isAllPreloaded = true;
            this.percentTarget = 1.0;
            this.percent = 1.0;
        }
    }

    const preloaderEngine = new LusionPreloader();

    // ── Global API for SPA Preload Sync ──
    window.LusionIntro = {
        setTotalPages(count) {
            if (count > 0) preloaderEngine.totalPages = count;
        },
        onProgress(loaded, total) {
            preloaderEngine.preloadedCount = loaded;
            preloaderEngine.totalPages = total || preloaderEngine.totalPages || 15;
            // Cap at 0.96 while still loading so it only reaches 100% when onAllLoaded fires
            const calcPct = (preloaderEngine.preloadedCount / Math.max(1, preloaderEngine.totalPages)) * 0.96;
            preloaderEngine.percentTarget = Math.max(preloaderEngine.percentTarget, Math.min(0.96, calcPct));
        },
        onAllLoaded(total) {
            preloaderEngine.isAllPreloaded = true;
            if (total) preloaderEngine.totalPages = total;
            preloaderEngine.preloadedCount = preloaderEngine.totalPages;
            preloaderEngine.percentTarget = 1.0;
        },
        skip: () => preloaderEngine.skip()
    };

    window.SupercarIntro = window.LusionIntro;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => preloaderEngine.init());
    } else {
        preloaderEngine.init();
    }
})();

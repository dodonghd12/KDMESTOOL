/**
 * ============================================================================
 * PRISMA HERO PRELOADER & LAPTOP SCREEN PORTAL REVEAL ENGINE
 * Video Background (Static/Unscaled) | 0-100% Counter | Expanding Laptop Portal Mask
 * ============================================================================
 */
(function () {
    'use strict';

    // Cinematic Easing Curves
    const ease = {
        expoInOut(t) {
            if (t === 0) return 0;
            if (t === 1) return 1;
            if (t < 0.5) return Math.pow(2, 20 * t - 10) / 2;
            return (2 - Math.pow(2, -20 * t + 10)) / 2;
        },
        cubicOut(t) {
            return 1 - Math.pow(1 - t, 3);
        }
    };

    class PrismaHeroEngine {
        constructor() {
            this.container = null;
            this.video = null;
            this.counterEl = null;
            this.progressBar = null;
            this.statusTextEl = null;
            this.portalRim = null;

            this.currentPercent = 0.0;
            this.targetPercent = 0.05;
            this.displayInteger = 0;

            this.totalPages = 15;
            this.preloadedCount = 0;
            this.isAllPreloaded = false;
            this.isFinished = false;
            this.isRevealing = false;

            this.revealTime = 0;
            this.REVEAL_DURATION = 0.85; // 850ms smooth portal cutout sweep

            this.lastTime = 0;
            this.animFrameId = null;

            this.render = this.render.bind(this);
        }

        init() {
            this.container = document.getElementById('prismaHeroPreloader');
            if (!this.container) return;

            this.video = document.getElementById('prismaHeroVideo');
            this.counterEl = document.getElementById('prismaCounterNumber');
            this.progressBar = document.getElementById('prismaHeroProgressBar');
            this.statusTextEl = document.getElementById('prismaStatusText');
            this.portalRim = document.getElementById('prismaPortalRim');

            // Attempt video playback
            if (this.video) {
                this.video.muted = true;
                const playPromise = this.video.play();
                if (playPromise !== undefined) {
                    playPromise.catch(() => {});
                }
            }

            // Launch RAF loop
            this.animFrameId = requestAnimationFrame(this.render);
        }

        render(timestamp) {
            if (this.isFinished) return;
            const dt = this.lastTime ? Math.min(0.05, (timestamp - this.lastTime) / 1000) : 0.016;
            this.lastTime = timestamp;

            if (!this.isRevealing) {
                // ── Phase 1: Smooth progress interpolation 0 -> 100 ──
                const speed = this.isAllPreloaded ? 5.5 : 2.2;
                if (this.currentPercent < this.targetPercent) {
                    this.currentPercent = Math.min(this.targetPercent, this.currentPercent + dt * speed);
                }

                const intVal = Math.min(100, Math.floor(this.currentPercent * 100));
                if (intVal !== this.displayInteger) {
                    this.displayInteger = intVal;
                    if (this.counterEl) {
                        this.counterEl.textContent = this.displayInteger.toString().padStart(2, '0');
                    }
                    if (this.progressBar) {
                        this.progressBar.style.width = `${this.displayInteger}%`;
                    }
                }

                // Check if ready to trigger portal reveal
                if (this.isAllPreloaded && this.currentPercent >= 0.999) {
                    this.triggerPortalReveal();
                    return;
                }
            } else {
                // ── Phase 2: Expanding Portal Hole Cutout (Laptop Screen 52% 51.5% Outward) ──
                this.revealTime += dt;
                const progress = Math.min(1.0, this.revealTime / this.REVEAL_DURATION);
                const easedRatio = ease.expoInOut(progress);

                // Radius expands from 0% to 150% (reveals entire viewport)
                const currentRadius = easedRatio * 150;
                if (this.container) {
                    this.container.style.setProperty('--reveal-radius', `${currentRadius.toFixed(2)}%`);
                }

                // Expanding glowing rim
                if (this.portalRim) {
                    const maxDim = Math.max(window.innerWidth, window.innerHeight) * 2.8;
                    const rimSize = easedRatio * maxDim;
                    this.portalRim.style.width = `${rimSize}px`;
                    this.portalRim.style.height = `${rimSize}px`;
                    this.portalRim.style.opacity = progress < 0.85 ? Math.min(1, progress * 4) : Math.max(0, (1 - progress) * 6.6);
                }

                if (progress >= 1.0) {
                    this.finish();
                    return;
                }
            }

            this.animFrameId = requestAnimationFrame(this.render);
        }

        triggerPortalReveal() {
            if (this.isRevealing) return;
            this.isRevealing = true;

            if (this.counterEl) this.counterEl.textContent = '100';
            if (this.progressBar) this.progressBar.style.width = '100%';
            if (this.statusTextEl) this.statusTextEl.textContent = 'SYSTEM READY · REVEALING WORKSPACE';

            // Fade out UI text elements
            if (this.container) {
                this.container.classList.add('is-revealing');
            }

            if (this.portalRim) {
                this.portalRim.style.opacity = '1';
            }

            this.animFrameId = requestAnimationFrame(this.render);
        }

        finish() {
            if (this.isFinished) return;
            this.isFinished = true;

            if (this.animFrameId) {
                cancelAnimationFrame(this.animFrameId);
                this.animFrameId = null;
            }

            if (this.container) {
                this.container.classList.add('fade-out');
                setTimeout(() => {
                    try {
                        this.container.style.display = 'none';
                        this.container.remove();
                    } catch (e) {}
                }, 350);
            }

            window.__kd_intro_finished = true;
            document.dispatchEvent(new CustomEvent('kd_intro_finished'));
        }
    }

    const engine = new PrismaHeroEngine();

    // ── Global Preload Sync API ──
    const syncAPI = {
        setTotalPages(count) {
            if (count > 0) engine.totalPages = count;
        },
        onProgress(loaded, total) {
            engine.preloadedCount = loaded;
            engine.totalPages = total || engine.totalPages || 15;
            const calcPct = (engine.preloadedCount / Math.max(1, engine.totalPages)) * 0.96;
            engine.targetPercent = Math.max(engine.targetPercent, Math.min(0.96, calcPct));
        },
        onAllLoaded(total) {
            engine.isAllPreloaded = true;
            if (total) engine.totalPages = total;
            engine.preloadedCount = engine.totalPages;
            engine.targetPercent = 1.0;
        },
        skip() {}
    };

    window.PrismaHeroIntro = syncAPI;
    window.LusionIntro = syncAPI;
    window.SupercarIntro = syncAPI;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => engine.init());
    } else {
        engine.init();
    }
})();

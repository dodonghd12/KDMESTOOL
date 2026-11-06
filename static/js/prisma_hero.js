/**
 * ============================================================================
 * PRISMA HERO PRELOADER & LAPTOP SCREEN PORTAL REVEAL ENGINE
 * Video Background (Static/Unscaled) | 0-100% Counter | Expanding Laptop Portal Mask
 * ============================================================================
 */
(function () {
    'use strict';

    // Cinematic Easing Curves - Hardware-accelerated butter-smooth curves
    const ease = {
        smoothReveal(t) {
            return 1 - Math.pow(1 - t, 2.6);
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
            this.REVEAL_DURATION = 0.82; // 820ms majestic, cinematic & silky-smooth portal cutout

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

            // Attempt video playback smoothly without blocking initial UI paint
            if (this.video) {
                const srcEl = this.video.querySelector('source[data-src]');
                if (srcEl && !srcEl.src) {
                    srcEl.src = srcEl.dataset.src;
                    try { this.video.load(); } catch (e) {}
                }
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
                // ── Phase 1: Butter-smooth continuous odometer counter & progress track ──
                // Continuous baseline forward drift so counter never stalls, freezes, or hesitates
                const baseStep = dt * (this.isAllPreloaded ? 0.85 : 0.20);
                const lerpFactor = this.isAllPreloaded ? 0.12 : 0.055;
                this.currentPercent += Math.max(baseStep, (this.targetPercent - this.currentPercent) * lerpFactor);
                this.currentPercent = Math.min(1.0, this.currentPercent);

                // Target integer from floating-point currentPercent
                const targetInt = Math.min(100, Math.floor(this.currentPercent * 100));

                // Smooth odometer step: advance by at most 1 (or 2-3 when catching up) per frame to guarantee 60fps fluid roll
                if (this.displayInteger < targetInt) {
                    const diff = targetInt - this.displayInteger;
                    const increment = diff > 12 ? 3 : (diff > 5 ? 2 : 1);
                    this.displayInteger = Math.min(targetInt, this.displayInteger + increment);

                    if (this.counterEl) {
                        this.counterEl.textContent = this.displayInteger.toString().padStart(2, '0');
                    }
                }

                // Smooth floating-point progress bar update (60fps glide, zero CSS transition fighting)
                if (this.progressBar) {
                    this.progressBar.style.width = `${(this.currentPercent * 100).toFixed(1)}%`;
                }

                // Check if ready to trigger portal reveal (both counter reached 100 and all preloaded)
                if (this.isAllPreloaded && this.displayInteger >= 100) {
                    this.triggerPortalReveal();
                    return;
                }
            } else {
                // ── Phase 2: Expanding Portal Hole Cutout (Laptop Screen 52% 51.5% Outward) ──
                this.revealTime += dt;
                const progress = Math.min(1.0, this.revealTime / this.REVEAL_DURATION);
                const easedRatio = ease.smoothReveal(progress);

                // Radius expands from 0% to 150% (reveals entire viewport)
                const currentRadius = easedRatio * 150;
                if (this.container) {
                    this.container.style.setProperty('--reveal-radius', `${currentRadius.toFixed(1)}%`);
                }

                // Expanding glowing rim (GPU transform: scale — 0 layout reflows)
                if (this.portalRim) {
                    const maxDim = Math.max(window.innerWidth, window.innerHeight) * 2.5;
                    const scale = (easedRatio * maxDim) / 100;
                    this.portalRim.style.transform = `translate3d(-50%, -50%, 0) scale(${scale.toFixed(3)})`;
                    this.portalRim.style.opacity = progress < 0.78 ? '1' : Math.max(0, (1 - progress) * 4.5).toFixed(2);
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

            // Immediately pause background video to release GPU decoding load & memory bandwidth
            if (this.video && !this.video.paused) {
                try { this.video.pause(); } catch (e) {}
            }

            if (this.counterEl) this.counterEl.textContent = '100';
            if (this.progressBar) this.progressBar.style.width = '100%';
            if (this.statusTextEl) this.statusTextEl.textContent = 'SYSTEM READY · REVEALING WORKSPACE';

            // Fade out UI text elements & hide heavy blend mode noise overlay
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
                }, 180);
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

    if (document.getElementById('prismaHeroPreloader')) {
        engine.init();
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => engine.init());
    } else {
        engine.init();
    }
})();

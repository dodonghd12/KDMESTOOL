/**
 * ============================================================================
 * KDMES SUPERCAR BURNOUT & VOLUMETRIC SMOKE SCREEN INTRO ENGINE (60FPS+ AAA)
 * ============================================================================
 * Authentic Lamborghini Vector Engine:
 * 1. Grand Entrance: Lamborghini glides onto wet neon tarmac from Right to Left.
 * 2. Camera Zoom: Cinematic pan and zoom directly to the rear burnout wheel (Right).
 * 3. Intense Burnout: Rear wheel spins at 9000 RPM, carbon-ceramic rotor glows,
 *    authentic white/grey smoke billows from the rear tire-ground contact point.
 * 4. Smoke Screen: Volumetric dense smoke billows to cover 100% of the screen.
 * 5. Dissipation: Smoke smoothly transitions into the SPA Dashboard (Zero Flash).
 */
(function () {
    'use strict';

    const CONFIG = {
        entranceDuration: 0.85,
        zoomDuration: 0.65,
        burnoutDuration: 1.25,
        smokeCoverDuration: 0.70,
        dissipateDuration: 0.50,
        carScale: 0.245,
        maxSmokeParticles: 110,
        maxSparks: 18,
        maxSkidMarks: 35
    };

    let canvas, ctx;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let animFrameId = null;
    let startTime = null;
    let allLoadedTimestamp = null;
    let isFinished = false;
    let isAllPreloaded = false;
    let preloadedCount = 0;
    const totalPages = 10;

    // Particle & Entity Pools
    const smokePool = [];
    const sparksPool = [];
    const skidMarks = [];

    // Scene & Camera State
    const scene = {
        carX: 0,
        carY: 0,
        speed: 0,
        wheelAngle: 0,
        wheelSpinSpeed: 0,
        rotorHeat: 0,
        cameraScale: 1.0,
        cameraX: 0,
        cameraY: 0,
        shakeX: 0,
        shakeY: 0,
        groundY: 0,
        smokeDensity: 0,
        globalAlpha: 1.0,
        phase: 'entrance'
    };

    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }
    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    // ── LAMBORGHINI VECTOR ASSETS (EXACT SVG PATHS) ──
    const LAMBO_PATHS = {
        body: new Path2D("M953.03,309.02c89.9099-6.58,180.37-3.16,269.89,6.98c15.1499,0.79,29.76,5.12,44.1899,9.45c45.58,3.89,91.14,8.07,136.6901,12.34c48.5399,4.84,96.8899,11.39,145.1699,18.29c46.4401,6.7,92.8101,13.86,139.13,21.33c53.29,8.5,106.4,18.07,159.75,26.18c10.65,1.83,21.42,3.06,32.01,5.25c2.91,0.29,5.52,2.91,5.1,5.95c-1.3999,1.94-3.6699,0.19-5.25-0.43c-1.77-1.03-3.77-0.23-5.5699,0.08c-16.91,4.07-33.86,7.98-50.75,12.1c-3.59,0.93-7.92,2.53-8.9301,6.54c-10.61,35.71-21.2999,71.4-32.0499,107.06c-0.6801,2.03,1.27,3.56,2.96,4.18c9.97,3.89,20.02,7.6,29.99,11.52c4.29,1.9,9.08,0.83,13.63,1.03c25.41,0,50.84-0.69,76.25-0.15c-0.73,8.64-2.73,18.02-9.7,23.88c-4.2001,3.46-8.7101,7.53-8.7201,13.45c0.2001,10.33,0.3,20.67,0.05,31c0.0699,2.26-1.28,4.89-3.8099,4.93c-23.6801,3.23-47.3601,6.46-71,9.96c-10.0701,13.18-21.51,25.43-34.88,35.31c-14.16,10.6-30.63,18.42-48.16,21.28c-6.62,1.1899-13.37,1.2-20.0601,1.56c-1.34,0.05-3.34-0.3701-3.39-2.01c1.05-3.31,3.7001-6.47,2.7301-10.12c-2.65-2.31-6.3-0.37-9.37-0.5c-2.0701,0.48-4.6801-1.02-3.8601-3.38c1.5-4.26,4.25-8.03,5.3101-12.49c5.87-20.3,5.49-41.77,4.03-62.66c-1.13-13.06-2.2001-26.34-6.8-38.74c-10.02-27.94-30.09-51.39-53.7-68.94c-30.23-22.28-68.12-35.43-105.89-32.27c-21.22,1.62-41.51,9.13-60.37,18.66c-25.75,13.11-48.2101,33.17-62.5701,58.39c-10.1899,17.55-16.4399,37.1299-20.12,57.02c-4.5699,22.68-1.6799,46.26,4.87,68.25c1.29,5.33,4.16,10.18,5.17,15.56c-1.8199,1.88-5.79-0.77-7.23,2c3.11,9.57,6.52,19.05,9.51,28.66c0.62,1.96,0.9199,5.65-2.11,5.46c-223.7201,6.83-447.46,13.65-671.1901,20.48c-66.83,1.84-133.62,4.8-200.44,6.95c8.03-4.22,15.97-8.6,23.94-12.9c3.2-12.44,6.91-24.75,11.23-36.85c3.13-8.16,4.98-16.87,4.88-25.6299c0.06-9.8-2.6201-19.3101-3.27-29.04c-0.19-2.86-0.99-5.64-2.3-8.18c-1.66,1.25-2.57,3.12-2.71,5.17c-3.84,36.19-21.19,70.75-47.61,95.73c-22.05,21.0099-51.39,33.88-81.67,36.63c-23.48,2.29-47.32-1.13-69.68-8.39c-27.28-8.92-51.77-26.49-68.15-50.15c-15.32-21.98-24.47-48.13-26.91-74.76c-0.8-5.65,0.78-11.88-2.19-17.03c-1.26,1.4-2.84,2.73-3.21,4.69c-7.21,35.37-3.54,73.6,13.76,105.61c1.32,2.03,2.23,6.66-1.59,6.17c-79.73-1.27-159.46-2.64-239.18-3.96c-7.26-0.75-14.74-3.19-20.26-8.09c-4.67-4.06-4.17-12.25,0.94-15.7c5.4-3.63,12.33-3.18,18.47-2.29c4.77-7.69,9.5-15.4,14.51-22.93c1.42-2.21,3.28-4.19,4.2-6.67c0.58-1.84-0.57-3.53-1.76-4.79c-15.07-16.03-29.47-33.45-37.46-54.2c-0.77-2.86,1.26-5.35,2.97-7.39c22.26-26.6,50.97-46.92,80.85-64.1c38.51-21.99,79.68-38.91,121.46-53.54c63.06-21.79,127.9-38.18,193.41-50.65c8.64-2.34,13.45,8.43,21.86,7.97c3.48-0.69,6.21-3.17,9.42-4.53c78.73-33.04,158.06-65.18,240.08-89.25c47.14-13.94,95.02-25.41,143.38-34.27C871.32,317.54,912.06,311.92,953.03,309.02 M848.93,351.03c-42.1,5.88-84.03,13.54-124.97,25.11c-25.12,7.13-50.34,14.07-74.94,22.89c-39.36,14.13-77.7,30.94-115.66,48.44c-6.71,3-13.23,6.48-20.22,8.8c-1.95,0.66-3.71,1.77-5.41,2.91c2.05,2.51,5.43,2.6,8.37,3.25c26.37,4.92,52.56,10.83,79.07,14.95c15.5,2.23,31.19,3.91,46.87,3.4c3.29,0.08,4.16-3.71,2.08-5.84c-9.97-13.69-20.25-27.15-30.25-40.81c-2.26-3.37,1.08-6.79,3.23-9.18c3.1801-3.03,5.19-7.63,9.6-9.08c12.67-4.93,25.19-10.25,37.87-15.11c8.1-0.82,16.29-0.87,24.43-1.24c-1.31,13.49-2.72,26.97-3.95,40.46c-4.65,4.11-9.34,8.25-14.71,11.42c-1.71,1.17-4.01,2.41-4.14,4.75c-0.07,2.55,2.22,4.17,3.8,5.85c4.87,4.44,8.15,10.23,11.99,15.51c14.01,0.05,27.95-1.57,41.85-3.18c42.97-5.3,85.58-13.04,128.34-19.68c35.64-5.51,71.3-10.81,106.97-16.04c28.92-4.11,57.79-8.59,86.7999-11.99c3.4601-0.46,7.4801-2.61,7.5601-6.55c2.58-24.06,5.6799-48.08,8.27-72.13c0.73-5.14-5.4501-4.69-8.8-4.98C984.92,339.85,916.4,340.86,848.93,351.03 M1224.25,344.85c1.02,1.53,2.2,3.01,3.77,4.03c14.6899,10.02,29.34,20.11,44.03,30.14c-15.7301,5.17-31.37,10.6-47.1801,15.52c-3.3199,1.07-6.86,1.69-9.84,3.57c-0.6901,2.56,2.5399,3.03,4.37,2.61c32.49-4.85,64.96-9.84,97.5-14.31c1.99-0.16,3.74-1.16,5.35-2.3c-1.65-1.56-3.46-2.97-5.59-3.76c-28.3301-11.38-56.65-22.77-84.9601-34.18C1229.35,345.15,1226.76,344.89,1224.25,344.85 M1100.54,351.17c-0.1801,19.28,0.0699,38.58-0.53,57.87c0.01,2.57,0.01,5.75,2.3099,7.45c1.7201,1.21,3.8601,0.26,5.77,0.14c29.65-4.8,59.4-9.05,88.9301-14.57c-9.6901-14.75-21.03-28.31-32.04-42.06c-4.8099-5.34-12.53-5.4-19.09-6.51c-13.28-2-26.55-4.16-39.9-5.59C1103.7,347.34,1100.53,348.43,1100.54,351.17 M1185.78,349.05c0.37,2.6,2.49,4.24,4.23,5.98c7.73,7.59,15.3,15.34,23.21,22.74c1.0901,0.93,2.05,2.36,1.4,3.85c-1.89,4.03-4.75,7.54-6.4399,11.67c-0.67,1.7-1.17,4.03,0.71,5.18c3.87-1.69,5.9299-5.74,8.9-8.57c3.1-4.01,7.52-7.06,9.64-11.77c-12.3301-9.24-24.8601-18.22-37.2301-27.41C1188.95,349.66,1187.33,349.3,1185.78,349.05 M628.87,517.35c-18.77,2.67-37.45,6.06-56.28,8.29c14.8199-0.62,29.49-3.19,44.24-4.78c163.71-19.84,327.43-39.59,491.1199-59.52c11.7101-1.86,23.29,1.23,34.8301,2.78c25.47,3.88,50.9399,7.85,76.4199,11.74c2.26,0.32,5.39,1.19,5.4701,4.01c-1.12,7.05-3.0701,13.96-4.17,21.03c-2.0699,10.34-2.29,21.2-6.66,30.96c-13.09,24.15-26.7,48.03-39.9,72.13c-0.7699,1.48-1.7599,2.88-3.2999,3.63c-9.88,5.78-19.72,11.66-29.59,17.46c-1.52,0.99-3.3601,1.02-5.0901,1.04c-18.6499,0.13-37.2999,0.38-55.95,0.56c-9.3201,0.26-18.67-0.18-27.96,0.66C897.23,645.35,742.41,663.31,587.6,681.33c27.79-1.04,55.58-2.63,83.37-3.84c126.03-5.95,252.0601-11.91,378.0901-17.85c3.7799-0.03,7.34-1.45,10.9399-2.44c22.6-6.5,45.21-12.99,67.8101-19.49c20.09-5.93,40.37-11.2401,60.2999-17.7c3.4501-1.1,7.11-1.26,10.59-2.26c4.0901-1.32,6.02-5.44,8.25-8.76c18.91-29.1,37.8501-58.18,56.91-87.19c9.78-14.82,19.35-29.8,29.5701-44.33c0.85-1.29,1.59-2.75,1.4199-4.35c-2.46-1.16-5.22-1.3-7.83-1.87c-48.53-9.3-97.0601-18.59-145.5601-27.99c-5.7799-1.16-11.63-2.54-17.5599-2C958.9,466.61,793.88,491.96,628.87,517.35 M401.52,503.84c-35.83,4.58-69.01,26.11-87.64,57.07c-20.71,33.34-23.5,76.88-7.56,112.7c8.72,20.02,23.05,37.53,40.85,50.17c26.84,19.23,61.7,26.62,94.06,20.18c33.18-6.29,63.18-27.23,80.57-56.17c20.1-32.59,23.2-74.81,8.38-110.08c-8.06-19.59-21.45-36.89-38.22-49.8C466.61,508.27,433.27,499.49,401.52,503.84 M172.27,522.14c-31.22,8.89-61.29,23.59-85.23,45.79c-3.43,3.33-7.36,6.22-10.04,10.25c2.2,2.02,5.24,1.38,7.91,1.09c6.18-0.85,12.4-1.25,18.6-1.8c5.85-5.89,12.26-11.2,18.92-16.16c27.53-20.13,58.53-34.94,90.04-47.7C198.9,515.54,185.45,518.38,172.27,522.14 M74.5,621.99c9.39,23.45,18.94,46.83,28.28,70.3c-11.31-22.67-22.13-45.57-33.3-68.31c-4.76,1.65-9.45,3.49-14.07,5.5c-1.89,0.93-3.99,1.91-5.11,3.81c-0.77,1.48,0.28,3.13,1.63,3.8c4.39,2.24,9.29,3.2599,13.72,5.41c2.75,4.59,4.92,9.54,7.66,14.16c5.34,9.64,2.56,21.15-0.54,31.05c-1.67,5.84-5.32,12.09-2.7,18.21c1.65,3.91,6.29,4.15,9.93,4.37c10.36,0.45,20.78-0.47,30.97-2.3c6.85-3.22,13.1-7.63,19.73-11.29c1.68-1.2,4.69-2.1,4.22-4.71c-0.52-2.68-2.51-4.74-3.9-7c-12.62-19.01-25.3-37.98-37.84-57.04c-2.67-3.73-3.55-10.43-9.05-10.86C80.63,618.03,77.71,620.38,74.5,621.99z"),
        sideVent: new Path2D("M1811.99,480.51c13.33,0.08,26.66,0.22,40,0.36c2.01,0.16,4.29-0.09,6.11,1.04c0.87,1.02,0.4,2.4,0.25,3.59c-2.02,9.01-2.27,18.27-2.6899,27.46c-0.36,11.99-0.36,23.99-0.16,35.99c-8.17-0.11-16.33-0.28-24.49-0.34c-2.65-0.05-5.39,0.13-7.83-1.01c-9.2201-3.77-18.51-7.35-27.7101-11.17C1801.0601,517.82,1806.49,499.15,1811.99,480.51z"),
        rearLight: new Path2D("M1864.95,424.77c4.13-0.96,8.4501-2.33,12.7201-1.35c2.7699,0.63,3.6,4.11,2.33,6.41c-6.99,13.98-13.23,28.33-19.49,42.65c-15.34,0.19-30.6801,0.31-46.02,0.46c3.53-12.3,7.02-24.62,10.49-36.94C1838.26,432.11,1851.54,428.19,1864.95,424.77z")
    };

    class SkidMark {
        constructor(x, y, alpha) {
            this.x = x;
            this.y = y;
            this.w = 34 + Math.random() * 22;
            this.h = 4.5;
            this.alpha = alpha || 0.7;
        }

        draw(targetCtx) {
            if (this.alpha <= 0.01) return;
            targetCtx.save();
            targetCtx.fillStyle = 'rgba(6, 8, 12, ' + this.alpha.toFixed(3) + ')';
            targetCtx.fillRect(this.x - this.w / 2, this.y - this.h, this.w, this.h);
            targetCtx.restore();
        }
    }

    class SmokeParticle {
        constructor() {
            this.active = false;
            this.x = 0;
            this.y = 0;
            this.vx = 0;
            this.vy = 0;
            this.size = 0;
            this.maxSize = 0;
            this.growth = 0;
            this.alpha = 0;
            this.maxAlpha = 0;
            this.life = 0;
            this.maxLife = 0;
            this.rot = 0;
            this.vRot = 0;
            this.tint = 'white';
        }

        spawn(x, y, vx, vy, maxSize, lifeSec, tint) {
            this.active = true;
            this.x = x + (Math.random() - 0.5) * 8;
            this.y = y - Math.random() * 5; // Start exactly at tire-ground contact
            this.vx = vx + (Math.random() - 0.5) * 1.5;
            this.vy = vy + (Math.random() - 0.5) * 1.5;
            this.size = 14 + Math.random() * 16;
            this.maxSize = maxSize;
            const totalFrames = Math.max(20, lifeSec * 60);
            this.growth = (maxSize - this.size) / totalFrames;
            this.alpha = 0.15;
            this.maxAlpha = 0.85 + Math.random() * 0.15;
            this.life = 0;
            this.maxLife = totalFrames;
            this.rot = Math.random() * Math.PI * 2;
            this.vRot = (Math.random() - 0.5) * 0.04;
            this.tint = tint || 'white';
        }

        update() {
            if (!this.active) return;
            this.life++;
            if (this.life >= this.maxLife) {
                this.active = false;
                return;
            }

            this.x += this.vx;
            this.y += this.vy;
            this.vx *= 0.965; // Air drag
            this.vy *= 0.975;
            this.vy -= 0.045; // Natural thermal updraft
            this.size += this.growth;
            this.rot += this.vRot;

            const progress = this.life / this.maxLife;
            if (progress < 0.18) {
                this.alpha = (progress / 0.18) * this.maxAlpha;
            } else {
                this.alpha = (1 - (progress - 0.18) / 0.82) * this.maxAlpha;
            }
        }

        draw(targetCtx) {
            if (!this.active || this.alpha <= 0.01) return;
            targetCtx.save();
            targetCtx.translate(this.x, this.y);
            targetCtx.rotate(this.rot);

            const r = Math.max(1, this.size);
            const grad = targetCtx.createRadialGradient(0, 0, r * 0.06, 0, 0, r);
            const a = Math.max(0, Math.min(1, this.alpha));

            if (this.tint === 'cyan_lit') {
                grad.addColorStop(0, 'rgba(235, 250, 255, ' + (a * 0.95).toFixed(3) + ')');
                grad.addColorStop(0.35, 'rgba(0, 220, 255, ' + (a * 0.6).toFixed(3) + ')');
                grad.addColorStop(0.7, 'rgba(15, 40, 65, ' + (a * 0.35).toFixed(3) + ')');
                grad.addColorStop(1, 'rgba(6, 12, 24, 0)');
            } else {
                // Realistic thick white/grey tire smoke with volumetric density
                grad.addColorStop(0, 'rgba(245, 248, 255, ' + (a * 0.95).toFixed(3) + ')');
                grad.addColorStop(0.35, 'rgba(215, 225, 238, ' + (a * 0.75).toFixed(3) + ')');
                grad.addColorStop(0.7, 'rgba(135, 150, 175, ' + (a * 0.4).toFixed(3) + ')');
                grad.addColorStop(1, 'rgba(15, 20, 32, 0)');
            }

            targetCtx.fillStyle = grad;
            targetCtx.beginPath();
            targetCtx.arc(0, 0, r, 0, Math.PI * 2);
            targetCtx.fill();
            targetCtx.restore();
        }
    }

    class SparkParticle {
        constructor() {
            this.active = false;
            this.x = 0;
            this.y = 0;
            this.vx = 0;
            this.vy = 0;
            this.life = 0;
            this.maxLife = 0;
            this.color = '#ff9900';
        }

        spawn(x, y) {
            this.active = true;
            this.x = x + (Math.random() - 0.5) * 6;
            this.y = y - 1;
            const angle = Math.PI * (0.05 + Math.random() * 0.35); // Throw sparks backwards to the right
            const speed = 6 + Math.random() * 12;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.life = 0;
            this.maxLife = 10 + Math.random() * 14;
            this.color = Math.random() > 0.4 ? '#ff9900' : '#00f0ff';
        }

        update(groundY) {
            if (!this.active) return;
            this.life++;
            if (this.life >= this.maxLife) {
                this.active = false;
                return;
            }

            this.x += this.vx;
            this.y += this.vy;
            this.vy += 0.45;

            if (this.y >= groundY) {
                this.y = groundY;
                this.vy = -this.vy * 0.35;
                this.vx *= 0.75;
            }
        }

        draw(targetCtx) {
            if (!this.active) return;
            const a = Math.max(0, 1 - this.life / this.maxLife);
            targetCtx.save();
            targetCtx.strokeStyle = this.color;
            targetCtx.globalAlpha = a;
            targetCtx.lineWidth = 1.8;
            targetCtx.beginPath();
            targetCtx.moveTo(this.x, this.y);
            targetCtx.lineTo(this.x - this.vx * 1.4, this.y - this.vy * 1.4);
            targetCtx.stroke();
            targetCtx.restore();
        }
    }

    // Pre-allocate particle pools
    for (let i = 0; i < CONFIG.maxSmokeParticles; i++) smokePool.push(new SmokeParticle());
    for (let i = 0; i < CONFIG.maxSparks; i++) sparksPool.push(new SparkParticle());

    function getFreeSmoke() {
        return smokePool.find(p => !p.active);
    }
    function getFreeSpark() {
        return sparksPool.find(p => !p.active);
    }

    // ── DRAW AUTHENTIC LAMBORGHINI VECTOR SUPERCAR ──
    function drawLamborghini(targetCtx, x, y, wheelAngle, rotorHeat) {
        targetCtx.save();
        targetCtx.translate(x, y);
        targetCtx.scale(CONFIG.carScale, CONFIG.carScale);
        targetCtx.translate(-960.35, -774.0); // Centers SVG origin to (x, y=groundY)

        // 1. Aerodynamic Ground Shadow & Cyan Neon Underglow
        targetCtx.save();
        const shadowGrad = targetCtx.createRadialGradient(960, 770, 80, 960, 770, 920);
        shadowGrad.addColorStop(0, 'rgba(0, 240, 255, 0.48)');
        shadowGrad.addColorStop(0.45, 'rgba(0, 120, 240, 0.22)');
        shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        targetCtx.fillStyle = shadowGrad;
        targetCtx.beginPath();
        targetCtx.ellipse(960, 775, 930, 85, 0, 0, Math.PI * 2);
        targetCtx.fill();
        targetCtx.restore();

        // 2. Carbon-Ceramic Metallic Dark Body Paint (Gradient Shading)
        const bodyGrad = targetCtx.createLinearGradient(0, 300, 1920, 770);
        bodyGrad.addColorStop(0, '#060912');
        bodyGrad.addColorStop(0.25, '#101726');
        bodyGrad.addColorStop(0.55, '#182338');
        bodyGrad.addColorStop(0.85, '#0d131f');
        bodyGrad.addColorStop(1, '#05070d');

        targetCtx.fillStyle = bodyGrad;
        targetCtx.fill(LAMBO_PATHS.body);

        // Cyberpunk Neon Glow Contours & Aerodynamic Strakes
        targetCtx.strokeStyle = 'rgba(0, 240, 255, 0.88)';
        targetCtx.lineWidth = 4.5;
        targetCtx.stroke(LAMBO_PATHS.body);

        // 3. Side Vent Duct & Air Scoop
        targetCtx.fillStyle = '#020305';
        targetCtx.fill(LAMBO_PATHS.sideVent);
        targetCtx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
        targetCtx.lineWidth = 3.2;
        targetCtx.stroke(LAMBO_PATHS.sideVent);

        // 4. FRONT DUAL-PROJECTOR LED HEADLIGHT (AT THE FRONT NOSE, LEFT SIDE X=65, Y=630)
        targetCtx.save();
        targetCtx.fillStyle = '#ffffff';
        targetCtx.shadowColor = '#00f0ff';
        targetCtx.shadowBlur = 28;
        targetCtx.beginPath();
        targetCtx.ellipse(65, 630, 24, 11, -0.18, 0, Math.PI * 2);
        targetCtx.fill();
        targetCtx.restore();

        // Volumetric Light Cone piercing forward towards the LEFT
        targetCtx.save();
        const beamGrad = targetCtx.createRadialGradient(65, 630, 20, -750, 680, 980);
        beamGrad.addColorStop(0, 'rgba(0, 240, 255, 0.60)');
        beamGrad.addColorStop(0.35, 'rgba(0, 180, 255, 0.18)');
        beamGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        targetCtx.fillStyle = beamGrad;
        targetCtx.beginPath();
        targetCtx.moveTo(65, 620);
        targetCtx.lineTo(-920, 480);
        targetCtx.lineTo(-1020, 930);
        targetCtx.lineTo(65, 646);
        targetCtx.closePath();
        targetCtx.fill();

        // Asphalt Specular Reflection illuminated by headlight beam
        const groundBeam = targetCtx.createRadialGradient(-350, 774, 50, -350, 774, 600);
        groundBeam.addColorStop(0, 'rgba(0, 240, 255, 0.28)');
        groundBeam.addColorStop(0.6, 'rgba(0, 150, 255, 0.08)');
        groundBeam.addColorStop(1, 'rgba(0, 0, 0, 0)');
        targetCtx.fillStyle = groundBeam;
        targetCtx.beginPath();
        targetCtx.ellipse(-350, 775, 620, 45, 0, 0, Math.PI * 2);
        targetCtx.fill();
        targetCtx.restore();

        // Rear Spoiler Taillight Glow (RIGHT SIDE, X=1865, Y=425)
        targetCtx.save();
        targetCtx.fillStyle = '#ff0055';
        targetCtx.shadowColor = '#ff0055';
        targetCtx.shadowBlur = 22;
        targetCtx.fill(LAMBO_PATHS.rearLight);
        targetCtx.restore();

        // 5. Wheels & Brakes:
        // - FRONT WHEEL (Left side): X=417.8, Y=625.2
        // - REAR WHEEL (Right side - BURNOUT WHEEL): X=1549.0, Y=625.2
        const wheels = [
            { cx: 417.8, cy: 625.2, isRear: false, spinAngle: wheelAngle * 0.35 },
            { cx: 1549.0, cy: 625.2, isRear: true, spinAngle: wheelAngle }
        ];

        wheels.forEach(w => {
            targetCtx.save();
            targetCtx.translate(w.cx, w.cy);

            // A. Tire Outer Rubber Ring
            targetCtx.fillStyle = '#070a10';
            targetCtx.strokeStyle = '#1a2233';
            targetCtx.lineWidth = 14;
            targetCtx.beginPath();
            targetCtx.arc(0, 0, 138, 0, Math.PI * 2);
            targetCtx.fill();
            targetCtx.stroke();

            // Tire Sidewall Accent
            targetCtx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
            targetCtx.lineWidth = 2.5;
            targetCtx.beginPath();
            targetCtx.arc(0, 0, 126, 0, Math.PI * 2);
            targetCtx.stroke();

            // B. Carbon-Ceramic Drilled Brake Rotor
            const rotorR = 92;
            const heat = w.isRear ? Math.max(0, Math.min(1, rotorHeat)) : 0;

            if (heat > 0.05) {
                targetCtx.save();
                const heatGlow = targetCtx.createRadialGradient(0, 0, 15, 0, 0, 115);
                heatGlow.addColorStop(0, 'rgba(255, 210, 60, ' + (heat * 0.95).toFixed(2) + ')');
                heatGlow.addColorStop(0.5, 'rgba(255, 60, 0, ' + (heat * 0.8).toFixed(2) + ')');
                heatGlow.addColorStop(1, 'rgba(255, 0, 0, 0)');
                targetCtx.fillStyle = heatGlow;
                targetCtx.beginPath();
                targetCtx.arc(0, 0, 115, 0, Math.PI * 2);
                targetCtx.fill();
                targetCtx.restore();
            }

            const discGrad = targetCtx.createRadialGradient(0, 0, 20, 0, 0, rotorR);
            discGrad.addColorStop(0, '#1c222d');
            discGrad.addColorStop(0.7, heat > 0.3 ? '#882b0b' : '#333e4f');
            discGrad.addColorStop(1, '#0e141c');
            targetCtx.fillStyle = discGrad;
            targetCtx.beginPath();
            targetCtx.arc(0, 0, rotorR, 0, Math.PI * 2);
            targetCtx.fill();
            targetCtx.strokeStyle = '#4b596e';
            targetCtx.lineWidth = 3;
            targetCtx.stroke();

            // Rotor Cross-Drilled Holes
            targetCtx.fillStyle = '#06090e';
            for (let r = 40; r <= 78; r += 18) {
                for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
                    targetCtx.beginPath();
                    targetCtx.arc(Math.cos(a) * r, Math.sin(a) * r, 2.8, 0, Math.PI * 2);
                    targetCtx.fill();
                }
            }

            // C. Brembo Sports Caliper (Cyan Neon)
            targetCtx.save();
            targetCtx.rotate(w.isRear ? 0.35 : -0.35);
            targetCtx.fillStyle = '#00f0ff';
            targetCtx.beginPath();
            if (typeof targetCtx.roundRect === 'function') {
                targetCtx.roundRect(w.isRear ? -90 : 62, -32, 28, 64, [6, 12, 12, 6]);
            } else {
                targetCtx.rect(w.isRear ? -90 : 62, -32, 28, 64);
            }
            targetCtx.fill();
            targetCtx.strokeStyle = '#ffffff';
            targetCtx.lineWidth = 1.6;
            targetCtx.stroke();
            targetCtx.restore();

            // D. 5 Aggressive Double-Y Alloy Rims (Rotating with RPM)
            targetCtx.rotate(w.spinAngle);

            // Rim Outer Lip
            targetCtx.strokeStyle = 'rgba(0, 240, 255, 0.92)';
            targetCtx.lineWidth = 5.5;
            targetCtx.beginPath();
            targetCtx.arc(0, 0, 110, 0, Math.PI * 2);
            targetCtx.stroke();

            // Center Hub
            targetCtx.fillStyle = '#080c14';
            targetCtx.beginPath();
            targetCtx.arc(0, 0, 32, 0, Math.PI * 2);
            targetCtx.fill();
            targetCtx.strokeStyle = '#00f0ff';
            targetCtx.lineWidth = 3.2;
            targetCtx.stroke();

            // Lamborghini Gold Emblem Accent
            targetCtx.fillStyle = '#ffcc00';
            targetCtx.beginPath();
            targetCtx.arc(0, 0, 11, 0, Math.PI * 2);
            targetCtx.fill();

            // 5 Double-Y Alloy Spokes
            for (let s = 0; s < 5; s++) {
                targetCtx.save();
                targetCtx.rotate((s * Math.PI * 2) / 5);

                // Left fork of Y
                targetCtx.strokeStyle = '#e2ecf8';
                targetCtx.lineWidth = 5.5;
                targetCtx.beginPath();
                targetCtx.moveTo(0, -22);
                targetCtx.lineTo(-18, -65);
                targetCtx.lineTo(-24, -106);
                targetCtx.stroke();

                // Right fork of Y
                targetCtx.beginPath();
                targetCtx.moveTo(0, -22);
                targetCtx.lineTo(18, -65);
                targetCtx.lineTo(24, -106);
                targetCtx.stroke();

                // Center cyan trim
                targetCtx.strokeStyle = '#00f0ff';
                targetCtx.lineWidth = 2.0;
                targetCtx.beginPath();
                targetCtx.moveTo(0, -22);
                targetCtx.lineTo(0, -78);
                targetCtx.stroke();

                targetCtx.restore();
            }

            targetCtx.restore();
        });

        targetCtx.restore();
    }

    // ── DRAW TARMAC & WET ROAD REFLECTIONS ──
    function drawRoad(targetCtx, groundY, carX) {
        targetCtx.save();
        // Wet Asphalt Base Gradient
        const roadGrad = targetCtx.createLinearGradient(0, groundY - 10, 0, height);
        roadGrad.addColorStop(0, '#0c0f18');
        roadGrad.addColorStop(0.25, '#070a12');
        roadGrad.addColorStop(1, '#03050a');
        targetCtx.fillStyle = roadGrad;
        targetCtx.fillRect(-width * 2, groundY, width * 5, height - groundY + 120);

        // Wet Tarmac Specular Horizon Line
        targetCtx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
        targetCtx.lineWidth = 1.8;
        targetCtx.beginPath();
        targetCtx.moveTo(-width * 2, groundY);
        targetCtx.lineTo(width * 5, groundY);
        targetCtx.stroke();

        // Neon Grid Perspective Lines on Road
        targetCtx.strokeStyle = 'rgba(0, 240, 255, 0.07)';
        targetCtx.lineWidth = 1;
        const gridSpacing = 65;
        const offsetX = (carX * 0.8) % gridSpacing;
        for (let gx = -width * 1.5; gx < width * 2.5; gx += gridSpacing) {
            targetCtx.beginPath();
            targetCtx.moveTo(gx - offsetX, groundY);
            targetCtx.lineTo(gx - offsetX + 140, height);
            targetCtx.stroke();
        }

        // Draw Permanent Rubber Skid Marks
        skidMarks.forEach(sm => sm.draw(targetCtx));

        targetCtx.restore();
    }

    // ── MAIN ANIMATION LOOP (60FPS+ RAF) ──
    let lastTime = 0;
    function render(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = (timestamp - startTime) / 1000;
        const dt = lastTime ? Math.min(0.05, (timestamp - lastTime) / 1000) : 0.016;
        lastTime = timestamp;

        ctx.clearRect(0, 0, width, height);

        // Physical REAR wheel contact patch on tarmac (Right side: +144px offset from car center)
        const rearWheelContactX = scene.carX + 144;
        const rearWheelContactY = scene.groundY;

        const t1 = CONFIG.entranceDuration;
        const t2 = t1 + CONFIG.zoomDuration;
        const t3 = t2 + CONFIG.burnoutDuration;
        const t4 = t3 + CONFIG.smokeCoverDuration;
        const t5 = t4 + CONFIG.dissipateDuration;

        scene.shakeX = 0;
        scene.shakeY = 0;

        if (elapsed < t1) {
            // Phase 1: Entrance from RIGHT to Left (Car heads Left)
            scene.phase = 'entrance';
            const p = elapsed / t1;
            const eased = easeOutCubic(p);
            const startX = width + 480;
            const targetX = width * 0.48;
            scene.carX = startX - eased * (startX - targetX);
            scene.speed = (1 - p) * 28;
            scene.wheelAngle -= scene.speed * dt * 9;
            scene.wheelSpinSpeed = scene.speed;
            scene.cameraScale = 1.0;
            scene.cameraX = width / 2;
            scene.cameraY = height / 2;
            updateHud('Khởi động KDMES...', 20 + Math.floor(p * 25));
        } else if (elapsed < t2) {
            // Phase 2: Dynamic Cinematic Zoom into REAR Wheel (Right side)
            scene.phase = 'zoom';
            const p = (elapsed - t1) / CONFIG.zoomDuration;
            const eased = easeInOutCubic(p);

            scene.carX = width * 0.48;
            scene.cameraScale = 1.0 + eased * 2.2;
            scene.cameraX = width / 2 + eased * (width * 0.48 + 144 - width / 2);
            scene.cameraY = height / 2 + eased * (scene.groundY - 35 - height / 2);

            scene.wheelSpinSpeed = 25 + p * 55;
            scene.wheelAngle -= scene.wheelSpinSpeed * dt * 12;
            scene.rotorHeat = p * 0.5;

            // Early friction sparks (subtle, thrown backwards to the right)
            if (Math.random() < p * 0.4) {
                const spk = getFreeSpark();
                if (spk) spk.spawn(rearWheelContactX, rearWheelContactY);
            }

            updateHud('Tăng tốc loading...', 45 + Math.floor(p * 25));
        } else if (elapsed < t3) {
            // Phase 3: Intense Burnout on REAR Wheel, Skid Marks, Micro-Camera Shake
            scene.phase = 'burnout';
            const p = (elapsed - t2) / CONFIG.burnoutDuration;

            scene.cameraScale = 3.2;
            scene.cameraX = width * 0.48 + 144;
            scene.cameraY = scene.groundY - 35;

            // Engine torque micro camera shake
            scene.shakeX = (Math.random() - 0.5) * 2.8 * p;
            scene.shakeY = (Math.random() - 0.5) * 2.0 * p;

            scene.wheelSpinSpeed = 110;
            scene.wheelAngle -= scene.wheelSpinSpeed * dt * 20;
            scene.rotorHeat = Math.min(1.0, 0.5 + p * 0.5);

            // Lay down rubber skid marks extending behind the rear tire (to the right)
            if (skidMarks.length < CONFIG.maxSkidMarks && Math.random() < 0.5) {
                skidMarks.push(new SkidMark(rearWheelContactX + skidMarks.length * 6, rearWheelContactY, 0.8));
            }

            // High-density realistic white tire smoke thrown backwards to the RIGHT and upwards
            const burstCount = 7;
            for (let k = 0; k < burstCount; k++) {
                const s = getFreeSmoke();
                if (s) {
                    const tint = Math.random() > 0.82 ? 'cyan_lit' : 'white';
                    s.spawn(
                        rearWheelContactX + (Math.random() - 0.5) * 16,
                        rearWheelContactY - 2, // EXACT tire-tarmac contact patch
                        16 + Math.random() * 26, // Tangential velocity throws smoke backwards to the RIGHT
                        -6 - Math.random() * 16, // Thermal plume billows upwards
                        200 + Math.random() * 200,
                        1.85 + Math.random() * 0.85,
                        tint
                    );
                }
            }

            // Friction sparks (thrown backwards)
            if (Math.random() < 0.38) {
                const spk = getFreeSpark();
                if (spk) spk.spawn(rearWheelContactX, rearWheelContactY);
            }

            scene.smokeDensity = Math.min(1.0, p * 1.45);
            updateHud('Đang nạp KDMES...', 70 + Math.floor(p * 20));
        } else {
            // Phase 4: Screen Fully Covered in Volumetric Smoke - PERSISTS UNTIL ALL 10 PRELOADED
            scene.phase = 'covered';
            scene.smokeDensity = 1.0;

            // Continuously spawn rich billowing smoke clouds across the screen to keep it dynamically churning
            if (Math.random() < 0.88) {
                const s = getFreeSmoke();
                if (s) {
                    const spawnX = (Math.random() * width * 1.3) - (width * 0.15);
                    const spawnY = (Math.random() * height * 0.85) + (height * 0.15);
                    const tint = Math.random() > 0.8 ? 'cyan_lit' : 'white';
                    s.spawn(
                        spawnX,
                        spawnY,
                        (Math.random() - 0.5) * 8 + 2.5, // gentle rightward/upward atmospheric drift
                        -3.5 - Math.random() * 8.5,
                        290 + Math.random() * 240,
                        2.4 + Math.random() * 0.8,
                        tint
                    );
                }
            }

            // Also keep tire contact area churning with localized dense smoke
            if (Math.random() < 0.55) {
                const s = getFreeSmoke();
                if (s) {
                    s.spawn(
                        rearWheelContactX + (Math.random() - 0.5) * 80,
                        rearWheelContactY - 20 + (Math.random() - 0.5) * 40,
                        8 + Math.random() * 16,
                        -4 - Math.random() * 10,
                        230 + Math.random() * 190,
                        2.0,
                        'white'
                    );
                }
            }

            if (isAllPreloaded) {
                if (!allLoadedTimestamp) {
                    allLoadedTimestamp = elapsed;
                }
                updateHud('Đang mở Main...', 100);

                // Hold for 0.4s after 100% so user sees full completion, then dissipate cleanly
                if (elapsed - allLoadedTimestamp >= 0.4) {
                    scene.phase = 'dissipate';
                    if (!isFinished) {
                        finishIntro();
                        return;
                    }
                }
            } else {
                const dynamicPct = Math.min(99, Math.max(70, Math.floor((preloadedCount / totalPages) * 100)));
                updateHud('Đang nạp 10 trang KDMES...', dynamicPct);
            }
        }

        // ── RENDER SCENE IN CAMERA WORLD SPACE ──
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.scale(scene.cameraScale, scene.cameraScale);
        ctx.translate(-scene.cameraX + scene.shakeX, -scene.cameraY + scene.shakeY);

        // 1. Road & Skid marks
        drawRoad(ctx, scene.groundY, scene.carX);

        // 2. Realistic Lamborghini Vector Model
        drawLamborghini(ctx, scene.carX, scene.carY, scene.wheelAngle, scene.rotorHeat);

        // 3. Volumetric Tire Smoke (Rendered in WORLD space, emerging right from the rear tire contact patch!)
        smokePool.forEach(p => {
            p.update();
            p.draw(ctx);
        });

        // 4. Subtle Friction Sparks
        sparksPool.forEach(spk => {
            spk.update(scene.groundY);
            spk.draw(ctx);
        });

        ctx.restore();

        // 5. Fullscreen Smoke Density Overlay
        if (scene.smokeDensity > 0.15) {
            const overlayAlpha = Math.min(1.0, (scene.smokeDensity - 0.15) / 0.85);
            ctx.fillStyle = 'rgba(6, 10, 18, ' + (overlayAlpha * 0.96).toFixed(3) + ')';
            ctx.fillRect(0, 0, width, height);
        }

        if (!isFinished) {
            animFrameId = requestAnimationFrame(render);
        }
    }

    function updateHud(statusText, percent) {
        const titleEl = document.getElementById('hudIntroStatus');
        const descEl = document.getElementById('hudIntroDesc');
        const pctEl = document.getElementById('hudIntroPct');
        const barEl = document.getElementById('hudIntroProgressBar');
        const rpmEl = document.getElementById('hudIntroRpm');

        const cappedPct = Math.min(100, Math.max(percent, Math.floor((preloadedCount / totalPages) * 100)));

        if (titleEl) titleEl.textContent = statusText;
        if (pctEl) pctEl.textContent = cappedPct + '%';
        if (barEl) barEl.style.width = cappedPct + '%';
        if (rpmEl) {
            let rpm = 1200;
            if (scene.phase === 'burnout') {
                rpm = 8900 + Math.floor(Math.random() * 400);
            } else if (scene.phase === 'zoom') {
                rpm = 4800 + Math.floor(Math.random() * 200);
            } else if (scene.phase === 'covered') {
                rpm = isAllPreloaded ? 1000 : (3400 + Math.floor(Math.random() * 350));
            }
            rpmEl.textContent = isAllPreloaded ? 'READY' : (rpm + ' RPM');
        }
        if (descEl) {
            descEl.textContent = 'Đã load ' + preloadedCount + '/' + totalPages + ' trang';
        }
    }

    function finishIntro() {
        if (isFinished) return;
        isFinished = true;

        const overlay = document.getElementById('supercarIntroOverlay');
        if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => {
                if (animFrameId) {
                    cancelAnimationFrame(animFrameId);
                    animFrameId = null;
                }
                overlay.style.display = 'none';
                overlay.remove();
            }, 550);
        }

        window.__kd_intro_finished = true;
        document.dispatchEvent(new CustomEvent('kd:intro_complete'));
    }

    function handleResize() {
        width = window.innerWidth;
        height = window.innerHeight;
        if (canvas) {
            canvas.width = width;
            canvas.height = height;
        }
        scene.groundY = height * 0.64;
        scene.carY = scene.groundY; // Bottom of tire is anchored exactly to groundY
        scene.cameraX = width / 2;
        scene.cameraY = height / 2;
    }

    function init() {
        const overlay = document.getElementById('supercarIntroOverlay');
        canvas = document.getElementById('supercarCanvas');
        if (!overlay || !canvas) return;

        // Prevent double init
        if (overlay.__kd_initialized) return;
        overlay.__kd_initialized = true;

        ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
        handleResize();
        window.addEventListener('resize', handleResize, { passive: true });

        // Click on overlay or press ESC / Space to skip instantly
        overlay.addEventListener('click', (e) => {
            e.preventDefault();
            finishIntro();
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' || e.key === ' ') {
                finishIntro();
            }
        });

        // Safety fallback timer: auto-close after 12s max if network hangs
        setTimeout(() => {
            if (!isFinished) finishIntro();
        }, 12000);

        // Start 60fps RAF loop immediately
        animFrameId = requestAnimationFrame(render);
    }

    // Public API exposed for spa_shell.js
    window.SupercarIntro = {
        init: init,
        onProgress: function (loaded, total) {
            preloadedCount = loaded;
            const pct = Math.floor((loaded / total) * 100);
            updateHud('Đang khởi tạo các trang...', pct);
            if (loaded >= total) {
                isAllPreloaded = true;
            }
        },
        onAllLoaded: function () {
            isAllPreloaded = true;
            preloadedCount = totalPages;
            updateHud('Tất cả các trang đã sẵn sàng', 100);
        },
        skip: finishIntro
    };

    // ── EXECUTE IMMEDIATELY ON PARSE IF ELEMENT EXISTS (0ms DELAY) ──
    if (document.getElementById('supercarIntroOverlay')) {
        init();
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

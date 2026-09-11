/**
 * ══════════════════════════════════════════════════════════════════════════
 * KDMES Smooth Input & Gliding Neon Caret Engine
 * Real-time text measurement, GPU-accelerated spring physics, auto-binding
 * ══════════════════════════════════════════════════════════════════════════
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.SmoothInput = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    let sharedMeasurer = null;

    function getOrCreateMeasurer() {
        if (!sharedMeasurer) {
            sharedMeasurer = document.createElement('span');
            sharedMeasurer.id = '__kdmes_smooth_caret_measurer__';
            sharedMeasurer.setAttribute('aria-hidden', 'true');
            sharedMeasurer.style.cssText = [
                'position: absolute !important',
                'top: -9999px !important',
                'left: -9999px !important',
                'visibility: hidden !important',
                'white-space: pre !important',
                'pointer-events: none !important',
                'display: inline-block !important',
                'margin: 0 !important',
                'padding: 0 !important',
                'border: none !important',
                'outline: none !important',
                'transform: none !important'
            ].join(';');
            (document.body || document.documentElement).appendChild(sharedMeasurer);
        }
        return sharedMeasurer;
    }

    function measurePrefixWidth(prefix, computedStyle, isPassword) {
        if (!prefix) return 0;
        const measurer = getOrCreateMeasurer();
        
        measurer.style.fontFamily = computedStyle.fontFamily;
        measurer.style.fontSize = computedStyle.fontSize;
        measurer.style.fontWeight = computedStyle.fontWeight;
        measurer.style.fontStyle = computedStyle.fontStyle;
        measurer.style.letterSpacing = computedStyle.letterSpacing;
        measurer.style.wordSpacing = computedStyle.wordSpacing;
        measurer.style.textTransform = computedStyle.textTransform;

        let textToMeasure = prefix;
        if (isPassword) {
            textToMeasure = '•'.repeat(prefix.length);
        }
        measurer.textContent = textToMeasure;
        return measurer.getBoundingClientRect().width;
    }

    class SmoothCaretController {
        constructor(input) {
            this.input = input;
            this.parent = input.parentElement;
            this.caret = null;
            this.idleTimer = null;
            this.isFocused = false;
            this._animFrameId = null;
            this._boundUpdate = this.updatePosition.bind(this);
            this._boundResetIdle = this.resetIdleTimer.bind(this);

            this.init();
        }

        init() {
            if (!this.parent || isExcludedInput(this.input)) return;

            // Ensure parent has relative/absolute positioning context
            const parentPos = window.getComputedStyle(this.parent).position;
            if (parentPos === 'static') {
                this.parent.style.position = 'relative';
            }

            // Create custom caret element
            this.caret = document.createElement('span');
            this.caret.className = 'smooth-input-caret';
            this.caret.setAttribute('aria-hidden', 'true');
            this.parent.appendChild(this.caret);

            this.input.classList.add('smooth-caret-enabled');

            this.bindEvents();

            // Check if already focused at initialization
            if (document.activeElement === this.input) {
                this.onFocus();
            }
        }

        bindEvents() {
            this.input.addEventListener('focus', () => this.onFocus(), { passive: true });
            this.input.addEventListener('blur', () => this.onBlur(), { passive: true });
            this.input.addEventListener('input', () => {
                this.updatePosition();
                this.resetIdleTimer();
            }, { passive: true });

            this.input.addEventListener('keydown', () => {
                this.scheduleUpdate();
                this.resetIdleTimer();
            }, { passive: true });

            this.input.addEventListener('keyup', () => {
                this.updatePosition();
                this.resetIdleTimer();
            }, { passive: true });

            this.input.addEventListener('click', () => {
                this.updatePosition();
                this.resetIdleTimer();
            }, { passive: true });

            this.input.addEventListener('select', () => this.updatePosition(), { passive: true });
            this.input.addEventListener('scroll', () => this.updatePosition(), { passive: true });

            // Document selection tracking for mouse drags
            document.addEventListener('selectionchange', () => {
                if (document.activeElement === this.input) {
                    this.updatePosition();
                }
            }, { passive: true });

            // Window resize handler
            window.addEventListener('resize', () => {
                if (this.isFocused) {
                    this.updatePosition();
                }
            }, { passive: true });
        }

        onFocus() {
            this.isFocused = true;
            if (this.caret) {
                this.caret.classList.add('is-visible');
                this.updatePosition(true);
                this.resetIdleTimer();
            }
        }

        onBlur() {
            this.isFocused = false;
            if (this.caret) {
                this.caret.classList.remove('is-visible', 'is-idle');
                this.caret.style.opacity = '0';
            }
            if (this.idleTimer) {
                clearTimeout(this.idleTimer);
                this.idleTimer = null;
            }
        }

        scheduleUpdate() {
            if (this._animFrameId) cancelAnimationFrame(this._animFrameId);
            this._animFrameId = requestAnimationFrame(() => {
                this.updatePosition();
            });
        }

        resetIdleTimer() {
            if (!this.caret) return;
            this.caret.classList.remove('is-idle');
            if (this.idleTimer) clearTimeout(this.idleTimer);

            if (this.isFocused) {
                this.idleTimer = setTimeout(() => {
                    if (this.isFocused && this.caret) {
                        this.caret.classList.add('is-idle');
                    }
                }, 480);
            }
        }

        updatePosition(isInitialFocus = false) {
            if (!this.isFocused || !this.caret) return;

            const input = this.input;
            const style = window.getComputedStyle(input);
            const paddingLeft = parseFloat(style.paddingLeft) || 0;
            const borderLeft = parseFloat(style.borderLeftWidth) || 0;
            const borderTop = parseFloat(style.borderTopWidth) || 0;
            const fontSize = parseFloat(style.fontSize) || 14;

            // Caret height proportionally sized to font
            const caretHeight = Math.max(16, Math.min(fontSize * 1.25, input.clientHeight - 6));
            const caretY = input.offsetTop + borderTop + (input.clientHeight - caretHeight) / 2;

            // Selection & Cursor position
            const selStart = input.selectionStart !== null ? input.selectionStart : input.value.length;
            const selEnd = input.selectionEnd !== null ? input.selectionEnd : selStart;
            const selDir = input.selectionDirection || 'forward';
            const activePos = selDir === 'backward' ? selStart : selEnd;

            // Compute prefix text width
            const prefix = input.value.slice(0, activePos);
            const isPassword = input.type === 'password';
            const prefixWidth = measurePrefixWidth(prefix, style, isPassword);

            // Compute caret X position taking scrollLeft into account
            const scrollLeft = input.scrollLeft || 0;
            const caretX = input.offsetLeft + borderLeft + paddingLeft + prefixWidth - scrollLeft;

            // Bounds clamping
            const minX = input.offsetLeft + borderLeft;
            const maxX = input.offsetLeft + borderLeft + input.clientWidth;

            if (caretX < minX - 4 || caretX > maxX + 4) {
                this.caret.style.opacity = '0';
            } else {
                this.caret.style.opacity = '1';
            }

            this.caret.style.height = `${caretHeight}px`;
            this.caret.style.transform = `translate3d(${caretX}px, ${caretY}px, 0) scaleY(1)`;
        }

        destroy() {
            if (this.caret && this.caret.parentElement) {
                this.caret.parentElement.removeChild(this.caret);
            }
            if (this.idleTimer) clearTimeout(this.idleTimer);
            if (this._animFrameId) cancelAnimationFrame(this._animFrameId);
            this.input.classList.remove('smooth-caret-enabled');
            delete this.input._smoothCaretInstance;
        }
    }

    function isExcludedInput(el) {
        if (!el) return true;
        if (el.matches) {
            if (el.matches('.numInput, .cur-year, [data-no-smooth-caret], .flatpickr-monthDropdown-months')) {
                return true;
            }
        }
        if (el.closest) {
            if (el.closest('.flatpickr-calendar, .numInputWrapper, .flatpickr-months, .flatpickr-current-month')) {
                return true;
            }
        }
        return false;
    }

    const INPUT_SELECTOR = 'input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]):not([type="color"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="hidden"]):not([data-no-smooth-caret]):not(.numInput):not(.cur-year)';

    function bindSmoothInput(el) {
        if (!el || el._smoothCaretInstance) return;
        if (isExcludedInput(el)) return;
        if (el.matches && el.matches(INPUT_SELECTOR)) {
            el._smoothCaretInstance = new SmoothCaretController(el);
        }
    }

    function initAllSmoothInputs() {
        const elements = document.querySelectorAll(INPUT_SELECTOR);
        for (let i = 0; i < elements.length; i++) {
            bindSmoothInput(elements[i]);
        }
    }

    // Set up MutationObserver to automatically bind dynamically inserted inputs
    function setupObserver() {
        if (typeof MutationObserver === 'undefined') return;

        const observer = new MutationObserver((mutations) => {
            for (let i = 0; i < mutations.length; i++) {
                const mutation = mutations[i];
                if (mutation.type === 'childList') {
                    for (let j = 0; j < mutation.addedNodes.length; j++) {
                        const node = mutation.addedNodes[j];
                        if (node.nodeType === 1) { // ELEMENT_NODE
                            if (node.matches && node.matches(INPUT_SELECTOR)) {
                                bindSmoothInput(node);
                            }
                            const nested = node.querySelectorAll ? node.querySelectorAll(INPUT_SELECTOR) : [];
                            for (let k = 0; k < nested.length; k++) {
                                bindSmoothInput(nested[k]);
                            }
                        }
                    }
                }
            }
        });

        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initAllSmoothInputs();
            setupObserver();
        });
    } else {
        initAllSmoothInputs();
        setupObserver();
    }

    return {
        init: initAllSmoothInputs,
        bind: bindSmoothInput,
        Controller: SmoothCaretController
    };
});

/**
 * KDMES TOOL — Account Modules Security Gatekeeper
 * Protects /create-kd-account (auto-blocking on load)
 * and /check-kd-account (on-demand modal with close button on sensitive edits)
 * Requires password 'Newhouse@120396'
 * Locks out & redirects to /main on 5 failed attempts with a 5s countdown
 */
(function initAccountSecurityGate() {
    const SECRET_KEY_PASSWORD = 'Newhouse@120396';
    const SESSION_KEY = 'kd_account_gate_unlocked';
    const ATTEMPTS_KEY = 'kd_account_gate_attempts';
    const MAX_ATTEMPTS = 5;
    const REDIRECT_DELAY_SEC = 5;

    let pendingUnlockCallback = null;

    function isAlreadyUnlocked() {
        try {
            return sessionStorage.getItem(SESSION_KEY) === 'true';
        } catch (e) {
            return false;
        }
    }

    function getFailedAttempts() {
        try {
            return parseInt(sessionStorage.getItem(ATTEMPTS_KEY) || '0', 10);
        } catch (e) {
            return 0;
        }
    }

    function setFailedAttempts(count) {
        try {
            sessionStorage.setItem(ATTEMPTS_KEY, String(count));
        } catch (e) {}
    }

    function setUnlocked() {
        try {
            sessionStorage.setItem(SESSION_KEY, 'true');
            sessionStorage.removeItem(ATTEMPTS_KEY);
        } catch (e) {}
    }

    function isAutoBlockPage() {
        // /create-kd-account is auto-blocking on page load
        return !!document.getElementById('singleAccountInput') || window.location.pathname.includes('create-kd-account');
    }

    function closeGateModal() {
        const overlay = document.getElementById('accountSecurityGateOverlay');
        const form = document.getElementById('securityGateForm');
        const input = document.getElementById('securityGateInput');
        const inputBox = document.getElementById('securityInputBox');
        const errorMsg = document.getElementById('securityGateErrorMsg');

        if (overlay) overlay.style.display = 'none';
        if (input) input.value = '';
        if (inputBox) inputBox.classList.remove('error');
        if (errorMsg && (!form || !form.dataset.locked)) errorMsg.style.display = 'none';
        pendingUnlockCallback = null;
    }

    // Expose helpers globally
    window.isAccountSecurityUnlocked = isAlreadyUnlocked;

    window.ensureAccountSecurityUnlocked = function (callback) {
        if (isAlreadyUnlocked()) {
            if (typeof callback === 'function') callback();
            return true;
        }

        pendingUnlockCallback = callback;

        const overlay = document.getElementById('accountSecurityGateOverlay');
        const closeBtn = document.getElementById('securityGateCloseBtn');
        const form = document.getElementById('securityGateForm');
        const input = document.getElementById('securityGateInput');
        const inputBox = document.getElementById('securityInputBox');
        const errorMsg = document.getElementById('securityGateErrorMsg');

        if (!overlay) {
            if (typeof callback === 'function') callback();
            return true;
        }

        if (closeBtn) {
            closeBtn.style.display = 'flex';
        }

        if (input) input.value = '';
        if (inputBox) inputBox.classList.remove('error');
        if (errorMsg && (!form || !form.dataset.locked)) errorMsg.style.display = 'none';

        overlay.style.opacity = '1';
        overlay.style.display = 'flex';

        setTimeout(() => {
            if (input && (!form || !form.dataset.locked)) {
                input.focus();
            }
        }, 150);

        return false;
    };

    // If already unlocked before DOMContentLoaded, dismiss immediately
    if (isAlreadyUnlocked()) {
        const overlay = document.getElementById('accountSecurityGateOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    document.addEventListener('DOMContentLoaded', () => {
        const overlay = document.getElementById('accountSecurityGateOverlay');
        const closeBtn = document.getElementById('securityGateCloseBtn');
        const form = document.getElementById('securityGateForm');
        const input = document.getElementById('securityGateInput');
        const inputBox = document.getElementById('securityInputBox');
        const errorMsg = document.getElementById('securityGateErrorMsg');
        const errorText = document.getElementById('securityGateErrorText');
        const submitBtn = document.getElementById('securityGateSubmitBtn');
        const toggleEye = document.getElementById('securityGateToggleEye');
        const eyeIcon = document.getElementById('securityEyeIcon');

        if (!overlay) return;

        const autoBlock = isAutoBlockPage();

        if (isAlreadyUnlocked()) {
            overlay.style.display = 'none';
            if (closeBtn) closeBtn.style.display = autoBlock ? 'none' : 'flex';
            return;
        }

        if (autoBlock) {
            // /create-kd-account: Show gate overlay on load, no close button
            if (closeBtn) closeBtn.style.display = 'none';
            overlay.style.display = 'flex';
        } else {
            // /check-kd-account: Hide on load, enable close button
            if (closeBtn) closeBtn.style.display = 'flex';
            overlay.style.display = 'none';
        }

        // Close button handler (for /check-kd-account)
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeGateModal();
            });
        }

        // Esc key closes modal when on-demand modal is open and close button is visible
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.style.display === 'flex') {
                if (closeBtn && closeBtn.style.display !== 'none' && !form?.dataset.locked) {
                    closeGateModal();
                }
            }
        });

        // Password visibility toggle
        if (toggleEye && input && eyeIcon) {
            toggleEye.addEventListener('click', (e) => {
                e.preventDefault();
                const isPwd = input.type === 'password';
                input.type = isPwd ? 'text' : 'password';
                eyeIcon.textContent = isPwd ? 'visibility_off' : 'visibility';
            });
        }

        // Clear error style on typing
        if (input) {
            input.addEventListener('input', () => {
                if (inputBox) inputBox.classList.remove('error');
                if (errorMsg && !form.dataset.locked) {
                    errorMsg.style.display = 'none';
                }
            });
        }

        // Check if user has already exceeded max failed attempts previously
        let failedAttempts = getFailedAttempts();
        if (failedAttempts >= MAX_ATTEMPTS) {
            // Disable input and button, hide error message when returning
            if (form) form.dataset.locked = 'true';
            if (input) input.disabled = true;
            if (submitBtn) submitBtn.disabled = true;
            if (errorMsg) errorMsg.style.display = 'none';
            return;
        }

        // Auto focus input if not locked (only on auto-block pages)
        if (autoBlock) {
            setTimeout(() => {
                if (input && !form.dataset.locked) {
                    input.focus();
                }
            }, 150);
        }

        function validatePassword() {
            if (form.dataset.locked) return;

            const enteredValue = input.value.trim();
            if (!enteredValue) {
                if (inputBox) {
                    inputBox.classList.remove('error');
                    void inputBox.offsetWidth;
                    inputBox.classList.add('error');
                }
                if (errorMsg) {
                    errorMsg.style.display = 'flex';
                    if (errorText) errorText.textContent = 'Vui lòng nhập mật khẩu';
                }
                input.focus();
                return;
            }

            if (enteredValue === SECRET_KEY_PASSWORD) {
                // SUCCESS: Correct Password
                setUnlocked();

                overlay.style.opacity = '0';
                overlay.style.transition = 'opacity 0.25s ease';
                setTimeout(() => {
                    overlay.style.display = 'none';
                    if (typeof pendingUnlockCallback === 'function') {
                        const cb = pendingUnlockCallback;
                        pendingUnlockCallback = null;
                        cb();
                    }
                }, 250);

                // Notify other iframes in SPA Shell
                if (window.top && window.top !== window) {
                    window.top.postMessage({ type: 'ACCOUNT_SECURITY_UNLOCKED' }, '*');
                }
            } else {
                // FAILED: Wrong Password
                failedAttempts++;
                setFailedAttempts(failedAttempts);

                if (inputBox) {
                    inputBox.classList.remove('error');
                    void inputBox.offsetWidth;
                    inputBox.classList.add('error');
                }

                if (failedAttempts >= MAX_ATTEMPTS) {
                    startLockoutCountdown(form, input, submitBtn, errorMsg, errorText);
                } else {
                    if (errorMsg) {
                        errorMsg.style.display = 'flex';
                        if (errorText) errorText.textContent = 'Sai mật khẩu';
                    }
                    input.select();
                    input.focus();
                }
            }
        }

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                validatePassword();
            });
        }
    });

    function startLockoutCountdown(form, input, submitBtn, errorMsg, errorText) {
        if (form) form.dataset.locked = 'true';
        if (input) input.disabled = true;
        if (submitBtn) submitBtn.disabled = true;
        if (errorMsg) errorMsg.style.display = 'flex';

        let remainingSec = REDIRECT_DELAY_SEC;
        if (errorText) {
            errorText.textContent = `Bạn đã nhập sai ${MAX_ATTEMPTS} lần, đang rời khỏi trong ${remainingSec} giây...`;
        }

        const countdownInterval = setInterval(() => {
            remainingSec--;
            if (remainingSec > 0) {
                if (errorText) {
                    errorText.textContent = `Bạn đã nhập sai ${MAX_ATTEMPTS} lần, đang rời khỏi trong ${remainingSec} giây...`;
                }
            } else {
                clearInterval(countdownInterval);
                if (errorMsg) {
                    errorMsg.style.display = 'none';
                }
                redirectToMain();
            }
        }, 1000);
    }

    function redirectToMain() {
        if (window.top && window.top.spaNavigator && typeof window.top.spaNavigator.switchTo === 'function') {
            window.top.spaNavigator.switchTo('/main', true);
        } else {
            (window.top || window).location.href = '/main';
        }
    }

    // Cross-frame unlock event receiver
    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'ACCOUNT_SECURITY_UNLOCKED') {
            setUnlocked();
            const overlay = document.getElementById('accountSecurityGateOverlay');
            if (overlay) {
                overlay.style.display = 'none';
            }
            if (typeof pendingUnlockCallback === 'function') {
                const cb = pendingUnlockCallback;
                pendingUnlockCallback = null;
                cb();
            }
        }
    });
})();

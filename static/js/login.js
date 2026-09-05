/**
 * KD MES CONTROL - Cyberpunk Glassmorphism Terminal Login
 */
document.addEventListener('DOMContentLoaded', function () {
    const terminalInput = document.getElementById('terminal-input');
    const terminalWrapper = document.getElementById('terminalWrapper');
    const loginCard = document.getElementById('loginCard');
    const output = document.getElementById('output');
    const liveClock = document.getElementById('liveClock');
    const btnQuickLogin = document.getElementById('btnQuickLogin');
    let isAuthenticating = false;

    // Helper: format current time as [HH:MM:SS]
    function getFormattedTime() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `[${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}]`;
    }

    // Initialize clock & initial timestamps
    function initClock() {
        function update() {
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
            if (liveClock) liveClock.textContent = timeStr;
        }
        update();
        setInterval(update, 1000);

        const currentTime = getFormattedTime();
        const initTime = document.getElementById('initTime');
        const authTime = document.getElementById('authTime');
        const hintTime = document.getElementById('hintTime');
        if (initTime) initTime.textContent = currentTime;
        if (authTime) authTime.textContent = currentTime;
        if (hintTime) hintTime.textContent = currentTime;
    }
    initClock();

    // Starfield Particle Canvas Animation
    function initStarfield() {
        const canvas = document.getElementById('loginStarfield');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let width = (canvas.width = window.innerWidth);
        let height = (canvas.height = window.innerHeight);

        const particles = [];
        const count = Math.min(80, Math.floor((width * height) / 12000));

        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                radius: Math.random() * 1.6 + 0.4,
                vx: (Math.random() - 0.5) * 0.35,
                vy: (Math.random() - 0.5) * 0.35,
                alpha: Math.random() * 0.7 + 0.2,
                color: Math.random() > 0.4 ? '#3dd5c0' : '#38bdf8'
            });
        }

        function render() {
            ctx.clearRect(0, 0, width, height);

            particles.forEach((p) => {
                p.x += p.vx;
                p.y += p.vy;

                if (p.x < 0) p.x = width;
                if (p.x > width) p.x = 0;
                if (p.y < 0) p.y = height;
                if (p.y > height) p.y = 0;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.alpha;
                ctx.shadowBlur = 8;
                ctx.shadowColor = p.color;
                ctx.fill();
            });

            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
            requestAnimationFrame(render);
        }
        render();

        window.addEventListener('resize', () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        });
    }
    initStarfield();

    // Helper: append log line to terminal
    function appendLog(tagType, tagText, message, isMsgClass = '') {
        const line = document.createElement('div');
        line.className = 'log-line';

        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        timeSpan.textContent = getFormattedTime();

        const tagSpan = document.createElement('span');
        tagSpan.className = `log-tag ${tagType}`;
        tagSpan.textContent = tagText;

        const msgSpan = document.createElement('span');
        msgSpan.className = `log-msg ${isMsgClass}`;
        msgSpan.textContent = message;

        line.appendChild(timeSpan);
        line.appendChild(tagSpan);
        line.appendChild(msgSpan);
        output.appendChild(line);

        output.scrollTop = output.scrollHeight;
    }

    // Helper: append command echo
    function appendCommandEcho(cmd) {
        const line = document.createElement('div');
        line.className = 'log-line';

        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        timeSpan.textContent = getFormattedTime();

        const cmdSpan = document.createElement('span');
        cmdSpan.className = 'log-msg';
        cmdSpan.style.color = '#fbbf24';
        cmdSpan.innerHTML = `<span style="color:#3dd5c0;font-weight:700;">root@kdmes:~$</span> ${cmd}`;

        line.appendChild(timeSpan);
        line.appendChild(cmdSpan);
        output.appendChild(line);

        output.scrollTop = output.scrollHeight;
    }

    // Trigger terminal shake on error
    function triggerShake() {
        if (!terminalWrapper) return;
        terminalWrapper.classList.remove('shake');
        void terminalWrapper.offsetWidth; // trigger reflow
        terminalWrapper.classList.add('shake');
        setTimeout(() => {
            terminalWrapper.classList.remove('shake');
        }, 500);
    }

    // Process authentication
    async function executeAuthentication() {
        if (isAuthenticating) return;
        isAuthenticating = true;

        if (terminalInput) {
            terminalInput.disabled = true;
            terminalInput.value = '';
        }
        if (btnQuickLogin) {
            btnQuickLogin.disabled = true;
            btnQuickLogin.style.opacity = '0.6';
        }

        appendLog('auth', 'AUTH', 'Authenticating credentials for operator [thsang]...', 'warn');
        appendLog('system', 'MES', 'Establishing secure handshake with 198.1.10.85:8810...', 'highlight');

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: 'thsang',
                    password: 'thsang'
                })
            });

            const result = await response.json();

            if (result.success) {
                appendLog('success', 'SUCCESS', '✓ Access Granted! Authentication verified.', 'succ');
                appendLog('system', 'WORKSPACE', '🚀 Initializing MES Control Center... Redirecting.', 'highlight');

                if (loginCard) {
                    loginCard.classList.add('auth-success');
                }

                setTimeout(() => {
                    window.location.href = '/main';
                }, 850);
            } else {
                appendLog('error', 'ERROR', `✗ ${result.message || 'Xác thực không thành công'}`, 'err');
                appendLog('system', 'HINT', 'Vui lòng kiểm tra lại hệ thống hoặc nhập 1 để thử lại.');
                triggerShake();
                resetInput();
            }
        } catch (error) {
            appendLog('error', 'ERROR', '✗ Lỗi kết nối mạng đến máy chủ MES. Vui lòng thử lại.', 'err');
            triggerShake();
            resetInput();
        }
    }

    function resetInput() {
        isAuthenticating = false;
        if (terminalInput) {
            terminalInput.disabled = false;
            terminalInput.focus();
        }
        if (btnQuickLogin) {
            btnQuickLogin.disabled = false;
            btnQuickLogin.style.opacity = '1';
        }
    }

    // Handle command submission
    function handleCommandSubmit(rawVal) {
        const inputValue = (rawVal || '').trim();
        appendCommandEcho(inputValue || '');

        if (terminalInput) terminalInput.value = '';

        if (inputValue === '1') {
            executeAuthentication();
        } else {
            appendLog('error', 'ERROR', `✗ Lệnh không hợp lệ: "${inputValue}"`, 'err');
            appendLog('system', 'HINT', 'Gõ phím 1 rồi nhấn Enter (hoặc bấm nút Đăng nhập)', 'highlight');
            triggerShake();
            if (terminalInput) terminalInput.focus();
        }
    }

    // Keypress handler on Enter
    if (terminalInput) {
        terminalInput.setAttribute('autocomplete', 'off');
        terminalInput.setAttribute('autocorrect', 'off');
        terminalInput.setAttribute('autocapitalize', 'off');
        terminalInput.setAttribute('spellcheck', 'false');
        terminalInput.setAttribute('data-lpignore', 'true');
        terminalInput.setAttribute('data-form-type', 'other');
        terminalInput.setAttribute('aria-autocomplete', 'none');

        terminalInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleCommandSubmit(terminalInput.value);
            }
        });

        terminalInput.addEventListener('focus', () => {
            if (terminalWrapper) terminalWrapper.classList.add('focused');
        });

        terminalInput.addEventListener('blur', () => {
            if (terminalWrapper) terminalWrapper.classList.remove('focused');
        });
    }

    // Click quick login button
    if (btnQuickLogin) {
        btnQuickLogin.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isAuthenticating) {
                handleCommandSubmit('1');
            }
        });
    }

    // Clicking terminal focuses input
    if (terminalWrapper) {
        terminalWrapper.addEventListener('click', (e) => {
            if (e.target.closest('#btnQuickLogin')) return;
            if (terminalInput && !terminalInput.disabled) {
                terminalInput.focus();
            }
        });
    }

    // Auto-focus on load
    if (terminalInput) {
        setTimeout(() => terminalInput.focus(), 100);
    }
});
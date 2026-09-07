document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const dropdownButtons = sidebar.querySelectorAll('.dropdown-btn');

    document.addEventListener('sidebar:logout', () => {
        handleLogout();
    });

    dropdownButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const subMenu = btn.nextElementSibling;

            if (!subMenu) return;

            if (!subMenu.classList.contains('show')) {
                closeAllSubMenus();
            }

            subMenu.classList.toggle('show');
            btn.classList.toggle('rotate');

            if (sidebar.classList.contains('close')) {
                sidebar.classList.remove('close');
                toggleButton?.classList.remove('rotate');
            }
        });
    });

    // ── Table Density Mode Management (Compact / Comfortable) ──
    const DENSITY_STORAGE_KEY = 'kd_table_density';

    function applyDensity(density, notifyIframes = true) {
        const isCompact = (density === 'compact');
        document.body.classList.toggle('density-compact', isCompact);

        const densityIcon = document.getElementById('densityIcon');
        const densityLabel = document.getElementById('densityLabelText');

        if (densityIcon) {
            densityIcon.textContent = isCompact ? 'density_small' : 'density_medium';
        }
        if (densityLabel) {
            densityLabel.textContent = isCompact ? 'Mật độ: Thu gọn' : 'Mật độ: Thoáng';
        }

        // Đồng bộ tới tất cả iframes (trong SPA Shell)
        if (notifyIframes) {
            document.querySelectorAll('iframe').forEach(frame => {
                try {
                    frame.contentDocument?.body?.classList?.toggle('density-compact', isCompact);
                } catch (e) {}
            });
        }
    }

    function toggleDensity() {
        const current = localStorage.getItem(DENSITY_STORAGE_KEY) === 'compact' ? 'compact' : 'comfortable';
        const next = (current === 'compact') ? 'comfortable' : 'compact';
        localStorage.setItem(DENSITY_STORAGE_KEY, next);
        applyDensity(next);

        // Hiển thị toast thông báo
        if (typeof showToast === 'function') {
            showToast(next === 'compact' ? 'Đã bật chế độ thu gọn bảng (Compact)' : 'Đã chuyển sang chế độ thoáng (Comfortable)', 'info');
        }
    }

    // Khởi tạo trạng thái Density từ localStorage
    const savedDensity = localStorage.getItem(DENSITY_STORAGE_KEY) || 'comfortable';
    applyDensity(savedDensity);

    // Lắng nghe sự kiện đồng bộ giữa các Tab/Cửa sổ
    window.addEventListener('storage', (e) => {
        if (e.key === DENSITY_STORAGE_KEY && e.newValue) {
            applyDensity(e.newValue);
        }
    });

    document.addEventListener('click', (e) => {
        // Density Mode Toggle
        if (e.target.closest('#densityToggleMenuItem')) {
            toggleDensity();
            return;
        }

        // Logout
        if (e.target.closest('#logoutMenuItem')) {
            document.dispatchEvent(new Event('sidebar:logout'));
            return;
        }

        // Tools actions
        const actionEl = e.target.closest('[data-action]');
        if (actionEl) {
            document.dispatchEvent(
                new CustomEvent('sidebar:action', {
                    detail: actionEl.dataset.action
                })
            );
        }
    });

    function closeAllSubMenus() {
        sidebar.querySelectorAll('.sub-menu.show').forEach(menu => {
            menu.classList.remove('show');
            menu.previousElementSibling?.classList.remove('rotate');
        });
    }

    (function highlightActiveSidebarItem() {
        const currentPath = window.location.pathname;

        const sidebarLinks = document.querySelectorAll('#sidebar a[href]');

        sidebarLinks.forEach(link => {
            const linkPath = new URL(link.href, window.location.origin).pathname;

            if (currentPath === linkPath) {
                const li = link.closest('li');
                if (li) {
                    li.classList.add('active');

                    // nếu nằm trong submenu → mở menu cha
                    const subMenu = li.closest('.sub-menu');
                    if (subMenu) {
                        subMenu.classList.add('show');
                        const parentBtn = subMenu.previousElementSibling;
                        parentBtn?.classList.add('rotate');
                    }
                }
            }
        });
    })();

});

/**
 * Bảng tra cứu ngày Tết Nguyên Đán (Mùng 1 Âm lịch) theo Dương lịch
 */
function getLunarNewYearDate(year) {
    const tetDates = {
        2025: new Date(2025, 0, 29),  // 29/01/2025 - Tết Ất Tỵ
        2026: new Date(2026, 1, 17),  // 17/02/2026 - Tết Bính Ngọ
        2027: new Date(2027, 1, 6),   // 06/02/2027 - Tết Đinh Mùi
        2028: new Date(2028, 0, 26),  // 26/01/2028 - Tết Mậu Thân
        2029: new Date(2029, 1, 13),  // 13/02/2029 - Tết Kỷ Dậu
        2030: new Date(2030, 1, 3),   // 03/02/2030 - Tết Canh Tuất
        2031: new Date(2031, 0, 23),  // 23/01/2031 - Tết Tân Hợi
        2032: new Date(2032, 1, 11),  // 11/02/2032 - Tết Nhâm Tý
        2033: new Date(2033, 0, 31),  // 31/01/2033 - Tết Quý Sửu
        2034: new Date(2034, 1, 19),  // 19/02/2034 - Tết Giáp Dần
        2035: new Date(2035, 1, 8),   // 08/02/2035 - Tết Ất Mão
    };
    return tetDates[year] || null;
}

/**
 * Tính Can Chi và Linh vật cho năm Tết
 */
function getTetCanChiInfo(year) {
    const CAN = ["Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý"];
    const CHI = ["Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi", "Thân", "Dậu", "Tuất", "Hợi"];
    const ZODIAC_EMOJI = {
        "Tý": "🐭", "Sửu": "🐂", "Dần": "🐅", "Mão": "🐱",
        "Thìn": "🐲", "Tỵ": "🐍", "Ngọ": "🐎", "Mùi": "🐐",
        "Thân": "🐒", "Dậu": "🐓", "Tuất": "🐕", "Hợi": "🐖"
    };

    const canIndex = ((year - 4) % 10 + 10) % 10;
    const chiIndex = ((year - 4) % 12 + 12) % 12;

    const canName = CAN[canIndex];
    const chiName = CHI[chiIndex];
    const emoji = ZODIAC_EMOJI[chiName] || "🧧";

    return {
        can: canName,
        chi: chiName,
        fullName: `Tết ${canName} ${chiName} ${year}`,
        shortTitle: `XUÂN ${canName.toUpperCase()} ${chiName.toUpperCase()} ${year}`,
        emoji: emoji
    };
}

/**
 * Đếm số thứ 2 và số ngày còn lại đến Tết Nguyên Đán
 */
function countMondaysUntilTet() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let currentYear = today.getFullYear();
    let tetDate = getLunarNewYearDate(currentYear);

    // Nếu Tết năm nay đã qua, tính tiếp Tết năm sau
    if (!tetDate || today > tetDate) {
        currentYear++;
        tetDate = getLunarNewYearDate(currentYear);
    }

    if (!tetDate) {
        return { count: 0, daysRemaining: 0, tetDate: null, canChi: null };
    }

    // Tính số ngày còn lại
    const diffMs = tetDate.getTime() - today.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    // Đếm số ngày Thứ Hai
    let mondayCount = 0;
    let currentDate = new Date(today);

    while (currentDate <= tetDate) {
        if (currentDate.getDay() === 1) {
            mondayCount++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    const canChi = getTetCanChiInfo(currentYear);

    return {
        count: mondayCount,
        daysRemaining: daysRemaining,
        tetDate: tetDate,
        canChi: canChi
    };
}

/**
 * Cập nhật giao diện đếm ngược Tết
 */
function updateTetCountdown() {
    const result = countMondaysUntilTet();
    const mondayCountEl = document.getElementById('mondayCount');
    const daysCountEl = document.getElementById('daysCount');
    const tetYearTitleEl = document.getElementById('tetYearTitle');
    const tetSloganEl = document.getElementById('tetSlogan');
    const tetDateEl = document.getElementById('tetDate');

    if (!mondayCountEl || !tetDateEl) return;

    if (result.daysRemaining === 0) {
        mondayCountEl.textContent = '0';
        if (daysCountEl) daysCountEl.textContent = 'MÙNG 1 TẾT! 🎊';
        if (tetYearTitleEl) tetYearTitleEl.textContent = 'CHÚC MỪNG NĂM MỚI';
        if (tetSloganEl) tetSloganEl.textContent = 'Vạn Sự Như Ý - An Khang Thịnh Vượng! 🧧';
        tetDateEl.textContent = '🎊 Chúc mừng Tết Nguyên Đán! 🎊';
    } else {
        mondayCountEl.textContent = result.count;
        if (daysCountEl) daysCountEl.textContent = `còn ${result.daysRemaining} ngày`;

        if (result.canChi) {
            if (tetYearTitleEl) {
                tetYearTitleEl.textContent = result.canChi.shortTitle;
            }
        }

        if (tetSloganEl) {
            if (result.daysRemaining <= 15) {
                tetSloganEl.textContent = 'Tết cận kề rồi, về quê thôi! 🌸🧧';
            } else if (result.daysRemaining <= 45) {
                tetSloganEl.textContent = 'Sắp được ăn bánh chưng rồi! 🧧🎋';
            } else {
                tetSloganEl.textContent = 'cái thứ 2 nữa là tới Tết!';
            }
        }

        if (result.tetDate && result.canChi) {
            const day = String(result.tetDate.getDate()).padStart(2, '0');
            const month = String(result.tetDate.getMonth() + 1).padStart(2, '0');
            const year = result.tetDate.getFullYear();
            tetDateEl.textContent = `🌸 Mùng 1: ${day}/${month}/${year} ${result.canChi.emoji}`;
        }
    }
}

/**
 * Tạo hiệu ứng pháo hoa Tết rực rỡ nhiều màu
 */
function createTetFirework(centerX, centerY) {
    const box = document.getElementById('tetCountdown');
    if (!box) return;

    const colors = [
        '#ffd700', // Vàng kim
        '#ff3b30', // Đỏ son
        '#ff9500', // Cam lửa
        '#ff2d55', // Hồng hoa đào
        '#3dd5c0', // Xanh ngọc
        '#ffe600', // Vàng hoa mai
        '#ffffff'  // Tia sáng trắng
    ];

    const count = 6;
    for (let i = 0; i < count; i++) {
        const firework = document.createElement('div');
        firework.className = 'firework';
        firework.style.left = centerX + 'px';
        firework.style.top = centerY + 'px';

        const color = colors[Math.floor(Math.random() * colors.length)];
        firework.style.backgroundColor = color;
        firework.style.boxShadow = `0 0 6px ${color}, 0 0 10px ${color}`;

        const angle = (Math.PI * 2 / count) * i + (Math.random() * 0.4 - 0.2);
        const distance = 25 + Math.random() * 35;
        firework.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
        firework.style.setProperty('--y', `${Math.sin(angle) * distance}px`);

        box.appendChild(firework);
        setTimeout(() => firework.remove(), 1400);
    }
}

/**
 * Khởi tạo Tết Countdown
 */
function initTetCountdown() {
    updateTetCountdown();

    // Cập nhật mỗi ngày lúc nửa đêm
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timeUntilMidnight = tomorrow - now;

    setTimeout(() => {
        updateTetCountdown();
        setInterval(updateTetCountdown, 24 * 60 * 60 * 1000);
    }, timeUntilMidnight);

    // Hiệu ứng pháo hoa khi HOVER & CLICK
    const tetBox = document.getElementById('tetCountdown');
    if (tetBox) {
        let fireworkInterval = null;

        tetBox.addEventListener('mouseenter', () => {
            const rect = tetBox.getBoundingClientRect();

            // Nổ pháo hoa chào đón
            for (let i = 0; i < 4; i++) {
                setTimeout(() => {
                    const randomX = Math.random() * rect.width;
                    const randomY = Math.random() * rect.height;
                    createTetFirework(randomX, randomY);
                }, i * 120);
            }

            // Tiếp tục tạo pháo hoa trong lúc hover
            fireworkInterval = setInterval(() => {
                const randomX = Math.random() * rect.width;
                const randomY = Math.random() * rect.height;
                createTetFirework(randomX, randomY);
            }, 400);
        });

        tetBox.addEventListener('mouseleave', () => {
            if (fireworkInterval) {
                clearInterval(fireworkInterval);
                fireworkInterval = null;
            }
        });

        tetBox.addEventListener('click', (e) => {
            const rect = tetBox.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    createTetFirework(clickX, clickY);
                }, i * 80);
            }
        });
    }
}

// Khởi động khi DOM sẵn sàng
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTetCountdown);
} else {
    initTetCountdown();
}
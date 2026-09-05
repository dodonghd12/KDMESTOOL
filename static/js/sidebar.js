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

    document.addEventListener('click', (e) => {
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
 * Tính ngày Tết Nguyên Đán (âm lịch)
 * Bảng tra cứu cho các năm đến 2035
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
 * Đếm số thứ 2 từ ngày hiện tại đến ngày Tết
 */
function countMondaysUntilTet() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let currentYear = today.getFullYear();
    let tetDate = getLunarNewYearDate(currentYear);
    
    // Nếu Tết năm nay đã qua, tính Tết năm sau
    if (!tetDate || today > tetDate) {
        currentYear++;
        tetDate = getLunarNewYearDate(currentYear);
    }
    
    if (!tetDate) {
        return { count: 0, tetDate: null };
    }
    
    // Đếm số thứ 2
    let mondayCount = 0;
    let currentDate = new Date(today);
    
    while (currentDate <= tetDate) {
        if (currentDate.getDay() === 1) {
            mondayCount++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return { count: mondayCount, tetDate: tetDate };
}

/**
 * Định dạng tên Tết theo Can Chi
 * Sửa lại công thức tính Can Chi cho chính xác
 */
function getTetName(year) {
    // Can bắt đầu từ Giáp = 4 (năm 1984, 1994, 2004, 2014, 2024...)
    // Chi bắt đầu từ Tý = 4 (năm 1984, 1996, 2008, 2020...)
    const can = ["Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý"];
    const chi = ["Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi", "Thân", "Dậu", "Tuất", "Hợi"];
    
    // Công thức tính Can: (năm - 4) % 10
    // Công thức tính Chi: (năm - 4) % 12
    const canIndex = (year - 4) % 10;
    const chiIndex = (year - 4) % 12;
    
    return `Tết ${can[canIndex]} ${chi[chiIndex]} ${year}`;
}

/**
 * Cập nhật hiển thị countdown
 */
function updateTetCountdown() {
    const result = countMondaysUntilTet();
    const mondayCountEl = document.getElementById('mondayCount');
    const tetDateEl = document.getElementById('tetDate');
    
    if (!mondayCountEl || !tetDateEl) return;
    
    if (result.count === 0) {
        mondayCountEl.textContent = '0';
        tetDateEl.textContent = 'Chúc mừng năm mới! 🎊🎊🎊';
    } else {
        mondayCountEl.textContent = result.count;
        
        if (result.tetDate) {
            const year = result.tetDate.getFullYear();
            const day = result.tetDate.getDate();
            const month = result.tetDate.getMonth() + 1;
            tetDateEl.textContent = `${getTetName(year)} - ${day}/${month}/${year}`;
        }
    }
}

/**
 * Tạo hiệu ứng pháo hoa
 */
function createTetFirework(centerX, centerY) {
    const box = document.getElementById('tetCountdown');
    if (!box) return;
    
    const firework = document.createElement('div');
    firework.className = 'firework';
    firework.style.left = centerX + 'px';
    firework.style.top = centerY + 'px';
    
    const angle = Math.random() * Math.PI * 2;
    const distance = 30 + Math.random() * 30;
    firework.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
    firework.style.setProperty('--y', `${Math.sin(angle) * distance}px`);
    
    box.appendChild(firework);
    
    setTimeout(() => firework.remove(), 1500);
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
    
    // Thêm hiệu ứng pháo hoa khi HOVER
    const tetBox = document.getElementById('tetCountdown');
    if (tetBox) {
        let fireworkInterval = null;
        
        tetBox.addEventListener('mouseenter', (e) => {
            const rect = tetBox.getBoundingClientRect();
            
            // Tạo pháo hoa ngay lập tức
            for (let i = 0; i < 8; i++) {
                setTimeout(() => {
                    const randomX = Math.random() * rect.width;
                    const randomY = Math.random() * rect.height;
                    createTetFirework(randomX, randomY);
                }, i * 50);
            }
            
            // Tiếp tục tạo pháo hoa trong khi hover
            fireworkInterval = setInterval(() => {
                for (let i = 0; i < 3; i++) {
                    const randomX = Math.random() * rect.width;
                    const randomY = Math.random() * rect.height;
                    createTetFirework(randomX, randomY);
                }
            }, 500);
        });
        
        tetBox.addEventListener('mouseleave', () => {
            // Dừng tạo pháo hoa khi không hover
            if (fireworkInterval) {
                clearInterval(fireworkInterval);
                fireworkInterval = null;
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
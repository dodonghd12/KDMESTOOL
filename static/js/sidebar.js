document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const toggleButton = document.getElementById('toggle-btn')
    const dropdownButtons = sidebar.querySelectorAll('.dropdown-btn')

    toggleButton?.addEventListener('click', () => {
        sidebar.classList.toggle('close')
        toggleButton.classList.toggle('rotate')
        closeAllSubMenus()
    })

    document.addEventListener('sidebar:about', () => {
        showAbout();
    });

    document.addEventListener('sidebar:logout', () => {
        handleLogout();
    });

    dropdownButtons.forEach(btn => {
        if (btn.id === 'aboutBtn') return;

        btn.addEventListener('click', () => {
            const subMenu = btn.nextElementSibling

            if (!subMenu) return;

            if (!subMenu.classList.contains('show')) {
                closeAllSubMenus()
            }

            subMenu.classList.toggle('show')
            btn.classList.toggle('rotate')

            if (sidebar.classList.contains('close')) {
                sidebar.classList.remove('close')
                toggleButton.classList.remove('rotate')
            }
        })
    })

    document.addEventListener('click', (e) => {
        // About
        if (e.target.closest('#aboutBtn')) {
            document.dispatchEvent(new Event('sidebar:about'));
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
            menu.classList.remove('show')
            menu.previousElementSibling.classList.remove('rotate')
        })
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

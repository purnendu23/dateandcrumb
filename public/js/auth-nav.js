/* Auth nav — updates the #auth-nav element based on login state */
(async function() {
    const authNav = document.getElementById('auth-nav');
    if (!authNav) return;

    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();

        if (data.user) {
              // Insert "Orders" link before the auth-nav item (only if not already present)
            const authNavParent = authNav.parentElement;
            const existingOrders = authNavParent && authNavParent.querySelector('a[href="/orders.html"]');
            if (authNavParent && !existingOrders) {
                const ordersLi = document.createElement('li');
                ordersLi.innerHTML = '<a href="/orders.html">Orders</a>';
                authNavParent.insertBefore(ordersLi, authNav);
            }

            const displayName = escapeHTMLAuth(data.user.name || data.user.email);
            if (data.user.is_admin) {
                authNav.innerHTML = `
                    <a href="/admin/" class="nav-user">${displayName}</a>
                    <a href="#" id="logout-link">Logout</a>
                `;
            } else {
                authNav.innerHTML = `
                    <a href="/profile.html" class="nav-user">${displayName}</a>
                    <a href="#" id="logout-link">Logout</a>
                `;
            }
            document.getElementById('logout-link').addEventListener('click', async (e) => {
                e.preventDefault();
                await fetch('/api/auth/logout', { method: 'POST' });
                Cart.setUser(null);
                window.location.reload();
            });
        } else {
            authNav.innerHTML = '<a href="/login.html">Login</a>';
        }
    } catch (err) {
        authNav.innerHTML = '<a href="/login.html">Login</a>';
    }

    function escapeHTMLAuth(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
})();

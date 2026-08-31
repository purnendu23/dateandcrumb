/* Auth nav — updates the #auth-nav element based on login state */
(async function() {
    if (!window.location.pathname.startsWith('/admin')) {
        const messages = [
            'Create an account and enjoy 10% off your first order',
            'SHIPPING $4.99 FLAT RATE | FREE SHIPPING ON $50+',
        ];
        const stripe = document.createElement('div');
        stripe.className = 'global-top-stripe';
        stripe.innerHTML = '<div class="global-top-stripe-text"></div>';
        document.body.insertBefore(stripe, document.body.firstChild);
        document.body.classList.add('has-global-top-stripe');

        const textNode = stripe.querySelector('.global-top-stripe-text');
        let idx = 0;
        textNode.textContent = messages[idx];
        setInterval(() => {
            idx = (idx + 1) % messages.length;
            textNode.style.opacity = '0';
            setTimeout(() => {
                textNode.textContent = messages[idx];
                textNode.style.opacity = '1';
            }, 140);
        }, 5000);
    }

    const authNav = document.getElementById('auth-nav');
    if (!authNav) return;

    try {
        let data = await (await fetch('/api/auth/me')).json();
        let logoutEndpoint = '/api/auth/logout';
        let isEnterpriseSession = false;

        if (!data.user) {
            const adminRes = await fetch('/api/admin/auth/me');
            const adminData = await adminRes.json();
            if (adminData.user) {
                data = adminData;
                logoutEndpoint = '/api/admin/auth/logout';
                isEnterpriseSession = true;
            }
        }

        if (data.user) {
              // Insert "Orders" link before the auth-nav item (only if not already present)
            const authNavParent = authNav.parentElement;
            const existingOrders = authNavParent && authNavParent.querySelector('a[href="/orders.html"]');
            if (authNavParent && !existingOrders && !isEnterpriseSession) {
                const ordersLi = document.createElement('li');
                ordersLi.innerHTML = '<a href="/orders.html">Orders</a>';
                authNavParent.insertBefore(ordersLi, authNav);
            }

            const displayName = escapeHTMLAuth(data.user.name || data.user.email);
            if (isEnterpriseSession && data.user.is_admin) {
                authNav.innerHTML = `
                    <a href="/admin/" class="nav-user">${displayName}</a>
                    <a href="#" id="logout-link">Logout</a>
                `;
            } else if (isEnterpriseSession) {
                authNav.innerHTML = `
                    <a href="/admin/employee.html" class="nav-user">${displayName}</a>
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
                await fetch(logoutEndpoint, { method: 'POST' });
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

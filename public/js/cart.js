/* Cart utility — shared across all pages */
const Cart = {
    _userId: null,

    get KEY() {
        return this._userId ? `bakehouse_cart_${this._userId}` : 'bakehouse_cart_guest';
    },

    setUser(userId) {
        this._userId = userId;

        // Clear guest cart when a user logs in so it doesn't leak between users
        if (userId) {
            localStorage.removeItem('bakehouse_cart_guest');
        }

        this.updateBadge();
    },

    getItems() {
        try {
            return JSON.parse(localStorage.getItem(this.KEY)) || [];
        } catch {
            return [];
        }
    },

    save(items) {
        localStorage.setItem(this.KEY, JSON.stringify(items));
        this.updateBadge();
    },

    addItem(product, quantity = 1) {
        const items = this.getItems();
        const existing = items.find(i => i.product_id === product.id);
        if (existing) {
            existing.quantity += quantity;
        } else {
            items.push({
                product_id: product.id,
                name: product.name,
                price: product.price,
                quantity
            });
        }
        this.save(items);
    },

    updateQuantity(productId, quantity) {
        let items = this.getItems();
        if (quantity <= 0) {
            items = items.filter(i => i.product_id !== productId);
        } else {
            const item = items.find(i => i.product_id === productId);
            if (item) item.quantity = quantity;
        }
        this.save(items);
    },

    removeItem(productId) {
        const items = this.getItems().filter(i => i.product_id !== productId);
        this.save(items);
    },

    clear() {
        localStorage.removeItem(this.KEY);
        this.updateBadge();
    },

    getTotal() {
        return this.getItems().reduce((sum, i) => sum + i.price * i.quantity, 0);
    },

    getCount() {
        return this.getItems().reduce((sum, i) => sum + i.quantity, 0);
    },

    updateBadge() {
        const badge = document.getElementById('cart-count');
        if (badge) badge.textContent = this.getCount();
    }
};

// Initialize cart user context and update badge on every page load
Cart._ready = new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', async () => {
        // Migrate old shared cart key
        const oldData = localStorage.getItem('bakehouse_cart');
        if (oldData) {
            localStorage.setItem('bakehouse_cart_guest', oldData);
            localStorage.removeItem('bakehouse_cart');
        }

        try {
            const res = await fetch('/api/auth/me');
            const data = await res.json();
            Cart.setUser(data.user ? data.user.id : null);
        } catch {
            Cart.setUser(null);
        }
        resolve();
    });
});

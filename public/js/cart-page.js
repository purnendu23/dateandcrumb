/* Cart page — shows full cart with quantities, remove, total */
document.addEventListener('DOMContentLoaded', async () => {
    await Cart._ready;
    renderCart();
});

function renderCart() {
    const items = Cart.getItems();
    const container = document.getElementById('cart-contents');
    const summary = document.getElementById('cart-summary');
    const totalEl = document.getElementById('cart-total');

    if (items.length === 0) {
        container.innerHTML = `
            <div class="cart-empty">
                <p>Your cart is empty.</p>
                <a href="/products.html" class="btn btn-primary">Browse Products</a>
            </div>
        `;
        summary.style.display = 'none';
        return;
    }

    container.innerHTML = `
        <table class="cart-table">
            <thead>
                <tr>
                    <th>Product</th>
                    <th>Price</th>
                    <th>Quantity</th>
                    <th>Subtotal</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => `
                    <tr>
                        <td class="item-name">${escapeHTML(item.name)}</td>
                        <td>$${item.price.toFixed(2)}</td>
                        <td>
                            <input type="number" value="${item.quantity}" min="1" max="99"
                                   onchange="updateQty(${item.product_id}, this.value)">
                        </td>
                        <td>$${(item.price * item.quantity).toFixed(2)}</td>
                        <td>
                            <button class="btn btn-danger btn-sm" onclick="removeItem(${item.product_id})">Remove</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    totalEl.textContent = Cart.getTotal().toFixed(2);
    summary.style.display = 'flex';
}

function updateQty(productId, value) {
    const qty = parseInt(value, 10);
    if (qty > 0) {
        Cart.updateQuantity(productId, qty);
    } else {
        Cart.removeItem(productId);
    }
    renderCart();
}

function removeItem(productId) {
    Cart.removeItem(productId);
    renderCart();
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

window.updateQty = updateQty;
window.removeItem = removeItem;

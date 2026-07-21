/* Product detail page — Amrita-style layout */
document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');
    const container = document.getElementById('product-detail');

    if (!productId) {
        container.innerHTML = '<p>Product not found.</p>';
        return;
    }

    try {
        const res = await fetch(`/api/products/${encodeURIComponent(productId)}`);
        if (!res.ok) throw new Error('Not found');
        const product = await res.json();

        document.title = `${product.name} — Bakehouse`;


        let images = [];
        try { images = JSON.parse(product.image_url); } catch (e) { images = [product.image_url]; }

        // Build thumbnail strip
        const thumbsHTML = images.map((img, i) =>
            `<img src="${escapeHTML(img)}" alt="Image ${i + 1}" data-index="${i}" class="${i === 0 ? 'active' : ''}">`
        ).join('');

        // Build accordion sections
        let accordionHTML = '';
        if (product.ingredients) {
            accordionHTML += `
                <div class="accordion-item">
                    <button class="accordion-header" type="button">Ingredients</button>
                    <div class="accordion-body">
                        <div class="accordion-body-inner">${escapeHTML(product.ingredients)}</div>
                    </div>
                </div>`;
        }
        if (product.nutritional_info) {
            accordionHTML += `
                <div class="accordion-item">
                    <button class="accordion-header" type="button">Nutritional Info</button>
                    <div class="accordion-body">
                        <div class="accordion-body-inner">${escapeHTML(product.nutritional_info)}</div>
                    </div>
                </div>`;
        }

        container.innerHTML = `
            <div class="product-detail-img">
                <div class="main-img-wrap">
                    <img id="main-img" src="${escapeHTML(images[0])}" alt="${escapeHTML(product.name)}">
                </div>
                <div class="thumbnail-strip">${thumbsHTML}</div>
            </div>
            <div class="product-detail-info">
                <div class="product-detail-category">${escapeHTML(product.category_name || '')}</div>
                <h1>${escapeHTML(product.name)}</h1>
                <div class="product-detail-price">$${parseFloat(product.price).toFixed(2)}</div>
                <p class="product-detail-desc">${escapeHTML(product.description || '')}</p>
                ${!product.out_of_stock ? `
                <div class="quantity-selector">
                    <label for="qty">Quantity:</label>
                    <input type="number" id="qty" value="1" min="1">
                </div>
                <button class="btn btn-primary btn-lg" id="add-to-cart-btn">Add to Cart</button>
                ` : '<button class="btn btn-outline btn-lg" disabled>Out of Stock</button>'}
                ${accordionHTML ? `<div class="product-accordion">${accordionHTML}</div>` : ''}
            </div>
        `;

        // ─── Add to Cart ─────────────────────────────────────
        const addBtn = document.getElementById('add-to-cart-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const qty = parseInt(document.getElementById('qty').value, 10) || 1;
                Cart.addItem({ id: product.id, name: product.name, price: parseFloat(product.price) }, qty);
                showToast(`${product.name} added to cart!`);
            });
        }

        // ─── Thumbnail click → swap main image ──────────────
        const mainImg = document.getElementById('main-img');
        const thumbStrip = container.querySelector('.thumbnail-strip');
        if (thumbStrip) {
            thumbStrip.addEventListener('click', (e) => {
                const thumb = e.target.closest('img[data-index]');
                if (!thumb) return;
                const idx = parseInt(thumb.dataset.index, 10);
                mainImg.src = images[idx];
                thumbStrip.querySelectorAll('img').forEach(t => t.classList.remove('active'));
                thumb.classList.add('active');
            });
        }

        // ─── Accordion toggle ────────────────────────────────
        container.querySelectorAll('.accordion-header').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.parentElement.classList.toggle('open');
            });
        });

    } catch (err) {
        container.innerHTML = '<p>Product not found.</p>';
    }
});

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.style.cssText = 'position:fixed;bottom:2rem;right:2rem;background:#3d2b1f;color:#fff;padding:0.75rem 1.5rem;border-radius:8px;font-size:0.95rem;z-index:1000;opacity:0;transition:opacity 0.3s;';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}

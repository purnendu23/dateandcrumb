/* Products page — Amrita-style single-product showcase with flavor selector */
document.addEventListener('DOMContentLoaded', async () => {
    const showcase = document.getElementById('product-showcase');
    const PACK_SIZE = 16;
    const PRICE_PER_BOX = 44.89;
    const PRICE_PER_BAR = 2.80;

    let products = [];
    try {
        const res = await fetch('/api/products');
        products = await res.json();
    } catch (err) {
        showcase.innerHTML = '<p style="color:var(--color-error);">Failed to load products.</p>';
        return;
    }

    if (products.length === 0) {
        showcase.innerHTML = '<p style="color:var(--color-text-light);">No products available yet.</p>';
        return;
    }

    let activeProduct = products[0];

    // Pre-select flavor from URL query param
    const urlParams = new URLSearchParams(window.location.search);
    const flavorParam = urlParams.get('flavor');
    if (flavorParam) {
        const match = products.find(p => p.name.toLowerCase() === flavorParam.toLowerCase());
        if (match) activeProduct = match;
    }

    let activeImages = parseImages(activeProduct);
    let activeImgIndex = 0;

    function parseImages(product) {
        try { return JSON.parse(product.image_url); } catch (e) { return [product.image_url]; }
    }
    function syncFlavorInUrl(productName) {
        const url = new URL(window.location.href);
        url.searchParams.set('flavor', productName);
        window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}`);
    }

    function render() {
        activeImages = parseImages(activeProduct);
        activeImgIndex = 0;


        // Flavor pills
        const flavorsHTML = products.map((p, i) =>
            `<button class="flavor-pill ${p.id === activeProduct.id ? 'active' : ''}" data-index="${i}">${esc(p.name)}</button>`
        ).join('');

        // Thumbnails
        const thumbsHTML = activeImages.map((img, i) =>
            `<img src="${esc(img)}" alt="Image ${i + 1}" data-index="${i}" class="${i === 0 ? 'active' : ''}">`
        ).join('');

        // Accordion
        let accordionHTML = '';
        if (activeProduct.ingredients) {
            accordionHTML += `
                <div class="accordion-item">
                    <button class="accordion-header" type="button">Ingredients</button>
                    <div class="accordion-body"><div class="accordion-body-inner">${esc(activeProduct.ingredients)}</div></div>
                </div>`;
        }
        if (activeProduct.nutritional_info) {
            accordionHTML += `
                <div class="accordion-item">
                    <button class="accordion-header" type="button">Nutritional Info</button>
                    <div class="accordion-body"><div class="accordion-body-inner">${esc(activeProduct.nutritional_info)}</div></div>
                </div>`;
        }

        showcase.innerHTML = `
            <div class="showcase-gallery">
                <div class="main-img-wrap">
                    <img id="main-img" src="${esc(activeImages[0])}" alt="${esc(activeProduct.name)}">
                </div>
                <div class="thumbnail-strip">${thumbsHTML}</div>
            </div>
            <div class="showcase-info">
                <div class="product-detail-category">${esc(activeProduct.category_name || '')}</div>
                <h1>${esc(activeProduct.name)}</h1>
                <p class="product-detail-desc">${esc(activeProduct.description || '')}</p>
                <div class="product-pack-pricing">
                    <div class="product-pack-pricing-row">
                        <span class="product-pack-price">$${parseFloat(activeProduct.price).toFixed(2)}</span>
                        <span class="product-pack-size">/ ${PACK_SIZE}-pack</span>
                        <span class="product-pack-pill">$${PRICE_PER_BAR.toFixed(2)}/bar</span>
                    </div>
                    <div class="product-pack-shipping">SHIPPING $4.99 FLAT RATE • FREE SHIPPING ON $50+</div>
                </div>

                <div class="flavor-selector">
                    <span class="flavor-label">Flavor:</span>
                    <div class="flavor-pills">${flavorsHTML}</div>
                </div>


                ${!activeProduct.out_of_stock ? `
                <div class="showcase-actions">
                    <div class="quantity-selector">
                        <label for="qty">Qty:</label>
                        <input type="number" id="qty" value="1" min="1">
                    </div>
                    <button class="btn btn-primary btn-lg" id="add-to-cart-btn">Add to Cart</button>
                </div>
                ` : '<button class="btn btn-outline btn-lg" disabled style="width:100%;">Out of Stock</button>'}

                ${accordionHTML ? `<div class="product-accordion">${accordionHTML}</div>` : ''}
            </div>
        `;

        bindEvents();
    }

    function bindEvents() {
        // Thumbnail clicks
        const mainImg = document.getElementById('main-img');
        const thumbStrip = showcase.querySelector('.thumbnail-strip');
        if (thumbStrip) {
            thumbStrip.addEventListener('click', (e) => {
                const thumb = e.target.closest('img[data-index]');
                if (!thumb) return;
                const idx = parseInt(thumb.dataset.index, 10);
                mainImg.src = activeImages[idx];
                activeImgIndex = idx;
                thumbStrip.querySelectorAll('img').forEach(t => t.classList.remove('active'));
                thumb.classList.add('active');
            });
        }

        // Flavor pills
        showcase.querySelector('.flavor-pills').addEventListener('click', (e) => {
            const pill = e.target.closest('.flavor-pill');
            if (!pill) return;
            const idx = parseInt(pill.dataset.index, 10);
            activeProduct = products[idx];
            syncFlavorInUrl(activeProduct.name);
            render();
        });

        // Add to cart
        const addBtn = document.getElementById('add-to-cart-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const qty = parseInt(document.getElementById('qty').value, 10) || 1;
                Cart.addItem({ id: activeProduct.id, name: activeProduct.name, price: parseFloat(activeProduct.price) }, qty);
                showToast(`${activeProduct.name} added to cart!`);
            });
        }

        // Accordion
        showcase.querySelectorAll('.accordion-header').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.parentElement.classList.toggle('open');
            });
        });

        // Lightbox on main image click
        const mainImgWrap = showcase.querySelector('.main-img-wrap');
        if (mainImgWrap) {
            mainImgWrap.addEventListener('click', () => {
                openLightbox(activeImages[activeImgIndex], activeProduct.name);
            });
        }
    }

    // Initial render
    render();
});

/* ─── Helpers ──────────────────────────────────────────── */
function esc(str) {
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

function openLightbox(src, alt) {
    const existing = document.getElementById('lightbox-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'lightbox-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:zoom-out;';

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = 'position:absolute;top:1rem;right:1.5rem;background:none;border:none;color:#fff;font-size:2.5rem;cursor:pointer;line-height:1;z-index:10000;';
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); overlay.remove(); });

    const img = document.createElement('img');
    img.src = src;
    img.alt = alt || '';
    img.style.cssText = 'max-width:90vw;max-height:90vh;object-fit:contain;border-radius:8px;';

    overlay.appendChild(closeBtn);
    overlay.appendChild(img);
    overlay.addEventListener('click', () => overlay.remove());
    img.addEventListener('click', (e) => e.stopPropagation());

    document.body.appendChild(overlay);

    function onKey(e) {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', onKey);
        }
    }
    document.addEventListener('keydown', onKey);
}

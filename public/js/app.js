/* Homepage — featured products & categories */
document.addEventListener('DOMContentLoaded', async () => {
    // Load Healthy Bars
    try {
        const res = await fetch('/api/products?category_name=Healthy Bars');
        const products = await res.json();
        const container = document.getElementById('healthy-bars-products');
        if (container) container.innerHTML = products.map(productCardHTML).join('');
    } catch (err) {
        console.error('Failed to load Healthy Bars:', err);
    }

    // Load Coffee Cakes
    try {
        const res = await fetch('/api/products?category_name=Coffee Cakes');
        const products = await res.json();
        const container = document.getElementById('coffee-cakes-products');
        if (container) container.innerHTML = products.map(productCardHTML).join('');
    } catch (err) {
        console.error('Failed to load Coffee Cakes:', err);
    }

    // Load categories
    try {
        const res = await fetch('/api/categories');
        const categories = await res.json();
        const container = document.getElementById('categories');
        container.innerHTML = categories.map(cat => `
            <a href="/products.html?category=${cat.id}" class="category-card">
                <h3>${escapeHTML(cat.name)}</h3>
                <p>${escapeHTML(cat.description || '')}</p>
            </a>
        `).join('');
    } catch (err) {
        console.error('Failed to load categories:', err);
    }
});

function productCardHTML(product) {
    let images = [];
    try { images = JSON.parse(product.image_url); } catch (e) { images = [product.image_url]; }
    const cardId = 'card-' + product.id;
    return `
        <div class="product-card">
            <div class="product-card-img">
                <div class="carousel-img-wrap">
                    <img id="${cardId}" src="${escapeHTML(images[0])}" alt="${escapeHTML(product.name)}" data-images='${JSON.stringify(images)}' data-index="0">
                </div>
                <div class="carousel-controls">
                    <button class="carousel-arrow" onclick="cardCarousel('${cardId}', -1)">&#8249;</button>
                    <button class="carousel-arrow" onclick="cardCarousel('${cardId}', 1)">&#8250;</button>
                </div>
            </div>
            <div class="product-card-body">
                <div class="product-card-category">${escapeHTML(product.category_name || '')}</div>
                <h3><a href="/product.html?id=${product.id}">${escapeHTML(product.name)}</a></h3>
                <p class="product-card-desc">${escapeHTML(truncate(product.description, 80))}</p>
                <div class="product-card-footer">
                    <span class="product-price">$${parseFloat(product.price).toFixed(2)}</span>
                    <button class="btn btn-primary btn-sm" onclick="addToCart(${product.id}, '${escapeAttr(product.name)}', ${parseFloat(product.price)})">Add to Cart</button>
                </div>
            </div>
        </div>
    `;
}

function cardCarousel(imgId, direction) {
    const img = document.getElementById(imgId);
    const images = JSON.parse(img.dataset.images);
    let index = parseInt(img.dataset.index, 10);
    index = (index + direction + images.length) % images.length;
    img.src = images[index];
    img.dataset.index = index;
}

function addToCart(id, name, price) {
    Cart.addItem({ id, name, price });
    showToast(`${name} added to cart!`);
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

function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '…' : str;
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// Make addToCart globally available
window.addToCart = addToCart;
window.cardCarousel = cardCarousel;
window.productCardHTML = productCardHTML;
window.escapeHTML = escapeHTML;
window.escapeAttr = escapeAttr;
window.truncate = truncate;
window.showToast = showToast;

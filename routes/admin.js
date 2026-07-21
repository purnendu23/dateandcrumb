const express = require('express');
const router = express.Router();

function requireAdmin(req, res, next) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated.' });
    }
    if (!req.user.is_admin) {
        return res.status(403).json({ error: 'Access denied.' });
    }
    next();
}

router.use(requireAdmin);

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
    const db = req.app.locals.db;
    const [[{ count: totalOrders }]] = await db.execute('SELECT COUNT(*) AS count FROM orders');
    const [[{ count: pendingOrders }]] = await db.execute("SELECT COUNT(*) AS count FROM orders WHERE status = 'pending'");
    const [[{ sum: totalRevenue }]] = await db.execute('SELECT COALESCE(SUM(total), 0) AS sum FROM orders');
    const [[{ count: totalUsers }]] = await db.execute('SELECT COUNT(*) AS count FROM users');
    const [[{ count: totalProducts }]] = await db.execute('SELECT COUNT(*) AS count FROM products');

    res.json({ totalOrders, pendingOrders, totalRevenue, totalUsers, totalProducts });
});

// GET /api/admin/orders
router.get('/orders', async (req, res) => {
    const db = req.app.locals.db;
    const [orders] = await db.execute(`
        SELECT o.*,
            GROUP_CONCAT(CONCAT(oi.product_id, ':', p.name, ':', oi.quantity, ':', oi.unit_price) SEPARATOR '|') AS items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN products p ON oi.product_id = p.id
        GROUP BY o.id
        ORDER BY o.created_at DESC
    `);

    for (const order of orders) {
        order.items = order.items ? order.items.split('|').map(item => {
            const [product_id, name, quantity, unit_price] = item.split(':');
            return { product_id: +product_id, name, quantity: +quantity, unit_price: +unit_price };
        }) : [];
    }

    res.json(orders);
});

// PATCH /api/admin/orders/:id/status
router.patch('/orders/:id/status', async (req, res) => {
    const db = req.app.locals.db;
    const { status, tracking_number, carrier } = req.body;
    const validStatuses = ['pending', 'ready_to_ship', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status.' });
    }
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID.' });

    const [rows] = await db.execute('SELECT status, tracking_number, carrier FROM orders WHERE id = ?', [id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    if (order.status === 'shipped' && status === 'cancelled') {
        return res.status(400).json({ error: 'A shipped order cannot be cancelled.' });
    }
    if (status === 'delivered' && order.status !== 'shipped') {
        return res.status(400).json({ error: 'Only shipped orders can be marked as delivered.' });
    }

    if (status === 'shipped') {
        const tn = (tracking_number || '').trim();
        const cr = (carrier || '').trim();
        if (!tn || !cr) {
            return res.status(400).json({ error: 'Tracking number and carrier are required when shipping an order.' });
        }
        await db.execute('UPDATE orders SET status = ?, tracking_number = ?, carrier = ? WHERE id = ?',
            [status, tn, cr, id]);
    } else {
        if (tracking_number !== undefined || carrier !== undefined) {
            await db.execute('UPDATE orders SET status = ?, tracking_number = ?, carrier = ? WHERE id = ?',
                [status, (tracking_number || '').trim() || null, (carrier || '').trim() || null, id]);
        } else {
            await db.execute('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
        }
    }

    res.json({ message: 'Status updated.' });
});

// PATCH /api/admin/orders/:id/tracking
router.patch('/orders/:id/tracking', async (req, res) => {
    const db = req.app.locals.db;
    const { tracking_number, carrier } = req.body;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID.' });

    await db.execute('UPDATE orders SET tracking_number = ?, carrier = ? WHERE id = ?',
        [tracking_number || null, carrier || null, id]);
    res.json({ message: 'Tracking info updated.' });
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
    const db = req.app.locals.db;
    const [users] = await db.execute('SELECT id, email, name, provider, verified, is_admin, created_at FROM users ORDER BY created_at DESC');
    res.json(users);
});

// GET /api/admin/products
router.get('/products', async (req, res) => {
    const db = req.app.locals.db;
    const [products] = await db.execute(`
        SELECT p.*, c.name AS category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        ORDER BY p.name
    `);
    res.json(products);
});

// PATCH /api/admin/products/:id/out-of-stock
router.patch('/products/:id/out-of-stock', async (req, res) => {
    const db = req.app.locals.db;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID.' });
    const outOfStock = req.body.out_of_stock ? 1 : 0;
    await db.execute('UPDATE products SET out_of_stock = ? WHERE id = ?', [outOfStock, id]);
    res.json({ message: 'Product updated.' });
});

module.exports = router;

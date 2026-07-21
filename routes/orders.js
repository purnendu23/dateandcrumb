const express = require('express');
const router = express.Router();

// POST /api/orders
router.post('/', async (req, res) => {
    const db = req.app.locals.db;
    const { customer_name, customer_email, customer_phone, shipping_address, shipping_city, shipping_zip, items, payment_method, payment_id } = req.body;

    if (!customer_name || !customer_email || !shipping_address || !shipping_city || !shipping_zip) {
        return res.status(400).json({ error: 'Missing required customer/shipping fields' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Order must contain at least one item' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) {
        return res.status(400).json({ error: 'Invalid email address' });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        let total = 0;
        const resolvedItems = [];

        for (const item of items) {
            const productId = parseInt(item.product_id, 10);
            const quantity = parseInt(item.quantity, 10);
            if (isNaN(productId) || isNaN(quantity) || quantity < 1) {
                throw new Error('Invalid item: product_id and quantity (>=1) are required');
            }

            const [rows] = await conn.execute('SELECT id, price, out_of_stock FROM products WHERE id = ?', [productId]);
            const product = rows[0];
            if (!product) throw new Error(`Product ${productId} not found`);
            if (product.out_of_stock) throw new Error(`Product ${productId} is currently out of stock`);

            resolvedItems.push({ product_id: productId, quantity, unit_price: product.price });
            total += product.price * quantity;
        }

        total = Math.round(total * 100) / 100;

        const [orderResult] = await conn.execute(
            `INSERT INTO orders (customer_name, customer_email, customer_phone, shipping_address, shipping_city, shipping_zip, total, payment_method, payment_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [customer_name, customer_email, customer_phone || null, shipping_address, shipping_city, shipping_zip, total, payment_method || null, payment_id || null]
        );
        const orderId = orderResult.insertId;

        for (const ri of resolvedItems) {
            await conn.execute(
                'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
                [orderId, ri.product_id, ri.quantity, ri.unit_price]
            );
        }

        await conn.commit();

        // Auto-save address to address book for logged-in users
        if (req.isAuthenticated && req.isAuthenticated()) {
            try {
                const [existing] = await db.execute(
                    'SELECT id FROM address_book WHERE user_id = ? AND address = ? AND city = ? AND zip = ?',
                    [req.user.id, shipping_address, shipping_city, shipping_zip]
                );
                if (existing.length === 0) {
                    await db.execute(
                        'INSERT INTO address_book (user_id, label, name, phone, address, address2, city, state, zip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [req.user.id, null, customer_name, customer_phone || null,
                         shipping_address, req.body.shipping_address2 || null,
                         shipping_city, req.body.shipping_state || null, shipping_zip]
                    );
                }
            } catch (addrErr) {
                console.error('Failed to save address to address book:', addrErr.message);
            }
        }

        res.status(201).json({ message: 'Order placed successfully', order_id: orderId, total });
    } catch (err) {
        await conn.rollback();
        res.status(400).json({ error: err.message });
    } finally {
        conn.release();
    }
});

// GET /api/orders/my
router.get('/my', async (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not logged in.' });
    }

    const db = req.app.locals.db;
    const email = req.user.email;

    const [orders] = await db.execute(
        'SELECT * FROM orders WHERE customer_email = ? ORDER BY created_at DESC',
        [email]
    );

    const result = [];
    for (const order of orders) {
        const [items] = await db.execute(
            `SELECT oi.*, p.name AS product_name, p.image_url
             FROM order_items oi
             JOIN products p ON oi.product_id = p.id
             WHERE oi.order_id = ?`,
            [order.id]
        );
        result.push({ ...order, items });
    }

    res.json({ orders: result });
});

// GET /api/orders/:id
router.get('/:id', async (req, res) => {
    const db = req.app.locals.db;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });

    const [rows] = await db.execute('SELECT * FROM orders WHERE id = ?', [id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const [orderItems] = await db.execute(
        `SELECT oi.*, p.name AS product_name
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ?`,
        [id]
    );

    res.json({ ...order, items: orderItems });
});

module.exports = router;

const express = require('express');
const router = express.Router();

// GET /api/products — list all products (with optional filters)
router.get('/', async (req, res) => {
    const db = req.app.locals.db;
    const { category, featured, search } = req.query;

    let sql = `SELECT p.*, c.name AS category_name
               FROM products p
               LEFT JOIN categories c ON p.category_id = c.id
               WHERE 1=1`;
    const params = [];

    if (category) {
        sql += ' AND p.category_id = ?';
        params.push(category);
    }
    if (req.query.category_name) {
        sql += ' AND c.name = ?';
        params.push(req.query.category_name);
    }
    if (featured === '1') {
        sql += ' AND p.featured = 1';
    }
    if (search) {
        sql += ' AND (p.name LIKE ? OR p.description LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term);
    }

    sql += ' ORDER BY p.name';
    const [products] = await db.execute(sql, params);
    res.json(products);
});

// GET /api/products/:id — single product
router.get('/:id', async (req, res) => {
    const db = req.app.locals.db;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });

    const [rows] = await db.execute(
        `SELECT p.*, c.name AS category_name
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.id = ?`,
        [id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
});

module.exports = router;

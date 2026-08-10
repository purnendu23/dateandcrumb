const dotenv = require('dotenv');
const path = require('path');
const runtimeEnv = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const envPaths = [
    path.join(__dirname, `.env.${runtimeEnv}`),
    path.join(__dirname, '.env'),
];
for (const envPath of envPaths) {
    dotenv.config({ path: envPath });
}

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const pool = require('./db/pool');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);

// Make pool available to routes
app.locals.db = pool;

// --- Run migrations for existing databases ---
async function runMigrations() {
    const conn = await pool.getConnection();
    try {
        const addColumnIfNotExists = async (table, column, definition) => {
            const [rows] = await conn.execute(
                `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
                [table, column]
            );
            if (rows[0].cnt === 0) {
                await conn.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
            }
        };
        const addUniqueIndexIfNotExists = async (table, indexName, ddl) => {
            const [rows] = await conn.execute(
                `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
                [table, indexName]
            );
            if (rows[0].cnt === 0) {
                await conn.execute(ddl);
            }
        };

        await addColumnIfNotExists('users', 'reset_token', 'VARCHAR(255)');
        await addColumnIfNotExists('users', 'reset_token_expires', 'DATETIME');
        await addColumnIfNotExists('users', 'first_name', 'VARCHAR(100) NULL AFTER email');
        await addColumnIfNotExists('users', 'last_name', 'VARCHAR(100) NULL AFTER first_name');
        await addColumnIfNotExists('products', 'ingredients', 'TEXT');
        await addColumnIfNotExists('products', 'nutritional_info', 'TEXT');
        await addColumnIfNotExists('address_book', 'first_name', 'VARCHAR(100) NULL AFTER label');
        await addColumnIfNotExists('address_book', 'last_name', 'VARCHAR(100) NULL AFTER first_name');
        await addColumnIfNotExists('orders', 'customer_first_name', 'VARCHAR(100) NULL AFTER customer_name');
        await addColumnIfNotExists('orders', 'customer_last_name', 'VARCHAR(100) NULL AFTER customer_first_name');
        await addColumnIfNotExists('orders', 'shipping_address2', 'VARCHAR(255) NULL AFTER shipping_address');
        await addColumnIfNotExists('orders', 'shipping_state', 'VARCHAR(2) NULL AFTER shipping_city');
        await addColumnIfNotExists('orders', 'subtotal', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER shipping_zip');
        await addColumnIfNotExists('orders', 'sales_tax', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER subtotal');
        await addColumnIfNotExists('orders', 'tax_calculation_id', 'VARCHAR(255) NULL AFTER sales_tax');
        await addUniqueIndexIfNotExists(
            'orders',
            'ux_orders_payment_id',
            'CREATE UNIQUE INDEX ux_orders_payment_id ON orders(payment_id)'
        );

        await conn.execute(`CREATE TABLE IF NOT EXISTS validated_addresses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            address_hash VARCHAR(64) NOT NULL UNIQUE,
            raw_address TEXT NOT NULL, raw_city VARCHAR(255) NOT NULL, raw_state VARCHAR(10), raw_zip VARCHAR(20) NOT NULL,
            validated_address TEXT, validated_city VARCHAR(255), validated_state VARCHAR(10), validated_zip VARCHAR(20),
            provider VARCHAR(50), confidence VARCHAR(50),
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB`);
    } catch (e) {
        console.error('Migration error:', e.message);
    } finally {
        conn.release();
    }
}

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'bakehouse-dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
    },
}));

// Passport
require('./config/passport')(pool);
app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(path.join(__dirname, 'public')));

// --- Admin page protection ---
app.use('/admin', (req, res, next) => {
    if (req.path === '/login.html' || req.path.startsWith('/css/') || req.path.startsWith('/js/') || req.path.startsWith('/images/')) {
        return next();
    }
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user.is_admin) {
        return res.redirect('/admin/login.html');
    }
    next();
});
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// --- Routes ---
app.use('/api/admin', require('./routes/admin'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/address', require('./routes/address'));

// Public config endpoint
app.get('/api/config', (req, res) => {
    res.json({
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || null,
        mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN || null,
    });
});

// Categories endpoint
app.get('/api/categories', async (req, res) => {
    try {
        const [categories] = await pool.execute('SELECT * FROM categories ORDER BY name');
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch categories.' });
    }
});

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start server ---
async function start() {
    await runMigrations();
    app.listen(PORT, '127.0.0.1', () => {
        console.log(`Bakehouse server running on http://127.0.0.1:${PORT}`);
    });
}

start().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    await pool.end();
    process.exit(0);
});

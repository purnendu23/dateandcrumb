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
const fs = require('fs');
const https = require('https');
const session = require('express-session');
const passport = require('passport');
const pool = require('./db/pool');

const app = express();
const PORT = process.env.PORT || 3000;

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

        await addColumnIfNotExists('users', 'reset_token', 'VARCHAR(255)');
        await addColumnIfNotExists('users', 'reset_token_expires', 'DATETIME');
        await addColumnIfNotExists('products', 'ingredients', 'TEXT');
        await addColumnIfNotExists('products', 'nutritional_info', 'TEXT');

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

    const sslKeyPath = path.join(__dirname, 'server.key');
    const sslCertPath = path.join(__dirname, 'server.cert');

    if (fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
        const sslOptions = {
            key: fs.readFileSync(sslKeyPath),
            cert: fs.readFileSync(sslCertPath),
        };
        https.createServer(sslOptions, app).listen(PORT, () => {
            console.log(`Bakehouse server running at https://localhost:${PORT}`);
        });
    } else {
        app.listen(PORT, () => {
            console.log(`Bakehouse server running at http://localhost:${PORT} (no SSL — payment card inputs may not work)`);
        });
    }
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

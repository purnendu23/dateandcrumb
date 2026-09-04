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
                await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
            }
        };
        const addUniqueIndexIfNotExists = async (table, indexName, ddl) => {
            const [rows] = await conn.execute(
                `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
                [table, indexName]
            );
            if (rows[0].cnt === 0) {
                await conn.query(ddl);
            }
        };
        const addIndexIfNotExists = async (table, indexName, ddl) => {
            const [rows] = await conn.execute(
                `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
                [table, indexName]
            );
            if (rows[0].cnt === 0) {
                await conn.query(ddl);
            }
        };
        const addForeignKeyIfNotExists = async (table, constraintName, ddl) => {
            const [rows] = await conn.execute(
                `SELECT COUNT(*) AS cnt
                 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = ?
                   AND CONSTRAINT_NAME = ?
                   AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
                [table, constraintName]
            );
            if (rows[0].cnt === 0) {
                await conn.query(ddl);
            }
        };
        const dropForeignKeyIfExists = async (table, constraintName) => {
            const [rows] = await conn.execute(
                `SELECT COUNT(*) AS cnt
                 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = ?
                   AND CONSTRAINT_NAME = ?
                   AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
                [table, constraintName]
            );
            if (rows[0].cnt > 0) {
                await conn.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${constraintName}\``);
            }
        };
        const dropColumnIfExists = async (table, column) => {
            const [rows] = await conn.execute(
                `SELECT COUNT(*) AS cnt
                 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = ?
                   AND COLUMN_NAME = ?`,
                [table, column]
            );
            if (rows[0].cnt > 0) {
                await conn.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
            }
        };
        const addTriggerIfNotExists = async (triggerName, ddl) => {
            const [rows] = await conn.execute(
                `SELECT COUNT(*) AS cnt
                 FROM INFORMATION_SCHEMA.TRIGGERS
                 WHERE TRIGGER_SCHEMA = DATABASE()
                   AND TRIGGER_NAME = ?`,
                [triggerName]
            );
            if (rows[0].cnt === 0) {
                await conn.query(ddl);
            }
        };

        await addColumnIfNotExists('users', 'username', 'VARCHAR(100) NULL AFTER email');
        await addColumnIfNotExists('users', 'first_name', 'VARCHAR(100) NULL AFTER email');
        await addColumnIfNotExists('users', 'last_name', 'VARCHAR(100) NULL AFTER first_name');
        await addColumnIfNotExists('users', 'reset_token', 'VARCHAR(255)');
        await addColumnIfNotExists('users', 'reset_token_expires', 'DATETIME');
        await dropColumnIfExists('users', 'shipping_address');
        await dropColumnIfExists('users', 'shipping_address2');
        await dropColumnIfExists('users', 'shipping_city');
        await dropColumnIfExists('users', 'shipping_state');
        await dropColumnIfExists('users', 'shipping_zip');
        await dropColumnIfExists('users', 'name');
        await dropColumnIfExists('users', 'provider');
        await dropColumnIfExists('users', 'provider_id');
        await dropColumnIfExists('users', 'verification_token');
        await addColumnIfNotExists('products', 'ingredients', 'TEXT');
        await addColumnIfNotExists('products', 'nutritional_info', 'TEXT');
        await conn.execute(
            `INSERT INTO categories (name, description)
             SELECT 'Healthy Bars', 'Wholesome, nutritious bars baked with natural ingredients'
             WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Healthy Bars')`
        );
        await conn.query('UPDATE products SET price = 44.89 WHERE price <> 44.89');
        const varietyImages = JSON.stringify([
            '/images/rose-delight/front_picture.png',
            '/images/golden-pista/front_picture.png',
            '/images/nut-and-crunch/front_picture.png',
            '/images/cocoa-delight/front_picture.png',
        ]);
        await conn.execute(
            `UPDATE products p
             JOIN categories c ON c.id = p.category_id
             SET p.description = ?,
                 p.price = 44.89,
                 p.image_url = ?,
                 p.out_of_stock = 0,
                 p.featured = 1,
                 p.ingredients = ?,
                 p.nutritional_info = ?
             WHERE p.name = ?`,
            [
                'Four of each flavor.',
                varietyImages,
                'Includes all four Date & Crumb flavors (4 bars each): Cardamom Rose Delight, Golden Pista, Nut-n-Crunch Bite, and Midnight Coco Date.',
                'Pack Size: 16 bars total\nFlavor Mix: 4 bars each flavor',
                'Variety Pack',
            ]
        );
        await conn.execute(
            `INSERT INTO products (
                name, description, price, image_url, category_id, out_of_stock, featured, ingredients, nutritional_info
             )
             SELECT ?, ?, 44.89, ?, c.id, 0, 1, ?, ?
             FROM categories c
             WHERE c.name = 'Healthy Bars'
               AND NOT EXISTS (SELECT 1 FROM products WHERE name = ?)
             LIMIT 1`,
            [
                'Variety Pack',
                'Four of each flavor.',
                varietyImages,
                'Includes all four Date & Crumb flavors (4 bars each): Cardamom Rose Delight, Golden Pista, Nut-n-Crunch Bite, and Midnight Coco Date.',
                'Pack Size: 16 bars total\nFlavor Mix: 4 bars each flavor',
                'Variety Pack',
            ]
        );
        await addColumnIfNotExists('address_book', 'customer_id', 'INT NULL AFTER id');
        await addColumnIfNotExists('address_book', 'first_name', 'VARCHAR(100) NULL AFTER label');
        await addColumnIfNotExists('address_book', 'last_name', 'VARCHAR(100) NULL AFTER first_name');
        await addColumnIfNotExists('orders', 'customer_first_name', 'VARCHAR(100) NULL AFTER customer_name');
        await addColumnIfNotExists('orders', 'customer_last_name', 'VARCHAR(100) NULL AFTER customer_first_name');
        await addColumnIfNotExists('orders', 'shipping_address2', 'VARCHAR(255) NULL AFTER shipping_address');
        await addColumnIfNotExists('orders', 'shipping_state', 'VARCHAR(2) NULL AFTER shipping_city');
        await addColumnIfNotExists('orders', 'subtotal', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER shipping_zip');
        await addColumnIfNotExists('orders', 'shipping_cost', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER subtotal');
        await addColumnIfNotExists('orders', 'sales_tax', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER subtotal');
        await addColumnIfNotExists('orders', 'tax_calculation_id', 'VARCHAR(255) NULL AFTER sales_tax');
        await addColumnIfNotExists('orders', 'customer_id', 'INT NULL AFTER id');
        await addUniqueIndexIfNotExists(
            'orders',
            'ux_orders_payment_id',
            'CREATE UNIQUE INDEX ux_orders_payment_id ON orders(payment_id)'
        );
        await addIndexIfNotExists(
            'orders',
            'ix_orders_customer_id',
            'CREATE INDEX ix_orders_customer_id ON orders(customer_id)'
        );

        await conn.execute(`CREATE TABLE IF NOT EXISTS validated_addresses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            address_hash VARCHAR(64) NOT NULL UNIQUE,
            raw_address TEXT NOT NULL, raw_city VARCHAR(255) NOT NULL, raw_state VARCHAR(10), raw_zip VARCHAR(20) NOT NULL,
            validated_address TEXT, validated_city VARCHAR(255), validated_state VARCHAR(10), validated_zip VARCHAR(20),
            provider VARCHAR(50), confidence VARCHAR(50),
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB`);

        await conn.execute(`CREATE TABLE IF NOT EXISTS shipping_labels (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_id INT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'not_created',
            easypost_shipment_id VARCHAR(255),
            easypost_postage_label_id VARCHAR(255),
            easypost_rate_id VARCHAR(255),
            carrier VARCHAR(100),
            service VARCHAR(100),
            tracking_code VARCHAR(255),
            tracker_url TEXT,
            label_url TEXT,
            label_storage_path VARCHAR(500),
            label_format VARCHAR(20),
            error_message TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY ux_shipping_labels_order_id (order_id),
            KEY ix_shipping_labels_status (status),
            FOREIGN KEY (order_id) REFERENCES orders(id)
        ) ENGINE=InnoDB`);
        // ADD COLUMN IF NOT EXISTS is MariaDB syntax; use information_schema check for MySQL
        const [[{ trackerUrlExists }]] = await conn.query(`
            SELECT COUNT(*) AS trackerUrlExists FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'shipping_labels' AND column_name = 'tracker_url'
        `);
        if (!trackerUrlExists) {
            await conn.query(`ALTER TABLE shipping_labels ADD COLUMN tracker_url TEXT AFTER tracking_code`);
        }

        await conn.execute(`CREATE TABLE IF NOT EXISTS customers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255),
            first_name VARCHAR(100),
            last_name VARCHAR(100),
            full_name VARCHAR(255),
            provider VARCHAR(50) NOT NULL DEFAULT 'local',
            provider_id VARCHAR(255),
            verified TINYINT(1) NOT NULL DEFAULT 0,
            verification_token VARCHAR(255),
            reset_token VARCHAR(255),
            reset_token_expires DATETIME,
            phone VARCHAR(50),
            organization VARCHAR(255),
            shipping_address TEXT,
            shipping_address2 VARCHAR(255),
            shipping_city VARCHAR(255),
            shipping_state VARCHAR(10),
            shipping_zip VARCHAR(20),
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            last_order_at DATETIME
        ) ENGINE=InnoDB`);
        await addColumnIfNotExists('customers', 'password_hash', 'VARCHAR(255) NULL AFTER email');
        await addColumnIfNotExists('customers', 'provider', "VARCHAR(50) NOT NULL DEFAULT 'local' AFTER full_name");
        await addColumnIfNotExists('customers', 'provider_id', 'VARCHAR(255) NULL AFTER provider');
        await addColumnIfNotExists('customers', 'verified', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER provider_id');
        await addColumnIfNotExists('customers', 'verification_token', 'VARCHAR(255) NULL AFTER verified');
        await addColumnIfNotExists('customers', 'reset_token', 'VARCHAR(255) NULL AFTER verification_token');
        await addColumnIfNotExists('customers', 'reset_token_expires', 'DATETIME NULL AFTER reset_token');
        await addColumnIfNotExists('customers', 'organization', 'VARCHAR(255) NULL AFTER phone');
        await dropColumnIfExists('customers', 'user_id');

        // Backfill customer profiles from historical orders where needed.
        await conn.execute(
            `INSERT INTO customers (
                email, first_name, last_name, full_name, phone,
                shipping_address, shipping_address2, shipping_city, shipping_state, shipping_zip, last_order_at
             )
             SELECT
                LOWER(TRIM(o.customer_email)) AS email,
                MAX(NULLIF(TRIM(o.customer_first_name), '')) AS first_name,
                MAX(NULLIF(TRIM(o.customer_last_name), '')) AS last_name,
                MAX(NULLIF(TRIM(o.customer_name), '')) AS full_name,
                MAX(NULLIF(TRIM(o.customer_phone), '')) AS phone,
                MAX(NULLIF(TRIM(o.shipping_address), '')) AS shipping_address,
                MAX(NULLIF(TRIM(o.shipping_address2), '')) AS shipping_address2,
                MAX(NULLIF(TRIM(o.shipping_city), '')) AS shipping_city,
                MAX(NULLIF(TRIM(o.shipping_state), '')) AS shipping_state,
                MAX(NULLIF(TRIM(o.shipping_zip), '')) AS shipping_zip,
                MAX(o.created_at) AS last_order_at
             FROM orders o
             WHERE o.customer_email IS NOT NULL
               AND TRIM(o.customer_email) <> ''
             GROUP BY LOWER(TRIM(o.customer_email))
             ON DUPLICATE KEY UPDATE
                last_order_at = GREATEST(
                    COALESCE(last_order_at, '1000-01-01'),
                    VALUES(last_order_at)
                )`
        );

        await dropForeignKeyIfExists('address_book', 'address_book_ibfk_1');
        await dropColumnIfExists('address_book', 'user_id');
        await addIndexIfNotExists(
            'address_book',
            'ix_address_book_customer_id',
            'CREATE INDEX ix_address_book_customer_id ON address_book(customer_id)'
        );
        await addForeignKeyIfNotExists(
            'address_book',
            'fk_address_book_customer_id',
            'ALTER TABLE address_book ADD CONSTRAINT fk_address_book_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id)'
        );

        // Link existing orders to their customer rows by email.
        await conn.execute(
            `UPDATE orders o
             JOIN customers c ON c.email = LOWER(TRIM(o.customer_email))
             SET o.customer_id = c.id
             WHERE o.customer_id IS NULL
               AND o.customer_email IS NOT NULL
               AND TRIM(o.customer_email) <> ''`
        );

        await conn.execute(`CREATE TABLE IF NOT EXISTS admin_login_attempts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            ip_address VARCHAR(64) NOT NULL,
            failed_attempts INT NOT NULL DEFAULT 0,
            first_failed_at DATETIME,
            locked_until DATETIME,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY ux_admin_login_attempts_email_ip (email, ip_address),
            KEY ix_admin_login_attempts_locked_until (locked_until)
        ) ENGINE=InnoDB`);

        await addForeignKeyIfNotExists(
            'orders',
            'fk_orders_customer_id',
            'ALTER TABLE orders ADD CONSTRAINT fk_orders_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id)'
        );

        await conn.execute(`CREATE TABLE IF NOT EXISTS user_registration_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NOT NULL UNIQUE,
            username VARCHAR(100) NOT NULL UNIQUE,
            first_name VARCHAR(100),
            last_name VARCHAR(100),
            password_hash VARCHAR(255) NOT NULL,
            verification_token VARCHAR(255),
            email_verified_at DATETIME,
            status VARCHAR(40) NOT NULL DEFAULT 'pending_verification',
            approved_by_user_id INT,
            approved_at DATETIME,
            rejected_at DATETIME,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY ix_user_registration_requests_status (status),
            CONSTRAINT fk_user_registration_requests_approved_by
                FOREIGN KEY (approved_by_user_id) REFERENCES users(id)
        ) ENGINE=InnoDB`);

        await conn.execute(
            `UPDATE users
             SET email = LOWER(TRIM(email))
             WHERE email IS NOT NULL
               AND email <> LOWER(TRIM(email))`
        );
        await conn.execute(
            `UPDATE users
             SET username = LOWER(TRIM(SUBSTRING_INDEX(email, '@', 1)))
             WHERE (username IS NULL OR TRIM(username) = '')
               AND email IS NOT NULL
               AND TRIM(email) <> ''`
        );
        await conn.execute(
            `UPDATE users
             SET username = LOWER(TRIM(username))
             WHERE username IS NOT NULL
               AND username <> LOWER(TRIM(username))`
        );

        const [duplicateUsernames] = await conn.execute(
            `SELECT username
             FROM users
             WHERE username IS NOT NULL
               AND TRIM(username) <> ''
             GROUP BY username
             HAVING COUNT(*) > 1`
        );
        for (const row of duplicateUsernames) {
            const [dupeRows] = await conn.execute(
                `SELECT id
                 FROM users
                 WHERE username = ?
                 ORDER BY id ASC`,
                [row.username]
            );
            for (let i = 1; i < dupeRows.length; i += 1) {
                const dupeId = dupeRows[i].id;
                await conn.execute(
                    'UPDATE users SET username = ? WHERE id = ?',
                    [`${row.username}_${dupeId}`, dupeId]
                );
            }
        }

        await addUniqueIndexIfNotExists(
            'users',
            'ux_users_username',
            'CREATE UNIQUE INDEX ux_users_username ON users(username)'
        );

        const [nullUsernames] = await conn.execute(
            `SELECT COUNT(*) AS cnt
             FROM users
             WHERE username IS NULL
                OR TRIM(username) = ''`
        );
        if (Number(nullUsernames[0].cnt) > 0) {
            throw new Error('users.username cannot be empty.');
        }

        await conn.query(
            'ALTER TABLE users MODIFY COLUMN username VARCHAR(100) NOT NULL'
        );

        const [admins] = await conn.execute(
            `SELECT id
             FROM users
             WHERE is_admin = 1
             ORDER BY id ASC`
        );
        if (admins.length > 1) {
            const keepAdminId = admins[0].id;
            await conn.execute(
                'UPDATE users SET is_admin = 0 WHERE is_admin = 1 AND id <> ?',
                [keepAdminId]
            );
        }

        await addTriggerIfNotExists(
            'users_before_insert_single_admin',
            `CREATE TRIGGER users_before_insert_single_admin
             BEFORE INSERT ON users
             FOR EACH ROW
             BEGIN
                 IF NEW.is_admin = 1 AND EXISTS (SELECT 1 FROM users WHERE is_admin = 1) THEN
                     SIGNAL SQLSTATE '45000'
                     SET MESSAGE_TEXT = 'Only one admin user is allowed.';
                 END IF;
             END`
        );
        await addTriggerIfNotExists(
            'users_before_update_single_admin',
            `CREATE TRIGGER users_before_update_single_admin
             BEFORE UPDATE ON users
             FOR EACH ROW
             BEGIN
                 IF NEW.is_admin = 1 AND OLD.is_admin <> 1
                    AND EXISTS (SELECT 1 FROM users WHERE is_admin = 1 AND id <> OLD.id) THEN
                     SIGNAL SQLSTATE '45000'
                     SET MESSAGE_TEXT = 'Only one admin user is allowed.';
                 END IF;
             END`
        );
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
    if (
        req.path === '/login.html' ||
        req.path === '/register.html' ||
        req.path.startsWith('/css/') ||
        req.path.startsWith('/js/') ||
        req.path.startsWith('/images/')
    ) {
        return next();
    }
    if (req.path === '/employee.html') {
        if (!req.isAuthenticated || !req.isAuthenticated() || req.user?.principal_type !== 'user') {
            return res.redirect('/admin/login.html');
        }
        return next();
    }
    if (
        !req.isAuthenticated ||
        !req.isAuthenticated() ||
        req.user?.principal_type !== 'user' ||
        !req.user.is_admin
    ) {
        return res.redirect('/admin/login.html');
    }
    next();
});
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// --- Routes ---
app.use('/api/admin/auth', require('./routes/adminAuth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/address', require('./routes/address'));
app.use('/api/wholesale', require('./routes/wholesale'));

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
    const shouldRunMigrations = process.argv.includes('--migrate') || process.env.RUN_MIGRATIONS_ON_START === '1';

    if (process.argv.includes('--migrate')) {
        await runMigrations();
        console.log('Database migrations complete.');
        process.exit(0);
    }

    if (shouldRunMigrations) {
        await runMigrations();
    }

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

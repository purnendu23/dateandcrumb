const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const dotenv = require('dotenv');
const runtimeEnv = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const envPaths = [
    path.join(__dirname, '..', `.env.${runtimeEnv}`),
    path.join(__dirname, '..', '.env'),
];
for (const envPath of envPaths) {
    dotenv.config({ path: envPath });
}

async function seed() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'dateandcrumb',
        waitForConnections: true,
        connectionLimit: 5,
        multipleStatements: true,
    });

    const conn = await pool.getConnection();

    try {
        // Preserve admin users before dropping tables
        let adminUsers = [];
        try {
            const [admins] = await conn.execute('SELECT * FROM users WHERE is_admin = 1');
            adminUsers = admins;
        } catch (e) {
            // users table may not exist yet
        }

        // Drop existing tables and recreate
        await conn.query(`
            SET FOREIGN_KEY_CHECKS = 0;
            DROP TABLE IF EXISTS validated_addresses;
            DROP TABLE IF EXISTS address_book;
            DROP TABLE IF EXISTS order_items;
            DROP TABLE IF EXISTS orders;
            DROP TABLE IF EXISTS products;
            DROP TABLE IF EXISTS categories;
            DROP TABLE IF EXISTS sessions;
            DROP TABLE IF EXISTS users;
            SET FOREIGN_KEY_CHECKS = 1;
        `);

        // Run schema
        const schema = fs.readFileSync(path.join(__dirname, 'schema-mysql.sql'), 'utf8');
        // Split by semicolons and execute each statement
        const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
        for (const stmt of statements) {
            await conn.execute(stmt);
        }

        // Restore admin users
        if (adminUsers.length > 0) {
            for (const u of adminUsers) {
                await conn.execute(
                    `INSERT INTO users (
                        id, email, first_name, last_name, password_hash, name, provider, provider_id,
                        verified, verification_token, reset_token, reset_token_expires, is_admin, phone,
                        organization, shipping_address, shipping_address2, shipping_city, shipping_state,
                        shipping_zip, created_at
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        u.id, u.email, u.first_name || null, u.last_name || null, u.password_hash, u.name,
                        u.provider, u.provider_id, u.verified, u.verification_token, u.reset_token || null,
                        u.reset_token_expires || null, u.is_admin, u.phone, u.organization, u.shipping_address,
                        u.shipping_address2, u.shipping_city, u.shipping_state, u.shipping_zip, u.created_at
                    ]
                );
            }
            console.log(`  - ${adminUsers.length} admin user(s) preserved`);
        }

        // Seed categories
        const categories = [
            ['Healthy Bars', 'Wholesome, nutritious bars baked with natural ingredients'],
        ];
        for (const [name, desc] of categories) {
            await conn.execute('INSERT IGNORE INTO categories (name, description) VALUES (?, ?)', [name, desc]);
        }

        // Seed products from YAML files
        const dataDir = path.join(__dirname, '..', 'data', 'products');
        const ymlFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.yml')).sort();
        const products = ymlFiles.map(f => {
            const content = fs.readFileSync(path.join(dataDir, f), 'utf8');
            return yaml.load(content);
        });

        for (const p of products) {
            await conn.execute(
                `INSERT INTO products (name, description, price, image_url, category_id, out_of_stock, featured, ingredients, nutritional_info) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE 
                    description = VALUES(description),
                    price = VALUES(price),
                    image_url = VALUES(image_url),
                    featured = VALUES(featured),
                    ingredients = VALUES(ingredients),
                    nutritional_info = VALUES(nutritional_info)`,
                [
                    p.name,
                    p.description.trim(),
                    p.price,
                    JSON.stringify(p.images),
                    1,
                    0,
                    p.featured ? 1 : 0,
                    p.ingredients.trim(),
                    p.nutritional_info.trim()
                ]
            );
        }

        console.log('Database seeded successfully!');
        console.log(`  - ${categories.length} categories`);
        console.log(`  - ${products.length} products`);
    } finally {
        conn.release();
        await pool.end();
    }
}

seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});

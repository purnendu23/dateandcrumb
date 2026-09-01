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

async function syncProducts() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'dateandcrumb',
        waitForConnections: true,
        connectionLimit: 5,
    });

    const conn = await pool.getConnection();
    try {
        const dataDir = path.join(__dirname, '..', 'data', 'products');
        const ymlFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.yml')).sort();
        const products = ymlFiles.map(f => {
            const content = fs.readFileSync(path.join(dataDir, f), 'utf8');
            return yaml.load(content);
        });

        let syncedCount = 0;
        for (const p of products) {
            if (!p || !p.name) {
                throw new Error('Invalid product YAML: missing product name.');
            }

            const categoryName = String(p.category || 'Healthy Bars').trim();
            await conn.execute(
                `INSERT INTO categories (name, description)
                 SELECT ?, ''
                 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = ?)`,
                [categoryName, categoryName]
            );

            const [categoryRows] = await conn.execute(
                'SELECT id FROM categories WHERE name = ? LIMIT 1',
                [categoryName]
            );
            if (!categoryRows[0]) {
                throw new Error(`Category not found after upsert: ${categoryName}`);
            }

            const images = Array.isArray(p.images) ? p.images : (p.images ? [p.images] : []);
            const productName = String(p.name).trim();
            const productValues = [
                String(p.description || '').trim(),
                Number(p.price),
                JSON.stringify(images),
                categoryRows[0].id,
                p.out_of_stock ? 1 : 0,
                p.featured ? 1 : 0,
                String(p.ingredients || '').trim(),
                String(p.nutritional_info || '').trim(),
                productName,
            ];

            const [existingRows] = await conn.execute(
                'SELECT id FROM products WHERE name = ? ORDER BY id ASC LIMIT 1',
                [productName]
            );

            if (existingRows[0]) {
                await conn.execute(
                    `UPDATE products
                     SET description = ?,
                         price = ?,
                         image_url = ?,
                         category_id = ?,
                         out_of_stock = ?,
                         featured = ?,
                         ingredients = ?,
                         nutritional_info = ?
                     WHERE name = ?`,
                    productValues
                );
            } else {
                await conn.execute(
                    `INSERT INTO products (
                        name, description, price, image_url, category_id, out_of_stock, featured, ingredients, nutritional_info
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        productName,
                        productValues[0],
                        productValues[1],
                        productValues[2],
                        productValues[3],
                        productValues[4],
                        productValues[5],
                        productValues[6],
                        productValues[7],
                    ]
                );
            }
            syncedCount += 1;
        }

        console.log(`Products synced successfully from YAML (${syncedCount} products).`);
    } finally {
        conn.release();
        await pool.end();
    }
}

syncProducts().catch(err => {
    console.error('Product sync failed:', err);
    process.exit(1);
});

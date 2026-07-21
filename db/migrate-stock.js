const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'bakehouse.db'));

const cols = db.prepare("PRAGMA table_info(products)").all().map(c => c.name);

if (cols.includes('stock') && !cols.includes('out_of_stock')) {
    db.exec('ALTER TABLE products ADD COLUMN out_of_stock INTEGER NOT NULL DEFAULT 0');
    db.exec('UPDATE products SET out_of_stock = CASE WHEN stock = 0 THEN 1 ELSE 0 END');
    console.log('Migration done: added out_of_stock column');
} else if (cols.includes('out_of_stock')) {
    console.log('Column out_of_stock already exists');
} else {
    console.log('Columns:', cols);
}

db.close();


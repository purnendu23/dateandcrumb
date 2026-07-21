const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'bakehouse.db'));

// Create address_book table
db.exec(`
CREATE TABLE IF NOT EXISTS address_book (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    label TEXT,
    name TEXT,
    phone TEXT,
    address TEXT NOT NULL,
    address2 TEXT,
    city TEXT NOT NULL,
    state TEXT,
    zip TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
`);

// Seed address book from existing user profiles that have shipping info
const users = db.prepare(
    "SELECT id, name, phone, shipping_address, shipping_address2, shipping_city, shipping_state, shipping_zip FROM users WHERE shipping_address IS NOT NULL AND shipping_address != ''"
).all();

const insert = db.prepare(
    "INSERT INTO address_book (user_id, label, name, phone, address, address2, city, state, zip, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)"
);

let count = 0;
for (const u of users) {
    const exists = db.prepare("SELECT id FROM address_book WHERE user_id = ? AND address = ? AND city = ? AND zip = ?")
        .get(u.id, u.shipping_address, u.shipping_city, u.shipping_zip);
    if (!exists) {
        insert.run(u.id, 'Profile Address', u.name, u.phone, u.shipping_address, u.shipping_address2, u.shipping_city, u.shipping_state, u.shipping_zip);
        count++;
    }
}

console.log(`Address book migration done. ${count} profile address(es) added.`);
db.close();


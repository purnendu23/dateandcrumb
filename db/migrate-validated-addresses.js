const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'bakehouse.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS validated_addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address_hash TEXT NOT NULL UNIQUE,
    raw_address TEXT NOT NULL,
    raw_city TEXT NOT NULL,
    raw_state TEXT,
    raw_zip TEXT NOT NULL,
    validated_address TEXT,
    validated_city TEXT,
    validated_state TEXT,
    validated_zip TEXT,
    provider TEXT,
    confidence TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

console.log('Validated addresses table created.');
db.close();


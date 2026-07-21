-- Categories
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT
);

-- Products
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    image_url TEXT,
    category_id INTEGER,
    out_of_stock INTEGER NOT NULL DEFAULT 0,
    featured INTEGER NOT NULL DEFAULT 0,
    ingredients TEXT,
    nutritional_info TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    shipping_address TEXT NOT NULL,
    shipping_city TEXT NOT NULL,
    shipping_zip TEXT NOT NULL,
    total REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payment_method TEXT,
    payment_id TEXT,
    tracking_number TEXT,
    carrier TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Order items
CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    name TEXT,
    provider TEXT NOT NULL DEFAULT 'local',
    provider_id TEXT,
    verified INTEGER NOT NULL DEFAULT 0,
    verification_token TEXT,
    reset_token TEXT,
    reset_token_expires TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    phone TEXT,
    organization TEXT,
    shipping_address TEXT,
    shipping_address2 TEXT,
    shipping_city TEXT,
    shipping_state TEXT,
    shipping_zip TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired_at TEXT NOT NULL
);

-- Address Book
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

-- Validated Addresses (cache for address validation API results)
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

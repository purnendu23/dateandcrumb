-- Categories
CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT
) ENGINE=InnoDB;

-- Products
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    image_url TEXT,
    category_id INT,
    out_of_stock TINYINT(1) NOT NULL DEFAULT 0,
    featured TINYINT(1) NOT NULL DEFAULT 0,
    ingredients TEXT,
    nutritional_info TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB;

-- Orders
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL,
    customer_first_name VARCHAR(100),
    customer_last_name VARCHAR(100),
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50),
    shipping_address TEXT NOT NULL,
    shipping_address2 VARCHAR(255),
    shipping_city VARCHAR(255) NOT NULL,
    shipping_state VARCHAR(2),
    shipping_zip VARCHAR(20) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    sales_tax DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    tax_calculation_id VARCHAR(255),
    total DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    payment_method VARCHAR(50),
    payment_id VARCHAR(255),
    UNIQUE KEY ux_orders_payment_id (payment_id),
    tracking_number VARCHAR(255),
    carrier VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Order items
CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

-- Users
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    password_hash VARCHAR(255),
    name VARCHAR(255),
    provider VARCHAR(50) NOT NULL DEFAULT 'local',
    provider_id VARCHAR(255),
    verified TINYINT(1) NOT NULL DEFAULT 0,
    verification_token VARCHAR(255),
    reset_token VARCHAR(255),
    reset_token_expires DATETIME,
    is_admin TINYINT(1) NOT NULL DEFAULT 0,
    phone VARCHAR(50),
    organization VARCHAR(255),
    shipping_address TEXT,
    shipping_address2 TEXT,
    shipping_city VARCHAR(255),
    shipping_state VARCHAR(10),
    shipping_zip VARCHAR(20),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
    sid VARCHAR(255) PRIMARY KEY,
    sess TEXT NOT NULL,
    expired_at DATETIME NOT NULL
) ENGINE=InnoDB;

-- Address Book
CREATE TABLE IF NOT EXISTS address_book (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    label VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    name VARCHAR(255),
    phone VARCHAR(50),
    address TEXT NOT NULL,
    address2 TEXT,
    city VARCHAR(255) NOT NULL,
    state VARCHAR(10),
    zip VARCHAR(20) NOT NULL,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Validated Addresses (cache for address validation API results)
CREATE TABLE IF NOT EXISTS validated_addresses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    address_hash VARCHAR(64) NOT NULL UNIQUE,
    raw_address TEXT NOT NULL,
    raw_city VARCHAR(255) NOT NULL,
    raw_state VARCHAR(10),
    raw_zip VARCHAR(20) NOT NULL,
    validated_address TEXT,
    validated_city VARCHAR(255),
    validated_state VARCHAR(10),
    validated_zip VARCHAR(20),
    provider VARCHAR(50),
    confidence VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

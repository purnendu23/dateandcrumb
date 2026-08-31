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

-- Customers (buyer profile data separate from auth users)
CREATE TABLE IF NOT EXISTS customers (
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
) ENGINE=InnoDB;

-- Orders
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT,
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
    shipping_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    sales_tax DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    tax_calculation_id VARCHAR(255),
    total DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    payment_method VARCHAR(50),
    payment_id VARCHAR(255),
    UNIQUE KEY ux_orders_payment_id (payment_id),
    KEY ix_orders_customer_id (customer_id),
    tracking_number VARCHAR(255),
    carrier VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB;

-- Shipping labels (admin-triggered EasyPost labels)
CREATE TABLE IF NOT EXISTS shipping_labels (
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
    username VARCHAR(100) NOT NULL UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    password_hash VARCHAR(255),
    verified TINYINT(1) NOT NULL DEFAULT 0,
    reset_token VARCHAR(255),
    reset_token_expires DATETIME,
    is_admin TINYINT(1) NOT NULL DEFAULT 0,
    phone VARCHAR(50),
    organization VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Enterprise user registration requests (pending verification + admin approval)
CREATE TABLE IF NOT EXISTS user_registration_requests (
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
) ENGINE=InnoDB;

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
    sid VARCHAR(255) PRIMARY KEY,
    sess TEXT NOT NULL,
    expired_at DATETIME NOT NULL
) ENGINE=InnoDB;

-- Admin login attempt tracking (rate limiting + lockout)
CREATE TABLE IF NOT EXISTS admin_login_attempts (
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
) ENGINE=InnoDB;

-- Address Book
CREATE TABLE IF NOT EXISTS address_book (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
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
    FOREIGN KEY (customer_id) REFERENCES customers(id)
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

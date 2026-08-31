const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs/promises');

const STORAGE_ROOT = path.join(__dirname, '..', 'storage');
const SHIPPING_LABEL_DIR = path.join(STORAGE_ROOT, 'shipping-labels');
const EASYPOST_BASE_URL = 'https://api.easypost.com/v2';
const ENTERPRISE_DOMAIN = String(process.env.ENTERPRISE_EMAIL_DOMAIN || 'dateandcrumb.com')
    .trim()
    .toLowerCase();

function requireAdmin(req, res, next) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated.' });
    }
    if (req.user?.principal_type !== 'user' || !req.user.is_admin) {
        return res.status(403).json({ error: 'Access denied.' });
    }
    next();
}

router.use(requireAdmin);

function toLabelStatus(raw) {
    return String(raw || 'not_created').trim().toLowerCase();
}

function ensureEasyPostConfigured() {
    const apiKey = String(process.env.EASYPOST_API_KEY || '').trim();
    if (!apiKey) {
        const err = new Error('EasyPost is not configured.');
        err.statusCode = 503;
        throw err;
    }
    return apiKey;
}

function getFromAddress() {
    const line1 = String(process.env.EASYPOST_FROM_ADDRESS1 || '').trim();
    const city = String(process.env.EASYPOST_FROM_CITY || '').trim();
    const state = String(process.env.EASYPOST_FROM_STATE || '').trim();
    const zip = String(process.env.EASYPOST_FROM_ZIP || '').trim();
    const country = String(process.env.EASYPOST_FROM_COUNTRY || 'US').trim();

    if (!line1 || !city || !state || !zip) {
        const err = new Error('EasyPost sender address is incomplete.');
        err.statusCode = 503;
        throw err;
    }

    return {
        name: String(process.env.EASYPOST_FROM_NAME || 'Date&Crumb').trim(),
        company: String(process.env.EASYPOST_FROM_COMPANY || 'Date&Crumb').trim() || undefined,
        phone: String(process.env.EASYPOST_FROM_PHONE || '').trim() || undefined,
        street1: line1,
        street2: String(process.env.EASYPOST_FROM_ADDRESS2 || '').trim() || undefined,
        city,
        state,
        zip,
        country,
    };
}

function getParcel() {
    const weight = Number(process.env.EASYPOST_PARCEL_WEIGHT_OZ || 16);
    const length = Number(process.env.EASYPOST_PARCEL_LENGTH_IN || 10);
    const width = Number(process.env.EASYPOST_PARCEL_WIDTH_IN || 8);
    const height = Number(process.env.EASYPOST_PARCEL_HEIGHT_IN || 4);

    if (!Number.isFinite(weight) || weight <= 0) {
        const err = new Error('EASYPOST_PARCEL_WEIGHT_OZ must be a positive number.');
        err.statusCode = 500;
        throw err;
    }

    if (!Number.isFinite(length) || !Number.isFinite(width) || !Number.isFinite(height) ||
        length <= 0 || width <= 0 || height <= 0) {
        const err = new Error('EasyPost parcel dimensions must be positive numbers.');
        err.statusCode = 500;
        throw err;
    }

    return {
        weight,
        length,
        width,
        height,
    };
}

function getOrderRecipient(order) {
    const first = String(order.customer_first_name || '').trim();
    const last = String(order.customer_last_name || '').trim();
    const fallbackName = String(order.customer_name || '').trim();
    const name = `${first} ${last}`.trim() || fallbackName;
    const street1 = String(order.shipping_address || '').trim();
    const city = String(order.shipping_city || '').trim();
    const state = String(order.shipping_state || '').trim();
    const zip = String(order.shipping_zip || '').trim();

    if (!name || !street1 || !city || !state || !zip) {
        const err = new Error('Order is missing shipping fields required for label creation.');
        err.statusCode = 400;
        throw err;
    }

    return {
        name,
        street1,
        street2: String(order.shipping_address2 || '').trim() || undefined,
        city,
        state,
        zip,
        country: 'US',
        email: String(order.customer_email || '').trim() || undefined,
        phone: String(order.customer_phone || '').trim() || undefined,
    };
}

function pickLowestRate(rates) {
    if (!Array.isArray(rates) || rates.length === 0) return null;
    return rates.reduce((best, current) => {
        if (!best) return current;
        const bestRate = Number(best.rate);
        const currentRate = Number(current.rate);
        if (!Number.isFinite(currentRate)) return best;
        if (!Number.isFinite(bestRate)) return current;
        return currentRate < bestRate ? current : best;
    }, null);
}

async function easypostRequest(apiKey, method, endpoint, payload) {
    const response = await fetch(`${EASYPOST_BASE_URL}${endpoint}`, {
        method,
        headers: {
            Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
            'Content-Type': 'application/json',
        },
        body: payload ? JSON.stringify(payload) : undefined,
    });

    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : {};
    } catch (parseErr) {
        data = { error: { message: text || 'Invalid JSON response from EasyPost.' } };
    }

    if (!response.ok) {
        const message = data?.error?.message || `EasyPost request failed with status ${response.status}.`;
        const err = new Error(message);
        err.statusCode = 502;
        throw err;
    }

    return data;
}

async function createEasyPostLabel(order) {
    const apiKey = ensureEasyPostConfigured();
    const toAddress = getOrderRecipient(order);
    const fromAddress = getFromAddress();
    const parcel = getParcel();

    const shipment = await easypostRequest(apiKey, 'POST', '/shipments', {
        shipment: {
            to_address: toAddress,
            from_address: fromAddress,
            parcel,
        },
    });

    const chosenRate = pickLowestRate(shipment.rates);
    if (!chosenRate?.id) {
        const err = new Error('No purchasable shipping rates were returned by EasyPost.');
        err.statusCode = 502;
        throw err;
    }

    const purchased = await easypostRequest(apiKey, 'POST', `/shipments/${shipment.id}/buy`, {
        rate: { id: chosenRate.id },
        label_format: 'PDF',
    });

    // Prefer PDF, fall back to ZPL, then PNG
    const labelUrl =
        purchased?.postage_label?.label_pdf_url ||
        purchased?.postage_label?.label_zpl_url ||
        purchased?.postage_label?.label_url ||
        null;

    if (!labelUrl) {
        const err = new Error('EasyPost did not return a printable label URL.');
        err.statusCode = 502;
        throw err;
    }

    return {
        shipmentId: purchased.id || shipment.id,
        postageLabelId: purchased?.postage_label?.id || null,
        rateId: purchased?.selected_rate?.id || chosenRate.id || null,
        carrier: purchased?.selected_rate?.carrier || chosenRate.carrier || null,
        service: purchased?.selected_rate?.service || chosenRate.service || null,
        trackingCode: purchased?.tracking_code || purchased?.tracker?.tracking_code || null,
        trackerUrl: purchased?.tracker?.public_url || null,
        labelUrl,
    };
}

const LABEL_CONTENT_TYPES = {
    'application/pdf': { ext: 'pdf', format: 'pdf', mime: 'application/pdf' },
    'image/png': { ext: 'png', format: 'png', mime: 'image/png' },
    'image/jpeg': { ext: 'jpg', format: 'jpg', mime: 'image/jpeg' },
};

async function saveLabelPdf(orderId, labelUrl) {
    const response = await fetch(labelUrl);
    if (!response.ok) {
        throw new Error(`Unable to download label file (status ${response.status}).`);
    }

    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const typeInfo = LABEL_CONTENT_TYPES[contentType] || { ext: 'pdf', format: 'pdf', mime: 'application/pdf' };

    const arrayBuffer = await response.arrayBuffer();
    const data = Buffer.from(arrayBuffer);

    await fs.mkdir(SHIPPING_LABEL_DIR, { recursive: true });
    const filename = `order-${orderId}-${Date.now()}.${typeInfo.ext}`;
    const absolutePath = path.join(SHIPPING_LABEL_DIR, filename);
    await fs.writeFile(absolutePath, data);

    return {
        storagePath: path.join('shipping-labels', filename),
        format: typeInfo.format,
        mime: typeInfo.mime,
    };
}

function resolveStoredLabelPath(relativeStoragePath) {
    const normalized = String(relativeStoragePath || '').trim();
    if (!normalized) return null;

    const absolutePath = path.resolve(STORAGE_ROOT, normalized);
    const storageRootWithSlash = `${path.resolve(STORAGE_ROOT)}${path.sep}`;
    if (!absolutePath.startsWith(storageRootWithSlash)) {
        return null;
    }

    return absolutePath;
}

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
    const db = req.app.locals.db;
    const [[{ count: totalOrders }]] = await db.execute('SELECT COUNT(*) AS count FROM orders');
    const [[{ count: pendingOrders }]] = await db.execute(
        "SELECT COUNT(*) AS count FROM orders WHERE LOWER(TRIM(COALESCE(status, ''))) = 'pending'"
    );
    const [[{ sum: totalRevenue }]] = await db.execute('SELECT COALESCE(SUM(total), 0) AS sum FROM orders');
    const [[{ count: totalUsers }]] = await db.execute('SELECT COUNT(*) AS count FROM users');
    const [[{ count: totalProducts }]] = await db.execute('SELECT COUNT(*) AS count FROM products');
    const [[{ count: pendingUserApprovals }]] = await db.execute(
        "SELECT COUNT(*) AS count FROM user_registration_requests WHERE status = 'pending_admin_approval'"
    );
    const [pendingProduction] = await db.execute(`
        SELECT
            oi.product_id,
            p.name AS product_name,
            SUM(oi.quantity) AS total_boxes
        FROM order_items oi
        INNER JOIN orders o ON o.id = oi.order_id
        LEFT JOIN products p ON p.id = oi.product_id
        WHERE LOWER(TRIM(COALESCE(o.status, ''))) = 'pending'
        GROUP BY oi.product_id, p.name
        ORDER BY total_boxes DESC, p.name ASC
    `);

    res.json({ totalOrders, pendingOrders, totalRevenue, totalUsers, totalProducts, pendingUserApprovals, pendingProduction });
});

// GET /api/admin/orders
router.get('/orders', async (req, res) => {
    const db = req.app.locals.db;
    try {
        const [orders] = await db.execute(`
            SELECT o.*,
                sl.status AS label_status,
                sl.label_storage_path,
                sl.error_message AS label_error,
                sl.tracking_code AS label_tracking_code,
                sl.tracker_url AS label_tracker_url,
                sl.carrier AS label_carrier,
                sl.service AS label_service,
                (
                    SELECT GROUP_CONCAT(CONCAT(oi.product_id, ':', p.name, ':', oi.quantity, ':', oi.unit_price) SEPARATOR '|')
                    FROM order_items oi
                    LEFT JOIN products p ON oi.product_id = p.id
                    WHERE oi.order_id = o.id
                ) AS items
            FROM orders o
            LEFT JOIN shipping_labels sl ON sl.order_id = o.id
                ORDER BY
                    CASE
                        WHEN LOWER(o.status) = 'pending' THEN 1
                        WHEN LOWER(o.status) = 'shipped' THEN 2
                        WHEN LOWER(o.status) = 'cancelled' THEN 3
                        ELSE 4
                    END,
                    o.id ASC
        `);

        for (const order of orders) {
            order.items = order.items ? order.items.split('|').map(item => {
                const [product_id, name, quantity, unit_price] = item.split(':');
                return { product_id: +product_id, name, quantity: +quantity, unit_price: +unit_price };
            }) : [];
        }

        res.json(orders);
    } catch (err) {
        console.error('GET /orders error:', err.message);
        res.status(500).json({ error: 'Failed to load orders.' });
    }
});

// POST /api/admin/orders/:id/shipping-label
router.post('/orders/:id/shipping-label', async (req, res) => {
    const db = req.app.locals.db;
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) return res.status(400).json({ error: 'Invalid order ID.' });

    try {
        ensureEasyPostConfigured();
    } catch (err) {
        return res.status(err.statusCode || 500).json({ error: err.message });
    }

    const [orders] = await db.execute(
        `SELECT
            id, status, customer_name, customer_first_name, customer_last_name,
            customer_email, customer_phone,
            shipping_address, shipping_address2, shipping_city, shipping_state, shipping_zip
         FROM orders
         WHERE id = ?
         LIMIT 1`,
        [orderId]
    );
    const order = orders[0];
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (String(order.status || '').toLowerCase() === 'cancelled') {
        return res.status(400).json({ error: 'Cannot create a label for a cancelled order.' });
    }

    // Ownership gate for create action:
    // 1) First creator inserts 'creating'
    // 2) Retry transitions failed/not_created -> creating
    // 3) If already creating/ready, we short-circuit
    const [insertResult] = await db.execute(
        `INSERT IGNORE INTO shipping_labels (order_id, status, error_message)
         VALUES (?, 'creating', NULL)`,
        [orderId]
    );

    let hasCreateLock = insertResult.affectedRows === 1;

    if (!hasCreateLock) {
        const [updateResult] = await db.execute(
            `UPDATE shipping_labels
             SET status = 'creating', error_message = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE order_id = ?
               AND status IN ('not_created', 'failed')`,
            [orderId]
        );
        hasCreateLock = updateResult.affectedRows === 1;
    }

    if (!hasCreateLock) {
        const [existingRows] = await db.execute(
            `SELECT status, tracking_code, carrier, service
             FROM shipping_labels
             WHERE order_id = ?
             LIMIT 1`,
            [orderId]
        );
        const existing = existingRows[0];
        const status = toLabelStatus(existing?.status);

        if (status === 'ready') {
            return res.status(200).json({
                message: 'Label already exists.',
                status,
                tracking_code: existing.tracking_code || null,
                carrier: existing.carrier || null,
                service: existing.service || null,
            });
        }

        if (status === 'creating') {
            return res.status(409).json({
                error: 'Label creation is already in progress.',
                status,
            });
        }

        return res.status(409).json({
            error: 'Label cannot be created right now.',
            status,
        });
    }

    try {
        const purchasedLabel = await createEasyPostLabel(order);
        const stored = await saveLabelPdf(orderId, purchasedLabel.labelUrl);

        await db.execute(
            `UPDATE shipping_labels
             SET status = 'ready',
                 easypost_shipment_id = ?,
                 easypost_postage_label_id = ?,
                 easypost_rate_id = ?,
                 carrier = ?,
                 service = ?,
                 tracking_code = ?,
                 tracker_url = ?,
                 label_url = ?,
                 label_storage_path = ?,
                 label_format = ?,
                 error_message = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE order_id = ?`,
            [
                purchasedLabel.shipmentId,
                purchasedLabel.postageLabelId,
                purchasedLabel.rateId,
                purchasedLabel.carrier,
                purchasedLabel.service,
                purchasedLabel.trackingCode,
                purchasedLabel.trackerUrl,
                purchasedLabel.labelUrl,
                stored.storagePath,
                stored.format,
                orderId,
            ]
        );

        if (purchasedLabel.trackingCode) {
            await db.execute(
                `UPDATE orders SET status = 'shipped' WHERE id = ? AND status NOT IN ('shipped', 'cancelled')`,
                [orderId]
            );
        }

        return res.json({
            message: 'Shipping label created.',
            status: 'ready',
            tracking_code: purchasedLabel.trackingCode,
            carrier: purchasedLabel.carrier,
            service: purchasedLabel.service,
        });
    } catch (err) {
        const message = err.message || 'Failed to create shipping label.';
        await db.execute(
            `UPDATE shipping_labels
             SET status = 'failed',
                 error_message = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE order_id = ?`,
            [message.slice(0, 1000), orderId]
        );

        return res.status(err.statusCode || 502).json({
            error: message,
            status: 'failed',
        });
    }
});

// POST /api/admin/orders/:id/custom-delivery
router.post('/orders/:id/custom-delivery', async (req, res) => {
    const db = req.app.locals.db;
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) return res.status(400).json({ error: 'Invalid order ID.' });

    const [rows] = await db.execute(
        'SELECT status FROM orders WHERE id = ? LIMIT 1',
        [orderId]
    );
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const currentStatus = String(order.status || '').trim().toLowerCase();
    if (currentStatus === 'cancelled') {
        return res.status(400).json({ error: 'Cannot mark a cancelled order for custom delivery.' });
    }
    if (currentStatus === 'shipped') {
        return res.json({ message: 'Order already shipped.' });
    }

    await db.execute(
        `UPDATE orders
         SET status = 'shipped',
             carrier = 'Custom Delivery',
             tracking_number = NULL
         WHERE id = ?`,
        [orderId]
    );

    return res.json({ message: 'Order marked as shipped via custom delivery.' });
});

// GET /api/admin/orders/:id/shipping-label
router.get('/orders/:id/shipping-label', async (req, res) => {
    const db = req.app.locals.db;
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) return res.status(400).json({ error: 'Invalid order ID.' });

    const [rows] = await db.execute(
        `SELECT status, label_storage_path, label_format
         FROM shipping_labels
         WHERE order_id = ?
         LIMIT 1`,
        [orderId]
    );
    const label = rows[0];
    if (!label) {
        return res.status(404).json({ error: 'Shipping label has not been created yet.' });
    }
    if (toLabelStatus(label.status) !== 'ready') {
        return res.status(409).json({ error: `Shipping label is ${label.status}.` });
    }

    const absolutePath = resolveStoredLabelPath(label.label_storage_path);
    if (!absolutePath) {
        return res.status(500).json({ error: 'Stored label path is invalid.' });
    }

    try {
        await fs.access(absolutePath);
    } catch (err) {
        return res.status(404).json({ error: 'Stored label file is missing.' });
    }

    const fmt = String(label.label_format || 'pdf').toLowerCase();
    const typeInfo = Object.values(LABEL_CONTENT_TYPES).find(t => t.format === fmt)
        || LABEL_CONTENT_TYPES['application/pdf'];
    const ext = typeInfo.ext;

    res.setHeader('Content-Type', typeInfo.mime);
    res.setHeader('Content-Disposition', `attachment; filename="label-order-${orderId}.${ext}"`);
    return res.sendFile(absolutePath);
});

// PATCH /api/admin/orders/:id/status
router.patch('/orders/:id/status', async (req, res) => {
    const db = req.app.locals.db;
    const { status } = req.body;
    const validStatuses = ['pending', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be pending or cancelled.' });
    }
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID.' });

    const [rows] = await db.execute('SELECT status FROM orders WHERE id = ?', [id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    if (order.status === 'cancelled') {
        return res.status(400).json({ error: 'A cancelled order cannot be changed.' });
    }
    if (order.status === 'shipped' && status !== 'cancelled') {
        return res.status(400).json({ error: 'A shipped order can only be cancelled.' });
    }

    await db.execute('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
    res.json({ message: 'Status updated.' });
});

// PATCH /api/admin/orders/:id/tracking
router.patch('/orders/:id/tracking', async (req, res) => {
    const db = req.app.locals.db;
    const { tracking_number, carrier } = req.body;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID.' });

    await db.execute('UPDATE orders SET tracking_number = ?, carrier = ? WHERE id = ?',
        [tracking_number || null, carrier || null, id]);
    res.json({ message: 'Tracking info updated.' });
});

// GET /api/admin/user-requests
router.get('/user-requests', async (req, res) => {
    const db = req.app.locals.db;
    const [requests] = await db.execute(
        `SELECT id, email, username, first_name, last_name, status, email_verified_at, created_at
         FROM user_registration_requests
         WHERE status IN ('pending_admin_approval', 'pending_verification')
         ORDER BY created_at DESC`
    );
    res.json(requests);
});

// POST /api/admin/user-requests/:id/approve
router.post('/user-requests/:id/approve', async (req, res) => {
    const db = req.app.locals.db;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid request ID.' });

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [rows] = await conn.execute(
            `SELECT id, email, username, first_name, last_name, password_hash, status
             FROM user_registration_requests
             WHERE id = ?
             FOR UPDATE`,
            [id]
        );
        const requestRow = rows[0];
        if (!requestRow) {
            await conn.rollback();
            return res.status(404).json({ error: 'Registration request not found.' });
        }
        if (requestRow.status !== 'pending_admin_approval') {
            await conn.rollback();
            return res.status(409).json({ error: 'This request is not ready for approval.' });
        }
        if (!String(requestRow.email || '').toLowerCase().endsWith(`@${ENTERPRISE_DOMAIN}`)) {
            await conn.rollback();
            return res.status(400).json({ error: `Only @${ENTERPRISE_DOMAIN} emails can be approved.` });
        }

        const [existingEmail] = await conn.execute(
            'SELECT id FROM users WHERE email = ? LIMIT 1',
            [requestRow.email]
        );
        if (existingEmail.length > 0) {
            await conn.rollback();
            return res.status(409).json({ error: 'A user with this email already exists.' });
        }
        const [existingUsername] = await conn.execute(
            'SELECT id FROM users WHERE username = ? LIMIT 1',
            [requestRow.username]
        );
        if (existingUsername.length > 0) {
            await conn.rollback();
            return res.status(409).json({ error: 'A user with this username already exists.' });
        }

        await conn.execute(
            `INSERT INTO users (
                email, username, first_name, last_name, password_hash,
                verified, is_admin, phone, organization
             ) VALUES (?, ?, ?, ?, ?, 1, 0, NULL, NULL)`,
            [
                requestRow.email,
                requestRow.username,
                requestRow.first_name || null,
                requestRow.last_name || null,
                requestRow.password_hash,
            ]
        );

        await conn.execute(
            `UPDATE user_registration_requests
             SET status = 'approved',
                 approved_by_user_id = ?,
                 approved_at = NOW(),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [req.user.id, id]
        );

        await conn.commit();
        return res.json({ message: 'User approved and created.' });
    } catch (err) {
        await conn.rollback();
        console.error('Failed to approve user request:', err);
        return res.status(500).json({ error: 'Failed to approve user request.' });
    } finally {
        conn.release();
    }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
    const db = req.app.locals.db;
    const [users] = await db.execute(
        'SELECT id, email, username, first_name, last_name, verified, is_admin, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(users);
});

// GET /api/admin/products
router.get('/products', async (req, res) => {
    const db = req.app.locals.db;
    const [products] = await db.execute(`
        SELECT p.*, c.name AS category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        ORDER BY p.name
    `);
    res.json(products);
});

// PATCH /api/admin/products/:id/out-of-stock
router.patch('/products/:id/out-of-stock', async (req, res) => {
    const db = req.app.locals.db;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID.' });
    const outOfStock = req.body.out_of_stock ? 1 : 0;
    await db.execute('UPDATE products SET out_of_stock = ? WHERE id = ?', [outOfStock, id]);
    res.json({ message: 'Product updated.' });
});

module.exports = router;

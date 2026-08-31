const express = require('express');
const router = express.Router();
const { sendOrderConfirmation } = require('../config/mailer');

// ========================================================
// Stripe setup
// ========================================================
let stripe = null;

if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} else {
    console.log('Stripe not configured — set STRIPE_SECRET_KEY env var.');
}

const SHIPPING_FLAT_RATE = 4.99;
const FREE_SHIPPING_THRESHOLD = 50;

// ========================================================
// Helpers
// ========================================================

function normalizeText(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function normalizeState(value) {
    return String(value || '').trim().toUpperCase();
}

function normalizePostalCode(value) {
    return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function buildFullName(firstName, lastName) {
    const full = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim();
    return full;
}

function addressesMatch(a, b) {
    if (!a || !b) return false;

    return (
        normalizeText(a.line1) === normalizeText(b.line1) &&
        normalizeText(a.line2) === normalizeText(b.line2) &&
        normalizeText(a.city) === normalizeText(b.city) &&
        normalizeState(a.state) === normalizeState(b.state) &&
        normalizePostalCode(a.postal_code) === normalizePostalCode(b.postal_code) &&
        normalizeState(a.country || 'US') === normalizeState(b.country || 'US')
    );
}

function normalizeCartForComparison(items) {
    const totals = new Map();

    for (const item of items || []) {
        const productId = parseInt(item.product_id, 10);
        const quantity = parseInt(item.quantity, 10);

        if (!Number.isInteger(productId) || productId <= 0) {
            throw new Error('Invalid product ID.');
        }

        if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 100) {
            throw new Error('Invalid quantity.');
        }

        totals.set(productId, (totals.get(productId) || 0) + quantity);
    }

    return Array.from(totals.entries())
        .map(([product_id, quantity]) => ({ product_id, quantity }))
        .sort((a, b) => a.product_id - b.product_id);
}

function cartsMatch(a, b) {
    const left = normalizeCartForComparison(a);
    const right = normalizeCartForComparison(b);

    if (left.length !== right.length) return false;

    return left.every((item, index) =>
        item.product_id === right[index].product_id &&
        item.quantity === right[index].quantity
    );
}

async function getPaidItemsFromTaxCalculation(taxCalculationId) {
    const list = await stripe.tax.calculations.listLineItems(
        taxCalculationId,
        { limit: 100 }
    );

    if (list.has_more) {
        throw new Error('Tax calculation contains too many line items.');
    }

    const paidItems = [];
    let subtotalInCents = 0;

    for (const line of list.data) {
        const match = /^product:(\d+):line:(\d+)$/.exec(String(line.reference || ''));

        if (!match) {
            throw new Error('Tax calculation contains an invalid line-item reference.');
        }

        const productId = parseInt(match[1], 10);
        const quantity = parseInt(line.quantity || 1, 10);
        const lineAmountInCents = Number(line.amount);

        if (
            !Number.isInteger(productId) || productId <= 0 ||
            !Number.isInteger(quantity) || quantity <= 0 ||
            !Number.isInteger(lineAmountInCents) || lineAmountInCents < 0
        ) {
            throw new Error('Tax calculation contains invalid line-item data.');
        }

        if (line.tax_behavior !== 'exclusive') {
            throw new Error('Unexpected tax behavior on the paid line item.');
        }

        if (lineAmountInCents % quantity !== 0) {
            throw new Error('Unable to determine the paid unit price for an order item.');
        }

        paidItems.push({
            product_id: productId,
            quantity,
            unit_price: (lineAmountInCents / quantity) / 100,
        });

        subtotalInCents += lineAmountInCents;
    }

    if (paidItems.length === 0) {
        throw new Error('The completed payment does not contain any order items.');
    }

    return { paidItems, subtotalInCents };
}

function getStoredPaymentMethod(requestedMethod) {
    const allowed = new Set(['stripe', 'google_pay', 'apple_pay']);
    return allowed.has(requestedMethod) ? requestedMethod : 'stripe';
}

function formatCardBrand(brand) {
    return String(brand || '')
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function getPaymentDisplayName(method) {
    if (method === 'apple_pay') return 'Apple Pay';
    if (method === 'google_pay') return 'Google Pay';
    return 'Credit / Debit Card';
}

function getShippingChargeInCents(subtotalInCents) {
    return subtotalInCents <= Math.round(FREE_SHIPPING_THRESHOLD * 100)
        ? Math.round(SHIPPING_FLAT_RATE * 100)
        : 0;
}

async function upsertCustomerInTransaction(conn, {
    email,
    firstName,
    lastName,
    fullName,
    phone,
    shippingAddress,
    shippingAddress2,
    shippingCity,
    shippingState,
    shippingZip,
}) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedFirstName = String(firstName || '').trim() || null;
    const normalizedLastName = String(lastName || '').trim() || null;
    const normalizedFullName = String(fullName || '').trim() || null;
    const normalizedPhone = String(phone || '').trim() || null;
    const normalizedAddress = String(shippingAddress || '').trim() || null;
    const normalizedAddress2 = String(shippingAddress2 || '').trim() || null;
    const normalizedCity = String(shippingCity || '').trim() || null;
    const normalizedState = normalizeState(shippingState) || null;
    const normalizedZip = normalizePostalCode(shippingZip) || null;

    const [rows] = await conn.execute(
        'SELECT id FROM customers WHERE email = ? LIMIT 1 FOR UPDATE',
        [normalizedEmail]
    );

    if (rows.length > 0) {
        const existing = rows[0];
        await conn.execute(
            `UPDATE customers
             SET first_name = ?,
                 last_name = ?,
                 full_name = ?,
                 phone = ?,
                 shipping_address = ?,
                 shipping_address2 = ?,
                 shipping_city = ?,
                 shipping_state = ?,
                 shipping_zip = ?,
                 last_order_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                normalizedFirstName,
                normalizedLastName,
                normalizedFullName,
                normalizedPhone,
                normalizedAddress,
                normalizedAddress2,
                normalizedCity,
                normalizedState,
                normalizedZip,
                existing.id,
            ]
        );
        return existing.id;
    }

    const [insertResult] = await conn.execute(
        `INSERT INTO customers (
            email,
            verified,
            first_name,
            last_name,
            full_name,
            phone,
            shipping_address,
            shipping_address2,
            shipping_city,
            shipping_state,
            shipping_zip,
            last_order_at
         ) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
            normalizedEmail,
            normalizedFirstName,
            normalizedLastName,
            normalizedFullName,
            normalizedPhone,
            normalizedAddress,
            normalizedAddress2,
            normalizedCity,
            normalizedState,
            normalizedZip,
        ]
    );
    return insertResult.insertId;
}

function queuePostOrderTasks({
    db,
    orderId,
    addressBookCustomerId,
    customerEmail,
    verifiedName,
    verifiedPhone,
    verifiedAddress,
    verifiedAddress2,
    verifiedCity,
    verifiedState,
    verifiedZip,
    requestedFirstName,
    requestedLastName,
    subtotal,
    salesTax,
    total,
    paymentType,
    paymentIntent,
}) {
    setImmediate(async () => {
        const shippingCharge = 0;
        let paymentBrand = null;
        let paymentLast4 = null;
        const expandedPaymentMethod = paymentIntent.payment_method;

        if (expandedPaymentMethod && typeof expandedPaymentMethod === 'object') {
            paymentBrand = expandedPaymentMethod.card?.brand || null;
            paymentLast4 = expandedPaymentMethod.card?.last4 || null;
        } else if (typeof expandedPaymentMethod === 'string' && expandedPaymentMethod.startsWith('pm_')) {
            try {
                const pm = await stripe.paymentMethods.retrieve(expandedPaymentMethod);
                paymentBrand = pm?.card?.brand || null;
                paymentLast4 = pm?.card?.last4 || null;
            } catch (pmErr) {
                console.error('Unable to retrieve payment method details for email:', pmErr.message);
            }
        }

        if (!paymentBrand || !paymentLast4) {
            const chargeCard = paymentIntent.latest_charge?.payment_method_details?.card;
            if (chargeCard) {
                paymentBrand = paymentBrand || chargeCard.brand || null;
                paymentLast4 = paymentLast4 || chargeCard.last4 || null;
            }
        }

        const orderNumber = `#DC-${orderId}`;
        const paymentDisplay = paymentLast4
            ? `${formatCardBrand(paymentBrand) || 'Card'} •••• ${paymentLast4}`
            : getPaymentDisplayName(paymentType);

        try {
            const [emailItems] = await db.execute(
                `SELECT oi.quantity, oi.unit_price, p.name
                 FROM order_items oi
                 JOIN products p ON oi.product_id = p.id
                 WHERE oi.order_id = ?
                 ORDER BY oi.id ASC`,
                [orderId]
            );

            await sendOrderConfirmation({
                customerName: verifiedName,
                customerEmail,
                orderNumber,
                orderDate: new Date(),
                items: emailItems.map((item) => {
                    const quantity = Number(item.quantity || 0);
                    const unitPrice = Number(item.unit_price || 0);
                    return {
                        name: item.name,
                        quantity,
                        unitPrice,
                        lineTotal: quantity * unitPrice,
                    };
                }),
                subtotal,
                shipping: shippingCharge,
                tax: salesTax,
                total,
                shippingAddress: {
                    name: verifiedName,
                    line1: verifiedAddress,
                    line2: verifiedAddress2 || '',
                    city: verifiedCity,
                    state: verifiedState,
                    zip: verifiedZip,
                },
                paymentMethod: {
                    type: paymentType,
                    brand: paymentBrand,
                    last4: paymentLast4,
                    display: paymentDisplay,
                },
            });
        } catch (emailErr) {
            console.error('Failed to send order confirmation email:', emailErr.message);
        }

        if (addressBookCustomerId) {
            try {
                const [existing] = await db.execute(
                    `SELECT id
                     FROM address_book
                     WHERE customer_id = ?
                       AND address = ?
                       AND city = ?
                       AND state = ?
                       AND zip = ?`,
                    [addressBookCustomerId, verifiedAddress, verifiedCity, verifiedState, verifiedZip]
                );

                if (existing.length === 0) {
                    await db.execute(
                        `INSERT INTO address_book (
                           customer_id, label, first_name, last_name, name, phone,
                            address, address2, city, state, zip
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                           addressBookCustomerId,
                           null,
                           requestedFirstName || null,
                           requestedLastName || null,
                           verifiedName,
                            verifiedPhone,
                            verifiedAddress,
                            verifiedAddress2,
                            verifiedCity,
                            verifiedState,
                            verifiedZip,
                        ]
                    );
                }
            } catch (addrErr) {
                console.error('Failed to save address to address book:', addrErr.message);
            }
        }
    });
}

// ========================================================
// POST /api/orders
// Creates the DB order only after independently verifying Stripe.
// ========================================================
router.post('/', async (req, res) => {
    const db = req.app.locals.db;

    const {
        customer_first_name,
        customer_last_name,
        customer_name,
        customer_email,
        customer_phone,
        shipping_address,
        shipping_address2,
        shipping_city,
        shipping_state,
        shipping_zip,
        items,
        payment_method,
        payment_id,
    } = req.body;
    const requestedFirstName = String(customer_first_name || '').trim();
    const requestedLastName = String(customer_last_name || '').trim();
    const normalizedCustomerEmail = normalizeEmail(customer_email);

    if (
        !requestedFirstName ||
        !requestedLastName ||
        !customer_email ||
        !shipping_address ||
        !shipping_city ||
        !shipping_state ||
        !shipping_zip
    ) {
        return res.status(400).json({
            error: 'Missing required customer/shipping fields',
        });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            error: 'Order must contain at least one item',
        });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) {
        return res.status(400).json({ error: 'Invalid email address' });
    }

    if (!stripe) {
        return res.status(503).json({ error: 'Stripe is not configured.' });
    }

    if (!payment_id || !String(payment_id).startsWith('pi_')) {
        return res.status(400).json({ error: 'A valid Stripe payment is required.' });
    }

    try {
        // Idempotency at the application level: if the browser retries after
        // success, return the already-created order instead of duplicating it.
        const [existingOrders] = await db.execute(
            'SELECT id, subtotal, shipping_cost, sales_tax, total FROM orders WHERE payment_id = ? LIMIT 1',
            [payment_id]
        );

        if (existingOrders.length > 0) {
            const existing = existingOrders[0];
            return res.status(200).json({
                message: 'Order already placed',
                order_id: existing.id,
                subtotal: Number(existing.subtotal).toFixed(2),
                shipping_cost: Number(existing.shipping_cost || 0).toFixed(2),
                sales_tax: Number(existing.sales_tax).toFixed(2),
                total: Number(existing.total).toFixed(2),
            });
        }

        // Retrieve the payment from Stripe; never trust a payment status or
        // amount supplied by the browser.
        const paymentIntent = await stripe.paymentIntents.retrieve(payment_id, {
            expand: ['latest_charge', 'payment_method'],
        });

        if (paymentIntent.status !== 'succeeded') {
            return res.status(400).json({ error: 'Payment has not been completed.' });
        }

        if (paymentIntent.currency !== 'usd') {
            return res.status(400).json({ error: 'Invalid payment currency.' });
        }

        if (
            paymentIntent.receipt_email &&
            normalizeText(paymentIntent.receipt_email) !== normalizeText(normalizedCustomerEmail)
        ) {
            return res.status(400).json({
                error: 'The order email does not match the completed payment.',
            });
        }

        const taxCalculationId =
            paymentIntent.hooks?.inputs?.tax?.calculation ||
            paymentIntent.metadata?.tax_calculation_id ||
            null;

        if (!taxCalculationId) {
            console.error('PaymentIntent has no Stripe Tax calculation:', payment_id);
            return res.status(400).json({
                error: 'Unable to verify sales tax for this payment.',
            });
        }

        const taxCalculation = await stripe.tax.calculations.retrieve(taxCalculationId);

        if (taxCalculation.currency !== 'usd') {
            return res.status(400).json({ error: 'Invalid tax calculation currency.' });
        }

        const { paidItems, subtotalInCents } =
            await getPaidItemsFromTaxCalculation(taxCalculationId);
        const salesTaxInCents = Number(taxCalculation.tax_amount_exclusive || 0);
        const shippingInCents = getShippingChargeInCents(subtotalInCents);
        const expectedAmountInCents = Number(taxCalculation.amount_total) + shippingInCents;

        if (expectedAmountInCents !== Number(paymentIntent.amount_received)) {
            console.error('Stripe amount mismatch:', {
                taxTotal: taxCalculation.amount_total,
                shipping: shippingInCents,
                amountReceived: paymentIntent.amount_received,
            });

            return res.status(400).json({
                error: 'Payment amount could not be verified.',
            });
        }

        const stripeShipping = paymentIntent.shipping?.address;
        if (!stripeShipping) {
            return res.status(400).json({
                error: 'Payment does not contain a shipping address.',
            });
        }

        const requestShipping = {
            line1: shipping_address,
            line2: shipping_address2 || '',
            city: shipping_city,
            state: shipping_state,
            postal_code: shipping_zip,
            country: 'US',
        };

        if (!addressesMatch(stripeShipping, requestShipping)) {
            return res.status(400).json({
                error: 'Shipping address changed after payment. Please contact support if you were charged.',
            });
        }

        // Also verify that the shipping destination used by Stripe Tax is the
        // same destination stored on the completed PaymentIntent.
        if (!addressesMatch(taxCalculation.customer_details?.address, stripeShipping)) {
            return res.status(400).json({
                error: 'The tax destination does not match the completed payment.',
            });
        }

        if (!cartsMatch(items, paidItems)) {
            return res.status(400).json({
                error: 'Order items do not match the completed payment.',
            });
        }
        const totalInCents = Number(paymentIntent.amount_received);

        if (subtotalInCents + salesTaxInCents + shippingInCents !== totalInCents) {
            return res.status(400).json({
                error: 'Order subtotal, shipping, and tax do not match the completed payment.',
            });
        }

        const subtotal = subtotalInCents / 100;
        const shippingCost = shippingInCents / 100;
        const salesTax = salesTaxInCents / 100;
        const total = totalInCents / 100;
        const requestedFullName = buildFullName(requestedFirstName, requestedLastName) || String(customer_name || '').trim();
        const paymentShippingName = String(paymentIntent.shipping?.name || '').trim();
        if (paymentShippingName && requestedFullName && normalizeText(paymentShippingName) !== normalizeText(requestedFullName)) {
            return res.status(400).json({
                error: 'The order name does not match the completed payment.',
            });
        }

        // Preserve the shipping data that Stripe actually charged for.
        const verifiedName = paymentShippingName || requestedFullName;
        const verifiedPhone = paymentIntent.shipping?.phone || customer_phone || null;
        const verifiedAddress = stripeShipping.line1;
        const verifiedAddress2 = stripeShipping.line2 || null;
        const verifiedCity = stripeShipping.city;
        const verifiedState = normalizeState(stripeShipping.state);
        const verifiedZip = stripeShipping.postal_code;

        const conn = await db.getConnection();

        try {
            await conn.beginTransaction();

            // Confirm all referenced products still exist. We deliberately do
            // NOT reject an already-paid order merely because a product became
            // marked out of stock after the payment completed.
            for (const item of paidItems) {
                const [rows] = await conn.execute(
                    'SELECT id FROM products WHERE id = ?',
                    [item.product_id]
                );

                if (!rows[0]) {
                    throw new Error(`Product ${item.product_id} no longer exists.`);
                }
            }

            const customerId = await upsertCustomerInTransaction(conn, {
                email: normalizedCustomerEmail,
                firstName: requestedFirstName,
                lastName: requestedLastName,
                fullName: verifiedName,
                phone: verifiedPhone,
                shippingAddress: verifiedAddress,
                shippingAddress2: verifiedAddress2,
                shippingCity: verifiedCity,
                shippingState: verifiedState,
                shippingZip: verifiedZip,
            });

            const [orderResult] = await conn.execute(
                `INSERT INTO orders (
                    customer_id,
                    customer_name,
                    customer_first_name,
                    customer_last_name,
                    customer_email,
                    customer_phone,
                    shipping_address,
                    shipping_address2,
                    shipping_city,
                    shipping_state,
                    shipping_zip,
                    subtotal,
                    shipping_cost,
                    sales_tax,
                    total,
                    payment_method,
                    payment_id,
                    tax_calculation_id
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                   [
                    customerId,
                    verifiedName,
                    requestedFirstName || null,
                    requestedLastName || null,
                    normalizedCustomerEmail,
                    verifiedPhone,
                    verifiedAddress,
                    verifiedAddress2,
                    verifiedCity,
                    verifiedState,
                    verifiedZip,
                    subtotal,
                    shippingCost,
                    salesTax,
                    total,
                    getStoredPaymentMethod(payment_method),
                    paymentIntent.id,
                    taxCalculationId,
                ]
            );

            const orderId = orderResult.insertId;

            for (const item of paidItems) {
                await conn.execute(
                    'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
                    [orderId, item.product_id, item.quantity, item.unit_price]
                );
            }

            await conn.commit();

            const paymentType = getStoredPaymentMethod(payment_method);
            const addressBookCustomerId =
                req.isAuthenticated &&
                req.isAuthenticated() &&
                req.user?.principal_type === 'customer'
                    ? req.user.id
                    : null;
            const responsePayload = {
                message: 'Order placed successfully',
                order_id: orderId,
                subtotal: subtotal.toFixed(2),
                shipping_cost: shippingCost.toFixed(2),
                sales_tax: salesTax.toFixed(2),
                total: total.toFixed(2),
            };

            // Keep charge + DB commit synchronous, but move non-critical work
            // off the request path so the customer sees confirmation sooner.
            queuePostOrderTasks({
                db,
                orderId,
                customerEmail: normalizedCustomerEmail,
                verifiedName,
                verifiedPhone,
                verifiedAddress,
                verifiedAddress2,
                verifiedCity,
                verifiedState,
                verifiedZip,
                requestedFirstName,
                requestedLastName,
                subtotal,
                salesTax,
                total,
                paymentType,
                paymentIntent,
                addressBookCustomerId,
            });

            return res.status(201).json(responsePayload);
        } catch (err) {
            await conn.rollback();

            // The unique payment_id index protects against a race where two
            // /api/orders requests arrive at almost exactly the same time.
            if (err.code === 'ER_DUP_ENTRY') {
                const [existing] = await db.execute(
                    'SELECT id, subtotal, sales_tax, total FROM orders WHERE payment_id = ? LIMIT 1',
                    [payment_id]
                );

                if (existing.length > 0) {
                    return res.status(200).json({
                        message: 'Order already placed',
                        order_id: existing[0].id,
                        subtotal: Number(existing[0].subtotal).toFixed(2),
                        shipping_cost: Number(existing[0].shipping_cost || 0).toFixed(2),
                        sales_tax: Number(existing[0].sales_tax).toFixed(2),
                        total: Number(existing[0].total).toFixed(2),
                    });
                }
            }

            throw err;
        } finally {
            conn.release();
        }
    } catch (err) {
        console.error('Order creation error:', err);
        return res.status(400).json({
            error: err.message || 'Unable to create order.',
        });
    }
});

// ========================================================
// GET /api/orders/my
// Existing behavior preserved.
// ========================================================
router.get('/my', async (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not logged in.' });
    }
    if (req.user?.principal_type !== 'customer') {
        return res.status(403).json({ error: 'Customer session required.' });
    }

    const db = req.app.locals.db;
    const email = req.user.email;

    const [orders] = await db.execute(
        'SELECT * FROM orders WHERE customer_email = ? ORDER BY created_at DESC',
        [email]
    );

    const result = [];
    for (const order of orders) {
        const [items] = await db.execute(
            `SELECT oi.*, p.name AS product_name, p.image_url
             FROM order_items oi
             JOIN products p ON oi.product_id = p.id
             WHERE oi.order_id = ?`,
            [order.id]
        );
        result.push({ ...order, items });
    }

    res.json({ orders: result });
});

// ========================================================
// GET /api/orders/:id
// Existing behavior preserved.
// ========================================================
router.get('/:id', async (req, res) => {
    const db = req.app.locals.db;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });

    const [rows] = await db.execute('SELECT * FROM orders WHERE id = ?', [id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const [orderItems] = await db.execute(
        `SELECT oi.*, p.name AS product_name
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ?`,
        [id]
    );

    res.json({ ...order, items: orderItems });
});

module.exports = router;

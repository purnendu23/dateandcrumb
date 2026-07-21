const express = require('express');
const router = express.Router();

// ─── Stripe setup ────────────────────────────────────────
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    console.log('Stripe payment gateway configured.');
} else {
    console.log('Stripe not configured — set STRIPE_SECRET_KEY env var.');
}

// ─── PayPal setup ────────────────────────────────────────
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const PAYPAL_API = process.env.PAYPAL_API || 'https://api-m.sandbox.paypal.com';

if (PAYPAL_CLIENT_ID && PAYPAL_SECRET) {
    console.log('PayPal payment gateway configured (sandbox).');
} else {
    console.log('PayPal not configured — set PAYPAL_CLIENT_ID and PAYPAL_SECRET env vars.');
}

// Helper: get PayPal access token
async function getPayPalAccessToken() {
    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
    const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });
    const data = await res.json();
    return data.access_token;
}

// ─── GET /api/payments/config ────────────────────────────
// Returns public keys so frontend knows which gateways are available
router.get('/config', (req, res) => {
    res.json({
        stripePublicKey: process.env.STRIPE_PUBLIC_KEY || null,
        paypalClientId: PAYPAL_CLIENT_ID || null,
    });
});

// ─── POST /api/payments/stripe/create-intent ─────────────
// Creates a Stripe PaymentIntent for the given cart
router.post('/stripe/create-intent', async (req, res) => {
    if (!stripe) {
        return res.status(503).json({ error: 'Stripe is not configured.' });
    }

    const db = req.app.locals.db;
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Cart items are required.' });
    }

    // Calculate total from DB prices (never trust client-side amounts)
    let total = 0;
    for (const item of items) {
        const [rows] = await db.execute('SELECT id, price, out_of_stock FROM products WHERE id = ?', [parseInt(item.product_id, 10)]);
        const product = rows[0];
        if (!product) return res.status(400).json({ error: `Product ${item.product_id} not found.` });
        if (product.out_of_stock) return res.status(400).json({ error: `Product ${item.product_id} is currently out of stock.` });
        total += product.price * item.quantity;
    }

    const amountInCents = Math.round(total * 100);

    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInCents,
            currency: 'usd',
            payment_method_types: ['card'],
        });

        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (err) {
        console.error('Stripe error:', err.message);
        res.status(500).json({ error: 'Failed to create payment intent.' });
    }
});

// ─── POST /api/payments/paypal/create-order ──────────────
router.post('/paypal/create-order', async (req, res) => {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
        return res.status(503).json({ error: 'PayPal is not configured.' });
    }

    const db = req.app.locals.db;
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Cart items are required.' });
    }

    let total = 0;
    const lineItems = [];
    for (const item of items) {
        const [rows] = await db.execute('SELECT id, price, out_of_stock, name FROM products WHERE id = ?', [parseInt(item.product_id, 10)]);
        const product = rows[0];
        if (!product) return res.status(400).json({ error: `Product ${item.product_id} not found.` });
        if (product.out_of_stock) return res.status(400).json({ error: `Product ${item.product_id} is currently out of stock.` });
        const lineTotal = product.price * item.quantity;
        total += lineTotal;
        lineItems.push({
            name: product.name,
            unit_amount: { currency_code: 'USD', value: product.price.toFixed(2) },
            quantity: String(item.quantity),
        });
    }

    try {
        const accessToken = await getPayPalAccessToken();
        const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                intent: 'CAPTURE',
                purchase_units: [{
                    amount: {
                        currency_code: 'USD',
                        value: total.toFixed(2),
                        breakdown: {
                            item_total: { currency_code: 'USD', value: total.toFixed(2) },
                        },
                    },
                    items: lineItems,
                }],
            }),
        });

        const order = await response.json();
        res.json({ id: order.id });
    } catch (err) {
        console.error('PayPal create error:', err.message);
        res.status(500).json({ error: 'Failed to create PayPal order.' });
    }
});

// ─── POST /api/payments/paypal/capture-order ─────────────
router.post('/paypal/capture-order', async (req, res) => {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
        return res.status(503).json({ error: 'PayPal is not configured.' });
    }

    const { orderID } = req.body;
    if (!orderID) return res.status(400).json({ error: 'PayPal order ID required.' });

    try {
        const accessToken = await getPayPalAccessToken();
        const response = await fetch(`${PAYPAL_API}/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        const captureData = await response.json();
        if (captureData.status === 'COMPLETED') {
            res.json({ status: 'COMPLETED', id: captureData.id });
        } else {
            res.status(400).json({ error: 'Payment not completed.', details: captureData });
        }
    } catch (err) {
        console.error('PayPal capture error:', err.message);
        res.status(500).json({ error: 'Failed to capture PayPal payment.' });
    }
});

module.exports = router;

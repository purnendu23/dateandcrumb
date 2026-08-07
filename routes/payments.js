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

// ─── GET /api/payments/config ────────────────────────────
// Returns public keys so frontend knows which gateways are available
router.get('/config', (req, res) => {
    res.json({
        stripePublicKey: process.env.STRIPE_PUBLIC_KEY || null,
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

module.exports = router;

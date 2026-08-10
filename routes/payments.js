const express = require('express');
const router = express.Router();

// ========================================================
// Stripe setup
// ========================================================
let stripe = null;

if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    console.log('Stripe payment gateway configured.');
} else {
    console.log('Stripe not configured — set STRIPE_SECRET_KEY env var.');
}

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

function validateShipping(shipping) {
    if (
        !shipping ||
        !shipping.name ||
        !shipping.address ||
        !shipping.address.line1 ||
        !shipping.address.city ||
        !shipping.address.state ||
        !shipping.address.postal_code
    ) {
        return 'A complete shipping address is required.';
    }

    const state = normalizeState(shipping.address.state);
    if (!/^[A-Z]{2}$/.test(state)) {
        return 'Please provide a valid two-letter U.S. state code.';
    }

    return null;
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

    for (const item of items) {
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

async function resolveCartFromDatabase(db, items) {
    if (!items || !Array.isArray(items) || items.length === 0) {
        const err = new Error('Cart items are required.');
        err.statusCode = 400;
        throw err;
    }

    if (items.length > 100) {
        const err = new Error('Too many line items in the cart.');
        err.statusCode = 400;
        throw err;
    }

    const resolvedItems = [];
    let subtotalInCents = 0;

    for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const productId = parseInt(item.product_id, 10);
        const quantity = parseInt(item.quantity, 10);

        if (!Number.isInteger(productId) || productId <= 0) {
            const err = new Error('Invalid product ID.');
            err.statusCode = 400;
            throw err;
        }

        if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 100) {
            const err = new Error('Invalid quantity.');
            err.statusCode = 400;
            throw err;
        }

        const [rows] = await db.execute(
            'SELECT id, price, out_of_stock FROM products WHERE id = ?',
            [productId]
        );

        const product = rows[0];

        if (!product) {
            const err = new Error(`Product ${productId} not found.`);
            err.statusCode = 400;
            throw err;
        }

        if (product.out_of_stock) {
            const err = new Error(`Product ${productId} is currently out of stock.`);
            err.statusCode = 400;
            throw err;
        }

        const unitPriceInCents = Math.round(Number(product.price) * 100);
        if (!Number.isInteger(unitPriceInCents) || unitPriceInCents < 0) {
            const err = new Error(`Product ${productId} has an invalid price.`);
            err.statusCode = 500;
            throw err;
        }

        const lineAmountInCents = unitPriceInCents * quantity;
        subtotalInCents += lineAmountInCents;

        resolvedItems.push({
            product_id: productId,
            quantity,
            unitPriceInCents,
            lineAmountInCents,
            reference: `product:${productId}:line:${index}`,
        });
    }

    return { resolvedItems, subtotalInCents };
}

async function getCalculationCart(calculationId) {
    const lineItems = await stripe.tax.calculations.listLineItems(
        calculationId,
        { limit: 100 }
    );

    if (lineItems.has_more) {
        const err = new Error('Tax calculation contains too many line items.');
        err.statusCode = 400;
        throw err;
    }

    const cart = [];
    let subtotalInCents = 0;

    for (const line of lineItems.data) {
        const match = /^product:(\d+):line:(\d+)$/.exec(String(line.reference || ''));

        if (!match) {
            const err = new Error('Tax calculation contains an invalid line-item reference.');
            err.statusCode = 400;
            throw err;
        }

        const productId = parseInt(match[1], 10);
        const quantity = parseInt(line.quantity || 1, 10);

        cart.push({ product_id: productId, quantity });
        subtotalInCents += Number(line.amount || 0);
    }

    return { cart, subtotalInCents };
}

// ========================================================
// GET /api/payments/config
// Returns public keys so frontend knows which gateways are available
// ========================================================
router.get('/config', (req, res) => {
    res.json({
        stripePublicKey: process.env.STRIPE_PUBLIC_KEY || null,
    });
});

// ========================================================
// POST /api/payments/stripe/calculate-tax
// Calculates Stripe Tax after the customer finishes shipping.
// No PaymentIntent is created here.
// ========================================================
router.post('/stripe/calculate-tax', async (req, res) => {
    if (!stripe) {
        return res.status(503).json({ error: 'Stripe is not configured.' });
    }

    const db = req.app.locals.db;
    const { items, shipping } = req.body;

    const shippingError = validateShipping(shipping);
    if (shippingError) {
        return res.status(400).json({ error: shippingError });
    }

    try {
        const { resolvedItems, subtotalInCents } = await resolveCartFromDatabase(db, items);

        const taxLineItems = resolvedItems.map((item) => {
            const line = {
                amount: item.lineAmountInCents,
                quantity: item.quantity,
                reference: item.reference,
                tax_behavior: 'exclusive',
            };

            // Optional: set STRIPE_PRODUCT_TAX_CODE in your environment.
            // If omitted, Stripe uses the preset product tax code from Tax Settings.
            if (process.env.STRIPE_PRODUCT_TAX_CODE) {
                line.tax_code = process.env.STRIPE_PRODUCT_TAX_CODE;
            }

            return line;
        });

        const taxCalculation = await stripe.tax.calculations.create({
            currency: 'usd',
            line_items: taxLineItems,
            customer_details: {
                address: {
                    line1: shipping.address.line1.trim(),
                    ...(shipping.address.line2
                        ? { line2: shipping.address.line2.trim() }
                        : {}),
                    city: shipping.address.city.trim(),
                    state: normalizeState(shipping.address.state),
                    postal_code: shipping.address.postal_code.trim(),
                    country: 'US',
                },
                address_source: 'shipping',
            },
        });

        return res.json({
            taxCalculationId: taxCalculation.id,
            subtotal: subtotalInCents,
            tax: taxCalculation.tax_amount_exclusive,
            total: taxCalculation.amount_total,
            expiresAt: taxCalculation.expires_at,
        });
    } catch (err) {
        console.error('Stripe tax calculation error:', err);
        return res.status(err.statusCode || 500).json({
            error: err.message || 'Failed to calculate sales tax.',
        });
    }
});

// ========================================================
// POST /api/payments/stripe/create-intent
// Verifies the tax quote still matches the cart/address, then
// creates the PaymentIntent for the tax-inclusive grand total.
// ========================================================
router.post('/stripe/create-intent', async (req, res) => {
    if (!stripe) {
        return res.status(503).json({ error: 'Stripe is not configured.' });
    }

    const db = req.app.locals.db;
    const {
        items,
        shipping,
        customer_email,
        customer_phone,
        tax_calculation_id,
    } = req.body;

    const shippingError = validateShipping(shipping);
    if (shippingError) {
        return res.status(400).json({ error: shippingError });
    }

    if (!tax_calculation_id || !String(tax_calculation_id).startsWith('taxcalc_')) {
        return res.status(400).json({
            error: 'A valid Stripe Tax calculation is required. Please return to shipping and try again.',
        });
    }

    try {
        // Re-resolve current DB prices/availability before taking payment.
        const { resolvedItems, subtotalInCents } = await resolveCartFromDatabase(db, items);

        const taxCalculation = await stripe.tax.calculations.retrieve(tax_calculation_id);

        if (taxCalculation.currency !== 'usd') {
            return res.status(400).json({ error: 'Invalid tax calculation currency.' });
        }

        if (taxCalculation.expires_at && taxCalculation.expires_at <= Math.floor(Date.now() / 1000)) {
            return res.status(409).json({
                error: 'Your tax calculation expired. Please return to shipping and continue again.',
                code: 'TAX_QUOTE_EXPIRED',
            });
        }

        const calculatedAddress = taxCalculation.customer_details?.address;
        if (!addressesMatch(calculatedAddress, shipping.address)) {
            return res.status(409).json({
                error: 'Your shipping address changed. Please return to shipping so tax can be recalculated.',
                code: 'TAX_ADDRESS_CHANGED',
            });
        }

        const calculationCart = await getCalculationCart(tax_calculation_id);
        const currentCart = resolvedItems.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity,
        }));

        if (!cartsMatch(currentCart, calculationCart.cart)) {
            return res.status(409).json({
                error: 'Your cart changed. Please return to shipping so tax can be recalculated.',
                code: 'TAX_CART_CHANGED',
            });
        }

        if (calculationCart.subtotalInCents !== subtotalInCents) {
            return res.status(409).json({
                error: 'A product price changed. Please return to shipping so your total can be recalculated.',
                code: 'TAX_PRICE_CHANGED',
            });
        }

        // This integration intentionally uses tax-exclusive product prices
        // and currently has no separate shipping charge.
        if (
            subtotalInCents + Number(taxCalculation.tax_amount_exclusive || 0) !==
            Number(taxCalculation.amount_total)
        ) {
            return res.status(400).json({
                error: 'The tax calculation total is inconsistent with the cart.',
            });
        }

        const shippingAddress = {
            line1: shipping.address.line1.trim(),
            ...(shipping.address.line2
                ? { line2: shipping.address.line2.trim() }
                : {}),
            city: shipping.address.city.trim(),
            state: normalizeState(shipping.address.state),
            postal_code: shipping.address.postal_code.trim(),
            country: 'US',
        };

        const paymentIntentParams = {
            amount: taxCalculation.amount_total,
            currency: 'usd',
            payment_method_types: ['card'],

            // Stripe Tax simplified PaymentIntent integration.
            hooks: {
                inputs: {
                    tax: {
                        calculation: taxCalculation.id,
                    },
                },
            },

            shipping: {
                name: shipping.name.trim(),
                address: shippingAddress,
                ...(customer_phone ? { phone: String(customer_phone).trim() } : {}),
            },

            metadata: {
                tax_calculation_id: taxCalculation.id,
                cart_subtotal_cents: String(subtotalInCents),
            },
        };

        if (customer_email) {
            paymentIntentParams.receipt_email = String(customer_email).trim();
        }

        const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

        return res.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            taxCalculationId: taxCalculation.id,
            subtotal: subtotalInCents,
            tax: taxCalculation.tax_amount_exclusive,
            total: taxCalculation.amount_total,
        });
    } catch (err) {
        console.error('Stripe PaymentIntent error:', err);
        return res.status(err.statusCode || 500).json({
            error: err.message || 'Failed to initialize payment.',
        });
    }
});

module.exports = router;

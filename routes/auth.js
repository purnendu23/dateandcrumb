const express = require('express');
const passport = require('passport');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { sendVerificationEmail } = require('../config/mailer');
const router = express.Router();

const SALT_ROUNDS = 12;
const ENTERPRISE_DOMAIN = String(process.env.ENTERPRISE_EMAIL_DOMAIN || 'dateandcrumb.com')
    .trim()
    .toLowerCase();

const buildFullName = (firstName, lastName) => {
    const full = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim();
    return full || null;
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const isEnterpriseEmail = (email) => normalizeEmail(email).endsWith(`@${ENTERPRISE_DOMAIN}`);

function ensureCustomerSession(req, res, next) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not logged in.' });
    }
    if (req.user?.principal_type !== 'customer') {
        return res.status(403).json({ error: 'Customer session required.' });
    }
    return next();
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const db = req.app.locals.db;
    const {
        email,
        password,
        first_name,
        last_name,
        name,
        phone,
        shipping_address,
        shipping_address2,
        shipping_city,
        shipping_state,
        shipping_zip,
    } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = normalizeEmail(email);
    if (isEnterpriseEmail(normalizedEmail)) {
        return res.status(409).json({ error: `@${ENTERPRISE_DOMAIN} addresses are reserved for enterprise users.` });
    }
    const [existing] = await db.execute(
        `SELECT id, password_hash
         FROM customers
         WHERE email = ?
         LIMIT 1`,
        [normalizedEmail]
    );
    if (existing.length > 0 && existing[0].password_hash) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    const [employee] = await db.execute(
        'SELECT id FROM users WHERE email = ? LIMIT 1',
        [normalizedEmail]
    );
    if (employee.length > 0) {
        return res.status(409).json({ error: 'This email is reserved for an enterprise account.' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const token = crypto.randomBytes(32).toString('hex');
        const normalizedFirstName = String(first_name || '').trim() || null;
        const normalizedLastName = String(last_name || '').trim() || null;
        const fullName =
            buildFullName(normalizedFirstName, normalizedLastName) ||
            (String(name || '').trim() || null);

        let customerId;
        let shouldVerifyEmail = true;
        if (existing.length > 0) {
            customerId = existing[0].id;
            await db.execute(
                `UPDATE customers
                 SET password_hash = ?,
                     verified = 0,
                     first_name = ?,
                     last_name = ?,
                     full_name = ?,
                     provider = 'local',
                     verification_token = ?,
                     phone = ?,
                     shipping_address = ?,
                     shipping_address2 = ?,
                     shipping_city = ?,
                     shipping_state = ?,
                     shipping_zip = ?
                 WHERE id = ?`,
                [
                    passwordHash,
                    normalizedFirstName,
                    normalizedLastName,
                    fullName,
                    shouldVerifyEmail ? token : null,
                    phone || null,
                    shipping_address || null,
                    shipping_address2 || null,
                    shipping_city || null,
                    shipping_state || null,
                    shipping_zip || null,
                    customerId,
                ]
            );
        } else {
            const [result] = await db.execute(
                `INSERT INTO customers (
                    email, password_hash, first_name, last_name, full_name,
                    provider, verified, verification_token, phone,
                    shipping_address, shipping_address2, shipping_city, shipping_state, shipping_zip
                 ) VALUES (?, ?, ?, ?, ?, 'local', 0, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    normalizedEmail,
                    passwordHash,
                    normalizedFirstName,
                    normalizedLastName,
                    fullName,
                    token,
                    phone || null,
                    shipping_address || null,
                    shipping_address2 || null,
                    shipping_city || null,
                    shipping_state || null,
                    shipping_zip || null,
                ]
            );
            customerId = result.insertId;
        }

        if (shipping_address && shipping_city && shipping_zip) {
            await db.execute(
                `INSERT INTO address_book (
                    customer_id, label, first_name, last_name, name, phone, address, address2, city, state, zip, is_default
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [
                    customerId,
                    'Profile Address',
                    normalizedFirstName,
                    normalizedLastName,
                    fullName,
                    phone || null,
                    shipping_address,
                    shipping_address2 || null,
                    shipping_city,
                    shipping_state || null,
                    shipping_zip,
                ]
            );
        }

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const verifyUrl = `${baseUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;
        if (shouldVerifyEmail) {
            console.log(`\n📧 Verification link for ${normalizedEmail}:\n   ${verifyUrl}\n`);
            try {
                await sendVerificationEmail(normalizedEmail, token, baseUrl);
            } catch (emailErr) {
                console.error('Failed to send verification email:', emailErr.message);
            }
        }

        return res.json({
            message: shouldVerifyEmail
                ? 'Registration successful. Please check your email to verify your account.'
                : 'Registration successful. Your account is ready to use.',
        });
    } catch (err) {
        console.error('Registration error:', err);
        return res.status(500).json({ error: 'Registration failed.' });
    }
});

// GET /api/auth/verify
router.get('/verify', async (req, res) => {
    const db = req.app.locals.db;
    const { token } = req.query;

    if (!token) {
        return res.redirect('/verify.html?status=error&message=Missing+token');
    }

    const [rows] = await db.execute(
        `SELECT id, email, first_name, last_name, full_name, verified
         FROM customers
         WHERE verification_token = ?
         LIMIT 1`,
        [token]
    );
    const customer = rows[0];

    if (!customer) {
        return res.redirect('/verify.html?status=error&message=Invalid+or+expired+link');
    }
    if (customer.verified) {
        return res.redirect('/verify.html?status=already');
    }

    await db.execute(
        'UPDATE customers SET verified = 1, verification_token = NULL WHERE id = ?',
        [customer.id]
    );

    req.login({
        id: customer.id,
        principal_type: 'customer',
        email: customer.email,
        first_name: customer.first_name || null,
        last_name: customer.last_name || null,
        name: customer.full_name || buildFullName(customer.first_name, customer.last_name),
        is_admin: false,
    }, (err) => {
        if (err) return res.redirect('/verify.html?status=success');
        return res.redirect('/complete-profile.html');
    });
});

// POST /api/auth/login
router.post('/login', (req, res, next) => {
    passport.authenticate('customer-local', (err, customer, info) => {
        if (err) return res.status(500).json({ error: 'Login failed.' });
        if (!customer) return res.status(401).json({ error: info?.message || 'Invalid email or password.' });

        req.login(customer, (loginErr) => {
            if (loginErr) return res.status(500).json({ error: 'Login failed.' });
            return res.json({
                user: {
                    id: customer.id,
                    email: customer.email,
                    first_name: customer.first_name || null,
                    last_name: customer.last_name || null,
                    name: customer.name || buildFullName(customer.first_name, customer.last_name),
                    is_admin: false,
                },
            });
        });
    })(req, res, next);
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    req.logout(() => {
        req.session?.destroy(() => {
            res.json({ message: 'Logged out.' });
        });
    });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated() || req.user?.principal_type !== 'customer') {
        return res.json({ user: null });
    }

    return res.json({
        user: {
            id: req.user.id,
            email: req.user.email,
            first_name: req.user.first_name || null,
            last_name: req.user.last_name || null,
            name: req.user.name || buildFullName(req.user.first_name, req.user.last_name),
            is_admin: false,
        },
    });
});

// GET /api/auth/profile
router.get('/profile', ensureCustomerSession, async (req, res) => {
    const db = req.app.locals.db;
    const [rows] = await db.execute(
        `SELECT id, email, first_name, last_name, full_name AS name, phone, organization,
                shipping_address, shipping_address2, shipping_city, shipping_state, shipping_zip
         FROM customers
         WHERE id = ?`,
        [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Customer not found.' });
    return res.json({ profile: rows[0] });
});

// PUT /api/auth/profile
router.put('/profile', ensureCustomerSession, async (req, res) => {
    const db = req.app.locals.db;
    const {
        first_name,
        last_name,
        name,
        phone,
        organization,
        shipping_address,
        shipping_address2,
        shipping_city,
        shipping_state,
        shipping_zip,
    } = req.body;

    const normalizedFirstName = String(first_name || '').trim() || null;
    const normalizedLastName = String(last_name || '').trim() || null;
    const fullName =
        buildFullName(normalizedFirstName, normalizedLastName) ||
        (String(name || '').trim() || null);

    await db.execute(
        `UPDATE customers
         SET first_name = ?, last_name = ?, full_name = ?, phone = ?, organization = ?,
             shipping_address = ?, shipping_address2 = ?, shipping_city = ?, shipping_state = ?, shipping_zip = ?
         WHERE id = ?`,
        [
            normalizedFirstName,
            normalizedLastName,
            fullName,
            phone || null,
            organization || null,
            shipping_address || null,
            shipping_address2 || null,
            shipping_city || null,
            shipping_state || null,
            shipping_zip || null,
            req.user.id,
        ]
    );

    return res.json({ message: 'Profile updated.' });
});

// Google OAuth (customers)
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get(
    '/google/callback',
    passport.authenticate('google', { failureRedirect: '/login.html?error=google' }),
    (req, res) => res.redirect('/')
);

// Apple OAuth (customers)
router.get('/apple', passport.authenticate('apple'));
router.post(
    '/apple/callback',
    passport.authenticate('apple', { failureRedirect: '/login.html?error=apple' }),
    (req, res) => res.redirect('/')
);

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
    const db = req.app.locals.db;
    const { email } = req.body;
    const genericMsg = 'If an account with that email exists, a password reset link has been generated. Check the terminal.';

    if (!email) return res.status(400).json({ error: 'Email is required.' });

    try {
        const normalizedEmail = normalizeEmail(email);
        const [rows] = await db.execute(
            "SELECT id FROM customers WHERE email = ? AND provider = 'local' LIMIT 1",
            [normalizedEmail]
        );
        const customer = rows[0];

        if (customer) {
            const token = crypto.randomBytes(32).toString('hex');
            const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

            await db.execute(
                'UPDATE customers SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
                [token, expires, customer.id]
            );

            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const resetUrl = `${baseUrl}/reset-password.html?token=${encodeURIComponent(token)}`;
            console.log(`\n🔑 Password reset link for ${normalizedEmail}:\n   ${resetUrl}\n`);
        }

        return res.json({ message: genericMsg });
    } catch (err) {
        console.error('Forgot password error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
    const db = req.app.locals.db;
    const { token, password } = req.body;

    if (!token || !password) {
        return res.status(400).json({ error: 'Token and new password are required.' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    try {
        const [rows] = await db.execute(
            `SELECT id
             FROM customers
             WHERE reset_token = ?
               AND reset_token_expires > NOW()
             LIMIT 1`,
            [token]
        );
        const customer = rows[0];
        if (!customer) {
            return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        await db.execute(
            'UPDATE customers SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
            [passwordHash, customer.id]
        );

        return res.json({ message: 'Password has been reset. You can now log in with your new password.' });
    } catch (err) {
        console.error('Reset password error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
});

// GET /api/auth/addresses
router.get('/addresses', ensureCustomerSession, async (req, res) => {
    const db = req.app.locals.db;
    const [addresses] = await db.execute(
        `SELECT *
         FROM address_book
         WHERE customer_id = ?
         ORDER BY is_default DESC, created_at DESC`,
        [req.user.id]
    );
    return res.json({ addresses });
});

// POST /api/auth/addresses
router.post('/addresses', ensureCustomerSession, async (req, res) => {
    const db = req.app.locals.db;
    const { label, first_name, last_name, name, phone, address, address2, city, state, zip } = req.body;
    if (!address || !city || !zip) {
        return res.status(400).json({ error: 'Address, city, and zip are required.' });
    }

    const [existing] = await db.execute(
        `SELECT id
         FROM address_book
         WHERE customer_id = ?
           AND address = ?
           AND city = ?
           AND zip = ?`,
        [req.user.id, address, city, zip]
    );
    if (existing.length > 0) {
        return res.json({ message: 'Address already in address book.', id: existing[0].id });
    }

    const normalizedFirstName = String(first_name || '').trim() || null;
    const normalizedLastName = String(last_name || '').trim() || null;
    const fullName =
        buildFullName(normalizedFirstName, normalizedLastName) ||
        (String(name || '').trim() || null);

    const [result] = await db.execute(
        `INSERT INTO address_book (
            customer_id, label, first_name, last_name, name, phone, address, address2, city, state, zip
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            req.user.id,
            label || null,
            normalizedFirstName,
            normalizedLastName,
            fullName,
            phone || null,
            address,
            address2 || null,
            city,
            state || null,
            zip,
        ]
    );
    return res.json({ message: 'Address added.', id: result.insertId });
});

// GET /api/auth/account-exists?email=...
router.get('/account-exists', async (req, res) => {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) return res.json({ exists: false });
    const db = req.app.locals.db;
    const [rows] = await db.execute(
        'SELECT id FROM customers WHERE email = ? AND password_hash IS NOT NULL LIMIT 1',
        [email]
    );
    res.json({ exists: rows.length > 0 });
});

module.exports = router;

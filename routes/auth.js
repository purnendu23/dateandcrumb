const express = require('express');
const passport = require('passport');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { sendVerificationEmail } = require('../config/mailer');
const router = express.Router();

const SALT_ROUNDS = 12;
const buildFullName = (firstName, lastName) => {
    const full = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim();
    return full || null;
};

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

    const [existing] = await db.execute('SELECT id, verified FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const token = crypto.randomBytes(32).toString('hex');
        const normalizedFirstName = String(first_name || '').trim() || null;
        const normalizedLastName = String(last_name || '').trim() || null;
        const fullName = buildFullName(normalizedFirstName, normalizedLastName) || (String(name || '').trim() || null);

        const [result] = await db.execute(
            `INSERT INTO users (email, first_name, last_name, password_hash, name, provider, verified, verification_token,
             phone, shipping_address, shipping_address2, shipping_city, shipping_state, shipping_zip)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
            [email, normalizedFirstName, normalizedLastName, passwordHash, fullName, 'local', token,
             phone || null, shipping_address || null, shipping_address2 || null,
             shipping_city || null, shipping_state || null, shipping_zip || null]
        );

        // Auto-add shipping address to address book if provided
        if (shipping_address && shipping_city && shipping_zip) {
            const newUserId = result.insertId;
            await db.execute(
                'INSERT INTO address_book (user_id, label, first_name, last_name, name, phone, address, address2, city, state, zip, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
                [newUserId, 'Profile Address', normalizedFirstName, normalizedLastName, fullName, phone || null,
                 shipping_address, shipping_address2 || null, shipping_city, shipping_state || null, shipping_zip]
            );
        }

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const verifyUrl = `${baseUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;

        console.log(`\n📧 Verification link for ${email}:\n   ${verifyUrl}\n`);

        try {
            await sendVerificationEmail(email, token, baseUrl);
        } catch (emailErr) {
            console.error('Failed to send verification email:', emailErr.message);
        }

        res.json({ message: 'Registration successful. Please check your email to verify your account.' });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Registration failed.' });
    }
});

// GET /api/auth/verify
router.get('/verify', async (req, res) => {
    const db = req.app.locals.db;
    const { token } = req.query;

    if (!token) {
        return res.redirect('/verify.html?status=error&message=Missing+token');
    }

    const [rows] = await db.execute('SELECT id, email, first_name, last_name, name, verified FROM users WHERE verification_token = ?', [token]);
    const user = rows[0];

    if (!user) {
        return res.redirect('/verify.html?status=error&message=Invalid+or+expired+link');
    }

    if (user.verified) {
        return res.redirect('/verify.html?status=already');
    }

    await db.execute('UPDATE users SET verified = 1, verification_token = NULL WHERE id = ?', [user.id]);

    req.login({
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        name: user.name || buildFullName(user.first_name, user.last_name),
    }, (err) => {
        if (err) {
            return res.redirect('/verify.html?status=success');
        }
        return res.redirect('/complete-profile.html');
    });
});

// POST /api/auth/login
router.post('/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) return res.status(500).json({ error: 'Login failed.' });
        if (!user) return res.status(401).json({ error: info?.message || 'Invalid email or password.' });
        req.login(user, (err) => {
            if (err) return res.status(500).json({ error: 'Login failed.' });
                res.json({
                    user: {
                        id: user.id,
                        email: user.email,
                        first_name: user.first_name || null,
                        last_name: user.last_name || null,
                        name: user.name || buildFullName(user.first_name, user.last_name),
                    },
                });
            });
    })(req, res, next);
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    req.logout(() => {
        res.json({ message: 'Logged out.' });
    });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({
            user: {
                id: req.user.id,
                email: req.user.email,
                first_name: req.user.first_name || null,
                last_name: req.user.last_name || null,
                name: req.user.name || buildFullName(req.user.first_name, req.user.last_name),
                is_admin: req.user.is_admin,
            },
        });
    } else {
        res.json({ user: null });
    }
});

// GET /api/auth/profile
router.get('/profile', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not logged in.' });
    }
    const db = req.app.locals.db;
    const [rows] = await db.execute(
        `SELECT id, email, first_name, last_name, name, phone, organization,
                shipping_address, shipping_address2, shipping_city, shipping_state, shipping_zip
         FROM users WHERE id = ?`,
        [req.user.id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'User not found.' });
    res.json({ profile: rows[0] });
});

// PUT /api/auth/profile
router.put('/profile', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not logged in.' });
    }
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
    const fullName = buildFullName(normalizedFirstName, normalizedLastName) || (String(name || '').trim() || null);

    if (phone !== undefined) {
        await db.execute(
            `UPDATE users
             SET first_name = ?, last_name = ?, name = ?, phone = ?, organization = ?,
                shipping_address = ?, shipping_address2 = ?, shipping_city = ?, shipping_state = ?, shipping_zip = ?
             WHERE id = ?`,
            [normalizedFirstName, normalizedLastName, fullName, phone || null, organization || null, shipping_address || null, shipping_address2 || null,
             shipping_city || null, shipping_state || null, shipping_zip || null, req.user.id]
        );
    } else {
        await db.execute(
            `UPDATE users
             SET first_name = ?, last_name = ?, name = ?, organization = ?,
                shipping_address = ?, shipping_address2 = ?, shipping_city = ?, shipping_state = ?, shipping_zip = ?
             WHERE id = ?`,
            [normalizedFirstName, normalizedLastName, fullName, organization || null, shipping_address || null, shipping_address2 || null,
             shipping_city || null, shipping_state || null, shipping_zip || null, req.user.id]
        );
    }

    res.json({ message: 'Profile updated.' });
});

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
    const db = req.app.locals.db;
    const { email } = req.body;

    const genericMsg = 'If an account with that email exists, a password reset link has been generated. Check the terminal.';

    if (!email) {
        return res.status(400).json({ error: 'Email is required.' });
    }

    try {
        const [rows] = await db.execute("SELECT id, email FROM users WHERE email = ? AND provider = 'local'", [email]);
        const user = rows[0];

        if (user) {
            const token = crypto.randomBytes(32).toString('hex');
            const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

            await db.execute('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
                [token, expires, user.id]);

            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const resetUrl = `${baseUrl}/reset-password.html?token=${encodeURIComponent(token)}`;

            console.log(`\n🔑 Password reset link for ${email}:\n   ${resetUrl}\n`);
        }

        res.json({ message: genericMsg });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
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
            "SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > NOW()",
            [token]
        );
        const user = rows[0];

        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        await db.execute('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
            [passwordHash, user.id]);

        res.json({ message: 'Password has been reset. You can now log in with your new password.' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
});

router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/login.html?error=google' }),
    (req, res) => {
        res.redirect('/');
    }
);

// Apple OAuth
router.post('/apple/callback',
    passport.authenticate('apple', { failureRedirect: '/login.html?error=apple' }),
    (req, res) => {
        res.redirect('/');
    }
);

router.get('/apple', passport.authenticate('apple'));

// GET /api/auth/addresses
router.get('/addresses', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not logged in.' });
    }
    const db = req.app.locals.db;
    const [addresses] = await db.execute(
        'SELECT * FROM address_book WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
        [req.user.id]
    );
    res.json({ addresses });
});

// POST /api/auth/addresses
router.post('/addresses', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not logged in.' });
    }
    const db = req.app.locals.db;
    const { label, first_name, last_name, name, phone, address, address2, city, state, zip } = req.body;
    if (!address || !city || !zip) {
        return res.status(400).json({ error: 'Address, city, and zip are required.' });
    }
    const [existing] = await db.execute(
        'SELECT id FROM address_book WHERE user_id = ? AND address = ? AND city = ? AND zip = ?',
        [req.user.id, address, city, zip]
    );
    if (existing.length > 0) {
        return res.json({ message: 'Address already in address book.', id: existing[0].id });
    }
    const normalizedFirstName = String(first_name || '').trim() || null;
    const normalizedLastName = String(last_name || '').trim() || null;
    const fullName = buildFullName(normalizedFirstName, normalizedLastName) || (String(name || '').trim() || null);
    const [result] = await db.execute(
        `INSERT INTO address_book (
            user_id, label, first_name, last_name, name, phone, address, address2, city, state, zip
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, label || null, normalizedFirstName, normalizedLastName, fullName, phone || null, address, address2 || null, city, state || null, zip]
    );
    res.json({ message: 'Address added.', id: result.insertId });
});

module.exports = router;

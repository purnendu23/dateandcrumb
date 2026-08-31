const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { sendEnterpriseVerificationEmail } = require('../config/mailer');

const router = express.Router();

const SALT_ROUNDS = 12;
const ENTERPRISE_DOMAIN = String(process.env.ENTERPRISE_EMAIL_DOMAIN || 'dateandcrumb.com')
    .trim()
    .toLowerCase();
const MAX_FAILED_ATTEMPTS = Number(process.env.ADMIN_LOGIN_MAX_ATTEMPTS || 5);
const ATTEMPT_WINDOW_MINUTES = Number(process.env.ADMIN_LOGIN_WINDOW_MINUTES || 15);
const LOCKOUT_MINUTES = Number(process.env.ADMIN_LOGIN_LOCKOUT_MINUTES || 30);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const normalizeUsername = (username) => String(username || '').trim().toLowerCase();

function isEnterpriseEmail(email) {
    return email.endsWith(`@${ENTERPRISE_DOMAIN}`);
}

function getClientIp(req) {
    return (
        String(req.headers['x-forwarded-for'] || '')
            .split(',')[0]
            .trim() ||
        req.ip ||
        req.connection?.remoteAddress ||
        'unknown'
    );
}

async function getAttemptRow(db, key, ipAddress) {
    const [rows] = await db.execute(
        `SELECT id, failed_attempts, first_failed_at, locked_until
         FROM admin_login_attempts
         WHERE email = ? AND ip_address = ?
         LIMIT 1`,
        [key, ipAddress]
    );
    return rows[0] || null;
}

function isWithinWindow(firstFailedAt) {
    if (!firstFailedAt) return false;
    const windowStart = Date.now() - (ATTEMPT_WINDOW_MINUTES * 60 * 1000);
    return new Date(firstFailedAt).getTime() >= windowStart;
}

function lockoutExpiryTimestamp() {
    return new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');
}

function buildDisplayName(user) {
    const fallback = `${String(user.first_name || '').trim()} ${String(user.last_name || '').trim()}`.trim();
    return user.username || fallback || user.email;
}

// POST /api/admin/auth/register
router.post('/register', async (req, res) => {
    const db = req.app.locals.db;
    const email = normalizeEmail(req.body?.email);
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || '');
    const firstName = String(req.body?.first_name || '').trim() || null;
    const lastName = String(req.body?.last_name || '').trim() || null;

    if (!email || !username || !password) {
        return res.status(400).json({ error: 'Email, username, and password are required.' });
    }
    if (!isEnterpriseEmail(email)) {
        return res.status(400).json({ error: `Only @${ENTERPRISE_DOMAIN} email addresses can register.` });
    }
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
        return res.status(400).json({ error: 'Username must be 3-32 chars and use letters, numbers, ., _, or -.' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const [existingUserByEmail] = await db.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existingUserByEmail.length > 0) {
        return res.status(409).json({ error: 'This enterprise account already exists.' });
    }
    const [existingUserByUsername] = await db.execute('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
    if (existingUserByUsername.length > 0) {
        return res.status(409).json({ error: 'This username is already in use.' });
    }

    const [conflictingRequestByUsername] = await db.execute(
        `SELECT id
         FROM user_registration_requests
         WHERE username = ?
           AND email <> ?
           AND status IN ('pending_verification', 'pending_admin_approval')
         LIMIT 1`,
        [username, email]
    );
    if (conflictingRequestByUsername.length > 0) {
        return res.status(409).json({ error: 'This username is already in use.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const token = crypto.randomBytes(32).toString('hex');

    await db.execute(
        `INSERT INTO user_registration_requests (
            email, username, first_name, last_name, password_hash,
            verification_token, email_verified_at, status, approved_by_user_id, approved_at, rejected_at
         ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending_verification', NULL, NULL, NULL)
         ON DUPLICATE KEY UPDATE
            username = VALUES(username),
            first_name = VALUES(first_name),
            last_name = VALUES(last_name),
            password_hash = VALUES(password_hash),
            verification_token = VALUES(verification_token),
            email_verified_at = NULL,
            status = 'pending_verification',
            approved_by_user_id = NULL,
            approved_at = NULL,
            rejected_at = NULL,
            updated_at = CURRENT_TIMESTAMP`,
        [email, username, firstName, lastName, passwordHash, token]
    );

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    try {
        await sendEnterpriseVerificationEmail(email, token, baseUrl);
    } catch (emailErr) {
        console.error('Failed to send enterprise verification email:', emailErr.message);
    }

    return res.json({
        message: 'Registration received. Verify your email, then wait for admin approval.',
    });
});

// GET /api/admin/auth/verify
router.get('/verify', async (req, res) => {
    const db = req.app.locals.db;
    const token = String(req.query?.token || '').trim();
    if (!token) {
        return res.redirect('/admin/register.html?status=error&message=Missing+token');
    }

    const [rows] = await db.execute(
        `SELECT id, status
         FROM user_registration_requests
         WHERE verification_token = ?
         LIMIT 1`,
        [token]
    );
    const requestRow = rows[0];
    if (!requestRow) {
        return res.redirect('/admin/register.html?status=error&message=Invalid+or+expired+link');
    }

    if (requestRow.status === 'approved') {
        return res.redirect('/admin/register.html?status=approved');
    }
    if (requestRow.status === 'pending_admin_approval') {
        return res.redirect('/admin/register.html?status=awaiting_admin');
    }

    await db.execute(
        `UPDATE user_registration_requests
         SET email_verified_at = NOW(),
             verification_token = NULL,
             status = 'pending_admin_approval',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [requestRow.id]
    );

    return res.redirect('/admin/register.html?status=awaiting_admin');
});

router.post('/login', async (req, res) => {
    const db = req.app.locals.db;
    const rawIdentifier = String(req.body?.identifier || req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    const ipAddress = getClientIp(req);

    if (!rawIdentifier || !password) {
        return res.status(400).json({ error: 'Email/username and password are required.' });
    }

    const normalizedIdentifier = rawIdentifier.toLowerCase();
    const isEmailIdentifier = normalizedIdentifier.includes('@');
    if (isEmailIdentifier && !isEnterpriseEmail(normalizedIdentifier)) {
        return res.status(403).json({ error: `Only @${ENTERPRISE_DOMAIN} accounts can log in here.` });
    }

    const lockoutKey = normalizedIdentifier;
    const attemptRow = await getAttemptRow(db, lockoutKey, ipAddress);
    if (attemptRow?.locked_until && new Date(attemptRow.locked_until) > new Date()) {
        return res.status(429).json({ error: 'Too many failed login attempts. Try again later.' });
    }

    const [rows] = await db.execute(
        `SELECT id, email, username, first_name, last_name, is_admin, verified, password_hash
         FROM users
         WHERE (email = ? OR username = ?)
         LIMIT 1`,
        [normalizedIdentifier, normalizedIdentifier]
    );
    const user = rows[0];

    const passwordMatches = !!(user?.password_hash && await bcrypt.compare(password, user.password_hash));
    const canLogin = !!(user && user.verified && passwordMatches);
    if (!canLogin) {
        const withinWindow = isWithinWindow(attemptRow?.first_failed_at);
        const failedAttempts = withinWindow ? Number(attemptRow?.failed_attempts || 0) + 1 : 1;
        const firstFailedAt = withinWindow
            ? attemptRow.first_failed_at
            : new Date().toISOString().slice(0, 19).replace('T', ' ');
        const shouldLock = failedAttempts >= MAX_FAILED_ATTEMPTS;
        const lockedUntil = shouldLock ? lockoutExpiryTimestamp() : null;

        await db.execute(
            `INSERT INTO admin_login_attempts (email, ip_address, failed_attempts, first_failed_at, locked_until)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                failed_attempts = VALUES(failed_attempts),
                first_failed_at = VALUES(first_failed_at),
                locked_until = VALUES(locked_until),
                updated_at = CURRENT_TIMESTAMP`,
            [lockoutKey, ipAddress, failedAttempts, firstFailedAt, lockedUntil]
        );

        if (shouldLock) {
            return res.status(429).json({ error: 'Too many failed login attempts. Try again later.' });
        }
        return res.status(401).json({ error: 'Invalid credentials or account not approved yet.' });
    }

    await db.execute('DELETE FROM admin_login_attempts WHERE email = ? AND ip_address = ?', [lockoutKey, ipAddress]);

    return req.session.regenerate((regenErr) => {
        if (regenErr) {
            return res.status(500).json({ error: 'Login failed.' });
        }

        req.login({
            id: user.id,
            principal_type: 'user',
            email: user.email,
            username: user.username || null,
            first_name: user.first_name || null,
            last_name: user.last_name || null,
            name: buildDisplayName(user),
            is_admin: !!user.is_admin,
        }, (loginErr) => {
            if (loginErr) {
                return res.status(500).json({ error: 'Login failed.' });
            }
            return res.json({
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username || null,
                    first_name: user.first_name || null,
                    last_name: user.last_name || null,
                    name: buildDisplayName(user),
                    is_admin: !!user.is_admin,
                },
            });
        });
    });
});

router.post('/logout', (req, res) => {
    req.logout(() => {
        req.session?.destroy(() => {
            res.json({ message: 'Logged out.' });
        });
    });
});

router.get('/me', (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated() || req.user?.principal_type !== 'user') {
        return res.json({ user: null });
    }
    return res.json({
        user: {
            id: req.user.id,
            email: req.user.email,
            username: req.user.username || null,
            first_name: req.user.first_name || null,
            last_name: req.user.last_name || null,
            name: req.user.name || req.user.username || null,
            is_admin: !!req.user.is_admin,
        },
    });
});

module.exports = router;

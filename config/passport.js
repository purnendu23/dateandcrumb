const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcrypt');

const buildFullName = (firstName, lastName) => {
    const full = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim();
    return full || null;
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

module.exports = function (db) {
    passport.serializeUser((principal, done) => {
        done(null, {
            id: principal.id,
            principal_type: principal.principal_type || 'customer',
        });
    });

    passport.deserializeUser(async (sessionPrincipal, done) => {
        try {
            const principalType =
                sessionPrincipal && typeof sessionPrincipal === 'object'
                    ? sessionPrincipal.principal_type
                    : 'customer';
            const principalId =
                sessionPrincipal && typeof sessionPrincipal === 'object'
                    ? sessionPrincipal.id
                    : sessionPrincipal;

            if (!Number.isInteger(Number(principalId))) {
                return done(null, null);
            }

            if (principalType === 'user') {
                const [rows] = await db.execute(
                    'SELECT id, email, username, first_name, last_name, is_admin FROM users WHERE id = ?',
                    [principalId]
                );
                const user = rows[0];
                if (!user) return done(null, null);
                return done(null, {
                    id: user.id,
                    principal_type: 'user',
                    email: user.email,
                    username: user.username || null,
                    first_name: user.first_name || null,
                    last_name: user.last_name || null,
                    name: user.username || buildFullName(user.first_name, user.last_name),
                    is_admin: !!user.is_admin,
                });
            }

            const [rows] = await db.execute(
                `SELECT id, email, first_name, last_name, full_name, provider
                 FROM customers
                 WHERE id = ?`,
                [principalId]
            );
            const customer = rows[0];
            if (!customer) return done(null, null);

            return done(null, {
                id: customer.id,
                principal_type: 'customer',
                email: customer.email,
                first_name: customer.first_name || null,
                last_name: customer.last_name || null,
                name: customer.full_name || buildFullName(customer.first_name, customer.last_name),
                is_admin: false,
                provider: customer.provider,
            });
        } catch (err) {
            return done(err, null);
        }
    });

    passport.use('customer-local', new LocalStrategy(
        { usernameField: 'email' },
        async (email, password, done) => {
            try {
                const normalizedEmail = normalizeEmail(email);
                const [rows] = await db.execute(
                    `SELECT *
                     FROM customers
                     WHERE email = ?
                       AND provider = 'local'
                     LIMIT 1`,
                    [normalizedEmail]
                );
                const customer = rows[0];
                if (!customer) return done(null, false, { message: 'Invalid email or password.' });
                if (!customer.password_hash) return done(null, false, { message: 'This account uses social login.' });
                if (!customer.verified) return done(null, false, { message: 'Please verify your email before logging in.' });

                const match = await bcrypt.compare(password, customer.password_hash);
                if (!match) return done(null, false, { message: 'Invalid email or password.' });

                return done(null, {
                    id: customer.id,
                    principal_type: 'customer',
                    email: customer.email,
                    first_name: customer.first_name || null,
                    last_name: customer.last_name || null,
                    name: customer.full_name || buildFullName(customer.first_name, customer.last_name),
                    is_admin: false,
                    provider: customer.provider,
                });
            } catch (err) {
                return done(err);
            }
        }
    ));

    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        passport.use(new GoogleStrategy(
            {
                clientID: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
            },
            async (accessToken, refreshToken, profile, done) => {
                try {
                    const email = normalizeEmail(profile.emails?.[0]?.value);
                    if (!email) return done(null, false, { message: 'No email from Google.' });

                    let [rows] = await db.execute(
                        'SELECT * FROM customers WHERE provider = ? AND provider_id = ?',
                        ['google', profile.id]
                    );
                    let customer = rows[0];
                    if (!customer) {
                        [rows] = await db.execute('SELECT * FROM customers WHERE email = ?', [email]);
                        customer = rows[0];
                        if (customer) {
                            await db.execute(
                                'UPDATE customers SET provider = ?, provider_id = ?, verified = 1 WHERE id = ?',
                                ['google', profile.id, customer.id]
                            );
                        } else {
                            const firstName = profile.name?.givenName || null;
                            const lastName = profile.name?.familyName || null;
                            const fullName = buildFullName(firstName, lastName) || profile.displayName || null;
                            const [result] = await db.execute(
                                `INSERT INTO customers (
                                    email, first_name, last_name, full_name,
                                    provider, provider_id, verified
                                 ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
                                [email, firstName, lastName, fullName, 'google', profile.id]
                            );
                            customer = {
                                id: result.insertId,
                                email,
                                first_name: firstName,
                                last_name: lastName,
                                full_name: fullName,
                                provider: 'google',
                            };
                        }
                    }

                    return done(null, {
                        id: customer.id,
                        principal_type: 'customer',
                        email: customer.email,
                        first_name: customer.first_name || null,
                        last_name: customer.last_name || null,
                        name: customer.full_name || buildFullName(customer.first_name, customer.last_name),
                        is_admin: false,
                        provider: customer.provider || 'google',
                    });
                } catch (err) {
                    return done(err);
                }
            }
        ));
        console.log('Google OAuth strategy configured for customers.');
    } else {
        console.log('Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.');
    }

    if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID) {
        try {
            const AppleStrategy = require('passport-apple');
            passport.use(new AppleStrategy(
                {
                    clientID: process.env.APPLE_CLIENT_ID,
                    teamID: process.env.APPLE_TEAM_ID,
                    keyID: process.env.APPLE_KEY_ID,
                    privateKeyLocation: process.env.APPLE_PRIVATE_KEY_PATH,
                    callbackURL: process.env.APPLE_CALLBACK_URL || '/api/auth/apple/callback',
                    passReqToCallback: true,
                },
                async (req, accessToken, refreshToken, idToken, profile, done) => {
                    try {
                        const email = normalizeEmail(profile.email || idToken?.email);
                        if (!email) return done(null, false, { message: 'No email from Apple.' });

                        let [rows] = await db.execute(
                            'SELECT * FROM customers WHERE provider = ? AND provider_id = ?',
                            ['apple', profile.id]
                        );
                        let customer = rows[0];
                        if (!customer) {
                            [rows] = await db.execute('SELECT * FROM customers WHERE email = ?', [email]);
                            customer = rows[0];
                            if (customer) {
                                await db.execute(
                                    'UPDATE customers SET provider = ?, provider_id = ?, verified = 1 WHERE id = ?',
                                    ['apple', profile.id, customer.id]
                                );
                            } else {
                                const firstName = profile.name?.firstName || null;
                                const lastName = profile.name?.lastName || null;
                                const fullName = buildFullName(firstName, lastName);
                                const [result] = await db.execute(
                                    `INSERT INTO customers (
                                        email, first_name, last_name, full_name,
                                        provider, provider_id, verified
                                     ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
                                    [email, firstName, lastName, fullName, 'apple', profile.id]
                                );
                                customer = {
                                    id: result.insertId,
                                    email,
                                    first_name: firstName,
                                    last_name: lastName,
                                    full_name: fullName,
                                    provider: 'apple',
                                };
                            }
                        }

                        return done(null, {
                            id: customer.id,
                            principal_type: 'customer',
                            email: customer.email,
                            first_name: customer.first_name || null,
                            last_name: customer.last_name || null,
                            name: customer.full_name || buildFullName(customer.first_name, customer.last_name),
                            is_admin: false,
                            provider: customer.provider || 'apple',
                        });
                    } catch (err) {
                        return done(err);
                    }
                }
            ));
            console.log('Apple Sign In strategy configured for customers.');
        } catch (err) {
            console.log('Apple Sign In not configured:', err.message);
        }
    } else {
        console.log('Apple Sign In not configured — set APPLE_CLIENT_ID and APPLE_TEAM_ID env vars.');
    }

    return passport;
};

const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcrypt');
const buildFullName = (firstName, lastName) => {
    const full = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim();
    return full || null;
};

module.exports = function (db) {
    // Serialize user ID into session
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    // Deserialize user from session
    passport.deserializeUser(async (id, done) => {
        try {
            const [rows] = await db.execute(
                'SELECT id, email, first_name, last_name, name, provider, is_admin FROM users WHERE id = ?',
                [id]
            );
            done(null, rows[0] || null);
        } catch (err) {
            done(err, null);
        }
    });

    // Local strategy — email/password
    passport.use(new LocalStrategy(
        { usernameField: 'email' },
        async (email, password, done) => {
            try {
                const [rows] = await db.execute('SELECT * FROM users WHERE email = ? AND provider = ?', [email, 'local']);
                const user = rows[0];
                if (!user) return done(null, false, { message: 'Invalid email or password.' });
                if (!user.password_hash) return done(null, false, { message: 'This account uses social login.' });
                if (!user.verified) return done(null, false, { message: 'Please verify your email before logging in.' });

                const match = await bcrypt.compare(password, user.password_hash);
                if (!match) return done(null, false, { message: 'Invalid email or password.' });
                return done(null, {
                    id: user.id,
                    email: user.email,
                    first_name: user.first_name || null,
                    last_name: user.last_name || null,
                    name: user.name || buildFullName(user.first_name, user.last_name),
                });
            } catch (err) {
                return done(err);
            }
        }
    ));

    // Google OAuth strategy
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        passport.use(new GoogleStrategy(
            {
                clientID: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
            },
            async (accessToken, refreshToken, profile, done) => {
                try {
                    const email = profile.emails?.[0]?.value;
                    if (!email) return done(null, false, { message: 'No email from Google.' });

                    let [rows] = await db.execute('SELECT * FROM users WHERE provider = ? AND provider_id = ?', ['google', profile.id]);
                    let user = rows[0];
                    if (!user) {
                        [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
                        user = rows[0];
                        if (user) {
                            await db.execute('UPDATE users SET provider = ?, provider_id = ? WHERE id = ?', ['google', profile.id, user.id]);
                        } else {
                            const firstName = profile.name?.givenName || null;
                            const lastName = profile.name?.familyName || null;
                            const fullName = buildFullName(firstName, lastName) || profile.displayName || null;
                            const [result] = await db.execute(
                                'INSERT INTO users (email, first_name, last_name, name, provider, provider_id) VALUES (?, ?, ?, ?, ?, ?)',
                                [email, firstName, lastName, fullName, 'google', profile.id]
                            );
                            user = { id: result.insertId, email, first_name: firstName, last_name: lastName, name: fullName };
                        }
                    }
                    return done(null, {
                        id: user.id,
                        email: user.email,
                        first_name: user.first_name || null,
                        last_name: user.last_name || null,
                        name: user.name || buildFullName(user.first_name, user.last_name),
                    });
                } catch (err) {
                    return done(err);
                }
            }
        ));
        console.log('Google OAuth strategy configured.');
    } else {
        console.log('Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.');
    }

    // Apple Sign In
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
                        const email = profile.email || idToken?.email;
                        if (!email) return done(null, false, { message: 'No email from Apple.' });

                        let [rows] = await db.execute('SELECT * FROM users WHERE provider = ? AND provider_id = ?', ['apple', profile.id]);
                        let user = rows[0];
                        if (!user) {
                            [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
                            user = rows[0];
                            if (user) {
                                await db.execute('UPDATE users SET provider = ?, provider_id = ? WHERE id = ?', ['apple', profile.id, user.id]);
                            } else {
                                const firstName = profile.name?.firstName || null;
                                const lastName = profile.name?.lastName || null;
                                const fullName = buildFullName(firstName, lastName);
                                const [result] = await db.execute(
                                    'INSERT INTO users (email, first_name, last_name, name, provider, provider_id) VALUES (?, ?, ?, ?, ?, ?)',
                                    [email, firstName, lastName, fullName, 'apple', profile.id]
                                );
                                user = { id: result.insertId, email, first_name: firstName, last_name: lastName, name: fullName };
                            }
                        }
                        return done(null, {
                            id: user.id,
                            email: user.email,
                            first_name: user.first_name || null,
                            last_name: user.last_name || null,
                            name: user.name || buildFullName(user.first_name, user.last_name),
                        });
                    } catch (err) {
                        return done(err);
                    }
                }
            ));
            console.log('Apple Sign In strategy configured.');
        } catch (err) {
            console.log('Apple Sign In not configured:', err.message);
        }
    } else {
        console.log('Apple Sign In not configured — set APPLE_CLIENT_ID and APPLE_TEAM_ID env vars.');
    }

    return passport;
};

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const doc = new PDFDocument({ margin: 50 });
const output = path.join(__dirname, 'admin-dashboard-guide.pdf');
doc.pipe(fs.createWriteStream(output));

// ─── Helpers ─────────────────────────────────────────────
function title(text) {
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#8b4513')
       .text(text, { align: 'center' });
}
function subtitle(text) {
    doc.fontSize(10).font('Helvetica').fillColor('#666')
       .text(text, { align: 'center' });
}
function divider() {
    doc.moveDown(1);
    doc.strokeColor('#e0d5c8').lineWidth(1)
       .moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(1);
}
function section(text) {
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#3d2b1f').text(text);
    doc.moveDown(0.5);
}
function subsection(text) {
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#b5651d').text(text);
    doc.moveDown(0.3);
}
function body(text) {
    doc.fontSize(11).font('Helvetica').fillColor('#3d2b1f').text(text);
    doc.moveDown(0.5);
}
function code(text) {
    doc.fontSize(10).font('Courier').fillColor('#555').text('  ' + text);
}
function codeBlock(lines) {
    for (const line of lines) {
        code(line);
    }
    doc.moveDown(0.5);
}
function bullet(text) {
    doc.fontSize(11).font('Helvetica').fillColor('#3d2b1f').text('  •  ' + text);
}

// ─── Page 1: Title & Overview ────────────────────────────
title('Bakehouse — Admin Dashboard Guide');
doc.moveDown(0.5);
subtitle('Generated: ' + new Date().toLocaleDateString());
doc.moveDown(0.3);
subtitle('Architecture: Route-based admin at /admin with role-based access control');
divider();

section('Overview');
body(
    'The Bakehouse admin dashboard is a protected, internal-only interface that lets administrators ' +
    'manage orders, view users, and monitor products. It lives at /admin on the same server as the ' +
    'public storefront — no separate server or port is needed.'
);
body(
    'Access is restricted through two layers of protection: (1) Express middleware on the /admin path ' +
    'that redirects unauthenticated or non-admin users to the admin login page, and (2) a requireAdmin ' +
    'middleware on all /api/admin/* API routes that returns 401/403 for unauthorized requests.'
);
divider();

// ─── Architecture ────────────────────────────────────────
section('Architecture');

subsection('How It Works');
bullet('The admin dashboard is served as static files from the admin/ directory.');
bullet('An Express middleware intercepts all /admin requests and checks authentication + admin role.');
bullet('Non-admin visitors are redirected to /admin/login.html.');
bullet('The admin login page authenticates via the existing /api/auth/login endpoint.');
bullet('After login, it checks /api/auth/me to verify the user has is_admin = 1.');
bullet('If the user is not an admin, they are logged back out and shown "Access denied."');
doc.moveDown(0.5);

subsection('Key Files');
bullet('server.js — Admin middleware and static file serving');
bullet('routes/admin.js — Protected API endpoints (stats, orders, users, products)');
bullet('admin/index.html — Dashboard UI (stats cards, tabbed tables)');
bullet('admin/login.html — Admin-specific login page');
bullet('config/passport.js — deserializeUser includes is_admin field');
bullet('db/schema.sql — users table has is_admin column');
doc.moveDown(0.5);

subsection('Database: is_admin Column');
body('The users table includes an is_admin column:');
codeBlock([
    'is_admin INTEGER NOT NULL DEFAULT 0'
]);
body('0 = regular user, 1 = admin. New users are always non-admin by default.');
divider();

// ─── Setting Up an Admin ─────────────────────────────────
section('Setting Up an Admin User');

subsection('Step 1: Register a User');
body(
    'Go to /register.html on your Bakehouse site and create an account with email and password. ' +
    'Complete the email verification process (click the link in the verification email).'
);

subsection('Step 2: Promote to Admin');
body('Run this command in your terminal from the bakehouse project directory:');
doc.moveDown(0.3);
codeBlock([
    'node -e "const db = require(\'better-sqlite3\')(\'db/bakehouse.db\');',
    '  db.prepare(\\"UPDATE users SET is_admin = 1 WHERE email = ?\\").run(\'your@email.com\');',
    '  console.log(\'Done\');"'
]);
body('Replace your@email.com with the actual email address of the user you want to promote.');
doc.moveDown(0.3);

subsection('Step 3: Verify');
body('Confirm the user is now an admin:');
codeBlock([
    'node -e "const db = require(\'better-sqlite3\')(\'db/bakehouse.db\');',
    '  console.log(db.prepare(\'SELECT id, email, is_admin FROM users\').all());"'
]);
divider();

// ─── Accessing the Dashboard ─────────────────────────────
section('Accessing the Admin Dashboard');

subsection('URL');
body('Navigate to: http://localhost:3000/admin/');
doc.moveDown(0.3);

subsection('Login Flow');
bullet('If you are not logged in, you are redirected to /admin/login.html.');
bullet('Enter the email and password of an admin user.');
bullet('The page authenticates via /api/auth/login, then verifies admin role via /api/auth/me.');
bullet('If the user is not an admin, they are logged out and shown an "Access denied" error.');
bullet('If the user is an admin, they are redirected to the dashboard at /admin/.');
doc.moveDown(0.5);

subsection('Dashboard Features');
bullet('Stats overview — total orders, pending orders, revenue, total users, total products.');
bullet('Orders tab — view all orders with customer info, items, total, and status dropdown to update.');
bullet('Users tab — view all registered users with verification and admin status.');
bullet('Products tab — view all products with category, price, stock, and featured flag.');
divider();

// ─── API Endpoints ───────────────────────────────────────
section('Admin API Endpoints');
body('All endpoints are prefixed with /api/admin and protected by the requireAdmin middleware.');
doc.moveDown(0.3);

const endpoints = [
    ['GET', '/api/admin/stats', 'Returns order counts, revenue, user and product totals.'],
    ['GET', '/api/admin/orders', 'Returns all orders with line items (joined with products).'],
    ['PATCH', '/api/admin/orders/:id/status', 'Updates order status. Body: { "status": "shipped" }. Valid statuses: pending, confirmed, shipped, delivered, cancelled.'],
    ['GET', '/api/admin/users', 'Returns all users (id, email, name, provider, verified, is_admin, created_at).'],
    ['GET', '/api/admin/products', 'Returns all products joined with category names.'],
];

for (const [method, path, desc] of endpoints) {
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#b5651d').text(method + '  ' + path);
    doc.fontSize(10).font('Helvetica').fillColor('#3d2b1f').text('  ' + desc);
    doc.moveDown(0.4);
}
divider();

// ─── Security ────────────────────────────────────────────
section('Security Model');

subsection('Page-Level Protection (server.js middleware)');
body(
    'An Express middleware at the /admin path checks req.isAuthenticated() and req.user.is_admin. ' +
    'If either check fails, the user is redirected to /admin/login.html. Static assets for the login ' +
    'page (CSS, JS, images) are whitelisted so the login page itself can load.'
);

subsection('API-Level Protection (routes/admin.js)');
body(
    'The requireAdmin middleware runs on every /api/admin/* route. It returns 401 if not authenticated ' +
    'and 403 if the user is not an admin. This ensures the admin API cannot be accessed even if ' +
    'someone bypasses the page-level redirect.'
);

subsection('Client-Side Verification (admin/login.html)');
body(
    'After successful authentication, the login page checks /api/auth/me to confirm is_admin = 1. ' +
    'If the user is not an admin, it immediately calls /api/auth/logout to end the session and ' +
    'displays an "Access denied" message. This prevents non-admin users from remaining logged in ' +
    'after attempting admin access.'
);
divider();

// ─── Revoking Access ─────────────────────────────────────
section('Revoking Admin Access');
body('To remove admin privileges from a user:');
codeBlock([
    'node -e "const db = require(\'better-sqlite3\')(\'db/bakehouse.db\');',
    '  db.prepare(\\"UPDATE users SET is_admin = 0 WHERE email = ?\\").run(\'user@email.com\');',
    '  console.log(\'Admin access revoked\');"'
]);
body('The change takes effect on the user\'s next request (existing sessions will re-check is_admin from the database via passport deserializeUser on each request).');

doc.end();
console.log('PDF created:', output);

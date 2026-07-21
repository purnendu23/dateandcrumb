const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const doc = new PDFDocument({ margin: 50 });
const output = path.join(__dirname, 'payment-gateway-guide.pdf');
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
    for (const line of lines) { code(line); }
    doc.moveDown(0.5);
}
function bullet(text) {
    doc.fontSize(11).font('Helvetica').fillColor('#3d2b1f').text('  •  ' + text);
}

// ─── Title ───────────────────────────────────────────────
title('Bakehouse — Payment Gateway Integration');
doc.moveDown(0.5);
subtitle('Stripe + PayPal · Generated: ' + new Date().toLocaleDateString());
divider();

// ─── Overview ────────────────────────────────────────────
section('Overview');
body(
    'The Bakehouse checkout now supports two payment gateways: Stripe for credit/debit card payments ' +
    'and PayPal. Both gateways are integrated server-side with secure APIs — no raw card data ever ' +
    'touches the Bakehouse server. Payment is processed and confirmed before the order is recorded ' +
    'in the database.'
);
body(
    'The checkout flow is a 3-step process: (1) Shipping information, (2) Payment method selection ' +
    'and card entry or PayPal, (3) Review and place order.'
);
divider();

// ─── Stripe ──────────────────────────────────────────────
section('Stripe (Credit / Debit Cards)');

subsection('How It Works');
bullet('Server creates a Stripe PaymentIntent via the Stripe Node SDK.');
bullet('Frontend uses Stripe Elements (Stripe.js) to securely collect card details.');
bullet('Card information is sent directly to Stripe — never touches the Bakehouse server (PCI compliant).');
bullet('After the user clicks "Place Order", stripe.confirmPayment() is called.');
bullet('On success, the order is created in the Bakehouse DB with the Stripe payment ID.');
doc.moveDown(0.5);

subsection('Server Endpoints');
doc.fontSize(11).font('Helvetica-Bold').fillColor('#b5651d').text('GET  /api/payments/config');
doc.fontSize(10).font('Helvetica').fillColor('#3d2b1f').text('  Returns Stripe public key and PayPal client ID so the frontend knows which gateways are available.');
doc.moveDown(0.4);
doc.fontSize(11).font('Helvetica-Bold').fillColor('#b5651d').text('POST  /api/payments/stripe/create-intent');
doc.fontSize(10).font('Helvetica').fillColor('#3d2b1f').text('  Accepts cart items, calculates total from DB prices (never trusts client amounts), creates a PaymentIntent, returns the client secret.');
doc.moveDown(0.5);

subsection('Frontend Flow');
bullet('Stripe.js is loaded from https://js.stripe.com/v3/ in the checkout page head.');
bullet('When the user moves to the Payment step, a PaymentIntent is created and the Stripe Payment Element is mounted.');
bullet('The Stripe Element handles card number, expiry, CVC, and card brand detection automatically.');
bullet('On form submit, confirmPayment() processes the charge and returns the paymentIntent ID.');
divider();

// ─── PayPal ──────────────────────────────────────────────
section('PayPal');

subsection('How It Works');
bullet('Server uses PayPal REST API v2 (Orders) — no SDK package needed, just HTTP calls.');
bullet('PayPal JS SDK is loaded dynamically on the frontend only when needed.');
bullet('PayPal buttons render on the Review step when PayPal is selected as the payment method.');
bullet('Payment is created and captured via server-side endpoints before the order is stored.');
doc.moveDown(0.5);

subsection('Server Endpoints');
doc.fontSize(11).font('Helvetica-Bold').fillColor('#b5651d').text('POST  /api/payments/paypal/create-order');
doc.fontSize(10).font('Helvetica').fillColor('#3d2b1f').text('  Calculates total from DB, gets a PayPal access token, creates a PayPal order with line items, returns the PayPal order ID.');
doc.moveDown(0.4);
doc.fontSize(11).font('Helvetica-Bold').fillColor('#b5651d').text('POST  /api/payments/paypal/capture-order');
doc.fontSize(10).font('Helvetica').fillColor('#3d2b1f').text('  Captures the approved PayPal order. Returns COMPLETED status and transaction ID.');
doc.moveDown(0.5);

subsection('Frontend Flow');
bullet('PayPal JS SDK loads dynamically from paypal.com when the user first navigates to the Payment step.');
bullet('If PayPal is selected, official PayPal Buttons render on the Review step.');
bullet('Clicking the PayPal button opens the PayPal popup for login and approval.');
bullet('On approval, capture-order is called, and the Bakehouse order is created with the PayPal transaction ID.');
divider();

// ─── Database Changes ────────────────────────────────────
section('Database Changes');
body('Two new columns were added to the orders table:');
codeBlock([
    'payment_method  TEXT     -- "stripe" or "paypal"',
    'payment_id      TEXT     -- Stripe PaymentIntent ID or PayPal capture ID',
]);
body('These are stored alongside the order so you can always trace a payment back to the gateway.');
divider();

// ─── Files Changed / Created ─────────────────────────────
section('Files Changed / Created');
doc.moveDown(0.3);

const files = [
    ['routes/payments.js', 'NEW — Stripe intent creation, PayPal order create/capture, config endpoint.'],
    ['server.js', 'Wired /api/payments routes.'],
    ['db/schema.sql', 'Added payment_method and payment_id columns to orders table.'],
    ['routes/orders.js', 'Accepts payment_method and payment_id in order creation.'],
    ['public/checkout.html', 'Stripe Elements + PayPal buttons replace raw card inputs. Stripe.js loaded in head.'],
    ['public/js/checkout.js', 'Full rewrite — Stripe Payment Element mount, PayPal SDK dynamic load, gateway toggle.'],
    ['public/css/style.css', 'Stripe element styling, PayPal container, field-error class.'],
];

for (const [file, desc] of files) {
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#b5651d').text(file);
    doc.fontSize(10).font('Helvetica').fillColor('#3d2b1f').text('  ' + desc);
    doc.moveDown(0.3);
}
divider();

// ─── Setup / Configuration ───────────────────────────────
section('Setup & Configuration');

subsection('Environment Variables');
body('Set these environment variables to activate the payment gateways:');
doc.moveDown(0.3);

doc.fontSize(11).font('Helvetica-Bold').fillColor('#3d2b1f').text('Stripe:');
codeBlock([
    'STRIPE_SECRET_KEY=sk_test_...',
    'STRIPE_PUBLIC_KEY=pk_test_...',
]);

doc.fontSize(11).font('Helvetica-Bold').fillColor('#3d2b1f').text('PayPal (sandbox):');
codeBlock([
    'PAYPAL_CLIENT_ID=your-sandbox-client-id',
    'PAYPAL_SECRET=your-sandbox-secret',
    'PAYPAL_API=https://api-m.sandbox.paypal.com   (default, omit for sandbox)',
]);

doc.fontSize(11).font('Helvetica-Bold').fillColor('#3d2b1f').text('PayPal (production):');
codeBlock([
    'PAYPAL_CLIENT_ID=your-live-client-id',
    'PAYPAL_SECRET=your-live-secret',
    'PAYPAL_API=https://api-m.paypal.com',
]);

subsection('Where to Get Keys');
bullet('Stripe: https://dashboard.stripe.com/test/apikeys');
bullet('PayPal: https://developer.paypal.com (create a Sandbox app)');
doc.moveDown(0.5);

subsection('Re-seed Database');
body('After pulling these changes, re-seed the database to add the new columns:');
codeBlock(['npm run seed']);
body('Admin users are automatically preserved during re-seed.');
divider();

// ─── Security ────────────────────────────────────────────
section('Security Notes');
bullet('Card data never touches the Bakehouse server — Stripe.js sends it directly to Stripe.');
bullet('Order totals are always calculated server-side from DB product prices, never from client-submitted amounts.');
bullet('PayPal access tokens are obtained per-request using client credentials grant.');
bullet('All secret keys are stored in environment variables, never in code.');
bullet('The /api/payments/config endpoint only exposes public keys (Stripe publishable key, PayPal client ID).');

doc.end();
console.log('PDF created:', output);

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const doc = new PDFDocument({ margin: 50, size: 'A4' });
const output = path.join(__dirname, 'checkout-code-guide.pdf');
doc.pipe(fs.createWriteStream(output));

// ── Helpers ──────────────────────────────────────────────
const BROWN = '#8b4513';
const DARK = '#222';
const GRAY = '#555';
const LIGHT_BG = '#f5f0eb';
const CODE_BG = '#f4f4f4';
const BLUE = '#1a5276';

function title(text) {
    doc.moveDown(0.5);
    doc.fontSize(22).font('Helvetica-Bold').fillColor(BROWN).text(text);
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(BROWN).lineWidth(2).stroke();
    doc.moveDown(0.5);
}

function heading(text) {
    checkPage(60);
    doc.moveDown(0.5);
    doc.fontSize(15).font('Helvetica-Bold').fillColor(BLUE).text(text);
    doc.moveDown(0.3);
}

function subheading(text) {
    checkPage(50);
    doc.moveDown(0.3);
    doc.fontSize(12).font('Helvetica-Bold').fillColor(DARK).text(text);
    doc.moveDown(0.2);
}

function para(text) {
    checkPage(40);
    doc.fontSize(10.5).font('Helvetica').fillColor(DARK).text(text, { lineGap: 3 });
    doc.moveDown(0.3);
}

function bullet(text) {
    checkPage(30);
    doc.fontSize(10.5).font('Helvetica').fillColor(DARK).text(`  •  ${text}`, { lineGap: 2, indent: 10 });
}

function code(text) {
    checkPage(30);
    const x = doc.x;
    doc.moveDown(0.2);
    doc.save();
    doc.fontSize(9).font('Courier').fillColor('#333');
    const lines = text.split('\n');
    for (const line of lines) {
        checkPage(15);
        doc.text(line, x + 10, doc.y, { lineGap: 1.5 });
    }
    doc.restore();
    doc.moveDown(0.3);
}

function conceptBox(conceptName, explanation) {
    checkPage(80);
    doc.moveDown(0.3);
    const startY = doc.y;
    doc.save();
    doc.roundedRect(55, startY, 490, 0, 4).fill(LIGHT_BG);
    doc.fillColor(DARK);
    doc.fontSize(11).font('Helvetica-Bold').text(conceptName, 65, startY + 8, { width: 470 });
    doc.fontSize(10).font('Helvetica').text(explanation, 65, doc.y + 2, { width: 470, lineGap: 2 });
    const endY = doc.y + 10;
    const boxHeight = endY - startY;
    // Redraw the box with correct height
    doc.restore();
    doc.save();
    doc.roundedRect(55, startY, 490, boxHeight, 4).fill(LIGHT_BG);
    doc.fillColor(DARK);
    doc.fontSize(11).font('Helvetica-Bold').text(conceptName, 65, startY + 8, { width: 470 });
    doc.fontSize(10).font('Helvetica').text(explanation, 65, doc.y + 2, { width: 470, lineGap: 2 });
    doc.restore();
    doc.y = endY + 5;
    doc.moveDown(0.2);
}

function checkPage(needed) {
    if (doc.y + needed > 780) {
        doc.addPage();
    }
}

// ══════════════════════════════════════════════════════════
// COVER
// ══════════════════════════════════════════════════════════
doc.moveDown(6);
doc.fontSize(30).font('Helvetica-Bold').fillColor(BROWN).text('Bakehouse Checkout', { align: 'center' });
doc.fontSize(18).font('Helvetica').fillColor(DARK).text('Code Walkthrough & JavaScript Concepts', { align: 'center' });
doc.moveDown(1);
doc.fontSize(12).fillColor(GRAY).text('A teaching guide covering checkout.html & checkout.js', { align: 'center' });
doc.moveDown(0.5);
doc.fontSize(10).fillColor(GRAY).text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'center' });

// ══════════════════════════════════════════════════════════
// TABLE OF CONTENTS
// ══════════════════════════════════════════════════════════
doc.addPage();
title('Table of Contents');
const toc = [
    '1. Architecture Overview — How HTML and JS Work Together',
    '2. The HTML Structure (checkout.html)',
    '3. The JavaScript Logic (checkout.js)',
    '4. JavaScript Concepts Used',
    '5. Code Flow — Step by Step',
    '6. The Stripe Payment Flow',
    '7. The PayPal Payment Flow',
    '8. Error Handling Patterns',
    '9. Security Considerations',
    '10. Quick Reference — Key APIs Used',
];
toc.forEach(item => {
    doc.fontSize(11).font('Helvetica').fillColor(DARK).text(item, { lineGap: 6 });
});

// ══════════════════════════════════════════════════════════
// 1. ARCHITECTURE OVERVIEW
// ══════════════════════════════════════════════════════════
doc.addPage();
title('1. Architecture Overview');

para('The checkout feature follows a classic pattern: HTML defines the structure (what the user sees), CSS defines appearance (how it looks), and JavaScript defines behavior (what happens when the user interacts).');

heading('How the Files Connect');
para('When a user visits /checkout.html, the browser:');
bullet('Loads the HTML file — this creates the DOM (Document Object Model)');
bullet('Loads style.css — applies visual styles to the HTML elements');
bullet('Loads Stripe.js from Stripe\'s CDN — enables secure card collection');
bullet('Loads cart.js — provides Cart.getItems() and Cart.clear()');
bullet('Loads auth-nav.js — handles login/logout UI in the header');
bullet('Loads checkout.js — the main logic that drives the checkout flow');

para('The JavaScript communicates with the backend (Node.js/Express server) via HTTP requests using the fetch() API. The server handles payment processing and order creation.');

conceptBox(
    'Client-Server Architecture',
    'The browser (client) runs HTML, CSS, and JavaScript. It sends HTTP requests to the server (Node.js) for data operations like creating payments or placing orders. The server talks to Stripe/PayPal APIs and the SQLite database. The client NEVER directly accesses the database or payment secrets.'
);

// ══════════════════════════════════════════════════════════
// 2. HTML STRUCTURE
// ══════════════════════════════════════════════════════════
doc.addPage();
title('2. The HTML Structure');

para('The checkout page uses a single <form> element with three "steps" inside. Only one step is visible at a time — controlled by JavaScript toggling display:none / display:block.');

heading('Key HTML Elements and Their IDs');

subheading('Step Indicators (the 1-2-3 progress bar)');
code(`<div class="checkout-steps">
    <div class="step active" id="step-ind-1">1 Shipping</div>
    <div class="step" id="step-ind-2">2 Payment</div>
    <div class="step" id="step-ind-3">3 Review</div>
</div>`);
para('JavaScript uses these IDs (step-ind-1, step-ind-2, step-ind-3) to add/remove "active" and "done" CSS classes as the user progresses.');

subheading('Step 1: Shipping (id="step-shipping")');
para('Contains form inputs for name, email, phone, address, city, state, zip. Uses <input> and <select> elements with name attributes so JavaScript can read them via form.customer_name.value etc.');

subheading('Step 2: Payment (id="step-payment")');
code(`<div id="stripe-card-element" class="stripe-element"></div>`);
para('This empty <div> is where Stripe.js injects its secure iframe. The card number, expiry, and CVC never touch our code — Stripe handles them directly inside this iframe.');

subheading('Step 3: Review (id="step-review")');
para('Contains empty containers (#review-shipping, #review-payment) that JavaScript fills with a summary. Also has the "Place Order" submit button and a div for PayPal buttons.');

subheading('Order Confirmation (id="order-confirmation")');
para('Hidden by default (style="display:none"). JavaScript shows this and hides the form after a successful order.');

conceptBox(
    'The DOM (Document Object Model)',
    'When the browser parses HTML, it creates a tree of objects called the DOM. Each HTML element becomes a "node" you can manipulate with JavaScript. For example, document.getElementById("step-shipping") returns the DOM node for that <div>, and you can change its .style.display property to show/hide it.'
);

// ══════════════════════════════════════════════════════════
// 3. JAVASCRIPT LOGIC
// ══════════════════════════════════════════════════════════
doc.addPage();
title('3. The JavaScript Logic');

para('checkout.js is a single file that sets up all the checkout behavior. Here is its structure broken down:');

heading('File Structure at a Glance');
code(`// Line 1-2:    Event listener wrapping everything
// Line 3-8:    Get DOM references
// Line 10-18:  Empty cart check
// Line 21-28:  Render order summary
// Line 31-43:  Fetch payment configuration from server
// Line 46-53:  Initialize Stripe (without mounting)
// Line 57-73:  mountStripeCard() function
// Line 76-78:  Show PayPal option if configured
// Line 81-101: Step navigation function (goToStep)
// Line 104-120: Step 1 → 2 transition + validation
// Line 123-132: Payment method radio toggle
// Line 135-199: Step 2 → 3 transition + PayPal init
// Line 202-205: Back buttons
// Line 208-251: Stripe payment + form submit handler
// Line 254-284: placeOrder() function
// Line 286-294: Error display helpers
// Line 297-301: escapeHTML() utility`);

// ══════════════════════════════════════════════════════════
// 4. JAVASCRIPT CONCEPTS
// ══════════════════════════════════════════════════════════
doc.addPage();
title('4. JavaScript Concepts Used');

heading('4.1 — DOMContentLoaded Event');
code(`document.addEventListener('DOMContentLoaded', async () => {
    // ... all code here
});`);
para('This ensures our code runs only AFTER the browser has fully parsed the HTML and built the DOM tree. Without this, getElementById() calls might return null because the elements don\'t exist yet.');

conceptBox(
    'Event Listeners',
    'An event listener "watches" for something to happen (a click, page load, form submit, etc.) and runs a function when it does. Syntax: element.addEventListener(eventName, callbackFunction). The callback is not called immediately — it runs later when the event fires. This is the core of interactive web pages.'
);

heading('4.2 — async/await and Promises');
code(`// The callback is marked "async" so we can use "await" inside
document.addEventListener('DOMContentLoaded', async () => {
    const configRes = await fetch('/api/payments/config');
    const config = await configRes.json();
});`);
para('"async" before a function means it can use "await". "await" pauses execution until a Promise resolves. fetch() returns a Promise (a placeholder for a future value). Without await, you\'d get a Promise object instead of the actual data.');

conceptBox(
    'Promises & async/await',
    'A Promise represents a value that isn\'t available yet (like a network response). It can be "pending", "fulfilled" (success), or "rejected" (error). async/await is syntactic sugar over Promises — "await" unwraps the Promise\'s value. Without it, you\'d chain .then() callbacks: fetch(url).then(res => res.json()).then(data => ...).'
);

heading('4.3 — Arrow Functions');
code(`// Traditional function:
function add(a, b) { return a + b; }

// Arrow function (shorter syntax, same idea):
const add = (a, b) => a + b;

// Used everywhere in checkout.js:
items.map(item => \`...\`)
radio.addEventListener('change', () => { ... })`);
para('Arrow functions (=>) are a shorter way to write functions. They also don\'t create their own "this" context, which matters in some situations (not critical here, but good to know).');

heading('4.4 — Template Literals');
code(`// Old way:
'Hello ' + name + ', your total is $' + total

// Template literal (backtick strings):
\`Hello \${name}, your total is $\${total}\``);
para('Backtick strings (\`...\`) allow embedded expressions with ${...} and can span multiple lines. Used extensively to build HTML strings dynamically.');

doc.addPage();
heading('4.5 — DOM Manipulation');
subheading('getElementById — Select one element by ID');
code(`const form = document.getElementById('checkout-form');`);

subheading('querySelector / querySelectorAll — CSS selector-based selection');
code(`// Select ALL radio inputs inside .payment-method
document.querySelectorAll('.payment-method input').forEach(radio => {
    radio.addEventListener('change', () => { ... });
});`);

subheading('Changing content: innerHTML vs textContent');
code(`// innerHTML — sets HTML (tags are parsed):
el.innerHTML = '<p><strong>John</strong></p>';

// textContent — sets plain text (tags NOT parsed, safer):
el.textContent = '$42.00';`);

subheading('Showing/hiding elements');
code(`element.style.display = 'none';   // Hide
element.style.display = 'block';  // Show
element.style.display = '';        // Reset to CSS default`);

subheading('classList — Toggle CSS classes');
code(`ind.classList.toggle('active', true);  // Add class
ind.classList.toggle('done', false);   // Remove class
ind.classList.remove('selected');       // Always remove`);

conceptBox(
    'innerHTML vs textContent',
    'innerHTML parses HTML tags — if you do el.innerHTML = userInput, and userInput contains <script>...</script>, it could execute malicious code (XSS attack). textContent is safe because it treats everything as plain text. That\'s why the code uses escapeHTML() when inserting user-supplied values into innerHTML.'
);

heading('4.6 — The fetch() API');
code(`// GET request (simple):
const res = await fetch('/api/payments/config');
const data = await res.json();

// POST request (sending data):
const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
});`);
para('fetch() sends HTTP requests from the browser to the server. GET is for reading data, POST is for sending data. The response must be parsed (.json() for JSON data). Note: fetch() does NOT throw on 404/500 errors — you must check res.ok or res.status yourself.');

doc.addPage();
heading('4.7 — Array Methods: map(), forEach(), join()');
code(`// map() — transforms each item into something new, returns array
items.map(item => \`<div>\${item.name}</div>\`)

// forEach() — runs a function for each item, returns nothing
radios.forEach(radio => radio.addEventListener(...))

// join() — combines array elements into a single string
['<div>A</div>', '<div>B</div>'].join('')
// Result: '<div>A</div><div>B</div>'`);

heading('4.8 — Destructuring');
code(`// Extract specific properties from an object:
const { error, paymentIntent } = await stripe.confirmCardPayment(...);

// Same as:
const result = await stripe.confirmCardPayment(...);
const error = result.error;
const paymentIntent = result.paymentIntent;`);

heading('4.9 — Ternary Operator');
code(`// condition ? valueIfTrue : valueIfFalse
selectedMethod === 'stripe' ? '' : 'none'

// Same as:
if (selectedMethod === 'stripe') {
    return '';
} else {
    return 'none';
}`);

heading('4.10 — Closures and Scope');
code(`// Variables declared in the outer function are accessible
// inside inner functions — this is called a "closure"
let cardMounted = false;        // Outer scope

function mountStripeCard() {    // Inner function
    if (cardMounted) return;    // Can read outer variable
    // ...
    cardMounted = true;         // Can modify outer variable
}`);
para('All the inner functions (mountStripeCard, goToStep, placeOrder, event handlers) can access variables like stripe, cardElement, items, selectedMethod because they are "closed over" — captured by the inner functions from the outer scope.');

// ══════════════════════════════════════════════════════════
// 5. CODE FLOW
// ══════════════════════════════════════════════════════════
doc.addPage();
title('5. Code Flow — Step by Step');

heading('Phase 1: Page Load');
para('When checkout.html loads, the browser runs checkout.js. Here\'s what happens immediately:');
bullet('1. DOMContentLoaded fires — our async callback runs');
bullet('2. Cart.getItems() reads cart data from localStorage');
bullet('3. If cart is empty → show "empty cart" message, stop');
bullet('4. Render order summary (item list + total) using map() + join()');
bullet('5. fetch("/api/payments/config") → get Stripe public key + PayPal ID');
bullet('6. If Stripe key exists → create Stripe instance (but DON\'T mount card yet)');
bullet('7. If PayPal ID exists → unhide the PayPal radio option');
bullet('8. Set up all event listeners (click handlers, form submit)');
para('At this point the page is idle, waiting for user interaction.');

heading('Phase 2: User Fills Shipping (Step 1)');
bullet('User fills in name, email, address, etc.');
bullet('Clicks "Continue to Payment"');
bullet('Click handler validates: are all required fields filled?');
bullet('If invalid → show error message, stop');
bullet('If valid → goToStep(1) shows step 2, hides step 1');
bullet('mountStripeCard() runs — NOW creates and mounts the Stripe card element');
para('The card element is mounted after step 2 is visible because Stripe\'s iframe needs a visible container to render properly.');

heading('Phase 3: User Selects Payment (Step 2)');
bullet('Stripe card input is ready — user enters card details');
bullet('(Or user selects PayPal if configured)');
bullet('Clicks "Review Order"');
bullet('JavaScript populates the review sections with shipping + payment summaries');
bullet('goToStep(2) shows step 3');

heading('Phase 4: Place Order (Step 3)');
para('This is the most complex phase. Here\'s the Stripe flow:');
bullet('1. User clicks "Place Order" → form submit event fires');
bullet('2. e.preventDefault() stops the browser from doing a normal form submission');
bullet('3. Button disabled + text changed to "Processing…"');
bullet('4. POST /api/payments/stripe/create-intent → server creates a PaymentIntent');
bullet('5. Server calculates total from DATABASE prices (never trusts the client)');
bullet('6. Server returns clientSecret (a one-time token)');
bullet('7. stripe.confirmCardPayment(clientSecret, {card}) → sends card to Stripe');
bullet('8. If payment succeeds → POST /api/orders with payment ID');
bullet('9. Server creates order, deducts stock, returns order ID');
bullet('10. Cart cleared, form hidden, confirmation shown');

// ══════════════════════════════════════════════════════════
// 6. STRIPE FLOW
// ══════════════════════════════════════════════════════════
doc.addPage();
title('6. The Stripe Payment Flow');

para('Stripe uses a secure architecture where card data NEVER passes through your server:');

heading('The Three Actors');
code(`Browser (checkout.js)  ←→  Your Server (payments.js)  ←→  Stripe API
         ↕
   Stripe.js iframe`);

heading('Flow Diagram');
code(`1. Browser → Server:  POST /api/payments/stripe/create-intent
                       { items: [{product_id: 1, quantity: 2}] }

2. Server → Stripe:   stripe.paymentIntents.create({amount, currency})

3. Stripe → Server:   { client_secret: "pi_xxx_secret_yyy" }

4. Server → Browser:  { clientSecret: "pi_xxx_secret_yyy" }

5. Browser → Stripe:  stripe.confirmCardPayment(clientSecret, {card})
   (card data goes DIRECTLY to Stripe via the iframe)

6. Stripe → Browser:  { paymentIntent: { status: "succeeded", id: "pi_xxx" } }

7. Browser → Server:  POST /api/orders { payment_id: "pi_xxx", items, ... }

8. Server creates order in database, returns confirmation`);

conceptBox(
    'Why This Architecture?',
    'Your server never sees the card number, CVV, or expiry. This means: (1) You don\'t need PCI compliance (Stripe handles it). (2) Even if your server is hacked, card data is safe. (3) The server only sees a payment_id proving the charge succeeded.'
);

heading('Key Stripe.js Methods Used');
code(`// Initialize Stripe with your PUBLIC key (safe to expose)
const stripe = Stripe('pk_test_...');

// Create an Elements instance (manages UI components)
const elements = stripe.elements();

// Create a Card Element (the iframe input)
const cardElement = elements.create('card', { style: {...} });

// Mount it into a DOM element
cardElement.mount('#stripe-card-element');

// Confirm the payment (sends card data to Stripe)
const { error, paymentIntent } = await stripe.confirmCardPayment(
    clientSecret,
    { payment_method: { card: cardElement } }
);`);

// ══════════════════════════════════════════════════════════
// 7. PAYPAL FLOW
// ══════════════════════════════════════════════════════════
doc.addPage();
title('7. The PayPal Payment Flow');

code(`1. User selects PayPal and clicks "Review Order"
2. PayPal SDK renders a PayPal button in #paypal-button-container
3. User clicks PayPal button
4. createOrder callback fires:
     Browser → Server:  POST /api/payments/paypal/create-order
     Server → PayPal:   Create order via PayPal API
     PayPal → Server:   Returns order ID
     Server → Browser:  { id: "PAYPAL_ORDER_ID" }
5. PayPal opens a popup for user to log in and approve
6. onApprove callback fires:
     Browser → Server:  POST /api/payments/paypal/capture-order
     Server → PayPal:   Capture (charge) the order
     PayPal → Server:   { status: "COMPLETED" }
     Server → Browser:  { status: "COMPLETED", id: "..." }
7. Browser → Server:   POST /api/orders (same as Stripe flow)
8. Order confirmation shown`);

// ══════════════════════════════════════════════════════════
// 8. ERROR HANDLING
// ══════════════════════════════════════════════════════════
title('8. Error Handling Patterns');

heading('Pattern 1: Validation Before Action');
code(`const name = form.customer_name.value.trim();
if (!name || !email || !address) {
    errEl.textContent = 'Please fill in all required fields.';
    errEl.style.display = 'block';
    return;  // ← STOP here, don't proceed
}`);
para('"return" inside an event handler exits the function early, preventing the code below from running. This is called an "early return" or "guard clause" pattern.');

heading('Pattern 2: try/catch for Async Errors');
code(`try {
    const res = await fetch('/api/payments/stripe/create-intent', { ... });
    const data = await res.json();
    if (!res.ok) {                    // Server returned 4xx/5xx
        showCheckoutError(data.error);
        return;
    }
    // ... continue with success
} catch (err) {                       // Network failure, etc.
    showCheckoutError('Network error.');
}`);
para('try/catch wraps code that might throw an error. If fetch fails (network down), the catch block runs. But note: a 400/500 HTTP response does NOT throw — you must check res.ok manually.');

heading('Pattern 3: UI State Management');
code(`placeBtn.disabled = true;              // Prevent double-clicks
placeBtn.textContent = 'Processing…';  // Visual feedback
// ... if error:
placeBtn.disabled = false;             // Re-enable
placeBtn.textContent = 'Place Order';  // Reset text`);

heading('Pattern 4: Reset on Navigation');
code(`function goToStep(index) {
    // ... show/hide steps
    hideCheckoutError();           // Clear any stale errors
    placeBtn.disabled = false;     // Reset button state
    placeBtn.textContent = 'Place Order';
}`);
para('This prevents the bug where an error message or disabled button persists after navigating back and forth between steps.');

// ══════════════════════════════════════════════════════════
// 9. SECURITY
// ══════════════════════════════════════════════════════════
doc.addPage();
title('9. Security Considerations');

heading('XSS Prevention — escapeHTML()');
code(`function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;   // Treats str as plain text
    return div.innerHTML;    // Returns HTML-escaped version
}
// escapeHTML('<script>alert("hack")</script>')
// Returns: '&lt;script&gt;alert("hack")&lt;/script&gt;'`);
para('Any user input inserted into innerHTML is first escaped. This prevents Cross-Site Scripting (XSS) attacks where a malicious user could inject <script> tags.');

heading('Server-Side Price Calculation');
para('The server NEVER trusts the price sent from the browser. It always looks up product prices from the database:');
code(`// In routes/payments.js (server-side):
const product = getProduct.get(item.product_id);
total += product.price * item.quantity;  // DB price, not client price`);

heading('Card Data Never Touches Your Server');
para('Stripe.js collects card details in a secure iframe. The card number, expiry, and CVV go directly from the browser to Stripe\'s servers. Your server only receives a clientSecret token and later a paymentIntent ID.');

// ══════════════════════════════════════════════════════════
// 10. QUICK REFERENCE
// ══════════════════════════════════════════════════════════
doc.addPage();
title('10. Quick Reference');

heading('DOM Methods');
code(`document.getElementById('id')        // Get element by ID
document.querySelector('.class')      // Get first match (CSS selector)
document.querySelectorAll('selector') // Get ALL matches (NodeList)
element.addEventListener('event', fn) // Attach event handler
element.style.display = 'none'        // Inline CSS
element.classList.toggle('class', bool) // Add/remove CSS class
element.innerHTML = '<p>HTML</p>'     // Set HTML content
element.textContent = 'text'          // Set text content (safe)`);

heading('fetch() API');
code(`// GET
const res = await fetch(url);
const data = await res.json();

// POST
const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
});
if (!res.ok) { /* handle error */ }
const data = await res.json();`);

heading('Array Methods');
code(`arr.map(fn)       // Transform each element → new array
arr.forEach(fn)   // Run fn for each element → no return
arr.filter(fn)    // Keep elements where fn returns true
arr.join(sep)     // Combine into string with separator
arr.find(fn)      // First element where fn returns true`);

heading('String Methods');
code(`str.trim()           // Remove leading/trailing whitespace
str.replace(a, b)    // Replace first occurrence of a with b
str.slice(-4)         // Last 4 characters
str.toFixed(2)        // Number → "12.34" (2 decimal places)`);

heading('Event Types Used');
code(`'DOMContentLoaded'  // HTML fully parsed
'click'              // User clicks element
'change'             // Input value changes (radio, select)
'submit'             // Form submitted
'ready'              // Stripe element loaded (custom event)`);

// ── End ──────────────────────────────────────────────────
doc.moveDown(2);
doc.fontSize(10).font('Helvetica-Oblique').fillColor(GRAY)
    .text('— End of Checkout Code Guide —', { align: 'center' });

doc.end();
console.log('PDF generated:', output);

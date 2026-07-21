const PDFDocument = require('pdfkit');
const fs = require('fs');

const doc = new PDFDocument({ margin: 50 });
doc.pipe(fs.createWriteStream('deployment-guide.pdf'));

const title = 'Bakehouse: Deployment & Going Live Guide';
const date = 'Generated: May 3, 2026';

doc.fontSize(22).font('Helvetica-Bold').text(title, { align: 'center' });
doc.moveDown(0.3);
doc.fontSize(10).font('Helvetica').fillColor('#666').text(date, { align: 'center' });
doc.moveDown(1.5);
doc.fillColor('#000');

function heading(text) {
    doc.moveDown(0.8);
    doc.fontSize(14).font('Helvetica-Bold').text(text);
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica');
}

function bullet(text) {
    doc.text(`•  ${text}`, { indent: 15 });
    doc.moveDown(0.2);
}

function para(text) {
    doc.text(text);
    doc.moveDown(0.4);
}

// --- Content ---

heading('1. Choose a Hosting Provider');
para('Since this is a Node.js app with SQLite, you need a server that allows persistent storage (so you don\'t lose the database on restart).');
bullet('Recommended: DigitalOcean Droplet ($6/mo), Render (with persistent disk), or Railway.');
bullet('Do NOT use Heroku or Vercel unless you attach a persistent volume — their default file systems are temporary and your SQLite database would be wiped on every deploy.');

heading('2. Move from SQLite to a Production Database (Optional but Recommended)');
para('SQLite is fine for very low traffic. But for an e-commerce site handling real orders:');
bullet('Consider migrating to PostgreSQL or MySQL for better concurrency and reliability.');
bullet('If you stick with SQLite: ensure you have a Persistent Disk and set up automated daily backups (e.g., a cron job that copies bakehouse.db to cloud storage).');

heading('3. Set Up HTTPS / SSL');
para('Your site MUST run on HTTPS to process payments (Stripe and PayPal require it).');
bullet('If using Render/Railway: SSL is provided automatically with your custom domain.');
bullet('If using a VPS (DigitalOcean): Set up Nginx as a reverse proxy + Certbot (Let\'s Encrypt) for a free SSL certificate.');
bullet('Remove the self-signed certificate (server.key, server.cert) from production — those are for local dev only.');

heading('4. Configure Production Environment Variables');
para('Create a .env.production file or set variables in your hosting dashboard. NEVER commit production secrets to Git.');
bullet('NODE_ENV=production');
bullet('SESSION_SECRET — change to a long, random, secure string (e.g., 64 random characters).');
bullet('STRIPE_SECRET_KEY / STRIPE_PUBLIC_KEY — switch from sk_test_* / pk_test_* to your LIVE keys from the Stripe dashboard.');
bullet('PAYPAL_CLIENT_ID / PAYPAL_SECRET — switch from sandbox to live credentials. Change PAYPAL_API to https://api-m.paypal.com');
bullet('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — update the OAuth callback URL in Google Cloud Console to https://yourdomain.com/api/auth/google/callback');
bullet('SMTP credentials — ensure they are correct for production.');
bullet('GOOGLE_MAPS_API_KEY / MAPBOX_ACCESS_TOKEN — restrict these keys to your domain in their respective dashboards.');

heading('5. DNS Configuration (Point Domain to Server)');
para('In your domain registrar\'s DNS settings:');
bullet('Add an A record pointing to your server\'s IP address (for a VPS).');
bullet('Or add a CNAME record pointing to your hosting provider\'s URL (for Render/Railway).');
bullet('DNS propagation can take up to 48 hours (usually much faster).');

heading('6. Email Deliverability (SPF, DKIM, DMARC)');
para('So your verification emails, password resets, and order confirmations don\'t land in spam:');
bullet('Add an SPF record to your domain DNS (provided by Zoho).');
bullet('Add a DKIM record (provided by Zoho).');
bullet('Add a DMARC record (e.g., v=DMARC1; p=none; rua=mailto:admin@yourdomain.com).');
bullet('Test deliverability at mail-tester.com.');

heading('7. Set Up a Process Manager');
para('On a VPS, never run the server with just "node server.js". Use PM2:');
bullet('npm install -g pm2');
bullet('pm2 start server.js --name bakehouse');
bullet('pm2 startup (auto-restart on reboot)');
bullet('pm2 save');

heading('8. Security Hardening');
bullet('Set secure cookie options: cookie.secure = true in session config when in production.');
bullet('Add Helmet.js middleware (npm install helmet) for security headers.');
bullet('Add rate limiting (npm install express-rate-limit) to prevent brute force on login/register.');
bullet('Ensure .env files, .db files, node_modules, server.key, and server.cert are in .gitignore.');
bullet('Disable directory listing (already handled by Express static).');

heading('9. Backups');
bullet('Set up a daily cron job to back up your database to cloud storage (S3, Google Cloud Storage, etc.).');
bullet('Keep at least 7 days of rolling backups.');
bullet('Test restore from backup at least once before going live.');

heading('10. Pre-Launch Checklist');
bullet('Test the full order flow end-to-end with LIVE Stripe/PayPal keys (place a real $1 order and refund it).');
bullet('Test email delivery (registration, password reset, order confirmation).');
bullet('Test on mobile devices and different browsers.');
bullet('Verify all images load correctly.');
bullet('Set up basic uptime monitoring (e.g., UptimeRobot — free).');
bullet('Add Google Analytics or a simple analytics tool if desired.');

doc.moveDown(1);
doc.fontSize(10).fillColor('#666').text('— End of Guide —', { align: 'center' });

doc.end();
console.log('PDF generated: deployment-guide.pdf');


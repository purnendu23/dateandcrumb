# Date & Crumb — Nginx + Node.js Deployment Guide

> A complete guide to deploying the Date & Crumb e-commerce site with Nginx as a reverse proxy in front of Node.js on an Ubuntu VPS.

---

## Prerequisites

- An Ubuntu VPS (22.04 or 24.04 LTS recommended)
- A domain name with DNS A record pointing to your server's IP
- SSH access to the server
- Your project files ready to deploy

---

## Step 1: Initial Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y curl git ufw

# Set up firewall
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

## Step 2: Install Node.js

```bash
# Install Node.js 20.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v
npm -v
```

---

## Step 3: Install MySQL

```bash
# Install MySQL
sudo apt install -y mysql-server

# Secure the installation
sudo mysql_secure_installation

# Create database and user
sudo mysql -u root -p
```

Inside MySQL:

```sql
CREATE DATABASE dateandcrumb;
CREATE USER 'dcuser'@'localhost' IDENTIFIED BY 'YOUR_STRONG_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON dateandcrumb.* TO 'dcuser'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## Step 4: Deploy Your Application

```bash
# Create app directory
sudo mkdir -p /var/www/dateandcrumb
sudo chown $USER:$USER /var/www/dateandcrumb

# Copy files to server (run from your local machine)
scp -r ~/bakehouse/* user@your-server-ip:/var/www/dateandcrumb/

# On the server — install dependencies
cd /var/www/dateandcrumb
npm install --production

# Create .env file
nano .env
```

Add your environment variables to `.env`:

```env
NODE_ENV=production
PORT=3000

# MySQL
DB_HOST=localhost
DB_USER=dcuser
DB_PASSWORD=YOUR_STRONG_PASSWORD_HERE
DB_NAME=dateandcrumb

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...

# PayPal
PAYPAL_CLIENT_ID=...
PAYPAL_SECRET=...

# SMTP (email)
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM="Date & Crumb" <noreply@dateandcrumb.com>

# Session secret
SESSION_SECRET=your-random-session-secret-here

# Google Maps / Mapbox (address autocomplete)
GOOGLE_MAPS_API_KEY=...
MAPBOX_ACCESS_TOKEN=...
```

Run the database seed/schema:

```bash
cd /var/www/dateandcrumb
node db/seed.js
```

---

## Step 5: Install PM2 & Start the App

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the app
cd /var/www/dateandcrumb
NODE_ENV=production pm2 start server.js --name dateandcrumb

# Save process list so it survives reboots
pm2 save

# Generate startup script (follow the printed command)
pm2 startup
```

Verify the app is running:

```bash
curl http://localhost:3000
```

---

## Step 6: Install & Configure Nginx

```bash
# Install Nginx
sudo apt install -y nginx
sudo systemctl enable nginx
```

Create the site config:

```bash
sudo nano /etc/nginx/sites-available/dateandcrumb.com
```

Paste the following config (replace `dateandcrumb.com` with your actual domain):

```nginx
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=api:10m rate=5r/s;

# HTTP → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name dateandcrumb.com www.dateandcrumb.com;
    return 301 https://$host$request_uri;
}

# Main HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name dateandcrumb.com www.dateandcrumb.com;

    # SSL certificates (Certbot will fill these in — see Step 7)
    # ssl_certificate /etc/letsencrypt/live/dateandcrumb.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/dateandcrumb.com/privkey.pem;
    # include /etc/letsencrypt/options-ssl-nginx.conf;
    # ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # --- Hide server info ---
    server_tokens off;

    # --- Gzip compression ---
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_min_length 256;
    gzip_comp_level 5;
    gzip_types
        text/plain
        text/css
        text/javascript
        application/javascript
        application/json
        application/xml
        image/svg+xml
        font/woff2;

    # --- Security headers ---
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' js.stripe.com www.paypal.com; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src 'self' fonts.gstatic.com; img-src 'self' data:; frame-src js.stripe.com www.paypal.com; connect-src 'self' api.stripe.com www.paypal.com;" always;

    # --- Static files root ---
    root /var/www/dateandcrumb/public;

    # --- Serve static assets directly with caching ---
    location ~* \.(jpg|jpeg|png|gif|svg|ico|css|js|woff|woff2|ttf|eot|webmanifest)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files $uri @backend;
    }

    # --- Block dotfiles (.env, .git, etc.) ---
    location ~ /\. {
        deny all;
        return 404;
    }

    # --- Block common attack paths ---
    location ~* (wp-admin|wp-login|xmlrpc\.php|phpmyadmin) {
        deny all;
        return 404;
    }

    # --- API routes with stricter rate limiting ---
    location /api/ {
        limit_req zone=api burst=10 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # --- Everything else → try static first, then Node.js ---
    location / {
        limit_req zone=general burst=20 nodelay;
        try_files $uri $uri/ @backend;
    }

    # --- Node.js backend fallback ---
    location @backend {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and test:

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/dateandcrumb.com /etc/nginx/sites-enabled/

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## Step 7: Set Up HTTPS with Let's Encrypt

```bash
# Install Certbot
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot

# Get SSL certificate (auto-modifies Nginx config)
sudo certbot --nginx -d dateandcrumb.com -d www.dateandcrumb.com

# Verify auto-renewal works
sudo certbot renew --dry-run
```

Certbot will:
- Obtain the SSL certificate
- Automatically update your Nginx config with the SSL paths
- Set up a systemd timer for automatic renewal

---

## Step 8: Update Node.js for Production

Since Nginx now handles HTTPS, update `server.js` to only listen on HTTP:

```javascript
// In server.js — simplify to HTTP only (Nginx handles SSL)
app.set('trust proxy', 1);  // Trust Nginx proxy

app.listen(3000, '127.0.0.1', () => {
    console.log('Date & Crumb server running on port 3000');
});
```

> **Important:** Bind to `127.0.0.1` so the Node.js app is only accessible through Nginx, not directly from the internet.

Restart the app:

```bash
pm2 restart dateandcrumb
```

---

## Quick Reference Commands

| Task | Command |
|------|---------|
| Test Nginx config | `sudo nginx -t` |
| Reload Nginx | `sudo systemctl reload nginx` |
| Restart Nginx | `sudo systemctl restart nginx` |
| View Nginx error log | `sudo tail -f /var/log/nginx/error.log` |
| View Nginx access log | `sudo tail -f /var/log/nginx/access.log` |
| Restart Node app | `pm2 restart dateandcrumb` |
| View Node logs | `pm2 logs dateandcrumb` |
| Monitor all processes | `pm2 monit` |
| Renew SSL certificate | `sudo certbot renew` |
| Check MySQL status | `sudo systemctl status mysql` |
| Connect to MySQL | `mysql -u dcuser -p dateandcrumb` |

---

## Post-Deployment Checklist

- [ ] DNS A record points to server IP
- [ ] `https://dateandcrumb.com` loads correctly
- [ ] HTTP redirects to HTTPS
- [ ] Static assets (images, CSS, JS) load properly
- [ ] User registration & email verification works
- [ ] Stripe payments work in live mode
- [ ] PayPal payments work in live mode
- [ ] Admin dashboard accessible at `/admin/`
- [ ] Orders can be placed and viewed
- [ ] SSL certificate auto-renewal verified
- [ ] PM2 auto-starts on server reboot
- [ ] `.env` file is not accessible from browser
- [ ] Firewall is enabled (`sudo ufw status`)


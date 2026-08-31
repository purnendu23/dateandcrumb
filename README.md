# 🍞 Bakehouse

An online marketplace for fresh baked goods — breads, cakes, pastries, cookies, pies & tarts.

## Tech Stack

- **Frontend:** HTML, CSS, vanilla JavaScript
- **Backend:** Node.js + Express
- **Database:** SQLite (via better-sqlite3)

## Getting Started

```bash
# Install dependencies
npm install

# Seed the database with categories & products
npm run seed

# Start the server
npm start
```

The site will be available at **http://localhost:3000**.

For development with auto-reload:
```bash
npm run dev
```

## Project Structure

```
bakehouse/
├── server.js              # Express server entry point
├── db/
│   ├── schema.sql         # Database table definitions
│   ├── seed.js            # Seed script for initial data
│   └── bakehouse.db       # SQLite database (auto-created)
├── routes/
│   ├── products.js        # GET /api/products, GET /api/products/:id
│   └── orders.js          # POST /api/orders, GET /api/orders/:id
├── public/
│   ├── index.html         # Homepage
│   ├── products.html      # Product listing with filters
│   ├── product.html       # Single product detail
│   ├── cart.html          # Shopping cart
│   ├── checkout.html      # Checkout form
│   ├── css/style.css      # Stylesheet
│   └── js/
│       ├── cart.js         # Cart utility (localStorage)
│       ├── app.js          # Homepage logic
│       ├── products.js     # Product listing logic
│       ├── product-detail.js
│       ├── cart-page.js    # Cart page logic
│       └── checkout.js     # Checkout / order submission
└── README.md
```

## API Endpoints

| Method | Endpoint              | Description                        |
|--------|-----------------------|------------------------------------|
| GET    | /api/categories       | List all categories                |
| GET    | /api/products         | List products (filter: category, featured, search) |
| GET    | /api/products/:id     | Get single product                 |
| POST   | /api/orders           | Place a new order                  |
| GET    | /api/orders/:id       | Get order details                  |

### Admin shipping labels (EasyPost)

Admin users can create shipping labels on demand from the Admin → Orders UI.

- `POST /api/admin/orders/:id/shipping-label` — creates/buys a label via EasyPost and stores a local PDF copy.
- `GET /api/admin/orders/:id/shipping-label` — streams the stored PDF for view/print.

Required environment variables:

- `EASYPOST_API_KEY`
- `EASYPOST_FROM_NAME`
- `EASYPOST_FROM_ADDRESS1`
- `EASYPOST_FROM_CITY`
- `EASYPOST_FROM_STATE`
- `EASYPOST_FROM_ZIP`

Optional:

- `EASYPOST_FROM_COMPANY`, `EASYPOST_FROM_PHONE`, `EASYPOST_FROM_ADDRESS2`, `EASYPOST_FROM_COUNTRY`
- `EASYPOST_PARCEL_WEIGHT_OZ`, `EASYPOST_PARCEL_LENGTH_IN`, `EASYPOST_PARCEL_WIDTH_IN`, `EASYPOST_PARCEL_HEIGHT_IN`

## Database

Database tables include:
- **categories** — product categories
- **products** — product catalog with stock tracking
- **users** — enterprise/employee identities (admin access)
- **customers** — website customer accounts and buyer profiles
- **orders** — customer orders with shipping info (linked to `customers`)
- **order_items** — line items for each order

Auth flows are intentionally separated:
- Customer website auth: `/api/auth/*` (backs onto `customers`)
- Enterprise auth: `/api/admin/auth/*` (backs onto `users`, with login lockout/rate limiting)

Enterprise user rules:
- Only `@dateandcrumb.com` (or `ENTERPRISE_EMAIL_DOMAIN`) emails can register/login through enterprise auth.
- Enterprise login accepts **email or username**.
- Exactly one `users.is_admin = 1` account is allowed (first admin must be created directly in DB).
- Non-admin enterprise users register at `/admin/register.html`, verify email, then wait for admin approval.
- Admin approvals are handled in Admin → Users (pending approval list).

# Deployment and migration guide

## Normal deployment

Use this for a regular code deploy without changing the database schema or data.

```bash
cd /var/www/dateandcrumb
git pull origin main
npm install --production
pm2 restart dateandcrumb
```

This is the standard deploy step. It does not run database migrations.

## Run database migrations explicitly

Run this only when you intentionally want to apply schema or data changes.

```bash
cd /var/www/dateandcrumb
npm run migrate
```

This executes:

```bash
node server.js --migrate
```

and will run the migration logic in `server.js`.

## Recommended production sequence

For a release that includes database changes:

```bash
cd /var/www/dateandcrumb
git pull origin main
npm install --production
npm run migrate
pm2 restart dateandcrumb
```

For a deploy that only includes app code and no DB changes:

```bash
cd /var/www/dateandcrumb
git pull origin main
npm install --production
pm2 restart dateandcrumb
```

## Why this is safer

The app server no longer mutates the database on a normal restart. Migrations are explicit and intentional, which prevents accidental schema/data changes during routine deployment or restarts.

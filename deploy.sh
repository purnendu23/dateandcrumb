#!/bin/bash
cd /var/www/dateandcrumb
git pull origin main
npm install --production
# Run database migrations separately via: npm run migrate
pm2 restart dateandcrumb
echo "✅ Deployed at $(date)"
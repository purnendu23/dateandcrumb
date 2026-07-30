#!/bin/bash
cd /var/www/dateandcrumb
git pull origin main
npm install --production
pm2 restart dateandcrumb
echo "✅ Deployed at $(date)"
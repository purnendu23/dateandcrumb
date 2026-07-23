#!/bin/bash
# Date & Crumb — DigitalOcean Droplet Cloud-Init Script
# It runs once on first boot as root.

set -e

# Update system
apt update && apt upgrade -y

# Install essentials
apt install -y curl git ufw nginx mysql-server

# Install Node.js 20.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PM2 globally
npm install -g pm2

# Firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# Enable services
systemctl enable nginx
systemctl enable mysql

# Create app directory
mkdir -p /var/www/dateandcrumb


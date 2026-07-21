import os, re

base = '/Users/purnendu/bakehouse'
files = [
    'public/index.html',
    'public/cart.html',
    'public/orders.html',
    'public/checkout.html',
    'public/login.html',
    'public/reset-password.html',
    'public/register.html',
    'public/complete-profile.html',
    'public/products.html',
    'public/forgot-password.html',
    'public/product.html',
    'public/profile.html',
    'public/verify.html',
    'public/stripe-test.html',
    'admin/login.html',
    'admin/index.html',
]

for fname in files:
    fpath = os.path.join(base, fname)
    with open(fpath, 'r') as fh:
        content = fh.read()
    content = content.replace('href="/site.webmanifest"', 'href="/images/logo/site.webmanifest"')
    with open(fpath, 'w') as fh:
        fh.write(content)
    print(f'Updated: {fname}')


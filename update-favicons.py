import os, re

favicon_block = (
    '    <link rel="icon" type="image/png" href="/images/logo/favicon-96x96.png" sizes="96x96" />\n'
    '    <link rel="icon" type="image/svg+xml" href="/images/logo/favicon.svg" />\n'
    '    <link rel="shortcut icon" href="/images/logo/favicon.ico" />\n'
    '    <link rel="apple-touch-icon" sizes="180x180" href="/images/logo/apple-touch-icon.png" />\n'
    '    <link rel="manifest" href="/site.webmanifest" />\n'
)

files = [
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

base = '/Users/purnendu/bakehouse'

for fname in files:
    fpath = os.path.join(base, fname)
    with open(fpath, 'r') as fh:
        content = fh.read()
    # Remove old favicon lines
    content = re.sub(r'[ \t]*<link[^>]*favicon-32[^>]*>\n?', '', content)
    content = re.sub(r'[ \t]*<link[^>]*favicon-180[^>]*>\n?', '', content)
    content = re.sub(r'[ \t]*<link[^>]*date-leaves-logo[^>]*>\n?', '', content)
    content = re.sub(r'[ \t]*<link[^>]*favicon-96x96[^>]*>\n?', '', content)
    content = re.sub(r'[ \t]*<link[^>]*favicon\.svg[^>]*>\n?', '', content)
    content = re.sub(r'[ \t]*<link[^>]*favicon\.ico[^>]*>\n?', '', content)
    content = re.sub(r'[ \t]*<link[^>]*apple-touch-icon\.png[^>]*>\n?', '', content)
    content = re.sub(r'[ \t]*<link[^>]*site\.webmanifest[^>]*>\n?', '', content)
    # Insert before first <link rel="stylesheet"
    content = content.replace('<link rel="stylesheet"', favicon_block + '    <link rel="stylesheet"', 1)
    with open(fpath, 'w') as fh:
        fh.write(content)
    print(f'Updated: {fname}')


function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatMoney(amount) {
    const num = Number(amount);
    return `$${(Number.isFinite(num) ? num : 0).toFixed(2)}`;
}

function formatOrderDate(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    }).format(date);
}

function formatCardBrand(brand) {
    if (!brand) return '';
    return String(brand)
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function buildItemsRows(items) {
    return (items || [])
        .map((item) => {
            const name = escapeHtml(item.name || 'Item');
            const quantity = parseInt(item.quantity, 10) || 0;
            const unitPrice = Number(item.unitPrice || 0);
            const lineTotal = Number(item.lineTotal ?? (quantity * unitPrice));

            return `
                <tr>
                  <td style="padding: 0 0 4px 0; font-size:16px; line-height:22px; color:#1f2937;">${name}</td>
                  <td style="padding: 0 0 4px 0; text-align:right; font-size:16px; line-height:22px; color:#1f2937;">${formatMoney(lineTotal)}</td>
                </tr>
                <tr>
                  <td style="padding: 0 0 16px 0; font-size:14px; line-height:20px; color:#6b7280;">${quantity} &times; ${formatMoney(unitPrice)}</td>
                  <td style="padding: 0 0 16px 0;"></td>
                </tr>
            `;
        })
        .join('');
}

function buildShippingAddressLines(address) {
    const cityStateZip = [
        address?.city,
        address?.state ? [address?.state, address?.zip].filter(Boolean).join(' ') : address?.zip,
    ].filter(Boolean).join(', ');

    const lines = [
        address?.name,
        address?.line1,
        address?.line2,
        cityStateZip,
    ].filter(Boolean);

    return lines.map((line) => `<div style="font-size:14px; line-height:20px; color:#1f2937;">${escapeHtml(line)}</div>`).join('');
}

function buildPaymentDisplay(paymentMethod) {
    if (paymentMethod?.display) return escapeHtml(paymentMethod.display);
    if (paymentMethod?.last4) {
        const brand = formatCardBrand(paymentMethod.brand) || 'Card';
        return `${escapeHtml(brand)} &#8226;&#8226;&#8226;&#8226; ${escapeHtml(paymentMethod.last4)}`;
    }
    if (paymentMethod?.type === 'apple_pay') return 'Apple Pay';
    if (paymentMethod?.type === 'google_pay') return 'Google Pay';
    return 'Credit / Debit Card';
}

function buildOrderConfirmationEmail(data) {
    const customerFirstName = String(data.customerName || '').trim().split(/\s+/)[0] || 'there';
    const orderDate = formatOrderDate(data.orderDate);
    const orderNumber = String(data.orderNumber || '').trim();
    const subtotal = Number(data.subtotal || 0);
    const shipping = Number(data.shipping || 0);
    const tax = Number(data.tax || 0);
    const total = Number(data.total || 0);
    const paymentDisplay = buildPaymentDisplay(data.paymentMethod);
    const shippingAddressHtml = buildShippingAddressLines(data.shippingAddress || {});
    const itemsHtml = buildItemsRows(data.items || []);

    const subject = 'Your Date & Crumb order is confirmed';
    const html = `
<!doctype html>
<html lang="en">
  <body style="margin:0; padding:0; background-color:#f5f3ef;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f3ef;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px; background:#ffffff; border-radius:8px;">
            <tr>
              <td style="padding:28px 28px 18px 28px; text-align:center;">
                <img
                  src="https://www.dateandcrumb.com/images/logo/dc_flat_logo.png"
                  alt="Date &amp; Crumb Bakehouse"
                  width="160"
                  style="display:block; margin:0 auto;"
                >
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 22px 28px; text-align:center;">
                <div style="font-size:30px; line-height:36px; color:#111827; font-weight:700;">Thank you, ${escapeHtml(customerFirstName)}!</div>
                <div style="font-size:22px; line-height:30px; color:#111827; font-weight:600; margin-top:6px;">Your order is confirmed.</div>
                <div style="font-size:16px; line-height:24px; color:#374151; margin-top:14px;">We&rsquo;ve received your order and are getting it ready for you.</div>
              </td>
            </tr>
            <tr><td style="padding:0 28px;"><hr style="border:none; border-top:1px solid #e5e7eb; margin:0;"></td></tr>
            <tr>
              <td style="padding:16px 28px 4px 28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="font-size:15px; line-height:22px; font-weight:700; color:#111827;">ORDER ${escapeHtml(orderNumber)}</td>
                    <td style="font-size:15px; line-height:22px; color:#374151; text-align:right;">${escapeHtml(orderDate)}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 6px 28px; font-size:13px; line-height:20px; color:#6b7280; font-weight:700; letter-spacing:0.04em;">YOUR ORDER</td>
            </tr>
            <tr>
              <td style="padding:0 28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${itemsHtml}
                </table>
              </td>
            </tr>
            <tr><td style="padding:0 28px;"><hr style="border:none; border-top:1px solid #e5e7eb; margin:0;"></td></tr>
            <tr>
              <td style="padding:14px 28px 6px 28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr><td style="padding:4px 0; font-size:15px; color:#374151;">Subtotal</td><td style="padding:4px 0; font-size:15px; color:#374151; text-align:right;">${formatMoney(subtotal)}</td></tr>
                  <tr><td style="padding:4px 0; font-size:15px; color:#374151;">Shipping</td><td style="padding:4px 0; font-size:15px; color:#374151; text-align:right;">${formatMoney(shipping)}</td></tr>
                  <tr><td style="padding:4px 0; font-size:15px; color:#374151;">Tax</td><td style="padding:4px 0; font-size:15px; color:#374151; text-align:right;">${formatMoney(tax)}</td></tr>
                  <tr><td style="padding:10px 0 2px 0; font-size:18px; color:#111827; font-weight:700;">TOTAL</td><td style="padding:10px 0 2px 0; font-size:18px; color:#111827; font-weight:700; text-align:right;">${formatMoney(total)}</td></tr>
                </table>
              </td>
            </tr>
            <tr><td style="padding:0 28px;"><hr style="border:none; border-top:1px solid #e5e7eb; margin:0;"></td></tr>
            <tr>
              <td style="padding:16px 28px 2px 28px; font-size:13px; line-height:20px; color:#6b7280; font-weight:700; letter-spacing:0.04em;">PAYMENT</td>
            </tr>
            <tr>
              <td style="padding:0 28px 10px 28px; font-size:15px; line-height:22px; color:#1f2937;">${paymentDisplay}</td>
            </tr>
            <tr>
              <td style="padding:8px 28px 2px 28px; font-size:13px; line-height:20px; color:#6b7280; font-weight:700; letter-spacing:0.04em;">SHIPPING TO</td>
            </tr>
            <tr>
              <td style="padding:0 28px 16px 28px;">${shippingAddressHtml}</td>
            </tr>
            <tr><td style="padding:0 28px;"><hr style="border:none; border-top:1px solid #e5e7eb; margin:0;"></td></tr>
            <tr>
              <td style="padding:18px 28px 0 28px; text-align:center; font-size:15px; line-height:22px; color:#374151;">
                We&rsquo;ll send you tracking information as soon as your order is on its way.
              </td>
            </tr>
            <tr>
              <td style="padding:12px 28px 0 28px; text-align:center; font-size:15px; line-height:22px; color:#374151;">
                Thank you for supporting our small bakehouse. &#10084;&#65039;
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 28px 28px; text-align:center;">
                <div style="font-size:16px; line-height:22px; color:#111827; font-weight:700;">Date &amp; Crumb</div>
                <div style="font-size:13px; line-height:19px; color:#6b7280;">simple ingredients . honest goodness.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();

    const text = [
        `Thank you, ${customerFirstName}! Your order is confirmed.`,
        '',
        `Order ${orderNumber} - ${orderDate}`,
        '',
        'Your order:',
        ...(data.items || []).map((item) => {
            const quantity = parseInt(item.quantity, 10) || 0;
            const unitPrice = Number(item.unitPrice || 0);
            const lineTotal = Number(item.lineTotal ?? (quantity * unitPrice));
            return `${item.name} | ${quantity} x ${formatMoney(unitPrice)} | ${formatMoney(lineTotal)}`;
        }),
        '',
        `Subtotal: ${formatMoney(subtotal)}`,
        `Shipping: ${formatMoney(shipping)}`,
        `Tax: ${formatMoney(tax)}`,
        `Total: ${formatMoney(total)}`,
        '',
        `Payment: ${String(paymentDisplay).replace(/&#8226;/g, '•').replace(/&amp;/g, '&')}`,
        '',
        'Shipping to:',
        ...(data.shippingAddress ? [
            data.shippingAddress.name,
            data.shippingAddress.line1,
            data.shippingAddress.line2,
            [
                data.shippingAddress.city,
                data.shippingAddress.state
                    ? [data.shippingAddress.state, data.shippingAddress.zip].filter(Boolean).join(' ')
                    : data.shippingAddress.zip,
            ].filter(Boolean).join(', '),
        ].filter(Boolean) : []),
    ].join('\n');

    return { subject, html, text };
}

module.exports = { buildOrderConfirmationEmail };

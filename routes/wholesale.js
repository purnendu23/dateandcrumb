const express = require('express');
const { sendWholesaleInquiry } = require('../config/mailer');

const router = express.Router();

function normalizeText(value) {
    return String(value || '').trim();
}

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function isLikelyEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// POST /api/wholesale/apply
router.post('/apply', async (req, res) => {
    const businessName = normalizeText(req.body.business_name);
    const firstName = normalizeText(req.body.first_name);
    const lastName = normalizeText(req.body.last_name);
    const businessEmail = normalizeEmail(req.body.business_email);
    const websiteInstagram = normalizeText(req.body.website_instagram);
    const businessType = normalizeText(req.body.business_type);
    const shippingAddress = normalizeText(req.body.shipping_address);
    const monthlyOrderVolume = normalizeText(req.body.monthly_order_volume);
    const message = normalizeText(req.body.message);

    if (
        !businessName ||
        !firstName ||
        !lastName ||
        !businessEmail ||
        !businessType ||
        !shippingAddress ||
        !monthlyOrderVolume
    ) {
        return res.status(400).json({ error: 'Please fill in all required fields.' });
    }

    if (!isLikelyEmail(businessEmail)) {
        return res.status(400).json({ error: 'Please enter a valid business email.' });
    }

    try {
        await sendWholesaleInquiry({
            businessName,
            firstName,
            lastName,
            businessEmail,
            websiteInstagram,
            businessType,
            shippingAddress,
            monthlyOrderVolume,
            message,
        });
        return res.json({ message: 'Wholesale inquiry submitted.' });
    } catch (err) {
        console.error('Failed to send wholesale inquiry:', err.message);
        return res.status(500).json({ error: 'Unable to submit inquiry right now.' });
    }
});

module.exports = router;

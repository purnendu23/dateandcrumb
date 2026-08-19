const nodemailer = require('nodemailer');
const { buildOrderConfirmationEmail } = require('../email/orderConfirmation');

// Configure transporter
// For production, use a real SMTP service (Gmail, SendGrid, etc.)
// For development, uses Ethereal test accounts by default
let transporter;

async function getTransporter() {
    if (transporter) return transporter;

    if (process.env.SMTP_HOST) {
        // Production SMTP
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
    } else {
        // Development — use Ethereal fake SMTP
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass,
            },
        });
        console.log('Using Ethereal test email account:', testAccount.user);
    }

    return transporter;
}

async function sendVerificationEmail(toEmail, token, baseUrl) {
    const transport = await getTransporter();
    const verifyUrl = `${baseUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;

    const info = await transport.sendMail({
        from: process.env.SMTP_FROM || '"Date&Crumb" <noreply@dateandcrumb.com>',
        to: toEmail,
        subject: 'Verify your Date&Crumb account',
        html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 2rem;">
                <h2 style="color: #8b4513;">Welcome to Date&Crumb!</h2>
                <p>Thanks for signing up. Please verify your email address by clicking the button below:</p>
                <a href="${verifyUrl}" style="display: inline-block; background: #b5651d; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 1rem 0;">Verify Email</a>
                <p style="color: #666; font-size: 0.9rem;">Or copy this link into your browser:<br>${verifyUrl}</p>
                <p style="color: #999; font-size: 0.8rem;">If you didn't create an account, you can ignore this email.</p>
            </div>
        `,
    });

    // In dev mode, log the preview URL
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
        console.log('Email preview URL:', previewUrl);
    }

    return info;
}

async function sendOrderConfirmation(orderData) {
    const transport = await getTransporter();
    const email = buildOrderConfirmationEmail(orderData);

    const info = await transport.sendMail({
        from: process.env.SMTP_FROM || '"Date&Crumb" <noreply@dateandcrumb.com>',
        to: orderData.customerEmail,
        subject: email.subject,
        text: email.text,
        html: email.html,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
        console.log('Order confirmation preview URL:', previewUrl);
    }

    return info;
}

module.exports = { sendVerificationEmail, sendOrderConfirmation };

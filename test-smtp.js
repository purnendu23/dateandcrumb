// Quick test: node test-smtp.js
require('dotenv').config({ path: '.env.development' });
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

transporter.verify()
    .then(() => {
        console.log('SMTP connection successful!');
        return transporter.sendMail({
            from: process.env.SMTP_FROM,
            to: process.env.SMTP_USER,       // send to yourself
            subject: 'Bakehouse SMTP Test',
            text: 'If you see this, SMTP is working!',
        });
    })
    .then(info => {
        console.log('Test email sent:', info.messageId);
        process.exit(0);
    })
    .catch(err => {
        console.error('SMTP test failed:', err.message);
        process.exit(1);
    });

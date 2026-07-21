const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const doc = new PDFDocument({ margin: 50 });
const output = path.join(__dirname, 'email-verification-flow.pdf');
doc.pipe(fs.createWriteStream(output));

// Title
doc.fontSize(22).font('Helvetica-Bold').fillColor('#8b4513')
   .text('Bakehouse — Email Verification Flow', { align: 'center' });
doc.moveDown(0.5);
doc.fontSize(10).font('Helvetica').fillColor('#666')
   .text('Generated: ' + new Date().toLocaleDateString(), { align: 'center' });
doc.moveDown(1.5);

// Divider
doc.strokeColor('#e0d5c8').lineWidth(1)
   .moveTo(50, doc.y).lineTo(562, doc.y).stroke();
doc.moveDown(1);

// Section: How the flow works
doc.fontSize(16).font('Helvetica-Bold').fillColor('#3d2b1f')
   .text('How the flow works:');
doc.moveDown(0.75);

// Step 1
doc.fontSize(13).font('Helvetica-Bold').fillColor('#b5651d')
   .text('Step 1: Register');
doc.fontSize(11).font('Helvetica').fillColor('#3d2b1f')
   .text('User fills in the registration form (First Name, Last Name, Email, Password). Instead of being logged in immediately, they see a "Check Your Email" message on screen.');
doc.moveDown(0.75);

// Step 2
doc.fontSize(13).font('Helvetica-Bold').fillColor('#b5651d')
   .text('Step 2: Verification Email');
doc.fontSize(11).font('Helvetica').fillColor('#3d2b1f')
   .text('A verification link is sent to the user\'s email address. The email contains a unique, cryptographically random token linked to their account.');
doc.moveDown(0.75);

// Step 3
doc.fontSize(13).font('Helvetica-Bold').fillColor('#b5651d')
   .text('Step 3: Login Blocked Until Verified');
doc.fontSize(11).font('Helvetica').fillColor('#3d2b1f')
   .text('If the user tries to log in before clicking the verification link, they receive an error message: "Please verify your email before logging in."');
doc.moveDown(0.75);

// Step 4
doc.fontSize(13).font('Helvetica-Bold').fillColor('#b5651d')
   .text('Step 4: Click Verification Link');
doc.fontSize(11).font('Helvetica').fillColor('#3d2b1f')
   .text('When the user clicks the link in the email, it hits /api/auth/verify?token=... which marks the account as verified in the database and clears the token.');
doc.moveDown(0.75);

// Step 5
doc.fontSize(13).font('Helvetica-Bold').fillColor('#b5651d')
   .text('Step 5: Verification Success');
doc.fontSize(11).font('Helvetica').fillColor('#3d2b1f')
   .text('The user is redirected to verify.html with a success message and a link to log in. They can now log in normally.');
doc.moveDown(0.75);

// Note about social login
doc.fontSize(13).font('Helvetica-Bold').fillColor('#b5651d')
   .text('Note: Social Logins');
doc.fontSize(11).font('Helvetica').fillColor('#3d2b1f')
   .text('Social logins (Google/Apple) bypass email verification since the email is already verified by the provider.');
doc.moveDown(1.5);

// Divider
doc.strokeColor('#e0d5c8').lineWidth(1)
   .moveTo(50, doc.y).lineTo(562, doc.y).stroke();
doc.moveDown(1);

// Section: Development Setup
doc.fontSize(16).font('Helvetica-Bold').fillColor('#3d2b1f')
   .text('Development Setup:');
doc.moveDown(0.5);

doc.fontSize(11).font('Helvetica').fillColor('#3d2b1f')
   .text('Since no SMTP server is configured in development, emails are sent through Ethereal (a fake SMTP service). The preview URL is logged in the server console — open it to see the verification email.');
doc.moveDown(1.5);

// Divider
doc.strokeColor('#e0d5c8').lineWidth(1)
   .moveTo(50, doc.y).lineTo(562, doc.y).stroke();
doc.moveDown(1);

// Section: Production Setup
doc.fontSize(16).font('Helvetica-Bold').fillColor('#3d2b1f')
   .text('Production Setup:');
doc.moveDown(0.5);

doc.fontSize(11).font('Helvetica').fillColor('#3d2b1f')
   .text('Set these environment variables to use a real SMTP service:');
doc.moveDown(0.4);

const envVars = [
    'SMTP_HOST=smtp.gmail.com',
    'SMTP_PORT=587',
    'SMTP_USER=your@gmail.com',
    'SMTP_PASS=your-app-password',
    'SMTP_FROM="Bakehouse" <noreply@bakehouse.com>',
];

for (const v of envVars) {
    doc.fontSize(10).font('Courier').fillColor('#555').text('  ' + v);
}

doc.end();
console.log('PDF created:', output);

// Quick test script to verify SendGrid configuration
// Run: node test-sendgrid.js

require('dotenv').config()
const sgMail = require('@sendgrid/mail')

console.log('\n=== SendGrid Configuration Test ===\n')

// Check API Key
if (!process.env.SENDGRID_API_KEY) {
  console.error('❌ SENDGRID_API_KEY not set in .env')
  console.error('   Please add: SENDGRID_API_KEY=SG.your-api-key-here')
  process.exit(1)
} else {
  console.log('✅ SENDGRID_API_KEY is set')
  console.log('   Key starts with:', process.env.SENDGRID_API_KEY.substring(0, 5) + '...')
}

// Check Sender Email
if (!process.env.SENDGRID_EMAIL_SENDER) {
  console.error('❌ SENDGRID_EMAIL_SENDER not set in .env')
  console.error('   Please add: SENDGRID_EMAIL_SENDER=your-verified-email@domain.com')
  process.exit(1)
} else {
  console.log('✅ SENDGRID_EMAIL_SENDER is set')
  console.log('   Sender:', process.env.SENDGRID_EMAIL_SENDER)
}

// Set API Key
sgMail.setApiKey(process.env.SENDGRID_API_KEY)

// Get test email from command line or use default
const testEmail = process.argv[2] || process.env.TEST_EMAIL || 'your-email@example.com'

if (testEmail === 'your-email@example.com') {
  console.log('\n⚠️  Using default test email. To test with your email, run:')
  console.log('   node test-sendgrid.js your-email@example.com\n')
}

console.log('\n=== Sending Test Email ===\n')
console.log('To:', testEmail)
console.log('From:', process.env.SENDGRID_EMAIL_SENDER)

const msg = {
  to: testEmail,
  from: process.env.SENDGRID_EMAIL_SENDER,
  subject: 'Test Email from Localhost - SendGrid Configuration',
  text: 'This is a test email to verify SendGrid is working correctly.',
  html: `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2 style="color: #333;">✅ SendGrid Test Email</h2>
      <p>If you received this email, your SendGrid configuration is working correctly!</p>
      <p><strong>Configuration Details:</strong></p>
      <ul>
        <li>API Key: Configured ✅</li>
        <li>Sender Email: ${process.env.SENDGRID_EMAIL_SENDER}</li>
        <li>Test Time: ${new Date().toLocaleString()}</li>
      </ul>
      <p style="margin-top: 20px; color: #666; font-size: 12px;">
        This is an automated test email from your localhost development environment.
      </p>
    </div>
  `,
}

sgMail
  .send(msg)
  .then(() => {
    console.log('\n✅ SUCCESS: Test email sent successfully!')
    console.log('   Check your inbox (and spam folder) for:', testEmail)
    console.log('\n=== Test Complete ===\n')
  })
  .catch((error) => {
    console.error('\n❌ ERROR: Failed to send test email\n')
    console.error('Error Message:', error.message)
    
    if (error.response) {
      console.error('\nSendGrid Response:')
      console.error('Status Code:', error.response.statusCode)
      console.error('Response Body:', JSON.stringify(error.response.body, null, 2))
      
      // Common error messages
      if (error.response.body?.errors) {
        error.response.body.errors.forEach((err: any) => {
          console.error('\n  -', err.message)
          if (err.field) {
            console.error('    Field:', err.field)
          }
        })
      }
    }
    
    console.error('\n=== Troubleshooting ===')
    console.error('1. Verify SENDGRID_API_KEY is correct in .env')
    console.error('2. Verify SENDGRID_EMAIL_SENDER is verified in SendGrid dashboard')
    console.error('3. Check SendGrid Activity Feed for more details')
    console.error('4. Make sure sender email is verified at:')
    console.error('   https://app.sendgrid.com/settings/sender_auth\n')
    
    process.exit(1)
  })

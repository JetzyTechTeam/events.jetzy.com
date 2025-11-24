#!/usr/bin/env node
import sendgrid from "@sendgrid/mail"
import * as dotenv from "dotenv"

// Load environment variables
dotenv.config()

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const SENDGRID_EMAIL_SENDER = process.env.SENDGRID_EMAIL_SENDER || "marketing@jetzyapp.com"

// Get email from command line or use default
const testEmail = process.argv[2] || "raoarsalanlatif@gmail.com"

console.log("=".repeat(60))
console.log("SendGrid Email Test")
console.log("=".repeat(60))
console.log(`API Key: ${SENDGRID_API_KEY ? '✓ Set (length: ' + SENDGRID_API_KEY.length + ')' : '✗ NOT SET'}`)
console.log(`Sender: ${SENDGRID_EMAIL_SENDER}`)
console.log(`Recipient: ${testEmail}`)
console.log("=".repeat(60))
console.log("")

async function sendTestEmail() {
  try {
    if (!SENDGRID_API_KEY) {
      throw new Error("SENDGRID_API_KEY not set in environment")
    }

    sendgrid.setApiKey(SENDGRID_API_KEY)

    console.log("Sending test email...")
    
    const msg = {
      to: testEmail,
      from: SENDGRID_EMAIL_SENDER,
      subject: "Test Email from Jetzy Events Script",
      text: "This is a test email to verify SendGrid configuration.",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Test Email</h2>
          <p>This is a test email from the Jetzy Events email script.</p>
          <p>If you received this, your SendGrid configuration is working correctly!</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            Sent at: ${new Date().toISOString()}<br/>
            From: ${SENDGRID_EMAIL_SENDER}<br/>
            To: ${testEmail}
          </p>
        </div>
      `,
    }

    const response = await sendgrid.send(msg)
    
    console.log("✓ Email sent successfully!")
    console.log(`  Status Code: ${response[0].statusCode}`)
    console.log("")
    console.log("Please check your inbox (and spam folder) for the test email.")
    console.log("")
    
    // Log response headers for debugging
    if (response[0].headers) {
      console.log("Response headers:")
      const headers = response[0].headers as any
      console.log(`  X-Message-Id: ${headers['x-message-id'] || 'N/A'}`)
    }
    
  } catch (error: any) {
    console.error("✗ Failed to send email!")
    console.error("")
    
    if (error.response) {
      console.error("SendGrid Error Response:")
      console.error(`  Status Code: ${error.response.statusCode}`)
      console.error(`  Error Body:`, JSON.stringify(error.response.body, null, 2))
    } else {
      console.error("Error:", error.message)
    }
    
    process.exit(1)
  }
}

sendTestEmail()


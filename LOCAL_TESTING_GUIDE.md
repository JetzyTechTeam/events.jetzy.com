# Local Testing Guide - Verify Purchase & Email Testing

## ⚠️ IMPORTANT: Local Development URL Configuration

**If your purchase redirects to production URL (`events.jetzy.com`) instead of localhost:**

This happens when `NEXT_PUBLIC_URL` is set to the production URL. The checkout API now automatically detects localhost, but you should still check your environment variables.

### Fix for Local Development:

1. **Check your `.env` or `.env.local` file:**
   ```env
   # For local development, use:
   NEXT_PUBLIC_URL=http://localhost:3000
   
   # NOT:
   # NEXT_PUBLIC_URL=https://events.jetzy.com
   ```

2. **The checkout API will now automatically detect localhost** when:
   - `NODE_ENV=development`
   - Or when `NEXT_PUBLIC_URL` contains `localhost`
   - Or when the request comes from `localhost` or `127.0.0.1`

3. **After updating `.env`, restart your dev server:**
   ```bash
   # Stop the server (Ctrl+C) and restart
   npm run dev
   ```

4. **Verify the fix:**
   - Complete a test purchase
   - Check the server logs - you should see: `[checkout/index] Detected local development, using: http://localhost:3000`
   - The success URL should be: `http://localhost:3000/success?session_id=...`
   - NOT: `https://events.jetzy.com/success?session_id=...`

## 1. Verify Purchase in Database

### Using MongoDB Compass or MongoDB Shell:

```javascript
// Connect to your MongoDB database
// Default connection: mongodb://localhost:27017/jetzy-events

// Find the most recent booking
db.bookings.find().sort({ createdAt: -1 }).limit(1).pretty()

// Find booking by customer email
db.bookings.find({ customerEmail: "your-email@example.com" }).pretty()

// Find booking with QR code data
db.bookings.find({ 
  qrCodeToken: { $exists: true } 
}).sort({ createdAt: -1 }).limit(5).pretty()

// Check specific booking details
db.bookings.findOne({ 
  bookingRef: "JZ-xxxxx" // Replace with your booking reference
})

// Verify QR code fields exist
db.bookings.find({ 
  customerEmail: "your-email@example.com" 
}, { 
  bookingRef: 1, 
  customerName: 1, 
  customerEmail: 1, 
  qrCodeToken: 1, 
  qrCodeImageUrl: 1,
  status: 1,
  createdAt: 1
}).pretty()
```

### Using Node.js Script (Quick Check):

Create a file `check-booking.js` in your project root:

```javascript
const mongoose = require('mongoose');
require('dotenv').config();

async function checkBooking() {
  try {
    await mongoose.connect(process.env.NEXT_EVENTS_DB_URL);
    console.log('Connected to MongoDB');
    
    const Bookings = mongoose.model('Bookings', new mongoose.Schema({}, { strict: false }));
    
    // Get most recent booking
    const booking = await Bookings.findOne().sort({ createdAt: -1 });
    
    if (booking) {
      console.log('\n=== Most Recent Booking ===');
      console.log('Booking Ref:', booking.bookingRef);
      console.log('Customer:', booking.customerName);
      console.log('Email:', booking.customerEmail);
      console.log('Status:', booking.status);
      console.log('QR Token:', booking.qrCodeToken ? '✅ Exists' : '❌ Missing');
      console.log('QR Image URL:', booking.qrCodeImageUrl ? '✅ Exists' : '❌ Missing');
      console.log('Created At:', booking.createdAt);
    } else {
      console.log('No bookings found');
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkBooking();
```

Run it:
```bash
node check-booking.js
```

## 2. Check Server Logs for Email Sending

When you complete a purchase, check your terminal/console where the dev server is running. You should see logs like:

```
[checkout/confirm] Payment successful, creating booking...
[checkout/confirm] Booking created: JZ-xxxxx
[checkout/confirm] Generating QR code for booking...
[checkout/confirm] QR code generated and saved to booking
Sending ticket confirmation email to: your-email@example.com
[sendTicketConfirmation] Email sent successfully to: your-email@example.com
```

If you see errors, they will be logged there.

## 3. Email Not Sending - Common Issues

### Issue 1: SendGrid API Key Not Set
Check your `.env` file:
```env
SENDGRID_API_KEY=your_sendgrid_api_key_here
SENDGRID_EMAIL_SENDER=noreply@yourdomain.com
```

### Issue 2: SendGrid Sender Email Not Verified
- Go to SendGrid Dashboard → Settings → Sender Authentication
- Verify your sender email address
- For testing, you can use a verified email from SendGrid

### Issue 3: Local URL in Email Links
The email uses `NEXT_PUBLIC_URL` for links. Make sure it's set correctly:
```env
NEXT_PUBLIC_URL=http://localhost:3000
```

### Issue 4: Email Going to Spam
- Check your spam/junk folder
- SendGrid might be blocking emails in development
- Check SendGrid Activity Feed: https://app.sendgrid.com/activity

## 4. Test Email Sending Locally

### Option A: Use a Test Email Service (Recommended)

1. **Use Mailtrap** (Free for testing):
   - Sign up at https://mailtrap.io
   - Get SMTP credentials
   - Update your `.env`:
   ```env
   SENDGRID_API_KEY=  # Leave empty or use Mailtrap SMTP
   ```
   - Or use a different email service temporarily

2. **Use Gmail SMTP** (For testing only):
   ```env
   # In send-grid.ts, temporarily use nodemailer with Gmail
   ```

### Option B: Add Console Logging for Email Content

Modify `src/lib/send-grid.ts` temporarily to log email content:

```typescript
export const sendTicketConfirmation = async ({ ... }: TicketEmailData) => {
  // ... existing code ...
  
  // Instead of sending, log the email content
  if (process.env.NODE_ENV === 'development') {
    console.log('\n=== EMAIL CONTENT (NOT SENT IN DEV) ===');
    console.log('To:', email);
    console.log('Subject:', subject);
    console.log('HTML Length:', html.length);
    console.log('QR Code Included:', !!qrCodeImageUrl);
    console.log('\n=== EMAIL HTML (First 500 chars) ===');
    console.log(html.substring(0, 500));
    console.log('=====================================\n');
    
    // Uncomment to actually send in dev:
    // await sgMail.send({ ... });
    return;
  }
  
  // Production: send normally
  await sgMail.send({ ... });
}
```

### Option C: Create a Test API Endpoint

Create `src/pages/api/test-email.ts`:

```typescript
import { NextApiRequest, NextApiResponse } from "next"
import { sendTicketConfirmation } from "@/lib/send-grid"
import { Events } from "@/models/events"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" })
  }

  try {
    const { email, eventId } = req.body

    if (!email || !eventId) {
      return res.status(400).json({ message: "Email and eventId are required" })
    }

    const event = await Events.findById(eventId)
    if (!event) {
      return res.status(404).json({ message: "Event not found" })
    }

    await sendTicketConfirmation({
      event,
      firstName: "Test",
      lastName: "User",
      email,
      phone: "1234567890",
      tickets: [
        {
          name: "Test Ticket",
          price: 0,
          quantity: 1,
          desc: "Test ticket description"
        }
      ],
      orderNumber: "TEST-12345",
      isNewUser: false,
      qrCodeImageUrl: undefined // Add a test QR code if needed
    })

    return res.status(200).json({ 
      success: true, 
      message: "Test email sent successfully" 
    })
  } catch (error: any) {
    console.error("Test email error:", error)
    return res.status(500).json({ 
      success: false, 
      message: error.message 
    })
  }
}
```

Then call it:
```bash
curl -X POST http://localhost:3000/api/test-email \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email@example.com","eventId":"your-event-id"}'
```

## 5. Verify QR Code Generation

Check if QR codes are being generated:

```javascript
// In MongoDB
db.bookings.find({ 
  qrCodeToken: { $exists: true, $ne: null } 
}).count()

// Check a specific booking's QR code
db.bookings.findOne(
  { customerEmail: "your-email@example.com" },
  { qrCodeToken: 1, qrCodeImageUrl: 1, bookingRef: 1 }
)
```

The `qrCodeImageUrl` should be a long base64 data URL starting with `data:image/png;base64,...`

## 6. Quick Verification Checklist

- [ ] Booking exists in `bookings` collection
- [ ] Booking has `status: "CONFIRMED"`
- [ ] Booking has `qrCodeToken` field
- [ ] Booking has `qrCodeImageUrl` field (base64 data URL)
- [ ] Server logs show "Email sent successfully"
- [ ] Check SendGrid Activity Feed for email status
- [ ] Check spam/junk folder
- [ ] Verify `SENDGRID_API_KEY` is set in `.env`
- [ ] Verify `SENDGRID_EMAIL_SENDER` is verified in SendGrid

## 7. Debug Email Issues

Add this to `src/lib/send-grid.ts` at the start of `sendTicketConfirmation`:

```typescript
export const sendTicketConfirmation = async ({ ... }: TicketEmailData) => {
  console.log('[EMAIL DEBUG] =================================');
  console.log('[EMAIL DEBUG] API Key exists:', !!process.env.SENDGRID_API_KEY);
  console.log('[EMAIL DEBUG] Sender email:', process.env.SENDGRID_EMAIL_SENDER);
  console.log('[EMAIL DEBUG] Recipient:', email);
  console.log('[EMAIL DEBUG] Event:', event.name);
  console.log('[EMAIL DEBUG] QR Code URL length:', qrCodeImageUrl?.length || 0);
  console.log('[EMAIL DEBUG] =================================');
  
  // ... rest of the function
}
```

This will help you see what's being passed to the email function.

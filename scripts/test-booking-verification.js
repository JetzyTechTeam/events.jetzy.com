/**
 * Test script to verify booking and email functionality locally
 * Run with: node scripts/test-booking-verification.js
 */

require('dotenv').config({ path: '.env.local' })
const mongoose = require('mongoose')

async function verifyBooking() {
  try {
    // Connect to MongoDB
    const dbUrl = process.env.NEXT_EVENTS_DB_URL
    if (!dbUrl) {
      console.error('❌ NEXT_EVENTS_DB_URL not found in environment variables')
      process.exit(1)
    }

    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(dbUrl)
    console.log('✅ Connected to MongoDB\n')

    // Get Bookings model
    const bookingSchema = new mongoose.Schema({}, { strict: false, timestamps: true })
    const Bookings = mongoose.models.Bookings || mongoose.model('Bookings', bookingSchema)

    // Find most recent booking
    console.log('📋 Checking most recent booking...')
    const booking = await Bookings.findOne().sort({ createdAt: -1 })

    if (!booking) {
      console.log('❌ No bookings found in database')
      await mongoose.disconnect()
      return
    }

    console.log('\n' + '='.repeat(60))
    console.log('📦 BOOKING DETAILS')
    console.log('='.repeat(60))
    console.log('Booking Reference:', booking.bookingRef)
    console.log('Customer Name:', booking.customerName)
    console.log('Customer Email:', booking.customerEmail)
    console.log('Customer Phone:', booking.customerPhone)
    console.log('Status:', booking.status)
    console.log('Total Amount: $' + (booking.total || 0).toFixed(2))
    console.log('Created At:', booking.createdAt)
    
    // Check QR Code
    console.log('\n' + '-'.repeat(60))
    console.log('🔐 QR CODE STATUS')
    console.log('-'.repeat(60))
    if (booking.qrCodeToken) {
      console.log('✅ QR Code Token: EXISTS')
      console.log('   Token:', booking.qrCodeToken.substring(0, 50) + '...')
    } else {
      console.log('❌ QR Code Token: MISSING')
    }

    if (booking.qrCodeImageUrl) {
      console.log('✅ QR Code Image URL: EXISTS')
      console.log('   Type:', booking.qrCodeImageUrl.substring(0, 30) + '...')
      console.log('   Length:', booking.qrCodeImageUrl.length, 'characters')
    } else {
      console.log('❌ QR Code Image URL: MISSING')
    }

    // Check Email Configuration
    console.log('\n' + '-'.repeat(60))
    console.log('📧 EMAIL CONFIGURATION')
    console.log('-'.repeat(60))
    const hasApiKey = !!process.env.SENDGRID_API_KEY
    const hasSender = !!process.env.SENDGRID_EMAIL_SENDER
    
    console.log('SendGrid API Key:', hasApiKey ? '✅ SET' : '❌ MISSING')
    console.log('SendGrid Sender Email:', hasSender ? `✅ ${process.env.SENDGRID_EMAIL_SENDER}` : '❌ MISSING')
    
    if (!hasApiKey || !hasSender) {
      console.log('\n⚠️  WARNING: Email configuration is incomplete!')
      console.log('   Emails will not be sent without proper SendGrid setup.')
    }

    // Check Event
    if (booking.eventId) {
      const eventSchema = new mongoose.Schema({}, { strict: false })
      const Events = mongoose.models.Events || mongoose.model('Events', eventSchema)
      const event = await Events.findById(booking.eventId)
      
      if (event) {
        console.log('\n' + '-'.repeat(60))
        console.log('🎉 EVENT DETAILS')
        console.log('-'.repeat(60))
        console.log('Event Name:', event.name)
        console.log('Event Location:', event.location)
        console.log('Event Starts:', event.startsOn)
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 VERIFICATION SUMMARY')
    console.log('='.repeat(60))
    const checks = {
      'Booking exists': !!booking,
      'Booking confirmed': booking?.status === 'CONFIRMED',
      'QR Token generated': !!booking?.qrCodeToken,
      'QR Image generated': !!booking?.qrCodeImageUrl,
      'Email API Key set': hasApiKey,
      'Email Sender set': hasSender,
    }

    Object.entries(checks).forEach(([check, passed]) => {
      console.log(`${passed ? '✅' : '❌'} ${check}`)
    })

    const allPassed = Object.values(checks).every(v => v)
    console.log('\n' + (allPassed ? '✅ All checks passed!' : '⚠️  Some checks failed'))

    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

verifyBooking()

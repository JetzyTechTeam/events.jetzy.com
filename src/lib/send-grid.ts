import { IEvent } from "@/models/events/types"
import sgMail from "@sendgrid/mail"
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

sgMail.setApiKey(process.env.SENDGRID_API_KEY as string)

// Helper function to wrap HTML content in proper tags
const wrapHtml = (html: string) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body>${html}</body></html>`;

// Helper function to strip HTML tags for plain text version
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gm, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper function to strip HTML tags and decode HTML entities in event names
function decodeHTMLEntities(text: string): string {
  if (!text) return text
  // First strip HTML tags
  let cleaned = text.replace(/<[^>]*>/g, "")
  // Then decode HTML entities
  return cleaned
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .trim()
}

type TicketEmailData = {
  event: IEvent
  firstName: string
  lastName: string
  email: string
  phone: string
  tickets: Array<{
    name: string
    quantity: number
    price: number
    desc: string
  }>
  orderNumber: string
  isNewUser?: boolean
  qrCodeImageUrl?: string
  guestEmails?: string[] // Array of guest email addresses
  referralCode?: string
  discountAmount?: number
  discountPercentage?: number
}

type BookingCancellationData = {
  event: IEvent
  firstName: string
  lastName: string
  email: string
  phone: string
  tickets: Array<{
    name: string
    quantity: number
    price: number
    desc: string
  }>
  orderNumber: string
  totalAmount: number
}

type WaitingListEmailData = {
  firstName: string
  lastName: string
  email: string
  eventName: string
}

type WaitingListApprovalData = {
  firstName: string
  lastName: string
  email: string
  eventName: string
  tickets: Array<{
    name: string
    quantity: number
    price: number
  }>
  paymentUrl?: string
}

type EventInvitationData = {
  email: string
  eventName: string
  eventSlug: string
  eventDate: string
  eventLocation: string
  hostName: string
}

type BlastEmailData = {
  email: string
  eventName: string
  eventSlug: string
  eventDate: string
  eventLocation: string
  hostName: string
  emailType: "invitation" | "reminder" | "update" | "announcement" | "custom"
  subject: string
  customMessage: string
}

type DiscussionNotificationData = {
  email: string
  firstName: string
  lastName: string
  authorName: string
  eventName: string
  eventSlug: string
  magicToken: string
  postId: string
  hasImages?: boolean
}

type TagNotificationData = {
  email: string
  firstName: string
  lastName: string
  authorName: string
  eventName: string
  eventSlug: string
  magicToken: string
  postId: string
  hasImages?: boolean
}

type CommentNotificationData = {
  email: string
  firstName: string
  lastName: string
  commenterName: string
  eventName: string
  eventSlug: string
  magicToken: string
  postId: string
  hasImages?: boolean
}

type ThankYouNotificationData = {
  email: string
  firstName: string
  lastName: string
  eventName: string
  eventSlug: string
  magicToken: string
  formLink: string
}

type ReactionNotificationData = {
  email: string
  firstName: string
  lastName: string
  reactorName: string
  eventName: string
  eventSlug: string
  magicToken: string
  postId: string
}

type ViewMilestoneNotificationData = {
  email: string
  firstName: string
  lastName: string
  eventName: string
  eventSlug: string
  magicToken: string
  postId: string
  viewCount: number
}

type WelcomeEmailData = {
  email: string
  firstName?: string
  lastName?: string
  password?: string
}

export const sendWaitingListApproval = async ({ firstName, lastName, email, eventName, tickets, paymentUrl }: WaitingListApprovalData) => {
  try {
    const totalTickets = tickets.reduce((sum, ticket) => sum + ticket.quantity, 0)
    const totalAmount = tickets.reduce((sum, ticket) => sum + (ticket.price * ticket.quantity), 0)

    await sgMail.send({
      to: [email, "tech@jetzyapp.com"],
      from: process.env.SENDGRID_EMAIL_SENDER as string,
      subject: `Jetzy [Good News!] Your wait is over - ${decodeHTMLEntities(eventName)}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">Great News! Your Wait is Over! 🎉</h1>
          
          <div style="background-color: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <h2 style="color: #155724; margin-bottom: 15px;">Tickets Available!</h2>
            <p style="color: #155724; margin: 0;">
              Congratulations! Spots have become available for "${eventName}" and you&apos;ve been selected from our waiting list.
            </p>
          </div>

          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Your Reserved Tickets</h2>
            ${tickets.map(ticket => `
              <div style="background-color: #fff; padding: 15px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #ddd;">
                <h3 style="color: #333; margin: 0 0 10px 0;">${ticket.name}</h3>
                <p><strong>Quantity:</strong> ${ticket.quantity}</p>
                <p><strong>Price per ticket:</strong> $${ticket.price}</p>
                <p><strong>Subtotal:</strong> $${(ticket.price * ticket.quantity).toFixed(2)}</p>
              </div>
            `).join('')}
            
            <div style="background-color: #e9ecef; padding: 15px; border-radius: 8px; margin-top: 15px;">
              <h3 style="color: #333; margin: 0 0 10px 0;">Total: ${totalTickets} tickets - $${totalAmount.toFixed(2)}</h3>
            </div>
          </div>

          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <h3 style="color: #856404; margin: 0 0 10px 0;">Important: Limited Time Offer</h3>
            <p style="color: #856404; margin: 0;">
              You have <strong>24 hours</strong> to complete your purchase. After this time, your reserved tickets will be released to the next person on the waiting list.
            </p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="#" style="background-color: #F79432; color: #000; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Complete Your Purchase Now
            </a>
          </div>
          
          <p style="margin-top: 30px; text-align: center; color: #666;">
            Thank you for your patience! We&apos;re excited to see you at the event.
          </p>
        </div>
      `),
      text: `Great News! Your wait is over for ${eventName}.\n\nTickets have become available and you've been selected from our waiting list. You have 24 hours to complete your purchase.\n\nTotal: ${totalTickets} tickets - $${totalAmount.toFixed(2)}\n\nVisit Jetzy Events to complete your purchase.`
    })
  } catch (error) {
    console.error("Failed to send waiting list approval:", error)
    throw error
  }
}

export const sendWaitingListNotification = async ({ firstName, lastName, email, eventName }: WaitingListEmailData) => {
  try {
    await sgMail.send({
      to: [email, "tech@jetzyapp.com"],
      from: process.env.SENDGRID_EMAIL_SENDER as string,
      subject: `Jetzy [Waiting List] ${decodeHTMLEntities(eventName)}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">You're on the Waiting List!</h1>
          
          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <h2 style="color: #856404; margin-bottom: 15px;">Event Capacity Reached</h2>
            <p style="color: #856404; margin: 0;">
              Unfortunately, the event "${eventName}" has reached its capacity limit. 
              However, we've added you to our waiting list and will notify you immediately 
              if spots become available.
            </p>
          </div>

          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">What happens next?</h2>
            <ul style="color: #333; line-height: 1.6;">
              <li>We'll monitor for any cancellations or capacity increases</li>
              <li>If a spot opens up, you'll be the first to know</li>
              <li>You'll receive an email with a special link to complete your purchase</li>
              <li>This link will be valid for 24 hours</li>
            </ul>
          </div>

          <div style="background-color: #d1ecf1; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #17a2b8;">
            <h3 style="color: #0c5460; margin: 0 0 10px 0;">Important Notes:</h3>
            <p style="color: #0c5460; margin: 0;">
              • You'll have 24 hours to complete your purchase if a spot becomes available<br/>
              • If you don't respond within 24 hours, the spot will go to the next person on the list<br/>
              • You can check your waiting list status anytime by visiting the event page
            </p>
          </div>
          
          <p style="margin-top: 30px; text-align: center; color: #666;">
            Thank you for your interest in Jetzy events! We'll be in touch soon.
          </p>
        </div>
      `),
      text: `You're on the Waiting List for ${eventName}!\n\nUnfortunately, the event has reached its capacity, but we've added you to the waiting list. We'll notify you if a spot opens up.`
    })
  } catch (error) {
    console.error("Failed to send waiting list notification:", error)
    throw error
  }
}

export const sendEventInvitation = async ({ email, eventName, eventSlug, eventDate, eventLocation, hostName }: EventInvitationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_URL environment variable is required")
  }
  const eventUrl = `${baseUrl}/${eventSlug}`

  try {
    await sgMail.send({
      to: email,
      from: {
        email: process.env.SENDGRID_EMAIL_SENDER as string,
        name: 'Jetzy Events'
      },
      replyTo: process.env.SENDGRID_EMAIL_SENDER as string,
      subject: `${hostName} invited you to ${decodeHTMLEntities(eventName)}`,
      text: `You're invited to ${decodeHTMLEntities(eventName)}!\n\nDate & Time: ${eventDate}\nLocation: ${eventLocation}\n\nView event details: ${eventUrl}\n\n--\nThis invitation was sent by ${hostName} via Jetzy Events`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 40px 20px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">You're Invited!</h1>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <div style="margin-bottom: 25px;">
              <p style="color: #6B7280; font-size: 16px; line-height: 1.6; margin: 0;">
                ${hostName} has invited you to attend:
              </p>
            </div>

            <div style="background: linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%); padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #8B5CF6;">
              <h2 style="color: #1F2937; margin: 0 0 20px 0; font-size: 24px; font-weight: 700;">${decodeHTMLEntities(eventName)}</h2>
              
              <div style="margin-bottom: 12px;">
                <span style="color: #6B7280; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">📅 Date & Time</span>
                <p style="color: #1F2937; font-size: 16px; margin: 5px 0 0 0; font-weight: 500;">${eventDate}</p>
              </div>
              
              <div style="margin-bottom: 0;">
                <span style="color: #6B7280; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">📍 Location</span>
                <p style="color: #1F2937; font-size: 16px; margin: 5px 0 0 0; font-weight: 500;">${eventLocation}</p>
              </div>
            </div>

            <div style="text-align: center; margin: 35px 0 25px 0;">
              <a href="${eventUrl}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(139, 92, 246, 0.3); transition: all 0.2s;">
                View Event Details & RSVP
              </a>
            </div>

            <div style="background-color: #FEF3C7; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #F59E0B;">
              <p style="color: #92400E; margin: 0; font-size: 14px; line-height: 1.6;">
                <strong>👉 Don't forget to RSVP!</strong><br/>
                Click the button above to confirm your attendance and get all the event details.
              </p>
            </div>
            
            <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
              <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
                This invitation was sent by ${hostName} via Jetzy Events<br/>
                <a href="${eventUrl}" style="color: #8B5CF6; text-decoration: none;">View event</a> | 
                <a href="${eventUrl}" style="color: #8B5CF6; text-decoration: none;">Unsubscribe</a>
              </p>
              <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
                Jetzy Events, Inc.<br/>
                If you don't want to receive these emails, you can unsubscribe above.
              </p>
            </div>
          </div>
        </div>
      `),
    })
    console.log(`✅ Event invitation sent successfully to: ${email}`)
  } catch (error) {
    console.error("❌ Failed to send event invitation email:", error)
    throw error
  }
}

export const sendBlastEmail = async ({
  email,
  eventName,
  eventSlug,
  eventDate,
  eventLocation,
  hostName,
  emailType,
  subject,
  customMessage,
}: BlastEmailData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_URL environment variable is required")
  }
  const eventUrl = `${baseUrl}/${eventSlug}`

  // Dynamic button text and styling based on email type
  const buttonConfig = {
    invitation: { text: "View Event & RSVP", color: "#8B5CF6", emoji: "🎉" },
    reminder: { text: "View Event Details", color: "#F59E0B", emoji: "⏰" },
    update: { text: "See What Changed", color: "#3B82F6", emoji: "📢" },
    announcement: { text: "Read More", color: "#10B981", emoji: "📣" },
    custom: { text: "View Event", color: "#8B5CF6", emoji: "✉️" },
  }

  const config = buttonConfig[emailType]

  try {
    await sgMail.send({
      to: email,
      from: {
        email: process.env.SENDGRID_EMAIL_SENDER as string,
        name: "Jetzy Events",
      },
      replyTo: process.env.SENDGRID_EMAIL_SENDER as string,
      subject,
      text: `${decodeHTMLEntities(eventName)}\n\n${customMessage}\n\nDate & Time: ${eventDate}\nLocation: ${eventLocation}\n\nView event: ${eventUrl}\n\n--\nSent by ${hostName} via Jetzy Events`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background: linear-gradient(135deg, ${config.color} 0%, ${config.color}dd 100%); padding: 40px 20px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">${config.emoji} ${subject}</h1>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <div style="margin-bottom: 25px;">
              <p style="color: #6B7280; font-size: 16px; line-height: 1.6; margin: 0;">
                Message from ${hostName}:
              </p>
            </div>

            <div style="background: #F9FAFB; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${config.color};">
              <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${customMessage}</p>
            </div>

            <div style="background: linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%); padding: 25px; border-radius: 12px; margin: 25px 0;">
              <h2 style="color: #1F2937; margin: 0 0 20px 0; font-size: 24px; font-weight: 700;">${decodeHTMLEntities(eventName)}</h2>
              
              <div style="margin-bottom: 12px;">
                <span style="color: #6B7280; font-size: 14px; font-weight: 600; text-transform: uppercase;">📅 Date & Time</span>
                <p style="color: #1F2937; font-size: 16px; margin: 5px 0 0 0; font-weight: 500;">${eventDate}</p>
              </div>
              
              <div style="margin-bottom: 0;">
                <span style="color: #6B7280; font-size: 14px; font-weight: 600; text-transform: uppercase;">📍 Location</span>
                <p style="color: #1F2937; font-size: 16px; margin: 5px 0 0 0; font-weight: 500;">${eventLocation}</p>
              </div>
            </div>

            <div style="text-align: center; margin: 35px 0 25px 0;">
              <a href="${eventUrl}" style="background: linear-gradient(135deg, ${config.color} 0%, ${config.color}dd 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2); transition: all 0.2s;">
                ${config.text}
              </a>
            </div>
            
            <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
              <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
                Sent by ${hostName} via Jetzy Events<br/>
                <a href="${eventUrl}" style="color: ${config.color}; text-decoration: none;">View event</a> | 
                <a href="${eventUrl}" style="color: ${config.color}; text-decoration: none;">Unsubscribe</a>
              </p>
              <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
                Jetzy Events, Inc.
              </p>
            </div>
          </div>
        </div>
      `),
    })
    console.log(`✅ Blast email sent successfully to: ${email}`)
  } catch (error) {
    console.error("❌ Failed to send blast email:", error)
    throw error
  }
}

export const sendTicketConfirmation = async ({ event, firstName, lastName, email, phone, tickets, orderNumber, isNewUser = false, qrCodeImageUrl, guestEmails = [], referralCode, discountAmount, discountPercentage }: TicketEmailData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL

  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_URL environment variable is required")
  }

  // Skip email sending in localhost to avoid sending test emails
  if (baseUrl.includes('localhost')) {
    console.log("[LOCALHOST MODE] Email sending skipped - would send to:", email)
    console.log("[LOCALHOST MODE] Order Number:", orderNumber)
    console.log("[LOCALHOST MODE] Event:", event.name)
    return { success: true, message: "Email skipped in localhost mode" }
  }
  console.log("[sendTicketConfirmation] Called with:", { email, orderNumber, eventName: event.name, isNewUser, ticketCount: tickets.length })

  // Validate SendGrid configuration
  if (!process.env.SENDGRID_API_KEY) {
    const errorMsg = "SENDGRID_API_KEY is not set in environment variables"
    console.error("[sendTicketConfirmation] ❌", errorMsg)
    throw new Error(errorMsg)
  }

  if (!process.env.SENDGRID_EMAIL_SENDER) {
    const errorMsg = "SENDGRID_EMAIL_SENDER is not set in environment variables"
    console.error("[sendTicketConfirmation] ❌", errorMsg)
    throw new Error(errorMsg)
  }

  console.log("[sendTicketConfirmation] ✅ API Key set:", !!process.env.SENDGRID_API_KEY)
  console.log("[sendTicketConfirmation] ✅ Sender email:", process.env.SENDGRID_EMAIL_SENDER)

  try {
    // format event start and end time
    const eventTimezone = event.timezone.split(') ')[1]

    const start = dayjs.utc(event.startsOn).tz(eventTimezone)
    const end = dayjs.utc(event.endsOn).tz(eventTimezone)

    const startTimestamp = `${start.format('ddd MMM DD YYYY')} ${start.format('hh:mm A')}`
    const endTimestamp = `${end.format('ddd MMM DD YYYY')} ${end.format('hh:mm A')}`

    const subtotal = tickets.reduce((sum, ticket) => sum + ticket.price * ticket.quantity, 0)
    const finalTotal = discountAmount && discountAmount > 0 ? subtotal - discountAmount : subtotal
    const timestamp = `From: ${startTimestamp} To: ${endTimestamp}`
    let location = event.location
    const locationLower = location.toLowerCase()

    // If location contains placeholder text or is empty, try to use venueName
    if ((!location || locationLower.includes("disclosed after registration") || locationLower.includes("location hidden")) && event.venueName) {
      location = event.venueName
    } else if (event.venueName && event.venueName.trim() !== "" && !location.includes(event.venueName)) {
      // If we have both and they are different, combine them
      location = `${event.venueName}, ${location}`
    }

    console.log("Email details:", { timestamp, location, subtotal, finalTotal, referralCode, discountAmount, tickets })

    // Process QR code image for attachment
    const attachments: any[] = []
    let qrCodeValid = false
    let hasAttachment = false

    if (qrCodeImageUrl) {
      try {
        // Check if it's a data URI (base64)
        if (qrCodeImageUrl.startsWith('data:image')) {
          const base64Match = qrCodeImageUrl.match(/^data:image\/(\w+);base64,(.+)$/)
          if (base64Match && base64Match[2]) {
            const base64Data = base64Match[2]
            if (base64Data.length > 0) {
              attachments.push({
                filename: 'qr-code.png',
                type: `image/${base64Match[1]}`,
                content: base64Data,
                content_id: 'qrCode', // SendGrid requires snake_case, not camelCase
                disposition: 'inline',
              })
              hasAttachment = true
              qrCodeValid = true
              console.log("[sendTicketConfirmation] QR code attachment prepared successfully")
            } else {
              console.error("[sendTicketConfirmation] Empty base64 data after extraction")
            }
          } else {
            console.error("[sendTicketConfirmation] Invalid QR code image URL format")
          }
        } else {
          // If it's a URL, we'll use it directly in the HTML
          qrCodeValid = true
        }
      } catch (attachError: any) {
        console.error("[sendTicketConfirmation] Error processing QR code:", attachError.message)
        console.error("[sendTicketConfirmation] QR code image URL:", qrCodeImageUrl ? qrCodeImageUrl.substring(0, 100) + '...' : 'null')
      }
    } else {
      console.warn("[sendTicketConfirmation] No QR code image URL provided")
    }

    // Build email payload
    // Hardcoded check for New Year's Eve event
    if (String(event._id) === "69406b0aecf5f8dab077a1dc") {
      const EVENT_NAME = "New Year's Eve Get Together";
      const VENUE = "Bar Sella, Hyatt Union Square, 134 4th Ave, New York, NY 10003.";
      const TIME = `${start.format('ddd MMM DD YYYY')} (${eventTimezone.replace(/_/g, ' ')}) - 7pm to 3am`;
      const NOTE = "Your ticket covers the entrance fee. You will be able to purchase food and drinks from the venue";
      const APP_STORE_LINK = "https://apps.apple.com/us/app/jetzy-connect-travel-enjoy/id1019546379";
      const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.icreon.travelconnect";

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">Booking Confirmation: ${EVENT_NAME}</h1>
          
          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Event Information</h2>
            <p><strong>Event:</strong> ${EVENT_NAME}</p>
            <p><strong>Date and Time:</strong> ${TIME}</p>
            <p><strong>Venue:</strong> ${VENUE}</p>
          </div>

          <div style="background-color: #FFF5EB; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F79432;">
            <p style="color: #1C1E21; margin: 0; font-weight: bold;">
              ${NOTE}
            </p>
          </div>

          <div style="margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">Ticket Details</h3>
            <p><strong>Order Number:</strong> ${orderNumber}</p>
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
             ${tickets
          .map(
            (ticket) => `
              <div style="background-color: #f8f8f8; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="color: #333; margin: 0 0 10px 0; font-size: 18px;">${ticket.name}</h3>
                <p style="margin: 8px 0;"><strong>Quantity: </strong> ${ticket.quantity} ${ticket.quantity === 1 ? 'ticket' : 'tickets'}</p>
                <p style="margin: 8px 0;"><strong>Price per ticket: </strong> $${ticket.price.toFixed(2)}</p>
                <p style="margin: 8px 0;"><strong>Subtotal: </strong> $${(ticket.price * ticket.quantity).toFixed(2)}</p>
                ${ticket.desc ? `<p style="margin: 8px 0; color: #666;"><strong>Description: </strong> ${ticket.desc}</p>` : ''}
              </div>
            `,
          )
          .join("")}
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <p style="margin-bottom: 15px; font-weight: bold; color: #F79432; font-size: 20px;">Download the Jetzy App Now</p>
            <div style="display: inline-block; vertical-align: middle;">
              <a href="${APP_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Download_on_the_App_Store_Badge.svg/320px-Download_on_the_App_Store_Badge.svg.png" alt="Download on the App Store" style="height: 40px; width: auto;" />
              </a>
              <a href="${PLAY_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Google_Play_Store_badge_EN.svg/320px-Google_Play_Store_badge_EN.svg.png" alt="Get it on Google Play" style="height: 40px; width: auto;" />
              </a>
            </div>
          </div>

          <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
            <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
              Questions? Contact us at <a href="mailto:marketing@jetzy.com" style="color: #1877F2; text-decoration: none;">marketing@jetzy.com</a>
            </p>
            <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
              &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
            </p>
          </div>
        </div>
      `;

      await sgMail.send({
        to: [email, "tech@jetzyapp.com"],
        from: process.env.SENDGRID_EMAIL_SENDER as string,
      subject: `Booking Confirmation: ${EVENT_NAME}`,
        html: wrapHtml(html),
        text: `Booking Confirmation: ${EVENT_NAME}\n\nDate and Time: ${TIME}\nVenue: ${VENUE}\nOrder Number: ${orderNumber}\n\nThank you for your purchase!`,
      })
      console.log(`[sendTicketConfirmation] Sent hardcoded email for event ${event._id}`)
      return { success: true, message: "Email sent successfully" }
    }

    // Hardcoded check for Valentine Event
    if (String(event._id) === "697cf23827f6f5f0d7d8c25a") {
      const EVENT_NAME = "Valentine Event";
      const VENUE = "Nightingale, 37 Carmine St, New York, NY 10014.";
      const TIME = `${start.format('ddd MMM DD YYYY')} (${eventTimezone.replace(/_/g, ' ')}) - 6:30 PM Onwards`;
      const NOTE = "The ticket covers entry only, with food and drinks available for purchase at the bar.";
      const APP_STORE_LINK = "https://apps.apple.com/us/app/jetzy-connect-travel-enjoy/id1019546379";
      const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.icreon.travelconnect";

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">Booking Confirmation: ${EVENT_NAME}</h1>
          
          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Event Information</h2>
            <p><strong>Event:</strong> ${EVENT_NAME}</p>
            <p><strong>Date and Time:</strong> ${TIME}</p>
            <p><strong>Venue:</strong> ${VENUE}</p>
          </div>

          <div style="background-color: #FFF5EB; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F79432;">
            <p style="color: #1C1E21; margin: 0; font-weight: bold;">
              ${NOTE}
            </p>
          </div>

          <div style="margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">Ticket Details</h3>
            <p><strong>Order Number:</strong> ${orderNumber}</p>
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
             ${tickets
          .map(
            (ticket) => `
              <div style="background-color: #f8f8f8; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="color: #333; margin: 0 0 10px 0; font-size: 18px;">${ticket.name}</h3>
                <p style="margin: 8px 0;"><strong>Quantity: </strong> ${ticket.quantity} ${ticket.quantity === 1 ? 'ticket' : 'tickets'}</p>
                <p style="margin: 8px 0;"><strong>Price per ticket: </strong> $${ticket.price.toFixed(2)}</p>
                <p style="margin: 8px 0;"><strong>Subtotal: </strong> $${(ticket.price * ticket.quantity).toFixed(2)}</p>
                ${ticket.desc ? `<p style="margin: 8px 0; color: #666;"><strong>Description: </strong> ${ticket.desc}</p>` : ''}
              </div>
            `,
          )
          .join("")}
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <p style="margin-bottom: 15px; font-weight: bold; color: #F79432; font-size: 20px;">Download the Jetzy App Now</p>
            <div style="display: inline-block; vertical-align: middle;">
              <a href="${APP_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Download_on_the_App_Store_Badge.svg/320px-Download_on_the_App_Store_Badge.svg.png" alt="Download on the App Store" style="height: 40px; width: auto;" />
              </a>
              <a href="${PLAY_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Google_Play_Store_badge_EN.svg/320px-Google_Play_Store_badge_EN.svg.png" alt="Get it on Google Play" style="height: 40px; width: auto;" />
              </a>
            </div>
          </div>

          <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
            <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
              Questions? Contact us at <a href="mailto:marketing@jetzy.com" style="color: #1877F2; text-decoration: none;">marketing@jetzy.com</a>
            </p>
            <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
              &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
            </p>
          </div>
        </div>
      `;

      await sgMail.send({
        to: [email, "tech@jetzyapp.com"],
        from: process.env.SENDGRID_EMAIL_SENDER as string,
      subject: `Booking Confirmation: ${EVENT_NAME}`,
        html: wrapHtml(html),
        text: `Booking Confirmation: ${EVENT_NAME}\n\nDate and Time: ${TIME}\nVenue: ${VENUE}\nOrder Number: ${orderNumber}\n\nThank you for your purchase!`,
      })
      console.log(`[sendTicketConfirmation] Sent hardcoded email for event ${event._id} (Valentine Event)`)
      return { success: true, message: "Email sent successfully" }
    }

    // Hardcoded check for Valentine Event San Francisco
    if (String(event._id) === "698643a2a2b2892a70c68c08") {
      const EVENT_NAME = "Valentine's Event San Francisco";
      const VENUE = "The Vesper, 394 E Campbell Ave, Campbell, CA 95008, United States";
      const GOOGLE_MAPS_LINK = "https://maps.app.goo.gl/VT7pY9YAZgvS6nx17?g_st=iw";
      const TIME = `${timestamp} (${eventTimezone.replace(/_/g, ' ')})`;
      const NOTE = "The ticket covers entry only, with food and drinks available for purchase at the bar.";
      const APP_STORE_LINK = "https://apps.apple.com/us/app/jetzy-connect-travel-enjoy/id1019546379";
      const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.icreon.travelconnect";

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">Booking Confirmation: ${EVENT_NAME}</h1>
          
          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Event Information</h2>
            <p><strong>Event:</strong> ${EVENT_NAME}</p>
            <p><strong>Date and Time:</strong> ${TIME}</p>
            <p><strong>Venue:</strong> ${VENUE}</p>
            <p><a href="${GOOGLE_MAPS_LINK}" style="color: #F79432; text-decoration: none; font-weight: bold;">📍 View on Google Maps</a></p>
          </div>

          <div style="background-color: #FFF5EB; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F79432;">
            <p style="color: #1C1E21; margin: 0; font-weight: bold;">
              ${NOTE}
            </p>
          </div>

          <div style="margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">Ticket Details</h3>
            <p><strong>Order Number:</strong> ${orderNumber}</p>
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
             ${tickets
          .map(
            (ticket) => `
              <div style="background-color: #f8f8f8; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="color: #333; margin: 0 0 10px 0; font-size: 18px;">${ticket.name}</h3>
                <p style="margin: 8px 0;"><strong>Quantity: </strong> ${ticket.quantity} ${ticket.quantity === 1 ? 'ticket' : 'tickets'}</p>
                <p style="margin: 8px 0;"><strong>Price per ticket: </strong> $${ticket.price.toFixed(2)}</p>
                <p style="margin: 8px 0;"><strong>Subtotal: </strong> $${(ticket.price * ticket.quantity).toFixed(2)}</p>
                ${ticket.desc ? `<p style="margin: 8px 0; color: #666;"><strong>Description: </strong> ${ticket.desc}</p>` : ''}
              </div>
            `,
          )
          .join("")}
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <p style="margin-bottom: 15px; font-weight: bold; color: #F79432; font-size: 20px;">Download the Jetzy App Now</p>
            <div style="display: inline-block; vertical-align: middle;">
              <a href="${APP_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Download_on_the_App_Store_Badge.svg/320px-Download_on_the_App_Store_Badge.svg.png" alt="Download on the App Store" style="height: 40px; width: auto;" />
              </a>
              <a href="${PLAY_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Google_Play_Store_badge_EN.svg/320px-Google_Play_Store_badge_EN.svg.png" alt="Get it on Google Play" style="height: 40px; width: auto;" />
              </a>
            </div>
          </div>

          <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
            <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
              Questions? Contact us at <a href="mailto:marketing@jetzy.com" style="color: #1877F2; text-decoration: none;">marketing@jetzy.com</a>
            </p>
            <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
              &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
            </p>
          </div>
        </div>
      `;

      await sgMail.send({
        to: [email, "tech@jetzyapp.com"],
        from: process.env.SENDGRID_EMAIL_SENDER as string,
      subject: `Booking Confirmation: ${EVENT_NAME}`,
        html: wrapHtml(html),
        text: `Booking Confirmation: ${EVENT_NAME}\n\nDate and Time: ${TIME}\nVenue: ${VENUE}\nOrder Number: ${orderNumber}\n\nThank you for your purchase!`,
      })
      console.log(`[sendTicketConfirmation] Sent hardcoded email for event ${event._id} (Valentine SF)`)
      return { success: true, message: "Email sent successfully" }
    }

    // Hardcoded check for Valentine Event LA
    if (String(event._id) === "698a27d43c43238502823ddf") {
      const EVENT_NAME = "Valentine's Event LA";
      const VENUE = "11520 W Pico Blvd, Los Angeles, CA 90064, United States";
      const GOOGLE_MAPS_LINK = "https://maps.app.goo.gl/zS23zQj6uf98CcQb6";
      const TIME = `${timestamp} (${eventTimezone.replace(/_/g, ' ')})`;
      const NOTE = "The ticket covers entry only, with food and drinks available for purchase at the bar.";
      const APP_STORE_LINK = "https://apps.apple.com/us/app/jetzy-connect-travel-enjoy/id1019546379";
      const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.icreon.travelconnect";

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">Booking Confirmation: ${EVENT_NAME}</h1>
          
          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Event Information</h2>
            <p><strong>Event:</strong> ${EVENT_NAME}</p>
            <p><strong>Date and Time:</strong> ${TIME}</p>
            <p><strong>Venue:</strong> ${VENUE}</p>
            <p><a href="${GOOGLE_MAPS_LINK}" style="color: #F79432; text-decoration: none; font-weight: bold;">📍 View on Google Maps</a></p>
          </div>

          <div style="background-color: #FFF5EB; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F79432;">
            <p style="color: #1C1E21; margin: 0; font-weight: bold;">
              ${NOTE}
            </p>
          </div>

          <div style="margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">Ticket Details</h3>
            <p><strong>Order Number:</strong> ${orderNumber}</p>
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
             ${tickets
          .map(
            (ticket) => `
              <div style="background-color: #f8f8f8; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="color: #333; margin: 0 0 10px 0; font-size: 18px;">${ticket.name}</h3>
                <p style="margin: 8px 0;"><strong>Quantity: </strong> ${ticket.quantity} ${ticket.quantity === 1 ? 'ticket' : 'tickets'}</p>
                <p style="margin: 8px 0;"><strong>Price per ticket: </strong> $${ticket.price.toFixed(2)}</p>
                <p style="margin: 8px 0;"><strong>Subtotal: </strong> $${(ticket.price * ticket.quantity).toFixed(2)}</p>
                ${ticket.desc ? `<p style="margin: 8px 0; color: #666;"><strong>Description: </strong> ${ticket.desc}</p>` : ''}
              </div>
            `,
          )
          .join("")}
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <p style="margin-bottom: 15px; font-weight: bold; color: #F79432; font-size: 20px;">Download the Jetzy App Now</p>
            <div style="display: inline-block; vertical-align: middle;">
              <a href="${APP_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Download_on_the_App_Store_Badge.svg/320px-Download_on_the_App_Store_Badge.svg.png" alt="Download on the App Store" style="height: 40px; width: auto;" />
              </a>
              <a href="${PLAY_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Google_Play_Store_badge_EN.svg/320px-Google_Play_Store_badge_EN.svg.png" alt="Get it on Google Play" style="height: 40px; width: auto;" />
              </a>
            </div>
          </div>

          <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
            <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
              Questions? Contact us at <a href="mailto:marketing@jetzy.com" style="color: #1877F2; text-decoration: none;">marketing@jetzy.com</a>
            </p>
            <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
              &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
            </p>
          </div>
        </div>
      `;

      await sgMail.send({
        to: [email, "tech@jetzyapp.com"],
        from: process.env.SENDGRID_EMAIL_SENDER as string,
      subject: `Booking Confirmation: ${EVENT_NAME}`,
        html: wrapHtml(html),
        text: `Booking Confirmation: ${EVENT_NAME}\n\nDate and Time: ${TIME}\nVenue: ${VENUE}\nOrder Number: ${orderNumber}\n\nThank you for your purchase!`,
      })
      console.log(`[sendTicketConfirmation] Sent hardcoded email for event ${event._id} (Valentine LA)`)
      return { success: true, message: "Email sent successfully" }
    }

    // Hardcoded check for Founder/Investor Happy Hour
    if (String(event._id) === "69c3f18800c9a06c6042f78b") {
      const EVENT_NAME = "Founder/Investor Happy Hour";
      const VENUE = "Nightingale, 37 Carmine St, New York, NY 10014.";
      const GOOGLE_MAPS_LINK = "https://maps.app.goo.gl/yShTrAwBCDjJVUvP7";
      const TIME = `${start.format('ddd MMM DD YYYY')} (${eventTimezone.replace(/_/g, ' ')}) - 6:00 PM to 8:00 PM`;
      const NOTE = "The ticket covers entry only, with food and drinks available for purchase at the bar.";
      const APP_STORE_LINK = "https://apps.apple.com/us/app/jetzy-connect-travel-enjoy/id1019546379";
      const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.icreon.travelconnect";

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">Booking Confirmation: ${EVENT_NAME}</h1>
          
          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Event Information</h2>
            <p><strong>Event:</strong> ${EVENT_NAME}</p>
            <p><strong>Date and Time:</strong> ${TIME}</p>
            <p><strong>Venue:</strong> ${VENUE}</p>
            <p><a href="${GOOGLE_MAPS_LINK}" style="color: #F79432; text-decoration: none; font-weight: bold;">📍 View on Google Maps</a></p>
          </div>

          <div style="background-color: #FFF5EB; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F79432;">
            <p style="color: #1C1E21; margin: 0; font-weight: bold;">
              ${NOTE}
            </p>
          </div>

          <div style="margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">Ticket Details</h3>
            <p><strong>Order Number:</strong> ${orderNumber}</p>
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
             ${tickets
          .map(
            (ticket) => `
              <div style="background-color: #f8f8f8; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="color: #333; margin: 0 0 10px 0; font-size: 18px;">${ticket.name}</h3>
                <p style="margin: 8px 0;"><strong>Quantity: </strong> ${ticket.quantity} ${ticket.quantity === 1 ? 'ticket' : 'tickets'}</p>
                <p style="margin: 8px 0;"><strong>Price per ticket: </strong> $${ticket.price.toFixed(2)}</p>
                <p style="margin: 8px 0;"><strong>Subtotal: </strong> $${(ticket.price * ticket.quantity).toFixed(2)}</p>
                ${ticket.desc ? `<p style="margin: 8px 0; color: #666;"><strong>Description: </strong> ${ticket.desc}</p>` : ''}
              </div>
            `,
          )
          .join("")}
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <p style="margin-bottom: 15px; font-weight: bold; color: #F79432; font-size: 20px;">Download the Jetzy App Now</p>
            <div style="display: inline-block; vertical-align: middle;">
              <a href="${APP_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Download_on_the_App_Store_Badge.svg/320px-Download_on_the_App_Store_Badge.svg.png" alt="Download on the App Store" style="height: 40px; width: auto;" />
              </a>
              <a href="${PLAY_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Google_Play_Store_badge_EN.svg/320px-Google_Play_Store_badge_EN.svg.png" alt="Get it on Google Play" style="height: 40px; width: auto;" />
              </a>
            </div>
          </div>

          <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
            <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
              Questions? Contact us at <a href="mailto:marketing@jetzy.com" style="color: #1877F2; text-decoration: none;">marketing@jetzy.com</a>
            </p>
            <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
              &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
            </p>
          </div>
        </div>
      `;

      await sgMail.send({
        to: [email, "tech@jetzyapp.com"],
        from: process.env.SENDGRID_EMAIL_SENDER as string,
        subject: `Booking Confirmation: ${EVENT_NAME}`,
        html: wrapHtml(html),
        text: `Booking Confirmation: ${EVENT_NAME}\n\nDate and Time: ${TIME}\nVenue: ${VENUE}\nOrder Number: ${orderNumber}\n\nThank you for your purchase!`,
      })
      console.log(`[sendTicketConfirmation] Sent hardcoded email for event ${event._id} (Founder/Investor Happy Hour)`)
      return { success: true, message: "Email sent successfully" }
    }


    const emailPayload = {
      to: [email, "tech@jetzyapp.com"],
      from: process.env.SENDGRID_EMAIL_SENDER as string,
      subject: `Booking Confirmation: ${decodeHTMLEntities(event.name)}`,
      ...(attachments.length > 0 ? { attachments } : {}),
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">Thank you for your purchase!</h1>
          
          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Event Details</h2>
            <p><strong>Date and Time: </strong>${timestamp}</p>
            <p><strong>Venue: </strong>${location}</p>
            <p><strong>Organizer: </strong>${(event.ownerId as any)?.firstName ? `${(event.ownerId as any).firstName} ${(event.ownerId as any).lastName}` : (event.host?.name || "Jetzy Events")}</p>
            ${(event.ownerId as any)?.email ? `<p><strong>Email: </strong>${(event.ownerId as any).email}</p>` : (event.host?.email ? `<p><strong>Email: </strong>${event.host.email}</p>` : "")}
            ${(event.ownerId as any)?.phone ? `<p><strong>Phone: </strong>${(event.ownerId as any).phone}</p>` : (event.host?.phone ? `<p><strong>Phone: </strong>${event.host.phone}</p>` : "")}
          </div>

           <div style="margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">Ticket Details</h3>
            <p><strong>Order Number:</strong> ${orderNumber}</p>
             <p><strong>Name:</strong> ${firstName} ${lastName}</p>
            ${tickets
          .map(
            (ticket) => `
              <div style="background-color: #f8f8f8; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="color: #333; margin: 0 0 10px 0; font-size: 18px;">${ticket.name}</h3>
                <p style="margin: 8px 0;"><strong>Quantity: </strong> ${ticket.quantity} ${ticket.quantity === 1 ? 'ticket' : 'tickets'}</p>
                <p style="margin: 8px 0;"><strong>Price per ticket: </strong> $${ticket.price.toFixed(2)}</p>
                <p style="margin: 8px 0;"><strong>Subtotal: </strong> $${(ticket.price * ticket.quantity).toFixed(2)}</p>
                ${ticket.desc ? `<p style="margin: 8px 0; color: #666;"><strong>Description: </strong> ${ticket.desc}</p>` : ''}
              </div>
            `,
          )
          .join("")}
          </div>
          
          <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; border: 1px solid #ffeeba;">
            <p style="color: #856404; font-weight: bold; margin: 0;">
              Please show this email at the entrance for entry
            </p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <p style="margin-bottom: 15px; font-weight: bold; color: #F79432; font-size: 20px;">Download the Jetzy App Now</p>
            <div style="display: inline-block; vertical-align: middle;">
              <a href="https://apps.apple.com/us/app/jetzy-connect-travel-enjoy/id1019546379" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Download_on_the_App_Store_Badge.svg/320px-Download_on_the_App_Store_Badge.svg.png" alt="Download on the App Store" style="height: 40px; width: auto;" />
              </a>
              <a href="https://play.google.com/store/apps/details?id=com.icreon.travelconnect" style="text-decoration: none; display: inline-block; margin: 5px;">
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Google_Play_Store_badge_EN.svg/320px-Google_Play_Store_badge_EN.svg.png" alt="Get it on Google Play" style="height: 40px; width: auto;" />
              </a>
            </div>
          </div>

          <p style="margin-top: 30px; text-align: center; color: #666;">
            Welcome to Jetzy! You now have access to exclusive membership benefits.
          </p>
          
          <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
            <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
              Questions? Contact us at <a href="mailto:marketing@jetzy.com" style="color: #1877F2; text-decoration: none;">marketing@jetzy.com</a>
            </p>
            <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
              &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
            </p>
          </div>
        </div>
      `),
      text: `Thank you for your purchase for ${event.name}!\n\nOrder Number: ${orderNumber}\nDate and Time: ${timestamp}\nVenue: ${location}\n\nThank you for choosing Jetzy Events!`,
    }

    console.log("[sendTicketConfirmation] Sending email with payload:", {
      to: emailPayload.to,
      from: emailPayload.from,
      subject: emailPayload.subject,
      hasAttachments: attachments.length > 0,
      hasGuestEmails: guestEmails.length > 0,
    })

    await sgMail.send(emailPayload as any)
    console.log("[sendTicketConfirmation] Email sent successfully to:", email)
    return { success: true, message: "Email sent successfully" }
  } catch (error: any) {
    console.error("[sendTicketConfirmation] Failed to send email:", error.message || error)
    console.error("[sendTicketConfirmation] Error details:", JSON.stringify(error, null, 2))
    if (error.response) {
      console.error("[sendTicketConfirmation] SendGrid response:", JSON.stringify(error.response.body, null, 2))
    }
    throw error
  }
}

export const sendOrganizerSaleNotification = async ({
  event,
  firstName,
  lastName,
  email,
  tickets,
  orderNumber,
  totalAmount,
  referralCode,
  organizerEmail,
}: {
  event: IEvent
  firstName: string
  lastName: string
  email: string
  tickets: any[]
  orderNumber: string
  totalAmount: number
  referralCode?: string
  organizerEmail: string
}) => {
  try {
    await sgMail.send({
      to: organizerEmail,
      from: process.env.SENDGRID_EMAIL_SENDER as string,
      subject: `New Ticket Sale! - ${decodeHTMLEntities(event.name)}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">New Ticket Sold! 🎉</h1>
          
          <div style="background-color: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <h2 style="color: #155724; margin-bottom: 10px;">Cha-ching!</h2>
            <p style="color: #155724; margin: 0;">
              You just sold tickets for <strong>${decodeHTMLEntities(event.name)}</strong>.
            </p>
          </div>

          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px;">Buyer Information</h3>
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Order #:</strong> ${orderNumber}</p>
          </div>

          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px;">Order Summary</h3>
            ${tickets
          .map(
            (t) => `
              <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
                <p style="margin: 0;"><strong>${t.quantity}x</strong> ${t.name}</p>
                <p style="margin: 0; color: #666;">$${t.price} each</p>
              </div>
            `,
          )
          .join("")}
            <p style="font-size: 18px; font-weight: bold; margin-top: 15px;">Total Revenue: $${totalAmount.toFixed(2)}</p>
          </div>

          ${referralCode
          ? `
          <div style="background-color: #e2e3e5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #383d41;">
            <h3 style="color: #383d41; margin: 0 0 10px 0;">Referral Source</h3>
            <p style="margin: 0;">This sale came from code: <strong>${referralCode}</strong></p>
          </div>
          `
          : ""
        }
        </div>
      `),
      text: `New Ticket Sold for ${event.name}!\n\nBuyer: ${firstName} ${lastName}\nOrder #: ${orderNumber}\nTotal Revenue: $${totalAmount.toFixed(2)}`,
    })
  } catch (error) {
    console.error("Failed to send organizer notification:", error)
  }
}

export const sendBookingCancellation = async ({ event, firstName, lastName, email, phone, tickets, orderNumber, totalAmount }: BookingCancellationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_URL environment variable is required")
  }
  console.log("[sendBookingCancellation] Called with:", { email, orderNumber, eventName: event.name, ticketCount: tickets.length })

  try {
    // Format event start and end time
    const eventTimezone = event.timezone.split(') ')[1]
    const start = dayjs.utc(event.startsOn).tz(eventTimezone)
    const end = dayjs.utc(event.endsOn).tz(eventTimezone)
    const startTimestamp = `${start.format('ddd MMM DD YYYY')} ${start.format('hh:mm A')}`
    const endTimestamp = `${end.format('ddd MMM DD YYYY')} ${end.format('hh:mm A')}`
    const timestamp = `From: ${startTimestamp} To: ${endTimestamp}`
    const location = event.location

    await sgMail.send({
      to: [email, "tech@jetzyapp.com"],
      from: process.env.SENDGRID_EMAIL_SENDER as string,
      subject: `Jetzy [Booking Cancelled] ${decodeHTMLEntities(event.name)}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">Booking Cancellation Confirmation</h1>
          
          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <h2 style="color: #856404; margin-bottom: 15px;">Your Booking Has Been Cancelled</h2>
            <p style="color: #856404; margin: 0;">
              We're sorry to inform you that your booking for "${decodeHTMLEntities(event.name)}" has been cancelled.
            </p>
          </div>

          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Event Details</h2>
            <p><strong>Event Name:</strong> ${decodeHTMLEntities(event.name)}</p>
            <p><strong>Date and Time:</strong> ${timestamp}</p>
            <p><strong>Venue:</strong> ${location}</p>
          </div>

          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Customer Information</h2>
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
            <p><strong>Email:</strong> ${email}</p>
            ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ""}
            <p><strong>Order Number:</strong> ${orderNumber}</p>
          </div>

          <div style="margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Cancelled Tickets</h2>
            ${tickets
          .map(
            (ticket) => `
              <div style="background-color: #f8f8f8; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="color: #333; margin: 0 0 10px 0; font-size: 18px;">${ticket.name}</h3>
                <p style="margin: 8px 0;"><strong>Quantity:</strong> ${ticket.quantity} ${ticket.quantity === 1 ? 'ticket' : 'tickets'}</p>
                <p style="margin: 8px 0;"><strong>Price per ticket:</strong> $${ticket.price.toFixed(2)}</p>
                <p style="margin: 8px 0;"><strong>Subtotal:</strong> $${(ticket.price * ticket.quantity).toFixed(2)}</p>
                ${ticket.desc ? `<p style="margin: 8px 0; color: #666;"><strong>Description:</strong> ${ticket.desc}</p>` : ''}
              </div>
            `,
          )
          .join("")}
          </div>
          
          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #333; margin: 0;">Total Amount Refunded: $${totalAmount.toFixed(2)}</h3>
          </div>

          <div style="background-color: #e7f3ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #1877F2;">
            <h2 style="color: #1877F2; margin-bottom: 15px;">Important Information</h2>
            <p style="color: #1C1E21; margin-bottom: 10px;">
              Your tickets have been released and are now available for other attendees. 
              If you were charged for this booking, a refund will be processed according to our refund policy.
            </p>
            <p style="color: #1C1E21; margin-top: 10px;">
              If you have any questions about this cancellation or need assistance, please don't hesitate to contact us.
            </p>
          </div>
          
          <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
            <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
              Questions? Contact us at <a href="mailto:events@jetzy.com" style="color: #1877F2; text-decoration: none;">events@jetzy.com</a>
            </p>
            <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
              &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
            </p>
          </div>
        </div>
      `),
      text: `Booking Cancellation Confirmation for ${event.name}.\n\nYour booking has been cancelled and a refund of $${totalAmount.toFixed(2)} has been processed.\n\nThank you for choosing Jetzy Events!`,
    })

    console.log("[sendBookingCancellation] Email sent successfully to:", email)
    return { success: true, message: "Cancellation email sent successfully" }
  } catch (error: any) {
    console.error("[sendBookingCancellation] Failed to send email:", error.message || error)
    console.error("[sendBookingCancellation] Error details:", JSON.stringify(error, null, 2))
    if (error.response) {
      console.error("[sendBookingCancellation] SendGrid response:", JSON.stringify(error.response.body, null, 2))
    }
    throw error
  }
}

export const sendDiscussionNotification = async ({
  email,
  firstName,
  lastName,
  authorName,
  eventName,
  eventSlug,
  magicToken,
  postId,
  hasImages,
}: DiscussionNotificationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
  const discussionUrl = `${baseUrl}/login?magicToken=${magicToken}&_cb=${encodeURIComponent(`/${eventSlug}?view=discussion&postId=${postId}`)}`

  const subject = hasImages
    ? `New photos added to ${decodeHTMLEntities(eventName)}`
    : `${authorName} Posted in ${decodeHTMLEntities(eventName)}`

  const bodyContent = hasImages
    ? `We've added new photos and videos to <strong>${decodeHTMLEntities(eventName)}</strong>.`
    : `<strong>${authorName}</strong> Posted in <strong>${decodeHTMLEntities(eventName)}</strong>.`

  try {
    await sgMail.send({
      to: email,
      from: {
        email: process.env.SENDGRID_EMAIL_SENDER as string,
        name: "Jetzy Events",
      },
      subject,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border-top: 4px solid #F79432;">
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0;">
              Hi ${firstName},
            </p>
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 15px 0 25px 0;">
              ${bodyContent}
            </p>

            <div style="margin: 30px 0;">
              <a href="${discussionUrl}" style="color: #F79432; font-weight: 700; font-size: 16px; text-decoration: none;">
                View it here: [Post Link]
              </a>
            </div>

            <p style="color: #1F2937; font-size: 14px; margin-top: 30px; font-weight: 500;">
              — Team Jetzy
            </p>
            
            <div style="margin-top: 40px; display: flex; align-items: center; gap: 10px;">
              <img src="https://events.jetzy.com/favicon.ico" width="20" height="20" style="vertical-align: middle;" />
              <span style="color: #F79432; font-weight: 600; font-size: 14px;">Jetzy Tech</span>
            </div>
          </div>
        </div>
      `),
      text: `${firstName},\n\n${stripHtml(bodyContent)}\n\nView it here: ${discussionUrl}\n\n— Team Jetzy`,
    })
    console.log(`✅ Discussion notification sent successfully to: ${email}`)
  } catch (error) {
    console.error("❌ Failed to send discussion notification email:", error)
    throw error
  }
}

export const sendCommentNotification = async ({
  email,
  firstName,
  lastName,
  commenterName,
  eventName,
  eventSlug,
  magicToken,
  postId,
  hasImages,
}: CommentNotificationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
  const discussionUrl = `${baseUrl}/login?magicToken=${magicToken}&_cb=${encodeURIComponent(`/${eventSlug}?view=discussion&postId=${postId}`)}`

  const subject = hasImages
    ? `New photos added to ${decodeHTMLEntities(eventName)}`
    : `${commenterName} commented on your post in ${decodeHTMLEntities(eventName)}`

  const bodyContent = hasImages
    ? `We've added new photos and videos to <strong>${decodeHTMLEntities(eventName)}</strong>.`
    : `<strong>${commenterName}</strong> commented on your post in <strong>${decodeHTMLEntities(eventName)}</strong>.`

  try {
    await sgMail.send({
      to: email,
      from: {
        email: process.env.SENDGRID_EMAIL_SENDER as string,
        name: "Jetzy Events",
      },
      subject,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border-top: 4px solid #F79432;">
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0;">
              Hi ${firstName},
            </p>
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 15px 0 25px 0;">
              <strong>${commenterName}</strong> commented on your post in <strong>${decodeHTMLEntities(eventName)}</strong>.
            </p>

            <div style="margin: 30px 0;">
              <a href="${discussionUrl}" style="color: #F79432; font-weight: 700; font-size: 16px; text-decoration: none;">
                ${hasImages ? "View it here: [Photo Link]" : "View and reply: [Comment Link]"}
              </a>
            </div>

            <p style="color: #1F2937; font-size: 14px; margin-top: 30px; font-weight: 500;">
              — Team Jetzy
            </p>
            
            <div style="margin-top: 40px; display: flex; align-items: center; gap: 10px;">
              <img src="https://events.jetzy.com/favicon.ico" width="20" height="20" style="vertical-align: middle;" />
              <span style="color: #F79432; font-weight: 600; font-size: 14px;">Jetzy Tech</span>
            </div>
          </div>
        </div>
      `),
      text: `${firstName},\n\n${stripHtml(bodyContent)}\n\nView it here: ${discussionUrl}\n\n— Team Jetzy`,
    })
    console.log(`✅ Comment notification sent successfully to: ${email}`)
  } catch (error) {
    console.error("❌ Failed to send comment notification email:", error)
    throw error
  }
}

export const sendTagNotification = async ({
  email,
  firstName,
  lastName,
  authorName,
  eventName,
  eventSlug,
  magicToken,
  postId,
  hasImages,
}: TagNotificationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
  const discussionUrl = `${baseUrl}/login?magicToken=${magicToken}&_cb=${encodeURIComponent(`/${eventSlug}?view=discussion&postId=${postId}`)}`

  const subject = hasImages
    ? `${authorName} tagged you in a photo from ${decodeHTMLEntities(eventName)}`
    : `${authorName} tagged you in ${decodeHTMLEntities(eventName)}`

  const bodyContent = hasImages
    ? `<strong>${authorName}</strong> tagged you in a photo from <strong>${decodeHTMLEntities(eventName)}</strong>.`
    : `<strong>${authorName}</strong> tagged you in a discussion in <strong>${decodeHTMLEntities(eventName)}</strong>.`

  try {
    await sgMail.send({
      to: email,
      from: {
        email: process.env.SENDGRID_EMAIL_SENDER as string,
        name: "Jetzy Events",
      },
      subject,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border-top: 4px solid #F79432;">
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0;">
              Hi ${firstName},
            </p>
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 15px 0 25px 0;">
              ${bodyContent}
            </p>

            <div style="margin: 30px 0;">
              <a href="${discussionUrl}" style="color: #F79432; font-weight: 700; font-size: 16px; text-decoration: none;">
                View it here: [Photo Link]
              </a>
            </div>

            <p style="color: #1F2937; font-size: 14px; margin-top: 30px; font-weight: 500;">
              — Team Jetzy
            </p>
            
            <div style="margin-top: 40px; display: flex; align-items: center; gap: 10px;">
              <img src="https://events.jetzy.com/favicon.ico" width="20" height="20" style="vertical-align: middle;" />
              <span style="color: #F79432; font-weight: 600; font-size: 14px;">Jetzy Tech</span>
            </div>
          </div>
        </div>
      `),
      text: `${firstName},\n\n${stripHtml(bodyContent)}\n\nView it here: ${discussionUrl}\n\n— Team Jetzy`,
    })
    console.log(`✅ Tag notification sent successfully to: ${email}`)
  } catch (error) {
    console.error("❌ Failed to send tag notification email:", error)
    throw error
  }
}

export const sendReactionNotification = async ({
  email,
  firstName,
  lastName,
  reactorName,
  eventName,
  eventSlug,
  magicToken,
  postId,
}: ReactionNotificationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
  const discussionUrl = `${baseUrl}/login?magicToken=${magicToken}&_cb=${encodeURIComponent(`/${eventSlug}?view=discussion&postId=${postId}`)}`

  try {
    await sgMail.send({
      to: email,
      from: {
        email: process.env.SENDGRID_EMAIL_SENDER as string,
        name: "Jetzy Events",
      },
      subject: `${reactorName} reacted to your post in ${decodeHTMLEntities(eventName)}`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border-top: 4px solid #F79432;">
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0;">
              Hi ${firstName},
            </p>
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 15px 0 25px 0;">
              <strong>${reactorName}</strong> Liked your post in <strong>${decodeHTMLEntities(eventName)}</strong>.
            </p>

            <div style="margin: 30px 0;">
              <a href="${discussionUrl}" style="color: #F79432; font-weight: 700; font-size: 16px; text-decoration: none;">
                See the update: [Post Link]
              </a>
            </div>

            <p style="color: #1F2937; font-size: 14px; margin-top: 30px; font-weight: 500;">
              — Team Jetzy
            </p>
            
            <div style="margin-top: 40px; display: flex; align-items: center; gap: 10px;">
              <img src="https://events.jetzy.com/favicon.ico" width="20" height="20" style="vertical-align: middle;" />
              <span style="color: #F79432; font-weight: 600; font-size: 14px;">Jetzy Tech</span>
            </div>
          </div>
        </div>
      `),
      text: `${firstName},\n\n${reactorName} Liked your post in ${decodeHTMLEntities(eventName)}.\n\nSee the update here: ${discussionUrl}\n\n— Team Jetzy`,
    })
    console.log(`✅ Reaction notification sent successfully to: ${email}`)
  } catch (error) {
    console.error("❌ Failed to send reaction notification email:", error)
    throw error
  }
}

export const sendViewMilestoneNotification = async ({
  email,
  firstName,
  lastName,
  eventName,
  eventSlug,
  magicToken,
  postId,
  viewCount,
}: ViewMilestoneNotificationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
  const discussionUrl = `${baseUrl}/login?magicToken=${magicToken}&_cb=${encodeURIComponent(`/${eventSlug}?view=discussion&postId=${postId}`)}`

  try {
    await sgMail.send({
      to: email,
      from: {
        email: process.env.SENDGRID_EMAIL_SENDER as string,
        name: "Jetzy Events",
      },
      subject: `Your post in ${decodeHTMLEntities(eventName)} is getting attention`,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border-top: 4px solid #F79432;">
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0;">
              Hi ${firstName},
            </p>
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 15px 0 25px 0;">
              Your post in <strong>${decodeHTMLEntities(eventName)}</strong> has received <strong>${viewCount}</strong> views.
            </p>

            <div style="margin: 30px 0;">
              <a href="${discussionUrl}" style="color: #F79432; font-weight: 700; font-size: 16px; text-decoration: none;">
                Take a look: [Post Link]
              </a>
            </div>

            <p style="color: #1F2937; font-size: 14px; margin-top: 30px; font-weight: 500;">
              — Team Jetzy
            </p>
            
            <div style="margin-top: 40px; display: flex; align-items: center; gap: 10px;">
              <img src="https://events.jetzy.com/favicon.ico" width="20" height="20" style="vertical-align: middle;" />
              <span style="color: #F79432; font-weight: 600; font-size: 14px;">Jetzy Tech</span>
            </div>
          </div>
        </div>
      `),
      text: `${firstName},\n\nYour post in ${decodeHTMLEntities(eventName)} has received ${viewCount} views.\n\nTake a look here: ${discussionUrl}\n\n— Team Jetzy`,
    })
    console.log(`✅ View milestone notification sent successfully to: ${email}`)
  } catch (error) {
    console.error("❌ Failed to send view milestone notification email:", error)
    throw error
  }
}

export const sendThankYouNotification = async ({
  email,
  firstName,
  lastName,
  eventName,
  eventSlug,
  magicToken,
  formLink,
}: ThankYouNotificationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
  const eventUrl = `${baseUrl}/login?magicToken=${magicToken}&_cb=${encodeURIComponent(`/${eventSlug}`)}`

  const subject = `Thank you for making ${decodeHTMLEntities(eventName)} unforgettable 💫`

  const bodyHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border-top: 4px solid #F79432;">
        <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0;">
          Hi ${firstName},
        </p>
        <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 15px 0 25px 0;">
          It was a pleasure having you with us — the evening truly came alive because of your energy and presence. We've uploaded the photos and videos from the night on the Jetzy event page: <strong><a href="${eventUrl}" style="color: #F79432; text-decoration: none;">[Event Link]</a></strong>.
        </p>

        <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 25px 0 25px 0;">
          We are in the process of curating the next events. Click this link to inform which event you would like to attend <strong><a href="${formLink}" style="color: #F79432; text-decoration: none;">[Form Link]</a></strong>
        </p>

        <p style="color: #1F2937; font-size: 14px; margin-top: 30px; font-weight: 500;">
          — Team Jetzy
        </p>
        
        <div style="margin-top: 40px;">
          <p style="color: #1F2937; font-size: 14px; margin-bottom: 10px; font-weight: 600;">App download options</p>
          <div style="display: flex; align-items: center; gap: 10px;">
            <img src="https://events.jetzy.com/favicon.ico" width="20" height="20" style="vertical-align: middle;" />
            <span style="color: #F79432; font-weight: 600; font-size: 14px;">Jetzy Tech</span>
          </div>
        </div>
      </div>
    </div>
  `

  try {
    await sgMail.send({
      to: email,
      from: {
        email: process.env.SENDGRID_EMAIL_SENDER as string,
        name: "Jetzy Events",
      },
      subject,
      html: wrapHtml(bodyHtml),
      text: `${firstName},\n\nIt was a pleasure having you with us — the evening truly came alive because of your energy and presence. We've uploaded the photos and videos from the night on the Jetzy event page: ${eventUrl}\n\nWe are in the process of curating the next events. Click this link to inform which event you would like to attend: ${formLink}\n\n— Team Jetzy`,
    })
    console.log(`✅ Thank you notification sent successfully to: ${email}`)
  } catch (error) {
    console.error("❌ Failed to send thank you notification email:", error)
    throw error
  }
}

export const sendWelcomeEmail = async ({ email, firstName, lastName, password }: WelcomeEmailData) => {
  const APP_STORE_LINK = "https://apps.apple.com/us/app/jetzy-connect-travel-enjoy/id1019546379";
  const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.icreon.travelconnect";
  const DOWNLOAD_LINK = "https://jetzyapp.com/download.html";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="https://events.jetzy.com/favicon.ico" width="50" height="50" alt="Jetzy Logo" />
      </div>
      <h1 style="color: #333; text-align: center;">Welcome to Jetzy! 🚀</h1>
      
      <p style="font-size: 16px; color: #555; line-height: 1.6;">
        Hi ${firstName || 'Traveler'},
      </p>
      
      <p style="font-size: 16px; color: #555; line-height: 1.6;">
        Your Jetzy account has been successfully created. We're excited to have you join our global community of travelers and explorers!
      </p>

      ${password ? `
      <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #F79432;">
        <h3 style="margin-top: 0; color: #333;">Your Login Credentials</h3>
        <p style="margin-bottom: 5px;"><strong>Email:</strong> ${email}</p>
        <p style="margin-top: 0;"><strong>Temporary Password:</strong> ${password}</p>
        <p style="font-size: 14px; color: #888; margin-top: 10px; margin-bottom: 0;">
          <em>Note: You must change this temporary password after your first login.</em>
        </p>
      </div>
      ` : ''}

      <div style="text-align: center; margin: 35px 0;">
        <p style="font-weight: bold; color: #F79432; font-size: 18px; margin-bottom: 15px;">Download the Jetzy App to Get Started</p>
        <div style="margin-bottom: 20px;">
          <a href="${APP_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Download_on_the_App_Store_Badge.svg/320px-Download_on_the_App_Store_Badge.svg.png" alt="Download on the App Store" style="height: 40px;" />
          </a>
          <a href="${PLAY_STORE_LINK}" style="text-decoration: none; display: inline-block; margin: 5px;">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Google_Play_Store_badge_EN.svg/320px-Google_Play_Store_badge_EN.svg.png" alt="Get it on Google Play" style="height: 40px;" />
          </a>
        </div>
        <a href="${DOWNLOAD_LINK}" style="background-color: #F79432; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
          Visit Download Page
        </a>
      </div>

      <p style="font-size: 14px; color: #999; text-align: center; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
        Questions? Contact us at <a href="mailto:marketing@jetzy.com" style="color: #F79432; text-decoration: none;">marketing@jetzy.com</a>
        <br />
        &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
      </p>
    </div>
  `;

  try {
    await sgMail.send({
      to: email,
      from: {
        email: process.env.SENDGRID_EMAIL_SENDER as string,
        name: "Jetzy"
      },
      subject: "Welcome to Jetzy - Your Account is Ready!",
      html: wrapHtml(html),
      text: `Welcome to Jetzy!\n\nYour account has been successfully created.${password ? `\n\nYour Temporary Password: ${password}` : ''}\n\nDownload the app: ${DOWNLOAD_LINK}`
    });
    console.log(`✅ Welcome email sent successfully to: ${email}`);
  } catch (error) {
    console.error("❌ Failed to send welcome email:", error);
    throw error;
  }
}

type ChatTagNotificationData = {
  email: string
  taggedName?: string
  taggerName: string
  eventName: string
  eventSlug: string
}

export const sendChatTagNotification = async ({
  email,
  taggedName,
  taggerName,
  eventName,
  eventSlug,
}: ChatTagNotificationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
  const chatUrl = `${baseUrl}/${eventSlug}?view=chat`

  const displayName = taggedName || email.split('@')[0]
  const cleanEventName = decodeHTMLEntities(eventName)

  const subject = `${taggerName} mentioned you in ${cleanEventName} chat`

  try {
    await sgMail.send({
      to: email,
      from: {
        email: process.env.SENDGRID_EMAIL_SENDER as string,
        name: "Jetzy Events",
      },
      subject,
      html: wrapHtml(`
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border-top: 4px solid #F79432;">
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 0;">
              Hi ${displayName},
            </p>
            <p style="color: #1F2937; font-size: 16px; line-height: 1.6; margin: 15px 0 25px 0;">
              <strong>${taggerName}</strong> mentioned you in the chat for <strong>${cleanEventName}</strong>.
            </p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${chatUrl}" style="background: linear-gradient(135deg, #F79432 0%, #e8842a 100%); color: white; padding: 14px 35px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(247, 148, 50, 0.3);">
                Open Chat
              </a>
            </div>

            <p style="color: #6B7280; font-size: 13px; line-height: 1.5; margin: 25px 0 0 0; text-align: center;">
              Click the button above to view the conversation and reply.
            </p>

            <p style="color: #1F2937; font-size: 14px; margin-top: 30px; font-weight: 500;">
              — Team Jetzy
            </p>
            
            <div style="margin-top: 40px; display: flex; align-items: center; gap: 10px;">
              <img src="https://events.jetzy.com/favicon.ico" width="20" height="20" style="vertical-align: middle;" />
              <span style="color: #F79432; font-weight: 600; font-size: 14px;">Jetzy Tech</span>
            </div>
          </div>
        </div>
      `),
      text: `Hi ${displayName},\n\n${taggerName} mentioned you in the chat for ${cleanEventName}.\n\nOpen the chat: ${chatUrl}\n\n— Team Jetzy`,
    })
    console.log(`✅ Chat tag notification sent successfully to: ${email}`)
  } catch (error) {
    console.error("❌ Failed to send chat tag notification email:", error)
    throw error
  }
}

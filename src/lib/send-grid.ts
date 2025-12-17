import { IEvent } from "@/models/events/types"
import sgMail from "@sendgrid/mail"
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

sgMail.setApiKey(process.env.SENDGRID_API_KEY as string)

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

export const sendWaitingListApproval = async ({ firstName, lastName, email, eventName, tickets }: WaitingListApprovalData) => {
	try {
		const totalTickets = tickets.reduce((sum, ticket) => sum + ticket.quantity, 0)
		const totalAmount = tickets.reduce((sum, ticket) => sum + (ticket.price * ticket.quantity), 0)

		await sgMail.send({
			to: [email, "tech@jetzyapp.com"],
			from: process.env.SENDGRID_EMAIL_SENDER as string,
			subject: `Jetzy [Good News!] Your wait is over - ${eventName}`,
			html: `
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
      `,
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
			subject: `Jetzy [Waiting List] ${eventName}`,
			html: `
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
      `,
		})
	} catch (error) {
		console.error("Failed to send waiting list notification:", error)
		throw error
	}
}

export const sendEventInvitation = async ({ email, eventName, eventSlug, eventDate, eventLocation, hostName }: EventInvitationData) => {
	const eventUrl = `${process.env.NEXT_PUBLIC_URL || 'https://events.jetzy.com'}/events/${eventSlug}`
	
	try {
		await sgMail.send({
			to: email,
			from: {
				email: process.env.SENDGRID_EMAIL_SENDER as string,
				name: 'Jetzy Events'
			},
			replyTo: process.env.SENDGRID_EMAIL_SENDER as string,
			subject: `${hostName} invited you to ${eventName}`,
			text: `You're invited to ${eventName}!\n\nDate & Time: ${eventDate}\nLocation: ${eventLocation}\n\nView event details: ${eventUrl}\n\n--\nThis invitation was sent by ${hostName} via Jetzy Events`,
			html: `
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
              <h2 style="color: #1F2937; margin: 0 0 20px 0; font-size: 24px; font-weight: 700;">${eventName}</h2>
              
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
      `,
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
	const eventUrl = `${process.env.NEXT_PUBLIC_URL || 'https://events.jetzy.com'}/events/${eventSlug}`

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
			text: `${eventName}\n\n${customMessage}\n\nDate & Time: ${eventDate}\nLocation: ${eventLocation}\n\nView event: ${eventUrl}\n\n--\nSent by ${hostName} via Jetzy Events`,
			html: `
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
              <h2 style="color: #1F2937; margin: 0 0 20px 0; font-size: 24px; font-weight: 700;">${eventName}</h2>
              
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
      `,
		})
		console.log(`✅ Blast email sent successfully to: ${email}`)
	} catch (error) {
		console.error("❌ Failed to send blast email:", error)
		throw error
	}
}

export const sendTicketConfirmation = async ({ event, firstName, lastName, email, phone, tickets, orderNumber, isNewUser = false }: TicketEmailData) => {
	console.log("[sendTicketConfirmation] Called with:", { email, orderNumber, eventName: event.name, isNewUser, ticketCount: tickets.length })
	console.log("[sendTicketConfirmation] API Key set:", !!process.env.SENDGRID_API_KEY)
	console.log("[sendTicketConfirmation] Sender email:", process.env.SENDGRID_EMAIL_SENDER)
	
	try {
		// format event start and end time
		const eventTimezone = event.timezone.split(') ')[1]

		const start = dayjs.utc(event.startsOn).tz(eventTimezone)
		const end = dayjs.utc(event.endsOn).tz(eventTimezone)

		const startTimestamp = `${start.format('ddd MMM DD YYYY')} ${start.format('hh:mm A')}`
		const endTimestamp = `${end.format('ddd MMM DD YYYY')} ${end.format('hh:mm A')}`

	const totalAmount = tickets.reduce((sum, ticket) => sum + ticket.price * ticket.quantity, 0)
	const timestamp = `From: ${startTimestamp} To: ${endTimestamp}`
	const location = event.location
	
	console.log("Email details:", { timestamp, location, totalAmount, tickets })
	
	try {
		await sgMail.send({
		  to: [email, "tech@jetzyapp.com"],
			from: process.env.SENDGRID_EMAIL_SENDER as string,
			subject: `Jetzy [Booking Confirmation] ${event.name}`,
			html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">Thank you for your purchase!</h1>
          
          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Event Details</h2>
            <p><strong>Date and Time: </strong>${timestamp}</p>
            <p><strong>Venue: </strong>${location}</p>
          </div>

          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Customer Information</h2>
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
            <p><strong>Email:</strong> ${email}</p>
            ${phone ? `<p><strong>Phone: </strong> ${phone}</p>` : ""}
            <p><strong>Order Number: </strong> ${orderNumber}</p>
          </div>

          <div style="margin: 20px 0;">
            <h2 style="color: #333; margin-bottom: 15px;">Ticket Details</h2>
            ${tickets
							.map(
								(ticket) => `
              <div style="background-color: #f8f8f8; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="color: #333; margin: 0 0 10px 0;">${ticket.name}</h3>
                <p><strong>Quantity: </strong> ${ticket.quantity}</p>
                <p><strong>Price per ticket: </strong> $${ticket.price}</p>
                <p><strong>Description: </strong> ${ticket.desc || ''}</p>
              </div>
            `,
							)
							.join("")}
          </div>
          
          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #333; margin: 0;">Total Amount: $${totalAmount}</h3>
          </div>
          
          <div style="background-color: #ffe6e6; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="color: #cc0000; font-weight: bold; margin: 0;">
              Please show this email at the entrance for entry
            </p>
          </div>

          ${isNewUser ? `
          <div style="background-color: #E7F3FF; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #1877F2;">
            <h2 style="color: #1877F2; margin-bottom: 15px;">Your Account Has Been Created!</h2>
            <p style="color: #1C1E21; margin-bottom: 10px;">
              Great news! We've created your Jetzy account. You can now:
            </p>
            <ul style="color: #1C1E21; margin: 10px 0; padding-left: 20px;">
              <li>Access event discussions and interact with other attendees</li>
              <li>Manage your bookings and tickets</li>
              <li>Receive updates about events you're interested in</li>
            </ul>
            <div style="text-align: center; margin-top: 20px;">
              <a href="${process.env.NEXT_PUBLIC_URL || "https://jetzy-events.vercel.app"}/login" style="display: inline-block; background: #1877F2; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 16px;">
                Login to Your Account
              </a>
            </div>
            <p style="color: #65676B; font-size: 14px; margin-top: 15px; text-align: center;">
              Use your email <strong>${email}</strong> and the password you created to login.
            </p>
          </div>
          ` : `
          <div style="text-align: center; margin-top: 20px;">
            <a href="${process.env.NEXT_PUBLIC_URL || "https://jetzy-events.vercel.app"}/login" style="display: inline-block; background: #1877F2; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 16px;">
              Login to Your Account
            </a>
          </div>
          `}

          <p style="margin-top: 30px; text-align: center; color: #666;">
            Welcome to Jetzy! You now have access to exclusive membership benefits.
          </p>
          
          <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #E5E7EB;">
            <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
              Questions? Contact us at <a href="mailto:events@jetzy.com" style="color: #1877F2; text-decoration: none;">events@jetzy.com</a>
            </p>
            <p style="color: #9CA3AF; font-size: 11px; line-height: 1.4; margin: 10px 0 0 0; text-align: center;">
              &copy; ${new Date().getFullYear()} Jetzy Events, Inc.
            </p>
          </div>
        </div>
      `,
		})
		console.log("[sendTicketConfirmation] Email sent successfully to:", email)
		return { success: true, message: "Email sent successfully" }
	} catch (error: any) {
		console.error("[sendTicketConfirmation] Failed to send email:", error.message || error)
		console.error("[sendTicketConfirmation] Error details:", JSON.stringify(error, null, 2))
		throw error
	}
}

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

export const sendTicketConfirmation = async ({ event, firstName, lastName, email, phone, tickets, orderNumber }: TicketEmailData) => {
	// format event start and end time
	const eventTimezone = event.timezone.split(') ')[1]

	const start = dayjs.utc(event.startsOn).tz(eventTimezone)
	const end = dayjs.utc(event.endsOn).tz(eventTimezone)

	const startTimestamp = `${start.format('ddd MMM DD YYYY')} ${start.format('hh:mm A')}`
	const endTimestamp = `${end.format('ddd MMM DD YYYY')} ${end.format('hh:mm A')}`

	const totalAmount = tickets.reduce((sum, ticket) => sum + ticket.price * ticket.quantity, 0)
	const timestamp = `From: ${startTimestamp} To: ${endTimestamp}`
	const location = event.location
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

          <p style="margin-top: 30px; text-align: center; color: #666;">
            Welcome to Jetzy! You now have access to exclusive membership benefits.
          </p>
        </div>
      `,
		})
	} catch (error) {
		console.error("Failed to send email:", error)
		throw error
	}
}

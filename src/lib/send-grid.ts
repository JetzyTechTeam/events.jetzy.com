import { IEvent } from "@/models/events/types"
import sgMail from "@sendgrid/mail"
import { DateTime } from "luxon"

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

export const sendTicketConfirmation = async ({ event, firstName, lastName, email, phone, tickets, orderNumber }: TicketEmailData) => {
	// format event start and end time
	const start = DateTime.fromISO(event.startsOn.toISOString()).setZone("America/New_York")
	const end = DateTime.fromISO(event.endsOn.toISOString()).setZone("America/New_York")
	
	const startTimestamp = `${start.toFormat("EEE MMM dd yyyy")} ${start.toFormat("hh:mm a")}`
	const endTimestamp = `${end.toFormat("EEE MMM dd yyyy")} ${end.toFormat("hh:mm a")}`

	const totalAmount = tickets.reduce((sum, ticket) => sum + ticket.price * ticket.quantity, 0)
	const timestamp = `From: ${startTimestamp} To: ${endTimestamp}`
	const location = event.location
	try {
		await sgMail.send({
			to: email,
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

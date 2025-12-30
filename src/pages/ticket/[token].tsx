import { GetServerSideProps } from "next"
import Head from "next/head"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { EventInvitation } from "@/models/events/event-invitations"
import { extractTokenFromQRPayload } from "@/lib/qr-generator"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import SafeHTML from "@/components/misc/SafeHTML"

dayjs.extend(utc)
dayjs.extend(timezone)

// Helper function to strip HTML tags and decode entities from event names
function stripHTMLAndDecode(text: string): string {
	if (!text) return text
	// First strip all HTML tags
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
		.trim()
}

interface TicketDetailsProps {
	booking: any
	event: any
	ticketDetails: Array<{
		ticketId: string
		name: string
		quantity: number
		price: number
		description: string
	}>
	invitedGuests: Array<{
		email: string
		name: string
		status: string
	}>
	error?: string
}

export default function TicketDetailsPage({ booking, event, ticketDetails, invitedGuests, error }: TicketDetailsProps) {
	if (error || !booking || !event) {
		return (
			<div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '800px', margin: '50px auto', padding: '20px', textAlign: 'center' }}>
				<Head>
					<title>Ticket Not Found - Jetzy Events</title>
				</Head>
				<h1 style={{ color: '#dc3545', marginBottom: '20px' }}>❌ Invalid Ticket</h1>
				<p style={{ color: '#666', fontSize: '18px' }}>{error || "This ticket could not be found or is invalid."}</p>
				<p style={{ color: '#999', marginTop: '20px', fontSize: '14px' }}>
					Please contact support if you believe this is an error.
				</p>
			</div>
		)
	}

	// Format event dates
	// Handle both Date objects and ISO strings
	const eventTimezone = event.timezone?.split(') ')[1] || 'UTC'
	const startsOnDate = event.startsOn instanceof Date ? event.startsOn : new Date(event.startsOn)
	const endsOnDate = event.endsOn instanceof Date ? event.endsOn : new Date(event.endsOn)
	const eventStart = dayjs.utc(startsOnDate).tz(eventTimezone)
	const eventEnd = dayjs.utc(endsOnDate).tz(eventTimezone)

	return (
		<>
			<Head>
				<title>Ticket Details - {stripHTMLAndDecode(event.name)} - Jetzy Events</title>
				<meta name="description" content={`Your ticket for ${stripHTMLAndDecode(event.name)}`} />
			</Head>
			<div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '900px', margin: '0 auto', padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
				{/* Header */}
				<div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '30px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
					<h1 style={{ color: '#333', margin: '0 0 10px 0', fontSize: '28px' }}>🎫 Your Ticket</h1>
					<p style={{ color: '#666', margin: 0, fontSize: '16px' }}>Booking Reference: <strong>{booking.bookingRef}</strong></p>
				</div>

				{/* Event Details */}
				<div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '25px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
					<h2 style={{ color: '#333', marginTop: 0, marginBottom: '20px', fontSize: '22px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>Event Information</h2>
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
						<div>
							<p style={{ color: '#666', margin: '8px 0', fontSize: '14px' }}><strong>Event Name:</strong></p>
							<div style={{ color: '#333', margin: '0 0 15px 0', fontSize: '16px', fontWeight: '500' }}>
								{stripHTMLAndDecode(event.name || "")}
							</div>
						</div>
						<div>
							<p style={{ color: '#666', margin: '8px 0', fontSize: '14px' }}><strong>Date & Time:</strong></p>
							<p style={{ color: '#333', margin: '0 0 15px 0', fontSize: '16px' }}>
								{eventStart.format('ddd, MMM DD, YYYY')}<br />
								{eventStart.format('h:mm A')} - {eventEnd.format('h:mm A')} {eventTimezone}
							</p>
						</div>
						<div>
							<p style={{ color: '#666', margin: '8px 0', fontSize: '14px' }}><strong>Location:</strong></p>
							<p style={{ color: '#333', margin: '0 0 15px 0', fontSize: '16px', fontWeight: '500' }}>{event.location}</p>
						</div>
					</div>
				</div>

				{/* Customer Information */}
				<div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '25px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
					<h2 style={{ color: '#333', marginTop: 0, marginBottom: '20px', fontSize: '22px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>Customer Information</h2>
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
						<div>
							<p style={{ color: '#666', margin: '8px 0', fontSize: '14px' }}><strong>Name:</strong></p>
							<p style={{ color: '#333', margin: 0, fontSize: '16px', fontWeight: '500' }}>{booking.customerName}</p>
						</div>
						<div>
							<p style={{ color: '#666', margin: '8px 0', fontSize: '14px' }}><strong>Email:</strong></p>
							<p style={{ color: '#333', margin: 0, fontSize: '16px' }}>{booking.customerEmail}</p>
						</div>
						{booking.customerPhone && (
							<div>
								<p style={{ color: '#666', margin: '8px 0', fontSize: '14px' }}><strong>Phone:</strong></p>
								<p style={{ color: '#333', margin: 0, fontSize: '16px' }}>{booking.customerPhone}</p>
							</div>
						)}
					</div>
				</div>

				{/* Ticket Details */}
				<div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '25px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
					<h2 style={{ color: '#333', marginTop: 0, marginBottom: '20px', fontSize: '22px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>Ticket Details</h2>
					{ticketDetails.map((ticket, index) => (
						<div key={index} style={{ backgroundColor: '#f8f9fa', borderRadius: '8px', padding: '20px', marginBottom: '15px', borderLeft: '4px solid #1877F2' }}>
							<h3 style={{ color: '#333', margin: '0 0 15px 0', fontSize: '18px', fontWeight: '600' }}>{ticket.name}</h3>
							<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
								<div>
									<p style={{ color: '#666', margin: '5px 0', fontSize: '14px' }}><strong>Quantity:</strong></p>
									<p style={{ color: '#333', margin: 0, fontSize: '16px', fontWeight: '500' }}>{ticket.quantity} {ticket.quantity === 1 ? 'ticket' : 'tickets'}</p>
								</div>
								<div>
									<p style={{ color: '#666', margin: '5px 0', fontSize: '14px' }}><strong>Price per ticket:</strong></p>
									<p style={{ color: '#333', margin: 0, fontSize: '16px', fontWeight: '500' }}>${ticket.price.toFixed(2)}</p>
								</div>
								<div>
									<p style={{ color: '#666', margin: '5px 0', fontSize: '14px' }}><strong>Subtotal:</strong></p>
									<p style={{ color: '#333', margin: 0, fontSize: '16px', fontWeight: '500' }}>${(ticket.price * ticket.quantity).toFixed(2)}</p>
								</div>
							</div>
							{ticket.description && (
								<div style={{ marginTop: '15px' }}>
									<p style={{ color: '#666', margin: '5px 0', fontSize: '14px' }}><strong>Description:</strong></p>
									<p style={{ color: '#333', margin: 0, fontSize: '15px' }}>{ticket.description}</p>
								</div>
							)}
						</div>
					))}
					<div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '2px solid #e2e8f0' }}>
						<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
							<p style={{ color: '#333', margin: 0, fontSize: '18px', fontWeight: '600' }}>Total Amount:</p>
							<p style={{ color: '#1877F2', margin: 0, fontSize: '24px', fontWeight: '700' }}>${booking.total.toFixed(2)}</p>
						</div>
					</div>
				</div>

				{/* Invited Guests */}
				{invitedGuests && invitedGuests.length > 0 && (
					<div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '25px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', borderLeft: '4px solid #1877F2' }}>
						<h2 style={{ color: '#1877F2', marginTop: 0, marginBottom: '20px', fontSize: '22px' }}>👥 Invited Guests</h2>
						<p style={{ color: '#666', marginBottom: '15px', fontSize: '14px' }}>You have invited the following guests to this event:</p>
						<ul style={{ color: '#333', margin: 0, paddingLeft: '20px' }}>
							{invitedGuests.map((guest, index) => (
								<li key={index} style={{ marginBottom: '8px', fontSize: '15px' }}>
									{guest.name || guest.email} {guest.name && <span style={{ color: '#999' }}>({guest.email})</span>}
								</li>
							))}
						</ul>
					</div>
				)}

				{/* Status Badge */}
				<div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '25px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', textAlign: 'center' }}>
					<div style={{ display: 'inline-block', padding: '10px 20px', backgroundColor: booking.status === 'CONFIRMED' ? '#d4edda' : '#fff3cd', borderRadius: '8px' }}>
						<p style={{ color: booking.status === 'CONFIRMED' ? '#155724' : '#856404', margin: 0, fontSize: '16px', fontWeight: '600' }}>
							Status: {booking.status}
						</p>
					</div>
				</div>

				{/* Footer */}
				<div style={{ textAlign: 'center', padding: '20px', color: '#999', fontSize: '14px' }}>
					<p style={{ margin: '5px 0' }}>Questions? Contact us at <a href="mailto:events@jetzy.com" style={{ color: '#1877F2', textDecoration: 'none' }}>events@jetzy.com</a></p>
					<p style={{ margin: '5px 0' }}>&copy; {new Date().getFullYear()} Jetzy Events, Inc.</p>
				</div>
			</div>
		</>
	)
}

export const getServerSideProps: GetServerSideProps = async (context) => {
	try {
		// Ensure database connection
		const { dbconn } = await import("@/configs/database")
		if (dbconn.readyState !== 1) {
			await dbconn.asPromise()
		}

		const { token } = context.params as { token: string }

		if (!token) {
			return {
				props: {
					error: "Token is required"
				}
			}
		}

		// Extract token from QR payload (handles both "JETZY:token" and just "token")
		const extractedToken = extractTokenFromQRPayload(token)

		if (!extractedToken) {
			return {
				props: {
					error: "Invalid ticket token format"
				}
			}
		}

		// Find booking by QR token
		const booking = await Bookings.findOne({
			qrCodeToken: extractedToken,
			isDeleted: false,
		})

		if (!booking) {
			return {
				props: {
					error: "Ticket not found. This ticket may be invalid or has been cancelled."
				}
			}
		}

		// Get event details
		const event = await Events.findById(booking.eventId).populate("tickets")

		if (!event) {
			return {
				props: {
					error: "Event not found"
				}
			}
		}

		// Get detailed ticket information
		const ticketDetails = booking.tickets.map((bookingTicket: any) => {
			const eventTicket = event.tickets?.find((t: any) => t._id.toString() === bookingTicket.ticketId.toString())
			return {
				ticketId: bookingTicket.ticketId.toString(),
				name: eventTicket?.name || "Unknown Ticket",
				quantity: bookingTicket.quantity,
				price: eventTicket?.price || 0,
				description: eventTicket?.desc || "",
			}
		})

		// Get invited guests for this booking (guests invited by this customer for this event)
		// First try to find by customerEmail (new bookings)
		const customerEmailLower = booking.customerEmail.toLowerCase()
		let invitedGuests = await EventInvitation.find({
			eventId: booking.eventId,
			customerEmail: customerEmailLower,
		}).limit(50)
		
		console.log(`[ticket/[token]] Found ${invitedGuests.length} guests with customerEmail: ${customerEmailLower}`)
		
		// If no guests found with customerEmail, try time-based fallback for old bookings
		if (invitedGuests.length === 0) {
			const bookingCreatedAt = (booking as any).createdAt || new Date()
			const fiveMinutesBefore = new Date(bookingCreatedAt.getTime() - 5 * 60 * 1000)
			const fiveMinutesAfter = new Date(bookingCreatedAt.getTime() + 5 * 60 * 1000)
			
			invitedGuests = await EventInvitation.find({
				eventId: booking.eventId,
				$or: [
					{ customerEmail: { $exists: false } }, // Old invitations without customerEmail
					{ customerEmail: null } // Also handle null values
				],
				invitedAt: { $gte: fiveMinutesBefore, $lte: fiveMinutesAfter }
			}).limit(50)
			
			console.log(`[ticket/[token]] Found ${invitedGuests.length} guests using time-based fallback`)
		}

		return {
			props: {
				booking: {
					_id: booking._id.toString(),
					bookingRef: booking.bookingRef,
					customerName: booking.customerName,
					customerEmail: booking.customerEmail,
					customerPhone: booking.customerPhone,
					total: booking.total,
					status: booking.status,
				},
				event: {
					_id: event._id.toString(),
					name: event.name,
					location: event.location,
					startsOn: event.startsOn instanceof Date ? event.startsOn.toISOString() : event.startsOn,
					endsOn: event.endsOn instanceof Date ? event.endsOn.toISOString() : event.endsOn,
					timezone: event.timezone,
				},
				ticketDetails,
				invitedGuests: invitedGuests.map((inv) => ({
					email: inv.email,
					name: inv.name || "",
					status: inv.status,
				})),
			}
		}
	} catch (error: any) {
		console.error("[ticket/[token]] Error:", error)
		return {
			props: {
				error: "An error occurred while loading ticket details"
			}
		}
	}
}

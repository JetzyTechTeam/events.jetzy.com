'use client'
import { Error } from "@/lib/_toaster"
import { eventPath } from "@/lib/event-slug"
import { buildTicketPricing } from "@/lib/ticket-pricing"
import axios from "axios"
import { useRouter } from "next/router"
import React, { useMemo } from "react"
import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

type OrderItem = {
	id: number
	name: string
	price: number
	quantity: number
	isSelected: boolean
	priceId: string;
}

type IEvent = {
	name: string
	location: string
	venueName?: string
	startsOn: string
	hasStartTime?: boolean
	timezone: string
	slug: string
	coordinates?: {
		long: number
		lat: number
		placeId: string
	}
}

const CheckoutSuccessPage: React.FC = () => {
	const router = useRouter()
	const query = router.query
	const [orderItems, setOrderItems] = React.useState<Array<OrderItem>>([])
	const [sessionData, setSessionData] = React.useState<any>(null)
	const [isLoading, setIsLoading] = React.useState(true)
	const [eventData, setEventData] = React.useState<IEvent | null>(null)
	// Approval orders authorize the card instead of charging it, so Stripe reports the
	// session as "unpaid". That is success, not failure — this flag switches the page copy.
	const [pendingApproval, setPendingApproval] = React.useState(false)
	const [holdExpiresAt, setHoldExpiresAt] = React.useState<string | null>(null)

	let { payload, session_id, event } = query
	// Set by checkout's success_url for approval orders, so the page can pick its copy
	// even before the confirm call returns.
	const approvalFlag = query.approval

	const parsedEvent: IEvent | null = event
		? JSON.parse(event as string)
		: null


	const { formattedDate, formattedTime } = useMemo(() => {
		if (!parsedEvent?.startsOn) return { formattedDate: '', formattedTime: '' }

		const userTimeZone = parsedEvent.timezone?.split(') ')[1]
		const date = dayjs.utc(parsedEvent.startsOn).tz(userTimeZone)

		const formattedDate = date.format('MMMM DD, YYYY')
		const formattedTime = parsedEvent?.hasStartTime !== false ? date.format('hh:mm A') : ''

		return { formattedDate, formattedTime }
	}, [parsedEvent])

	React.useEffect(() => {
		if (payload) {
			const items = JSON.parse(payload as string) as OrderItem[]
			setOrderItems(items)
			setIsLoading(false)
		}
	}, [payload])

	React.useEffect(() => {
		const checkPaymentStatus = async () => {
			if (session_id) {
				try {
					const response = await axios.get(`/api/checkout/confirm?session_id=${session_id}`)
					const { session, event: freshEvent, booking, requiresApproval } = response.data
					setSessionData(session)

					const isApproval = approvalFlag === "1" || requiresApproval === true || session?.metadata?.requiresApproval === "true"
					setPendingApproval(isApproval)
					if (booking?.payment?.authExpiresAt) setHoldExpiresAt(booking.payment.authExpiresAt)

					// Only a genuinely failed payment is an error. An approval hold leaves the
					// session "unpaid" on purpose.
					if (session.payment_status !== "paid" && !isApproval) {
						Error("Payment Error", "Your payment was not successful. Please try again.")
						return
					}

					// If we have session data but no payload, fetch the booking details
					if (!payload && session.metadata) {
						try {
							const tickets = JSON.parse(session.metadata.tickets)
							const eventDetails = freshEvent || JSON.parse(session.metadata.eventDetails)

							// Convert tickets to OrderItem format
							const items = tickets.map((ticket: any) => ({
								id: ticket.id,
								name: ticket.name,
								price: ticket.price,
								quantity: ticket.quantity,
								isSelected: true,
								priceId: ticket.priceId
							}))

							setOrderItems(items)
							setEventData(eventDetails)
						} catch (error) {
							console.error("Error parsing session metadata:", error)
						}
					}

				} catch (error) {
					console.error("Error checking payment status:", error)
					Error("Error", "Unable to verify payment. Please contact support.")
				} finally {
					setIsLoading(false)
				}
			} else {
				setIsLoading(false)
			}
		}

		checkPaymentStatus()
	}, [session_id, payload, approvalFlag])

	// Show loading state
	if (isLoading) {
		return (
			<div className="min-h-screen bg-[#0A0B0F] flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F79432] mx-auto mb-4"></div>
					<p className="text-white">Verifying your payment...</p>
				</div>
			</div>
		)
	}

	// Show error if no session_id and no payload
	if (!session_id && !payload) {
		return (
			<div className="min-h-screen bg-[#0A0B0F] flex items-center justify-center">
				<div className="text-center">
					<h1 className="text-2xl font-bold text-white mb-4">Invalid Access</h1>
					<p className="text-gray-300 mb-6">This page can only be accessed after a successful payment.</p>
					<button
						onClick={() => router.push('/')}
						className="bg-[#F79432] text-white px-6 py-3 rounded-full hover:bg-orange-600 transition-colors"
					>
						Go to Home
					</button>
				</div>
			</div>
		)
	}
	// calculate the totals of the order (account for referral discount)
	const subtotal = orderItems.reduce((acc, item) => {
		return acc + item.price * item.quantity
	}, 0)
	// The TICKET total. On a bundled order (a ticket that sells Jetzy Premium) the session is
	// `mode: "subscription"` and `amount_total` is the whole first invoice — ticket plus the
	// first month of membership — so using it here would overstate what the ticket cost.
	// Checkout stamps the ticket-only figure into metadata for exactly this reason; the
	// `amount_total` fallback covers sessions created before that.
	const metaTicketTotal = parseFloat(sessionData?.metadata?.ticketTotal ?? "")
	const finalTotal = Number.isFinite(metaTicketTotal)
		? metaTicketTotal
		: (typeof sessionData?.amount_total === "number" ? sessionData.amount_total / 100 : subtotal)
	const referralCode: string | undefined = sessionData?.metadata?.referralCode
	// Present only when this purchase also started a membership (bundled ticket, non-member).
	const metaPremiumAmount = parseFloat(sessionData?.metadata?.premiumAmount ?? "") || 0

	// Split the discount into its Premium and referral parts. Checkout writes the two
	// rates separately (`referralDiscountPercentage` / `premiumMemberDiscountPercentage`);
	// the old code read a `discountPercentage` key that is no longer written, so the
	// percentage silently vanished and a Premium-only saving showed as a bare "Discount".
	// Same helper as the checkout form and the confirmation email, with Stripe's total
	// authoritative — it reconciles any rounding drift into the last line.
	const pricing = buildTicketPricing({
		subtotal,
		referralCode,
		referralPercentage: parseFloat(sessionData?.metadata?.referralDiscountPercentage ?? "0"),
		premiumPercentage: parseFloat(sessionData?.metadata?.premiumMemberDiscountPercentage ?? "0"),
		total: finalTotal,
		combinedDiscountAmount: Math.max(0, subtotal - finalTotal),
		// A bundled ticket also started a Jetzy Premium membership. Stamped into metadata at
		// checkout rather than derived here: `amount_total` is the combined first invoice, and
		// subtracting the ticket total would silently absorb any proration or rounding.
		...(metaPremiumAmount > 0
			? {
				recurring: {
					label: "Jetzy Premium membership",
					amount: metaPremiumAmount,
					interval: sessionData?.metadata?.premiumInterval || "month",
				},
			}
			: {}),
	})

	const displayEvent = eventData || parsedEvent
	let displayLocation = eventData?.location || parsedEvent?.location

	// Fallback to venueName if location is still hidden or disclosed
	const locationLower = (displayLocation || "").toLowerCase();
	if ((!displayLocation || 
	     locationLower.includes("disclosed") || 
	     locationLower.includes("location hidden")) && 
	    displayEvent?.venueName) {
		displayLocation = displayEvent.venueName;
	}

	return (
		<div className="min-h-screen bg-[#0A0B0F] py-8 px-4 sm:px-6 lg:px-8">
			<div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all">
				<div className="p-6 sm:p-8 text-center">
					<div className="mb-6">
						{pendingApproval ? (
							<svg className="w-16 h-16 mx-auto text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
						) : (
							<svg className="w-16 h-16 mx-auto text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
							</svg>
						)}
					</div>

					{pendingApproval ? (
						<>
							<h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-4">Request Submitted — Pending Approval</h1>
							<div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-left">
								<p className="text-amber-900 font-semibold mb-1">You have not been charged.</p>
								<p className="text-gray-700 text-sm">
									We&apos;ve placed a temporary hold of{" "}
									<strong>
										{((sessionData?.amount_total ?? 0) / 100).toLocaleString("en-US", { style: "currency", currency: "usd" })}
									</strong>{" "}
									on your card. If the host approves your request
									{holdExpiresAt ? <> by <strong>{dayjs(holdExpiresAt).format("MMMM D, YYYY")}</strong></> : null}, your card will
									be charged and your ticket emailed to you. If your request is declined — or the host doesn&apos;t respond in
									time — the hold is released automatically and you are not charged.
								</p>
								<p className="text-gray-500 text-xs mt-2">
									Depending on your bank, a released hold can take 5&ndash;10 business days to disappear from your statement.
								</p>
							</div>
						</>
					) : (
						<>
							<h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-4">Thank You for Your Purchase!</h1>
							<p className="text-gray-600 mb-6">Your payment was successful.</p>
						</>
					)}

					<div className="bg-gray-50 p-6 rounded-lg text-left">
						<h2 className="text-xl font-bold text-gray-800 mb-4">{pendingApproval ? "Request Summary" : "Order Summary"}</h2>

						{/* Event Info */}
						{displayEvent && (
							<div className="mb-6 space-y-1">
								<p className="text-gray-700 break-words overflow-wrap-anywhere"><strong>Event:</strong> {displayEvent.name}</p>
								<p className="text-gray-700 break-words overflow-wrap-anywhere"><strong>Venue:</strong> {displayLocation}</p>
								<p className="text-gray-700 break-words overflow-wrap-anywhere">
									<strong>Date & Time:</strong>{" "}
									{formattedDate}{formattedTime ? <>&nbsp;{formattedTime}</> : null}
									{(displayEvent.timezone) ? ` (${displayEvent.timezone})` : ""}
								</p>
								{/* Get Directions Link */}
								{(displayEvent?.coordinates?.lat && displayEvent?.coordinates?.long) && (
									<a
										href={`https://www.google.com/maps/search/?api=1&query=${displayEvent.coordinates.lat},${displayEvent.coordinates.long}`}
										target="_blank"
										rel="noopener noreferrer"
										className="text-[#F79432] hover:underline text-sm font-semibold inline-flex items-center gap-1 mt-2"
									>
										<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
										</svg>
										Get Directions
									</a>
								)}
							</div>
						)}

						{/* Tickets */}
						<div className="space-y-3">
							{orderItems.map((item) => (
								<div key={item.id} className="flex justify-between">
									<span className="text-gray-600">{item.quantity} {item.name} ticket(s)</span>
									<span className="text-gray-800 font-semibold">${(item.price * item.quantity).toFixed(2)}</span>
								</div>
							))}

							{pricing.lines.length > 0 && (
								<>
									<div className="flex justify-between border-t pt-3">
										<span className="text-gray-600">Subtotal</span>
										<span className="text-gray-800">${pricing.subtotal.toFixed(2)}</span>
									</div>
									{pricing.lines.map((line) => (
										<div key={line.label} className="flex justify-between text-green-600">
											<span>{line.label}</span>
											<span>-${line.amount.toFixed(2)}</span>
										</div>
									))}
								</>
							)}
							<div className="flex justify-between border-t pt-3">
								<span className="text-gray-800 font-bold">
									{pendingApproval ? "Amount on hold" : pricing.recurring ? "Ticket total" : "Total"}
								</span>
								<span className={`font-bold ${pendingApproval ? "text-amber-600" : "text-gray-800"}`}>${finalTotal.toFixed(2)}</span>
							</div>

							{/* The membership is charged alongside the ticket but is not part of the
							    ticket total, and unlike everything else here it repeats — so it gets
							    its own row, its own "charged today", and the renewal terms. */}
							{pricing.recurring && (
								<>
									<div className="flex justify-between" style={{ color: "#B7860B" }}>
										<span>{pricing.recurring.label}</span>
										<span>${pricing.recurring.amount.toFixed(2)}/{pricing.recurring.interval}</span>
									</div>
									<div className="flex justify-between border-t pt-3">
										<span className="text-gray-800 font-bold">Charged today</span>
										<span className="font-bold text-gray-800">${(pricing.dueToday ?? finalTotal).toFixed(2)}</span>
									</div>
									<div className="mt-3 rounded-lg p-3" style={{ background: "rgba(245,197,24,0.12)", border: "1px solid rgba(245,197,24,0.4)" }}>
										<p className="text-sm font-semibold" style={{ color: "#8A6D0B" }}>Your Jetzy Premium membership is active</p>
										<p className="text-xs text-gray-600 mt-1">
											It renews at ${pricing.recurring.amount.toFixed(2)} every {pricing.recurring.interval} until you cancel.
											You can cancel any time from <strong>Manage membership</strong> in your account menu.
										</p>
									</div>
								</>
							)}

							{pendingApproval && (
								<p className="text-xs text-gray-500 pt-1">Not charged yet — only captured if the host approves.</p>
							)}
						</div>
					</div>

					<button
						onClick={() => router.replace(displayEvent?.slug ? eventPath(displayEvent.slug) : "/")}
						className="mt-6 bg-[#F79432] text-white px-6 py-3 rounded-full hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg"
					>
						Back to Event
					</button>
				</div>
			</div>
		</div>
	)
}

export default CheckoutSuccessPage

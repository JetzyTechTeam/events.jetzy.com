'use client'
import { Error } from "@/lib/_toaster"
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
	startsOn: string
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

	let { payload, session_id, event } = query

	const parsedEvent: IEvent | null = event
		? JSON.parse(event as string)
		: null


	const { formattedDate, formattedTime } = useMemo(() => {
		if (!parsedEvent?.startsOn) return { formattedDate: '', formattedTime: '' }

		const userTimeZone = parsedEvent.timezone?.split(') ')[1]
		const date = dayjs.utc(parsedEvent.startsOn).tz(userTimeZone)

		const formattedDate = date.format('MMMM DD, YYYY')
		const formattedTime = date.format('hh:mm A')

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
					const { session, event: freshEvent } = response.data
					setSessionData(session)

					if (session.payment_status !== "paid") {
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
	}, [session_id, payload])

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
	// calculate the total of the order
	const total = orderItems.reduce((acc, item) => {
		return acc + item.price * item.quantity
	}, 0)

	const displayEvent = eventData || parsedEvent
	const displayLocation = eventData?.location || parsedEvent?.location

	return (
		<div className="min-h-screen bg-[#0A0B0F] py-8 px-4 sm:px-6 lg:px-8">
			<div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all">
				<div className="p-6 sm:p-8 text-center">
					<div className="mb-6">
						<svg className="w-16 h-16 mx-auto text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
						</svg>
					</div>

					<h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-4">Thank You for Your Purchase!</h1>
					<p className="text-gray-600 mb-6">Your payment was successful.</p>

					<div className="bg-gray-50 p-6 rounded-lg text-left">
						<h2 className="text-xl font-bold text-gray-800 mb-4">Order Summary</h2>

						{/* Event Info */}
						{displayEvent && (
							<div className="mb-6 space-y-1">
								<p className="text-gray-700 break-words overflow-wrap-anywhere"><strong>Event:</strong> {displayEvent.name}</p>
								<p className="text-gray-700 break-words overflow-wrap-anywhere"><strong>Venue:</strong> {displayLocation}</p>
								<p className="text-gray-700 break-words overflow-wrap-anywhere">
									<strong>Date & Time:</strong>{" "}
									{formattedDate}&nbsp;{formattedTime}
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

							<div className="flex justify-between border-t pt-3">
								<span className="text-gray-800 font-bold">Total</span>
								<span className="text-gray-800 font-bold">${total?.toFixed(2)}</span>
							</div>
						</div>
					</div>

					<button
						onClick={() => router.push(`/${displayEvent?.slug || ''}`)}
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

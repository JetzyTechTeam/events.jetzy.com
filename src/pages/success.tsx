"use client"
import { Error } from "@/lib/_toaster"
import axios from "axios"
import Head from "next/head"
import { useRouter } from "next/router"
import React, { useMemo } from "react"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import LightNavbar from "@/components/layout/LightNavbar"
import Footer from "@/components/layout/Footer"
import SafeHTML from "@/components/misc/SafeHTML"

dayjs.extend(utc)
dayjs.extend(timezone)

type OrderItem = {
	id: number
	name: string
	price: number
	quantity: number
	isSelected: boolean
	priceId: string
}

type IEvent = {
	name: string
	location: string
	startsOn: string
	timezone: string
	slug: string
}

const CheckoutSuccessPage: React.FC = () => {
	const router = useRouter()
	const query = router.query
	const [orderItems, setOrderItems] = React.useState<Array<OrderItem>>([])
	const [sessionData, setSessionData] = React.useState<any>(null)
	const [isLoading, setIsLoading] = React.useState(true)
	const [eventData, setEventData] = React.useState<IEvent | null>(null)
	const [referralCode, setReferralCode] = React.useState<string | null>(null)
	const [discountAmount, setDiscountAmount] = React.useState<number>(0)
	const [discountPercentage, setDiscountPercentage] = React.useState<number | null>(null)
	const [ticketToken, setTicketToken] = React.useState<string | null>(null)
	const [paymentVerified, setPaymentVerified] = React.useState(false)
	const [verificationFailed, setVerificationFailed] = React.useState(false)

	let { payload, session_id, event } = query

	const parsedEvent: IEvent | null = event ? JSON.parse(event as string) : null

	// Use eventData if parsedEvent is not available (when coming from session_id)
	const eventForFormatting = parsedEvent || eventData

	const { formattedDate, formattedTime } = useMemo(() => {
		if (!eventForFormatting?.startsOn) return { formattedDate: "", formattedTime: "" }

		const timezoneStr = eventForFormatting.timezone || ""
		// Extract timezone from format like "(UTC-05:00) America/New_York" or just "America/New_York"
		const userTimeZone = timezoneStr.includes(") ") 
			? timezoneStr.split(") ")[1] 
			: timezoneStr || "UTC"
		
		try {
			const date = dayjs.utc(eventForFormatting.startsOn).tz(userTimeZone)
			const formattedDate = date.format("MMMM DD, YYYY")
			const formattedTime = date.format("hh:mm A")
			return { formattedDate, formattedTime }
		} catch (error) {
			console.error("Error formatting date:", error)
			return { formattedDate: "", formattedTime: "" }
		}
	}, [eventForFormatting])

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
					
					// Verify response status is 200
					if (response.status !== 200) {
						console.error("[success] Non-200 response status:", response.status)
						setIsLoading(false)
						const errorMessage = response.data?.message || "Your payment was not successful. Please try again."
						Error("Payment Error", errorMessage)
						router.replace(`/cancel?session_id=${session_id}`)
						return
					}

					// The API returns the Stripe session object directly
					const session = response.data
					
					// Verify payment status is actually "paid"
					// Note: The API returns the full Stripe session object, so payment_status is on the session
					if (!session || session.payment_status !== "paid") {
						console.error("[success] Payment not paid. Status:", session?.payment_status)
						setIsLoading(false)
						const errorMessage = session?.message || "Your payment was not successful. Please try again."
						Error("Payment Error", errorMessage)
						router.replace(`/cancel?session_id=${session_id}`)
						return
					}

					// Payment is verified
					console.log("[success] Payment verified successfully. Status:", session.payment_status)
					setSessionData(session)
					setPaymentVerified(true)

					// Fetch booking to get ticket token (with retry logic for webhook timing)
					const fetchBooking = async (retries = 3, delay = 1000) => {
						for (let i = 0; i < retries; i++) {
							try {
								const bookingResponse = await axios.get(`/api/bookings/by-session?session_id=${session_id}`)
								if (bookingResponse.data?.status && bookingResponse.data?.data?.qrCodeToken) {
									setTicketToken(bookingResponse.data.data.qrCodeToken)
									return
								}
							} catch (bookingError: any) {
								if (bookingError?.response?.status === 404) {
									if (i === retries - 1) {
										console.warn("[success] Booking not found after retries. This may be normal if the webhook hasn't processed yet.")
										// Don't fail the page if booking fetch fails - booking might be created by webhook later
									} else {
										console.log(`[success] Booking not found yet, retrying in ${delay}ms... (attempt ${i + 1}/${retries})`)
										await new Promise(resolve => setTimeout(resolve, delay))
									}
								} else {
									console.error("[success] Error fetching booking:", bookingError?.response?.data || bookingError?.message)
									if (i === retries - 1) {
										// Don't fail the page if booking fetch fails
									} else {
										await new Promise(resolve => setTimeout(resolve, delay))
									}
								}
							}
						}
					}
					await fetchBooking()

					// Extract referral code and discount from session metadata
					if (session.metadata?.referralCode) {
						setReferralCode(session.metadata.referralCode)
						if (session.metadata.discountPercentage) {
							const discountPercent = parseFloat(session.metadata.discountPercentage)
							setDiscountPercentage(discountPercent)
						}
					}

					// If we have session data but no payload, fetch the booking details
					if (!payload && session.metadata) {
						try {
							const tickets = JSON.parse(session.metadata.tickets)
							const eventDetails = JSON.parse(session.metadata.eventDetails)

							// Convert tickets to OrderItem format
							const items = tickets.map((ticket: any) => ({
								id: ticket.id,
								name: ticket.name,
								price: ticket.price,
								quantity: ticket.quantity,
								isSelected: true,
								priceId: ticket.priceId,
							}))

							setOrderItems(items)
							setEventData(eventDetails)

							// Calculate discount amount from subtotal if we have referral code
							if (session.metadata.referralCode && session.metadata.discountPercentage) {
								const subtotal = items.reduce((acc: number, item: any) => acc + item.price * item.quantity, 0)
								const discountPercent = parseFloat(session.metadata.discountPercentage)
								const discount = Math.round((subtotal * (discountPercent / 100) + Number.EPSILON) * 100) / 100
								setDiscountAmount(discount)
							}
						} catch (error) {
							console.error("Error parsing session metadata:", error)
						}
					} else if (session.metadata?.referralCode && session.metadata?.discountPercentage && orderItems.length > 0) {
						// Calculate discount amount from current order items if we have payload
						const subtotal = orderItems.reduce((acc: number, item: OrderItem) => acc + item.price * item.quantity, 0)
						const discountPercent = parseFloat(session.metadata.discountPercentage)
						const discount = Math.round((subtotal * (discountPercent / 100) + Number.EPSILON) * 100) / 100
						setDiscountAmount(discount)
					}
				} catch (error: any) {
					console.error("[success] Error checking payment status:", error)
					
					// If it's a 400 error, it means payment failed - redirect to cancel immediately
					if (error.response?.status === 400) {
						const errorMessage = error.response?.data?.message || "Your payment was not successful. Please try again."
						console.log("[success] Payment verification failed (400). Redirecting to cancel page.")
						setIsLoading(false)
						setVerificationFailed(true)
						Error("Payment Error", errorMessage)
						router.replace(`/cancel?session_id=${session_id}`)
						return
					}
					
					// For other errors (network, server, etc.), retry once after a delay
					// This handles cases where the Stripe webhook hasn't processed yet or there's a temporary network issue
					console.log("[success] Non-400 error. Retrying payment verification in 2 seconds...")
					setTimeout(async () => {
						try {
							const retryResponse = await axios.get(`/api/checkout/confirm?session_id=${session_id}`)
							if (retryResponse.status === 200 && retryResponse.data?.payment_status === "paid") {
								console.log("[success] Payment verified on retry")
								const session = retryResponse.data
								setSessionData(session)
								setPaymentVerified(true)
								setIsLoading(false)
							} else {
								console.error("[success] Payment still not verified on retry")
								setIsLoading(false)
								setVerificationFailed(true)
								const errorMessage = retryResponse.data?.message || "Your payment verification is taking longer than expected. Please check your email or contact support."
								Error("Verification Error", errorMessage)
							}
						} catch (retryError: any) {
							console.error("[success] Retry also failed:", retryError)
							setIsLoading(false)
							if (retryError.response?.status === 400) {
								setVerificationFailed(true)
								const errorMessage = retryError.response?.data?.message || "Your payment was not successful. Please try again."
								Error("Payment Error", errorMessage)
								router.replace(`/cancel?session_id=${session_id}`)
							} else {
								setVerificationFailed(true)
								const errorMessage = retryError.response?.data?.message || retryError.message || "An error occurred while verifying your payment. Please contact support."
								Error("Verification Error", errorMessage)
							}
						}
					}, 2000)
				} finally {
					// Only set loading to false if we're not retrying
					// The retry mechanism will handle setting loading to false
					if (!session_id || paymentVerified || verificationFailed) {
						setIsLoading(false)
					}
				}
			} else {
				setIsLoading(false)
			}
		}

		checkPaymentStatus()
	}, [session_id, payload])

	// calculate the subtotal and total of the order (must be before conditional returns)
	const subtotal = React.useMemo(() => {
		return orderItems.reduce((acc, item) => {
			return acc + item.price * item.quantity
		}, 0)
	}, [orderItems])
	const finalTotal = discountAmount > 0 ? subtotal - discountAmount : subtotal

	// Show loading state
	if (isLoading) {
		return (
			<div className="min-h-screen bg-background-light flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-4 border-primary-purple mx-auto mb-4"></div>
					<p className="text-text-primary font-medium">Verifying your payment...</p>
				</div>
			</div>
		)
	}

	// Don't show success page if payment verification failed (when session_id exists)
	// Only show error if we've explicitly determined payment failed (not just loading)
	if (session_id && !paymentVerified && !isLoading && verificationFailed) {
		// Payment verification failed - redirect should have happened, but show error state
		return (
			<div className="min-h-screen bg-background-light flex items-center justify-center p-4">
				<div className="text-center bg-white rounded-2xl shadow-lg p-8 max-w-md">
					<div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
						<svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<h1 className="text-2xl font-bold text-text-primary mb-4">Payment Verification Failed</h1>
					<p className="text-text-secondary mb-4">Your payment could not be verified. Please try again.</p>
					<button onClick={() => router.push("/")} className="bg-primary-purple text-white px-8 py-3 rounded-lg hover:bg-primary-dark transition-colors font-semibold shadow-md">
						Go to Home
					</button>
				</div>
			</div>
		)
	}

	// Show error if no session_id and no payload
	if (!session_id && !payload) {
		return (
			<div className="min-h-screen bg-background-light flex items-center justify-center p-4">
				<div className="text-center bg-white rounded-2xl shadow-lg p-8 max-w-md">
					<div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
						<svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<h1 className="text-2xl font-bold text-text-primary mb-4">Invalid Request</h1>
					<p className="text-text-secondary mb-4">No session ID or payment data found.</p>
						<div className="text-left bg-gray-50 p-4 rounded-lg mb-6 text-sm">
							<p className="mb-2"><strong>Option 1:</strong> Create test booking via API:</p>
							<code className="block bg-gray-200 p-2 rounded mb-4 text-xs break-all">
								POST /api/test/create-test-booking
							</code>
							<p className="mb-2"><strong>Option 2:</strong> Complete a purchase to get session_id</p>
							<p className="mb-2"><strong>Option 3:</strong> Use existing booking with session_id in URL</p>
						</div>
						<button onClick={() => router.push("/")} className="bg-primary-purple text-white px-8 py-3 rounded-lg hover:bg-primary-dark transition-colors font-semibold shadow-md">
							Go to Home
						</button>
					</div>
				</div>
			)
		}

	return (
		<>
			<Head>
				<title>Payment Success - Jetzy Events</title>
				<meta name="description" content="Your payment was successful! Thank you for booking with Jetzy Events." />
				<meta name="robots" content="noindex, nofollow" />
			</Head>

			{/* Navbar */}
			<LightNavbar />

			<div className="min-h-screen bg-background-light py-12 px-4 sm:px-6 lg:px-8">
				<div className="max-w-3xl mx-auto">
					{/* Success Card */}
					<div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-border-light">
						{/* Header Section */}
						<div className="bg-gradient-to-r from-primary-purple to-primary-dark p-8 text-center">
							<div className="w-20 h-20 mx-auto mb-4 bg-white rounded-full flex items-center justify-center">
								<svg className="w-12 h-12 text-primary-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
								</svg>
							</div>
							<h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Registration Successful!</h1>
							<p className="text-white/90 text-lg">Your payment has been processed successfully</p>
						</div>

						{/* Content Section */}
						<div className="p-6 sm:p-8">
							{/* Confirmation Message */}
							<div className="bg-primary-purple/10 border border-primary-purple/20 rounded-xl p-5 mb-6">
								<p className="text-text-primary text-center">
									<strong>A confirmation email has been sent to your inbox</strong>
									<br />
									<span className="text-text-secondary text-sm">Please check your email for event details and tickets</span>
								</p>
							</div>

							{/* Event Information */}
							{(event || eventData) && (
								<div className="mb-6 bg-background-gray rounded-xl p-5 space-y-3">
									<h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
										<svg className="w-6 h-6 text-primary-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
										</svg>
										Event Details
									</h2>
									<div className="space-y-2">
										<div className="flex items-start gap-3">
											<span className="text-text-muted text-sm font-medium min-w-[80px]">Event:</span>
											<span className="text-text-primary font-semibold flex-1">
												<SafeHTML html={parsedEvent?.name || eventData?.name || ""} />
											</span>
										</div>
										<div className="flex items-start gap-3">
											<span className="text-text-muted text-sm font-medium min-w-[80px]">Location:</span>
											<span className="text-text-primary flex-1">{parsedEvent?.location || eventData?.location}</span>
										</div>
										<div className="flex items-start gap-3">
											<span className="text-text-muted text-sm font-medium min-w-[80px]">Date:</span>
											<span className="text-text-primary flex-1">{formattedDate || "—"}</span>
										</div>
											<div className="flex items-start gap-3">
												<span className="text-text-muted text-sm font-medium min-w-[80px]">Time:</span>
												<span className="text-text-primary flex-1">
													{formattedTime || "—"}
													{eventForFormatting?.timezone && formattedTime ? (
														<span className="text-text-muted text-sm ml-2">
															({eventForFormatting.timezone.includes(") ") 
																? eventForFormatting.timezone.split(") ")[1] 
																: eventForFormatting.timezone})
														</span>
													) : ""}
												</span>
											</div>
									</div>
								</div>
							)}

							{/* Order Summary */}
							<div className="bg-background-gray rounded-xl p-5">
								<h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
									<svg className="w-6 h-6 text-primary-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth="2"
											d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
										/>
									</svg>
									Ticket Summary
								</h2>

								{/* Tickets List */}
								<div className="space-y-3 mb-4">
									{orderItems.map((item) => (
										<div key={item.id} className="flex justify-between items-center py-2 border-b border-border-light last:border-0">
											<div>
												<p className="text-text-primary font-medium">{item.name}</p>
												<p className="text-text-muted text-sm">Quantity: {item.quantity}</p>
											</div>
											<span className="text-text-primary font-bold text-lg">${(item.price * item.quantity).toFixed(2)}</span>
										</div>
									))}
								</div>

								{/* Discount Information */}
								{referralCode && discountAmount > 0 && (
									<div className="space-y-2 pt-4 border-t border-border-light">
										<div className="flex justify-between items-center">
											<span className="text-text-primary font-medium">Subtotal</span>
											<span className="text-text-primary font-semibold">${subtotal.toFixed(2)}</span>
										</div>
										<div className="flex justify-between items-center bg-green-50 p-3 rounded-lg border border-green-200">
											<div>
												<span className="text-green-700 font-medium">Referral Code: </span>
												<span className="text-green-900 font-bold">{referralCode}</span>
												{discountPercentage && (
													<span className="text-green-600 text-sm ml-2">({discountPercentage}% off)</span>
												)}
											</div>
											<span className="text-green-700 font-bold">-${discountAmount.toFixed(2)}</span>
										</div>
									</div>
								)}

								{/* Total */}
								<div className="flex justify-between items-center pt-4 border-t-2 border-primary-purple/30">
									<span className="text-text-primary font-bold text-lg">Total Amount</span>
									<span className="text-primary-purple font-bold text-2xl">${finalTotal.toFixed(2)}</span>
								</div>
							</div>

							{/* Action Buttons */}
							<div className="mt-8 flex flex-col sm:flex-row gap-4">
								{ticketToken && (
									<button
										onClick={() => router.push(`/ticket/${ticketToken}`)}
										className="flex-1 bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold px-6 py-3.5 rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
									>
										<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
										</svg>
										View Your Ticket
									</button>
								)}
								<button
									onClick={() => router.push("/my-tickets")}
									className="flex-1 bg-blue-500 text-white font-semibold px-6 py-3.5 rounded-lg hover:bg-blue-600 transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
								>
									<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
									</svg>
									My Tickets
								</button>
								<button
									onClick={() => router.push(`/${parsedEvent?.slug || eventData?.slug || ""}`)}
									className="flex-1 bg-primary-purple text-white font-semibold px-6 py-3.5 rounded-lg hover:bg-primary-dark transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
								>
									<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
									</svg>
									Back to Event
								</button>
								<button
									onClick={() => router.push("/")}
									className="flex-1 bg-white text-primary-purple border-2 border-primary-purple font-semibold px-6 py-3.5 rounded-lg hover:bg-primary-purple hover:text-white transition-all duration-200 shadow-md hover:shadow-lg"
								>
									Browse More Events
								</button>
							</div>

							{/* Additional Info */}
							<div className="mt-6 text-center">
								<p className="text-text-muted text-sm">
									Need help? Contact us at{" "}
									<a href="mailto:support@jetzy.com" className="text-primary-purple font-medium hover:text-primary-dark">
										support@jetzy.com
									</a>
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Footer */}
			<Footer />
		</>
	)
}

export default CheckoutSuccessPage

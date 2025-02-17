import { sendEmailAction } from "@Jetzy/actions/send-email-action"
import axios from "axios"
import { useRouter } from "next/router"
import React from "react"
import Stripe from "stripe"

type OrderItem = {
	id: number
	name: string
	price: number
	quantity: number
	isSelected: boolean
}

const CheckoutSuccessPage: React.FC = () => {
	const router = useRouter()
	const query = router.query
	const [orderItems, setOrderItems] = React.useState<Array<OrderItem>>([])

	const { payload, session_id } = query

	React.useEffect(() => {
		if (payload) {
			const items = JSON.parse(payload as string) as OrderItem[]
			setOrderItems(items)
		}
	}, [payload])

	React.useEffect(() => {
		const checkPaymentStatus = async () => {
			if (session_id) {
				try {
					const response = await axios.get(`/api/get-session?session_id=${session_id}`)
					const session = response.data

					if (session.payment_status === "paid" && session.metadata && session.client_reference_id) {
						// Use the API route to send the email
						await axios.post("/api/send-email", {
							firstName: session.metadata.firstName,
							lastName: session.metadata.lastName,
							email: session.metadata.email,
							phone: session.metadata.phone,
							tickets: JSON.parse(session.metadata.tickets),
							orderNumber: session.client_reference_id,
						})
					}
				} catch (error) {
					console.error("Error checking payment status:", error)
				}
			}
		}

		checkPaymentStatus()
	}, [session_id])

	if (!payload) return null
	// calculate the total of the order
	const total = orderItems.reduce((acc, item) => {
		return acc + item.price * item.quantity
	}, 0)

	return (
		<div className="min-h-screen bg-gradient-to-br from-purple-900 to-indigo-900 py-8 px-4 sm:px-6 lg:px-8">
			{/* Main Container */}
			<div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all ">
				{/* Content Section */}
				<div className="p-6 sm:p-8 text-center">
					{/* Success Icon */}
					<div className="mb-6">
						<svg className="w-16 h-16 mx-auto text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
						</svg>
					</div>

					{/* Success Message */}
					<h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-4">Thank You for Your Purchase!</h1>
					<p className="text-gray-600 mb-6">
						Your payment was successful.
						{/* You will receive a confirmation email shortly. */}
					</p>

					{/* Order Summary */}
					<div className="bg-gray-50 p-6 rounded-lg text-left">
						<h2 className="text-xl font-bold text-gray-800 mb-4">Order Summary</h2>
						<div className="space-y-3">
							{orderItems.map((item) => (
								<div key={item.id} className="flex justify-between">
									<span className="text-gray-600">
										{item?.quantity} {item.name} ticket(s)
									</span>
									<span className="text-gray-800 font-semibold">${(item.price * item.quantity).toFixed(2)}</span>
								</div>
							))}

							<div className="flex justify-between border-t pt-3">
								<span className="text-gray-800 font-bold">Total</span>
								<span className="text-gray-800 font-bold">${total?.toFixed(2)}</span>
							</div>
						</div>
					</div>

					{/* Back to Home Button */}
					<button
						onClick={() => router.push("/")}
						className="mt-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-full hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg"
					>
						Back to Home
					</button>
				</div>
			</div>
		</div>
	)
}

export default CheckoutSuccessPage

'use client'
import { Error } from "@/lib/_toaster"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import { useRouter } from "next/router"
import React from "react"

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
}

const CheckoutSuccessPage: React.FC = () => {
	const router = useRouter()
	const query = router.query
	const [orderItems, setOrderItems] = React.useState<Array<OrderItem>>([])

	let { payload, session_id, event } = query

	const parsedEvent: IEvent | null = event
		? JSON.parse(event as string)
		: null

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
					const response = await axios.get(`/api/checkout/confirm?session_id=${session_id}`)
					const session = response.data

					if (session.payment_status !== "paid") {
						Error("Payment Error", "Your payment was not successful. Please try again.")
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
        {event && (
          <div className="mb-6 space-y-1">
            <p className="text-gray-700"><strong>Event:</strong> {parsedEvent?.name}</p>
            <p className="text-gray-700"><strong>Venue:</strong> {parsedEvent?.location}</p>
            <p className="text-gray-700">
              <strong>Date & Time:</strong>{" "}
              {new Intl.DateTimeFormat('en-US', {
								year: 'numeric',
								month: 'long',
								day: '2-digit',
								timeZone: 'UTC',
							}).format(new Date(parsedEvent!.startsOn))}
              {parsedEvent?.timezone ? ` (${parsedEvent?.timezone})` : ""}
            </p>
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
        onClick={() => router.push(`/${parsedEvent?.slug}`)}
        className="mt-6 bg-[#F79432] text-white px-6 py-3 rounded-full hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg"
      >
        Back to Home
      </button>
    </div>
  </div>
</div>
	)
}

export default CheckoutSuccessPage

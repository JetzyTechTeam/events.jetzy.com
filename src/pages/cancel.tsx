import { useRouter } from "next/router"
import React from "react"

const CheckoutCancelPage: React.FC = () => {
	const router = useRouter()
	return (
		<div className="min-h-screen bg-gradient-to-br from-purple-900 to-indigo-900 py-8 px-4 sm:px-6 lg:px-8">
			{/* Main Container */}
			<div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all">
				{/* Content Section */}
				<div className="p-6 sm:p-8 text-center">
					{/* Cancel Icon */}
					<div className="mb-6">
						<svg className="w-16 h-16 mx-auto text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
						</svg>
					</div>

					{/* Cancel Message */}
					<h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-4">Payment Canceled</h1>
					<p className="text-gray-600 mb-6">Your payment was not completed. Please try again or contact support if you need assistance.</p>

					{/* Try Again Button */}
					<button
						onClick={() => router.push("/")}
						className="mt-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-full hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg"
					>
						Try Again
					</button>
				</div>
			</div>
		</div>
	)
}

export default CheckoutCancelPage

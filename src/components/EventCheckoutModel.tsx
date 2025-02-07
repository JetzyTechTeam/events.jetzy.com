import { Error } from "@Jetzy/lib/_toaster"
import { CreateCheckoutSessionThunk, getCheckoutStore, toggleCheckoutForm } from "@Jetzy/redux/reducers/checkoutSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import React, { useState } from "react"
import Spinner from "./misc/Spinner"

export default function EventCheckoutModel() {
	const [acceptTerms, setAcceptTerms] = useState(false)
	const { showCheckout, tickets, isLoading } = useAppSelector(getCheckoutStore)
	const dispatch = useAppDispatch()

	// State for form data
	const [formData, setFormData] = useState({
		firstName: "",
		lastName: "",
		email: "",
		phone: "",
	})

	// Handle form input changes
	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { name, value } = e.target
		setFormData((prevData) => ({
			...prevData,
			[name]: value,
		}))
	}

	// Handle form submission
	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()

		if (!acceptTerms) {
			Error("Terms Required", "Please accept the terms and conditions to continue.")
			return
		}

		const hasFilledAllFields = Object.values(formData).every((value) => value)
		if (!hasFilledAllFields) {
			Error("Form Error", "Please fill in all fields.")
			return
		}

		dispatch(
			CreateCheckoutSessionThunk({
				data: {
					tickets: JSON.stringify(tickets),
					user: JSON.stringify(formData),
				},
			}),
		).then((res: any) => {
			if (res.payload?.status) {
				// redirect user to payment page
				dispatch(toggleCheckoutForm(false))
				window.location.href = res?.payload?.data?.url
			}
		})
	}

	return (
		<>
			{showCheckout && (
				<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
					<div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative">
						{/* Close Button */}
						<button
							onClick={() => dispatch(toggleCheckoutForm(false))}
							className="absolute top-4 right-4 bg-gray-200 text-gray-700 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-300"
						>
							&times;
						</button>
<div className="bg-purple-100 text-purple-700 p-3 rounded-t-2xl text-center font-semibold">
							This deal is reserved for Jetzy Users Only.
						</div>

						{/* Form */}
						<form onSubmit={handleSubmit} className="p-6 space-y-6">
							<h2 className="text-2xl font-bold text-gray-800">Checkout</h2>
							<div className="space-y-4">
								<input
									type="text"
									name="firstName"
									placeholder="First Name"
									value={formData.firstName}
									onChange={handleInputChange}
									className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
									required
								/>
								<input
									type="text"
									name="lastName"
									placeholder="Last Name"
									value={formData.lastName}
									onChange={handleInputChange}
									className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
									required
								/>
								<input
									type="email"
									name="email"
									placeholder="Email"
									value={formData.email}
									onChange={handleInputChange}
									className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
									required
								/>
								<input
									type="tel"
									name="phone"
									placeholder="Phone Number"
									value={formData.phone}
									onChange={handleInputChange}
									className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
									required
								/>
							</div>
							{/* an info paragrph */}
							<p className="text-sm text-gray-600">
								By signing up, you create a Jetzy account for exclusive deals. Existing accounts won&apos;t be duplicated.
							</p>

							{/* Terms Checkbox */}
							<div className="flex items-start space-x-2">
								<input
									type="checkbox"
									id="terms"
									checked={acceptTerms}
									onChange={(e) => setAcceptTerms(e.target.checked)}
									className="mt-1"
									required
								/>
								<label htmlFor="terms" className="text-sm text-gray-600">
									I accept the Terms and Conditions and consent to creating a Jetzy account.
								</label>
							</div>
							<button
								disabled={isLoading}
								type="submit"
								className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-full hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg disabled:opacity-50"
							>
								{isLoading ? <Spinner /> : "Submit"}
							</button>
						</form>
					</div>
				</div>
			)}
		</>
	)
}

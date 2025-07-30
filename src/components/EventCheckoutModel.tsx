import { Error } from "@Jetzy/lib/_toaster"
import { CreateCheckoutSessionThunk, getCheckoutStore, toggleCheckoutForm } from "@Jetzy/redux/reducers/checkoutSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import React, { useState } from "react"
import Spinner from "./misc/Spinner"

export default function EventCheckoutModel() {
	// const [acceptTerms, setAcceptTerms] = useState(false)
	const { showCheckout, tickets, isLoading } = useAppSelector(getCheckoutStore)
	const dispatch = useAppDispatch()
	const [phoneError, setPhoneError] = useState("")

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
		if (name === "phone") {
			const phonePattern = /^\+?1?\d{10,15}$/
			if (!phonePattern.test(value)) {
				setPhoneError("Please enter a valid phone number.")
			} else {
				setPhoneError("")
			}
		}
	}

	// Handle form submission
	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()

		// if (!acceptTerms) {
		// 	Error("Terms Required", "Please accept the terms and conditions to continue.")
		// 	return
		// }

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
					<div className="bg-[#1E1E1E] rounded-2xl shadow-2xl w-full max-w-md relative">
						{/* Close Button */}
						<button
							onClick={() => dispatch(toggleCheckoutForm(false))}
							className="absolute top-2 right-2 bg-black text-white w-8 h-8 rounded-full flex items-center justify-center"
						>
							&times;
						</button>
						{/* <div className="bg-jetzy text-black p-3 rounded-t-2xl text-center font-semibold">This deal is reserved for Jetzy Users Only.</div> */}

						{/* Form */}
						<form onSubmit={handleSubmit} className="p-6 space-y-6">
							<h2 className="text-2xl font-bold">Checkout</h2>
							<div className="space-y-4">
								<input
									type="text"
									name="firstName"
									placeholder="First Name"
									value={formData.firstName}
									onChange={handleInputChange}
									className="w-full p-3 bg-[#090C10] border border-[#444444] rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
									required
								/>
								<input
									type="text"
									name="lastName"
									placeholder="Last Name"
									value={formData.lastName}
									onChange={handleInputChange}
									className="w-full p-3 bg-[#090C10] border border-[#444444] rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
									required
								/>
								<input
									type="email"
									name="email"
									placeholder="Email"
									value={formData.email}
									onChange={handleInputChange}
									className="w-full p-3 bg-[#090C10] border border-[#444444] rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
									required
								/>
								<input
									type="tel"
									name="phone"
									placeholder="Phone Number"
									value={formData.phone}
									onChange={handleInputChange}
									className="w-full p-3 bg-[#090C10] border border-[#444444] rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
									required
									pattern="^\+?[0-9]{7,15}$"
									title="Enter a valid phone number (e.g., +1234567890)"
								/>
								{phoneError && (
										<span className="text-red-500 text-sm">{phoneError}</span>
									)}
								</div>
							{/* an info paragrph */}
							{/* <p className="text-sm text-[#A5A5A5]">By signing up, you create a Jetzy account for exclusive deals. Existing accounts won&apos;t be duplicated.</p> */}

							{/* Terms Checkbox */}
							{/* <div className="flex items-start space-x-2">
								<input type="checkbox" id="terms" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-1" required />
								<label htmlFor="terms" className="text-sm text-[#A5A5A5]">
									I accept the Terms and Conditions and consent to creating a Jetzy account.
								</label>
							</div> */}
							<button
								disabled={isLoading}
								type="submit"
								className="w-full bg-jetzy text-black font-bold  px-6 py-3 rounded-xl transition-all transform hover:scale-105 shadow-lg disabled:opacity-50"
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

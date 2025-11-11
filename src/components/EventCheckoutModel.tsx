import { Error } from "@Jetzy/lib/_toaster"
import { CreateCheckoutSessionThunk, getCheckoutStore, toggleCheckoutForm } from "@Jetzy/redux/reducers/checkoutSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import React, { useState, useEffect, useCallback } from "react"
import Spinner from "./misc/Spinner"
import { sendGAEvent } from "@next/third-parties/google"
import { useSession } from "next-auth/react"
import LoginModal from "./misc/LoginModal"
import { FiArrowLeft, FiPlus, FiX } from "react-icons/fi"

export default function EventCheckoutModel({ event }: { event: string }) {
	const { data: session } = useSession()
	const { showCheckout, tickets, isLoading } = useAppSelector(getCheckoutStore)
	const dispatch = useAppDispatch()
	const [phoneError, setPhoneError] = useState("")
	const [emailErrors, setEmailErrors] = useState<string[]>([])
	const [waitingListData, setWaitingListData] = useState<any>(null)
	const [showWaitingList, setShowWaitingList] = useState(false)
	const [waitingListRegistered, setWaitingListRegistered] = useState(false)
	const [showLoginModal, setShowLoginModal] = useState(false)

	// State for form data
	const [formData, setFormData] = useState({
		firstName: "",
		lastName: "",
		email: "",
		phone: "",
	})

	// Guest emails state (for logged-in users)
	const [guestEmails, setGuestEmails] = useState<string[]>(["", ""])

	// Pre-fill form data if user is logged in
	useEffect(() => {
		if (session?.user) {
			// Split fullName into firstName and lastName
			const fullName = (session.user as any).fullName || ""
			const nameParts = fullName.trim().split(" ")
			const firstName = nameParts[0] || ""
			const lastName = nameParts.slice(1).join(" ") || ""

			setFormData({
				firstName: firstName,
				lastName: lastName,
				email: session.user.email || "",
				phone: (session.user as any).phone || "", // Phone might not exist in session
			})
		}
	}, [session])

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

	// Handle guest email changes
	const handleGuestEmailChange = (index: number, value: string) => {
		const newGuestEmails = [...guestEmails]
		newGuestEmails[index] = value
		setGuestEmails(newGuestEmails)
	}

	// Add more guest email fields
	const addGuestEmailField = () => {
		setGuestEmails([...guestEmails, ""])
	}

	// Remove guest email field
	const removeGuestEmailField = (index: number) => {
		const newGuestEmails = guestEmails.filter((_, i) => i !== index)
		setGuestEmails(newGuestEmails)
	}

	// Validate email format
	const validateEmail = (email: string): boolean => {
		const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		return emailPattern.test(email)
	}

	// Handle form submission
	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()

		const hasFilledAllFields = Object.values(formData).every((value) => value)
		if (!hasFilledAllFields) {
			Error("Form Error", "Please fill in all fields.")
			return
		}

		// Validate guest emails if provided
		if (session?.user) {
			const filledGuestEmails = guestEmails.filter((email) => email.trim() !== "")
			const invalidEmails = filledGuestEmails.filter((email) => !validateEmail(email))

			if (invalidEmails.length > 0) {
				const errors = guestEmails.map((email) => {
					if (email.trim() !== "" && !validateEmail(email)) {
						return "Invalid email format"
					}
					return ""
				})
				setEmailErrors(errors)
				Error("Invalid Email", "Please enter valid email addresses for all guests.")
				return
			}
			setEmailErrors([])
		}

		sendGAEvent({
			category: "Event",
			action: "Checkout Form Submitted",
			label: event,
		})

		// Include guest emails in the submission
		const submissionData = {
			tickets: JSON.stringify(tickets),
			user: JSON.stringify({
				...formData,
				guestEmails: session?.user ? guestEmails.filter((email) => email.trim() !== "") : [],
			}),
		}

		dispatch(
			CreateCheckoutSessionThunk({
				data: submissionData,
			}),
		).then((res: any) => {
			if (res.payload?.status) {
				// Check if event is at capacity
				if (res.payload?.data?.atCapacity) {
					setWaitingListData(res.payload.data)
					setShowWaitingList(true)
				} else {
					// redirect user to payment page
					dispatch(toggleCheckoutForm(false))
					window.location.href = res?.payload?.data?.url
				}
			}
		})
	}

	// Handle joining waiting list
	const handleJoinWaitingList = useCallback(async () => {
		try {
			const response = await fetch("/api/waiting-list/add", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					eventId: waitingListData.eventId,
					firstName: formData.firstName,
					lastName: formData.lastName,
					email: formData.email,
					phone: formData.phone,
					tickets: tickets,
					eventName: waitingListData.eventName,
				}),
			})

			const result = await response.json()

			if (result.status) {
				setWaitingListRegistered(true)
			} else {
				Error("Error", result.message || "Failed to join waiting list")
			}
		} catch (error) {
			console.error("Error joining waiting list:", error)
			Error("Error", "Failed to join waiting list. Please try again.")
		}
	}, [waitingListData, formData, tickets])

	// Automatically register to waiting list when waiting list is shown
	useEffect(() => {
		if (showWaitingList && !waitingListRegistered && formData.firstName && formData.lastName && formData.email && formData.phone) {
			handleJoinWaitingList()
		}
	}, [showWaitingList, waitingListRegistered, formData.firstName, formData.lastName, formData.email, formData.phone, handleJoinWaitingList])

	// Handle back button
	const handleBack = () => {
		if (showWaitingList) {
			setShowWaitingList(false)
			setWaitingListData(null)
			setWaitingListRegistered(false)
		} else {
			dispatch(toggleCheckoutForm(false))
			sendGAEvent({ category: "Event", action: "Back to Tickets", label: event })
		}
	}

	return (
		<>
			{showCheckout && (
				<div
					className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-50"
					onClick={(e) => e.stopPropagation()} // Prevent click-outside close
				>
					<div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative border border-border-light" onClick={(e) => e.stopPropagation()}>
						{/* Header with Back Button */}
						<div className="flex items-center justify-between p-6 border-b border-border-light">
							<button onClick={handleBack} className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors font-medium">
								<FiArrowLeft className="text-lg" />
								<span>Back</span>
							</button>
							<h2 className="text-xl font-bold text-text-primary">{showWaitingList ? "Waiting List" : "Register For Event"}</h2>
							<div className="w-16"></div> {/* Spacer for center alignment */}
						</div>

						{/* Waiting List UI */}
						{showWaitingList ? (
							<div className="p-6 space-y-6">
								<div className="text-center">
									<div className="w-20 h-20 mx-auto mb-4 bg-primary-purple/20 rounded-full flex items-center justify-center">
										<svg className="w-10 h-10 text-primary-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
										</svg>
									</div>
									<div className="bg-primary-purple/10 border border-primary-purple/30 rounded-xl p-6 mb-6">
										<p className="text-primary-purple text-2xl font-bold text-center">You&apos;re on the waitlist</p>
									</div>
									<p className="text-text-secondary mb-6 leading-relaxed">
										Thank you for your interest! &quot;{waitingListData?.eventName}&quot; is currently at capacity. We&apos;ll email you if spots become available.
									</p>
									<button
										onClick={() => {
											dispatch(toggleCheckoutForm(false))
											setShowWaitingList(false)
										}}
										className="bg-primary-purple text-white px-8 py-3 rounded-lg hover:bg-primary-dark transition-colors font-semibold shadow-md hover:shadow-lg"
									>
										Close
									</button>
								</div>
							</div>
						) : (
							/* Registration Form */
							<form onSubmit={handleSubmit} className="p-6 space-y-5">
								{/* User Information Section */}
								<div className="space-y-4">
									<div className="grid grid-cols-2 gap-3">
										<div>
											<label className="block text-sm font-medium text-text-primary mb-1.5">First Name</label>
											<input
												type="text"
												name="firstName"
												placeholder="John"
												value={formData.firstName}
												onChange={handleInputChange}
												disabled={!!session?.user} // Disable if logged in
												className="w-full p-3 bg-white text-text-primary border-2 border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-primary-purple transition-all disabled:bg-background-gray disabled:cursor-not-allowed"
												required={!session?.user} // Only required if not logged in
											/>
										</div>
										<div>
											<label className="block text-sm font-medium text-text-primary mb-1.5">Last Name</label>
											<input
												type="text"
												name="lastName"
												placeholder="Doe"
												value={formData.lastName}
												onChange={handleInputChange}
												disabled={!!session?.user}
												className="w-full p-3 bg-white text-text-primary border-2 border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-primary-purple transition-all disabled:bg-background-gray disabled:cursor-not-allowed"
												required={!session?.user}
											/>
										</div>
									</div>
									<div>
										<label className="block text-sm font-medium text-text-primary mb-1.5">Email</label>
										<input
											type="email"
											name="email"
											placeholder="john.doe@example.com"
											value={formData.email}
											onChange={handleInputChange}
											disabled={!!session?.user}
											className="w-full p-3 bg-white text-text-primary border-2 border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-primary-purple transition-all disabled:bg-background-gray disabled:cursor-not-allowed"
											required={!session?.user}
										/>
									</div>
									<div>
										<label className="block text-sm font-medium text-text-primary mb-1.5">Phone Number</label>
										<input
											type="tel"
											name="phone"
											placeholder="+1234567890"
											value={formData.phone}
											onChange={handleInputChange}
											disabled={!!session?.user && !!(session.user as any).phone} // Only disable if phone exists in session
											className="w-full p-3 bg-white text-text-primary border-2 border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-primary-purple transition-all disabled:bg-background-gray disabled:cursor-not-allowed"
											required // Always required
											pattern="^\+?[0-9]{7,15}$"
											title="Enter a valid phone number (e.g., +1234567890)"
										/>
										{phoneError && <span className="text-red-500 text-sm mt-1 block">{phoneError}</span>}
									</div>
								</div>

								{/* Guest Emails Section (Only for logged-in users) */}
								{session?.user && (
									<div className="space-y-3 pt-4 border-t border-border-light">
										<div className="flex items-center justify-between">
											<label className="block text-sm font-semibold text-text-primary">Who else is attending this event?</label>
											<button type="button" onClick={addGuestEmailField} className="flex items-center gap-1 text-primary-purple hover:text-primary-dark font-medium text-sm transition-colors">
												<FiPlus className="text-base" />
												<span>Add More</span>
											</button>
										</div>
										<p className="text-xs text-text-muted">Add email addresses of other guests attending with you (optional)</p>
										{guestEmails.map((email, index) => (
											<div key={index} className="flex items-start gap-2">
												<div className="flex-1">
													<input
														type="email"
														placeholder={`Guest ${index + 1} email (optional)`}
														value={email}
														onChange={(e) => handleGuestEmailChange(index, e.target.value)}
														className="w-full p-3 bg-white text-text-primary border-2 border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-primary-purple transition-all"
													/>
													{emailErrors[index] && <span className="text-red-500 text-xs mt-1 block">{emailErrors[index]}</span>}
												</div>
												{guestEmails.length > 2 && (
													<button type="button" onClick={() => removeGuestEmailField(index)} className="mt-3 text-text-muted hover:text-red-500 transition-colors">
														<FiX className="text-lg" />
													</button>
												)}
											</div>
										))}
									</div>
								)}

								{/* Login Link (Only for not-logged-in users) */}
								{!session?.user && (
									<div className="text-center pt-2">
										<p className="text-sm text-text-secondary">
											Already have an account?{" "}
											<button type="button" onClick={() => setShowLoginModal(true)} className="text-primary-purple font-semibold hover:text-primary-dark transition-colors">
												Login
											</button>
										</p>
									</div>
								)}

								{/* Submit Button */}
								<button
									disabled={isLoading}
									type="submit"
									className="w-full bg-primary-purple text-white font-semibold px-6 py-3.5 rounded-lg hover:bg-primary-dark transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
								>
									{isLoading ? (
										<>
											<Spinner />
											<span>Processing...</span>
										</>
									) : (
										"Continue to Payment"
									)}
								</button>
							</form>
						)}
					</div>
				</div>
			)}

			{/* Login Modal */}
			{showLoginModal && <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />}
		</>
	)
}

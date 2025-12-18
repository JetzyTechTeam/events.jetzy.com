import { Error } from "@Jetzy/lib/_toaster"
import { CreateCheckoutSessionThunk, getCheckoutStore, toggleCheckoutForm } from "@Jetzy/redux/reducers/checkoutSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import React, { useState, useEffect, useCallback } from "react"
import Spinner from "./misc/Spinner"
import { sendGAEvent } from "@next/third-parties/google"
import { useSession } from "next-auth/react"
import LoginModal from "./misc/LoginModal"
import { FiArrowLeft, FiEye, FiEyeOff } from "react-icons/fi"

export default function EventCheckoutModel({ event }: { event: string }) {
	const { data: session } = useSession()
	const { showCheckout, tickets, isLoading } = useAppSelector(getCheckoutStore)
	const dispatch = useAppDispatch()
	const [phoneError, setPhoneError] = useState("")
	const [waitingListData, setWaitingListData] = useState<any>(null)
	const [showWaitingList, setShowWaitingList] = useState(false)
	const [waitingListRegistered, setWaitingListRegistered] = useState(false)
	const [showLoginModal, setShowLoginModal] = useState(false)
	const [showPassword, setShowPassword] = useState(false)
	const [isCheckingUser, setIsCheckingUser] = useState(false)
	const [pendingCheckoutData, setPendingCheckoutData] = useState<{ formData: typeof formData; tickets: typeof tickets } | null>(null)
	const [shouldStopCheckout, setShouldStopCheckout] = useState(false)

	// State for form data
	const [formData, setFormData] = useState({
		firstName: "",
		lastName: "",
		email: "",
		phone: "",
		password: "",
	})

	// Guest emails are now handled in ticket selection modal based on quantity
	// We just load them from localStorage to pass to checkout API

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
				password: "", // Don't pre-fill password for logged-in users
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


	// Validate email format
	const validateEmail = (email: string): boolean => {
		const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		return emailPattern.test(email)
	}

	// Handle form submission
	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()

		// Check required fields (password only required if not logged in)
		const requiredFields = session?.user 
			? ['firstName', 'lastName', 'email', 'phone']
			: ['firstName', 'lastName', 'email', 'phone', 'password']
		
		const hasFilledAllRequiredFields = requiredFields.every((field) => {
			const value = formData[field as keyof typeof formData]
			return value && value.trim() !== ""
		})
		
		if (!hasFilledAllRequiredFields) {
			Error("Form Error", "Please fill in all required fields.")
			return
		}
		
		// Validate password length if provided (only for new users)
		if (!session?.user && formData.password.length < 6) {
			Error("Password Error", "Password must be at least 6 characters long.")
			return
		}

		// Guest emails are validated in ticket selection modal, no need to validate here

		// Check if user already exists (only for non-logged-in users)
		if (!session?.user) {
			setIsCheckingUser(true)
			let userExists = false
			
			try {
				const checkUserResponse = await fetch("/api/auth/check-user", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						email: formData.email.trim(),
						isJetzyMember: false, // You can add a checkbox for this if needed
					}),
				})

				const checkUserResult = await checkUserResponse.json()
				console.log("[EventCheckout] User check result:", checkUserResult)

				// Check if user exists with password
				if (checkUserResult?.status === true && checkUserResult?.data?.exists === true && checkUserResult?.data?.hasPassword === true) {
					console.log("[EventCheckout] User exists with password, stopping checkout and opening login modal")
					// User already exists with password, redirect to login
					userExists = true
					setIsCheckingUser(false)
					// Store checkout data to continue after login
					setPendingCheckoutData({
						formData: { ...formData },
						tickets: [...tickets],
					})
					// Show login modal first
					setShowLoginModal(true)
					// Show error message after a brief delay to ensure modal is visible
					setTimeout(() => {
						Error("Account Exists", "An account with this email already exists. Please login to continue.")
					}, 300)
					// IMPORTANT: Return early to stop checkout process - this prevents payment flow
					console.log("[EventCheckout] Returning early - checkout stopped")
					return
				}
			} catch (error) {
				console.error("[EventCheckout] Error checking user:", error)
				setIsCheckingUser(false)
				// If check fails, show error and stop checkout
				Error("Error", "Unable to verify account. Please try again.")
				return
			}
			
			setIsCheckingUser(false)
			
			// Double-check: if user exists, don't proceed
			if (userExists) {
				console.log("[EventCheckout] User exists flag is true, stopping checkout")
				return
			}
		}

		console.log("[EventCheckout] User check passed, proceeding with checkout")
		sendGAEvent({
			category: "Event",
			action: "Checkout Form Submitted",
			label: event,
		})

		// Get guest emails from localStorage (set in ticket selection modal based on quantity)
		let finalGuestEmails: string[] = []
		if (typeof window !== 'undefined') {
			const stored = localStorage.getItem("eventGuestEmails")
			if (stored) {
				try {
					const parsed = JSON.parse(stored)
					if (Array.isArray(parsed)) {
						finalGuestEmails = parsed.filter((email: string) => email && email.trim() !== "")
					}
				} catch {
					// Ignore parse errors
				}
			}
		}

		// Include guest emails in the submission
		const submissionData = {
			tickets: JSON.stringify(tickets),
			user: JSON.stringify({
				...formData,
				guestEmails: finalGuestEmails,
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
					// Clear localStorage after successful checkout initiation
					if (typeof window !== 'undefined') {
						localStorage.removeItem("eventGuestEmails")
					}
					// redirect user to payment page
					dispatch(toggleCheckoutForm(false))
					window.location.href = res?.payload?.data?.url
				}
			}
		})
	}

	// Continue checkout after login
	const handleContinueCheckout = useCallback(async (checkoutFormData: typeof formData, checkoutTickets: typeof tickets) => {
		// Use session data if available (user just logged in), otherwise use stored form data
		const finalFormData = session?.user ? {
			firstName: (session.user as any).fullName?.split(" ")[0] || checkoutFormData.firstName,
			lastName: (session.user as any).fullName?.split(" ").slice(1).join(" ") || checkoutFormData.lastName,
			email: session.user.email || checkoutFormData.email,
			phone: (session.user as any).phone || checkoutFormData.phone,
			password: "", // No password needed for logged-in users
		} : checkoutFormData
		
		sendGAEvent({
			category: "Event",
			action: "Checkout Form Submitted (After Login)",
			label: event,
		})

		// Get guest emails from localStorage (set in ticket selection)
		let finalGuestEmails: string[] = []
		if (typeof window !== 'undefined') {
			const stored = localStorage.getItem("eventGuestEmails")
			if (stored) {
				try {
					const parsed = JSON.parse(stored)
					if (Array.isArray(parsed)) {
						finalGuestEmails = parsed.filter((email: string) => email && email.trim() !== "")
					}
				} catch {
					// Ignore parse errors
				}
			}
		}

		// Include guest emails in the submission
		const submissionData = {
			tickets: JSON.stringify(checkoutTickets),
			user: JSON.stringify({
				...finalFormData,
				guestEmails: finalGuestEmails,
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
					// Clear localStorage after successful checkout initiation
					if (typeof window !== 'undefined') {
						localStorage.removeItem("eventGuestEmails")
					}
					// redirect user to payment page
					dispatch(toggleCheckoutForm(false))
					window.location.href = res?.payload?.data?.url
				}
			}
		})
	}, [event, dispatch, session])

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
									{/* Password Field - Only for non-logged-in users */}
									{!session?.user && (
										<div>
											<label className="block text-sm font-medium text-text-primary mb-1.5">Password</label>
											<div className="relative">
												<input
													type={showPassword ? "text" : "password"}
													name="password"
													placeholder="Create a password"
													value={formData.password}
													onChange={handleInputChange}
													className="w-full p-3 pr-10 bg-white text-text-primary border-2 border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-primary-purple transition-all"
													required
													minLength={6}
													title="Password must be at least 6 characters"
													autoComplete="new-password"
												/>
												<button
													type="button"
													onClick={() => setShowPassword(!showPassword)}
													className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors"
													aria-label={showPassword ? "Hide password" : "Show password"}
												>
													{showPassword ? <FiEyeOff className="h-5 w-5" /> : <FiEye className="h-5 w-5" />}
												</button>
											</div>
											<p className="text-xs text-text-muted mt-1">Minimum 6 characters</p>
										</div>
									)}
								</div>


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
									disabled={isLoading || isCheckingUser}
									type="submit"
									className="w-full bg-primary-purple text-white font-semibold px-6 py-3.5 rounded-lg hover:bg-primary-dark transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
								>
									{isLoading || isCheckingUser ? (
										<>
											<Spinner />
											<span>{isCheckingUser ? "Checking..." : "Processing..."}</span>
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
			{showLoginModal && (
				<LoginModal 
					isOpen={showLoginModal} 
					onClose={() => {
						setShowLoginModal(false)
						setPendingCheckoutData(null)
					}}
					onLoginSuccess={async () => {
						// After successful login, wait a moment for session to update, then continue with checkout
						if (pendingCheckoutData) {
							// Wait for session to update
							await new Promise(resolve => setTimeout(resolve, 500))
							// Refresh session by triggering a re-render
							handleContinueCheckout(pendingCheckoutData.formData, pendingCheckoutData.tickets)
							setPendingCheckoutData(null)
						}
					}}
				/>
			)}
		</>
	)
}

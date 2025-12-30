import { Error } from "@Jetzy/lib/_toaster"
import { CreateCheckoutSessionThunk, getCheckoutStore, toggleCheckoutForm } from "@Jetzy/redux/reducers/checkoutSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import React, { useState, useEffect, useCallback } from "react"
import Spinner from "./misc/Spinner"
import { sendGAEvent } from "@next/third-parties/google"
import { useSession } from "next-auth/react"
import LoginModal from "./misc/LoginModal"
import { FiArrowLeft, FiEye, FiEyeOff } from "react-icons/fi"
import SafeHTML from "./misc/SafeHTML"

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
	const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false)

	// State for form data
	const [formData, setFormData] = useState({
		firstName: "",
		lastName: "",
		email: "",
		phone: "",
		password: "",
		referralCode: "",
	})
	const [referralCodeValid, setReferralCodeValid] = useState<boolean | null>(null)
	const [referralCodeDiscount, setReferralCodeDiscount] = useState<number | null>(null)
	const [validatingReferralCode, setValidatingReferralCode] = useState(false)
	const referralCodeValidationTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

	// Guest emails are now handled in ticket selection modal based on quantity
	// We just load them from localStorage to pass to checkout API

	// Pre-fill form data if user is logged in
	// Note: We don't populate referralCode field from sessionStorage - that's for tracking only
	// The referral code input field is for discount codes only
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
				referralCode: "", // Keep empty - this field is for discount codes, not tracking codes
			})
		}
	}, [session])

	// Pending bookings check removed - users can buy tickets freely
	// Capacity restrictions are handled in the main checkout flow

	// Validate phone number
	const validatePhoneNumber = (phone: string): string => {
		if (!phone || phone.trim() === "") {
			return "Phone number is required"
		}
		
		// Remove all non-digit characters except +
		const cleaned = phone.replace(/[^\d+]/g, "")
		const allDigits = cleaned.replace(/\+/g, "")
		
		// Check for obviously invalid patterns (all same digit)
		if (/^(\d)\1{9,}$/.test(allDigits)) {
			return "Please enter a valid phone number"
		}
		
		// Check for all zeros or all ones (only for 10+ digit numbers)
		if (/^[01]+$/.test(allDigits) && allDigits.length >= 10) {
			return "Please enter a valid phone number"
		}
		
		const withPlus = cleaned.startsWith("+")
		
		if (withPlus) {
			// With +, must have country code (1-3 digits) + 7-15 digits
			// Total length should be 8-18 digits (country code + number)
			if (allDigits.length < 8 || allDigits.length > 18) {
				return "Please enter a valid phone number with country code (e.g., +1234567890)"
			}
			
			// For international numbers, check the last 10 digits for sequential patterns
			// This allows country codes like +92, +44, etc.
			const last10Digits = allDigits.slice(-10)
			if (/^(0123456789|1234567890|9876543210|0987654321)$/.test(last10Digits)) {
				return "Please enter a valid phone number"
			}
			
			// Check for repeated sequences in the last 10 digits
			if (/^(\d{3})\1{2,}\d?$/.test(last10Digits)) {
				return "Please enter a valid phone number"
			}
		} else {
			// Without +, must be exactly 10 digits for US/Canada
			if (allDigits.length !== 10) {
				return "Please enter a 10-digit phone number or include country code with + (e.g., +1234567890)"
			}
			
			// Check for sequential patterns
			if (/^(0123456789|1234567890|9876543210|0987654321)$/.test(allDigits)) {
				return "Please enter a valid phone number"
			}
			
			// Check for patterns with repeated sequences like "1231231234"
			if (/^(\d{3})\1{2,}\d?$/.test(allDigits)) {
				return "Please enter a valid phone number"
			}
			
			// Additional validation: check area code (first 3 digits shouldn't be 000, 111, etc.)
			const areaCode = allDigits.substring(0, 3)
			if (/^(\d)\1{2}$/.test(areaCode)) {
				return "Please enter a valid phone number"
			}
			// Check exchange code (next 3 digits) shouldn't be 000, 111, etc.
			const exchangeCode = allDigits.substring(3, 6)
			if (/^(\d)\1{2}$/.test(exchangeCode)) {
				return "Please enter a valid phone number"
			}
		}
		
		return ""
	}

	// Handle form input changes
	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { name, value } = e.target
		setFormData((prevData) => ({
			...prevData,
			[name]: value,
		}))
		if (name === "phone") {
			const error = validatePhoneNumber(value)
			setPhoneError(error)
		}
		if (name === "referralCode") {
			// Reset validation state when code changes
			setReferralCodeValid(null)
			setReferralCodeDiscount(null)
		}
	}

	// Validate referral code
	const handleValidateReferralCode = async (code: string) => {
		if (!code || code.trim() === "") {
			setReferralCodeValid(null)
			setReferralCodeDiscount(null)
			return
		}

		// Get eventId from tickets (tickets have eventId but TypeScript type doesn't include it)
		const eventId = (tickets[0] as any)?.eventId
		if (!eventId) {
			return
		}

		setValidatingReferralCode(true)
		try {
			const response = await fetch(`/api/events/${eventId}/referral-codes/validate`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					eventId,
					code: code.toUpperCase().trim(),
				}),
			})

			const result = await response.json()
			if (result.status && result.data) {
				setReferralCodeValid(true)
				setReferralCodeDiscount(result.data.discountPercentage)
			} else {
				setReferralCodeValid(false)
				setReferralCodeDiscount(null)
			}
		} catch (error) {
			console.error("Error validating referral code:", error)
			setReferralCodeValid(false)
			setReferralCodeDiscount(null)
		} finally {
			setValidatingReferralCode(false)
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

		// Prevent duplicate submissions
		if (isSubmittingCheckout || isLoading) {
			return
		}

		setIsSubmittingCheckout(true)

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

		// Validate phone number
		const phoneValidationError = validatePhoneNumber(formData.phone)
		if (phoneValidationError) {
			setPhoneError(phoneValidationError)
			Error("Invalid Phone Number", phoneValidationError)
			return
		}

		// Validate referral code if one is entered
		if (formData.referralCode && formData.referralCode.trim() !== "") {
			// If referral code is entered, it must be valid
			if (referralCodeValid === false) {
				Error("Invalid Referral Code", "Please enter a valid referral code or remove it to continue.")
				return
			}
			// If validation is still in progress, wait for it to complete
			if (referralCodeValid === null && validatingReferralCode) {
				Error("Please Wait", "Referral code validation in progress. Please wait.")
				return
			}
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

		// Get referral code from formData or sessionStorage (fallback)
		let finalReferralCode = formData.referralCode?.trim()
		if (!finalReferralCode && typeof window !== 'undefined') {
			const stored = sessionStorage.getItem("jetzy_referral_code")
			if (stored && stored.trim()) {
				finalReferralCode = stored.trim()
			}
		}

		// Include guest emails and referral code in the submission
		// Don't convert to uppercase - let the API handle it (tracking codes should stay lowercase)
		const submissionData = {
			tickets: JSON.stringify(tickets),
			user: JSON.stringify({
				...formData,
				guestEmails: finalGuestEmails,
			}),
			referralCode: finalReferralCode || undefined,
		}

		dispatch(
			CreateCheckoutSessionThunk({
				data: submissionData,
			}),
		).then((res: any) => {
			setIsSubmittingCheckout(false)
			
			// Check if the response indicates an error
			if (!res || !res.payload) {
				console.error("[EventCheckout] No response payload received")
				Error("Checkout Error", "No response from server. Please try again.")
				return
			}
			
			// Check if the API returned an error
			if (res.payload?.status === false) {
				const errorMessage = res.payload?.message || "Failed to create checkout session. Please try again."
				console.error("[EventCheckout] API returned error:", errorMessage)
				Error("Checkout Error", errorMessage)
				return
			}
			
			if (res.payload?.status) {
				// Check if user has pending bookings (must complete these first)
				if (res.payload?.data?.hasPendingBookings) {
					const pendingCount = res.payload?.data?.pendingCount || 0
					Error(
						"Pending Bookings", 
						res.payload?.message || `You have ${pendingCount} pending booking${pendingCount > 1 ? 's' : ''} for this event. Please complete payment for your pending booking${pendingCount > 1 ? 's' : ''} first. Check your email for payment links.`
					)
					dispatch(toggleCheckoutForm(false))
					return
				}
				// Check if user already has a confirmed booking
				if (res.payload?.data?.hasExistingBooking) {
					Error("Already Booked", res.payload?.message || "You already have a confirmed booking for this event.")
					dispatch(toggleCheckoutForm(false))
					return
				}
				// Check if event is at capacity
				if (res.payload?.data?.atCapacity) {
					setWaitingListData(res.payload.data)
					setShowWaitingList(true)
					return
				}
				
				// Check if user is already on waiting list
				if (res.payload?.data?.alreadyOnWaitingList) {
					// User is already on waiting list - show waiting list UI
					setWaitingListData({
						atCapacity: true,
						eventName: res.payload.data.eventName,
						eventId: res.payload.data.eventId,
						alreadyOnWaitingList: true
					})
					setShowWaitingList(true)
					return
				}
				
				// Get the checkout URL from the response
				// The Stripe session object is in res.payload.data, and it has a .url property
				const sessionData = res?.payload?.data
				const checkoutUrl = sessionData?.url
				
				console.log("[EventCheckout] Checkout response:", {
					hasPayload: !!res?.payload,
					hasData: !!sessionData,
					hasUrl: !!checkoutUrl,
					url: checkoutUrl,
					dataType: typeof sessionData,
					dataKeys: sessionData ? Object.keys(sessionData) : [],
					sessionId: sessionData?.id,
					paymentStatus: sessionData?.payment_status,
					fullResponse: res?.payload
				})
				
				// Check if we have a valid checkout URL
				if (!checkoutUrl || typeof checkoutUrl !== 'string' || !checkoutUrl.startsWith('http')) {
					console.error("[EventCheckout] Invalid checkout URL received:", {
						checkoutUrl,
						type: typeof checkoutUrl,
						hasUrl: !!checkoutUrl,
						sessionData: sessionData,
						sessionId: sessionData?.id,
						allSessionKeys: sessionData ? Object.keys(sessionData) : []
					})
					
					// If we have a session ID but no URL, this is unusual - log it
					if (sessionData?.id && !checkoutUrl) {
						console.error("[EventCheckout] Session created with ID but no URL - this should not happen for checkout sessions")
					}
					
					Error("Checkout Error", "Failed to create checkout session. The server did not return a valid payment URL. Please try again or contact support.")
					return
				}
				
				// Clear localStorage after successful checkout initiation
				if (typeof window !== 'undefined') {
					localStorage.removeItem("eventGuestEmails")
					// Store current page URL for back navigation on cancel
					const currentUrl = window.location.href
					sessionStorage.setItem("checkout_return_url", currentUrl)
					// Store tickets in sessionStorage to preserve them across navigation
					sessionStorage.setItem("checkout_tickets", JSON.stringify(tickets))
					console.log("[EventCheckout] Stored return URL and tickets in sessionStorage")
					// Set retry flag so checkout can reopen when returning
					sessionStorage.setItem("checkout_retry", "true")
				}
				
				// redirect user to payment page (Stripe checkout)
				console.log("[EventCheckout] Redirecting to Stripe checkout:", checkoutUrl)
				dispatch(toggleCheckoutForm(false))
				
				// Small delay to ensure modal closes before redirect
				setTimeout(() => {
					// Use window.location.href to ensure full page navigation to Stripe
					window.location.href = checkoutUrl
				}, 100)
			} else {
				// Response status is false or undefined
				const errorMessage = res.payload?.message || "Failed to create checkout session. Please try again."
				console.error("[EventCheckout] Checkout failed:", {
					status: res.payload?.status,
					message: res.payload?.message,
					code: res.payload?.code,
					payload: res.payload
				})
				Error("Checkout Error", errorMessage)
				setIsSubmittingCheckout(false)
			}
		}).catch((error) => {
			console.error("[EventCheckout] Checkout error:", error)
			const errorMessage = error?.response?.data?.message || error?.message || "An unexpected error occurred. Please try again."
			Error("Checkout Error", errorMessage)
			setIsSubmittingCheckout(false)
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
			referralCode: checkoutFormData.referralCode || "", // Preserve referral code from form
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

			// Get referral code from formData or sessionStorage (fallback)
			let finalReferralCode = finalFormData.referralCode?.trim()
			if (!finalReferralCode && typeof window !== 'undefined') {
				const stored = sessionStorage.getItem("jetzy_referral_code")
				if (stored && stored.trim()) {
					finalReferralCode = stored.trim()
				}
			}

			// Include guest emails and referral code in the submission
			// Don't convert to uppercase - let the API handle it (tracking codes should stay lowercase)
			const submissionData = {
				tickets: JSON.stringify(checkoutTickets),
				user: JSON.stringify({
					...finalFormData,
					guestEmails: finalGuestEmails,
				}),
				referralCode: finalReferralCode || undefined,
			}

		dispatch(
			CreateCheckoutSessionThunk({
				data: submissionData,
			}),
		).then((res: any) => {
			if (res.payload?.status) {
				// Check if user has pending bookings (must complete these first)
				if (res.payload?.data?.hasPendingBookings) {
					const pendingCount = res.payload?.data?.pendingCount || 0
					Error(
						"Pending Bookings", 
						res.payload?.message || `You have ${pendingCount} pending booking${pendingCount > 1 ? 's' : ''} for this event. Please complete payment for your pending booking${pendingCount > 1 ? 's' : ''} first. Check your email for payment links.`
					)
					dispatch(toggleCheckoutForm(false))
					return
				}
				// Check if user already has a confirmed booking
				if (res.payload?.data?.hasExistingBooking) {
					Error("Already Booked", res.payload?.message || "You already have a confirmed booking for this event.")
					dispatch(toggleCheckoutForm(false))
					return
				}
				// Check if user is already on waiting list
				if (res.payload?.data?.alreadyOnWaitingList) {
					Error("Already on Waiting List", res.payload?.message || "You are already on the waiting list for this event.")
					dispatch(toggleCheckoutForm(false))
					return
				}
				// Check if event is at capacity
				if (res.payload?.data?.atCapacity) {
					setWaitingListData(res.payload.data)
					setShowWaitingList(true)
				} else {
					// Clear localStorage after successful checkout initiation
					if (typeof window !== 'undefined') {
						localStorage.removeItem("eventGuestEmails")
						// Store current page URL for back navigation on cancel
						const currentUrl = window.location.href
						sessionStorage.setItem("checkout_return_url", currentUrl)
						// Clear retry flag since we're starting a new checkout
						sessionStorage.removeItem("checkout_retry")
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
				// Check if error is due to pending bookings
				if (result.data?.hasPendingBookings) {
					const pendingCount = result.data.pendingCount || 0
					Error(
						"Pending Bookings",
						result.message || `You have ${pendingCount} pending booking${pendingCount > 1 ? "s" : ""} for this event. Please complete payment for your pending booking${pendingCount > 1 ? "s" : ""} first. Check your email for payment links.`
					)
					// Close waiting list UI and checkout form
					setShowWaitingList(false)
					setWaitingListData(null)
					dispatch(toggleCheckoutForm(false))
				} else {
					Error("Error", result.message || "Failed to join waiting list")
				}
			}
		} catch (error) {
			console.error("Error joining waiting list:", error)
			Error("Error", "Failed to join waiting list. Please try again.")
		}
	}, [waitingListData, formData, tickets, dispatch])

	// Automatically register to waiting list when waiting list is shown
	// Skip if user is already on waiting list
	useEffect(() => {
		if (showWaitingList && !waitingListRegistered && !waitingListData?.alreadyOnWaitingList && formData.firstName && formData.lastName && formData.email && formData.phone) {
			handleJoinWaitingList()
		} else if (showWaitingList && waitingListData?.alreadyOnWaitingList) {
			// User is already on waiting list - mark as registered to prevent duplicate attempts
			setWaitingListRegistered(true)
		}
	}, [showWaitingList, waitingListRegistered, waitingListData?.alreadyOnWaitingList, formData.firstName, formData.lastName, formData.email, formData.phone, handleJoinWaitingList])

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
									<div className="text-text-secondary mb-6 leading-relaxed">
										{waitingListData?.alreadyOnWaitingList ? (
											<>You are already on the waiting list for &quot;<SafeHTML html={waitingListData?.eventName || ""} as="span" />&quot;. We&apos;ll email you if spots become available.</>
										) : (
											<>Thank you for your interest! &quot;<SafeHTML html={waitingListData?.eventName || ""} as="span" />&quot; is currently at capacity. We&apos;ll email you if spots become available.</>
										)}
									</div>
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
											title="Enter a valid phone number with country code (e.g., +1234567890) or 10-digit US/Canada number"
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
									{/* Referral Code Field */}
									<div>
										<label className="block text-sm font-medium text-text-primary mb-1.5">
											Referral Code <span className="text-text-muted font-normal">(Optional)</span>
										</label>
										<div className="relative">
											<input
												type="text"
												name="referralCode"
												placeholder="Enter referral code"
												value={formData.referralCode}
												onChange={(e) => {
													handleInputChange(e)
													// Clear previous timeout
													if (referralCodeValidationTimeoutRef.current) {
														clearTimeout(referralCodeValidationTimeoutRef.current)
													}
													// Validate after user stops typing (debounce)
													const value = e.target.value.toUpperCase().trim()
													if (value) {
														referralCodeValidationTimeoutRef.current = setTimeout(() => {
															handleValidateReferralCode(value)
														}, 500)
													} else {
														setReferralCodeValid(null)
														setReferralCodeDiscount(null)
													}
												}}
												onBlur={() => {
													if (referralCodeValidationTimeoutRef.current) {
														clearTimeout(referralCodeValidationTimeoutRef.current)
													}
													if (formData.referralCode.trim()) {
														handleValidateReferralCode(formData.referralCode)
													}
												}}
												className="w-full p-3 bg-white text-text-primary border-2 border-border-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-primary-purple transition-all uppercase"
												style={{ textTransform: "uppercase" }}
											/>
											{validatingReferralCode && (
												<div className="absolute right-3 top-1/2 -translate-y-1/2">
													<Spinner />
												</div>
											)}
										</div>
										{referralCodeValid === true && referralCodeDiscount !== null && (
											<p className="text-sm text-green-600 mt-1.5 font-medium">
												✓ Valid! You&apos;ll get {referralCodeDiscount}% off your order
											</p>
										)}
										{referralCodeValid === false && (
											<p className="text-sm text-red-500 mt-1.5">
												Invalid or inactive referral code
											</p>
										)}
									</div>
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
									disabled={
										isLoading || 
										isCheckingUser || 
										isSubmittingCheckout ||
										!!phoneError || 
										!!(formData.referralCode && formData.referralCode.trim() !== "" && referralCodeValid === false)
									}
									type="submit"
									className="w-full bg-primary-purple text-white font-semibold px-6 py-3.5 rounded-lg hover:bg-primary-dark transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
								>
									{isLoading || isCheckingUser || isSubmittingCheckout ? (
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

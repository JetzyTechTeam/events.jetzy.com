import { Error } from "@Jetzy/lib/_toaster"
import { CreateCheckoutSessionThunk, getCheckoutStore, toggleCheckoutForm } from "@Jetzy/redux/reducers/checkoutSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import React, { useState, useEffect, useCallback, useRef } from "react"
import Spinner from "./misc/Spinner"
import { sendGAEvent } from "@next/third-parties/google"

export default function EventCheckoutModel({ event, eventData }: { event: string; eventData?: any }) {
	// const [acceptTerms, setAcceptTerms] = useState(false)
	const { showCheckout, tickets, isLoading } = useAppSelector(getCheckoutStore)
	const dispatch = useAppDispatch()
	const [phoneError, setPhoneError] = useState("")
	const [waitingListData, setWaitingListData] = useState<any>(null)
	const [showWaitingList, setShowWaitingList] = useState(false)
	const [waitingListRegistered, setWaitingListRegistered] = useState(false)
	const [customAnswers, setCustomAnswers] = useState<Record<string, any>>({})
	const [liveEventData, setLiveEventData] = useState<any>(eventData || null)
	const [checkoutStep, setCheckoutStep] = useState<"details" | "questions">("details")

	// State for form data
	const [formData, setFormData] = useState({
		firstName: "",
		lastName: "",
		email: "",
		phone: "",
		referralCode: "",
	})

	const [referralCodeValid, setReferralCodeValid] = useState<boolean | null>(null)
	const [referralCodeDiscount, setReferralCodeDiscount] = useState<number | null>(null)
	const [validatingReferralCode, setValidatingReferralCode] = useState(false)
	const referralCodeValidationTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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

	// Handle form submission
	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()

		if (checkoutStep === "details") {
			// Check required fields (exclude referralCode as it is optional)
			const requiredFields = { ...formData } as any
			delete requiredFields.referralCode

			const hasFilledAllFields = Object.values(requiredFields).every((value) => value)

			if (!hasFilledAllFields) {
				Error("Form Error", "Please fill in all required fields.")
				return
			}
			
			if ((liveEventData?.questions || []).length > 0) {
				setCheckoutStep("questions")
				return
			}
		} else {
			// Validate required custom questions
			const eventQuestions: any[] = liveEventData?.questions || []
			for (const q of eventQuestions) {
				if (q.isRequired) {
					const ans = customAnswers[q.id]
					if (!ans || (Array.isArray(ans) && ans.length === 0) || ans === '') {
						Error("Required Question", `Please answer: "${q.title}"`)
						return
					}
				}
			}
		}

		sendGAEvent({
			category: "Event",
			action: "Checkout Form Submitted",
			label: event,
		})

		dispatch(
			CreateCheckoutSessionThunk({
				data: {
					tickets: JSON.stringify(tickets),
					user: JSON.stringify(formData),
					referralCode: formData.referralCode?.trim()?.toUpperCase() || undefined,
					customAnswers: JSON.stringify(
						Object.entries(customAnswers).map(([qId, answer]) => ({ questionId: qId, answer }))
					),
				} as any,
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
				// Don't show error message if user is already on waiting list
				if (result.message !== "Already on waiting list") {
					// Only show success message for new registrations
				}
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

	// Fetch live event data (including questions) every time checkout opens
	useEffect(() => {
		if (!showCheckout) return
		const eventId = (tickets[0] as any)?.eventId || eventData?._id
		if (!eventId) return
		
		// Add timestamp to bust browser cache
		fetch(`/api/events/${eventId}?t=${Date.now()}`)
			.then(r => r.json())
			.then(res => {
				if (res?.status && res?.data) {
					console.log("Live event data fetched for checkout:", res.data)
					setLiveEventData(res.data)
				}
			})
			.catch(err => console.error("Failed to fetch live event data:", err))
	}, [showCheckout, tickets])

	return (
		<>
			{showCheckout && (
				<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
					<div className="bg-[#1E1E1E] rounded-2xl shadow-2xl w-full max-w-md relative">
						{/* Close Button */}
						<button
							onClick={() => {
								dispatch(toggleCheckoutForm(false))
								setCheckoutStep("details")
								sendGAEvent({ category: "Event", action: "Checkout Modal Closed", label: event })
							}}
							className="absolute top-2 right-2 bg-black text-white w-8 h-8 rounded-full flex items-center justify-center"
						>
							&times;
						</button>
						{/* <div className="bg-jetzy text-black p-3 rounded-t-2xl text-center font-semibold">This deal is reserved for Jetzy Users Only.</div> */}

						{/* Waiting List UI */}
						{showWaitingList ? (
							<div className="p-6 space-y-6">
								<div className="text-center">
									<div className="w-16 h-16 mx-auto mb-4 bg-[#F79432]/20 rounded-full flex items-center justify-center">
										<svg className="w-8 h-8 text-[#F79432]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
										</svg>
									</div>
									<div className="bg-[#F79432]/20 border border-[#F79432]/30 rounded-lg p-6 mb-6">
										<p className="text-[#F79432] text-2xl font-bold text-center">You are on the waitlist</p>
									</div>
									<p className="text-white mb-6">
										We appreciate your interest. Our event &quot;{waitingListData?.eventName}&quot; is currently {waitingListData?.isClosed ? "closed" : "at capacity"}. We will email you if spots open up and you get on the list.
									</p>
									<div className="mt-6">
										<button
											onClick={() => {
												dispatch(toggleCheckoutForm(false))
											}}
											className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors"
										>
											Close
										</button>
									</div>
								</div>
							</div>
						) : (
							/* Form */
							<form onSubmit={handleSubmit} className="p-6 space-y-6">
								<h2 className="text-2xl font-bold">Checkout</h2>
								
								{checkoutStep === "details" && (
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
									{phoneError && <span className="text-red-500 text-sm">{phoneError}</span>}

									{/* Referral Code Field */}
									<div>
										<label className="block text-sm font-medium text-white mb-1.5">
											Referral Code <span className="text-gray-400 font-normal">(Optional)</span>
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
												className="w-full p-3 bg-[#090C10] border border-[#444444] rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 uppercase text-white"
												style={{ textTransform: "uppercase" }}
											/>
											{validatingReferralCode && (
												<div className="absolute right-3 top-1/2 -translate-y-1/2">
													<Spinner />
												</div>
											)}
										</div>
										{referralCodeValid === true && referralCodeDiscount !== null && (
											<p className="text-sm text-green-500 mt-1.5 font-medium">✓ Valid! You&apos;ll get {referralCodeDiscount}% off your order</p>
										)}
										{referralCodeValid === false && <p className="text-sm text-red-500 mt-1.5">Invalid or inactive referral code</p>}
									</div>
								</div>
								)}

								{/* Custom Questions */}
								{checkoutStep === "questions" && (liveEventData?.questions || []).length > 0 && (
									<div className="space-y-4">
										<h3 className="font-bold text-white border-t border-[#3E3E3E] pt-4">Additional Questions</h3>
										{(liveEventData.questions as any[]).map((q: any) => (
											<div key={q.id}>
												<label className="block text-sm font-medium text-white mb-1">
													{q.title}{q.isRequired && <span className="text-red-400 ml-1">*</span>}
												</label>
												{(q.type === 'text' || q.type === 'mobile' || q.type === 'website' || q.type === 'social_profile') && (
													q.responseLength === 'multi-line'
														? <textarea rows={3} placeholder={q.type === 'mobile' ? 'Phone number' : q.type === 'website' ? 'https://' : q.type === 'social_profile' ? `${q.platform} username` : 'Your answer'} className="w-full p-3 bg-[#090C10] border border-[#444444] rounded-lg focus:outline-none text-white resize-none" value={customAnswers[q.id] || ''} onChange={e => setCustomAnswers(a => ({ ...a, [q.id]: e.target.value }))} />
														: <input type={q.type === 'mobile' ? 'tel' : q.type === 'website' ? 'url' : 'text'} placeholder={q.type === 'mobile' ? 'Phone number' : q.type === 'website' ? 'https://' : q.type === 'social_profile' ? `${q.platform} username` : 'Your answer'} className="w-full p-3 bg-[#090C10] border border-[#444444] rounded-lg focus:outline-none text-white" value={customAnswers[q.id] || ''} onChange={e => setCustomAnswers(a => ({ ...a, [q.id]: e.target.value }))} />
												)}
												{q.type === 'options' && q.selectionType === 'single' && (
													<select className="w-full p-3 bg-[#090C10] border border-[#444444] rounded-lg text-white" value={customAnswers[q.id] || ''} onChange={e => setCustomAnswers(a => ({ ...a, [q.id]: e.target.value }))}>
														<option value="">Select an option</option>
														{(q.options || []).map((opt: string) => <option key={opt} value={opt} style={{ backgroundColor: '#090C10' }}>{opt}</option>)}
													</select>
												)}
												{q.type === 'options' && q.selectionType === 'multiple' && (
													<div className="space-y-1">
														{(q.options || []).map((opt: string) => (
															<label key={opt} className="flex items-center gap-2 text-white cursor-pointer">
																<input type="checkbox" checked={(customAnswers[q.id] || []).includes(opt)} onChange={e => {
																	const prev: string[] = customAnswers[q.id] || []
																	setCustomAnswers(a => ({ ...a, [q.id]: e.target.checked ? [...prev, opt] : prev.filter((x: string) => x !== opt) }))
																}} />
																{opt}
															</label>
														))}
													</div>
												)}
												{q.type === 'checkbox' && (
													<label className="flex items-center gap-2 text-white cursor-pointer">
														<input type="checkbox" checked={!!customAnswers[q.id]} onChange={e => setCustomAnswers(a => ({ ...a, [q.id]: e.target.checked }))} />
														{q.title}
													</label>
												)}
												{q.type === 'company' && (
													<div className="space-y-2">
														<input type="text" placeholder="Company name" className="w-full p-3 bg-[#090C10] border border-[#444444] rounded-lg text-white" value={(customAnswers[q.id] || {}).company || ''} onChange={e => setCustomAnswers(a => ({ ...a, [q.id]: { ...(a[q.id] || {}), company: e.target.value } }))} />
														{q.collectJobTitle && <input type="text" placeholder="Job title" className="w-full p-3 bg-[#090C10] border border-[#444444] rounded-lg text-white" value={(customAnswers[q.id] || {}).jobTitle || ''} onChange={e => setCustomAnswers(a => ({ ...a, [q.id]: { ...(a[q.id] || {}), jobTitle: e.target.value } }))} />}
													</div>
												)}
												{q.type === 'terms' && (
													<div className="space-y-2">
														{q.termsContentType === 'link'
															? <a href={q.termsContent} target="_blank" rel="noreferrer" className="text-blue-400 underline text-sm">{q.termsContent}</a>
															: <p className="text-sm text-gray-300 bg-[#090C10] p-3 rounded-lg border border-[#444]">{q.termsContent}</p>
														}
														<label className="flex items-center gap-2 text-white cursor-pointer">
															<input type="checkbox" checked={(customAnswers[q.id] || {}).agreed || false} onChange={e => setCustomAnswers(a => ({ ...a, [q.id]: { ...(a[q.id] || {}), agreed: e.target.checked } }))} />
															I agree to the terms
														</label>
														{q.collectSignature && <input type="text" placeholder="Type your name as signature" className="w-full p-3 bg-[#090C10] border border-[#444444] rounded-lg text-white" value={(customAnswers[q.id] || {}).signature || ''} onChange={e => setCustomAnswers(a => ({ ...a, [q.id]: { ...(a[q.id] || {}), signature: e.target.value } }))} />}
													</div>
												)}
											</div>
										))}
									</div>
								)}
								{/* <p className="text-sm text-[#A5A5A5]">By signing up, you create a Jetzy account for exclusive deals. Existing accounts won&apos;t be duplicated.</p> */}

								{/* form actions */}
								{checkoutStep === "questions" ? (
									<div className="flex gap-3 pt-2">
										<button type="button" onClick={() => setCheckoutStep("details")} className="w-1/3 border border-[#444] text-white font-bold px-6 py-3 rounded-xl transition-all hover:bg-[#222]">Back</button>
										<button disabled={isLoading} type="submit" className="w-2/3 bg-jetzy text-black font-bold px-6 py-3 rounded-xl transition-all transform hover:scale-105 shadow-lg disabled:opacity-50">
											{isLoading ? <Spinner /> : "Submit"}
										</button>
									</div>
								) : (
									<button
										disabled={isLoading}
										type="submit"
										className="w-full bg-jetzy text-black font-bold px-6 py-3 rounded-xl transition-all transform hover:scale-105 shadow-lg disabled:opacity-50 mt-4"
									>
										{isLoading ? <Spinner /> : ((liveEventData?.questions || []).length > 0 ? "Next" : "Submit")}
									</button>
								)}
							</form>
						)}
					</div>
				</div>
			)}
		</>
	)
}

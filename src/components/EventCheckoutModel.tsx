import { Error } from "@Jetzy/lib/_toaster"
import { CreateCheckoutSessionThunk, getCheckoutStore, toggleCheckoutForm } from "@Jetzy/redux/reducers/checkoutSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import React, { useState, useEffect, useCallback, useRef } from "react"
import Spinner from "./misc/Spinner"
import { sendGAEvent } from "@next/third-parties/google"
import { AUTH_HOLD_DAYS, selectionRequiresApproval } from "@/lib/ticket-approval"
import { buildTicketPricing } from "@/lib/ticket-pricing"
import { membershipQuantityInSelection, premiumAllowanceMessage, selectionMemberships, selectionMembershipInterval } from "@/lib/premium-bundle"
import { MEMBERSHIPS, membershipLabelList, sanitizeMembershipKeys, type MembershipKey } from "@/lib/memberships"
import { ROUTES } from "@/configs/routes"
import { planPriceForInterval, useMembershipPlans } from "@/hooks/usePremiumPlan"
import { usePremiumStatus } from "@/hooks/usePremiumStatus"
import { useSession } from "next-auth/react"
import { StarIcon } from "@heroicons/react/24/solid"
import ReturnToAppButton from "./misc/ReturnToAppButton"
import { cameFromApp } from "@/lib/app-return"
import { trialEndsOn } from "@/lib/invite-trial"

/**
 * "monthly" reads better than "every month" in the billing disclosure, but the interval
 * comes from Stripe and isn't guaranteed to be one of these — anything unrecognised falls
 * back to the literal phrasing rather than inventing an adverb for it.
 */
const RENEWAL_ADVERBS: Record<string, string> = { day: "daily", week: "weekly", month: "monthly", year: "yearly" }
const renewalAdverb = (interval: string) => RENEWAL_ADVERBS[interval] || `every ${interval}`

export default function EventCheckoutModel({ event, eventData }: { event: string; eventData?: any }) {
	// const [acceptTerms, setAcceptTerms] = useState(false)
	const { showCheckout, tickets, isLoading } = useAppSelector(getCheckoutStore)
	const dispatch = useAppDispatch()
	const [phoneError, setPhoneError] = useState("")
	const [waitingListData, setWaitingListData] = useState<any>(null)
	const [showWaitingList, setShowWaitingList] = useState(false)
	const [waitingListRegistered, setWaitingListRegistered] = useState(false)
	const [customAnswers, setCustomAnswers] = useState<Record<string, any>>({})
	const [noAccount, setNoAccount] = useState<Record<string, boolean>>({})
	const [noAccountNote, setNoAccountNote] = useState<Record<string, string>>({})
	const [liveEventData, setLiveEventData] = useState<any>(eventData || null)
	const [checkoutStep, setCheckoutStep] = useState<"details" | "questions">("details")
	const [freeRegistrationSuccess, setFreeRegistrationSuccess] = useState(false)
	const [pendingApproval, setPendingApproval] = useState(false)
	// The free path never leaves the origin, so unlike a Stripe purchase there is no /success
	// page to read the reference off — it has to be kept here to name it on the way back to the app.
	const [freeBookingRef, setFreeBookingRef] = useState<string | undefined>(undefined)
	const [acceptedTerms, setAcceptedTerms] = useState(false)
	// The T&C checkbox sits at the bottom of a long scrolling form, so a buyer who misses it
	// has no idea why nothing happens. Surfaced in the PINNED header, which never scrolls away.
	const [termsError, setTermsError] = useState(false)
	const termsRef = useRef<HTMLLabelElement | null>(null)
	// The buyer has already used part of their Premium allowance for this event.
	const [allowanceError, setAllowanceError] = useState(false)

	// State for form data
	const [formData, setFormData] = useState({
		firstName: "",
		lastName: "",
		email: "",
		phone: "",
		referralCode: "",
	})

	// Does the current selection need host approval, and what will be held/charged?
	const selectionTotal = tickets.reduce((sum, t) => sum + ((t as any).price ?? 0) * ((t as any).quantity ?? 1), 0)
	const selectionNeedsApproval = selectionRequiresApproval(liveEventData, tickets as any)

	const [referralCodeValid, setReferralCodeValid] = useState<boolean | null>(null)
	const [referralCodeDiscount, setReferralCodeDiscount] = useState<number | null>(null)
	// Free months of Jetzy Premium the code grants. Separate from the percentage: a code may do
	// either, both, or neither, and one that gives only free months would otherwise preview as
	// "0% off" — a code that appears to do nothing.
	const [referralFreeMonths, setReferralFreeMonths] = useState<number>(0)

	// Jetzy Premium membership sold with the ticket.
	//
	// Whether the buyer already has one follows the EMAIL TYPED BELOW, not the session — the
	// booking, the ticket and the Jetzy account all attach to that address, so it's the only
	// identity that can't disagree with itself. A guest who already subscribes isn't charged
	// twice, and a logged-in member who types someone else's address doesn't get that other
	// person's membership counted as their own. `src/lib/premium-eligibility.ts` has the full
	// reasoning; the server resolves it again the same way and stays authoritative.
	const { data: session } = useSession()
	const { isPremium: sessionIsPremium } = usePremiumStatus()
	const sessionEmail = session?.user?.email || ""
	// Which memberships does the CURRENT selection sell? One ticket may sell both.
	const selectionKeys = selectionMemberships(tickets as any)
	const selectionSellsPremium = selectionKeys.length > 0
	// null = not checked yet (or the address just changed) — distinct from a checked "none".
	const [heldByEmail, setHeldByEmail] = useState<MembershipKey[] | null>(null)
	const [checkingPremiumEmail, setCheckingPremiumEmail] = useState(false)
	const premiumEmailTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	// Monotonic id so a slow reply for a previous address can't overwrite a newer verdict.
	const premiumCheckIdRef = useRef(0)
	const { plans: membershipPlans } = useMembershipPlans(selectionKeys)
	// Charged only for the memberships this ticket sells that this address doesn't already
	// hold — so a buyer with one of two still pays for the other.
	const chargedKeys = heldByEmail === null ? [] : selectionKeys.filter((key) => !heldByEmail.includes(key))
	const heldSelectionKeys = heldByEmail === null ? [] : selectionKeys.filter((key) => heldByEmail.includes(key))
	// How many more membership tickets this address may buy for THIS event, per product.
	// null = not checked.
	const [allowanceRemaining, setAllowanceRemaining] = useState<Record<string, number> | null>(null)
	// The tightest remaining allowance across the products this selection sells — what the
	// error message quotes.
	const bindingAllowance =
		allowanceRemaining === null
			? null
			: selectionKeys.reduce<{ key: MembershipKey; remaining: number } | null>((tightest, key) => {
				const remaining = allowanceRemaining[key]
				if (typeof remaining !== "number") return tightest
				return !tightest || remaining < tightest.remaining ? { key, remaining } : tightest
			}, null)

	// Live preview of what the buyer will actually pay. Built with the same helper the
	// server, the confirmation email and the success page use, so all four agree — but the
	// server recomputes independently and stays authoritative.
	const appliedReferralPercentage = referralCodeValid === true ? (referralCodeDiscount ?? 0) : 0
	// The interval the SELECTED TICKET sells at, not the product default — an annual ticket
	// must disclose $200/year here, because that is what `api/checkout` will charge.
	const bundleInterval = selectionMembershipInterval(tickets as any)
	// Free months apply to Jetzy Premium only — Full Concierge is sold on someone else's terms —
	// and only when this order is actually buying Premium. A code carrying months is otherwise
	// worth nothing here: the selected ticket may not sell membership at all, or the buyer may
	// already hold it, and promising free months in either case describes a gift nobody gets.
	const appliedFreeMonths = referralCodeValid === true && chargedKeys.includes("premium") ? referralFreeMonths : 0
	// Memberships still being PAID for today. A gifted one is charged nothing now, so it is
	// neither part of the hold nor part of "due today" — saying otherwise overstates both.
	const paidChargedKeys = chargedKeys.filter((key) => !(key === "premium" && appliedFreeMonths > 0))
	const recurringPreview = chargedKeys
		.map((key) => membershipPlans.find((plan) => plan.key === key))
		.filter((plan): plan is NonNullable<typeof plan> => !!plan)
		.map((plan) => ({ plan, price: planPriceForInterval(plan, bundleInterval) }))
		.filter(({ price }) => price.amount != null)
		.map(({ plan, price }) => ({
			label: MEMBERSHIPS[plan.key].receiptLabel,
			amount: price.amount as number,
			interval: price.interval,
			// `amount` stays the real recurring price so it can be disclosed; `trialMonths` is
			// what keeps it out of `dueToday`.
			...(appliedFreeMonths > 0 && plan.key === "premium" ? { trialMonths: appliedFreeMonths } : {}),
		}))
	// "$20/month", or "$20/month after 2 free months" when a referral code gave them away.
	const renewalPhrase = (m: { amount: number; interval: string; trialMonths?: number }) => {
		const rate = `${m.amount.toLocaleString("en-US", { style: "currency", currency: "usd" })}/${m.interval}`
		return m.trialMonths ? `${rate} after ${m.trialMonths} free ${m.trialMonths === 1 ? "month" : "months"}` : rate
	}
	const pricing = buildTicketPricing({
		subtotal: selectionTotal,
		referralCode: appliedReferralPercentage > 0 ? formData.referralCode?.trim().toUpperCase() : undefined,
		referralPercentage: appliedReferralPercentage,
		...(recurringPreview.length > 0 ? { recurring: recurringPreview } : {}),
	})
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
		if (name === "email") {
			// Drop the previous verdicts immediately so neither the total nor the allowance
			// keeps describing a different address. The debounced effect re-checks both.
			setHeldByEmail(null)
			setAllowanceRemaining(null)
			setAllowanceError(false)
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
		const eventId = (tickets[0] as any)?.eventId || eventData?._id
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
				setReferralFreeMonths(Number(result.data.freeMembershipMonths) || 0)
			} else {
				setReferralCodeValid(false)
				setReferralCodeDiscount(null)
				setReferralFreeMonths(0)
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
	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()

		if (checkoutStep === "details") {
			if (!acceptedTerms) {
				// Banner in the pinned header + scroll the checkbox into view. The toast alone
				// isn't enough: the box is off-screen at the bottom of the form, so being told
				// to tick it doesn't tell you where it is.
				setTermsError(true)
				Error("Terms Required", "Please agree to the Terms & Conditions to continue.")
				termsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
				return
			}

			// The per-event membership allowance, counted per product across every order this
			// address has placed. The server re-checks; this just avoids a pointless trip to
			// Stripe.
			const exceeded = selectionKeys.find((key) => {
				const remaining = allowanceRemaining?.[key]
				return typeof remaining === "number" && membershipQuantityInSelection(tickets as any, key) > remaining
			})
			if (exceeded) {
				setAllowanceError(true)
				Error("Ticket limit reached", premiumAllowanceMessage(allowanceRemaining?.[exceeded] ?? 0, exceeded))
				return
			}

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
				const ans = customAnswers[q.id]
				if (q.isRequired) {
					if (!ans || (Array.isArray(ans) && ans.length === 0) || ans === '') {
						Error("Required Question", `Please answer: "${q.title}"`)
						return
					}
				}

				// Validate URL format for social profiles and websites (skip if user opted out of social)
				if ((q.type === 'social_profile' || q.type === 'website') && !noAccount[q.id] && ans && typeof ans === 'string' && ans.trim() !== '') {
					const urlPattern = /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/i;
					if (!urlPattern.test(ans)) {
						Error("Invalid URL", `Please enter a valid URL for: "${q.title}" (e.g., https://...)`)
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

		// Detect free ticket flow — skip Stripe and register directly. Paid approval orders
		// still go through Stripe; they just authorize instead of charge.
		//
		// The decision is on what is actually DUE, not on the ticket prices. An order discounted
		// all the way to $0 has nothing for Stripe to do — and an approval order asking Stripe
		// to authorize $0 with manual capture is rejected outright, which used to surface as
		// an opaque failure at the very end of checkout.
		//
		// `dueToday`, not `total`: a 100%-off referral code on a ticket that also sells a
		// membership still owes that membership's first period. Reading `total` sent such an
		// order down the free path, which issues a booking with no charge and no subscription —
		// the buyer got the ticket and quietly lost the membership they were promised. The
		// server enforces the same rule in `api/checkout/free-events`.
		if ((pricing.dueToday ?? pricing.total) === 0) {
			const eventId = (tickets[0] as any)?.eventId || eventData?._id
			const customAnswersArray = Object.entries(customAnswers).map(([qId, answer]) => ({ questionId: qId, answer }))
			try {
				const response = await fetch('/api/checkout/free-events', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						tickets: JSON.stringify(tickets),
						user: JSON.stringify(formData),
						eventId,
						// Sent so the server can reproduce the same $0 and record WHY it was free.
						referralCode: formData.referralCode?.trim()?.toUpperCase() || undefined,
						customAnswers: JSON.stringify(customAnswersArray),
						acceptedTerms: acceptedTerms,
					}),
				})
				const result = await response.json()
				if (result.status) {
					setFreeBookingRef(result.data?.bookingRef)
					if (result.data?.pendingApproval) {
						setPendingApproval(true)
					} else {
						setFreeRegistrationSuccess(true)
						// The reload refreshes remaining capacity for a buyer who is staying on the
						// page. For one who came from the app it would destroy the return link
						// before they could tap it, and they are not staying anyway.
						if (!cameFromApp()) setTimeout(() => window.location.reload(), 2500)
					}
				} else {
					Error("Registration Failed", result.message || "Something went wrong. Please try again.")
				}
			} catch (err) {
				console.error("Free ticket registration error:", err)
				Error("Error", "Something went wrong. Please try again.")
			}
			return
		}

		dispatch(
			CreateCheckoutSessionThunk({
				data: {
					tickets: JSON.stringify(tickets),
					user: JSON.stringify(formData),
					referralCode: formData.referralCode?.trim()?.toUpperCase() || undefined,
					acceptedTerms: acceptedTerms,
					customAnswers: JSON.stringify(
						Object.entries(customAnswers).map(([qId, answer]) => ({ questionId: qId, answer }))
					),
					// Stripe is about to take the browser off-origin. Sent so the server can stamp
					// the marker onto the success/cancel URLs it comes back to — see lib/app-return.
					fromApp: cameFromApp(),
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

	// Prefill from the session and from the ?ref= link the buyer arrived on, once per open.
	// Prefilling the email matters beyond convenience: it's what stops a logged-in Premium
	// member from typing a different address by default and losing their discount.
	useEffect(() => {
		if (!showCheckout) return

		if (session?.user) {
			const [firstFromName = "", ...restOfName] = (session.user.name || "").trim().split(/\s+/)
			setFormData((prev) => ({
				...prev,
				email: prev.email || sessionEmail,
				firstName: prev.firstName || (session.user as any)?.firstName || firstFromName,
				lastName: prev.lastName || (session.user as any)?.lastName || restOfName.join(" "),
			}))
		}

		// `[slug].tsx` stashes ?ref= here on arrival — until now nothing read it back, so a
		// buyer who followed a referral link still had to type the code by hand.
		try {
			const storedReferral = window.sessionStorage.getItem("jetzy_referral_code")
			if (storedReferral) {
				setFormData((prev) => (prev.referralCode ? prev : { ...prev, referralCode: storedReferral.toUpperCase().trim() }))
				handleValidateReferralCode(storedReferral)
			}
		} catch {
			// sessionStorage can throw in private-mode/embedded browsers — prefill is optional.
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [showCheckout, sessionEmail])

	// Which memberships is the address in the form already attached to?
	// Preview only — `api/checkout` resolves it again server-side before charging.
	const checkPremiumEmail = useCallback(async (email: string, sellsPremium: boolean, eventId?: string) => {
		const trimmed = email.trim()

		// Nothing to gain by asking when no selected ticket sells a membership.
		if (!sellsPremium || !eventId || !trimmed || !/^\S+@\S+\.\S+$/.test(trimmed)) {
			setHeldByEmail(null)
			setAllowanceRemaining(null)
			return
		}

		// Only the newest request may write. Debouncing narrows the window but doesn't close
		// it — two addresses can still be in flight at once, and a slow reply for the previous
		// one landing last would show a verdict for an address the buyer already changed.
		const requestId = ++premiumCheckIdRef.current

		setCheckingPremiumEmail(true)
		try {
			const response = await fetch("/api/premium/check-email", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: trimmed, eventId }),
			})
			const result = await response.json()
			if (requestId !== premiumCheckIdRef.current) return
			setHeldByEmail(result?.status ? sanitizeMembershipKeys(result?.data?.held) : [])
			// Membership status and remaining allowance come back together — one request,
			// one debounce, one rate-limit bucket.
			const allowances = result?.data?.allowances
			setAllowanceRemaining(
				allowances && typeof allowances === "object"
					? Object.keys(allowances).reduce((acc, key) => {
						const remaining = allowances[key]?.remaining
						if (typeof remaining === "number") acc[key] = remaining
						return acc
					}, {} as Record<string, number>)
					: null,
			)
		} catch (error) {
			console.error("Error checking membership status for email:", error)
			if (requestId !== premiumCheckIdRef.current) return
			// Treat an unreachable check as "not a member of anything": that shows every
			// membership charge in the preview. Erring the other way would hide a recurring
			// charge the server may still apply, which is the worse surprise. The server decides
			// for real either way.
			setHeldByEmail([])
			// Leave the allowance unknown rather than guessing — the server enforces it, and
			// blocking a legitimate buyer on a failed lookup would be worse than a rejected
			// checkout with a clear message.
			setAllowanceRemaining(null)
		} finally {
			if (requestId === premiumCheckIdRef.current) setCheckingPremiumEmail(false)
		}
	}, [])

	// Re-check whenever the address settles. Depends on the event ID as a string rather than
	// the redux ticket array, so a new array identity can't keep re-arming the debounce and
	// stop the check from ever firing.
	const checkoutEventId: string | undefined = (tickets[0] as any)?.eventId || eventData?._id
	useEffect(() => {
		if (!showCheckout) return
		if (premiumEmailTimeoutRef.current) clearTimeout(premiumEmailTimeoutRef.current)
		premiumEmailTimeoutRef.current = setTimeout(() => {
			checkPremiumEmail(formData.email, selectionSellsPremium, checkoutEventId)
		}, 500)
		return () => {
			if (premiumEmailTimeoutRef.current) clearTimeout(premiumEmailTimeoutRef.current)
		}
	}, [showCheckout, formData.email, selectionSellsPremium, checkoutEventId, checkPremiumEmail])

	// Fetch live event data (including questions) every time checkout opens
	useEffect(() => {
		if (!showCheckout) {
			setFreeRegistrationSuccess(false)
			setPendingApproval(false)
			setAcceptedTerms(false)
			setTermsError(false)
			setAllowanceError(false)
			setAllowanceRemaining(null)
			return
		}
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
				<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
					{/* Wide only for the two-column checkout form. The success, waiting-list and
					    pending-approval panels are a few lines each — 4xl would strand them in
					    the middle of a very empty box. */}
					<div
						className={`bg-[#1E1E1E] rounded-2xl shadow-2xl w-full relative max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden ${
							pendingApproval || freeRegistrationSuccess || showWaitingList || selectionTotal <= 0 ? "max-w-lg" : "max-w-4xl"
						}`}
					>
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

						{/* Pending Approval UI */}
						{pendingApproval ? (
							<div className="p-6 space-y-6">
								<div className="text-center">
									<div className="w-16 h-16 mx-auto mb-4 bg-[#F79432]/20 rounded-full flex items-center justify-center">
										<svg className="w-8 h-8 text-[#F79432]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
										</svg>
									</div>
									<div className="bg-[#F79432]/20 border border-[#F79432]/30 rounded-lg p-6 mb-6">
										<p className="text-[#F79432] text-2xl font-bold text-center">Request Submitted</p>
									</div>
									<p className="text-white mb-2">
										Your request to attend <strong>&quot;{event}&quot;</strong> has been submitted for approval.
									</p>
									<p className="text-gray-400 text-sm mb-6">The host will review your request. If approved, a confirmation email will be sent to {formData.email}.</p>
									<ReturnToAppButton
										eventId={checkoutEventId}
										bookingRef={freeBookingRef}
										status="pending_approval"
										className="inline-block bg-jetzy text-black font-bold px-6 py-2 rounded-lg hover:opacity-90 transition-colors"
										fallback={
											<button
												onClick={() => dispatch(toggleCheckoutForm(false))}
												className="bg-jetzy text-black font-bold px-6 py-2 rounded-lg hover:opacity-90 transition-colors"
											>
												Close
											</button>
										}
									/>
								</div>
							</div>
						) : /* Free Registration Success UI */
						freeRegistrationSuccess ? (
							<div className="p-6 space-y-6">
								<div className="text-center">
									<div className="w-16 h-16 mx-auto mb-4 bg-green-500/20 rounded-full flex items-center justify-center">
										<svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
										</svg>
									</div>
									<div className="bg-green-500/20 border border-green-500/30 rounded-lg p-6 mb-6">
										<p className="text-green-400 text-2xl font-bold text-center">Registration Confirmed!</p>
									</div>
									<p className="text-white mb-2">
										You have successfully registered for <strong>&quot;{event}&quot;</strong>.
									</p>
									<p className="text-gray-400 text-sm mb-6">A confirmation email has been sent to {formData.email}.</p>
									<ReturnToAppButton
										eventId={checkoutEventId}
										bookingRef={freeBookingRef}
										status="confirmed"
										className="inline-block bg-jetzy text-black font-bold px-6 py-2 rounded-lg hover:opacity-90 transition-colors"
										fallback={
											<button
												onClick={() => dispatch(toggleCheckoutForm(false))}
												className="bg-jetzy text-black font-bold px-6 py-2 rounded-lg hover:opacity-90 transition-colors"
											>
												Close
											</button>
										}
									/>
								</div>
							</div>
						) : /* Waiting List UI */
						showWaitingList ? (
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
							<form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
								{/* Pinned header */}
								<div className="px-4 sm:px-6 pt-6 pb-2 shrink-0">
									<h2 className="text-2xl font-bold">Checkout</h2>
									{/* Stays visible while the buyer scrolls back down to find the box. */}
									{termsError && checkoutStep === "details" && (
										<button
											type="button"
											onClick={() => termsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
											className="w-full text-left mt-3 rounded-lg p-3 bg-red-500/15 border border-red-500/50"
										>
											<p className="text-red-400 text-sm font-semibold">Terms &amp; Conditions required</p>
											<p className="text-gray-300 text-xs mt-0.5">
												Tick the box at the bottom of this form to continue. <span className="underline">Take me there</span>
											</p>
										</button>
									)}

									{/* The allowance is spent — there is no box to tick, so this explains
									    rather than pointing anywhere. */}
									{allowanceError && checkoutStep === "details" && bindingAllowance !== null && (
										<div className="mt-3 rounded-lg p-3 bg-red-500/15 border border-red-500/50">
											<p className="text-red-400 text-sm font-semibold">Ticket limit reached</p>
											<p className="text-gray-300 text-xs mt-0.5">{premiumAllowanceMessage(bindingAllowance.remaining, bindingAllowance.key)}</p>
										</div>
									)}
								</div>

								{/* Scrollable content */}
								{/* Body. Two columns from `lg` up — the form on the left, the money on the
								    right — and one column below that. Halving the height is what keeps the
								    whole dialog on screen without scrolling on a normal laptop.
								
								    `overflow-y-auto` stays as a FALLBACK, not as the design. On a short window,
								    or with several membership blocks and an error banner showing, dropping it
								    would put the T&C box and the submit button out of reach and make checkout
								    impossible. A scrollbar that rarely appears beats content nobody can get to. */}
								<div
									className={`flex-1 overflow-y-auto px-4 sm:px-6 py-2 ${
										selectionTotal > 0 ? "lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6 lg:items-start" : ""
									}`}
								>
									<div className="space-y-4">
									{checkoutStep === "details" && (
									<div className="space-y-4">
										{/* Approval notice for the CURRENT selection. Paid selections spell out that
										    the card is only authorized, since that is the part guests get wrong. */}
										{selectionNeedsApproval && (
											<div className="bg-[#F79432]/15 border border-[#F79432]/40 rounded-lg p-3">
												<p className="text-[#F79432] font-semibold text-sm">Approval Required</p>
												<p className="text-gray-300 text-xs mt-1">
													{/* Quote what Stripe actually holds: the DISCOUNTED ticket total, plus
													    the first membership period when one is being charged. `dueToday`
													    already carries that sum.

													    Branches on `chargedKeys`, NOT on what the ticket sells — a buyer who
													    already has the membership is only being held for the ticket, so the
													    "covers your first month" wording would overstate the hold.

													    The period follows the TICKET's interval — an annual bundle holds a
													    full year, which is a materially larger authorization to disclose. */}
													{selectionTotal <= 0
														? "Your registration is subject to host approval."
														: paidChargedKeys.length > 0
															? `Your card will be authorized for ${(pricing.dueToday ?? pricing.total).toLocaleString("en-US", { style: "currency", currency: "usd" })} now to cover your ticket and first ${bundleInterval === "year" ? "year" : "month"} of ${membershipLabelList(paidChargedKeys)}. You are only charged and subscribed if approved; otherwise, the hold is automatically released within ${AUTH_HOLD_DAYS} days.`
															: chargedKeys.length > 0
																? `Your card will be authorized for ${pricing.total.toLocaleString("en-US", { style: "currency", currency: "usd" })} now to cover your ticket only — your ${membershipLabelList(chargedKeys)} is free for ${appliedFreeMonths} ${appliedFreeMonths === 1 ? "month" : "months"} and starts if the host approves. You are only charged if approved; otherwise, the hold is automatically released within ${AUTH_HOLD_DAYS} days.`
																: `Your card will be authorized for ${pricing.total.toLocaleString("en-US", { style: "currency", currency: "usd" })} now but only charged if the host approves. The hold is automatically released if declined or if the host doesn't respond within ${AUTH_HOLD_DAYS} days.`}
												</p>
											</div>
										)}
										{/* Referral Code Field — first */}
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
														if (referralCodeValidationTimeoutRef.current) {
															clearTimeout(referralCodeValidationTimeoutRef.current)
														}
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
													className="w-full p-3 bg-[#090C10] border border-[#444444] rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-white"
												/>
												{validatingReferralCode && (
													<div className="absolute right-3 top-1/2 -translate-y-1/2">
														<Spinner />
													</div>
												)}
											</div>
											{referralCodeValid === true && referralCodeDiscount !== null && (
												<p className="text-sm text-green-500 mt-1.5 font-medium">
													{`✓ ${
														[
															referralCodeDiscount > 0 ? `You'll get ${referralCodeDiscount}% off your order` : "",
															// `appliedFreeMonths`, not the raw code value — see above.
															appliedFreeMonths > 0
																? `${appliedFreeMonths} ${appliedFreeMonths === 1 ? "month" : "months"} of Jetzy Premium free`
																: "",
														]
															.filter(Boolean)
															.join(" + ") || "Referral code is valid"
													}`}
												</p>
											)}
											{referralCodeValid === false && <p className="text-sm text-red-500 mt-1.5">Invalid or inactive referral code</p>}
										</div>
										<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
										</div>
										<div>
											<div className="relative">
												<input
													type="email"
													name="email"
													placeholder="Email"
													value={formData.email}
													onChange={handleInputChange}
													className="w-full p-3 bg-[#090C10] border border-[#444444] rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
													required
												/>
												{checkingPremiumEmail && (
													<div className="absolute right-3 top-1/2 -translate-y-1/2">
														<Spinner />
													</div>
												)}
											</div>

											{/* Membership status for THIS address. Only shown when the selected
											    ticket actually sells a membership — otherwise it's noise.
											    The address decides whether a recurring charge is added, so this
											    is a price disclosure, not a nicety. */}
											{selectionSellsPremium && !checkingPremiumEmail && (
												<>
													{/* ---- Already a member on THIS address ----
													    Named individually, because a buyer holding one of two still has to
													    see that the other one is being charged.

													    "Logged in as" only when the session email IS the typed address:
													    membership follows the address typed here, so a logged-out guest
													    entering a member's email must not be told they're logged in as
													    someone else. */}
													{heldSelectionKeys.length > 0 && (
														<div className="mt-1.5 rounded-lg p-2.5" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.4)" }}>
															<p className="text-xs text-green-400">
																🎟️ {membershipLabelList(heldSelectionKeys)} Active Member:{" "}
																{sessionEmail && sessionEmail.trim().toLowerCase() === formData.email.trim().toLowerCase()
																	? `Logged in as ${sessionEmail}.`
																	: `${formData.email.trim()}.`}{" "}
																Your existing membership applies to this ticket
															</p>
															<a
																href={ROUTES.manageMembership}
																target="_blank"
																rel="noreferrer"
																className="text-xs underline text-green-400 mt-1 inline-block"
															>
																Click here to cancel/manage subscription
															</a>
														</div>
													)}

													{/* ---- Not held on this address: these memberships WILL be charged ----
													    One block each, so two products can't be collapsed into one price. */}
													{chargedKeys.length > 0 && (
														<div className="mt-1.5 rounded-lg p-2.5 space-y-2" style={{ background: "rgba(245,197,24,0.12)", border: "1px solid rgba(245,197,24,0.4)" }}>
															{chargedKeys.map((key) => {
																const plan = membershipPlans.find((p) => p.key === key)
																const name = plan?.name || MEMBERSHIPS[key].label
																// Priced at the TICKET's interval, matching the order summary beside it
																// and what `api/checkout` will charge. Reading the product default here
																// disclosed "$20/month, renews monthly" against a $200/year charge.
																const price = plan ? planPriceForInterval(plan, bundleInterval) : null
																const interval = price?.interval || plan?.interval || "month"
																// Premium only — the code never touches Full Concierge.
																const freeMonths = key === "premium" ? appliedFreeMonths : 0
																const trialChargesFrom = trialEndsOn({ months: freeMonths, intervals: [], label: "" }).toLocaleDateString(
																	"en-US",
																	{ month: "short", day: "numeric", year: "numeric" },
																)
																return (
																	<div key={key} className="flex items-start gap-2">
																		<StarIcon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#F5C518" }} />
																		<div style={{ color: "#F5C518" }}>
																			<p className="text-xs font-semibold">
																				🎟️ {name}
																				{freeMonths > 0
																					? ` — ${freeMonths} ${freeMonths === 1 ? "month" : "months"} free`
																					: price?.label
																						? ` — ${price.label}`
																						: ""}
																			</p>
																			{/* On an approval ticket nothing is charged yet — the membership
																			    is held alongside the ticket and only starts if the host
																			    approves. On an instant ticket the card IS charged now, so the
																			    two must say different things about when money moves; the
																			    approval wording on an instant purchase would be a false
																			    statement about a charge at the point of sale. */}
																			<p className="text-xs mt-1">
																				{MEMBERSHIPS[key].checkoutBlurb}{" "}
																				{/* Three different statements about when money moves, and each has to be
																				    true of the order in front of the buyer: a trial charges nothing now
																				    but WILL charge later, an approval order charges only if approved, and
																				    an instant order charges today. Saying "charged today" over a free
																				    trial, or hiding the price that follows one, are both misstatements at
																				    the point of sale. */}
																				{freeMonths > 0
																					? `Free for ${freeMonths} ${freeMonths === 1 ? "month" : "months"}${
																							price?.label ? `, then ${price.label}` : ""
																					  } from ${trialChargesFrom}. Cancel any time before then and you won't be charged.`
																					: selectionNeedsApproval
																						? `Charged only if your registration is approved and renews ${renewalAdverb(interval)} until canceled.`
																						: `Charged with your ticket today and renews ${renewalAdverb(interval)} until canceled.`}
																			</p>
																		</div>
																	</div>
																)
															})}

															<p className="text-xs" style={{ color: "#F5C518" }}>
																Cancel anytime:{" "}
																<a
																	href={ROUTES.manageMembership}
																	target="_blank"
																	rel="noreferrer"
																	className="underline"
																	style={{ color: "#F79432" }}
																>
																	Manage subscription
																</a>
															</p>

															{/* The mismatch case: they ARE a member, but on a different address.
															    Left as-is they'd be billed a SECOND subscription — so this is a
															    warning about a duplicate charge, not an upsell. Only rendered when
															    there is actually another address to switch to. */}
															{sessionIsPremium && sessionEmail && chargedKeys.includes("premium") && (
																<button
																	type="button"
																	onClick={() => {
																		setFormData((prev) => ({ ...prev, email: sessionEmail }))
																		setHeldByEmail(null)
																	}}
																	className="text-xs underline text-left"
																	style={{ color: "#F79432" }}
																>
																	Use {sessionEmail} here to use your membership and prevent duplicate billing
																</button>
															)}
														</div>
													)}

													{heldByEmail === null && (
														<p className="text-xs text-gray-400 mt-1.5">
															This ticket includes {membershipLabelList(selectionKeys)}
															{membershipPlans.every((p) => p.label)
																? ` at ${membershipPlans.map((p) => `${p.name} ${p.label}`).join(" and ")}`
																: ""}
															. Enter your email — if you&apos;re already a member, you won&apos;t be charged for it again.
														</p>
													)}
												</>
											)}
										</div>
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

										{/* Terms & Conditions — required to register.
										    The account-creation sentence that used to sit here now lives in
										    the Terms themselves (§1.1: "By registering, you expressly agree to
										    create a Jetzy Account…"), which is what this box consents to and
										    what `acceptedTerms` records. The consent is unchanged; only where
										    it is spelled out has moved. */}
										<label
											ref={termsRef}
											className={`flex items-start gap-2 text-white cursor-pointer text-sm rounded-lg transition-colors ${termsError ? "bg-red-500/10 border border-red-500/50 p-2.5 -m-0.5" : ""}`}
										>
											<input
												type="checkbox"
												checked={acceptedTerms}
												onChange={(e) => {
													setAcceptedTerms(e.target.checked)
													if (e.target.checked) setTermsError(false)
												}}
												className="mt-0.5"
											/>
											<span>
												I agree to the <a href="/terms" target="_blank" rel="noreferrer" className="text-[#F79432] underline">Terms &amp; Conditions</a>.
											</span>
										</label>

										{/* The separate "I want to become a Jetzy Premium member" checkbox was
										    removed: the recurring terms now live in the Terms & Conditions the box
										    above links to. The DISCLOSURE blocks stay, and must — the amount, the
										    interval and "renews until you cancel" are still stated under the email
										    field and in the order summary, so the recurring charge is never
										    invisible at the point of purchase. */}
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
													{(q.type === 'text' || q.type === 'mobile' || q.type === 'website') && (
														q.responseLength === 'multi-line'
															? <textarea rows={3} placeholder={q.type === 'mobile' ? 'Phone number' : q.type === 'website' ? 'https://' : 'Your answer'} className="w-full p-3 bg-[#090C10] border border-[#444444] rounded-lg focus:outline-none text-white resize-none" value={customAnswers[q.id] || ''} onChange={e => setCustomAnswers(a => ({ ...a, [q.id]: e.target.value }))} />
															: <input type={q.type === 'mobile' ? 'tel' : q.type === 'website' ? 'url' : 'text'} placeholder={q.type === 'mobile' ? 'Phone number' : q.type === 'website' ? 'https://' : 'Your answer'} className="w-full p-3 bg-[#090C10] border border-[#444444] rounded-lg focus:outline-none text-white" value={customAnswers[q.id] || ''} onChange={e => setCustomAnswers(a => ({ ...a, [q.id]: e.target.value }))} />
													)}
													{q.type === 'social_profile' && (
														<div className="space-y-2">
															<input
																type="text"
																placeholder={`${q.platform ? q.platform.charAt(0).toUpperCase() + q.platform.slice(1) : 'Social'} profile URL (e.g. https://)`}
																disabled={!!noAccount[q.id]}
																className="w-full p-3 bg-[#090C10] border border-[#444444] rounded-lg focus:outline-none text-white disabled:opacity-40"
																value={noAccount[q.id] ? '' : (customAnswers[q.id] || '')}
																onChange={e => setCustomAnswers(a => ({ ...a, [q.id]: e.target.value }))}
															/>
															<label className="flex items-center gap-2 text-white cursor-pointer text-sm">
																<input
																	type="checkbox"
																	checked={!!noAccount[q.id]}
																	onChange={e => {
																		const checked = e.target.checked
																		setNoAccount(s => ({ ...s, [q.id]: checked }))
																		if (checked) {
																			setCustomAnswers(a => ({ ...a, [q.id]: noAccountNote[q.id] || `I don't have ${q.platform}` }))
																		} else {
																			setCustomAnswers(a => ({ ...a, [q.id]: '' }))
																		}
																	}}
																/>
																{`I don't have ${q.platform ? q.platform.charAt(0).toUpperCase() + q.platform.slice(1) : 'this'}`}
															</label>
															{noAccount[q.id] && (
																<input
																	type="text"
																	placeholder={`Optional: let the host know (e.g. I prefer not to share)`}
																	className="w-full p-3 bg-[#090C10] border border-[#444444] rounded-lg focus:outline-none text-white"
																	value={noAccountNote[q.id] || ''}
																	onChange={e => {
																		const note = e.target.value
																		setNoAccountNote(s => ({ ...s, [q.id]: note }))
																		setCustomAnswers(a => ({ ...a, [q.id]: note || `I don't have ${q.platform}` }))
																	}}
																/>
															)}
														</div>
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
													{q.type === 'multiple_choice' && (
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
														q.options && q.options.length > 0
															? <div className="space-y-1">
																{q.options.map((opt: string) => (
																	<label key={opt} className="flex items-center gap-2 text-white cursor-pointer">
																		<input type="checkbox" checked={(customAnswers[q.id] || []).includes(opt)} onChange={e => {
																			const prev: string[] = customAnswers[q.id] || []
																			setCustomAnswers(a => ({ ...a, [q.id]: e.target.checked ? [...prev, opt] : prev.filter((x: string) => x !== opt) }))
																		}} />
																		{opt}
																	</label>
																))}
															</div>
															: <label className="flex items-center gap-2 text-white cursor-pointer">
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
									</div>

									{/* Order summary. Only for paid selections — a free RSVP has nothing to
									    break down and the rows would just be noise. */}
									{selectionTotal > 0 && (
										<div className="pt-4 lg:pt-0">
											<div className="rounded-lg bg-[#1A1A1A] border border-[#2E2E2E] p-3 text-sm">
												<div className="flex justify-between text-gray-300">
													<span>Subtotal</span>
													<span>{pricing.subtotal.toLocaleString("en-US", { style: "currency", currency: "usd" })}</span>
												</div>
												{pricing.lines.map((line) => (
													<div key={line.label} className="flex justify-between text-green-400 mt-1">
														<span>{line.label}</span>
														<span>-{line.amount.toLocaleString("en-US", { style: "currency", currency: "usd" })}</span>
													</div>
												))}
												<div className="flex justify-between font-bold text-white mt-2 pt-2 border-t border-[#2E2E2E]">
													{/* Only qualify it as the TICKET total when a membership row follows —
													    otherwise "Ticket total" reads as though something else is coming. */}
													<span>{pricing.recurring?.length ? "Ticket total" : "Total"}</span>
													<span>{pricing.total.toLocaleString("en-US", { style: "currency", currency: "usd" })}</span>
												</div>

												{/* Each membership is an ADDITION, not a discount, and it recurs — so
												    every one gets its own row, with a single "due today" line below,
												    rather than being folded into the ticket total. */}
												{!!pricing.recurring?.length && (
													<>
														{pricing.recurring.map((membership) => (
															<div key={membership.label} className="flex justify-between mt-1" style={{ color: "#F5C518" }}>
																<span>{membership.label}</span>
																<span>
																	{membership.trialMonths
																		? `Free for ${membership.trialMonths} ${membership.trialMonths === 1 ? "month" : "months"}, then ${membership.amount.toLocaleString("en-US", { style: "currency", currency: "usd" })}/${membership.interval}`
																		: `${membership.amount.toLocaleString("en-US", { style: "currency", currency: "usd" })}/${membership.interval}`}
																</span>
															</div>
														))}
														<div className="flex justify-between font-bold text-white mt-2 pt-2 border-t border-[#2E2E2E]">
															{/* Nothing is taken on an approval order — it's a hold, not a charge. */}
															<span>{selectionNeedsApproval ? "Held today" : "Due today"}</span>
															<span>{(pricing.dueToday ?? pricing.total).toLocaleString("en-US", { style: "currency", currency: "usd" })}</span>
														</div>
														<p className="text-xs text-gray-400 mt-2">
															{/* One phrase per membership, because a single order can mix a gifted
															    one with a paid one and a single rate would misdescribe both. The
															    free months are named here as well as above: this is the sentence
															    that says what happens AFTER them. */}
															{selectionNeedsApproval
																? `If the host approves, you're charged this amount and your ${pricing.recurring.length > 1 ? "memberships begin" : "membership begins"}, renewing at ${pricing.recurring
																	.map((m) => renewalPhrase(m))
																	.join(" and ")} until you cancel. If they decline, nothing is charged.`
																: `Your ${pricing.recurring.length > 1 ? "memberships then renew" : "membership then renews"} at ${pricing.recurring
																	.map((m) => renewalPhrase(m))
																	.join(" and ")} until you cancel. You can cancel any time from your account.`}
														</p>
													</>
												)}
											</div>
										</div>
									)}
								</div>

								{/* Pinned action buttons */}
								<div className="px-4 sm:px-6 py-4 shrink-0 border-t border-[#2E2E2E]">
									{checkoutStep === "questions" ? (
										<div className="flex gap-3">
											<button type="button" onClick={() => setCheckoutStep("details")} className="w-1/3 border border-[#444] text-white font-bold px-6 py-3 rounded-xl transition-all hover:bg-[#222]">Back</button>
											<button disabled={isLoading} type="submit" className="w-2/3 bg-jetzy text-black font-bold px-6 py-3 rounded-xl transition-all transform hover:scale-105 shadow-lg disabled:opacity-50">
												{isLoading ? <Spinner /> : selectionNeedsApproval ? "Request to Book" : "Submit"}
											</button>
										</div>
									) : (
										<button
											// Deliberately NOT disabled on missing terms. A dead button explains
											// nothing; letting the click through is what triggers the banner.
											disabled={isLoading}
											type="submit"
											className="w-full bg-jetzy text-black font-bold px-6 py-3 rounded-xl transition-all transform hover:scale-105 shadow-lg disabled:opacity-50"
										>
											{isLoading ? <Spinner /> : ((liveEventData?.questions || []).length > 0 ? "Next" : selectionNeedsApproval ? "Request to Book" : "Submit")}
										</button>
									)}
								</div>
							</form>
						)}
					</div>
				</div>
			)}

			{/* No separate subscribe modal here any more: a bundled ticket sells the membership
			    as part of this checkout, so sending the buyer off to a second Stripe flow
			    mid-purchase would only risk charging them twice. */}
		</>
	)
}

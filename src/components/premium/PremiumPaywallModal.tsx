import React, { useCallback, useEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { useSession } from "next-auth/react"
import { useRouter } from "next/router"
import { CheckIcon } from "@heroicons/react/24/solid"
import { Error as ErrorToast } from "@/lib/_toaster"
import { defaultTrialOffer, resolveTrialCode, trialDisclosure, trialEndsOn, type AppliedTrial, type TrialOffer, sameAppliedTrial } from "@/lib/invite-trial"
import { PREMIUM_STATUS_QUERY_KEY, usePremiumStatus } from "@/hooks/usePremiumStatus"
import { useCurrentMembershipPlan, useMembershipPlan } from "@/hooks/usePremiumPlan"
import PlanComparison from "@/components/premium/PlanComparison"
import { ROUTES } from "@/configs/routes"
import EmailVerifyDialog from "@/components/premium/EmailVerifyDialog"
import { usePremiumSubscriptionReturn } from "@/hooks/usePremiumSubscriptionReturn"
import { useAnalytics } from "@Jetzy/hooks/useAnalytics"
import { trackPremiumView } from "@Jetzy/lib/premium-view-tracking"
import { usePremiumApplicationSettings, useMyPremiumApplication, applicationBlocksCheckout, applicationRequiredForPurchase } from "@/hooks/usePremiumApplication"
import PremiumApplicationQuestions from "@/components/premium/PremiumApplicationQuestions"
import PremiumApplicationReview from "@/components/premium/PremiumApplicationReview"

// Query param that marks "the visitor was sent to /login specifically to finish
// subscribing" — set right before the redirect, read back on return to auto-resume
// straight into Stripe instead of making them click Subscribe a second time.
const RESUME_PARAM = "premiumSubscribe"
const RESUME_SESSION_KEY = "jetzy_premium_resume_handled"

/**
 * Marks "the trip to Stripe was started FROM this dialog".
 *
 * Checkout returns to whatever page the button was pressed on — the public home page, an event
 * page — where the only sign anything happened was a toast. Somebody who bought a membership got
 * dropped back onto a listing with no membership in sight. The marker is what lets the dialog
 * reopen on its member card instead, and it is deliberately specific: a purchase begun on
 * `/premium` or `/subscribe` doesn't set it, so those pages keep their own handling.
 */
const PURCHASE_MARKER = "jetzy_premium_modal_purchase"

/**
 * What the buyer had entered when they left for Stripe — `{ code, interval }`.
 *
 * Only read on an ABANDONED checkout, where the dialog reopens on the plan card. The form is
 * component state and a trip to Stripe is a full page navigation, so without this it comes back
 * blank and they retype a code they already typed.
 */
const PURCHASE_CONTEXT = "jetzy_premium_modal_context"

type Props = {
	isOpen: boolean
	onClose: () => void
	returnTo: string
	/** Optional context line — e.g. why the visitor hit this paywall. */
	message?: string
}

/**
 * The "Buy Jetzy Premium" dialog.
 *
 * Shows the SAME Basic-vs-Premium comparison as `/subscribe`, via the shared
 * `PlanComparison`. It used to be a bullet list with no price and no free tier, which meant
 * what a buyer saw — and whether they saw a price at all — depended on which door they came
 * through. It also used to be two steps, pitch then a plan-confirmation screen; the cards
 * already carry the price and the CTA, so the middle step was removed and Subscribe goes
 * straight to Stripe, matching `/subscribe`.
 */
const PremiumPaywallModal: React.FC<Props> = ({ isOpen, onClose, returnTo, message }) => {
	const { status: sessionStatus } = useSession()
	const router = useRouter()
	const queryClient = useQueryClient()

	// ---- Application gate ----
	// When enabled (an admin toggle, off by default), buying Premium with no invite code shows a
	// short questionnaire and a card-setup-only Stripe session instead of starting the trial
	// instantly — see `src/lib/premium-application.ts`.
	const { data: appSettings } = usePremiumApplicationSettings()
	const { data: myApplication } = useMyPremiumApplication(sessionStatus === "authenticated")
	const [showQuestions, setShowQuestions] = useState(false)
	const [resumingCardSetup, setResumingCardSetup] = useState(false)
	const resumeCardSetup = useCallback(async () => {
		if (!myApplication?._id) return
		setResumingCardSetup(true)
		try {
			const { data } = await axios.post("/api/premium/applications/checkout", { applicationId: myApplication._id, returnTo })
			if (data?.data?.url) window.location.href = data.data.url
			else ErrorToast("Error", "Could not resume card setup. Please try again.")
		} catch (error: any) {
			ErrorToast("Error", error?.response?.data?.message || "Could not resume card setup. Please try again.")
		} finally {
			setResumingCardSetup(false)
		}
	}, [myApplication, returnTo])
	const { isPremium } = usePremiumStatus()
	const isSignedIn = sessionStatus === "authenticated"
	const { anonId, sessionId } = useAnalytics()

	// "You already have this" is a RESULT worth showing, not an error to swallow.
	//
	// It matters most on the login round-trip: a logged-out visitor clicks Subscribe, signs
	// in, and we resume straight into Stripe — but by then the modal is closed, because
	// `isOpen` is owned by the navbar and defaults to false on the fresh page load. Anything
	// reported by a toast at that moment lands on a screen the visitor isn't looking at, so
	// the click appeared to do nothing at all. This state lets the modal reopen itself and
	// say so plainly.
	const [alreadyMember, setAlreadyMember] = useState(false)

	/**
	 * Email + 6-digit code, in place of sending a signed-out visitor to `/login`.
	 *
	 * The login round trip below still exists for anything that arrives back with the resume
	 * param, but nothing sends anyone down it any more: a buyer who has to leave the dialog,
	 * invent a password and find their way back is a buyer who mostly doesn't. The code proves
	 * the address and NextAuth creates the account from the magic token it returns.
	 */
	const [verifyOpen, setVerifyOpen] = useState(false)

	/**
	 * The interval a click asked for, held across the email-verification detour.
	 *
	 * Set by the annual pitch, which buys at a named interval rather than at whatever the toggle
	 * happens to say. A ref, not state: nothing renders from it.
	 */
	const pendingInterval = useRef<string | undefined>(undefined)

	/** Back from Stripe, on a purchase this dialog started. Reopens it on the member card. */
	const [justSubscribed, setJustSubscribed] = useState(false)

	/**
	 * Back from Stripe having bought NOTHING — the back arrow, or a cancelled session.
	 *
	 * The marker used to be thrown away here, so somebody who stepped into checkout and changed
	 * their mind landed on whatever page the button was pressed on with no card in sight and no
	 * sign of what they had been doing. Reopens on the PLAN card, never the member one: nothing
	 * was bought.
	 */
	const [reopenedAfterCancel, setReopenedAfterCancel] = useState(false)

	/**
	 * The dialog is VISIBLE in three ways, and the queries below have to follow all three.
	 *
	 * `isOpen` is owned by the navbar and is false on a fresh page load, so a dialog that reopens
	 * itself after checkout (`justSubscribed`) or after a login round trip (`alreadyMember`) was
	 * fetching nothing: no prices meant no annual option, which meant no "Switch to $200/year" on
	 * the member card — the one action a member who just subscribed monthly might want.
	 */
	const isVisible = isOpen || justSubscribed || alreadyMember || reopenedAfterCancel

	// The shared hook, not a private query: it already formats every interval's label and shares
	// its cache key, so opening this after the price has been fetched elsewhere on the page
	// costs no extra request — and the modal can't drift from `/subscribe` on how a price reads.
	const { plan, prices, isLoading: planLoading } = useMembershipPlan("premium", isVisible)

	// Which interval the buyer has picked. Left unset until the plan loads, then defaulted to the
	// product default (monthly) rather than a guessed string.
	const [selectedInterval, setSelectedInterval] = useState<string | undefined>(undefined)
	useEffect(() => {
		if (!selectedInterval && plan?.interval) setSelectedInterval(plan.interval)
	}, [plan?.interval, selectedInterval])

	// What they are on now — asked only when the dialog is actually open AND they are a member.
	// This modal is mounted by every navbar, so an ungated fetch would put a Stripe round-trip
	// behind every page view for every member.
	const { currentPlan } = useCurrentMembershipPlan(isVisible && isPremium)

	// Invite code (a free-trial code) — same behaviour as /subscribe, since both render the
	// same card and a buyer must not get a different answer depending on which door they used.
	const [inviteCode, setInviteCode] = useState("")
	const [inviteAccepted, setInviteAccepted] = useState<string | null>(null)
	const [inviteError, setInviteError] = useState<string | null>(null)
	const [inviteChecking, setInviteChecking] = useState(false)
	/**
	 * The same offer, structured, for the plan card — which prices it ($0 today, then the rate on
	 * the date it converts). The string above confirms the code; this says what it costs.
	 */
	const [trialOffer, setTrialOffer] = useState<AppliedTrial | null>(null)
	/**
	 * Writes it only when it actually differs — see `sameAppliedTrial`. Every resolution builds a
	 * fresh object, and an equal-but-new object is still a state change to React.
	 */
	const applyTrial = useCallback(
		(next: AppliedTrial | null) => setTrialOffer((prev) => (sameAppliedTrial(prev, next) ? prev : next)),
		[],
	)
	/**
	 * The exact string that was refused, if any.
	 *
	 * A refused code must not ride along to Stripe — that request can only be rejected, leaving the
	 * dialog looking untouched, which is exactly what happened after verifying an email with a
	 * mistyped code in the box. It also must not count as "has an invite code" for the application
	 * gate, or a typo would walk straight past a questionnaire.
	 *
	 * The refused STRING rather than a valid/invalid flag: a flag still reads false for the first
	 * render after the buyer fixes the code, and dropping a good code is the more expensive
	 * mistake — the buyer silently loses the months they were promised.
	 */
	const [refusedCode, setRefusedCode] = useState<string | null>(null)
	/** A code that is both present and not known-bad. Everything downstream asks this, not the field. */
	const usableCode = inviteCode.trim() && inviteCode.trim() !== refusedCode ? inviteCode.trim() : ""
	/**
	 * The offer this buyer gets with NO code — the standing free month, or nothing for somebody
	 * who has had Premium before.
	 *
	 * It is the baseline the card falls back to whenever a code is being typed, re-checked or
	 * refused. Before this the card dropped to the full rate at each of those moments, so a single
	 * mistyped character read as the price going up.
	 */
	const standingTrial = useRef<AppliedTrial | null>(null)
	/**
	 * First resolution done — the card can stop showing a spinner and commit to a price.
	 *
	 * Latched: it is never set back to false, because re-gating on every keystroke would replace
	 * the price with a spinner while someone types.
	 */
	const [trialResolved, setTrialResolved] = useState(false)
	const inviteTimer = useRef<NodeJS.Timeout | null>(null)

	useEffect(() => {
		if (inviteTimer.current) clearTimeout(inviteTimer.current)
		const code = inviteCode.trim()
		// Falls back to the standing offer rather than to nothing. This runs on every keystroke, and
		// clearing it outright meant the card jumped to the full rate between characters — the buyer
		// keeps their free month whatever they type, so showing it withdrawn was never true.
		applyTrial(standingTrial.current)

		// Signed out there is no account to check against, so the code is resolved in the browser
		// from the same shared table the server enforces. It is a PREVIEW of the offer, never a
		// promise about an account we don't know yet — after sign-in the server re-checks it, and a
		// refusal is reported then. Without this the field would simply 401 and read as invalid.
		if (!isSignedIn) {
			setInviteChecking(false)
			setInviteError(null)
			// With NO code typed the standing offer applies: free months are the ordinary terms of
			// starting a membership, not something the buyer has to hold a code for. A typed code
			// is resolved exactly as before, and only a TYPED one may fail loudly — a red message
			// against a field nobody touched reads as the page being broken, not as an offer that
			// didn't apply.
			const standingOffer = defaultTrialOffer(selectedInterval)
			const standing: AppliedTrial | null = standingOffer
				? {
					months: standingOffer.months,
					label: standingOffer.label,
					chargesFrom: trialEndsOn(standingOffer).toISOString(),
				}
				: null
			standingTrial.current = standing
			setTrialResolved(true)

			let offer: TrialOffer | null = null
			if (code) {
				const resolved = resolveTrialCode(code, selectedInterval)
				if (!resolved.ok) {
					// The code is gone; the standing offer isn't. Falling to the full rate here read as
					// a price rise caused by a typo, and it stalled the whole purchase: the CTA lost its
					// trial wording and checkout then refused the dead code.
					setInviteAccepted(null)
					setRefusedCode(code)
					setInviteError(
						standing && resolved.reason === "unknown"
							? "That invite code isn't valid — continuing without it."
							: resolved.message,
					)
					applyTrial(standing)
					return
				}
				offer = resolved.offer
			}
			setRefusedCode(null)
			if (!code) {
				// Nobody typed anything, so there is nothing to confirm. The $0 headline and the
				// "Then …" disclosure above already state the offer; a green line about a code the
				// buyer never entered only reads as something they have to understand.
				setInviteAccepted(null)
				applyTrial(standing)
				return
			}
			if (!offer) {
				setInviteAccepted(null)
				applyTrial(standing)
				return
			}
			const preview = prices.find((p) => p.interval === selectedInterval) || prices.find((p) => p.isDefault) || prices[0]
			setInviteAccepted(trialDisclosure(offer, preview?.label || null, trialEndsOn(offer)))
			applyTrial({
				months: offer.months,
				label: offer.label,
				chargesFrom: trialEndsOn(offer).toISOString(),
			})
			return
		}

		setInviteChecking(true)
		// Only a typed code is worth waiting on. The empty field is the common case and debouncing
		// it held the price behind a spinner for 600ms before the request even left.
		inviteTimer.current = setTimeout(async () => {
			try {
				const { data } = await axios.post("/api/subscriptions/invite-code", { code, interval: selectedInterval })
				// Name the amount and the date it starts, not just "2 months free".
				//
				// The code now applies to ANNUAL as well as monthly, and the same two free months
				// precede a $200 charge there instead of a $20 one. A trial's whole point is that
				// the buyer knows what happens when it ends, so the disclosure is built from the
				// price of the interval they actually have selected — and it is rebuilt whenever
				// they change it, because the answer changes with it.
				const selectedPrice = prices.find((p) => p.interval === selectedInterval) || prices.find((p) => p.isDefault) || prices[0]
				// Only the path that named the months: the bare "applied" fallback carries none, and
				// the card must not show $0 for an offer it can't state the end of.
				const applied: AppliedTrial | null = data?.data?.label
					? {
						months: Number(data.data.months) || 0,
						label: data.data.label,
						chargesFrom: data?.data?.chargesFrom || null,
					}
					: null
				// This WAS the standing offer — the server resolved it for an empty field. Remembering
				// it is what lets a later refusal fall back to it without asking again.
				if (!code) standingTrial.current = applied
				setInviteAccepted(
					code
						? data?.data?.label
							? trialDisclosure(
								{ months: Number(data.data.months) || 0, intervals: [], label: data.data.label },
								selectedPrice?.label || null,
								data?.data?.chargesFrom ? new Date(data.data.chargesFrom) : new Date(),
							)
							: "Invite code applied."
						: null,
				)
				applyTrial(applied || standingTrial.current)
				setRefusedCode(null)
				setInviteError(null)
			} catch (error: any) {
				setInviteAccepted(null)
				if (!code) {
					// Nothing was typed. The server refuses the standing offer to anyone who has had
					// Premium before, and that is not a failure the visitor caused or can act on —
					// they simply pay the ordinary price the card already shows.
					standingTrial.current = null
					applyTrial(null)
					setRefusedCode(null)
					setInviteError(null)
				} else {
					setRefusedCode(code)
					const message = error?.response?.data?.message || "That code couldn't be applied."
					// Ask what this account gets with no code at all, and fall back to that. Without
					// this a refused code took the buyer's standing free month with it — the price rose
					// in front of them and checkout then refused the same dead code.
					let standing: AppliedTrial | null = null
					try {
						const { data } = await axios.post("/api/subscriptions/invite-code", { code: "", interval: selectedInterval })
						standing = data?.data?.label
							? {
								months: Number(data.data.months) || 0,
								label: data.data.label,
								chargesFrom: data?.data?.chargesFrom || null,
							}
							: null
					} catch {}
					standingTrial.current = standing
					applyTrial(standing)
					setInviteError(standing ? `${message} Continuing without it.` : message)
				}
			} finally {
				setInviteChecking(false)
				setTrialResolved(true)
			}
		}, code ? 600 : 0)
		return () => {
			if (inviteTimer.current) clearTimeout(inviteTimer.current)
		}
	}, [inviteCode, selectedInterval, isSignedIn, prices, applyTrial])

	// ---- Open-vs-bought funnel: the dialog counts as its own door ----
	//
	// This is the "Buy Jetzy Premium" button, and until now a click on it recorded nothing at all:
	// the funnel only knew about `/premium` and `/subscribe`, so the most prominent way into the
	// purchase was missing from the report entirely. Rows are written under `page: "modal"`.
	// `anonId` loads asynchronously (see AnalyticsContext) so this waits for it; `trackPremiumView`
	// dedupes per tab, and the dialog is opened and closed repeatedly on one page.
	useEffect(() => {
		if (!isOpen || !anonId) return
		trackPremiumView({ anonId, sessionId, page: "modal", stage: "landed" })
	}, [isOpen, anonId, sessionId])

	const subscribeMutation = useMutation({
		// The interval is passed in rather than read from state: the annual pitch selects annual and
		// buys in one click, and `setSelectedInterval` has not landed by the time this request is
		// built. Omitted everywhere else, which is the ordinary "buy what's selected" case.
		mutationFn: async (intervalOverride?: string) => {
			const interval = intervalOverride || selectedInterval
			// checkout_started, before the request — a beacon, so the imminent navigation to Stripe
			// can't drop it. The code mirrors what the request body sends as `inviteCode`, so the
			// webhook's `purchasedAt` write lands on this same row.
			trackPremiumView({
				anonId,
				sessionId,
				page: "modal",
				stage: "checkout_started",
				code: usableCode || undefined,
			})
			// The INTERVAL, never a price id — the server resolves the id itself, so a crafted
			// request can't subscribe anyone at an arbitrary price on the account.
			const { data } = await axios.post("/api/subscriptions/checkout", {
				returnTo,
				// `page` explicitly: this dialog has no URL of its own, and `returnTo` is whichever
				// page the navbar button happened to be pressed on.
				page: "modal",
				anonId: anonId || undefined,
				...(interval ? { interval } : {}),
				// A refused code is left behind. Sending it could only fail, and the card is already
				// showing what this buyer actually gets without it.
				...(usableCode ? { inviteCode: usableCode } : {}),
			})
			return data?.data as { url: string }
		},
		onSuccess: (data) => {
			if (data?.url) {
				// Set before navigating away — this is the only record that survives the trip that
				// the purchase began here rather than on a page that sells memberships itself.
				try {
					sessionStorage.setItem(PURCHASE_MARKER, "1")
					sessionStorage.setItem(
						PURCHASE_CONTEXT,
						JSON.stringify({ code: inviteCode.trim(), interval: selectedInterval || "" }),
					)
				} catch {}
				window.location.href = data.url
			} else {
				ErrorToast("Error", "Could not start checkout. Please try again.")
			}
		},
		onError: (error: any) => {
			// Refused at the door — say so on the field rather than in a toast over an
			// unchanged form.
			if (error?.response?.data?.data?.inviteCode) {
				setInviteError(error?.response?.data?.message || "That code couldn't be applied.")
				return
			}
			// Logged-out visitor turned out to already have an active subscription once they
			// signed in — good news, not a failure. Show it in the modal rather than closing.
			if (error?.response?.data?.data?.alreadySubscribed) {
				queryClient.invalidateQueries({ queryKey: PREMIUM_STATUS_QUERY_KEY })
				setAlreadyMember(true)
				return
			}
			const message = error?.response?.data?.message || "Could not start checkout. Please try again."
			ErrorToast("Error", message)
		},
	})

	// Cancel / change card / switch to annual — all of it lives in Stripe's portal, which is
	// also the only surface where a plan change is priced, confirmed and invoiced correctly.
	// `flow: "switch"` opens the Premium-scoped update flow; without it, the ordinary portal.
	const portalMutation = useMutation({
		mutationFn: async (flow?: "switch") => {
			const { data } = await axios.post("/api/subscriptions/portal", {
				returnTo: typeof window !== "undefined" ? window.location.pathname : "/",
				...(flow ? { flow } : {}),
			})
			return data?.data as { url: string }
		},
		onSuccess: (data) => {
			if (data?.url) {
				window.location.href = data.url
			} else {
				ErrorToast("Error", "Could not open the billing portal. Please try again.")
			}
		},
		onError: (error: any) => {
			ErrorToast("Error", error?.response?.data?.message || "Could not open the billing portal. Please try again.")
		},
	})

	// Back from Stripe on a purchase this dialog started. Reopen on the member card rather than
	// leaving them on whichever page the button happened to be on.
	//
	// Read synchronously off `router.query`, before `usePremiumSubscriptionReturn` strips the
	// param — that happens in a `.finally()` after a network round trip, so this always wins.
	useEffect(() => {
		if (!router.isReady || typeof window === "undefined") return

		const sessionId = typeof router.query.premium_session_id === "string" ? router.query.premium_session_id : null
		const cancelled = router.query.premium_cancelled === "1"

		// Neither return — clear the marker rather than consuming it, or one left behind would open
		// this dialog on some later arrival for a purchase made somewhere else. Safe to do
		// unconditionally: the marker is written immediately before a full page navigation, so there
		// is no render between setting it and leaving.
		if (!sessionId && !cancelled) {
			try {
				sessionStorage.removeItem(PURCHASE_MARKER)
				sessionStorage.removeItem(PURCHASE_CONTEXT)
			} catch {}
			return
		}

		let marked = false
		let context: { code?: string; interval?: string } | null = null
		try {
			marked = sessionStorage.getItem(PURCHASE_MARKER) === "1"
			if (marked) {
				const raw = sessionStorage.getItem(PURCHASE_CONTEXT)
				context = raw ? JSON.parse(raw) : null
				sessionStorage.removeItem(PURCHASE_MARKER)
				sessionStorage.removeItem(PURCHASE_CONTEXT)
			}
		} catch {}
		if (!marked) return

		if (sessionId) {
			setJustSubscribed(true)
			return
		}

		// Came back without buying. Reopen on the plan card, with the form as they left it, and take
		// the param off the URL so a refresh doesn't reopen it a second time.
		if (context?.code) setInviteCode(context.code)
		if (context?.interval) setSelectedInterval(context.interval)
		setReopenedAfterCancel(true)
		const { premium_cancelled: _cancelled, ...rest } = router.query
		router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [router.isReady, router.query.premium_session_id, router.query.premium_cancelled])

	// Confirms the session and refreshes the cached membership — but ONLY on our own purchase,
	// so a page that already owns the return (`/premium`, `/subscribe`, the ticket page) is not
	// handled twice. The hook itself latches per session id as a second line of defence.
	usePremiumSubscriptionReturn(justSubscribed)

	// Resuming after a login redirect (see handleSubscribeClick below) — skip straight to
	// Stripe instead of making the user click Subscribe a second time. Guarded by a
	// sessionStorage flag since every page can mount its own instance of this modal
	// (Navbar, ticket page, create/manage forms) and all of them see the same URL.
	useEffect(() => {
		if (!router.isReady) return
		if (router.query[RESUME_PARAM] !== "1") return
		if (sessionStatus !== "authenticated") return
		if (typeof window === "undefined" || sessionStorage.getItem(RESUME_SESSION_KEY)) return

		sessionStorage.setItem(RESUME_SESSION_KEY, "1")
		subscribeMutation.mutate(undefined, {
			onSettled: () => {
				const { [RESUME_PARAM]: _resume, ...rest } = router.query
				router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true })
			},
		})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [router.isReady, router.query[RESUME_PARAM], sessionStatus])

	// Stays mounted while `alreadyMember` or `justSubscribed` is set even if the parent thinks
	// it's closed — those are the post-login and post-checkout cases described above.
	if (!isVisible) return null

	const handleClose = () => {
		setAlreadyMember(false)
		setJustSubscribed(false)
		setReopenedAfterCancel(false)
		onClose()
	}

	// Jetzy Basic is an account, not a state of not having one. A signed-out visitor pressing it
	// wants to start using Jetzy, so it goes to signup; for anyone signed in it means "keep what I
	// have", which is just closing this.
	const handleChooseFree = () => {
		handleClose()
		if (sessionStatus !== "authenticated") router.push(ROUTES.create)
	}

	// Subscribing requires an account. A logged-out visitor proves their email with a code
	// instead — the account is created from it — and checkout opens without leaving this dialog.
	//
	// `intervalOverride` carries the annual pitch's choice through: without it, verifying an email
	// would drop the buyer back onto whatever the toggle says, which is monthly.
	const handleSubscribeClick = (intervalOverride?: string) => {
		if (sessionStatus !== "authenticated") {
			pendingInterval.current = intervalOverride
			setVerifyOpen(true)
			return
		}
		// Caught client-side too, so a member who reaches this dialog is told immediately
		// rather than after a round trip that can only fail.
		if (isPremium) {
			setAlreadyMember(true)
			return
		}
		if (applicationBlocksCheckout(myApplication)) return // review card is already showing instead of this button
		// A refused code is not an invite code — counting it as one would let a typo past the
		// questionnaire the gate exists to ask.
		if (applicationRequiredForPurchase(appSettings, !!usableCode, myApplication)) {
			pendingInterval.current = intervalOverride
			setShowQuestions(true)
			return
		}
		subscribeMutation.mutate(intervalOverride)
	}

	// The session now exists. Straight to Stripe, which is what they pressed the button for.
	const handleVerified = () => {
		setVerifyOpen(false)
		if (applicationRequiredForPurchase(appSettings, !!usableCode, myApplication)) {
			setShowQuestions(true)
			return
		}
		subscribeMutation.mutate(pendingInterval.current)
	}

	// A member has nothing to buy here, but they DO have something to change — the card shows
	// their plan, the switch and the portal instead of a dead end pointing at another page.
	const showMemberCard = alreadyMember || justSubscribed || (isOpen && isPremium)

	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
			{/* Wide enough for two cards side by side; they stack below `sm`.
			    `4xl`, not `3xl`: at the narrower width the Premium column left
			    "Click here to manage/cancel membership" wrapping onto two lines. */}
			<div className="bg-[#1E1E1E] rounded-2xl shadow-2xl w-full relative max-h-[90vh] flex flex-col overflow-hidden max-w-4xl">
				<button
					onClick={handleClose}
					className="absolute top-2 right-2 bg-black text-white w-8 h-8 rounded-full flex items-center justify-center z-10"
				>
					&times;
				</button>

				<div className="p-6 overflow-y-auto">
					<div className="text-center">
						<h2 className="text-2xl font-bold text-white mb-1">
							{showMemberCard ? "Your Jetzy Premium membership" : "Choose your Jetzy plan"}
						</h2>
						<p className="text-gray-400 text-sm mb-6">
							{showMemberCard
								? "Change your plan or cancel any time."
								: "Upgrade anytime. Cancel anytime."}
						</p>
						{/* The post-login resume case: they clicked Subscribe, signed in, and turned out
						    to already be a member. Saying so is the whole point — otherwise the click
						    appears to have done nothing. */}
						{justSubscribed ? (
							<p className="text-sm mb-6 flex items-center justify-center gap-2 text-green-500">
								<CheckIcon className="w-5 h-5" /> Welcome to Jetzy Premium — your membership is active.
							</p>
						) : (
							alreadyMember &&
							!isOpen && (
								<p className="text-sm mb-6 flex items-center justify-center gap-2 text-green-500">
									<CheckIcon className="w-5 h-5" /> You&apos;re already a Jetzy Premium member.
								</p>
							)
						)}
						{!showMemberCard && message && <p className="text-gray-400 text-sm mb-6">{message}</p>}
					</div>

					{applicationBlocksCheckout(myApplication) ? (
						<PremiumApplicationReview application={myApplication as any} onResumeCardSetup={resumeCardSetup} resuming={resumingCardSetup} />
					) : (
						<PlanComparison
							plan={plan}
							planLoading={planLoading}
							prices={prices}
							selectedInterval={selectedInterval}
							onIntervalChange={setSelectedInterval}
							isPremium={showMemberCard}
							currentPlan={currentPlan}
							onSwitchInterval={() => portalMutation.mutate("switch")}
							onManageBilling={() => portalMutation.mutate(undefined)}
							billingPending={portalMutation.isPending}
							inviteCode={inviteCode}
							onInviteCodeChange={setInviteCode}
							inviteAccepted={inviteAccepted}
							inviteError={inviteError}
							inviteChecking={inviteChecking}
							trial={trialOffer}
							trialPending={!showMemberCard && !trialResolved}
							premiumPending={subscribeMutation.isPending}
							onChooseFree={handleChooseFree}
							onChoosePremium={() => handleSubscribeClick()}
							onChoosePremiumAtInterval={(interval) => handleSubscribeClick(interval)}
							freeCtaLabel={showMemberCard ? "Close" : "Continue with Free"}
							subscribedCtaLabel="Close"
						/>
					)}
				</div>
			</div>

			<PremiumApplicationQuestions
				open={showQuestions}
				onClose={() => setShowQuestions(false)}
				onBack={() => setShowQuestions(false)}
				questions={appSettings?.questions || []}
				interval={selectedInterval}
				returnTo={returnTo}
			/>

			{/* Sits above the card, on top of this dialog's own overlay — it is `fixed` itself, so
			    nesting is only about ownership. No event and no referral code: this is the ordinary
			    price, and the endpoints key the code to the address alone. */}
			<EmailVerifyDialog open={verifyOpen} onClose={() => setVerifyOpen(false)} onVerified={handleVerified} />
		</div>
	)
}

export default PremiumPaywallModal

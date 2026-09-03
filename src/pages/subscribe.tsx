import Logo from "@Jetzy/assets/logo/logo.png"
import Spinner from "@Jetzy/components/misc/Spinner"
import { Success, Error as ErrorToast, Info as InfoToast } from "@Jetzy/lib/_toaster"
import { defaultTrialOffer, resolveTrialCode, trialDisclosure, trialEndsOn, type AppliedTrial, type TrialOffer, sameAppliedTrial } from "@/lib/invite-trial"
import { usePremiumStatus } from "@Jetzy/hooks/usePremiumStatus"
import { PREMIUM_STATUS_QUERY_KEY } from "@Jetzy/hooks/usePremiumStatus"
import PlanComparison from "@Jetzy/components/premium/PlanComparison"
import EmailVerifyDialog from "@Jetzy/components/premium/EmailVerifyDialog"
import Navbar from "@Jetzy/components/misc/Navbar"
import { useAnalytics } from "@Jetzy/hooks/useAnalytics"
import { trackPremiumView } from "@Jetzy/lib/premium-view-tracking"
import { useCurrentMembershipPlan, useMembershipPlan } from "@Jetzy/hooks/usePremiumPlan"
import { CheckIcon } from "@heroicons/react/24/solid"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { GetServerSideProps } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { signIn, useSession } from "next-auth/react"
import Image from "next/image"
import { useRouter } from "next/router"
import React from "react"

// Where the user lands back in the mobile app once they're done here, whichever
// plan they picked (free needs no purchase, premium redirects here after Stripe).
const APP_DEEP_LINK_BASE = "https://jetzy.com/jetzy_event"

// sessionStorage survives the same-tab round trip to Stripe Checkout and back,
// same trick login.tsx uses for lat/long — the eventId query param itself doesn't
// survive that round trip since Stripe's success_url is a fixed string built
// server-side (see /api/subscriptions/checkout.ts), so it has to be stashed here.
const EVENT_ID_STORAGE_KEY = "subscribe_event_id"

export default function SubscribePage() {
	const router = useRouter()
	const { status } = useSession()
	const queryClient = useQueryClient()

	const isSignedIn = status === "authenticated"
	const { anonId, sessionId } = useAnalytics()

	const [isAutoLoggingIn, setIsAutoLoggingIn] = React.useState(false)
	const [hasAttemptedMagicLink, setHasAttemptedMagicLink] = React.useState(false)

	const { magicToken, eventId } = router.query

	React.useEffect(() => {
		if (typeof eventId === "string" && eventId) {
			sessionStorage.setItem(EVENT_ID_STORAGE_KEY, eventId)
		}
	}, [eventId])

	// Open-vs-bought funnel: the landing. No referral-link concept here — that's `/premium` only
	// — so this is always a plain visit. `anonId` loads asynchronously, so wait for it rather
	// than tracking on mount; `trackPremiumView` dedupes per tab regardless.
	React.useEffect(() => {
		if (!router.isReady || !anonId) return
		trackPremiumView({ anonId, sessionId, page: "subscribe", stage: "landed" })
	}, [router.isReady, anonId, sessionId])

	const resolvedEventId =
		(typeof eventId === "string" && eventId) ||
		(typeof window !== "undefined" ? sessionStorage.getItem(EVENT_ID_STORAGE_KEY) : null) ||
		undefined

	const goToApp = React.useCallback(() => {
		window.location.href = resolvedEventId
			? `${APP_DEEP_LINK_BASE}?eventId=${encodeURIComponent(resolvedEventId)}`
			: APP_DEEP_LINK_BASE
	}, [resolvedEventId])

	// Auto-login from the mobile-provided magic token — no form, mirrors login.tsx.
	React.useEffect(() => {
		if (!router.isReady || !magicToken || hasAttemptedMagicLink || status === "loading") return
		setHasAttemptedMagicLink(true)
		setIsAutoLoggingIn(true)

		signIn("credentials", { magicToken: magicToken.toString(), redirect: false }).then((res) => {
			if (res?.error) {
				setIsAutoLoggingIn(false)
				ErrorToast("Auto-login Failed", "Your one-click link is invalid or has expired.")
			}
		})
	}, [router.isReady, magicToken, hasAttemptedMagicLink, status])

	React.useEffect(() => {
		if (status === "authenticated") setIsAutoLoggingIn(false)
	}, [status])

	// No token and no existing session — the plan is still shown.
	//
	// This used to bounce straight to `/login`, which meant the one page whose whole job is to
	// present the membership never presented it to anyone who wasn't already signed in. Buying
	// now proves the email with a 6-digit code instead (see `handleChoosePremium`), so there is
	// nothing left to redirect for. The magic-token auto-login above is untouched — the app still
	// hands us a session when it has one.

	// Redirect back from Stripe after a successful subscription purchase.
	React.useEffect(() => {
		const sessionId = router.query.premium_session_id
		if (!sessionId || typeof sessionId !== "string") return

		axios
			.get(`/api/subscriptions/confirm?session_id=${sessionId}`)
			.then(() => {
				Success("Welcome to Jetzy Premium!", "Your subscription is now active.")
				queryClient.invalidateQueries({ queryKey: PREMIUM_STATUS_QUERY_KEY })
				goToApp()
			})
			.catch(() => {
				ErrorToast("Error", "We couldn't confirm your subscription. Please contact support if this persists.")
			})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [router.query.premium_session_id])

	const { isPremium, isLoading: premiumLoading } = usePremiumStatus()

	// The shared hook rather than a private `["premium-plan"]` query: one cache entry and one
	// price formatter between this page and the paywall modal, which is what keeps the two from
	// quoting the same membership differently.
	// Fetched regardless of session: `/api/subscriptions/plan` takes none, and a signed-out
	// visitor now stays on this page, so gating it behind a session would show them a card with
	// no price on it.
	const { plan, prices, isLoading: planLoading } = useMembershipPlan("premium")

	// Which billing interval the buyer has picked. Left unset until the plan loads, then
	// defaulted to the product's default price (monthly) rather than guessing a string — the
	// selector only appears once there is genuinely more than one interval on sale.
	const [selectedInterval, setSelectedInterval] = React.useState<string | undefined>(undefined)
	React.useEffect(() => {
		if (!selectedInterval && plan?.interval) setSelectedInterval(plan.interval)
	}, [plan?.interval, selectedInterval])

	// What they are on now — only asked once we know they are a member.
	const { currentPlan } = useCurrentMembershipPlan(isPremium)

	// Cancel, change card, or switch to annual. `flow: "switch"` opens the Premium-scoped
	// update flow in Stripe; without it, the ordinary portal.
	const portalMutation = useMutation({
		mutationFn: async (flow?: "switch") => {
			const { data } = await axios.post("/api/subscriptions/portal", {
				returnTo: "/subscribe",
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

	// Invite code (a free-trial code). Checked against the server before submit so a wrong code,
	// or one that doesn't apply to the plan they picked, is reported while they can still fix it.
	const [inviteCode, setInviteCode] = React.useState("")
	const [inviteAccepted, setInviteAccepted] = React.useState<string | null>(null)
	const [inviteError, setInviteError] = React.useState<string | null>(null)
	const [inviteChecking, setInviteChecking] = React.useState(false)
	/**
	 * The same offer, structured, for the plan card — which prices it ($0 today, then the rate on
	 * the date it converts). The string above confirms the code; this says what it costs.
	 */
	const [trialOffer, setTrialOffer] = React.useState<AppliedTrial | null>(null)
	/**
	 * Writes it only when it actually differs — see `sameAppliedTrial`. Every resolution builds a
	 * fresh object, and an equal-but-new object is still a state change to React.
	 */
	const applyTrial = React.useCallback(
		(next: AppliedTrial | null) => setTrialOffer((prev) => (sameAppliedTrial(prev, next) ? prev : next)),
		[],
	)
	const inviteTimer = React.useRef<NodeJS.Timeout | null>(null)

	React.useEffect(() => {
		if (inviteTimer.current) clearTimeout(inviteTimer.current)
		const code = inviteCode.trim()
		// Cleared on every run, before anything is resolved: while a code is being retyped or
		// re-checked the card must show the ordinary price, never a stale $0.
		applyTrial(null)

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
			let offer: TrialOffer | null = null
			if (code) {
				const resolved = resolveTrialCode(code, selectedInterval)
				if (!resolved.ok) {
					setInviteAccepted(null)
					setInviteError(resolved.message)
					return
				}
				offer = resolved.offer
			} else {
				offer = defaultTrialOffer(selectedInterval)
			}
			if (!offer) {
				setInviteAccepted(null)
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
				setInviteAccepted(
					data?.data?.label
						? trialDisclosure(
							{ months: Number(data.data.months) || 0, intervals: [], label: data.data.label },
							selectedPrice?.label || null,
							data?.data?.chargesFrom ? new Date(data.data.chargesFrom) : new Date(),
						)
						: "Invite code applied.",
				)
				// Only the path that named the months: the bare "applied" fallback carries none, and
				// the card must not show $0 for an offer it can't state the end of.
				applyTrial(
					data?.data?.label
						? {
							months: Number(data.data.months) || 0,
							label: data.data.label,
							chargesFrom: data?.data?.chargesFrom || null,
						}
						: null,
				)
				setInviteError(null)
			} catch (error: any) {
				setInviteAccepted(null)
				applyTrial(null)
				// Silent when nothing was typed. The server refuses the standing offer to anyone
				// who has had Premium before, and that is not a failure the visitor caused or can
				// act on — they simply pay the ordinary price the card already shows.
				setInviteError(code ? error?.response?.data?.message || "That code couldn't be applied." : null)
			} finally {
				setInviteChecking(false)
			}
		}, 600)
		return () => {
			if (inviteTimer.current) clearTimeout(inviteTimer.current)
		}
		// Re-checked when the interval changes: a monthly-only code stops applying on annual.
	}, [inviteCode, selectedInterval, isSignedIn, prices, applyTrial])

	/**
	 * Email + 6-digit code, in place of sending a signed-out visitor to `/login`.
	 *
	 * Same dialog `/premium` and the paywall modal use, so whichever door someone came through
	 * they identify themselves the same way. The account is created from the magic token the
	 * verify endpoint returns; no password is ever chosen.
	 */
	const [verifyOpen, setVerifyOpen] = React.useState(false)

	const subscribeMutation = useMutation({
		mutationFn: async () => {
			// checkout_started, before the request — a beacon so it isn't dropped by the imminent
			// navigation to Stripe.
			trackPremiumView({
				anonId,
				sessionId,
				page: "subscribe",
				stage: "checkout_started",
				code: inviteCode.trim() || undefined,
			})
			// The INTERVAL, never a price id — the server resolves the id itself, so a crafted
			// request can't subscribe anyone at an arbitrary price on the account.
			const { data } = await axios.post("/api/subscriptions/checkout", {
				returnTo: "/subscribe",
				anonId: anonId || undefined,
				...(selectedInterval ? { interval: selectedInterval } : {}),
				...(inviteCode.trim() ? { inviteCode: inviteCode.trim() } : {}),
			})
			return data?.data as { url: string }
		},
		onSuccess: (data) => {
			if (data?.url) {
				window.location.href = data.url
			} else {
				ErrorToast("Error", "Could not start checkout. Please try again.")
			}
		},
		onError: (error: any) => {
			// The code was refused at the door (edited after we checked it, or the account turned
			// out to have had Premium before) — surface it on the field, not in a toast that
			// leaves the buyer looking at an unchanged form.
			if (error?.response?.data?.data?.inviteCode) {
				setInviteError(error?.response?.data?.message || "That code couldn't be applied.")
				return
			}
			if (error?.response?.data?.data?.alreadySubscribed) {
				InfoToast("You're already a member", "You already have an active Jetzy Premium subscription.")
				queryClient.invalidateQueries({ queryKey: PREMIUM_STATUS_QUERY_KEY })
				return
			}
			ErrorToast("Error", error?.response?.data?.message || "Could not start checkout. Please try again.")
		},
	})

	/** Signed in — straight to Stripe. Signed out — prove the address first, then the same. */
	const handleChoosePremium = () => {
		if (status !== "authenticated") {
			setVerifyOpen(true)
			return
		}
		subscribeMutation.mutate()
	}

	if (isAutoLoggingIn || status === "loading") {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0B0F]">
				<Image className="h-20 w-auto mb-8 animate-pulse" src={Logo} alt="Jetzy" />
				<Spinner />
				<p className="mt-4 text-white font-medium">Getting ready...</p>
			</div>
		)
	}

	return (
		<div className="min-h-screen bg-[#0A0B0F] text-white">
			{/* `hideEventNav` — this is the mobile app's door, opened in the system browser. The
			    event links belong to the web product and would strand somebody who came from the
			    app; what they need here is the avatar menu, and Logout in it. */}
			<Navbar hideEventNav hideMembershipCta handlesPremiumReturn />

			<div className="px-6 py-16">
			<div className="max-w-4xl mx-auto text-center mb-12">
				<Image className="h-14 w-auto mx-auto mb-8" src={Logo} alt="Jetzy" />
				<h1 className="text-3xl md:text-4xl font-bold mb-3">Choose your Jetzy plan</h1>
				<p className="text-gray-400">Upgrade anytime. Cancel anytime.</p>
			</div>

			{/* `4xl` so the cancellation link fits on one line — see the paywall modal. */}
			<div className="max-w-4xl mx-auto">
				{/* Shared with the paywall modal, so a buyer sees the same comparison whichever
				    door they came through. */}
				<PlanComparison
					plan={plan}
					planLoading={planLoading}
					// Monthly/Annual. The selector renders only when the product genuinely has more
					// than one interval on sale, so this is inert until annual exists in Stripe.
					prices={prices}
					selectedInterval={selectedInterval}
					onIntervalChange={setSelectedInterval}
					isPremium={isPremium}
					// Member state: their live plan, the switch, and the portal. `goToApp` stays on
					// the third button so the mobile deep-link return is untouched.
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
					premiumDisabled={premiumLoading}
					premiumPending={subscribeMutation.isPending}
					onChooseFree={goToApp}
					onChoosePremium={handleChoosePremium}
					subscribedCtaLabel="Continue"
				/>

				{/* No event and no referral code — this is the ordinary price, and the endpoints key
				    the code to the address alone. */}
				<EmailVerifyDialog
					open={verifyOpen}
					onClose={() => setVerifyOpen(false)}
					onVerified={() => {
						setVerifyOpen(false)
						subscribeMutation.mutate()
					}}
				/>
			</div>
			</div>
		</div>
	)
}

// Same as /premium: resolved server-side so the navbar renders the right half on the first
// paint. The magic-token auto-login above still runs for an app visitor who arrives with no
// cookie — this only reports a session that already exists.
export const getServerSideProps: GetServerSideProps = async (context) => {
	const session = await getServerSession(context.req, context.res, authOptions)
	return { props: { session } }
}

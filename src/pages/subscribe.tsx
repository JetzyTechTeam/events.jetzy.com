import Logo from "@Jetzy/assets/logo/logo.png"
import Spinner from "@Jetzy/components/misc/Spinner"
import { Success, Error as ErrorToast, Info as InfoToast } from "@Jetzy/lib/_toaster"
import { usePremiumStatus } from "@Jetzy/hooks/usePremiumStatus"
import { PREMIUM_STATUS_QUERY_KEY } from "@Jetzy/hooks/usePremiumStatus"
import PlanComparison from "@Jetzy/components/premium/PlanComparison"
import { useCurrentMembershipPlan, useMembershipPlan } from "@Jetzy/hooks/usePremiumPlan"
import { CheckIcon } from "@heroicons/react/24/solid"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { GetServerSideProps } from "next"
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

	const [isAutoLoggingIn, setIsAutoLoggingIn] = React.useState(false)
	const [hasAttemptedMagicLink, setHasAttemptedMagicLink] = React.useState(false)

	const { magicToken, eventId } = router.query

	React.useEffect(() => {
		if (typeof eventId === "string" && eventId) {
			sessionStorage.setItem(EVENT_ID_STORAGE_KEY, eventId)
		}
	}, [eventId])

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

	// No token and no existing session — bounce through the standard login page and
	// come straight back here afterwards.
	React.useEffect(() => {
		if (!router.isReady || status !== "unauthenticated" || magicToken) return
		const dest = resolvedEventId ? `/subscribe?eventId=${resolvedEventId}` : "/subscribe"
		router.replace(`/login?_cb=${encodeURIComponent(dest)}`)
	}, [router.isReady, status, magicToken, resolvedEventId, router])

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
	const { plan, prices, isLoading: planLoading } = useMembershipPlan("premium", status === "authenticated")

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
	const inviteTimer = React.useRef<NodeJS.Timeout | null>(null)

	React.useEffect(() => {
		if (inviteTimer.current) clearTimeout(inviteTimer.current)
		const code = inviteCode.trim()
		if (!code) {
			setInviteAccepted(null)
			setInviteError(null)
			setInviteChecking(false)
			return
		}
		setInviteChecking(true)
		inviteTimer.current = setTimeout(async () => {
			try {
				const { data } = await axios.post("/api/subscriptions/invite-code", { code, interval: selectedInterval })
				setInviteAccepted(data?.data?.label ? `${data.data.label} applied.` : "Invite code applied.")
				setInviteError(null)
			} catch (error: any) {
				setInviteAccepted(null)
				setInviteError(error?.response?.data?.message || "That code couldn't be applied.")
			} finally {
				setInviteChecking(false)
			}
		}, 600)
		return () => {
			if (inviteTimer.current) clearTimeout(inviteTimer.current)
		}
		// Re-checked when the interval changes: a monthly-only code stops applying on annual.
	}, [inviteCode, selectedInterval])

	const subscribeMutation = useMutation({
		mutationFn: async () => {
			// The INTERVAL, never a price id — the server resolves the id itself, so a crafted
			// request can't subscribe anyone at an arbitrary price on the account.
			const { data } = await axios.post("/api/subscriptions/checkout", {
				returnTo: "/subscribe",
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
		<div className="min-h-screen bg-[#0A0B0F] text-white px-6 py-16">
			<div className="max-w-4xl mx-auto text-center mb-12">
				<Image className="h-14 w-auto mx-auto mb-8" src={Logo} alt="Jetzy" />
				<h1 className="text-3xl md:text-4xl font-bold mb-3">Choose your Jetzy plan</h1>
				<p className="text-gray-400">Upgrade anytime. Cancel anytime.</p>
			</div>

			<div className="max-w-3xl mx-auto">
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
					premiumDisabled={premiumLoading}
					premiumPending={subscribeMutation.isPending}
					onChooseFree={goToApp}
					onChoosePremium={() => subscribeMutation.mutate()}
					subscribedCtaLabel="Continue"
				/>
			</div>
		</div>
	)
}

export const getServerSideProps: GetServerSideProps = async () => {
	return { props: {} }
}

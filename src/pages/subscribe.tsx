import Logo from "@Jetzy/assets/logo/logo.png"
import Spinner from "@Jetzy/components/misc/Spinner"
import { Success, Error as ErrorToast, Info as InfoToast } from "@Jetzy/lib/_toaster"
import { usePremiumStatus } from "@Jetzy/hooks/usePremiumStatus"
import { PREMIUM_STATUS_QUERY_KEY } from "@Jetzy/hooks/usePremiumStatus"
import { CheckIcon } from "@heroicons/react/24/solid"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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

type PlanInfo = {
	name: string
	unitAmount: number | null
	currency: string
	interval: string
}

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

	const { data: plan, isLoading: planLoading } = useQuery({
		queryKey: ["premium-plan"],
		queryFn: async () => {
			const { data } = await axios.get("/api/subscriptions/plan")
			return data?.data as PlanInfo
		},
		enabled: status === "authenticated",
	})

	const subscribeMutation = useMutation({
		mutationFn: async () => {
			const { data } = await axios.post("/api/subscriptions/checkout", { returnTo: "/subscribe" })
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
			if (error?.response?.data?.data?.alreadySubscribed) {
				InfoToast("You're already a member", "You already have an active Jetzy Premium subscription.")
				queryClient.invalidateQueries({ queryKey: PREMIUM_STATUS_QUERY_KEY })
				return
			}
			ErrorToast("Error", error?.response?.data?.message || "Could not start checkout. Please try again.")
		},
	})

	const formattedPrice =
		plan?.unitAmount != null
			? (plan.unitAmount / 100).toLocaleString("en-US", { style: "currency", currency: plan.currency || "usd" })
			: null

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

			<div className="max-w-3xl mx-auto grid gap-6 sm:grid-cols-2">
				{/* Free tier — no Stripe object backs this, it's just "not subscribed" */}
				<div className="bg-[#1E1E1E] border-2 border-[#2b2b2b] rounded-2xl p-6 flex flex-col">
					<h2 className="text-xl font-bold mb-1">Jetzy Basic</h2>
					<p className="text-sm text-gray-400 mb-4">Free, forever</p>
					<p className="text-3xl font-bold mb-6">$0</p>
					<ul className="space-y-3 text-sm text-gray-300 flex-1 mb-6">
						<li className="flex gap-2">
							<CheckIcon className="w-5 h-5 text-jetzy shrink-0" /> Discover and RSVP to events
						</li>
						<li className="flex gap-2">
							<CheckIcon className="w-5 h-5 text-jetzy shrink-0" /> Chat with hosts and attendees
						</li>
						<li className="flex gap-2">
							<CheckIcon className="w-5 h-5 text-jetzy shrink-0" /> Standard ticket pricing
						</li>
					</ul>
					<button
						onClick={goToApp}
						className="bg-[#2b2b2b] hover:bg-[#343434] text-white font-bold px-6 py-3 rounded-full transition-colors"
					>
						Continue with Free
					</button>
				</div>

				{/* Premium tier — backed by the real Stripe subscription product */}
				<div className="bg-[#1E1E1E] border-2 border-jetzy rounded-2xl p-6 flex flex-col relative">
					<span className="absolute -top-3 right-6 bg-jetzy text-black text-xs font-bold px-3 py-1 rounded-full">
						BEST DEAL
					</span>
					<h2 className="text-xl font-bold mb-1">{plan?.name || "Jetzy Premium"}</h2>
					<p className="text-sm text-gray-400 mb-4">Billed {plan?.interval || "month"}ly</p>

					{planLoading ? (
						<div className="mb-6">
							<Spinner />
						</div>
					) : (
						<p className="text-3xl font-bold mb-6" style={{ color: "#F5C518" }}>
							{formattedPrice || "—"}
							<span className="text-sm text-gray-400 font-normal"> / {plan?.interval || "month"}</span>
						</p>
					)}

					<ul className="space-y-3 text-sm text-gray-300 flex-1 mb-6">
						<li className="flex gap-2">
							<CheckIcon className="w-5 h-5 shrink-0" style={{ color: "#F5C518" }} /> Everything in Basic
						</li>
						<li className="flex gap-2">
							<CheckIcon className="w-5 h-5 shrink-0" style={{ color: "#F5C518" }} /> Invite-only events and experiences
						</li>
						<li className="flex gap-2">
							<CheckIcon className="w-5 h-5 shrink-0" style={{ color: "#F5C518" }} /> Curated networking with fellow members
						</li>
						<li className="flex gap-2">
							<CheckIcon className="w-5 h-5 shrink-0" style={{ color: "#F5C518" }} /> Personalized match recommendations
						</li>
						<li className="flex gap-2">
							<CheckIcon className="w-5 h-5 shrink-0" style={{ color: "#F5C518" }} /> Member-only pricing and discounts
						</li>
						<li className="flex gap-2">
							<CheckIcon className="w-5 h-5 shrink-0" style={{ color: "#F5C518" }} /> Host Premium Events with member-only
							pricing
						</li>
					</ul>

					{isPremium ? (
						<button onClick={goToApp} className="bg-jetzy text-black font-bold px-6 py-3 rounded-full transition-colors">
							You&apos;re subscribed — Continue
						</button>
					) : (
						<button
							disabled={subscribeMutation.isPending || premiumLoading}
							onClick={() => subscribeMutation.mutate()}
							className="bg-jetzy text-black font-bold px-6 py-3 rounded-full hover:opacity-90 transition-colors disabled:opacity-50"
						>
							{subscribeMutation.isPending ? <Spinner /> : "Subscribe Now"}
						</button>
					)}
				</div>
			</div>
		</div>
	)
}

export const getServerSideProps: GetServerSideProps = async () => {
	return { props: {} }
}

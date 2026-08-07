import React, { useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { useSession } from "next-auth/react"
import { useRouter } from "next/router"
import { Error as ErrorToast, Info as InfoToast } from "@/lib/_toaster"
import { PREMIUM_STATUS_QUERY_KEY } from "@/hooks/usePremiumStatus"
import { membershipPlanQueryKey } from "@/hooks/usePremiumPlan"
import PlanComparison, { type PlanInfo } from "@/components/premium/PlanComparison"

// Query param that marks "the visitor was sent to /login specifically to finish
// subscribing" — set right before the redirect, read back on return to auto-resume
// straight into Stripe instead of making them click Subscribe a second time.
const RESUME_PARAM = "premiumSubscribe"
const RESUME_SESSION_KEY = "jetzy_premium_resume_handled"

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

	// Shares the key with `useMembershipPlan("premium")`, so opening this after the price has
	// been fetched elsewhere on the page costs no extra request.
	const { data: plan, isLoading: planLoading } = useQuery({
		queryKey: membershipPlanQueryKey("premium"),
		queryFn: async () => {
			const { data } = await axios.get("/api/subscriptions/plan?membership=premium")
			return data?.data as PlanInfo
		},
		enabled: isOpen,
		staleTime: 5 * 60_000,
	})

	const subscribeMutation = useMutation({
		mutationFn: async () => {
			const { data } = await axios.post("/api/subscriptions/checkout", { returnTo })
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
			// Logged-out visitor turned out to already have an active subscription once
			// they signed in (see the resume effect below) — that's good news, not an
			// error, so tell them plainly and close the modal instead of showing "failed".
			if (error?.response?.data?.data?.alreadySubscribed) {
				InfoToast("You're already a member", "You already have an active Jetzy Premium subscription.")
				queryClient.invalidateQueries({ queryKey: PREMIUM_STATUS_QUERY_KEY })
				onClose()
				return
			}
			const message = error?.response?.data?.message || "Could not start checkout. Please try again."
			ErrorToast("Error", message)
		},
	})

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

	if (!isOpen) return null

	// Subscribing requires an account. A logged-out visitor is sent to log in first,
	// then automatically resumed straight into Stripe on return (see the effect above).
	const handleSubscribeClick = () => {
		if (sessionStatus !== "authenticated") {
			const url = new URL(window.location.href)
			url.searchParams.set(RESUME_PARAM, "1")
			router.push(`/login?_cb=${encodeURIComponent(url.pathname + url.search)}`)
			return
		}
		subscribeMutation.mutate()
	}

	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
			{/* Wide enough for two cards side by side; they stack below `sm`. */}
			<div className="bg-[#1E1E1E] rounded-2xl shadow-2xl w-full max-w-3xl relative max-h-[90vh] flex flex-col overflow-hidden">
				<button
					onClick={onClose}
					className="absolute top-2 right-2 bg-black text-white w-8 h-8 rounded-full flex items-center justify-center z-10"
				>
					&times;
				</button>

				<div className="p-6 overflow-y-auto">
					<div className="text-center">
						<h2 className="text-2xl font-bold text-white mb-1">Choose your Jetzy plan</h2>
						<p className="text-gray-400 text-sm mb-6">Upgrade anytime. Cancel anytime.</p>
						{message && <p className="text-gray-400 text-sm mb-6">{message}</p>}
					</div>

					<PlanComparison
						plan={plan}
						planLoading={planLoading}
						onChooseFree={onClose}
						onChoosePremium={handleSubscribeClick}
						premiumPending={subscribeMutation.isPending}
					/>
				</div>
			</div>
		</div>
	)
}

export default PremiumPaywallModal

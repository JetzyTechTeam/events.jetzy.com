import React, { useEffect, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useRouter } from "next/router"
import { CheckIcon } from "@heroicons/react/24/solid"
import { Error as ErrorToast } from "@/lib/_toaster"
import { ROUTES } from "@/configs/routes"
import { PREMIUM_STATUS_QUERY_KEY, usePremiumStatus } from "@/hooks/usePremiumStatus"
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
	const { isPremium } = usePremiumStatus()

	// "You already have this" is a RESULT worth showing, not an error to swallow.
	//
	// It matters most on the login round-trip: a logged-out visitor clicks Subscribe, signs
	// in, and we resume straight into Stripe — but by then the modal is closed, because
	// `isOpen` is owned by the navbar and defaults to false on the fresh page load. Anything
	// reported by a toast at that moment lands on a screen the visitor isn't looking at, so
	// the click appeared to do nothing at all. This state lets the modal reopen itself and
	// say so plainly.
	const [alreadyMember, setAlreadyMember] = useState(false)

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

	// Stays mounted while `alreadyMember` is set even if the parent thinks it's closed —
	// that is exactly the post-login case described above.
	if (!isOpen && !alreadyMember) return null

	const handleClose = () => {
		setAlreadyMember(false)
		onClose()
	}

	// Subscribing requires an account. A logged-out visitor is sent to log in first,
	// then automatically resumed straight into Stripe on return (see the effect above).
	const handleSubscribeClick = () => {
		if (sessionStatus !== "authenticated") {
			const url = new URL(window.location.href)
			url.searchParams.set(RESUME_PARAM, "1")
			router.push(`/login?_cb=${encodeURIComponent(url.pathname + url.search)}`)
			return
		}
		// Caught client-side too, so a member who reaches this dialog is told immediately
		// rather than after a round trip that can only fail.
		if (isPremium) {
			setAlreadyMember(true)
			return
		}
		subscribeMutation.mutate()
	}

	// Someone who already subscribes has nothing to buy here — show that instead of the cards.
	const showAlreadyMember = alreadyMember || (isOpen && isPremium)

	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
			{/* Wide enough for two cards side by side; they stack below `sm`. */}
			<div
				className={`bg-[#1E1E1E] rounded-2xl shadow-2xl w-full relative max-h-[90vh] flex flex-col overflow-hidden ${
					showAlreadyMember ? "max-w-md" : "max-w-3xl"
				}`}
			>
				<button
					onClick={handleClose}
					className="absolute top-2 right-2 bg-black text-white w-8 h-8 rounded-full flex items-center justify-center z-10"
				>
					&times;
				</button>

				{showAlreadyMember ? (
					<div className="p-6 overflow-y-auto text-center">
						<div
							className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
							style={{ background: "rgba(34,197,94,0.15)" }}
						>
							<CheckIcon className="w-8 h-8 text-green-500" />
						</div>
						<h2 className="text-2xl font-bold text-white mb-2">You&apos;re already a Jetzy Premium member</h2>
						<p className="text-gray-400 text-sm mb-6">
							Your subscription is active, so there&apos;s nothing to buy here. You can change or cancel it any
							time from Manage membership.
						</p>
						<div className="flex flex-col gap-3">
							<Link
								href={ROUTES.manageMembership}
								className="bg-jetzy text-black font-bold px-6 py-3 rounded-full hover:opacity-90 transition-colors"
							>
								Manage membership
							</Link>
							<button
								onClick={handleClose}
								className="bg-[#2b2b2b] hover:bg-[#343434] text-white font-bold px-6 py-3 rounded-full transition-colors"
							>
								Close
							</button>
						</div>
					</div>
				) : (
					<div className="p-6 overflow-y-auto">
						<div className="text-center">
							<h2 className="text-2xl font-bold text-white mb-1">Choose your Jetzy plan</h2>
							<p className="text-gray-400 text-sm mb-6">Upgrade anytime. Cancel anytime.</p>
							{message && <p className="text-gray-400 text-sm mb-6">{message}</p>}
						</div>

						<PlanComparison
							plan={plan}
							planLoading={planLoading}
							onChooseFree={handleClose}
							onChoosePremium={handleSubscribeClick}
							premiumPending={subscribeMutation.isPending}
						/>
					</div>
				)}
			</div>
		</div>
	)
}

export default PremiumPaywallModal

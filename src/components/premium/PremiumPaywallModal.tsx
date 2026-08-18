import React, { useEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { useSession } from "next-auth/react"
import { useRouter } from "next/router"
import { CheckIcon } from "@heroicons/react/24/solid"
import { Error as ErrorToast } from "@/lib/_toaster"
import { trialDisclosure } from "@/lib/invite-trial"
import { PREMIUM_STATUS_QUERY_KEY, usePremiumStatus } from "@/hooks/usePremiumStatus"
import { useCurrentMembershipPlan, useMembershipPlan } from "@/hooks/usePremiumPlan"
import PlanComparison from "@/components/premium/PlanComparison"

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

	// The shared hook, not a private query: it already formats every interval's label and shares
	// its cache key, so opening this after the price has been fetched elsewhere on the page
	// costs no extra request — and the modal can't drift from `/subscribe` on how a price reads.
	const { plan, prices, isLoading: planLoading } = useMembershipPlan("premium", isOpen)

	// Which interval the buyer has picked. Left unset until the plan loads, then defaulted to the
	// product default (monthly) rather than a guessed string.
	const [selectedInterval, setSelectedInterval] = useState<string | undefined>(undefined)
	useEffect(() => {
		if (!selectedInterval && plan?.interval) setSelectedInterval(plan.interval)
	}, [plan?.interval, selectedInterval])

	// What they are on now — asked only when the dialog is actually open AND they are a member.
	// This modal is mounted by every navbar, so an ungated fetch would put a Stripe round-trip
	// behind every page view for every member.
	const { currentPlan } = useCurrentMembershipPlan(isOpen && isPremium)

	// Invite code (a free-trial code) — same behaviour as /subscribe, since both render the
	// same card and a buyer must not get a different answer depending on which door they used.
	const [inviteCode, setInviteCode] = useState("")
	const [inviteAccepted, setInviteAccepted] = useState<string | null>(null)
	const [inviteError, setInviteError] = useState<string | null>(null)
	const [inviteChecking, setInviteChecking] = useState(false)
	const inviteTimer = useRef<NodeJS.Timeout | null>(null)

	useEffect(() => {
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
	}, [inviteCode, selectedInterval])

	const subscribeMutation = useMutation({
		mutationFn: async () => {
			// The INTERVAL, never a price id — the server resolves the id itself, so a crafted
			// request can't subscribe anyone at an arbitrary price on the account.
			const { data } = await axios.post("/api/subscriptions/checkout", {
				returnTo,
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

	// A member has nothing to buy here, but they DO have something to change — the card shows
	// their plan, the switch and the portal instead of a dead end pointing at another page.
	const showMemberCard = alreadyMember || (isOpen && isPremium)

	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
			{/* Wide enough for two cards side by side; they stack below `sm`. */}
			<div className="bg-[#1E1E1E] rounded-2xl shadow-2xl w-full relative max-h-[90vh] flex flex-col overflow-hidden max-w-3xl">
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
						{alreadyMember && !isOpen && (
							<p className="text-sm mb-6 flex items-center justify-center gap-2 text-green-500">
								<CheckIcon className="w-5 h-5" /> You&apos;re already a Jetzy Premium member.
							</p>
						)}
						{!showMemberCard && message && <p className="text-gray-400 text-sm mb-6">{message}</p>}
					</div>

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
						premiumPending={subscribeMutation.isPending}
						onChooseFree={handleClose}
						onChoosePremium={handleSubscribeClick}
						freeCtaLabel={showMemberCard ? "Close" : "Continue with Free"}
						subscribedCtaLabel="Close"
					/>
				</div>
			</div>
		</div>
	)
}

export default PremiumPaywallModal

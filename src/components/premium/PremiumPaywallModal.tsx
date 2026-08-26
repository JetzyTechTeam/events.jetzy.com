import React, { useEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { useSession } from "next-auth/react"
import { useRouter } from "next/router"
import { CheckIcon } from "@heroicons/react/24/solid"
import { Error as ErrorToast } from "@/lib/_toaster"
import { resolveTrialCode, trialDisclosure, trialEndsOn } from "@/lib/invite-trial"
import { PREMIUM_STATUS_QUERY_KEY, usePremiumStatus } from "@/hooks/usePremiumStatus"
import { useCurrentMembershipPlan, useMembershipPlan } from "@/hooks/usePremiumPlan"
import PlanComparison from "@/components/premium/PlanComparison"
import EmailVerifyDialog from "@/components/premium/EmailVerifyDialog"
import { usePremiumSubscriptionReturn } from "@/hooks/usePremiumSubscriptionReturn"

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
	const isSignedIn = sessionStatus === "authenticated"

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

	/** Back from Stripe, on a purchase this dialog started. Reopens it on the member card. */
	const [justSubscribed, setJustSubscribed] = useState(false)

	/**
	 * The dialog is VISIBLE in three ways, and the queries below have to follow all three.
	 *
	 * `isOpen` is owned by the navbar and is false on a fresh page load, so a dialog that reopens
	 * itself after checkout (`justSubscribed`) or after a login round trip (`alreadyMember`) was
	 * fetching nothing: no prices meant no annual option, which meant no "Switch to $200/year" on
	 * the member card — the one action a member who just subscribed monthly might want.
	 */
	const isVisible = isOpen || justSubscribed || alreadyMember

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

		// Signed out there is no account to check against, so the code is resolved in the browser
		// from the same shared table the server enforces. It is a PREVIEW of the offer, never a
		// promise about an account we don't know yet — after sign-in the server re-checks it, and a
		// refusal is reported then. Without this the field would simply 401 and read as invalid.
		if (!isSignedIn) {
			const resolved = resolveTrialCode(code, selectedInterval)
			setInviteChecking(false)
			if (!resolved.ok) {
				setInviteAccepted(null)
				setInviteError(resolved.message)
				return
			}
			const preview = prices.find((p) => p.interval === selectedInterval) || prices.find((p) => p.isDefault) || prices[0]
			setInviteError(null)
			setInviteAccepted(trialDisclosure(resolved.offer, preview?.label || null, trialEndsOn(resolved.offer)))
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
	}, [inviteCode, selectedInterval, isSignedIn, prices])

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
				// Set before navigating away — this is the only record that survives the trip that
				// the purchase began here rather than on a page that sells memberships itself.
				try { sessionStorage.setItem(PURCHASE_MARKER, "1") } catch {}
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

		// Anything that isn't a completed session clears the marker instead of consuming it —
		// an abandoned checkout comes back as `?premium_cancelled=1`, and a marker left behind
		// there would open this dialog on the NEXT return, for a purchase made somewhere else.
		// Safe to do unconditionally: the marker is written immediately before a full page
		// navigation, so there is no render between setting it and leaving.
		if (typeof router.query.premium_session_id !== "string") {
			try { sessionStorage.removeItem(PURCHASE_MARKER) } catch {}
			return
		}

		let marked = false
		try {
			marked = sessionStorage.getItem(PURCHASE_MARKER) === "1"
			if (marked) sessionStorage.removeItem(PURCHASE_MARKER)
		} catch {}
		if (marked) setJustSubscribed(true)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [router.isReady, router.query.premium_session_id])

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
		onClose()
	}

	// Subscribing requires an account. A logged-out visitor proves their email with a code
	// instead — the account is created from it — and checkout opens without leaving this dialog.
	const handleSubscribeClick = () => {
		if (sessionStatus !== "authenticated") {
			setVerifyOpen(true)
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

	// The session now exists. Straight to Stripe, which is what they pressed the button for.
	const handleVerified = () => {
		setVerifyOpen(false)
		subscribeMutation.mutate()
	}

	// A member has nothing to buy here, but they DO have something to change — the card shows
	// their plan, the switch and the portal instead of a dead end pointing at another page.
	const showMemberCard = alreadyMember || justSubscribed || (isOpen && isPremium)

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

			{/* Sits above the card, on top of this dialog's own overlay — it is `fixed` itself, so
			    nesting is only about ownership. No event and no referral code: this is the ordinary
			    price, and the endpoints key the code to the address alone. */}
			<EmailVerifyDialog open={verifyOpen} onClose={() => setVerifyOpen(false)} onVerified={handleVerified} />
		</div>
	)
}

export default PremiumPaywallModal

import Logo from "@Jetzy/assets/logo/logo.png"
import Spinner from "@Jetzy/components/misc/Spinner"
import { Success, Error as ErrorToast, Info as InfoToast } from "@Jetzy/lib/_toaster"
import { DEFAULT_INVITE_CODE, normalizeTrialCode, resolveTrialCode, trialDisclosure, trialEndsOn } from "@/lib/invite-trial"
import { PREMIUM_STATUS_QUERY_KEY, usePremiumStatus } from "@Jetzy/hooks/usePremiumStatus"
import PlanComparison from "@Jetzy/components/premium/PlanComparison"
import EmailVerifyDialog from "@Jetzy/components/premium/EmailVerifyDialog"
import Navbar from "@Jetzy/components/misc/Navbar"
import { planPriceForInterval, useCurrentMembershipPlan, useMembershipPlan } from "@Jetzy/hooks/usePremiumPlan"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { GetServerSideProps } from "next"
import { useSession } from "next-auth/react"
import Image from "next/image"
import { useRouter } from "next/router"
import React from "react"

/**
 * The PUBLIC Jetzy Premium page — the one we email a link to.
 *
 * `/subscribe` does the same job for the mobile app: it auto-logs in from a magic token and
 * deep-links back into the app on every exit, neither of which is right for someone opening a link
 * from their inbox. It used to bounce a signed-out visitor straight to `/login` as well, which is
 * the whole reason this page exists — a campaign link must show the offer before it asks for
 * anything. That bounce is now gone from both pages.
 *
 * So the order is inverted here: SEE the plan, type the code, see what it is worth, and only then
 * identify yourself — at the moment of actually buying, with a 6-digit code rather than a password.
 *
 * The invite code has to survive whatever happens in between. It rides in the URL (it is a campaign
 * string, not a secret) and, across the trip to Stripe, in sessionStorage. What it cannot do is
 * carry a PROMISE: eligibility is per account, so the green line a logged-out visitor sees is a
 * preview. Once the account is known the code is re-checked against it, and if it is refused they
 * are told and asked what to do — never silently charged full price for something they were shown
 * as free.
 */

const SELF = "/premium"

/**
 * Survives the trip to Stripe and back. `returnTo` must stay a bare path — the checkout route
 * builds `${baseUrl}${returnTo}?premium_session_id=…`, so a query string there produces a second
 * `?` and a dead link. Same technique `subscribe.tsx` uses for its `eventId`.
 */
const STASH_KEY = "premium_invite_stash"
/** The event a shared referral code belongs to. Meaningless without the code, stored beside it. */
const STASH_EVENT_KEY = "premium_invite_event"

/** 24 hex characters. Anything else in the URL is ignored rather than sent to the server. */
const asEventId = (value: unknown): string =>
	typeof value === "string" && /^[a-f0-9]{24}$/i.test(value.trim()) ? value.trim() : ""

/** Only these two exist; anything else in the URL is ignored rather than trusted. */
const asInterval = (value: unknown): string | undefined =>
	value === "month" || value === "year" ? value : undefined

export default function PremiumPage() {
	const router = useRouter()
	const { status } = useSession()
	const queryClient = useQueryClient()
	const isAuthenticated = status === "authenticated"

	const [inviteCode, setInviteCode] = React.useState("")
	const [inviteAccepted, setInviteAccepted] = React.useState<string | null>(null)
	const [inviteError, setInviteError] = React.useState<string | null>(null)
	const [inviteChecking, setInviteChecking] = React.useState(false)
	const [selectedInterval, setSelectedInterval] = React.useState<string | undefined>(undefined)
	/**
	 * Set when the code came from a host's shared link — `/premium?code=…&event=…`.
	 *
	 * Its presence is what tells every layer this is a REFERRAL code out of Mongo rather than an
	 * invite code from the hardcoded table. Codes are unique per event, so the same string can
	 * exist elsewhere with a different number of months; without the event we would be guessing
	 * which terms to honour.
	 */
	const [referralEventId, setReferralEventId] = React.useState("")
	/**
	 * The email-and-code dialog, shown INSTEAD of bouncing to /login for every signed-out buyer.
	 *
	 * It started out limited to a shared referral link, on the reasoning that someone arriving
	 * from an email about a free membership and asked to invent a password does not come back.
	 * That is just as true of anyone who lands on this page from a campaign, so the dialog is now
	 * the door for all of them; `/login` remains reachable, it is simply no longer compulsory.
	 */
	const [verifyOpen, setVerifyOpen] = React.useState(false)
	/** Free months the shared code grants, so the dialog can name what is being claimed. */
	const [offerMonths, setOfferMonths] = React.useState<number | undefined>(undefined)
	const inviteTimer = React.useRef<NodeJS.Timeout | null>(null)

	/**
	 * The post-login continuation. `running` means we are re-checking the code and opening
	 * Checkout on their behalf; `blocked` means the code was refused and the decision is theirs
	 * again.
	 */
	const [autoState, setAutoState] = React.useState<"idle" | "running" | "blocked">("idle")
	const autoStarted = React.useRef(false)

	/**
	 * Did the buyer put this code in the field, or did we?
	 *
	 * It decides what happens when the server refuses it. A code someone typed, or one that came
	 * in on their emailed link, was a deliberate act and deserves an explanation. The one we
	 * prefill for everybody is a convenience, and a red error against a field they never touched
	 * — "this code is for new members", to a returning member who only wants to resubscribe —
	 * reads as something being broken.
	 */
	const codeIsOurs = React.useRef(true)

	// Public price — this endpoint takes no session, which is what lets the card render for a
	// visitor who has never signed in.
	const { plan, prices, isLoading: planLoading } = useMembershipPlan("premium")
	const { isPremium, isLoading: premiumLoading } = usePremiumStatus()
	const { currentPlan } = useCurrentMembershipPlan(isPremium)

	// ---- URL → state, once the router is ready ----
	React.useEffect(() => {
		if (!router.isReady) return
		const fromUrl = normalizeTrialCode(typeof router.query.code === "string" ? router.query.code : "")
		const stashed = typeof window !== "undefined" ? sessionStorage.getItem(STASH_KEY) : null
		const eventFromUrl = asEventId(router.query.event)
		const eventStashed = typeof window !== "undefined" ? sessionStorage.getItem(STASH_EVENT_KEY) : null
		setReferralEventId(eventFromUrl || asEventId(eventStashed) || "")
		// Their link, then whatever survived the trip to Stripe, then the running campaign. The
		// last one is why nobody has to type anything: the page is itself the campaign.
		if (fromUrl) {
			codeIsOurs.current = false
			setInviteCode((current) => current || fromUrl)
		} else if (stashed) {
			codeIsOurs.current = false
			setInviteCode((current) => current || stashed)
		} else if (DEFAULT_INVITE_CODE) {
			setInviteCode((current) => current || DEFAULT_INVITE_CODE)
		}

		const interval = asInterval(router.query.interval)
		if (interval) setSelectedInterval((current) => current || interval)
		// Only on first read — after that the field belongs to the buyer.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [router.isReady])

	// Default the toggle to the product's own default price rather than guessing a string.
	React.useEffect(() => {
		if (!selectedInterval && plan?.interval) setSelectedInterval(plan.interval)
	}, [plan?.interval, selectedInterval])

	const selectedPrice = React.useMemo(
		() => prices.find((p) => p.interval === selectedInterval) || prices.find((p) => p.isDefault) || prices[0],
		[prices, selectedInterval],
	)

	// ---- The offer line ----
	//
	// Two sources, deliberately. Logged out we resolve the code from the shared table in the
	// browser: it is pure, it is the same table the server enforces, and it means a visitor sees
	// what the code is worth without being asked to identify themselves first. Logged in we ask
	// the server, because only it can apply the first-timer rule.
	React.useEffect(() => {
		if (inviteTimer.current) clearTimeout(inviteTimer.current)
		const code = inviteCode.trim()

		if (!code) {
			setInviteAccepted(null)
			setInviteError(null)
			setInviteChecking(false)
			return
		}

		// A shared referral code lives in Mongo, so even the logged-out preview has to ask — but it
		// asks the PUBLIC validate route, which takes no session. The offer is still shown before
		// anyone is asked who they are.
		if (!isAuthenticated && referralEventId) {
			setInviteChecking(true)
			inviteTimer.current = setTimeout(async () => {
				try {
					const { data } = await axios.post(`/api/events/${referralEventId}/referral-codes/validate`, {
						eventId: referralEventId,
						code,
					})
					const months = Number(data?.data?.freeMembershipMonths) || 0
					setOfferMonths(months || undefined)
					if (!months) {
						setInviteAccepted(null)
						setInviteError("This code doesn't include free months of Jetzy Premium.")
						return
					}
					const offer = { months, intervals: [], label: `${months} month${months === 1 ? "" : "s"} free` }
					setInviteError(null)
					setInviteAccepted(trialDisclosure(offer, selectedPrice?.label || null, trialEndsOn(offer)))
				} catch (error: any) {
					setInviteAccepted(null)
					setInviteError(error?.response?.data?.message || "That code couldn't be applied.")
				} finally {
					setInviteChecking(false)
				}
			}, 400)
			return () => {
				if (inviteTimer.current) clearTimeout(inviteTimer.current)
			}
		}

		if (!isAuthenticated) {
			const resolved = resolveTrialCode(code, selectedInterval)
			setInviteChecking(false)
			if (!resolved.ok) {
				setInviteAccepted(null)
				setInviteError(resolved.message)
				return
			}
			setInviteError(null)
			setInviteAccepted(trialDisclosure(resolved.offer, selectedPrice?.label || null, trialEndsOn(resolved.offer)))
			return
		}

		setInviteChecking(true)
		inviteTimer.current = setTimeout(async () => {
			try {
				const { data } = await axios.post("/api/subscriptions/invite-code", {
					code,
					interval: selectedInterval,
					...(referralEventId ? { event: referralEventId } : {}),
				})
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
				// Ours and refused — most often a member who has had Premium before. Clear it and
				// let them buy at the normal price, rather than accusing them of a bad code.
				if (codeIsOurs.current) {
					setInviteCode("")
					setInviteError(null)
				} else {
					setInviteError(error?.response?.data?.message || "That code couldn't be applied.")
				}
			} finally {
				setInviteChecking(false)
			}
		}, 600)

		return () => {
			if (inviteTimer.current) clearTimeout(inviteTimer.current)
		}
		// Re-run on interval too: the amount that follows the free months changes with it.
	}, [inviteCode, selectedInterval, isAuthenticated, selectedPrice?.label, referralEventId])

	// ---- Checkout ----
	const startCheckout = React.useCallback(
		async (code?: string) => {
			if (typeof window !== "undefined") {
				// Stripe's success_url is built server-side from a bare path, so anything we want
				// back afterwards has to be stashed rather than appended.
				if (code) {
					sessionStorage.setItem(STASH_KEY, code)
					if (referralEventId) sessionStorage.setItem(STASH_EVENT_KEY, referralEventId)
				} else {
					sessionStorage.removeItem(STASH_KEY)
					sessionStorage.removeItem(STASH_EVENT_KEY)
				}
			}
			const { data } = await axios.post("/api/subscriptions/checkout", {
				returnTo: SELF,
				...(selectedInterval ? { interval: selectedInterval } : {}),
				...(code ? { inviteCode: code } : {}),
				// Present only for a shared referral code — the server reads the months from that
				// event's record rather than the hardcoded table.
				...(code && referralEventId ? { event: referralEventId } : {}),
			})
			return data?.data as { url: string }
		},
		[selectedInterval, referralEventId],
	)

	const subscribeMutation = useMutation({
		mutationFn: () => startCheckout(inviteCode.trim() || undefined),
		onSuccess: (data) => {
			if (data?.url) window.location.href = data.url
			else ErrorToast("Error", "Could not start checkout. Please try again.")
		},
		onError: (error: any) => {
			// Refused at the door — say so on the field rather than in a toast over an unchanged
			// form, which reads as though nothing happened.
			if (error?.response?.data?.data?.inviteCode) {
				setInviteError(error?.response?.data?.message || "That code couldn't be applied.")
				setAutoState("blocked")
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

	/** Buy at the normal price, after a code turned out not to apply to this account. */
	const withoutCodeMutation = useMutation({
		mutationFn: () => startCheckout(undefined),
		onSuccess: (data) => {
			if (data?.url) window.location.href = data.url
			else ErrorToast("Error", "Could not start checkout. Please try again.")
		},
		onError: (error: any) => {
			ErrorToast("Error", error?.response?.data?.message || "Could not start checkout. Please try again.")
		},
	})

	// ---- Get Premium ----
	const handleChoosePremium = React.useCallback(() => {
		if (isAuthenticated) {
			subscribeMutation.mutate()
			return
		}
		// Everything stays on this page: prove the email with a code, and the account is created
		// from it. No password is ever chosen, because asking a stranger to invent one is where
		// this journey used to end.
		//
		// The `/login?_cb=…&go=1` round trip it replaced still works — old links carry it and the
		// effect below still honours it — but nothing sends anyone down it any more.
		setVerifyOpen(true)
	}, [isAuthenticated, subscribeMutation])

	// ---- Back from login with intent ----
	//
	// Runs once. The code is re-checked against THIS account before any money moves: the line they
	// saw while logged out was a preview of the offer, not a promise this account qualifies for.
	React.useEffect(() => {
		if (!router.isReady || autoStarted.current) return
		if (router.query.go !== "1" || !isAuthenticated) return
		// Nothing to buy, and nothing to explain — they already have it.
		if (premiumLoading) return
		if (isPremium) {
			autoStarted.current = true
			router.replace(SELF, undefined, { shallow: true })
			return
		}

		autoStarted.current = true
		setAutoState("running")

		const code = normalizeTrialCode(typeof router.query.code === "string" ? router.query.code : "") || inviteCode.trim()
		const sharedEventId = asEventId(router.query.event) || referralEventId

		;(async () => {
			try {
				if (code) {
					// Throws when the account isn't eligible — which is the case this whole flow
					// exists to handle honestly.
					await axios.post("/api/subscriptions/invite-code", {
						code,
						interval: asInterval(router.query.interval) || selectedInterval,
						...(sharedEventId ? { event: sharedEventId } : {}),
					})
				}
				const data = await startCheckout(code || undefined)
				if (data?.url) {
					window.location.href = data.url
					return
				}
				setAutoState("blocked")
				ErrorToast("Error", "Could not start checkout. Please try again.")
			} catch (error: any) {
				// Stop here. They are one click from paying full price for something they were
				// shown as free, so the decision goes back to them with the reason attached.
				setAutoState("blocked")
				setInviteAccepted(null)
				setInviteError(error?.response?.data?.message || "That code couldn't be applied to this account.")
				// Drop `go` so a refresh doesn't try again.
				const params = new URLSearchParams()
				if (code) params.set("code", code)
				if (code && sharedEventId) params.set("event", sharedEventId)
				const interval = asInterval(router.query.interval) || selectedInterval
				if (interval) params.set("interval", interval)
				router.replace(`${SELF}${params.toString() ? `?${params.toString()}` : ""}`, undefined, { shallow: true })
			}
		})()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [router.isReady, router.query.go, isAuthenticated, isPremium, premiumLoading])

	/**
	 * The session now exists. Run the same continuation the `go=1` return runs — re-check the code
	 * against the account we finally know about, then open Stripe — rather than a second path that
	 * could drift from it. A refusal lands in the existing `blocked` state.
	 */
	const handleVerified = React.useCallback(() => {
		setVerifyOpen(false)
		autoStarted.current = true
		setAutoState("running")

		;(async () => {
			const code = inviteCode.trim()
			try {
				if (code) {
					await axios.post("/api/subscriptions/invite-code", {
						code,
						interval: selectedInterval,
						...(referralEventId ? { event: referralEventId } : {}),
					})
				}
				const data = await startCheckout(code || undefined)
				if (data?.url) {
					window.location.href = data.url
					return
				}
				setAutoState("blocked")
				ErrorToast("Error", "Could not start checkout. Please try again.")
			} catch (error: any) {
				setAutoState("blocked")
				setInviteAccepted(null)
				setInviteError(error?.response?.data?.message || "That code couldn't be applied to this account.")
			}
		})()
	}, [inviteCode, referralEventId, selectedInterval, startCheckout])

	// ---- Back from Stripe ----
	React.useEffect(() => {
		const sessionId = router.query.premium_session_id
		if (!sessionId || typeof sessionId !== "string") return

		axios
			.get(`/api/subscriptions/confirm?session_id=${sessionId}`)
			.then(() => {
				sessionStorage.removeItem(STASH_KEY)
				sessionStorage.removeItem(STASH_EVENT_KEY)
				setInviteCode("")
				Success("Welcome to Jetzy Premium!", "Your membership is now active.")
				queryClient.invalidateQueries({ queryKey: PREMIUM_STATUS_QUERY_KEY })
				router.replace(SELF, undefined, { shallow: true })
			})
			.catch(() => {
				ErrorToast("Error", "We couldn't confirm your membership. Please contact support if this persists.")
			})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [router.query.premium_session_id])

	React.useEffect(() => {
		if (router.query.premium_cancelled !== "1") return
		InfoToast("Checkout cancelled", "Nothing was charged. Your invite code is still applied.")
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [router.query.premium_cancelled])

	// Cancel, change card, or move to annual — member state only.
	const portalMutation = useMutation({
		mutationFn: async (flow?: "switch") => {
			const { data } = await axios.post("/api/subscriptions/portal", { returnTo: SELF, ...(flow ? { flow } : {}) })
			return data?.data as { url: string }
		},
		onSuccess: (data) => {
			if (data?.url) window.location.href = data.url
			else ErrorToast("Error", "Could not open the billing portal. Please try again.")
		},
		onError: (error: any) => {
			ErrorToast("Error", error?.response?.data?.message || "Could not open the billing portal. Please try again.")
		},
	})

	if (autoState === "running") {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0B0F] px-6 text-center">
				<Image className="h-20 w-auto mb-8 animate-pulse" src={Logo} alt="Jetzy" />
				<Spinner />
				<p className="mt-4 text-white font-medium">Setting up your checkout…</p>
				<p className="mt-1 text-sm text-gray-400">Applying your invite code.</p>
			</div>
		)
	}

	return (
		<div className="min-h-screen bg-[#0A0B0F] text-white">
			{/* Signing out has to be reachable from here: this page is emailed to people, and until
			    now the only way off it for someone signed in as the wrong account was the browser's
			    back button. `handlesPremiumReturn` because the Stripe return is confirmed below;
			    `hideMembershipCta` because the page underneath already sells the membership. */}
			<Navbar hideMembershipCta handlesPremiumReturn />

			<div className="px-6 py-16">
			<div className="max-w-4xl mx-auto text-center mb-12">
				<Image className="h-14 w-auto mx-auto mb-8" src={Logo} alt="Jetzy" />
				<h1 className="text-3xl md:text-4xl font-bold mb-3">Choose your Jetzy plan</h1>
				<p className="text-gray-400">Upgrade anytime. Cancel anytime.</p>
			</div>

			<div className="max-w-3xl mx-auto">
				{/* The same card the paywall modal and /subscribe render, so the offer reads
				    identically whichever door someone came through. */}
				<PlanComparison
					plan={plan}
					planLoading={planLoading}
					prices={prices}
					selectedInterval={selectedInterval}
					onIntervalChange={setSelectedInterval}
					isPremium={isPremium}
					currentPlan={currentPlan}
					onSwitchInterval={() => portalMutation.mutate("switch")}
					onManageBilling={() => portalMutation.mutate(undefined)}
					billingPending={portalMutation.isPending}
					inviteCode={inviteCode}
					onInviteCodeChange={(next) => {
						// From here on it is their code, so a refusal is explained rather than swallowed.
						codeIsOurs.current = false
						setInviteCode(next)
					}}
					inviteAccepted={inviteAccepted}
					inviteError={inviteError}
					inviteChecking={inviteChecking}
					premiumPending={subscribeMutation.isPending}
					// A shared link is one specific offer, not a menu — "Continue with Free" beside it
					// invites the recipient to decline something they were given.
					hideFreePlan={!!referralEventId}
					// Browsing is the free plan here — there is no app to hand back to.
					onChooseFree={() => router.push("/")}
					onChoosePremium={handleChoosePremium}
					subscribedCtaLabel="Browse events"
				/>

				<EmailVerifyDialog
				open={verifyOpen}
				eventId={referralEventId}
				referralCode={inviteCode.trim()}
				months={offerMonths}
				onClose={() => setVerifyOpen(false)}
				onVerified={handleVerified}
			/>

			{/* Only after a code was refused for THIS account. Buying without it is a real
				    choice, so it gets a real button rather than being the silent default. */}
				{autoState === "blocked" && !isPremium && (
					<div className="mt-6 rounded-xl border border-[#2b2b2b] bg-[#141414] p-4 text-center">
						<p className="text-sm text-gray-300">
							Your invite code couldn&apos;t be applied to this account. You can still join at the normal price.
						</p>
						<button
							onClick={() => withoutCodeMutation.mutate()}
							disabled={withoutCodeMutation.isPending}
							className="mt-3 rounded-full bg-jetzy px-6 py-2.5 font-bold text-black transition-colors hover:opacity-90 disabled:opacity-50"
						>
							{withoutCodeMutation.isPending ? <Spinner /> : "Continue without the code"}
						</button>
					</div>
				)}
			</div>
			</div>
		</div>
	)
}

// Public on purpose — no `authorizedOnly`, and no redirect for a signed-out visitor. This page is
// the thing we email to people who have never logged in.
export const getServerSideProps: GetServerSideProps = async () => {
	return { props: {} }
}

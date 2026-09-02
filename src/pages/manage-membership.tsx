import Logo from "@Jetzy/assets/logo/logo.png"
import Spinner from "@Jetzy/components/misc/Spinner"
import Navbar from "@Jetzy/components/misc/Navbar"
import EmailVerifyDialog from "@Jetzy/components/premium/EmailVerifyDialog"
import { ROUTES, homeRouteForRole } from "@Jetzy/configs/routes"
import { PREMIUM_STATUS_QUERY_KEY, usePremiumStatus } from "@Jetzy/hooks/usePremiumStatus"
import { useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { useSession } from "next-auth/react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/router"
import React from "react"

/**
 * The one place to cancel or change a Jetzy membership — Premium, Full Concierge, or both.
 *
 * It exists because the billing portal alone is a dead end for anyone who isn't already
 * signed in: `/api/subscriptions/portal` answers 401 with "You need to be logged in", which
 * surfaces as a toast and leaves the visitor with nothing to click. That matters more than
 * usual here, because a membership can be acquired as a side effect of buying a ticket — so
 * the person who needs to cancel may never have consciously created an account, and is
 * reading this link from a checkout form or an email rather than from inside the app.
 *
 * Four states, all handled:
 *   - not signed in      → email + 6-digit code, right here (see below)
 *   - member             → straight out to Stripe's portal, which lists EVERY subscription
 *                          on their Stripe Customer with its own cancel button
 *   - back from Stripe   → a terminus with working links; see the redirect-loop note below
 *   - signed in, no plan → say so plainly, and offer the way to subscribe
 *
 * NOBODY IS SENT TO /login FROM HERE (CEO, 2026-09-02). This page is reached from a cancellation
 * link, and a membership can be acquired as a side effect of buying a ticket — so the person who
 * needs to cancel may never have consciously created an account and has no password to type. They
 * prove the address with the same `EmailVerifyDialog` the Premium pages use; NextAuth creates the
 * record from the magic token if there isn't one.
 *
 * Gated on `hasBillingAccount`, NOT on Jetzy Premium specifically. Gating on Premium told a
 * Full Concierge member they had "nothing to manage" while their card was being charged every
 * month, with no way out of it anywhere in the product.
 */
export default function ManageMembershipPage() {
	const router = useRouter()
	const { data: session, status } = useSession()
	const { hasBillingAccount, isLoading: premiumLoading } = usePremiumStatus()

	// Admins work from the console, so "Back to Jetzy" has to mean the console for them —
	// the same rule login uses to decide where to land.
	const homeHref = homeRouteForRole((session?.user as any)?.role)

	// Stripe's portal returns HERE, and this page's whole job is to send members TO the portal.
	// Without a marker on the way back, arriving means a fresh mount with `hasBillingAccount`
	// still true, and the effect below bouncing the visitor straight to Stripe again — an
	// inescapable loop in which "Back to Jetzy" can never be clicked, because the redirect
	// always wins the race. This flag is what breaks it.
	const returnedFromPortal = router.query.from === "portal"

	const queryClient = useQueryClient()

	const [error, setError] = React.useState<string | null>(null)
	const [isOpening, setIsOpening] = React.useState(false)
	// Open on arrival for a signed-out visitor: they came here to do one thing, and a dialog
	// they have to find a button for is just the login redirect with extra steps.
	const [verifyOpen, setVerifyOpen] = React.useState(true)
	// The portal is opened at most once per visit — without this, a re-render mid-redirect
	// would fire a second billingPortal session.
	const hasOpenedRef = React.useRef(false)

	// Signed in but with nothing to manage. Held locally as well as derived, because the
	// post-verification path answers this from `/api/subscriptions/me` directly rather than
	// waiting for the session to propagate into `usePremiumStatus`.
	const [verifiedNoBilling, setVerifiedNoBilling] = React.useState(false)

	// Shared by the effect below and by the code dialog, so there is one implementation of
	// "send them to Stripe" and the two can't drift.
	const openPortal = React.useCallback(async () => {
		setIsOpening(true)
		try {
			const response = await fetch("/api/subscriptions/portal", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				// Carries the marker back, so returning doesn't relaunch the portal.
				body: JSON.stringify({ returnTo: `${ROUTES.manageMembership}?from=portal` }),
			})
			const result = await response.json()
			if (result?.status && result?.data?.url) {
				window.location.href = result.data.url
				return
			}
			setError(result?.message || "We couldn't open the billing portal. Please try again.")
		} catch {
			setError("We couldn't open the billing portal. Please try again.")
		} finally {
			setIsOpening(false)
		}
	}, [])

	// Signed in and billable: hand straight over to Stripe. No intermediate click — the
	// visitor already asked to manage their membership by coming here.
	React.useEffect(() => {
		if (!router.isReady || returnedFromPortal) return
		if (status !== "authenticated" || premiumLoading || !hasBillingAccount || hasOpenedRef.current) return
		hasOpenedRef.current = true
		openPortal()
	}, [router.isReady, returnedFromPortal, status, hasBillingAccount, premiumLoading, openPortal])

	/**
	 * The address is proved — carry on without waiting for `useSession` to catch up.
	 *
	 * `signIn` has already set the cookie, so this request is authenticated; asking the server
	 * directly is what lets the portal open on the same click rather than a render or two later,
	 * and it decides between "straight to Stripe" and "nothing here" from one answer.
	 */
	const handleVerified = React.useCallback(async () => {
		setVerifyOpen(false)
		setIsOpening(true)
		queryClient.invalidateQueries({ queryKey: PREMIUM_STATUS_QUERY_KEY })
		try {
			const { data } = await axios.get("/api/subscriptions/me")
			if (data?.data?.hasBillingAccount) {
				// Set BEFORE navigating: the session is about to flip to authenticated, and the
				// effect above would otherwise open a second portal session.
				hasOpenedRef.current = true
				await openPortal()
				return
			}
			setVerifiedNoBilling(true)
		} catch {
			setError("We couldn't check this account. Please try again.")
		} finally {
			setIsOpening(false)
		}
	}, [openPortal, queryClient])

	const signedOut = status === "unauthenticated"
	const noMembership = (status === "authenticated" && !premiumLoading && !hasBillingAccount) || verifiedNoBilling
	const isWorking = !returnedFromPortal && !error && !signedOut && (status === "loading" || premiumLoading || isOpening)

	return (
		<div className="min-h-screen bg-[#0A0B0F] text-white flex flex-col">
			{/* Somebody who acquired a membership by buying a ticket may have no idea which account
			    they are signed in as — and memberships follow the checkout email, so "no membership
			    here" often means "wrong account". Logout is the fix, and it needs to be on the page
			    that says so. */}
			<Navbar hideEventNav />

			<div className="flex flex-1 items-center justify-center px-4 py-12">
			<div className="w-full max-w-md text-center">
				<Link href={homeHref} className="inline-block mb-8">
					<Image src={Logo} alt="Jetzy" width={120} height={40} style={{ objectFit: "contain" }} />
				</Link>

				<h1 className="text-2xl font-bold mb-3">Manage your Jetzy membership</h1>

				{isWorking && (
					<>
						<div className="flex justify-center my-6">
							<Spinner />
						</div>
						<p className="text-gray-400 text-sm">Opening your billing portal…</p>
					</>
				)}

				{/* Signed out. The dialog is already up; this is what sits behind it, and what
				    they land on if they close it — a way back in, never a dead end. */}
				{signedOut && !error && (
					<>
						<p className="text-gray-300 text-sm mt-4">
							Sign in with your email to manage or cancel your membership. We&apos;ll send you a 6-digit
							code — no password needed.
						</p>
						{!verifyOpen && (
							<button
								type="button"
								onClick={() => setVerifyOpen(true)}
								className="mt-6 bg-[#F5C518] text-black font-bold px-6 py-3 rounded-xl"
							>
								Sign in
							</button>
						)}
					</>
				)}

				{/* Back from Stripe. A terminus on purpose: whatever they changed is already saved
				    on Stripe's side, so re-opening the portal has to be a deliberate click. */}
				{returnedFromPortal && !error && (
					<>
						<p className="text-gray-300 text-sm mt-4">
							You&apos;re all set — any changes you made are saved. A cancellation takes effect at the end
							of the billing period you&apos;ve already paid for.
						</p>
						<div className="flex flex-col items-center gap-3 mt-6">
							<Link href={homeHref} className="bg-[#F5C518] text-black font-bold px-6 py-3 rounded-xl">
								Back to Jetzy
							</Link>
							<Link
								href={ROUTES.manageMembership}
								className="text-gray-400 text-sm underline"
								onClick={() => {
									// Dropping the query param doesn't remount the page, so release the
									// latch by hand or the effect will refuse to run a second time.
									hasOpenedRef.current = false
								}}
							>
								Open the billing portal again
							</Link>
						</div>
					</>
				)}

				{!isWorking && !error && !returnedFromPortal && !signedOut && noMembership && (
					<>
						<p className="text-gray-300 text-sm mt-4">
							This account doesn&apos;t have an active membership, so there&apos;s nothing to manage.
						</p>
						<p className="text-gray-400 text-xs mt-3">
							If you bought a ticket that included a membership, it may be attached to a different email —
							memberships follow the address used at checkout. Sign in with that address to manage it.
						</p>
						<div className="flex flex-col items-center gap-3 mt-6">
							<Link href={ROUTES.subscribe} className="bg-[#F5C518] text-black font-bold px-6 py-3 rounded-xl">
								See Jetzy Premium
							</Link>
							<Link href={homeHref} className="text-gray-400 text-sm underline">
								Back to Jetzy
							</Link>
						</div>
					</>
				)}

				{error && (
					<>
						<div className="mt-6 rounded-lg p-3 bg-red-500/15 border border-red-500/50">
							<p className="text-red-400 text-sm">{error}</p>
						</div>
						<button
							type="button"
							onClick={() => {
								hasOpenedRef.current = false
								setError(null)
							}}
							className="mt-4 underline text-sm text-gray-300"
						>
							Try again
						</button>
					</>
				)}

				{/* No event and no referral code: this is the ordinary "email me a sign-in code",
				    keyed to the address alone. */}
				<EmailVerifyDialog
					open={signedOut && verifyOpen}
					description="We'll email you a 6-digit code to manage your membership. No password needed."
					onClose={() => setVerifyOpen(false)}
					onVerified={handleVerified}
				/>

				{/* The catch-all way out. Hidden in the two states that already offer their own
				    "Back to Jetzy", so the page never shows the same link twice. */}
				{!returnedFromPortal && !(noMembership && !isWorking && !error) && (
					<div className="mt-10">
						<Link href={homeHref} className="text-gray-500 text-sm underline">
							Back to Jetzy
						</Link>
					</div>
				)}
			</div>
			</div>
		</div>
	)
}

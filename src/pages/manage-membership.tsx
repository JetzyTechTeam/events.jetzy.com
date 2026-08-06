import Logo from "@Jetzy/assets/logo/logo.png"
import Spinner from "@Jetzy/components/misc/Spinner"
import { ROUTES } from "@Jetzy/configs/routes"
import { usePremiumStatus } from "@Jetzy/hooks/usePremiumStatus"
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
 * Three states, all handled:
 *   - not signed in      → bounce through /login and come straight back
 *   - member             → straight out to Stripe's portal, which lists EVERY subscription
 *                          on their Stripe Customer with its own cancel button
 *   - signed in, no plan → say so plainly, and offer the way to subscribe
 *
 * Gated on `hasBillingAccount`, NOT on Jetzy Premium specifically. Gating on Premium told a
 * Full Concierge member they had "nothing to manage" while their card was being charged every
 * month, with no way out of it anywhere in the product.
 */
export default function ManageMembershipPage() {
	const router = useRouter()
	const { status } = useSession()
	const { hasBillingAccount, isLoading: premiumLoading } = usePremiumStatus()

	const [error, setError] = React.useState<string | null>(null)
	const [isOpening, setIsOpening] = React.useState(false)
	// The portal is opened at most once per visit — without this, a re-render mid-redirect
	// would fire a second billingPortal session.
	const hasOpenedRef = React.useRef(false)

	// Not signed in: use the standard callback round-trip, so login (or signup, which
	// forwards the same param) returns here rather than dumping them on the home page.
	React.useEffect(() => {
		if (!router.isReady || status !== "unauthenticated") return
		router.replace(`${ROUTES.login}?_cb=${encodeURIComponent(ROUTES.manageMembership)}`)
	}, [router, status])

	// Signed in and subscribed: hand straight over to Stripe. No intermediate click — the
	// visitor already asked to manage their membership by coming here.
	React.useEffect(() => {
		if (status !== "authenticated" || premiumLoading || !hasBillingAccount || hasOpenedRef.current) return
		hasOpenedRef.current = true
		setIsOpening(true)

		const run = async () => {
			try {
				const response = await fetch("/api/subscriptions/portal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ returnTo: ROUTES.manageMembership }),
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
		}
		run()
	}, [status, hasBillingAccount, premiumLoading])

	const isWorking = status === "loading" || status === "unauthenticated" || premiumLoading || isOpening

	return (
		<div className="min-h-screen bg-[#0A0B0F] text-white flex items-center justify-center px-4">
			<div className="w-full max-w-md text-center">
				<Link href={ROUTES.home} className="inline-block mb-8">
					<Image src={Logo} alt="Jetzy" width={120} height={40} style={{ objectFit: "contain" }} />
				</Link>

				<h1 className="text-2xl font-bold mb-3">Manage your Jetzy Premium membership</h1>

				{isWorking && !error && (
					<>
						<div className="flex justify-center my-6">
							<Spinner />
						</div>
						<p className="text-gray-400 text-sm">
							{status === "unauthenticated" ? "Taking you to sign in…" : "Opening your billing portal…"}
						</p>
					</>
				)}

				{!isWorking && !error && status === "authenticated" && !hasBillingAccount && (
					<>
						<p className="text-gray-300 text-sm mt-4">
							This account doesn&apos;t have an active membership, so there&apos;s nothing to manage.
						</p>
						<p className="text-gray-400 text-xs mt-3">
							If you bought a ticket that included a membership, it may be attached to a different email —
							memberships follow the address used at checkout. Sign in with that address to manage it.
						</p>
						<Link
							href={ROUTES.subscribe}
							className="inline-block mt-6 bg-[#F5C518] text-black font-bold px-6 py-3 rounded-xl"
						>
							See Jetzy Premium
						</Link>
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

				<div className="mt-10">
					<Link href={ROUTES.home} className="text-gray-500 text-sm underline">
						Back to Jetzy
					</Link>
				</div>
			</div>
		</div>
	)
}

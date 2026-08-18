import { useState } from "react"
import { useRouter } from "next/router"
import { Error as ErrorToast } from "@/lib/_toaster"

/**
 * Opens the Stripe Billing Portal — the only way to cancel a Jetzy Premium membership.
 *
 * @deprecated for the MEMBER path — use `useMembershipDialog`, whose card carries both
 * "Switch to $200/year" and "Manage in Stripe". Sending a member straight here left a monthly
 * subscriber with no way anywhere in the product to move to annual, because this portal has
 * plan switching disabled on purpose (an unscoped update button also appears on Full Concierge).
 * Kept because it is still the right primitive for opening the portal directly, and the file is
 * referenced by other branches.
 *
 * A hook rather than a component because the four avatar menus in this app (misc/Navbar,
 * ConsoleNavbar, HostedEvents, EventsListing) each render their items differently. The
 * entry point has to appear in ALL of them: a membership can be acquired as a side effect
 * of buying a ticket, so a member may never visit the one page that happened to have the
 * link. Putting it in a single navbar is what made it look missing.
 */
export function useBillingPortal() {
	const router = useRouter()
	const [isOpening, setIsOpening] = useState(false)

	const openPortal = async () => {
		if (isOpening) return
		setIsOpening(true)
		try {
			const response = await fetch("/api/subscriptions/portal", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ returnTo: router.asPath }),
			})
			const result = await response.json()
			if (result?.status && result?.data?.url) {
				// Full navigation, not router.push — this leaves the app for Stripe's domain.
				window.location.href = result.data.url
				return
			}
			ErrorToast("Couldn't open billing", result?.message || "Please try again.")
		} catch {
			ErrorToast("Couldn't open billing", "Please try again.")
		} finally {
			setIsOpening(false)
		}
	}

	return { openPortal, isOpening, label: isOpening ? "Opening…" : "Manage membership" }
}

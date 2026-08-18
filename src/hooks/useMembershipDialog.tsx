import React, { useState } from "react"
import PremiumPaywallModal from "@/components/premium/PremiumPaywallModal"

/**
 * The membership dialog — one entry point for buying Jetzy Premium AND for managing it.
 *
 * A hook that hands back its own JSX, for the same reason `useBillingPortal` is a hook: the
 * four avatar menus in this app render their items completely differently (Chakra `MenuItem`,
 * Headless UI `Menu.Item`, a plain button), so the only thing they can share is behaviour.
 *
 * WHY IT REPLACED "straight to Stripe" ON THE MEMBER PATH
 *
 * Those menus sent a member directly to the billing portal, which is deliberately configured
 * with plan switching OFF — one Stripe Customer holds every membership, and an unscoped update
 * button appears on Full Concierge too. The consequence was that a monthly member had nowhere
 * in the product to move to annual: the "Buy Jetzy Premium" button is hidden from members, and
 * that button was the only thing that opened this dialog.
 *
 * The dialog's member state carries both actions — "Switch to $200/year" (a Premium-scoped
 * Stripe update flow) and "Manage in Stripe" (the same cancel-only portal as before). So
 * cancellation stays reachable from every menu it was reachable from, one click further in.
 *
 * The dialog decides buy-vs-manage from the viewer's own membership, so one instance serves
 * both the "Buy Jetzy Premium" button and the "Manage membership" item.
 */
export function useMembershipDialog() {
	const [isOpen, setIsOpen] = useState(false)

	const open = () => setIsOpen(true)
	const close = () => setIsOpen(false)

	const dialog = (
		<PremiumPaywallModal
			isOpen={isOpen}
			onClose={close}
			returnTo={typeof window !== "undefined" ? window.location.pathname : "/"}
		/>
	)

	return { open, close, isOpen, dialog, label: "Manage membership" }
}

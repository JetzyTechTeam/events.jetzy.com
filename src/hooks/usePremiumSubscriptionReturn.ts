import { useEffect } from "react"
import { useRouter } from "next/router"
import { useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { Success, Error as ErrorToast } from "@/lib/_toaster"
import { PREMIUM_STATUS_QUERY_KEY } from "./usePremiumStatus"

// Detects the redirect back from Stripe after a Jetzy Premium subscription purchase
// (?premium_session_id=...), confirms it, refreshes the cached premium status, and
// strips the query param. Usable from any page that can trigger a subscribe flow
// (create/manage event pages, the ticket page's member-discount promo banner).
//
// `enabled` exists because a few pages — /premium, /subscribe — confirm the return themselves,
// with their own copy and their own cleanup. Two confirmations means two toasts and two
// `router.replace` calls racing each other, so those pages mount the navbar with this switched
// off rather than inheriting a second handler.
/**
 * Session ids already confirmed in THIS page load.
 *
 * Module scope, which is exactly the lifetime needed: more than one component can legitimately
 * want to handle the return (the navbar, and the membership dialog reopening itself), and without
 * this the visitor gets the confirmation twice — two requests, two toasts, two `router.replace`
 * calls racing. First one in wins; the rest no-op.
 */
const handledSessions = new Set<string>()

export function usePremiumSubscriptionReturn(enabled = true) {
	const router = useRouter()
	const queryClient = useQueryClient()

	useEffect(() => {
		if (!enabled) return
		const sessionId = router.query.premium_session_id
		if (!sessionId || typeof sessionId !== "string") return
		if (handledSessions.has(sessionId)) return
		handledSessions.add(sessionId)

		axios
			.get(`/api/subscriptions/confirm?session_id=${sessionId}`)
			.then(() => {
				Success("Welcome to Jetzy Premium!", "Your subscription is now active.")
				queryClient.invalidateQueries({ queryKey: PREMIUM_STATUS_QUERY_KEY })
			})
			.catch(() => {
				ErrorToast("Error", "We couldn't confirm your subscription. Please contact support if this persists.")
			})
			.finally(() => {
				const { premium_session_id, ...rest } = router.query
				router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true })
			})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [router.query.premium_session_id, enabled])
}

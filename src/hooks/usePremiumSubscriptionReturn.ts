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
export function usePremiumSubscriptionReturn() {
	const router = useRouter()
	const queryClient = useQueryClient()

	useEffect(() => {
		const sessionId = router.query.premium_session_id
		if (!sessionId || typeof sessionId !== "string") return

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
	}, [router.query.premium_session_id])
}

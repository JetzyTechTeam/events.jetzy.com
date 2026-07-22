import { useEffect } from "react"
import { useAnalytics } from "@/hooks/useAnalytics"

/**
 * Records an event "view" interaction.
 *
 * Mirrors the tracking block in src/pages/[slug].tsx so pages other than the event page
 * (notably the album photo-tour page, which publish emails and album share links now open
 * directly) still count towards the event's views / unique viewers and its view→booking
 * conversion rate.
 *
 * Pass `enabled: false` when the view was already recorded elsewhere — e.g. the album page
 * is reached by redirect from the event page, which has already tracked it.
 */
export function useTrackEventView(eventId?: string, opts?: { enabled?: boolean }) {
	const { trackEventInteraction } = useAnalytics()
	const enabled = opts?.enabled !== false

	useEffect(() => {
		if (!eventId || !enabled) return

		const trackView = async () => {
			try {
				// Stable per-browser id, same key the event page uses.
				let visitorId = localStorage.getItem("visitor_id")
				if (!visitorId) {
					const ShortUniqueId = (await import("short-unique-id")).default
					const uid = new ShortUniqueId({ length: 10 })
					visitorId = uid.randomUUID()
					localStorage.setItem("visitor_id", visitorId as string)
				}

				const urlParams = new URLSearchParams(window.location.search)
				const referralCode = urlParams.get("ref")
				if (referralCode) {
					sessionStorage.setItem("jetzy_referral_code", referralCode)
				}

				await trackEventInteraction(eventId, "view", {
					referralCode: referralCode || undefined,
					visitorId,
				})

				// Legacy tracker, kept in step with the event page.
				const trackRes = await fetch("/api/analytics/track", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({ eventId, referralCode, visitorId }),
				})
				if (!trackRes.ok) {
					const errorText = await trackRes.text()
					console.error("[useTrackEventView] Legacy tracking failed:", trackRes.status, errorText)
				}
			} catch (err: any) {
				console.error("[useTrackEventView] Tracking error:", err)
			}
		}

		trackView()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [eventId, enabled])
}

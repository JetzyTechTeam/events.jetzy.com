import { useEffect } from "react"
import { useRouter } from "next/router"

/**
 * Returning a buyer to the Jetzy mobile app after checkout.
 *
 * The app opens this portal in the SYSTEM browser (`LaunchMode.externalApplication` in
 * `event_native_details_screen.dart`), not an in-app webview. So there is no webview for the app
 * to dismiss when the purchase completes, and no way for it to observe the outcome — the app has
 * already left the foreground. The only route back is a link the OS hands to the app:
 * `https://jetzy.com/jetzy_event?eventId=...`, which is registered on jetzy.com as a universal
 * link / app link and is confirmed to open the app when tapped from WhatsApp.
 *
 * Two things must survive from arrival to receipt:
 *
 *   1. That this visitor came from the app at all. Web-only buyers must keep seeing
 *      "Back to Event" — handing them a jetzy.com deep link they cannot open would strand them
 *      on a 404-status marketing page instead of their ticket.
 *   2. Which event, so the app lands on that event rather than its generic feed.
 *
 * Stripe takes the browser off-origin and brings it back, so the flag rides two carriers:
 * `sessionStorage` (enough for the free-ticket path, which never leaves the origin) and an
 * `app=1` marker stamped onto the Stripe success/cancel URLs (the only carrier guaranteed to
 * return with the redirect, whatever the browser did with storage in between).
 *
 * The whole feature is inert until `NEXT_PUBLIC_APP_RETURN_URL` is set — an unset value means
 * every buyer keeps today's behaviour exactly.
 */

const STORAGE_KEY = "jetzy_from_app"

export type AppReturnStatus = "confirmed" | "pending_approval" | "cancelled"

/**
 * Does this URL's query say the visitor arrived from the mobile app?
 *
 * `external=true` is what `/login` already appends when it forwards a magic-token arrival
 * (`login.tsx`), so every logged-in app buyer is covered without waiting on a mobile release.
 * `src=app` is the explicit marker mobile should add to BOTH branches — logged-out arrivals
 * currently open a bare `/{eventId}`, which is indistinguishable from a Google result.
 * `app=1` is our own marker coming back off a Stripe redirect.
 */
export function queryMarksAppOrigin(query: Record<string, unknown> | undefined): boolean {
	if (!query) return false
	return query.src === "app" || query.external === "true" || query.app === "1"
}

/** Client only. Swallows storage errors — private-mode Safari throws on write. */
export function rememberAppOrigin(): void {
	if (typeof window === "undefined") return
	try {
		window.sessionStorage.setItem(STORAGE_KEY, "1")
	} catch {
		// Storage unavailable. The `app=1` marker on the Stripe URLs still carries the flag.
	}
}

/** Client only. */
export function cameFromApp(): boolean {
	if (typeof window === "undefined") return false
	try {
		return window.sessionStorage.getItem(STORAGE_KEY) === "1"
	} catch {
		return false
	}
}

/**
 * The deep link back into the app, or `null` when we must not offer one.
 *
 * Null means "render the normal web button": either the return URL is not configured for this
 * environment, or we have no event id — and a deep link without one drops the buyer on the app's
 * feed with no sign of what they just bought, which is worse than staying on the web receipt.
 */
export function buildAppReturnUrl(opts: { eventId?: string | null; bookingRef?: string | null; status: AppReturnStatus }): string | null {
	const base = (process.env.NEXT_PUBLIC_APP_RETURN_URL || "").trim()
	if (!base || !opts.eventId) return null

	try {
		const url = new URL(base)
		// `eventId` is the only param the app is known to read today. `bookingRef` and `status`
		// are additive: mobile can start reading them whenever they ship support, and until then
		// an unrecognised query param is simply ignored.
		url.searchParams.set("eventId", String(opts.eventId))
		if (opts.bookingRef) url.searchParams.set("bookingRef", String(opts.bookingRef))
		url.searchParams.set("status", opts.status)
		return url.toString()
	} catch {
		// A malformed env value must never take down the receipt page.
		console.warn("[app-return] NEXT_PUBLIC_APP_RETURN_URL is not a valid URL:", base)
		return null
	}
}

/**
 * Mounted once in `_app.tsx`. Has to live there rather than on the event page: the marker
 * arrives on the FIRST url of the visit, and by the time a checkout modal mounts the visitor may
 * have navigated on and dropped the query string.
 */
export function useAppOriginTracking() {
	const router = useRouter()

	useEffect(() => {
		if (!router.isReady) return
		if (queryMarksAppOrigin(router.query as Record<string, unknown>)) rememberAppOrigin()
	}, [router.isReady, router.query])
}

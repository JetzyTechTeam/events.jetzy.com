import { useEffect } from "react"
import { useRouter, type NextRouter } from "next/router"

/**
 * "Is there anywhere to go back TO?"
 *
 * `router.back()` on its own is only correct when the visitor reached the page by navigating
 * within the app. A huge share of event-page traffic does not: links arrive by email, QR code,
 * WhatsApp and blast, opening a fresh tab or an in-app webview whose history has exactly one
 * entry. Pressing Back there either does nothing at all or throws the visitor out of Jetzy
 * entirely — both read as a broken button.
 *
 * `window.history.length` can't answer this. It counts entries for the whole tab, so a visitor
 * who browsed other sites before typing our URL looks identical to one who navigated here from
 * our home page. Next.js's own history state is no help either: the pages router stores no
 * documented index we can lean on.
 *
 * So we count our own client-side navigations. Zero means the current page is where this tab
 * started, and Back must fall back to a real destination rather than guessing.
 */

let inAppNavigations = 0

/** Module-scoped, so it survives page transitions and resets naturally on a full reload. */
export const noteInAppNavigation = () => {
	inAppNavigations += 1
}

export const hasInAppHistory = (): boolean => inAppNavigations > 0

/**
 * Back, or a sensible destination when there is no back.
 *
 * `fallback` should be the visitor's home — see `homeRouteForRole` in `configs/routes.ts`,
 * since an admin's home is the console rather than the public listing.
 */
export const goBackOrTo = (router: NextRouter, fallback: string) => {
	if (hasInAppHistory()) {
		router.back()
		return
	}
	router.push(fallback)
}

/** Mounted once in `_app.tsx`. Counting anywhere else would miss navigations that happened before the component mounted. */
export function useInAppNavigationTracking() {
	const router = useRouter()

	useEffect(() => {
		const handle = () => noteInAppNavigation()
		router.events.on("routeChangeComplete", handle)
		return () => router.events.off("routeChangeComplete", handle)
	}, [router])
}

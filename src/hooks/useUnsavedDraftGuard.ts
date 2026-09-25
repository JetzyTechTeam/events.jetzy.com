import React from "react"
import { useRouter } from "next/router"

/**
 * Thrown to abort a navigation, and matched by identity when swallowing our own rejection.
 * A module-level object so nothing else can accidentally equal it.
 */
const ABORT_SENTINEL = { unsavedDraftGuard: "route change aborted" }

/** Path without query or hash — what decides whether a navigation leaves this page. */
const pathOf = (url: string) => url.split("?")[0].split("#")[0]

export interface UnsavedDraftGuard {
	/** Route the visitor tried to reach, while the dialog is open. */
	pendingUrl: string | null
	isOpen: boolean
	/** Let the blocked navigation through (or go to `url` instead). */
	confirmLeave: (url?: string) => void
	/** Stay on the page. */
	cancelLeave: () => void
	/** Suppress both guards for a navigation the page itself is performing. */
	bypass: () => void
}

/**
 * Interrupts a navigation away from a page that holds changes the visitor may not realise
 * are unpublished.
 *
 * Built for Manage Event: autosave on a PUBLISHED event writes a shadow draft
 * (`event.draftRevision`) and deliberately leaves the live event untouched, so a host who
 * edits and walks away has changed nothing a guest can see. The only signal today is the
 * orange banner they meet the NEXT time they open the page — too late to act on.
 *
 * Two exits, two mechanisms, because the browser only lets us own one of them:
 *  - in-app navigation  -> aborted here, caller renders its own dialog
 *  - tab close / reload -> `beforeunload`, whose wording is the browser's, not ours
 *
 * Generic on purpose (`shouldGuard` is a callback) so the Create Event page can adopt it
 * without this hook learning anything about events.
 */
export function useUnsavedDraftGuard(shouldGuard: () => boolean): UnsavedDraftGuard {
	const router = useRouter()

	const [pendingUrl, setPendingUrl] = React.useState<string | null>(null)
	const [isOpen, setIsOpen] = React.useState(false)

	// Refs, not state: both listeners are registered once and must read the CURRENT
	// answer, not the one that was true when they were attached.
	const shouldGuardRef = React.useRef(shouldGuard)
	shouldGuardRef.current = shouldGuard
	const bypassRef = React.useRef(false)

	const bypass = React.useCallback(() => {
		bypassRef.current = true
	}, [])

	// --- in-app navigation -------------------------------------------------------------
	React.useEffect(() => {
		const handleRouteChangeStart = (url: string, routeProps?: { shallow?: boolean }) => {
			if (bypassRef.current) return
			if (!shouldGuardRef.current()) return
			// Not a departure: a shallow change, or the same page reloading its own props.
			// Manage Event does BOTH — it strips `?invite=true` shallowly on mount and calls
			// `router.replace(router.asPath)` after some saves. Guarding those would put the
			// dialog on the screen while the host was still sitting on the page.
			if (routeProps?.shallow) return
			if (pathOf(url) === pathOf(router.asPath)) return

			setPendingUrl(url)
			setIsOpen(true)

			// Next has already moved the address bar when the navigation came from the
			// browser's Back/Forward buttons (popstate). Aborting below leaves it pointing
			// at a page we are not on, so put it back.
			if (typeof window !== "undefined") {
				const current = window.location.pathname + window.location.search
				if (current !== router.asPath) window.history.pushState(null, "", router.asPath)
			}

			// The documented pages-router abort: tell Next the change failed, then unwind.
			router.events.emit("routeChangeError")
			// eslint-disable-next-line no-throw-literal
			throw ABORT_SENTINEL
		}

		// Next emits `routeChangeStart` OUTSIDE the try block in `Router.change()`, and
		// `Link` calls `router.push()` without a catch — so the throw above escapes as an
		// unhandled rejection, which the dev overlay reports as a runtime error. The throw is
		// still the only way to stop a pages-router navigation, so swallow exactly our own
		// sentinel (identity match, nothing else) and leave every other rejection alone.
		const swallowOwnAbort = (e: PromiseRejectionEvent) => {
			if (e.reason === ABORT_SENTINEL) e.preventDefault()
		}

		// A bypass covers ONE navigation. Without this a `router.replace(router.asPath)` —
		// which reloads the page's props without remounting it, as Discard draft does —
		// would leave the guard suppressed for the rest of the page's life.
		const clearBypass = () => {
			bypassRef.current = false
		}

		router.events.on("routeChangeStart", handleRouteChangeStart)
		router.events.on("routeChangeComplete", clearBypass)
		router.events.on("routeChangeError", clearBypass)
		window.addEventListener("unhandledrejection", swallowOwnAbort)
		return () => {
			router.events.off("routeChangeStart", handleRouteChangeStart)
			router.events.off("routeChangeComplete", clearBypass)
			router.events.off("routeChangeError", clearBypass)
			window.removeEventListener("unhandledrejection", swallowOwnAbort)
		}
	}, [router])

	// --- tab close / reload ------------------------------------------------------------
	React.useEffect(() => {
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (bypassRef.current) return
			if (!shouldGuardRef.current()) return
			// Both are required: `preventDefault` for the spec, `returnValue` for Chrome.
			e.preventDefault()
			e.returnValue = ""
			return ""
		}

		window.addEventListener("beforeunload", handleBeforeUnload)
		return () => window.removeEventListener("beforeunload", handleBeforeUnload)
	}, [])

	const confirmLeave = React.useCallback(
		(url?: string) => {
			const target = url ?? pendingUrl
			setIsOpen(false)
			setPendingUrl(null)
			bypassRef.current = true
			if (target) router.push(target)
		},
		[pendingUrl, router],
	)

	const cancelLeave = React.useCallback(() => {
		setIsOpen(false)
		setPendingUrl(null)
	}, [])

	return { pendingUrl, isOpen, confirmLeave, cancelLeave, bypass }
}

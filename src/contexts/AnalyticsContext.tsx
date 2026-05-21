import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/router"
import { useSession } from "next-auth/react"

interface AnalyticsContextType {
	sessionId: string | null
	anonId: string | null
	trackPageView: (page: string, pageTitle?: string, timeSpent?: number) => Promise<void>
	trackEventInteraction: (eventId: string, interactionType: string, metadata?: any) => Promise<void>
	trackAction: (actionType: string, page: string, metadata?: any) => Promise<void>
}

const ANON_KEY = "analytics_anon_id"

function genUuid(): string {
	if (typeof crypto !== "undefined" && (crypto as any).randomUUID) return (crypto as any).randomUUID()
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0
		const v = c === "x" ? r : (r & 0x3) | 0x8
		return v.toString(16)
	})
}

function readOrCreateAnonId(): string {
	if (typeof window === "undefined") return ""
	try {
		const existing = localStorage.getItem(ANON_KEY)
		if (existing) return existing
		const id = genUuid()
		localStorage.setItem(ANON_KEY, id)
		return id
	} catch {
		return ""
	}
}

function extractEventIdFromPath(pathname: string): string | undefined {
	const m = pathname.match(/\/events\/([0-9a-fA-F]{24})/)
	return m?.[1]
}

const SCROLL_MILESTONES = [25, 50, 75, 100]

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined)

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
	const [sessionId, setSessionId] = useState<string | null>(null)
	const [anonId, setAnonId] = useState<string | null>(null)
	const router = useRouter()
	const { data: session } = useSession()
	const sessionInitializedRef = useRef(false)
	const pageViewStartTimeRef = useRef<number>(Date.now())
	const currentPageRef = useRef<string>("")
	const scrollMilestonesHitRef = useRef<Set<number>>(new Set())

	// Initialize session on mount
	useEffect(() => {
		if (typeof window === "undefined" || sessionInitializedRef.current) return

		const initializeSession = async () => {
			try {
				const anon = readOrCreateAnonId()
				setAnonId(anon)

				// Get existing sessionId from sessionStorage or create new one
				let existingSessionId = sessionStorage.getItem("analytics_session_id")
				if (!existingSessionId) {
					// Start new session
					const entryPage = window.location.pathname
					const referrer = document.referrer || undefined
					const userAgent = navigator.userAgent
					const deviceType = getDeviceType()

					const response = await fetch("/api/analytics/track-session-start", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						credentials: "include",
						body: JSON.stringify({
							anonId: anon || undefined,
							referrer,
							entryPage,
							userAgent,
							deviceType,
						}),
					})

				if (response.ok) {
					const data = await response.json()
					if (data?.data?.sessionId) {
						existingSessionId = data.data.sessionId
						if (existingSessionId) {
							sessionStorage.setItem("analytics_session_id", existingSessionId)
							setSessionId(existingSessionId)
						}
					}
				}
				} else {
					setSessionId(existingSessionId)
				}

				sessionInitializedRef.current = true
			} catch (error) {
				console.error("[Analytics] Failed to initialize session:", error)
			}
		}

		initializeSession()

		// Idempotent session-end: fires from beforeunload, pagehide, or visibilitychange (hidden)
		let sessionEnded = false
		const endSession = () => {
			if (sessionEnded) return
			const sessionIdToEnd = sessionStorage.getItem("analytics_session_id")
			if (!sessionIdToEnd) return
			sessionEnded = true

			// Flush final-page dwell time so the last page's timeSpent is recorded
			const timeSpent = Math.floor((Date.now() - pageViewStartTimeRef.current) / 1000)
			const currentPage = currentPageRef.current || window.location.pathname
			if (currentPage && timeSpent > 0) {
				try {
					const dwellBlob = new Blob(
						[
							JSON.stringify({
								sessionId: sessionIdToEnd,
								page: currentPage,
								timeSpent,
								deviceType: getDeviceType(),
							}),
						],
						{ type: "application/json" }
					)
					navigator.sendBeacon("/api/analytics/track-page", dwellBlob)
				} catch {}
			}

			try {
				const blob = new Blob(
					[
						JSON.stringify({
							sessionId: sessionIdToEnd,
							exitPage: window.location.pathname,
						}),
					],
					{ type: "application/json" }
				)
				navigator.sendBeacon("/api/analytics/track-session-end", blob)
			} catch {}
		}

		const handleVisibility = () => {
			if (document.visibilityState === "hidden") endSession()
		}

		window.addEventListener("beforeunload", endSession)
		window.addEventListener("pagehide", endSession)
		document.addEventListener("visibilitychange", handleVisibility)

		return () => {
			window.removeEventListener("beforeunload", endSession)
			window.removeEventListener("pagehide", endSession)
			document.removeEventListener("visibilitychange", handleVisibility)
		}
	}, [])

	// Track page views on route change
	useEffect(() => {
		if (!sessionId || !router.isReady) return

		const handleRouteChange = (url: string) => {
			// Calculate time spent on previous page
			const timeSpent = Math.floor((Date.now() - pageViewStartTimeRef.current) / 1000) // in seconds

			// Track previous page view with time spent
			if (currentPageRef.current) {
				trackPageView(currentPageRef.current, document.title, timeSpent).catch((error) => {
					console.error("[Analytics] Failed to track page view:", error)
				})
			}

			// Update current page and reset timer
			currentPageRef.current = url
			pageViewStartTimeRef.current = Date.now()
		}

		// Track initial page load
		if (router.pathname) {
			currentPageRef.current = router.pathname
			pageViewStartTimeRef.current = Date.now()
			trackPageView(router.pathname, document.title).catch((error) => {
				console.error("[Analytics] Failed to track initial page view:", error)
			})
		}

		router.events.on("routeChangeComplete", handleRouteChange)

		return () => {
			router.events.off("routeChangeComplete", handleRouteChange)
		}
	}, [sessionId, router.isReady, router.pathname, router.events])

	// Track page view
	const trackPageView = useCallback(
		async (page: string, pageTitle?: string, timeSpent?: number) => {
			if (!sessionId) return

			try {
				// Extract UTM parameters from URL
				const urlParams = new URLSearchParams(window.location.search)
				const utmSource = urlParams.get("utm_source") || undefined
				const utmMedium = urlParams.get("utm_medium") || undefined
				const utmCampaign = urlParams.get("utm_campaign") || undefined

				const referrer = document.referrer || undefined
				const deviceType = getDeviceType()

				await fetch("/api/analytics/track-page", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					credentials: "include",
					body: JSON.stringify({
						sessionId,
						anonId: anonId || undefined,
						page,
						pageTitle,
						referrer,
						timeSpent,
						utmSource,
						utmMedium,
						utmCampaign,
						deviceType,
					}),
				})
			} catch (error) {
				console.error("[Analytics] Failed to track page view:", error)
			}
		},
		[sessionId, anonId]
	)

	// Track event interaction
	const trackEventInteraction = useCallback(
		async (eventId: string, interactionType: string, metadata?: any) => {
			if (!sessionId) return

			try {
				await fetch("/api/analytics/track-event-interaction", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					credentials: "include",
					body: JSON.stringify({
						eventId,
						sessionId,
						interactionType,
						metadata,
					}),
				})
			} catch (error) {
				console.error("[Analytics] Failed to track event interaction:", error)
			}
		},
		[sessionId]
	)

	// Track user action
	const trackAction = useCallback(
		async (actionType: string, page: string, metadata?: any) => {
			if (!sessionId) return

			try {
				await fetch("/api/analytics/track-action", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					credentials: "include",
					body: JSON.stringify({
						sessionId,
						actionType,
						page,
						metadata,
					}),
				})
			} catch (error) {
				console.error("[Analytics] Failed to track action:", error)
			}
		},
		[sessionId]
	)

	// Form interaction tracking — bubble phase. Observe focus + submit, never preventDefault.
	// Field values are never sent; only field names.
	useEffect(() => {
		if (!sessionId || typeof window === "undefined") return

		const focusedForms = new Set<string>()

		const getFormName = (form: HTMLFormElement): string => {
			return (
				form.getAttribute("data-form") ||
				form.getAttribute("name") ||
				form.id ||
				`form_${(form.action || "").slice(0, 60) || "unnamed"}`
			)
		}

		const isIgnored = (el: Element | null): boolean => {
			let cur = el
			let depth = 0
			while (cur && depth < 8) {
				if (cur.getAttribute && cur.getAttribute("data-analytics-ignore") !== null) return true
				cur = cur.parentElement
				depth++
			}
			return false
		}

		const sendForm = (formName: string, interactionType: "focus" | "submit", fieldName?: string) => {
			try {
				fetch("/api/analytics/track-form", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({
						sessionId,
						anonId: anonId || undefined,
						page: window.location.pathname,
						eventId: extractEventIdFromPath(window.location.pathname),
						formName,
						interactionType,
						fieldName,
					}),
				}).catch(() => {})
			} catch {}
		}

		const onFocusIn = (ev: FocusEvent) => {
			const t = ev.target as HTMLElement | null
			if (!t || !t.closest) return
			if (isIgnored(t)) return
			const form = t.closest("form") as HTMLFormElement | null
			if (!form) return
			const formName = getFormName(form)
			if (focusedForms.has(formName)) return
			focusedForms.add(formName)
			const fieldName = (t as HTMLInputElement).name || t.id || undefined
			sendForm(formName, "focus", fieldName)
		}

		const onSubmit = (ev: Event) => {
			const form = ev.target as HTMLFormElement | null
			if (!form || form.tagName !== "FORM") return
			if (isIgnored(form)) return
			sendForm(getFormName(form), "submit")
		}

		document.addEventListener("focusin", onFocusIn, false)
		document.addEventListener("submit", onSubmit, false)
		return () => {
			document.removeEventListener("focusin", onFocusIn, false)
			document.removeEventListener("submit", onSubmit, false)
		}
	}, [sessionId, anonId])

	// Click tracking — BUBBLE phase (runs after element onClick handlers).
	// data-analytics-ignore short-circuits the handler (logout buttons opt out).
	// No keepalive: clicks during page unload are dropped, not fired.
	useEffect(() => {
		if (!sessionId || typeof window === "undefined") return

		let burstTs = 0
		let burstCount = 0

		const findTrackable = (start: EventTarget | null): Element | null => {
			let el = start as Element | null
			let depth = 0
			while (el && depth < 6) {
				if (el.nodeType === 1) {
					if (el.getAttribute && el.getAttribute("data-analytics-ignore") !== null) return null
					const tag = el.tagName?.toLowerCase()
					if (tag === "button" || tag === "a") return el
					if (el.getAttribute && (el.getAttribute("role") === "button" || el.getAttribute("data-track"))) return el
				}
				el = el.parentElement
				depth++
			}
			return null
		}

		const onClick = (ev: MouseEvent) => {
			const target = findTrackable(ev.target)
			if (!target) return

			const now = Date.now()
			if (now - burstTs < 1000) {
				burstCount++
				if (burstCount > 20) return
			} else {
				burstTs = now
				burstCount = 1
			}

			const tag = target.tagName.toLowerCase()
			const text = (target.textContent || "").trim().slice(0, 200)
			const elId = (target as HTMLElement).id || undefined
			const rawCls = (target as HTMLElement).className
			const cls = typeof rawCls === "string" ? rawCls.slice(0, 300) : undefined
			const dataTrack = target.getAttribute("data-track") || undefined
			const href = (target as HTMLAnchorElement).href || undefined

			try {
				fetch("/api/analytics/track-click", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({
						sessionId,
						anonId: anonId || undefined,
						page: window.location.pathname,
						eventId: extractEventIdFromPath(window.location.pathname),
						elementTag: tag,
						elementText: text,
						elementId: elId,
						elementClass: cls,
						dataTrack,
						href,
						x: ev.clientX,
						y: ev.clientY,
						viewportW: window.innerWidth,
						viewportH: window.innerHeight,
					}),
				}).catch(() => {})
			} catch {}
		}

		document.addEventListener("click", onClick, false)
		return () => document.removeEventListener("click", onClick, false)
	}, [sessionId, anonId])

	// Scroll depth tracking — passive window listener, no preventDefault
	useEffect(() => {
		if (!sessionId || typeof window === "undefined") return

		let lastFire = 0
		let ticking = false

		const compute = () => {
			ticking = false
			const docHeight = Math.max(
				document.body.scrollHeight,
				document.documentElement.scrollHeight,
				document.documentElement.offsetHeight
			)
			if (docHeight <= 0) return
			const viewport = window.innerHeight
			const scrolled = window.scrollY + viewport
			const pct = Math.min(100, Math.round((scrolled / docHeight) * 100))

			for (const m of SCROLL_MILESTONES) {
				if (pct >= m && !scrollMilestonesHitRef.current.has(m)) {
					scrollMilestonesHitRef.current.add(m)
					try {
						fetch("/api/analytics/track-scroll", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							credentials: "include",
							body: JSON.stringify({
								sessionId,
								anonId: anonId || undefined,
								page: window.location.pathname,
								eventId: extractEventIdFromPath(window.location.pathname),
								depthPct: pct,
							}),
						}).catch(() => {})
					} catch {}
				}
			}
		}

		const onScroll = () => {
			const now = Date.now()
			if (now - lastFire < 200) return
			lastFire = now
			if (!ticking) {
				ticking = true
				requestAnimationFrame(compute)
			}
		}

		const resetMilestones = () => {
			scrollMilestonesHitRef.current = new Set()
		}

		window.addEventListener("scroll", onScroll, { passive: true })
		router.events.on("routeChangeComplete", resetMilestones)

		return () => {
			window.removeEventListener("scroll", onScroll)
			router.events.off("routeChangeComplete", resetMilestones)
		}
	}, [sessionId, anonId, router.events])

	return (
		<AnalyticsContext.Provider
			value={{
				sessionId,
				anonId,
				trackPageView,
				trackEventInteraction,
				trackAction,
			}}
		>
			{children}
		</AnalyticsContext.Provider>
	)
}

export function useAnalytics() {
	const context = useContext(AnalyticsContext)
	if (context === undefined) {
		throw new Error("useAnalytics must be used within an AnalyticsProvider")
	}
	return context
}

// Helper function to detect device type
function getDeviceType(): "mobile" | "desktop" | "tablet" | undefined {
	if (typeof window === "undefined") return undefined

	const userAgent = navigator.userAgent || ""
	const isMobile = /iPhone|iPad|iPod|Android/i.test(userAgent)
	const isTablet = /iPad|Android/i.test(userAgent) && window.innerWidth >= 768

	if (isTablet) return "tablet"
	if (isMobile) return "mobile"
	return "desktop"
}


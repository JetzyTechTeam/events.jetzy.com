import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/router"
import { useSession } from "next-auth/react"

interface AnalyticsContextType {
	sessionId: string | null
	trackPageView: (page: string, pageTitle?: string, timeSpent?: number) => Promise<void>
	trackEventInteraction: (eventId: string, interactionType: string, metadata?: any) => Promise<void>
	trackAction: (actionType: string, page: string, metadata?: any) => Promise<void>
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined)

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
	const [sessionId, setSessionId] = useState<string | null>(null)
	const router = useRouter()
	const { data: session } = useSession()
	const sessionInitializedRef = useRef(false)
	const pageViewStartTimeRef = useRef<number>(Date.now())
	const currentPageRef = useRef<string>("")

	// Initialize session on mount
	useEffect(() => {
		if (typeof window === "undefined" || sessionInitializedRef.current) return

		const initializeSession = async () => {
			try {
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

		// Track session end on page unload
		const handleBeforeUnload = async () => {
			const sessionIdToEnd = sessionStorage.getItem("analytics_session_id")
			if (sessionIdToEnd) {
				// Use sendBeacon for reliability during page unload
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
			}
		}

		window.addEventListener("beforeunload", handleBeforeUnload)

		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload)
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
		[sessionId]
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

	return (
		<AnalyticsContext.Provider
			value={{
				sessionId,
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


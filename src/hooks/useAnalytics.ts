import { useAnalytics as useAnalyticsContext } from "@/contexts/AnalyticsContext"

/**
 * Hook to access analytics tracking functions
 * 
 * @example
 * const { trackPageView, trackEventInteraction, trackAction } = useAnalytics()
 * 
 * // Track page view
 * trackPageView('/events', 'Events Page')
 * 
 * // Track event interaction
 * trackEventInteraction('event-id-123', 'view')
 * trackEventInteraction('event-id-123', 'click')
 * 
 * // Track user action
 * trackAction('search', '/events', { query: 'concert' })
 */
export function useAnalytics() {
	return useAnalyticsContext()
}


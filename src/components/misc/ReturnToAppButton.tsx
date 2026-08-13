import React from "react"
import { useRouter } from "next/router"
import { buildAppReturnUrl, cameFromApp, queryMarksAppOrigin, type AppReturnStatus } from "@/lib/app-return"

/**
 * "Return to Jetzy App" — shown only to buyers who arrived from the mobile app.
 *
 * Deliberately an anchor the visitor TAPS. iOS will not open a universal link from a
 * JavaScript-initiated navigation without a user gesture; it silently follows the https URL
 * instead, and `jetzy.com/jetzy_event` answers 404, so an auto-redirect would put a 404 page in
 * front of someone who has just paid. A tap is always honoured.
 *
 * `fallback` is what web-only buyers see, and is also what app buyers get when the return URL
 * is not configured — so a missing env var degrades to today's behaviour rather than to nothing.
 */
export default function ReturnToAppButton({
	eventId,
	bookingRef,
	status,
	className,
	fallback = null,
}: {
	eventId?: string | null
	bookingRef?: string | null
	status: AppReturnStatus
	className?: string
	fallback?: React.ReactNode
}) {
	const router = useRouter()

	// `cameFromApp` reads sessionStorage, which does not exist during SSR. Resolving it in an
	// effect keeps the server and first client render identical and avoids a hydration mismatch.
	//
	// The query is checked here as well as in `_app.tsx`, not instead of it: React runs child
	// effects before parent effects, so on a Stripe return this component would read storage
	// before `useAppOriginTracking` had written the `app=1` arrival into it.
	const [fromApp, setFromApp] = React.useState(false)
	React.useEffect(() => {
		if (!router.isReady) return
		setFromApp(queryMarksAppOrigin(router.query as Record<string, unknown>) || cameFromApp())
	}, [router.isReady, router.query])

	const href = React.useMemo(() => buildAppReturnUrl({ eventId, bookingRef, status }), [eventId, bookingRef, status])

	if (!fromApp || !href) return <>{fallback}</>

	return (
		<a
			href={href}
			className={className ?? "mt-6 inline-block bg-[#F79432] text-white px-6 py-3 rounded-full hover:bg-orange-600 transition-all transform hover:scale-105 shadow-lg"}
		>
			Return to Jetzy App
		</a>
	)
}

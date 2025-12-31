import { Events } from "@/models/events"
import { IEvent } from "@/models/events/types"
import { GetServerSideProps } from "next"
import Head from "next/head"
import dynamic from "next/dynamic"
import React, { useEffect } from "react"
import ErrorBoundary from "@/components/ErrorBoundary"
import { http_client as api } from "@/configs/api"
import { useAnalytics } from "@/hooks/useAnalytics"
import { stripHTMLAndDecode } from "@/lib/helpers"

// Simple ID generator
const generateVisitorId = () => {
	return 'v_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

const HostedEvents = dynamic(() => import("@Jetzy/components/HostedEvents"), { ssr: false }) // Import the HostedEvents component dynamically

type Props = {
	event: string
}
export default function EventDetailPage({ event }: Props) {
	const data = JSON.parse(event) as IEvent
	const { trackEventInteraction } = useAnalytics()

	useEffect(() => {
		const trackView = async () => {
			try {
				// Get or create visitor ID
				let visitorId = localStorage.getItem("jetzy_visitor_id")
				if (!visitorId) {
					visitorId = generateVisitorId()
					localStorage.setItem("jetzy_visitor_id", visitorId)
				}

				// Check for referral code
				const urlParams = new URLSearchParams(window.location.search)
				const referralCode = urlParams.get("ref")

				if (referralCode) {
					sessionStorage.setItem("jetzy_referral_code", referralCode)
				}

				// Track event view using new analytics system
				if (data?._id) {
					await trackEventInteraction(data._id.toString(), 'view', {
						referralCode: referralCode || undefined,
						visitorId: visitorId
					})
				}

				// Also track using old system for backward compatibility
				const trackRes = await fetch("/api/analytics/track", {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					credentials: 'include',
					body: JSON.stringify({
						eventId: data._id,
						referralCode,
						visitorId
					})
				})

				if (!trackRes.ok) {
					const errorText = await trackRes.text()
					console.error('[Event Page] Legacy tracking failed:', trackRes.status, errorText)
				}
			} catch (err: any) {
				console.error('[Event Page] Tracking error:', err)
			}
		}

		if (data?._id) {
			trackView()
		}
	}, [data._id, trackEventInteraction])

	try {
		// Validate that the event has required fields
		if (!data || !data._id || !data.name) {
			throw new Error("Invalid event data")
		}

		return (
			<>
				<Head>
					<title>{stripHTMLAndDecode(data.name)} - Jetzy Events</title>
					<meta name="description" content={data.desc || `Join ${stripHTMLAndDecode(data.name)} on Jetzy. Book your tickets now!`} />
					<meta name="keywords" content={`${stripHTMLAndDecode(data.name)}, event, tickets, booking, ${data.location}`} />
					<meta property="og:title" content={`${stripHTMLAndDecode(data.name)} - Jetzy Events`} />
					<meta property="og:description" content={data.desc || `Join ${stripHTMLAndDecode(data.name)} on Jetzy.`} />
					{data.images && data.images.length > 0 && <meta property="og:image" content={data.images[0]} />}
					<meta property="og:type" content="event" />
					<meta name="twitter:card" content="summary_large_image" />
					<meta name="twitter:title" content={`${stripHTMLAndDecode(data.name)} - Jetzy Events`} />
					<meta name="twitter:description" content={data.desc || `Join ${stripHTMLAndDecode(data.name)} on Jetzy.`} />
					{data.images && data.images.length > 0 && <meta name="twitter:image" content={data.images[0]} />}
				</Head>
				<ErrorBoundary>
					<HostedEvents event={data} />
				</ErrorBoundary>
			</>
		)
	} catch (error) {
		console.error("Error parsing event data:", error)
		// Return the error page directly
		return (
			<div className="min-h-screen bg-gradient-to-br from-purple-900 to-indigo-900 py-8 px-4 sm:px-6 lg:px-8">
				<div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all">
					<div className="p-6 sm:p-8 text-center">
						<div className="mb-6">
							<svg className="w-16 h-16 mx-auto text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
							</svg>
						</div>
						<h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-4">Event Not Found</h1>
						<p className="text-gray-600 mb-6">We couldn&apos;t find the event you were looking for. Please try again or contact the event organizer for more information.</p>
						<button
							onClick={() => (window.location.href = "/")}
							className="mt-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-full hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg"
						>
							See All Events
						</button>
					</div>
				</div>
			</div>
		)
	}
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	try {
		// Ensure database connection is ready
		const { dbconn } = await import("@/configs/database")
		if (dbconn.readyState !== 1) {
			console.log("[slug] Database not connected, attempting to connect...")
			await dbconn.asPromise()
		}

		// let get the slug from the request params
		const { slug } = context.params

		if (!slug) {
			return {
				notFound: true,
			}
		}

		// Get the event by slug
		const event = await Events.findOne({ slug: slug as string, isDeleted: false })
		
		// Debug logging
		console.log('[Event Slug Page] Looking for event:', {
			slug: slug as string,
			eventFound: !!event,
			eventId: event?._id?.toString(),
			eventName: event?.name,
			eventPrivacy: event?.privacy,
			eventIsDeleted: event?.isDeleted
		})

		if (!event) {
			// Try to find any event with similar slug for debugging
			const similarEvents = await Events.find({ 
				slug: { $regex: slug as string, $options: 'i' },
				isDeleted: false 
			}).select('slug name _id').limit(5).lean()
			
			console.log('[Event Slug Page] No exact match found. Similar slugs:', similarEvents.map((e: any) => ({
				slug: e.slug,
				name: e.name,
				id: e._id.toString()
			})))
			
			return { notFound: true } // If the event is not found, return a 404
		}

		// compress the event data
		const eventData = JSON.stringify(event.toJSON())

		return {
			props: {
				event: eventData,
			},
		}
	} catch (error) {
		console.error("Error in getServerSideProps:", error)
		return {
			notFound: true,
		}
	}
}

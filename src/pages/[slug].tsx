import { Events } from "@/models/events"
import { IEvent } from "@/models/events/types"
import { GetServerSideProps } from "next"
import dynamic from "next/dynamic"
import React, { useEffect } from "react"
import ErrorBoundary from "@/components/ErrorBoundary"
import { ensureDbConnected } from "@/configs/database"
import { useAnalytics } from "@/hooks/useAnalytics"
import Head from "next/head"
import { stripHTMLAndDecode } from "@/lib/utils"

const HostedEvents = dynamic(() => import("@Jetzy/components/HostedEvents"), { ssr: false }) // Import the HostedEvents component dynamically

type Props = {
	event: string
}
export default function EventDetailPage({ event }: Props) {
	const { trackEventInteraction } = useAnalytics()

	let data: IEvent | null = null
	let parseError = null

	try {
		data = JSON.parse(event) as IEvent
	} catch (error) {
		parseError = error
	}

	useEffect(() => {
		const trackView = async () => {
			if (!data?._id) return

			try {
				// Get visitor ID
				let visitorId = localStorage.getItem("visitor_id")
				if (!visitorId) {
					const ShortUniqueId = (await import("short-unique-id")).default
					const uid = new ShortUniqueId({ length: 10 })
					visitorId = uid.randomUUID()
					localStorage.setItem("visitor_id", visitorId as string)
				}

				// Check for referral code
				const urlParams = new URLSearchParams(window.location.search)
				const referralCode = urlParams.get("ref")

				if (referralCode) {
					sessionStorage.setItem("jetzy_referral_code", referralCode)
				}

				// Track event view using new analytics system
				if (data?._id) {
					await trackEventInteraction(data._id.toString(), "view", {
						referralCode: referralCode || undefined,
						visitorId: visitorId,
					})
				}

				// Also track using old system for backward compatibility
				const trackRes = await fetch("/api/analytics/track", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					credentials: "include",
					body: JSON.stringify({
						eventId: data._id,
						referralCode,
						visitorId,
					}),
				})

				if (!trackRes.ok) {
					const errorText = await trackRes.text()
					console.error("[Event Page] Legacy tracking failed:", trackRes.status, errorText)
				}
			} catch (err: any) {
				console.error("[Event Page] Tracking error:", err)
			}
		}

		trackView()
	}, [data?._id, trackEventInteraction])

	if (parseError || !data || !data._id || !data.name) {
		console.error("Error parsing event data or invalid data:", parseError)
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
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	try {
		await ensureDbConnected()
		// let get the slug from the request params
		const { slug } = context.params

		if (!slug) {
			return {
				notFound: true,
			}
		}

		// Get the event by slug
		// escape special characters for regex
		const escapedSlug = (slug as string).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
		const event = await Events.findOne({
			slug: { $regex: new RegExp(`^${escapedSlug}$`, "i") },
			isDeleted: false,
		})

		if (!event) {
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

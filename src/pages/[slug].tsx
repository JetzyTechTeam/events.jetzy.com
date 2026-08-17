import { Events } from "@/models/events"
import { IEvent } from "@/models/events/types"
import { GetServerSideProps } from "next"
import dynamic from "next/dynamic"
import React, { useEffect } from "react"
import { useRouter } from "next/router"
import ErrorBoundary from "@/components/ErrorBoundary"
import { ensureDbConnected } from "@/configs/database"
import { useAnalytics } from "@/hooks/useAnalytics"
import Head from "next/head"
import { stripHTMLAndDecode } from "@/lib/utils"
import { eventPath, eventUrl, findEventByPreviousSlug, withQuery } from "@/lib/event-slug"
import { isPendingAdminApproval } from "@/lib/event-approval"
import { toMetaDescription } from "@/utils/text"
import { normalizeEventMediaFields } from "@/lib/event-media"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"

const HostedEvents = dynamic(() => import("@Jetzy/components/HostedEvents"), { ssr: false }) // Import the HostedEvents component dynamically

type Props = {
	event: string
	pendingApproval?: boolean
}
export default function EventDetailPage({ event, pendingApproval }: Props) {
	const { trackEventInteraction } = useAnalytics()
	const router = useRouter()

	let data: IEvent | null = null
	let parseError = null

	try {
		data = JSON.parse(event) as IEvent
	} catch (error) {
		parseError = error
	}

	// Shared link to a public event still awaiting admin approval — bounce back to the
	// main events page.
	useEffect(() => {
		if (!pendingApproval) return
		const timer = setTimeout(() => router.push("/"), 4000)
		return () => clearTimeout(timer)
	}, [pendingApproval, router])

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

	if (pendingApproval) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-purple-900 to-indigo-900 py-8 px-4 sm:px-6 lg:px-8 flex items-center">
				<div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all">
					<div className="p-6 sm:p-8 text-center">
						<div className="mb-6">
							<svg className="w-16 h-16 mx-auto text-[#F79432]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
						</div>
						<h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-4">Event Not Yet Approved</h1>
						<p className="text-gray-600 mb-6">This event is still awaiting admin approval and isn&apos;t publicly available yet. You&apos;ll be redirected to the main events page shortly.</p>
						<button
							onClick={() => router.push("/")}
							className="mt-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-full hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg"
						>
							Go to Events Now
						</button>
					</div>
				</div>
			</div>
		)
	}

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

	const siteUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
	const eventName = stripHTMLAndDecode(data.name)
	const metaTitle = `${eventName} - Jetzy Events`
	// desc is Quill rich text — never put it in a meta tag raw, scrapers render it literally
	const metaDescription = toMetaDescription(data.desc) || `Join ${eventName} on Jetzy. Book your tickets now!`
	const rawImage = data.images?.[0]
	const metaImage = rawImage ? (rawImage.startsWith("http") ? rawImage : `${siteUrl}${rawImage.startsWith("/") ? "" : "/"}${rawImage}`) : `${siteUrl}/imgs/logo.png`
	const pageUrl = eventUrl(siteUrl, data.slug || String(data._id))

	return (
		<>
			<Head>
				<title>{metaTitle}</title>
				<meta name="description" content={metaDescription} />
				<meta name="keywords" content={`${eventName}, event, tickets, booking, ${data.location}`} />
				<meta property="og:title" content={metaTitle} />
				<meta property="og:description" content={metaDescription} />
				<meta property="og:image" content={metaImage} />
				{/* No `og:image:width` / `og:image:height`.
				    They were hardcoded to 1200x630 while the actual image is whatever the host
				    uploaded — the Michigan Alumni Picnic's is 1024x1536 portrait. Declaring
				    dimensions an image doesn't have is worse than declaring none: clients that
				    trust the hint lay out a 1200x630 box and then distort, crop or drop the
				    image outright, which is how a link preview ends up with a broken image.
				    Omitted so every client measures the real file instead. */}
				<meta property="og:image:alt" content={metaTitle} />
				<meta property="og:url" content={pageUrl} />
				<meta property="og:site_name" content="Jetzy Events" />
				<meta property="og:type" content="website" />
				<meta name="twitter:card" content="summary_large_image" />
				<meta name="twitter:title" content={metaTitle} />
				<meta name="twitter:description" content={metaDescription} />
				<meta name="twitter:image" content={metaImage} />
			</Head>
			<ErrorBoundary>
				<HostedEvents event={data} />
			</ErrorBoundary>
		</>
	)
}

/**
 * Guarantee `images` / `videos` exist as clean string arrays on a payload that
 * never went through the Mongoose schema. Fills from the alternate keys the
 * mobile/v2 API is known to use before falling back to an empty list — an empty
 * banner is a worse failure than an extra lookup.
 */
const normalizeExternalEvent = (raw: any) => {
	const media = normalizeEventMediaFields(raw)
	const images = media.images.length ? media.images : normalizeEventMediaFields({ images: raw?.image ?? raw?.photos ?? raw?.imageUrls ?? raw?.media }).images
	const videos = media.videos.length ? media.videos : normalizeEventMediaFields({ videos: raw?.video ?? raw?.videoUrls }).videos
	return { ...raw, images, videos }
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

		// Detailed Lookup v3
		const dbUrl = process.env.NEXT_EVENTS_DB_URL || ""
		const dbHostname = dbUrl.split("@")[1]?.split("/")[0] || "unknown"
		console.log(`[Slug Lookup v3] DB Host: ${dbHostname}, Slug: "${slug}" (${typeof slug})`)

		// 1. Exact match (standard)
		let event = await Events.findOne({ slug: slug as string, isDeleted: false })

		if (event) {
			console.log(`[Slug Lookup v3] Exact match found: ${event._id}`)
		} else {
			console.log(`[Slug Lookup v3] Exact match FAILED for: "${slug}". Trying Mongoose regex...`)
			const escapedSlug = (slug as string).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

			// 2. Mongoose regex lookup
			event = await Events.findOne({
				slug: { $regex: new RegExp(`^${escapedSlug}$`, "i") },
				isDeleted: false,
			})

			if (!event) {
				console.log(`[Slug Lookup v3] Mongoose regex FAILED. Trying direct MongoDB collection query...`)
				// 3. Fallback: Direct collection query (bypasses Mongoose middleware/hooks)
				const rawDoc = await Events.collection.findOne({
					slug: { $regex: `^${escapedSlug}$`, $options: "i" },
					isDeleted: false,
				})

				if (rawDoc) {
					console.log(`[Slug Lookup v3] Direct collection lookup SUCCESS: ${rawDoc._id}`)
					event = Events.hydrate(rawDoc)
				}
			}
		}

		// 3.5. Retired slug — the host renamed this event's url. Send the visitor on to the
		// current one instead of 404ing, so links already in circulation (RSVP buttons in
		// sent emails, printed QR codes, pasted links) survive a rename. Runs only after
		// every current-slug lookup has missed, so a live slug always wins.
		if (!event) {
			console.log(`[Slug Lookup v3] Current-slug lookups FAILED. Checking retired slugs...`)
			const aliased = await findEventByPreviousSlug(Events, slug as string)
			if (aliased?.slug) {
				console.log(`[Slug Lookup v3] Retired slug "${slug}" belongs to ${aliased._id} -> redirecting to "${aliased.slug}"`)
				return {
					redirect: {
						// 307, not 308: browsers cache a permanent redirect indefinitely, and a
						// later rename (or a revert) would be impossible to undo for anyone who
						// had already followed the old link once.
						destination: withQuery(eventPath(aliased.slug), context.query, ["slug"]),
						permanent: false,
					},
				}
			}
		}

		// 4. ObjectId fallback — mobile app shares raw _id deep-links (/{objectId}).
		// Only runs when slug lookups miss AND the path is exactly a 24-hex ObjectId,
		// so existing slug URLs are never affected.
		if (!event && /^[0-9a-f]{24}$/i.test(slug as string)) {
			console.log(`[Slug Lookup v3] Slug miss + param is ObjectId. Trying findById: ${slug}`)
			const byId = await Events.findOne({ _id: slug as string, isDeleted: false })
			if (byId) {
				console.log(`[Slug Lookup v3] findById SUCCESS: ${byId._id}`)
				event = byId
			}
		}

		if (!event) {
			console.log(`[Slug Lookup v3] ALL local lookups FAILED for: "${slug}". Checking External API...`);

			const { external, token } = context.query;
			if (external === 'true' && token) {
				try {
					console.log(`[Slug Lookup v3] Fetching from External V2 API: ${slug}`);
					const externalApiUrl = "https://test.jetzy.com/api/v2/events";
					const res = await fetch(`${externalApiUrl}/${encodeURIComponent(slug as string)}`, {
						headers: {
							'Authorization': `Bearer ${token}`,
							'Content-Type': 'application/json',
						}
					});

					if (res.ok) {
						const externalData = await res.json();
						if (externalData?.status && externalData?.data) {
							// The v2 payload is the mobile app's shape, not IEvent — it is not
							// schema-checked and has reached the page with `images` absent or as a
							// bare string, which renders as "No image available" on an event that
							// plainly has a photo. Normalise the media fields before they become props.
							const normalized = normalizeExternalEvent(externalData.data)
							console.log(`[Slug Lookup v3] External fetch SUCCESS: ${slug} (${normalized.images.length} img, ${normalized.videos.length} vid)`);
							return {
								props: {
									event: JSON.stringify(normalized)
								}
							};
						}
					} else {
						console.warn(`[Slug Lookup v3] External fetch FAILED: ${res.status}`);
					}
				} catch (err) {
					console.error(`[Slug Lookup v3] External fetch ERROR:`, err);
				}
			}

			return { notFound: true }
		}


		// Media count is logged so a "no image available" report can be resolved from
		// the server logs alone, without having to guess at the visitor's entry url.
		console.log(`[Slug Lookup v3] Success! Rendering event: ${event.name} (${event._id}) — ${event.images?.length ?? 0} img, ${event.videos?.length ?? 0} vid`)

		// Public events pending admin approval are hidden from everyone except their
		// owner/admin — anyone else opening a shared link sees a friendly "not yet
		// approved" notice and gets bounced to the main events page.
		if (isPendingAdminApproval(event as any)) {
			const session = await getServerSession(context.req, context.res, authOptions)
			const role = (session?.user as any)?.role
			const isAdmin = role === "admin" || role === "super admin"
			const userId = (session?.user as any)?._id?.toString()
			const isOwner = userId && event.ownerId?.toString() === userId
			if (!isAdmin && !isOwner) {
				return { props: { event: "", pendingApproval: true } }
			}
		}

		// Private events are UNLISTED, not invite-only: they're excluded from the public
		// listing (api/events/index.ts) but anyone holding the link can open them. The old
		// ?code= invite gate was removed — it made every guest-facing link a source of dead
		// links, since owners and admins bypassed it and so never saw the breakage.

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

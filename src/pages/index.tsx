import EventListing from "@/components/misc/EventsListing"
import { Events } from "@/models/events"
import { IEvent } from "@/models/events/types"
import { GetServerSideProps } from "next"
import { getServerSession } from "next-auth"
import dynamic from "next/dynamic"
import Head from "next/head"
import React from "react"
import { authOptions } from "./api/auth/[...nextauth]"

const HostedEvents = dynamic(() => import("@Jetzy/components/HostedEvents"), {
	ssr: false,
})

type Props = {
	events: string | null
	pagination: {
		total: number
		page: number
		showing: number
		limit: number
		totalPages: number
	}
}

export default function Home({ events, pagination }: Props) {
	const data = events ? (JSON.parse(events) as IEvent[]) : []

	if (!events) return <div>No events found</div>

	const { page, totalPages } = pagination

	return (
		<>
			<Head>
				<title>Jetzy Events - Discover Amazing Events Near You</title>
				<meta
					name="description"
					content="Discover and book tickets for the best events, concerts, parties, and experiences. Join Jetzy to connect with amazing events and create unforgettable memories."
				/>
				<meta name="keywords" content="events, concerts, parties, nightlife, dining, lifestyle, travel, tickets, booking" />
				<meta property="og:title" content="Jetzy Events - Discover Amazing Events Near You" />
				<meta property="og:description" content="Discover and book tickets for the best events, concerts, parties, and experiences." />
				<meta property="og:type" content="website" />
				<meta name="twitter:card" content="summary_large_image" />
				<meta name="twitter:title" content="Jetzy Events - Discover Amazing Events Near You" />
				<meta name="twitter:description" content="Discover and book tickets for the best events, concerts, parties, and experiences." />
			</Head>
			<EventListing pagination={pagination} items={data} />
		</>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	const session = await getServerSession(context.req, context.res, authOptions)

	// lets paginate the events
	const limit = 20
	const page = context.query.page ? parseInt(context.query.page as string) : 1
	const skip = (page - 1) * limit

	// Check if user is signed in and their role
	const isSignedIn = !!session
	const userRole = (session?.user as any)?.role
	const isAdmin = userRole === "admin" || userRole === "super admin"
	const userId = (session?.user as any)?._id

	// Define the query based on authentication status and role
	let query: any = { isDeleted: false }

	// Interest category filter from query params
	const interestCategory = context.query.interestCategory as string | undefined
	if (interestCategory && interestCategory !== "All" && interestCategory !== "") {
		query.interestCategory = interestCategory
	}

	// Interest subcategory filter from query params
	const interestSubCategory = context.query.interestSubCategory as string | undefined
	if (interestSubCategory && interestSubCategory !== "") {
		query.interestSubCategory = interestSubCategory
	}

	// Search filter from query params
	const search = context.query.search as string | undefined
	const hasSearch = search && search.trim() !== ""

	// Privacy filter: Only show public events OR private events owned by the user
	if (!isAdmin) {
		if (isSignedIn && userId) {
			// Show public events OR private events owned by this user
			const { Types } = await import("mongoose")
			const userObjectId = new Types.ObjectId(userId)
			
			// Build privacy condition
			const privacyCondition = {
				$or: [
					{ privacy: "public" },
					{ 
						$and: [
							{ privacy: "private" },
							{ ownerId: userObjectId }
						]
					}
				]
			}

			// If there's a search filter, combine with privacy using $and
			if (hasSearch) {
				query.$and = [
					{
						$or: [
							{ name: { $regex: search.trim(), $options: "i" } },
							{ location: { $regex: search.trim(), $options: "i" } },
							{ desc: { $regex: search.trim(), $options: "i" } },
						]
					},
					privacyCondition
				]
			} else {
				// No search, just apply privacy filter
				Object.assign(query, privacyCondition)
			}
		} else {
			// Not signed in: only show public events
			if (hasSearch) {
				query.$and = [
					{
						$or: [
							{ name: { $regex: search.trim(), $options: "i" } },
							{ location: { $regex: search.trim(), $options: "i" } },
							{ desc: { $regex: search.trim(), $options: "i" } },
						]
					},
					{ privacy: "public" }
				]
			} else {
				query.privacy = "public"
			}
		}
	} else {
		// Admins can see all events, but still need to handle search
		if (hasSearch) {
			query.$or = [
				{ name: { $regex: search.trim(), $options: "i" } },
				{ location: { $regex: search.trim(), $options: "i" } },
				{ desc: { $regex: search.trim(), $options: "i" } },
			]
		}
	}

	// If user is not signed in, only show "Chinese Mid-Autumn Rooftop Celebration"
	if (!isSignedIn) {
		// query.name = "Chinese Mid-Autumn Rooftop Celebration";
	}

	// Ensure database connection is ready
	const { dbconn } = await import("@/configs/database")
	if (dbconn.readyState !== 1) {
		console.log("[index] Database not connected, attempting to connect...")
		await dbconn.asPromise()
	}

	// Get events based on authentication status using aggregation for custom sorting
	// Include Live, Upcoming, and Ended events with proper categorization
	const now = new Date()
	const events = await Events.aggregate([
		{ 
			$match: {
				...query
				// No filter - show all events (Live, Upcoming, and Ended)
			}
		},
		{
			$addFields: {
				// Calculate event status for proper categorization
				eventStatus: {
					$switch: {
						branches: [
							// Ended: Ends before or at now
							{ 
								case: { $lte: ["$endsOn", now] }, 
								then: "Ended" 
							},
							// Live: Starts before/at now AND Ends after now (not equal)
							{ 
								case: { 
									$and: [
										{ $lte: ["$startsOn", now] }, 
										{ $gt: ["$endsOn", now] }
									] 
								}, 
								then: "Live" 
							},
							// Upcoming: Starts after now
							{ 
								case: { $gt: ["$startsOn", now] }, 
								then: "Upcoming" 
							}
						],
						default: "Upcoming" // Fallback
					}
				},
				sortOrder: {
					$switch: {
						branches: [
							// Live events first
							{ 
								case: { 
									$and: [
										{ $lte: ["$startsOn", now] }, 
										{ $gt: ["$endsOn", now] }
									] 
								}, 
								then: 1 
							},
							// Upcoming events second
							{ 
								case: { $gt: ["$startsOn", now] }, 
								then: 2 
							},
							// Ended events last
							{ 
								case: { $lte: ["$endsOn", now] }, 
								then: 3 
							}
						],
						default: 4
					}
				}
			}
		},
		{ $sort: { sortOrder: 1, startsOn: 1 } },
		{ $skip: skip },
		{ $limit: limit }
	])

	if (!events) return { props: { events: null, pagination: null } }

	// get total count of events based on authentication status (including all events)
	const total = await Events.countDocuments(query)
	// serialize the events (handle _id manually since aggregate returns POJO)
	const data = events.map((event) => ({
		...event,
		_id: event._id.toString(),
		// Ensure dates are stringified if needed, though JSON.stringify handles it usually
	}))

	// calculate page total and current page
	const totalPages = Math.ceil(total / limit)

	// pagination object
	const pagination = {
		total,
		page,
		showing: data.length,
		limit,
		totalPages,
	}

	return {
		props: {
			events: JSON.stringify(data),
			pagination,
		},
	}
}

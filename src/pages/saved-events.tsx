import EventListing from "@/components/misc/EventsListing"
import { Events } from "@/models/events"
import { SavedEvents } from "@/models/events/saved-events"
import { IEvent } from "@/models/events/types"
import { GetServerSideProps } from "next"
import { getServerSession } from "next-auth"
import Head from "next/head"
import React from "react"
import { authOptions } from "./api/auth/[...nextauth]"
import mongoose from "mongoose"

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

export default function SavedEventsPage({ events, pagination }: Props) {
	const data = events ? (JSON.parse(events) as IEvent[]) : []

	return (
		<>
			<Head>
				<title>Saved Events - Jetzy Events</title>
				<meta name="description" content="View all events you've saved for later." />
			</Head>
			<EventListing pagination={pagination} items={data} />
		</>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	const session = await getServerSession(context.req, context.res, authOptions)

	// Check if user is authenticated
	if (!session || !session.user?.email) {
		return {
			redirect: {
				destination: "/api/auth/signin",
				permanent: false,
			},
		}
	}

	const userId = (session.user as any)?._id
	if (!userId) {
		return {
			redirect: {
				destination: "/api/auth/signin",
				permanent: false,
			},
		}
	}

	// Pagination
	const limit = 20
	const page = context.query.page ? parseInt(context.query.page as string) : 1
	const skip = (page - 1) * limit

	try {
		const userObjectId = new mongoose.Types.ObjectId(userId)

		// Find all saved events for this user
		const savedEvents = await SavedEvents.find({
			userId: userObjectId,
		})
			.sort({ createdAt: -1 })
			.lean()

		// Get event IDs from saved events
		const eventIds = savedEvents.map((saved) => saved.eventId)

		if (eventIds.length === 0) {
			return {
				props: {
					events: JSON.stringify([]),
					pagination: {
						total: 0,
						page: 1,
						showing: 0,
						limit,
						totalPages: 0,
					},
				},
			}
		}

		// Fetch event details for these events
		const events = await Events.find({
			_id: { $in: eventIds },
			isDeleted: false,
		})
			.sort({ startsOn: 1 })
			.skip(skip)
			.limit(limit)
			.lean()

		// Get total count of saved events
		const totalSavedEvents = eventIds.length
		const totalPages = Math.ceil(totalSavedEvents / limit)

		// Serialize events
		const data = JSON.parse(JSON.stringify(events))

		return {
			props: {
				events: JSON.stringify(data),
				pagination: {
					total: totalSavedEvents,
					page,
					showing: data.length,
					limit,
					totalPages,
				},
			},
		}
	} catch (error: any) {
		console.error("[saved-events] Error:", error)
		return {
			props: {
				events: JSON.stringify([]),
				pagination: {
					total: 0,
					page: 1,
					showing: 0,
					limit,
					totalPages: 0,
				},
			},
		}
	}
}



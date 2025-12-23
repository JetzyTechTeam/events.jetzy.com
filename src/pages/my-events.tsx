import EventListing from "@/components/misc/EventsListing"
import { Events } from "@/models/events"
import { Bookings } from "@/models/events/bookings"
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

export default function MyEvents({ events, pagination }: Props) {
	const data = events ? (JSON.parse(events) as IEvent[]) : []

	return (
		<>
			<Head>
				<title>Your Events - Jetzy Events</title>
				<meta name="description" content="View all events you've registered for or booked tickets." />
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

	const userEmail = session.user.email

	// Pagination
	const limit = 20
	const page = context.query.page ? parseInt(context.query.page as string) : 1
	const skip = (page - 1) * limit

	try {
		// Find all bookings for this user
		const bookings = await Bookings.find({
			customerEmail: userEmail,
			isDeleted: false,
		})
			.sort({ createdAt: -1 })
			.lean()

		// Get unique event IDs from bookings
		const eventIds = [...new Set(bookings.map((booking) => booking.eventId.toString()))].map(
			(id) => new mongoose.Types.ObjectId(id)
		)

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

		// Get total count of unique events
		const totalEvents = eventIds.length
		const totalPages = Math.ceil(totalEvents / limit)

		// Serialize events (already plain objects from .lean(), need to convert _id to string for JSON)
		const data = JSON.parse(JSON.stringify(events))

		return {
			props: {
				events: JSON.stringify(data),
				pagination: {
					total: totalEvents,
					page,
					showing: data.length,
					limit,
					totalPages,
				},
			},
		}
	} catch (error: any) {
		console.error("[my-events] Error:", error)
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

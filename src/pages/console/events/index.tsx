import ConsoleLayout from "@/components/layout/ConsoleLayout"
import EventsTableComponent from "@/components/events/EventsTableComponent"
import { ROUTES } from "@/configs/routes"
import { authorizedOnly } from "@/lib/authSession"
import { Events } from "@/models/events"
import { IEvent } from "@/models/events/types"
import { Pages } from "@/types"
import { GetServerSideProps } from "next"
import Link from "next/link"
import React from "react"

const CreateEventButton = () => {
	return (
		<div className="md:w-full xs:w-fit  flex justify-end">
			<Link href={ROUTES.dashboard.events.create} className="p-1.5 bg-app rounded-3xl">
				Create Event
			</Link>
		</div>
	)
}

export type Pagination = {
	total: number
	page: number
	showing: number
	limit: number
	totalPages: number
}

type Props = {
	events: string
	pagination: Pagination
}
export default function EventsPage({ events, pagination }: Props) {
	const data = JSON.parse(events) as IEvent[]

	return (
		<ConsoleLayout page={Pages.Events} component={<CreateEventButton />}>
			<EventsTableComponent rows={data} pagination={pagination} />
			<div className="bg-red-100"></div>
		</ConsoleLayout>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	// check if user is authorized
	const session = await authorizedOnly(context)
	if (!session) return session

	// lets paginate the events
	const limit = 20
	const page = context.query.page ? parseInt(context.query.page as string) : 1
	const skip = (page - 1) * limit
	// fetch events
	const events = await Events.find({ isDeleted: false }).limit(limit).skip(skip).sort({ createdAt: -1 })
	if (!events) return { props: { events: [] } }

	// get total count of events
	const total = await Events.countDocuments({ isDeleted: false })
	// serialize the events
	const data = events.map((event) => event.toJSON())

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
			events: JSON?.stringify(data),
			pagination,
		},
	}
}

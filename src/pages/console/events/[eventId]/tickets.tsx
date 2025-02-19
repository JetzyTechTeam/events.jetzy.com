import EventTicketTable, { TicketsRowData } from "@/components/events/EventTicketTable"
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { authorizedOnly } from "@/lib/authSession"
import { Events } from "@/models/events"
import { IEventTicket } from "@/models/events/types"
import { Pages } from "@/types"
import { Types } from "mongoose"
import { GetServerSideProps } from "next"
import React from "react"

type Props = {
	tickets: string | null
	eventName: string
	eventId: string
}
export default function EventTicketsPage({ tickets, eventName, eventId }: Props) {
	if (!tickets) {
		return (
			<ConsoleLayout page={Pages.Events}>
				<div>Event not found</div>
			</ConsoleLayout>
		)
	}

	const params = JSON.parse(tickets) as IEventTicket[]

	const data: TicketsRowData[] = params.map((ticket) => ({
		id: ticket._id.toString(),
		title: ticket.name,
		price: ticket.price,
		date: ticket.createdAt,
		desc: ticket.desc,
	}))

	return (
		<ConsoleLayout page={Pages.Events}>
			<EventTicketTable rows={data} eventName={eventName} eventId={eventId} />
		</ConsoleLayout>
	)
}

type Params = {
	eventId: string
}
export const getServerSideProps: GetServerSideProps<any, Params> = async (context) => {
	// check if user is authorized
	const session = await authorizedOnly(context)
	if (!session) return session

	const { eventId } = context.params as Params

	// using event id, fetch event tickets from the database

	const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false }, "tickets name")
	if (!event) {
		return {
			props: {
				tickets: null,
				eventName: "",
				eventId: eventId,
			},
		}
	}

	return {
		props: {
			tickets: JSON.stringify(event.tickets),
			eventName: event.name,
			eventId: eventId,
		},
	}
}

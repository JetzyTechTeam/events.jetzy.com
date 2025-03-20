import BookingTableComponent from "@/components/bookings/BookingTableComponent"
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { authorizedOnly } from "@/lib/authSession"
import { Bookings } from "@/models/events/bookings"
import { IBookings, IEvent } from "@/models/events/types"
import { Pages } from "@/types"
import { GetServerSideProps } from "next"
import React from "react"

type Props = {
	bookings: string | null
	pagination: {
		total: number
		page: number
		showing: number
		limit: number
		totalPages: number
	}
	exportable: string | null
}

export type Exportable = {
	booking: IBookings
	event: IEvent
	bookedTickets: string[]
}
export default function BookingsPage({ bookings, pagination, exportable }: Props) {
	if (!bookings) {
		return (
			<ConsoleLayout page={Pages.Bookings}>
				<div>No bookings found</div>
			</ConsoleLayout>
		)
	}

	if (!exportable) {
		return (
			<ConsoleLayout page={Pages.Bookings}>
				<div>No bookings found</div>
			</ConsoleLayout>
		)
	}

	return (
		<ConsoleLayout page={Pages.Bookings}>
			<BookingTableComponent rows={JSON.parse(bookings) as IBookings[]} pagination={pagination} exportable={JSON.parse(exportable) as Exportable[]} />
		</ConsoleLayout>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	// check if user is authorized
	const session = await authorizedOnly(context)
	if (!session) return session

	// Booking pagination params
	const limit = 20
	const page = context.query.page ? parseInt(context.query.page as string) : 1
	const skip = (page - 1) * limit

	// Fetch the bookings from the database
	const bookings = await Bookings.find({ isDeleted: false }).limit(limit).skip(skip).sort({ createdAt: -1 })
	if (!bookings) return { props: { bookings: null } }

	// get total count of bookings
	const total = await Bookings.countDocuments({ isDeleted: false })
	// serialize the bookings
	const data = await Promise.all(
		bookings.map(async (booking) => {
			const event = await booking.getEvent()

			return {
				...booking.toJSON(),
				event,
			}
		}),
	)

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

	// Get bookings to be export into excel
	const bookingsForExport = await Bookings.find({ isDeleted: false }).sort({ createdAt: -1 })
	if (!bookingsForExport) return { props: { bookings: null, exportable: null } }

	// using the ticket id, get the  event details
	const exportable = await Promise.all(
		bookingsForExport.map(async (booking) => {
			const event = await booking.getEvent()

			const bookedTickets = booking.tickets.map((ticket) => {
				const eventTicket = event?.tickets.find((t) => t._id.toString() === ticket.ticketId.toString())
				return `${eventTicket?.name} x ${ticket.quantity}`
			})

			return {
				booking: booking.toJSON(),
				event: event.toJSON(),
				bookedTickets,
			}
		}),
	)

	return {
		props: {
			bookings: JSON.stringify(data),
			pagination,
			exportable: JSON.stringify(exportable),
		},
	}
}

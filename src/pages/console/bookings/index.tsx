import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { adminOnly } from "@/lib/authSession"
import { Events } from "@/models/events"
import { IBookings, IEvent } from "@/models/events/types"
import { Pages } from "@/types"
import { GetServerSideProps } from "next"
import Head from "next/head"
import React from "react"
import BookingEventsList from "@/components/bookings/BookingEventsList"
import CreateEventModal from "@/components/events/CreateEventModal"
import { useDisclosure } from "@chakra-ui/react"
import { useRouter } from "next/router"

type Props = {
	events: IEvent[] | null
	pagination: {
		total: number
		page: number
		showing: number
		limit: number
		totalPages: number
	}
}
export type Booking = {
	_id: string
	bookingRef: string
	eventId: string
	tickets: { ticketId: string; quantity: number }[]
	status: string
	customerName: string
	customerEmail: string
	customerPhone: string
	total: number
	createdAt: string
	stripeSessionId?: string
	paymentUrl?: string | null
}

export type Exportable = {
	booking: IBookings
	event: IEvent
	bookedTickets: string[]
}

export default function BookingsPage({ events, pagination }: Props) {
	const router = useRouter()
	const { isOpen: isCreateModalOpen, onOpen: onCreateModalOpen, onClose: onCreateModalClose } = useDisclosure()

	const handleEventCreated = () => {
		// Refresh the page to show the new event
		router.reload()
	}

	// Empty State
	if (!events || events.length === 0) {
		return (
			<>
				<Head>
					<title>Bookings - Jetzy Events</title>
					<meta name="description" content="View and manage all bookings for your events on Jetzy." />
					<meta name="robots" content="noindex, nofollow" />
				</Head>
				<ConsoleLayout page={Pages.Bookings}>
					<div className="flex flex-col items-center justify-center py-16 px-4">
						<div className="bg-white rounded-2xl shadow-sm border border-border-light p-12 max-w-md w-full text-center">
							{/* Icon */}
							<div className="w-20 h-20 mx-auto mb-6 bg-background-light rounded-full flex items-center justify-center">
								<svg className="w-10 h-10 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
									/>
								</svg>
							</div>

							{/* Title and Description */}
							<h3 className="text-2xl font-bold text-text-primary mb-3">No Events Yet</h3>
							<p className="text-text-secondary mb-8">You haven&apos;t created any events yet. Create your first event to start receiving bookings.</p>

							{/* CTA Button */}
							<button 
								onClick={onCreateModalOpen}
								className="px-6 py-3 bg-primary-purple text-white font-medium rounded-lg hover:bg-primary-dark transition-all duration-200 shadow-md hover:shadow-lg inline-flex items-center gap-2"
							>
								<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
								</svg>
								Create Your First Event
							</button>
						</div>
					</div>

					<CreateEventModal 
						isOpen={isCreateModalOpen} 
						onClose={onCreateModalClose} 
						onEventCreated={handleEventCreated}
					/>
				</ConsoleLayout>
			</>
		)
	}

	return (
		<>
			<Head>
				<title>Bookings - Jetzy Events</title>
				<meta name="description" content="View and manage all bookings for your events on Jetzy." />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout page={Pages.Bookings}>
				<div className="px-4 sm:px-6 lg:px-8">
					<BookingEventsList events={events} pagination={pagination} />
				</div>
			</ConsoleLayout>
		</>
	)
}
export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	//check if user is admin/super admin
	const sessionResult = await adminOnly(context)
	if (!sessionResult || "redirect" in sessionResult) return sessionResult
	const session = sessionResult.props.session

	// Ensure database connection is ready
	const { dbconn } = await import("@/configs/database")
	if (dbconn.readyState !== 1) {
		console.log("[console/bookings] Database not connected, attempting to connect...")
		await dbconn.asPromise()
	}

	//pagination
	//const limit = 5
	const limit = 10
	const page = context.query.page ? parseInt(context.query.page as string) : 1
	const skip = (page - 1) * limit

	//fetch fields including images, location, timezone, and booking count
	const events = await Events.find({ isDeleted: false }, { _id: 1, name: 1, startsOn: 1, endsOn: 1, images: 1, location: 1, timezone: 1, slug: 1 })
		.sort({ startsOn: -1 })
		.skip(skip)
		.limit(limit)
		.lean() // plain JS objects

	if (!events || events.length === 0) {
		return {
			props: {
				events: [],
				pagination: { total: 0, page, showing: 0, limit, totalPages: 0 },
			},
		}
	}

	//serialize _id and Dates
	const serializedEvents = events.map((e) => ({
		...e,
		_id: e._id.toString(),
		startsOn: e.startsOn.toISOString(),
		endsOn: e.endsOn.toISOString(),
	}))

	const total = await Events.countDocuments({ isDeleted: false })

	//calculate page total and current page
	const totalPages = Math.ceil(total / limit)

	//pagination object
	const pagination = {
		total,
		page,
		showing: events.length,
		limit,
		totalPages,
	}

	return {
		props: {
			//bookings: JSON.stringify(data),
			events: serializedEvents,
			pagination,
			//exportable: JSON.stringify(exportable),
		},
	}
}

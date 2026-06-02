import { DateTimeSVG, LocationSVG } from "@/assets/icons"
import { stripHtml } from "@/utils/text";
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { authorizedOnly } from "@/lib/authSession"
import { deleteFile } from "@/services/upload.service"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { IEvent } from "@/models/events/types"
import { DeleteEventThunk } from "@/redux/reducers/eventsSlice"
import { useAppDispatch } from "@/redux/stores"
import { AlertDialog, AlertDialogBody, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, Button, Heading, Text, useDisclosure } from "@chakra-ui/react"
import { GetServerSideProps } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/router"
import React, { useRef, useState } from "react"
import { toast } from "react-toastify"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"

type Pagination = {
	total: number
	page: number
	showing: number
	limit: number
	totalPages: number
}

type Props = {
	events: string
	pagination: Pagination
	isAdmin: boolean
}

export default function EventsListing({ events, pagination, isAdmin }: Props) {
	const [eventList, setEventList] = React.useState<IEvent[]>(() => JSON.parse(events) as IEvent[])
	const router = useRouter()

	// getServerSideProps re-runs on page navigation, but the component stays
	// mounted — re-sync the list whenever the server sends new events.
	React.useEffect(() => {
		setEventList(JSON.parse(events) as IEvent[])
	}, [events])

	const handleEventRemoved = (removedEventId: string) => {
		setEventList((prevList) => prevList.filter((event) => event._id.toString() !== removedEventId))
	}

	const goToPage = (p: number) => {
		router.push({ pathname: router.pathname, query: { page: p } })
	}

	return (
		<ConsoleLayout maxW="max-w-[800px]" className="px-0">
			<div className="max-w-[800px] mx-auto mb-5">
				<Heading as="h2" fontSize={28}>
					{isAdmin ? "Events" : "My Events"}
				</Heading>
			</div>

			<div className="space-y-5 max-w-[800px] mx-auto">
				{!eventList.length && <p>No events found.</p>}

				{eventList.map((event) => (
					<ListingCard {...event} key={event.slug} onEventRemoved={handleEventRemoved} isEnded={event.isEnded} />
				))}
			</div>

			{pagination.totalPages > 1 && (
				<div className="flex items-center justify-between max-w-[800px] mx-auto mt-8">
					<Button
						onClick={() => goToPage(pagination.page - 1)}
						isDisabled={pagination.page <= 1}
						variant="outline"
						colorScheme="orange"
					>
						← Prev
					</Button>

					<Text color="gray.400" fontSize="sm">
						Page {pagination.page} of {pagination.totalPages} &nbsp;·&nbsp; {pagination.total} total
					</Text>

					<Button
						onClick={() => goToPage(pagination.page + 1)}
						isDisabled={pagination.page >= pagination.totalPages}
						variant="outline"
						colorScheme="orange"
					>
						Next →
					</Button>
				</div>
			)}
		</ConsoleLayout>
	)
}

const ListingCard = (props: IEvent & { onEventRemoved: (id: string) => void; isEnded?: boolean }) => {
	const event = props
	const dispatcher = useAppDispatch()
	const [loading, setLoading] = React.useState(false)
	const router = useRouter()
	const { isOpen, onOpen, onClose } = useDisclosure()
	const cancelRef = useRef(null)
	const [selectedEvent, setSelectedEvent] = useState<IEvent | null>(null)

	const { data: totals } = useQuery({
		queryKey: ["eventTotals", event._id],
		queryFn: () => axios.get(`/api/events/${event._id}/totals`).then((r) => r.data),
	})
	const totalTickets = totals?.totalTickets ?? 0
	const uniqueGuests = totals?.uniqueGuests ?? 0

	const handleRemove = (item: IEvent) => {
		setLoading(true)
		dispatcher(DeleteEventThunk({ id: item._id.toString() }))
			.then((res: any) => {
				// delete the images from edge store server
				if (item.images.length > 0) {
					item.images.forEach((image) => {
						deleteFile(image)
					})
				}
				toast.success("Event deleted successfully!")
				props.onEventRemoved(item._id.toString())
			})
			.finally(() => {
				setLoading(false)
			})
	}

	const confirmDelete = (event: IEvent) => {
		setSelectedEvent(event)
		onOpen()
	}

	return (
		<>
			<div className="space-y-5">
				<div className={`flex items-center justify-between rounded-xl p-5 ${props.isEnded ? 'bg-[#2A1E1E] border border-[#444444]' : 'bg-[#1E1E1E]'}`}>
					{/* CONTENT SECTION  */}
					<div className="space-y-4 flex-1">
						<div className="flex items-start justify-between">
							<div className="flex-1">
								<Link href={`/${event.slug}`}>
									<Heading as="h3" fontSize={20} cursor="pointer" _hover={{ textDecoration: "underline" }} className={props.isEnded ? 'text-gray-400' : ''}>
										{stripHtml(event.name)}
									</Heading>
								</Link>
								{props.isEnded && (
									<span className="inline-block mt-1 px-2 py-1 bg-[#444444] text-[#A7A7A7] text-xs rounded-full font-medium">
										ENDED EVENT
									</span>
								)}
								{event.status === 'draft' && (
									<span className="inline-block mt-1 ml-2 px-2 py-1 bg-[#2A1F00] text-[#F79432] border border-[#F79432] text-xs rounded-full font-medium">
										DRAFT
									</span>
								)}
								{(event as any).privacy === 'private' && (
									<span className="inline-block mt-1 ml-2 px-2 py-1 bg-[#7C1D1D] text-white border border-red-500/40 text-xs rounded-full font-medium">
										PRIVATE
									</span>
								)}
							</div>
						</div>

						{/* PROMINENT DATE/TIME SECTION */}
						<div className="bg-[#2A2A2A] rounded-lg p-3 border border-[#444444]">
							<div className="flex items-center gap-x-3 text-white font-medium">
								<DateTimeSVG stroke="#F79432" />
								<div>
									<div className="text-lg">
										{event.startsOn ? new Date(event.startsOn.toString()).toLocaleDateString('en-US', {
											weekday: 'long',
											year: 'numeric',
											month: 'long',
											day: 'numeric'
										}) : event.datePoll?.isActive ? "Date to be decided (Polling)" : "Date to be decided"}
									</div>
									<div className="text-sm text-[#A7A7A7]">
										{event.startsOn ? new Date(event.startsOn.toString()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : "--:--"} - {event.endsOn ? new Date(event.endsOn.toString()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : "--:--"} {event.timezone ? `(${event.timezone})` : ""}
									</div>
								</div>
							</div>
						</div>

						<div className="space-y-2">
							<Text className="flex items-center gap-x-2 text-[#A7A7A7]">
								{event.locationDisclosedAfterBooking ? (
									<>
										<span>📍</span>
										<span>
											Disclosed after registration <span className="text-xs text-gray-500 ml-1">(Actual: {event.location})</span>
										</span>
									</>
								) : (
									<>
										<LocationSVG />
										<span>{event.location}</span>
									</>
								)}
							</Text>
						</div>

						<div className="flex items-center gap-x-4 text-sm text-gray-300">
							<span className="flex items-center gap-1">
								<span>🎟️</span>
								<span>{totalTickets} tickets</span>
							</span>
							<span className="flex items-center gap-1">
								<span>👥</span>
								<span>{uniqueGuests} guests</span>
							</span>
						</div>

						<div className="flex items-center gap-x-3">
							<Link href={`/console/events/${event._id}/manage`} className="bg-[#3E3E3E] p-2 rounded-md text-sm hover:bg-[#4E4E4E] transition-colors">
								Manage Event
							</Link>
							<Link href={`/console/events/${event._id}/update`} className="bg-[#3E3E3E] p-2 rounded-md text-sm hover:bg-[#4E4E4E] transition-colors">
								Edit Event
							</Link>
							{!props.isEnded && (
								<div
									onClick={() => confirmDelete(event)}
									className={`w-max bg-[#351919] text-[#EC5E5E] p-2 rounded-md text-sm cursor-pointer hover:bg-[#451919] transition-colors ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
									style={{ pointerEvents: loading ? "none" : "auto" }}
								>
									{loading ? "Deleting..." : "Delete Event"}
								</div>
							)}
						</div>
					</div>

					{/* IMAGE SECTION */}
					<div className="ml-4">
						{(() => {
							const firstImage = event?.images?.[0]
							// next/image needs an absolute URL or root-relative path; guard bad/seed data ("string", "", etc.)
							const isValidImage = typeof firstImage === "string" && (firstImage.startsWith("/") || firstImage.startsWith("http"))
							return isValidImage ? (
							<Image
								src={firstImage}
								alt={stripHtml(event.name)}
								className={`w-[180px] h-[150px] rounded-xl object-cover ${props.isEnded ? 'opacity-60' : ''}`}
								width={180}
								height={150}
							/>
						) : (
							<div className={`w-[180px] h-[150px] rounded-xl bg-[#2A2D35] flex flex-col items-center justify-center gap-1 ${props.isEnded ? 'opacity-60' : ''}`}>
								<span className="text-3xl">🖼️</span>
								<span className="text-xs text-gray-500">No image</span>
							</div>
							)
						})()}
					</div>
				</div>
			</div>
			<AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef} onClose={onClose}>
				<AlertDialogOverlay>
					<AlertDialogContent bg="#1E1E1E" border="1px solid #444">
						<AlertDialogHeader fontSize="lg" fontWeight="bold" color="white">
							Delete Event
						</AlertDialogHeader>

						<AlertDialogBody color="white">Are you sure you want to delete this event? This action cannot be undone.</AlertDialogBody>

						<AlertDialogFooter>
							<Button ref={cancelRef} onClick={onClose}>
								Cancel
							</Button>
							<Button
								colorScheme="red"
								onClick={() => {
									if (selectedEvent) {
										handleRemove(selectedEvent)
										onClose()
									}
								}}
								ml={3}
								isLoading={loading}
							>
								Delete
							</Button>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialogOverlay>
			</AlertDialog>
		</>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	await ensureDbConnected()
	// check if user is authorized
	const authResult = await authorizedOnly(context)
	if ('redirect' in authResult) return authResult

	const serverSession = await getServerSession(context.req, context.res, authOptions)
	const userRole = (serverSession?.user as any)?.role
	const userId = (serverSession?.user as any)?._id
	const isAdmin = userRole === "admin" || userRole === "super admin"
	const ownerFilter = isAdmin ? {} : { ownerId: userId }

	const LIMIT = 20
	const page = context.query.page ? parseInt(context.query.page as string) : 1
	const skip = (page - 1) * LIMIT

	// fetch active events (not deleted), filtered by owner if non-admin
	const activeEvents = await Events.find({ isDeleted: false, ...ownerFilter }).sort({ createdAt: -1 })

	// Get events with bookings to include past events that have activity
	const { Bookings } = await import("@/models/events/bookings")
	const eventsWithBookings = await Bookings.distinct('eventId', { isDeleted: false })

	// Fetch past events that have bookings
	const now = new Date()
	const pastEventsWithBookings = await Events.find({
		_id: { $in: eventsWithBookings },
		isDeleted: false,
		endsOn: { $lt: now },
		...ownerFilter,
	})

	// If no past events with bookings, include all past events in scope
	const pastEventsToInclude = pastEventsWithBookings.length > 0 ? pastEventsWithBookings : await Events.find({
		isDeleted: false,
		endsOn: { $lt: now },
		...ownerFilter,
	})

	// Combine active events and past events with bookings, remove duplicates
	const allEventsMap = new Map()

	// Add active events
	activeEvents.forEach(event => {
		const eventData = event.toJSON()
		eventData.isEnded = eventData.endsOn ? new Date(eventData.endsOn) < now : false
		allEventsMap.set(eventData._id.toString(), eventData)
	})

	// Add past events (only if not already included)
	pastEventsToInclude.forEach(event => {
		const eventId = event._id.toString()
		if (!allEventsMap.has(eventId)) {
			const eventData = event.toJSON()
			eventData.isEnded = true // Mark as ended since it's in the past
			allEventsMap.set(eventId, eventData)
		}
	})

	// Convert to array and sort (active events first, then ended events by start date)
	const allEvents = Array.from(allEventsMap.values()).sort((a, b) => {
		// Sort by status first (active events first, ended events last), then by start date (newest first)
		if (a.isEnded && !b.isEnded) return 1
		if (!a.isEnded && b.isEnded) return -1
		return Number(new Date(b.startsOn)) - Number(new Date(a.startsOn))
	})

	const paginatedEvents = allEvents.slice(skip, skip + LIMIT)
	const total = allEvents.length
	const totalPages = Math.ceil(total / LIMIT)

	return {
		props: {
			events: JSON?.stringify(paginatedEvents),
			pagination: { total, page, showing: paginatedEvents.length, limit: LIMIT, totalPages },
			isAdmin,
		},
	}
}

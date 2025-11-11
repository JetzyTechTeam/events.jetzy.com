import { DateTimeSVG, LocationSVG } from "@/assets/icons"
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { authorizedOnly } from "@/lib/authSession"
import { useEdgeStore } from "@/lib/edgestore"
import { Events } from "@/models/events"
import { IEvent } from "@/models/events/types"
import { DeleteEventThunk } from "@/redux/reducers/eventsSlice"
import { useAppDispatch } from "@/redux/stores"
import { Roles } from "@/types"
import { AlertDialog, AlertDialogBody, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, Button, useDisclosure } from "@chakra-ui/react"
import { GetServerSideProps } from "next"
import Head from "next/head"
import { useSession } from "next-auth/react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/router"
import React, { useRef, useState } from "react"
import { toast } from "react-toastify"

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
}

export default function EventsListing({ events, pagination }: Props) {
	const initialData = JSON.parse(events) as IEvent[]
	const [eventList, setEventList] = React.useState<IEvent[]>(initialData)
	const { data: session } = useSession()
	const router = useRouter()

	const handleEventRemoved = (removedEventId: string) => {
		setEventList((prevList) => prevList.filter((event) => event._id.toString() !== removedEventId))
	}

	const handlePageChange = (newPage: number) => {
		router.push({
			pathname: router.pathname,
			query: { ...router.query, page: newPage },
		})
	}

	// @ts-ignore
	if (session?.user?.role === Roles.USER) router.push("/console")

	return (
		<>
			<Head>
				<title>My Events - Jetzy Events</title>
				<meta name="description" content="Manage all your created events, edit details, and track performance." />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout maxW="max-w-[800px]" className="px-0">
				<div className="max-w-[800px] mx-auto mb-5 px-4 sm:px-0">
					<h2 className="text-2xl sm:text-3xl font-bold text-text-primary">Events</h2>
				</div>

				<div className="space-y-4 sm:space-y-5 max-w-[800px] mx-auto px-4 sm:px-0">
					{!eventList.length && (
						<div className="text-center py-12">
							<p className="text-text-muted text-lg">No events found.</p>
						</div>
					)}

					{eventList.map((event) => (
						<ListingCard {...event} key={event.slug} onEventRemoved={handleEventRemoved} />
					))}
				</div>

				{/* Pagination Controls */}
				{pagination.totalPages > 1 && (
					<div className="max-w-[800px] mx-auto px-4 sm:px-0 mt-8 mb-8">
						<div className="flex items-center justify-between bg-white border border-border-light rounded-xl p-4 shadow-sm">
							{/* Page Info */}
							<div className="text-sm text-text-secondary">
								Showing <span className="font-semibold text-text-primary">{pagination.showing}</span> of <span className="font-semibold text-text-primary">{pagination.total}</span> events
							</div>

							{/* Page Navigation */}
							<div className="flex items-center gap-2">
								{/* Previous Button */}
								<button
									onClick={() => handlePageChange(pagination.page - 1)}
									disabled={pagination.page === 1}
									className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
										pagination.page === 1
											? "bg-background-gray text-text-muted cursor-not-allowed"
											: "bg-white border border-border-light text-text-primary hover:bg-primary-purple hover:text-white hover:border-primary-purple"
									}`}
								>
									Previous
								</button>

								{/* Page Numbers */}
								<div className="hidden sm:flex items-center gap-1">
									{Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((pageNum) => {
										// Show first page, last page, current page, and pages around current
										const showPage = pageNum === 1 || pageNum === pagination.totalPages || (pageNum >= pagination.page - 1 && pageNum <= pagination.page + 1)

										if (!showPage) {
											// Show ellipsis
											if (pageNum === pagination.page - 2 || pageNum === pagination.page + 2) {
												return (
													<span key={pageNum} className="px-2 text-text-muted">
														...
													</span>
												)
											}
											return null
										}

										return (
											<button
												key={pageNum}
												onClick={() => handlePageChange(pageNum)}
												className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
													pageNum === pagination.page
														? "bg-primary-purple text-white"
														: "bg-white border border-border-light text-text-primary hover:bg-primary-purple hover:text-white hover:border-primary-purple"
												}`}
											>
												{pageNum}
											</button>
										)
									})}
								</div>

								{/* Mobile Page Info */}
								<div className="sm:hidden px-3 py-2 text-sm font-medium text-text-primary">
									Page {pagination.page} of {pagination.totalPages}
								</div>

								{/* Next Button */}
								<button
									onClick={() => handlePageChange(pagination.page + 1)}
									disabled={pagination.page === pagination.totalPages}
									className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
										pagination.page === pagination.totalPages
											? "bg-background-gray text-text-muted cursor-not-allowed"
											: "bg-white border border-border-light text-text-primary hover:bg-primary-purple hover:text-white hover:border-primary-purple"
									}`}
								>
									Next
								</button>
							</div>
						</div>
					</div>
				)}
			</ConsoleLayout>
		</>
	)
}

const ListingCard = (props: IEvent & { onEventRemoved: (id: string) => void }) => {
	const event = props
	const dispatcher = useAppDispatch()
	const edgestore = useEdgeStore()
	const [loading, setLoading] = React.useState(false)
	const router = useRouter()
	const { isOpen, onOpen, onClose } = useDisclosure()
	const cancelRef = useRef(null)
	const [selectedEvent, setSelectedEvent] = useState<IEvent | null>(null)

	const handleRemove = (item: IEvent) => {
		setLoading(true)
		dispatcher(DeleteEventThunk({ id: item._id.toString() }))
			.then((res: any) => {
				// delete the images from edge store server
				if (item.images.length > 0) {
					item.images.forEach((image) => {
						edgestore.edgestore.publicFiles.delete({ url: image })
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
				<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white border border-border-light shadow-sm rounded-xl p-4 sm:p-5 gap-4 hover:shadow-md transition-shadow">
					{/* CONTENT SECTION  */}
					<div className="space-y-3 sm:space-y-5 flex-1 w-full">
						<Link href={`/${event.slug}`}>
							<h3 className="text-lg sm:text-xl font-semibold text-text-primary cursor-pointer hover:text-primary-purple transition-colors line-clamp-2">{event.name}</h3>
						</Link>
						<div className="space-y-2">
							<p className="flex gap-x-2 text-text-secondary text-sm sm:text-base">
								<span className="flex-shrink-0">
									<DateTimeSVG />
								</span>
								<span className="break-words">
									{new Date(event.startsOn?.toString()).toDateString()} {event.timezone}
								</span>
							</p>
							<p className="flex gap-x-2 text-text-secondary text-sm sm:text-base">
								<span className="flex-shrink-0">
									<LocationSVG />
								</span>
								<span className="break-words line-clamp-2">{event.location}</span>
							</p>
						</div>
						<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
							<Link href={`/console/events/${event._id}/manage`} className="bg-primary-purple text-white px-4 py-2 rounded-lg text-sm text-center hover:bg-primary-dark transition-colors font-medium">
								Manage Event
							</Link>
							<Link
								href={`/console/events/${event._id}/update`}
								className="bg-background-gray text-text-primary px-4 py-2 rounded-lg text-sm text-center hover:bg-border-gray transition-colors font-medium"
							>
								Edit Event
							</Link>
							<div
								onClick={() => confirmDelete(event)}
								className={`w-full sm:w-max bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm cursor-pointer text-center hover:bg-red-100 transition-colors font-medium ${
									loading ? "opacity-50 cursor-not-allowed" : ""
								}`}
								style={{ pointerEvents: loading ? "none" : "auto" }}
							>
								{loading ? "Deleting..." : "Delete Event"}
							</div>
						</div>
					</div>

					{/* IMAGE SECTION */}
					<div className="w-full sm:w-[180px] h-[200px] sm:h-[150px] flex-shrink-0">
						<Image src={event && event?.images[0]} alt={event.name} className="w-full h-full rounded-xl object-cover border border-border-light" width={180} height={150} />
					</div>
				</div>
			</div>
			<AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef} onClose={onClose}>
				<AlertDialogOverlay>
					<AlertDialogContent bg="white" border="1px solid" borderColor="border.light" mx={4}>
						<AlertDialogHeader fontSize="lg" fontWeight="bold" color="text.primary">
							Delete Event
						</AlertDialogHeader>

						<AlertDialogBody color="text.secondary">Are you sure you want to delete this event? This action cannot be undone.</AlertDialogBody>

						<AlertDialogFooter>
							<Button ref={cancelRef} onClick={onClose} size={{ base: "sm", sm: "md" }} bg="background.gray" color="text.primary" _hover={{ bg: "border.gray" }}>
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
								size={{ base: "sm", sm: "md" }}
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
	// check if user is authorized
	const session = await authorizedOnly(context)
	if (!session) return session

	// lets paginate the events
	const limit = 10
	const page = context.query.page ? parseInt(context.query.page as string) : 1
	// Ensure database connection is ready
	const { dbconn } = await import("@/configs/database")
	if (dbconn.readyState !== 1) {
		console.log("[console/events] Database not connected, attempting to connect...")
		await dbconn.asPromise()
	}

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

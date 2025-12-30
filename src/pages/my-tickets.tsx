import EventListing from "@/components/misc/EventsListing"
import { Events } from "@/models/events"
import { Bookings } from "@/models/events/bookings"
import { IEvent } from "@/models/events/types"
import { GetServerSideProps } from "next"
import { getServerSession } from "next-auth"
import Head from "next/head"
import React, { useEffect, useState } from "react"
import { authOptions } from "./api/auth/[...nextauth]"
import mongoose from "mongoose"
import axios from "axios"
import { useRouter } from "next/router"
import LightNavbar from "@/components/layout/LightNavbar"
import Footer from "@/components/layout/Footer"
import Image from "next/image"
import SafeHTML from "@/components/misc/SafeHTML"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

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

type BookingInfo = {
	bookingRef: string
	eventId: string
	eventName: string
	eventSlug: string
	qrCodeToken: string | null
	total: number
	status: string
	createdAt: string
	tickets: any[]
}

export default function MyTickets({ events, pagination }: Props) {
	const data = events ? (JSON.parse(events) as IEvent[]) : []
	const router = useRouter()
	const [bookings, setBookings] = useState<BookingInfo[]>([])
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		const fetchBookings = async () => {
			try {
				const response = await axios.get("/api/bookings/my-bookings")
				if (response.data?.status && response.data?.data?.bookings) {
					setBookings(response.data.data.bookings)
				}
			} catch (error) {
				console.error("Error fetching bookings:", error)
			} finally {
				setLoading(false)
			}
		}
		fetchBookings()
	}, [])

	const getTicketTokenForEvent = (eventId: string): string | null => {
		const booking = bookings.find((b) => b.eventId === eventId)
		return booking?.qrCodeToken || null
	}

	const handleViewTicket = (eventId: string, e: React.MouseEvent) => {
		e.stopPropagation()
		const token = getTicketTokenForEvent(eventId)
		if (token) {
			router.push(`/ticket/${token}`)
		}
	}

	const handleEventClick = (event: IEvent) => {
		router.push(`/${event.slug}`)
	}

	return (
		<>
			<Head>
				<title>My Tickets - Jetzy Events</title>
				<meta name="description" content="View all events you've registered for or booked tickets." />
			</Head>
			<LightNavbar />
			<div className="min-h-screen bg-background-light">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
					<h1 className="text-3xl font-bold text-text-primary mb-6">My Tickets</h1>
					{data.length === 0 ? (
						<div className="text-center py-12 bg-white rounded-xl border border-gray-200">
							<p className="text-gray-500">You haven't booked any events yet.</p>
						</div>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
							{data.map((event) => {
								const ticketToken = getTicketTokenForEvent(event._id.toString())
								const { formattedDate, formattedMonth, formattedDay } = (() => {
									if (!event?.startsOn) return { formattedDate: "", formattedMonth: "", formattedDay: "" }
									const userTimeZone = event.timezone?.split(") ")[1] || event.timezone || "UTC"
									const date = dayjs.utc(event.startsOn).tz(userTimeZone)
									return {
										formattedDate: date.format("ddd, MMM D • hh:mm A"),
										formattedMonth: date.format("MMM"),
										formattedDay: date.format("D"),
									}
								})()

								const hasImage = event.images && event.images.length > 0 && event.images[0] && event.images[0].trim() !== ""

								return (
									<div
										key={event._id.toString()}
										onClick={() => handleEventClick(event)}
										className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer border border-border-light group flex flex-col h-full"
									>
										<div className="relative pt-[56.25%] bg-gray-200">
											{hasImage ? (
												<Image
													src={event.images[0]}
													alt={event.name}
													fill
													className="object-cover group-hover:scale-105 transition-transform duration-500"
												/>
											) : (
												<div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
													No Image
												</div>
											)}
										</div>
										<div className="p-4 flex flex-1 flex-col">
											<div className="flex gap-3">
												<div className="flex flex-col items-center justify-center w-12 h-12 bg-gray-100 rounded-lg flex-shrink-0 text-center">
													<span className="text-xs font-bold text-red-600 uppercase">{formattedMonth}</span>
													<span className="text-lg font-bold text-gray-900 leading-none">{formattedDay}</span>
												</div>
												<div className="flex-1">
													<p className="text-xs font-semibold text-text-secondary mb-1">{formattedDate}</p>
													<h3 className="text-lg font-bold text-text-primary mb-1 line-clamp-2 leading-tight group-hover:text-primary-purple transition-colors">
														<SafeHTML html={event.name} />
													</h3>
													<p className="text-sm text-text-muted line-clamp-1 mb-3">{event.location?.split(",")[0]}</p>
													{ticketToken && (
														<button
															onClick={(e) => handleViewTicket(event._id.toString(), e)}
															className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold px-4 py-2 rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-2 text-sm"
														>
															<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
																<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
															</svg>
															View Ticket
														</button>
													)}
												</div>
											</div>
										</div>
									</div>
								)
							})}
						</div>
					)}
				</div>
			</div>
			<Footer />
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
		console.error("[my-tickets] Error:", error)
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


import React, { useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/router"
import { IEvent } from "@/models/events/types"
import { ROUTES } from "@/configs/routes"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import LightNavbar from "../layout/LightNavbar"
import Footer from "../layout/Footer"
import { MapPinIcon, CalendarIcon, ChevronRightIcon, UserGroupIcon, TicketIcon } from "@heroicons/react/24/outline"
import { SparklesIcon, GlobeAltIcon, HeartIcon, SunIcon, MusicalNoteIcon, FireIcon } from "@heroicons/react/24/solid"

dayjs.extend(utc)
dayjs.extend(timezone)

interface EventCardProps {
	event: IEvent
	onClick: (event: IEvent) => void
}

const EventCard: React.FC<EventCardProps> = ({ event, onClick }) => {
	const { data: totals } = useQuery({
		queryKey: ["eventTotals", event._id],
		queryFn: () => axios.get(`/api/events/${event._id}/totals`),
	})

	const totalTickets = totals?.data?.totalTickets ?? 0
	const uniqueGuests = totals?.data?.uniqueGuests ?? 0

	const { formattedDate, formattedTime } = useMemo(() => {
		if (!event?.startsOn) return { formattedDate: "", formattedTime: "" }

		const userTimeZone = event.timezone?.split(") ")[1]
		const date = dayjs.utc(event.startsOn).tz(userTimeZone)

		const formattedDate = date.format("MMM D")
		const formattedTime = date.format("h:mm A")

		return { formattedDate, formattedTime }
	}, [event.startsOn, event.timezone])

	return (
		<div onClick={() => onClick(event)} className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer border border-border-light group">
			<div className="relative h-48 bg-gray-200">
				<Image src={event.images[0]} alt={event.name} fill className="object-cover" />
			</div>

			<div className="p-4">
				<h3 className="text-lg font-semibold text-text-primary mb-2 line-clamp-2">{event.name}</h3>

				<div className="space-y-2 mb-3">
					<div className="flex items-center gap-2 text-sm text-text-secondary">
						<CalendarIcon className="w-4 h-4" />
						<span>
							{formattedDate} • {formattedTime}
						</span>
					</div>

					<div className="flex items-center gap-2 text-sm text-text-secondary">
						<MapPinIcon className="w-4 h-4 flex-shrink-0" />
						<span className="line-clamp-1">{event.location}</span>
					</div>

					<div className="flex items-center gap-2 text-sm text-text-secondary">
						<UserGroupIcon className="w-4 h-4" />
						<span>
							{uniqueGuests} {uniqueGuests === 1 ? "person" : "people"}
						</span>
					</div>

					<div className="flex items-center gap-2 text-sm text-text-secondary">
						<TicketIcon className="w-4 h-4" />
						<span>
							{totalTickets} {totalTickets === 1 ? "ticket" : "tickets"}
						</span>
					</div>
				</div>
			</div>
		</div>
	)
}

const FeaturedEventCard: React.FC<{ event: IEvent; onClick: (event: IEvent) => void }> = ({ event, onClick }) => {
	const { data: totals } = useQuery({
		queryKey: ["eventTotals", event._id],
		queryFn: () => axios.get(`/api/events/${event._id}/totals`),
	})

	const totalTickets = totals?.data?.totalTickets ?? 0
	const uniqueGuests = totals?.data?.uniqueGuests ?? 0

	const { formattedDate } = useMemo(() => {
		if (!event?.startsOn) return { formattedDate: "" }
		const userTimeZone = event.timezone?.split(") ")[1]
		const date = dayjs.utc(event.startsOn).tz(userTimeZone)
		return { formattedDate: date.format("MMM D") }
	}, [event.startsOn, event.timezone])

	return (
		<div className="bg-white rounded-xl border border-border-light p-4 hover:shadow-md transition-all">
			<div className="flex gap-4">
				<div className="relative w-32 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200">
					<Image src={event.images[0]} alt={event.name} fill className="object-cover" />
				</div>

				<div className="flex-1 min-w-0">
					<h3 className="text-lg font-semibold text-text-primary mb-2 line-clamp-1">{event.name}</h3>
					<p className="text-sm text-text-secondary line-clamp-2 mb-3">{event.desc}</p>

					<div className="flex items-center gap-4 text-xs text-text-secondary">
						<span className="flex items-center gap-1">
							<CalendarIcon className="w-3 h-3" />
							{formattedDate}
						</span>
						<span className="flex items-center gap-1">
							<UserGroupIcon className="w-3 h-3" />
							{uniqueGuests} {uniqueGuests === 1 ? "person" : "people"}
						</span>
						<span className="flex items-center gap-1">
							<MapPinIcon className="w-3 h-3" />
							{event.location?.split(",")[0]}
						</span>
					</div>
				</div>

				<button onClick={() => onClick(event)} className="px-6 py-2 bg-primary-purple text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium h-fit">
					More Details
				</button>
			</div>
		</div>
	)
}

interface Category {
	name: string
	count: number
	icon: React.ReactNode
	color: string
}

const categories: Category[] = [
	{ name: "Dining", count: 127, icon: <SparklesIcon className="w-5 h-5" />, color: "text-category-dining" },
	{ name: "Nightlife", count: 47, icon: <MusicalNoteIcon className="w-5 h-5" />, color: "text-category-nightlife" },
	{ name: "Lifestyle", count: 92, icon: <HeartIcon className="w-5 h-5" />, color: "text-category-lifestyle" },
	{ name: "Travels", count: 88, icon: <GlobeAltIcon className="w-5 h-5" />, color: "text-category-travels" },
	{ name: "Entertainment", count: 26, icon: <FireIcon className="w-5 h-5" />, color: "text-category-entertainment" },
	{ name: "Activities", count: 105, icon: <SunIcon className="w-5 h-5" />, color: "text-category-activities" },
]

type EventListProps = {
	items: IEvent[]
	pagination: {
		total: number
		page: number
		showing: number
		limit: number
		totalPages: number
	}
}

const EventList: React.FC<EventListProps> = ({ items, pagination }) => {
	const router = useRouter()
	const [selectedLocation, setSelectedLocation] = useState("New York, NY")

	const handleEventClick = (event: IEvent): void => {
		router.push(ROUTES.eventDetails.replace("[slug]", event.slug))
	}

	// Split events into popular and featured
	const popularEvents = items.slice(0, 6)
	const featuredEvents = items.slice(6, 9)

	return (
		<div className="min-h-screen bg-background-light">
			<LightNavbar />

			<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				{/* Hero Section */}
				<div className="mb-8">
					<div className="flex justify-between items-start mb-4">
						<div>
							<h1 className="text-3xl font-bold text-text-primary mb-2">Find Events</h1>
							<p className="text-text-secondary">Find events happening nearby, search by category, or explore community calendars for more options.</p>
						</div>

						{/* Location Selector */}
						<div className="flex items-center gap-2 px-4 py-2 bg-white border border-border-light rounded-lg">
							<MapPinIcon className="w-5 h-5 text-text-secondary" />
							<select value={selectedLocation} onChange={(e) => setSelectedLocation(e.target.value)} className="text-sm text-text-primary bg-transparent border-none focus:outline-none cursor-pointer">
								<option>New York, NY</option>
								<option>Los Angeles, CA</option>
								<option>Chicago, IL</option>
								<option>Miami, FL</option>
								<option>San Francisco, CA</option>
							</select>
						</div>
					</div>
				</div>

				{/* Popular Events Section */}
				<section className="mb-12">
					<div className="flex justify-between items-center mb-6">
						<div>
							<h2 className="text-2xl font-bold text-text-primary">Popular Events</h2>
							<p className="text-text-secondary">{selectedLocation}</p>
						</div>
						<Link href="/" className="flex items-center gap-1 text-primary-purple hover:text-primary-dark font-medium text-sm">
							View All
							<ChevronRightIcon className="w-4 h-4" />
						</Link>
					</div>

					{popularEvents.length === 0 ? (
						<div className="text-center py-12 bg-white rounded-xl border border-border-light">
							<p className="text-text-secondary">No events found</p>
						</div>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
							{popularEvents.map((event) => (
								<EventCard key={event._id.toString()} event={event} onClick={handleEventClick} />
							))}
						</div>
					)}
				</section>

				{/* Filter by Category Section */}
				<section className="mb-12">
					<div className="flex justify-between items-center mb-6">
						<h2 className="text-2xl font-bold text-text-primary">Filter by Category</h2>
						<Link href="/" className="flex items-center gap-1 text-primary-purple hover:text-primary-dark font-medium text-sm">
							View All
							<ChevronRightIcon className="w-4 h-4" />
						</Link>
					</div>

					<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
						{categories.map((category) => (
							<button key={category.name} className="bg-white border border-border-light rounded-xl p-4 hover:shadow-md transition-all group">
								<div className={`${category.color} mb-2 group-hover:scale-110 transition-transform`}>{category.icon}</div>
								<h3 className="font-semibold text-text-primary text-sm mb-1">{category.name}</h3>
								<p className="text-text-secondary text-xs">{category.count} Events</p>
							</button>
						))}
					</div>
				</section>

				{/* Featured Events Section */}
				{featuredEvents.length > 0 && (
					<section className="mb-12">
						<div className="flex justify-between items-center mb-6">
							<div>
								<h2 className="text-2xl font-bold text-text-primary">Featured Events</h2>
								<p className="text-text-secondary">{selectedLocation}</p>
							</div>
						</div>

						<div className="space-y-4">
							{featuredEvents.map((event) => (
								<FeaturedEventCard key={event._id.toString()} event={event} onClick={handleEventClick} />
							))}
						</div>
					</section>
				)}

				{/* Pagination */}
				{pagination.totalPages > 1 && (
					<div className="flex justify-center items-center gap-4 mt-8">
						<button
							onClick={() => router.push(`/?page=${pagination.page - 1}`)}
							disabled={pagination.page <= 1}
							className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Previous
						</button>
						<span className="text-sm text-text-secondary">
							Page {pagination.page} of {pagination.totalPages}
						</span>
						<button
							onClick={() => router.push(`/?page=${pagination.page + 1}`)}
							disabled={pagination.page >= pagination.totalPages}
							className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Next
						</button>
					</div>
				)}
			</main>

			<Footer />
		</div>
	)
}

export default EventList

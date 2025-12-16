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
import { MapPinIcon, CalendarIcon, ChevronRightIcon, UserGroupIcon, TicketIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline"
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

	const uniqueGuests = totals?.data?.uniqueGuests ?? 0

	const { formattedDate, formattedMonth, formattedDay, formattedTime } = useMemo(() => {
		if (!event?.startsOn) return { formattedDate: "", formattedMonth: "", formattedDay: "", formattedTime: "" }

		const userTimeZone = event.timezone?.split(") ")[1]
		const date = dayjs.utc(event.startsOn).tz(userTimeZone)

		return {
			formattedDate: date.format("ddd, MMM D • h:mm A"),
			formattedMonth: date.format("MMM"),
			formattedDay: date.format("D"),
			formattedTime: date.format("h:mm A"),
		}
	}, [event.startsOn, event.timezone])

	return (
		<div onClick={() => onClick(event)} className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer border border-border-light group flex flex-col h-full">
			<div className="relative pt-[56.25%] bg-gray-200">
				<Image src={event.images[0]} alt={event.name} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
			</div>

			<div className="p-4 flex flex-1 flex-col">
				<div className="flex gap-3">
					{/* Date Badge */}
					<div className="flex flex-col items-center justify-center w-12 h-12 bg-gray-100 rounded-lg flex-shrink-0 text-center">
						<span className="text-xs font-bold text-red-600 uppercase">{formattedMonth}</span>
						<span className="text-lg font-bold text-gray-900 leading-none">{formattedDay}</span>
					</div>

					<div className="flex-1">
						<p className="text-xs font-semibold text-text-secondary mb-1">{formattedDate}</p>
						<h3 className="text-lg font-bold text-text-primary mb-1 line-clamp-2 leading-tight group-hover:text-primary-purple transition-colors">
							{event.name}
						</h3>
						<p className="text-sm text-text-muted line-clamp-1 mb-2">{event.location?.split(",")[0]}</p>
						
						<div className="flex items-center gap-1 text-xs text-text-secondary mt-auto">
							<span className="flex items-center">
								{uniqueGuests} interested
							</span>
						</div>
					</div>
				</div>
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
	const [activeCategory, setActiveCategory] = useState("All")

	const handleEventClick = (event: IEvent): void => {
		router.push(ROUTES.eventDetails.replace("[slug]", event.slug))
	}

	return (
		<div className="min-h-screen bg-[#F0F2F5]">
			<LightNavbar />

			<div className="flex flex-col lg:flex-row max-w-[1400px] mx-auto pt-4">
				{/* Left Sidebar - Navigation & Filters */}
				<aside className="lg:w-[360px] p-4 lg:sticky lg:top-20 lg:h-[calc(100vh-80px)] lg:overflow-y-auto hidden lg:block">
					<div className="mb-6">
						<h1 className="text-2xl font-bold text-[#1C1E21] mb-4">Events</h1>
						
						{/* Search */}
						<div className="relative mb-4">
							<MagnifyingGlassIcon className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
							<input 
								type="text" 
								placeholder="Search events" 
								className="w-full pl-10 pr-4 py-2.5 bg-[#F0F2F5] border-none rounded-full focus:ring-0 text-sm"
							/>
						</div>

						{/* Menu Items */}
						<div className="space-y-1">
							<button className="w-full flex items-center gap-3 px-2 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 transition-colors">
								<div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white">
									<CalendarIcon className="w-5 h-5" />
								</div>
								<span className="font-semibold text-[#1C1E21]">Browse Events</span>
							</button>
							<button className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-200 transition-colors">
								<div className="w-9 h-9 rounded-full bg-gray-300 flex items-center justify-center text-gray-700">
									<UserGroupIcon className="w-5 h-5" />
								</div>
								<span className="font-medium text-[#1C1E21] text-sm">Your Events</span>
							</button>
						</div>
					</div>

					<div className="border-t border-gray-300 my-4 pt-4">
						<h3 className="font-semibold text-lg text-[#1C1E21] mb-2">Categories</h3>
						<div className="space-y-1">
							<button 
								onClick={() => setActiveCategory("All")}
								className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors ${activeCategory === 'All' ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-200'}`}
							>
								<div className={`w-9 h-9 rounded-full flex items-center justify-center ${activeCategory === 'All' ? 'bg-blue-100' : 'bg-gray-200'}`}>
									<SparklesIcon className="w-5 h-5" />
								</div>
								<span className="font-medium text-sm">All Events</span>
							</button>
							{categories.map((category) => (
								<button 
									key={category.name}
									onClick={() => setActiveCategory(category.name)}
									className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors ${activeCategory === category.name ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-200'}`}
								>
									<div className={`w-9 h-9 rounded-full flex items-center justify-center ${activeCategory === category.name ? 'bg-blue-100' : 'bg-gray-200'}`}>
										{category.icon}
									</div>
									<span className="font-medium text-sm">{category.name}</span>
								</button>
							))}
						</div>
					</div>
				</aside>

				{/* Main Content */}
				<main className="flex-1 p-4 lg:p-8">
					{/* Location Filter Mobile */}
					<div className="flex lg:hidden justify-between items-center mb-6">
						<h1 className="text-2xl font-bold text-[#1C1E21]">Events</h1>
						<div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg">
							<MapPinIcon className="w-4 h-4 text-gray-500" />
							<select 
								value={selectedLocation} 
								onChange={(e) => setSelectedLocation(e.target.value)} 
								className="text-sm bg-transparent border-none focus:outline-none"
							>
								<option>New York, NY</option>
								<option>Los Angeles, CA</option>
							</select>
						</div>
					</div>

					{/* Banner / Featured (Top Section) */}
					{items.length > 0 && (
						<div className="mb-8 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
							<div className="relative h-[250px] sm:h-[350px]">
								<Image src={items[0].images[0]} alt={items[0].name} fill className="object-cover" />
								<div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-6">
									<div className="text-white">
										<p className="text-red-400 font-bold uppercase tracking-wider mb-1 text-sm">Featured Event</p>
										<h2 className="text-3xl font-bold mb-2">{items[0].name}</h2>
										<p className="text-gray-200 mb-4 line-clamp-2 max-w-2xl">{items[0].desc}</p>
										<button 
											onClick={() => handleEventClick(items[0])}
											className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
										>
											View Details
										</button>
									</div>
								</div>
							</div>
						</div>
					)}

					{/* Events Grid */}
					<h2 className="text-xl font-bold text-[#1C1E21] mb-4">Upcoming Events</h2>
					
					{items.length === 0 ? (
						<div className="text-center py-12 bg-white rounded-xl border border-gray-200">
							<p className="text-gray-500">No events found in this category.</p>
						</div>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
							{items.map((event) => (
								<EventCard key={event._id.toString()} event={event} onClick={handleEventClick} />
							))}
						</div>
					)}

					{/* Pagination */}
					{pagination.totalPages > 1 && (
						<div className="flex justify-center items-center gap-4 mt-8 pb-8">
							<button
								onClick={() => router.push(`/?page=${pagination.page - 1}`)}
								disabled={pagination.page <= 1}
								className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								Previous
							</button>
							<span className="text-sm text-gray-600">
								Page {pagination.page} of {pagination.totalPages}
							</span>
							<button
								onClick={() => router.push(`/?page=${pagination.page + 1}`)}
								disabled={pagination.page >= pagination.totalPages}
								className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								Next
							</button>
						</div>
					)}
				</main>
			</div>
			
			<Footer />
		</div>
	)
}

export default EventList

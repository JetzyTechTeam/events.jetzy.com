import React, { useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { IEvent } from "@/models/events/types"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { CalendarIcon, MapPinIcon, ClockIcon } from "@heroicons/react/24/outline"
import { stripHTMLAndDecode } from "@/lib/helpers"

dayjs.extend(utc)
dayjs.extend(timezone)

type Props = {
	event: IEvent
}

const BookingEventCard: React.FC<Props> = ({ event }) => {
	const { formattedDate, formattedTime, month, day } = useMemo(() => {
		if (!event?.startsOn) return { formattedDate: "", formattedTime: "", month: "", day: "" }

		try {
			const userTimeZone = event?.timezone?.split(") ")[1] || event?.timezone || "UTC"
			const date = dayjs.utc(event.startsOn).tz(userTimeZone)

			return {
				formattedDate: date.format("ddd, MMM D, YYYY"),
				formattedTime: date.format("hh:mm A"),
				month: date.format("MMM").toUpperCase(),
				day: date.format("D")
			}
		} catch (error) {
			console.error("Error formatting date:", error)
			return { formattedDate: "", formattedTime: "", month: "", day: "" }
		}
	}, [event?.startsOn, event?.timezone])

	return (
		<Link href={`/console/bookings/${event._id}`}>
			<div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-all duration-200 cursor-pointer group h-full flex flex-col">
				{/* Top Section with Image and Date */}
				<div className="relative h-48 bg-gray-100">
					{event.images && event.images.length > 0 && event.images[0] && event.images[0].trim() !== "" ? (
						<Image
							src={event.images[0]}
							alt={stripHTMLAndDecode(event.name)}
							fill
							className="object-cover group-hover:scale-105 transition-transform duration-500"
						/>
					) : (
						<div className="w-full h-full flex items-center justify-center bg-gray-50 text-gray-400">
							No Image
						</div>
					)}
					{/* Floating Date Badge */}
					<div className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow-sm text-center min-w-[60px]">
						<div className="text-xs font-bold text-red-500 tracking-wide">{month}</div>
						<div className="text-xl font-bold text-gray-900 leading-none">{day}</div>
					</div>
				</div>

				{/* Content Section */}
				<div className="p-5 flex-1 flex flex-col">
					<h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2 group-hover:text-primary-purple transition-colors">
						{stripHTMLAndDecode(event.name)}
					</h3>

					<div className="space-y-2 mt-auto">
						<div className="flex items-center gap-2 text-sm text-gray-500">
							<ClockIcon className="w-4 h-4 flex-shrink-0" />
							<span>{formattedTime}</span>
						</div>

						{event.location && (
							<div className="flex items-center gap-2 text-sm text-gray-500">
								<MapPinIcon className="w-4 h-4 flex-shrink-0" />
								<span className="line-clamp-1">{event.location}</span>
							</div>
						)}
					</div>

					<div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
						<span className="text-sm font-medium text-primary-purple group-hover:underline">
							View Bookings
						</span>
						<div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-primary-purple group-hover:text-white transition-colors text-gray-400">
							<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
							</svg>
						</div>
					</div>
				</div>
			</div>
		</Link>
	)
}

export default BookingEventCard

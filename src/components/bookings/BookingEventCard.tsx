import React, { useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { IEvent } from "@/models/events/types"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

type Props = {
	event: IEvent
}

const BookingEventCard: React.FC<Props> = ({ event }) => {
	const { formattedDate, formattedTime } = useMemo(() => {
		if (!event?.startsOn) return { formattedDate: "", formattedTime: "" }

		try {
			const userTimeZone = event?.timezone?.split(") ")[1] || event?.timezone || "UTC"
			const date = dayjs.utc(event.startsOn).tz(userTimeZone)

			const formattedDate = date.format("ddd, MMM D")
			const formattedTime = date.format("h:mm A")

			return { formattedDate, formattedTime }
		} catch (error) {
			console.error("Error formatting date:", error)
			return { formattedDate: "", formattedTime: "" }
		}
	}, [event?.startsOn, event?.timezone])

	return (
		<div className="bg-white border border-border-light rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300 group">
			<div className="flex flex-col sm:flex-row gap-4 p-4">
				{/* Event Image */}
				<div className="relative w-full sm:w-32 h-32 flex-shrink-0 rounded-lg overflow-hidden bg-background-gray">
					{event.images && event.images.length > 0 ? (
						<Image src={event.images[0]} alt={event.name} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
					) : (
						<div className="w-full h-full flex items-center justify-center bg-background-gray">
							<svg className="w-12 h-12 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
								/>
							</svg>
						</div>
					)}
				</div>

				{/* Event Details */}
				<div className="flex-1 flex flex-col justify-between min-w-0">
					<div>
						<h3 className="text-lg font-semibold text-text-primary group-hover:text-primary-purple transition-colors line-clamp-2 mb-2">{event.name}</h3>

						{/* Date and Time */}
						<div className="flex items-center gap-2 text-sm text-text-secondary mb-2">
							<svg className="w-4 h-4 text-primary-purple flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
							</svg>
							<span className="font-medium">
								{formattedDate} • {formattedTime}
							</span>
						</div>

						{/* Location */}
						{event.location && (
							<div className="flex items-start gap-2 text-sm text-text-secondary">
								<svg className="w-4 h-4 text-primary-purple flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
								</svg>
								<span className="line-clamp-1">{event.location}</span>
							</div>
						)}
					</div>
				</div>

				{/* Action Button */}
				<div className="flex items-center sm:items-start">
					<Link href={`/console/bookings/${event._id}`}>
						<button className="w-full sm:w-auto px-6 py-2.5 bg-primary-purple text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors duration-200 shadow-sm hover:shadow-md">
							View Bookings
						</button>
					</Link>
				</div>
			</div>
		</div>
	)
}

export default BookingEventCard

import { ROUTES } from "@Jetzy/configs/routes"
import { DeleteEventThunk, getEventState } from "@Jetzy/redux/reducers/eventsSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import { EventInterface } from "@Jetzy/types"
import Image from "next/image"
import Link from "next/link"
import React, { useMemo } from "react"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { stripHTMLAndDecode } from "@/lib/helpers"
import SafeHTML from "./SafeHTML"

dayjs.extend(utc)
dayjs.extend(timezone)

interface CardItem {
	id: string
	title: string
	imageUrl: string
	description: string
}

interface CardGroupProps {
	items: EventInterface[]
}

const CardGroup: React.FC<CardGroupProps> = ({ items }) => {
	const dispatcher = useAppDispatch()
	const { isLoading } = useAppSelector(getEventState)

	const handleDelete = (id: string) => dispatcher(DeleteEventThunk({ id }))

	const getFormattedDateTime = (item: EventInterface) => {
		if (!item?.startsOn) return { formattedDate: "", formattedTime: "" }

		try {
			const userTimeZone = item?.timezone?.split(") ")[1] || item?.timezone || "UTC"
			const date = dayjs.utc(item.startsOn).tz(userTimeZone)

			const formattedDate = date.format("MMM D, YYYY")
			const formattedTime = date.format("hh:mm A")

			return { formattedDate, formattedTime }
		} catch (error) {
			console.error("Error formatting date:", error)
			return { formattedDate: "", formattedTime: "" }
		}
	}

	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
			{items?.map((item) => {
				const { formattedDate, formattedTime } = getFormattedDateTime(item)

				return (
					<Link
						href={ROUTES.eventDetails.replace("[slug]", item?.slug)}
						key={item?._id.toString()}
						className="bg-white border border-border-light shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-shadow duration-300 group"
					>
						<div className="relative h-48 w-full overflow-hidden">
							{item?.images && item?.images.length > 0 && item?.images[0] && item?.images[0].trim() !== "" ? (
								<Image className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300" src={item?.images[0]} alt={stripHTMLAndDecode(item?.name)} width={512} height={512} />
							) : (
								<div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
									No Image
								</div>
							)}
						</div>
						<div className="p-4 space-y-2">
							<h3 className="text-lg font-semibold text-text-primary group-hover:text-primary-purple transition-colors line-clamp-2">{stripHTMLAndDecode(item?.name)}</h3>

							{/* Date and Time */}
							{formattedDate && (
								<div className="flex items-center text-sm text-text-secondary">
									<svg className="w-4 h-4 mr-2 text-primary-purple flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
									</svg>
									<span className="font-medium">
										{formattedDate} • {formattedTime}
									</span>
								</div>
							)}

							{/* Location */}
							{item.location && (
								<div className="flex items-center text-sm text-text-secondary">
									<svg className="w-4 h-4 mr-2 text-primary-purple flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
									</svg>
									<span className="line-clamp-1">{item.location}</span>
								</div>
							)}

							<div className="text-sm text-text-muted line-clamp-2">
								<SafeHTML html={item?.desc || ""} />
							</div>
						</div>
					</Link>
				)
			})}
		</div>
	)
}

export default CardGroup

import { ROUTES } from "@Jetzy/configs/routes"
import { DeleteEventThunk, getEventState } from "@Jetzy/redux/reducers/eventsSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import { EventInterface } from "@Jetzy/types"
import Image from "next/image"
import Link from "next/link"
import React from "react"
import { useSession } from "next-auth/react"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"

interface CardGroupProps {
	items: EventInterface[]
}

interface EventCardProps {
	item: EventInterface
	isAdmin: boolean
}

const EventCard: React.FC<EventCardProps> = ({ item, isAdmin }) => {
	const { data: totals } = useQuery({
		queryKey: ["eventTotals", item._id],
		queryFn: () => axios.get(`/api/events/${item._id}/totals`).then((r) => r.data),
		enabled: isAdmin,
	})
	const totalTickets = totals?.totalTickets ?? 0
	const uniqueGuests = totals?.uniqueGuests ?? 0
	const isPrivate = (item as any)?.privacy === "private"

	return (
		<div className="bg-[#1E1E1E] shadow-md rounded-lg overflow-hidden relative">
			<Link href={ROUTES.eventDetails.replace("[slug]", item?.slug)} className="block">
				<div className="relative h-48 w-full">
					{item?.images && item.images.length > 0 ? (
						<Image className="w-full h-full object-cover object-top" src={item.images[0]} alt={item?.name} width={512} height={512} />
					) : (
						<div className="w-full h-full bg-[#2A2D35] flex flex-col items-center justify-center gap-1">
							<span className="text-3xl">🖼️</span>
							<span className="text-xs text-gray-500">No image</span>
						</div>
					)}
					{/* Benefits Overlay */}
					{item?.benefits && item.benefits.trim() !== "" && (
						<div className="absolute top-3 left-3 z-10 flex flex-col gap-1 max-w-[80%]">
							{item.benefits
								.split(",")
								.map((b) => b.trim())
								.filter((b) => b !== "")
								.slice(0, 2)
								.map((benefit, index) => (
									<div
										key={index}
										className="bg-[#F79432] backdrop-blur-sm border border-white/10 rounded px-2 py-0.5 text-black text-[10px] font-bold shadow-sm"
									>
										{benefit}
									</div>
								))}
						</div>
					)}
					{/* Private badge */}
					{isAdmin && isPrivate && (
						<div className="absolute top-3 right-3 z-10 bg-[#7C1D1D] border border-red-500/40 rounded px-2 py-0.5 text-white text-[10px] font-bold shadow-sm">
							PRIVATE
						</div>
					)}
				</div>
				<div className="p-4">
					<h3 className="text-lg font-semibold">{item?.name}</h3>
					<p className="mt-2 text-sm truncate text-ellipsis overflow-hidden">{item?.desc}</p>
					{isAdmin && (
						<div className="mt-3 flex items-center gap-4 text-xs text-gray-300 border-t border-[#2A2A2A] pt-3">
							<span className="flex items-center gap-1">
								<span>🎟️</span>
								<span>{totalTickets} tickets</span>
							</span>
							<span className="flex items-center gap-1">
								<span>👥</span>
								<span>{uniqueGuests} guests</span>
							</span>
						</div>
					)}
				</div>
			</Link>
			{isAdmin && (
				<Link
					href={`/console/events/${item._id}/update`}
					onClick={(e) => e.stopPropagation()}
					className="absolute bottom-3 right-3 z-20 bg-[#3E3E3E] hover:bg-[#4E4E4E] text-white text-xs px-3 py-1.5 rounded-md transition-colors"
				>
					Edit
				</Link>
			)}
		</div>
	)
}

const CardGroup: React.FC<CardGroupProps> = ({ items }) => {
	const { data: session } = useSession()
	const role = (session?.user as any)?.role
	const isAdmin = role === "admin" || role === "super admin"

	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
			{items?.map((item) => (
				<EventCard key={item?._id.toString()} item={item} isAdmin={isAdmin} />
			))}
		</div>
	)
}

export default CardGroup

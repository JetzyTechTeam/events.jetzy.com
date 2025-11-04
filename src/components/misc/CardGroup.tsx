import { ROUTES } from "@Jetzy/configs/routes"
import { DeleteEventThunk, getEventState } from "@Jetzy/redux/reducers/eventsSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import { EventInterface } from "@Jetzy/types"
import Image from "next/image"
import Link from "next/link"
import React from "react"

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

	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
			{items?.map((item) => (
				<Link
					href={ROUTES.eventDetails.replace("[slug]", item?.slug)}
					key={item?._id.toString()}
					className="bg-white border border-border-light shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-shadow duration-300 group"
				>
					<div className="relative h-48 w-full overflow-hidden">
						<Image className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300" src={item?.images[0]} alt={item?.name} width={512} height={512} />
					</div>
					<div className="p-4">
						<h3 className="text-lg font-semibold text-text-primary group-hover:text-primary-purple transition-colors line-clamp-2">{item?.name}</h3>
						<p className="mt-2 text-sm text-text-muted line-clamp-3">{item?.desc}</p>
					</div>
				</Link>
			))}
		</div>
	)
}

export default CardGroup

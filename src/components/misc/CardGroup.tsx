import { ROUTES } from "@Jetzy/configs/routes"
import { DeleteEventThunk, getEventState } from "@Jetzy/redux/reducers/eventsSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import { EventInterface } from "@Jetzy/types"
import { ArrowTopRightOnSquareIcon, PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline"
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
		<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
			{items?.map((item) => (
				<Link href={ROUTES.eventDetails.replace("[slug]", item?.slug)} key={item?._id.toString()} className="bg-white shadow-md rounded-lg overflow-hidden relative">
					<Image className="w-full h-48 object-cover object-top" src={item?.images[0]} alt={item?.name} width={512} height={512} />
					<div className="p-4">
						<h3 className="text-lg font-semibold text-gray-800">{item?.name}</h3>
						<p className="mt-2 text-sm text-gray-600 truncate text-ellipsis overflow-hidden mb-10">{item?.desc}</p>
					</div>
				</Link>
			))}
		</div>
	)
}

export default CardGroup

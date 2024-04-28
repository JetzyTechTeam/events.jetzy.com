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
        <div key={item?._id} className="bg-white shadow-md rounded-lg overflow-hidden relative">
          <Image className="w-full h-48 object-cover object-center" src={item?.image} alt={item?.name} width={512} height={512} />
          <div className="p-4">
            <h3 className="text-lg font-semibold text-gray-800">{item?.name}</h3>
            <p className="mt-2 text-sm text-gray-500">Date: {item?.datetime}</p>
            <p className="mt-2 text-sm text-gray-600 truncate text-ellipsis overflow-hidden mb-10">{item?.desc}</p>
          </div>
          <div className="absolute top-auto bottom-0 left-0 right-0 flex items-center justify-center divide-x">
            {/* Delete event button */}
            <button onClick={() => handleDelete(item?.slug)} disabled={isLoading} className="p-3 bg-app hover:bg-red-800 text-white w-full flex gap-1 items-center ">
              <TrashIcon className="h-5 w-5" /> {isLoading ? <em>Deleting...</em> : "Delete"}
            </button>

            {/* Edit event button  */}
            <Link href={ROUTES.dashboard.events.edit?.replace(":slug", item?.slug)} className="p-3 bg-app hover:bg-purple-800 text-white w-full flex gap-1 items-center">
              <PencilSquareIcon className="h-5 w-5" /> Edit
            </Link>

            {/* preview event button */}
            <Link href={ROUTES.events.fetch?.replace(":slug", item?.slug)} className="p-3 bg-app hover:bg-blue-800 text-white w-full flex gap-1 items-center" target="_blank">
              <ArrowTopRightOnSquareIcon className="h-5 w-5" /> Preview
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}

export default CardGroup

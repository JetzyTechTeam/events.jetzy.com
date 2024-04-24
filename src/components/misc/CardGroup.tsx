import { DeleteEventThunk, getEventState } from "@Jetzy/redux/reducers/eventsSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import { EventInterface } from "@Jetzy/types"
import Image from "next/image"
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
            <p className="mt-2 text-sm text-gray-500">
              Date: {new Date(item?.datetime)?.toDateString()} {new Date(item?.datetime).toLocaleTimeString()}
            </p>
            <p className="mt-2 text-sm text-gray-600 truncate text-ellipsis overflow-hidden mb-10">{item?.desc}</p>
          </div>
          <div className=" absolute top-auto bottom-0 left-0 right-0">
            <button onClick={() => handleDelete(item?.slug)} disabled={isLoading} className="p-3 bg-app hover:bg-red-800 text-white w-full ">
              {isLoading ? <em>Deleting...</em> : "Delete Event"}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export default CardGroup

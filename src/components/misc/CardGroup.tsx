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
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {items?.map((item) => (
        <div key={item?._id} className="bg-white shadow-md rounded-lg overflow-hidden">
          <Image className="w-full h-48 object-cover object-center" src={item?.image} alt={item?.name} width={512} height={512} />
          <div className="p-4">
            <h3 className="text-lg font-semibold text-gray-800">{item?.name}</h3>
            <p className="mt-2 text-sm text-gray-500">
              Date: {new Date(item?.datetime)?.toDateString()} {new Date(item?.datetime).toLocaleTimeString()}
            </p>
            <p className="mt-2 text-sm text-gray-600 truncate text-ellipsis overflow-hidden">{item?.desc}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export default CardGroup

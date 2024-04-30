import { ROUTES } from "@Jetzy/configs/routes"
import { DOLLAR_SIGN } from "@Jetzy/lib/currency"
import { formatNumber } from "@Jetzy/lib/utilities"
import { DeleteEventThunk, getEventState } from "@Jetzy/redux/reducers/eventsSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import { EventInterface } from "@Jetzy/types"
import Image from "next/image"
import Link from "next/link"
import React from "react"

interface EventListingProps {
  items: EventInterface[]
}

const EventListing: React.FC<EventListingProps> = ({ items }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {items?.map((item) => (
        <div key={item?._id} className="bg-white shadow-md rounded-lg overflow-hidden relative">
          <Image className="w-full h-48 object-cover object-center" src={item?.image} alt={item?.name} width={512} height={512} />
          <div className="p-4">
            <h3 className="text-md font-bold text-gray-800">
              <Link href={ROUTES.events.fetch?.replace(":slug", item?.slug)}>{item?.name}</Link>
            </h3>
            <p className="mt-2 text-[10px] text-gray-500 font-semibold">{item?.datetime}</p>
            <p className="mt-2 text-sm text-slate-800 font-semibold w-fit p-1 text-slate-100 px-2 mb-3 bg-gray-300 rounded-lg">{item?.isPaid ? `Ticket Price: ${DOLLAR_SIGN}${formatNumber(item?.amount)}` : "Free"}</p>
            <p className="mt-2 text-sm text-gray-600 truncate text-ellipsis overflow-hidden mb-10">{item?.desc}</p>
          </div>
          <div className="absolute top-auto bottom-0 left-0 right-0">
            <Link href={ROUTES.events.fetch?.replace(":slug", item?.slug)} className="p-3 bg-app hover:bg-app/80 text-white block text-center font-semibold w-full ">
              Show more
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}

export default EventListing

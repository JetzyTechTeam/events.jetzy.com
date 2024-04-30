import Layout from "@Jetzy/components/layout/Layout"
import { EventInfoLoader } from "@Jetzy/components/placeholders/loader"
import { databaseConfig } from "@Jetzy/configs/databaseConfig"
import { ROUTES } from "@Jetzy/configs/routes"
import { DOLLAR_SIGN } from "@Jetzy/lib/currency"
import { capitalizeEachWord, formatNumber } from "@Jetzy/lib/utilities"
import { formatDate, uniqueId } from "@Jetzy/lib/utils"
import { FetchEventThunk, getEventState } from "@Jetzy/redux/reducers/eventsSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import { ArrowTopRightOnSquareIcon, ArrowUturnUpIcon, LinkIcon, ShareIcon } from "@heroicons/react/24/outline"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/router"
import React from "react"

export default function EventsDetailsPage() {
  const router = useRouter()
  // Get the event slug
  const { slug } = router?.query

  const dispatcher = useAppDispatch()
  const { isFetching, data } = useAppSelector(getEventState)

  React.useEffect(() => {
    if (slug && typeof slug !== "undefined") {
      dispatcher(FetchEventThunk({ id: slug as string }))
    }
  }, [slug])

  // go back to the previous page
  const handleBack = () => router?.back()

  return (
    <Layout>
      {isFetching ? (
        <EventInfoLoader />
      ) : (
        <div className="mb-32  text-center lg:max-w-5xl lg:w-full lg:mb-0   lg:text-left relative z-10">
          {/* backward button */}
          <div className="mb-4">
            <button className="bg-app text-white p-2 rounded-md flex gap-2 " onClick={handleBack}>
              <ArrowUturnUpIcon className="h-5 w-5 rotate-[-90deg]" /> Back
            </button>
          </div>
          <section className="bg-slate-200 w-full text-slate-900 rounded-md">
            <div className="md:p-8 xs:p-4">
              {/* Image  */}
              <Image src={data?.image as string} alt={data?.name as string} width={800} height={400} className="rounded-md mb-4 m-auto block object-fill  w-full" />

              {data && <h1 className="text-2xl font-bold">{capitalizeEachWord(data?.name as string)}</h1>}
              <div className="grid xs:grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="p-2">
                  <p className="text-sm font-medium">{data && data?.datetime}</p>
                  <div className="mt-5">
                    <span className="bg-gray-300 text-slate-800 p-2 rounded-md font-bold">
                      {data?.isPaid ? "Ticket Price" : "Free"} {DOLLAR_SIGN}
                      {formatNumber(data?.amount as number)}
                    </span>
                  </div>
                </div>

                <div className="flex gap-4 xs:flex-col md:flex-row items-center justify-center">
                  {/* display action button like price of event if the event is paid, register button */}

                  {data?.externalUrl === "" && (
                    <div className="">
                      <Link href={ROUTES?.events?.bookTicket?.replace(":slug", data?.slug)} className="bg-app hover:bg-app/80 text-white p-2 rounded-2xl font-semibold">
                        Buy Ticket
                      </Link>
                    </div>
                  )}

                  {data?.externalUrl !== "" && (
                    <div className="">
                      <a href={`${data?.externalUrl}?ref=jetzy-events`} target="_blank" rel="noreferrer" className="bg-app hover:bg-app/80 text-white p-2 rounded-2xl block flex gap-2">
                        <ArrowTopRightOnSquareIcon className="h-5 w-5" /> Register
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <h1 className="text-sm text-gray-500 font-medium">Location</h1>
                <p className="md:text-2xl xs:text-md font-semibold">{data?.location}</p>
              </div>

              <div className="mb-4">
                <h1 className="text-sm text-gray-500 font-medium">Activities</h1>
                <p className="md:text-lg xs:text-md font-medium flex gap-4 py-2">
                  {data?.interest?.map((activity) => (
                    <span key={uniqueId()} className="p-1 px-2 bg-gray-300 text-slate-800 rounded-md">
                      {capitalizeEachWord(activity)}
                    </span>
                  ))}
                </p>
              </div>

              <div className="mb-4">
                <h1 className="text-sm text-gray-500 font-medium">About</h1>
                <p className="md:text-lg xs:text-md font-semibold leading-relaxed tracking-wide text-justify">{data?.desc}</p>
              </div>
            </div>
          </section>
        </div>
      )}
    </Layout>
  )
}

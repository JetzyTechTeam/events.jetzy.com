import Layout from "@Jetzy/components/layout/Layout"
import { databaseConfig } from "@Jetzy/configs/databaseConfig"
import { DOLLAR_SIGN } from "@Jetzy/lib/currency"
import { capitalizeEachWord, formatNumber } from "@Jetzy/lib/utilities"
import { formatDate } from "@Jetzy/lib/utils"
import { FetchEventThunk, getEventState } from "@Jetzy/redux/reducers/eventsSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import { ArrowTopRightOnSquareIcon, ArrowUturnUpIcon, LinkIcon, ShareIcon } from "@heroicons/react/24/outline"
import Image from "next/image"
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
        <Loader />
      ) : (
        <div className="mb-32  text-center lg:max-w-5xl lg:w-full lg:mb-0   lg:text-left">
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

              {data && <h1 className="text-3xl font-bold">{capitalizeEachWord(data?.name as string)}</h1>}
              <div className="grid xs:grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="">
                  <p className="text-lg font-medium">{data && data?.datetime}</p>
                </div>

                <div className="flex gap-4 xs:flex-col md:flex-row items-center justify-center">
                  {/* display action button like price of event if the event is paid, register button */}
                  <div className="">
                    <span className="bg-app text-white p-2 rounded-md">
                      {data?.isPaid ? "Paid Event" : "Free"} {DOLLAR_SIGN}
                      {formatNumber(data?.amount as number)}
                    </span>
                  </div>

                  {data?.externalUrl === "" && (
                    <div className="">
                      <button className="bg-app text-white p-2 rounded-md">Register</button>
                    </div>
                  )}

                  {data?.externalUrl !== "" && (
                    <div className="">
                      <a href={`${data?.externalUrl}?ref=jetzy-events`} target="_blank" rel="noreferrer" className="bg-app text-white p-2 rounded-3xl block flex gap-2">
                        <ArrowTopRightOnSquareIcon className="h-5 w-5" /> Regiser
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <h1 className="text-md text-gray-500">Event Location</h1>
                <p className="md:text-3xl xs:text-lg font-semibold">{data?.location}</p>
              </div>

              <div className="mb-4">
                <h1 className="text-md text-gray-500">Event Activities</h1>
                <p className="md:text-3xl xs:text-lg font-semibold">{data?.interest?.join(", ")}</p>
              </div>

              <div className="mb-4">
                <h1 className="text-md text-gray-500">About Event</h1>
                <p className="md:text-3xl xs:text-lg font-medium">{data?.desc}</p>
              </div>
            </div>
          </section>
        </div>
      )}
    </Layout>
  )
}

const Loader = () => {
  return (
    <div className="mb-32 text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:text-left">
      <section className="bg-gray-200 animate-pulse w-full text-gray-500 min-h-screen rounded">
        <div className="p-8">
          <div className="h-72 bg-gray-300 animate-pulse rounded-md mb-4 "></div>
          <div className="h-10 bg-gray-300 animate-pulse rounded-md mb-4"></div>
          <div className="grid md:grid-cols-2 xs:grid-cols-1 gap-4">
            <div className="h-10 bg-gray-300 animate-pulse rounded-md mb-2"></div>
            <div className="flex gap-8 items-center justify-center">
              <div className="h-10 w-10 bg-gray-300 animate-pulse rounded-3xl mb-2"></div>
              <div className="h-10 w-10 bg-gray-300 animate-pulse rounded-3xl mb-2"></div>
              <div className="h-10 w-10 bg-gray-300 animate-pulse rounded-md mb-2"></div>
            </div>
          </div>
          <div className="h-6 bg-gray-300 animate-pulse rounded-md mb-2"></div>
          {/* Info */}
          <div className="h-6 w-2/5 bg-gray-300 animate-pulse rounded-md mb-2"></div>
          <div className="h-6 w-2/4 bg-gray-300 animate-pulse rounded-md mb-2"></div>
          <div className="h-6 w-11/12 bg-gray-300 animate-pulse rounded-md mb-2"></div>
          <div className="h-6 w-2/5 bg-gray-300 animate-pulse rounded-md mb-2"></div>

          <div className="h-6 bg-gray-300 animate-pulse rounded-md mb-10"></div>
          <div className="h-6 bg-gray-300 animate-pulse rounded-md mb-10"></div>
          <div className="h-6 bg-gray-300 animate-pulse rounded-md mb-10"></div>
          <div className="h-6 bg-gray-300 animate-pulse rounded-md mb-10"></div>
          <div className="h-6 bg-gray-300 animate-pulse rounded-md mb-10"></div>
        </div>
      </section>
    </div>
  )
}

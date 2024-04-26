import Layout from "@Jetzy/components/layout/Layout"
import { FetchEventThunk, getEventState } from "@Jetzy/redux/reducers/eventsSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
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

  return (
    <Layout>
      <div className="mb-32  text-center lg:max-w-5xl lg:w-full lg:mb-0   lg:text-left">
        <section className="bg-slate-200 w-full text-slate-900">
          <div className="p-8">
            <h1 className="text-3xl font-bold">Event Title</h1>
            <p className="text-lg">Event Date</p>
            <p className="text-lg">Event Location</p>
            <p className="text-lg">Event Description</p>
          </div>
        </section>
      </div>

      <div className="mb-32 text-center lg:max-w-5xl lg:w-full lg:mb-0   lg:text-left">
        <section className="bg-gray-200 animate-pulse w-full text-gray-500">
          <div className="p-8">
            <div className="h-10 bg-gray-300 animate-pulse rounded-md mb-4"></div>
            <div className="h-6 bg-gray-300 animate-pulse rounded-md mb-2"></div>
            <div className="h-6 bg-gray-300 animate-pulse rounded-md mb-2"></div>
            <div className="h-6 bg-gray-300 animate-pulse rounded-md mb-10"></div>
          </div>
        </section>
      </div>
    </Layout>
  )
}

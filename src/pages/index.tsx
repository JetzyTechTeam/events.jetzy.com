import Image from "next/image"
import { Inter } from "next/font/google"
import Layout from "@Jetzy/components/layout/Layout"
import React from "react"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import { ListEventsThunk, getEventState } from "@Jetzy/redux/reducers/eventsSlice"
import { EventListingLoader } from "@Jetzy/components/placeholders/loader"
import CardGroup from "@Jetzy/components/misc/CardGroup"
import { EventInterface } from "@Jetzy/types"
import EventListing from "@Jetzy/components/misc/EventsListing"

export default function Home() {
  const { isFetching, dataList } = useAppSelector(getEventState)
  const dispatcher = useAppDispatch()

  React.useEffect(() => {
    // Dispatcher the event to fetch events list from the server
    dispatcher(ListEventsThunk())
  }, [])

  return <Layout>{isFetching ? <EventListingLoader /> : <EventListing items={dataList as EventInterface[]} />}</Layout>
}

import Layout from "@Jetzy/components/layout/Layout"
import { useRouter } from "next/router"
import React from "react"

export default function EventsDetailsPage() {
  const {} = useRouter()
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
    </Layout>
  )
}

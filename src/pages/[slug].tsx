import { Events } from "@/models/events"
import { IEvent } from "@/models/events/types"
import { GetServerSideProps } from "next"
import dynamic from "next/dynamic"
import React from "react"
const HostedEvents = dynamic(() => import("@Jetzy/components/HostedEvents"), { ssr: false }) // Import the HostedEvents component dynamically

type Props = {
	event: string
}
export default function EventDetailPage({ event }: Props) {
	const data = JSON.parse(event) as IEvent

	return <HostedEvents event={data} />
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	// let get the slug from the request params
	const { slug } = context.params

	if (!slug)
		// If the slug is not found, return a 404
		return {
			notFound: true,
		}

	// Get the event by slug
	const event = await Events.findOne({ slug: slug as string, isDeleted: false })
	if (!event) return { notFound: true } // If the event is not found, return a 404

	// compress the event data
	const eventData = JSON.stringify(event.toJSON())

	return {
		props: {
			event: eventData,
		},
	}
}

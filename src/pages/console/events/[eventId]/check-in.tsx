import React from "react"
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import CheckInPortal from "@/components/CheckInPortal"
import CheckInStats from "@/components/CheckInStats"
import { Pages } from "@/types"
import { GetServerSideProps } from "next"
import Head from "next/head"
import { authorizedOnly } from "@/lib/authSession"
import { Events } from "@/models/events"
import { IEvent } from "@/models/events/types"
import { Box, Container, Heading, Text, Alert, AlertIcon } from "@chakra-ui/react"
import { useRouter } from "next/router"

interface CheckInPageProps {
	event: string | null
}

export default function CheckInPage({ event }: CheckInPageProps) {
	const router = useRouter()
	const eventId = router.query.eventId as string

	if (!event) {
		return (
			<ConsoleLayout page={Pages.Manage}>
				<Alert status="error">
					<AlertIcon />
					Event not found
				</Alert>
			</ConsoleLayout>
		)
	}

	const eventData: IEvent = JSON.parse(event)

	return (
		<>
			<Head>
				<title>Check-In Portal - {eventData.name} | Jetzy Events</title>
				<meta name="description" content={`Check-in attendees for ${eventData.name}`} />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout page={Pages.Manage} maxW="max-w-7xl" backBtn={`/console/events/${eventId}/manage`}>
				<Container maxW="container.xl" py={8}>
					<CheckInStats eventId={eventData._id.toString()} />
					<CheckInPortal eventId={eventData._id.toString()} eventName={eventData.name} />
				</Container>
			</ConsoleLayout>
		</>
	)
}

export const getServerSideProps: GetServerSideProps = async (context) => {
	// Check if user is authorized
	const authResult = await authorizedOnly(context)
	// @ts-ignore
	if (authResult.redirect) {
		return authResult
	}

	const { eventId } = context.params || {}

	if (!eventId) {
		return {
			props: {
				event: null,
			},
		}
	}

	try {
		// Fetch the event
		const event = await Events.findById(eventId).lean()

		if (!event) {
			return {
				props: {
					event: null,
				},
			}
		}

		return {
			props: {
				event: JSON.stringify({
					...event,
					_id: event._id.toString(),
				}),
			},
		}
	} catch (error) {
		console.error("Error fetching event:", error)
		return {
			props: {
				event: null,
			},
		}
	}
}

import React from "react"
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import CheckInPortal from "@/components/CheckInPortal"
import CheckInStats from "@/components/CheckInStats"
import { Pages } from "@/types"
import { GetServerSideProps } from "next"
import Head from "next/head"
import { adminOnly } from "@/lib/authSession"
import { stripHTMLAndDecode } from "@/lib/helpers"
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
				<title>Check-In Portal - {stripHTMLAndDecode(eventData.name)} | Jetzy Events</title>
				<meta name="description" content={`Check-in attendees for ${stripHTMLAndDecode(eventData.name)}`} />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout page={Pages.Manage} maxW="max-w-7xl" backBtn={`/console/events/${eventId}/manage`}>
				<Box bg="#F5F5F7" minH="100vh" py={{ base: 4, md: 8 }}>
					<Container maxW="container.xl">
						<CheckInStats eventId={eventData._id.toString()} />
						<CheckInPortal eventId={eventData._id.toString()} eventName={eventData.name} />
					</Container>
				</Box>
			</ConsoleLayout>
		</>
	)
}

export const getServerSideProps: GetServerSideProps = async (context) => {
	// Check if user is admin/super admin
	const authResult = await adminOnly(context)
	if (!authResult || "redirect" in authResult) {
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
				session: authResult.props.session,
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

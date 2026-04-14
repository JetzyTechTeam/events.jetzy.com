import React from "react"
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import CheckInPortal from "@/components/CheckInPortal"
import CheckInStats from "@/components/CheckInStats"
import { Pages } from "@/types"
import { GetServerSideProps } from "next"
import { authorizedOnly } from "@/lib/authSession"
import { IEvent } from "@/models/events/types"
import { Box, Container, Heading, Text, Alert, AlertIcon, Spinner, Center } from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import { useRouter } from "next/router"

interface CheckInPageProps {
	event: string | null
}

export default function CheckInPage({ event }: CheckInPageProps) {
	const router = useRouter()
	const { eventId } = router.query

	const { data: eventData, isLoading, error } = useQuery({
		queryKey: ["event", eventId],
		queryFn: async () => {
			if (!eventId) return null;
			const response = await axios.get(`/api/events/${eventId}`)
			return response.data.data
		},
		initialData: event ? JSON.parse(event) : undefined,
		enabled: !!eventId && !event
	})

	if (isLoading) return <ConsoleLayout page={Pages.Manage}><Center h="50vh"><Spinner size="xl" /></Center></ConsoleLayout>

	if (error || !eventData) {
		return (
			<ConsoleLayout page={Pages.Manage}>
				<Alert status="error">
					<AlertIcon />
					Event not found or failed to load.
				</Alert>
			</ConsoleLayout>
		)
	}

	return (
		<ConsoleLayout page={Pages.Manage} maxW="max-w-7xl">
			<Container maxW="container.xl" py={8}>
				<CheckInStats eventId={eventData._id.toString()} />
				<CheckInPortal eventId={eventData._id.toString()} eventName={eventData.name} />
			</Container>
		</ConsoleLayout>
	)
}

export const getServerSideProps: GetServerSideProps = async (context) => {
	// Check if user is authorized
	const authResult = await authorizedOnly(context)
	// @ts-ignore
	if (authResult.redirect) {
		return authResult
	}

	return {
		props: {
			event: null,
		},
	}
}

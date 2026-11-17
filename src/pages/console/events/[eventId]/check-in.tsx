import React from "react"
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import CheckInPortal from "@/components/CheckInPortal"
import CheckInStats from "@/components/CheckInStats"
import WalkInTicketQR from "@/components/WalkInTicketQR"
import { useSession } from "next-auth/react"
import { isPendingAdminApproval } from "@/lib/event-approval"
import { getEventStatus } from "@/utils/eventSort"
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
	const { data: session } = useSession()

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

	const role = (session?.user as any)?.role
	const sessionUserId = (session?.user as any)?._id?.toString()
	const isAdmin = role === "admin" || role === "super admin"
	const canShowWalkInQR = isAdmin || (!!sessionUserId && eventData.ownerId?.toString() === sessionUserId)
	// A guest scanning must land on a page that will sell to them: not while the event awaits
	// review (guests are bounced), not a draft, not once it has ended (tickets are hidden).
	const salesOpen = !isPendingAdminApproval(eventData) && eventData.status !== "draft" && getEventStatus(eventData) !== "past"

	return (
		<ConsoleLayout page={Pages.Manage} maxW="max-w-7xl">
			{/* Phones: ConsoleLayout already insets 16px. This container and the portal each added
			    16px more, leaving the form 48px in from both edges of a 390px screen. */}
			<Container maxW="container.xl" py={8} sx={{ "@media screen and (max-width: 47.99em)": { paddingLeft: 0, paddingRight: 0, paddingTop: "4px", paddingBottom: "8px" } }}>
				<CheckInStats eventId={eventData._id.toString()} />
				<CheckInPortal eventId={eventData._id.toString()} eventName={eventData.name} />
				{/* Walk-in QR — whoever may run check-in for this event: an admin, or its host.
				    The link itself is public; the gate only keeps the card off the page for anyone
				    else who opens this URL (the check-in APIs already refuse them). */}
				{canShowWalkInQR && (
					<WalkInTicketQR
						slug={eventData.slug || eventData._id.toString()}
						eventName={eventData.name}
						salesOpen={salesOpen}
					/>
				)}
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

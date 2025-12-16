"use client"
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { authorizedOnly } from "@/lib/authSession"
import { Events } from "@/models/events"
import { GetServerSideProps } from "next"
import React from "react"
import Head from "next/head"
import { useRouter } from "next/router"
import DiscussionPostView from "@/components/events/DiscussionPostView"
import { Box, Button, Flex } from "@chakra-ui/react"
import { FiArrowLeft } from "react-icons/fi"

export default function DiscussionPostPage({ event }: any) {
	const eventData = JSON.parse(event)
	const router = useRouter()
	const { postId } = router.query

	return (
		<>
			<Head>
				<title>Discussion - {eventData.name} - Jetzy Events</title>
				<meta name="description" content={`Discussion for ${eventData.name}`} />
				<meta name="robots" content="noindex, nofollow" />
			</Head>

			<ConsoleLayout page="Discussion" backBtn={`/console/events/${eventData._id}/manage`} maxW="100%" bg="#F0F2F5">
				<Box maxW="1250px" mx="auto" px={{ base: 4, md: 6 }}>
					{/* Back Button */}
					<Button
						leftIcon={<FiArrowLeft />}
						variant="ghost"
						mb={4}
						onClick={() => router.push(`/console/events/${eventData._id}/manage`)}
						_hover={{ bg: "gray.100" }}
					>
						Back to Event
					</Button>

					{/* Discussion Post View */}
					{postId && <DiscussionPostView postId={postId as string} eventId={eventData._id} />}
				</Box>
			</ConsoleLayout>
		</>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	const session = await authorizedOnly(context)
	if (!session) return session

	// Ensure database connection is ready
	const { dbconn } = await import("@/configs/database")
	if (dbconn.readyState !== 1) {
		console.log("[console/events/discussion] Database not connected, attempting to connect...")
		await dbconn.asPromise()
	}

	const eventId = context.query.eventId as string
	if (!eventId) return { props: {} }

	const event = await Events.findOne({ _id: eventId, isDeleted: false })

	if (!event) return { props: {} }

	return {
		props: {
			event: JSON?.stringify(event),
		},
	}
}

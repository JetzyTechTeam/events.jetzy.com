import ConsoleLayout from "@Jetzy/components/layout/ConsoleLayout"
import CardGroup from "@Jetzy/components/misc/CardGroup"
import CardGroupLoader from "@Jetzy/components/placeholders/CardGroupLoader"
import { EventListingLoader } from "@Jetzy/components/placeholders/loader"
import { ROUTES } from "@Jetzy/configs/routes"
import { authorizedOnly } from "@Jetzy/lib/authSession"
import { ListEventsThunk, getEventState } from "@Jetzy/redux/reducers/eventsSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import { EventInterface, Pages } from "@Jetzy/types"
import { GetServerSideProps } from "next"
import Head from "next/head"
import { useSession } from "next-auth/react"
import Link from "next/link"
import React from "react"
import CreateEventModal from "@/components/events/CreateEventModal"
import { useDisclosure } from "@chakra-ui/react"

const CreateEventButton = ({ onClick }: { onClick: () => void }) => {
	return (
		<div className="md:w-full xs:w-fit flex justify-end">
			<button 
				onClick={onClick}
				className="px-6 py-2.5 font-semibold bg-primary-purple text-white rounded-lg hover:bg-primary-dark transition-colors shadow-sm"
			>
				Create Event
			</button>
		</div>
	)
}
export default function ConsoleDashboard() {
	const { isFetching, dataList } = useAppSelector(getEventState)
	const dispatcher = useAppDispatch()
	const { isOpen: isCreateModalOpen, onOpen: onCreateModalOpen, onClose: onCreateModalClose } = useDisclosure()

	const { data: session } = useSession()

	// @ts-ignore
	const admin = session?.user?.role === "admin"

	React.useEffect(() => {
		// Dispatcher the event to fetch events list from the server
		if (admin) {
			dispatcher(ListEventsThunk())
		}
	}, [admin])

	const handleEventCreated = () => {
		// Refresh events list
		dispatcher(ListEventsThunk())
		onCreateModalClose()
	}

	return (
		<>
			<Head>
				<title>Dashboard - Jetzy Events</title>
				<meta name="description" content="Manage your events, view bookings, and track your event performance on Jetzy." />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout page={Pages.Dasshboard} component={admin ? <CreateEventButton onClick={onCreateModalOpen} /> : <></>}>
				{!dataList?.length && !isFetching && (
					<div className="text-center py-12">
						<p className="text-text-muted text-lg">No events found.</p>
					</div>
				)}

				{/* Display the data listing  */}
				{isFetching ? <EventListingLoader /> : <CardGroup items={dataList as EventInterface[]} />}
			</ConsoleLayout>

			{/* Create Event Modal */}
			<CreateEventModal 
				isOpen={isCreateModalOpen} 
				onClose={onCreateModalClose} 
				onEventCreated={handleEventCreated}
			/>
		</>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	return authorizedOnly(context, { fetchEvents: true })
}

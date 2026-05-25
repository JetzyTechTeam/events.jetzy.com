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
import { useSession } from "next-auth/react"
import Link from "next/link"
import React from "react"

const CreateEventButton = () => {
	return (
		<div className="md:w-full xs:w-fit  flex justify-end">
			<Link href={ROUTES.dashboard.events.create} className="px-3 py-1.5 font-bold bg-app text-black rounded-3xl">
				Create Event
			</Link>
		</div>
	)
}
export default function ConsoleDashboard() {
	const { isFetching, dataList } = useAppSelector(getEventState)
	const dispatcher = useAppDispatch()

	const { data: session } = useSession();

	// @ts-ignore
	const role = session?.user?.role;
	const admin = role === "admin" || role === "super admin";

	React.useEffect(() => {
		// Detect mobile flow coordinates from session storage
		const lat = sessionStorage.getItem("user_lat");
		const long = sessionStorage.getItem("user_long");

		// Dispatcher the event to fetch events list from the server
		if (lat && long) {
			console.log("📍 [Console] Requesting location-based events...");
			dispatcher(ListEventsThunk({ lat: parseFloat(lat), long: parseFloat(long) }));
		} else {
			dispatcher(ListEventsThunk());
		}
	}, [])


	return (
		<ConsoleLayout page={Pages.Dasshboard} component={
			admin ?
				<CreateEventButton />
				: <></>
		}>
			{!dataList?.length && !isFetching && <p>No events found.</p>}

			{/* Display the data listing  */}
			{isFetching ? <EventListingLoader /> : <CardGroup items={dataList as EventInterface[]} />}
		</ConsoleLayout>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	return authorizedOnly(context, { fetchEvents: true })
}

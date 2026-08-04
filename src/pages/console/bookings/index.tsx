import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { authorizedOnly } from "@/lib/authSession"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { escapeRegExp } from "@/utils/text"
import { IBookings, IEvent } from "@/models/events/types"
import { Pages } from "@/types"
import { GetServerSideProps } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import React, { useState } from "react"
import { useRouter } from "next/router"
import { Input, Flex, Button } from "@chakra-ui/react"
import BookingTableEvents from "@/components/bookings/BookingEventsTable"


type Props = {
	events: IEvent[] | null
	pagination: {
		total: number
		page: number
		showing: number
		limit: number
		totalPages: number
	}
	search: string
}
export type Booking = {
	_id: string;
	bookingRef: string;
	eventId: string;
	tickets: { ticketId: string; quantity: number }[];
	status: string;
	customerName: string;
	customerEmail: string;
	customerPhone: string;
	total: number;
	createdAt: string;
	cancelledAt?: string | null;
	cancelledBy?: "guest" | "host" | "admin" | null;
	/** Stripe money state, minus the identifiers. Absent on free bookings. */
	payment?: {
		status?: string;
		amount?: number;
		currency?: string;
		authExpiresAt?: string | null;
		capturedAt?: string | null;
		canceledAt?: string | null;
	} | null;
};

export type Exportable = {
	booking: IBookings
	event: IEvent
	bookedTickets: string[]
}

export default function BookingsPage({ events, pagination, search }: Props) {
	const router = useRouter()
	const [searchInput, setSearchInput] = useState(search || "")

	React.useEffect(() => {
		setSearchInput(search || "")
	}, [search])

	const runSearch = () => {
		const q = searchInput.trim()
		router.push({ pathname: "/console/bookings", query: { ...(q ? { search: q } : {}), page: 1 } })
	}

	const clearSearch = () => {
		setSearchInput("")
		router.push({ pathname: "/console/bookings", query: { page: 1 } })
	}

	return (
		<ConsoleLayout page={Pages.Bookings}>
			<Flex gap={2} mb={4} px={2}>
				<Input
					placeholder="Search events by name or location..."
					value={searchInput}
					onChange={(e) => setSearchInput(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && runSearch()}
					bg="#1E1E1E"
					borderColor="#444444"
					color="white"
					_placeholder={{ color: "gray.400" }}
					maxW="450px"
				/>
				<Button bg="#F79432" color="black" _hover={{ bg: "#E68422" }} onClick={runSearch} px={6}>
					Search
				</Button>
				{search && (
					<Button variant="outline" colorScheme="orange" onClick={clearSearch}>
						Clear
					</Button>
				)}
			</Flex>

			{!events || events.length === 0 ? (
				<div>No events found.</div>
			) : (
				<BookingTableEvents events={events} pagination={pagination} search={search} />
			)}
		</ConsoleLayout>
	)
}
export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	await ensureDbConnected()
	//check if user is authorized
	const authResult = await authorizedOnly(context)
	if ('redirect' in authResult) return authResult

	const serverSession = await getServerSession(context.req, context.res, authOptions)
	const userRole = (serverSession?.user as any)?.role
	const userId = (serverSession?.user as any)?._id
	const isAdmin = userRole === "admin" || userRole === "super admin"
	const ownerFilter = isAdmin ? {} : { ownerId: userId }

	//pagination
	const limit = 10
	const page = context.query.page ? parseInt(context.query.page as string) : 1
	const skip = (page - 1) * limit

	// Optional search by event name or location (case-insensitive)
	const search = (context.query.search as string)?.trim() || ""
	const searchRegex = escapeRegExp(search)
	const searchFilter = search
		? { $or: [{ name: { $regex: searchRegex, $options: "i" } }, { location: { $regex: searchRegex, $options: "i" } }] }
		: {}
	const baseFilter = { isDeleted: false, ...ownerFilter, ...searchFilter }

	//fetch fields
	const events = await Events.find(
		baseFilter,
		{ _id: 1, name: 1, startsOn: 1, endsOn: 1 }
	)
		.sort({ startsOn: -1 })
		.skip(skip)
		.limit(limit)
		.lean(); // plain JS objects

	if (!events || events.length === 0) {
		return {
			props: {
				events: [],
				pagination: { total: 0, page, showing: 0, limit, totalPages: 0 },
				search,
			},
		};
	}


	//serialize _id and Dates
	const serializedEvents = events.map((e) => ({
		...e,
		_id: e._id.toString(),
		startsOn: e.startsOn?.toISOString() ?? null,
		endsOn: e.endsOn?.toISOString() ?? null,
	}));


	const total = await Events.countDocuments(baseFilter)


	//calculate page total and current page
	const totalPages = Math.ceil(total / limit)

	//pagination object
	const pagination = {
		total,
		page,
		showing: events.length,
		limit,
		totalPages,
	}

	return {
		props: {
			//bookings: JSON.stringify(data),
			events: serializedEvents,
			pagination,
			search,
			//exportable: JSON.stringify(exportable),
		},
	}
}

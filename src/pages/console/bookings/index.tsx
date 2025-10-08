import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { authorizedOnly } from "@/lib/authSession"
import { Events } from "@/models/events"
import { IBookings , IEvent} from "@/models/events/types"
import { Pages } from "@/types"
import { GetServerSideProps } from "next"
import React from "react"
import BookingTableEvents from "@/components/bookings/BookingEventsTable"


type Props={
	events : IEvent[] | null
	pagination :{
		total : number
		page: number 
		showing: number
		limit: number
		totalPages: number 
	}
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
	createdAt:string;
};

export type Exportable = {
	booking: IBookings
	event: IEvent
	bookedTickets: string[]
}

export default function BookingsPage({ events , pagination  }: Props) {
	if (!events) {
		return (
			<ConsoleLayout page={Pages.Bookings}> 
				<div>No bookings found</div>
			</ConsoleLayout>
			
		)
	}

	return (
		<ConsoleLayout page={Pages.Bookings}>
			
			<BookingTableEvents events={events} pagination={pagination}/>
		</ConsoleLayout>
	)
}
export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	//check if user is authorized
	const session = await authorizedOnly(context)
	if (!session) return session

	//pagination
	//const limit = 5
	const limit =10
	const page = context.query.page ? parseInt(context.query.page as string) : 1
	const skip = (page - 1) * limit



  //fetch fields
    const events = await Events.find(
    { isDeleted: false },
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
        },
        };
    }

	
  //serialize _id and Dates
    const serializedEvents = events.map((e) => ({
    ...e,
    _id: e._id.toString(),
    startsOn: e.startsOn.toISOString(),
    endsOn: e.endsOn.toISOString(),
    }));


	const total =await Events.countDocuments({isDeleted:false})


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
			events:serializedEvents,
			pagination,
			//exportable: JSON.stringify(exportable),
		},
	}
}

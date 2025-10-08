import { GetServerSideProps } from "next";
import ConsoleLayout from "@/components/layout/ConsoleLayout";
import BookingTableComponent from "@/components/bookings/BookingEventsDetailsTable";
import BookingFilters from "@/components/misc/bookingFilter";
import { Bookings } from "@/models/events/bookings";
import { Events } from "@/models/events";
import { Pages } from "@/types";
//import { Booking } from "..";
import { Booking } from ".";
import { authorizedOnly } from "@/lib/authSession"
import { Text,Flex,Button } from "@chakra-ui/react";
import { useRouter } from "next/router"

type Props = {
  bookings: Booking[];
  event: { _id: string; name: string; startsOn: string; endsOn: string };
  filters: { status?: string;  search?: string ;date?:string ; amount?:string; minTickets?:string;};
  exportable:any[];

};

export default function BookingsEventPage({ bookings, event, filters,exportable }: Props) {
  const router=useRouter()
  return (
    <ConsoleLayout page={Pages.Bookings}>
      <Flex align="center" justify="space-between" mb={4}>
        <Button 
          colorScheme="white" 
          variant="outline" 
          _hover={{bg: "orange"}}
          onClick={() => router.push("/console/bookings")}
        >
          ← Back to Events
        </Button>
      </Flex>
  
      <Text fontSize={20 } fontWeight="semibold"> 
        Event Name : {event.name}
      </Text>
      <Text fontSize={17} fontWeight="semibold">
        Starts on ({new Date(event.startsOn).toLocaleDateString()}) - Ends on ({new Date(event.endsOn).toLocaleDateString()})
      </Text>

      <BookingFilters eventId={event._id} initialFilters={filters} />

      <div className="overflow-auto mt-4 border rounded" style={{ maxHeight: "70vh" }}>
        <BookingTableComponent rows={bookings} exportable={exportable } />
      </div>
    </ConsoleLayout>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
    const session = await authorizedOnly(ctx)
    if (!session) return session

  const { eventId } = ctx.params as { eventId: string };
  const { status, date, search,amount, minTickets } = ctx.query;

  // Get the event doc
  const eventDoc = await Events.findById(eventId, {
    _id: 1,
    name: 1,
    startsOn: 1,
    endsOn: 1,
  }).lean();

  if (!eventDoc) return { notFound: true };

  
  const filter: any = { eventId };

  if (status && typeof status === "string") filter.status = status;

  if (date && typeof date === "string") {
  const selectedDate= new Date(date);
  const startOfDay = new Date(selectedDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay =new Date(selectedDate);

  endOfDay.setUTCHours(23, 59, 59, 999);
  filter.createdAt = { $gte: startOfDay, $lte: endOfDay };
}


  if (search && typeof search === "string") {
    filter.$or = [
      { customerName: { $regex: search, $options: "i" } },
      { customerEmail: { $regex: search, $options: "i" } },
    ];
  }
  if (amount && !isNaN(Number(amount))) {
  filter.total = { $gte: Number(amount) };
}

if (minTickets && !isNaN(Number(minTickets))) {
  filter["tickets.quantity"] = { $gte: Number(minTickets) };
}

  // query db 
  const bookings = await Bookings.find(filter, {
    bookingRef: 1,
    eventId: 1,
    tickets: 1,
    status: 1,
    customerName: 1,
    customerEmail: 1,
    customerPhone: 1,
    total: 1,
    createdAt:1,

  })
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  //exportable data for excel
const exportable = await Promise.all(
  bookings.map(async (b) => {
    
    const event = eventDoc;

    //get ticket summary
    const bookedTickets = b.tickets.map((t: any) => {
      return `Ticket ${t.ticketId.toString()} x ${t.quantity}`;
    });

    return {
    booking: {
      ...b,
      _id: b._id.toString(),
      eventId: b.eventId.toString(),
      createdAt: b.createdAt ? b.createdAt.toString() : "",
      tickets: bookedTickets,
    },
    event: {
      ...event,
      name:event.name,
      _id: event._id.toString(),
      startsOn: event.startsOn.toISOString(),
      endsOn: event.endsOn.toISOString(),
    },
    bookedTickets
    ,
  };
  })
);



  return {
    props: {
      event: {
        ...eventDoc,
        _id: eventDoc._id.toString(),
        startsOn: eventDoc.startsOn.toISOString(),
        endsOn: eventDoc.endsOn.toISOString(),
      },
      bookings: bookings.map((b) => ({
        ...b,
        _id: b._id.toString(),
          eventId: b.eventId.toString(),
        createdAt: b.createdAt ? b.createdAt.toString() : "",
        tickets: b.tickets.map((t: any) => ({
          ticketId: t.ticketId.toString(),
          quantity: t.quantity,
        })),
      })),
      exportable,
     // exportable: JSON.stringify(exportable),
      filters: {
        status: (status as string) || "",
        date: (date as string)  || "",
        search: (search as string) ||"",
        amount:(amount as string) ||"",
        minTickets: (minTickets as string) ||"",
      },
    },
  };
};

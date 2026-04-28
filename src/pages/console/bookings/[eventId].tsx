import { GetServerSideProps } from "next";
import ConsoleLayout from "@/components/layout/ConsoleLayout";
import BookingTableComponent from "@/components/bookings/BookingEventsDetailsTable";
import BookingFilters from "@/components/misc/bookingFilter";
import { Bookings } from "@/models/events/bookings";
import { Events } from "@/models/events";
import { CheckIn } from "@/models/checkIn";
import { ensureDbConnected } from "@/configs/database";
import { Pages } from "@/types";
import { Booking } from ".";
import { authorizedOnly } from "@/lib/authSession"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Text, Flex, Button } from "@chakra-ui/react";
import { useRouter } from "next/router"
import { Types } from "mongoose";

type Props = {
  bookings: Booking[];
  event: { _id: string; name: string; startsOn: string | null; endsOn: string | null };
  filters: { status?: string; search?: string; date?: string; amount?: string; minTickets?: string; checkedIn?: string };
  exportable: any[];
  checkInMap: Record<string, { checkedInCount: number; isFullyCheckedIn: boolean }>;
};

export default function BookingsEventPage({ bookings, event, filters, exportable, checkInMap }: Props) {
  const router = useRouter()
  return (
    <ConsoleLayout page={Pages.Bookings}>
      <Flex align="center" justify="space-between" mb={4}>
        <Button
          colorScheme="white"
          variant="outline"
          _hover={{ bg: "orange" }}
          onClick={() => router.push("/console/bookings")}
        >
          ← Back to Events
        </Button>
      </Flex>

      <Text fontSize={20} fontWeight="semibold">
        Event Name : {event.name}
      </Text>
      <Text fontSize={17} fontWeight="semibold">
        Starts on ({event.startsOn ? new Date(event.startsOn).toLocaleDateString() : "TBD"}) - Ends on ({event.endsOn ? new Date(event.endsOn).toLocaleDateString() : "TBD"})
      </Text>

      <BookingFilters eventId={event._id} initialFilters={filters} />

      <div className="overflow-auto mt-4 border rounded" style={{ maxHeight: "70vh" }}>
        <BookingTableComponent rows={bookings} exportable={exportable} checkInMap={checkInMap} />
      </div>
    </ConsoleLayout>
  );
}

export const getServerSideProps: GetServerSideProps<any, any> = async (ctx) => {
  await ensureDbConnected()
  const authResult = await authorizedOnly(ctx)
  if ('redirect' in authResult) return authResult

  const serverSession = await getServerSession(ctx.req, ctx.res, authOptions)
  const userRole = (serverSession?.user as any)?.role
  const userId = (serverSession?.user as any)?._id?.toString()
  const isAdmin = userRole === "admin" || userRole === "super admin"

  const { eventId } = ctx.params as { eventId: string };
  const { status, date, search, amount, minTickets, checkedIn } = ctx.query;

  // Get the event doc
  const eventDoc = await Events.findById(eventId, {
    _id: 1,
    name: 1,
    startsOn: 1,
    endsOn: 1,
    ownerId: 1,
  }).lean();

  if (!eventDoc) return { notFound: true };

  // Ownership check — non-admin can only view bookings for their own events
  if (!isAdmin && (eventDoc as any).ownerId?.toString() !== userId) {
    return { redirect: { destination: '/console/bookings', permanent: false } }
  }

  const filter: any = { eventId };

  if (status && typeof status === "string") filter.status = status;

  if (date && typeof date === "string") {
    const selectedDate = new Date(date);
    const startOfDay = new Date(selectedDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
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

  // Check-in filter: find booking IDs that have check-in records
  if (checkedIn === "yes" || checkedIn === "no") {
    const checkedInDocs = await CheckIn.find(
      { eventId: new Types.ObjectId(eventId), checkedInCount: { $gt: 0 } },
      { bookingId: 1 }
    ).lean();
    const checkedInIds = checkedInDocs.map((ci: any) => ci.bookingId);
    if (checkedIn === "yes") {
      filter._id = { $in: checkedInIds };
    } else {
      filter._id = { $nin: checkedInIds };
    }
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
    createdAt: 1,
  })
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  // Build check-in map for all returned bookings
  const bookingIds = bookings.map((b: any) => b._id);
  const checkInDocs = await CheckIn.find(
    { eventId: new Types.ObjectId(eventId), bookingId: { $in: bookingIds } },
    { bookingId: 1, checkedInCount: 1, isFullyCheckedIn: 1 }
  ).lean();
  const checkInMap: Record<string, { checkedInCount: number; isFullyCheckedIn: boolean }> = {};
  checkInDocs.forEach((ci: any) => {
    checkInMap[ci.bookingId.toString()] = {
      checkedInCount: ci.checkedInCount,
      isFullyCheckedIn: ci.isFullyCheckedIn,
    };
  });

  //exportable data for excel
  const exportable = await Promise.all(
    bookings.map(async (b: any) => {
      const event = eventDoc;
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
          name: event.name,
          _id: event._id.toString(),
          startsOn: event.startsOn?.toISOString() ?? null,
          endsOn: event.endsOn?.toISOString() ?? null,
          ownerId: event.ownerId?.toString() ?? null,
        },
        bookedTickets,
      };
    })
  );

  const { ownerId: _ownerId, ...eventForProps } = eventDoc as any

  return {
    props: {
      event: {
        ...eventForProps,
        _id: eventDoc._id.toString(),
        startsOn: eventDoc.startsOn?.toISOString() ?? null,
        endsOn: eventDoc.endsOn?.toISOString() ?? null,
      },
      bookings: bookings.map((b: any) => ({
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
      checkInMap,
      filters: {
        status: (status as string) || "",
        date: (date as string) || "",
        search: (search as string) || "",
        amount: (amount as string) || "",
        minTickets: (minTickets as string) || "",
        checkedIn: (checkedIn as string) || "",
      },
    },
  };
};

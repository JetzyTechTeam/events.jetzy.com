import { GetServerSideProps } from "next";
import ConsoleLayout from "@/components/layout/ConsoleLayout";
import BookingTableComponent from "@/components/bookings/BookingEventsDetailsTable";
import BookingFilters from "@/components/misc/bookingFilter";
import { Bookings } from "@/models/events/bookings";
import { Events } from "@/models/events";
import { CheckIn } from "@/models/checkIn";
import { ensureDbConnected } from "@/configs/database";
import { escapeRegExp } from "@/utils/text";
import { Pages } from "@/types";
import { Booking } from ".";
import { authorizedOnly } from "@/lib/authSession"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Text, Flex, Button, Tabs, TabList, Tab, TabPanels, TabPanel } from "@chakra-ui/react";
import { useRouter } from "next/router"
import { Types } from "mongoose";
import { useState } from "react";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { EventWaitingList } from "@/components/events/EventWaitingList";
import { ApprovalRequests } from "@/components/console/ApprovalRequests";
import { eventHasAnyApprovalTicket } from "@/lib/ticket-approval";
import { isPendingBooking } from "@/lib/booking-status";

type Props = {
  bookings: Booking[];
  // `requireApproval`, `tickets` and `questions` are what ApprovalRequests needs: whether the
  // tab exists at all, ticket names, and the guest's answers.
  event: { _id: string; name: string; startsOn: string | null; endsOn: string | null; requireApproval?: boolean; tickets?: any[]; questions?: any[] };
  filters: { status?: string; search?: string; date?: string; amount?: string; minTickets?: string; checkedIn?: string };
  exportable: any[];
  checkInMap: Record<string, { checkedInCount: number; isFullyCheckedIn: boolean }>;
  isAdmin: boolean;
};

export default function BookingsEventPage({ bookings, event, filters, exportable, checkInMap, isAdmin }: Props) {
  const router = useRouter()
  const [tabIndex, setTabIndex] = useState(0)
  const hasApprovalTickets = eventHasAnyApprovalTicket(event as any)

  // Same query key as ApprovalRequests, so the badge and the tab share one fetch and an
  // approve/decline there updates the count here.
  const { data: approvalBookings } = useQuery({
    queryKey: ["event-bookings", event._id],
    queryFn: async () => (await axios.post("/api/get-bookings", { eventId: event._id })).data || [],
    enabled: hasApprovalTickets,
  })
  const pendingApprovalCount = (approvalBookings as any[] | undefined)?.filter((b) => isPendingBooking(b)).length ?? 0

  // The Bookings table is server-rendered. Approving a request or a waiting-list entry
  // creates or changes a booking, so reload the props when the host comes back to it.
  const onTabChange = (index: number) => {
    if (index === 0 && tabIndex !== 0) router.replace(router.asPath, undefined, { scroll: false })
    setTabIndex(index)
  }

  const tabProps = {
    fontWeight: 500,
    fontSize: "16px",
    color: "#FFFFFF",
    borderTopRadius: "10px",
    px: 5,
    _selected: { bg: "#FFFFFF", color: "#0B0B0B", fontWeight: 700, borderColor: "#FFFFFF" },
  }

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

      <Tabs variant="line" index={tabIndex} onChange={onTabChange} mt={6}>
        <TabList borderBottom="2px solid #9C9C9C" overflowX="auto" overflowY="hidden">
          <Tab {...tabProps}>Bookings</Tab>
          <Tab {...tabProps}>Waiting List</Tab>
          {hasApprovalTickets && (
            <Tab {...tabProps}>
              Approvals
              {pendingApprovalCount > 0 && (
                <span className="ml-2 text-xs font-bold rounded-full px-2 py-0.5 bg-[#F79432] text-black">{pendingApprovalCount}</span>
              )}
            </Tab>
          )}
        </TabList>
        <TabPanels>
          <TabPanel px={0}>
            <BookingFilters eventId={event._id} initialFilters={filters} />

            <div className="overflow-auto mt-4 border rounded" style={{ maxHeight: "70vh" }}>
              <BookingTableComponent
                rows={bookings}
                exportable={exportable}
                checkInMap={checkInMap}
                isAdmin={isAdmin}
                // getServerSideProps already redirects anyone who is neither admin nor the
                // event's owner, so everyone who reaches this page may manage these bookings.
                canManage
                // Names for the edit dialog — a booking stores `ticketId` only. Already in
                // the props for the Approvals tab, so nothing extra is fetched.
                eventTickets={(event.tickets || []).map((t: any) => ({ _id: String(t._id), name: t.name }))}
                onDeleteSuccess={() => router.replace(router.asPath)}
                onCancelSuccess={() => router.replace(router.asPath)}
                onEditSuccess={() => router.replace(router.asPath)}
              />
            </div>
          </TabPanel>
          <TabPanel px={0}>
            <div className="bg-[#181818] rounded-xl p-3">
              <EventWaitingList eventId={event._id} eventName={event.name} />
            </div>
          </TabPanel>
          {hasApprovalTickets && (
            <TabPanel px={0}>
              <div className="bg-[#181818] rounded-xl p-3">
                <ApprovalRequests eventId={event._id} event={event} />
              </div>
            </TabPanel>
          )}
        </TabPanels>
      </Tabs>
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
    requireApproval: 1,
    tickets: 1,
    questions: 1,
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
    const searchRegex = escapeRegExp(search)
    filter.$or = [
      { customerName: { $regex: searchRegex, $options: "i" } },
      { customerEmail: { $regex: searchRegex, $options: "i" } },
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
    cancelledAt: 1,
    cancelledBy: 1,
    // Money state for the host, minus the Stripe identifiers — those never reach a browser.
    "payment.status": 1,
    "payment.amount": 1,
    "payment.currency": 1,
    "payment.authExpiresAt": 1,
    "payment.capturedAt": 1,
    "payment.canceledAt": 1,
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
          // Explicit fields only — the doc now also carries tickets/questions, which hold
          // ObjectIds that can't be serialized as props.
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

  // Tickets and questions hold ObjectIds and Dates; round-trip them through JSON so Next
  // accepts them as props.
  const { ownerId: _ownerId, tickets: rawTickets, questions: rawQuestions, ...eventForProps } = eventDoc as any

  return {
    props: {
      event: {
        ...eventForProps,
        _id: eventDoc._id.toString(),
        startsOn: eventDoc.startsOn?.toISOString() ?? null,
        endsOn: eventDoc.endsOn?.toISOString() ?? null,
        requireApproval: !!(eventDoc as any).requireApproval,
        tickets: JSON.parse(JSON.stringify(rawTickets || [])),
        questions: JSON.parse(JSON.stringify(rawQuestions || [])),
      },
      bookings: bookings.map((b: any) => ({
        ...b,
        _id: b._id.toString(),
        eventId: b.eventId.toString(),
        createdAt: b.createdAt ? b.createdAt.toString() : "",
        cancelledAt: b.cancelledAt ? b.cancelledAt.toISOString() : null,
        // Dates inside the payment sub-doc have to be serialized too or Next refuses the props.
        payment: b.payment
          ? {
            ...b.payment,
            authExpiresAt: b.payment.authExpiresAt ? b.payment.authExpiresAt.toISOString() : null,
            capturedAt: b.payment.capturedAt ? b.payment.capturedAt.toISOString() : null,
            canceledAt: b.payment.canceledAt ? b.payment.canceledAt.toISOString() : null,
          }
          : null,
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
      isAdmin,
    },
  };
};

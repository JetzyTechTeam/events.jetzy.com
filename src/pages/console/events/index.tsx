import { DateTimeSVG, LocationSVG } from "@/assets/icons";
import ConsoleLayout from "@/components/layout/ConsoleLayout";
import { authorizedOnly } from "@/lib/authSession";
import { useEdgeStore } from "@/lib/edgestore";
import { Events } from "@/models/events";
import { IEvent } from "@/models/events/types";
import { DeleteEventThunk } from "@/redux/reducers/eventsSlice";
import { useAppDispatch } from "@/redux/stores";
import { Pages, Roles } from "@/types";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Button,
  Heading,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import axios from "axios";
import { GetServerSideProps } from "next";
import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useRef, useState } from "react";
import { toast } from "react-toastify";

type Pagination = {
  total: number;
  page: number;
  showing: number;
  limit: number;
  totalPages: number;
};

type Props = {
  events: string;
  pagination: Pagination;
};

export default function EventsListing({ events, pagination }: Props) {
  const initialData = JSON.parse(events) as IEvent[];
  const [eventList, setEventList] = React.useState<IEvent[]>(initialData);
  const { data: session } = useSession();
  const router = useRouter();

  const handleEventRemoved = (removedEventId: string) => {
    setEventList((prevList) =>
      prevList.filter((event) => event._id.toString() !== removedEventId)
    );
  };

  // @ts-ignore
  if (session?.user?.role === Roles.USER) router.push("/console");

  return (
    <ConsoleLayout maxW="max-w-[800px]" className="px-0">
      <div className="max-w-[800px] mx-auto mb-5">
        <Heading as="h2" fontSize={28}>
          Events
        </Heading>
      </div>

      <div className="space-y-5 max-w-[800px] mx-auto">
        {!eventList.length && <p>No events found.</p>}

        {eventList.map((event) => (
          <ListingCard
            {...event}
            key={event.slug}
            onEventRemoved={handleEventRemoved}
          />
        ))}
      </div>
    </ConsoleLayout>
  );
}

const ListingCard = (
  props: IEvent & { onEventRemoved: (id: string) => void }
) => {
  const event = props;
  const dispatcher = useAppDispatch();
  const edgestore = useEdgeStore();
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const cancelRef = useRef(null);
  const [selectedEvent, setSelectedEvent] = useState<IEvent | null>(null);

  const handleRemove = (item: IEvent) => {
    setLoading(true);
    dispatcher(DeleteEventThunk({ id: item._id.toString() }))
      .then((res: any) => {
        // delete the images from edge store server
        if (item.images.length > 0) {
          item.images.forEach((image) => {
            edgestore.edgestore.publicFiles.delete({ url: image });
          });
        }
        toast.success("Event deleted successfully!");
        props.onEventRemoved(item._id.toString());
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const confirmDelete = (event: IEvent) => {
    setSelectedEvent(event);
    onOpen();
  };

  return (
    <>
      <div className="flex items-center justify-between bg-[#1E1E1E] rounded-xl p-5">
        {/* CONTENT SECTION  */}
        <div className="space-y-5">
          <Heading as="h3" fontSize={20}>
            {event.name}
          </Heading>
          <div className="space-y-2">
            <Text className="flex gap-x-2 text-[#A7A7A7]">
              <DateTimeSVG />
              <span>
                {new Date(event.startsOn?.toString()).toDateString()}{" "}
                {event.timezone}
              </span>
            </Text>
            <Text className="flex gap-x-2 text-[#A7A7A7]">
              <LocationSVG />
              <span>{event.location}</span>
            </Text>
          </div>
          <div className="flex items-center gap-x-3">
            <Link
              href={`/console/events/${event._id}/manage`}
              className="bg-[#3E3E3E] p-2 rounded-md text-sm"
            >
              Manage Event
            </Link>
            <Link
              href={`/console/events/${event._id}/update`}
              className="bg-[#3E3E3E] p-2 rounded-md text-sm"
            >
              Edit Event
            </Link>
            <div
              onClick={() => confirmDelete(event)}
              className={`w-max bg-[#351919] text-[#EC5E5E] p-2 rounded-md text-sm cursor-pointer ${
                loading ? "opacity-50 cursor-not-allowed" : ""
              }`}
              style={{ pointerEvents: loading ? "none" : "auto" }}
            >
              {loading ? "Deleting..." : "Delete Event"}
            </div>
          </div>
        </div>

        {/* IMAGE SECTION */}
        <Image
          src={event && event?.images[0]}
          alt={event.name}
          className="w-[180px] h-[150px] rounded-xl"
          width={180}
          height={150}
        />
      </div>

      <AlertDialog
        isOpen={isOpen}
        leastDestructiveRef={cancelRef}
        onClose={onClose}
      >
        <AlertDialogOverlay>
          <AlertDialogContent bg="#1E1E1E" border="1px solid #444">
            <AlertDialogHeader fontSize="lg" fontWeight="bold" color="white">
              Delete Event
            </AlertDialogHeader>

            <AlertDialogBody color="white">
              Are you sure you want to delete this event? This action cannot be
              undone.
            </AlertDialogBody>

            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={onClose}>
                Cancel
              </Button>
              <Button
                colorScheme="red"
                onClick={() => {
                  if (selectedEvent) {
                    handleRemove(selectedEvent);
                    onClose();
                  }
                }}
                ml={3}
                isLoading={loading}
              >
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<any, any> = async (
  context
) => {
  // check if user is authorized
  const session = await authorizedOnly(context);
  if (!session) return session;

  // lets paginate the events
  const limit = 20;
  const page = context.query.page ? parseInt(context.query.page as string) : 1;
  const skip = (page - 1) * limit;
  // fetch events
  const events = await Events.find({ isDeleted: false })
    .limit(limit)
    .skip(skip)
    .sort({ createdAt: -1 });
  if (!events) return { props: { events: [] } };

  // get total count of events
  const total = await Events.countDocuments({ isDeleted: false });
  // serialize the events
  const data = events.map((event) => event.toJSON());

  // calculate page total and current page
  const totalPages = Math.ceil(total / limit);

  // pagination object
  const pagination = {
    total,
    page,
    showing: data.length,
    limit,
    totalPages,
  };

  return {
    props: {
      events: JSON?.stringify(data),
      pagination,
    },
  };
};

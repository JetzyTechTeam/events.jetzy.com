import { DateTimeSVG, LocationSVG } from "@/assets/icons";
import ConsoleLayout from "@/components/layout/ConsoleLayout";
import { authorizedOnly } from "@/lib/authSession";
import { Events } from "@/models/events";
import { IEvent } from "@/models/events/types";
import { Pages } from "@/types";
import { Heading, Text } from "@chakra-ui/react";
import { GetServerSideProps } from "next";
import Image from "next/image";
import Link from "next/link";
import React from "react";

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
  const data = JSON.parse(events) as IEvent[];

  if (!data.length) return <p>No events found.</p>;
 
  return (
    <ConsoleLayout maxW="max-w-[800px]" className="px-0">
      <div className="max-w-[800px] mx-auto mb-5">
        <Heading as="h2" fontSize={28}>
          Events
        </Heading>
      </div>
      <div className="space-y-5 max-w-[800px] mx-auto">
        {data.map((event) => (
          <ListingCard {...event} key={event.slug} />
        ))}
      </div>
    </ConsoleLayout>
  );
}

const ListingCard = (props: IEvent) => {
  const event = props;
  return (
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
        <div className="space-x-3">
          <Link href="" className="bg-[#3E3E3E] p-2 rounded-md text-sm">
            Manage Event
          </Link>
          <Link href="" className="bg-[#3E3E3E] p-2 rounded-md text-sm">
            Edit Event
          </Link>
          <Link
            href=""
            className="bg-[#351919] text-[#EC5E5E] p-2 rounded-md text-sm"
          >
            Delete Event
          </Link>
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

import EventListing from "@/components/misc/EventsListing";
import { Events } from "@/models/events";
import { IEvent } from "@/models/events/types";
import { GetServerSideProps } from "next";
import { getServerSession } from "next-auth";
import dynamic from "next/dynamic";
import React from "react";
import { authOptions } from "./api/auth/[...nextauth]";

const HostedEvents = dynamic(() => import("@Jetzy/components/HostedEvents"), {
  ssr: false,
});

type Props = {
  events: string | null;
  pagination: {
    total: number;
    page: number;
    showing: number;
    limit: number;
    totalPages: number;
  };
};

export default function Home({ events, pagination }: Props) {
  const data = events ? (JSON.parse(events) as IEvent[]) : [];

  if (!events) return <div>No events found</div>;

  const { page, totalPages } = pagination;

  return <EventListing pagination={pagination} items={data} />;
}

export const getServerSideProps: GetServerSideProps<any, any> = async (
  context
) => {
  const session = await getServerSession(context.req, context.res, authOptions);

  // @ts-ignore
  // if (!session) {
  //   return {
  //     props: {
  //       events: JSON.stringify([]),
  //       pagination: {
  //         total: 0,
  //         page: 1,
  //         showing: 0,
  //         limit: 20,
  //         totalPages: 0,
  //       },
  //     },
  //   };
  // }

  // lets paginate the events
  const limit = 20;
  const page = context.query.page ? parseInt(context.query.page as string) : 1;
  const skip = (page - 1) * limit;
  // Get events
  const events = await Events.find({ isDeleted: false, privacy: "public" })
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  if (!events) return { props: { events: null, pagination: null } };

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
      events: JSON.stringify(data),
      pagination,
    },
  };
};

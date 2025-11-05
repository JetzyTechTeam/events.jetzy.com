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

  // Ensure database connection is ready
  const { dbconn } = await import("@/configs/database")
  if (dbconn.readyState !== 1) {
    console.log("[index] Database not connected, attempting to connect...")
    await dbconn.asPromise()
  }

  // lets paginate the events
  const limit = 20;
  const page = context.query.page ? parseInt(context.query.page as string) : 1;
  const skip = (page - 1) * limit;
  
  // Check if user is signed in
  const isSignedIn = !!session;
  
  // Define the query based on authentication status
  let query: any = { isDeleted: false, privacy: "public" };
  
  // If user is not signed in, only show "Chinese Mid-Autumn Rooftop Celebration"
  if (!isSignedIn) {
    query.name = "Chinese Mid-Autumn Rooftop Celebration";
  }
  
  // Get events based on authentication status
  const events = await Events.find(query)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  if (!events) return { props: { events: null, pagination: null } };

  // get total count of events based on authentication status
  const total = await Events.countDocuments(query);
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

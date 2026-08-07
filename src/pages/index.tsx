import EventListing from "@/components/misc/EventsListing";
import type { EventStatus } from "@/utils/eventSort";
import { IEvent } from "@/models/events/types";
import { GetServerSideProps } from "next";
import dynamic from "next/dynamic";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Spinner, Center } from "@chakra-ui/react";
import { getSession } from "next-auth/react";

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

export default function Home(props: Props) {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  // "" = All. Filtering is server-side (see api/events/index.ts) because the list is
  // server-paginated — narrowing on the client would leave the total and the pager
  // describing every event while showing a subset.
  const [status, setStatus] = React.useState<EventStatus | "">("");

  // The SSR payload is unfiltered and unsearched, so it may only stand in for the
  // unfiltered, unsearched first page. Using it under an active chip would paint every
  // event for a moment before the real query resolved.
  const isDefaultView = !search && !status;

  const { data, isLoading } = useQuery({
    queryKey: ["events", page, search, status],
    queryFn: async () => {
      const url = `/api/events?page=${page}${search ? `&search=${encodeURIComponent(search)}` : ""}${status ? `&status=${status}` : ""}`;
      const response = await axios.get(url);
      return response.data;
    },
    initialData: props.events && isDefaultView ? {
      data: JSON.parse(props.events) as IEvent[],
      pagination: props.pagination
    } : undefined,
    enabled: !props.events || !isDefaultView,
  });

  if (isLoading) return <Center h="100vh"><Spinner /></Center>;

  if (!data || !data.data) return <div>No events found</div>;

  const eventsData = data.data as IEvent[];
  const paginationData = data.pagination || {
    total: 0,
    page: 1,
    showing: 0,
    limit: 20,
    totalPages: 1
  };

  return (
    <EventListing
      pagination={paginationData}
      items={eventsData}
      onPageChange={setPage}
      search={search}
      onSearch={(q) => { setSearch(q); setPage(1); }}
      status={status}
      onStatusChange={(next) => { setStatus(next); setPage(1); }}
    />
  );
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
  const session = await getSession(context);
  const user = (session?.user as any) ?? {};
  const isSuperAdmin =
    user.role === 'super admin' ||
    user.name?.toLowerCase() === 'super admin' ||
    user.fullName?.toLowerCase() === 'super admin';

  // Admins have their own console; keep them off the public all-events home page.
  if (isSuperAdmin) {
    return { redirect: { destination: "/console/events", permanent: false } };
  }

  return {
    props: {
      isSuperAdmin,
      events: null,
      pagination: {
        total: 0,
        page: 1,
        showing: 0,
        limit: 20,
        totalPages: 0,
      },
    },
  };
};

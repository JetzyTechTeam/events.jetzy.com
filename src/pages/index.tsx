import EventListing from "@/components/misc/EventsListing";
import { IEvent } from "@/models/events/types";
import { GetServerSideProps } from "next";
import dynamic from "next/dynamic";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Spinner, Center } from "@chakra-ui/react";

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
  // Use props if available (SSR/fallback), otherwise fetch
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["events", page, search],
    queryFn: async () => {
      const url = `/api/events?page=${page}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
      const response = await axios.get(url);
      return response.data;
    },
    initialData: props.events && !search ? {
      data: JSON.parse(props.events) as IEvent[],
      pagination: props.pagination
    } : undefined,
    enabled: !props.events || !!search
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
    />
  );
}

export const getServerSideProps: GetServerSideProps<any, any> = async (
  context
) => {
  // Return empty props to bypass build-time DB connection issues
  // Data will be fetched on client side
  return {
    props: {
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

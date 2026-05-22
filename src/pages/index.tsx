import EventListing from "@/components/misc/EventsListing";
import { IEvent } from "@/models/events/types";
import { GetServerSideProps } from "next";
import dynamic from "next/dynamic";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Spinner, Center } from "@chakra-ui/react";
import { getSession } from "next-auth/react";
import Navbar from "@/components/misc/Navbar";

const HostedEvents = dynamic(() => import("@Jetzy/components/HostedEvents"), {
  ssr: false,
});

type Props = {
  isSuperAdmin: boolean;
  events: string | null;
  pagination: {
    total: number;
    page: number;
    showing: number;
    limit: number;
    totalPages: number;
  };
};

export default function Home({ isSuperAdmin, ...props }: Props) {
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
    enabled: isSuperAdmin && (!props.events || !!search),
  });

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-black flex flex-col">
        <Navbar hideEventNav />
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-5xl font-bold text-white mb-4 tracking-tight">Coming Soon</h1>
          <p className="text-gray-400 text-lg max-w-md">
            Something exciting is on the way. Stay tuned.
          </p>
        </div>
      </div>
    );
  }

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

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
  const session = await getSession(context);
  const user = (session?.user as any) ?? {};
  const isSuperAdmin =
    user.role === 'super admin' ||
    user.name?.toLowerCase() === 'super admin' ||
    user.fullName?.toLowerCase() === 'super admin';

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

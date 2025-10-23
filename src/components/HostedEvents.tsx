import React, { useEffect, useMemo, useState } from "react";
import EventCheckoutModel from "@Jetzy/components/EventCheckoutModel";
import { useWebShare } from "@Jetzy/hooks/useShare";
import Slider from "react-slick";
import { ChevronLeftSVG, ChevronRightSVG, DateTimeSVG, LocationSVG } from "@Jetzy/assets/icons";

import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

import EventTicketsComponent from "@/components/EventTicketsComponent";
import { IEvent } from "@/models/events/types";
import { Button, Image } from "@chakra-ui/react";
import { ShareIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Linkify from "linkify-react";
import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

const settings = {
  infinite: true,
  speed: 500,
  slidesToShow: 1,
  slidesToScroll: 1,
  autoplay: true,
  autoplaySpeed: 2000,
  arrow: true,
  nextArrow: (
    <CustomArrow>
      <ChevronRightSVG stroke="#fff" width={16} height={16} />
    </CustomArrow>
  ),
  prevArrow: (
    <CustomArrow>
      <ChevronLeftSVG stroke="#fff" width={16} height={16} />
    </CustomArrow>
  ),
};

type Props = {
  event: IEvent;
};

export default function HostedEvents({ event }: Props) {
  const [shareUrl, setShareUrl] = useState("");
  const [activeTab, setActiveTab] = useState<'bookings' | 'waiting-list'>('bookings');
  const { data: session } = useSession();

  // Validate event data early and safely
  const isValidEvent = event && event._id && event.name;

  const clonedEvent = useMemo(() => {
    if (!isValidEvent) {
      return null;
    }
    try {
      return structuredClone(event);
    } catch (error) {
      console.error('Error cloning event:', error);
      return null;
    }
  }, [event, isValidEvent]);

  const shareTitle = clonedEvent?.name || '';
  const shareDesc = clonedEvent?.desc || '';

  // @ts-ignore
  const isAdmin = session?.user?.role === "admin";

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShareUrl(window.location.href);
    }
  }, []);

  const sharer = useWebShare({
    title: shareTitle,
    text: shareDesc,
    url: shareUrl,
  });

  const { formattedDate, formattedTime } = useMemo(() => {
    if (!clonedEvent?.startsOn) return { formattedDate: '', formattedTime: '' }

    try {
      const userTimeZone = clonedEvent?.timezone?.split(') ')[1] || clonedEvent?.timezone || 'UTC'
      const date = dayjs.utc(clonedEvent.startsOn).tz(userTimeZone)

      const formattedDate = date.format('MMMM DD, YYYY') 
      const formattedTime = date.format('hh:mm A') 

      return { formattedDate, formattedTime }
    } catch (error) {
      console.error('Error formatting date:', error)
      return { formattedDate: '', formattedTime: '' }
    }
  }, [clonedEvent?.startsOn, clonedEvent?.timezone])

  // Add error boundary for event data - only show if event is truly invalid
  if (!isValidEvent || !clonedEvent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 to-indigo-900 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all">
          <div className="p-6 sm:p-8 text-center">
            <div className="mb-6">
              <svg className="w-16 h-16 mx-auto text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-4">Event Not Found</h1>
            <p className="text-gray-600 mb-6">We couldn&apos;t find the event you were looking for. Please try again or contact the event organizer for more information.</p>
            <button
              onClick={() => window.location.href = "/"}
              className="mt-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-full hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg"
            >
              See All Events
            </button>
          </div>
        </div>
      </div>
    )
  }

  try {
    return (
      <>
        <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-7">
        <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between">
         {isAdmin && <Link href='/' className="border border-[#434343] py-2 px-4 rounded-lg hover:border-white">Back</Link>}
         {isAdmin && <Link href={`/console/events/${clonedEvent._id}/update`} className="border border-[#434343] py-2 px-4 rounded-lg hover:border-white">Edit Event</Link>}
        </div>
        <div className="max-w-4xl mx-auto bg-[#4a49491e] border border-[#434343] backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all">
          {/* Banner Image */}
          <div className="relative p-3">
            {clonedEvent?.images && Array.isArray(clonedEvent.images) && clonedEvent.images.length > 1 ? (
              <Slider {...settings}>
                {clonedEvent.images.map((image, idx) => (
                  <div key={idx} className="!flex !items-center !justify-center w-full md:h-[335px] sm:h-52 bg-black rounded-xl">
                    <Image
                      src={image}
                      alt="Event Banner"
                      className="max-h-full max-w-full object-contain rounded-xl"
                    />
                  </div>
                ))}
              </Slider>
            ) : clonedEvent?.images && Array.isArray(clonedEvent.images) && clonedEvent.images.length === 1 ? (
              <div className="w-full md:h-[335px] sm:h-52 bg-black flex items-center justify-center rounded-xl">
                <Image
                  src={clonedEvent.images[0]}
                  alt="Event Banner"
                  className="max-h-full max-w-full object-contain rounded-xl"
                />
              </div>
            ) : (
              <div className="w-full md:h-[335px] sm:h-52 bg-gray-800 flex items-center justify-center rounded-xl">
                <p className="text-gray-400">No image available</p>
              </div>
            )}
          </div>

          {/* Content Section */}
          <div className="p-6 sm:p-8">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start mb-6 space-y-4 sm:space-y-0">
              <div className="text-center sm:text-left">
                <h2 className="text-3xl font-bold break-words overflow-wrap-anywhere">
                  {clonedEvent.name}
                </h2>
                <p className="text-sm sm:text-base mt-5 flex gap-x-2 text-[#bbbbbb] break-words">
                  <DateTimeSVG />
                  {formattedDate},{" "}
                  {formattedTime} {clonedEvent?.timezone || ""}
                </p>
                <p className="text-sm sm:text-base mb-5 flex gap-x-2 text-[#bbbbbb] break-words">
                  <LocationSVG />
                  <span className="break-words overflow-wrap-anywhere">{clonedEvent.location}</span>
                </p>

                <h3 className="text-sm sm:text-base font-semibold ">
                  Description</h3>
                  <EventDescription description={clonedEvent.desc} />
              </div>

              <div className="flex gap-x-3 sm:items-end">
              <button
                  onClick={() => sharer.share()}
                  className="bg-[#333333] border-[#474747] font-bold text-gray-700 p-2 whitespace-nowrap rounded-full"
                >
                  <ShareIcon className="w-6 h-6 text-white inline-block" />
                </button>

                <a
                  role="button"
                  href="#event-tickets"
                  className="bg-[#F79432] text-black font-bold px-6 py-3 whitespace-nowrap rounded-full transition-all transform hover:scale-105 shadow-lg text-sm"
                >
                 Get Tickets
                </a>
              </div>
            </div>
          </div>
        </div>


        {isAdmin && clonedEvent?._id && (
          <div className="max-w-4xl mx-auto mt-8">
            {/* Admin Tabs */}
            <div className="bg-[#5656561e] border border-[#434343] rounded-2xl shadow-2xl overflow-hidden">
              {/* Tab Headers */}
              <div className="flex border-b border-[#434343]">
                <button
                  onClick={() => setActiveTab('bookings')}
                  className={`flex-1 px-6 py-4 text-left font-semibold transition-colors ${
                    activeTab === 'bookings'
                      ? 'bg-[#F79432] text-black'
                      : 'text-white hover:bg-[#434343]'
                  }`}
                >
                  Bookings
                </button>
                <button
                  onClick={() => setActiveTab('waiting-list')}
                  className={`flex-1 px-6 py-4 text-left font-semibold transition-colors ${
                    activeTab === 'waiting-list'
                      ? 'bg-[#F79432] text-black'
                      : 'text-white hover:bg-[#434343]'
                  }`}
                >
                  Waiting List
                </button>
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {activeTab === 'bookings' && (
                  <EventBookings eventId={clonedEvent._id.toString()} />
                )}
                {activeTab === 'waiting-list' && (
                  <EventWaitingList eventId={clonedEvent._id.toString()} eventName={clonedEvent.name} />
                )}
              </div>
            </div>
          </div>
        )}

        {isAdmin && clonedEvent?._id && <GuestsList eventId={clonedEvent._id.toString()} />}

        {clonedEvent && <EventTicketsComponent event={clonedEvent} />}
      </div>
      {clonedEvent?.name && <EventCheckoutModel event={clonedEvent.name} />}
      </>
    );
  } catch (error) {
    console.error('Error in HostedEvents render:', error);
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 to-indigo-900 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all">
          <div className="p-6 sm:p-8 text-center">
            <div className="mb-6">
              <svg className="w-16 h-16 mx-auto text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-4">Something went wrong</h1>
            <p className="text-gray-600 mb-6">We encountered an error while loading the event. Please try refreshing the page.</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-full hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    );
  }
}

function CustomArrow(props: {
  className?: string;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const { className, onClick, children } = props;
  return (
    <div
      className={`absolute top-1/2 transform -translate-y-1/2 z-10 cursor-pointer ${
        className?.includes("slick-next") ? "right-4" : "left-4"
      }`}
      onClick={onClick}
    >
      <div className="p-2 bg-[#00000033] rounded-full w-max backdrop-blur-md">
        {children}
      </div>
    </div>
  );
}


function GuestsList({ eventId }: { eventId: string }) {
  const { data: guests, isLoading } = useQuery({
    queryKey: ["eventGuests", eventId],
    queryFn: () => axios.get(`/api/events/guests?eventId=${eventId}`)
  })

  return (
    <div className="max-w-4xl mx-auto bg-[#5656561e] border border-[#434343] rounded-2xl shadow-2xl overflow-hidden mt-8 py-3 px-6">
      <h3 className="text-lg font-semibold mb-4">Guests</h3>
      <ul className="space-y-3">
  {isLoading && (
    <li className="text-gray-400 text-sm">Loading guests...</li>
  )}

  {!isLoading && guests?.data?.data?.length === 0 && (
    <li className="text-gray-500 italic text-sm">No guests found for this event.</li>
  )}

  {guests?.data?.data && Array.isArray(guests.data.data) && guests.data.data.map((guest: { _id: string; name: string }) => (
    <li
      key={guest._id}
      className="flex items-center justify-between bg-[#2a2a2a] border border-[#3a3a3a] rounded-lg px-4 py-3 shadow-sm hover:bg-[#333] transition"
    >
      <div className="flex items-center gap-4">
        <div className="w-9 h-9 rounded-full bg-[#444] flex items-center justify-center text-white font-semibold uppercase">
          {guest.name.charAt(0)}
        </div>
        <span className="text-white font-medium">{guest.name}</span>
      </div>
    </li>
  ))}
</ul>
    </div>
  )
}
interface TicketInfo {
  ticketId: string;
  quantity: number;
  _id: string;
}

interface Booking {
  _id: string;
  bookingRef: string;
  tickets: TicketInfo[];
  status: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  subTotal: number;
  tax: number;
  total: number;
  createdAt: string;
}

function EventBookings({ eventId }: { eventId: string }) {
  const { data: bookings, isLoading } = useQuery({
    queryKey: ["eventBookings", eventId],
    queryFn: () => axios.get(`/api/events/${eventId}/event-bookings`),
  });

  const { data: totals, isLoading: totalsLoading } = useQuery({
    queryKey: ["eventTotals", eventId],
    queryFn: () => axios.get(`/api/events/${eventId}/totals`),
  });

  const { totalTickets, uniqueCustomers, cancelledTickets, cancelledGuests } = React.useMemo(() => {
    if (!totals?.data) return { totalTickets: 0, uniqueCustomers: 0, cancelledTickets: 0, cancelledGuests: 0 };

    return {
      totalTickets: totals.data.totalTickets || 0,
      uniqueCustomers: totals.data.uniqueGuests || 0,
      cancelledTickets: totals.data.cancelledTickets || 0,
      cancelledGuests: totals.data.cancelledGuests || 0,
    };
  }, [totals?.data]);

  return (
    <div>
      
      
      
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Bookings</h3>
        {!isLoading && !totalsLoading && (
          <div className="text-sm text-white">
            <div className="flex flex-col space-y-1">
              <div className="flex space-x-4">
                <span className="font-semibold text-white">Active Tickets:</span>
                <span className="text-green-400">{totalTickets}</span>
                <span className="font-semibold text-white">Active Customers:</span>
                <span className="text-green-400">{uniqueCustomers}</span>
              </div>
              {(cancelledTickets > 0 || cancelledGuests > 0) && (
                <div className="flex space-x-4">
                  <span className="font-semibold text-white">Cancelled Tickets:</span>
                  <span className="text-red-400">{cancelledTickets}</span>
                  <span className="font-semibold text-white">Cancelled Customers:</span>
                  <span className="text-red-400">{cancelledGuests}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>


      {isLoading && <p className="text-gray-300">Loading bookings...</p>}

      {!isLoading && bookings?.data?.length === 0 && (
        <p className="text-gray-300">No bookings found for this event.</p>
      )}

      {!isLoading &&
        bookings?.data && Array.isArray(bookings.data) &&
        bookings.data.map((booking: Booking) => (
          <div
            key={booking._id}
            className="border-b border-[#434343] py-4 last:border-b-0"
          >
            <p className="text-sm text-[#bbbbbb]">
              <span className="font-semibold text-white">Booking Ref:</span>{" "}
              {booking.bookingRef}
            </p>

            <p className="text-sm text-[#bbbbbb] mt-1">
              <span className="font-semibold text-white">Customer:</span>{" "}
              {booking.customerName}
            </p>
            <p className="text-sm text-[#bbbbbb] mt-1">
              <span className="font-semibold text-white">Email:</span>{" "}
              {booking.customerEmail}
            </p>
            <p className="text-sm text-[#bbbbbb] mt-1">
              <span className="font-semibold text-white">Phone:</span>{" "}
              {booking.customerPhone}
            </p>

            <p className="text-sm text-[#bbbbbb] mt-1">
              <span className="font-semibold text-white">Status:</span>{" "}
              {booking.status}
            </p>

            <p className="text-sm text-[#bbbbbb] mt-1">
              <span className="font-semibold text-white">Created:</span>{" "}
              {new Date(booking.createdAt).toLocaleString()}
            </p>

            <div className="mt-3">
              <p className="font-semibold text-white text-sm">Tickets:</p>
              <ul className="list-disc pl-5 mt-1 text-[#bbbbbb] text-sm">
                {booking.tickets.map((ticket) => (
                  <li key={ticket._id}>
                     Quantity:{" "}
                    <span className="text-white">{ticket.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center gap-6 text-sm mt-3 text-[#bbbbbb]">
              <p>
                <span className="font-semibold text-white">Subtotal:</span> ${booking.subTotal}
              </p>
              <p>
                <span className="font-semibold text-white">Tax:</span> ${booking.tax}
              </p>
              <p>
                <span className="font-semibold text-white">Total:</span> ${booking.total}
              </p>
            </div>
          </div>
        ))}
    </div>
  );
}


const linkifyOptions = {
  target: '_blank',
  className: 'text-orange-600 underline hover:text-orange-800',
};

function EventWaitingList({ eventId, eventName }: { eventId: string; eventName: string }) {
  const { data: waitingList, isLoading, refetch } = useQuery({
    queryKey: ["eventWaitingList", eventId],
    queryFn: () => axios.get(`/api/waiting-list/${eventId}`),
  });

  // Debug logging
  console.log("EventWaitingList Debug:", {
    eventId,
    isLoading,
    waitingList,
    dataLength: waitingList?.data?.data?.length
  });

  // Test API call directly
  React.useEffect(() => {
    const testApi = async () => {
      try {
        const response = await axios.get(`/api/waiting-list/${eventId}`);
        console.log("Direct API test result:", response.data);
      } catch (error) {
        console.error("Direct API test error:", error);
      }
    };
    testApi();
  }, [eventId]);

  const handleApprove = async (waitingListId: string) => {
    try {
      const response = await axios.post('/api/waiting-list/approve', {
        waitingListId,
        eventName,
      });
      
      if (response.data.status) {
        alert('User approved and notified successfully!');
        refetch();
      } else {
        alert('Failed to approve user');
      }
    } catch (error) {
      console.error('Error approving user:', error);
      alert('Failed to approve user');
    }
  };

  const handleRemove = async (waitingListId: string) => {
    if (!confirm('Are you sure you want to remove this user from the waiting list?')) {
      return;
    }

    try {
      const response = await axios.delete('/api/waiting-list/remove', {
        data: { waitingListId }
      });
      
      if (response.data.status) {
        alert('User removed from waiting list successfully!');
        refetch();
      } else {
        alert('Failed to remove user');
      }
    } catch (error) {
      console.error('Error removing user:', error);
      alert('Failed to remove user');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Waiting List</h3>
        {!isLoading && waitingList?.data?.data && (
          <div className="text-sm text-white">
            <span className="font-semibold text-white">
              Total: {waitingList.data.data.length} users
            </span>
          </div>
        )}
      </div>

      {isLoading && <p className="text-gray-300">Loading waiting list...</p>}

      {!isLoading && waitingList?.data?.data?.length === 0 && (
        <p className="text-gray-300">No users on waiting list.</p>
      )}

      {!isLoading &&
        waitingList?.data?.data && Array.isArray(waitingList.data.data) &&
        waitingList.data.data.map((user: any) => (
          <div
            key={user._id}
            className="border-b border-[#434343] py-4 last:border-b-0"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <p className="text-sm text-[#bbbbbb]">
                  <span className="font-semibold text-white">Name:</span>{" "}
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-sm text-[#bbbbbb] mt-1">
                  <span className="font-semibold text-white">Email:</span>{" "}
                  {user.email}
                </p>
                <p className="text-sm text-[#bbbbbb] mt-1">
                  <span className="font-semibold text-white">Phone:</span>{" "}
                  {user.phone}
                </p>
                <p className="text-sm text-[#bbbbbb] mt-1">
                  <span className="font-semibold text-white">Joined:</span>{" "}
                  {new Date(user.createdAt).toLocaleString()}
                </p>

                <div className="mt-3">
                  <p className="font-semibold text-white text-sm">Requested Tickets:</p>
                  <ul className="list-disc pl-5 mt-1 text-[#bbbbbb] text-sm">
                    {user.tickets.map((ticket: any, index: number) => (
                      <li key={index}>
                        {ticket.quantity} x {ticket.name} (${ticket.price} each)
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => handleApprove(user._id)}
                  className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleRemove(user._id)}
                  className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}

function EventDescription({ description }: { description: string }) {
  if (!description) return '';
  const lines = description.split('\n')

  return (
    <div className="text-sm sm:text-base text-[#bbbbbb] break-words overflow-wrap-anywhere">
      {lines.map((line, i) => (
        <p key={i} className="leading-[24px] mb-2 break-words overflow-wrap-anywhere">
          <Linkify options={linkifyOptions}>
            {line}
          </Linkify>
        </p>
      ))}
    </div>
  )
}

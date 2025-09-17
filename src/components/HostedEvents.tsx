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
  const { data: session } = useSession();

  const clonedEvent = useMemo(() => structuredClone(event), [event]);

  const shareTitle = clonedEvent.name;
  const shareDesc = clonedEvent.desc;

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

  const userTimeZone = clonedEvent.timezone?.split(') ')[1]
  const date = dayjs.utc(clonedEvent.startsOn).tz(userTimeZone)

  const formattedDate = date.format('MMMM DD, YYYY') 
  const formattedTime = date.format('hh:mm A') 

  return { formattedDate, formattedTime }
}, [clonedEvent.startsOn])

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
            {clonedEvent.images.length > 1 ? (
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
            ) : (
              <div className="w-full md:h-[335px] sm:h-52 bg-black flex items-center justify-center rounded-xl">
                <Image
                  src={clonedEvent.images[0]}
                  alt="Event Banner"
                  className="max-h-full max-w-full object-contain rounded-xl"
                />
              </div>
            )}
          </div>

          {/* Content Section */}
          <div className="p-6 sm:p-8">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start mb-6 space-y-4 sm:space-y-0">
              <div className="text-center sm:text-left">
                <h2 className="text-3xl font-bold">
                  {clonedEvent.name}
                </h2>
                <p className="text-sm sm:text-base mt-5 flex gap-x-2 text-[#bbbbbb]">
                  <DateTimeSVG />
                  {formattedDate},{" "}
                  {formattedTime} {clonedEvent?.timezone || ""}
                </p>
                <p className="text-sm sm:text-base mb-5 flex gap-x-2 text-[#bbbbbb]">
                  <LocationSVG />
                  {clonedEvent.location}
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


        {isAdmin && <EventBookings eventId={clonedEvent._id.toString()} /> }
        {isAdmin && <GuestsList eventId={clonedEvent._id.toString()} />}

        <EventTicketsComponent event={clonedEvent} />
      </div>
      <EventCheckoutModel event={clonedEvent.name} />
    </>
  );
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

  {guests?.data?.data?.map((guest: { _id: string; name: string }) => (
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
}

function EventBookings({ eventId }: { eventId: string }) {
  const { data: bookings, isLoading } = useQuery({
    queryKey: ["eventBookings", eventId],
    queryFn: () => axios.get(`/api/events/${eventId}/event-bookings`),
  });

const {  totalTickets , uniqueCustomers } = React.useMemo(() => {
    if (!bookings?.data)  return   { totalTickets: 0, uniqueCustomers: 0 };

    let ticketCount= 0;//# of tickets
    const customerSet = new Set<string>();//unique email to count number of customers

    bookings.data.forEach((booking: Booking) => {
      //increment for each ticket
      booking.tickets.forEach((ticket) => {

        ticketCount += ticket.quantity;
      });

      
      customerSet.add(booking.customerEmail);
    });

    return {   totalTickets: ticketCount, uniqueCustomers: customerSet.size};
  },   [bookings?.data]);

  return (
    <div className="max-w-4xl mx-auto bg-[#5656561e] border border-[#434343] rounded-2xl shadow-2xl overflow-hidden mt-8 py-3 px-6">
      
      
      
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Bookings</h3>
        {!isLoading && (
          <div className="text-sm text-white">
            <span className="mr-4 ">
              <span className="font-semibold   text-white ">Tickets:</span>{totalTickets}
            </span>
            <span>
              <span className="font-semibold text-white" >Customers:</span>  {uniqueCustomers}
            </span>
          </div>
        )}
      </div>


      {isLoading && <p className="text-gray-300">Loading bookings...</p>}

      {!isLoading && bookings?.data?.length === 0 && (
        <p className="text-gray-300">No bookings found for this event.</p>
      )}

      {!isLoading &&
        bookings?.data?.map((booking: Booking) => (
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

function EventDescription({ description }: { description: string }) {
  if (!description) return '';
  const lines = description.split('\n')

  return (
    <div className="text-sm sm:text-base text-[#bbbbbb]">
      {lines.map((line, i) => (
        <p key={i} className="leading-[24px] mb-2">
          <Linkify options={linkifyOptions}>
            {line}
          </Linkify>
        </p>
      ))}
    </div>
  )
}

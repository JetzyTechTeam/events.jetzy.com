import React from "react";
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
  const shareUrl = window.location.href;
  const shareTitle = event.name;
  const shareDesc = event.desc;

  const sharer = useWebShare({
    title: shareTitle,
    text: shareDesc,
    url: shareUrl,
  });

  return (
    <>
      <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-7">
        <div className="max-w-4xl mx-auto mb-6">
          <Link href='/' className="border border-[#434343] py-2 px-4 rounded-lg hover:border-white">Back</Link>
        </div>
        <div className="max-w-4xl mx-auto bg-[#4a49491e] border border-[#434343] backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all">
          {/* Banner Image */}
          <div className="relative p-3">
            {event.images.length > 1 ? (
              <Slider {...settings}>
                {event.images.map((image, idx) => (
                  <div key={idx}>
                    <Image
                      src={image}
                      alt="Event Banner"
                      className="w-full md:h-[335px] sm:h-52 object-cover object-top rounded-xl"
                    />
                  </div>
                ))}
              </Slider>
            ) : (
              <div>
                <Image
                  src={event.images[0]}
                  alt="Event Banner"
                  className="w-full md:h-[335px] sm:h-52 object-cover object-top rounded-xl"
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
                  {event.name}
                </h2>
                <p className="text-sm sm:text-base mt-5 flex gap-x-2 text-[#bbbbbb]">
                  <DateTimeSVG />
                  {new Date(event.startsOn.toString()).toDateString()}{" "}
                  {new Date(event.startsOn.toString()).toLocaleTimeString()} {event?.timezone || ""}
                </p>
                <p className="text-sm sm:text-base mb-5 flex gap-x-2 text-[#bbbbbb]">
                  <LocationSVG />
                  {event.location}
                </p>

                <h3 className="text-sm sm:text-base font-semibold ">
                  Description</h3>
                <p className="text-sm sm:text-base text-[#bbbbbb]">
                  {event.desc}
                </p>
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

        <GuestsList eventId={event._id.toString()} />

        <EventTicketsComponent event={event} />
      </div>
      <EventCheckoutModel />
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
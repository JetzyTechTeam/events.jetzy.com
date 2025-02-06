import EnhancedLayout from "@Jetzy/components/layout/EnhancedLayout";
import React from "react";
import Image from "next/image";
import EventPage from "@Jetzy/components/EventPage";
import EventDetails from "@Jetzy/components/EventDetails";
import EventCheckoutModel from "@Jetzy/components/EventCheckoutModel";
import { useWebShare } from "@Jetzy/hooks/useShare";
import Slider from "react-slick";
import { ChevronLeftSVG, ChevronRightSVG } from "@Jetzy/assets/icons";

import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

import SampleImage from "@Jetzy/assets/event-banners/event-1.jpeg";
import Event2 from "@Jetzy/assets/event-banners/event-2.jpeg";
import Event3 from "@Jetzy/assets/event-banners/event-3.jpeg";
import Event4 from "@Jetzy/assets/event-banners/event-4.jpg";
import Event5 from "@Jetzy/assets/event-banners/event-5.jpg";
import Event6 from "@Jetzy/assets/event-banners/event-6.jpg";
import Event7 from "@Jetzy/assets/event-banners/event-7.jpeg";
import Event8 from "@Jetzy/assets/event-banners/event-8.jpeg";

const images = [
  SampleImage,
  Event2,
  Event3,
  Event4,
  Event5,
  Event6,
  Event7,
  Event8,
];

const eventDetails = {
  title: `Nightingale Valentine's Soirée`,
  description:
    "Join us for an unforgettable evening of elegance, music, and connection at Nightingale, the most captivating Art Deco-inspired lounge in the city.",
  timestamp: "Saturday, February 15 · 4 - 11pm EST",
  location: "Nightingale, New York, NY 10007, United States",
  aboutEvent: `Welcome to the <strong>Nightingale Valentine's Soirée</strong>, an exclusive event designed to tantalize all five senses. Step into a world of rich colors, plush textures, and a nostalgic Art Deco ambiance that transports you to an era of elegance and grandeur.`,
};

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

export default function HostedEvents() {
  const shareUrl = window.location.href;
  const shareTitle = "Nightingale Valentine's Soirée";
  const shareDesc =
    "Join us for an unforgettable evening of elegance, music, and connection at Nightingale, the most captivating Art Deco-inspired lounge in the city.";

  const sharer = useWebShare({
    title: shareTitle,
    text: shareDesc,
    url: shareUrl,
  });

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-purple-900 to-indigo-900 py-8 px-4 sm:px-6 lg:px-7">
        {/* Main Container */}
        <div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all">
          {/* Banner Image */}
          <div className="relative">
            <Slider {...settings}>
              {images.map((image, idx) => (
                <div key={idx}>
                  <Image
                    src={image}
                    alt="Event Banner"
                    className="w-full md:h-96 sm:h-52 object-cover"
                  />
                </div>
              ))}
            </Slider>
          </div>

          {/* Content Section */}
          <div className="p-6 sm:p-8">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 space-y-4 sm:space-y-0">
              <div className="text-center sm:text-left">
                <p className="text-gray-600 text-sm sm:text-base mb-5">
                  {eventDetails.timestamp}
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-800">
                  {eventDetails.title}
                </h2>
                <p className="text-gray-600 text-sm sm:text-base">
                  {eventDetails.description}
                </p>
                {/* share button  */}
                <button
                  onClick={() => sharer.share()}
                  className="mt-6 bg-gradient-to-r opacity-50   from-purple-600 to-indigo-600 font-bold text-white px-6 py-3  whitespace-nowrap rounded-full hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg"
                >
                  Share this event
                </button>
              </div>
              <a
                role="button"
                href="#event-tickets"
                className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3  whitespace-nowrap rounded-full hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg"
              >
                Get Tickets
              </a>
            </div>

            {/* Details Section */}
            <div className="space-y-6">
              {/* Date and Time */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-lg text-gray-800">
                  Date and Time
                </h3>
                <p className="text-gray-600 mt-1">{eventDetails.timestamp}</p>
              </div>

              {/* Location */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-lg text-gray-800">
                  Location
                </h3>
                <p className="text-gray-600 mt-1">{eventDetails.location}</p>
              </div>

              {/* About Event */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-lg text-gray-800">
                  About this Event
                </h3>
                <EventDetails />
              </div>
            </div>
          </div>
        </div>

        <EventPage />
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

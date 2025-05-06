import React from "react"
import EventDetails from "@Jetzy/components/EventDetails"
import EventCheckoutModel from "@Jetzy/components/EventCheckoutModel"
import { useWebShare } from "@Jetzy/hooks/useShare"
import Slider from "react-slick"
import { ChevronLeftSVG, ChevronRightSVG } from "@Jetzy/assets/icons"

import "slick-carousel/slick/slick.css"
import "slick-carousel/slick/slick-theme.css"

import SampleImage from "@Jetzy/assets/event-banners/event-1.jpeg"
import Event2 from "@Jetzy/assets/event-banners/event-2.jpeg"
import Event3 from "@Jetzy/assets/event-banners/event-3.jpeg"
import Event4 from "@Jetzy/assets/event-banners/event-4.jpg"
import Event5 from "@Jetzy/assets/event-banners/event-5.jpg"
import Event6 from "@Jetzy/assets/event-banners/event-6.jpg"
import Event7 from "@Jetzy/assets/event-banners/event-7.jpeg"
import Event8 from "@Jetzy/assets/event-banners/event-8.jpeg"
import EventTicketsComponent from "@/components/EventTicketsComponent"
import { IEvent } from "@/models/events/types"
import { Image } from "@chakra-ui/react"
import { CalendarDateRangeIcon, HomeIcon, MapPinIcon, ShareIcon, TicketIcon } from "@heroicons/react/24/outline"
import Link from "next/link"
import { ROUTES } from "@/configs/routes"

const images = [SampleImage, Event2, Event3, Event4, Event5, Event6, Event7, Event8]

const eventDetails = {
	title: `Nightingale Valentine's Soirée`,
	description: "Join us for an unforgettable evening of elegance, music, and connection at Nightingale, the most captivating Art Deco-inspired lounge in the city.",
	timestamp: "Saturday, February 15 · 4 - 11pm EST",
	location: "Nightingale, New York, NY 10007, United States",
	aboutEvent: `Welcome to the <strong>Nightingale Valentine's Soirée</strong>, an exclusive event designed to tantalize all five senses. Step into a world of rich colors, plush textures, and a nostalgic Art Deco ambiance that transports you to an era of elegance and grandeur.`,
}

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
}

type Props = {
	event: IEvent
}
export default function HostedEvents({ event }: Props) {
	const shareUrl = window.location.href
	const shareTitle = event.name
	const shareDesc = event.desc

	const sharer = useWebShare({
		title: shareTitle,
		text: shareDesc,
		url: shareUrl,
	})

	return (
		<>
			<div className="min-h-screen bg-gradient-to-br from-purple-900 to-indigo-900 py-8 px-4 sm:px-6 lg:px-7">
				<div className="text-center text-white text-lg font-bold mb-10">
					<Link
						role="button"
						href={ROUTES.home}
						className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3  whitespace-nowrap rounded-full hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg"
					>
						<HomeIcon className="w-6 h-6 inline-block mr-2" /> See more events
					</Link>
				</div>
				{/* Main Container */}
				<div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all">
					{/* Banner Image */}
					<div className="relative">
						{event.images.length > 1 ? (
							<Slider {...settings}>
								{event.images.map((image, idx) => (
									<div key={idx}>
										<Image src={image} alt="Event Banner" className="w-full md:h-[30rem] sm:h-52 object-cover object-top" />
									</div>
								))}
							</Slider>
						) : (
							<div>
								<Image src={event.images[0]} alt="Event Banner" className="w-full md:h-[30rem] sm:h-52 object-cover object-top" />
							</div>
						)}
					</div>

					{/* Content Section */}
					<div className="p-6 sm:p-8">
						{/* Header Section */}
						<div className="flex flex-col sm:flex-row justify-between items-center mb-6 space-y-4 sm:space-y-0">
							<div className="text-center sm:text-left">
								<p className="text-gray-600 text-sm sm:text-base mb-5">
									{new Date(event.startsOn.toString()).toDateString()} {new Date(event.startsOn.toString()).toLocaleTimeString()}
								</p>
								<p className="text-gray-600 text-sm sm:text-base mb-5">
									{event?.timezone || ''}
								</p>

								<h2 className="text-2xl sm:text-3xl font-bold text-gray-800">{event.name}</h2>
								<p className="text-gray-600 text-sm sm:text-base">{event.desc.slice(0, 20)}...</p>
								{/* share button  */}
							</div>

							<div className="flex flex-col items-center sm:items-end">
								<a
									role="button"
									href="#event-tickets"
									className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3  whitespace-nowrap rounded-full hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg"
								>
									<TicketIcon className="w-6 h-6 inline-block mr-2" /> Get Tickets
								</a>

								<button
									onClick={() => sharer.share()}
									className="mt-6 bg-gradient-to-r   from-gray-200 to-gray-200 font-bold text-gray-700 px-6 py-3  whitespace-nowrap rounded-full hover:from-gray-300 hover:to-gray-300 transition-all transform hover:scale-105 shadow-lg"
								>
									<ShareIcon className="w-6 h-6 inline-block mr-2" /> Share
								</button>
							</div>
						</div>

						{/* Details Section */}
						<div className="space-y-6">
							{/* Date and Time */}
							<div className="bg-gray-50 p-4 rounded-lg">
								<h3 className="font-semibold text-lg text-gray-800 mb-4">
									<CalendarDateRangeIcon className="w-6 h-6 inline-block mr-2" /> Schedule Date and Time
								</h3>
								<p className="text-gray-600 my-3">
									<span className="text-gray-500 font-bold">From:</span> {new Date(event.startsOn).toDateString()} {new Date(event.startsOn).toLocaleTimeString()}
								</p>

								<p className="text-gray-600 mt-1">
									<span className="text-gray-500 font-bold">To:</span> {new Date(event.endsOn).toDateString()} {new Date(event.endsOn).toLocaleTimeString()}
								</p>
							</div>

							{/* Location */}
							<div className="bg-gray-50 p-4 rounded-lg">
								<h3 className="font-semibold text-lg text-gray-800">
									<MapPinIcon className="w-6 h-6 inline-block mr-2" /> Location
								</h3>
								<p className="text-gray-600 mt-1">{event.location}</p>
							</div>

							{/* About Event */}
						</div>
					</div>
				</div>

				<EventTicketsComponent event={event} />
				<EventDetails event={event} />
			</div>

			<EventCheckoutModel />
		</>
	)
}

function CustomArrow(props: { className?: string; onClick?: () => void; children?: React.ReactNode }) {
	const { className, onClick, children } = props
	return (
		<div className={`absolute top-1/2 transform -translate-y-1/2 z-10 cursor-pointer ${className?.includes("slick-next") ? "right-4" : "left-4"}`} onClick={onClick}>
			<div className="p-2 bg-[#00000033] rounded-full w-max backdrop-blur-md">{children}</div>
		</div>
	)
}

import EnhancedLayout from "@Jetzy/components/layout/EnhancedLayout"
import React from "react"
import SampleImage from "@Jetzy/assets/sample.jpeg"
import Image from "next/image"
import EventPage from "@Jetzy/components/EventPage"
import EventDetails from "@Jetzy/components/EventDetails"
import EventCheckoutModel from "@Jetzy/components/EventCheckoutModel"
import { useWebShare } from "@Jetzy/hooks/useShare"

export default function HostedEvents() {
	const shareUrl = window.location.href
	const shareTitle = "Nightingale Valentine's Soirée"
	const shareDesc = "Join us for an unforgettable evening of elegance, music, and connection at Nightingale, the most captivating Art Deco-inspired lounge in the city."
	const sharer = useWebShare({
		title: shareTitle,
		text: shareDesc,
		url: shareUrl,
	})


	const eventDetails = {
		title: `Nightingale Valentine's Soirée`,
		description: 'Join us for an unforgettable evening of elegance, music, and connection at Nightingale, the most captivating Art Deco-inspired lounge in the city.',
		timestamp: 'Saturday, February 15 · 4 - 11pm EST',
		location: 'Nightingale, New York, NY 10007, United States',
		aboutEvent: `Welcome to the <strong>Nightingale Valentine's Soirée</strong>, an exclusive event designed to tantalize all five senses. Step into a world of rich colors, plush textures, and a nostalgic Art Deco ambiance that transports you to an era of elegance and grandeur.`
	}

	return (
		<>
			<div className="min-h-screen bg-gradient-to-br from-purple-900 to-indigo-900 py-8 px-4 sm:px-6 lg:px-7">
				{/* Main Container */}
				<div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all">
					{/* Banner Image */}
					<div className="relative">
						<Image src={SampleImage} alt="Event Banner" className="w-full md:h-96 sm:h-52 object-cover" />
					</div>

					{/* Content Section */}
					<div className="p-6 sm:p-8">
						{/* Header Section */}
						<div className="flex flex-col sm:flex-row justify-between items-center mb-6 space-y-4 sm:space-y-0">
							<div className="text-center sm:text-left">
								<p className="text-gray-600 text-sm sm:text-base mb-5">{eventDetails.timestamp}</p>
								<h2 className="text-2xl sm:text-3xl font-bold text-gray-800">{eventDetails.title}</h2>
								<p className="text-gray-600 text-sm sm:text-base">{eventDetails.description}</p>
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
								<h3 className="font-semibold text-lg text-gray-800">Date and Time</h3>
								<p className="text-gray-600 mt-1">{eventDetails.timestamp}</p>
							</div>

							{/* Location */}
							<div className="bg-gray-50 p-4 rounded-lg">
								<h3 className="font-semibold text-lg text-gray-800">Location</h3>
								<p className="text-gray-600 mt-1">{eventDetails.location}</p>
							</div>

							{/* About Event */}
							<div className="bg-gray-50 p-4 rounded-lg">
								<h3 className="font-semibold text-lg text-gray-800">About this Event</h3>
								<EventDetails />
							</div>
						</div>
					</div>
				</div>

				<EventPage />
			</div>

			<EventCheckoutModel />
		</>
	)
}

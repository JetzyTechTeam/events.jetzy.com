import React, { useEffect, useMemo, useState } from "react"
import EventCheckoutModel from "@Jetzy/components/EventCheckoutModel"
import { useWebShare } from "@Jetzy/hooks/useShare"
import Slider from "react-slick"
import { ChevronLeftSVG, ChevronRightSVG, DateTimeSVG, LocationSVG } from "@Jetzy/assets/icons"

import "slick-carousel/slick/slick.css"
import "slick-carousel/slick/slick-theme.css"

import EventTicketsComponent from "@/components/EventTicketsComponent"
import { IEvent } from "@/models/events/types"
import { Button } from "@chakra-ui/react"
import { ShareIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import Link from "next/link"
import { useSession } from "next-auth/react"
import Linkify from "linkify-react"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import Image from "next/image"
import LightNavbar from "@/components/layout/LightNavbar"
import Footer from "@/components/layout/Footer"

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
}

type Props = {
	event: IEvent
}

// Featured Guests Section Component - PROTOTYPE
// TODO for Developer: Connect to actual event.featuredGuests data from database
function FeaturedGuestsSection() {
	// Placeholder data - replace with actual data from event.featuredGuests
	const placeholderGuests = [
		{ name: "Abhi", title: "Product Manager", image: null },
		{ name: "Kanshima", title: "Marketing Lead", image: null },
		{ name: "Michael", title: "Community Manager", image: null },
		{ name: "Richard", title: "Tech Lead", image: null },
	]

	return (
		<div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 mb-6">
			<h2 className="text-2xl font-bold text-text-primary mb-6">Featured Guests</h2>
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
				{placeholderGuests.map((guest, index) => (
					<div key={index} className="flex flex-col items-center text-center">
						<div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-light to-primary-purple flex items-center justify-center text-white text-2xl font-bold mb-3 shadow-md">
							{guest.name.charAt(0)}
						</div>
						<h3 className="font-semibold text-text-primary mb-1">{guest.name}</h3>
						<p className="text-sm text-text-muted">{guest.title}</p>
					</div>
				))}
			</div>
		</div>
	)
}

// Presented By Section Component - PROTOTYPE
// TODO for Developer: Connect to actual event.presentedBy data from database
function PresentedBySection() {
	// Placeholder data - replace with actual data from event.presentedBy
	const presenter = { name: "Jetzy Community", logo: null }

	return (
		<div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 mb-6">
			<h2 className="text-2xl font-bold text-text-primary mb-4">Presented by</h2>
			<div className="flex items-center gap-4">
				<div className="w-16 h-16 rounded-lg bg-gradient-to-br from-primary-light to-primary-purple flex items-center justify-center text-white text-xl font-bold shadow-md">
					{presenter.name.charAt(0)}
				</div>
				<div>
					<h3 className="font-semibold text-lg text-text-primary">{presenter.name}</h3>
				</div>
			</div>
		</div>
	)
}

// Hosted By Section Component - PROTOTYPE
// TODO for Developer: Connect to actual event.hostedBy data from database
function HostedBySection() {
	// Placeholder data - replace with actual data from event.hostedBy
	const hosts = [
		{ name: "Host 1", image: null },
		{ name: "Host 2", image: null },
		{ name: "Host 3", image: null },
		{ name: "Host 4", image: null },
		{ name: "Host 5", image: null },
	]

	return (
		<div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 mb-6">
			<h2 className="text-2xl font-bold text-text-primary mb-4">Hosted by</h2>
			<div className="flex items-center gap-2">
				{hosts.map((host, index) => (
					<div
						key={index}
						className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-light to-primary-purple flex items-center justify-center text-white font-semibold shadow-md border-2 border-white"
						style={{ marginLeft: index > 0 ? "-12px" : "0", zIndex: hosts.length - index }}
						title={host.name}
					>
						{host.name.charAt(0)}
					</div>
				))}
			</div>
		</div>
	)
}

export default function HostedEvents({ event }: Props) {
	const [shareUrl, setShareUrl] = useState("")
	const [activeTab, setActiveTab] = useState<"bookings" | "waiting-list">("bookings")
	const [isTicketModalOpen, setIsTicketModalOpen] = useState(false)
	const [isBookingsCollapsed, setIsBookingsCollapsed] = useState(false)
	const [isGuestsCollapsed, setIsGuestsCollapsed] = useState(false)
	const [isCreatingUsers, setIsCreatingUsers] = useState(false)
	const [isCreatingGroup, setIsCreatingGroup] = useState(false)
	const { data: session } = useSession()

	// Validate event data early and safely
	const isValidEvent = event && event._id && event.name

	const clonedEvent = useMemo(() => {
		if (!isValidEvent) {
			return null
		}
		try {
			return structuredClone(event)
		} catch (error) {
			console.error("Error cloning event:", error)
			return null
		}
	}, [event, isValidEvent])

	const shareTitle = clonedEvent?.name || ""
	const shareDesc = clonedEvent?.desc || ""

	// @ts-ignore
	const isAdmin = session?.user?.role === "admin"

	useEffect(() => {
		if (typeof window !== "undefined") {
			setShareUrl(window.location.href)
		}
	}, [])

	const sharer = useWebShare({
		title: shareTitle,
		text: shareDesc,
		url: shareUrl,
	})

	const { formattedDate, formattedTime } = useMemo(() => {
		if (!clonedEvent?.startsOn) return { formattedDate: "", formattedTime: "" }

		try {
			const userTimeZone = clonedEvent?.timezone?.split(") ")[1] || clonedEvent?.timezone || "UTC"
			const date = dayjs.utc(clonedEvent.startsOn).tz(userTimeZone)

			const formattedDate = date.format("MMMM DD, YYYY")
			const formattedTime = date.format("hh:mm A")

			return { formattedDate, formattedTime }
		} catch (error) {
			console.error("Error formatting date:", error)
			return { formattedDate: "", formattedTime: "" }
		}
	}, [clonedEvent?.startsOn, clonedEvent?.timezone])

	// Check if event has ended
	const hasEventEnded = useMemo(() => {
		if (!clonedEvent?.endsOn) return false
		return new Date() > new Date(clonedEvent.endsOn)
	}, [clonedEvent?.endsOn])

	const handleCreateUsers = async () => {
		if (!clonedEvent?._id) return

		setIsCreatingUsers(true)
		try {
			console.log(`[HostedEvents] Creating users for event ${clonedEvent._id}`)
			const response = await axios.post(`/api/events/${clonedEvent._id}/create-users`)
			console.log(`[HostedEvents] Create users response:`, response.data)
			if (response.data.status) {
				alert(`Success: ${response.data.message}`)
				// Refresh event data to update flags
				window.location.reload()
			} else {
				const errorMsg = response.data.message || "Failed to create users"
				console.error(`[HostedEvents] Create users failed:`, errorMsg)
				alert(`Error: ${errorMsg}`)
			}
		} catch (error: any) {
			console.error("[HostedEvents] Error creating users:", error)
			const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || "Failed to create users"
			console.error("[HostedEvents] Error message:", errorMessage)
			alert(`Error: ${errorMessage}`)
		} finally {
			setIsCreatingUsers(false)
		}
	}

	const handleCreateGroup = async () => {
		if (!clonedEvent?._id) return

		setIsCreatingGroup(true)
		try {
			console.log(`[HostedEvents] Creating group for event ${clonedEvent._id}`)
			const response = await axios.post(`/api/events/${clonedEvent._id}/create-group`)
			console.log(`[HostedEvents] Create group response:`, response.data)
			if (response.data.status) {
				alert(`Success: ${response.data.message}`)
				// Refresh event data to update flags
				window.location.reload()
			} else {
				const errorMsg = response.data.message || "Failed to create group"
				console.error(`[HostedEvents] Create group failed:`, errorMsg)
				alert(`Error: ${errorMsg}`)
			}
		} catch (error: any) {
			console.error("[HostedEvents] Error creating group:", error)
			const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || "Failed to create group"
			console.error("[HostedEvents] Error message:", errorMessage)
			alert(`Error: ${errorMessage}`)
		} finally {
			setIsCreatingGroup(false)
		}
	}

	// Add error boundary for event data - only show if event is truly invalid
	if (!isValidEvent || !clonedEvent) {
		return (
			<>
				<LightNavbar />
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
								onClick={() => (window.location.href = "/")}
								className="mt-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-full hover:from-purple-700 hover:to-indigo-700 transition-all transform hover:scale-105 shadow-lg"
							>
								See All Events
							</button>
						</div>
					</div>
				</div>
				<Footer />
			</>
		)
	}

	try {
		return (
			<>
				<LightNavbar />
				<div className="min-h-screen bg-background-light py-8 px-4 sm:px-6 lg:px-7">
					{/* Admin Navigation */}
					{isAdmin && (
						<div className="max-w-5xl mx-auto mb-6 flex items-center justify-between">
							<Link
								href="/"
								className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-border-light rounded-lg text-text-primary hover:border-primary-purple hover:text-primary-purple transition-all duration-200 shadow-sm hover:shadow-md"
							>
								<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
								</svg>
								Back
							</Link>
							<Link
								href={`/console/events/${clonedEvent._id}/update`}
								className="inline-flex items-center gap-2 px-4 py-2 bg-primary-purple text-white rounded-lg hover:bg-primary-dark transition-all duration-200 shadow-sm hover:shadow-md"
							>
								<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
									/>
								</svg>
								Edit Event
							</Link>
						</div>
					)}

					{/* Main Event Container */}
					<div className="max-w-5xl mx-auto">
						{/* Banner Image with Title Overlay */}
						<div className="relative bg-white rounded-2xl shadow-lg overflow-hidden mb-6">
							<div className="relative h-[300px] sm:h-[400px] md:h-[500px]">
								{clonedEvent?.images && Array.isArray(clonedEvent.images) && clonedEvent.images.length > 1 ? (
									<Slider {...settings}>
										{clonedEvent.images.map((image, idx) => (
											<div key={idx} className="relative h-[300px] sm:h-[400px] md:h-[500px]">
												<Image src={image} alt="Event Banner" fill className="object-cover" priority={idx === 0} />
											</div>
										))}
									</Slider>
								) : clonedEvent?.images && Array.isArray(clonedEvent.images) && clonedEvent.images.length === 1 ? (
									<Image src={clonedEvent.images[0]} alt="Event Banner" fill className="object-cover" priority />
								) : (
									<div className="w-full h-full bg-gradient-to-br from-primary-light to-primary-purple flex items-center justify-center">
										<svg className="w-24 h-24 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
											/>
										</svg>
									</div>
								)}

								{/* Title Overlay */}
								<div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent flex items-end">
									<div className="w-full p-6 sm:p-8">
										<h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-2 drop-shadow-lg">{clonedEvent.name}</h1>
									</div>
								</div>
							</div>
						</div>

						{/* Event Info and Registration Section */}
						<div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 mb-6">
							<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
								{/* Date */}
								<div className="flex items-start gap-3">
									<div className="w-10 h-10 bg-primary-purple/10 rounded-lg flex items-center justify-center flex-shrink-0">
										<svg className="w-5 h-5 text-primary-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
										</svg>
									</div>
									<div>
										<p className="text-xs text-text-muted uppercase font-semibold tracking-wider mb-1">Date</p>
										<p className="text-sm font-medium text-text-primary">{formattedDate}</p>
									</div>
								</div>

								{/* Time */}
								<div className="flex items-start gap-3">
									<div className="w-10 h-10 bg-primary-purple/10 rounded-lg flex items-center justify-center flex-shrink-0">
										<svg className="w-5 h-5 text-primary-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
										</svg>
									</div>
									<div>
										<p className="text-xs text-text-muted uppercase font-semibold tracking-wider mb-1">Time</p>
										<p className="text-sm font-medium text-text-primary">
											{formattedTime}
											{clonedEvent?.timezone && <span className="text-xs text-text-muted ml-1">({clonedEvent.timezone.split(") ")[0]})</span>}
										</p>
									</div>
								</div>

								{/* Location */}
								<div className="flex items-start gap-3">
									<div className="w-10 h-10 bg-primary-purple/10 rounded-lg flex items-center justify-center flex-shrink-0">
										<svg className="w-5 h-5 text-primary-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
										</svg>
									</div>
									<div>
										<p className="text-xs text-text-muted uppercase font-semibold tracking-wider mb-1">Location</p>
										<p className="text-sm font-medium text-text-primary break-words">{clonedEvent.location}</p>
									</div>
								</div>
							</div>

							{/* Registration Buttons */}
							<div className="flex flex-col sm:flex-row gap-3 items-center justify-center pt-6 border-t border-border-light">
								<button
									onClick={() => setIsTicketModalOpen(true)}
									disabled={hasEventEnded}
									className={`w-full sm:w-auto px-8 py-3 text-white text-center font-semibold rounded-lg transition-all duration-200 shadow-md ${
										hasEventEnded ? "bg-gray-400 cursor-not-allowed" : "bg-primary-purple hover:bg-primary-dark hover:shadow-lg"
									}`}
								>
									{hasEventEnded ? "Event Ended" : "Get Tickets"}
								</button>
								<button
									onClick={() => sharer.share()}
									className="w-full sm:w-auto px-8 py-3 bg-white border border-border-gray text-text-primary font-semibold rounded-lg hover:bg-background-gray transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-center gap-2"
								>
									<ShareIcon className="w-5 h-5" />
									Share Event
								</button>
							</div>

							{/* Admin buttons for ended events */}
							{isAdmin && hasEventEnded && clonedEvent?._id && (
								<div className="flex flex-col gap-3 pt-6 border-t border-border-light mt-6">
									<p className="text-sm text-text-muted text-center mb-2">Admin Actions (Event Ended)</p>
									<div className="flex flex-col sm:flex-row gap-3">
										<button
											onClick={handleCreateUsers}
											disabled={isCreatingUsers || isCreatingGroup || clonedEvent.eventUsersCreated || clonedEvent.eventGroupCreated}
											className={`flex-1 px-6 py-3 rounded-lg font-semibold text-sm transition-all ${
												clonedEvent.eventUsersCreated || clonedEvent.eventGroupCreated
													? "bg-gray-400 text-gray-600 cursor-not-allowed"
													: "bg-blue-500 text-white hover:bg-blue-600 shadow-md hover:shadow-lg"
											}`}
										>
											{isCreatingUsers ? "Creating Users..." : clonedEvent.eventUsersCreated ? "Users Created ✓" : "Create Purchased Tickets Users"}
										</button>

										<button
											onClick={handleCreateGroup}
											disabled={isCreatingUsers || isCreatingGroup || clonedEvent.eventGroupCreated || clonedEvent.eventUsersCreated}
											className={`flex-1 px-6 py-3 rounded-lg font-semibold text-sm transition-all ${
												clonedEvent.eventGroupCreated || clonedEvent.eventUsersCreated
													? "bg-gray-400 text-gray-600 cursor-not-allowed"
													: "bg-purple-500 text-white hover:bg-purple-600 shadow-md hover:shadow-lg"
											}`}
										>
											{isCreatingGroup ? "Creating Group..." : clonedEvent.eventGroupCreated ? "Group Created ✓" : "Create User Interest Group"}
										</button>
									</div>
								</div>
							)}
						</div>

						{/* About Event Section */}
						<div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 mb-6">
							<h2 className="text-2xl font-bold text-text-primary mb-4">About Event</h2>
							<EventDescription description={clonedEvent.desc} />
						</div>

						{/* Featured Guests Section - TODO: Add to database schema */}
						{/* 
							TODO for Developer:
							- Add 'featuredGuests' field to event schema with structure: [{name: string, title: string, image?: string}]
							- Update event creation form to allow adding featured guests
							- Fetch and display actual guest data here
							- Currently showing placeholder data for UI/UX demo
						*/}
						<FeaturedGuestsSection />

						{/* Presented By Section - TODO: Add to database schema */}
						{/* 
							TODO for Developer:
							- Add 'presentedBy' field to event schema with structure: {name: string, logo?: string}
							- Update event creation form to allow adding presenter info
							- Fetch and display actual presenter data here
							- Currently showing placeholder data for UI/UX demo
						*/}
						<PresentedBySection />

						{/* Hosted By Section - TODO: Add to database schema */}
						{/* 
							TODO for Developer:
							- Add 'hostedBy' field to event schema with structure: [{name: string, image?: string}]
							- Update event creation form to allow adding host info
							- Fetch and display actual host data here
							- Currently showing placeholder data for UI/UX demo
						*/}
						<HostedBySection />

						{/* Questions Section */}
						<div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 mb-6">
							<h2 className="text-2xl font-bold text-text-primary mb-4">Questions?</h2>
							<p className="text-text-secondary mb-4">If you have any questions about this event, please reach out to the organizers:</p>
							<a href="mailto:events@jetzy.com" className="inline-flex items-center gap-2 text-primary-purple hover:text-primary-dark font-medium transition-colors">
								<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
								</svg>
								events@jetzy.com
							</a>
						</div>
					</div>

					{/* Admin Sections - Keep existing dark theme for admin functionality */}
					{isAdmin && clonedEvent?._id && (
						<div className="max-w-5xl mx-auto mt-8">
							<div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-border-light">
								{/* Collapsible Header */}
								<button
									onClick={() => setIsBookingsCollapsed(!isBookingsCollapsed)}
									className="w-full flex items-center justify-between px-6 py-4 bg-primary-purple/5 hover:bg-primary-purple/10 transition-colors border-b border-border-light"
								>
									<h3 className="text-lg font-bold text-text-primary">Bookings & Waiting List</h3>
									<svg className={`w-5 h-5 text-text-primary transform transition-transform ${isBookingsCollapsed ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
									</svg>
								</button>

								{/* Collapsible Content */}
								{!isBookingsCollapsed && (
									<>
										{/* Tab Headers */}
										<div className="flex border-b border-border-light">
											<button
												onClick={() => setActiveTab("bookings")}
												className={`flex-1 px-6 py-4 text-center font-semibold transition-colors ${
													activeTab === "bookings" ? "bg-primary-purple text-white border-b-2 border-primary-purple" : "text-text-secondary hover:bg-background-gray"
												}`}
											>
												Bookings
											</button>
											<button
												onClick={() => setActiveTab("waiting-list")}
												className={`flex-1 px-6 py-4 text-center font-semibold transition-colors ${
													activeTab === "waiting-list" ? "bg-primary-purple text-white border-b-2 border-primary-purple" : "text-text-secondary hover:bg-background-gray"
												}`}
											>
												Waiting List
											</button>
										</div>

										{/* Tab Content */}
										<div className="p-6">
											{activeTab === "bookings" && <EventBookings eventId={clonedEvent._id.toString()} />}
											{activeTab === "waiting-list" && <EventWaitingList eventId={clonedEvent._id.toString()} eventName={clonedEvent.name} />}
										</div>
									</>
								)}
							</div>
						</div>
					)}

					{isAdmin && clonedEvent?._id && <GuestsList eventId={clonedEvent._id.toString()} isCollapsed={isGuestsCollapsed} onToggle={() => setIsGuestsCollapsed(!isGuestsCollapsed)} />}

					{/* Ticket Selection Modal */}
					{clonedEvent && <EventTicketsComponent event={clonedEvent} isOpen={isTicketModalOpen} onClose={() => setIsTicketModalOpen(false)} />}

					{/* Comments Section - Moved outside modal, remains on page */}
				</div>

				<Footer />

				{/* Checkout Modal - Preserve existing functionality */}
				{clonedEvent?.name && <EventCheckoutModel event={clonedEvent.name} />}
			</>
		)
	} catch (error) {
		console.error("Error in HostedEvents render:", error)
		return (
			<>
				<LightNavbar />
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
				<Footer />
			</>
		)
	}
}

function CustomArrow(props: { className?: string; onClick?: () => void; children?: React.ReactNode }) {
	const { className, onClick, children } = props
	return (
		<div className={`absolute top-1/2 transform -translate-y-1/2 z-10 cursor-pointer ${className?.includes("slick-next") ? "right-4" : "left-4"}`} onClick={onClick}>
			<div className="p-2 bg-[#00000033] rounded-full w-max backdrop-blur-md">{children}</div>
		</div>
	)
}

function GuestsList({ eventId, isCollapsed, onToggle }: { eventId: string; isCollapsed: boolean; onToggle: () => void }) {
	const { data: guests, isLoading } = useQuery({
		queryKey: ["eventGuests", eventId],
		queryFn: () => axios.get(`/api/events/guests?eventId=${eventId}`),
	})

	return (
		<div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-lg border border-border-light overflow-hidden mt-8">
			{/* Collapsible Header */}
			<button onClick={onToggle} className="w-full flex items-center justify-between px-6 py-4 bg-primary-purple/5 hover:bg-primary-purple/10 transition-colors">
				<h3 className="text-lg font-bold text-text-primary">Guests</h3>
				<svg className={`w-5 h-5 text-text-primary transform transition-transform ${isCollapsed ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
				</svg>
			</button>

			{/* Collapsible Content */}
			{!isCollapsed && (
				<div className="px-6 py-4">
					{isLoading && <p className="text-text-secondary text-sm">Loading guests...</p>}

					{!isLoading && guests?.data?.data?.length === 0 && <p className="text-text-muted italic text-sm">No guests found for this event.</p>}

					{!isLoading && guests?.data?.data?.length > 0 && (
						<ul className="space-y-3">
							{guests?.data?.data?.map((guest: { _id: string; name: string }) => (
								<li key={guest._id} className="flex items-center justify-between bg-background-gray border border-border-light rounded-lg px-4 py-3 shadow-sm hover:bg-background-light transition">
									<div className="flex items-center gap-4">
										<div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-light to-primary-purple flex items-center justify-center text-white font-semibold uppercase shadow-sm">
											{guest.name.charAt(0)}
										</div>
										<span className="text-text-primary font-medium">{guest.name}</span>
									</div>
								</li>
							))}
						</ul>
					)}
				</div>
			)}
		</div>
	)
}
interface TicketInfo {
	ticketId: string
	quantity: number
	_id: string
}

interface Booking {
	_id: string
	bookingRef: string
	tickets: TicketInfo[]
	status: string
	customerName: string
	customerEmail: string
	customerPhone: string
	subTotal: number
	tax: number
	total: number
	createdAt: string
}

function EventBookings({ eventId }: { eventId: string }) {
	const { data: bookings, isLoading } = useQuery({
		queryKey: ["eventBookings", eventId],
		queryFn: () => axios.get(`/api/events/${eventId}/event-bookings`),
	})

	const { data: totals, isLoading: totalsLoading } = useQuery({
		queryKey: ["eventTotals", eventId],
		queryFn: () => axios.get(`/api/events/${eventId}/totals`),
	})

	const { totalTickets, uniqueCustomers, cancelledTickets, cancelledGuests } = React.useMemo(() => {
		if (!totals?.data) return { totalTickets: 0, uniqueCustomers: 0, cancelledTickets: 0, cancelledGuests: 0 }

		return {
			totalTickets: totals.data.totalTickets || 0,
			uniqueCustomers: totals.data.uniqueGuests || 0,
			cancelledTickets: totals.data.cancelledTickets || 0,
			cancelledGuests: totals.data.cancelledGuests || 0,
		}
	}, [totals?.data])

	return (
		<div>
			<div className="flex items-center justify-between mb-6">
				<h3 className="text-xl font-bold text-text-primary">Bookings</h3>
				{!isLoading && !totalsLoading && (
					<div className="text-sm">
						<div className="flex flex-col space-y-2">
							<div className="flex gap-4 flex-wrap">
								<div className="flex items-center gap-2">
									<span className="font-semibold text-text-primary">Active Tickets:</span>
									<span className="px-2 py-1 bg-green-100 text-green-700 rounded-md font-medium">{totalTickets}</span>
								</div>
								<div className="flex items-center gap-2">
									<span className="font-semibold text-text-primary">Active Customers:</span>
									<span className="px-2 py-1 bg-green-100 text-green-700 rounded-md font-medium">{uniqueCustomers}</span>
								</div>
							</div>
							{(cancelledTickets > 0 || cancelledGuests > 0) && (
								<div className="flex gap-4 flex-wrap">
									<div className="flex items-center gap-2">
										<span className="font-semibold text-text-primary">Cancelled Tickets:</span>
										<span className="px-2 py-1 bg-red-100 text-red-700 rounded-md font-medium">{cancelledTickets}</span>
									</div>
									<div className="flex items-center gap-2">
										<span className="font-semibold text-text-primary">Cancelled Customers:</span>
										<span className="px-2 py-1 bg-red-100 text-red-700 rounded-md font-medium">{cancelledGuests}</span>
									</div>
								</div>
							)}
						</div>
					</div>
				)}
			</div>

			{isLoading && <p className="text-text-secondary">Loading bookings...</p>}

			{!isLoading && bookings?.data?.length === 0 && <p className="text-text-muted">No bookings found for this event.</p>}

			{!isLoading &&
				bookings?.data &&
				Array.isArray(bookings.data) &&
				bookings.data.map((booking: Booking) => (
					<div key={booking._id} className="border border-border-light rounded-lg p-4 mb-4 bg-background-gray hover:shadow-md transition-shadow">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<p className="text-sm mb-2">
									<span className="font-semibold text-text-primary">Booking Ref:</span> <span className="font-mono text-primary-purple">{booking.bookingRef}</span>
								</p>

								<p className="text-sm mb-2">
									<span className="font-semibold text-text-primary">Customer:</span> <span className="text-text-secondary">{booking.customerName}</span>
								</p>
								<p className="text-sm mb-2">
									<span className="font-semibold text-text-primary">Email:</span> <span className="text-text-secondary">{booking.customerEmail}</span>
								</p>
								<p className="text-sm mb-2">
									<span className="font-semibold text-text-primary">Phone:</span> <span className="text-text-secondary">{booking.customerPhone}</span>
								</p>

								<p className="text-sm mb-2">
									<span className="font-semibold text-text-primary">Status:</span>{" "}
									<span
										className={`px-2 py-1 rounded-md text-xs font-medium ${
											booking.status === "confirmed" || booking.status === "approved"
												? "bg-green-100 text-green-700"
												: booking.status === "pending"
												? "bg-yellow-100 text-yellow-700"
												: "bg-red-100 text-red-700"
										}`}
									>
										{booking.status}
									</span>
								</p>

								<p className="text-sm text-text-muted">
									<span className="font-semibold text-text-primary">Created:</span> {new Date(booking.createdAt).toLocaleString()}
								</p>
							</div>

							<div>
								<div className="mb-3">
									<p className="font-semibold text-text-primary text-sm mb-2">Tickets:</p>
									<ul className="space-y-1 text-text-secondary text-sm">
										{booking.tickets.map((ticket) => (
											<li key={ticket._id} className="flex items-center gap-2">
												<span className="w-2 h-2 bg-primary-purple rounded-full"></span>
												Quantity: <span className="font-medium text-text-primary">{ticket.quantity}</span>
											</li>
										))}
									</ul>
								</div>

								<div className="flex flex-col gap-2 text-sm">
									<div className="flex justify-between">
										<span className="font-semibold text-text-primary">Subtotal:</span>
										<span className="text-text-secondary">${booking.subTotal.toFixed(2)}</span>
									</div>
									<div className="flex justify-between">
										<span className="font-semibold text-text-primary">Tax:</span>
										<span className="text-text-secondary">${booking.tax.toFixed(2)}</span>
									</div>
									<div className="flex justify-between pt-2 border-t border-border-light">
										<span className="font-bold text-text-primary">Total:</span>
										<span className="font-bold text-primary-purple">${booking.total.toFixed(2)}</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				))}
		</div>
	)
}

const linkifyOptions = {
	target: "_blank",
	className: "text-primary-purple underline hover:text-primary-dark font-medium",
}

function EventWaitingList({ eventId, eventName }: { eventId: string; eventName: string }) {
	const {
		data: waitingList,
		isLoading,
		refetch,
	} = useQuery({
		queryKey: ["eventWaitingList", eventId],
		queryFn: () => axios.get(`/api/waiting-list/${eventId}`),
	})

	// Debug logging
	console.log("EventWaitingList Debug:", {
		eventId,
		isLoading,
		waitingList,
		dataLength: waitingList?.data?.data?.length,
	})

	// Test API call directly
	React.useEffect(() => {
		const testApi = async () => {
			try {
				const response = await axios.get(`/api/waiting-list/${eventId}`)
				console.log("Direct API test result:", response.data)
			} catch (error) {
				console.error("Direct API test error:", error)
			}
		}
		testApi()
	}, [eventId])

	const handleApprove = async (waitingListId: string) => {
		try {
			const response = await axios.post("/api/waiting-list/approve", {
				waitingListId,
				eventName,
			})

			if (response.data.status) {
				alert("User approved and notified successfully!")
				refetch()
			} else {
				alert("Failed to approve user")
			}
		} catch (error) {
			console.error("Error approving user:", error)
			alert("Failed to approve user")
		}
	}

	const handleRemove = async (waitingListId: string) => {
		if (!confirm("Are you sure you want to remove this user from the waiting list?")) {
			return
		}

		try {
			const response = await axios.delete("/api/waiting-list/remove", {
				data: { waitingListId },
			})

			if (response.data.status) {
				alert("User removed from waiting list successfully!")
				refetch()
			} else {
				alert("Failed to remove user")
			}
		} catch (error) {
			console.error("Error removing user:", error)
			alert("Failed to remove user")
		}
	}

	return (
		<div>
			<div className="flex items-center justify-between mb-6">
				<h3 className="text-xl font-bold text-text-primary">Waiting List</h3>
				{!isLoading && waitingList?.data?.data && (
					<div className="text-sm">
						<span className="font-semibold text-text-primary">
							Total: <span className="px-2 py-1 bg-primary-purple/10 text-primary-purple rounded-md">{waitingList.data.data.length}</span> users
						</span>
					</div>
				)}
			</div>

			{isLoading && <p className="text-text-secondary">Loading waiting list...</p>}

			{!isLoading && waitingList?.data?.data?.length === 0 && <p className="text-text-muted">No users on waiting list.</p>}

			{!isLoading &&
				waitingList?.data?.data &&
				Array.isArray(waitingList.data.data) &&
				waitingList.data.data.map((user: any) => (
					<div key={user._id} className="border border-border-light rounded-lg p-4 mb-4 bg-background-gray hover:shadow-md transition-shadow">
						<div className="flex justify-between items-start gap-4">
							<div className="flex-1">
								<p className="text-sm mb-2">
									<span className="font-semibold text-text-primary">Name:</span>{" "}
									<span className="text-text-secondary">
										{user.firstName} {user.lastName}
									</span>
								</p>
								<p className="text-sm mb-2">
									<span className="font-semibold text-text-primary">Email:</span> <span className="text-text-secondary">{user.email}</span>
								</p>
								<p className="text-sm mb-2">
									<span className="font-semibold text-text-primary">Phone:</span> <span className="text-text-secondary">{user.phone}</span>
								</p>
								<p className="text-sm text-text-muted mb-3">
									<span className="font-semibold text-text-primary">Joined:</span> {new Date(user.createdAt).toLocaleString()}
								</p>

								<div>
									<p className="font-semibold text-text-primary text-sm mb-2">Requested Tickets:</p>
									<ul className="space-y-1 text-text-secondary text-sm">
										{user.tickets.map((ticket: any, index: number) => (
											<li key={index} className="flex items-center gap-2">
												<span className="w-2 h-2 bg-primary-purple rounded-full"></span>
												{ticket.quantity} x {ticket.name} (${ticket.price} each)
											</li>
										))}
									</ul>
								</div>
							</div>

							<div className="flex flex-col gap-2">
								<button onClick={() => handleApprove(user._id)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors shadow-sm">
									Approve
								</button>
								<button onClick={() => handleRemove(user._id)} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors shadow-sm">
									Remove
								</button>
							</div>
						</div>
					</div>
				))}
		</div>
	)
}

function EventDescription({ description }: { description: string }) {
	if (!description) return <p className="text-text-muted italic">No description available</p>
	const lines = description.split("\n")

	return (
		<div className="text-base text-text-secondary break-words overflow-wrap-anywhere leading-relaxed">
			{lines.map((line, i) => (
				<p key={i} className="mb-3 break-words overflow-wrap-anywhere">
					<Linkify options={linkifyOptions}>{line}</Linkify>
				</p>
			))}
		</div>
	)
}

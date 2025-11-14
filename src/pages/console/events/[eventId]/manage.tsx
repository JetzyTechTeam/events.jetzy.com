"use client"
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { authorizedOnly } from "@/lib/authSession"
import { Events } from "@/models/events"
import { GetServerSideProps } from "next"
import React, { useEffect, useState } from "react"
import { useToast, Spinner } from "@chakra-ui/react"
import { DateTime } from "luxon"
import axios from "axios"
import { useQuery } from "@tanstack/react-query"
import Head from "next/head"
import { useRouter } from "next/router"
import { Roles } from "@/types"
import { useSession } from "next-auth/react"
import { FiCalendar, FiMapPin, FiMail, FiUserPlus, FiSend, FiShare2, FiEdit, FiCheckCircle, FiUsers, FiClock, FiTrendingUp } from "react-icons/fi"
import Image from "next/image"
import { SendBlastModal } from "@/components/console/SendBlastModal"
import { InviteGuestsModal } from "@/components/console/InviteGuestsModal"
import { ShareModal } from "@/components/console/ShareModal"
import { GuestsList } from "@/components/console/GuestsList"

export default function Manage({ event }: any) {
	event = JSON.parse(event)

	const [shareModal, setShareModal] = useState(false)
	const [inviteGuestsModal, setInviteGuestsModal] = useState(false)
	const [sendBlastModal, setSendBlastModal] = useState(false)
	const [activeTab, setActiveTab] = useState<"overview" | "guests">("overview")
	const router = useRouter()
	const { data: session } = useSession()

	// @ts-ignore
	if (session?.user?.role === Roles.USER) router.push("/console")

	const eventDate = DateTime.fromISO(event.startsOn).toLocal()
	const formattedDate = eventDate.toFormat("EEE, MMM dd, yyyy")
	const formattedTime = eventDate.toFormat("hh:mm a")

	return (
		<>
			<Head>
				<title>Manage {event.name} - Jetzy Events</title>
				<meta name="description" content={`Manage attendees, messages, and settings for ${event.name}`} />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout
				page={event.name}
				backBtn="/console/events"
				component={
					<div className="flex flex-col sm:flex-row gap-2">
						<button
							onClick={() => router.push(`/console/events/${event._id}/check-in`)}
							className="bg-primary-purple text-white px-4 py-2.5 rounded-lg hover:bg-primary-dark transition-colors font-semibold text-sm shadow-md hover:shadow-lg flex items-center justify-center gap-2"
						>
							<FiCheckCircle className="w-4 h-4" />
							Check-In Portal
						</button>
						<button
							onClick={() => router.push(`/console/events/${event._id}/update`)}
							className="bg-white text-text-primary border-2 border-border-light px-4 py-2.5 rounded-lg hover:bg-background-gray transition-colors font-semibold text-sm shadow-sm flex items-center justify-center gap-2"
						>
							<FiEdit className="w-4 h-4" />
							Edit Event
						</button>
					</div>
				}
			>
				{/* MODALS */}
				<InviteGuestsModal inviteGuestsModal={inviteGuestsModal} setInviteGuestsModal={setInviteGuestsModal} event={event} />
				<SendBlastModal sendBlastModal={sendBlastModal} setSendBlastModal={setSendBlastModal} event={event} />
				<ShareModal shareModal={shareModal} setShareModal={setShareModal} eventSlug={event.slug} />

				{/* MAIN CONTENT */}
				<div className="space-y-6">
					{/* Tab Navigation */}
					<div className="bg-white rounded-xl shadow-sm border border-border-light p-1 inline-flex w-full sm:w-auto">
						<button
							onClick={() => setActiveTab("overview")}
							className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg font-semibold text-sm transition-all ${
								activeTab === "overview" ? "bg-primary-purple text-white shadow-md" : "text-text-secondary hover:text-text-primary hover:bg-background-gray"
							}`}
						>
							Overview
						</button>
						<button
							onClick={() => setActiveTab("guests")}
							className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg font-semibold text-sm transition-all ${
								activeTab === "guests" ? "bg-primary-purple text-white shadow-md" : "text-text-secondary hover:text-text-primary hover:bg-background-gray"
							}`}
						>
							Guests
						</button>
					</div>

					{/* OVERVIEW TAB */}
					{activeTab === "overview" && (
						<div className="space-y-6">
							{/* Quick Actions Grid */}
							<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
								<button
									onClick={() => setInviteGuestsModal(true)}
									className="bg-gradient-to-br from-purple-50 to-purple-100 hover:from-purple-100 hover:to-purple-200 border-2 border-purple-200 hover:border-purple-300 rounded-xl p-6 transition-all duration-300 shadow-sm hover:shadow-md group"
								>
									<div className="flex items-center gap-4">
										<div className="w-12 h-12 bg-primary-purple rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
											<FiUserPlus className="w-6 h-6 text-white" />
										</div>
										<div className="text-left">
											<h3 className="font-bold text-text-primary text-lg">Invite Guests</h3>
											<p className="text-text-muted text-sm">Send invitations</p>
										</div>
									</div>
								</button>

								<button
									onClick={() => setSendBlastModal(true)}
									className="bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 border-2 border-blue-200 hover:border-blue-300 rounded-xl p-6 transition-all duration-300 shadow-sm hover:shadow-md group"
								>
									<div className="flex items-center gap-4">
										<div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
											<FiSend className="w-6 h-6 text-white" />
										</div>
										<div className="text-left">
											<h3 className="font-bold text-text-primary text-lg">Send Blast</h3>
											<p className="text-text-muted text-sm">Message attendees</p>
										</div>
									</div>
								</button>

								<button
									onClick={() => setShareModal(true)}
									className="bg-gradient-to-br from-green-50 to-green-100 hover:from-green-100 hover:to-green-200 border-2 border-green-200 hover:border-green-300 rounded-xl p-6 transition-all duration-300 shadow-sm hover:shadow-md group"
								>
									<div className="flex items-center gap-4">
										<div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
											<FiShare2 className="w-6 h-6 text-white" />
										</div>
										<div className="text-left">
											<h3 className="font-bold text-text-primary text-lg">Share Event</h3>
											<p className="text-text-muted text-sm">Get event link</p>
										</div>
									</div>
								</button>
							</div>

							{/* Event Details Card */}
							<div className="bg-white rounded-2xl shadow-lg border border-border-light overflow-hidden">
								<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
									{/* Event Image */}
									<div className="lg:col-span-1">
										<div className="relative w-full h-64 lg:h-full rounded-xl overflow-hidden shadow-md">
											<Image src={event.images[0]} alt={event.name} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
										</div>
									</div>

									{/* Event Info */}
									<div className="lg:col-span-2 space-y-6">
										{/* Title */}
										<div>
											<h2 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2">{event.name}</h2>
											<div className="flex items-center gap-2">
												<FiTrendingUp className="w-4 h-4 text-primary-purple" />
												<span className="text-sm text-text-muted">Event Management</span>
											</div>
										</div>

										{/* Details Grid */}
										<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
											{/* Date & Time */}
											<div className="bg-background-light rounded-xl p-4 border border-border-light">
												<div className="flex items-start gap-3">
													<div className="w-10 h-10 bg-primary-purple/10 rounded-lg flex items-center justify-center flex-shrink-0">
														<FiCalendar className="w-5 h-5 text-primary-purple" />
													</div>
													<div>
														<p className="text-xs text-text-muted font-medium mb-1">Date & Time</p>
														<p className="text-sm font-semibold text-text-primary">{formattedDate}</p>
														<p className="text-sm text-text-secondary">{formattedTime}</p>
														<p className="text-xs text-text-muted mt-1">{event.timezone}</p>
													</div>
												</div>
											</div>

											{/* Location */}
											<div className="bg-background-light rounded-xl p-4 border border-border-light">
												<div className="flex items-start gap-3">
													<div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
														<FiMapPin className="w-5 h-5 text-green-600" />
													</div>
													<div>
														<p className="text-xs text-text-muted font-medium mb-1">Location</p>
														<p className="text-sm font-semibold text-text-primary break-words">{event.location}</p>
													</div>
												</div>
											</div>
										</div>

										{/* Description */}
										<div className="bg-background-light rounded-xl p-4 border border-border-light">
											<div className="flex items-start gap-3">
												<div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
													<FiMail className="w-5 h-5 text-blue-600" />
												</div>
												<div className="flex-1">
													<p className="text-xs text-text-muted font-medium mb-2">Description</p>
													<p className="text-sm text-text-secondary leading-relaxed">{event.desc || "No description provided"}</p>
												</div>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>
					)}

					{/* GUESTS TAB */}
					{activeTab === "guests" && <GuestsList eventId={event._id} />}
				</div>
			</ConsoleLayout>
		</>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	const session = await authorizedOnly(context)
	if (!session) return session

	// Ensure database connection is ready
	const { dbconn } = await import("@/configs/database")
	if (dbconn.readyState !== 1) {
		console.log("[console/events/manage] Database not connected, attempting to connect...")
		await dbconn.asPromise()
	}

	// Ensure database connection
	const { connectDB } = await import("@/lib/connect-db")
	await connectDB()

	const eventId = context.query.eventId as string
	if (!eventId) return { props: {} }

	const event = await Events.findOne({ _id: eventId, isDeleted: false })

	if (!event) return { props: {} }

	return {
		props: {
			event: JSON?.stringify(event),
		},
	}
}

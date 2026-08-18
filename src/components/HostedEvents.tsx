import React, { useEffect, useMemo, useState } from "react"
import DiscussionBoard from "@/components/events/DiscussionBoard"
import EventAlbums from "@/components/events/EventAlbums"
import JetzyChatIntegration from "@/components/events/JetzyChatIntegration"
import { ROUTES, homeRouteForRole } from "@/configs/routes"
import EventDescription from "@/components/events/EventDescription"
import { goBackOrTo } from "@/lib/navigation"
import { eventMedia, type EventMedia } from "@/lib/event-media"
import EventCheckoutModel from "@Jetzy/components/EventCheckoutModel"
import { useWebShare } from "@Jetzy/hooks/useShare"
import Slider from "react-slick"
import { ChevronLeftSVG, ChevronRightSVG, DateTimeSVG, LocationSVG } from "@Jetzy/assets/icons"


import EventTicketsComponent from "@/components/EventTicketsComponent"
import { ApprovalRequests } from "@/components/console/ApprovalRequests"
import { eventHasAnyApprovalTicket } from "@/lib/ticket-approval"
import { isPendingBooking, holdTimeRemaining } from "@/lib/booking-status"
import { describeDiscount } from "@/lib/booking-revenue"
import { bookingMemberships } from "@/lib/booking-memberships"
import { MEMBERSHIPS, type MembershipKey } from "@/lib/memberships"
import CancelBookingDialog from "@/components/bookings/CancelBookingDialog"
import { MoneyState } from "@/lib/booking-cancellation"
import { getEventStatus } from "@/utils/eventSort"
import { IEvent } from "@/models/events/types"
import { Button, Image, Tabs, TabList, TabPanels, TabPanel, Tab, Box, Text, Heading, useDisclosure, Flex, IconButton, Icon, useToast, Menu, MenuButton, MenuList, MenuItem, Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Input, Textarea, FormControl, FormLabel } from "@chakra-ui/react"
import { ShareIcon, QrCodeIcon as QrCodeIconOutline, UserPlusIcon } from "@heroicons/react/24/outline"
import QRCodeModal from "@/components/events/QRCodeModal"
import Pagination from "@/components/misc/Pagination"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import Link from "next/link"
import { signOut, useSession } from "next-auth/react"
import { useAppDispatch } from "@Jetzy/redux/stores"
import { usePremiumStatus } from "@/hooks/usePremiumStatus"
import { useBillingPortal } from "@/hooks/useBillingPortal"
import { destroySession } from "@Jetzy/redux/reducers/appSlice"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { getEventZone, normalizeTimezone } from "@/utils/eventTime"
import { useRouter } from "next/router";

dayjs.extend(utc)
dayjs.extend(timezone)

import { stripHtml } from "@/utils/text";
import { FiShare2, FiChevronDown, FiChevronUp, FiMoreHorizontal } from "react-icons/fi"

const settings = {
	infinite: true,
	speed: 500,
	slidesToShow: 1,
	slidesToScroll: 1,
	autoplay: false,
	arrow: true,
	beforeChange: (_: number, __: number) => {
		document.querySelectorAll<HTMLVideoElement>('video').forEach(v => { v.pause() })
	},
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
	const [shareUrl, setShareUrl] = useState("")
	const [activeTab, setActiveTab] = useState<"bookings" | "waiting-list" | "approvals">("bookings")
	const { isOpen: isQRModalOpen, onOpen: onQRModalOpen, onClose: onQRModalClose } = useDisclosure()
	const { isOpen: isDiscussionQRModalOpen, onOpen: onDiscussionQRModalOpen, onClose: onDiscussionQRModalClose } = useDisclosure()
	const { isOpen: isInviteModalOpen, onOpen: onInviteModalOpen, onClose: onInviteModalClose } = useDisclosure()
	const { isOpen: isPollModalOpen, onOpen: onPollModalOpen, onClose: onPollModalClose } = useDisclosure()
	const [inviteSearch, setInviteSearch] = useState("")
	const [inviteResults, setInviteResults] = useState<{_id:string;firstName:string;lastName:string;email:string;image?:string}[]>([])
	const [selectedInvitees, setSelectedInvitees] = useState<{_id:string;firstName:string;lastName:string;email:string}[]>([])
	const [inviteMessage, setInviteMessage] = useState("")
	const [isSendingInvite, setIsSendingInvite] = useState(false)
	const [isSearching, setIsSearching] = useState(false)
	const [isChatExpanded, setIsChatExpanded] = useState(false)
	const [isManageListsOpen, setIsManageListsOpen] = useState(false)

	useEffect(() => {
		const q = inviteSearch.trim()
		if (q.length < 2) { setInviteResults([]); return }
		const timer = setTimeout(async () => {
			setIsSearching(true)
			try {
				const res = await axios.get(`/api/users/search?q=${encodeURIComponent(q)}`)
				setInviteResults(res.data?.data || [])
			} catch { setInviteResults([]) }
			finally { setIsSearching(false) }
		}, 400)
		return () => clearTimeout(timer)
	}, [inviteSearch])
	const toast = useToast()
	const { data: session } = useSession()
	const router = useRouter()
	const dispatch = useAppDispatch()

	const { isPremium: isPremiumMember } = usePremiumStatus()
	const { openPortal, isOpening: isOpeningPortal, label: portalLabel } = useBillingPortal()

	// Canonical logout — mirrors src/components/misc/Navbar.tsx (LOGOUT-SAFETY RULE in CLAUDE.md):
	// targeted removeItem only (never localStorage.clear()), then destroySession, then signOut.
	const handleLogout = () => {
		try { sessionStorage.removeItem("api_token") } catch {}
		try { sessionStorage.removeItem("analytics_session_id") } catch {}
		try { localStorage.removeItem("analytics_anon_id") } catch {}
		try { localStorage.removeItem("events_location_pref") } catch {}
		try { localStorage.removeItem("visitor_id") } catch {}
		dispatch(destroySession({}))
		signOut({ callbackUrl: "/" })
	}

	// Validate event data early and safely
	const isValidEvent = event && event._id && event.name

	const clonedEvent = useMemo<IEvent | null>(() => {
		if (!isValidEvent) {
			return null
		}
		try {
			// `event` arrives as JSON.parse'd page props, so the cheap clone is exact.
			// structuredClone is iOS 15.4+; on anything older it throws and the whole
			// page used to fall through to "Event Not Found".
			if (typeof structuredClone === "function") return structuredClone(event)
			return JSON.parse(JSON.stringify(event))
		} catch (error) {
			console.error("Error cloning event:", error)
			try {
				return JSON.parse(JSON.stringify(event))
			} catch {
				return null
			}
		}
	}, [event, isValidEvent])


	// @ts-ignore
	const isAdmin = session?.user?.role === "admin" || session?.user?.role === "super admin"
	const userId = (session?.user as any)?._id?.toString()
	const isOwner = !!userId && event?.ownerId?.toString() === userId
	const canManage = isAdmin || isOwner
	const isDatePollActive = !!(clonedEvent?.datePoll?.isActive && clonedEvent?.datePoll?.options?.length)

	// Cancel-own-booking flow. This used to be gated to free events, which meant a paid
	// booking could never be cancelled from anywhere in the product. The API decides
	// eligibility now (see lib/booking-cancellation.ts) and returns `canCancel` with it.
	const { data: myBookingResp, refetch: refetchMyBooking } = useQuery({
		queryKey: ["myBookingForEvent", clonedEvent?._id?.toString()],
		queryFn: () => axios.get(`/api/bookings/my-for-event?eventId=${clonedEvent?._id}`).then((r) => r.data),
		enabled: !!session && !!clonedEvent?._id,
	})
	const myBooking = myBookingResp?.data ?? null

	// "Location disclosed after registration" means registering EARNS you the address — so a
	// guest holding a live booking, and the host who typed it, must see the real thing.
	//
	// The endpoint already excludes cancelled / rejected / expired bookings, so the only extra
	// exclusion is PENDING: someone still awaiting the host's approval hasn't been approved yet.
	// `myBooking.eventLocation` comes back from the same call, which is what lets the address
	// appear straight after a booking made on this page rather than only on the next load.
	const hasLiveBooking = !!myBooking && !isPendingBooking(myBooking)
	const canSeeLocation = !clonedEvent?.locationDisclosedAfterBooking || hasLiveBooking || canManage
	const disclosedLocation = (hasLiveBooking && myBooking?.eventLocation) || clonedEvent?.location

	// A media url that 404s and an event with no media at all used to look identical
	// on screen ("No image available"), which made bug reports unfalsifiable — the
	// same screenshot could mean stripped props or a dead S3 object.
	const [failedMedia, setFailedMedia] = useState<Record<string, true>>({})
	const markMediaFailed = (url: string) => setFailedMedia((prev) => (prev[url] ? prev : { ...prev, [url]: true }))
	const renderMedia = (media: EventMedia, key?: React.Key) => (
		<div key={key} className="relative w-full h-52 md:h-[335px] bg-black rounded-xl overflow-hidden">
			{failedMedia[media.url] ? (
				<div className="absolute inset-0 flex items-center justify-center bg-gray-800">
					<p className="text-gray-400">{media.type === "video" ? "Video couldn't load" : "Image couldn't load"}</p>
				</div>
			) : media.type === "video" ? (
				<video src={media.url} controls className="absolute inset-0 w-full h-full object-contain" onError={() => markMediaFailed(media.url)} />
			) : (
				<img src={media.url} alt="Event Banner" className="absolute inset-0 w-full h-full object-contain" onError={() => markMediaFailed(media.url)} />
			)}
		</div>
	)

	const [isCancelling, setIsCancelling] = useState(false)
	const [showCancelDialog, setShowCancelDialog] = useState(false)

	// Badge counts for the admin Approvals tab, so a host sees there's something waiting —
	// and that a card hold is about to lapse — without having to open the tab.
	const eventNeedsApproval = eventHasAnyApprovalTicket(clonedEvent as any)
	const { data: approvalBookings } = useQuery({
		queryKey: ["event-bookings", clonedEvent?._id?.toString()],
		queryFn: async () => (await axios.post("/api/get-bookings", { eventId: clonedEvent?._id })).data || [],
		enabled: !!isAdmin && !!clonedEvent?._id && eventNeedsApproval,
	})
	const pendingApprovalCount = (approvalBookings as any[] | undefined)?.filter((b) => isPendingBooking(b)).length ?? 0
	const expiringHoldCount = (approvalBookings as any[] | undefined)?.filter((b) => {
		const remaining = holdTimeRemaining(b)
		return isPendingBooking(b) && remaining !== null && remaining > 0 && remaining < 48 * 60 * 60 * 1000
	}).length ?? 0

	// Opens the confirm dialog, after checking there is actually something to cancel.
	const requestCancelBooking = () => {
		// Not logged in → push to login with callback
		if (!session) {
			toast({ title: "Please log in to cancel your booking", status: "info" })
			const cb = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/"
			router.push(`/login?_cb=${encodeURIComponent(cb)}`)
			return
		}

		// Logged in but no matching booking
		if (!myBooking?.bookingRef) {
			toast({
				title: "No active booking found",
				description:
					"If you booked as a guest, use the cancel link in your confirmation email.",
				status: "warning",
			})
			return
		}

		if (!myBooking.canCancel) {
			toast({ title: myBooking.cancelBlockedReason || "This booking can no longer be cancelled.", status: "warning" })
			return
		}

		setShowCancelDialog(true)
	}

	const handleCancelBooking = async () => {
		if (!myBooking?.bookingRef) return

		setIsCancelling(true)
		try {
			const res = await axios.post("/api/bookings/cancel", { bookingRef: myBooking.bookingRef })
			if (res.data?.status) {
				toast({ title: "Booking cancelled", status: "success" })
				setShowCancelDialog(false)
				await refetchMyBooking()
			} else {
				toast({ title: res.data?.message || "Cancel failed", status: "error" })
			}
		} catch (e: any) {
			toast({ title: e?.response?.data?.message || "Cancel failed", status: "error" })
		} finally {
			setIsCancelling(false)
		}
	}

	useEffect(() => {
		if (typeof window !== "undefined") {
			// Base share URL for the top share/QR buttons, without the view/scrollTo params.
			const url = new URL(window.location.href);
			url.searchParams.delete("view");
			url.searchParams.delete("scrollTo");
			setShareUrl(url.toString());

			// Auto focus on discussion section only if scroll parameter is present
			if (router.query.view === "feed" || router.query.scrollTo === "feed") {
				setTimeout(() => {
					const discussionBoard = document.getElementById("discussion-board");
					if (discussionBoard) {
						discussionBoard.scrollIntoView({ behavior: "smooth" });
					}
				}, 1000);
			}
			if (router.query.view === "discussion") {
				setIsChatExpanded(true)
				setTimeout(() => {
					document.getElementById("discussion-chat")?.scrollIntoView({ behavior: "smooth" })
				}, 1000)
			}
		}
	}, [router.query.view, router.query.scrollTo])

	// Share the URL only (no title/description) so mobile native share matches
	// desktop behaviour — copying the bare event link, not the description text.
	const sharer = useWebShare({
		url: shareUrl,
	})

	const { formattedDate, formattedTime } = useMemo(() => {
		if (!clonedEvent?.startsOn) return { formattedDate: "", formattedTime: "" }

		try {
			const userTimeZone = getEventZone(clonedEvent?.timezone)
			const date = dayjs.utc(clonedEvent.startsOn).tz(userTimeZone)

			const formattedDate = date.format("MMMM DD, YYYY")
			const formattedTime = clonedEvent?.hasStartTime !== false ? date.format("hh:mm A") : ""

			return { formattedDate, formattedTime }
		} catch (error) {
			console.error("Error formatting date:", error)
			return { formattedDate: "", formattedTime: "" }
		}
	}, [clonedEvent?.startsOn, clonedEvent?.timezone, clonedEvent?.hasStartTime])

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
					</div>
				</div>
			</div>
		)
	}

	// Use the canonical status (start-date driven, timezone-aware, matches the "ENDED" badge
	// in the listing) — not a raw endsOn check, which misses start-only events.
	const isEnded = clonedEvent ? getEventStatus(clonedEvent) === "past" : false

	try {
		return (
			<>
				<div className="min-h-screen py-8 px-4 sm:px-6 lg:px-7">
					<div className={`${isDatePollActive ? "max-w-6xl" : "max-w-4xl"} mx-auto mb-6 flex flex-wrap items-center justify-between gap-3`}>
						<div className="flex items-center gap-3">
							{/* Most traffic to an event page arrives from OUTSIDE Jetzy — email, QR, blast,
							    WhatsApp — into a tab whose history has one entry, where `router.back()`
							    either did nothing or threw the visitor off the site. `goBackOrTo` falls back
							    to their home when there is genuinely nowhere to go back to. */}
							<button
								onClick={() => goBackOrTo(router, homeRouteForRole((session?.user as any)?.role))}
								className="border border-[#434343] py-2 px-3 sm:px-4 text-sm sm:text-base rounded-lg hover:border-white text-white flex items-center gap-2"
							>
								<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
								</svg>
								Back
							</button>
						</div>
						{/* Up to four buttons here — Back, Manage Event, Manage membership, Logout —
						    which cannot fit 360px in one row. They used to wrap, which stair-stepped
						    three right-aligned buttons down the page above the banner. On mobile they
						    collapse into one menu instead; the desktop row is unchanged. */}
						<div className="hidden sm:flex flex-wrap items-center justify-end gap-2">
							{canManage && (
								<Link href={`/console/events/${clonedEvent._id}/manage`} className="border border-[#434343] py-2 px-3 sm:px-4 text-sm sm:text-base rounded-lg hover:border-white">
									Manage Event
								</Link>
							)}
							{/* A membership can be bought from this very page, so the way to cancel it
							    has to be reachable from here too — not only from /my-bookings. */}
							{session && isPremiumMember && (
								<button
									type="button"
									onClick={openPortal}
									disabled={isOpeningPortal}
									className="border py-2 px-3 sm:px-4 text-sm sm:text-base rounded-lg disabled:opacity-50"
									style={{ borderColor: "#F5C518", color: "#F5C518" }}
								>
									{portalLabel}
								</button>
							)}
							{session ? (
								<button
									data-analytics-ignore=""
									onClick={handleLogout}
									className="border border-[#434343] py-2 px-3 sm:px-4 text-sm sm:text-base rounded-lg hover:border-white text-red-400"
								>
									Logout
								</button>
							) : (
								<Link
									href={`/login?_cb=${encodeURIComponent(router.asPath)}`}
									className="border border-[#434343] py-2 px-3 sm:px-4 text-sm sm:text-base rounded-lg hover:border-white"
								>
									Login
								</Link>
							)}
						</div>

						{/* Mobile: one entry point. Logged out there is only ever one action, so it
						    stays a plain button rather than a menu holding a single item. */}
						<div className="sm:hidden">
							{session ? (
								<Menu placement="bottom-end">
									<MenuButton
										as={IconButton}
										aria-label="Account menu"
										icon={<Icon as={FiMoreHorizontal} boxSize={5} />}
										variant="outline"
										borderColor="#434343"
										color="white"
										borderRadius="lg"
										_hover={{ borderColor: "white", bg: "transparent" }}
										_active={{ bg: "transparent" }}
									/>
									<MenuList bg="#1E1E1E" borderColor="#434343" minW="200px" py={1}>
										{canManage && (
											<MenuItem as={Link} href={`/console/events/${clonedEvent._id}/manage`} bg="#1E1E1E" color="white" _hover={{ bg: "#2B2B2B" }} _focus={{ bg: "#2B2B2B" }}>
												Manage Event
											</MenuItem>
										)}
										{isPremiumMember && (
											<MenuItem onClick={openPortal} isDisabled={isOpeningPortal} bg="#1E1E1E" color="#F5C518" _hover={{ bg: "#2B2B2B" }} _focus={{ bg: "#2B2B2B" }}>
												{portalLabel}
											</MenuItem>
										)}
										{/* LOGOUT-SAFETY RULE (CLAUDE.md): the click tracker must not see this. */}
										<MenuItem data-analytics-ignore="" onClick={handleLogout} bg="#1E1E1E" color="red.300" _hover={{ bg: "#2B2B2B" }} _focus={{ bg: "#2B2B2B" }}>
											Logout
										</MenuItem>
									</MenuList>
								</Menu>
							) : (
								<Link
									href={`/login?_cb=${encodeURIComponent(router.asPath)}`}
									className="border border-[#434343] py-2 px-4 text-sm rounded-lg hover:border-white"
								>
									Login
								</Link>
							)}
						</div>
					</div>
					<div className={`${isDatePollActive ? "max-w-6xl mx-auto flex flex-col lg:flex-row lg:gap-6 lg:items-start" : "max-w-4xl mx-auto"}`}>
					<div className={`${isDatePollActive ? "flex-1 min-w-0" : ""} bg-[#4a49491e] border border-[#434343] backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all`}>
						{/* Banner Media (images + videos combined) */}
						<div className="relative p-3">
							{(() => {
								const allMedia = eventMedia(clonedEvent)
								if (allMedia.length > 1) {
									return (
										<Slider {...settings}>
											{allMedia.map((media, idx) => renderMedia(media, idx))}
										</Slider>
									)
								} else if (allMedia.length === 1) {
									return renderMedia(allMedia[0])
								} else {
									return (
										<div className="w-full h-52 md:h-[335px] bg-gray-800 flex items-center justify-center rounded-xl">
											<p className="text-gray-400">No image available</p>
										</div>
									)
								}
							})()}

							{/* Benefits Overlay */}
							{clonedEvent?.benefits && clonedEvent.benefits.trim() !== "" && (
								<div className="absolute top-6 left-6 z-20 flex flex-col gap-2 max-w-[80%]">
									{clonedEvent.benefits
										.split(",")
										.map((b) => b.trim())
										.filter((b) => b !== "")
										.map((benefit, index) => (
											<div
												key={index}
												className="bg-[#F79432] backdrop-blur-md border border-white/20 rounded-lg px-4 py-2 text-black text-sm font-bold shadow-xl transform transition-all duration-300 hover:scale-105"
												style={{
													animation: `fadeInUp 0.5s ease-out forwards ${index * 0.1}s`,
													opacity: 0,
													transform: "translateY(10px)",
												}}
											>
												{benefit}
											</div>
										))}
								</div>
							)}
							<style jsx>{`
								@keyframes fadeInUp {
									to {
										opacity: 1;
										transform: translateY(0);
									}
								}
							`}</style>
						</div>

						{/* Content Section */}
						<div className="p-4 sm:p-8">
							{/* Title + Actions row.
							    Left-aligned on mobile: the title was centred while the date and
							    location lines under it are icon-led and wrap, so a long venue
							    produced ragged centred text under a centred heading. */}
							<div className="flex flex-col sm:flex-row justify-between items-start mb-2 space-y-4 sm:space-y-0">
								<div className="text-left w-full sm:w-auto min-w-0">
									<h2 className="text-2xl sm:text-3xl font-bold break-words overflow-wrap-anywhere">{stripHtml(clonedEvent.name)}</h2>
									{/* `items-start` + a non-shrinking icon: a wrapping date or venue used to
									    squash the icon to a sliver and vertically centre it against two
									    lines of text. */}
									<p className="text-sm sm:text-base mt-4 sm:mt-5 flex items-start gap-x-2 text-[#bbbbbb] break-words">
										<span className="flex-shrink-0 mt-0.5"><DateTimeSVG /></span>
										{!clonedEvent?.startsOn && !clonedEvent?.endsOn && clonedEvent?.datePoll?.isActive
											? "Date to be decided (Polling)"
											: clonedEvent?.startsOn
											? `${formattedDate}${formattedTime ? `, ${formattedTime}` : ""} ${normalizeTimezone(clonedEvent?.timezone)}`
											: "Date to be decided"}
									</p>
									<p className="text-sm sm:text-base mt-1 flex items-start gap-x-2 text-[#bbbbbb] break-words">
										{!canSeeLocation ? (
											<span className="break-words overflow-wrap-anywhere">
												📍 Location will be disclosed after registration
											</span>
										) : (
											<>
												<span className="flex-shrink-0 mt-0.5"><LocationSVG /></span>
												<span className="break-words overflow-wrap-anywhere">
													{disclosedLocation}
												</span>
											</>
										)}
									</p>
								</div>

								{/* Icon buttons stay in a row; the CTAs take the remaining width on a
								    phone so the primary action is a full-size tap target instead of a
								    pill squeezed between icons. */}
								<div className="w-full sm:w-auto flex items-center gap-2 sm:gap-x-3 sm:items-end flex-shrink-0 flex-wrap">
									{canManage && (
										<button
											onClick={onQRModalOpen}
											className="bg-[#333333] border-[#474747] font-bold text-gray-700 p-2.5 whitespace-nowrap rounded-full transition-all hover:bg-[#444]"
											title="Show Event QR Code"
										>
											<QrCodeIconOutline className="w-5 h-5 sm:w-6 sm:h-6 text-white inline-block" />
										</button>
									)}
									<button onClick={() => sharer.share()} aria-label="Share event" className="bg-[#333333] border-[#474747] font-bold text-gray-700 p-2.5 whitespace-nowrap rounded-full transition-all hover:bg-[#444]">
										<ShareIcon className="w-5 h-5 sm:w-6 sm:h-6 text-white inline-block" />
									</button>
									{session && (
										<button
											onClick={onInviteModalOpen}
											className="bg-[#333333] border-[#474747] font-bold text-gray-700 p-2.5 whitespace-nowrap rounded-full transition-all hover:bg-[#444]"
											title="Invite Friends"
										>
											<UserPlusIcon className="w-5 h-5 sm:w-6 sm:h-6 text-white inline-block" />
										</button>
									)}

									{/* Hidden once the event has ended (host/admin keep it for reference). */}
									{(!isEnded || canManage) && (
										<a
											role="button"
											href="#event-tickets"
											className="flex-1 min-w-[130px] text-center sm:flex-none bg-[#F79432] text-black font-bold px-6 py-3 whitespace-nowrap rounded-full transition-all transform hover:scale-105 shadow-lg text-sm"
										>
											Get Tickets
										</a>
									)}
									{/* Only shown when the viewer actually has a cancellable booking — the
									    API decides that, including the event-start cutoff. */}
									{myBooking?.canCancel && !isEnded && (
										<button
											onClick={requestCancelBooking}
											disabled={isCancelling}
											className="w-full sm:w-auto bg-[#7C1D1D] text-white font-bold px-6 py-3 whitespace-nowrap rounded-full transition-all transform hover:scale-105 shadow-lg text-sm disabled:opacity-60 disabled:cursor-not-allowed"
										>
											{isCancelling ? "Cancelling..." : "Cancel Booking"}
										</button>
									)}
								</div>
							</div>

							{/* Full-width teaser + description below the header row */}
							<div className="mt-5">
								{isDatePollActive && (
									<DatePollTeaser event={clonedEvent} onOpenPoll={onPollModalOpen} />
								)}
								<h3 className="text-sm sm:text-base font-semibold">Description</h3>
								<EventDescription description={clonedEvent.desc} />
							</div>
						</div>
					</div>
					{isDatePollActive && (
						<div className="hidden lg:block w-[360px] flex-shrink-0 sticky top-8 self-start">
							<DatePollSidebar event={clonedEvent} isAdmin={isAdmin} />
						</div>
					)}
					</div>

					{isAdmin && clonedEvent?._id && (
						<div className={`${isDatePollActive ? "max-w-6xl mx-auto lg:pr-[384px]" : "max-w-4xl mx-auto"} mt-8`}>
							{/* Admin Tabs */}
							<div className="bg-[#5656561e] border border-[#434343] rounded-2xl shadow-2xl overflow-hidden">
								{/* Section header toggle */}
								<button
									onClick={() => setIsManageListsOpen((v) => !v)}
									className="w-full flex items-center justify-between px-6 py-4 text-left font-semibold text-white hover:bg-[#434343] transition-colors"
									aria-expanded={isManageListsOpen}
								>
									<span>Bookings & Waiting List</span>
									<Icon as={isManageListsOpen ? FiChevronUp : FiChevronDown} color="white" boxSize={5} />
								</button>

								{isManageListsOpen && (
									<>
										{/* Tab Headers */}
										<div className="flex border-y border-[#434343]">
											<button
												onClick={() => setActiveTab("bookings")}
												className={`flex-1 px-6 py-4 text-left font-semibold transition-colors ${activeTab === "bookings" ? "bg-[#F79432] text-black" : "text-white hover:bg-[#434343]"}`}
											>
												Bookings
											</button>
											<button
												onClick={() => setActiveTab("waiting-list")}
												className={`flex-1 px-6 py-4 text-left font-semibold transition-colors ${activeTab === "waiting-list" ? "bg-[#F79432] text-black" : "text-white hover:bg-[#434343]"}`}
											>
												Waiting List
											</button>
											{eventHasAnyApprovalTicket(clonedEvent as any) && (
												<button
													onClick={() => setActiveTab("approvals")}
													className={`flex-1 px-6 py-4 text-left font-semibold transition-colors flex items-center gap-2 ${activeTab === "approvals" ? "bg-[#F79432] text-black" : "text-white hover:bg-[#434343]"}`}
												>
													Approvals
													{pendingApprovalCount > 0 && (
														<span className={`text-xs font-bold rounded-full px-2 py-0.5 ${activeTab === "approvals" ? "bg-black text-[#F79432]" : "bg-[#F79432] text-black"}`}>
															{pendingApprovalCount}
														</span>
													)}
													{expiringHoldCount > 0 && (
														<span className="text-xs font-bold rounded-full px-2 py-0.5 bg-red-500 text-white" title="Card hold(s) expiring within 48 hours">
															!
														</span>
													)}
												</button>
											)}
										</div>

										{/* Tab Content */}
										<div className="p-6">
											{activeTab === "bookings" && <EventBookings eventId={clonedEvent._id.toString()} />}
											{activeTab === "waiting-list" && <EventWaitingList eventId={clonedEvent._id.toString()} eventName={clonedEvent.name} />}
											{/* `surfaceBg` is what the frozen Actions/Guest columns paint themselves
											    with so the scrolling columns don't show through. This panel is a
											    translucent grey over the dark page rather than a flat colour, so this
											    is the composite it resolves to. */}
											{activeTab === "approvals" && eventHasAnyApprovalTicket(clonedEvent as any) && <ApprovalRequests eventId={clonedEvent._id.toString()} event={clonedEvent} surfaceBg="#1A1A1A" />}
										</div>
									</>
								)}
							</div>
						</div>
					)}

					<div className={isDatePollActive ? "max-w-6xl mx-auto lg:pr-[384px]" : ""}>
					{isAdmin && clonedEvent?._id && <GuestsList eventId={clonedEvent._id.toString()} />}

					{/* Tickets are hidden once the event has ended, except for host/admin. */}
					{clonedEvent && (!isEnded || canManage) && <EventTicketsComponent event={clonedEvent} />}

					{clonedEvent?._id && (
						<div className={isDatePollActive ? "" : "max-w-4xl mx-auto"}>
							<EventAlbums
								eventId={clonedEvent._id.toString()}
								eventSlug={clonedEvent.slug}
								eventName={stripHtml(clonedEvent.name)}
								canManage={canManage}
							/>
						</div>
					)}

					{clonedEvent?._id && (
						<div id="discussion-section" className={`${isDatePollActive ? "" : "max-w-4xl mx-auto"} mt-8`}>
							<div className="bg-[#4a49491e] border border-[#434343] backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden mt-8">
							<Box mt={4} px={4}>
								{/* Discussion/Chat Section */}
								<Box id="discussion-chat" mb={10}>
									<Flex justify="space-between" align="center" mb={4} pl={2}>
										<Box
											cursor="pointer"
											onClick={() => setIsChatExpanded((v) => !v)}
											role="button"
											aria-expanded={isChatExpanded}
											aria-controls="discussion-chat-body"
										>
											<Flex align="center" gap={2}>
												<Heading size="md" color="white">Discussion</Heading>
												<Icon as={isChatExpanded ? FiChevronUp : FiChevronDown} color="white" boxSize={5} />
											</Flex>
											<Text color="#bbbbbb" fontSize="sm" mt={1}>
												Chat with other attendees.
											</Text>
										</Box>
										{canManage && (
											<Flex gap={3}>
												<Button
													size="sm"
													leftIcon={<FiShare2 />}
													bg="whiteAlpha.100"
													color="white"
													_hover={{ bg: "whiteAlpha.200" }}
													borderRadius="full"
													onClick={() => {
														const discussionUrl = `${window.location.origin}${window.location.pathname}?view=discussion`
														navigator.clipboard.writeText(discussionUrl)
														toast({ title: "Discussion Link Copied!", description: "Share this link to bring users directly to the discussion.", status: "success", duration: 2000, isClosable: true })
													}}
												>
													Share Chat
												</Button>
												<IconButton
													aria-label="Show Chat QR Code"
													icon={<Icon as={QrCodeIconOutline} />}
													size="sm"
													bg="whiteAlpha.100"
													color="white"
													_hover={{ bg: "whiteAlpha.200" }}
													borderRadius="full"
													onClick={onDiscussionQRModalOpen}
												/>
											</Flex>
										)}
									</Flex>
									{session ? (
										// Keep the chat iframe mounted even when collapsed so it can load and
										// report its message state (jetzychat-state) to auto-expand this dropdown.
										// Hidden via CSS, not unmounted.
										<Box id="discussion-chat-body" display={isChatExpanded ? "block" : "none"}>
											<JetzyChatIntegration
												eventId={clonedEvent._id.toString()}
												eventName={stripHtml(clonedEvent.name)}
												onHasMessages={() => setIsChatExpanded(true)}
											/>
										</Box>
									) : (
										isChatExpanded && (
											<Box id="discussion-chat-body" p={8} textAlign="center" bg="#2b2b2b" borderRadius="lg" border="1px solid" borderColor="#434343">
												<Text fontSize="lg" fontWeight="bold" color="white" mb={2}>
													Login Required
												</Text>
												<Text color="#bbbbbb" mb={4}>
													Please login to access the discussion.
												</Text>
												<Button
													onClick={() => {
														router.push(`${ROUTES?.login || '/login'}?_cb=${encodeURIComponent(router.asPath)}`)
													}}
													bg="#F79432"
													color="black"
													_hover={{ bg: "#e58220" }}
												>
													Login
												</Button>
											</Box>
										)
									)}
								</Box>

							</Box>
							</div>

							{/* Feed Section (Formerly DiscussionBoard) */}
							<Box id="discussion-board">
								<DiscussionBoard eventId={clonedEvent._id.toString()} canManage={canManage} />
							</Box>
						</div>
					)}
					</div>
				</div>
				{clonedEvent?.name && <EventCheckoutModel event={stripHtml(clonedEvent.name)} eventData={clonedEvent} />}

			{/* Cancelling is irreversible and, for a paid booking, costs the guest their
			    money — so it goes through the shared warning dialog, never window.confirm. */}
			<CancelBookingDialog
				isOpen={showCancelDialog}
				onClose={() => setShowCancelDialog(false)}
				onConfirm={handleCancelBooking}
				isLoading={isCancelling}
				eventName={stripHtml(clonedEvent?.name || "")}
				moneyState={(myBooking?.moneyState || "free") as MoneyState}
				amount={Number(myBooking?.moneyAmount || 0)}
			/>
	
				{/* QR Code Modal for Event */}
				{canManage && (
					<QRCodeModal
						isOpen={isQRModalOpen}
						onClose={onQRModalClose}
						url={shareUrl}
						title={`${stripHtml(clonedEvent.name)}`}
					/>
				)}

				{/* QR Code Modal for Discussion/Chat */}
				{canManage && (
					<QRCodeModal
						isOpen={isDiscussionQRModalOpen}
						onClose={onDiscussionQRModalClose}
						url={`${typeof window !== 'undefined' ? window.location.origin : ''}${router.asPath.split('?')[0]}?view=discussion`}
						title="Event Discussion"
					/>
				)}
				{/* Invite Friends Modal */}
				{/* Mobile Date Poll Modal */}
				{isDatePollActive && (
					<Modal isOpen={isPollModalOpen} onClose={onPollModalClose} isCentered size="lg" blockScrollOnMount={false}>
						<ModalOverlay />
						<ModalContent bg="#1a1c20" color="white" borderRadius="2xl" border="1px solid #333" mx={3}>
							<ModalHeader fontSize="md" pb={0}>Event Date Poll</ModalHeader>
							<ModalCloseButton />
							<ModalBody pb={6} px={4}>
								<DatePollSidebar event={clonedEvent} isAdmin={isAdmin} />
							</ModalBody>
						</ModalContent>
					</Modal>
				)}
				<Modal
		isOpen={isInviteModalOpen}
		onClose={() => { onInviteModalClose(); setInviteSearch(""); setInviteResults([]); setSelectedInvitees([]); setInviteMessage("") }}
		isCentered
		size="md"
		blockScrollOnMount={false}
	>
					<ModalOverlay />
					<ModalContent bg="#1E1E1E" color="white">
						<ModalHeader>Invite Friends</ModalHeader>
						<ModalCloseButton />
						<ModalBody>
							{/* Search input */}
							<FormControl mb={3}>
								<FormLabel fontSize="sm" color="gray.400">Search by name or email</FormLabel>
								<Input
									placeholder="Type a name or email..."
									bg="#090C10"
									border="1px solid #444"
									value={inviteSearch}
									onChange={(e) => setInviteSearch(e.target.value)}
								/>
							</FormControl>
							{/* Search results */}
							{isSearching && <Text fontSize="sm" color="gray.500" mb={2}>Searching...</Text>}
							{!isSearching && inviteSearch.trim().length >= 2 && (
								<Box bg="#090C10" border="1px solid #444" rounded="md" mb={3} maxH="220px" overflowY="auto">
									{inviteResults.map((u) => {
										const alreadySelected = selectedInvitees.some((s) => s._id === u._id)
										return (
											<Flex
												key={u._id}
												align="center"
												justify="space-between"
												px={3}
												py={2}
												_hover={{ bg: "#1C1F24" }}
												cursor="pointer"
												onClick={() => {
													if (!alreadySelected) {
														setSelectedInvitees((prev) => [...prev, u])
													}
													setInviteSearch("")
													setInviteResults([])
												}}
											>
												<Flex align="center" gap={2}>
													{u.image
														? <img src={u.image} alt="" className="w-7 h-7 rounded-full object-cover" />
														: <Box w="28px" h="28px" rounded="full" bg="#F79432" display="flex" alignItems="center" justifyContent="center" fontSize="xs" fontWeight="bold" color="black">{u.firstName[0]}{u.lastName[0]}</Box>
													}
													<Box>
														<Text fontSize="sm">{u.firstName} {u.lastName}</Text>
														<Text fontSize="xs" color="gray.500">{u.email}</Text>
													</Box>
												</Flex>
												{alreadySelected && <Text fontSize="xs" color="green.400">Added</Text>}
											</Flex>
										)
									})}
									{/* Email fallback: always show if typed value looks like an email */}
									{/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteSearch.trim()) &&
										!selectedInvitees.some((s) => s.email === inviteSearch.trim()) && (
										<Flex
											align="center"
											gap={2}
											px={3}
											py={2}
											_hover={{ bg: "#1C1F24" }}
											cursor="pointer"
											borderTop={inviteResults.length > 0 ? "1px solid #333" : undefined}
											onClick={() => {
												const email = inviteSearch.trim()
												setSelectedInvitees((prev) => [...prev, { _id: email, firstName: email, lastName: "", email }])
												setInviteSearch("")
												setInviteResults([])
											}}
										>
											<Box w="28px" h="28px" rounded="full" bg="#333" display="flex" alignItems="center" justifyContent="center" fontSize="lg" color="#F79432">+</Box>
											<Box>
												<Text fontSize="sm" color="#F79432">Invite <strong>{inviteSearch.trim()}</strong></Text>
												<Text fontSize="xs" color="gray.500">Send invite directly to this email</Text>
											</Box>
										</Flex>
									)}
									{inviteResults.length === 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteSearch.trim()) && (
										<Text fontSize="sm" color="gray.500" px={3} py={2}>No users found. Enter a full email address to invite directly.</Text>
									)}
								</Box>
							)}
							{/* Selected users chips */}
							{selectedInvitees.length > 0 && (
								<Box mb={3}>
									<Text fontSize="xs" color="gray.400" mb={1}>Selected ({selectedInvitees.length})</Text>
									<Flex flexWrap="wrap" gap={2}>
										{selectedInvitees.map((u) => (
											<Flex key={u._id} align="center" gap={1} bg="#2B2B2B" px={2} py={1} rounded="full" fontSize="xs">
												<Text>{u.lastName ? `${u.firstName} ${u.lastName}` : u.email}</Text>
												<Box as="button" color="gray.400" _hover={{ color: "red.400" }} onClick={() => setSelectedInvitees((prev) => prev.filter((s) => s._id !== u._id))}>&times;</Box>
											</Flex>
										))}
									</Flex>
								</Box>
							)}
							{/* Optional message */}
							<FormControl mb={2}>
								<FormLabel fontSize="sm" color="gray.400">Personal message (optional)</FormLabel>
								<Textarea
									placeholder="Hey, join me at this event!"
									bg="#090C10"
									border="1px solid #444"
									rows={3}
									value={inviteMessage}
									onChange={(e) => setInviteMessage(e.target.value)}
								/>
							</FormControl>
						</ModalBody>
						<ModalFooter gap={3}>
							<Button
								bg="#F79432"
								color="black"
								isDisabled={selectedInvitees.length === 0}
								isLoading={isSendingInvite}
								onClick={async () => {
									if (selectedInvitees.length === 0) return
									setIsSendingInvite(true)
									try {
										await axios.post("/api/send-invites", {
											emails: selectedInvitees.map((u) => u.email),
											eventId: clonedEvent._id,
											eventLink: shareUrl,
											subject: `You're invited to ${stripHtml(clonedEvent.name)}`,
											message: inviteMessage || `Join me at ${stripHtml(clonedEvent.name)}!`,
										})
										toast({ title: "Invitations sent!", status: "success", duration: 3000, isClosable: true })
										setSelectedInvitees([])
										setInviteMessage("")
										onInviteModalClose()
									} catch {
										toast({ title: "Failed to send invitations", status: "error", duration: 3000, isClosable: true })
									} finally {
										setIsSendingInvite(false)
									}
								}}
							>
								Send Invites ({selectedInvitees.length})
							</Button>
							<Button variant="ghost" color="white" _hover={{ color: "black", bg: "orange" }} onClick={onInviteModalClose}>Cancel</Button>
						</ModalFooter>
					</ModalContent>
				</Modal>
			</>
		)
	} catch (error) {
		console.error("Error in HostedEvents render:", error)
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

function GuestsList({ eventId }: { eventId: string }) {
	const [isOpen, setIsOpen] = React.useState(false)
	const [page, setPage] = React.useState(1)
	const perPage = 10

	const { data: guests, isLoading } = useQuery({
		queryKey: ["eventGuests", eventId],
		queryFn: () => axios.get(`/api/events/guests?eventId=${eventId}`),
	})

	const list: { _id: string; name: string }[] = Array.isArray(guests?.data?.data) ? guests.data.data : []
	const paged = list.slice((page - 1) * perPage, page * perPage)

	return (
		<div className="max-w-4xl mx-auto bg-[#5656561e] border border-[#434343] rounded-2xl shadow-2xl overflow-hidden mt-8">
			<button
				onClick={() => setIsOpen((v) => !v)}
				className="w-full flex items-center justify-between px-6 py-4 text-left font-semibold text-white hover:bg-[#434343] transition-colors"
				aria-expanded={isOpen}
			>
				<span>Guests{!isLoading ? ` (${list.length})` : ""}</span>
				<Icon as={isOpen ? FiChevronUp : FiChevronDown} color="white" boxSize={5} />
			</button>

			{isOpen && (
				<div className="px-6 pb-4 border-t border-[#434343] pt-4">
					<ul className="space-y-3">
						{isLoading && <li className="text-gray-400 text-sm">Loading guests...</li>}

						{!isLoading && list.length === 0 && <li className="text-gray-500 italic text-sm">No guests found for this event.</li>}

						{paged.map((guest) => {
							if (!guest) return null
							return (
								<li key={guest._id} className="flex items-center justify-between bg-[#2a2a2a] border border-[#3a3a3a] rounded-lg px-4 py-3 shadow-sm hover:bg-[#333] transition">
									<div className="flex items-center gap-4">
										<div className="w-9 h-9 rounded-full bg-[#444] flex items-center justify-center text-white font-semibold uppercase">{guest.name?.charAt(0) || "?"}</div>
										<span className="text-white font-medium">{guest.name || "Unknown Guest"}</span>
									</div>
								</li>
							)
						})}
					</ul>

					<Pagination totalItems={list.length} perPageItems={perPage} pageNo={page} onPageChange={setPage} />
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
	/** Absent on free bookings and on anything predating paid approval. */
	payment?: {
		status?: string
		amount?: number
		authExpiresAt?: string
		capturedAt?: string
		lastError?: string
	}
}

/** Status pill for the admin bookings list — must distinguish "money held" from "money taken". */
function BookingStatusPill({ booking }: { booking: Booking }) {
	const paymentStatus = booking.payment?.status
	const amount = booking.payment?.amount

	if (paymentStatus === "authorized" || paymentStatus === "capturing") {
		const expired = booking.payment?.authExpiresAt && new Date(booking.payment.authExpiresAt) < new Date()
		return (
			<span className={`text-xs font-semibold ${expired ? "text-red-400" : "text-amber-400"}`}>
				{expired ? "hold expired" : `pending · $${Number(amount || 0).toFixed(2)} on hold`}
			</span>
		)
	}
	if (paymentStatus === "failed") return <span className="text-xs font-semibold text-red-400">charge failed</span>
	if (paymentStatus === "expired") return <span className="text-xs font-semibold text-red-400">hold expired</span>
	if (paymentStatus === "canceled") return <span className="text-xs font-semibold text-gray-400">{booking.status} · hold released</span>
	if (paymentStatus === "captured") return <span className="text-xs font-semibold text-green-400">{booking.status} · charged</span>

	// Free bookings / legacy rows: pending is not the same as confirmed, so don't paint it green.
	const color = booking.status === "cancelled" || booking.status === "rejected" || booking.status === "failed"
		? "text-red-400"
		: booking.status === "pending"
			? "text-amber-400"
			: "text-green-400"
	return <span className={`text-xs font-semibold ${color}`}>{booking.status}</span>
}

function EventBookings({ eventId }: { eventId: string }) {
	const [page, setPage] = React.useState(1)
	const [openId, setOpenId] = React.useState<string | null>(null)
	const perPage = 10

	const { data: bookings, isLoading } = useQuery({
		queryKey: ["eventBookings", eventId],
		queryFn: () => axios.get(`/api/events/${eventId}/event-bookings`),
	})

	const { data: totals, isLoading: totalsLoading } = useQuery({
		queryKey: ["eventTotals", eventId],
		queryFn: () => axios.get(`/api/events/${eventId}/totals`),
	})

	const { totalTickets, uniqueCustomers, cancelledTickets, cancelledGuests, pendingTickets, pendingGuests } = React.useMemo(() => {
		if (!totals?.data) return { totalTickets: 0, uniqueCustomers: 0, cancelledTickets: 0, cancelledGuests: 0, pendingTickets: 0, pendingGuests: 0 }

		return {
			totalTickets: totals.data.totalTickets || 0,
			uniqueCustomers: totals.data.uniqueGuests || 0,
			cancelledTickets: totals.data.cancelledTickets || 0,
			cancelledGuests: totals.data.cancelledGuests || 0,
			pendingTickets: totals.data.pendingTickets || 0,
			pendingGuests: totals.data.pendingGuests || 0,
		}
	}, [totals?.data])

	const list: Booking[] = Array.isArray(bookings?.data) ? bookings.data : []
	const paged = list.slice((page - 1) * perPage, page * perPage)

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
							{(pendingTickets > 0 || pendingGuests > 0) && (
								<div className="flex space-x-4">
									<span className="font-semibold text-white">Awaiting Approval:</span>
									<span className="text-amber-400">{pendingTickets}</span>
									<span className="font-semibold text-white">Pending Customers:</span>
									<span className="text-amber-400">{pendingGuests}</span>
								</div>
							)}
							{(cancelledTickets > 0 || cancelledGuests > 0) && (
								<div className="flex space-x-4">
									<span className="font-semibold text-white">Inactive Tickets:</span>
									<span className="text-red-400">{cancelledTickets}</span>
									<span className="font-semibold text-white">Inactive Customers:</span>
									<span className="text-red-400">{cancelledGuests}</span>
								</div>
							)}
						</div>
					</div>
				)}
			</div>

			{isLoading && <p className="text-gray-300">Loading bookings...</p>}

			{!isLoading && list.length === 0 && <p className="text-gray-300">No bookings found for this event.</p>}

			{!isLoading &&
				paged.map((booking: Booking) => {
					const isOpen = openId === booking._id
					const cancelled = booking.status === "cancelled"
					// Authorized funds are not collected funds — never render them as plain revenue.
					const onHold = booking.payment?.status === "authorized" || booking.payment?.status === "capturing" || booking.payment?.status === "failed"
					const bookingDiscount = describeDiscount(booking as any)
					// Memberships sold with the ticket. `booking.total` is the TICKET; the card was
					// charged ticket + the first period of each of these, so without them the panel
					// shows a $90 total above a $110 charge and never says where the $20 came from.
					const bookingMembershipRows = bookingMemberships(booking.payment as any)
					return (
						<div key={booking._id} className={`border-b border-[#434343] last:border-b-0 ${cancelled ? "opacity-60" : ""}`}>
							<button
								type="button"
								onClick={() => setOpenId(isOpen ? null : booking._id)}
								className="w-full flex items-center justify-between gap-4 py-4 text-left"
								aria-expanded={isOpen}
							>
								<div className="min-w-0">
									<p className="text-sm font-semibold text-white truncate">{booking.customerName}</p>
									<p className="text-xs text-[#bbbbbb] mt-0.5 truncate">Ref: {booking.bookingRef}</p>
								</div>
								<div className="flex items-center gap-4 flex-shrink-0">
									<BookingStatusPill booking={booking} />
									<span className={`text-sm font-semibold ${onHold ? "text-amber-400" : "text-white"}`}>${booking.total}</span>
									<Icon as={isOpen ? FiChevronUp : FiChevronDown} color="white" boxSize={5} />
								</div>
							</button>

							{isOpen && (
								<div className="pb-4">
									<p className="text-sm text-[#bbbbbb]">
										<span className="font-semibold text-white">Email:</span> {booking.customerEmail}
									</p>
									<p className="text-sm text-[#bbbbbb] mt-1">
										<span className="font-semibold text-white">Phone:</span> {booking.customerPhone}
									</p>
									<p className="text-sm text-[#bbbbbb] mt-1">
										<span className="font-semibold text-white">Created:</span> {new Date(booking.createdAt).toLocaleString()}
									</p>

									<div className="mt-3">
										<p className="font-semibold text-white text-sm">Tickets:</p>
										{booking.tickets.length > 0 ? (
											<ul className="list-disc pl-5 mt-1 text-[#bbbbbb] text-sm">
												{booking.tickets.map((ticket) => (
													<li key={ticket._id}>
														Quantity: <span className="text-white">{ticket.quantity}</span>
													</li>
												))}
											</ul>
										) : (
											<p className="mt-1 text-[#bbbbbb] text-sm">No-ticket event (registration only)</p>
										)}
									</div>

									{/* Subtotal and Total used to sit either side of a Tax line that is
									    structurally always $0 — nothing writes a non-zero value — while the
									    discount that actually explains the gap wasn't shown at all. A $95
									    subtotal next to a $0 total read as a broken calculation instead of a
									    comped ticket. Tax now only appears if it is ever non-zero. */}
									<div className="flex items-center flex-wrap gap-x-6 gap-y-1 text-sm mt-3 text-[#bbbbbb]">
										<p>
											<span className="font-semibold text-white">Subtotal:</span> ${booking.subTotal}
										</p>
										{bookingDiscount.discounted && (
											<p className="text-[#F5C518]">
												<span className="font-semibold">Discount:</span> −${bookingDiscount.amount.toFixed(2)}
												{bookingDiscount.code ? ` (${bookingDiscount.code})` : ""}
											</p>
										)}
										{Number(booking.tax) > 0 && (
											<p>
												<span className="font-semibold text-white">Tax:</span> ${booking.tax}
											</p>
										)}
										<p>
											<span className="font-semibold text-white">{onHold ? "On hold:" : "Total:"}</span> ${booking.total}
										</p>
									</div>

									{booking.payment?.status && (
										<div className={`mt-3 rounded-lg p-3 text-sm border ${
											booking.payment.status === "captured"
												? "bg-green-500/10 border-green-500/40"
												: booking.payment.status === "authorized" || booking.payment.status === "capturing"
													? "bg-amber-500/10 border-amber-500/40"
													: "bg-red-500/10 border-red-500/40"
										}`}>
											{booking.payment.status === "captured" && (
												<p className="text-green-300">
													Charged <span className="font-semibold">${Number(booking.payment.amount || 0).toFixed(2)}</span>
													{booking.payment.capturedAt ? ` on ${new Date(booking.payment.capturedAt).toLocaleString()}` : ""}.
												</p>
											)}
											{(booking.payment.status === "authorized" || booking.payment.status === "capturing") && (
												<>
													<p className="text-amber-300 font-semibold">
														Awaiting approval — ${Number(booking.payment.amount || 0).toFixed(2)} held, not charged.
													</p>
													{booking.payment.authExpiresAt && (
														<p className="text-[#bbbbbb] text-xs mt-1">
															Hold expires {new Date(booking.payment.authExpiresAt).toLocaleString()} — after that it is released automatically and cannot be recovered. Approve or decline in the Approvals tab.
														</p>
													)}
												</>
											)}
											{booking.payment.status === "failed" && (
												<>
													<p className="text-red-300 font-semibold">Charge failed — the guest has not been charged.</p>
													{booking.payment.lastError && <p className="text-[#bbbbbb] text-xs mt-1">{booking.payment.lastError}</p>}
												</>
											)}
											{booking.payment.status === "expired" && (
												<p className="text-red-300">Card hold expired before review. Never charged — the guest must book again.</p>
											)}
											{booking.payment.status === "canceled" && (
												<p className="text-[#bbbbbb]">
													Hold of ${Number(booking.payment.amount || 0).toFixed(2)} released. The guest was not charged.
												</p>
											)}

											{/* Why the card amount differs from the ticket total. A bundled order
											    charges the ticket PLUS the first period of each membership sold
											    with it, so this panel otherwise showed "Total: $90" above
											    "Charged $110.00" with nothing to account for the $20. */}
											{bookingMembershipRows.length > 0 && (
												<div className="mt-2 pt-2 border-t border-white/15 text-xs text-[#bbbbbb]">
													<p className="font-semibold text-white/80 mb-1">What this covers</p>
													<div className="flex justify-between gap-3">
														<span>Ticket</span>
														<span>${Number(booking.total || 0).toFixed(2)}</span>
													</div>
													{bookingMembershipRows.map((row: any) => (
														<div key={row.key} className="flex justify-between gap-3">
															<span>
																{MEMBERSHIPS[row.key as MembershipKey]?.receiptLabel || row.key} (first {row.interval || "month"})
																{row.status === "failed" ? " — not started" : ""}
															</span>
															<span>${(Number(row.amount) || 0).toFixed(2)}</span>
														</div>
													))}
												</div>
											)}
										</div>
									)}
								</div>
							)}
						</div>
					)
				})}

			<Pagination totalItems={list.length} perPageItems={perPage} pageNo={page} onPageChange={setPage} />
		</div>
	)
}

function EventWaitingList({ eventId, eventName }: { eventId: string; eventName: string }) {
	const [page, setPage] = React.useState(1)
	const [openId, setOpenId] = React.useState<string | null>(null)
	const perPage = 10

	const {
		data: waitingList,
		isLoading,
		refetch,
	} = useQuery({
		queryKey: ["eventWaitingList", eventId],
		queryFn: () => axios.get(`/api/waiting-list/${eventId}`),
	})

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

	const list: any[] = Array.isArray(waitingList?.data?.data) ? waitingList.data.data : []
	const paged = list.slice((page - 1) * perPage, page * perPage)

	return (
		<div>
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-lg font-semibold text-white">Waiting List</h3>
				{!isLoading && (
					<div className="text-sm text-white">
						<span className="font-semibold text-white">Total: {list.length} users</span>
					</div>
				)}
			</div>

			{isLoading && <p className="text-gray-300">Loading waiting list...</p>}

			{!isLoading && list.length === 0 && <p className="text-gray-300">No users on waiting list.</p>}

			{!isLoading &&
				paged.map((user: any) => {
					const isOpen = openId === user._id
					return (
						<div key={user._id} className="border-b border-[#434343] last:border-b-0">
							<div className="flex justify-between items-center gap-4 py-4">
								<button
									type="button"
									onClick={() => setOpenId(isOpen ? null : user._id)}
									className="flex items-center gap-3 min-w-0 flex-1 text-left"
									aria-expanded={isOpen}
								>
									<div className="min-w-0">
										<p className="text-sm font-semibold text-white truncate">
											{user.firstName} {user.lastName}
										</p>
										<p className="text-xs text-[#bbbbbb] mt-0.5 truncate">{user.email}</p>
									</div>
									<Icon as={isOpen ? FiChevronUp : FiChevronDown} color="white" boxSize={5} className="flex-shrink-0" />
								</button>

								<div className="flex gap-2 flex-shrink-0">
									<button
										onClick={(e) => {
											e.stopPropagation()
											handleApprove(user._id)
										}}
										className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
									>
										Approve
									</button>
									<button
										onClick={(e) => {
											e.stopPropagation()
											handleRemove(user._id)
										}}
										className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 transition-colors"
									>
										Remove
									</button>
								</div>
							</div>

							{isOpen && (
								<div className="pb-4">
									<p className="text-sm text-[#bbbbbb]">
										<span className="font-semibold text-white">Phone:</span> {user.phone}
									</p>
									<p className="text-sm text-[#bbbbbb] mt-1">
										<span className="font-semibold text-white">Joined:</span> {new Date(user.createdAt).toLocaleString()}
									</p>

									<div className="mt-3">
										<p className="font-semibold text-white text-sm">Requested Tickets:</p>
										{user.tickets.length > 0 ? (
											<ul className="list-disc pl-5 mt-1 text-[#bbbbbb] text-sm">
												{user.tickets.map((ticket: any, index: number) => (
													<li key={index}>
														{ticket.quantity} x {ticket.name} (${ticket.price} each)
													</li>
												))}
											</ul>
										) : (
											<p className="mt-1 text-[#bbbbbb] text-sm">No-ticket event (registration only)</p>
										)}
									</div>
								</div>
							)}
						</div>
					)
				})}

			<Pagination totalItems={list.length} perPageItems={perPage} pageNo={page} onPageChange={setPage} />
		</div>
	)
}

function DatePollSidebar({ event, isAdmin }: { event: IEvent; isAdmin: boolean }) {
	const [localSelectedId, setLocalSelectedId] = React.useState<string | null>(null)
	const [submittedId, setSubmittedId] = React.useState<string | null>(null)
	const [pollData, setPollData] = React.useState<any>(event.datePoll)
	const [isVoting, setIsVoting] = React.useState(false)
	const [showVotesModal, setShowVotesModal] = React.useState(false)
	const toast = useToast()

	React.useEffect(() => {
		if (!(event as any)?._id) return
		fetch(`/api/events/${(event as any)?._id}/poll`)
			.then((res) => res.json())
			.then((data) => {
				if (data?.status && data?.data) {
					setPollData(data.data)
					if (data.data.yourVote) {
						setLocalSelectedId(data.data.yourVote)
						setSubmittedId(data.data.yourVote)
					}
				}
			})
			.catch(console.error)
	}, [(event as any)?._id])

	const totalVotes = pollData?.totalVotes || (pollData?.options || []).reduce((sum: number, o: any) => sum + (o.voters?.length || o.voteCount || o.votes?.length || 0), 0)
	const allVoters = (pollData?.options || []).flatMap((o: any) => o.voters || [])

	const handleSubmit = async () => {
		if (!localSelectedId || isAdmin || isVoting) return
		setIsVoting(true)
		try {
			const res = await fetch(`/api/events/${(event as any)._id}/poll/vote`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ optionId: localSelectedId }),
			})
			const data = await res.json()
			if (data.status) {
				setSubmittedId(localSelectedId)
				setPollData(data.data)
				toast({ title: "Vote recorded!", status: "success", duration: 2000 })
			} else {
				toast({ title: "Action Denied", description: data.message || "Failed to submit vote.", status: "warning", position: "top", duration: 4000, isClosable: true })
			}
		} catch {
			toast({ title: "Failed to vote.", description: "Network or server error.", status: "error", duration: 2000 })
		} finally {
			setIsVoting(false)
		}
	}

	if (!pollData?.isActive || !pollData.options?.length) return null

	return (
		<div className="bg-gradient-to-br from-[#1E2024] to-[#141619] rounded-2xl border border-[#333] shadow-lg overflow-hidden">
			{/* Header */}
			<div className="px-5 pt-5 pb-4 border-b border-[#232323]">
				<div className="flex items-center gap-3">
					<div className="w-9 h-9 rounded-full bg-[#F79432]/20 flex items-center justify-center flex-shrink-0">
						<svg className="w-5 h-5 text-[#F79432]" fill="currentColor" viewBox="0 0 20 20">
							<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
						</svg>
					</div>
					<div>
						<p className="font-bold text-white text-sm leading-tight">Help finalize this event</p>
						<p className="text-xs text-[#777] mt-0.5">Your vote decides the night</p>
					</div>
				</div>
			</div>

			{/* Poll body */}
			<div className="px-5 py-4">
				{/* Poll title + count */}
				<div className="flex items-center justify-between mb-1">
					<span className="text-sm font-semibold text-white">Event Date Poll</span>
					<span className="bg-[#2a2a2a] text-xs px-2.5 py-1 rounded-full text-[#aaa] font-medium">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</span>
				</div>

				{/* Options */}
				<div className="flex flex-col gap-3 mb-4">
					{pollData.options.map((opt: any) => {
						const voteCount = opt.voters?.length || opt.voteCount || opt.votes?.length || 0
						const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0
						const isSelected = localSelectedId === opt.id
						let dayLabel = opt.label || ""
						if (!dayLabel && opt.date) {
							try {
								const d = new Date(opt.date)
								const day = d.getDay()
								dayLabel = day === 0 || day === 6 ? "Weekend" : "Weekday"
							} catch {}
						}
						return (
							<div key={opt.id}>
								<button
									onClick={() => !isAdmin && setLocalSelectedId(opt.id)}
									disabled={isAdmin}
									className={`w-full text-left rounded-xl border transition-all p-3 ${isSelected ? "border-[#F79432] bg-[#F79432]/5" : "border-[#2a2a2a] bg-[#1a1a1a] hover:border-[#444]"} ${isAdmin ? "cursor-default" : "cursor-pointer"}`}
								>
									<div className="flex items-start gap-3">
										<div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center mt-0.5 flex-shrink-0 transition-colors ${isSelected ? "border-[#F79432]" : "border-[#555]"}`}>
											{isSelected && <div className="w-2 h-2 rounded-full bg-[#F79432]" />}
										</div>
										<div className="flex-1 min-w-0">
											<div className="flex items-center justify-between mb-0.5">
												<span className={`font-semibold text-sm ${isSelected ? "text-[#F79432]" : "text-white"}`}>{opt.date}</span>
												<span className={`text-xs font-bold ${isSelected ? "text-[#F79432]" : "text-[#888]"}`}>{pct}%</span>
											</div>
											<div className="flex items-center justify-between mb-2">
												<div className="flex items-center gap-2">
													{opt.time && <span className="text-xs text-[#777]">{opt.time}</span>}
													{dayLabel && <span className="text-xs text-[#666] border border-[#333] px-1.5 py-0.5 rounded">{dayLabel}</span>}
												</div>
												<span className="text-xs text-[#666]">{voteCount} Vote{voteCount !== 1 ? "s" : ""}</span>
											</div>
											<div className="w-full bg-[#252525] rounded-full h-1.5">
												<div className="bg-[#F79432] h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
											</div>
										</div>
									</div>
								</button>
							</div>
						)
					})}
				</div>

				{/* Submit */}
				{!isAdmin && (
					<>
						<button
							onClick={handleSubmit}
							disabled={!localSelectedId || isVoting || localSelectedId === submittedId}
							className={`w-full py-3 rounded-full font-bold text-sm transition-all mb-2 ${!localSelectedId || localSelectedId === submittedId ? "bg-[#F79432]/40 text-black/50 cursor-not-allowed" : "bg-[#F79432] text-black hover:bg-[#e58220]"}`}
						>
							{isVoting ? "Submitting..." : submittedId && submittedId === localSelectedId ? "Voted ✓" : "Submit"}
						</button>
						<p className="text-center text-xs text-[#666] mb-4">You can change your vote anytime</p>
					</>
				)}

				{/* People voted row */}
				{allVoters.length > 0 && (
					<button
						onClick={() => setShowVotesModal(true)}
						className="w-full flex items-center gap-3 py-2 border-t border-[#232323] mt-1 hover:opacity-80 transition-opacity text-left"
					>
						<div className="flex -space-x-2">
							{allVoters.slice(0, 4).map((voter: any, i: number) => (
								<div key={i} className="w-7 h-7 rounded-full bg-[#444] border-2 border-[#141619] flex items-center justify-center overflow-hidden">
									{voter.image ? (
										<img src={voter.image} alt={voter.name} className="w-full h-full object-cover" />
									) : (
										<span className="text-[10px] font-bold text-white uppercase">{voter.name?.charAt(0) || "?"}</span>
									)}
								</div>
							))}
						</div>
						<span className="text-sm text-white font-medium flex-1">{totalVotes} people voted</span>
						<svg className="w-4 h-4 text-[#F79432]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
						</svg>
					</button>
				)}
			</div>

			{/* Bottom confirmation card */}
			<div className="mx-4 mb-4 bg-[#0f1013] rounded-xl p-4 border border-[#232323] flex items-start gap-3">
				<div className="w-8 h-8 rounded-full bg-[#F79432]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
					<svg className="w-4 h-4 text-[#F79432]" fill="currentColor" viewBox="0 0 20 20">
						<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
					</svg>
				</div>
				<div>
					<p className="text-xs font-semibold text-white leading-snug">We&apos;ll confirm the final date once voting closes.</p>
					<p className="text-xs text-[#666] mt-0.5">Stay tuned for lineup reveal</p>
				</div>
			</div>

			{/* Votes Modal */}
			<Modal isOpen={showVotesModal} onClose={() => setShowVotesModal(false)} isCentered size="sm">
				<ModalOverlay bg="blackAlpha.700" />
				<ModalContent bg="#1E2024" color="white" border="1px solid #333" rounded="2xl" mx={4}>
					<ModalHeader borderBottom="1px solid #2a2a2a" pb={3}>
						<div className="flex items-center justify-between">
							<button onClick={() => setShowVotesModal(false)} className="text-[#888] hover:text-white transition-colors mr-3">
								<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
								</svg>
							</button>
							<span className="text-white font-bold text-base flex-1">Votes</span>
							<span className="bg-[#F79432] text-black text-xs font-bold px-2.5 py-1 rounded-full">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</span>
						</div>
					</ModalHeader>
					<ModalBody py={4} px={4}>
						<div className="flex flex-col gap-3">
							{(pollData?.options || []).flatMap((opt: any) =>
								(opt.voters || []).map((voter: any) => ({ voter, date: opt.date, label: opt.label }))
							).map(({ voter, date, label }: any, i: number) => (
								<div key={i} className="flex items-center gap-3">
									<div className="w-9 h-9 rounded-full bg-[#333] border border-[#444] flex items-center justify-center overflow-hidden flex-shrink-0">
										{voter.image ? (
											<img src={voter.image} alt={voter.name} className="w-full h-full object-cover" />
										) : (
											<span className="text-sm font-bold text-white uppercase">{voter.name?.charAt(0) || "?"}</span>
										)}
									</div>
									<span className="text-sm text-white font-medium flex-1">{voter.name || "Guest"}</span>
									<span className="bg-[#F79432] text-black text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
										{label || date}
									</span>
								</div>
							))}
							{totalVotes === 0 && (
								<p className="text-center text-sm text-[#666] py-4">No votes yet.</p>
							)}
						</div>
					</ModalBody>
				</ModalContent>
			</Modal>
		</div>
	)
}

function DatePollTeaser({ event, onOpenPoll }: { event: IEvent; onOpenPoll: () => void }) {
	const [pollData, setPollData] = React.useState<any>(event.datePoll)

	React.useEffect(() => {
		if (!(event as any)?._id) return
		fetch(`/api/events/${(event as any)?._id}/poll`)
			.then((res) => res.json())
			.then((data) => {
				if (data?.status && data?.data) setPollData(data.data)
			})
			.catch(console.error)
	}, [(event as any)?._id])

	if (!pollData?.isActive || !pollData.options?.length) return null

	const totalVotes = pollData?.totalVotes || (pollData?.options || []).reduce((sum: number, o: any) => sum + (o.voters?.length || o.voteCount || o.votes?.length || 0), 0)
	const allVoters = (pollData.options || []).flatMap((o: any) => o.voters || [])

	return (
		<button
			onClick={onOpenPoll}
			className="w-full text-left bg-[#1E2024] border border-[#2a2a2a] rounded-xl p-4 flex items-center gap-4 mb-5 hover:border-[#F79432]/40 transition-colors group lg:cursor-default lg:pointer-events-none"
		>
			<div className="w-10 h-10 rounded-xl bg-[#F79432]/15 flex items-center justify-center flex-shrink-0">
				<svg className="w-5 h-5 text-[#F79432]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
				</svg>
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-sm font-semibold text-white">What date and time work best for you</p>
				<p className="text-xs text-[#888] mt-0.5">Vote now and help finalize the event schedule.</p>
			</div>
			<div className="flex items-center gap-2 flex-shrink-0">
				{allVoters.length > 0 && (
					<div className="flex -space-x-1.5">
						{allVoters.slice(0, 3).map((voter: any, i: number) => (
							<div key={i} className="w-6 h-6 rounded-full bg-[#444] border-2 border-[#1E2024] flex items-center justify-center overflow-hidden">
								{voter.image ? (
									<img src={voter.image} alt={voter.name} className="w-full h-full object-cover" />
								) : (
									<span className="text-[9px] font-bold text-white uppercase">{voter.name?.charAt(0) || "?"}</span>
								)}
							</div>
						))}
					</div>
				)}
				<span className="text-xs text-[#888] whitespace-nowrap">{totalVotes} voted</span>
				<svg className="w-4 h-4 text-[#555] group-hover:text-[#F79432] transition-colors lg:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
				</svg>
			</div>
		</button>
	)
}



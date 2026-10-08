import { DateTimeSVG, LocationSVG } from "@/assets/icons"
import { LOCATION_TBA } from "@/lib/event-location"
import { eventPath } from "@/lib/event-slug"
import { eventMedia } from "@/lib/event-media"
import { isAwaitingAdminReview } from "@/lib/event-approval"
import { stripHtml, escapeRegExp } from "@/utils/text";
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { authorizedOnly } from "@/lib/authSession"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { IEvent } from "@/models/events/types"
import { Button, Heading, Text, Input, InputGroup, InputLeftElement, Flex, AlertDialog, AlertDialogBody, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, useDisclosure } from "@chakra-ui/react"
import { GetServerSideProps } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { roboto } from "@/lib/fonts"
import Link from "next/link"
import { sortEvents, getEventStatus, EventStatus } from "@/utils/eventSort"
import { formatEventTime, formatEventZoneLabel, formatEventDateParts } from "@/utils/eventTime"

import { useRouter } from "next/router"
import React, { useRef, useState } from "react"
import { toast } from "react-toastify"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import PremiumBadge from "@/components/premium/PremiumBadge"
// The EVENT tag. Unrelated to PremiumBadge above, which marks a premium SUBSCRIBER.
import PremiumEventBadge from "@/components/events/PremiumEventBadge"
import MediaBackdrop from "@/components/events/MediaBackdrop"

type Pagination = {
	total: number
	page: number
	showing: number
	limit: number
	totalPages: number
}

type FilterKey = "all" | "public" | "private" | "premium" | "upcoming" | "ended" | "tbd" | "pending"

type Props = {
	events: string
	pagination: Pagination
	isAdmin: boolean
	search: string
	filter: FilterKey
	pendingCount: number
}

// Public / Private sit right after All: with a hundred events in the list, "which of these can
// anyone actually find" is the first question an admin asks, and unlisted events were the noise
// making it hard to answer. They filter on PRIVACY only — draft vs published is a separate axis
// and is still shown as a badge on each row.
const FILTERS: { key: FilterKey; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "public", label: "Public" },
	{ key: "private", label: "Private" },
	// One mutually-exclusive axis on this page, so Premium is another chip here rather than a
	// second group (the public listing, which already has two axes, gets its own group instead).
	{ key: "premium", label: "Premium" },
	{ key: "upcoming", label: "Upcoming" },
	{ key: "ended", label: "Ended" },
	{ key: "tbd", label: "TBD" },
	{ key: "pending", label: "Pending Approval" },
]

export default function EventsListing({ events, pagination, isAdmin, search, filter, pendingCount }: Props) {
	const [eventList, setEventList] = React.useState<IEvent[]>(() => JSON.parse(events) as IEvent[])
	const [searchInput, setSearchInput] = useState(search || "")
	const router = useRouter()

	// getServerSideProps re-runs on page navigation, but the component stays
	// mounted — re-sync the list whenever the server sends new events.
	React.useEffect(() => {
		setEventList(JSON.parse(events) as IEvent[])
	}, [events])

	React.useEffect(() => {
		setSearchInput(search || "")
	}, [search])

	const handleEventRemoved = (removedEventId: string) => {
		setEventList((prevList) => prevList.filter((event) => event._id.toString() !== removedEventId))
	}

	const filterQuery = filter && filter !== "all" ? { filter } : {}

	const goToPage = (p: number) => {
		router.push({ pathname: router.pathname, query: { page: p, ...(search ? { search } : {}), ...filterQuery } })
	}

	const runSearch = () => {
		const q = searchInput.trim()
		router.push({ pathname: router.pathname, query: { ...(q ? { search: q } : {}), ...filterQuery, page: 1 } })
	}

	const clearSearch = () => {
		setSearchInput("")
		router.push({ pathname: router.pathname, query: { ...filterQuery, page: 1 } })
	}

	const setFilter = (key: FilterKey) => {
		router.push({
			pathname: router.pathname,
			query: { ...(search ? { search } : {}), ...(key !== "all" ? { filter: key } : {}), page: 1 },
		})
	}

	return (
		<ConsoleLayout maxW="max-w-[800px]">
			<div className="max-w-[800px] mx-auto mb-5">
				<Heading as="h2" fontSize={28}>
					{isAdmin ? "Events" : "My Events"} ({pagination.total})
				</Heading>
			</div>

			<Flex className="max-w-[800px] mx-auto" flexDirection={{ base: "column", sm: "row" }} gap={2} mb={4}>
				<InputGroup>
					<InputLeftElement pointerEvents="none">
						<SearchSVG />
					</InputLeftElement>
					<Input
						placeholder="Search"
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && runSearch()}
						bg="#1E1E1E"
						borderColor="#444444"
						borderRadius="full"
						color="white"
						pl={10}
						_placeholder={{ color: "gray.400" }}
					/>
				</InputGroup>
				<Button bg="#F79432" color="black" _hover={{ bg: "#E68422" }} borderRadius="full" onClick={runSearch} px={6}>
					Search
				</Button>
				{search && (
					<Button variant="outline" colorScheme="orange" borderRadius="full" onClick={clearSearch}>
						Clear
					</Button>
				)}
			</Flex>

			{/* FILTER CHIPS */}
			<div className="flex flex-wrap items-center gap-2 max-w-[800px] mx-auto mb-5">
				{/* Pending Approval is the admin review queue — a host has nothing to do with it,
				    so it isn't shown to them at all; each row's own DRAFT / PENDING APPROVAL badge
				    already tells them where their event stands. getServerSideProps refuses the
				    filter for a non-admin too, so a hand-typed ?filter=pending can't reach it. */}
				{FILTERS.filter(({ key }) => key !== "pending" || isAdmin).map(({ key, label }) => {
					const active = filter === key
					return (
						<button
							key={key}
							onClick={() => setFilter(key)}
							className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
								active
									? "bg-white text-black"
									: "bg-[#1E1E1E] text-[#A7A7A7] border border-[#444444] hover:bg-[#2A2A2A]"
							}`}
						>
							{key === "pending" ? `${label} (${pendingCount})` : label}
						</button>
					)
				})}
			</div>

			<div className="space-y-5 max-w-[800px] mx-auto">
				{!eventList.length && <p>No events found.</p>}

				{eventList.map((event) => (
					<ListingCard {...event} key={event.slug} onEventRemoved={handleEventRemoved} isEnded={event.isEnded} timeStatus={(event as any).timeStatus} isAdmin={isAdmin} />
				))}
			</div>

			{pagination.totalPages > 1 && (
				<div className="flex flex-col sm:flex-row items-center sm:justify-between gap-3 max-w-[800px] mx-auto mt-8">
					<Button
						onClick={() => goToPage(pagination.page - 1)}
						isDisabled={pagination.page <= 1}
						variant="outline"
						colorScheme="orange"
					>
						← Prev
					</Button>

					<Text color="gray.400" fontSize="sm">
						Page {pagination.page} of {pagination.totalPages} &nbsp;·&nbsp; {pagination.total} total
					</Text>

					<Button
						onClick={() => goToPage(pagination.page + 1)}
						isDisabled={pagination.page >= pagination.totalPages}
						variant="outline"
						colorScheme="orange"
					>
						Next →
					</Button>
				</div>
			)}
		</ConsoleLayout>
	)
}

const SearchSVG = () => (
	<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
		<path
			d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16ZM19 19l-4.35-4.35"
			stroke="#A7A7A7"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
)

// Figma date-number spec: Roboto 700, 120px, line-height 100%, letter-spacing -3%
// fontFamily comes from the loaded `roboto` next/font className on the element.
const dayNumberStyle: React.CSSProperties = {
	fontWeight: 700,
	// clamp() rather than a Tailwind breakpoint because this is an inline style. 120px is the
	// Figma value and stays the upper bound; on a 360px phone it would otherwise be wider than
	// the card it sits in.
	fontSize: "clamp(56px, 14vw, 120px)",
	lineHeight: "100%",
	letterSpacing: "-0.03em",
}

// Figma weekday/month label spec: Roboto 400, 24px, line-height 100%, letter-spacing 2%, uppercase
const labelStyle: React.CSSProperties = {
	fontWeight: 400,
	fontSize: "clamp(14px, 4vw, 24px)",
	lineHeight: "100%",
	letterSpacing: "0.02em",
	textTransform: "uppercase",
	color: "#9F9F9F",
}

const DateBlock = ({ startsOn, isEnded, timezone }: { startsOn?: any; isEnded?: boolean; timezone?: string }) => {
	const accent = isEnded ? "text-gray-500" : "text-white"
	if (!startsOn) {
		return (
			<div className="w-[96px] sm:w-[135px] shrink-0 flex flex-col items-center justify-center text-center">
				<span className={roboto.className} style={labelStyle}>--</span>
				<span className={`my-1 ${roboto.className} ${accent}`} style={{ ...dayNumberStyle, fontSize: "clamp(32px, 8vw, 64px)" }}>TBD</span>
				<span className={roboto.className} style={labelStyle}>--</span>
			</div>
		)
	}
	const { weekday, day, monthYear } = formatEventDateParts(startsOn, timezone)
	return (
		<div className="w-[96px] sm:w-[135px] shrink-0 flex flex-col items-center justify-center text-center">
			<span className={roboto.className} style={labelStyle}>{weekday}</span>
			<span className={`my-1 ${roboto.className} ${accent}`} style={dayNumberStyle}>{day}</span>
			<span className={roboto.className} style={labelStyle}>{monthYear}</span>
		</div>
	)
}

// Per-card status badge styles (canonical order live -> future -> tbd -> past)
const TIME_STATUS_BADGE: Record<EventStatus, { label: string; className: string }> = {
	live: { label: "LIVE", className: "bg-[#123B2A] text-[#39D98A] border border-[#39D98A]" },
	future: { label: "UPCOMING", className: "bg-[#2A1F00] text-[#F79432] border border-[#F79432]" },
	tbd: { label: "TBD", className: "bg-[#2A2A2A] text-[#A7A7A7] border border-[#444444]" },
	past: { label: "ENDED", className: "bg-[#444444] text-[#A7A7A7]" },
}

const ListingCard = (props: IEvent & { onEventRemoved: (id: string) => void; isEnded?: boolean; timeStatus?: EventStatus; isAdmin?: boolean }) => {
	const event = props
	const timeStatus: EventStatus = props.timeStatus ?? getEventStatus(props)
	const statusBadge = TIME_STATUS_BADGE[timeStatus]
	const router = useRouter()
	const [isApproving, setIsApproving] = useState(false)

	// Published only, never a draft — see the note on `pendingCount` in getServerSideProps and
	// the matching guard in api/events/[eventId]/approve.ts.
	const canApprove = !!props.isAdmin && isAwaitingAdminReview(event as any)

	// Same shape as manage.tsx's handleApproveEvent: direct axios, since there is no approve
	// thunk or service wrapper. The reload is what keeps the badge, the queue count and the
	// Pending chip's own list moving together — patching the row alone would leave two of them
	// stale until the next navigation.
	//
	// It asks first. Approving is irreversible — there is no reject or un-approve endpoint —
	// and here the button sits on every awaiting-review row, so a misclick on the neighbouring
	// row puts the wrong event live and emails its host with no way back.
	const { isOpen: isApproveOpen, onOpen: onApproveOpen, onClose: onApproveClose } = useDisclosure()
	// Its own ref, not the delete dialog's: `leastDestructiveRef` is what each dialog returns
	// focus to, and two dialogs sharing one is a focus bug waiting to happen.
	const approveCancelRef = useRef<HTMLButtonElement>(null)

	const handleApprove = () => {
		setIsApproving(true)
		axios
			.post(`/api/events/${event._id}/approve`)
			.then(() => {
				toast.success("Event approved.")
				onApproveClose()
				router.replace(router.asPath)
			})
			.catch((err) => toast.error(err?.response?.data?.message || "Failed to approve event."))
			.finally(() => setIsApproving(false))
	}

	// Deleting from the row is admin-only, even though the endpoint also accepts the owner.
	// A host reaches Delete through Manage Event, behind the event they are looking at; a
	// one-click delete on every row of their own list is a different risk entirely.
	const canDelete = !!props.isAdmin
	const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure()
	const cancelRef = useRef<HTMLButtonElement>(null)
	const [isDeleting, setIsDeleting] = useState(false)

	// `deleteFile` is a documented no-op, so manage.tsx's image-cleanup loop does nothing
	// and there is none to replicate here. No `.finally`: `onEventRemoved` unmounts this
	// card, and a setState afterwards is pointless work on a dead component.
	const handleDelete = () => {
		setIsDeleting(true)
		axios
			.delete(`/api/events/${event._id}/delete`)
			.then(() => {
				toast.success("Event deleted.")
				setIsDeleting(false)
				onDeleteClose()
				// Drop the row at once, then re-run getServerSideProps so the heading total and the
				// Pending Approval count follow it. `onEventRemoved` was passed to this card from the
				// day it was written and never called — this is its first caller.
				props.onEventRemoved(event._id.toString())
				router.replace(router.asPath)
			})
			.catch((err) => {
				toast.error(err?.response?.data?.message || "Failed to delete event.")
				setIsDeleting(false)
			})
	}

	const { data: totals } = useQuery({
		queryKey: ["eventTotals", event._id],
		queryFn: () => axios.get(`/api/events/${event._id}/totals`).then((r) => r.data),
	})
	const totalTickets = totals?.totalTickets ?? 0
	const uniqueGuests = totals?.uniqueGuests ?? 0

	return (
		<>
			<div className={`relative flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-xl p-4 ${props.isEnded ? 'bg-[#2A1E1E] border border-[#444444]' : 'bg-[#1E1E1E]'}`}>
				{/* Date and thumbnail share one row on mobile rather than stacking into a very
				    tall card. `sm:contents` dissolves this wrapper from 640px up, so the desktop
				    layout is exactly the three-column flex it has always been — no duplicated
				    markup and no second code path to keep in step. */}
				<div className="flex items-center gap-4 w-full sm:contents">
					{/* DATE BLOCK */}
					<DateBlock startsOn={event.startsOn} isEnded={props.isEnded} timezone={event.timezone} />

					{/* THUMBNAIL */}
					<div className="shrink-0">
						{(() => {
							// The banner's own first item, so a host who dragged a video to the front
							// sees the video here too rather than a stale photo.
							const lead = eventMedia(event as any)[0]
							// guard bad/seed data ("string", "", etc.); plain <img>/<video> so any host loads (mobile stores profile-pic URLs)
							const isValidUrl = typeof lead?.url === "string" && (lead.url.startsWith("/") || lead.url.startsWith("http"))
							// Letterbox on black and show the whole banner rather than cropping it,
							// matching the listing, dashboard and booking cards. Hosts upload at
							// whatever aspect they like, and object-cover was slicing the artwork.
							// `relative` so the Premium ribbon can anchor to the artwork's own corner.
							const boxClass = `relative w-[110px] h-[88px] sm:w-[150px] sm:h-[120px] rounded-lg bg-black overflow-hidden shrink-0 ${props.isEnded ? 'opacity-60' : ''}`
							return isValidUrl ? (
								<div className={boxClass}>
									{/* First child, and the media below it is `relative` — a static element
									    paints beneath every positioned one, so without that the blurred fill
									    would sit on top of the photo. */}
									<MediaBackdrop url={lead.url} type={lead.type} layers={1} deepBlur={12} />
									{lead.type === "video" ? (
										// First frame only, via the `#t=0.1` poster trick — a list never autoplays.
										<video src={`${lead.url}#t=0.1`} muted playsInline preload="metadata" className="relative w-full h-full object-contain" />
									) : (
										<img
											src={lead.url}
											alt={stripHtml(event.name)}
											className="relative w-full h-full object-contain"
										/>
									)}
								</div>
							) : (
								<div className={`relative overflow-hidden w-[110px] h-[88px] sm:w-[150px] sm:h-[120px] rounded-lg bg-[#2A2D35] flex flex-col items-center justify-center gap-0.5 ${props.isEnded ? 'opacity-60' : ''}`}>
									<span className="text-3xl">🖼️</span>
									<span className="text-xs text-gray-500">No image</span>
								</div>
							)
						})()}
					</div>
				</div>

				{/* INFO */}
				<div className="flex-1 min-w-0 space-y-1.5">
					<div className="flex items-center gap-2 flex-wrap">
						<Link href={eventPath(event.slug)} className="min-w-0 max-w-full">
							{/* `anywhere`, not `break-word`: the two break text identically, but only
							    `anywhere` counts toward min-content, and this sits in a flex row. With
							    `break-word` a name containing a long run of characters and no spaces
							    still measured as wide as that run, so the text painted outside the
							    card even though it was willing to break. Same reason the manage
							    page's <h1> sets it. */}
							{/* `noOfLines` as well as `overflowWrap`: the two solve different problems and this
							    row only ever had the second. `anywhere` stops a long name painting outside the
							    card; nothing stopped it growing DOWNWARDS, so a 150-emoji title rendered as
							    about fifteen lines on a phone and buried the badge, the date and Manage Event
							    under it. Two lines, matching `EventListingCard` — and the location line
							    directly below has clamped since long before this. */}
							<Heading as="h3" fontSize={18} cursor="pointer" noOfLines={2} overflowWrap="anywhere" _hover={{ textDecoration: "underline" }} className={props.isEnded ? 'text-gray-400' : ''}>
								{stripHtml(event.name)}
							</Heading>
						</Link>
						<span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusBadge.className}`}>
							{statusBadge.label}
						</span>
						{event.status === 'draft' && (
							<span className="px-2 py-0.5 bg-[#2A1F00] text-[#F79432] border border-[#F79432] text-xs rounded-full font-medium">
								DRAFT
							</span>
						)}
						{/* Awaiting review, never merely pending. A draft is stamped `pending` at birth
						    and nobody has submitted it, so this badge beside DRAFT claimed a queue the
						    event wasn't in — and it was a second badge saying the same "not live yet"
						    thing. DRAFT alone covers a draft; this appears the moment it's published. */}
						{isAwaitingAdminReview(event as any) && (
							<span className="px-2 py-0.5 bg-[#3A2A00] text-[#F79432] border border-[#F79432] text-xs rounded-full font-medium">
								PENDING APPROVAL
							</span>
						)}
						{(event as any).privacy === 'private' && (
							<span className="px-2 py-0.5 bg-[#7C1D1D] text-white border border-red-500/40 text-xs rounded-full font-medium">
								PRIVATE
							</span>
						)}
					</div>

					{/* TIME ROW */}
					<div className="flex items-start gap-x-2 text-sm text-[#A7A7A7]">
						<span className="shrink-0 flex mt-[3px]">
							<DateTimeSVG width={16} height={16} stroke="#F79432" />
						</span>
						<span className="min-w-0">
							{(() => {
								const showStart = event.startsOn && event.hasStartTime !== false
								const showEnd = event.endsOn && event.hasEndTime !== false
								const label = formatEventZoneLabel(event.timezone)
								const tz = label ? ` ${label}` : ""
								if (showStart && showEnd) return `${formatEventTime(event.startsOn, event.timezone)} – ${formatEventTime(event.endsOn, event.timezone)}${tz}`
								if (showStart) return `${formatEventTime(event.startsOn, event.timezone)}${tz}`
								if (showEnd) return `Ends ${formatEventTime(event.endsOn, event.timezone)}${tz}`
								return `All day${tz}`
							})()}
						</span>
					</div>

					{/* LOCATION ROW */}
					<div className="flex items-start gap-x-2 text-sm text-[#A7A7A7]">
						{event.locationDisclosedAfterBooking ? (
							<>
								<span className="shrink-0">📍</span>
								<span className="min-w-0 line-clamp-2 sm:line-clamp-1 [overflow-wrap:anywhere]">
									Disclosed after registration <span className="text-xs text-gray-500 ml-1">(Actual: {event.location})</span>
								</span>
							</>
						) : (
							<>
								<span className="shrink-0 flex mt-[3px]">
									<LocationSVG width={15} height={16} stroke="#EC5E5E" />
								</span>
								<span className="min-w-0 line-clamp-2 sm:line-clamp-1 [overflow-wrap:anywhere]">{event.location || LOCATION_TBA}</span>
							</>
						)}
					</div>

					{/* COUNTS */}
					<div className="flex items-center gap-x-4 text-xs text-gray-400">
						<span className="flex items-center gap-1">🎟️ {totalTickets} tickets</span>
						<span className="flex items-center gap-1">👥 {uniqueGuests} guests</span>
					</div>
				</div>

				{/* ACTIONS */}
				<div className="shrink-0 flex flex-col gap-2 w-full sm:w-[180px]">
					{/* Premium tag — one badge only: the pill above Manage Event. The diagonal corner
					    ribbon was removed (2026-09-14) because the card showed the same tag twice. */}
					{(event as any).premiumEvent && (
						<div className="flex justify-end">
							<PremiumEventBadge />
						</div>
					)}
					{/* Approving from the row saves an admin opening every event in the queue in
					    turn. Same green as the manage page's Approve Event, so the two read as one
					    action in two places. */}
					{canApprove && (
						<button
							type="button"
							onClick={onApproveOpen}
							disabled={isApproving}
							className="flex items-center justify-center gap-1 bg-[#2FA84F] text-white font-bold py-2.5 px-3 rounded-md text-sm hover:bg-[#279143] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
						>
							{isApproving ? "Approving…" : "✅ Approve Event"}
						</button>
					)}
					<Link href={`/console/events/${event._id}/manage`} className="flex items-center justify-center gap-1 bg-[#3E3E3E] py-2.5 px-3 rounded-md text-sm hover:bg-[#4E4E4E] transition-colors">
						✏️ Manage Event
					</Link>
					{/* Outlined rather than solid: it sits under the two actions an admin actually came
					    for, and a filled red block on every row would read as the primary one. */}
					{canDelete && (
						<button
							type="button"
							onClick={onDeleteOpen}
							className="flex items-center justify-center gap-1 border border-[#7C1D1D] text-[#FF6B6B] py-2.5 px-3 rounded-md text-sm hover:bg-[#7C1D1D] hover:text-white transition-colors"
						>
							🗑️ Delete Event
						</button>
					)}
				</div>
			</div>

			{/* Same wording as Manage Event's, so the two screens can't drift about what
			    approving does. Names the event: on a list of near-identical rows nothing else
			    says which one is about to go live. */}
			<AlertDialog isOpen={isApproveOpen} leastDestructiveRef={approveCancelRef} onClose={onApproveClose} isCentered>
				<AlertDialogOverlay>
					<AlertDialogContent bg="#1E1E1E" border="1px solid #444">
						<AlertDialogHeader fontSize="lg" fontWeight="bold" color="white">
							Approve Event
						</AlertDialogHeader>
						<AlertDialogBody color="white">
							Approve &ldquo;{stripHtml(event.name)}&rdquo;? It goes live immediately and the host is emailed.
							This can&rsquo;t be undone — there is no way to un-approve an event.
						</AlertDialogBody>
						<AlertDialogFooter>
							<Button ref={approveCancelRef} onClick={onApproveClose}>Cancel</Button>
							<Button bg="#2FA84F" color="white" _hover={{ bg: "#279143" }} _active={{ bg: "#279143" }} onClick={handleApprove} ml={3} isLoading={isApproving}>Approve</Button>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialogOverlay>
			</AlertDialog>

			{/* Naming the event is the point: an admin deleting from a list of near-identical rows
			    has nothing else to tell them which one is about to go. The endpoint hard-deletes an
			    event with no bookings and soft-deletes one that has them; neither is reversible. */}
			<AlertDialog isOpen={isDeleteOpen} leastDestructiveRef={cancelRef} onClose={onDeleteClose} isCentered>
				<AlertDialogOverlay>
					<AlertDialogContent bg="#1E1E1E" border="1px solid #444">
						<AlertDialogHeader fontSize="lg" fontWeight="bold" color="white">
							Delete Event
						</AlertDialogHeader>
						<AlertDialogBody color="white">
							Delete &ldquo;{stripHtml(event.name)}&rdquo;? This cannot be undone.
						</AlertDialogBody>
						<AlertDialogFooter>
							<Button ref={cancelRef} onClick={onDeleteClose}>Cancel</Button>
							<Button colorScheme="red" onClick={handleDelete} ml={3} isLoading={isDeleting}>Delete</Button>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialogOverlay>
			</AlertDialog>
		</>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	await ensureDbConnected()
	// check if user is authorized
	const authResult = await authorizedOnly(context)
	if ('redirect' in authResult) return authResult

	const serverSession = await getServerSession(context.req, context.res, authOptions)
	const userRole = (serverSession?.user as any)?.role
	const userId = (serverSession?.user as any)?._id
	const isAdmin = userRole === "admin" || userRole === "super admin"
	const ownerFilter = isAdmin ? {} : { ownerId: userId }

	const LIMIT = 20
	// User input, and it indexes an array: `?page=abc` yielded NaN (slicing nothing) and
	// `?page=-1` a negative `skip`, which slices from the END of the list. Floor it at 1 so
	// the clamp below is the only thing that decides which page renders.
	const requestedPage = parseInt((context.query.page as string) || "1", 10)
	const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1
	const skip = (page - 1) * LIMIT

	// Optional search by event name or location (case-insensitive)
	const search = (context.query.search as string)?.trim() || ""
	const searchRegex = escapeRegExp(search)
	const searchFilter = search
		? { $or: [{ name: { $regex: searchRegex, $options: "i" } }, { location: { $regex: searchRegex, $options: "i" } }] }
		: {}

	// fetch active events (not deleted), filtered by owner if non-admin
	const activeEvents = await Events.find({ isDeleted: false, ...ownerFilter, ...searchFilter }).sort({ createdAt: -1 })

	// Get events with bookings to include past events that have activity
	const { Bookings } = await import("@/models/events/bookings")
	const eventsWithBookings = await Bookings.distinct('eventId', { isDeleted: false })

	// Fetch past events that have bookings
	const now = new Date()
	const pastEventsWithBookings = await Events.find({
		_id: { $in: eventsWithBookings },
		isDeleted: false,
		endsOn: { $lt: now },
		...ownerFilter,
		...searchFilter,
	})

	// If no past events with bookings, include all past events in scope
	const pastEventsToInclude = pastEventsWithBookings.length > 0 ? pastEventsWithBookings : await Events.find({
		isDeleted: false,
		endsOn: { $lt: now },
		...ownerFilter,
		...searchFilter,
	})

	// Combine active events and past events with bookings, remove duplicates
	const allEventsMap = new Map()

	// Add active events
	activeEvents.forEach(event => {
		const eventData: any = event.toJSON()
		eventData.timeStatus = getEventStatus(eventData)
		eventData.isEnded = eventData.timeStatus === "past"
		allEventsMap.set(eventData._id.toString(), eventData)
	})

	// Add past events (only if not already included)
	pastEventsToInclude.forEach(event => {
		const eventId = event._id.toString()
		if (!allEventsMap.has(eventId)) {
			const eventData: any = event.toJSON()
			eventData.timeStatus = "past" // in the past by query definition
			eventData.isEnded = true
			allEventsMap.set(eventId, eventData)
		}
	})

	// Canonical order: live -> future -> tbd -> past (see src/utils/eventSort.ts)
	const allEvents = sortEvents(Array.from(allEventsMap.values()))

	// Apply status filter chip (server-side) before pagination
	const allowedFilters = ["all", "public", "private", "premium", "upcoming", "ended", "tbd", "pending"]
	const rawFilter = (context.query.filter as string) || "all"
	// Approval is an admin concern, so the chip isn't rendered for a host — and the filter is
	// refused here too, or a hand-typed ?filter=pending would still reach it.
	const filter = allowedFilters.includes(rawFilter) && (rawFilter !== "pending" || isAdmin) ? rawFilter : "all"

	// The review queue is `isAwaitingAdminReview` — pending AND published — not the looser
	// `isPendingAdminApproval`. Every public event is stamped `pending` at birth and the create
	// page autosaves a real record on the first keystroke, so the loose predicate filled the
	// queue with abandoned draft stubs nobody had submitted. The row badge deliberately keeps
	// the loose one: a host should still see where their draft stands.
	const isAwaitingReview = (e: any) => isAwaitingAdminReview(e)
	const pendingCount = allEvents.filter(isAwaitingReview).length

	const filteredEvents = allEvents.filter((e: any) => {
		switch (filter) {
			// `privacy` is absent on events created before the field existed, and absent means
			// public — so match by exclusion rather than by `=== "public"`, which would hide every
			// legacy event from the Public tab.
			case "public":
				return e.privacy !== "private"
			case "private":
				return e.privacy === "private"
			// Absent on every event predating the flag, which is simply not premium.
			case "premium":
				return !!e.premiumEvent
			case "upcoming":
				return e.timeStatus === "live" || e.timeStatus === "future"
			case "ended":
				return e.timeStatus === "past"
			case "tbd":
				return e.timeStatus === "tbd"
			case "pending":
				return isAwaitingReview(e)
			default:
				return true
		}
	})

	const paginatedEvents = filteredEvents.slice(skip, skip + LIMIT)
	const total = filteredEvents.length
	const totalPages = Math.ceil(total / LIMIT)

	// An out-of-range page renders "No events found." with a Prev button — a dead end you
	// reach by deleting the last row on a page, by switching to a filter with fewer pages,
	// or by hand-typing ?page=99. Send them to the last real page instead.
	//
	// The `page > 1` guard is what stops a redirect loop: an empty result set has
	// `totalPages === 0`, and without it page 1 would redirect to itself forever. The query
	// is rebuilt from the RESOLVED values, not `context.query`, so a host's refused
	// ?filter=pending drops off the URL rather than claiming a filter the page isn't applying.
	if (page > 1 && page > totalPages) {
		const params = new URLSearchParams()
		if (search) params.set("search", search)
		if (filter !== "all") params.set("filter", filter)
		const target = Math.max(totalPages, 1)
		if (target > 1) params.set("page", String(target))
		const qs = params.toString()
		// Never permanent — a cached redirect would outlive the page count that justified it.
		return { redirect: { destination: `/console/events${qs ? `?${qs}` : ""}`, permanent: false } }
	}

	return {
		props: {
			events: JSON?.stringify(paginatedEvents),
			pagination: { total, page, showing: paginatedEvents.length, limit: LIMIT, totalPages },
			isAdmin,
			search,
			filter,
			pendingCount,
		},
	}
}

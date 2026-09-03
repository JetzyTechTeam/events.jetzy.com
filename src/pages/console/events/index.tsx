import { DateTimeSVG, LocationSVG } from "@/assets/icons"
import { eventPath } from "@/lib/event-slug"
import { eventMedia } from "@/lib/event-media"
import { isPendingAdminApproval } from "@/lib/event-approval"
import { stripHtml, escapeRegExp } from "@/utils/text";
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { authorizedOnly } from "@/lib/authSession"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { IEvent } from "@/models/events/types"
import { Button, Heading, Text, Input, InputGroup, InputLeftElement, Flex } from "@chakra-ui/react"
import { GetServerSideProps } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Roboto } from "next/font/google"
import Link from "next/link"
import { sortEvents, getEventStatus, EventStatus } from "@/utils/eventSort"
import { formatEventTime, formatEventZoneLabel, formatEventDateParts } from "@/utils/eventTime"

const roboto = Roboto({ weight: ["400", "700"], subsets: ["latin"], display: "swap" })
import { useRouter } from "next/router"
import React, { useState } from "react"
import { toast } from "react-toastify"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import PremiumBadge from "@/components/premium/PremiumBadge"
// The EVENT tag. Unrelated to PremiumBadge above, which marks a premium SUBSCRIBER.
import PremiumEventBadge from "@/components/events/PremiumEventBadge"

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
				{FILTERS.map(({ key, label }) => {
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
					<ListingCard {...event} key={event.slug} onEventRemoved={handleEventRemoved} isEnded={event.isEnded} timeStatus={(event as any).timeStatus} />
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

const ListingCard = (props: IEvent & { onEventRemoved: (id: string) => void; isEnded?: boolean; timeStatus?: EventStatus }) => {
	const event = props
	const timeStatus: EventStatus = props.timeStatus ?? getEventStatus(props)
	const statusBadge = TIME_STATUS_BADGE[timeStatus]

	const { data: totals } = useQuery({
		queryKey: ["eventTotals", event._id],
		queryFn: () => axios.get(`/api/events/${event._id}/totals`).then((r) => r.data),
	})
	const totalTickets = totals?.totalTickets ?? 0
	const uniqueGuests = totals?.uniqueGuests ?? 0

	return (
		<>
			<div className={`flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-xl p-4 ${props.isEnded ? 'bg-[#2A1E1E] border border-[#444444]' : 'bg-[#1E1E1E]'}`}>
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
							const boxClass = `w-[110px] h-[88px] sm:w-[150px] sm:h-[120px] rounded-lg bg-black overflow-hidden shrink-0 ${props.isEnded ? 'opacity-60' : ''}`
							return isValidUrl ? (
								<div className={boxClass}>
									{lead.type === "video" ? (
										// First frame only, via the `#t=0.1` poster trick — a list never autoplays.
										<video src={`${lead.url}#t=0.1`} muted playsInline preload="metadata" className="w-full h-full object-contain" />
									) : (
										<img
											src={lead.url}
											alt={stripHtml(event.name)}
											className="w-full h-full object-contain"
										/>
									)}
								</div>
							) : (
								<div className={`w-[110px] h-[88px] sm:w-[150px] sm:h-[120px] rounded-lg bg-[#2A2D35] flex flex-col items-center justify-center gap-0.5 ${props.isEnded ? 'opacity-60' : ''}`}>
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
						<Link href={eventPath(event.slug)}>
							<Heading as="h3" fontSize={18} cursor="pointer" _hover={{ textDecoration: "underline" }} className={props.isEnded ? 'text-gray-400' : ''}>
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
						{isPendingAdminApproval(event as any) && (
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
					<div className="flex items-center gap-x-2 text-sm text-[#A7A7A7]">
						<DateTimeSVG width={16} height={16} stroke="#F79432" />
						<span>
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
					<div className="flex items-center gap-x-2 text-sm text-[#A7A7A7]">
						{event.locationDisclosedAfterBooking ? (
							<>
								<span>📍</span>
								<span>
									Disclosed after registration <span className="text-xs text-gray-500 ml-1">(Actual: {event.location})</span>
								</span>
							</>
						) : (
							<>
								<LocationSVG width={15} height={16} stroke="#EC5E5E" />
								<span className="truncate">{event.location}</span>
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
					{/* Right edge of the row rather than the badge cluster beside the title — that
					    cluster is status/DRAFT/PENDING/PRIVATE, and this is a tag on the event, not
					    a state of it. */}
					{(event as any).premiumEvent && (
						<div className="flex justify-end">
							<PremiumEventBadge />
						</div>
					)}
					<Link href={`/console/events/${event._id}/manage`} className="flex items-center justify-center gap-1 bg-[#3E3E3E] py-2.5 px-3 rounded-md text-sm hover:bg-[#4E4E4E] transition-colors">
						✏️ Manage Event
					</Link>
				</div>
			</div>
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
	const page = context.query.page ? parseInt(context.query.page as string) : 1
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
	const filter = allowedFilters.includes(rawFilter) ? rawFilter : "all"

	const isPendingApproval = (e: any) => isPendingAdminApproval(e)
	const pendingCount = allEvents.filter(isPendingApproval).length

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
				return isPendingApproval(e)
			default:
				return true
		}
	})

	const paginatedEvents = filteredEvents.slice(skip, skip + LIMIT)
	const total = filteredEvents.length
	const totalPages = Math.ceil(total / LIMIT)

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

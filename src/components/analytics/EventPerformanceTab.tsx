import React, { useEffect, useMemo, useRef, useState } from "react"
import NextLink from "next/link"
import {
	Badge,
	Box,
	Button,
	Center,
	Flex,
	HStack,
	IconButton,
	Image,
	Input,
	InputGroup,
	InputLeftElement,
	Link,
	Select,
	SimpleGrid,
	Spinner,
	Switch,
	Table,
	TableContainer,
	Tbody,
	Td,
	Text,
	Th,
	Thead,
	Tooltip,
	Tr,
	useToast,
} from "@chakra-ui/react"
import { FiArrowDown, FiArrowUp, FiBarChart2, FiDownload, FiRefreshCw, FiSearch } from "react-icons/fi"
import { eventPath } from "@/lib/event-slug"
import MetricsCard from "./MetricsCard"
import TablePagination from "./TablePagination"
import { AnalyticsPanel, InfoTip, darkTableSx, downloadCsv } from "./AnalyticsPanel"

type Timing = "upcoming" | "ongoing" | "past" | "undated"

export interface EventRow {
	eventId: string
	name: string
	slug: string
	image: string | null
	startsOn: string | null
	endsOn: string | null
	timing: Timing
	privacy: "public" | "private"
	isPaid: boolean
	isDraft: boolean
	host: { name: string; email: string } | null
	traffic: { views: number; uniqueViewers: number; sessions: number; ticketSelects: number; checkoutStarts: number }
	bookings: { confirmed: number; pending: number; cancelled: number; refunded: number; failed: number }
	tickets: { sold: number; checkedIn: number; checkInRate: number }
	revenue: { gross: number; discounts: number; net: number; avgOrderValue: number }
	conversionRate: number
}

interface Totals {
	events: number
	views: number
	uniqueViewers: number
	sessions: number
	bookings: number
	pendingBookings: number
	tickets: number
	checkedIn: number
	gross: number
	discounts: number
	revenue: number
	checkInRate: number
	conversionRate: number
}

type SortKey =
	| "revenue" | "gross" | "discounts" | "avgOrderValue" | "bookings" | "pendingBookings" | "cancelledBookings"
	| "tickets" | "checkedIn" | "checkInRate" | "views" | "uniqueViewers" | "sessions" | "ticketSelects"
	| "checkoutStarts" | "conversionRate" | "startsOn" | "name"

type ViewKey = "summary" | "traffic" | "sales"

interface Column {
	key: string
	label: string
	help: string
	sortKey?: SortKey
	render: (r: EventRow) => React.ReactNode
	csv: (r: EventRow) => string | number
}

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0)
const num = (n: number) => new Intl.NumberFormat("en-US").format(n || 0)
const rate = (n: number) => `${(n || 0).toFixed(1)}%`

const rateBadge = (value: number, hasBase: boolean) =>
	hasBase ? (
		<Badge colorScheme={value >= 80 ? "green" : value >= 50 ? "yellow" : "red"} variant="subtle">{rate(value)}</Badge>
	) : (
		<Text as="span" color="#6b6b6b">—</Text>
	)

const COLUMNS: Record<string, Column> = {
	views: { key: "views", label: "Page views", sortKey: "views", help: "Times the event page was opened in the period.", render: (r) => num(r.traffic.views), csv: (r) => r.traffic.views },
	uniqueViewers: { key: "uniqueViewers", label: "Unique viewers", sortKey: "uniqueViewers", help: "Distinct people (logged-in user or browser) who opened the event page.", render: (r) => num(r.traffic.uniqueViewers), csv: (r) => r.traffic.uniqueViewers },
	sessions: { key: "sessions", label: "Sessions", sortKey: "sessions", help: "Browsing sessions that interacted with this event (view, ticket pick or checkout).", render: (r) => num(r.traffic.sessions), csv: (r) => r.traffic.sessions },
	ticketSelects: { key: "ticketSelects", label: "Ticket picks", sortKey: "ticketSelects", help: "Times a visitor selected a ticket type.", render: (r) => num(r.traffic.ticketSelects), csv: (r) => r.traffic.ticketSelects },
	checkoutStarts: { key: "checkoutStarts", label: "Checkouts started", sortKey: "checkoutStarts", help: "Times a visitor began the booking/checkout form.", render: (r) => num(r.traffic.checkoutStarts), csv: (r) => r.traffic.checkoutStarts },
	bookings: {
		key: "bookings", label: "Bookings", sortKey: "bookings", help: "Confirmed bookings made in the period. One booking can hold several tickets.",
		render: (r) => <Badge colorScheme="blue" variant="subtle" fontSize="sm">{num(r.bookings.confirmed)}</Badge>, csv: (r) => r.bookings.confirmed,
	},
	pending: { key: "pending", label: "Pending", sortKey: "pendingBookings", help: "Bookings awaiting host approval or payment.", render: (r) => (r.bookings.pending ? <Text as="span" color="#fbbf24">{num(r.bookings.pending)}</Text> : "0"), csv: (r) => r.bookings.pending },
	cancelled: { key: "cancelled", label: "Cancelled", sortKey: "cancelledBookings", help: "Bookings cancelled by the guest/host or rejected.", render: (r) => (r.bookings.cancelled ? <Text as="span" color="#f87171">{num(r.bookings.cancelled)}</Text> : "0"), csv: (r) => r.bookings.cancelled },
	conversion: { key: "conversion", label: "Conversion", sortKey: "conversionRate", help: "Confirmed bookings ÷ unique viewers. Over 100% means bookings came in without a tracked page view (direct links, mobile app).", render: (r) => (r.traffic.uniqueViewers ? rate(r.conversionRate) : <Text as="span" color="#6b6b6b">—</Text>), csv: (r) => r.conversionRate },
	tickets: { key: "tickets", label: "Tickets sold", sortKey: "tickets", help: "Tickets on confirmed bookings (free tickets included).", render: (r) => <Text as="span" fontWeight="semibold">{num(r.tickets.sold)}</Text>, csv: (r) => r.tickets.sold },
	checkedIn: { key: "checkedIn", label: "Checked in", sortKey: "checkedIn", help: "Guests checked in at the door, on those confirmed bookings.", render: (r) => num(r.tickets.checkedIn), csv: (r) => r.tickets.checkedIn },
	checkInRate: { key: "checkInRate", label: "Check-in rate", sortKey: "checkInRate", help: "Checked in ÷ tickets sold.", render: (r) => rateBadge(r.tickets.checkInRate, r.tickets.sold > 0), csv: (r) => r.tickets.checkInRate },
	gross: { key: "gross", label: "Gross", sortKey: "gross", help: "Ticket value at list price, before discounts.", render: (r) => money(r.revenue.gross), csv: (r) => r.revenue.gross },
	discounts: { key: "discounts", label: "Discounts", sortKey: "discounts", help: "Taken off by referral / promo codes.", render: (r) => (r.revenue.discounts ? <Text as="span" color="#f87171">−{money(r.revenue.discounts)}</Text> : money(0)), csv: (r) => r.revenue.discounts },
	revenue: {
		key: "revenue", label: "Net revenue", sortKey: "revenue", help: "What guests actually paid for tickets (gross − discounts). Membership fees excluded.",
		render: (r) => (
			<Box>
				<Text as="span" fontWeight="semibold" color={r.revenue.net > 0 ? "#4ade80" : undefined}>{money(r.revenue.net)}</Text>
				{r.revenue.discounts > 0 && <Text fontSize="xs" color="#9C9C9C">{money(r.revenue.discounts)} discounted</Text>}
			</Box>
		),
		csv: (r) => r.revenue.net,
	},
	avgOrder: { key: "avgOrder", label: "Avg / booking", sortKey: "avgOrderValue", help: "Net revenue ÷ confirmed bookings.", render: (r) => money(r.revenue.avgOrderValue), csv: (r) => r.revenue.avgOrderValue },
}

const VIEWS: Record<ViewKey, { label: string; columns: string[] }> = {
	summary: { label: "Summary", columns: ["views", "sessions", "bookings", "tickets", "revenue", "checkInRate"] },
	traffic: { label: "Traffic & funnel", columns: ["views", "uniqueViewers", "sessions", "ticketSelects", "checkoutStarts", "bookings", "conversion"] },
	sales: { label: "Sales & attendance", columns: ["bookings", "pending", "cancelled", "tickets", "gross", "discounts", "revenue", "avgOrder", "checkedIn", "checkInRate"] },
}

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
	{ value: "revenue", label: "Net revenue" },
	{ value: "views", label: "Page views" },
	{ value: "uniqueViewers", label: "Unique viewers" },
	{ value: "sessions", label: "Sessions" },
	{ value: "tickets", label: "Tickets sold" },
	{ value: "bookings", label: "Confirmed bookings" },
	{ value: "conversionRate", label: "Conversion rate" },
	{ value: "checkedIn", label: "Checked in" },
	{ value: "checkInRate", label: "Check-in rate" },
	{ value: "gross", label: "Gross revenue" },
	{ value: "discounts", label: "Discounts" },
	{ value: "avgOrderValue", label: "Avg per booking" },
	{ value: "pendingBookings", label: "Pending bookings" },
	{ value: "cancelledBookings", label: "Cancelled bookings" },
	{ value: "ticketSelects", label: "Ticket picks" },
	{ value: "checkoutStarts", label: "Checkouts started" },
	{ value: "startsOn", label: "Event date" },
	{ value: "name", label: "Event name" },
]

const TIMING_BADGE: Record<Timing, { label: string; scheme: string }> = {
	upcoming: { label: "Upcoming", scheme: "orange" },
	ongoing: { label: "Live now", scheme: "green" },
	past: { label: "Past", scheme: "gray" },
	undated: { label: "No date", scheme: "gray" },
}

const fmtDate = (iso: string | null) =>
	iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "No date set"

const selectProps = {
	size: "sm" as const,
	bg: "#0f0f0f",
	color: "white",
	borderColor: "#2a2a2a",
	focusBorderColor: "#F79432",
	sx: { "> option": { bg: "#1a1a1a", color: "white" } },
}

interface Props {
	dateFrom: Date | null
	dateTo: Date | null
}

const DEFAULTS = { sortBy: "revenue" as SortKey, sortDir: "desc" as "asc" | "desc", timing: "all", privacy: "all", pricing: "all", activeOnly: false }

export default function EventPerformanceTab({ dateFrom, dateTo }: Props) {
	const toast = useToast()
	const [rows, setRows] = useState<EventRow[]>([])
	const [totals, setTotals] = useState<Totals | null>(null)
	const [total, setTotal] = useState(0)
	const [isLoading, setIsLoading] = useState(true)
	const [isExporting, setIsExporting] = useState(false)

	const [page, setPage] = useState(1)
	const [pageSize, setPageSize] = useState(10)
	const [sortBy, setSortBy] = useState<SortKey>(DEFAULTS.sortBy)
	const [sortDir, setSortDir] = useState<"asc" | "desc">(DEFAULTS.sortDir)
	const [timing, setTiming] = useState(DEFAULTS.timing)
	const [privacy, setPrivacy] = useState(DEFAULTS.privacy)
	const [pricing, setPricing] = useState(DEFAULTS.pricing)
	const [activeOnly, setActiveOnly] = useState(DEFAULTS.activeOnly)
	const [searchInput, setSearchInput] = useState("")
	const [search, setSearch] = useState("")
	const [view, setView] = useState<ViewKey>("summary")
	const tableTopRef = useRef<HTMLDivElement>(null)

	// Debounce typing so every keystroke isn't a request.
	useEffect(() => {
		const t = setTimeout(() => setSearch(searchInput.trim()), 300)
		return () => clearTimeout(t)
	}, [searchInput])

	// Any filter change returns to page 1 — handled in the fetch effect so it costs one request.
	const filterSig = JSON.stringify([dateFrom?.getTime(), dateTo?.getTime(), sortBy, sortDir, timing, privacy, pricing, activeOnly, search, pageSize])
	const lastFilterSig = useRef(filterSig)

	const buildParams = (extra: Record<string, string> = {}) => {
		const params = new URLSearchParams({
			page: String(page),
			limit: String(pageSize),
			sortBy,
			sortDir,
			timing,
			privacy,
			pricing,
			activeOnly: String(activeOnly),
			...extra,
		})
		if (search) params.set("search", search)
		if (dateFrom) params.set("dateFrom", dateFrom.toISOString())
		if (dateTo) params.set("dateTo", dateTo.toISOString())
		return params
	}

	useEffect(() => {
		if (lastFilterSig.current !== filterSig) {
			lastFilterSig.current = filterSig
			if (page !== 1) {
				setPage(1)
				return
			}
		}
		const controller = new AbortController()
		setIsLoading(true)
		fetch(`/api/analytics/top-events?${buildParams().toString()}`, { credentials: "include", signal: controller.signal })
			.then((r) => r.json())
			.then((result) => {
				if (!result?.status || !result.data) throw new Error(result?.message || "Failed to load events")
				setRows(result.data.events)
				setTotals(result.data.totals)
				setTotal(result.data.pagination.total)
				if (result.data.pagination.page !== page) setPage(result.data.pagination.page)
			})
			.catch((err) => {
				if (err?.name === "AbortError") return
				toast({ title: "Couldn't load event analytics", description: err.message, status: "error", duration: 5000, isClosable: true })
			})
			.finally(() => {
				if (!controller.signal.aborted) setIsLoading(false)
			})
		return () => controller.abort()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [page, filterSig])

	const handleSortClick = (key: SortKey) => {
		if (key === sortBy) setSortDir((d) => (d === "desc" ? "asc" : "desc"))
		else {
			setSortBy(key)
			setSortDir(key === "name" ? "asc" : "desc")
		}
	}

	const handlePageChange = (p: number) => {
		setPage(p)
		tableTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
	}

	const resetFilters = () => {
		setSortBy(DEFAULTS.sortBy)
		setSortDir(DEFAULTS.sortDir)
		setTiming(DEFAULTS.timing)
		setPrivacy(DEFAULTS.privacy)
		setPricing(DEFAULTS.pricing)
		setActiveOnly(DEFAULTS.activeOnly)
		setSearchInput("")
	}
	const isFiltered = timing !== "all" || privacy !== "all" || pricing !== "all" || activeOnly || !!search

	const exportCsv = async () => {
		setIsExporting(true)
		try {
			const res = await fetch(`/api/analytics/top-events?${buildParams({ all: "true", page: "1", limit: "100" }).toString()}`, { credentials: "include" })
			const result = await res.json()
			if (!result?.status) throw new Error(result?.message || "Export failed")
			const all: EventRow[] = result.data.events
			const header = [
				"Event", "Event date", "Status", "Visibility", "Pricing", "Host", "Page views", "Unique viewers", "Sessions", "Ticket picks",
				"Checkouts started", "Confirmed bookings", "Pending", "Cancelled", "Conversion %", "Tickets sold", "Checked in",
				"Check-in %", "Gross", "Discounts", "Net revenue", "Avg per booking", "URL",
			]
			const lines = all.map((r) => [
				r.name, r.startsOn ? r.startsOn.slice(0, 10) : "", TIMING_BADGE[r.timing].label, r.privacy, r.isPaid ? "Paid" : "Free", r.host?.name || "",
				r.traffic.views, r.traffic.uniqueViewers, r.traffic.sessions, r.traffic.ticketSelects, r.traffic.checkoutStarts,
				r.bookings.confirmed, r.bookings.pending, r.bookings.cancelled, r.conversionRate, r.tickets.sold, r.tickets.checkedIn,
				r.tickets.checkInRate, r.revenue.gross, r.revenue.discounts, r.revenue.net, r.revenue.avgOrderValue,
				`${window.location.origin}${eventPath(r.slug)}`,
			])
			downloadCsv(`event-analytics-${new Date().toISOString().slice(0, 10)}.csv`, header, lines)
		} catch (err: any) {
			toast({ title: "Export failed", description: err.message, status: "error", duration: 5000, isClosable: true })
		} finally {
			setIsExporting(false)
		}
	}

	const columns = useMemo(() => VIEWS[view].columns.map((k) => COLUMNS[k]), [view])
	const rankOffset = (page - 1) * pageSize

	const SortHeader = ({ col }: { col: Column }) => {
		const active = col.sortKey === sortBy
		return (
			<Th
				isNumeric
				cursor={col.sortKey ? "pointer" : undefined}
				onClick={col.sortKey ? () => handleSortClick(col.sortKey!) : undefined}
				color={active ? "#F79432 !important" : undefined}
				_hover={col.sortKey ? { color: "white !important" } : undefined}
				userSelect="none"
				aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
			>
				<Flex align="center" justify="flex-end" gap={1}>
					{active && (sortDir === "desc" ? <FiArrowDown /> : <FiArrowUp />)}
					{col.label}
					<InfoTip label={col.help} />
				</Flex>
			</Th>
		)
	}

	return (
		<Box>
			{/* Totals for everything matching the filters (all pages) */}
			<SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={6}>
				<MetricsCard dark title="Events" value={num(totals?.events || 0)} subtitle={isFiltered ? "matching filters" : "all events"} />
				<MetricsCard dark title="Page views" value={num(totals?.views || 0)} subtitle={`${num(totals?.uniqueViewers || 0)} unique viewers`} />
				<MetricsCard dark title="Bookings · Tickets" value={`${num(totals?.bookings || 0)} · ${num(totals?.tickets || 0)}`} subtitle={`${rate(totals?.conversionRate || 0)} of viewers booked`} />
				<MetricsCard dark title="Net revenue" value={money(totals?.revenue || 0)} subtitle={`${money(totals?.gross || 0)} gross − ${money(totals?.discounts || 0)} discounts`} />
			</SimpleGrid>

			<Box ref={tableTopRef} scrollMarginTop="80px" />
			<AnalyticsPanel
				title="Event performance"
				subtitle={
					<>
						Every event with its traffic, bookings, attendance and revenue. The date range counts activity that happened in it — use{" "}
						<Text as="span" color="white">When</Text> to filter by the event&apos;s own date.
					</>
				}
				actions={
					<HStack spacing={2}>
						{isFiltered && (
							<Button size="sm" variant="ghost" color="#9C9C9C" leftIcon={<FiRefreshCw />} onClick={resetFilters} _hover={{ color: "white", bg: "#262626" }}>
								Reset
							</Button>
						)}
						<Button size="sm" leftIcon={<FiDownload />} onClick={exportCsv} isLoading={isExporting} bg="#2a2a2a" color="white" _hover={{ bg: "#333" }}>
							Export CSV
						</Button>
					</HStack>
				}
			>
				{/* Filters */}
				<Flex gap={3} wrap="wrap" mb={4} align="flex-end">
					<Box flex="1 1 220px" minW="200px">
						<Text fontSize="xs" color="#9C9C9C" mb={1}>Search</Text>
						<InputGroup size="sm">
							<InputLeftElement pointerEvents="none" color="#6b6b6b"><FiSearch /></InputLeftElement>
							<Input
								placeholder="Event name, URL or host"
								value={searchInput}
								onChange={(e) => setSearchInput(e.target.value)}
								bg="#0f0f0f"
								color="white"
								borderColor="#2a2a2a"
								focusBorderColor="#F79432"
								_placeholder={{ color: "#6b6b6b" }}
							/>
						</InputGroup>
					</Box>
					<Box>
						<Text fontSize="xs" color="#9C9C9C" mb={1}>Sort by</Text>
						<HStack spacing={1}>
							<Select {...selectProps} w="180px" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} aria-label="Sort by">
								{SORT_OPTIONS.map((o) => (
									<option key={o.value} value={o.value}>{o.label}</option>
								))}
							</Select>
							<Tooltip label={sortDir === "desc" ? "Highest first" : "Lowest first"} hasArrow>
								<IconButton
									size="sm"
									aria-label="Toggle sort direction"
									icon={sortDir === "desc" ? <FiArrowDown /> : <FiArrowUp />}
									onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
									bg="#0f0f0f"
									color="white"
									border="1px solid"
									borderColor="#2a2a2a"
									_hover={{ bg: "#262626" }}
								/>
							</Tooltip>
						</HStack>
					</Box>
					<Box>
						<Text fontSize="xs" color="#9C9C9C" mb={1}>When</Text>
						<Select {...selectProps} w="130px" value={timing} onChange={(e) => setTiming(e.target.value)} aria-label="Event timing">
							<option value="all">Any time</option>
							<option value="upcoming">Upcoming</option>
							<option value="ongoing">Live now</option>
							<option value="past">Past</option>
							<option value="undated">No date</option>
						</Select>
					</Box>
					<Box>
						<Text fontSize="xs" color="#9C9C9C" mb={1}>Visibility</Text>
						<Select {...selectProps} w="110px" value={privacy} onChange={(e) => setPrivacy(e.target.value)} aria-label="Visibility">
							<option value="all">All</option>
							<option value="public">Public</option>
							<option value="private">Private</option>
						</Select>
					</Box>
					<Box>
						<Text fontSize="xs" color="#9C9C9C" mb={1}>Pricing</Text>
						<Select {...selectProps} w="100px" value={pricing} onChange={(e) => setPricing(e.target.value)} aria-label="Pricing">
							<option value="all">All</option>
							<option value="paid">Paid</option>
							<option value="free">Free</option>
						</Select>
					</Box>
					<HStack h="32px" spacing={2}>
						<Switch id="active-only" colorScheme="orange" isChecked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
						<Text as="label" htmlFor="active-only" fontSize="sm" color="#9C9C9C" cursor="pointer" whiteSpace="nowrap">
							Only with activity
						</Text>
					</HStack>
				</Flex>

				{/* Column view */}
				<HStack spacing={2} mb={3} flexWrap="wrap">
					<Text fontSize="xs" color="#9C9C9C">Columns:</Text>
					{(Object.keys(VIEWS) as ViewKey[]).map((k) => (
						<Button
							key={k}
							size="xs"
							borderRadius="full"
							px={3}
							onClick={() => setView(k)}
							bg={view === k ? "#F79432" : "#2a2a2a"}
							color={view === k ? "black" : "#9C9C9C"}
							_hover={{ bg: view === k ? "#E68422" : "#333" }}
						>
							{VIEWS[k].label}
						</Button>
					))}
				</HStack>

				<Box position="relative">
					{isLoading && (
						<Center position="absolute" inset={0} bg="rgba(26,26,26,0.6)" zIndex={2} borderRadius="md">
							<Spinner color="#F79432" />
						</Center>
					)}
					{rows.length === 0 && !isLoading ? (
						<Center py={12} flexDirection="column" gap={2}>
							<Text color="#9C9C9C">No events match these filters.</Text>
							{isFiltered && (
								<Button size="sm" variant="link" color="#F79432" onClick={resetFilters}>Clear filters</Button>
							)}
						</Center>
					) : (
						<TableContainer sx={darkTableSx} overflowX="auto" maxH="70vh" overflowY="auto" border="1px solid" borderColor="#2a2a2a" borderRadius="md">
							<Table variant="simple" size="sm">
								<Thead>
									<Tr>
										<Th w="40px" isNumeric>#</Th>
										<Th
											position="sticky"
											left={0}
											zIndex="2 !important"
											minW="280px"
											cursor="pointer"
											onClick={() => handleSortClick("name")}
											color={sortBy === "name" ? "#F79432 !important" : undefined}
										>
											<Flex align="center" gap={1}>
												Event
												{sortBy === "name" && (sortDir === "desc" ? <FiArrowDown /> : <FiArrowUp />)}
											</Flex>
										</Th>
										<Th cursor="pointer" onClick={() => handleSortClick("startsOn")} color={sortBy === "startsOn" ? "#F79432 !important" : undefined}>
											<Flex align="center" gap={1}>
												Date
												{sortBy === "startsOn" && (sortDir === "desc" ? <FiArrowDown /> : <FiArrowUp />)}
											</Flex>
										</Th>
										{columns.map((c) => (
											<SortHeader key={c.key} col={c} />
										))}
										<Th />
									</Tr>
								</Thead>
								<Tbody>
									{rows.map((r, idx) => (
										<Tr key={r.eventId}>
											<Td isNumeric color="#6b6b6b !important">{rankOffset + idx + 1}</Td>
											<Td position="sticky" left={0} bg="#1a1a1a" zIndex={1} maxW="360px">
												<Flex align="center" gap={3}>
													{r.image ? (
														<Image src={r.image} alt="" boxSize="40px" objectFit="cover" borderRadius="md" flexShrink={0} />
													) : (
														<Box boxSize="40px" bg="#2a2a2a" borderRadius="md" flexShrink={0} />
													)}
													<Box minW={0}>
														<Link as={NextLink} href={eventPath(r.slug)} target="_blank" color="#F79432" fontWeight="medium" display="block" noOfLines={1} whiteSpace="normal" title={r.name} _hover={{ textDecoration: "underline" }}>
															{r.name}
														</Link>
														<HStack spacing={1} mt={1} flexWrap="wrap">
															<Badge colorScheme={TIMING_BADGE[r.timing].scheme} variant="subtle" fontSize="10px">{TIMING_BADGE[r.timing].label}</Badge>
															{r.privacy === "private" && <Badge colorScheme="purple" variant="subtle" fontSize="10px">Private</Badge>}
															<Badge colorScheme={r.isPaid ? "green" : "gray"} variant="subtle" fontSize="10px">{r.isPaid ? "Paid" : "Free"}</Badge>
															{r.isDraft && <Badge colorScheme="yellow" variant="subtle" fontSize="10px">Draft</Badge>}
															{r.host && <Text fontSize="xs" color="#6b6b6b" noOfLines={1} title={r.host.email}>by {r.host.name}</Text>}
														</HStack>
													</Box>
												</Flex>
											</Td>
											<Td whiteSpace="nowrap" color="#9C9C9C !important">{fmtDate(r.startsOn)}</Td>
											{columns.map((c) => (
												<Td key={c.key} isNumeric>{c.render(r)}</Td>
											))}
											<Td>
												<Tooltip label="Open this event's detailed analytics" hasArrow>
													<IconButton
														as={NextLink}
														href={`/console/events/${r.eventId}/analytics`}
														aria-label="Event analytics"
														icon={<FiBarChart2 />}
														size="xs"
														variant="ghost"
														color="#9C9C9C"
														_hover={{ color: "#F79432", bg: "#262626" }}
													/>
												</Tooltip>
											</Td>
										</Tr>
									))}
								</Tbody>
							</Table>
						</TableContainer>
					)}
				</Box>

				<TablePagination page={page} pageSize={pageSize} total={total} onPageChange={handlePageChange} onPageSizeChange={setPageSize} isLoading={isLoading} noun="events" />
			</AnalyticsPanel>
		</Box>
	)
}

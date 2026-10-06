import ConsoleLayout from "@Jetzy/components/layout/ConsoleLayout"
import { adminOnly } from "@Jetzy/lib/authSession"
import { Pages } from "@Jetzy/types"
import { GetServerSideProps } from "next"
import Head from "next/head"
import { useRouter } from "next/router"
import React, { useState, useEffect, useMemo } from "react"
import { Box, Flex, Text, SimpleGrid, useToast, Spinner, Center, Tabs, TabList, TabPanels, Tab, TabPanel, Table, Thead, Tbody, Tr, Th, Td, TableContainer, Badge, Button, HStack, Select } from "@chakra-ui/react"
import NextLink from "next/link"
import { FiUsers, FiDollarSign, FiShoppingCart, FiEye, FiDownload } from "react-icons/fi"
import MetricsCard from "@/components/analytics/MetricsCard"
import DateRangeSelector from "@/components/analytics/DateRangeSelector"
import VisitorChart from "@/components/analytics/VisitorChart"
import BookingTrendsChart from "@/components/analytics/BookingTrendsChart"
import EventPerformanceTab from "@/components/analytics/EventPerformanceTab"
import TablePagination from "@/components/analytics/TablePagination"
import { AnalyticsPanel, InfoTip, StatTable, darkTableSx, downloadCsv } from "@/components/analytics/AnalyticsPanel"
import { usePagedAnalytics } from "@/hooks/usePagedAnalytics"

interface OverviewData {
	bounceRate?: number
	events: {
		total: number
		public: number
		private: number
		paid: number
		free: number
		upcoming: number
		past: number
	}
	bookings: {
		total: number
		confirmed: number
		pending: number
		cancelled: number
		failed: number
		refunded: number
		eventsWithBookings?: number
		byStatus: Record<string, number>
	}
	revenue: {
		total: number
		gross?: number
		netRevenue: number
		totalDiscounts: number
		averagePerEvent: number
		averagePerBooking: number
	}
	tickets: {
		totalSold: number
		averagePerBooking: number
	}
	checkIns: {
		totalCheckedIn: number
		totalTicketsPurchased: number
		checkInRate: number
	}
	users: {
		total: number
		admins: number
		regular: number
		active: number
		inactive: number
		activeRate: number
		inactiveRate: number
		activeAdmins: number
		activeRegular: number
		inactiveAdmins: number
		inactiveRegular: number
	}
	referralCodes: {
		total: number
		active: number
		inactive: number
		totalUsage: number
	}
	visitors: {
		totalSessions: number
		loggedInSessions: number
		anonymousSessions: number
		uniqueVisitors: number
		uniqueLoggedInUsers: number
	}
	sessions: {
		total: number
		averageDuration: number
		measuredForDuration?: number
	}
	pageViews: {
		total: number
	}
	dateRange: {
		from: string | null
		to: string | null
	}
}

interface VisitorData {
	totals: {
		totalSessions: number
		totalLoggedInSessions: number
		totalAnonymousSessions: number
		totalUniqueVisitors: number
		totalUniqueLoggedInUsers: number
		totalPageViews: number
	}
	byDate: Array<{
		date: string
		totalSessions: number
		loggedInSessions: number
		anonymousSessions: number
		uniqueVisitors: number
		uniqueLoggedInUsers: number
		totalPageViews: number
		uniquePages: number
	}>
}

interface BookingData {
	totals: {
		totalBookings: number
		confirmedBookings: number
		totalRevenue: number
		totalTickets: number
		totalDiscounts: number
		averageBookingValue: number
	}
	byStatus: Record<string, number>
	byDate: Array<{
		date: string
		totalBookings: number
		totalRevenue: number
		totalTickets: number
		byStatus?: Record<string, number>
	}>
}

interface PaginationData {
	page: number
	limit: number
	total: number
	totalPages: number
	hasNextPage: boolean
	hasPreviousPage: boolean
}

interface TopUser {
	userId: string
	firstName: string
	lastName: string
	email: string
	role: string
	lastActiveAt: string | null
	createdAt: string
	stats: {
		sessions: number
		avgSessionDuration: number
		pageViews: number
		uniquePages: number
		actions: number
		eventInteractions: number
		uniqueEvents: number
		activityScore: number
	}
	lastActivity: string
}

interface ReferrerData {
	referrers: Array<{
		referrer: string
		domain: string
		category: string
		pageViews: number
		uniqueSessions: number
		uniqueUsers: number
		percentage: number
	}>
	pagination?: PaginationData
	directTraffic: {
		pageViews: number
		uniqueSessions: number
		percentage: number
	}
	total: number
}

interface UTMData {
	grouped: Array<{
		campaign?: string
		source?: string
		medium?: string
		count: number
		uniqueSessionsCount: number
		uniqueUsersCount: number
		percentage: number
	}>
	summary: {
		sources: Array<{ source: string; count: number }>
		mediums: Array<{ medium: string; count: number }>
		campaigns: Array<{ campaign: string; count: number }>
	}
	total: number
	groupBy: string
}

interface DeviceData {
	devices: Array<{
		deviceType: string
		count: number
		uniqueSessionsCount: number
		uniqueUsersCount: number
		percentage: number
	}>
	browsers: Array<{
		browserType: string
		count: number
		uniqueSessionsCount: number
		uniqueUsersCount: number
		percentage: number
	}>
	sessionDevices: Array<{
		deviceType: string
		sessionCount: number
		uniqueUsersCount: number
	}>
	total: number
}

interface PageData {
	entryPages: Array<{
		page: string
		count: number
		uniqueSessionsCount: number
		uniqueUsersCount: number
		percentage: number
	}>
	exitPages: Array<{
		page: string
		count: number
		uniqueSessionsCount: number
		percentage: number
	}>
	mostViewedPages: Array<{
		page: string
		count: number
		uniqueSessionsCount: number
		uniqueUsersCount: number
		avgTimeSpent: number | null
		percentage: number
	}>
	pagination: {
		entryPages: PaginationData
		exitPages: PaginationData
		mostViewedPages: PaginationData
	}
	totals: {
		sessions: number
		pageViews: number
	}
}

interface TopUsersData {
	users: TopUser[]
	pagination: PaginationData
}

interface NamedEventRow {
	category: string
	eventName: string
	totalEvents: number
	uniqueUsers: number
}

interface NamedEventsData {
	rows: NamedEventRow[]
	summary: {
		eventInteractionsCount: number
		ctaClicksCount: number
		pageViewsCount: number
		formEventsCount: number
	}
}

const TABS = [
	{ key: "overview", label: "Overview" },
	{ key: "events", label: "Events" },
	{ key: "visitors", label: "Visitors & Sessions" },
	{ key: "bookings", label: "Bookings & Revenue" },
	{ key: "users", label: "Users" },
	{ key: "traffic", label: "Traffic Sources" },
	{ key: "devices", label: "Devices & Pages" },
	{ key: "named-events", label: "Named Events" },
] as const

const formatCurrency = (amount: number) =>
	new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(amount || 0)

const formatNumber = (num: number) => new Intl.NumberFormat("en-US").format(num || 0)

const formatDuration = (seconds: number) => {
	if (!seconds || seconds < 1) return "0s"
	if (seconds < 60) return `${Math.round(seconds)}s`
	if (seconds < 3600) {
		const m = Math.floor(seconds / 60)
		const s = Math.round(seconds % 60)
		return s ? `${m}m ${s}s` : `${m}m`
	}
	const h = Math.floor(seconds / 3600)
	const m = Math.round((seconds % 3600) / 60)
	return m ? `${h}h ${m}m` : `${h}h`
}

const share = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null)

const formatDay = (date: string) => {
	const d = new Date(`${date}T00:00:00`)
	return isNaN(d.getTime()) ? date : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
}

const pagePathToLabel = (path: string): string => {
	const map: Record<string, string> = {
		"/": "Home",
		"/login": "Login",
		"/register": "Sign Up",
		"/forgot-password": "Forgot Password",
		"/console/events": "My Events",
		"/console/events/create": "Create Event",
		"/console/bookings": "My Bookings",
		"/console/analytics": "Analytics Dashboard",
		"/console/analytics/journey": "Journey Analytics",
		"/console/profile": "Profile Settings",
	}
	if (map[path]) return map[path]
	if (/^\/[^/]+$/.test(path) && !path.startsWith("/console") && !path.startsWith("/api")) return `Event Page (${path})`
	if (path.includes("/[slug]") || path === "/[slug]") return "Event Detail Page"
	if (path.includes("/manage")) return "Event Management"
	if (path.includes("/analytics")) return "Event Analytics"
	if (path.includes("/bookings")) return "Event Bookings"
	if (path.includes("/checkin") || path.includes("/check-in")) return "Check-in Portal"
	if (path.includes("/booking")) return "Booking Flow"
	if (path.includes("/console/events/")) return "Event Console Page"
	return path
}

/** Page path cell: readable label, raw path underneath when they differ. */
const PageCell = ({ path }: { path: string }) => {
	const label = pagePathToLabel(path)
	return (
		<Box maxW="420px">
			<Text fontWeight="medium" noOfLines={1} title={label}>{label}</Text>
			{label !== path && (
				<Text fontSize="xs" color="#9C9C9C" fontFamily="mono" noOfLines={1} title={path}>{path}</Text>
			)}
		</Box>
	)
}

const tabProps = {
	color: "#9C9C9C",
	fontWeight: "semibold",
	whiteSpace: "nowrap" as const,
	px: 4,
	_selected: { color: "#F79432", borderBottom: "2px solid #F79432" },
	_hover: { color: "white" },
}

const selectProps = {
	size: "sm" as const,
	bg: "#0f0f0f",
	color: "white",
	borderColor: "#2a2a2a",
	focusBorderColor: "#F79432",
	sx: { "> option": { bg: "#1a1a1a", color: "white" } },
}

/** Client-side pager for tables whose full data is already loaded (daily breakdowns, named events). */
function useLocalPager<T>(rows: T[], initialSize = 10) {
	const [page, setPage] = useState(1)
	const [pageSize, setPageSize] = useState(initialSize)
	const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
	const safePage = Math.min(page, totalPages)
	useEffect(() => {
		setPage(1)
	}, [rows.length, pageSize])
	return {
		page: safePage,
		pageSize,
		setPage,
		setPageSize,
		pageRows: rows.slice((safePage - 1) * pageSize, safePage * pageSize),
	}
}

export default function AnalyticsPage() {
	const router = useRouter()
	const toast = useToast()

	const [overviewData, setOverviewData] = useState<OverviewData | null>(null)
	const [visitorData, setVisitorData] = useState<VisitorData | null>(null)
	const [bookingData, setBookingData] = useState<BookingData | null>(null)
	const [utmData, setUtmData] = useState<UTMData | null>(null)
	const [deviceData, setDeviceData] = useState<DeviceData | null>(null)
	const [entryExitData, setEntryExitData] = useState<PageData | null>(null)
	const [namedEventsData, setNamedEventsData] = useState<NamedEventsData | null>(null)
	const [namedEventsCategory, setNamedEventsCategory] = useState<string>("all")
	const [isLoading, setIsLoading] = useState(true)
	const [hasLoaded, setHasLoaded] = useState(false)
	const [dateFrom, setDateFrom] = useState<Date | null>(null)
	const [dateTo, setDateTo] = useState<Date | null>(null)
	const [usersSortBy, setUsersSortBy] = useState("activity")

	// Tab lives in the URL (?tab=events) so a view can be bookmarked or shared.
	const tabIndex = Math.max(0, TABS.findIndex((t) => t.key === router.query.tab))
	const handleTabChange = (index: number) => {
		router.replace({ pathname: router.pathname, query: { ...router.query, tab: TABS[index].key } }, undefined, { shallow: true, scroll: false })
	}

	const dateParams = useMemo(
		() => ({ dateFrom: dateFrom ? dateFrom.toISOString() : null, dateTo: dateTo ? dateTo.toISOString() : null }),
		[dateFrom, dateTo]
	)

	// Paginated tables fetch independently.
	const usersTable = usePagedAnalytics<TopUsersData>("/api/analytics/top-users", { ...dateParams, sortBy: usersSortBy }, 10)
	const referrersTable = usePagedAnalytics<ReferrerData>("/api/analytics/referrers", dateParams, 10)
	const pagesTable = usePagedAnalytics<PageData>("/api/analytics/pages", dateParams, 10)

	const fetchAnalytics = async (from: Date | null, to: Date | null) => {
		setIsLoading(true)
		try {
			const params = new URLSearchParams()
			if (from) params.append("dateFrom", from.toISOString())
			if (to) params.append("dateTo", to.toISOString())
			const qs = params.toString()
			const get = (path: string) => fetch(`${path}${path.includes("?") ? "&" : "?"}${qs}`, { method: "GET", credentials: "include", headers: { "Content-Type": "application/json" } })

			const [overviewRes, visitorsRes, bookingsRes, utmRes, devicesRes, entryExitRes, namedEventsRes] = await Promise.all([
				get("/api/analytics/overview"),
				get("/api/analytics/visitors?groupBy=day"),
				get("/api/analytics/bookings?groupBy=day"),
				get("/api/analytics/utm?groupBy=campaign"),
				get("/api/analytics/devices"),
				get("/api/analytics/pages?limit=10&page=1"),
				get("/api/analytics/named-events"),
			])

			const read = async (res: Response, set: (d: any) => void) => {
				if (!res.ok) return
				const result = await res.json()
				if (result.status && result.data) set(result.data)
			}
			await Promise.all([
				read(overviewRes, setOverviewData),
				read(visitorsRes, setVisitorData),
				read(bookingsRes, setBookingData),
				read(utmRes, setUtmData),
				read(devicesRes, setDeviceData),
				read(entryExitRes, setEntryExitData),
				read(namedEventsRes, setNamedEventsData),
			])

			if (!overviewRes.ok || !visitorsRes.ok || !bookingsRes.ok) {
				throw new Error("Failed to fetch some analytics data")
			}
		} catch (error: any) {
			console.error("[Analytics] Error fetching data:", error)
			toast({
				title: "Error",
				description: error.message || "Failed to load analytics data",
				status: "error",
				duration: 5000,
				isClosable: true,
			})
		} finally {
			setIsLoading(false)
			setHasLoaded(true)
		}
	}

	useEffect(() => {
		fetchAnalytics(dateFrom, dateTo)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [dateFrom, dateTo])

	const handleDateChange = (from: Date | null, to: Date | null) => {
		setDateFrom(from)
		setDateTo(to)
	}

	const filteredNamedRows = useMemo(
		() => (namedEventsData ? namedEventsData.rows.filter((r) => namedEventsCategory === "all" || r.category === namedEventsCategory) : []),
		[namedEventsData, namedEventsCategory]
	)
	const namedPager = useLocalPager(filteredNamedRows, 25)
	const visitorDays = useMemo(() => [...(visitorData?.byDate || [])].reverse(), [visitorData])
	const visitorPager = useLocalPager(visitorDays, 10)
	const bookingDays = useMemo(() => [...(bookingData?.byDate || [])].reverse(), [bookingData])
	const bookingPager = useLocalPager(bookingDays, 10)

	const exportNamedEventsCSV = () => {
		downloadCsv(
			`named-events-${new Date().toISOString().slice(0, 10)}.csv`,
			["Category", "Event Name", "Total Events", "Unique Users"],
			filteredNamedRows.map((r) => [r.category, r.eventName, r.totalEvents, r.uniqueUsers])
		)
	}

	const o = overviewData
	const otherBookings = o ? Math.max(0, o.bookings.total - o.bookings.confirmed - o.bookings.pending - o.bookings.cancelled - o.bookings.failed - o.bookings.refunded) : 0
	const liveOrUndatedEvents = o ? Math.max(0, o.events.total - o.events.upcoming - o.events.past) : 0
	const isAllTime = !dateFrom && !dateTo
	const periodLabel = isAllTime ? "all time" : "the selected period"

	return (
		<>
			<Head>
				<title>Analytics - Jetzy Events</title>
				<meta name="description" content="View comprehensive analytics and insights for your events platform" />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout page={Pages.Analytics} maxW="100%">
				<Box maxW="1400px" mx="auto" px={{ base: 4, md: 0 }} py={6}>
					{/* Date Range Selector */}
					<Flex bg="#1a1a1a" color="white" p={4} borderRadius="lg" border="1px solid" borderColor="#2a2a2a" mb={6} justify="space-between" align="center" gap={4} wrap="wrap">
						<DateRangeSelector dark dateFrom={dateFrom} dateTo={dateTo} onDateChange={handleDateChange} />
						<HStack spacing={2} flexWrap="wrap">
							<NextLink href="/console/analytics/growth" passHref legacyBehavior>
								<Button as="a" variant="outline" borderColor="#F79432" color="#F79432" _hover={{ bg: "#2a2a2a" }} size="sm">Referrals &amp; Memberships</Button>
							</NextLink>
							<NextLink href="/console/analytics/qr-signups" passHref legacyBehavior>
								<Button as="a" variant="outline" borderColor="#F79432" color="#F79432" _hover={{ bg: "#2a2a2a" }} size="sm">QR Signups</Button>
							</NextLink>
							<NextLink href="/console/analytics/journey" passHref legacyBehavior>
								<Button as="a" colorScheme="orange" bg="#F79432" color="black" _hover={{ bg: "#E68422" }} size="sm">View Journey Analytics</Button>
							</NextLink>
						</HStack>
					</Flex>

					{!hasLoaded ? (
						<Center py={20}>
							<Spinner size="xl" color="#F79432" />
						</Center>
					) : o ? (
						<Box position="relative">
							{isLoading && (
								<Flex position="fixed" top="80px" left="50%" transform="translateX(-50%)" zIndex={20} bg="#1a1a1a" border="1px solid" borderColor="#2a2a2a" px={4} py={2} borderRadius="full" align="center" gap={2} boxShadow="lg">
									<Spinner size="sm" color="#F79432" />
									<Text fontSize="sm" color="white">Updating…</Text>
								</Flex>
							)}
							<Tabs variant="line" index={tabIndex} onChange={handleTabChange} isLazy lazyBehavior="keepMounted">
								<Box overflowX="auto" mb={4} sx={{ scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
									<TabList borderBottom="2px solid #2a2a2a" w="max-content" minW="100%">
										{TABS.map((t) => (
											<Tab key={t.key} {...tabProps}>{t.label}</Tab>
										))}
									</TabList>
								</Box>

								<TabPanels>
									{/* Overview Tab */}
									<TabPanel px={0}>
										<SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4} mb={6}>
											<MetricsCard dark title="Net revenue" value={formatCurrency(o.revenue.netRevenue)} icon={FiDollarSign} subtitle={`${formatCurrency(o.revenue.gross ?? o.revenue.netRevenue + o.revenue.totalDiscounts)} gross − ${formatCurrency(o.revenue.totalDiscounts)} discounts`} />
											<MetricsCard dark title="Confirmed bookings" value={formatNumber(o.bookings.confirmed)} icon={FiShoppingCart} subtitle={`of ${formatNumber(o.bookings.total)} booking attempts`} />
											<MetricsCard dark title="Tickets sold" value={formatNumber(o.tickets.totalSold)} icon={FiUsers} subtitle={`${formatNumber(o.checkIns.totalCheckedIn)} checked in (${o.checkIns.checkInRate.toFixed(1)}%)`} />
											<MetricsCard dark title="Unique visitors" value={formatNumber(o.visitors.uniqueVisitors)} icon={FiEye} subtitle={`${formatNumber(o.visitors.totalSessions)} sessions · ${formatNumber(o.pageViews.total)} page views`} />
										</SimpleGrid>

										<SimpleGrid columns={{ base: 1, xl: 2 }} spacing={6}>
											<AnalyticsPanel title="Revenue & tickets" subtitle={`Confirmed bookings made in ${periodLabel}`} mb={0}>
												<StatTable
													rows={[
														{ label: "Gross ticket value", value: formatCurrency(o.revenue.gross ?? o.revenue.netRevenue + o.revenue.totalDiscounts), help: "Tickets at list price, before any discount." },
														{ label: "Discounts", value: `−${formatCurrency(o.revenue.totalDiscounts)}`, help: "Taken off by referral / promo codes.", tone: o.revenue.totalDiscounts > 0 ? "bad" : undefined },
														{ label: "Net revenue", value: formatCurrency(o.revenue.netRevenue), help: "What guests actually paid for tickets. Membership fees are not included.", tone: "good" },
														{ label: "Avg per booking", value: formatCurrency(o.revenue.averagePerBooking), help: "Net revenue ÷ confirmed bookings." },
														{ label: "Avg per event", value: formatCurrency(o.revenue.averagePerEvent), help: `Net revenue ÷ ${formatNumber(o.bookings.eventsWithBookings ?? 0)} events that had at least one confirmed booking.` },
														{ label: "Tickets sold", value: formatNumber(o.tickets.totalSold), help: "Tickets on confirmed bookings, free tickets included." },
														{ label: "Tickets per booking", value: o.tickets.averagePerBooking.toFixed(1), help: "Average group size per confirmed booking." },
														{ label: "Checked in", value: formatNumber(o.checkIns.totalCheckedIn), help: "Guests scanned / checked in at the door on those bookings." },
														{ label: "Check-in rate", value: `${o.checkIns.checkInRate.toFixed(1)}%`, help: "Checked in ÷ tickets sold. Upcoming events naturally pull this down." },
													]}
												/>
											</AnalyticsPanel>

											<AnalyticsPanel title="Bookings by status" subtitle={`All booking attempts created in ${periodLabel}`} mb={0}>
												<StatTable
													showShare
													rows={[
														{ label: "Confirmed", value: formatNumber(o.bookings.confirmed), share: share(o.bookings.confirmed, o.bookings.total), help: "Booked and paid (or free). These count toward revenue and tickets.", tone: "good" },
														{ label: "Pending", value: formatNumber(o.bookings.pending), share: share(o.bookings.pending, o.bookings.total), help: "Awaiting host approval or payment.", tone: o.bookings.pending > 0 ? "warn" : undefined },
														{ label: "Cancelled", value: formatNumber(o.bookings.cancelled), share: share(o.bookings.cancelled, o.bookings.total), help: "Cancelled by the guest, host or an admin." },
														{ label: "Refunded", value: formatNumber(o.bookings.refunded), share: share(o.bookings.refunded, o.bookings.total), help: "Payment returned to the guest." },
														{ label: "Failed", value: formatNumber(o.bookings.failed), share: share(o.bookings.failed, o.bookings.total), help: "Checkout started but payment did not go through.", tone: o.bookings.failed > 0 ? "bad" : undefined },
														...(otherBookings > 0 ? [{ label: "Other", value: formatNumber(otherBookings), share: share(otherBookings, o.bookings.total), help: "Approved-but-unpaid or rejected requests." }] : []),
														{ label: "Total", value: formatNumber(o.bookings.total), share: o.bookings.total > 0 ? 100 : null, help: "Every booking record, whatever its outcome." },
													]}
												/>
											</AnalyticsPanel>

											<AnalyticsPanel title="Visitors & engagement" subtitle={`Website sessions started in ${periodLabel}`} mb={0}>
												<StatTable
													rows={[
														{ label: "Unique visitors", value: formatNumber(o.visitors.uniqueVisitors), help: "Distinct people — the logged-in account, else the browser." },
														{ label: "Logged-in visitors", value: formatNumber(o.visitors.uniqueLoggedInUsers), help: "Distinct Jetzy accounts that visited." },
														{ label: "Sessions", value: formatNumber(o.visitors.totalSessions), help: "Separate visits. One person can have many." },
														{ label: "Logged-in / anonymous sessions", value: `${formatNumber(o.visitors.loggedInSessions)} / ${formatNumber(o.visitors.anonymousSessions)}`, help: "Whether the visitor was signed in when the visit started." },
														{ label: "Page views", value: formatNumber(o.pageViews.total), help: "Every page opened across all sessions." },
														{ label: "Pages per session", value: o.visitors.totalSessions > 0 ? (o.pageViews.total / o.visitors.totalSessions).toFixed(1) : "0", help: "Page views ÷ sessions." },
														{ label: "Avg session duration", value: formatDuration(o.sessions.averageDuration), help: `Average over ${formatNumber(o.sessions.measuredForDuration ?? 0)} sessions with a recorded end. Tabs left open longer than 4 hours are excluded.` },
														...(o.bounceRate !== undefined ? [{ label: "Bounce rate", value: `${o.bounceRate.toFixed(1)}%`, help: "Sessions that viewed only one page.", tone: (o.bounceRate > 70 ? "bad" : o.bounceRate > 50 ? "warn" : "good") as "bad" | "warn" | "good" }] : []),
													]}
												/>
											</AnalyticsPanel>

											<AnalyticsPanel title="Events" subtitle="Current catalogue (not affected by the date range)" mb={0}>
												<StatTable
													showShare
													rows={[
														{ label: "Total events", value: formatNumber(o.events.total), share: o.events.total > 0 ? 100 : null, help: "All events that have not been deleted, drafts included." },
														{ label: "Public", value: formatNumber(o.events.public), share: share(o.events.public, o.events.total), help: "Listed and discoverable." },
														{ label: "Private", value: formatNumber(o.events.private), share: share(o.events.private, o.events.total), help: "Reachable by direct link only." },
														{ label: "Paid", value: formatNumber(o.events.paid), share: share(o.events.paid, o.events.total), help: "Sell at least one priced ticket." },
														{ label: "Free", value: formatNumber(o.events.free), share: share(o.events.free, o.events.total), help: "All tickets free." },
														{ label: "Upcoming", value: formatNumber(o.events.upcoming), share: share(o.events.upcoming, o.events.total), help: "Start date is in the future." },
														{ label: "Past", value: formatNumber(o.events.past), share: share(o.events.past, o.events.total), help: "Already ended." },
														{ label: "Live now / no date", value: formatNumber(liveOrUndatedEvents), share: share(liveOrUndatedEvents, o.events.total), help: "In progress right now, or no date set." },
													]}
												/>
												<Button mt={4} size="sm" variant="link" color="#F79432" onClick={() => handleTabChange(1)}>
													See performance per event →
												</Button>
											</AnalyticsPanel>

											<AnalyticsPanel title="Users & referrals" subtitle={isAllTime ? "Active = seen in the last 30 days" : "Active = seen during the selected period"} mb={0}>
												<StatTable
													showShare
													rows={[
														{ label: "Total users", value: formatNumber(o.users.total), share: o.users.total > 0 ? 100 : null, help: "Every registered account." },
														{ label: "Active users", value: formatNumber(o.users.active), share: share(o.users.active, o.users.total), help: "Accounts with activity in the window above.", tone: "good" },
														{ label: "Inactive users", value: formatNumber(o.users.inactive), share: share(o.users.inactive, o.users.total), help: "No activity in that window." },
														{ label: "Admins (active)", value: `${formatNumber(o.users.admins)} (${formatNumber(o.users.activeAdmins)})`, share: share(o.users.admins, o.users.total), help: "Accounts with admin access." },
														{ label: "Regular users (active)", value: `${formatNumber(o.users.regular)} (${formatNumber(o.users.activeRegular)})`, share: share(o.users.regular, o.users.total), help: "Guests and hosts." },
														{ label: "Referral codes (active)", value: `${formatNumber(o.referralCodes.total)} (${formatNumber(o.referralCodes.active)})`, share: null, help: "Discount / referral codes created, and how many are switched on." },
														{ label: "Referral code uses", value: formatNumber(o.referralCodes.totalUsage), share: null, help: "Times any code was applied to a booking (lifetime)." },
													]}
												/>
											</AnalyticsPanel>
										</SimpleGrid>
									</TabPanel>

									{/* Events Tab */}
									<TabPanel px={0}>
										<EventPerformanceTab dateFrom={dateFrom} dateTo={dateTo} />
									</TabPanel>

									{/* Visitors & Sessions Tab */}
									<TabPanel px={0}>
										<SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4} mb={6}>
											<MetricsCard dark title="Unique visitors" value={formatNumber(o.visitors.uniqueVisitors)} icon={FiUsers} subtitle={`${formatNumber(o.visitors.uniqueLoggedInUsers)} logged in`} />
											<MetricsCard dark title="Sessions" value={formatNumber(o.visitors.totalSessions)} icon={FiEye} subtitle={`${formatNumber(o.visitors.loggedInSessions)} logged in · ${formatNumber(o.visitors.anonymousSessions)} anonymous`} />
											<MetricsCard dark title="Page views" value={formatNumber(o.pageViews.total)} icon={FiEye} subtitle={`${o.visitors.totalSessions > 0 ? (o.pageViews.total / o.visitors.totalSessions).toFixed(1) : 0} per session`} />
											<MetricsCard dark title="Avg session" value={formatDuration(o.sessions.averageDuration)} icon={FiUsers} subtitle={o.bounceRate !== undefined ? `${o.bounceRate.toFixed(1)}% bounce rate` : undefined} />
										</SimpleGrid>

										{visitorData && visitorData.byDate.length > 0 && (
											<AnalyticsPanel title="Visitor trends">
												<VisitorChart data={visitorData.byDate} />
											</AnalyticsPanel>
										)}

										<AnalyticsPanel title="Daily breakdown" subtitle="Newest first. Unique visitors are counted per day, so they don't add up to the period total.">
											{visitorDays.length > 0 ? (
												<>
													<TableContainer sx={darkTableSx}>
														<Table variant="simple" size="sm">
															<Thead>
																<Tr>
																	<Th>Date</Th>
																	<Th isNumeric>Unique visitors</Th>
																	<Th isNumeric>Sessions</Th>
																	<Th isNumeric>Logged in</Th>
																	<Th isNumeric>Anonymous</Th>
																	<Th isNumeric>Page views</Th>
																	<Th isNumeric>Pages / session</Th>
																</Tr>
															</Thead>
															<Tbody>
																{visitorPager.pageRows.map((d) => (
																	<Tr key={d.date}>
																		<Td whiteSpace="nowrap">{formatDay(d.date)}</Td>
																		<Td isNumeric fontWeight="semibold">{formatNumber(d.uniqueVisitors)}</Td>
																		<Td isNumeric>{formatNumber(d.totalSessions)}</Td>
																		<Td isNumeric>{formatNumber(d.loggedInSessions)}</Td>
																		<Td isNumeric>{formatNumber(d.anonymousSessions)}</Td>
																		<Td isNumeric>{formatNumber(d.totalPageViews)}</Td>
																		<Td isNumeric>{d.totalSessions > 0 ? (d.totalPageViews / d.totalSessions).toFixed(1) : "—"}</Td>
																	</Tr>
																))}
															</Tbody>
														</Table>
													</TableContainer>
													<TablePagination page={visitorPager.page} pageSize={visitorPager.pageSize} total={visitorDays.length} onPageChange={visitorPager.setPage} onPageSizeChange={visitorPager.setPageSize} noun="days" />
												</>
											) : (
												<Text color="#9C9C9C" fontSize="sm">No sessions in this period.</Text>
											)}
										</AnalyticsPanel>
									</TabPanel>

									{/* Bookings & Revenue Tab */}
									<TabPanel px={0}>
										<SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4} mb={6}>
											<MetricsCard dark title="Net revenue" value={formatCurrency(o.revenue.netRevenue)} icon={FiDollarSign} subtitle={`after ${formatCurrency(o.revenue.totalDiscounts)} discounts`} />
											<MetricsCard dark title="Confirmed bookings" value={formatNumber(o.bookings.confirmed)} icon={FiShoppingCart} subtitle={`${share(o.bookings.confirmed, o.bookings.total)?.toFixed(1) ?? 0}% of ${formatNumber(o.bookings.total)} attempts`} />
											<MetricsCard dark title="Avg per booking" value={formatCurrency(o.revenue.averagePerBooking)} icon={FiDollarSign} subtitle={`${o.tickets.averagePerBooking.toFixed(1)} tickets per booking`} />
											<MetricsCard dark title="Tickets sold" value={formatNumber(o.tickets.totalSold)} icon={FiUsers} subtitle={`${o.checkIns.checkInRate.toFixed(1)}% checked in`} />
										</SimpleGrid>

										{bookingData && bookingData.byDate.length > 0 && (
											<AnalyticsPanel title="Booking & revenue trends">
												<BookingTrendsChart data={bookingData.byDate} />
											</AnalyticsPanel>
										)}

										<AnalyticsPanel title="Daily breakdown" subtitle="Newest first. Revenue and tickets count confirmed bookings only.">
											{bookingDays.length > 0 ? (
												<>
													<TableContainer sx={darkTableSx}>
														<Table variant="simple" size="sm">
															<Thead>
																<Tr>
																	<Th>Date</Th>
																	<Th isNumeric>All bookings</Th>
																	<Th isNumeric>Confirmed</Th>
																	<Th isNumeric>Pending</Th>
																	<Th isNumeric>Cancelled</Th>
																	<Th isNumeric>Failed</Th>
																	<Th isNumeric>Tickets sold</Th>
																	<Th isNumeric>Net revenue</Th>
																</Tr>
															</Thead>
															<Tbody>
																{bookingPager.pageRows.map((d) => (
																	<Tr key={d.date}>
																		<Td whiteSpace="nowrap">{formatDay(d.date)}</Td>
																		<Td isNumeric>{formatNumber(d.totalBookings)}</Td>
																		<Td isNumeric fontWeight="semibold">{formatNumber(d.byStatus?.confirmed || 0)}</Td>
																		<Td isNumeric>{formatNumber(d.byStatus?.pending || 0)}</Td>
																		<Td isNumeric>{formatNumber(d.byStatus?.cancelled || 0)}</Td>
																		<Td isNumeric>{formatNumber(d.byStatus?.failed || 0)}</Td>
																		<Td isNumeric>{formatNumber(d.totalTickets)}</Td>
																		<Td isNumeric color={d.totalRevenue > 0 ? "#4ade80 !important" : undefined}>{formatCurrency(d.totalRevenue)}</Td>
																	</Tr>
																))}
															</Tbody>
														</Table>
													</TableContainer>
													<TablePagination page={bookingPager.page} pageSize={bookingPager.pageSize} total={bookingDays.length} onPageChange={bookingPager.setPage} onPageSizeChange={bookingPager.setPageSize} noun="days" />
												</>
											) : (
												<Text color="#9C9C9C" fontSize="sm">No bookings in this period.</Text>
											)}
										</AnalyticsPanel>
									</TabPanel>

									{/* Users Tab */}
									<TabPanel px={0}>
										<AnalyticsPanel
											title="Most active users"
											subtitle="Logged-in accounts ranked by what they did in the period."
											actions={
												<HStack spacing={2}>
													<Text fontSize="xs" color="#9C9C9C">Sort by</Text>
													<Select {...selectProps} w="170px" value={usersSortBy} onChange={(e) => setUsersSortBy(e.target.value)} aria-label="Sort users by">
														<option value="activity">Activity score</option>
														<option value="sessions">Sessions</option>
														<option value="pageViews">Page views</option>
														<option value="recentActivity">Most recent</option>
													</Select>
												</HStack>
											}
										>
											{usersTable.data && usersTable.data.users.length > 0 ? (
												<Box position="relative">
													{usersTable.isLoading && (
														<Center position="absolute" inset={0} bg="rgba(26,26,26,0.6)" zIndex={2}><Spinner color="#F79432" /></Center>
													)}
													<TableContainer sx={darkTableSx}>
														<Table variant="simple" size="sm">
															<Thead>
																<Tr>
																	<Th isNumeric w="40px">#</Th>
																	<Th>User</Th>
																	<Th isNumeric>Sessions</Th>
																	<Th isNumeric>Avg session</Th>
																	<Th isNumeric>Page views</Th>
																	<Th isNumeric>Actions</Th>
																	<Th isNumeric>Event interactions<InfoTip label="Event page views, ticket picks and checkouts started." /></Th>
																	<Th isNumeric>Activity score<InfoTip label="Weighted mix of sessions, page views, actions and event interactions." /></Th>
																	<Th>Last activity</Th>
																</Tr>
															</Thead>
															<Tbody>
																{usersTable.data.users.map((user, idx) => (
																	<Tr key={user.userId}>
																		<Td isNumeric color="#6b6b6b !important">{(usersTable.page - 1) * usersTable.pageSize + idx + 1}</Td>
																		<Td>
																			<HStack spacing={2}>
																				<Box minW={0}>
																					<Text fontWeight="semibold">{`${user.firstName || ""} ${user.lastName || ""}`.trim() || "—"}</Text>
																					<Text fontSize="xs" color="#9C9C9C">{user.email}</Text>
																				</Box>
																				{user.role !== "user" && <Badge colorScheme="purple" variant="subtle" fontSize="10px">{user.role}</Badge>}
																			</HStack>
																		</Td>
																		<Td isNumeric>{formatNumber(user.stats.sessions)}</Td>
																		<Td isNumeric>{formatDuration(user.stats.avgSessionDuration)}</Td>
																		<Td isNumeric>{formatNumber(user.stats.pageViews)}</Td>
																		<Td isNumeric>{formatNumber(user.stats.actions)}</Td>
																		<Td isNumeric>{formatNumber(user.stats.eventInteractions)}</Td>
																		<Td isNumeric><Badge colorScheme="green" variant="subtle">{formatNumber(user.stats.activityScore)}</Badge></Td>
																		<Td whiteSpace="nowrap" color="#9C9C9C !important">{user.lastActivity ? new Date(user.lastActivity).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</Td>
																	</Tr>
																))}
															</Tbody>
														</Table>
													</TableContainer>
													<TablePagination page={usersTable.page} pageSize={usersTable.pageSize} total={usersTable.data.pagination?.total || 0} onPageChange={usersTable.setPage} onPageSizeChange={usersTable.setPageSize} isLoading={usersTable.isLoading} noun="users" />
												</Box>
											) : usersTable.isLoading ? (
												<Center py={10}><Spinner color="#F79432" /></Center>
											) : (
												<Text color="#9C9C9C" fontSize="sm">No logged-in activity in this period.</Text>
											)}
										</AnalyticsPanel>
									</TabPanel>

									{/* Traffic Sources Tab */}
									<TabPanel px={0}>
										{referrersTable.data && (
											<SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mb={6}>
												<MetricsCard dark title="Direct traffic" value={formatNumber(referrersTable.data.directTraffic.pageViews)} icon={FiEye} subtitle={`${referrersTable.data.directTraffic.percentage.toFixed(1)}% of page views — typed URL, bookmark or app`} />
												<MetricsCard dark title="Referred traffic" value={formatNumber(referrersTable.data.total - referrersTable.data.directTraffic.pageViews)} icon={FiUsers} subtitle={`${(100 - referrersTable.data.directTraffic.percentage).toFixed(1)}% of page views — arrived from another site`} />
											</SimpleGrid>
										)}

										<AnalyticsPanel title="Referring sites" subtitle="Where visitors came from before landing on Jetzy Events.">
											{referrersTable.data && referrersTable.data.referrers.length > 0 ? (
												<Box position="relative">
													{referrersTable.isLoading && (
														<Center position="absolute" inset={0} bg="rgba(26,26,26,0.6)" zIndex={2}><Spinner color="#F79432" /></Center>
													)}
													<TableContainer sx={darkTableSx}>
														<Table variant="simple" size="sm">
															<Thead>
																<Tr>
																	<Th>Referrer</Th>
																	<Th>Category</Th>
																	<Th isNumeric>Page views</Th>
																	<Th isNumeric>Sessions</Th>
																	<Th isNumeric>Users</Th>
																	<Th isNumeric>Share</Th>
																</Tr>
															</Thead>
															<Tbody>
																{referrersTable.data.referrers.map((ref, idx) => (
																	<Tr key={idx}>
																		<Td>
																			<Box>
																				<Text fontWeight="medium" isTruncated maxW="320px">{ref.domain}</Text>
																				<Text fontSize="xs" color="#9C9C9C" isTruncated maxW="320px" title={ref.referrer}>{ref.referrer}</Text>
																			</Box>
																		</Td>
																		<Td>
																			<Badge
																				variant="subtle"
																				colorScheme={ref.category === "search_engine" ? "blue" : ref.category === "social_media" ? "purple" : ref.category === "email" ? "orange" : "gray"}
																			>
																				{ref.category.replace(/_/g, " ")}
																			</Badge>
																		</Td>
																		<Td isNumeric fontWeight="semibold">{formatNumber(ref.pageViews)}</Td>
																		<Td isNumeric>{formatNumber(ref.uniqueSessions)}</Td>
																		<Td isNumeric>{formatNumber(ref.uniqueUsers)}</Td>
																		<Td isNumeric>{ref.percentage.toFixed(1)}%</Td>
																	</Tr>
																))}
															</Tbody>
														</Table>
													</TableContainer>
													<TablePagination page={referrersTable.page} pageSize={referrersTable.pageSize} total={referrersTable.data.pagination?.total || referrersTable.data.referrers.length} onPageChange={referrersTable.setPage} onPageSizeChange={referrersTable.setPageSize} isLoading={referrersTable.isLoading} noun="referrers" />
												</Box>
											) : referrersTable.isLoading ? (
												<Center py={10}><Spinner color="#F79432" /></Center>
											) : (
												<Text color="#9C9C9C" fontSize="sm">No referred traffic in this period.</Text>
											)}
										</AnalyticsPanel>

										<AnalyticsPanel title="UTM campaigns" subtitle="Visits from links tagged with utm_campaign / utm_source / utm_medium.">
											{utmData && utmData.grouped.length > 0 ? (
												<TableContainer sx={darkTableSx}>
													<Table variant="simple" size="sm">
														<Thead>
															<Tr>
																<Th>Campaign</Th>
																<Th>Source</Th>
																<Th>Medium</Th>
																<Th isNumeric>Page views</Th>
																<Th isNumeric>Sessions</Th>
																<Th isNumeric>Users</Th>
																<Th isNumeric>Share</Th>
															</Tr>
														</Thead>
														<Tbody>
															{utmData.grouped.map((utm, idx) => (
																<Tr key={idx}>
																	<Td fontWeight="medium">{utm.campaign || "—"}</Td>
																	<Td>{utm.source || "—"}</Td>
																	<Td>{utm.medium ? <Badge colorScheme="blue" variant="subtle">{utm.medium}</Badge> : "—"}</Td>
																	<Td isNumeric fontWeight="semibold">{formatNumber(utm.count)}</Td>
																	<Td isNumeric>{formatNumber(utm.uniqueSessionsCount)}</Td>
																	<Td isNumeric>{formatNumber(utm.uniqueUsersCount)}</Td>
																	<Td isNumeric>{utm.percentage.toFixed(1)}%</Td>
																</Tr>
															))}
														</Tbody>
													</Table>
												</TableContainer>
											) : (
												<Text color="#9C9C9C" fontSize="sm">No UTM-tagged visits in this period.</Text>
											)}
										</AnalyticsPanel>
									</TabPanel>

									{/* Devices & Pages Tab */}
									<TabPanel px={0}>
										{deviceData && (
											<SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6} mb={6}>
												<AnalyticsPanel title="Devices" mb={0}>
													{deviceData.devices.length > 0 ? (
														<TableContainer sx={darkTableSx}>
															<Table variant="simple" size="sm">
																<Thead>
																	<Tr>
																		<Th>Device</Th>
																		<Th isNumeric>Page views</Th>
																		<Th isNumeric>Sessions</Th>
																		<Th isNumeric>Users</Th>
																		<Th isNumeric>Share</Th>
																	</Tr>
																</Thead>
																<Tbody>
																	{deviceData.devices.map((device, idx) => (
																		<Tr key={idx}>
																			<Td textTransform="capitalize" fontWeight="medium">{device.deviceType}</Td>
																			<Td isNumeric fontWeight="semibold">{formatNumber(device.count)}</Td>
																			<Td isNumeric>{formatNumber(device.uniqueSessionsCount)}</Td>
																			<Td isNumeric>{formatNumber(device.uniqueUsersCount)}</Td>
																			<Td isNumeric>{device.percentage.toFixed(1)}%</Td>
																		</Tr>
																	))}
																</Tbody>
															</Table>
														</TableContainer>
													) : (
														<Text color="#9C9C9C" fontSize="sm">No data.</Text>
													)}
												</AnalyticsPanel>
												<AnalyticsPanel title="Browsers" mb={0}>
													{deviceData.browsers.length > 0 ? (
														<TableContainer sx={darkTableSx}>
															<Table variant="simple" size="sm">
																<Thead>
																	<Tr>
																		<Th>Browser</Th>
																		<Th isNumeric>Page views</Th>
																		<Th isNumeric>Sessions</Th>
																		<Th isNumeric>Users</Th>
																		<Th isNumeric>Share</Th>
																	</Tr>
																</Thead>
																<Tbody>
																	{deviceData.browsers.map((browser, idx) => (
																		<Tr key={idx}>
																			<Td fontWeight="medium">{browser.browserType}</Td>
																			<Td isNumeric fontWeight="semibold">{formatNumber(browser.count)}</Td>
																			<Td isNumeric>{formatNumber(browser.uniqueSessionsCount)}</Td>
																			<Td isNumeric>{formatNumber(browser.uniqueUsersCount)}</Td>
																			<Td isNumeric>{browser.percentage.toFixed(1)}%</Td>
																		</Tr>
																	))}
																</Tbody>
															</Table>
														</TableContainer>
													) : (
														<Text color="#9C9C9C" fontSize="sm">No data.</Text>
													)}
												</AnalyticsPanel>
											</SimpleGrid>
										)}

										<AnalyticsPanel title="Most viewed pages" subtitle="Every page, ranked by views.">
											{pagesTable.data && pagesTable.data.mostViewedPages.length > 0 ? (
												<Box position="relative">
													{pagesTable.isLoading && (
														<Center position="absolute" inset={0} bg="rgba(26,26,26,0.6)" zIndex={2}><Spinner color="#F79432" /></Center>
													)}
													<TableContainer sx={darkTableSx}>
														<Table variant="simple" size="sm">
															<Thead>
																<Tr>
																	<Th>Page</Th>
																	<Th isNumeric>Page views</Th>
																	<Th isNumeric>Sessions</Th>
																	<Th isNumeric>Users</Th>
																	<Th isNumeric>Avg time on page</Th>
																	<Th isNumeric>Share</Th>
																</Tr>
															</Thead>
															<Tbody>
																{pagesTable.data.mostViewedPages.map((page, idx) => (
																	<Tr key={idx}>
																		<Td><PageCell path={page.page} /></Td>
																		<Td isNumeric fontWeight="semibold">{formatNumber(page.count)}</Td>
																		<Td isNumeric>{formatNumber(page.uniqueSessionsCount)}</Td>
																		<Td isNumeric>{formatNumber(page.uniqueUsersCount)}</Td>
																		<Td isNumeric>{page.avgTimeSpent ? formatDuration(page.avgTimeSpent) : "—"}</Td>
																		<Td isNumeric>{page.percentage.toFixed(1)}%</Td>
																	</Tr>
																))}
															</Tbody>
														</Table>
													</TableContainer>
													<TablePagination page={pagesTable.page} pageSize={pagesTable.pageSize} total={pagesTable.data.pagination?.mostViewedPages?.total || 0} onPageChange={pagesTable.setPage} onPageSizeChange={pagesTable.setPageSize} isLoading={pagesTable.isLoading} noun="pages" />
												</Box>
											) : pagesTable.isLoading ? (
												<Center py={10}><Spinner color="#F79432" /></Center>
											) : (
												<Text color="#9C9C9C" fontSize="sm">No page views in this period.</Text>
											)}
										</AnalyticsPanel>

										{entryExitData && (
											<SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
												<AnalyticsPanel title="Top entry pages" subtitle="Where sessions started (top 10)." mb={0}>
													{entryExitData.entryPages.length > 0 ? (
														<TableContainer sx={darkTableSx}>
															<Table variant="simple" size="sm">
																<Thead>
																	<Tr>
																		<Th>Page</Th>
																		<Th isNumeric>Sessions</Th>
																		<Th isNumeric>Share</Th>
																	</Tr>
																</Thead>
																<Tbody>
																	{entryExitData.entryPages.map((page, idx) => (
																		<Tr key={idx}>
																			<Td><PageCell path={page.page} /></Td>
																			<Td isNumeric fontWeight="semibold">{formatNumber(page.count)}</Td>
																			<Td isNumeric>{page.percentage.toFixed(1)}%</Td>
																		</Tr>
																	))}
																</Tbody>
															</Table>
														</TableContainer>
													) : (
														<Text color="#9C9C9C" fontSize="sm">No data.</Text>
													)}
												</AnalyticsPanel>
												<AnalyticsPanel title="Top exit pages" subtitle="Last page before leaving (top 10)." mb={0}>
													{entryExitData.exitPages.length > 0 ? (
														<TableContainer sx={darkTableSx}>
															<Table variant="simple" size="sm">
																<Thead>
																	<Tr>
																		<Th>Page</Th>
																		<Th isNumeric>Sessions</Th>
																		<Th isNumeric>Share</Th>
																	</Tr>
																</Thead>
																<Tbody>
																	{entryExitData.exitPages.map((page, idx) => (
																		<Tr key={idx}>
																			<Td><PageCell path={page.page} /></Td>
																			<Td isNumeric fontWeight="semibold">{formatNumber(page.count)}</Td>
																			<Td isNumeric>{page.percentage.toFixed(1)}%</Td>
																		</Tr>
																	))}
																</Tbody>
															</Table>
														</TableContainer>
													) : (
														<Text color="#9C9C9C" fontSize="sm">No data.</Text>
													)}
												</AnalyticsPanel>
											</SimpleGrid>
										)}
									</TabPanel>

									{/* Named Events Tab */}
									<TabPanel px={0}>
										{namedEventsData?.summary && (
											<SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={6}>
												<MetricsCard dark title="Event interactions" value={formatNumber(namedEventsData.summary.eventInteractionsCount)} subtitle="distinct types" />
												<MetricsCard dark title="CTA clicks" value={formatNumber(namedEventsData.summary.ctaClicksCount)} subtitle="labeled elements" />
												<MetricsCard dark title="Form events" value={formatNumber(namedEventsData.summary.formEventsCount)} subtitle="form/action pairs" />
												<MetricsCard dark title="Page views" value={formatNumber(namedEventsData.summary.pageViewsCount)} subtitle="distinct pages" />
											</SimpleGrid>
										)}
										<AnalyticsPanel
											title="Named events"
											subtitle="Every tracked interaction, grouped by name."
											actions={
												<HStack spacing={2} flexWrap="wrap">
													{["all", "Event Interactions", "CTA Clicks", "Form Events", "Page Views"].map((cat) => (
														<Button
															key={cat}
															size="xs"
															onClick={() => setNamedEventsCategory(cat)}
															bg={namedEventsCategory === cat ? "#F79432" : "#2a2a2a"}
															color={namedEventsCategory === cat ? "black" : "#9C9C9C"}
															_hover={{ bg: namedEventsCategory === cat ? "#E68422" : "#333" }}
															borderRadius="full"
															px={3}
														>
															{cat === "all" ? "All" : cat}
														</Button>
													))}
													{filteredNamedRows.length > 0 && (
														<Button size="xs" leftIcon={<FiDownload />} onClick={exportNamedEventsCSV} bg="#2a2a2a" color="white" _hover={{ bg: "#333" }} borderRadius="full" px={3}>
															Export CSV
														</Button>
													)}
												</HStack>
											}
										>
											{filteredNamedRows.length > 0 ? (
												<>
													<TableContainer sx={darkTableSx}>
														<Table variant="simple" size="sm">
															<Thead>
																<Tr>
																	<Th>Category</Th>
																	<Th>Event name</Th>
																	<Th isNumeric>Total events</Th>
																	<Th isNumeric>Unique users</Th>
																</Tr>
															</Thead>
															<Tbody>
																{namedPager.pageRows.map((row, idx) => (
																	<Tr key={`${row.category}-${row.eventName}-${idx}`}>
																		<Td>
																			<Badge variant="subtle" colorScheme={row.category === "Event Interactions" ? "blue" : row.category === "CTA Clicks" ? "orange" : row.category === "Form Events" ? "green" : "purple"}>
																				{row.category}
																			</Badge>
																		</Td>
																		<Td>{row.category === "Page Views" ? <PageCell path={row.eventName} /> : row.eventName}</Td>
																		<Td isNumeric fontWeight="semibold">{formatNumber(row.totalEvents)}</Td>
																		<Td isNumeric>{formatNumber(row.uniqueUsers)}</Td>
																	</Tr>
																))}
															</Tbody>
														</Table>
													</TableContainer>
													<TablePagination page={namedPager.page} pageSize={namedPager.pageSize} total={filteredNamedRows.length} onPageChange={namedPager.setPage} onPageSizeChange={namedPager.setPageSize} noun="rows" />
												</>
											) : (
												<Text color="#9C9C9C" fontSize="sm">
													No data yet. Add <Text as="code" bg="#2a2a2a" px={1} borderRadius="sm">data-track=&quot;label&quot;</Text> attributes to CTAs to see named click events here.
												</Text>
											)}
										</AnalyticsPanel>
									</TabPanel>
								</TabPanels>
							</Tabs>
						</Box>
					) : (
						<Center py={20}>
							<Text color="#9C9C9C">No data available</Text>
						</Center>
					)}
				</Box>
			</ConsoleLayout>
		</>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	const sessionResult = await adminOnly(context)
	if (!sessionResult || "redirect" in sessionResult) return sessionResult

	return {
		props: {
			session: sessionResult.props.session,
		},
	}
}

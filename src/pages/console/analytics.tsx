import ConsoleLayout from "@Jetzy/components/layout/ConsoleLayout"
import { adminOnly } from "@Jetzy/lib/authSession"
import { Pages } from "@Jetzy/types"
import { GetServerSideProps } from "next"
import Head from "next/head"
import React, { useState, useEffect } from "react"
import { Box, Flex, Text, SimpleGrid, useToast, Spinner, Center, Tabs, TabList, TabPanels, Tab, TabPanel, Table, Thead, Tbody, Tr, Th, Td, TableContainer, Image, Badge, Link, Button, HStack, IconButton } from "@chakra-ui/react"
import NextLink from "next/link"
import { FiCalendar, FiUsers, FiDollarSign, FiShoppingCart, FiTrendingUp, FiEye, FiChevronLeft, FiChevronRight } from "react-icons/fi"
import MetricsCard from "@/components/analytics/MetricsCard"
import DateRangeSelector from "@/components/analytics/DateRangeSelector"
import VisitorChart from "@/components/analytics/VisitorChart"
import BookingTrendsChart from "@/components/analytics/BookingTrendsChart"
import SafeHTML from "@/components/misc/SafeHTML"

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
		byStatus: Record<string, number>
	}
	revenue: {
		total: number
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

interface TopEvent {
	eventId: string
	name: string
	slug: string
	image: string | null
	revenue: {
		total: number
		net: number
		discounts: number
	}
	bookings: number
	tickets: {
		sold: number
		checkedIn: number
		checkInRate: number
	}
	views: number
	uniqueViewers: number
}

interface PaginationData {
	page: number
	limit: number
	total: number
	totalPages: number
	hasNextPage: boolean
	hasPreviousPage: boolean
}

interface TopEvent {
	eventId: string
	name: string
	slug: string
	image: string | null
	revenue: {
		total: number
		net: number
		discounts: number
	}
	bookings: number
	tickets: {
		sold: number
		checkedIn: number
		checkInRate: number
	}
	views: number
	uniqueViewers: number
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

interface TopEventsData {
	events: TopEvent[]
	pagination: PaginationData
}

interface TopUsersData {
	users: TopUser[]
	pagination: PaginationData
}

export default function AnalyticsPage() {
	const [overviewData, setOverviewData] = useState<OverviewData | null>(null)
	const [visitorData, setVisitorData] = useState<VisitorData | null>(null)
	const [bookingData, setBookingData] = useState<BookingData | null>(null)
	const [topEventsData, setTopEventsData] = useState<TopEventsData | null>(null)
	const [topUsersData, setTopUsersData] = useState<TopUsersData | null>(null)
	const [referrerData, setReferrerData] = useState<ReferrerData | null>(null)
	const [utmData, setUtmData] = useState<UTMData | null>(null)
	const [deviceData, setDeviceData] = useState<DeviceData | null>(null)
	const [pageData, setPageData] = useState<PageData | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [dateFrom, setDateFrom] = useState<Date | null>(null)
	const [dateTo, setDateTo] = useState<Date | null>(null)

	// Pagination state
	const [topEventsPage, setTopEventsPage] = useState(1)
	const [topUsersPage, setTopUsersPage] = useState(1)
	const [referrersPage, setReferrersPage] = useState(1)
	const [pagesPage, setPagesPage] = useState(1)

	const toast = useToast()

	const fetchAnalytics = async (from: Date | null, to: Date | null, eventsPage = 1, usersPage = 1, referrersPageNum = 1, pagesPageNum = 1) => {
		setIsLoading(true)
		try {
			const params = new URLSearchParams()
			if (from) params.append("dateFrom", from.toISOString())
			if (to) params.append("dateTo", to.toISOString())

			// Fetch all analytics data in parallel
			const [overviewRes, visitorsRes, bookingsRes, topEventsRes, topUsersRes, referrersRes, utmRes, devicesRes, pagesRes] = await Promise.all([
				fetch(`/api/analytics/overview?${params.toString()}`, {
					method: "GET",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
				}),
				fetch(`/api/analytics/visitors?${params.toString()}&groupBy=day`, {
					method: "GET",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
				}),
				fetch(`/api/analytics/bookings?${params.toString()}&groupBy=day`, {
					method: "GET",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
				}),
				fetch(`/api/analytics/top-events?${params.toString()}&limit=10&page=${eventsPage}&sortBy=revenue`, {
					method: "GET",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
				}),
				fetch(`/api/analytics/top-users?${params.toString()}&limit=10&page=${usersPage}&sortBy=activity`, {
					method: "GET",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
				}),
				fetch(`/api/analytics/referrers?${params.toString()}&limit=20&page=${referrersPageNum}`, {
					method: "GET",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
				}),
				fetch(`/api/analytics/utm?${params.toString()}&groupBy=campaign`, {
					method: "GET",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
				}),
				fetch(`/api/analytics/devices?${params.toString()}`, {
					method: "GET",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
				}),
				fetch(`/api/analytics/pages?${params.toString()}&limit=20&page=${pagesPageNum}`, {
					method: "GET",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
				}),
			])

			// Process overview data
			if (overviewRes.ok) {
				const overviewResult = await overviewRes.json()
				if (overviewResult.status && overviewResult.data) {
					setOverviewData(overviewResult.data)
				}
			}

			// Process visitor data
			if (visitorsRes.ok) {
				const visitorsResult = await visitorsRes.json()
				if (visitorsResult.status && visitorsResult.data) {
					setVisitorData(visitorsResult.data)
				}
			}

			// Process booking data
			if (bookingsRes.ok) {
				const bookingsResult = await bookingsRes.json()
				if (bookingsResult.status && bookingsResult.data) {
					setBookingData(bookingsResult.data)
				}
			}

			// Process top events data
			if (topEventsRes.ok) {
				const topEventsResult = await topEventsRes.json()
				if (topEventsResult.status && topEventsResult.data?.events) {
					setTopEventsData({
						events: topEventsResult.data.events,
						pagination: topEventsResult.data.pagination,
					})
				}
			}

			// Process top users data
			if (topUsersRes.ok) {
				const topUsersResult = await topUsersRes.json()
				if (topUsersResult.status && topUsersResult.data?.users) {
					setTopUsersData({
						users: topUsersResult.data.users,
						pagination: topUsersResult.data.pagination,
					})
				}
			}

			// Process referrer data
			if (referrersRes.ok) {
				const referrersResult = await referrersRes.json()
				if (referrersResult.status && referrersResult.data) {
					setReferrerData(referrersResult.data)
				}
			}

			// Process UTM data
			if (utmRes.ok) {
				const utmResult = await utmRes.json()
				if (utmResult.status && utmResult.data) {
					setUtmData(utmResult.data)
				}
			}

			// Process device data
			if (devicesRes.ok) {
				const devicesResult = await devicesRes.json()
				if (devicesResult.status && devicesResult.data) {
					setDeviceData(devicesResult.data)
				}
			}

			// Process page data
			if (pagesRes.ok) {
				const pagesResult = await pagesRes.json()
				if (pagesResult.status && pagesResult.data) {
					setPageData(pagesResult.data)
				}
			}

			// Check if any critical request failed
			if (!overviewRes.ok || !visitorsRes.ok || !bookingsRes.ok || !topEventsRes.ok) {
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
		}
	}

	useEffect(() => {
		fetchAnalytics(dateFrom, dateTo, topEventsPage, topUsersPage, referrersPage, pagesPage)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [dateFrom, dateTo, topEventsPage, topUsersPage, referrersPage, pagesPage])

	const handleDateChange = (from: Date | null, to: Date | null) => {
		setDateFrom(from)
		setDateTo(to)
		// Reset pagination when date changes
		setTopEventsPage(1)
		setTopUsersPage(1)
		setReferrersPage(1)
		setPagesPage(1)
	}

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
		}).format(amount)
	}

	const formatNumber = (num: number) => {
		return new Intl.NumberFormat("en-US").format(num)
	}

	const formatDuration = (seconds: number) => {
		if (seconds < 60) return `${Math.round(seconds)}s`
		if (seconds < 3600) return `${Math.round(seconds / 60)}m`
		return `${Math.round(seconds / 3600)}h`
	}

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
					<Box bg="white" color="gray.800" p={4} borderRadius="lg" boxShadow="sm" mb={6}>
						<DateRangeSelector dateFrom={dateFrom} dateTo={dateTo} onDateChange={handleDateChange} />
					</Box>

					{/* Loading State */}
					{isLoading ? (
						<Center py={20}>
							<Spinner size="xl" color="#1877F2" />
						</Center>
					) : overviewData ? (
						<>
							<Tabs colorScheme="blue">
								<TabList>
									<Tab>Overview</Tab>
									<Tab>Visitors & Sessions</Tab>
									<Tab>Bookings & Revenue</Tab>
									<Tab>Users</Tab>
									<Tab>Traffic Sources</Tab>
									<Tab>Devices & Pages</Tab>
								</TabList>

								<TabPanels>
									{/* Overview Tab */}
									<TabPanel px={0}>
										<Box mb={6}>
											<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
												Overview
											</Text>
											<SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4}>
												<MetricsCard
													title="Total Events"
													value={formatNumber(overviewData.events.total)}
													icon={FiCalendar}
													subtitle={`${overviewData.events.public} public, ${overviewData.events.private} private`}
												/>
												<MetricsCard
													title="Total Bookings"
													value={formatNumber(overviewData.bookings.total)}
													icon={FiUsers}
													subtitle={`${overviewData.bookings.confirmed} confirmed`}
												/>
												<MetricsCard
													title="Total Revenue"
													value={formatCurrency(overviewData.revenue.total)}
													icon={FiDollarSign}
													subtitle={`Net: ${formatCurrency(overviewData.revenue.netRevenue)}`}
												/>
												<MetricsCard
													title="Tickets Sold"
													value={formatNumber(overviewData.tickets.totalSold)}
													icon={FiShoppingCart}
													subtitle={`Avg ${overviewData.tickets.averagePerBooking.toFixed(1)} per booking`}
												/>
											</SimpleGrid>
										</Box>

										{/* Visitor & Session Metrics */}
										<Box mb={6}>
											<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
												Visitors & Sessions
											</Text>
											<SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4}>
												<MetricsCard
													title="Total Sessions"
													value={formatNumber(overviewData.visitors.totalSessions)}
													icon={FiEye}
													subtitle={`${overviewData.visitors.loggedInSessions} logged in`}
												/>
												<MetricsCard
													title="Unique Visitors"
													value={formatNumber(overviewData.visitors.uniqueVisitors)}
													icon={FiUsers}
													subtitle={`${overviewData.visitors.uniqueLoggedInUsers} logged in`}
												/>
												<MetricsCard
													title="Avg Session Duration"
													value={formatDuration(overviewData.sessions.averageDuration)}
													icon={FiTrendingUp}
												/>
												<MetricsCard
													title="Total Page Views"
													value={formatNumber(overviewData.pageViews.total)}
													icon={FiEye}
												/>
												{overviewData.bounceRate !== undefined && (
													<MetricsCard
														title="Bounce Rate"
														value={`${overviewData.bounceRate.toFixed(1)}%`}
														icon={FiTrendingUp}
														bgColor={overviewData.bounceRate > 70 ? "#FFEBEE" : overviewData.bounceRate > 50 ? "#FFF3E0" : "#E8F5E9"}
														iconColor={overviewData.bounceRate > 70 ? "#F44336" : overviewData.bounceRate > 50 ? "#FF9800" : "#4CAF50"}
													/>
												)}
											</SimpleGrid>
										</Box>

										{/* Event Breakdown */}
										<Box mb={6}>
											<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
												Event Breakdown
											</Text>
											<SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4}>
												<MetricsCard
													title="Paid Events"
													value={formatNumber(overviewData.events.paid)}
													bgColor="#E8F5E9"
													iconColor="#4CAF50"
												/>
												<MetricsCard
													title="Free Events"
													value={formatNumber(overviewData.events.free)}
													bgColor="#E3F2FD"
													iconColor="#2196F3"
												/>
												<MetricsCard
													title="Upcoming Events"
													value={formatNumber(overviewData.events.upcoming)}
													bgColor="#FFF3E0"
													iconColor="#FF9800"
												/>
												<MetricsCard
													title="Past Events"
													value={formatNumber(overviewData.events.past)}
													bgColor="#F3E5F5"
													iconColor="#9C27B0"
												/>
											</SimpleGrid>
										</Box>

										{/* Booking Status Breakdown */}
										<Box mb={6}>
											<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
												Booking Status
											</Text>
											<SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4}>
												<MetricsCard
													title="Confirmed"
													value={formatNumber(overviewData.bookings.confirmed)}
													bgColor="#E8F5E9"
													iconColor="#4CAF50"
													subtitle={`${overviewData.bookings.total > 0 ? ((overviewData.bookings.confirmed / overviewData.bookings.total) * 100).toFixed(1) : 0}%`}
												/>
												<MetricsCard
													title="Pending"
													value={formatNumber(overviewData.bookings.pending)}
													bgColor="#FFF3E0"
													iconColor="#FF9800"
													subtitle={`${overviewData.bookings.total > 0 ? ((overviewData.bookings.pending / overviewData.bookings.total) * 100).toFixed(1) : 0}%`}
												/>
												<MetricsCard
													title="Cancelled"
													value={formatNumber(overviewData.bookings.cancelled)}
													bgColor="#FFEBEE"
													iconColor="#F44336"
													subtitle={`${overviewData.bookings.total > 0 ? ((overviewData.bookings.cancelled / overviewData.bookings.total) * 100).toFixed(1) : 0}%`}
												/>
												<MetricsCard
													title="Failed"
													value={formatNumber(overviewData.bookings.failed)}
													bgColor="#FCE4EC"
													iconColor="#E91E63"
													subtitle={`${overviewData.bookings.total > 0 ? ((overviewData.bookings.failed / overviewData.bookings.total) * 100).toFixed(1) : 0}%`}
												/>
											</SimpleGrid>
										</Box>

										{/* Revenue & Check-in Metrics */}
										<Box mb={6}>
											<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
												Revenue & Attendance
											</Text>
											<SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4}>
												<MetricsCard
													title="Net Revenue"
													value={formatCurrency(overviewData.revenue.netRevenue)}
													icon={FiDollarSign}
													bgColor="#E8F5E9"
													iconColor="#4CAF50"
													subtitle={`After ${formatCurrency(overviewData.revenue.totalDiscounts)} discounts`}
												/>
												<MetricsCard
													title="Avg per Event"
													value={formatCurrency(overviewData.revenue.averagePerEvent)}
													icon={FiTrendingUp}
												/>
												<MetricsCard
													title="Avg per Booking"
													value={formatCurrency(overviewData.revenue.averagePerBooking)}
													icon={FiShoppingCart}
												/>
												<MetricsCard
													title="Check-in Rate"
													value={`${overviewData.checkIns.checkInRate.toFixed(1)}%`}
													icon={FiUsers}
													bgColor="#E3F2FD"
													iconColor="#2196F3"
													subtitle={`${formatNumber(overviewData.checkIns.totalCheckedIn)} of ${formatNumber(overviewData.checkIns.totalTicketsPurchased)}`}
												/>
											</SimpleGrid>
										</Box>

										{/* Users & Referral Codes */}
										<Box mb={6}>
											<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
												Users & Referrals
											</Text>
											<SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4} mb={4}>
												<MetricsCard
													title="Total Users"
													value={formatNumber(overviewData.users.total)}
													icon={FiUsers}
													subtitle={`${overviewData.users.admins} admins, ${overviewData.users.regular} regular`}
												/>
												<MetricsCard
													title="Active Users"
													value={formatNumber(overviewData.users.active)}
													icon={FiUsers}
													bgColor="#E8F5E9"
													iconColor="#4CAF50"
													subtitle={`${overviewData.users.activeRate.toFixed(1)}% of total`}
												/>
												<MetricsCard
													title="Inactive Users"
													value={formatNumber(overviewData.users.inactive)}
													icon={FiUsers}
													bgColor="#FFEBEE"
													iconColor="#F44336"
													subtitle={`${overviewData.users.inactiveRate.toFixed(1)}% of total`}
												/>
												<MetricsCard
													title="Referral Codes"
													value={formatNumber(overviewData.referralCodes.total)}
													icon={FiShoppingCart}
													subtitle={`${overviewData.referralCodes.active} active`}
												/>
											</SimpleGrid>
											<SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4}>
												<MetricsCard
													title="Active Admins"
													value={formatNumber(overviewData.users.activeAdmins)}
													bgColor="#E3F2FD"
													iconColor="#2196F3"
													subtitle={`${overviewData.users.admins > 0 ? ((overviewData.users.activeAdmins / overviewData.users.admins) * 100).toFixed(1) : 0}% of admins`}
												/>
												<MetricsCard
													title="Active Regular Users"
													value={formatNumber(overviewData.users.activeRegular)}
													bgColor="#E8F5E9"
													iconColor="#4CAF50"
													subtitle={`${overviewData.users.regular > 0 ? ((overviewData.users.activeRegular / overviewData.users.regular) * 100).toFixed(1) : 0}% of regular users`}
												/>
												<MetricsCard
													title="Inactive Admins"
													value={formatNumber(overviewData.users.inactiveAdmins)}
													bgColor="#FFF3E0"
													iconColor="#FF9800"
													subtitle={`${overviewData.users.admins > 0 ? ((overviewData.users.inactiveAdmins / overviewData.users.admins) * 100).toFixed(1) : 0}% of admins`}
												/>
												<MetricsCard
													title="Code Usage"
													value={formatNumber(overviewData.referralCodes.totalUsage)}
													icon={FiTrendingUp}
													bgColor="#E8F5E9"
													iconColor="#4CAF50"
												/>
											</SimpleGrid>
										</Box>
									</TabPanel>

									{/* Visitors & Sessions Tab */}
									<TabPanel px={0}>
										{visitorData && visitorData.byDate.length > 0 && (
											<Box bg="white" color="gray.800" p={6} borderRadius="lg" boxShadow="sm" mb={6}>
												<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
													Visitor Trends
												</Text>
												<VisitorChart data={visitorData.byDate} />
											</Box>
										)}

										<SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4} mb={6}>
											<MetricsCard
												title="Total Sessions"
												value={formatNumber(overviewData.visitors.totalSessions)}
												icon={FiEye}
												subtitle={`${overviewData.visitors.loggedInSessions} logged in`}
											/>
											<MetricsCard
												title="Unique Visitors"
												value={formatNumber(overviewData.visitors.uniqueVisitors)}
												icon={FiUsers}
												subtitle={`${overviewData.visitors.uniqueLoggedInUsers} logged in`}
											/>
											<MetricsCard
												title="Avg Session Duration"
												value={formatDuration(overviewData.sessions.averageDuration)}
												icon={FiTrendingUp}
											/>
											<MetricsCard
												title="Total Page Views"
												value={formatNumber(overviewData.pageViews.total)}
												icon={FiEye}
											/>
										</SimpleGrid>
									</TabPanel>

									{/* Bookings & Revenue Tab */}
									<TabPanel px={0}>
										{bookingData && bookingData.byDate.length > 0 && (
											<Box bg="white" color="gray.800" p={6} borderRadius="lg" boxShadow="sm" mb={6}>
												<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
													Booking & Revenue Trends
												</Text>
												<BookingTrendsChart data={bookingData.byDate} />
											</Box>
										)}

										<SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4} mb={6}>
											<MetricsCard
												title="Total Revenue"
												value={formatCurrency(overviewData.revenue.total)}
												icon={FiDollarSign}
												subtitle={`Net: ${formatCurrency(overviewData.revenue.netRevenue)}`}
											/>
											<MetricsCard
												title="Total Bookings"
												value={formatNumber(overviewData.bookings.total)}
												icon={FiUsers}
												subtitle={`${overviewData.bookings.confirmed} confirmed`}
											/>
											<MetricsCard
												title="Avg Booking Value"
												value={formatCurrency(overviewData.revenue.averagePerBooking)}
												icon={FiTrendingUp}
											/>
											<MetricsCard
												title="Tickets Sold"
												value={formatNumber(overviewData.tickets.totalSold)}
												icon={FiShoppingCart}
												subtitle={`Avg ${overviewData.tickets.averagePerBooking.toFixed(1)} per booking`}
											/>
										</SimpleGrid>

										<Box mb={6}>
											<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
												Booking Status Breakdown
											</Text>
											<SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4}>
												<MetricsCard
													title="Confirmed"
													value={formatNumber(overviewData.bookings.confirmed)}
													bgColor="#E8F5E9"
													iconColor="#4CAF50"
													subtitle={`${overviewData.bookings.total > 0 ? ((overviewData.bookings.confirmed / overviewData.bookings.total) * 100).toFixed(1) : 0}%`}
												/>
												<MetricsCard
													title="Pending"
													value={formatNumber(overviewData.bookings.pending)}
													bgColor="#FFF3E0"
													iconColor="#FF9800"
													subtitle={`${overviewData.bookings.total > 0 ? ((overviewData.bookings.pending / overviewData.bookings.total) * 100).toFixed(1) : 0}%`}
												/>
												<MetricsCard
													title="Cancelled"
													value={formatNumber(overviewData.bookings.cancelled)}
													bgColor="#FFEBEE"
													iconColor="#F44336"
													subtitle={`${overviewData.bookings.total > 0 ? ((overviewData.bookings.cancelled / overviewData.bookings.total) * 100).toFixed(1) : 0}%`}
												/>
												<MetricsCard
													title="Failed"
													value={formatNumber(overviewData.bookings.failed)}
													bgColor="#FCE4EC"
													iconColor="#E91E63"
													subtitle={`${overviewData.bookings.total > 0 ? ((overviewData.bookings.failed / overviewData.bookings.total) * 100).toFixed(1) : 0}%`}
												/>
											</SimpleGrid>
										</Box>
									</TabPanel>

									{/* Users Tab */}
									<TabPanel px={0}>
										{topUsersData && topUsersData.users.length > 0 && (
											<Box bg="white" color="gray.800" p={6} borderRadius="lg" boxShadow="sm" mb={6}>
												<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
													Most Active Users
												</Text>
												<TableContainer>
													<Table variant="simple">
														<Thead>
															<Tr>
																<Th>User</Th>
																<Th isNumeric>Sessions</Th>
																<Th isNumeric>Page Views</Th>
																<Th isNumeric>Actions</Th>
																<Th isNumeric>Event Interactions</Th>
																<Th isNumeric>Activity Score</Th>
																<Th>Last Activity</Th>
															</Tr>
														</Thead>
														<Tbody>
															{topUsersData.users.map((user) => (
																<Tr key={user.userId}>
																	<Td>
																		<Box>
																			<Text fontWeight="semibold">
																				{user.firstName} {user.lastName}
																			</Text>
																			<Text fontSize="sm" color="gray.500">
																				{user.email}
																			</Text>
																			<Badge colorScheme={user.role === "admin" ? "purple" : "blue"} size="sm">
																				{user.role}
																			</Badge>
																		</Box>
																	</Td>
																	<Td isNumeric>
																		<Badge colorScheme="blue">{formatNumber(user.stats.sessions)}</Badge>
																	</Td>
																	<Td isNumeric>{formatNumber(user.stats.pageViews)}</Td>
																	<Td isNumeric>{formatNumber(user.stats.actions)}</Td>
																	<Td isNumeric>{formatNumber(user.stats.eventInteractions)}</Td>
																	<Td isNumeric>
																		<Badge colorScheme="green">{formatNumber(user.stats.activityScore)}</Badge>
																	</Td>
																	<Td>
																		<Text fontSize="sm">
																			{new Date(user.lastActivity).toLocaleDateString()}
																		</Text>
																	</Td>
																</Tr>
															))}
														</Tbody>
													</Table>
												</TableContainer>
											</Box>
										)}
									</TabPanel>

									{/* Traffic Sources Tab */}
									<TabPanel px={0}>
										{referrerData && (
											<Box bg="white" color="gray.800" p={6} borderRadius="lg" boxShadow="sm" mb={6}>
												<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
													Traffic Sources
												</Text>
												<SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mb={6}>
													<MetricsCard
														title="Direct Traffic"
														value={formatNumber(referrerData.directTraffic.pageViews)}
														icon={FiEye}
														subtitle={`${referrerData.directTraffic.percentage.toFixed(1)}% of total`}
													/>
													<MetricsCard
														title="Referral Traffic"
														value={formatNumber(referrerData.total - referrerData.directTraffic.pageViews)}
														icon={FiTrendingUp}
														subtitle={`${(100 - referrerData.directTraffic.percentage).toFixed(1)}% of total`}
													/>
												</SimpleGrid>
												{referrerData.referrers.length > 0 && (
													<>
														<TableContainer>
															<Table variant="simple">
																<Thead>
																	<Tr>
																		<Th>Referrer</Th>
																		<Th>Category</Th>
																		<Th isNumeric>Page Views</Th>
																		<Th isNumeric>Unique Sessions</Th>
																		<Th isNumeric>Unique Users</Th>
																		<Th isNumeric>Percentage</Th>
																	</Tr>
																</Thead>
																<Tbody>
																	{referrerData.referrers.map((ref, idx) => (
																		<Tr key={idx}>
																			<Td>
																				<Box>
																					<Text fontWeight="medium" isTruncated maxW="300px">
																						{ref.domain}
																					</Text>
																					<Text fontSize="xs" color="gray.500" isTruncated maxW="300px">
																						{ref.referrer}
																					</Text>
																				</Box>
																			</Td>
																			<Td>
																				<Badge
																					colorScheme={
																						ref.category === "search_engine"
																							? "blue"
																							: ref.category === "social_media"
																								? "purple"
																								: ref.category === "email"
																									? "orange"
																									: "gray"
																					}
																				>
																					{ref.category.replace("_", " ")}
																				</Badge>
																			</Td>
																			<Td isNumeric>{formatNumber(ref.pageViews)}</Td>
																			<Td isNumeric>{formatNumber(ref.uniqueSessions)}</Td>
																			<Td isNumeric>{formatNumber(ref.uniqueUsers)}</Td>
																			<Td isNumeric>{ref.percentage.toFixed(1)}%</Td>
																		</Tr>
																	))}
																</Tbody>
															</Table>
														</TableContainer>
														{/* Pagination */}
														{referrerData.pagination && referrerData.pagination.totalPages > 1 && (
															<Flex justify="space-between" align="center" mt={4}>
																<Text fontSize="sm" color="#65676B">
																	Page {referrerData.pagination.page} of {referrerData.pagination.totalPages} ({formatNumber(referrerData.pagination.total)} total)
																</Text>
																<HStack spacing={2}>
																	<IconButton
																		aria-label="Previous page"
																		icon={<FiChevronLeft />}
																		size="sm"
																		onClick={() => setReferrersPage((p) => Math.max(1, p - 1))}
																		isDisabled={!referrerData.pagination.hasPreviousPage}
																	/>
																	<IconButton
																		aria-label="Next page"
																		icon={<FiChevronRight />}
																		size="sm"
																		onClick={() => setReferrersPage((p) => p + 1)}
																		isDisabled={!referrerData.pagination.hasNextPage}
																	/>
																</HStack>
															</Flex>
														)}
													</>
												)}
											</Box>
										)}

										{utmData && utmData.grouped.length > 0 && (
											<Box bg="white" color="gray.800" p={6} borderRadius="lg" boxShadow="sm" mb={6}>
												<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
													UTM Campaign Performance
												</Text>
												<TableContainer>
													<Table variant="simple">
														<Thead>
															<Tr>
																<Th>Campaign</Th>
																<Th>Source</Th>
																<Th>Medium</Th>
																<Th isNumeric>Page Views</Th>
																<Th isNumeric>Unique Sessions</Th>
																<Th isNumeric>Unique Users</Th>
																<Th isNumeric>Percentage</Th>
															</Tr>
														</Thead>
														<Tbody>
															{utmData.grouped.map((utm, idx) => (
																<Tr key={idx}>
																	<Td>
																		<Text fontWeight="medium">{utm.campaign || "N/A"}</Text>
																	</Td>
																	<Td>
																		<Text fontSize="sm">{utm.source || "N/A"}</Text>
																	</Td>
																	<Td>
																		<Badge colorScheme="blue" size="sm">
																			{utm.medium || "N/A"}
																		</Badge>
																	</Td>
																	<Td isNumeric>{formatNumber(utm.count)}</Td>
																	<Td isNumeric>{formatNumber(utm.uniqueSessionsCount)}</Td>
																	<Td isNumeric>{formatNumber(utm.uniqueUsersCount)}</Td>
																	<Td isNumeric>{utm.percentage.toFixed(1)}%</Td>
																</Tr>
															))}
														</Tbody>
													</Table>
												</TableContainer>
											</Box>
										)}
									</TabPanel>

									{/* Devices & Pages Tab */}
									<TabPanel px={0}>
										{deviceData && (
											<>
												<Box bg="white" color="gray.800" p={6} borderRadius="lg" boxShadow="sm" mb={6}>
													<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
														Device Breakdown
													</Text>
													{deviceData.devices.length > 0 && (
														<TableContainer mb={6}>
															<Table variant="simple">
																<Thead>
																	<Tr>
																		<Th>Device Type</Th>
																		<Th isNumeric>Page Views</Th>
																		<Th isNumeric>Unique Sessions</Th>
																		<Th isNumeric>Unique Users</Th>
																		<Th isNumeric>Percentage</Th>
																	</Tr>
																</Thead>
																<Tbody>
																	{deviceData.devices.map((device, idx) => (
																		<Tr key={idx}>
																			<Td>
																				<Badge colorScheme="blue" textTransform="capitalize">
																					{device.deviceType}
																				</Badge>
																			</Td>
																			<Td isNumeric>{formatNumber(device.count)}</Td>
																			<Td isNumeric>{formatNumber(device.uniqueSessionsCount)}</Td>
																			<Td isNumeric>{formatNumber(device.uniqueUsersCount)}</Td>
																			<Td isNumeric>{device.percentage.toFixed(1)}%</Td>
																		</Tr>
																	))}
																</Tbody>
															</Table>
														</TableContainer>
													)}
													{deviceData.browsers.length > 0 && (
														<>
															<Text fontSize="lg" fontWeight="semibold" color="#1C1E21" mb={4}>
																Browser Breakdown
															</Text>
															<TableContainer>
																<Table variant="simple">
																	<Thead>
																		<Tr>
																			<Th>Browser</Th>
																			<Th isNumeric>Page Views</Th>
																			<Th isNumeric>Unique Sessions</Th>
																			<Th isNumeric>Unique Users</Th>
																			<Th isNumeric>Percentage</Th>
																		</Tr>
																	</Thead>
																	<Tbody>
																		{deviceData.browsers.map((browser, idx) => (
																			<Tr key={idx}>
																				<Td>
																					<Badge colorScheme="purple">{browser.browserType}</Badge>
																				</Td>
																				<Td isNumeric>{formatNumber(browser.count)}</Td>
																				<Td isNumeric>{formatNumber(browser.uniqueSessionsCount)}</Td>
																				<Td isNumeric>{formatNumber(browser.uniqueUsersCount)}</Td>
																				<Td isNumeric>{browser.percentage.toFixed(1)}%</Td>
																			</Tr>
																		))}
																	</Tbody>
																</Table>
															</TableContainer>
														</>
													)}
												</Box>
											</>
										)}

										{pageData && (
											<>
												{pageData.entryPages.length > 0 && (
													<Box bg="white" color="gray.800" p={6} borderRadius="lg" boxShadow="sm" mb={6}>
														<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
															Entry Pages
														</Text>
														<TableContainer>
															<Table variant="simple">
																<Thead>
																	<Tr>
																		<Th>Page</Th>
																		<Th isNumeric>Sessions</Th>
																		<Th isNumeric>Unique Users</Th>
																		<Th isNumeric>Percentage</Th>
																	</Tr>
																</Thead>
																<Tbody>
																	{pageData.entryPages.map((page, idx) => (
																		<Tr key={idx}>
																			<Td>
																				<Text fontWeight="medium" fontFamily="mono">
																					{page.page}
																				</Text>
																			</Td>
																			<Td isNumeric>{formatNumber(page.count)}</Td>
																			<Td isNumeric>{formatNumber(page.uniqueUsersCount)}</Td>
																			<Td isNumeric>{page.percentage.toFixed(1)}%</Td>
																		</Tr>
																	))}
																</Tbody>
															</Table>
														</TableContainer>
													</Box>
												)}

												{pageData.exitPages.length > 0 && (
													<Box bg="white" color="gray.800" p={6} borderRadius="lg" boxShadow="sm" mb={6}>
														<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
															Exit Pages
														</Text>
														<TableContainer>
															<Table variant="simple">
																<Thead>
																	<Tr>
																		<Th>Page</Th>
																		<Th isNumeric>Sessions</Th>
																		<Th isNumeric>Percentage</Th>
																	</Tr>
																</Thead>
																<Tbody>
																	{pageData.exitPages.map((page, idx) => (
																		<Tr key={idx}>
																			<Td>
																				<Text fontWeight="medium" fontFamily="mono">
																					{page.page}
																				</Text>
																			</Td>
																			<Td isNumeric>{formatNumber(page.count)}</Td>
																			<Td isNumeric>{page.percentage.toFixed(1)}%</Td>
																		</Tr>
																	))}
																</Tbody>
															</Table>
														</TableContainer>
													</Box>
												)}

												{pageData.mostViewedPages.length > 0 && (
													<Box bg="white" color="gray.800" p={6} borderRadius="lg" boxShadow="sm" mb={6}>
														<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
															Most Viewed Pages
														</Text>
														<TableContainer>
															<Table variant="simple">
																<Thead>
																	<Tr>
																		<Th>Page</Th>
																		<Th isNumeric>Page Views</Th>
																		<Th isNumeric>Unique Sessions</Th>
																		<Th isNumeric>Unique Users</Th>
																		<Th isNumeric>Avg Time</Th>
																		<Th isNumeric>Percentage</Th>
																	</Tr>
																</Thead>
																<Tbody>
																	{pageData.mostViewedPages.map((page, idx) => (
																		<Tr key={idx}>
																			<Td>
																				<Text fontWeight="medium" fontFamily="mono">
																					{page.page}
																				</Text>
																			</Td>
																			<Td isNumeric>{formatNumber(page.count)}</Td>
																			<Td isNumeric>{formatNumber(page.uniqueSessionsCount)}</Td>
																			<Td isNumeric>{formatNumber(page.uniqueUsersCount)}</Td>
																			<Td isNumeric>
																				{page.avgTimeSpent ? formatDuration(page.avgTimeSpent) : "N/A"}
																			</Td>
																			<Td isNumeric>{page.percentage.toFixed(1)}%</Td>
																		</Tr>
																	))}
																</Tbody>
															</Table>
														</TableContainer>
														{/* Pagination - for most viewed pages table */}
														{pageData.pagination.mostViewedPages && pageData.pagination.mostViewedPages.totalPages > 1 && (
															<Flex justify="space-between" align="center" mt={4}>
																<Text fontSize="sm" color="#65676B">
																	Page {pageData.pagination.mostViewedPages.page} of {pageData.pagination.mostViewedPages.totalPages} ({formatNumber(pageData.pagination.mostViewedPages.total)} total)
																</Text>
																<HStack spacing={2}>
																	<IconButton
																		aria-label="Previous page"
																		icon={<FiChevronLeft />}
																		size="sm"
																		onClick={() => setPagesPage((p) => Math.max(1, p - 1))}
																		isDisabled={!pageData.pagination.mostViewedPages.hasPreviousPage}
																	/>
																	<IconButton
																		aria-label="Next page"
																		icon={<FiChevronRight />}
																		size="sm"
																		onClick={() => setPagesPage((p) => p + 1)}
																		isDisabled={!pageData.pagination.mostViewedPages.hasNextPage}
																	/>
																</HStack>
															</Flex>
														)}
													</Box>
												)}
											</>
										)}
									</TabPanel>
								</TabPanels>
							</Tabs>

							{/* Top Performing Events Table */}
							{topEventsData && topEventsData.events.length > 0 && (
								<Box bg="white" color="gray.800" p={6} borderRadius="lg" boxShadow="sm" mt={6}>
									<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
										Top Performing Events (by Revenue)
									</Text>
									<TableContainer>
										<Table variant="simple">
											<Thead>
												<Tr>
													<Th>Event</Th>
													<Th isNumeric>Revenue</Th>
													<Th isNumeric>Bookings</Th>
													<Th isNumeric>Tickets Sold</Th>
													<Th isNumeric>Attendance</Th>
													<Th isNumeric>Views</Th>
													<Th isNumeric>Check-in Rate</Th>
												</Tr>
											</Thead>
											<Tbody>
												{topEventsData.events.map((event) => (
													<Tr key={event.eventId}>
														<Td>
															<Flex align="center" gap={3}>
																{event.image && (
																	<Image
																		src={event.image}
																		alt={event.name}
																		boxSize="50px"
																		objectFit="cover"
																		borderRadius="md"
																	/>
																)}
																<Box>
																	<Link as={NextLink} href={`/${event.slug}`} color="blue.500" fontWeight="medium" _hover={{ textDecoration: "underline" }}>
																		<SafeHTML html={event.name} />
																	</Link>
																</Box>
															</Flex>
														</Td>
														<Td isNumeric>
															<Text fontWeight="semibold" color="gray.800">{formatCurrency(event.revenue.net)}</Text>
															{event.revenue.discounts > 0 && (
																<Text fontSize="xs" color="gray.500">
																	After {formatCurrency(event.revenue.discounts)} discounts
																</Text>
															)}
														</Td>
														<Td isNumeric>
															<Badge colorScheme="blue">{formatNumber(event.bookings)}</Badge>
														</Td>
														<Td isNumeric>{formatNumber(event.tickets.sold)}</Td>
														<Td isNumeric>
															<Badge colorScheme="green">{formatNumber(event.tickets.checkedIn)}</Badge>
														</Td>
														<Td isNumeric>{formatNumber(event.views)}</Td>
														<Td isNumeric>
															<Badge colorScheme={event.tickets.checkInRate >= 80 ? "green" : event.tickets.checkInRate >= 50 ? "yellow" : "red"}>
																{event.tickets.checkInRate.toFixed(1)}%
															</Badge>
														</Td>
													</Tr>
												))}
											</Tbody>
										</Table>
									</TableContainer>
									{/* Pagination */}
									{topEventsData.pagination && topEventsData.pagination.totalPages > 1 && (
										<Flex justify="space-between" align="center" mt={4}>
											<Text fontSize="sm" color="#65676B">
												Page {topEventsData.pagination.page} of {topEventsData.pagination.totalPages} ({formatNumber(topEventsData.pagination.total)} total)
											</Text>
											<HStack spacing={2}>
												<IconButton
													aria-label="Previous page"
													icon={<FiChevronLeft />}
													size="sm"
													onClick={() => setTopEventsPage((p) => Math.max(1, p - 1))}
													isDisabled={!topEventsData.pagination.hasPreviousPage}
												/>
												<IconButton
													aria-label="Next page"
													icon={<FiChevronRight />}
													size="sm"
													onClick={() => setTopEventsPage((p) => p + 1)}
													isDisabled={!topEventsData.pagination.hasNextPage}
												/>
											</HStack>
										</Flex>
									)}
								</Box>
							)}
						</>
					) : (
						<Center py={20}>
							<Text color="#65676B">No data available</Text>
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


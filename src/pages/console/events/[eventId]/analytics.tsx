"use client"
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { adminOnly } from "@/lib/authSession"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Events } from "@/models/events"
import { GetServerSideProps } from "next"
import React, { useState, useEffect } from "react"
import Head from "next/head"
import { useRouter } from "next/router"
import {
	Box,
	Flex,
	Text,
	SimpleGrid,
	useToast,
	Spinner,
	Center,
	Table,
	Thead,
	Tbody,
	Tr,
	Th,
	Td,
	TableContainer,
	Image,
	Badge,
	Button,
	HStack,
	IconButton,
	Tabs,
	TabList,
	Tab,
	TabPanels,
	TabPanel,
} from "@chakra-ui/react"
import { FiCalendar, FiUsers, FiDollarSign, FiShoppingCart, FiTrendingUp, FiEye, FiShare2, FiArrowLeft, FiChevronLeft, FiChevronRight, FiImage, FiLogIn, FiUserPlus } from "react-icons/fi"
import MetricsCard from "@/components/analytics/MetricsCard"
import DateRangeSelector from "@/components/analytics/DateRangeSelector"
import ClickHeatmap from "@/components/analytics/ClickHeatmap"
import NextLink from "next/link"
import SafeHTML from "@/components/misc/SafeHTML"
import { stripHTMLAndDecode } from "@/lib/utils"

interface FunnelStage { stage: string; label: string; count: number; dropOffPct: number; conversionPct: number }
interface DwellRow { page: string; views: number; avgTimeSec: number; p50Sec: number; p90Sec: number; avgScrollDepthPct: number | null }
interface HeatTopTarget { text: string | null; dataTrack: string | null; count: number; rageCount: number }

interface EventAnalyticsData {
	event: {
		_id: string
		name: string
		slug: string
		image: string | null
		startsOn: string
		endsOn: string
		isPaid: boolean
		privacy: string
		capacity: number
	}
	summary: {
		views: number
		uniqueViewers: number
		bookings: number
		revenue: {
			total: number
			net: number
			discounts: number
			averagePerBooking: number
		}
		tickets: {
			sold: number
			checkedIn: number
			checkInRate: number
		}
		interactions: {
			views: number
			shares: number
			bookingStarts: number
		}
		conversionRates: {
			viewToBooking: number
			viewToCheckIn: number
		}
	}
	trends: {
		bookings: Array<{
			date: string
			revenue: number
			bookings: number
			tickets: number
		}>
		views: Array<{
			date: string
			views: number
			uniqueViewers: number
		}>
	}
	trafficSources: {
		referrers: Array<{
			referrer: string
			domain: string
			category: string
			pageViews: number
			uniqueSessions: number
			percentage: number
		}>
		directTraffic: {
			pageViews: number
			percentage: number
		}
		totalPageViews: number
	}
	devices: Array<{
		deviceType: string
		count: number
		uniqueSessionsCount: number
		percentage: number
	}>
	recentInteractions: {
		items: Array<{
			_id: string
			interactionType: string
			timestamp: string
			userId: string | null
			sessionId: string
			metadata: any
		}>
		pagination: {
			page: number
			limit: number
			total: number
			totalPages: number
			hasNextPage: boolean
			hasPreviousPage: boolean
		}
	}
	albums?: {
		albumCount: number
		totalAccesses: number
		uniqueViewers: number
		logins: number
		signups: number
		perAlbum: Array<{
			albumId: string
			title: string
			accesses: number
			uniqueViewers: number
		}>
	}
	dateRange: {
		from: string | null
		to: string | null
	}
}

export default function EventAnalyticsPage({ event }: { event: string }) {
	const eventData = JSON.parse(event) as { _id: string; name: string; slug: string }
	const [analyticsData, setAnalyticsData] = useState<EventAnalyticsData | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [dateFrom, setDateFrom] = useState<Date | null>(null)
	const [dateTo, setDateTo] = useState<Date | null>(null)
	const [currentPage, setCurrentPage] = useState(1)
	const router = useRouter()
	const toast = useToast()

	const [tabIndex, setTabIndex] = useState(0)
	const [albumLog, setAlbumLog] = useState<Array<{ _id: string; albumId: string; albumTitle: string; name: string; email: string; action: string; date: string }>>([])
	const [albumLogLoaded, setAlbumLogLoaded] = useState(false)
	const [albumLogLoading, setAlbumLogLoading] = useState(false)
	const [interestRows, setInterestRows] = useState<Array<{ _id: string; name: string; email: string; interests: string[]; customInterests: string[]; date: string }>>([])
	const [topInterests, setTopInterests] = useState<Array<{ interest: string; count: number }>>([])
	const [journeyLoaded, setJourneyLoaded] = useState(false)
	const [journeyLoading, setJourneyLoading] = useState(false)
	const [funnel, setFunnel] = useState<FunnelStage[]>([])
	const [dwell, setDwell] = useState<DwellRow[]>([])
	const [heatPoints, setHeatPoints] = useState<any[]>([])
	const [topTargets, setTopTargets] = useState<HeatTopTarget[]>([])

	const [namedEventsLoaded, setNamedEventsLoaded] = useState(false)
	const [namedEventsLoading, setNamedEventsLoading] = useState(false)
	const [namedEventsRows, setNamedEventsRows] = useState<Array<{ category: string; eventName: string; totalEvents: number; uniqueUsers: number }>>([])
	const [namedEventsCategory, setNamedEventsCategory] = useState<string>("all")
	const [namedEventsPage, setNamedEventsPage] = useState(1)
	const NAMED_EVENTS_PER_PAGE = 20

	const exportNamedEventsCSV = () => {
		const rows = namedEventsRows.filter((r) => namedEventsCategory === "all" || r.category === namedEventsCategory)
		const header = "Category,Event Name,Total Events,Unique Users"
		const lines = rows.map((r) => `"${r.category}","${r.eventName.replace(/"/g, '""')}",${r.totalEvents},${r.uniqueUsers}`)
		const csv = "﻿" + [header, ...lines].join("\n")
		const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
		const url = URL.createObjectURL(blob)
		const a = document.createElement("a")
		a.href = url
		a.download = `named-events-${stripHTMLAndDecode(eventData.name).slice(0, 30).replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	const loadJourney = async () => {
		if (journeyLoaded || journeyLoading) return
		setJourneyLoading(true)
		try {
			const eid = eventData._id
			const [f, d, h] = await Promise.all([
				fetch(`/api/analytics/journey/funnel?eventId=${eid}`, { credentials: "include" }).then((r) => r.json()),
				fetch(`/api/analytics/journey/dwell?eventId=${eid}`, { credentials: "include" }).then((r) => r.json()),
				fetch(`/api/analytics/journey/heat?eventId=${eid}`, { credentials: "include" }).then((r) => r.json()),
			])
			if (f?.status) setFunnel(f.data.funnel || [])
			if (d?.status) setDwell(d.data.pages || [])
			if (h?.status) {
				setHeatPoints(h.data.clicks || [])
				setTopTargets(h.data.topTargets || [])
			}
			setJourneyLoaded(true)
		} catch (e: any) {
			toast({ title: "Failed to load journey data", description: e.message, status: "error" })
		} finally {
			setJourneyLoading(false)
		}
	}

	const loadNamedEvents = async () => {
		if (namedEventsLoaded || namedEventsLoading) return
		setNamedEventsLoading(true)
		try {
			const params = new URLSearchParams({ eventId: eventData._id })
			if (dateFrom) params.append("dateFrom", dateFrom.toISOString())
			if (dateTo) params.append("dateTo", dateTo.toISOString())
			const res = await fetch(`/api/analytics/named-events?${params.toString()}`, { credentials: "include" })
			const json = await res.json()
			if (json?.status) setNamedEventsRows(json.data.rows || [])
			setNamedEventsLoaded(true)
		} catch (e: any) {
			toast({ title: "Failed to load named events", description: e.message, status: "error" })
		} finally {
			setNamedEventsLoading(false)
		}
	}

	const loadAlbumLog = async (force = false, from: Date | null = dateFrom, to: Date | null = dateTo) => {
		if (!force && (albumLogLoaded || albumLogLoading)) return
		setAlbumLogLoading(true)
		try {
			const params = new URLSearchParams({ eventId: eventData._id })
			if (from) params.append("dateFrom", from.toISOString())
			if (to) params.append("dateTo", to.toISOString())
			const res = await fetch(`/api/events/${eventData._id}/albums/access-log?${params.toString()}`, { credentials: "include" })
			const json = await res.json()
			if (json?.status) setAlbumLog(json.data.items || [])

			// Interests picked in the album access dialog — loaded on the same tab.
			const iRes = await fetch(`/api/events/${eventData._id}/albums/interests?${params.toString()}`, { credentials: "include" })
			const iJson = await iRes.json()
			if (iJson?.status) {
				setInterestRows(iJson.data.items || [])
				setTopInterests(iJson.data.top || [])
			}

			setAlbumLogLoaded(true)
		} catch (e: any) {
			toast({ title: "Failed to load album access log", description: e.message, status: "error" })
		} finally {
			setAlbumLogLoading(false)
		}
	}

	const exportAlbumCSV = () => {
		const a = analyticsData?.albums
		const summaryLines = a
			? [
					"Album Analytics Summary",
					`Albums,${a.albumCount}`,
					`Total Accesses,${a.totalAccesses}`,
					`Unique Viewers,${a.uniqueViewers}`,
					`Logins via Album,${a.logins}`,
					`Signups via Album,${a.signups}`,
					"",
					"Per Album,Accesses,Unique Viewers",
					...a.perAlbum.map((p) => `"${p.title.replace(/"/g, '""')}",${p.accesses},${p.uniqueViewers}`),
					"",
			  ]
			: []
		const logHeader = "Album,Name,Email,Action,Date"
		const logLines = albumLog.map(
			(r) => `"${r.albumTitle.replace(/"/g, '""')}","${r.name.replace(/"/g, '""')}","${r.email.replace(/"/g, '""')}",${r.action},${new Date(r.date).toISOString()}`,
		)

		const q = (s: string) => `"${(s || "").replace(/"/g, '""')}"`
		const topLines = topInterests.length
			? ["", "Top Interests,Count", ...topInterests.map((t) => `${q(t.interest)},${t.count}`)]
			: []
		const interestLines = interestRows.length
			? [
					"",
					"Interests Log",
					"Name,Email,Interests,Custom Interest,Date",
					...interestRows.map((r) => `${q(r.name)},${q(r.email)},${q(r.interests.join("; "))},${q(r.customInterests.join("; "))},${new Date(r.date).toISOString()}`),
			  ]
			: []

		const csv = "﻿" + [...summaryLines, "Access Log", logHeader, ...logLines, ...topLines, ...interestLines].join("\n")
		const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
		const url = URL.createObjectURL(blob)
		const el = document.createElement("a")
		el.href = url
		el.download = `album-analytics-${stripHTMLAndDecode(eventData.name).slice(0, 30).replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`
		document.body.appendChild(el)
		el.click()
		document.body.removeChild(el)
		URL.revokeObjectURL(url)
	}

	useEffect(() => {
		if (tabIndex === 1) loadJourney()
		if (tabIndex === 2) loadNamedEvents()
		if (tabIndex === 3) loadAlbumLog()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tabIndex])

	const fetchAnalytics = async (from: Date | null, to: Date | null, page: number = 1) => {
		setIsLoading(true)
		try {
			const params = new URLSearchParams()
			params.append("eventId", eventData._id)
			if (from) params.append("dateFrom", from.toISOString())
			if (to) params.append("dateTo", to.toISOString())
			params.append("page", page.toString())
			params.append("limit", "20")

			const response = await fetch(`/api/analytics/events?${params.toString()}`, {
				method: "GET",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			})

			if (response.ok) {
				const result = await response.json()
				if (result.status && result.data) {
					setAnalyticsData(result.data)
					setCurrentPage(page)
				} else {
					const errorMessage = result.message || "Failed to fetch analytics data"
					throw new Error(errorMessage)
				}
			} else {
				const errorResult = await response.json().catch(() => ({ message: "Failed to fetch analytics data" }))
				throw new Error(errorResult.message || `HTTP ${response.status}: Failed to fetch analytics data`)
			}
		} catch (error: any) {
			console.error("[Event Analytics] Error fetching data:", error)
			toast({
				title: "Error",
				description: "Failed to load analytics data.",
				status: "error",
				duration: 5000,
				isClosable: true,
			})
		} finally {
			setIsLoading(false)
		}
	}

	useEffect(() => {
		fetchAnalytics(dateFrom, dateTo, 1)
	}, [dateFrom, dateTo, eventData._id])

	const handleDateChange = (from: Date | null, to: Date | null) => {
		setDateFrom(from)
		setDateTo(to)
		setCurrentPage(1)
		// Invalidate lazily-loaded album log so it refetches for the new range.
		setAlbumLogLoaded(false)
		if (tabIndex === 3) loadAlbumLog(true, from, to)
	}

	const handlePageChange = (newPage: number) => {
		fetchAnalytics(dateFrom, dateTo, newPage)
	}

	const formatCurrency = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount)
	const formatNumber = (num: number) => new Intl.NumberFormat("en-US").format(num)
	const formatDate = (date: string) => new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
	const formatDateTime = (date: string) => new Date(date).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })

	// Simple chart component for views
	const ViewsChart = ({ data }: { data: Array<{ date: string; views: number; uniqueViewers: number }> }) => {
		if (!data || data.length === 0) {
			return (
				<Box p={8} textAlign="center" color="#65676B">
					<Text>No view data available for the selected period</Text>
				</Box>
			)
		}

		const maxValue = Math.max(...data.map((d) => Math.max(d.views, d.uniqueViewers)))

		return (
			<Box>
				<Box position="relative" height="300px" width="100%">
					<Box position="absolute" left={0} top={0} bottom={0} width="40px" borderRight="1px solid #E5E7EB">
						{[...Array(5)].map((_, i) => {
							const value = Math.round((maxValue / 4) * (4 - i))
							return (
								<Box key={i} position="absolute" bottom={`${(i / 4) * 100}%`} fontSize="xs" color="#65676B" right="4px">
									{value}
								</Box>
							)
						})}
					</Box>
					<Box ml="50px" mr="20px" position="relative" height="100%">
						{[...Array(5)].map((_, i) => (
							<Box key={i} position="absolute" top={`${(i / 4) * 100}%`} left={0} right={0} borderTop="1px solid #F0F2F5" height="1px" />
						))}
						<Box display="flex" height="100%" alignItems="flex-end" gap="8px" paddingBottom="20px">
							{data.map((item, index) => {
								const barHeight = maxValue > 0 ? (item.views / maxValue) * 100 : 0
								return (
									<Box key={index} flex="1" display="flex" flexDirection="column" alignItems="center" position="relative">
										<Box width="100%" height={`${barHeight}%`} bg="#1877F2" borderRadius="4px 4px 0 0" minHeight="2px" title={`${item.views} views`} />
										<Text fontSize="xs" color="#65676B" mt={1} style={{ transform: "rotate(-45deg)", transformOrigin: "center" }} whiteSpace="nowrap">
											{new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
										</Text>
									</Box>
								)
							})}
						</Box>
					</Box>
				</Box>
				<Box display="flex" gap={4} justifyContent="center" mt={4}>
					<Box display="flex" alignItems="center" gap={2}>
						<Box width="16px" height="16px" bg="#1877F2" borderRadius="2px" />
						<Text fontSize="sm" color="#65676B">
							Views
						</Text>
					</Box>
				</Box>
			</Box>
		)
	}

	// Simple chart component for bookings
	const BookingsChart = ({ data }: { data: Array<{ date: string; revenue: number; bookings: number; tickets: number }> }) => {
		if (!data || data.length === 0) {
			return (
				<Box p={8} textAlign="center" color="#65676B">
					<Text>No booking data available for the selected period</Text>
				</Box>
			)
		}

		const maxBookings = Math.max(...data.map((d) => d.bookings))
		const maxRevenue = Math.max(...data.map((d) => d.revenue))

		return (
			<Box>
				<Box mb={8}>
					<Text fontSize="md" fontWeight="bold" mb={4} color="#1C1E21">
						Bookings Over Time
					</Text>
					<Box position="relative" height="250px" width="100%">
						<Box position="absolute" left={0} top={0} bottom={0} width="40px" borderRight="1px solid #E5E7EB">
							{[...Array(5)].map((_, i) => {
								const value = Math.round((maxBookings / 4) * (4 - i))
								return (
									<Box key={i} position="absolute" bottom={`${(i / 4) * 100}%`} fontSize="xs" color="#65676B" right="4px">
										{value}
									</Box>
								)
							})}
						</Box>
						<Box ml="50px" mr="20px" position="relative" height="100%">
							{[...Array(5)].map((_, i) => (
								<Box key={i} position="absolute" top={`${(i / 4) * 100}%`} left={0} right={0} borderTop="1px solid #F0F2F5" height="1px" />
							))}
							<Box display="flex" height="100%" alignItems="flex-end" gap="4px" paddingBottom="20px">
								{data.map((item, index) => {
									const barHeight = maxBookings > 0 ? (item.bookings / maxBookings) * 100 : 0
									return (
										<Box key={index} flex="1" display="flex" flexDirection="column" alignItems="center" position="relative">
											<Box width="100%" height={`${barHeight}%`} bg="#4CAF50" borderRadius="4px 4px 0 0" minHeight="2px" title={`${item.bookings} bookings`} />
											<Text fontSize="xs" color="#65676B" mt={1} style={{ transform: "rotate(-45deg)", transformOrigin: "center" }} whiteSpace="nowrap">
												{new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
											</Text>
										</Box>
									)
								})}
							</Box>
						</Box>
					</Box>
				</Box>

				<Box>
					<Text fontSize="md" fontWeight="bold" mb={4} color="#1C1E21">
						Revenue Over Time
					</Text>
					<Box position="relative" height="250px" width="100%">
						<Box position="absolute" left={0} top={0} bottom={0} width="60px" borderRight="1px solid #E5E7EB">
							{[...Array(5)].map((_, i) => {
								const value = (maxRevenue / 4) * (4 - i)
								const formatted = value >= 1000 ? `$${(value / 1000).toFixed(1)}k` : `$${Math.round(value)}`
								return (
									<Box key={i} position="absolute" bottom={`${(i / 4) * 100}%`} fontSize="xs" color="#65676B" right="4px">
										{formatted}
									</Box>
								)
							})}
						</Box>
						<Box ml="70px" mr="20px" position="relative" height="100%">
							{[...Array(5)].map((_, i) => (
								<Box key={i} position="absolute" top={`${(i / 4) * 100}%`} left={0} right={0} borderTop="1px solid #F0F2F5" height="1px" />
							))}
							<Box display="flex" height="100%" alignItems="flex-end" gap="4px" paddingBottom="20px">
								{data.map((item, index) => {
									const barHeight = maxRevenue > 0 ? (item.revenue / maxRevenue) * 100 : 0
									return (
										<Box key={index} flex="1" display="flex" flexDirection="column" alignItems="center" position="relative">
											<Box width="100%" height={`${barHeight}%`} bg="#2196F3" borderRadius="4px 4px 0 0" minHeight="2px" title={formatCurrency(item.revenue)} />
											<Text fontSize="xs" color="#65676B" mt={1} style={{ transform: "rotate(-45deg)", transformOrigin: "center" }} whiteSpace="nowrap">
												{new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
											</Text>
										</Box>
									)
								})}
							</Box>
						</Box>
					</Box>
				</Box>
			</Box>
		)
	}

	return (
		<>
			<Head>
				<title>Event Analytics - {stripHTMLAndDecode(eventData.name)} - Jetzy Events</title>
				<meta name="description" content={`View analytics for ${stripHTMLAndDecode(eventData.name)}`} />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout>
				<Box maxW="1400px" mx="auto" px={{ base: 4, md: 0 }} py={6}>
					{/* Header */}
					<Flex align="center" mb={6} gap={4}>
						<Button leftIcon={<FiArrowLeft />} variant="ghost" size="sm" onClick={() => router.back()}>
							Back
						</Button>
						<Box flex={1}>
							<Text fontSize="2xl" fontWeight="bold" color="#1C1E21">
								Event Analytics
							</Text>
							<Box fontSize="lg" color="#65676B">
								<SafeHTML html={eventData.name} />
							</Box>
						</Box>
					</Flex>

					{/* Date Range Selector */}
					<Box bg="white" p={4} borderRadius="lg" boxShadow="sm" mb={6}>
						<DateRangeSelector dateFrom={dateFrom} dateTo={dateTo} onDateChange={handleDateChange} />
					</Box>

					{/* Loading State */}
					{isLoading ? (
						<Center py={20}>
							<Spinner size="xl" color="#1877F2" />
						</Center>
					) : analyticsData ? (
						<Tabs variant="line" index={tabIndex} onChange={setTabIndex} isLazy>
							<TabList mb={4} borderBottom="2px solid #2a2a2a">
								<Tab color="#9C9C9C" fontWeight="bold" _selected={{ color: "#F79432", borderBottom: "2px solid #F79432" }}>Overview</Tab>
								<Tab color="#9C9C9C" fontWeight="bold" _selected={{ color: "#F79432", borderBottom: "2px solid #F79432" }}>Journey</Tab>
								<Tab color="#9C9C9C" fontWeight="bold" _selected={{ color: "#F79432", borderBottom: "2px solid #F79432" }}>Named Events</Tab>
								<Tab color="#9C9C9C" fontWeight="bold" _selected={{ color: "#F79432", borderBottom: "2px solid #F79432" }}>Albums</Tab>
							</TabList>
							<TabPanels>
								<TabPanel px={0}>
							{/* Summary Metrics */}
							<Box mb={6}>
								<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
									Overview
								</Text>
								<SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4}>
									<MetricsCard title="Total Views" value={formatNumber(analyticsData.summary.views)} icon={FiEye} subtitle={`${formatNumber(analyticsData.summary.uniqueViewers)} unique viewers`} />
									<MetricsCard title="Total Bookings" value={formatNumber(analyticsData.summary.bookings)} icon={FiUsers} />
									<MetricsCard title="Total Revenue" value={formatCurrency(analyticsData.summary.revenue.total)} icon={FiDollarSign} subtitle={`Net: ${formatCurrency(analyticsData.summary.revenue.net)}`} />
									<MetricsCard title="Tickets Sold" value={formatNumber(analyticsData.summary.tickets.sold)} icon={FiShoppingCart} subtitle={`${formatNumber(analyticsData.summary.tickets.checkedIn)} checked in`} />
								</SimpleGrid>
							</Box>

							{/* Revenue & Conversion Metrics */}
							<Box mb={6}>
								<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
									Revenue & Conversion
								</Text>
								<SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4}>
									<MetricsCard title="Net Revenue" value={formatCurrency(analyticsData.summary.revenue.net)} icon={FiDollarSign} bgColor="#E8F5E9" iconColor="#4CAF50" subtitle={`After ${formatCurrency(analyticsData.summary.revenue.discounts)} discounts`} />
									<MetricsCard title="Avg per Booking" value={formatCurrency(analyticsData.summary.revenue.averagePerBooking)} icon={FiTrendingUp} />
									<MetricsCard title="Check-in Rate" value={`${analyticsData.summary.tickets.checkInRate.toFixed(1)}%`} icon={FiUsers} bgColor="#E3F2FD" iconColor="#2196F3" />
									<MetricsCard title="View to Booking" value={`${analyticsData.summary.conversionRates.viewToBooking.toFixed(2)}%`} icon={FiTrendingUp} bgColor="#E8F5E9" iconColor="#4CAF50" />
								</SimpleGrid>
							</Box>

							{/* Interactions */}
							<Box mb={6}>
								<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
									Interactions
								</Text>
								<SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} spacing={4}>
									<MetricsCard title="Views" value={formatNumber(analyticsData.summary.interactions.views)} icon={FiEye} />
									<MetricsCard title="Shares" value={formatNumber(analyticsData.summary.interactions.shares)} icon={FiShare2} />
									<MetricsCard title="Booking Starts" value={formatNumber(analyticsData.summary.interactions.bookingStarts)} icon={FiShoppingCart} />
								</SimpleGrid>
							</Box>

							{/* Charts */}
							<Box bg="white" p={6} borderRadius="lg" boxShadow="sm" mb={6}>
								<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
									Views Over Time
								</Text>
								<ViewsChart data={analyticsData.trends.views} />
							</Box>

							{analyticsData.trends.bookings.length > 0 && (
								<Box bg="white" p={6} borderRadius="lg" boxShadow="sm" mb={6}>
									<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
										Bookings & Revenue Trends
									</Text>
									<BookingsChart data={analyticsData.trends.bookings} />
								</Box>
							)}

							{/* Traffic Sources */}
							{analyticsData.trafficSources.referrers.length > 0 && (
								<Box bg="white" p={6} borderRadius="lg" boxShadow="sm" mb={6}>
									<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
										Traffic Sources
									</Text>
									<TableContainer>
										<Table variant="simple">
											<Thead>
												<Tr>
													<Th>Referrer</Th>
													<Th>Category</Th>
													<Th isNumeric>Page Views</Th>
													<Th isNumeric>Sessions</Th>
													<Th isNumeric>% of Total</Th>
												</Tr>
											</Thead>
											<Tbody>
												{analyticsData.trafficSources.referrers.map((ref, idx) => (
													<Tr key={idx}>
														<Td>
															<Text fontSize="sm" isTruncated maxW="300px">
																{ref.domain}
															</Text>
														</Td>
														<Td>
															<Badge
																colorScheme={
																	ref.category === "search_engine" ? "blue" : ref.category === "social_media" ? "purple" : ref.category === "email" ? "orange" : "gray"
																}
																size="sm"
															>
																{ref.category.replace(/_/g, " ")}
															</Badge>
														</Td>
														<Td isNumeric>{formatNumber(ref.pageViews)}</Td>
														<Td isNumeric>{formatNumber(ref.uniqueSessions)}</Td>
														<Td isNumeric>{ref.percentage.toFixed(1)}%</Td>
													</Tr>
												))}
											</Tbody>
										</Table>
									</TableContainer>
								</Box>
							)}

							{/* Devices */}
							{analyticsData.devices.length > 0 && (
								<Box bg="white" p={6} borderRadius="lg" boxShadow="sm" mb={6}>
									<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
										Device Breakdown
									</Text>
									<TableContainer>
										<Table variant="simple">
											<Thead>
												<Tr>
													<Th>Device Type</Th>
													<Th isNumeric>Page Views</Th>
													<Th isNumeric>Sessions</Th>
													<Th isNumeric>% of Total</Th>
												</Tr>
											</Thead>
											<Tbody>
												{analyticsData.devices.map((device, idx) => (
													<Tr key={idx}>
														<Td>
															<Badge colorScheme="blue" textTransform="capitalize">
																{device.deviceType}
															</Badge>
														</Td>
														<Td isNumeric>{formatNumber(device.count)}</Td>
														<Td isNumeric>{formatNumber(device.uniqueSessionsCount)}</Td>
														<Td isNumeric>{device.percentage.toFixed(1)}%</Td>
													</Tr>
												))}
											</Tbody>
										</Table>
									</TableContainer>
								</Box>
							)}

							{/* Recent Interactions */}
							<Box bg="white" p={6} borderRadius="lg" boxShadow="sm" mb={6}>
								<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>
									Recent Interactions
								</Text>
								<TableContainer>
									<Table variant="simple">
										<Thead>
											<Tr>
												<Th>Type</Th>
												<Th>Timestamp</Th>
												<Th>User ID</Th>
												<Th>Session ID</Th>
											</Tr>
										</Thead>
										<Tbody>
											{analyticsData.recentInteractions.items.map((interaction) => (
												<Tr key={interaction._id}>
													<Td>
														<Badge colorScheme={interaction.interactionType === "view" ? "blue" : interaction.interactionType === "share" ? "purple" : "green"}>{interaction.interactionType}</Badge>
													</Td>
													<Td>
														<Text fontSize="sm">{formatDateTime(interaction.timestamp)}</Text>
													</Td>
													<Td>
														<Text fontSize="sm" fontFamily="mono">
															{interaction.userId || "Anonymous"}
														</Text>
													</Td>
													<Td>
														<Text fontSize="xs" fontFamily="mono" color="gray.500">
															{interaction.sessionId.substring(0, 8)}...
														</Text>
													</Td>
												</Tr>
											))}
										</Tbody>
									</Table>
								</TableContainer>

								{/* Pagination */}
								{analyticsData.recentInteractions.pagination.totalPages > 1 && (
									<Flex justify="space-between" align="center" mt={4}>
										<Text fontSize="sm" color="#65676B">
											Page {analyticsData.recentInteractions.pagination.page} of {analyticsData.recentInteractions.pagination.totalPages} ({formatNumber(analyticsData.recentInteractions.pagination.total)} total)
										</Text>
										<HStack spacing={2}>
											<IconButton
												aria-label="Previous page"
												icon={<FiChevronLeft />}
												size="sm"
												onClick={() => handlePageChange(currentPage - 1)}
												isDisabled={!analyticsData.recentInteractions.pagination.hasPreviousPage}
											/>
											<IconButton
												aria-label="Next page"
												icon={<FiChevronRight />}
												size="sm"
												onClick={() => handlePageChange(currentPage + 1)}
												isDisabled={!analyticsData.recentInteractions.pagination.hasNextPage}
											/>
										</HStack>
									</Flex>
								)}
							</Box>
								</TabPanel>
								<TabPanel px={0}>
									{journeyLoading ? (
										<Center py={20}><Spinner size="xl" color="#F79432" /></Center>
									) : (
										<>
											<Box bg="#1a1a1a" p={4} borderRadius="lg" border="1px solid" borderColor="#2a2a2a" mb={6}>
												<Text fontWeight="bold" fontSize="lg" mb={4} color="white">Conversion Funnel</Text>
												{funnel.length === 0 ? (
													<Text color="#9C9C9C" fontSize="sm">No funnel data yet.</Text>
												) : (
													funnel.map((stage, i) => {
														const maxCount = funnel[0]?.count || 1
														const w = Math.max(8, (stage.count / maxCount) * 100)
														return (
															<Box key={stage.stage} mb={3}>
																<Flex justify="space-between" mb={1}>
																	<Text fontSize="sm" color="white">{stage.label}</Text>
																	<Text fontSize="sm" color="#9C9C9C">{stage.count.toLocaleString()} · {stage.conversionPct}%{i > 0 ? ` · drop ${stage.dropOffPct}%` : ""}</Text>
																</Flex>
																<Box h="24px" bg="#2a2a2a" borderRadius="md" overflow="hidden">
																	<Box h="100%" w={`${w}%`} bg="#F79432" />
																</Box>
															</Box>
														)
													})
												)}
											</Box>

											<Box bg="#1a1a1a" p={4} borderRadius="lg" border="1px solid" borderColor="#2a2a2a" mb={6}>
												<Text fontWeight="bold" fontSize="lg" mb={4} color="white">Page Dwell &amp; Scroll Depth</Text>
												<TableContainer>
													<Table size="sm">
														<Thead>
															<Tr>
																<Th color="#9C9C9C" borderColor="#2a2a2a">Page</Th>
																<Th color="#9C9C9C" borderColor="#2a2a2a" isNumeric>Views</Th>
																<Th color="#9C9C9C" borderColor="#2a2a2a" isNumeric>Avg time (s)</Th>
																<Th color="#9C9C9C" borderColor="#2a2a2a" isNumeric>p50</Th>
																<Th color="#9C9C9C" borderColor="#2a2a2a" isNumeric>p90</Th>
																<Th color="#9C9C9C" borderColor="#2a2a2a" isNumeric>Avg scroll %</Th>
															</Tr>
														</Thead>
														<Tbody>
															{dwell.length === 0 ? (
																<Tr><Td colSpan={6} borderColor="#2a2a2a"><Text color="#9C9C9C" fontSize="sm">No dwell data yet.</Text></Td></Tr>
															) : dwell.map((r) => (
																<Tr key={r.page} _hover={{ bg: "#262626" }}>
																	<Td borderColor="#2a2a2a"><Text fontSize="xs" color="white" maxW="400px" isTruncated>{r.page}</Text></Td>
																	<Td color="white" borderColor="#2a2a2a" isNumeric>{r.views}</Td>
																	<Td color="white" borderColor="#2a2a2a" isNumeric>{r.avgTimeSec}</Td>
																	<Td color="white" borderColor="#2a2a2a" isNumeric>{r.p50Sec}</Td>
																	<Td color="white" borderColor="#2a2a2a" isNumeric>{r.p90Sec}</Td>
																	<Td color="white" borderColor="#2a2a2a" isNumeric>{r.avgScrollDepthPct ?? "—"}</Td>
																</Tr>
															))}
														</Tbody>
													</Table>
												</TableContainer>
											</Box>

											<SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6} mb={6}>
												<Box bg="#1a1a1a" p={4} borderRadius="lg" border="1px solid" borderColor="#2a2a2a">
													<Text fontWeight="bold" fontSize="lg" mb={4} color="white">Click Heatmap</Text>
													<ClickHeatmap points={heatPoints} width={600} height={400} />
												</Box>
												<Box bg="#1a1a1a" p={4} borderRadius="lg" border="1px solid" borderColor="#2a2a2a">
													<Text fontWeight="bold" fontSize="lg" mb={4} color="white">Top Click Targets</Text>
													<TableContainer>
														<Table size="sm">
															<Thead><Tr><Th color="#9C9C9C" borderColor="#2a2a2a">Target</Th><Th color="#9C9C9C" borderColor="#2a2a2a" isNumeric>Clicks</Th><Th color="#9C9C9C" borderColor="#2a2a2a" isNumeric>Rage</Th></Tr></Thead>
															<Tbody>
																{topTargets.length === 0 ? (
																	<Tr><Td colSpan={3} borderColor="#2a2a2a"><Text color="#9C9C9C" fontSize="sm">No clicks yet.</Text></Td></Tr>
																) : topTargets.map((t, idx) => (
																	<Tr key={idx} _hover={{ bg: "#262626" }}>
																		<Td borderColor="#2a2a2a"><Text fontSize="xs" color="white" maxW="280px" isTruncated>{t.dataTrack || t.text || "—"}</Text></Td>
																		<Td color="white" borderColor="#2a2a2a" isNumeric>{t.count}</Td>
																		<Td color="white" borderColor="#2a2a2a" isNumeric>{t.rageCount > 0 ? <Badge colorScheme="red">{t.rageCount}</Badge> : 0}</Td>
																	</Tr>
																))}
															</Tbody>
														</Table>
													</TableContainer>
												</Box>
											</SimpleGrid>
										</>
									)}
								</TabPanel>
								<TabPanel px={0}>
									{namedEventsLoading ? (
										<Center py={20}><Spinner size="xl" color="#F79432" /></Center>
									) : (() => {
										const filteredRows = namedEventsRows.filter((r) => namedEventsCategory === "all" || r.category === namedEventsCategory)
										const totalPages = Math.max(1, Math.ceil(filteredRows.length / NAMED_EVENTS_PER_PAGE))
										const safePage = Math.min(namedEventsPage, totalPages)
										const paginatedRows = filteredRows.slice((safePage - 1) * NAMED_EVENTS_PER_PAGE, safePage * NAMED_EVENTS_PER_PAGE)
										return (
											<Box bg="#1a1a1a" p={6} borderRadius="lg" border="1px solid" borderColor="#2a2a2a" mb={6}>
												<Flex justify="space-between" align="center" mb={4} wrap="wrap" gap={3}>
													<Box>
														<Text fontWeight="bold" fontSize="lg" color="white">Named Events</Text>
														<Text fontSize="sm" color="#9C9C9C">Category / Event Name / Total Events / Unique Users</Text>
													</Box>
													<HStack spacing={2} flexWrap="wrap">
														{["all", "Event Interactions", "CTA Clicks", "Form Events"].map((cat) => (
															<Button
																key={cat}
																size="xs"
																onClick={() => { setNamedEventsCategory(cat); setNamedEventsPage(1) }}
																bg={namedEventsCategory === cat ? "#F79432" : "#2a2a2a"}
																color={namedEventsCategory === cat ? "black" : "#9C9C9C"}
																_hover={{ bg: namedEventsCategory === cat ? "#E68422" : "#333" }}
																borderRadius="full"
																px={3}
															>
																{cat === "all" ? "All" : cat}
															</Button>
														))}
														{filteredRows.length > 0 && (
															<Button size="xs" onClick={exportNamedEventsCSV} bg="#2a2a2a" color="#9C9C9C" _hover={{ bg: "#333", color: "white" }} borderRadius="full" px={3}>
																Export CSV
															</Button>
														)}
													</HStack>
												</Flex>
												{filteredRows.length > 0 ? (
													<>
														<TableContainer sx={{ "& th": { color: "#9C9C9C", borderColor: "#2a2a2a" }, "& td": { borderColor: "#2a2a2a", color: "white" } }}>
															<Table variant="simple" size="sm">
																<Thead><Tr>
																	<Th>Category</Th>
																	<Th>Event Name</Th>
																	<Th isNumeric>Total Events</Th>
																	<Th isNumeric>Unique Users</Th>
																</Tr></Thead>
																<Tbody>
																	{paginatedRows.map((row, idx) => (
																		<Tr key={idx} _hover={{ bg: "#262626" }}>
																			<Td><Badge colorScheme={row.category === "Event Interactions" ? "blue" : row.category === "CTA Clicks" ? "orange" : "green"}>{row.category}</Badge></Td>
																			<Td><Text fontSize="sm">{row.eventName}</Text></Td>
																			<Td isNumeric><Text fontWeight="semibold">{row.totalEvents.toLocaleString()}</Text></Td>
																			<Td isNumeric><Badge colorScheme="teal">{row.uniqueUsers.toLocaleString()}</Badge></Td>
																		</Tr>
																	))}
																</Tbody>
															</Table>
														</TableContainer>
														{totalPages > 1 && (
															<Flex justify="space-between" align="center" mt={4}>
																<Text fontSize="sm" color="#9C9C9C">Page {safePage} of {totalPages} ({filteredRows.length} total)</Text>
																<HStack spacing={2}>
																	<IconButton bg="#1a1a1a" color="white" border="1px solid" borderColor="#2a2a2a" _hover={{ bg: "#262626" }} aria-label="Previous page" icon={<FiChevronLeft />} size="sm" onClick={() => setNamedEventsPage((p) => Math.max(1, p - 1))} isDisabled={safePage <= 1} />
																	<IconButton bg="#1a1a1a" color="white" border="1px solid" borderColor="#2a2a2a" _hover={{ bg: "#262626" }} aria-label="Next page" icon={<FiChevronRight />} size="sm" onClick={() => setNamedEventsPage((p) => Math.min(totalPages, p + 1))} isDisabled={safePage >= totalPages} />
																</HStack>
															</Flex>
														)}
													</>
												) : (
													<Text color="#9C9C9C" fontSize="sm">No interactions recorded for this event yet.</Text>
												)}
											</Box>
										)
									})()}
								</TabPanel>
								<TabPanel px={0}>
									<Flex justify="space-between" align="center" mb={4} flexWrap="wrap" gap={3}>
										<Box>
											<Text fontSize="xl" fontWeight="bold" color="white">Album Access</Text>
											<Text fontSize="sm" color="#9C9C9C">Who reached shared albums, and whether they logged in or signed up.</Text>
										</Box>
										<Button size="sm" onClick={exportAlbumCSV} bg="#F79432" color="black" _hover={{ bg: "#E68422" }} borderRadius="full" px={4} isDisabled={!analyticsData.albums}>
											Export CSV
										</Button>
									</Flex>

									{analyticsData.albums && (
										<SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={6}>
											{[
												{ label: "Album Viewers", value: analyticsData.albums.uniqueViewers, icon: FiEye, sub: `${formatNumber(analyticsData.albums.totalAccesses)} accesses` },
												{ label: "Logins via Album", value: analyticsData.albums.logins, icon: FiLogIn, sub: undefined as string | undefined },
												{ label: "Signups via Album", value: analyticsData.albums.signups, icon: FiUserPlus, sub: undefined as string | undefined },
												{ label: "Albums", value: analyticsData.albums.albumCount, icon: FiImage, sub: undefined as string | undefined },
											].map((t) => (
												<Box key={t.label} bg="#1a1a1a" border="1px solid #2a2a2a" borderRadius="lg" p={4}>
													<Flex align="center" gap={2} mb={2}>
														<Box as={t.icon as any} color="#F79432" />
														<Text fontSize="xs" color="#9C9C9C" fontWeight="bold">{t.label}</Text>
													</Flex>
													<Text fontSize="2xl" fontWeight="bold" color="white">{formatNumber(t.value)}</Text>
													{t.sub && <Text fontSize="xs" color="#65676B">{t.sub}</Text>}
												</Box>
											))}
										</SimpleGrid>
									)}

									{analyticsData.albums && analyticsData.albums.perAlbum.length > 0 && (
										<Box mb={6}>
											<Text fontSize="sm" fontWeight="bold" color="#9C9C9C" mb={3}>Top Albums by Access</Text>
											<TableContainer sx={{ "& th": { color: "#9C9C9C", borderColor: "#2a2a2a" }, "& td": { borderColor: "#2a2a2a", color: "white" } }}>
												<Table variant="simple" size="sm">
													<Thead><Tr><Th>Album</Th><Th isNumeric>Accesses</Th><Th isNumeric>Unique Viewers</Th></Tr></Thead>
													<Tbody>
														{analyticsData.albums.perAlbum.map((a) => (
															<Tr key={a.albumId} _hover={{ bg: "#262626" }}>
																<Td><Text fontSize="sm">{a.title}</Text></Td>
																<Td isNumeric><Text fontWeight="semibold">{a.accesses.toLocaleString()}</Text></Td>
																<Td isNumeric><Badge colorScheme="teal">{a.uniqueViewers.toLocaleString()}</Badge></Td>
															</Tr>
														))}
													</Tbody>
												</Table>
											</TableContainer>
										</Box>
									)}

									<Text fontSize="sm" fontWeight="bold" color="#9C9C9C" mb={3}>Access Log</Text>
									{albumLogLoading ? (
										<Center py={10}><Spinner color="#F79432" /></Center>
									) : albumLog.length > 0 ? (
										<TableContainer sx={{ "& th": { color: "#9C9C9C", borderColor: "#2a2a2a" }, "& td": { borderColor: "#2a2a2a", color: "white" } }}>
											<Table variant="simple" size="sm">
												<Thead><Tr><Th>Album</Th><Th>Name</Th><Th>Email</Th><Th>Action</Th><Th>Date</Th></Tr></Thead>
												<Tbody>
													{albumLog.map((r) => (
														<Tr key={r._id} _hover={{ bg: "#262626" }}>
															<Td><Text fontSize="sm">{r.albumTitle}</Text></Td>
															<Td><Text fontSize="sm">{r.name}</Text></Td>
															<Td><Text fontSize="sm">{r.email}</Text></Td>
															<Td><Badge colorScheme={r.action === "signup" ? "green" : "blue"}>{r.action === "signup" ? "Signup" : "Login"}</Badge></Td>
															<Td><Text fontSize="sm" color="#9C9C9C">{new Date(r.date).toLocaleString()}</Text></Td>
														</Tr>
													))}
												</Tbody>
											</Table>
										</TableContainer>
									) : (
										<Text color="#9C9C9C" fontSize="sm">No album access recorded for this event yet.</Text>
									)}

									{/* Interests captured in the album access dialog — for event planning */}
									<Box mt={8}>
										<Text fontSize="xl" fontWeight="bold" color="white">Viewer Interests</Text>
										<Text fontSize="sm" color="#9C9C9C" mb={4}>What album viewers said they want next — collected at the access dialog.</Text>

										{albumLogLoading ? (
											<Center py={10}><Spinner color="#F79432" /></Center>
										) : interestRows.length > 0 ? (
											<>
												{topInterests.length > 0 && (
													<Box mb={6}>
														<Text fontSize="sm" fontWeight="bold" color="#9C9C9C" mb={3}>Most Wanted</Text>
														<Flex wrap="wrap" gap={2}>
															{topInterests.map((t) => (
																<Flex key={t.interest} align="center" gap={2} bg="#1a1a1a" border="1px solid #2a2a2a" borderRadius="full" pl={3} pr={2} py={1}>
																	<Text fontSize="sm" color="white">{t.interest}</Text>
																	<Badge bg="#F79432" color="black" borderRadius="full" px={2}>{t.count}</Badge>
																</Flex>
															))}
														</Flex>
													</Box>
												)}

												<Text fontSize="sm" fontWeight="bold" color="#9C9C9C" mb={3}>Per Viewer</Text>
												<TableContainer sx={{ "& th": { color: "#9C9C9C", borderColor: "#2a2a2a" }, "& td": { borderColor: "#2a2a2a", color: "white", verticalAlign: "top" } }}>
													<Table variant="simple" size="sm">
														<Thead><Tr><Th>Name</Th><Th>Email</Th><Th>Interests</Th><Th>Their Own</Th><Th>Date</Th></Tr></Thead>
														<Tbody>
															{interestRows.map((r) => (
																<Tr key={r._id} _hover={{ bg: "#262626" }}>
																	<Td><Text fontSize="sm">{r.name}</Text></Td>
																	<Td><Text fontSize="sm">{r.email}</Text></Td>
																	<Td>
																		<Flex wrap="wrap" gap={1}>
																			{r.interests.map((i) => (
																				<Badge key={i} bg="#2a2a2a" color="white" borderRadius="full" px={2} textTransform="none" fontWeight="normal">{i}</Badge>
																			))}
																		</Flex>
																	</Td>
																	<Td>
																		{r.customInterests.length > 0 ? (
																			<Flex wrap="wrap" gap={1}>
																				{r.customInterests.map((c, ci) => (
																					<Badge key={`${c}-${ci}`} bg="#3a2a12" color="#F79432" borderRadius="full" px={2} textTransform="none" fontWeight="normal">{c}</Badge>
																				))}
																			</Flex>
																		) : (
																			<Text fontSize="sm" color="#65676B">—</Text>
																		)}
																	</Td>
																	<Td><Text fontSize="sm" color="#9C9C9C">{new Date(r.date).toLocaleString()}</Text></Td>
																</Tr>
															))}
														</Tbody>
													</Table>
												</TableContainer>
											</>
										) : (
											<Text color="#9C9C9C" fontSize="sm">No interests captured yet.</Text>
										)}
									</Box>
								</TabPanel>
							</TabPanels>
						</Tabs>
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

	const eventId = (context.params?.eventId || context.query.eventId) as string
	if (!eventId) {
		return {
			redirect: {
				destination: "/console/events",
				permanent: false,
			},
		}
	}

	// Ensure database connection is ready
	const { dbconn } = await import("@/configs/database")
	if (dbconn.readyState !== 1) {
		await dbconn.asPromise()
	}

	const event = await Events.findOne({ _id: eventId, isDeleted: false }).select("_id name slug").lean()

	if (!event) {
		return {
			redirect: {
				destination: "/console/events",
				permanent: false,
			},
		}
	}

	return {
		props: {
			event: JSON.stringify(event),
		},
	}
}


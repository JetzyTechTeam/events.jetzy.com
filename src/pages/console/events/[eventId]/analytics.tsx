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
	Badge,
	Button,
	HStack,
	Tabs,
	TabList,
	Tab,
	TabPanels,
	TabPanel,
} from "@chakra-ui/react"
import { FiUsers, FiDollarSign, FiTrendingUp, FiEye, FiShare2, FiArrowLeft, FiImage, FiLogIn, FiUserPlus, FiCheckCircle } from "react-icons/fi"
import MetricsCard from "@/components/analytics/MetricsCard"
import DateRangeSelector from "@/components/analytics/DateRangeSelector"
import { WINDOW_KEYS, WINDOW_LABELS, type WindowKey } from "@/lib/analytics-windows"
import SafeHTML from "@/components/misc/SafeHTML"
import { stripHTMLAndDecode } from "@/lib/utils"

interface FunnelStage { stage: string; label: string; count: number; dropOffPct: number; conversionPct: number }
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
		/** Distinct viewers who proved their email. Absent from responses predating the gate. */
		verifiedViewers?: number
		logins: number
		signups: number
		/**
		 * Landing funnel — see api/analytics/events.ts. All optional: an event whose albums were
		 * only visited before this was recorded has no history, which is not the same as no
		 * traffic, so the UI hides the block rather than showing zeroes.
		 */
		pageVisitors?: number
		pageViews?: number
		gateShown?: number
		codeSent?: number
		identified?: number
		abandoned?: number
		perAlbum: Array<{
			albumId: string
			title: string
			accesses: number
			uniqueViewers: number
			/** People who opened the page, identified or not. Always >= accesses. */
			visitors?: number
			views?: number
		}>
	}
	dateRange: {
		from: string | null
		to: string | null
	}
}

/**
 * Rows of the Performance snapshot, in reading order: how many turned up, how far they got,
 * what it produced, and what happened afterwards. Keys must match the labels
 * /api/analytics/event-windows emits.
 *
 * `hideWhenEmpty` suppresses a row that is zero in every window. An event with no albums, no
 * door and no discussion board would otherwise show three rows of zeroes that look like
 * failures rather than like features it never used.
 */
const SNAPSHOT_ROWS: Array<{ key: string; label: string; hint?: string; money?: boolean; emphasis?: boolean; hideWhenEmpty?: boolean }> = [
	{ key: "Unique Visitors", label: "Visitors", hint: "People who opened the event page" },
	{ key: "Page Views", label: "Page views", hint: "Including repeat visits" },
	{ key: "Ticket Selections", label: "Picked a ticket" },
	{ key: "Checkout Opened", label: "Opened checkout" },
	{ key: "Checkout Submitted", label: "Submitted checkout" },
	{ key: "Bookings Created", label: "Bookings started", hint: "Any status, including pending approval" },
	{ key: "Bookings Confirmed", label: "Bookings confirmed", emphasis: true },
	{ key: "Tickets Booked", label: "Tickets booked", emphasis: true },
	{ key: "Revenue", label: "Ticket revenue", hint: "Excludes membership sales", money: true, emphasis: true },
	{ key: "Check-ins", label: "Checked in at the door", hideWhenEmpty: true },
	{ key: "Shares", label: "Shared the event", hideWhenEmpty: true },
	{ key: "Waiting List Joins", label: "Joined the waiting list", hideWhenEmpty: true },
	{ key: "Discussion Posts", label: "Discussion posts", hideWhenEmpty: true },
	{ key: "Album Visitors", label: "Album visitors", hint: "Opened a photo album from this event", hideWhenEmpty: true },
]

export default function EventAnalyticsPage({ event }: { event: string }) {
	const eventData = JSON.parse(event) as { _id: string; name: string; slug: string }
	const [analyticsData, setAnalyticsData] = useState<EventAnalyticsData | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [dateFrom, setDateFrom] = useState<Date | null>(null)
	const [dateTo, setDateTo] = useState<Date | null>(null)
	const router = useRouter()
	const toast = useToast()

	const [tabIndex, setTabIndex] = useState(0)
	const [albumLog, setAlbumLog] = useState<Array<{ _id: string; albumId: string; albumTitle: string; name: string; email: string; action: string; verified?: boolean; identifiedAt?: string | null; date: string }>>([])
	const [albumLogLoaded, setAlbumLogLoaded] = useState(false)
	const [albumLogLoading, setAlbumLogLoading] = useState(false)
	const [interestRows, setInterestRows] = useState<Array<{ _id: string; name: string; email: string; interests: string[]; customInterests: string[]; optOut?: boolean; verified?: boolean; date: string }>>([])
	const [topInterests, setTopInterests] = useState<Array<{ interest: string; count: number }>>([])
	// Visitor-behaviour data. Used to be a separate "Journey" tab; it is now part of Overview,
	// so it loads with the page rather than on tab change.
	const [behaviourLoading, setBehaviourLoading] = useState(false)
	const [funnel, setFunnel] = useState<FunnelStage[]>([])
	const [topTargets, setTopTargets] = useState<HeatTopTarget[]>([])

	// The CEO's Last 24h / 7 / 30 / 60 day columns, scoped to this event. Deliberately NOT
	// filtered by the date picker — fixed windows are the whole point of the comparison.
	const [windowRows, setWindowRows] = useState<Record<WindowKey, Record<string, number>> | null>(null)
	const [windowsLoading, setWindowsLoading] = useState(true)

	// Raw interaction / CTA / form rows. The "Named Events" tab that used to show them verbatim
	// is gone — the label meant nothing to anyone reading it. The rows still feed the
	// "Most-clicked buttons" and "Form drop-off" panels on Overview, in plain language.
	const [namedEventsLoaded, setNamedEventsLoaded] = useState(false)
	const [namedEventsLoading, setNamedEventsLoading] = useState(false)
	const [namedEventsRows, setNamedEventsRows] = useState<Array<{ category: string; eventName: string; totalEvents: number; uniqueUsers: number }>>([])

	/**
	 * The snapshot as a CSV, one row per metric and one column per window — the shape the CEO
	 * report is read in. Exports the WHOLE table, including rows hidden on screen for being
	 * empty: a zero is information in a spreadsheet being compared against another event.
	 */
	const exportSummaryCSV = () => {
		if (!windowRows) return
		const q = (v: string) => `"${(v || "").replace(/"/g, '""')}"`
		const header = ["Metric", ...WINDOW_KEYS.map((k) => WINDOW_LABELS[k])].join(",")
		const lines = SNAPSHOT_ROWS.map((row) => [q(row.label), ...WINDOW_KEYS.map((k) => windowRows[k]?.[row.key] ?? 0)].join(","))
		const csv = "\ufeff" + [q(stripHTMLAndDecode(eventData.name)), "", header, ...lines].join("\n")
		const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
		const url = URL.createObjectURL(blob)
		const a = document.createElement("a")
		a.href = url
		a.download = `event-snapshot-${stripHTMLAndDecode(eventData.name).slice(0, 30).replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	/**
	 * Form focus/submit rows paired into one line per form.
	 *
	 * named-events returns them as two separate rows named "<form> / focus" and "<form> / submit",
	 * which is what the old table showed verbatim. A host cannot read an abandonment rate off two
	 * rows several lines apart, so they are joined here. A form with submits but no recorded
	 * focus is still listed — dropping it would hide a working form.
	 */
	const formStats = React.useMemo(() => {
		const byForm = new Map<string, { started: number; submitted: number }>()
		for (const row of namedEventsRows) {
			if (row.category !== "Form Events") continue
			const sep = row.eventName.lastIndexOf(" / ")
			if (sep < 0) continue
			const form = row.eventName.slice(0, sep).trim()
			const kind = row.eventName.slice(sep + 3).trim()
			const entry = byForm.get(form) || { started: 0, submitted: 0 }
			if (kind === "focus") entry.started += row.uniqueUsers
			else if (kind === "submit") entry.submitted += row.uniqueUsers
			byForm.set(form, entry)
		}
		return Array.from(byForm.entries())
			.map(([form, v]) => ({
				form,
				started: v.started,
				submitted: v.submitted,
				// Against whichever is larger, so a form whose focus rows predate submit tracking
				// reports 100% rather than an impossible figure above it.
				rate: Math.round((v.submitted / Math.max(1, v.started, v.submitted)) * 100),
			}))
			.sort((a, b) => Math.max(b.started, b.submitted) - Math.max(a.started, a.submitted))
	}, [namedEventsRows])

	/**
	 * Funnel + most-clicked buttons.
	 *
	 * The page-dwell table that used to sit here was permanently empty: dwell.ts scopes an event
	 * by matching `page` against the eventId, but pageviews record `/[slug]`, never an id. The
	 * click heatmap is gone too — a coordinate cloud over an unlabelled grid told a host nothing
	 * they could act on. The named targets below carry the same information legibly.
	 */
	const loadBehaviour = async (from: Date | null = dateFrom, to: Date | null = dateTo) => {
		setBehaviourLoading(true)
		try {
			const params = new URLSearchParams({ eventId: eventData._id })
			if (from) params.append("dateFrom", from.toISOString())
			if (to) params.append("dateTo", to.toISOString())
			const [f, h] = await Promise.all([
				fetch(`/api/analytics/journey/funnel?${params.toString()}`, { credentials: "include" }).then((r) => r.json()),
				fetch(`/api/analytics/journey/heat?${params.toString()}`, { credentials: "include" }).then((r) => r.json()),
			])
			if (f?.status) setFunnel(f.data.funnel || [])
			if (h?.status) setTopTargets(h.data.topTargets || [])
		} catch (e: any) {
			toast({ title: "Couldn't load visitor behaviour", description: e.message, status: "error" })
		} finally {
			setBehaviourLoading(false)
		}
	}

	/** This event's numbers in the same four windows the CEO report uses. */
	const loadWindows = async () => {
		setWindowsLoading(true)
		try {
			const res = await fetch(`/api/analytics/event-windows?eventId=${eventData._id}`, { credentials: "include" })
			const json = await res.json()
			if (json?.status) setWindowRows(json.data.summary || null)
		} catch (e: any) {
			console.error("[Event Analytics] Failed to load summary windows:", e)
		} finally {
			setWindowsLoading(false)
		}
	}

	const loadNamedEvents = async (force = false, from: Date | null = dateFrom, to: Date | null = dateTo) => {
		if (!force && (namedEventsLoaded || namedEventsLoading)) return
		setNamedEventsLoading(true)
		try {
			const params = new URLSearchParams({ eventId: eventData._id })
			if (from) params.append("dateFrom", from.toISOString())
			if (to) params.append("dateTo", to.toISOString())
			const res = await fetch(`/api/analytics/named-events?${params.toString()}`, { credentials: "include" })
			const json = await res.json()
			if (json?.status) setNamedEventsRows(json.data.rows || [])
			setNamedEventsLoaded(true)
		} catch (e: any) {
			console.error("[Event Analytics] Failed to load interaction breakdown:", e)
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
					`Verified Viewers,${a.verifiedViewers ?? 0}`,
					`Logins via Album,${a.logins}`,
					`Signups via Album,${a.signups}`,
					"",
					"Album Page Funnel",
					`Landed on an album,${a.pageVisitors ?? 0}`,
					`Total visits,${a.pageViews ?? 0}`,
					`Asked to identify,${a.gateShown ?? 0}`,
					`Entered their email,${a.codeSent ?? 0}`,
					`Got through,${a.identified ?? 0}`,
					`Left at the dialog,${a.abandoned ?? 0}`,
					"",
					"Per Album,Visitors,Accesses,Unique Viewers",
					...a.perAlbum.map((p) => `"${p.title.replace(/"/g, '""')}",${p.visitors ?? 0},${p.accesses},${p.uniqueViewers}`),
					"",
			  ]
			: []
		const logHeader = "Album,Name,Email,Verified,Action,Signed in/up,Viewed"
		const logLines = albumLog.map(
			(r) =>
				`"${r.albumTitle.replace(/"/g, '""')}","${r.name.replace(/"/g, '""')}","${r.email.replace(/"/g, '""')}",${r.verified ? "Yes" : "No"},${r.action},${r.identifiedAt ? new Date(r.identifiedAt).toISOString() : ""},${new Date(r.date).toISOString()}`,
		)

		const q = (s: string) => `"${(s || "").replace(/"/g, '""')}"`
		const topLines = topInterests.length
			? ["", "Top Interests,Count", ...topInterests.map((t) => `${q(t.interest)},${t.count}`)]
			: []
		const interestLines = interestRows.length
			? [
					"",
					"Interests Log",
					"Name,Email,Verified,Interests,Custom Interest,Opted Out,Date",
					...interestRows.map(
						(r) =>
							`${q(r.name)},${q(r.email)},${r.verified ? "Yes" : "No"},${q(r.interests.join("; "))},${q(r.customInterests.join("; "))},${r.optOut ? "Yes" : "No"},${new Date(r.date).toISOString()}`,
					),
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

	// Albums is the only lazily-loaded tab left; everything else lives on Overview and loads
	// with the page.
	useEffect(() => {
		if (tabIndex === 1) loadAlbumLog()
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
		loadBehaviour(dateFrom, dateTo)
		// The CTA/form panels re-read for the new range.
		setNamedEventsLoaded(false)
		loadNamedEvents(true, dateFrom, dateTo)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [dateFrom, dateTo, eventData._id])

	// Fixed windows — unaffected by the picker, so fetched once.
	useEffect(() => {
		loadWindows()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [eventData._id])

	const handleDateChange = (from: Date | null, to: Date | null) => {
		setDateFrom(from)
		setDateTo(to)
		// Invalidate lazily-loaded album log so it refetches for the new range.
		setAlbumLogLoaded(false)
		if (tabIndex === 1) loadAlbumLog(true, from, to)
	}

	const formatCurrency = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount)
	const formatNumber = (num: number) => new Intl.NumberFormat("en-US").format(num)

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
						<Button leftIcon={<FiArrowLeft />} variant="ghost" size="sm" color="#9C9C9C" _hover={{ bg: "#1a1a1a", color: "white" }} onClick={() => router.back()}>
							Back
						</Button>
						<Box flex={1}>
							<Text fontSize="2xl" fontWeight="bold" color="white">
								Event Analytics
							</Text>
							<Box fontSize="lg" color="#9C9C9C">
								<SafeHTML html={eventData.name} />
							</Box>
						</Box>
					</Flex>

					{/* Date Range Selector */}
					<Box bg="#1a1a1a" border="1px solid #2a2a2a" p={4} borderRadius="lg" mb={6}>
						<DateRangeSelector dark dateFrom={dateFrom} dateTo={dateTo} onDateChange={handleDateChange} />
					</Box>

					{/* Loading State */}
					{isLoading ? (
						<Center py={20}>
							<Spinner size="xl" color="#F79432" />
						</Center>
					) : analyticsData ? (
						<Tabs variant="line" index={tabIndex} onChange={setTabIndex} isLazy>
							<TabList mb={4} borderBottom="2px solid #2a2a2a">
								<Tab color="#9C9C9C" fontWeight="bold" _selected={{ color: "#F79432", borderBottom: "2px solid #F79432" }}>Overview</Tab>
								<Tab color="#9C9C9C" fontWeight="bold" _selected={{ color: "#F79432", borderBottom: "2px solid #F79432" }}>Albums</Tab>
							</TabList>
							<TabPanels>
								<TabPanel px={0}>

									{/* Performance snapshot.
									    The same four windows the CEO already reads in the Daily Users Overview
									    email, for this one event. Fixed windows on purpose: the date picker
									    above changes everything BELOW this block, never this block, or the
									    columns stop being comparable to the email. */}
									<Box mb={8} bg="#1a1a1a" border="1px solid #2a2a2a" borderRadius="lg" overflow="hidden">
										<Flex justify="space-between" align="center" px={5} py={4} borderBottom="1px solid #2a2a2a" wrap="wrap" gap={3}>
											<Box>
												<Text fontSize="lg" fontWeight="bold" color="white">Performance snapshot</Text>
												<Text fontSize="xs" color="#65676B">Fixed windows, always up to now &mdash; not affected by the dates above.</Text>
											</Box>
											{windowRows && (
												<Button size="sm" onClick={exportSummaryCSV} bg="#F79432" color="black" _hover={{ bg: "#E68422" }} borderRadius="full" px={4}>
													Export CSV
												</Button>
											)}
										</Flex>

										{windowsLoading ? (
											<Center py={12}><Spinner color="#F79432" /></Center>
										) : !windowRows ? (
											<Box px={5} py={6}><Text color="#9C9C9C" fontSize="sm">Snapshot unavailable right now.</Text></Box>
										) : (
											<TableContainer>
												<Table variant="simple" size="sm" sx={{ "& th": { color: "#9C9C9C", borderColor: "#2a2a2a" }, "& td": { borderColor: "#2a2a2a", color: "white" } }}>
													<Thead>
														<Tr>
															<Th>Metric</Th>
															{WINDOW_KEYS.map((k) => (
																<Th key={k} isNumeric>{WINDOW_LABELS[k]}</Th>
															))}
														</Tr>
													</Thead>
													<Tbody>
														{SNAPSHOT_ROWS.map((row) => {
															// A metric with nothing in any window is hidden rather than shown as
															// four zeroes. Album Visitors on an event with no albums, or check-ins
															// on one that never ran a door, would otherwise read as a failure
															// instead of as "not applicable here".
															const values = WINDOW_KEYS.map((k) => windowRows[k]?.[row.key] ?? 0)
															if (row.hideWhenEmpty && values.every((v) => !v)) return null
															return (
																<Tr key={row.key} _hover={{ bg: "#262626" }}>
																	<Td>
																		<Text fontSize="sm" fontWeight={row.emphasis ? "bold" : "normal"}>{row.label}</Text>
																		{row.hint && <Text fontSize="xs" color="#65676B">{row.hint}</Text>}
																	</Td>
																	{values.map((v, idx) => (
																		<Td key={idx} isNumeric>
																			<Text fontSize="sm" fontWeight={row.emphasis ? "bold" : "normal"} color={row.emphasis && v > 0 ? "#48BB78" : "white"}>
																				{row.money ? formatCurrency(v) : formatNumber(v)}
																			</Text>
																		</Td>
																	))}
																</Tr>
															)
														})}
													</Tbody>
												</Table>
											</TableContainer>
										)}
									</Box>

									{/* Headline numbers.
									    These follow the date picker. Dark tiles: this panel used to render
									    white cards inside a dark console, which is why it was the one tab
									    nobody could read. */}
									<Box mb={8}>
										<Text fontSize="lg" fontWeight="bold" color="white" mb={1}>Headline numbers</Text>
										<Text fontSize="xs" color="#65676B" mb={4}>{dateFrom || dateTo ? "For the dates selected above." : "All time."}</Text>
										<SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4}>
											<MetricsCard dark title="Page Views" value={formatNumber(analyticsData.summary.views)} icon={FiEye} subtitle={`${formatNumber(analyticsData.summary.uniqueViewers)} unique visitors`} />
											<MetricsCard dark title="Bookings" value={formatNumber(analyticsData.summary.bookings)} icon={FiUsers} subtitle={`${formatNumber(analyticsData.summary.tickets.sold)} tickets`} />
											<MetricsCard dark title="Revenue" value={formatCurrency(analyticsData.summary.revenue.total)} icon={FiDollarSign} subtitle={analyticsData.summary.revenue.discounts > 0 ? `${formatCurrency(analyticsData.summary.revenue.net)} after discounts` : "Ticket revenue"} />
											<MetricsCard dark title="Checked In" value={formatNumber(analyticsData.summary.tickets.checkedIn)} icon={FiCheckCircle} subtitle={`${analyticsData.summary.tickets.checkInRate.toFixed(0)}% of tickets sold`} />
										</SimpleGrid>
										<SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4} mt={4}>
											<MetricsCard dark title="Avg per Booking" value={formatCurrency(analyticsData.summary.revenue.averagePerBooking)} icon={FiTrendingUp} />
											<MetricsCard dark title="Discounts Given" value={formatCurrency(analyticsData.summary.revenue.discounts)} icon={FiDollarSign} />
											<MetricsCard dark title="Visitors Who Booked" value={`${analyticsData.summary.conversionRates.viewToBooking.toFixed(1)}%`} icon={FiTrendingUp} />
											<MetricsCard dark title="Shares" value={formatNumber(analyticsData.summary.interactions.shares)} icon={FiShare2} />
										</SimpleGrid>
									</Box>

									{/* Checkout funnel.
									    Every stage is a distinct-session count (see journey/funnel.ts), so the
									    drop-off between two bars is a real comparison. "Picked a ticket" and the
									    two checkout stages were dead until the writers were added to
									    EventTicketsComponent / EventCheckoutModel, so an event with no traffic
									    since then still shows zeroes there. The note below says so rather than
									    leaving it as a silent mystery. */}
									<Box mb={8} bg="#1a1a1a" border="1px solid #2a2a2a" borderRadius="lg" p={5}>
										<Text fontSize="lg" fontWeight="bold" color="white" mb={1}>From visit to booking</Text>
										<Text fontSize="xs" color="#65676B" mb={5}>How many people reached each step. Each person counted once.</Text>

										{behaviourLoading ? (
											<Center py={10}><Spinner color="#F79432" /></Center>
										) : funnel.length === 0 || funnel[0].count === 0 ? (
											<Text color="#9C9C9C" fontSize="sm">Nobody has opened this event page in the selected period.</Text>
										) : (
											<>
												{funnel.map((stage, i) => {
													const top = funnel[0]?.count || 1
													const w = stage.count === 0 ? 0 : Math.max(3, (stage.count / top) * 100)
													const lost = i > 0 ? funnel[i - 1].count - stage.count : 0
													return (
														<Box key={stage.stage} mb={i === funnel.length - 1 ? 0 : 5}>
															<Flex justify="space-between" align="baseline" mb={2} wrap="wrap" gap={2}>
																<Text fontSize="sm" color="white" fontWeight="semibold">{stage.label}</Text>
																<HStack spacing={3}>
																	<Text fontSize="lg" color="white" fontWeight="bold" lineHeight="1">{formatNumber(stage.count)}</Text>
																	<Text fontSize="xs" color="#9C9C9C">{stage.conversionPct}% of visitors</Text>
																</HStack>
															</Flex>
															<Box h="10px" bg="#2a2a2a" borderRadius="full" overflow="hidden">
																<Box h="100%" w={`${w}%`} bg={i === funnel.length - 1 ? "#48BB78" : "#F79432"} borderRadius="full" />
															</Box>
															{i > 0 && lost > 0 && (
																<Text fontSize="xs" color="#E9A23B" mt={1}>
																	{formatNumber(lost)} stopped here ({stage.dropOffPct}% of the previous step)
																</Text>
															)}
														</Box>
													)
												})}
												{/* The three middle stages are written by the browser; "Booked" is counted
												    from booking records, which go back to the beginning. So an event can
												    legitimately show 4 views, three empty steps, and 1 booking — which reads
												    as broken unless it is explained. Checked by STAGE NAME, not by slicing an
												    index range, so adding a stage later can't silently mis-target it. */}
												{["ticket_select", "booking_start", "checkout_submit"].every((k) => (funnel.find((st) => st.stage === k)?.count ?? 0) === 0) && (
													<Text fontSize="xs" color="#65676B" mt={5}>
														The middle steps are only recorded for visits made since checkout tracking was added, so older traffic appears as views and bookings with nothing in between.
													</Text>
												)}
											</>
										)}
									</Box>

									<SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6} mb={8}>
										{/* What people actually clicked. Replaces the coordinate heatmap, which
										    showed where on an unlabelled canvas clicks landed and therefore told
										    a host nothing they could change. */}
										<Box bg="#1a1a1a" border="1px solid #2a2a2a" borderRadius="lg" p={5}>
											<Text fontSize="lg" fontWeight="bold" color="white" mb={1}>Most-clicked buttons</Text>
											<Text fontSize="xs" color="#65676B" mb={4}>Repeated clicks flag a control people expected to do something.</Text>
											{behaviourLoading ? (
												<Center py={8}><Spinner color="#F79432" size="sm" /></Center>
											) : topTargets.length === 0 ? (
												<Text color="#9C9C9C" fontSize="sm">No button clicks recorded yet.</Text>
											) : (
												<Box>
													{topTargets.slice(0, 8).map((t, idx) => {
														const top = topTargets[0]?.count || 1
														return (
															<Box key={idx} mb={idx === Math.min(7, topTargets.length - 1) ? 0 : 3}>
																<Flex justify="space-between" align="baseline" mb={1} gap={3}>
																	<Text fontSize="sm" color="white" noOfLines={1}>{t.dataTrack || t.text || "Unlabelled"}</Text>
																	<HStack spacing={2} flexShrink={0}>
																		{t.rageCount > 0 && <Badge colorScheme="red" fontSize="10px">{t.rageCount} frustrated</Badge>}
																		<Text fontSize="sm" color="#9C9C9C" fontWeight="semibold">{formatNumber(t.count)}</Text>
																	</HStack>
																</Flex>
																<Box h="6px" bg="#2a2a2a" borderRadius="full" overflow="hidden">
																	<Box h="100%" w={`${Math.max(3, (t.count / top) * 100)}%`} bg="#F79432" borderRadius="full" />
																</Box>
															</Box>
														)
													})}
												</Box>
											)}
										</Box>

										{/* Form drop-off, paired from the raw focus/submit rows the old "Named
										    Events" table listed one line at a time. */}
										<Box bg="#1a1a1a" border="1px solid #2a2a2a" borderRadius="lg" p={5}>
											<Text fontSize="lg" fontWeight="bold" color="white" mb={1}>Form drop-off</Text>
											<Text fontSize="xs" color="#65676B" mb={4}>Started filling a form versus actually sending it.</Text>
											{namedEventsLoading ? (
												<Center py={8}><Spinner color="#F79432" size="sm" /></Center>
											) : formStats.length === 0 ? (
												<Text color="#9C9C9C" fontSize="sm">No form activity recorded yet.</Text>
											) : (
												<TableContainer sx={{ "& th": { color: "#9C9C9C", borderColor: "#2a2a2a" }, "& td": { borderColor: "#2a2a2a", color: "white" } }}>
													<Table variant="simple" size="sm">
														<Thead><Tr><Th>Form</Th><Th isNumeric>Started</Th><Th isNumeric>Sent</Th><Th isNumeric>Completed</Th></Tr></Thead>
														<Tbody>
															{formStats.map((f) => (
																<Tr key={f.form} _hover={{ bg: "#262626" }}>
																	<Td><Text fontSize="sm" noOfLines={1}>{f.form}</Text></Td>
																	<Td isNumeric>{formatNumber(f.started)}</Td>
																	<Td isNumeric>{formatNumber(f.submitted)}</Td>
																	<Td isNumeric>
																		<Badge colorScheme={f.rate >= 50 ? "green" : f.rate >= 20 ? "yellow" : "red"}>{f.rate}%</Badge>
																	</Td>
																</Tr>
															))}
														</Tbody>
													</Table>
												</TableContainer>
											)}
										</Box>
									</SimpleGrid>

									{/* Traffic sources */}
									{analyticsData.trafficSources.referrers.length > 0 && (
										<Box bg="#1a1a1a" border="1px solid #2a2a2a" borderRadius="lg" p={5} mb={8}>
											<Text fontSize="lg" fontWeight="bold" color="white" mb={1}>Where visitors came from</Text>
											<Text fontSize="xs" color="#65676B" mb={4}>
												{formatNumber(analyticsData.trafficSources.directTraffic.pageViews)} arrived directly ({analyticsData.trafficSources.directTraffic.percentage.toFixed(0)}%) &mdash; typed the link, or followed one from an email or a message.
											</Text>
											<TableContainer sx={{ "& th": { color: "#9C9C9C", borderColor: "#2a2a2a" }, "& td": { borderColor: "#2a2a2a", color: "white" } }}>
												<Table variant="simple" size="sm">
													<Thead>
														<Tr>
															<Th>Source</Th>
															<Th>Type</Th>
															<Th isNumeric>Visits</Th>
															<Th isNumeric>People</Th>
															<Th isNumeric>Share</Th>
														</Tr>
													</Thead>
													<Tbody>
														{analyticsData.trafficSources.referrers.map((ref, idx) => (
															<Tr key={idx} _hover={{ bg: "#262626" }}>
																<Td><Text fontSize="sm" isTruncated maxW="300px">{ref.domain}</Text></Td>
																<Td>
																	<Badge colorScheme={ref.category === "search_engine" ? "blue" : ref.category === "social_media" ? "purple" : ref.category === "email" ? "orange" : "gray"} size="sm">
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
										<Box bg="#1a1a1a" border="1px solid #2a2a2a" borderRadius="lg" p={5} mb={6}>
											<Text fontSize="lg" fontWeight="bold" color="white" mb={4}>What they viewed it on</Text>
											<TableContainer sx={{ "& th": { color: "#9C9C9C", borderColor: "#2a2a2a" }, "& td": { borderColor: "#2a2a2a", color: "white" } }}>
												<Table variant="simple" size="sm">
													<Thead>
														<Tr>
															<Th>Device</Th>
															<Th isNumeric>Visits</Th>
															<Th isNumeric>People</Th>
															<Th isNumeric>Share</Th>
														</Tr>
													</Thead>
													<Tbody>
														{analyticsData.devices.map((device, idx) => (
															<Tr key={idx} _hover={{ bg: "#262626" }}>
																<Td><Badge colorScheme="blue" textTransform="capitalize">{device.deviceType}</Badge></Td>
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

									{/* The gate funnel.
									    Every tile and table below this counts people who got THROUGH
									    the name+email dialog. This is the only place that counts the
									    ones who turned up and left at it — usually the bigger number,
									    and the one worth acting on. Hidden entirely when there is no
									    history, since zeroes here would read as no traffic. */}
									{analyticsData.albums && (analyticsData.albums.pageVisitors ?? 0) > 0 && (
										<Box mb={6} bg="#1a1a1a" border="1px solid #2a2a2a" borderRadius="lg" p={4}>
											<Flex align="center" justify="space-between" mb={3} wrap="wrap" gap={2}>
												<Text fontSize="sm" fontWeight="bold" color="#9C9C9C">Album Page Funnel</Text>
												<Text fontSize="xs" color="#65676B">
													{formatNumber(analyticsData.albums.pageViews ?? 0)} visits from {formatNumber(analyticsData.albums.pageVisitors ?? 0)} people
												</Text>
											</Flex>
											<SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
												{[
													{ label: "Landed on an album", value: analyticsData.albums.pageVisitors ?? 0, tone: "white" },
													{ label: "Asked to identify", value: analyticsData.albums.gateShown ?? 0, tone: "white" },
													{ label: "Entered their email", value: analyticsData.albums.codeSent ?? 0, tone: "white" },
													{ label: "Got through", value: analyticsData.albums.identified ?? 0, tone: "#48BB78" },
												].map((t) => (
													<Box key={t.label}>
														<Text fontSize="xs" color="#9C9C9C" fontWeight="bold" mb={1}>{t.label}</Text>
														<Text fontSize="2xl" fontWeight="bold" color={t.tone}>{formatNumber(t.value)}</Text>
														<Text fontSize="xs" color="#65676B">
															{Math.round((t.value / (analyticsData.albums?.pageVisitors || 1)) * 100)}% of visitors
														</Text>
													</Box>
												))}
											</SimpleGrid>
											{(analyticsData.albums.abandoned ?? 0) > 0 && (
												<Text fontSize="xs" color="#E9A23B" mt={3}>
													{formatNumber(analyticsData.albums.abandoned ?? 0)} saw the name &amp; email dialog and left without completing it.
												</Text>
											)}
										</Box>
									)}

									{analyticsData.albums && (
										<SimpleGrid columns={{ base: 2, md: 5 }} spacing={4} mb={6}>
											{[
												{ label: "Album Viewers", value: analyticsData.albums.uniqueViewers, icon: FiEye, sub: `${formatNumber(analyticsData.albums.totalAccesses)} accesses` },
												// Viewers who passed the emailed code. Anyone who arrived before that gate
												// existed counts as unverified, not as a failure.
												{ label: "Verified Viewers", value: analyticsData.albums.verifiedViewers ?? 0, icon: FiCheckCircle, sub: undefined as string | undefined },
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
													<Thead><Tr><Th>Album</Th><Th isNumeric>Visitors</Th><Th isNumeric>Accesses</Th><Th isNumeric>Unique Viewers</Th></Tr></Thead>
													<Tbody>
														{analyticsData.albums.perAlbum.map((a) => (
															<Tr key={a.albumId} _hover={{ bg: "#262626" }}>
																<Td><Text fontSize="sm">{a.title}</Text></Td>
																{/* Everyone who opened the page, identified or not — always
																    >= Accesses, which only counts those who got through. */}
																<Td isNumeric><Text color="#9C9C9C">{(a.visitors ?? 0).toLocaleString()}</Text></Td>
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
												<Thead><Tr><Th>Album</Th><Th>Name</Th><Th>Email</Th><Th>Verified</Th><Th>Action</Th><Th>Signed in/up</Th><Th>Viewed</Th></Tr></Thead>
												<Tbody>
													{albumLog.map((r) => (
														<Tr key={r._id} _hover={{ bg: "#262626" }}>
															<Td><Text fontSize="sm">{r.albumTitle}</Text></Td>
															<Td><Text fontSize="sm">{r.name}</Text></Td>
															<Td><Text fontSize="sm">{r.email}</Text></Td>
															<Td><Badge colorScheme={r.verified ? "green" : "gray"}>{r.verified ? "Verified" : "Unverified"}</Badge></Td>
															<Td><Badge colorScheme={r.action === "signup" ? "green" : "blue"}>{r.action === "signup" ? "Signup" : "Login"}</Badge></Td>
															{/* When they identified themselves — a session carries no such moment, and a
															    pre-gate cookie never recorded one, so both show a dash. */}
															<Td><Text fontSize="sm" color="#9C9C9C">{r.identifiedAt ? new Date(r.identifiedAt).toLocaleString() : "—"}</Text></Td>
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
														<Thead><Tr><Th>Name</Th><Th>Email</Th><Th>Verified</Th><Th>Interests</Th><Th>Their Own</Th><Th>Date</Th></Tr></Thead>
														<Tbody>
															{interestRows.map((r) => (
																<Tr key={r._id} _hover={{ bg: "#262626" }}>
																	<Td><Text fontSize="sm">{r.name}</Text></Td>
																	<Td><Text fontSize="sm">{r.email}</Text></Td>
																	<Td><Badge colorScheme={r.verified ? "green" : "gray"}>{r.verified ? "Verified" : "Unverified"}</Badge></Td>
																	<Td>
																		<Flex wrap="wrap" gap={1}>
																			{r.optOut && (
																				<Badge bg="#4a1f1f" color="#ff9a9a" borderRadius="full" px={2} textTransform="none" fontWeight="normal">Opted out</Badge>
																			)}
																			{r.interests.map((i) => (
																				<Badge key={i} bg="#2a2a2a" color="white" borderRadius="full" px={2} textTransform="none" fontWeight="normal">{i}</Badge>
																			))}
																			{!r.optOut && r.interests.length === 0 && <Text fontSize="sm" color="#65676B">—</Text>}
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
							<Text color="#9C9C9C">No analytics recorded for this event yet.</Text>
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


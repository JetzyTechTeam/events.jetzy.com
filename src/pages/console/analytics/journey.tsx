import ConsoleLayout from "@Jetzy/components/layout/ConsoleLayout"
import { adminOnly } from "@Jetzy/lib/authSession"
import { Pages } from "@Jetzy/types"
import { GetServerSideProps } from "next"
import Head from "next/head"
import NextLink from "next/link"
import React, { useState, useEffect, useCallback } from "react"
import {
	Box,
	Flex,
	Text,
	SimpleGrid,
	useToast,
	Spinner,
	Center,
	Tabs,
	TabList,
	TabPanels,
	Tab,
	TabPanel,
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
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalBody,
	ModalCloseButton,
	useDisclosure,
	Input,
	Select,
} from "@chakra-ui/react"
import MetricsCard from "@/components/analytics/MetricsCard"
import DateRangeSelector from "@/components/analytics/DateRangeSelector"
import SessionTimeline, { TimelineStep } from "@/components/analytics/SessionTimeline"
import ClickHeatmap from "@/components/analytics/ClickHeatmap"

interface SessionRow {
	sessionId: string
	userId: string | null
	userEmail: string | null
	userName: string | null
	anonId: string | null
	isLoggedIn: boolean
	entryPage: string
	exitPage: string | null
	deviceType: string | null
	startTime: string
	duration: number | null
	pageCount: number
	clickCount: number
}

interface GuestsData {
	totals: {
		guest: { sessions: number; uniqueVisitors: number; avgDurationSec: number; avgPages: number }
		auth: { sessions: number; uniqueUsers: number; avgDurationSec: number; avgPages: number }
	}
	guestToAuthConversionPct: number
	topGuests: Array<{ anonId: string; sessions: number; firstSeen: string; lastSeen: string }>
	topEntryPages: Array<{ page: string; count: number }>
}

interface FunnelStage {
	stage: string
	label: string
	count: number
	dropOffPct: number
	conversionPct: number
}

export default function JourneyAnalyticsPage() {
	const toast = useToast()
	const [dateFrom, setDateFrom] = useState<Date | null>(null)
	const [dateTo, setDateTo] = useState<Date | null>(null)
	const [tab, setTab] = useState(0)

	const [sessions, setSessions] = useState<SessionRow[]>([])
	const [sessionsPage, setSessionsPage] = useState(1)
	const [totalPages, setTotalPages] = useState(1)
	const [loginFilter, setLoginFilter] = useState<"" | "true" | "false">("")
	const [sessionsLoading, setSessionsLoading] = useState(false)

	const [guests, setGuests] = useState<GuestsData | null>(null)
	const [guestsLoading, setGuestsLoading] = useState(false)

	const [funnel, setFunnel] = useState<FunnelStage[]>([])
	const [funnelLoading, setFunnelLoading] = useState(false)

	const [heatPoints, setHeatPoints] = useState<any[]>([])
	const [heatPage, setHeatPage] = useState("")
	const [heatLoading, setHeatLoading] = useState(false)

	const { isOpen, onOpen, onClose } = useDisclosure()
	const [timeline, setTimeline] = useState<TimelineStep[]>([])
	const [timelineLoading, setTimelineLoading] = useState(false)
	const [sessionMeta, setSessionMeta] = useState<any>(null)

	const params = useCallback(() => {
		const p = new URLSearchParams()
		if (dateFrom) p.set("dateFrom", dateFrom.toISOString())
		if (dateTo) p.set("dateTo", dateTo.toISOString())
		return p
	}, [dateFrom, dateTo])

	const loadSessions = useCallback(async () => {
		setSessionsLoading(true)
		try {
			const p = params()
			p.set("page", String(sessionsPage))
			p.set("limit", "20")
			if (loginFilter) p.set("isLoggedIn", loginFilter)
			const r = await fetch(`/api/analytics/journey/sessions?${p.toString()}`, { credentials: "include" })
			const j = await r.json()
			if (j?.status && j?.data) {
				setSessions(j.data.sessions)
				setTotalPages(j.data.totalPages || 1)
			}
		} catch (e: any) {
			toast({ title: "Failed to load sessions", description: e.message, status: "error" })
		} finally {
			setSessionsLoading(false)
		}
	}, [params, sessionsPage, loginFilter, toast])

	const loadGuests = useCallback(async () => {
		setGuestsLoading(true)
		try {
			const r = await fetch(`/api/analytics/journey/guests?${params().toString()}`, { credentials: "include" })
			const j = await r.json()
			if (j?.status) setGuests(j.data)
		} catch (e: any) {
			toast({ title: "Failed to load guests", description: e.message, status: "error" })
		} finally {
			setGuestsLoading(false)
		}
	}, [params, toast])

	const loadFunnel = useCallback(async () => {
		setFunnelLoading(true)
		try {
			const r = await fetch(`/api/analytics/journey/funnel?${params().toString()}`, { credentials: "include" })
			const j = await r.json()
			if (j?.status) setFunnel(j.data.funnel)
		} catch (e: any) {
			toast({ title: "Failed to load funnel", description: e.message, status: "error" })
		} finally {
			setFunnelLoading(false)
		}
	}, [params, toast])

	const loadHeat = useCallback(async () => {
		setHeatLoading(true)
		try {
			const p = params()
			if (heatPage) p.set("page", heatPage)
			const r = await fetch(`/api/analytics/journey/heat?${p.toString()}`, { credentials: "include" })
			const j = await r.json()
			if (j?.status) setHeatPoints(j.data.clicks || [])
		} catch (e: any) {
			toast({ title: "Failed to load heatmap", description: e.message, status: "error" })
		} finally {
			setHeatLoading(false)
		}
	}, [params, heatPage, toast])

	useEffect(() => { if (tab === 0) loadSessions() }, [tab, sessionsPage, loginFilter, dateFrom, dateTo, loadSessions])
	useEffect(() => { if (tab === 1) loadGuests() }, [tab, dateFrom, dateTo, loadGuests])
	useEffect(() => { if (tab === 2) loadHeat() }, [tab, heatPage, dateFrom, dateTo, loadHeat])
	useEffect(() => { if (tab === 3) loadFunnel() }, [tab, dateFrom, dateTo, loadFunnel])

	const openTimeline = async (sessionId: string) => {
		setTimelineLoading(true)
		setTimeline([])
		setSessionMeta(null)
		onOpen()
		try {
			const r = await fetch(`/api/analytics/journey/session/${sessionId}`, { credentials: "include" })
			const j = await r.json()
			if (j?.status) {
				setTimeline(j.data.steps || [])
				setSessionMeta(j.data.session)
			}
		} catch (e: any) {
			toast({ title: "Failed to load timeline", description: e.message, status: "error" })
		} finally {
			setTimelineLoading(false)
		}
	}

	const handleDateChange = (from: Date | null, to: Date | null) => {
		setDateFrom(from)
		setDateTo(to)
		setSessionsPage(1)
	}

	const fmtDuration = (s: number | null) => {
		if (!s) return "—"
		if (s < 60) return `${s}s`
		const m = Math.floor(s / 60)
		const r = s % 60
		return `${m}m ${r}s`
	}

	return (
		<>
			<Head>
				<title>Journey Analytics — Console</title>
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout page={Pages.Analytics} maxW="100%" backBtn="/console/analytics">
				<Box maxW="1400px" mx="auto" px={{ base: 4, md: 0 }} py={6}>
					<Flex bg="#1a1a1a" color="white" p={4} borderRadius="lg" border="1px solid" borderColor="#2a2a2a" mb={6} justify="space-between" align="center" gap={4} wrap="wrap">
						<DateRangeSelector dark dateFrom={dateFrom} dateTo={dateTo} onDateChange={handleDateChange} />
						<HStack spacing={3}>
							<NextLink href="/console/analytics/qr-signups" passHref legacyBehavior>
								<Button as="a" variant="outline" borderColor="#F79432" color="#F79432" _hover={{ bg: "#2a2a2a" }} size="sm">QR Signups</Button>
							</NextLink>
							<Text fontSize="sm" color="#9C9C9C">User Journey Analytics</Text>
						</HStack>
					</Flex>

					<Tabs variant="line" index={tab} onChange={setTab}>
						<TabList borderBottom="2px solid #2a2a2a">
							<Tab color="#9C9C9C" fontWeight="bold" _selected={{ color: "#F79432", borderBottom: "2px solid #F79432" }}>Sessions</Tab>
							<Tab color="#9C9C9C" fontWeight="bold" _selected={{ color: "#F79432", borderBottom: "2px solid #F79432" }}>Guests vs Auth</Tab>
							<Tab color="#9C9C9C" fontWeight="bold" _selected={{ color: "#F79432", borderBottom: "2px solid #F79432" }}>Click Heatmap</Tab>
							<Tab color="#9C9C9C" fontWeight="bold" _selected={{ color: "#F79432", borderBottom: "2px solid #F79432" }}>Funnels</Tab>
						</TabList>
						<TabPanels>
							<TabPanel px={0}>
								<HStack mb={4} spacing={4}>
									<Select size="sm" maxW="200px" bg="#1a1a1a" color="white" borderColor="#2a2a2a" value={loginFilter} onChange={(e) => { setLoginFilter(e.target.value as any); setSessionsPage(1) }}>
										<option value="" style={{ background: "#1a1a1a" }}>All sessions</option>
										<option value="true" style={{ background: "#1a1a1a" }}>Logged in</option>
										<option value="false" style={{ background: "#1a1a1a" }}>Guest only</option>
									</Select>
								</HStack>
								{sessionsLoading ? (
									<Center py={10}><Spinner color="#F79432" /></Center>
								) : (
									<>
										<TableContainer bg="#1a1a1a" borderRadius="lg" border="1px solid" borderColor="#2a2a2a">
											<Table size="sm">
												<Thead>
													<Tr>
														<Th color="#9C9C9C" borderColor="#2a2a2a">User</Th>
														<Th color="#9C9C9C" borderColor="#2a2a2a">Entry → Exit</Th>
														<Th color="#9C9C9C" borderColor="#2a2a2a">Device</Th>
														<Th color="#9C9C9C" borderColor="#2a2a2a" isNumeric>Pages</Th>
														<Th color="#9C9C9C" borderColor="#2a2a2a" isNumeric>Clicks</Th>
														<Th color="#9C9C9C" borderColor="#2a2a2a" isNumeric>Duration</Th>
														<Th color="#9C9C9C" borderColor="#2a2a2a">Started</Th>
														<Th borderColor="#2a2a2a"></Th>
													</Tr>
												</Thead>
												<Tbody>
													{sessions.map((s) => (
														<Tr key={s.sessionId} _hover={{ bg: "#262626" }} cursor="pointer" onClick={() => openTimeline(s.sessionId)}>
															<Td borderColor="#2a2a2a">
																{s.isLoggedIn ? (
																	<Box>
																		<Text fontSize="sm" fontWeight="500" color="white">{s.userName || s.userEmail || "—"}</Text>
																		<Text fontSize="xs" color="#9C9C9C">{s.userEmail}</Text>
																	</Box>
																) : (
																	<Badge colorScheme="gray">Guest</Badge>
																)}
															</Td>
															<Td borderColor="#2a2a2a">
																<Text fontSize="xs" color="white" maxW="280px" isTruncated>{s.entryPage}</Text>
																<Text fontSize="xs" color="#9C9C9C" maxW="280px" isTruncated>→ {s.exitPage || "—"}</Text>
															</Td>
															<Td borderColor="#2a2a2a"><Badge colorScheme="purple" fontSize="xs">{s.deviceType || "?"}</Badge></Td>
															<Td color="white" borderColor="#2a2a2a" isNumeric>{s.pageCount}</Td>
															<Td color="white" borderColor="#2a2a2a" isNumeric>{s.clickCount}</Td>
															<Td color="white" borderColor="#2a2a2a" isNumeric>{fmtDuration(s.duration)}</Td>
															<Td borderColor="#2a2a2a"><Text fontSize="xs" color="#9C9C9C">{new Date(s.startTime).toLocaleString()}</Text></Td>
															<Td borderColor="#2a2a2a"><Button size="xs" colorScheme="orange" variant="ghost">View</Button></Td>
														</Tr>
													))}
												</Tbody>
											</Table>
										</TableContainer>
										<HStack mt={4} justify="center">
											<Button size="sm" bg="#1a1a1a" color="white" border="1px solid" borderColor="#2a2a2a" _hover={{ bg: "#262626" }} isDisabled={sessionsPage <= 1} onClick={() => setSessionsPage((p) => p - 1)}>Prev</Button>
											<Text fontSize="sm" color="#9C9C9C">Page {sessionsPage} / {totalPages}</Text>
											<Button size="sm" bg="#1a1a1a" color="white" border="1px solid" borderColor="#2a2a2a" _hover={{ bg: "#262626" }} isDisabled={sessionsPage >= totalPages} onClick={() => setSessionsPage((p) => p + 1)}>Next</Button>
										</HStack>
									</>
								)}
							</TabPanel>

							<TabPanel px={0}>
								{guestsLoading || !guests ? (
									<Center py={10}><Spinner color="#F79432" /></Center>
								) : (
									<>
										<SimpleGrid columns={{ base: 1, md: 4 }} spacing={4} mb={6}>
											<MetricsCard dark title="Guest sessions" value={guests.totals.guest.sessions.toLocaleString()} />
											<MetricsCard dark title="Unique guests" value={guests.totals.guest.uniqueVisitors.toLocaleString()} />
											<MetricsCard dark title="Auth sessions" value={guests.totals.auth.sessions.toLocaleString()} />
											<MetricsCard dark title="Guest → Auth conv." value={`${guests.guestToAuthConversionPct}%`} />
										</SimpleGrid>
										<SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mb={6}>
											<MetricsCard dark title="Avg guest duration" value={`${guests.totals.guest.avgDurationSec}s`} />
											<MetricsCard dark title="Avg guest pages" value={String(guests.totals.guest.avgPages)} />
										</SimpleGrid>
										<Box bg="#1a1a1a" p={4} borderRadius="lg" border="1px solid" borderColor="#2a2a2a">
											<Text fontWeight="600" mb={3} color="white">Top guest entry pages</Text>
											<Table size="sm">
												<Thead><Tr><Th color="#9C9C9C" borderColor="#2a2a2a">Page</Th><Th color="#9C9C9C" borderColor="#2a2a2a" isNumeric>Sessions</Th></Tr></Thead>
												<Tbody>
													{guests.topEntryPages.map((e) => (
														<Tr key={e.page} _hover={{ bg: "#262626" }}><Td borderColor="#2a2a2a"><Text fontSize="xs" color="white">{e.page}</Text></Td><Td color="white" borderColor="#2a2a2a" isNumeric>{e.count}</Td></Tr>
													))}
												</Tbody>
											</Table>
										</Box>
									</>
								)}
							</TabPanel>

							<TabPanel px={0}>
								<HStack mb={4}>
									<Input size="sm" maxW="400px" bg="#1a1a1a" color="white" borderColor="#2a2a2a" _placeholder={{ color: "#9C9C9C" }} placeholder="Filter by page (e.g. /events/abc123)" value={heatPage} onChange={(e) => setHeatPage(e.target.value)} />
									<Button size="sm" bg="#F79432" color="black" _hover={{ bg: "#E68422" }} onClick={loadHeat}>Apply</Button>
								</HStack>
								{heatLoading ? (
									<Center py={10}><Spinner color="#F79432" /></Center>
								) : (
									<Box bg="#1a1a1a" p={4} borderRadius="lg" border="1px solid" borderColor="#2a2a2a">
										<ClickHeatmap points={heatPoints} />
									</Box>
								)}
							</TabPanel>

							<TabPanel px={0}>
								{funnelLoading ? (
									<Center py={10}><Spinner color="#F79432" /></Center>
								) : (
									<Box bg="#1a1a1a" p={4} borderRadius="lg" border="1px solid" borderColor="#2a2a2a">
										<Text fontWeight="600" mb={4} color="white">Portal funnel (all events)</Text>
										{funnel.map((stage, i) => {
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
										})}
									</Box>
								)}
							</TabPanel>
						</TabPanels>
					</Tabs>
				</Box>
			</ConsoleLayout>

			<Modal isOpen={isOpen} onClose={onClose} size="3xl" scrollBehavior="inside">
				<ModalOverlay />
				<ModalContent bg="#1a1a1a" color="white" border="1px solid" borderColor="#2a2a2a">
					<ModalHeader color="white">
						Session Timeline
						{sessionMeta && (
							<Text fontSize="xs" color="#9C9C9C" mt={1} fontWeight="normal">
								{sessionMeta.isLoggedIn ? sessionMeta.userEmail : `Guest · ${sessionMeta.anonId?.slice(0, 8) || "?"}`} · {sessionMeta.deviceType || "?"} · {new Date(sessionMeta.startTime).toLocaleString()}
							</Text>
						)}
					</ModalHeader>
					<ModalCloseButton color="white" />
					<ModalBody pb={6}>
						{timelineLoading ? (
							<Center py={10}><Spinner color="#F79432" /></Center>
						) : (
							<SessionTimeline steps={timeline} />
						)}
					</ModalBody>
				</ModalContent>
			</Modal>
		</>
	)
}

export const getServerSideProps: GetServerSideProps = async (context) => {
	return await adminOnly(context)
}

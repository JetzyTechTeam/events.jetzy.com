import ConsoleLayout from "@Jetzy/components/layout/ConsoleLayout"
import { adminOnly } from "@Jetzy/lib/authSession"
import { Pages } from "@Jetzy/types"
import { GetServerSideProps } from "next"
import Head from "next/head"
import React, { useState, useEffect, useCallback } from "react"
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
	Input,
	Select,
	Tooltip,
} from "@chakra-ui/react"
import { FiEye, FiUsers, FiUserPlus, FiTrendingUp, FiGift } from "react-icons/fi"
import MetricsCard from "@/components/analytics/MetricsCard"
import DateRangeSelector from "@/components/analytics/DateRangeSelector"

interface FunnelStage {
	stage: string
	label: string
	count: number
	dropOffPct: number
	conversionPct: number
}

interface Totals {
	pageViews: number
	uniqueVisitors: number
	accountsCreated: number
	conversionPct: number
	withRefCode: number
	withLocation: number
	viaSso: number
	viaEmail: number
}

interface SignupRow {
	_id: string
	email: string
	name: string
	location: string
	latitude: number | null
	longitude: number | null
	placeId: string
	refCode: string
	authProvider: string
	isVerified: boolean
	emailBounced: boolean
	isBlocked: boolean
	createdAt: string | null
	signupSource: string
	signupSessionId: string
	isInferred: boolean
}

const dash = (v: any) => (v === null || v === undefined || v === "" ? "—" : v)

export default function QRSignupsPage() {
	const toast = useToast()

	const [dateFrom, setDateFrom] = useState<Date | null>(null)
	const [dateTo, setDateTo] = useState<Date | null>(null)

	const [funnel, setFunnel] = useState<FunnelStage[]>([])
	const [totals, setTotals] = useState<Totals | null>(null)
	const [topLocations, setTopLocations] = useState<Array<{ location: string; count: number }>>([])
	const [funnelLoading, setFunnelLoading] = useState(false)

	const [rows, setRows] = useState<SignupRow[]>([])
	const [total, setTotal] = useState(0)
	const [page, setPage] = useState(1)
	const [rowsLoading, setRowsLoading] = useState(false)
	const limit = 25

	// `search` is the committed value used in queries; `searchInput` is the raw box.
	const [searchInput, setSearchInput] = useState("")
	const [search, setSearch] = useState("")
	const [provider, setProvider] = useState("")
	const [hasRefCode, setHasRefCode] = useState("")
	const [source, setSource] = useState("qr")

	const dateParams = useCallback(() => {
		const p = new URLSearchParams()
		if (dateFrom) p.set("dateFrom", dateFrom.toISOString())
		if (dateTo) p.set("dateTo", dateTo.toISOString())
		return p
	}, [dateFrom, dateTo])

	const listParams = useCallback(() => {
		const p = dateParams()
		p.set("source", source)
		if (search.trim()) p.set("search", search.trim())
		if (provider) p.set("provider", provider)
		if (hasRefCode) p.set("hasRefCode", hasRefCode)
		return p
	}, [dateParams, source, search, provider, hasRefCode])

	const loadFunnel = useCallback(async () => {
		setFunnelLoading(true)
		try {
			const r = await fetch(`/api/analytics/qr-signups/funnel?${dateParams().toString()}`, { credentials: "include" })
			const j = await r.json()
			if (j?.status) {
				setFunnel(j.data.funnel)
				setTotals(j.data.totals)
				setTopLocations(j.data.topLocations || [])
			}
		} catch (e: any) {
			toast({ title: "Failed to load funnel", description: e.message, status: "error" })
		} finally {
			setFunnelLoading(false)
		}
	}, [dateParams, toast])

	const loadRows = useCallback(async () => {
		setRowsLoading(true)
		try {
			const p = listParams()
			p.set("page", String(page))
			p.set("limit", String(limit))
			const r = await fetch(`/api/analytics/qr-signups/list?${p.toString()}`, { credentials: "include" })
			const j = await r.json()
			if (j?.status) {
				setRows(j.data.rows)
				setTotal(j.data.total)
			}
		} catch (e: any) {
			toast({ title: "Failed to load signups", description: e.message, status: "error" })
		} finally {
			setRowsLoading(false)
		}
	}, [listParams, page, toast])

	useEffect(() => {
		loadFunnel()
	}, [loadFunnel])
	useEffect(() => {
		loadRows()
	}, [loadRows])

	const handleDateChange = (from: Date | null, to: Date | null) => {
		setDateFrom(from)
		setDateTo(to)
		setPage(1)
	}

	const applySearch = () => {
		setSearch(searchInput)
		setPage(1)
	}

	const exportCsv = () => {
		const p = listParams()
		p.set("format", "csv")
		window.location.href = `/api/analytics/qr-signups/list?${p.toString()}`
	}

	const totalPages = Math.max(1, Math.ceil(total / limit))

	return (
		<>
			<Head>
				<title>QR Signup Analytics — Console</title>
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout page={Pages.Analytics} maxW="100%" backBtn="/console/analytics">
				<Box maxW="1400px" mx="auto" px={{ base: 4, md: 0 }} py={6}>
					<Flex bg="#1a1a1a" color="white" p={4} borderRadius="lg" border="1px solid" borderColor="#2a2a2a" mb={6} justify="space-between" align="center" gap={4} wrap="wrap">
						<DateRangeSelector dark dateFrom={dateFrom} dateTo={dateTo} onDateChange={handleDateChange} />
						<Text fontSize="sm" color="#9C9C9C">QR Signup Analytics · /jetzyqrsignup</Text>
					</Flex>

					{/* Metric cards */}
					<SimpleGrid columns={{ base: 1, sm: 2, lg: 5 }} spacing={4} mb={6}>
						<MetricsCard dark title="Page Views" value={(totals?.pageViews ?? 0).toLocaleString()} icon={FiEye} iconColor="#F79432" />
						<MetricsCard dark title="Unique Visitors" value={(totals?.uniqueVisitors ?? 0).toLocaleString()} icon={FiUsers} iconColor="#F79432" />
						<MetricsCard dark title="Accounts Created" value={(totals?.accountsCreated ?? 0).toLocaleString()} icon={FiUserPlus} iconColor="#F79432" subtitle={`${totals?.viaEmail ?? 0} email · ${totals?.viaSso ?? 0} social`} />
						<MetricsCard dark title="Conversion" value={`${totals?.conversionPct ?? 0}%`} icon={FiTrendingUp} iconColor="#F79432" subtitle="visitors → accounts" />
						<MetricsCard dark title="With Invite Code" value={(totals?.withRefCode ?? 0).toLocaleString()} icon={FiGift} iconColor="#F79432" />
					</SimpleGrid>

					{/* Funnel */}
					<Box bg="#1a1a1a" p={4} borderRadius="lg" border="1px solid" borderColor="#2a2a2a" mb={6}>
						<Text fontWeight="600" mb={4} color="white">QR signup funnel</Text>
						{funnelLoading ? (
							<Center py={8}><Spinner color="#F79432" /></Center>
						) : (
							<>
								{funnel.map((stage, i) => {
									const maxCount = funnel[0]?.count || 1
									const w = Math.max(8, (stage.count / maxCount) * 100)
									return (
										<Box key={stage.stage} mb={3}>
											<Flex justify="space-between" mb={1}>
												<Text fontSize="sm" color="white">{stage.label}</Text>
												<Text fontSize="sm" color="#9C9C9C">
													{stage.count.toLocaleString()} · {stage.conversionPct}%{i > 0 ? ` · drop ${stage.dropOffPct}%` : ""}
												</Text>
											</Flex>
											<Box h="24px" bg="#2a2a2a" borderRadius="md" overflow="hidden">
												<Box h="100%" w={`${w}%`} bg="#F79432" />
											</Box>
										</Box>
									)
								})}
								<Text fontSize="xs" color="#9C9C9C" mt={4} lineHeight="1.6">
									Form stages only cover sessions after journey tracking shipped, and &quot;Submitted form&quot; fires for the email form only — Google/Apple
									buttons sit outside the &lt;form&gt;, so social signups land straight on &quot;Account created&quot;. Read the middle drop-offs with that in mind.
								</Text>
								{topLocations.length > 0 && (
									<Box mt={4} pt={4} borderTop="1px solid" borderColor="#2a2a2a">
										<Text fontSize="xs" color="#9C9C9C" fontWeight="600" textTransform="uppercase" mb={2}>Top locations</Text>
										<HStack spacing={2} wrap="wrap">
											{topLocations.map((l) => (
												<Badge key={l.location} bg="#2a2a2a" color="white" px={2} py={1} borderRadius="md" fontWeight="normal">
													{l.location} · {l.count}
												</Badge>
											))}
										</HStack>
									</Box>
								)}
							</>
						)}
					</Box>

					{/* Filters */}
					<HStack mb={4} spacing={3} wrap="wrap">
						<Input
							size="sm"
							maxW="280px"
							bg="#1a1a1a"
							color="white"
							borderColor="#2a2a2a"
							_placeholder={{ color: "#9C9C9C" }}
							placeholder="Search email, name, location, code"
							value={searchInput}
							onChange={(e) => setSearchInput(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && applySearch()}
						/>
						<Button size="sm" bg="#2a2a2a" color="white" _hover={{ bg: "#333" }} onClick={applySearch}>Search</Button>
						<Select size="sm" maxW="180px" bg="#1a1a1a" color="white" borderColor="#2a2a2a" value={source} onChange={(e) => { setSource(e.target.value); setPage(1) }}>
							<option value="qr" style={{ background: "#1a1a1a" }}>QR signups only</option>
							<option value="all" style={{ background: "#1a1a1a" }}>All signups</option>
						</Select>
						<Select size="sm" maxW="170px" bg="#1a1a1a" color="white" borderColor="#2a2a2a" value={provider} onChange={(e) => { setProvider(e.target.value); setPage(1) }}>
							<option value="" style={{ background: "#1a1a1a" }}>Any provider</option>
							<option value="credentials" style={{ background: "#1a1a1a" }}>Email</option>
							<option value="firebase" style={{ background: "#1a1a1a" }}>Google / Apple</option>
						</Select>
						<Select size="sm" maxW="180px" bg="#1a1a1a" color="white" borderColor="#2a2a2a" value={hasRefCode} onChange={(e) => { setHasRefCode(e.target.value); setPage(1) }}>
							<option value="" style={{ background: "#1a1a1a" }}>Invite code: any</option>
							<option value="true" style={{ background: "#1a1a1a" }}>Has invite code</option>
							<option value="false" style={{ background: "#1a1a1a" }}>No invite code</option>
						</Select>
						<Button size="sm" bg="#F79432" color="black" _hover={{ bg: "#E68422" }} onClick={exportCsv}>Export CSV</Button>
					</HStack>

					{/* Signups table */}
					{rowsLoading ? (
						<Center py={10}><Spinner color="#F79432" /></Center>
					) : (
						<>
							<TableContainer bg="#1a1a1a" borderRadius="lg" border="1px solid" borderColor="#2a2a2a">
								<Table size="sm">
									<Thead>
										<Tr>
											<Th color="#9C9C9C" borderColor="#2a2a2a">Signed Up</Th>
											<Th color="#9C9C9C" borderColor="#2a2a2a">Email</Th>
											<Th color="#9C9C9C" borderColor="#2a2a2a">Name</Th>
											<Th color="#9C9C9C" borderColor="#2a2a2a">Location</Th>
											<Th color="#9C9C9C" borderColor="#2a2a2a">Coords</Th>
											<Th color="#9C9C9C" borderColor="#2a2a2a">Invite Code</Th>
											<Th color="#9C9C9C" borderColor="#2a2a2a">Provider</Th>
											<Th color="#9C9C9C" borderColor="#2a2a2a">Source</Th>
											<Th color="#9C9C9C" borderColor="#2a2a2a">Status</Th>
										</Tr>
									</Thead>
									<Tbody>
										{rows.map((r) => (
											<Tr key={r._id}>
												<Td color="white" borderColor="#2a2a2a" whiteSpace="nowrap">{r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}</Td>
												<Td color="white" borderColor="#2a2a2a">{r.email}</Td>
												<Td color="white" borderColor="#2a2a2a">{dash(r.name)}</Td>
												<Td color="white" borderColor="#2a2a2a" maxW="260px" whiteSpace="normal">
													{r.placeId ? (
														<Tooltip label={`Place ID: ${r.placeId}`} hasArrow>
															<span>{dash(r.location)}</span>
														</Tooltip>
													) : (
														dash(r.location)
													)}
												</Td>
												<Td color="#9C9C9C" borderColor="#2a2a2a" whiteSpace="nowrap">
													{r.latitude !== null && r.longitude !== null ? `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}` : "—"}
												</Td>
												<Td color="white" borderColor="#2a2a2a">{dash(r.refCode)}</Td>
												<Td color="white" borderColor="#2a2a2a">{r.authProvider === "firebase" ? "Social" : "Email"}</Td>
												<Td borderColor="#2a2a2a">
													<Badge colorScheme={r.signupSource === "unknown" ? "gray" : r.isInferred ? "yellow" : "orange"}>
														{r.signupSource === "unknown" ? "Unknown" : r.isInferred ? "QR (inferred)" : "QR"}
													</Badge>
												</Td>
												<Td borderColor="#2a2a2a">
													<HStack spacing={1}>
														{r.isBlocked && <Badge colorScheme="red">Blocked</Badge>}
														{r.emailBounced && <Badge colorScheme="red">Bounced</Badge>}
														{!r.isBlocked && !r.emailBounced && <Badge colorScheme={r.isVerified ? "green" : "gray"}>{r.isVerified ? "Verified" : "Unverified"}</Badge>}
													</HStack>
												</Td>
											</Tr>
										))}
										{rows.length === 0 && (
											<Tr>
												<Td colSpan={9} borderColor="#2a2a2a">
													<Center py={8}><Text color="#9C9C9C" fontSize="sm">No signups match these filters.</Text></Center>
												</Td>
											</Tr>
										)}
									</Tbody>
								</Table>
							</TableContainer>

							<Flex justify="space-between" align="center" mt={4}>
								<Text fontSize="sm" color="#9C9C9C">{total.toLocaleString()} signup{total === 1 ? "" : "s"}</Text>
								<HStack>
									<Button size="sm" bg="#1a1a1a" color="white" borderColor="#2a2a2a" border="1px solid" _hover={{ bg: "#262626" }} isDisabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
									<Text fontSize="sm" color="#9C9C9C">{page} / {totalPages}</Text>
									<Button size="sm" bg="#1a1a1a" color="white" borderColor="#2a2a2a" border="1px solid" _hover={{ bg: "#262626" }} isDisabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
								</HStack>
							</Flex>
						</>
					)}
				</Box>
			</ConsoleLayout>
		</>
	)
}

export const getServerSideProps: GetServerSideProps = async (context) => {
	return await adminOnly(context)
}

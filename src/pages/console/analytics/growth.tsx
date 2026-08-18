import ConsoleLayout from "@Jetzy/components/layout/ConsoleLayout"
import { adminOnly } from "@Jetzy/lib/authSession"
import { Pages } from "@Jetzy/types"
import { GetServerSideProps } from "next"
import Head from "next/head"
import React from "react"
import {
	Box,
	Flex,
	Text,
	SimpleGrid,
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
	Tabs,
	TabList,
	TabPanels,
	Tab,
	TabPanel,
	useToast,
} from "@chakra-ui/react"
import { FiUsers, FiTag, FiGift, FiCreditCard, FiTrendingUp } from "react-icons/fi"
import MetricsCard from "@/components/analytics/MetricsCard"
import ReferralPerformance from "@/components/analytics/ReferralPerformance"
import DateRangeSelector from "@/components/analytics/DateRangeSelector"

/**
 * Referral and membership reporting — the "where did these people come from" page.
 *
 * Two questions that get asked together and are answered from different places, so they live in
 * one page with two tabs rather than two pages nobody remembers exist:
 *
 *   - Referral codes: read from BOOKINGS. Every booking stores the code it was bought with, so
 *     this survives a code being edited, switched off or deleted — which `usageCount` on the
 *     code record does not.
 *   - Memberships: read from `membership_purchases`, one row per sale, which is the only place
 *     that knows whether someone bought from /subscribe or got membership with a ticket, and
 *     which invite code they redeemed.
 *
 * Admin only — both tabs list customers by email.
 */

type MembershipRow = {
	_id: string
	membership: string
	source: string
	email: string
	name: string
	interval: string
	amount: number | null
	inviteCode: string
	referralCode: string
	trialMonths: number
	trialEndsAt: string | null
	event: string
	bookingRef: string
	boughtAt: string | null
}

const money = (n: number | null | undefined) => `$${Number(n || 0).toFixed(2)}`
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—")

const SOURCE_LABELS: Record<string, string> = {
	subscribe: "Bought directly",
	ticket: "With a ticket",
	gift: "Free months from a code",
	external: "Sold elsewhere",
}

const SOURCE_COLORS: Record<string, string> = {
	subscribe: "green",
	ticket: "blue",
	gift: "yellow",
	external: "gray",
}

export default function GrowthAnalytics() {
	const toast = useToast()
	const [dateFrom, setDateFrom] = React.useState<Date | null>(null)
	const [dateTo, setDateTo] = React.useState<Date | null>(null)

	// ---- membership tab ----
	const [memLoading, setMemLoading] = React.useState(true)
	const [memRows, setMemRows] = React.useState<MembershipRow[]>([])
	const [memTotal, setMemTotal] = React.useState(0)
	const [bySource, setBySource] = React.useState<Record<string, number>>({})
	const [inviteCodes, setInviteCodes] = React.useState<Array<{ code: string; redemptions: number; members: number }>>([])
	const [source, setSource] = React.useState("")
	const [hasInviteCode, setHasInviteCode] = React.useState("")
	const [search, setSearch] = React.useState("")
	const [searchInput, setSearchInput] = React.useState("")
	const [page, setPage] = React.useState(1)
	const limit = 25

	const dateParams = React.useCallback(() => {
		const p = new URLSearchParams()
		if (dateFrom) p.set("dateFrom", dateFrom.toISOString().slice(0, 10))
		if (dateTo) p.set("dateTo", dateTo.toISOString().slice(0, 10))
		return p
	}, [dateFrom, dateTo])

	const memParams = React.useCallback(() => {
		const p = dateParams()
		if (source) p.set("source", source)
		if (hasInviteCode) p.set("hasInviteCode", hasInviteCode)
		if (search.trim()) p.set("search", search.trim())
		return p
	}, [dateParams, source, hasInviteCode, search])

	React.useEffect(() => {
		let cancelled = false
		setMemLoading(true)
		const p = memParams()
		p.set("page", String(page))
		p.set("limit", String(limit))
		fetch(`/api/analytics/memberships?${p.toString()}`)
			.then((r) => r.json())
			.then((data) => {
				if (cancelled) return
				setMemRows(data?.data?.rows || [])
				setMemTotal(data?.data?.total || 0)
				setBySource(data?.data?.bySource || {})
				setInviteCodes(data?.data?.inviteCodes || [])
			})
			.catch(() => toast({ title: "Couldn't load the membership report", status: "error", duration: 3000 }))
			.finally(() => !cancelled && setMemLoading(false))
		return () => {
			cancelled = true
		}
	}, [memParams, page, toast])

	const totalMembers = Object.values(bySource).reduce((sum, n) => sum + n, 0)
	const inviteRedemptions = inviteCodes.reduce((sum, c) => sum + c.redemptions, 0)
	const totalPages = Math.max(1, Math.ceil(memTotal / limit))

	return (
		<>
			<Head>
				<title>Referrals &amp; Memberships — Console</title>
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout page={Pages.Analytics} maxW="100%" backBtn="/console/analytics">
				<Box maxW="1400px" mx="auto" px={{ base: 4, md: 0 }} py={6}>
					<Flex bg="#1a1a1a" color="white" p={4} borderRadius="lg" border="1px solid" borderColor="#2a2a2a" mb={6} justify="space-between" align="center" gap={4} wrap="wrap">
						<DateRangeSelector dark dateFrom={dateFrom} dateTo={dateTo} onDateChange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1) }} />
						<Text fontSize="sm" color="#9C9C9C">Referral codes &amp; membership sales</Text>
					</Flex>

					<Tabs variant="soft-rounded" colorScheme="orange">
						<TabList mb={4}>
							<Tab color="#9C9C9C" _selected={{ bg: "#F79432", color: "black" }}>Referral codes</Tab>
							<Tab color="#9C9C9C" _selected={{ bg: "#F79432", color: "black" }}>Jetzy Premium</Tab>
						</TabList>

						<TabPanels>
							{/* ------------------------------- Referral codes ------------------------------- */}
							<TabPanel px={0}>
								{/* The same component the event's own Referrals tab renders. One report, two
								    scopes — a host looking at their event and an admin looking at everything
								    must never be shown different arithmetic. */}
								<ReferralPerformance dateFrom={dateFrom} dateTo={dateTo} />
							</TabPanel>

							{/* -------------------------------- Memberships -------------------------------- */}
							<TabPanel px={0}>
								<SimpleGrid columns={{ base: 1, sm: 2, lg: 5 }} spacing={4} mb={6}>
									<MetricsCard dark title="Memberships sold" value={totalMembers.toLocaleString()} icon={FiUsers} iconColor="#F5C518" />
									<MetricsCard dark title="Bought directly" value={(bySource.subscribe || 0).toLocaleString()} icon={FiCreditCard} iconColor="#F5C518" subtitle="/subscribe or the paywall" />
									<MetricsCard dark title="With a ticket" value={(bySource.ticket || 0).toLocaleString()} icon={FiTag} iconColor="#F5C518" />
									<MetricsCard dark title="Given free months" value={(bySource.gift || 0).toLocaleString()} icon={FiGift} iconColor="#F5C518" subtitle="Referral code on a bundled ticket" />
									<MetricsCard dark title="Invite codes redeemed" value={inviteRedemptions.toLocaleString()} icon={FiGift} iconColor="#F5C518" subtitle={`${inviteCodes.length} code${inviteCodes.length === 1 ? "" : "s"}`} />
								</SimpleGrid>

								{inviteCodes.length > 0 && (
									<Box bg="#1a1a1a" border="1px solid #2a2a2a" borderRadius="lg" p={4} mb={6}>
										<Text color="white" fontWeight={700} mb={3}>Invite codes</Text>
										<HStack spacing={3} wrap="wrap">
											{inviteCodes.map((c) => (
												<Box key={c.code} bg="#101010" border="1px solid #2a2a2a" borderRadius="md" px={4} py={3}>
													<Text color="#F5C518" fontFamily="mono" fontWeight={700}>{c.code}</Text>
													<Text color="#9C9C9C" fontSize="xs">{c.redemptions} redemption{c.redemptions === 1 ? "" : "s"} · {c.members} member{c.members === 1 ? "" : "s"}</Text>
												</Box>
											))}
										</HStack>
									</Box>
								)}

								<Box bg="#1a1a1a" border="1px solid #2a2a2a" borderRadius="lg" p={4}>
									<Flex justify="space-between" align="center" mb={3} gap={3} wrap="wrap">
										<HStack spacing={2} wrap="wrap">
											<Select size="sm" bg="#101010" color="white" borderColor="#2a2a2a" w="200px" value={source} onChange={(e) => { setSource(e.target.value); setPage(1) }}>
												<option value="">Every source</option>
												<option value="subscribe">Bought directly</option>
												<option value="ticket">With a ticket</option>
												<option value="gift">Free months from a code</option>
												<option value="external">Sold elsewhere</option>
											</Select>
											<Select size="sm" bg="#101010" color="white" borderColor="#2a2a2a" w="190px" value={hasInviteCode} onChange={(e) => { setHasInviteCode(e.target.value); setPage(1) }}>
												<option value="">With or without a code</option>
												<option value="true">Used an invite code</option>
												<option value="false">No invite code</option>
											</Select>
											<Input
												size="sm"
												bg="#101010"
												color="white"
												borderColor="#2a2a2a"
												w="240px"
												placeholder="Email, name or code"
												value={searchInput}
												onChange={(e) => setSearchInput(e.target.value)}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														setSearch(searchInput)
														setPage(1)
													}
												}}
											/>
										</HStack>
										<Button
											size="sm"
											bg="#F79432"
											color="black"
											_hover={{ bg: "#E68422" }}
											onClick={() => {
												const p = memParams()
												p.set("format", "csv")
												window.location.href = `/api/analytics/memberships?${p.toString()}`
											}}
										>
											Export CSV
										</Button>
									</Flex>

									{memLoading ? (
										<Center py={10}><Spinner color="#F79432" /></Center>
									) : memRows.length === 0 ? (
										<Text color="#9C9C9C" py={6}>
											No membership sales recorded for these filters. Sales made before this report existed aren&apos;t
											included — Stripe holds no record of our codes or events, so there was nothing to backfill from.
										</Text>
									) : (
										<>
											<TableContainer>
												<Table size="sm" variant="simple">
													<Thead>
														<Tr>
															<Th color="#9C9C9C">Bought</Th>
															<Th color="#9C9C9C">Member</Th>
															<Th color="#9C9C9C">How</Th>
															<Th color="#9C9C9C">Plan</Th>
															<Th color="#9C9C9C">Invite code</Th>
															<Th color="#9C9C9C">Free until</Th>
															<Th color="#9C9C9C">Event / booking</Th>
														</Tr>
													</Thead>
													<Tbody>
														{memRows.map((r) => (
															<Tr key={r._id}>
																<Td color="#9C9C9C" fontSize="xs">{day(r.boughtAt)}</Td>
																<Td color="white">
																	{r.name || "—"}
																	<Text color="#9C9C9C" fontSize="xs">{r.email}</Text>
																</Td>
																<Td>
																	<Badge colorScheme={SOURCE_COLORS[r.source] || "gray"}>{SOURCE_LABELS[r.source] || r.source}</Badge>
																</Td>
																<Td color="#D6D6D6">{r.amount != null ? `${money(r.amount)}/${r.interval || "month"}` : r.interval || "—"}</Td>
																<Td color="#F5C518" fontFamily="mono" fontSize="xs">{r.inviteCode || r.referralCode || "—"}</Td>
																<Td color="#9C9C9C" fontSize="xs">{r.trialMonths ? `${day(r.trialEndsAt)} (${r.trialMonths} mo)` : "—"}</Td>
																<Td color="#9C9C9C" fontSize="xs">
																	{r.event || "—"}
																	{r.bookingRef ? <Text fontSize="xs" fontFamily="mono">{r.bookingRef}</Text> : null}
																</Td>
															</Tr>
														))}
													</Tbody>
												</Table>
											</TableContainer>

											<Flex justify="space-between" align="center" mt={4}>
												<Text fontSize="sm" color="#9C9C9C">{memTotal.toLocaleString()} sale{memTotal === 1 ? "" : "s"}</Text>
												<HStack>
													<Button size="sm" bg="#1a1a1a" color="white" border="1px solid" borderColor="#2a2a2a" _hover={{ bg: "#262626" }} isDisabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
													<Text fontSize="sm" color="#9C9C9C">{page} / {totalPages}</Text>
													<Button size="sm" bg="#1a1a1a" color="white" border="1px solid" borderColor="#2a2a2a" _hover={{ bg: "#262626" }} isDisabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
												</HStack>
											</Flex>
										</>
									)}
								</Box>
							</TabPanel>
						</TabPanels>
					</Tabs>
				</Box>

			</ConsoleLayout>
		</>
	)
}

export const getServerSideProps: GetServerSideProps = async (context) => {
	return await adminOnly(context)
}

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
import { FiUsers, FiTag, FiGift, FiCreditCard, FiTrendingUp, FiEye, FiShoppingCart } from "react-icons/fi"
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

type FunnelStage = { opens: number; checkoutStarted: number; purchased: number }
/** `modal` is the navbar's "Buy Jetzy Premium" dialog — a door onto the same purchase, no URL. */
type FunnelPages = { premium: FunnelStage; subscribe: FunnelStage; modal: FunnelStage }
type ReferralLinkRow = { code: string; eventId: string; event: string; opens: number; checkoutStarted: number; purchased: number }

type SignupTrialRow = {
	_id: string
	email: string
	name: string
	code: string
	signupSource: string
	signedUpAt: string | null
	verified: boolean
	granted: boolean
	grantedAt: string | null
	trialMonths: number
	trialEndsAt: string | null
}

const money = (n: number | null | undefined) => `$${Number(n || 0).toFixed(2)}`
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—")

const SOURCE_LABELS: Record<string, string> = {
	subscribe: "Bought directly",
	ticket: "With a ticket",
	gift: "Free months from a code",
	signup: "Invite code at signup",
	external: "Sold elsewhere",
}

const SOURCE_COLORS: Record<string, string> = {
	subscribe: "green",
	ticket: "blue",
	gift: "yellow",
	signup: "purple",
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

	// ---- signup invite codes tab ----
	const [sgLoading, setSgLoading] = React.useState(true)
	const [sgRows, setSgRows] = React.useState<SignupTrialRow[]>([])
	const [sgTotal, setSgTotal] = React.useState(0)
	const [sgSummary, setSgSummary] = React.useState<{ typed: number; verified: number; granted: number; pending: number } | null>(null)
	const [sgStatus, setSgStatus] = React.useState("")
	const [sgSearch, setSgSearch] = React.useState("")
	const [sgSearchInput, setSgSearchInput] = React.useState("")
	const [sgPage, setSgPage] = React.useState(1)

	const sgParams = React.useCallback(() => {
		const p = dateParams()
		if (sgStatus) p.set("status", sgStatus)
		if (sgSearch.trim()) p.set("search", sgSearch.trim())
		return p
	}, [dateParams, sgStatus, sgSearch])

	React.useEffect(() => {
		let cancelled = false
		setSgLoading(true)
		const p = sgParams()
		p.set("page", String(sgPage))
		p.set("limit", String(limit))
		fetch(`/api/analytics/signup-trials?${p.toString()}`)
			.then((r) => r.json())
			.then((data) => {
				if (cancelled) return
				setSgRows(data?.data?.rows || [])
				setSgTotal(data?.data?.total || 0)
				setSgSummary(data?.data?.summary || null)
			})
			.catch(() => toast({ title: "Couldn't load the signup invite report", status: "error", duration: 3000 }))
			.finally(() => !cancelled && setSgLoading(false))
		return () => {
			cancelled = true
		}
	}, [sgParams, sgPage, toast])

	// ---- page funnel tab: opened vs. bought ----
	const EMPTY_STAGE: FunnelStage = { opens: 0, checkoutStarted: 0, purchased: 0 }
	const EMPTY_PAGES: FunnelPages = { premium: EMPTY_STAGE, subscribe: EMPTY_STAGE, modal: EMPTY_STAGE }
	const [pfLoading, setPfLoading] = React.useState(true)
	const [pfByPage, setPfByPage] = React.useState<FunnelPages>(EMPTY_PAGES)
	// Opens that did NOT come from a host's share link. The share-link rows are a SUBSET of the
	// page totals — a referral link is `/premium` — so showing both without this column reported
	// the same visitors twice with no way to tell which was which.
	const [pfDirectByPage, setPfDirectByPage] = React.useState<FunnelPages>(EMPTY_PAGES)
	const [pfReferralByPage, setPfReferralByPage] = React.useState<FunnelPages>(EMPTY_PAGES)
	const [pfLinks, setPfLinks] = React.useState<ReferralLinkRow[]>([])

	React.useEffect(() => {
		let cancelled = false
		setPfLoading(true)
		fetch(`/api/analytics/premium-funnel?${dateParams().toString()}`)
			.then((r) => r.json())
			.then((data) => {
				if (cancelled) return
				setPfByPage(data?.data?.byPage || EMPTY_PAGES)
				setPfDirectByPage(data?.data?.directByPage || EMPTY_PAGES)
				setPfReferralByPage(data?.data?.referralByPage || EMPTY_PAGES)
				setPfLinks(data?.data?.byReferralLink || [])
			})
			.catch(() => toast({ title: "Couldn't load the page funnel report", status: "error", duration: 3000 }))
			.finally(() => !cancelled && setPfLoading(false))
		return () => {
			cancelled = true
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [dateFrom, dateTo, toast])

	const pfSum = (pick: (s: FunnelStage) => number) => pick(pfByPage.premium) + pick(pfByPage.subscribe) + pick(pfByPage.modal)
	const pfTotalOpens = pfSum((s) => s.opens)
	const pfTotalCheckout = pfSum((s) => s.checkoutStarted)
	const pfTotalPurchased = pfSum((s) => s.purchased)
	const pfReferralOpens = pfReferralByPage.premium.opens + pfReferralByPage.subscribe.opens + pfReferralByPage.modal.opens
	const pfReferralPurchased = pfReferralByPage.premium.purchased + pfReferralByPage.subscribe.purchased + pfReferralByPage.modal.purchased
	const pfConversion = (stage: FunnelStage) => (stage.opens > 0 ? `${((stage.purchased / stage.opens) * 100).toFixed(1)}%` : "—")

	const totalMembers = Object.values(bySource).reduce((sum, n) => sum + n, 0)
	const inviteRedemptions = inviteCodes.reduce((sum, c) => sum + c.redemptions, 0)
	const totalPages = Math.max(1, Math.ceil(memTotal / limit))
	const sgTotalPages = Math.max(1, Math.ceil(sgTotal / limit))

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
							<Tab color="#9C9C9C" _selected={{ bg: "#F79432", color: "black" }}>Signup invite codes</Tab>
							<Tab color="#9C9C9C" _selected={{ bg: "#F79432", color: "black" }}>Page funnel</Tab>
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
									<MetricsCard
										dark
										title="Given free months"
										value={((bySource.gift || 0) + (bySource.signup || 0)).toLocaleString()}
										icon={FiGift}
										iconColor="#F5C518"
										subtitle={`${bySource.signup || 0} at signup · ${bySource.gift || 0} with a ticket`}
									/>
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
											<option value="signup">Invite code at signup</option>
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
							{/* ---------------------------- Signup invite codes ---------------------------- */}
							<TabPanel px={0}>
								{/* Read from the SIGNUP side, not from the sales record: someone who typed the
								    code and never opened their verification email has no membership, and they
								    are exactly who a campaign report has to show. The gap between "typed" and
								    "granted" is the number worth acting on. */}
								<SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4} mb={6}>
									<MetricsCard dark title="Typed a code" value={(sgSummary?.typed ?? 0).toLocaleString()} icon={FiGift} iconColor="#A78BFA" />
									<MetricsCard dark title="Verified their email" value={(sgSummary?.verified ?? 0).toLocaleString()} icon={FiUsers} iconColor="#A78BFA" />
									<MetricsCard dark title="Membership granted" value={(sgSummary?.granted ?? 0).toLocaleString()} icon={FiCreditCard} iconColor="#A78BFA" subtitle="Free months actually created" />
									<MetricsCard dark title="Not redeemed" value={(sgSummary?.pending ?? 0).toLocaleString()} icon={FiTrendingUp} iconColor="#A78BFA" subtitle="Typed it, never finished" />
								</SimpleGrid>

								<Box bg="#1a1a1a" border="1px solid #2a2a2a" borderRadius="lg" p={4}>
									<Flex justify="space-between" align="center" mb={3} gap={3} wrap="wrap">
										<HStack spacing={2} wrap="wrap">
											<Select size="sm" bg="#101010" color="white" borderColor="#2a2a2a" w="200px" value={sgStatus} onChange={(e) => { setSgStatus(e.target.value); setSgPage(1) }}>
												<option value="">Everyone</option>
												<option value="verified">Verified their email</option>
												<option value="unverified">Not verified yet</option>
											</Select>
											<Input
												size="sm"
												bg="#101010"
												color="white"
												borderColor="#2a2a2a"
												w="240px"
												placeholder="Name or email"
												value={sgSearchInput}
												onChange={(e) => setSgSearchInput(e.target.value)}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														setSgSearch(sgSearchInput)
														setSgPage(1)
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
												const p = sgParams()
												p.set("format", "csv")
												window.location.href = `/api/analytics/signup-trials?${p.toString()}`
											}}
										>
											Export CSV
										</Button>
									</Flex>

									{sgLoading ? (
										<Center py={10}><Spinner color="#F79432" /></Center>
									) : sgRows.length === 0 ? (
										<Text color="#9C9C9C" py={6}>Nobody has signed up with a membership invite code in this period.</Text>
									) : (
										<>
											<TableContainer>
												<Table size="sm" variant="simple">
													<Thead>
														<Tr>
															<Th color="#9C9C9C">Signed up</Th>
															<Th color="#9C9C9C">Person</Th>
															<Th color="#9C9C9C">Code</Th>
															<Th color="#9C9C9C">Route</Th>
															<Th color="#9C9C9C">Verified</Th>
															<Th color="#9C9C9C">Membership</Th>
															<Th color="#9C9C9C">Free until</Th>
														</Tr>
													</Thead>
													<Tbody>
														{sgRows.map((r) => (
															<Tr key={r._id}>
																<Td color="#9C9C9C" fontSize="xs">{day(r.signedUpAt)}</Td>
																<Td color="white">
																	{r.name || "—"}
																	<Text color="#9C9C9C" fontSize="xs">{r.email}</Text>
																</Td>
																<Td color="#F5C518" fontFamily="mono" fontSize="xs">{r.code}</Td>
																<Td color="#9C9C9C" fontSize="xs">{r.signupSource === "jetzyqrsignup" ? "QR signup" : "/signup"}</Td>
																<Td>
																	<Badge colorScheme={r.verified ? "green" : "gray"}>{r.verified ? "yes" : "not yet"}</Badge>
																</Td>
																<Td>
																	{/* Granted, or still sitting behind an unopened email. */}
																	<Badge colorScheme={r.granted ? "purple" : "orange"}>
																		{r.granted ? `${r.trialMonths || 0} mo granted` : "not redeemed"}
																	</Badge>
																</Td>
																<Td color="#9C9C9C" fontSize="xs">{r.granted ? day(r.trialEndsAt) : "—"}</Td>
															</Tr>
														))}
													</Tbody>
												</Table>
											</TableContainer>

											<Flex justify="space-between" align="center" mt={4}>
												<Text fontSize="sm" color="#9C9C9C">{sgTotal.toLocaleString()} signup{sgTotal === 1 ? "" : "s"}</Text>
												<HStack>
													<Button size="sm" bg="#1a1a1a" color="white" border="1px solid" borderColor="#2a2a2a" _hover={{ bg: "#262626" }} isDisabled={sgPage <= 1} onClick={() => setSgPage((p) => p - 1)}>Prev</Button>
													<Text fontSize="sm" color="#9C9C9C">{sgPage} / {sgTotalPages}</Text>
													<Button size="sm" bg="#1a1a1a" color="white" border="1px solid" borderColor="#2a2a2a" _hover={{ bg: "#262626" }} isDisabled={sgPage >= sgTotalPages} onClick={() => setSgPage((p) => p + 1)}>Next</Button>
												</HStack>
											</Flex>
										</>
									)}
								</Box>
							</TabPanel>

							{/* ------------------------------- Page funnel ------------------------------- */}
							<TabPanel px={0}>
								{/* Reads `premium_page_views`, written on every /premium and /subscribe load and
								    checkout attempt, closed out by the Stripe webhook when a sale confirms. Rows
								    from before this shipped don't exist — same as every other funnel here. */}
								<SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4} mb={6}>
									<MetricsCard dark title="Opened the offer" value={pfTotalOpens.toLocaleString()} icon={FiEye} iconColor="#60A5FA" subtitle="/premium + /subscribe + Buy Premium button" />
									<MetricsCard dark title="Started checkout" value={pfTotalCheckout.toLocaleString()} icon={FiShoppingCart} iconColor="#60A5FA" />
									<MetricsCard dark title="Purchased" value={pfTotalPurchased.toLocaleString()} icon={FiCreditCard} iconColor="#60A5FA" />
									<MetricsCard
										dark
										title="Opened via a referral link"
										value={pfReferralOpens.toLocaleString()}
										icon={FiGift}
										iconColor="#60A5FA"
										subtitle={`${pfReferralPurchased.toLocaleString()} bought — included in the total on the left`}
									/>
								</SimpleGrid>

								<Box bg="#1a1a1a" border="1px solid #2a2a2a" borderRadius="lg" p={4} mb={6}>
									<Text color="white" fontWeight={700} mb={1}>By door</Text>
									{/* A referral share link IS `/premium`, so its opens are part of that row's total.
									    Split out here, or the same visitor is counted once in this table and again in
									    the share-link table below with nothing saying they are the same person. */}
									<Text color="#9C9C9C" fontSize="sm" mb={3}>
										Direct + Via referral link = Opened. The share-link table below breaks the last column down by code.
										The <Text as="span" color="#D6D6D6">Buy Jetzy Premium</Text> button had no funnel row until this report gained one, so it counts from then on — not from the first click ever made on it.
									</Text>
									{pfLoading ? (
										<Center py={10}><Spinner color="#F79432" /></Center>
									) : (
										<TableContainer>
											<Table size="sm" variant="simple">
												<Thead>
													<Tr>
														<Th color="#9C9C9C">Door</Th>
														<Th color="#9C9C9C" isNumeric>Opened</Th>
														<Th color="#9C9C9C" isNumeric>Direct</Th>
														<Th color="#9C9C9C" isNumeric>Via referral link</Th>
														<Th color="#9C9C9C" isNumeric>Started checkout</Th>
														<Th color="#9C9C9C" isNumeric>Purchased</Th>
														<Th color="#9C9C9C" isNumeric>Conversion</Th>
													</Tr>
												</Thead>
												<Tbody>
													{([
														{ key: "premium" as const, label: "/premium" },
														{ key: "subscribe" as const, label: "/subscribe" },
														{ key: "modal" as const, label: "Buy Jetzy Premium button" },
													]).map(({ key, label }) => (
														<Tr key={key}>
															<Td color="white">{label}</Td>
															<Td color="#D6D6D6" isNumeric>{pfByPage[key].opens.toLocaleString()}</Td>
															<Td color="#D6D6D6" isNumeric>{pfDirectByPage[key].opens.toLocaleString()}</Td>
															<Td color="#D6D6D6" isNumeric>{pfReferralByPage[key].opens.toLocaleString()}</Td>
															<Td color="#D6D6D6" isNumeric>{pfByPage[key].checkoutStarted.toLocaleString()}</Td>
															<Td color="#D6D6D6" isNumeric>{pfByPage[key].purchased.toLocaleString()}</Td>
															<Td color="#F5C518" isNumeric>{pfConversion(pfByPage[key])}</Td>
														</Tr>
													))}
												</Tbody>
											</Table>
										</TableContainer>
									)}
								</Box>

								<Box bg="#1a1a1a" border="1px solid #2a2a2a" borderRadius="lg" p={4}>
									<Flex justify="space-between" align="center" mb={3} gap={3} wrap="wrap">
										<Text color="white" fontWeight={700}>Referral share links</Text>
										<Button
											size="sm"
											bg="#F79432"
											color="black"
											_hover={{ bg: "#E68422" }}
											onClick={() => {
												const p = dateParams()
												p.set("format", "csv")
												window.location.href = `/api/analytics/premium-funnel?${p.toString()}`
											}}
										>
											Export CSV
										</Button>
									</Flex>
									<Text color="#9C9C9C" fontSize="sm" mb={3}>
										Each row is one host&apos;s <Text as="span" fontFamily="mono" color="#F5C518">/premium?code=&amp;event=</Text> link
										— opened, started checkout, and actually bought the membership it grants.
									</Text>
									{pfLoading ? (
										<Center py={10}><Spinner color="#F79432" /></Center>
									) : pfLinks.length === 0 ? (
										<Text color="#9C9C9C" py={6}>No referral share link has been opened in this period.</Text>
									) : (
										<TableContainer>
											<Table size="sm" variant="simple">
												<Thead>
													<Tr>
														<Th color="#9C9C9C">Code</Th>
														<Th color="#9C9C9C">Event</Th>
														<Th color="#9C9C9C" isNumeric>Opened</Th>
														<Th color="#9C9C9C" isNumeric>Started checkout</Th>
														<Th color="#9C9C9C" isNumeric>Purchased</Th>
														<Th color="#9C9C9C" isNumeric>Conversion</Th>
													</Tr>
												</Thead>
												<Tbody>
													{pfLinks.map((r) => (
														<Tr key={`${r.eventId}-${r.code}`}>
															<Td color="#F5C518" fontFamily="mono" fontSize="xs">{r.code || "—"}</Td>
															<Td color="#D6D6D6" fontSize="xs">{r.event || "—"}</Td>
															<Td color="#D6D6D6" isNumeric>{r.opens.toLocaleString()}</Td>
															<Td color="#D6D6D6" isNumeric>{r.checkoutStarted.toLocaleString()}</Td>
															<Td color="#D6D6D6" isNumeric>{r.purchased.toLocaleString()}</Td>
															<Td color="#F5C518" isNumeric>{pfConversion(r)}</Td>
														</Tr>
													))}
												</Tbody>
											</Table>
										</TableContainer>
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

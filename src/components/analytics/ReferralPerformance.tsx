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
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalCloseButton,
	ModalBody,
	useToast,
} from "@chakra-ui/react"
import { FiUsers, FiTag, FiTrendingUp, FiCreditCard } from "react-icons/fi"
import MetricsCard from "@/components/analytics/MetricsCard"

/**
 * "Who came in on which referral code" — the same report for one event and for the whole
 * platform, because the question is identical and only the scope differs.
 *
 * Reads `/api/analytics/referrals`, which is built from BOOKINGS rather than the codes' own
 * `usageCount`: that counter restarts whenever a host deletes and recreates a code, and it says
 * nothing about who, when, or for how much. Passing `eventId` scopes it; the endpoint separately
 * constrains a non-admin to their own events, so a host embedding this in their event page can
 * only ever see their own buyers.
 */

export type ReferralRow = {
	code: string
	eventId: string
	event: string
	buyers: number
	bookings: number
	tickets: number
	gross: number
	revenue: number
	discountGiven: number
	discountPercentage: number | null
	freeMembershipMonths: number
	maxUses: number | null
	state: "active" | "inactive" | "deleted"
	firstUsed: string | null
	lastUsed: string | null
}

type ReferralBooking = {
	bookingRef: string
	referralCode: string
	name: string
	email: string
	event: string
	status: string
	tickets: number
	subTotal: number
	total: number
	discount: number
	bookedAt: string | null
}

const money = (n: number | null | undefined) => `$${Number(n || 0).toFixed(2)}`
const day = (iso: string | null) =>
	iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"

export default function ReferralPerformance({
	eventId,
	code,
	dateFrom,
	dateTo,
	title = "Who came in on which code",
	showEventColumn = true,
}: {
	/** Scope to one event. Omitted on the platform-wide report. */
	eventId?: string
	/**
	 * Scope to ONE code, for the per-row view a host opens from the codes table.
	 *
	 * Filtered from the same summary rather than fetched separately: passing `code` to the
	 * endpoint returns the individual bookings, not the aggregate, and re-deriving the totals
	 * from those rows would risk them disagreeing with the platform report over the same code.
	 */
	code?: string
	dateFrom?: Date | null
	dateTo?: Date | null
	title?: string
	showEventColumn?: boolean
}) {
	const toast = useToast()
	const [loading, setLoading] = React.useState(true)
	const [rows, setRows] = React.useState<ReferralRow[]>([])
	const [totals, setTotals] = React.useState<{ buyers: number; bookings: number; tickets: number; revenue: number; discountGiven: number } | null>(null)
	// `""` means "every code in scope" — the list a host actually wants first, rather than
	// having to open each code in turn to find out who came in.
	const [detailCode, setDetailCode] = React.useState<string | null>(null)
	const [detailRows, setDetailRows] = React.useState<ReferralBooking[]>([])
	const [detailLoading, setDetailLoading] = React.useState(false)

	const params = React.useCallback(() => {
		const p = new URLSearchParams()
		if (eventId) p.set("eventId", eventId)
		if (dateFrom) p.set("dateFrom", dateFrom.toISOString().slice(0, 10))
		if (dateTo) p.set("dateTo", dateTo.toISOString().slice(0, 10))
		return p
	}, [eventId, dateFrom, dateTo])

	React.useEffect(() => {
		let cancelled = false
		setLoading(true)
		fetch(`/api/analytics/referrals?${params().toString()}`)
			.then((r) => r.json())
			.then((data) => {
				if (cancelled) return
				setRows(data?.data?.rows || [])
				setTotals(data?.data?.totals || null)
			})
			.catch(() => toast({ title: "Couldn't load the referral report", status: "error", duration: 3000 }))
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [params, toast])

	const openDetail = async (code: string) => {
		setDetailCode(code)
		setDetailLoading(true)
		try {
			const p = params()
			if (code) p.set("code", code)
			else p.set("detail", "bookings")
			const res = await fetch(`/api/analytics/referrals?${p.toString()}`)
			const data = await res.json()
			setDetailRows(data?.data?.rows || [])
		} catch {
			toast({ title: "Couldn't load the bookings for that code", status: "error", duration: 3000 })
		} finally {
			setDetailLoading(false)
		}
	}

	const exportCsv = (code?: string | null, detail = false) => {
		const p = params()
		if (code) p.set("code", code)
		else if (detail) p.set("detail", "bookings")
		p.set("format", "csv")
		window.location.href = `/api/analytics/referrals?${p.toString()}`
	}

	// One code's numbers, or the whole scope's. The cards must always agree with the table
	// beneath them, so both read from the same filtered set.
	const visibleRows = code ? rows.filter((r) => r.code.toUpperCase() === code.toUpperCase()) : rows
	const visibleTotals = code
		? visibleRows.reduce(
			(acc, r) => ({
				buyers: acc.buyers + r.buyers,
				bookings: acc.bookings + r.bookings,
				tickets: acc.tickets + r.tickets,
				revenue: Math.round((acc.revenue + r.revenue + Number.EPSILON) * 100) / 100,
				discountGiven: Math.round((acc.discountGiven + r.discountGiven + Number.EPSILON) * 100) / 100,
			}),
			{ buyers: 0, bookings: 0, tickets: 0, revenue: 0, discountGiven: 0 },
		)
		: totals

	return (
		<>
			<SimpleGrid columns={{ base: 1, sm: 2, lg: code ? 4 : 5 }} spacing={4} mb={6}>
				{!code && <MetricsCard dark title="Codes used" value={rows.length.toLocaleString()} icon={FiTag} iconColor="#F79432" />}
				<MetricsCard dark title="Buyers" value={(visibleTotals?.buyers ?? 0).toLocaleString()} icon={FiUsers} iconColor="#F79432" subtitle="Unique email addresses" />
				<MetricsCard dark title="Bookings" value={(visibleTotals?.bookings ?? 0).toLocaleString()} icon={FiTrendingUp} iconColor="#F79432" />
				<MetricsCard dark title="Tickets" value={(visibleTotals?.tickets ?? 0).toLocaleString()} icon={FiTag} iconColor="#F79432" />
				<MetricsCard dark title="Collected" value={money(visibleTotals?.revenue)} icon={FiCreditCard} iconColor="#F79432" subtitle={`${money(visibleTotals?.discountGiven)} discounted`} />
			</SimpleGrid>

			<Box bg="#1a1a1a" border="1px solid #2a2a2a" borderRadius="lg" p={4}>
				<Flex justify="space-between" align="center" mb={3} gap={3} wrap="wrap">
					<Text color="white" fontWeight={700}>{title}</Text>
					<Flex gap={2}>
						{/* Every buyer across every code, without having to open them one at a time. */}
						<Button
							size="sm"
							variant="outline"
							borderColor="#F79432"
							color="#F79432"
							_hover={{ bg: "rgba(247,148,50,0.1)" }}
							onClick={() => openDetail(code || "")}
							isDisabled={visibleRows.length === 0}
						>
							All buyers
						</Button>
						<Button size="sm" bg="#F79432" color="black" _hover={{ bg: "#E68422" }} onClick={() => exportCsv(code)}>
							Export CSV
						</Button>
					</Flex>
				</Flex>

				{loading ? (
					<Center py={10}>
						<Spinner color="#F79432" />
					</Center>
				) : visibleRows.length === 0 ? (
					<Text color="#9C9C9C" py={6}>
						{code
							? "Nobody has booked with this code yet. Numbers appear here as soon as someone does."
							: "No bookings carry a referral code yet. Numbers appear here as soon as someone books with one."}
					</Text>
				) : (
					<TableContainer>
						<Table size="sm" variant="simple">
							<Thead>
								<Tr>
									<Th color="#9C9C9C">Code</Th>
									{showEventColumn && <Th color="#9C9C9C">Event</Th>}
									<Th color="#9C9C9C" isNumeric>Buyers</Th>
									<Th color="#9C9C9C" isNumeric>Bookings</Th>
									<Th color="#9C9C9C" isNumeric>Tickets</Th>
									<Th color="#9C9C9C" isNumeric>Collected</Th>
									<Th color="#9C9C9C" isNumeric>Discounted</Th>
									<Th color="#9C9C9C">Terms</Th>
									<Th color="#9C9C9C">Last used</Th>
									<Th color="#9C9C9C" />
								</Tr>
							</Thead>
							<Tbody>
								{visibleRows.map((r) => (
									<Tr key={`${r.code}-${r.eventId}`}>
										<Td color="white" fontFamily="mono">
											{r.code}{" "}
											{/* A code can be switched off or deleted and its past bookings still count —
											    the row has to say which, or the numbers look like they belong to a code
											    that is still selling. */}
											{r.state !== "active" && <Badge ml={1} colorScheme={r.state === "deleted" ? "red" : "gray"}>{r.state}</Badge>}
										</Td>
										{showEventColumn && <Td color="#D6D6D6">{r.event || "—"}</Td>}
										<Td color="white" isNumeric fontWeight={700}>{r.buyers}</Td>
										<Td color="#D6D6D6" isNumeric>{r.bookings}</Td>
										<Td color="#D6D6D6" isNumeric>{r.tickets}</Td>
										<Td color="#D6D6D6" isNumeric>{money(r.revenue)}</Td>
										<Td color="#F5C518" isNumeric>{money(r.discountGiven)}</Td>
										<Td color="#9C9C9C" fontSize="xs">
											{r.discountPercentage != null ? `${r.discountPercentage}% off` : "—"}
											{r.freeMembershipMonths > 0 ? ` · ${r.freeMembershipMonths} mo Premium` : ""}
										</Td>
										<Td color="#9C9C9C" fontSize="xs">{day(r.lastUsed)}</Td>
										<Td>
											<Button size="xs" variant="ghost" color="#F79432" _hover={{ bg: "rgba(247,148,50,0.1)" }} onClick={() => openDetail(r.code)}>
												Buyers
											</Button>
										</Td>
									</Tr>
								))}
							</Tbody>
						</Table>
					</TableContainer>
				)}
			</Box>

			{/* The people behind one code — the list to hand over when someone asks who a campaign
			    actually brought in. */}
			<Modal isOpen={detailCode !== null} onClose={() => setDetailCode(null)} size="4xl" isCentered scrollBehavior="inside">
				<ModalOverlay />
				<ModalContent bg="#1E1E1E" color="white" border="1px solid #434343">
					<ModalHeader fontFamily={detailCode ? "mono" : undefined}>{detailCode || "Everyone who used a referral code"}</ModalHeader>
					<ModalCloseButton />
					<ModalBody pb={6}>
						<Flex justify="space-between" align="center" mb={3}>
							<Text fontSize="sm" color="#9C9C9C">
								{detailRows.length} booking{detailRows.length === 1 ? "" : "s"}
							</Text>
							<Button size="sm" bg="#F79432" color="black" _hover={{ bg: "#E68422" }} onClick={() => exportCsv(detailCode, true)}>
								Export CSV
							</Button>
						</Flex>
						{detailLoading ? (
							<Center py={10}>
								<Spinner color="#F79432" />
							</Center>
						) : (
							<TableContainer>
								<Table size="sm" variant="simple">
									<Thead>
										<Tr>
											<Th color="#9C9C9C">Booked</Th>
											{!detailCode && <Th color="#9C9C9C">Code</Th>}
											<Th color="#9C9C9C">Name</Th>
											<Th color="#9C9C9C">Email</Th>
											{showEventColumn && <Th color="#9C9C9C">Event</Th>}
											<Th color="#9C9C9C" isNumeric>Tickets</Th>
											<Th color="#9C9C9C" isNumeric>Paid</Th>
										</Tr>
									</Thead>
									<Tbody>
										{detailRows.map((r) => (
											<Tr key={r.bookingRef}>
												<Td color="#9C9C9C" fontSize="xs">{day(r.bookedAt)}</Td>
												{!detailCode && <Td color="#F5C518" fontFamily="mono" fontSize="xs">{r.referralCode}</Td>}
												<Td color="white">{r.name || "—"}</Td>
												<Td color="#D6D6D6" fontSize="xs">{r.email}</Td>
												{showEventColumn && <Td color="#9C9C9C" fontSize="xs">{r.event}</Td>}
												<Td color="#D6D6D6" isNumeric>{r.tickets}</Td>
												<Td color="#D6D6D6" isNumeric>{money(r.total)}</Td>
											</Tr>
										))}
									</Tbody>
								</Table>
							</TableContainer>
						)}
					</ModalBody>
				</ModalContent>
			</Modal>
		</>
	)
}

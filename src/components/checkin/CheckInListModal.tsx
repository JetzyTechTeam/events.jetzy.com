import React, { useEffect, useMemo, useState } from "react"
import {
	Badge,
	Box,
	HStack,
	Input,
	InputGroup,
	InputLeftElement,
	Modal,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalHeader,
	ModalOverlay,
	Spinner,
	Tab,
	TabList,
	Tabs,
	Text,
	VStack,
} from "@chakra-ui/react"
import { SearchIcon } from "@chakra-ui/icons"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import dayjs from "dayjs"
import type { CheckInListRow } from "@/pages/api/check-in/list"

/**
 * The list behind the check-in page's tiles — who is in, who is still to come.
 *
 * Reads `/api/check-in/list`, which counts exactly what `/api/check-in/stats` counts, so a tab's
 * total matches the tile that opened it. Fetched only while open; invalidated after every
 * check-in (`["checkInList", eventId]`).
 */

export type CheckInListTab = "in" | "remaining" | "all"

const TABS: CheckInListTab[] = ["in", "remaining", "all"]

const PHONE = "@media screen and (max-width: 47.99em)"

const STATE_BADGE: Record<CheckInListRow["state"], { color: string; label: (r: CheckInListRow) => string }> = {
	full: { color: "green", label: (r) => (r.totalTickets > 1 ? `All ${r.totalTickets} in` : "Checked in") },
	partial: { color: "orange", label: (r) => `${r.checkedInCount} of ${r.totalTickets} in` },
	none: { color: "gray", label: (r) => (r.totalTickets > 1 ? `0 of ${r.totalTickets} in` : "Not checked in") },
}

interface Props {
	eventId: string
	isOpen: boolean
	onClose: () => void
	initialTab: CheckInListTab
}

const CheckInListModal: React.FC<Props> = ({ eventId, isOpen, onClose, initialTab }) => {
	const [tab, setTab] = useState<CheckInListTab>(initialTab)
	const [search, setSearch] = useState("")

	// Each tile opens on its own tab; the search starts clean every time.
	useEffect(() => {
		if (isOpen) {
			setTab(initialTab)
			setSearch("")
		}
	}, [isOpen, initialTab])

	const { data, isLoading, error } = useQuery({
		queryKey: ["checkInList", eventId],
		queryFn: async () => {
			const response = await axios.get(`/api/check-in/list?eventId=${eventId}`)
			return (response.data?.data?.rows || []) as CheckInListRow[]
		},
		enabled: isOpen,
		refetchInterval: isOpen ? 30000 : false,
	})

	const rows = useMemo(() => data || [], [data])
	const groups = useMemo(
		() => ({
			in: rows.filter((r) => r.checkedInCount > 0),
			remaining: rows.filter((r) => r.remaining > 0),
			all: rows,
		}),
		[rows],
	)

	// Guests, not bookings, on the two tabs a tile opens — "Checked In: 5" can be 2 bookings.
	const guestsIn = groups.in.reduce((sum, r) => sum + r.checkedInCount, 0)
	const guestsLeft = groups.remaining.reduce((sum, r) => sum + r.remaining, 0)
	const tabLabel: Record<CheckInListTab, string> = {
		in: `Checked in (${guestsIn})`,
		remaining: `Not checked in (${guestsLeft})`,
		all: `All bookings (${rows.length})`,
	}

	const visible = useMemo(() => {
		const q = search.trim().toLowerCase()
		const list = groups[tab]
		if (!q) return list
		return list.filter((r) =>
			[r.customerName, r.customerEmail, r.bookingRef].some((v) => v?.toLowerCase().includes(q)),
		)
	}, [groups, tab, search])

	return (
		<Modal isOpen={isOpen} onClose={onClose} size={{ base: "full", md: "2xl" }} scrollBehavior="inside">
			<ModalOverlay />
			<ModalContent bg="#1E1E1E" color="white" border={{ md: "1px solid #434343" }}>
				<ModalHeader pb={2}>Check-in list</ModalHeader>
				<ModalCloseButton />
				<Box px={6} sx={{ [PHONE]: { paddingLeft: "16px", paddingRight: "16px" } }}>
					<Tabs
						index={TABS.indexOf(tab)}
						onChange={(i) => setTab(TABS[i])}
						variant="soft-rounded"
						colorScheme="orange"
						size="sm"
					>
						{/* Scrolls sideways on a narrow phone rather than wrapping into two rows. */}
						<TabList overflowX="auto" gap={2} pb={1} sx={{ scrollbarWidth: "none" }}>
							{TABS.map((key) => (
								<Tab key={key} whiteSpace="nowrap" color="gray.300" flexShrink={0}>
									{tabLabel[key]}
								</Tab>
							))}
						</TabList>
					</Tabs>
					<InputGroup mt={3} mb={2}>
						<InputLeftElement pointerEvents="none">
							<SearchIcon color="gray.500" />
						</InputLeftElement>
						<Input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search name, email or booking ref"
							bg="#2A2A2A"
							borderColor="#434343"
							_placeholder={{ color: "gray.500" }}
							autoComplete="off"
							sx={{ [PHONE]: { fontSize: "16px" } }}
						/>
					</InputGroup>
				</Box>
				<ModalBody pt={2} pb={6} sx={{ [PHONE]: { paddingLeft: "16px", paddingRight: "16px" } }}>
					{isLoading ? (
						<HStack justify="center" py={10}>
							<Spinner color="#F79432" />
							<Text color="gray.400">Loading…</Text>
						</HStack>
					) : error ? (
						<Text color="red.400" textAlign="center" py={10}>
							Couldn&apos;t load the check-in list. Please try again.
						</Text>
					) : visible.length === 0 ? (
						<Text color="gray.500" textAlign="center" py={10}>
							{search.trim()
								? "No booking matches your search."
								: tab === "in"
									? "Nobody has checked in yet."
									: tab === "remaining"
										? "Everyone is checked in."
										: "No bookings for this event yet."}
						</Text>
					) : (
						<VStack spacing={2} align="stretch">
							{visible.map((row) => {
								const badge = STATE_BADGE[row.state]
								return (
									<Box key={row.bookingRef} p={3} bg="#2A2A2A" borderRadius="md" minW={0}>
										<HStack justify="space-between" align="flex-start" spacing={3}>
											<Box minW={0}>
												<Text fontWeight="semibold" noOfLines={1} overflowWrap="anywhere">
													{row.customerName || "Guest"}
												</Text>
												<Text fontSize="sm" color="gray.400" noOfLines={1} overflowWrap="anywhere">
													{row.customerEmail}
												</Text>
											</Box>
											<Badge colorScheme={badge.color} flexShrink={0} px={2} py={0.5} borderRadius="md">
												{badge.label(row)}
											</Badge>
										</HStack>
										{row.tickets.length > 0 && (
											<Text fontSize="sm" color="gray.300" mt={1}>
												{row.tickets.join(" · ")}
											</Text>
										)}
										<Text fontSize="xs" color="gray.500" mt={1} overflowWrap="anywhere">
											{row.lastCheckInAt
												? `Last in ${dayjs(row.lastCheckInAt).format("MMM DD, h:mm A")}${row.lastCheckedInBy ? ` by ${row.lastCheckedInBy}` : ""} · `
												: ""}
											{row.bookingRef}
										</Text>
									</Box>
								)
							})}
						</VStack>
					)}
				</ModalBody>
			</ModalContent>
		</Modal>
	)
}

export default CheckInListModal

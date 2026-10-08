import React, { useMemo, useState } from "react"
import {
	Badge,
	Box,
	Button,
	Flex,
	Image,
	Input,
	InputGroup,
	InputLeftElement,
	Select,
	Spinner,
	Table,
	TableContainer,
	Tbody,
	Td,
	Text,
	Th,
	Thead,
	Tr,
	useToast,
} from "@chakra-ui/react"
import axios from "axios"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { DateTime } from "luxon"
import { MagnifyingGlassIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline"

/**
 * Requests for the unwatermarked original of an album photo.
 *
 * The album page shows every photo under the Jetzy Life mark; a viewer can ask for the clean
 * file of ONE of them, and this is where the host sees which photo, who asked, and whether it
 * has been dealt with. The photo itself is the first column on purpose — the whole point of
 * recording the request per-image is that the host can see what to send.
 *
 * Fulfilment is manual and off-platform: nothing here changes what any endpoint serves.
 * "Mark handled" is a note to the host, not an action on the guest's behalf.
 */
type PhotoRequest = {
	_id: string
	albumId: string
	albumTitle: string
	mediaUrl: string
	mediaType: string
	batchId: string | null
	/** 1-based place in the batch. Null on rows written before it was stored. */
	batchIndex: number | null
	name: string
	email: string
	verified: boolean
	status: "pending" | "handled"
	handledAt: string | null
	date: string
}

const PAGE_SIZE = 10

const escapeCsv = (value: any) => {
	const str = String(value ?? "")
	return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

// Shared with the Manage Event section switcher, which badges the pending count. Same key and
// same fetcher, so the badge reads this tab's cache entry rather than making its own request.
export const albumPhotoRequestsQueryKey = (eventId: string) => ["album-photo-requests", eventId]

export async function fetchAlbumPhotoRequests(eventId: string): Promise<PhotoRequest[]> {
	const res = await axios.get(`/api/events/${eventId}/albums/photo-requests`)
	return (res.data?.data?.items || []) as PhotoRequest[]
}

export function AlbumPhotoRequests({ eventId, eventName }: { eventId: string; eventName?: string }) {
	const toast = useToast()
	const queryClient = useQueryClient()
	const [search, setSearch] = useState("")
	const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "handled">("all")
	const [page, setPage] = useState(1)
	const [savingId, setSavingId] = useState<string | null>(null)

	const { data, isLoading } = useQuery({
		queryKey: albumPhotoRequestsQueryKey(eventId),
		queryFn: () => fetchAlbumPhotoRequests(eventId),
	})

	const rows = useMemo(() => data || [], [data])

	// How many rows each batch holds, so a row can say it was part of a larger ask. One row per
	// photo is deliberate — the host sends files one at a time — but five rows landing in the
	// same second from the same person would otherwise read as five separate requests.
	const batchSizes = useMemo(() => {
		const sizes = new Map<string, number>()
		rows.forEach((r) => {
			if (!r.batchId) return
			sizes.set(r.batchId, (sizes.get(r.batchId) || 0) + 1)
		})
		return sizes
	}, [rows])

	// Which one of the batch each row is. `batchIndex` is stored on write; rows from before that
	// have none, so their position is derived from the listing order (newest first, so the batch
	// is walked backwards to number the first-requested photo 1). Every row used to render a
	// hardcoded "1 of N", which said the same thing three times for one three-photo request.
	const batchPositions = useMemo(() => {
		const positions = new Map<string, number>()
		const seen = new Map<string, number>()
		;[...rows].reverse().forEach((r) => {
			if (!r.batchId) return
			const next = (seen.get(r.batchId) || 0) + 1
			seen.set(r.batchId, next)
			positions.set(r._id, r.batchIndex ?? next)
		})
		return positions
	}, [rows])

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase()
		return rows.filter((r) => {
			if (statusFilter !== "all" && r.status !== statusFilter) return false
			if (!q) return true
			return [r.name, r.email, r.albumTitle].some((v) => (v || "").toLowerCase().includes(q))
		})
	}, [rows, search, statusFilter])

	const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
	const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

	// Reset to the first page whenever the filter changes under us.
	React.useEffect(() => { setPage(1) }, [search, statusFilter])

	const setStatus = async (row: PhotoRequest, status: "pending" | "handled") => {
		setSavingId(row._id)
		try {
			await axios.patch(`/api/events/${eventId}/albums/photo-requests/${row._id}`, { status })
			await queryClient.invalidateQueries({ queryKey: ["album-photo-requests", eventId] })
		} catch (err: any) {
			toast({
				title: "Couldn't update that request",
				description: err?.response?.data?.message || err.message,
				status: "error",
				duration: 4000,
				isClosable: true,
			})
		} finally {
			setSavingId(null)
		}
	}

	// Exports the whole FILTERED set, not the page on screen.
	const exportCsv = () => {
		const headers = ["Album", "Photo URL", "Name", "Email", "Verified", "Status", "Photo in request", "Photos in request", "Requested", "Handled"]
		const body = filtered.map((r) => [
			r.albumTitle,
			r.mediaUrl,
			r.name,
			r.email,
			r.verified ? "Verified" : "Unverified",
			r.status === "handled" ? "Handled" : "Pending",
			r.batchId ? batchPositions.get(r._id) ?? 1 : 1,
			r.batchId ? batchSizes.get(r.batchId) || 1 : 1,
			r.date ? DateTime.fromISO(r.date).toFormat("yyyy-LL-dd HH:mm") : "",
			r.handledAt ? DateTime.fromISO(r.handledAt).toFormat("yyyy-LL-dd HH:mm") : "",
		])
		const csv = [headers, ...body].map((r) => r.map(escapeCsv).join(",")).join("\n")
		const safeName = (eventName || "event").replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase()
		const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
		const url = URL.createObjectURL(blob)
		const a = document.createElement("a")
		a.href = url
		a.download = `${safeName}-photo-requests.csv`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	const pendingCount = rows.filter((r) => r.status === "pending").length

	if (isLoading) {
		return (
			<Flex justify="center" py={10}>
				<Spinner color="#F79432" />
			</Flex>
		)
	}


	// Shared by the table (from `md` up) and the phone cards, so both say the same thing.
	// The requested file, at a glance. A video row shows a link instead — an email client
	// can't render a frame and neither can an <img>.
	const thumb = (r: PhotoRequest, size: string) =>
		r.mediaType === "video" ? (
			<Text as="a" href={r.mediaUrl} target="_blank" rel="noreferrer" color="#F79432" fontSize="xs">
				Open video
			</Text>
		) : (
			<Box
				as="a"
				href={r.mediaUrl}
				target="_blank"
				rel="noreferrer"
				display="block"
				width={size}
				height={size}
				borderRadius="6px"
				overflow="hidden"
				bg="black"
			>
				<Image src={r.mediaUrl} alt="" width="100%" height="100%" objectFit="contain" loading="lazy" />
			</Box>
		)
	const batchBadge = (r: PhotoRequest) =>
		r.batchId && (batchSizes.get(r.batchId) || 0) > 1 ? (
			<Badge ml={2} colorScheme="purple" variant="subtle">
				{batchPositions.get(r._id) ?? 1} of {batchSizes.get(r.batchId)}
			</Badge>
		) : null
	const statusBadge = (r: PhotoRequest) => (
		<Badge colorScheme={r.status === "handled" ? "green" : "orange"} flexShrink={0}>
			{r.status === "handled" ? "Handled" : "Pending"}
		</Badge>
	)
	const requestedAt = (r: PhotoRequest) => (r.date ? DateTime.fromISO(r.date).toFormat("dd LLL yyyy, HH:mm") : "—")
	const toggleButton = (r: PhotoRequest, size: "xs" | "sm") => (
		<Button
			size={size}
			variant="outline"
			color="white"
			borderColor="#2A2A2A"
			_hover={{ bg: "#2A2A2A" }}
			isLoading={savingId === r._id}
			onClick={() => setStatus(r, r.status === "handled" ? "pending" : "handled")}
		>
			{r.status === "handled" ? "Reopen" : "Mark handled"}
		</Button>
	)

	return (
		<Box>
			<Flex align="center" gap={3} mb={4} wrap="wrap">
				<Box>
					<Text color="white" fontWeight="700" fontSize="lg">Photo Requests</Text>
					<Text color="#9C9C9C" fontSize="sm">
						Viewers asking for the unwatermarked original of an album photo. Send the file to them directly, then mark it handled.
					</Text>
				</Box>
				<Button
					ml="auto"
					variant="outline"
					size="sm"
					color="white"
					borderColor="#2A2A2A"
					_hover={{ bg: "#2A2A2A" }}
					leftIcon={<Box as={ArrowDownTrayIcon} width="16px" height="16px" />}
					onClick={exportCsv}
					isDisabled={filtered.length === 0}
				>
					Export CSV
				</Button>
			</Flex>

			<Flex gap={3} mb={4} wrap="wrap" align="center">
				<InputGroup maxW={{ base: "none", md: "280px" }} flexBasis={{ base: "100%", md: "auto" }}>
					<InputLeftElement pointerEvents="none">
						<Box as={MagnifyingGlassIcon} width="16px" height="16px" color="#9C9C9C" />
					</InputLeftElement>
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search name, email or album"
						fontSize={{ base: "16px", md: "sm" }}
						bg="#1E1E1E"
						borderColor="#2A2A2A"
						color="white"
						size="sm"
						borderRadius="8px"
						_placeholder={{ color: "#666" }}
					/>
				</InputGroup>
				<Select
					value={statusFilter}
					onChange={(e) => setStatusFilter(e.target.value as any)}
					bg="#1E1E1E"
					borderColor="#2A2A2A"
					color="white"
					size="sm"
					borderRadius="8px"
					maxW={{ base: "none", md: "180px" }}
					flex={{ base: "1 1 0", md: "initial" }}
					fontSize={{ base: "16px", md: "sm" }}
				>
					<option value="all">All statuses</option>
					<option value="pending">Pending</option>
					<option value="handled">Handled</option>
				</Select>
				<Text color="#9C9C9C" fontSize="sm" ml="auto">
					Showing {paged.length} of {filtered.length}
					{pendingCount > 0 && (
						<Badge ml={2} colorScheme="orange">{pendingCount} pending</Badge>
					)}
				</Text>
			</Flex>

			{filtered.length === 0 ? (
				<Text color="#9C9C9C" fontSize="sm" py={6}>
					{rows.length === 0 ? "No one has requested an unwatermarked photo yet." : "No requests match those filters."}
				</Text>
			) : (
				<>
				{/* Phones: the photo leads each card, since it is what the host is matching. */}
				<Flex display={{ base: "flex", md: "none" }} direction="column" gap={3}>
					{paged.map((r) => (
						<Flex key={r._id} gap={3} bg="#101010" border="1px solid #343536" borderRadius="12px" p={3} align="flex-start">
							<Box flexShrink={0}>{thumb(r, "72px")}</Box>
							<Box flex="1" minW={0}>
								<Flex justify="space-between" align="flex-start" gap={2}>
									<Text color="white" fontWeight={700} fontSize="14px" noOfLines={1}>{r.name}</Text>
									{statusBadge(r)}
								</Flex>
								<Text color="#9C9C9C" fontSize="12px" wordBreak="break-all">{r.email}</Text>
								<Text color="#D6D6D6" fontSize="12px" mt={1} noOfLines={1}>
									{r.albumTitle}
									{batchBadge(r)}
								</Text>
								<Flex mt={2} justify="space-between" align="center" gap={2}>
									<Text color="#9C9C9C" fontSize="12px">{requestedAt(r)}</Text>
									{toggleButton(r, "sm")}
								</Flex>
							</Box>
						</Flex>
					))}
				</Flex>
				<TableContainer display={{ base: "none", md: "block" }}>
					<Table variant="simple" size="sm">
						<Thead>
							<Tr>
								<Th color="#9C9C9C">Photo</Th>
								<Th color="#9C9C9C">Album</Th>
								<Th color="#9C9C9C">Name</Th>
								<Th color="#9C9C9C">Email</Th>
								<Th color="#9C9C9C">Status</Th>
								<Th color="#9C9C9C">Requested</Th>
								<Th color="#9C9C9C"></Th>
							</Tr>
						</Thead>
						<Tbody>
							{paged.map((r) => (
								<Tr key={r._id}>
									<Td>{thumb(r, "56px")}</Td>
									<Td color="white">{r.albumTitle}</Td>
									<Td color="white">
										{r.name}
										{batchBadge(r)}
									</Td>
									<Td color="white">{r.email}</Td>
									<Td>{statusBadge(r)}</Td>
									<Td color="#9C9C9C">{requestedAt(r)}</Td>
									<Td>{toggleButton(r, "xs")}</Td>
								</Tr>
							))}
						</Tbody>
					</Table>
				</TableContainer>
				</>
			)}

			{totalPages > 1 && (
				<Flex justify="center" align="center" gap={2} mt={4}>
					<Button size="sm" variant="ghost" color="white" _hover={{ bg: "#2A2A2A" }} isDisabled={page === 1} onClick={() => setPage((p) => p - 1)}>
						Prev
					</Button>
					{Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
						<Button
							key={n}
							size="sm"
							bg={n === page ? "#F79432" : "#2A2A2A"}
							color={n === page ? "black" : "white"}
							_hover={{ bg: n === page ? "#e58220" : "#3A3A3A" }}
							onClick={() => setPage(n)}
						>
							{n}
						</Button>
					))}
					<Button size="sm" variant="ghost" color="white" _hover={{ bg: "#2A2A2A" }} isDisabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
						Next
					</Button>
				</Flex>
			)}
		</Box>
	)
}

export default AlbumPhotoRequests

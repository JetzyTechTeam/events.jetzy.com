"use client"
import {
	AlertDialog,
	AlertDialogBody,
	AlertDialogContent,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogOverlay,
	Badge,
	Box,
	Button,
	Flex,
	FormControl,
	FormLabel,
	IconButton,
	Input,
	Modal,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalOverlay,
	Select,
	Stack,
	Switch,
	Table,
	Tbody,
	Td,
	Text,
	Th,
	Thead,
	Tr,
	useBreakpointValue,
	useToast,
} from "@chakra-ui/react"
import { FiCopy, FiDownload, FiEdit2, FiPlus, FiTrash2, FiUsers } from "react-icons/fi"
import { BsQrCode } from "react-icons/bs"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import axios from "axios"
import dynamic from "next/dynamic"
import DateRangeSelector from "@/components/analytics/DateRangeSelector"
import {
	MARKETING_ATTRIBUTION_DAYS,
	MARKETING_PLATFORMS,
	MARKETING_TAG_MAX,
	marketingLinkUrl,
	marketingPlatformLabel,
	normalizeMarketingTag,
	suggestMarketingTag,
	validateMarketingTag,
} from "@/lib/marketing-link"

const QRCodeModal = dynamic(() => import("@/components/events/QRCodeModal"), { ssr: false })

/**
 * Marketing Links — one tracked link per channel for an event, and what each one brought in.
 *
 * Lives on Manage Event (admin OR owner). `readOnly` renders the report alone, for the admin
 * per-event analytics page. Numbers come from `/api/analytics/marketing-links`; the links from
 * `/api/events/[eventId]/marketing-links`.
 */

interface MarketingLink {
	_id: string
	tag: string
	label: string
	platform: string | null
	isActive: boolean
	referralCodeId: string | null
	referralCode: string | null
	url: string
}

interface ReportRow {
	linkId: string
	label: string
	tag: string | null
	platform: string | null
	state: "active" | "inactive" | "deleted" | "direct"
	referralCode: string | null
	clicks: number
	visitors: number
	pickedTicket: number
	openedCheckout: number
	submittedCheckout: number
	emailCodeSent: number
	emailVerified: number
	emailNeverVerified: number
	alreadySignedIn: number
	emailConfirmed: number
	bookings: number
	pending: number
	buyers: number
	tickets: number
	revenue: number
	conversion: number | null
}

interface BuyerRow {
	bookingRef: string
	name: string
	email: string
	status: string
	tickets: number
	total: number
	referralCode: string
	bookedAt: string | null
}

interface ReferralOption {
	_id: string
	code: string
	isActive: boolean
}

interface Props {
	eventId: string
	eventSlug: string
	readOnly?: boolean
	/** When the host page owns the date range (the analytics page), pass it and the built-in picker is hidden. */
	rangeFrom?: Date | null
	rangeTo?: Date | null
}

const money = (n: number) => `$${(n || 0).toFixed(2)}`
const ymd = (d: Date | null) =>
	d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : ""

const inputProps = {
	color: "white",
	bg: "#101010",
	border: "1px solid #434343",
	_focus: { borderColor: "#F79432" },
	fontSize: { base: "16px", md: "sm" },
}

const STATE_BADGE: Record<ReportRow["state"], { label: string; scheme: string } | null> = {
	active: null,
	inactive: { label: "Off", scheme: "gray" },
	deleted: { label: "Deleted", scheme: "red" },
	direct: null,
}

export function MarketingLinksManager({ eventId, eventSlug, readOnly = false, rangeFrom, rangeTo }: Props) {
	const isDesktopModal = useBreakpointValue({ base: false, md: true }) ?? true
	const toast = useToast()

	const [links, setLinks] = useState<MarketingLink[]>([])
	const [report, setReport] = useState<ReportRow[]>([])
	const [codes, setCodes] = useState<ReferralOption[]>([])
	const [loading, setLoading] = useState(true)
	const [dateFrom, setDateFrom] = useState<Date | null>(null)
	const [dateTo, setDateTo] = useState<Date | null>(null)

	const [formOpen, setFormOpen] = useState(false)
	const [editing, setEditing] = useState<MarketingLink | null>(null)
	const [form, setForm] = useState({ platform: "instagram", label: "Instagram", tag: "", referralCodeId: "" })
	const [tagTouched, setTagTouched] = useState(false)
	const [saving, setSaving] = useState(false)
	const [toggling, setToggling] = useState<string | null>(null)

	const [qrLink, setQrLink] = useState<MarketingLink | null>(null)
	const [deleteTarget, setDeleteTarget] = useState<MarketingLink | null>(null)
	const [deleting, setDeleting] = useState(false)
	const cancelDeleteRef = useRef<HTMLButtonElement>(null)

	const [detailRow, setDetailRow] = useState<ReportRow | null>(null)
	const [buyers, setBuyers] = useState<BuyerRow[]>([])
	const [buyersLoading, setBuyersLoading] = useState(false)

	const externalRange = rangeFrom !== undefined || rangeTo !== undefined
	const from = externalRange ? rangeFrom ?? null : dateFrom
	const to = externalRange ? rangeTo ?? null : dateTo

	const rangeQuery = useMemo(() => {
		const p = new URLSearchParams({ eventId })
		if (from) p.set("dateFrom", ymd(from))
		if (to) p.set("dateTo", ymd(to))
		return p
	}, [eventId, from, to])

	const fetchReport = useCallback(async () => {
		try {
			const r = await axios.get(`/api/analytics/marketing-links?${rangeQuery.toString()}`)
			setReport(r.data?.status ? r.data.data?.rows || [] : [])
		} catch (error: any) {
			console.error("Failed to load marketing link report:", error)
			setReport([])
		}
	}, [rangeQuery])

	const fetchLinks = useCallback(async () => {
		if (readOnly) return
		try {
			const r = await axios.get(`/api/events/${eventId}/marketing-links`)
			setLinks(r.data?.status ? r.data.data || [] : [])
		} catch (error: any) {
			console.error("Failed to load marketing links:", error)
			toast({ title: "Error", description: error.response?.data?.message || "Failed to load marketing links", status: "error", duration: 3000 })
		}
	}, [eventId, readOnly, toast])

	useEffect(() => {
		let alive = true
		setLoading(true)
		Promise.all([fetchLinks(), fetchReport()]).finally(() => alive && setLoading(false))
		return () => {
			alive = false
		}
	}, [fetchLinks, fetchReport])

	// The event's referral codes, for the optional "apply a code" picker.
	useEffect(() => {
		if (readOnly || !eventId) return
		axios
			.get(`/api/events/${eventId}/referral-codes`)
			.then((r) => setCodes(r.data?.status ? (r.data.data || []).map((c: any) => ({ _id: c._id, code: c.code, isActive: c.isActive })) : []))
			.catch(() => setCodes([]))
	}, [eventId, readOnly])

	const reportById = useMemo(() => new Map(report.map((r) => [r.linkId, r])), [report])
	const directRow = reportById.get("direct")

	// The report carries deleted links that still have numbers; the managed list does not.
	const rows = useMemo(() => {
		if (readOnly) return report.filter((r) => r.state !== "direct")
		const fromLinks = links.map((l) => reportById.get(l._id) || blankRow(l))
		const deletedWithData = report.filter((r) => r.state === "deleted")
		return [...fromLinks, ...deletedWithData]
	}, [readOnly, report, links, reportById])

	const linkById = useMemo(() => new Map(links.map((l) => [l._id, l])), [links])

	const totals = useMemo(() => {
		const all = [...rows, ...(directRow ? [directRow] : [])]
		return {
			clicks: all.reduce((s, r) => s + r.clicks, 0),
			bookings: all.reduce((s, r) => s + r.bookings, 0),
			revenue: all.reduce((s, r) => s + r.revenue, 0),
			viaLinks: rows.reduce((s, r) => s + r.bookings, 0),
		}
	}, [rows, directRow])

	const copy = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text)
			toast({ title: "Link copied", status: "success", duration: 2000 })
		} catch {
			toast({ title: "Couldn't copy", description: text, status: "warning", duration: 5000, isClosable: true })
		}
	}

	const openCreate = () => {
		const taken = links.map((l) => l.tag)
		setEditing(null)
		setTagTouched(false)
		setForm({ platform: "instagram", label: "Instagram", tag: suggestMarketingTag("instagram", taken), referralCodeId: "" })
		setFormOpen(true)
	}

	const openEdit = (link: MarketingLink) => {
		setEditing(link)
		setTagTouched(true)
		setForm({ platform: link.platform || "other", label: link.label, tag: link.tag, referralCodeId: link.referralCodeId || "" })
		setFormOpen(true)
	}

	const onPlatformChange = (platform: string) => {
		setForm((prev) => {
			const prevPresetLabel = MARKETING_PLATFORMS.find((p) => p.key === prev.platform)?.label
			const nextPresetLabel = MARKETING_PLATFORMS.find((p) => p.key === platform)?.label || ""
			return {
				...prev,
				platform,
				// Follow the platform only while the host hasn't written their own name / tag.
				label: !prev.label || prev.label === prevPresetLabel ? nextPresetLabel : prev.label,
				tag: editing || tagTouched ? prev.tag : suggestMarketingTag(platform === "other" ? "link" : platform, links.map((l) => l.tag)),
			}
		})
	}

	const normalizedTag = normalizeMarketingTag(form.tag)
	const tagProblem = editing ? null : validateMarketingTag(normalizedTag)
	const tagTaken = !editing && links.some((l) => l.tag === normalizedTag)
	const previewUrl = marketingLinkUrl(process.env.NEXT_PUBLIC_URL || (typeof window !== "undefined" ? window.location.origin : ""), eventSlug, normalizedTag || "…")

	const save = async () => {
		if (!form.label.trim()) return
		setSaving(true)
		try {
			if (editing) {
				await axios.patch(`/api/events/${eventId}/marketing-links/${editing._id}`, {
					label: form.label.trim(),
					platform: form.platform,
					referralCodeId: form.referralCodeId || null,
				})
				toast({ title: "Link updated", status: "success", duration: 2500 })
			} else {
				await axios.post(`/api/events/${eventId}/marketing-links`, {
					label: form.label.trim(),
					platform: form.platform,
					tag: normalizedTag,
					referralCodeId: form.referralCodeId || null,
				})
				toast({ title: "Link created", description: "Copy it and post it where you're promoting the event.", status: "success", duration: 3000 })
			}
			setFormOpen(false)
			await Promise.all([fetchLinks(), fetchReport()])
		} catch (error: any) {
			toast({ title: "Couldn't save", description: error.response?.data?.message || "Please try again.", status: "error", duration: 4000, isClosable: true })
		} finally {
			setSaving(false)
		}
	}

	const toggleActive = async (link: MarketingLink, isActive: boolean) => {
		setToggling(link._id)
		try {
			await axios.patch(`/api/events/${eventId}/marketing-links/${link._id}`, { isActive })
			setLinks((prev) => prev.map((l) => (l._id === link._id ? { ...l, isActive } : l)))
		} catch (error: any) {
			toast({ title: "Couldn't update", description: error.response?.data?.message || "Please try again.", status: "error", duration: 3000 })
		} finally {
			setToggling(null)
		}
	}

	const confirmDelete = async () => {
		if (!deleteTarget) return
		setDeleting(true)
		try {
			await axios.delete(`/api/events/${eventId}/marketing-links/${deleteTarget._id}`)
			toast({ title: "Link deleted", status: "success", duration: 2500 })
			setDeleteTarget(null)
			await Promise.all([fetchLinks(), fetchReport()])
		} catch (error: any) {
			toast({ title: "Couldn't delete", description: error.response?.data?.message || "Please try again.", status: "error", duration: 3000 })
		} finally {
			setDeleting(false)
		}
	}

	const openDetail = async (row: ReportRow) => {
		setDetailRow(row)
		setBuyers([])
		setBuyersLoading(true)
		try {
			const p = new URLSearchParams(rangeQuery)
			p.set("detail", "bookings")
			p.set("linkId", row.linkId)
			const r = await axios.get(`/api/analytics/marketing-links?${p.toString()}`)
			setBuyers(r.data?.status ? r.data.data?.rows || [] : [])
		} catch {
			setBuyers([])
		} finally {
			setBuyersLoading(false)
		}
	}

	const csvHref = (extra?: Record<string, string>) => {
		const p = new URLSearchParams(rangeQuery)
		p.set("format", "csv")
		Object.entries(extra || {}).forEach(([k, v]) => p.set(k, v))
		return `/api/analytics/marketing-links?${p.toString()}`
	}

	const rowName = (row: ReportRow) => (
		<Box minW={0}>
			<Flex align="center" gap={2} wrap="wrap">
				<Text fontWeight="semibold" noOfLines={1}>
					{row.label}
				</Text>
				{row.state !== "direct" && (
					<Badge bg="#2a2a2a" color="#D0D0D0" fontWeight="medium" textTransform="none">
						{marketingPlatformLabel(row.platform)}
					</Badge>
				)}
				{STATE_BADGE[row.state] && <Badge colorScheme={STATE_BADGE[row.state]!.scheme}>{STATE_BADGE[row.state]!.label}</Badge>}
				{row.referralCode && (
					<Badge colorScheme="orange" variant="subtle" fontFamily="mono">
						{row.referralCode}
					</Badge>
				)}
			</Flex>
			{row.tag && (
				<Text fontSize="xs" color="#9C9C9C" fontFamily="mono" noOfLines={1}>
					?mk={row.tag}
				</Text>
			)}
		</Box>
	)

	const rowActions = (row: ReportRow) => {
		const link = linkById.get(row.linkId)
		const btn = { size: "xs" as const, variant: "outline", color: "white", borderColor: "#434343", _hover: { bg: "#2a2a2a" } }
		return (
			<Flex gap={2} wrap="wrap">
				{link && !readOnly && (
					<>
						<Button leftIcon={<FiCopy />} {...btn} onClick={() => copy(link.url)}>
							Copy link
						</Button>
						<Button leftIcon={<BsQrCode />} {...btn} onClick={() => setQrLink(link)}>
							QR code
						</Button>
					</>
				)}
				<Button leftIcon={<FiUsers />} {...btn} onClick={() => openDetail(row)} isDisabled={row.bookings + row.pending === 0}>
					Who booked
				</Button>
				{link && !readOnly && (
					<>
						<Button leftIcon={<FiEdit2 />} {...btn} onClick={() => openEdit(link)}>
							Edit
						</Button>
						<Button leftIcon={<FiTrash2 />} {...btn} color="red.300" onClick={() => setDeleteTarget(link)}>
							Delete
						</Button>
					</>
				)}
			</Flex>
		)
	}

	const activeSwitch = (row: ReportRow) => {
		const link = linkById.get(row.linkId)
		if (!link || readOnly) return null
		return (
			<Flex align="center" gap={2} flexShrink={0}>
				<Text fontSize="xs" color="#9C9C9C">
					{link.isActive ? "On" : "Off"}
				</Text>
				<Switch isChecked={link.isActive} isDisabled={toggling === link._id} onChange={(e) => toggleActive(link, e.target.checked)} colorScheme="green" />
			</Flex>
		)
	}

	const allRows = [...rows, ...(directRow ? [directRow] : [])]

	return (
		<Box bg="#1E1E1E" borderRadius="2xl" border="1px solid #434343" p={0} mb={4} overflow="hidden" color="white">
			<Box p={{ base: 3, md: 4 }} borderBottom="1px solid #434343">
				<Flex justify="space-between" align="center" gap={3} wrap="wrap">
					<Box>
						<Text fontSize="xl" fontWeight="bold">
							Marketing Links
						</Text>
						<Text fontSize="sm" color="#9C9C9C">
							Make a link for each place you share this event, and see how many people each one brought and who booked.
						</Text>
					</Box>
					<Flex gap={2} wrap="wrap">
						<Button as="a" href={csvHref()} leftIcon={<FiDownload />} size="sm" variant="outline" color="white" borderColor="#434343" _hover={{ bg: "#2a2a2a" }}>
							Download CSV
						</Button>
						{!readOnly && (
							<Button leftIcon={<FiPlus />} bg="#F79432" color="black" _hover={{ bg: "#E68422" }} _active={{ bg: "#D57618" }} size="sm" onClick={openCreate}>
								New Link
							</Button>
						)}
					</Flex>
				</Flex>
			</Box>

			<Box p={{ base: 3, md: 4 }}>
				<Box mb={4} display={externalRange ? "none" : "block"}>
					<DateRangeSelector
						dark
						dateFrom={dateFrom}
						dateTo={dateTo}
						onDateChange={(from, to) => {
							setDateFrom(from)
							setDateTo(to)
						}}
					/>
				</Box>

				<Flex gap={3} mb={4} wrap="wrap">
					{[
						{ label: "Bookings in total", value: String(totals.bookings) },
						{ label: "Bookings from your links", value: String(totals.viaLinks) },
						{ label: "Ticket sales", value: money(totals.revenue) },
					].map((tile) => (
						<Box key={tile.label} flex="1 1 160px" bg="#101010" border="1px solid #2a2a2a" borderRadius="lg" px={3} py={2}>
							<Text fontSize="xs" color="#9C9C9C">
								{tile.label}
							</Text>
							<Text fontSize="xl" fontWeight="bold">
								{tile.value}
							</Text>
						</Box>
					))}
				</Flex>

				{loading ? (
					<Text color="#9C9C9C">Loading…</Text>
				) : rows.length === 0 && !readOnly ? (
					<Box textAlign="center" py={8}>
						<Text color="#9C9C9C" mb={4}>
							No links yet. Make one for each place you share this event — Instagram, Facebook, Partiful, a WhatsApp group…
						</Text>
						<Button bg="#F79432" color="black" _hover={{ bg: "#E68422" }} onClick={openCreate}>
							Make Your First Link
						</Button>
					</Box>
				) : (
					<Box display="grid" gridTemplateColumns={{ base: "1fr", xl: "1fr 1fr" }} gap={3}>
						{allRows.map((row) => (
							<Box key={row.linkId} bg="#101010" border="1px solid #434343" borderRadius="xl" p={{ base: 3, md: 4 }} display="flex" flexDirection="column" gap={3}>
								<Flex align="flex-start" justify="space-between" gap={2}>
									{rowName(row)}
									{activeSwitch(row)}
								</Flex>
								{row.state === "direct" && (
									<Text fontSize="xs" color="#9C9C9C" mt={-2}>
										People who came another way — the plain event link, the events list, a search.
									</Text>
								)}
								<LinkSummary row={row} />
								<Box pt={1}>{rowActions(row)}</Box>
							</Box>
						))}
					</Box>
				)}

				<Text fontSize="xs" color="#9C9C9C" mt={4}>
					A booking counts for the last link the person opened in the {MARKETING_ATTRIBUTION_DAYS} days before they booked. Link previews on
					social apps aren&apos;t counted as visits. A link switched off stops counting straight away; what it counted before stays. Ticket
					sales don&apos;t include memberships.
				</Text>
			</Box>

			{/* Create / Edit */}
			<Modal isOpen={formOpen} onClose={() => setFormOpen(false)} size={{ base: "full", md: "lg" }} isCentered={isDesktopModal} scrollBehavior="inside">
				<ModalOverlay />
				<ModalContent bg="#1E1E1E" color="white" border="1px solid #434343" m={{ base: 0, md: 4 }} borderRadius={{ base: 0, md: "md" }}>
					<ModalHeader>{editing ? "Edit Marketing Link" : "Create Marketing Link"}</ModalHeader>
					<ModalCloseButton />
					<ModalBody>
						<FormControl mb={4}>
							<FormLabel>Platform</FormLabel>
							<Select value={form.platform} onChange={(e) => onPlatformChange(e.target.value)} {...inputProps} sx={{ option: { bg: "#101010" } }}>
								{MARKETING_PLATFORMS.map((p) => (
									<option key={p.key} value={p.key}>
										{p.label}
									</option>
								))}
							</Select>
						</FormControl>

						<FormControl isRequired mb={4}>
							<FormLabel>Name</FormLabel>
							<Input value={form.label} maxLength={80} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Instagram bio" {...inputProps} />
							<Text fontSize="xs" color="gray.400" mt={1}>
								Only you see this — use it to tell links apart (&ldquo;Instagram story&rdquo;, &ldquo;Partiful invite&rdquo;).
							</Text>
						</FormControl>

						<FormControl isRequired={!editing} mb={4} isInvalid={!editing && !!form.tag && (!!tagProblem || tagTaken)}>
							<FormLabel>Tag</FormLabel>
							<Input
								value={form.tag}
								maxLength={MARKETING_TAG_MAX + 10}
								onChange={(e) => {
									setTagTouched(true)
									setForm({ ...form, tag: e.target.value })
								}}
								isReadOnly={!!editing}
								opacity={editing ? 0.6 : 1}
								fontFamily="mono"
								{...inputProps}
							/>
							<Text fontSize="xs" color={!editing && form.tag && (tagProblem || tagTaken) ? "red.300" : "gray.400"} mt={1}>
								{editing
									? "The tag can't be changed — posts already carry the link. Delete it and create a new one to change it."
									: tagTaken
										? "This event already has a link with that tag."
										: form.tag && tagProblem
											? tagProblem
											: "Letters, numbers and hyphens. It appears at the end of the link."}
							</Text>
							<Box mt={2} p={2} bg="#101010" border="1px dashed #434343" borderRadius="md">
								<Text fontSize="xs" color="#9C9C9C">
									Link
								</Text>
								<Text fontSize="sm" fontFamily="mono" wordBreak="break-all">
									{editing ? editing.url : previewUrl}
								</Text>
							</Box>
						</FormControl>

						<FormControl mb={2}>
							<FormLabel>Apply a referral code (optional)</FormLabel>
							<Select value={form.referralCodeId} onChange={(e) => setForm({ ...form, referralCodeId: e.target.value })} {...inputProps} sx={{ option: { bg: "#101010" } }}>
								<option value="">No code</option>
								{codes
									.filter((c) => c.isActive || c._id === form.referralCodeId)
									.map((c) => (
										<option key={c._id} value={c._id}>
											{c.code}
											{c.isActive ? "" : " (inactive)"}
										</option>
									))}
							</Select>
							<Text fontSize="xs" color="gray.400" mt={1}>
								People who open this link get the code filled in at checkout, as long as it&apos;s still valid. Create codes in Referral
								Codes.
							</Text>
						</FormControl>
					</ModalBody>
					<ModalFooter gap={2}>
						<Button variant="ghost" color="white" _hover={{ bg: "#2a2a2a" }} onClick={() => setFormOpen(false)}>
							Cancel
						</Button>
						<Button
							bg="#F79432"
							color="black"
							_hover={{ bg: "#E68422" }}
							onClick={save}
							isLoading={saving}
							isDisabled={!form.label.trim() || (!editing && (!!tagProblem || tagTaken))}
						>
							{editing ? "Save" : "Create Link"}
						</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>

			{/* Funnel + buyers */}
			<Modal isOpen={!!detailRow} onClose={() => setDetailRow(null)} size={{ base: "full", md: "4xl" }} isCentered={isDesktopModal} scrollBehavior="inside">
				<ModalOverlay />
				<ModalContent bg="#1E1E1E" color="white" border="1px solid #434343" m={{ base: 0, md: 4 }} borderRadius={{ base: 0, md: "md" }}>
					<ModalHeader pr={12}>Who booked — {detailRow?.label}</ModalHeader>
					<ModalCloseButton />
					<ModalBody>
						<Flex justify="space-between" align="center" mb={3} gap={2} wrap="wrap">
							<Text fontSize="sm" color="#9C9C9C">
								{detailRow ? `${detailRow.bookings} booked · ${detailRow.tickets} ${detailRow.tickets === 1 ? "ticket" : "tickets"} · ${money(detailRow.revenue)}` : ""}
							</Text>
							{detailRow && (
								<Button as="a" href={csvHref({ detail: "bookings", linkId: detailRow.linkId })} leftIcon={<FiDownload />} size="xs" variant="outline" color="white" borderColor="#434343" _hover={{ bg: "#2a2a2a" }}>
									CSV
								</Button>
							)}
						</Flex>
						{buyersLoading ? (
							<Text color="#9C9C9C">Loading…</Text>
						) : buyers.length === 0 ? (
							<Text color="#9C9C9C">No bookings from this link in the selected period.</Text>
						) : (
							<Box overflowX="auto">
								<Table size="sm" sx={{ "th, td": { borderColor: "#2a2a2a" }, th: { color: "#9C9C9C", whiteSpace: "nowrap" } }}>
									<Thead>
										<Tr>
											<Th>Name</Th>
											<Th>Email</Th>
											<Th isNumeric>Tickets</Th>
											<Th isNumeric>Paid</Th>
											<Th>Status</Th>
											<Th>Booked</Th>
										</Tr>
									</Thead>
									<Tbody>
										{buyers.map((b) => (
											<Tr key={b.bookingRef}>
												<Td>{b.name || "—"}</Td>
												<Td>{b.email}</Td>
												<Td isNumeric>{b.tickets}</Td>
												<Td isNumeric>{money(b.total)}</Td>
												<Td textTransform="capitalize">{b.status}</Td>
												<Td whiteSpace="nowrap">{b.bookedAt ? new Date(b.bookedAt).toLocaleDateString() : "—"}</Td>
											</Tr>
										))}
									</Tbody>
								</Table>
							</Box>
						)}
					</ModalBody>
				</ModalContent>
			</Modal>

			{qrLink && <QRCodeModal isOpen={!!qrLink} onClose={() => setQrLink(null)} url={qrLink.url} title={qrLink.label} />}

			<AlertDialog isOpen={!!deleteTarget} leastDestructiveRef={cancelDeleteRef} onClose={() => setDeleteTarget(null)} isCentered>
				<AlertDialogOverlay>
					<AlertDialogContent bg="#1E1E1E" color="white" border="1px solid #434343" mx={4}>
						<AlertDialogHeader>Delete &ldquo;{deleteTarget?.label}&rdquo;?</AlertDialogHeader>
						<AlertDialogBody>
							The link stops tracking new visitors. Bookings it already brought in stay in the report.
						</AlertDialogBody>
						<AlertDialogFooter gap={2}>
							<Button ref={cancelDeleteRef} variant="ghost" color="white" _hover={{ bg: "#2a2a2a" }} onClick={() => setDeleteTarget(null)}>
								Cancel
							</Button>
							<Button colorScheme="red" onClick={confirmDelete} isLoading={deleting}>
								Delete
							</Button>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialogOverlay>
			</AlertDialog>
		</Box>
	)
}

function blankRow(link: MarketingLink): ReportRow {
	return {
		linkId: link._id,
		label: link.label,
		tag: link.tag,
		platform: link.platform,
		state: link.isActive ? "active" : "inactive",
		referralCode: link.referralCode,
		clicks: 0,
		visitors: 0,
		pickedTicket: 0,
		openedCheckout: 0,
		submittedCheckout: 0,
		emailCodeSent: 0,
		emailVerified: 0,
		emailNeverVerified: 0,
		alreadySignedIn: 0,
		emailConfirmed: 0,
		bookings: 0,
		pending: 0,
		buyers: 0,
		tickets: 0,
		revenue: 0,
		conversion: null,
	}
}

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`

/** The link's numbers as plain sentences — no chart, no jargon. */
function LinkSummary({ row }: { row: ReportRow }) {
	if (row.visitors === 0 && row.bookings === 0 && row.pending === 0) {
		return (
			<Text fontSize="sm" color="#9C9C9C">
				Nobody has opened this link yet.
			</Text>
		)
	}
	const line = (n: number, text: string, strong = false) => (
		<Flex gap={3} align="baseline">
			<Text minW="44px" textAlign="right" fontWeight="bold" fontSize={strong ? "lg" : "md"} color={strong ? "#F79432" : "white"}>
				{n}
			</Text>
			<Text fontSize="sm" color={strong ? "white" : "#D0D0D0"} fontWeight={strong ? "semibold" : "normal"}>
				{text}
			</Text>
		</Flex>
	)
	return (
		<Stack spacing={1}>
			{line(row.visitors, `${row.visitors === 1 ? "person" : "people"} visited the event page`)}
			{line(row.pickedTicket, "picked a ticket")}
			{line(row.openedCheckout, "started checkout")}
			{/* Only once the email check has been recorded for this link — before 25 Nov 2026 it
			    wasn't, and a "0 confirmed" line above real bookings would read as broken. */}
			{row.emailCodeSent + row.alreadySignedIn > 0 && (
				<>
					{line(row.emailConfirmed, "confirmed their email")}
					<Text fontSize="xs" color="#9C9C9C" pl="56px" mt={-1}>
						{[
							row.emailVerified > 0 ? `${row.emailVerified} with an email code` : null,
							row.alreadySignedIn > 0 ? `${row.alreadySignedIn} already signed in` : null,
							row.emailNeverVerified > 0 ? `${people(row.emailNeverVerified)} got a code but didn't verify` : null,
						]
							.filter(Boolean)
							.join(" · ")}
					</Text>
				</>
			)}
			{line(row.bookings, `booked — ${row.tickets} ${row.tickets === 1 ? "ticket" : "tickets"}, ${money(row.revenue)}`, true)}
			{row.pending > 0 && (
				<Text fontSize="xs" color="#9C9C9C" pl="56px">
					+ {people(row.pending)} waiting for approval
				</Text>
			)}
		</Stack>
	)
}

export default MarketingLinksManager

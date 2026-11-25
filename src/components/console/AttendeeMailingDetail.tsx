import React, { useMemo, useState } from "react"
import axios from "axios"
import { DateTime } from "luxon"
import { useQuery } from "@tanstack/react-query"
import {
	Badge,
	Box,
	Button,
	Flex,
	HStack,
	Input,
	InputGroup,
	InputLeftElement,
	Modal,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalOverlay,
	Spinner,
	Text,
	VStack,
} from "@chakra-ui/react"
import { SearchIcon } from "@chakra-ui/icons"
import { buildBlastHtml, personalizeBlastHtml } from "@/lib/blast-template"
import { attachmentMode, blastImageContentId, type BlastAttachment } from "@/lib/blast-attachments"
import { describeDeliveryFailure, type BlastRecipientStatus } from "@/lib/blast-delivery"
import { eventUrl } from "@/lib/event-slug"
import { previewUnsubscribeLinks } from "@/lib/email-footer"

/**
 * Everything about one SENT Email Attendees email: what it said (rendered through the same
 * `buildBlastHtml` the send used), who it went to, and who didn't get it and why.
 *
 * Read-only — a sent email is history. "Use again" hands the id back to the page, which copies it
 * into the composer as a new email.
 */

const GROUP_LABEL: Record<string, string> = { booked: "Booked", pending: "Pending approval", invited: "Invited" }
const SOURCE_LABEL: Record<string, string> = { attendee: "From events", added: "Added", imported: "Imported" }
type Filter = "all" | "sent" | "failed"

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`

export default function AttendeeMailingDetail({
	id,
	onClose,
	onUseAgain,
}: {
	id: string | null
	onClose: () => void
	onUseAgain: (id: string) => void
}) {
	const [filter, setFilter] = useState<Filter>("all")
	const [search, setSearch] = useState("")

	const { data: record, isLoading, error } = useQuery<any>({
		queryKey: ["attendee-mailing", id],
		queryFn: async () => (await axios.get(`/api/admin/attendee-mail/${id}`)).data?.data,
		enabled: !!id,
	})

	const recipients: any[] = useMemo(() => record?.recipients || [], [record])
	const failedCount = recipients.filter((r) => r.status !== "sent").length
	const visible = useMemo(() => {
		const q = search.trim().toLowerCase()
		return recipients.filter((r) => {
			if (filter === "sent" && r.status !== "sent") return false
			if (filter === "failed" && r.status === "sent") return false
			if (!q) return true
			return String(r.email).includes(q) || String(r.name || "").toLowerCase().includes(q)
		})
	}, [recipients, filter, search])

	const origin = typeof window !== "undefined" ? window.location.origin : ""
	const promotedLink = record?.promotedEvent && !record.promotedEvent.removed && record.promotedEvent.slug ? eventUrl(origin, record.promotedEvent.slug) : ""

	// The email as it went out. Attached pictures are shown by their url (the real email used cid:).
	const html = useMemo(() => {
		if (!record) return ""
		const attachments: BlastAttachment[] = record.attachments || []
		const attached = attachments.filter((a) => attachmentMode(a) === "attach")
		let out = personalizeBlastHtml(
			buildBlastHtml({
				subject: record.subject || "",
				message: record.message || "",
				eventName: record.promotedEventName || "",
				eventLink: record.promotedEventId ? promotedLink || "#" : "",
				emailType: "custom",
				baseUrl: origin,
				greetByName: record.greetByName !== false,
				// Only when the email actually carried the link (absent on older sends).
				unsubscribe: !!record.unsubscribeGroupId,
				images: attached.map((a, i) => ({ contentId: blastImageContentId(i), filename: a.filename })),
				links: attachments.filter((a) => attachmentMode(a) === "link").map((a) => ({ url: a.url, filename: a.filename, size: a.size })),
			}),
			{ userName: "{name}", userEmail: "recipient@example.com" },
		)
		attached.forEach((a, i) => {
			out = out.replace(new RegExp(`cid:${blastImageContentId(i)}`, "g"), a.url)
		})
		return previewUnsubscribeLinks(out)
	}, [record, promotedLink, origin])

	const exportCsv = () => {
		const lines = [["Name", "Email", "Source", "Status", "Reason"].map(csvCell).join(",")]
		for (const r of recipients) {
			lines.push([r.name || "", r.email, SOURCE_LABEL[r.source] || r.source || "", r.status, r.reason || ""].map(csvCell).join(","))
		}
		const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }))
		const a = document.createElement("a")
		a.href = url
		a.download = `email-recipients-${(record?.subject || "email").replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.csv`
		a.click()
		URL.revokeObjectURL(url)
	}

	const close = () => {
		setFilter("all")
		setSearch("")
		onClose()
	}

	const label = (k: string, v: React.ReactNode) => (
		<Flex gap={2} fontSize="sm" direction={{ base: "column", md: "row" }}>
			<Text color="gray.500" minW="130px" flexShrink={0}>{k}</Text>
			<Box color="white" minW={0} overflowWrap="anywhere">{v}</Box>
		</Flex>
	)

	return (
		<Modal isOpen={!!id} onClose={close} size={{ base: "full", md: "4xl" }} scrollBehavior="inside">
			<ModalOverlay />
			<ModalContent bg="#1E1E1E" color="white" border={{ md: "1px solid #434343" }}>
				<ModalHeader pr={12}>{record?.subject || "Sent email"}</ModalHeader>
				<ModalCloseButton />
				<ModalBody>
					{isLoading ? (
						<HStack justify="center" py={10}><Spinner color="#F79432" /></HStack>
					) : error || !record ? (
						<Text color="red.400" textAlign="center" py={10}>Couldn&apos;t load this email.</Text>
					) : (
						<VStack align="stretch" spacing={6}>
							<VStack align="stretch" spacing={2} bg="#2A2A2A" borderRadius="lg" p={4}>
								{label("Sent", record.sentAt ? DateTime.fromISO(record.sentAt).toLocaleString(DateTime.DATETIME_MED) : "—")}
								{label("From", `${record.fromName || "Jetzy"} <${record.fromEmail || "usual Jetzy address"}>`)}
								{label("Sent by", record.sentByEmail || "—")}
								{label(
									"Linked event",
									record.promotedEvent ? (
										promotedLink ? (
											<a href={promotedLink} target="_blank" rel="noreferrer" style={{ color: "#F79432" }}>{record.promotedEvent.name}</a>
										) : (
											record.promotedEvent.name
										)
									) : (
										"None — plain email"
									),
								)}
								{label("People from", (record.sourceEvents || []).length ? record.sourceEvents.map((e: any) => e.name).join(", ") : "No events — typed or imported only")}
								{/* Groups only apply to people pulled from events. Older sends to typed addresses
								    alone stored the checkboxes' default, so this is gated on events, not on groups. */}
								{(record.sourceEvents || []).length > 0 &&
									label("Groups", (record.groups || []).length ? record.groups.map((g: string) => GROUP_LABEL[g] || g).join(", ") : "—")}
								{(record.attachments || []).length > 0 && label("Files", record.attachments.map((a: any) => a.filename).join(", "))}
								{label(
									"Delivery",
									<HStack spacing={2} flexWrap="wrap">
										<Badge colorScheme="green">{record.succeededCount ?? 0} sent</Badge>
										{failedCount > 0 && <Badge colorScheme="red">{failedCount} not sent</Badge>}
										<Text as="span" fontSize="xs" color="gray.500">of {record.recipientCount ?? recipients.length}</Text>
									</HStack>,
								)}
							</VStack>

							<Box>
								<Text fontWeight="bold" mb={2}>The email</Text>
								{/* Sandboxed: the body is author-written HTML (see blast-template.ts). */}
								<Box as="iframe" title="Email as sent" sandbox="" srcDoc={html} w="100%" h={{ base: "420px", md: "520px" }} bg="white" borderRadius="lg" border="0" />
							</Box>

							<Box>
								<Flex justify="space-between" align="center" mb={2} gap={2} wrap="wrap">
									<Text fontWeight="bold">Recipients ({recipients.length})</Text>
									<Button size="sm" variant="outline" borderColor="#444" color="white" _hover={{ bg: "#2A2A2A" }} onClick={exportCsv} isDisabled={!recipients.length}>
										Export CSV
									</Button>
								</Flex>
								<Flex gap={2} mb={3} direction={{ base: "column", md: "row" }}>
									<InputGroup flex="1">
										<InputLeftElement pointerEvents="none"><SearchIcon color="gray.500" /></InputLeftElement>
										<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email" bg="#090C10" borderColor="#444444" color="white" _placeholder={{ color: "gray.500" }} sx={{ "@media screen and (max-width: 47.99em)": { fontSize: "16px" } }} />
									</InputGroup>
									<HStack>
										{(["all", "sent", "failed"] as Filter[]).map((f) => (
											<Button key={f} size="sm" borderRadius="full" bg={filter === f ? "#F79432" : "transparent"} color={filter === f ? "black" : "white"} border="1px solid #444" _hover={{ bg: filter === f ? "#E68422" : "#2A2A2A" }} onClick={() => setFilter(f)}>
												{f === "all" ? "All" : f === "sent" ? "Sent" : `Not sent (${failedCount})`}
											</Button>
										))}
									</HStack>
								</Flex>
								<VStack align="stretch" spacing={2} maxH="420px" overflowY="auto">
									{visible.length === 0 ? (
										<Text color="gray.500" fontSize="sm" textAlign="center" py={6}>Nobody matches.</Text>
									) : (
										visible.slice(0, 500).map((r) => (
											<Box key={r.email} bg="#2A2A2A" borderRadius="md" p={3}>
												<Flex justify="space-between" gap={3} align="flex-start">
													<Box minW={0}>
														<Text fontSize="sm" noOfLines={1}>{r.name || r.email}</Text>
														{r.name && <Text fontSize="xs" color="gray.400" overflowWrap="anywhere">{r.email}</Text>}
														<Text fontSize="xs" color="gray.500">{SOURCE_LABEL[r.source] || r.source || ""}</Text>
													</Box>
													<Badge colorScheme={r.status === "sent" ? "green" : "red"} flexShrink={0}>{r.status === "sent" ? "Sent" : "Not sent"}</Badge>
												</Flex>
												{r.status !== "sent" && (
													<Box mt={2}>
														<Text fontSize="xs" color="gray.300">{describeDeliveryFailure(r.status as BlastRecipientStatus, r.reason)}</Text>
														{r.reason && <Text fontSize="2xs" color="gray.500" mt={1} overflowWrap="anywhere">{r.reason}</Text>}
													</Box>
												)}
											</Box>
										))
									)}
									{visible.length > 500 && <Text fontSize="xs" color="gray.500" textAlign="center">Showing 500 of {visible.length} — search or export the CSV for the rest.</Text>}
								</VStack>
							</Box>
						</VStack>
					)}
				</ModalBody>
				<ModalFooter gap={3}>
					<Button variant="outline" borderColor="#444" color="white" _hover={{ bg: "#2A2A2A" }} onClick={close}>Close</Button>
					<Button bg="#F79432" color="black" _hover={{ bg: "#E68422" }} isDisabled={!record} onClick={() => id && onUseAgain(id)}>
						Use again
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
	)
}

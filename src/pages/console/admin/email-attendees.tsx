import ConsoleLayout from "@Jetzy/components/layout/ConsoleLayout"
import { adminOnly } from "@Jetzy/lib/authSession"
import { GetServerSideProps } from "next"
import Head from "next/head"
import React, { useEffect, useMemo, useRef, useState } from "react"
import axios from "axios"
import { DateTime } from "luxon"
import { useSession } from "next-auth/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
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
	Checkbox,
	Collapse,
	Flex,
	HStack,
	Input,
	InputGroup,
	InputLeftElement,
	Spinner,
	Text,
	VStack,
	useToast,
} from "@chakra-ui/react"
import { SearchIcon } from "@chakra-ui/icons"
import RichTextEditor from "@/components/misc/RichTextEditor"
import BlastAttachmentPicker from "@/components/console/BlastAttachmentPicker"
import BlastPreviewModal from "@/components/console/BlastPreviewModal"
import EmailListInput, { emailListHasProblem } from "@/components/console/EmailListInput"
import GuestImportPanel from "@/components/events/GuestImportPanel"
import { ATTENDEE_MAIL_MAX, parseEmailList } from "@/lib/email-list"
import { guestEmailKey, type ImportedGuest } from "@/lib/guest-import"
import { eventUrl } from "@/lib/event-slug"
import type { BlastAttachment } from "@/lib/blast-attachments"
import { describeDeliveryFailure, type BlastRecipientStatus } from "@/lib/blast-delivery"
import { stripHtml } from "@/utils/text"

/**
 * Admin only — email the people from past events about a NEW event.
 *
 * Pick the events to draw from and which groups count (booked / pending approval / invited);
 * everyone found is ticked. Add more by typing addresses or importing a spreadsheet, untick anyone,
 * pick the event being promoted (it prefills the subject and message, both editable), preview, send.
 *
 * Sends through `/api/admin/attendee-mail/send` and is recorded in `admin-attendee-mailings` —
 * never in an event's Blasts tab, which is the host's history.
 */

type Group = "booked" | "pending" | "invited"
type EventOption = {
	_id: string
	name: string
	slug: string
	startsOn: string | null
	endsOn: string | null
	timezone: string
	location: string
	summary: string
	privacy: string
	status: string
	datePoll: boolean
}
type Attendee = { email: string; name: string; sources: { eventId: string; eventName: string; group: Group }[] }
type Extra = { email: string; name: string; source: "added" | "imported" }
type Row = { email: string; name: string; source: "attendee" | "added" | "imported"; labels: string[] }

const GROUP_LABEL: Record<Group, string> = { booked: "Booked", pending: "Pending approval", invited: "Invited" }
const PHONE = "@media screen and (max-width: 47.99em)"
const inputSx = { [PHONE]: { fontSize: "16px" } }

const card = { bg: "#1E1E1E", border: "1px solid #434343", borderRadius: "2xl", p: { base: 4, md: 5 }, mb: 5 }

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const eventDateLine = (e: EventOption): string => {
	if (e.datePoll) return "Date to be decided — vote on the event page"
	if (!e.startsOn) return ""
	const start = DateTime.fromISO(e.startsOn, e.timezone ? { zone: e.timezone } : {})
	if (!start.isValid) return ""
	return start.toFormat("cccc, LLLL d, yyyy 'at' h:mm a ZZZZ")
}

const prefillFor = (e: EventOption) => {
	const when = eventDateLine(e)
	const parts = [`<p>We'd love to see you at <strong>${escapeHtml(e.name)}</strong>.</p>`]
	const details = [when && `<strong>When:</strong> ${escapeHtml(when)}`, e.location && `<strong>Where:</strong> ${escapeHtml(e.location)}`].filter(Boolean)
	if (details.length) parts.push(`<p>${details.join("<br>")}</p>`)
	if (e.summary) parts.push(`<p>${escapeHtml(e.summary)}</p>`)
	return { subject: `You're invited: ${e.name}`, message: parts.join("") }
}

/** Debounced event search shared by both pickers. */
function useEventSearch(search: string) {
	const [debounced, setDebounced] = useState(search)
	useEffect(() => {
		const t = setTimeout(() => setDebounced(search.trim()), 250)
		return () => clearTimeout(t)
	}, [search])
	return useQuery<EventOption[]>({
		queryKey: ["attendee-mail-events", debounced],
		queryFn: async () => (await axios.get("/api/admin/attendee-mail/events", { params: { search: debounced } })).data?.data || [],
		staleTime: 30_000,
	})
}

function EventPicker({
	selectedIds,
	onToggle,
	placeholder,
}: {
	selectedIds: string[]
	onToggle: (e: EventOption) => void
	placeholder: string
}) {
	const [search, setSearch] = useState("")
	const { data: events = [], isFetching } = useEventSearch(search)
	return (
		<Box>
			<InputGroup mb={2}>
				<InputLeftElement pointerEvents="none">
					<SearchIcon color="gray.500" />
				</InputLeftElement>
				<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={placeholder} bg="#090C10" borderColor="#444444" color="white" _placeholder={{ color: "gray.500" }} autoComplete="off" sx={inputSx} />
			</InputGroup>
			<Box maxH="260px" overflowY="auto" border="1px solid #333" borderRadius="lg">
				{isFetching && events.length === 0 ? (
					<HStack justify="center" py={6}><Spinner size="sm" color="#F79432" /></HStack>
				) : events.length === 0 ? (
					<Text color="gray.500" fontSize="sm" textAlign="center" py={6}>No events match.</Text>
				) : (
					events.map((e) => {
						const checked = selectedIds.includes(e._id)
						const when = e.startsOn ? DateTime.fromISO(e.startsOn).toFormat("LLL d, yyyy") : e.datePoll ? "Date poll" : "No date"
						return (
							<Flex key={e._id} as="button" type="button" w="100%" textAlign="left" align="center" gap={3} px={3} py={2} borderBottom="1px solid #2a2a2a" bg={checked ? "rgba(247,148,50,0.10)" : "transparent"} _hover={{ bg: "whiteAlpha.50" }} onClick={() => onToggle(e)}>
								<Checkbox isChecked={checked} pointerEvents="none" colorScheme="orange" />
								<Box minW={0} flex="1">
									<Text fontSize="sm" color="white" noOfLines={1}>{e.name}</Text>
									<Text fontSize="xs" color="gray.500">
										{when}
										{e.privacy === "private" ? " · Private" : ""}
										{e.status === "draft" ? " · Draft" : ""}
									</Text>
								</Box>
							</Flex>
						)
					})
				)}
			</Box>
		</Box>
	)
}

export default function EmailAttendeesPage() {
	const toast = useToast({ position: "top" })
	const queryClient = useQueryClient()
	const { data: session } = useSession()

	// ---- 1 + 2: where people come from ----
	const [sourceEvents, setSourceEvents] = useState<EventOption[]>([])
	const [groups, setGroups] = useState<Group[]>(["booked", "pending", "invited"])
	const sourceIds = sourceEvents.map((e) => e._id)

	const { data: attendees = [], isFetching: loadingAttendees } = useQuery<Attendee[]>({
		queryKey: ["attendee-mail-recipients", sourceIds.join(","), groups.join(",")],
		queryFn: async () =>
			(await axios.get("/api/admin/attendee-mail/recipients", { params: { eventIds: sourceIds.join(","), groups: groups.join(",") } })).data?.data || [],
		enabled: sourceIds.length > 0 && groups.length > 0,
		staleTime: 30_000,
	})

	// ---- 3: the list ----
	const [extras, setExtras] = useState<Extra[]>([])
	const [typed, setTyped] = useState("")
	// Unticked people, by address. Kept as EXCLUSIONS so a refetch (another event picked) keeps
	// everyone new ticked and everyone the admin unticked still unticked.
	const [excluded, setExcluded] = useState<Set<string>>(new Set())
	const [listSearch, setListSearch] = useState("")

	const rows: Row[] = useMemo(() => {
		const out: Row[] = []
		const seen = new Set<string>()
		const activeAttendees = sourceIds.length > 0 && groups.length > 0 ? attendees : []
		for (const a of activeAttendees) {
			seen.add(a.email)
			out.push({ email: a.email, name: a.name, source: "attendee", labels: a.sources.map((s) => `${s.eventName} · ${GROUP_LABEL[s.group]}`) })
		}
		for (const x of extras) {
			const key = guestEmailKey(x.email)
			if (seen.has(key)) continue
			seen.add(key)
			out.push({ email: key, name: x.name, source: x.source, labels: [x.source === "added" ? "Added" : "Imported"] })
		}
		return out
	}, [attendees, extras, sourceIds.length, groups.length])

	const selectedRows = rows.filter((r) => !excluded.has(r.email))
	const visibleRows = useMemo(() => {
		const q = listSearch.trim().toLowerCase()
		if (!q) return rows
		return rows.filter((r) => r.email.includes(q) || r.name.toLowerCase().includes(q) || r.labels.some((l) => l.toLowerCase().includes(q)))
	}, [rows, listSearch])
	const ROW_LIMIT = 300

	const toggleRow = (email: string) =>
		setExcluded((prev) => {
			const next = new Set(prev)
			if (next.has(email)) next.delete(email)
			else next.add(email)
			return next
		})

	const addTyped = () => {
		const { emails, invalid } = parseEmailList(typed)
		if (invalid.length > 0 || emails.length === 0) return
		setExtras((prev) => [...prev, ...emails.map((email) => ({ email, name: "", source: "added" as const }))])
		// A re-added address is wanted: take it back out of the unticked set.
		setExcluded((prev) => {
			const next = new Set(prev)
			emails.forEach((e) => next.delete(e))
			return next
		})
		setTyped("")
	}

	const addImported = (guests: ImportedGuest[]) => {
		setExtras((prev) => [...prev, ...guests.map((g) => ({ email: guestEmailKey(g.email), name: g.name, source: "imported" as const }))])
		setExcluded((prev) => {
			const next = new Set(prev)
			guests.forEach((g) => next.delete(guestEmailKey(g.email)))
			return next
		})
	}

	// ---- 4: the email ----
	const [promoted, setPromoted] = useState<EventOption | null>(null)
	const [subject, setSubject] = useState("")
	const [message, setMessage] = useState("")
	const [greetByName, setGreetByName] = useState(true)
	const [attachments, setAttachments] = useState<BlastAttachment[]>([])
	const [uploading, setUploading] = useState(false)
	// What the last prefill wrote. Picking another event replaces the text only while it is still
	// exactly that (compared as plain text — the editor normalises the HTML it is given), so an
	// admin's own edits are never silently thrown away.
	const lastPrefill = useRef<{ subject: string; text: string } | null>(null)

	const pickPromoted = (e: EventOption) => {
		const isSame = promoted?._id === e._id
		setPromoted(isSame ? null : e)
		if (isSame) return
		const untouched =
			(!subject.trim() && !stripHtml(message).trim()) ||
			(!!lastPrefill.current && subject === lastPrefill.current.subject && stripHtml(message).trim() === lastPrefill.current.text)
		if (untouched) {
			const next = prefillFor(e)
			setSubject(next.subject)
			setMessage(next.message)
			lastPrefill.current = { subject: next.subject, text: stripHtml(next.message).trim() }
		}
	}

	// ---- 5: preview + send ----
	const [previewOpen, setPreviewOpen] = useState(false)
	const [confirmOpen, setConfirmOpen] = useState(false)
	const [sending, setSending] = useState(false)
	const cancelRef = useRef<HTMLButtonElement>(null)
	const promotedLink = promoted ? eventUrl(typeof window !== "undefined" ? window.location.origin : "", promoted.slug) : ""

	const blockers = [
		!promoted && "pick the event this email is about",
		!subject.trim() && "add a subject",
		!stripHtml(message).trim() && "write a message",
		selectedRows.length === 0 && "select at least one person",
		selectedRows.length > ATTENDEE_MAIL_MAX && `select at most ${ATTENDEE_MAIL_MAX} people`,
		uploading && "wait for the upload to finish",
	].filter(Boolean) as string[]

	const payload = () => ({
		promotedEventId: promoted?._id,
		subject,
		message,
		greetByName,
		attachments,
		sourceEventIds: sourceIds,
		groups,
	})

	const send = async () => {
		setSending(true)
		try {
			const res = await axios.post("/api/admin/attendee-mail/send", {
				...payload(),
				recipients: selectedRows.map((r) => ({ email: r.email, name: r.name, source: r.source })),
			})
			toast({ title: res.status === 207 ? "Partly sent" : "Email sent", description: res.data?.message, status: res.status === 207 ? "warning" : "success", duration: 5000, isClosable: true })
			setConfirmOpen(false)
			queryClient.invalidateQueries({ queryKey: ["attendee-mailings"] })
		} catch (err: any) {
			toast({ title: "Not sent", description: err?.response?.data?.error || "Something went wrong.", status: "error", duration: 6000, isClosable: true })
		}
		setSending(false)
	}

	// ---- history ----
	const { data: history = [] } = useQuery<any[]>({
		queryKey: ["attendee-mailings"],
		queryFn: async () => (await axios.get("/api/admin/attendee-mail")).data?.data || [],
	})
	const [openHistory, setOpenHistory] = useState<string | null>(null)

	return (
		<>
			<Head>
				<title>Email Attendees | Jetzy Events</title>
			</Head>
			<ConsoleLayout maxW="100%">
				<Box maxW="900px" mx="auto" px={{ base: 4, md: 0 }} py={6} color="white">
					<Text fontSize={{ base: "xl", md: "2xl" }} fontWeight="bold">Email Attendees</Text>
					<Text color="gray.400" fontSize="sm" mb={6}>
						Tell people from past events about a new one. Pick the events to draw from, check who is on the list, write the email, send.
					</Text>

					{/* 1 */}
					<Box {...card}>
						<Text fontWeight="bold" mb={1}>1. Pull people from these events</Text>
						<Text fontSize="xs" color="gray.400" mb={3}>Pick one or more. Someone who was at several gets one email.</Text>
						{sourceEvents.length > 0 && (
							<Flex gap={2} wrap="wrap" mb={3}>
								{sourceEvents.map((e) => (
									<Badge key={e._id} colorScheme="orange" variant="subtle" px={2} py={1} borderRadius="md" display="flex" alignItems="center" gap={1} textTransform="none" maxW="100%">
										<Text as="span" noOfLines={1}>{e.name}</Text>
										<Box as="button" type="button" aria-label={`Remove ${e.name}`} onClick={() => setSourceEvents((p) => p.filter((x) => x._id !== e._id))} px={1}>×</Box>
									</Badge>
								))}
							</Flex>
						)}
						<EventPicker
							selectedIds={sourceIds}
							placeholder="Search events…"
							onToggle={(e) => setSourceEvents((p) => (p.some((x) => x._id === e._id) ? p.filter((x) => x._id !== e._id) : [...p, e]))}
						/>
					</Box>

					{/* 2 */}
					<Box {...card}>
						<Text fontWeight="bold" mb={3}>2. Who to include from those events</Text>
						<Flex gap={{ base: 3, md: 6 }} direction={{ base: "column", md: "row" }}>
							{(Object.keys(GROUP_LABEL) as Group[]).map((g) => (
								<Checkbox key={g} colorScheme="orange" isChecked={groups.includes(g)} onChange={(e) => setGroups((p) => (e.target.checked ? [...p, g] : p.filter((x) => x !== g)))}>
									<Text fontSize="sm">
										{GROUP_LABEL[g]}
										<Text as="span" color="gray.500" fontSize="xs">
											{g === "booked" ? " — has a ticket (incl. checked in)" : g === "pending" ? " — asked for a ticket, awaiting approval" : " — was sent an email invitation"}
										</Text>
									</Text>
								</Checkbox>
							))}
						</Flex>
					</Box>

					{/* 3 */}
					<Box {...card}>
						<Flex justify="space-between" align="baseline" wrap="wrap" gap={2} mb={3}>
							<Text fontWeight="bold">3. Recipients</Text>
							<Text fontSize="sm" color={selectedRows.length > ATTENDEE_MAIL_MAX ? "#FC8181" : "#F79432"}>
								{selectedRows.length} of {rows.length} selected
								{selectedRows.length > ATTENDEE_MAIL_MAX ? ` · at most ${ATTENDEE_MAIL_MAX}` : ""}
							</Text>
						</Flex>

						{rows.length > 0 && (
							<Flex gap={2} mb={2} direction={{ base: "column", md: "row" }}>
								<InputGroup flex="1">
									<InputLeftElement pointerEvents="none"><SearchIcon color="gray.500" /></InputLeftElement>
									<Input value={listSearch} onChange={(e) => setListSearch(e.target.value)} placeholder="Search the list" bg="#090C10" borderColor="#444444" color="white" _placeholder={{ color: "gray.500" }} sx={inputSx} />
								</InputGroup>
								<HStack>
									<Button size="sm" variant="outline" borderColor="#444" color="white" _hover={{ bg: "#2A2A2A" }} onClick={() => setExcluded(new Set())}>Select all</Button>
									<Button size="sm" variant="outline" borderColor="#444" color="white" _hover={{ bg: "#2A2A2A" }} onClick={() => setExcluded(new Set(rows.map((r) => r.email)))}>Select none</Button>
								</HStack>
							</Flex>
						)}

						<Box maxH="380px" overflowY="auto" border="1px solid #333" borderRadius="lg" mb={4}>
							{loadingAttendees && rows.length === 0 ? (
								<HStack justify="center" py={8}><Spinner color="#F79432" /><Text color="gray.400" fontSize="sm">Loading people…</Text></HStack>
							) : rows.length === 0 ? (
								<Text color="gray.500" fontSize="sm" textAlign="center" py={8} px={4}>
									{sourceIds.length === 0 ? "Pick an event above, or add people below." : groups.length === 0 ? "Tick at least one group above." : "Nobody found for those events and groups."}
								</Text>
							) : (
								<>
									{visibleRows.slice(0, ROW_LIMIT).map((r) => (
										<Flex key={r.email} as="label" align="flex-start" gap={3} px={3} py={2} borderBottom="1px solid #2a2a2a" cursor="pointer" _hover={{ bg: "whiteAlpha.50" }}>
											<Checkbox mt={1} colorScheme="orange" isChecked={!excluded.has(r.email)} onChange={() => toggleRow(r.email)} />
											<Box minW={0} flex="1">
												<Text fontSize="sm" color="white" noOfLines={1}>{r.name || r.email}</Text>
												{r.name && <Text fontSize="xs" color="gray.400" noOfLines={1} overflowWrap="anywhere">{r.email}</Text>}
												<Text fontSize="xs" color="gray.500" noOfLines={2}>{r.labels.join(" · ")}</Text>
											</Box>
										</Flex>
									))}
									{visibleRows.length > ROW_LIMIT && (
										<Text fontSize="xs" color="gray.500" textAlign="center" py={2}>
											Showing {ROW_LIMIT} of {visibleRows.length} — search to find someone. Everyone ticked is included.
										</Text>
									)}
								</>
							)}
						</Box>

						<Text fontWeight="bold" fontSize="sm" mb={2}>Add more people</Text>
						<EmailListInput value={typed} onChange={setTyped} label="Type addresses" help="Separate addresses with commas, then press Add." />
						<Button mt={2} mb={4} size="sm" bg="#F79432" color="black" _hover={{ bg: "#E68422" }} isDisabled={!parseEmailList(typed).emails.length || emailListHasProblem(typed)} onClick={addTyped}>
							Add {parseEmailList(typed).emails.length || ""}
						</Button>
						<GuestImportPanel onAdd={addImported} />
					</Box>

					{/* 4 */}
					<Box {...card}>
						<Text fontWeight="bold" mb={1}>4. The new event</Text>
						<Text fontSize="xs" color="gray.400" mb={3}>The email gets this event&apos;s name and a &quot;View Event Details&quot; button. Picking it fills in the subject and message — edit them freely.</Text>
						{promoted && (
							<Box bg="rgba(247,148,50,0.10)" border="1px solid #F79432" borderRadius="lg" px={3} py={2} mb={3}>
								<Text fontSize="sm" fontWeight="semibold" noOfLines={1}>{promoted.name}</Text>
								<Text fontSize="xs" color="gray.400" overflowWrap="anywhere">{eventDateLine(promoted) || "No date set"}</Text>
							</Box>
						)}
						<EventPicker selectedIds={promoted ? [promoted._id] : []} placeholder="Search for the new event…" onToggle={pickPromoted} />

						<Text fontWeight="bold" mt={5} mb={1}>Subject</Text>
						<Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" bg="#090C10" borderColor="#444444" color="white" _placeholder={{ color: "gray.500" }} mb={4} sx={inputSx} />
						<Text fontWeight="bold" mb={1}>Message</Text>
						<Box mb={3} sx={{ ".ql-container": { minHeight: "180px" } }}>
							<RichTextEditor hideImageButton value={message} onChange={(val) => setMessage(val)} placeholder="Write your message…" />
						</Box>
						<Checkbox isChecked={greetByName} onChange={(e) => setGreetByName(e.target.checked)} mb={3} color="gray.300" size="sm" colorScheme="orange">
							Greet each person by name
						</Checkbox>
						<BlastAttachmentPicker attachments={attachments} onChange={setAttachments} onUploadingChange={setUploading} />
					</Box>

					{/* 5 */}
					<Box {...card}>
						{blockers.length > 0 && (
							<Text fontSize="sm" color="gray.400" mb={3}>To send: {blockers.join(", ")}.</Text>
						)}
						<Flex gap={3} direction={{ base: "column", md: "row" }} justify="flex-end">
							<Button variant="outline" borderColor="#444444" color="white" _hover={{ bg: "#2A2A2A" }} isDisabled={!promoted || !stripHtml(message).trim()} onClick={() => setPreviewOpen(true)}>
								Preview &amp; test
							</Button>
							<Button bg="#F79432" color="black" _hover={{ bg: "#E68422" }} isDisabled={blockers.length > 0} onClick={() => setConfirmOpen(true)}>
								Send to {selectedRows.length} {selectedRows.length === 1 ? "person" : "people"}
							</Button>
						</Flex>
					</Box>

					{/* History */}
					<Box {...card}>
						<Text fontWeight="bold" mb={3}>Sent</Text>
						{history.length === 0 ? (
							<Text fontSize="sm" color="gray.500">Nothing sent from here yet.</Text>
						) : (
							<VStack align="stretch" spacing={2}>
								{history.map((m) => {
									const failedRows = (m.recipients || []).filter((r: any) => r.status !== "sent")
									const isOpen = openHistory === m._id
									return (
										<Box key={m._id} bg="#2A2A2A" borderRadius="md" p={3}>
											<Text fontSize="sm" fontWeight="semibold" noOfLines={1}>{m.subject}</Text>
											<Text fontSize="xs" color="gray.400">
												{m.promotedEventName ? `About ${m.promotedEventName} · ` : ""}
												{m.succeededCount}/{m.recipientCount} sent
												{m.sentAt ? ` · ${DateTime.fromISO(m.sentAt).toLocaleString(DateTime.DATETIME_MED)}` : ""}
												{m.sentByEmail ? ` · by ${m.sentByEmail}` : ""}
											</Text>
											{failedRows.length > 0 && (
												<>
													<Text as="button" type="button" fontSize="xs" color="#F79432" fontWeight="bold" mt={1} onClick={() => setOpenHistory(isOpen ? null : m._id)}>
														{isOpen ? "Hide" : `${failedRows.length} not sent — see why`}
													</Text>
													<Collapse in={isOpen} animateOpacity>
														<VStack align="stretch" spacing={1} mt={2}>
															{failedRows.map((r: any) => (
																<Box key={r.email}>
																	<Text fontSize="xs" color="white" overflowWrap="anywhere">{r.name ? `${r.name} · ` : ""}{r.email}</Text>
																	<Text fontSize="xs" color="gray.400">{describeDeliveryFailure(r.status as BlastRecipientStatus, r.reason)}</Text>
																</Box>
															))}
														</VStack>
													</Collapse>
												</>
											)}
										</Box>
									)
								})}
							</VStack>
						)}
					</Box>
				</Box>

				<BlastPreviewModal
					isOpen={previewOpen}
					onClose={() => setPreviewOpen(false)}
					subject={subject || "(no subject)"}
					message={message}
					eventName={promoted?.name || ""}
					eventLink={promotedLink}
					event={promoted}
					emailType="custom"
					attachments={attachments}
					greetByName={greetByName}
					targetType="all"
					status="all"
					hostName={(session?.user as any)?.name}
					hostEmail={(session?.user as any)?.email}
					onSendTest={async (testTo) => (await axios.post("/api/admin/attendee-mail/send", { ...payload(), testTo })).data}
				/>

				<AlertDialog isOpen={confirmOpen} leastDestructiveRef={cancelRef} onClose={() => !sending && setConfirmOpen(false)} isCentered>
					<AlertDialogOverlay>
						<AlertDialogContent bg="#1E1E1E" color="white" mx={4}>
							<AlertDialogHeader>Send to {selectedRows.length} {selectedRows.length === 1 ? "person" : "people"}?</AlertDialogHeader>
							<AlertDialogBody>
								<Text fontSize="sm" color="gray.300">
									&ldquo;{subject}&rdquo; about <strong>{promoted?.name}</strong> goes out now, from Jetzy. This can&apos;t be undone.
								</Text>
							</AlertDialogBody>
							<AlertDialogFooter gap={3}>
								<Button ref={cancelRef} variant="outline" borderColor="#444" color="white" _hover={{ bg: "#2A2A2A" }} onClick={() => setConfirmOpen(false)} isDisabled={sending}>
									Cancel
								</Button>
								<Button bg="#F79432" color="black" _hover={{ bg: "#E68422" }} isLoading={sending} onClick={send}>
									Send
								</Button>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialogOverlay>
				</AlertDialog>
			</ConsoleLayout>
		</>
	)
}

export const getServerSideProps: GetServerSideProps = async (context) => {
	return await adminOnly(context)
}

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
import EmailBodyNotice from "@/components/console/EmailBodyNotice"
import GuestImportPanel from "@/components/events/GuestImportPanel"
import AttendeeMailingDetail from "@/components/console/AttendeeMailingDetail"
import { ATTENDEE_MAIL_MAX, parseEmailList } from "@/lib/email-list"
import { guestEmailKey, type ImportedGuest } from "@/lib/guest-import"
import { eventUrl } from "@/lib/event-slug"
import type { BlastAttachment } from "@/lib/blast-attachments"
import { stripHtml } from "@/utils/text"
import { formatEventDate, formatEventTime, formatEventZoneLabel } from "@/utils/eventTime"

/**
 * Admin only — email the people from past events about a NEW event.
 *
 * Pick the events to draw from and which groups count (booked / pending approval / invited);
 * everyone found is ticked. Add more by typing addresses or importing a spreadsheet, untick anyone,
 * optionally link the event being promoted (it prefills the subject and message, both editable, and
 * adds a "View Event Details" button), preview, send. Without a linked event it is a plain email.
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
type AttendeeSource = { eventId: string; eventName: string; group: Group; inviteStatus?: string; inviteVia?: "email" | "app" }
type Attendee = { email: string; name: string; sources: AttendeeSource[] }
type Extra = { email: string; name: string; source: "added" | "imported" }
type Row = { email: string; name: string; source: "attendee" | "added" | "imported"; labels: string[] }

const GROUP_LABEL: Record<Group, string> = { booked: "Booked", pending: "Pending approval", invited: "Invited" }

/** "Picnic · Invited (accepted) · in app" — an invitation's answer is shown so the admin can untick. */
const sourceLabel = (s: AttendeeSource) => {
	const answer = s.group === "invited" && s.inviteStatus ? ` (${s.inviteStatus})` : ""
	const via = s.group === "invited" && s.inviteVia === "app" ? " · in app" : ""
	return `${s.eventName} · ${GROUP_LABEL[s.group]}${answer}${via}`
}
const PHONE = "@media screen and (max-width: 47.99em)"
const inputSx = { [PHONE]: { fontSize: "16px" } }

const card = { bg: "#1E1E1E", border: "1px solid #434343", borderRadius: "2xl", p: { base: 4, md: 5 }, mb: 5 }

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/**
 * "November 23, 2026 at 01:00 PM (UTC+05:00) Asia/Karachi" — in the EVENT's zone, through the same
 * `eventTime.ts` formatters the event page and cards use, so the email states the time guests see.
 *
 * Never hand `event.timezone` to a date library raw: most events store the picker LABEL
 * ("(UTC+05:00) Asia/Karachi"), which luxon/Intl reject — the card used to read "No date set".
 * `getEventZone` (inside these helpers) extracts the real zone.
 */
const eventDateLine = (e: EventOption): string => {
	if (e.datePoll) return "Date to be decided — vote on the event page"
	if (!e.startsOn) return ""
	const tz = e.timezone || "UTC"
	return `${formatEventDate(e.startsOn, tz)} at ${formatEventTime(e.startsOn, tz)} ${formatEventZoneLabel(tz)}`
}

/** Short date for the picker rows, also in the event's zone. */
const eventShortDate = (e: EventOption): string =>
	e.startsOn ? formatEventDate(e.startsOn, e.timezone || "UTC") : e.datePoll ? "Date poll" : "No date"

const prefillFor = (e: EventOption) => {
	const when = eventDateLine(e)
	const parts = [`<p>We'd love to see you at <strong>${escapeHtml(e.name)}</strong>.</p>`]
	const details = [when && `<strong>When:</strong> ${escapeHtml(when)}`, e.location && `<strong>Where:</strong> ${escapeHtml(e.location)}`].filter(Boolean)
	if (details.length) parts.push(`<p>${details.join("<br>")}</p>`)
	if (e.summary) parts.push(`<p>${escapeHtml(e.summary)}</p>`)
	return { subject: `You're invited: ${e.name}`, message: parts.join("") }
}

/**
 * What the composer holds, as one comparable string — "Unsaved changes" is `snapshot !== saved`.
 * The message is compared as PLAIN TEXT: the editor re-normalises HTML it is handed, which would
 * otherwise mark a just-opened draft as changed.
 */
function composerSnapshot(v: {
	sourceIds: string[]
	groups: Group[]
	extras: Extra[]
	excluded: Set<string>
	promotedId?: string
	subject: string
	message: string
	greetByName: boolean
	attachments: BlastAttachment[]
}): string {
	return JSON.stringify({
		s: [...v.sourceIds].sort(),
		g: [...v.groups].sort(),
		x: v.extras.map((e) => `${e.email}|${e.name}`).sort(),
		e: Array.from(v.excluded).sort(),
		p: v.promotedId || "",
		sub: v.subject.trim(),
		m: stripHtml(v.message).trim(),
		gr: v.greetByName,
		a: v.attachments.map((a) => `${a.url}|${a.mode || ""}`),
	})
}

const DEFAULT_GROUPS: Group[] = ["booked", "pending", "invited"]

const EMPTY_SNAPSHOT = composerSnapshot({
	sourceIds: [],
	groups: DEFAULT_GROUPS,
	extras: [],
	excluded: new Set(),
	subject: "",
	message: "",
	greetByName: true,
	attachments: [],
})

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
						const when = eventShortDate(e)
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
			out.push({ email: a.email, name: a.name, source: "attendee", labels: a.sources.map(sourceLabel) })
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
		!subject.trim() && "add a subject",
		!stripHtml(message).trim() && "write a message",
		selectedRows.length === 0 && "select at least one person",
		selectedRows.length > ATTENDEE_MAIL_MAX && `select at most ${ATTENDEE_MAIL_MAX} people`,
		uploading && "wait for the upload to finish",
	].filter(Boolean) as string[]

	const payload = () => ({
		// Absent = no event linked: the email goes out with no button.
		promotedEventId: promoted?._id || undefined,
		subject,
		message,
		greetByName,
		attachments,
		sourceEventIds: sourceIds,
		groups,
	})

	// ---- drafts: what was last saved/loaded, so "Unsaved changes" means something ----
	const [draftId, setDraftId] = useState<string | null>(null)
	const [savedAt, setSavedAt] = useState<string | null>(null)
	const [savingDraft, setSavingDraft] = useState(false)
	// "Use again" loads a COPY — this names what it was copied from, for the banner.
	const [loadedFrom, setLoadedFrom] = useState<string | null>(null)
	const snapshot = composerSnapshot({ sourceIds, groups, extras, excluded, promotedId: promoted?._id, subject, message, greetByName, attachments })
	const [savedSnapshot, setSavedSnapshot] = useState(EMPTY_SNAPSHOT)
	const dirty = snapshot !== savedSnapshot
	const isBlank = snapshot === EMPTY_SNAPSHOT

	// Closing the tab with unsaved work gets the browser's own prompt.
	useEffect(() => {
		if (!dirty) return
		const onUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault()
			e.returnValue = ""
		}
		window.addEventListener("beforeunload", onUnload)
		return () => window.removeEventListener("beforeunload", onUnload)
	}, [dirty])

	const resetComposer = () => {
		setSourceEvents([])
		setGroups(DEFAULT_GROUPS)
		setExtras([])
		setTyped("")
		setExcluded(new Set())
		setListSearch("")
		setPromoted(null)
		setSubject("")
		setMessage("")
		setGreetByName(true)
		setAttachments([])
		setDraftId(null)
		setSavedAt(null)
		setLoadedFrom(null)
		setSavedSnapshot(EMPTY_SNAPSHOT)
		lastPrefill.current = null
	}

	const refreshLists = () => queryClient.invalidateQueries({ queryKey: ["attendee-mailings"] })

	const saveDraft = async () => {
		setSavingDraft(true)
		try {
			const body = { ...payload(), extraPeople: extras, excludedEmails: Array.from(excluded) }
			const res = draftId
				? await axios.put(`/api/admin/attendee-mail/${draftId}`, body)
				: await axios.post("/api/admin/attendee-mail/drafts", body)
			setDraftId(res.data?.data?._id || draftId)
			setSavedAt(res.data?.data?.updatedAt || new Date().toISOString())
			setSavedSnapshot(snapshot)
			setLoadedFrom(null)
			refreshLists()
			toast({ title: "Draft saved", status: "success", duration: 2500 })
		} catch (err: any) {
			// Deleted elsewhere (another admin or tab): the next save creates a new draft.
			if (err?.response?.status === 404 || err?.response?.status === 409) setDraftId(null)
			toast({ title: "Draft not saved", description: err?.response?.data?.error || "Something went wrong.", status: "error", duration: 5000, isClosable: true })
		}
		setSavingDraft(false)
	}

	const send = async () => {
		setSending(true)
		try {
			const res = await axios.post("/api/admin/attendee-mail/send", {
				...payload(),
				recipients: selectedRows.map((r) => ({ email: r.email, name: r.name, source: r.source })),
				...(draftId ? { draftId } : {}),
			})
			toast({ title: res.status === 207 ? "Partly sent" : "Email sent", description: res.data?.message, status: res.status === 207 ? "warning" : "success", duration: 5000, isClosable: true })
			setConfirmOpen(false)
			// It now lives under Sent (and its draft, if any, is gone). Start clean.
			resetComposer()
			refreshLists()
		} catch (err: any) {
			toast({ title: "Not sent", description: err?.response?.data?.error || "Something went wrong.", status: "error", duration: 6000, isClosable: true })
		}
		setSending(false)
	}

	// ---- Discard ----
	const [discardOpen, setDiscardOpen] = useState(false)
	const [discarding, setDiscarding] = useState(false)
	const discardRef = useRef<HTMLButtonElement>(null)
	const discard = async () => {
		setDiscarding(true)
		try {
			if (draftId) await axios.delete(`/api/admin/attendee-mail/${draftId}`)
			resetComposer()
			refreshLists()
			setDiscardOpen(false)
		} catch (err: any) {
			if (err?.response?.status === 404) {
				// Already gone — the outcome asked for.
				resetComposer()
				refreshLists()
				setDiscardOpen(false)
			} else {
				toast({ title: "Not discarded", description: err?.response?.data?.error || "Something went wrong.", status: "error", duration: 5000, isClosable: true })
			}
		}
		setDiscarding(false)
	}

	// ---- Open a draft / Use a sent email again ----
	// `id: ""` = "Start a new email" (clear the composer) behind the same confirm.
	const [pendingLoad, setPendingLoad] = useState<{ id: string; mode: "draft" | "reuse" } | null>(null)
	const replaceRef = useRef<HTMLButtonElement>(null)
	const [loadingId, setLoadingId] = useState<string | null>(null)
	const [detailId, setDetailId] = useState<string | null>(null)

	const loadRecord = async (id: string, mode: "draft" | "reuse") => {
		setLoadingId(id)
		try {
			const rec = (await axios.get(`/api/admin/attendee-mail/${id}`)).data?.data
			const liveSources: EventOption[] = (rec.sourceEvents || []).filter((e: any) => !e.removed)
			const removedCount = (rec.sourceEvents || []).length - liveSources.length
			const nextGroups: Group[] = (rec.groups || []).length ? rec.groups : DEFAULT_GROUPS
			// A draft keeps its typed/imported people and its unticks. A copy of a sent email gets back
			// the people who were typed or imported (they can't be re-derived); everyone else is
			// re-fetched from the events and ticked afresh.
			const nextExtras: Extra[] =
				mode === "draft"
					? (rec.extraPeople || []).map((p: any) => ({ email: p.email, name: p.name || "", source: p.source === "imported" ? "imported" : "added" }))
					: (rec.recipients || [])
							.filter((r: any) => r.source === "added" || r.source === "imported")
							.map((r: any) => ({ email: r.email, name: r.name || "", source: r.source }))
			const nextExcluded = new Set<string>(mode === "draft" ? rec.excludedEmails || [] : [])
			const nextPromoted: EventOption | null = rec.promotedEvent && !rec.promotedEvent.removed ? rec.promotedEvent : null
			const nextAttachments: BlastAttachment[] = rec.attachments || []
			const nextSubject: string = rec.subject || ""
			const nextMessage: string = rec.message || ""
			const nextGreet = rec.greetByName !== false

			setSourceEvents(liveSources)
			setGroups(nextGroups)
			setExtras(nextExtras)
			setTyped("")
			setExcluded(nextExcluded)
			setListSearch("")
			setPromoted(nextPromoted)
			setSubject(nextSubject)
			setMessage(nextMessage)
			setGreetByName(nextGreet)
			setAttachments(nextAttachments)
			lastPrefill.current = null
			setDraftId(mode === "draft" ? id : null)
			setSavedAt(mode === "draft" ? rec.updatedAt || null : null)
			setLoadedFrom(mode === "reuse" ? nextSubject || "an earlier email" : null)
			// A just-opened draft is clean; a copy is new work until it is saved or sent.
			setSavedSnapshot(
				mode === "draft"
					? composerSnapshot({
							sourceIds: liveSources.map((e) => e._id),
							groups: nextGroups,
							extras: nextExtras,
							excluded: nextExcluded,
							promotedId: nextPromoted?._id,
							subject: nextSubject,
							message: nextMessage,
							greetByName: nextGreet,
							attachments: nextAttachments,
						})
					: EMPTY_SNAPSHOT,
			)
			setDetailId(null)
			if (removedCount > 0 || rec.promotedEvent?.removed) {
				toast({ title: "Some events no longer exist", description: "They were left out. Check the list before sending.", status: "warning", duration: 6000, isClosable: true })
			}
			window.scrollTo({ top: 0, behavior: "smooth" })
		} catch (err: any) {
			toast({ title: "Couldn't open it", description: err?.response?.data?.error || "Something went wrong.", status: "error", duration: 5000, isClosable: true })
		}
		setLoadingId(null)
	}

	// Never throw away unsaved work silently.
	const requestLoad = (id: string, mode: "draft" | "reuse") => {
		if (dirty && !isBlank) setPendingLoad({ id, mode })
		else if (id) loadRecord(id, mode)
		else resetComposer()
	}

	// ---- the two lists ----
	const [listTab, setListTab] = useState<"draft" | "sent">("sent")
	const { data: drafts = [] } = useQuery<any[]>({
		queryKey: ["attendee-mailings", "draft"],
		queryFn: async () => (await axios.get("/api/admin/attendee-mail", { params: { status: "draft" } })).data?.data || [],
	})
	const { data: sentList = [] } = useQuery<any[]>({
		queryKey: ["attendee-mailings", "sent"],
		queryFn: async () => (await axios.get("/api/admin/attendee-mail", { params: { status: "sent" } })).data?.data || [],
	})
	const [deleteDraftId, setDeleteDraftId] = useState<string | null>(null)
	const deleteDraftRef = useRef<HTMLButtonElement>(null)
	const deleteDraft = async () => {
		if (!deleteDraftId) return
		try {
			await axios.delete(`/api/admin/attendee-mail/${deleteDraftId}`)
		} catch (err: any) {
			if (err?.response?.status !== 404) {
				toast({ title: "Not deleted", description: err?.response?.data?.error || "Something went wrong.", status: "error", duration: 5000, isClosable: true })
				return
			}
		}
		// Deleting the draft that is open keeps the text on screen, now as unsaved new work.
		if (deleteDraftId === draftId) {
			setDraftId(null)
			setSavedAt(null)
			setSavedSnapshot(EMPTY_SNAPSHOT)
		}
		setDeleteDraftId(null)
		refreshLists()
	}

	return (
		<>
			<Head>
				<title>Email Attendees | Jetzy Events</title>
			</Head>
			<ConsoleLayout maxW="100%">
				<Box maxW="900px" mx="auto" px={{ base: 4, md: 0 }} py={6} color="white">
					<Text fontSize={{ base: "xl", md: "2xl" }} fontWeight="bold">Email Attendees</Text>
					<Text color="gray.400" fontSize="sm" mb={6}>
						Email people from past events — about a new event, or anything else. Pick the events to draw from, check who is on the list, write the email, send.
					</Text>

					{(draftId || loadedFrom) && (
						<Flex bg="rgba(247,148,50,0.10)" border="1px solid #F79432" borderRadius="lg" px={4} py={3} mb={5} gap={3} align="center" wrap="wrap">
							<Text fontSize="sm" flex="1" minW="200px">
								{draftId ? (
									<>Editing a saved draft{subject.trim() ? <> — <strong>{subject}</strong></> : null}.</>
								) : (
									<>
										Loaded from <strong>&ldquo;{loadedFrom}&rdquo;</strong> as a new copy. Check the recipients before sending — the original stays as it was.
									</>
								)}
							</Text>
							<Button size="xs" variant="outline" borderColor="#F79432" color="#F79432" _hover={{ bg: "rgba(247,148,50,0.15)" }} onClick={() => requestLoad("", "draft")}>
								Start a new email
							</Button>
						</Flex>
					)}

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
											{g === "booked" ? " — has a ticket (incl. checked in)" : g === "pending" ? " — asked for a ticket, awaiting approval" : " — was invited, by email or in the app, whatever they answered"}
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
						<Text fontWeight="bold" mb={1}>4. Link an event (optional)</Text>
						<Text fontSize="xs" color="gray.400" mb={3}>
							Linking an event adds a &quot;View Event Details&quot; button to it and fills in the subject and message — edit them freely. Skip this to send a plain email of your own.
						</Text>
						{promoted && (
							<Flex bg="rgba(247,148,50,0.10)" border="1px solid #F79432" borderRadius="lg" px={3} py={2} mb={3} align="center" gap={3}>
								<Box minW={0} flex="1">
									<Text fontSize="sm" fontWeight="semibold" noOfLines={1}>{promoted.name}</Text>
									<Text fontSize="xs" color="gray.400" overflowWrap="anywhere">{eventDateLine(promoted) || "No date set"}</Text>
								</Box>
								{/* Removing the link keeps whatever text is in the subject and message. */}
								<Button size="xs" variant="outline" borderColor="#F79432" color="#F79432" _hover={{ bg: "rgba(247,148,50,0.15)" }} onClick={() => setPromoted(null)} flexShrink={0}>
									Remove
								</Button>
							</Flex>
						)}
						<EventPicker selectedIds={promoted ? [promoted._id] : []} placeholder="Search for an event to link…" onToggle={pickPromoted} />

						<Text fontWeight="bold" mt={5} mb={1}>Subject</Text>
						<Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" bg="#090C10" borderColor="#444444" color="white" _placeholder={{ color: "gray.500" }} mb={4} sx={inputSx} />
						<Text fontWeight="bold" mb={1}>Message</Text>
						<Box mb={3} sx={{ ".ql-container": { minHeight: "180px" } }}>
							<RichTextEditor hideImageButton value={message} onChange={(val) => setMessage(val)} placeholder="Write your message…" />
						</Box>
						<EmailBodyNotice html={message} />
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
						<Flex gap={3} direction={{ base: "column", md: "row" }} align={{ base: "stretch", md: "center" }}>
							<Text fontSize="xs" color={dirty && !isBlank ? "#F6AD55" : "gray.500"} flex="1" textAlign={{ base: "center", md: "left" }}>
								{dirty && !isBlank
									? "Unsaved changes"
									: !dirty && savedAt
										? `Draft saved ${DateTime.fromISO(savedAt).toLocaleString(DateTime.TIME_SIMPLE)}`
										: ""}
							</Text>
							<Button variant="ghost" color="#FC8181" _hover={{ bg: "whiteAlpha.100" }} isDisabled={!draftId && isBlank} onClick={() => setDiscardOpen(true)}>
								Discard
							</Button>
							<Button variant="outline" borderColor="#444444" color="white" _hover={{ bg: "#2A2A2A" }} isLoading={savingDraft} isDisabled={uploading || isBlank || (!dirty && !!draftId)} onClick={saveDraft}>
								{draftId ? "Save draft" : "Save as draft"}
							</Button>
							<Button variant="outline" borderColor="#444444" color="white" _hover={{ bg: "#2A2A2A" }} isDisabled={!stripHtml(message).trim()} onClick={() => setPreviewOpen(true)}>
								Preview &amp; test
							</Button>
							<Button bg="#F79432" color="black" _hover={{ bg: "#E68422" }} isDisabled={blockers.length > 0} onClick={() => setConfirmOpen(true)}>
								Send to {selectedRows.length} {selectedRows.length === 1 ? "person" : "people"}
							</Button>
						</Flex>
					</Box>

					{/* Sent + Drafts */}
					<Box {...card}>
						<Flex gap={2} mb={4}>
							{(["sent", "draft"] as const).map((t) => (
								<Button
									key={t}
									size="sm"
									borderRadius="full"
									bg={listTab === t ? "#F79432" : "transparent"}
									color={listTab === t ? "black" : "white"}
									border="1px solid #444"
									_hover={{ bg: listTab === t ? "#E68422" : "#2A2A2A" }}
									onClick={() => setListTab(t)}
								>
									{t === "sent" ? `Sent (${sentList.length})` : `Drafts (${drafts.length})`}
								</Button>
							))}
						</Flex>
						{listTab === "draft" ? (
							drafts.length === 0 ? (
								<Text fontSize="sm" color="gray.500">No drafts. Use &ldquo;Save as draft&rdquo; to keep an email for later.</Text>
							) : (
								<VStack align="stretch" spacing={2}>
									{drafts.map((d) => (
										<Flex
											key={d._id}
											bg="#2A2A2A"
											borderRadius="md"
											p={3}
											gap={3}
											align={{ base: "stretch", md: "center" }}
											direction={{ base: "column", md: "row" }}
											border={d._id === draftId ? "1px solid #F79432" : "1px solid transparent"}
										>
											<Box minW={0} flex="1">
												<Text fontSize="sm" fontWeight="semibold" noOfLines={1}>{d.subject || "Untitled draft"}</Text>
												<Text fontSize="xs" color="gray.400">
													{d._id === draftId ? "Open now · " : ""}
													Saved {d.updatedAt ? DateTime.fromISO(d.updatedAt).toLocaleString(DateTime.DATETIME_MED) : ""}
													{d.updatedByEmail ? ` by ${d.updatedByEmail}` : ""}
												</Text>
											</Box>
											<HStack flexShrink={0}>
												<Button size="sm" bg="#F79432" color="black" _hover={{ bg: "#E68422" }} isLoading={loadingId === d._id} isDisabled={d._id === draftId} onClick={() => requestLoad(d._id, "draft")}>
													Open
												</Button>
												<Button size="sm" variant="outline" borderColor="#444" color="#FC8181" _hover={{ bg: "#2A2A2A" }} onClick={() => setDeleteDraftId(d._id)}>
													Delete
												</Button>
											</HStack>
										</Flex>
									))}
								</VStack>
							)
						) : sentList.length === 0 ? (
							<Text fontSize="sm" color="gray.500">Nothing sent from here yet.</Text>
						) : (
							<VStack align="stretch" spacing={2}>
								{sentList.map((m) => {
									const failed = Number(m.failedCount) || 0
									return (
										<Flex key={m._id} bg="#2A2A2A" borderRadius="md" p={3} gap={3} align={{ base: "stretch", md: "center" }} direction={{ base: "column", md: "row" }}>
											<Box minW={0} flex="1">
												<Text fontSize="sm" fontWeight="semibold" noOfLines={1}>{m.subject}</Text>
												<Text fontSize="xs" color="gray.400">
													{m.promotedEventName ? `About ${m.promotedEventName} · ` : ""}
													{m.succeededCount}/{m.recipientCount} sent
													{failed > 0 ? ` · ${failed} not sent` : ""}
													{m.sentAt ? ` · ${DateTime.fromISO(m.sentAt).toLocaleString(DateTime.DATETIME_MED)}` : ""}
													{m.sentByEmail ? ` · by ${m.sentByEmail}` : ""}
												</Text>
											</Box>
											<HStack flexShrink={0}>
												<Button size="sm" variant="outline" borderColor="#444" color="white" _hover={{ bg: "#2A2A2A" }} onClick={() => setDetailId(m._id)}>
													View details
												</Button>
												<Button size="sm" bg="#F79432" color="black" _hover={{ bg: "#E68422" }} isLoading={loadingId === m._id} onClick={() => requestLoad(m._id, "reuse")}>
													Use again
												</Button>
											</HStack>
										</Flex>
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
									&ldquo;{subject}&rdquo;{promoted ? <> about <strong>{promoted.name}</strong></> : null} goes out now, from Jetzy. This can&apos;t be undone.
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

				<AttendeeMailingDetail id={detailId} onClose={() => setDetailId(null)} onUseAgain={(id) => requestLoad(id, "reuse")} />

				{/* Discard */}
				<AlertDialog isOpen={discardOpen} leastDestructiveRef={discardRef} onClose={() => !discarding && setDiscardOpen(false)} isCentered>
					<AlertDialogOverlay>
						<AlertDialogContent bg="#1E1E1E" color="white" mx={4}>
							<AlertDialogHeader>{draftId ? "Delete this draft?" : "Clear this email?"}</AlertDialogHeader>
							<AlertDialogBody>
								<Text fontSize="sm" color="gray.300">
									{draftId
										? "The saved draft is deleted for every admin and the page is cleared. This can't be undone."
										: "Everything picked and written here is cleared. Nothing was saved."}
								</Text>
							</AlertDialogBody>
							<AlertDialogFooter gap={3}>
								<Button ref={discardRef} variant="outline" borderColor="#444" color="white" _hover={{ bg: "#2A2A2A" }} onClick={() => setDiscardOpen(false)} isDisabled={discarding}>
									Keep it
								</Button>
								<Button bg="#351919" color="#EC5E5E" _hover={{ bg: "#451919" }} isLoading={discarding} onClick={discard}>
									{draftId ? "Delete draft" : "Clear"}
								</Button>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialogOverlay>
				</AlertDialog>

				{/* Replace unsaved work — Open / Use again / Start a new email */}
				<AlertDialog isOpen={!!pendingLoad} leastDestructiveRef={replaceRef} onClose={() => setPendingLoad(null)} isCentered>
					<AlertDialogOverlay>
						<AlertDialogContent bg="#1E1E1E" color="white" mx={4}>
							<AlertDialogHeader>Replace what you&apos;re writing?</AlertDialogHeader>
							<AlertDialogBody>
								<Text fontSize="sm" color="gray.300">You have unsaved changes. Save them as a draft first if you want to keep them.</Text>
							</AlertDialogBody>
							<AlertDialogFooter gap={3}>
								<Button ref={replaceRef} variant="outline" borderColor="#444" color="white" _hover={{ bg: "#2A2A2A" }} onClick={() => setPendingLoad(null)}>
									Keep editing
								</Button>
								<Button
									bg="#F79432"
									color="black"
									_hover={{ bg: "#E68422" }}
									onClick={() => {
										const next = pendingLoad
										setPendingLoad(null)
										if (!next) return
										if (next.id) loadRecord(next.id, next.mode)
										else resetComposer()
									}}
								>
									Replace
								</Button>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialogOverlay>
				</AlertDialog>

				{/* Delete a draft from the list */}
				<AlertDialog isOpen={!!deleteDraftId} leastDestructiveRef={deleteDraftRef} onClose={() => setDeleteDraftId(null)} isCentered>
					<AlertDialogOverlay>
						<AlertDialogContent bg="#1E1E1E" color="white" mx={4}>
							<AlertDialogHeader>Delete this draft?</AlertDialogHeader>
							<AlertDialogBody>
								<Text fontSize="sm" color="gray.300">It is deleted for every admin. This can&apos;t be undone.</Text>
							</AlertDialogBody>
							<AlertDialogFooter gap={3}>
								<Button ref={deleteDraftRef} variant="outline" borderColor="#444" color="white" _hover={{ bg: "#2A2A2A" }} onClick={() => setDeleteDraftId(null)}>
									Keep it
								</Button>
								<Button bg="#351919" color="#EC5E5E" _hover={{ bg: "#451919" }} onClick={deleteDraft}>
									Delete draft
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

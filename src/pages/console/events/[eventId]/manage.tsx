"use client"
import { stripHtml } from "@/utils/text";
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { ReferralCodesManager } from "@/components/console/ReferralCodesManager"
import { ticketMemberships, ticketMembershipInterval, ticketMembershipFreeMonths } from "@/lib/premium-bundle"
import TicketMembershipToggles from "@/components/events/TicketMembershipToggles"
import { SortableTicketList, SortableTicketItem } from "@/components/events/SortableTicketList"
import { allowPlacesDropdown, buildPlaceSelection, suppressPlacesDropdown } from "@/lib/google-place"
import { authorizedOnly } from "@/lib/authSession"
import { Events } from "@/models/events"
import { Bookings } from "@/models/events/bookings"
import { BookingStatus } from "@/models/events/types"
import { ensureDbConnected } from "@/configs/database"
import { GetServerSideProps } from "next"
import React, { useEffect, useRef, useState } from "react"
import {
	Button,
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalBody,
	ModalCloseButton,
	Input,
	Text,
	Textarea,
	Tooltip,
	useToast,
	Box,
	UnorderedList,
	ListItem,
	Flex,
	Heading,
	Tabs,
	TabList,
	Tab,
	TabPanels,
	TabPanel,
	Select,
	Table,
	Thead,
	Tbody,
	Tr,
	Th,
	Td,
	TableContainer,
	Badge,
	Switch,
	FormControl,
	FormLabel,
	InputGroup,
	InputLeftElement,
	useDisclosure,
	Menu,
	MenuButton,
	MenuList,
	MenuItem,
	IconButton,
	ModalFooter,
	AlertDialog,
	AlertDialogBody,
	AlertDialogContent,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogOverlay,
	Portal,
	Checkbox,
} from "@chakra-ui/react"
import { DateTime } from "luxon"
import axios from "axios"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { LocationSVG, MessageSVG, UserPlusSVG, LockSVG, MultipleUsersSVG, PlusSVG, TicketSVG, UserTickSVG } from "@/assets/icons"
import { ShareIcon, EyeIcon } from "@heroicons/react/20/solid"
import { ChevronDownIcon, ChevronLeftIcon, CalendarDaysIcon, ClockIcon, DevicePhoneMobileIcon, TicketIcon, EllipsisHorizontalIcon, MagnifyingGlassIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline"
import { StarIcon } from "@heroicons/react/24/solid"
import { useRouter } from "next/router"
import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import { destroySession } from "@Jetzy/redux/reducers/appSlice"
import { Formik, Form, Field, FormikProps, FieldArray } from "formik"
import { usePlacesWidget } from "react-google-autocomplete"
import LocationValuePreview from "@/components/events/fields/LocationValuePreview"
import BlastAttachmentPicker from "@/components/console/BlastAttachmentPicker"
import BlastPreviewModal from "@/components/console/BlastPreviewModal"
import type { BlastAttachment } from "@/lib/blast-attachments"
import DatePicker from "@/components/form/DatePicker"
import TimePicker from "@/components/form/TimePicker"
import { blurOnWheel } from "@/lib/number-input"
import RichTextEditor from "@/components/misc/RichTextEditor"
import { CheckboxGroup, Stack as ChakraStack } from "@chakra-ui/react"
import { describeBlastStatuses, nextBlastStatusSelection, parseBlastStatuses } from "@/lib/blast-status"
import EventDescription from "@/components/events/EventDescription"
import AnswerText from "@/components/events/AnswerText"
import InterestsSelector from "@/components/events/InterestsSelector"
import MediaUploadSection from "@/components/media-upload-section"
import { allowedMediaCount } from "@/lib/event-media-limit"
import { EVENT_TITLE_LIMIT_HINT, EVENT_TITLE_RAW_LIMIT, clampEventTitle, eventTitleCounter, isEventTitleOverLimit } from "@/lib/event-title"
import { buildGuestRows, matchesAudience, GUEST_KIND_LABEL, type GuestRow, type GuestAudience } from "@/lib/guest-rows"
import { bookingTicketCount } from "@/lib/booking-approval"
import { useBookingApprovals } from "@/components/console/approvals/useBookingApprovals"
import { ApprovalDialogs } from "@/components/console/approvals/ApprovalDialogs"
import { ApprovalActions, expiringSoonBookings } from "@/components/console/approvals/ApprovalActions"
import { HoldExpiry } from "@/components/bookings/PaymentBadge"
import BenefitsField from "@/components/events/BenefitsField"
import { DATE_POLL_OPTION_LABEL_LIMIT, EVENT_ENTRANCE_LIMIT, EVENT_ENTRANCE_WORD_LIMIT, EVENT_FIELD_MESSAGES, EVENT_LOCATION_WORD_LIMIT, countChars, withinWordLimit, wordCounter } from "@/lib/event-field-limits"
import TicketEditorModal from "@/components/events/TicketEditorModal"
import ListingCardPreview from "@/components/events/ListingCardPreview"
import TimezoneSelect from "@/components/timezone-select"
import { uploadFile, deleteFile } from "@/services/upload.service"
import { uniqueId } from "@/lib/utils"
import { isCancelledBooking, isPendingBooking, deadBookingKind, DEAD_BOOKING_LABEL, DEAD_BOOKING_COLOR, DEAD_BOOKING_TOOLTIP } from "@/lib/booking-status"
import { apportionRevenue, describeDiscount, describePriceChange, isOnHold } from "@/lib/booking-revenue"
import { bookingMoneyAmount, bookingMoneyState, MoneyState } from "@/lib/booking-cancellation"
import CancelBookingDialog from "@/components/bookings/CancelBookingDialog"
import { showApprovalsSurface, ticketApprovalFlag } from "@/lib/ticket-approval"
import {
	BLAST_STATUS_COLOR,
	BLAST_STATUS_LABEL,
	describeDeliveryFailure,
	type BlastRecipient,
	type BlastRecipientStatus,
} from "@/lib/blast-delivery"
import { isBelowStripeMinimum, BELOW_MIN_PRICE_MESSAGE } from "@/lib/ticket-pricing"
import EventSlugField from "@/components/events/EventSlugField"
import { isPendingAdminApproval, isAwaitingAdminReview } from "@/lib/event-approval"
import { eventPath, eventUrl, eventAlbumPath, eventAlbumUrl } from "@/lib/event-slug"
import { previewPath } from "@/lib/event-preview"
import { ApprovalRequests } from "@/components/console/ApprovalRequests"
import { AlbumPhotoRequests, albumPhotoRequestsQueryKey, fetchAlbumPhotoRequests } from "@/components/console/AlbumPhotoRequests"
import { buildManageSections } from "@/components/console/manage/manageSections"
import { ManageSectionSwitcher } from "@/components/console/manage/ManageSectionSwitcher"
import { MobileSection } from "@/components/console/manage/MobileSection"
import { ManageMobileActionBar } from "@/components/console/manage/ManageMobileActionBar"
import { ManageMobileSummary } from "@/components/console/manage/ManageMobileSummary"
import { scheduleSummary, textSummary, countSummary } from "@/components/console/manage/sectionSummaries"
import { Error } from "@/lib/_toaster"
import { ROUTES } from "@/configs/routes"
import { useAppDispatch } from "@/redux/stores"
import { UpdateEventThunk, DeleteEventThunk } from "@/redux/reducers/eventsSlice"
import { UpdateEventApis, SaveDraftRevisionApis, DiscardDraftRevisionApis } from "@/services/events/eventsapis"
import { AutosaveManager, AutosaveStatusPill, buildEventPayload, AutosaveState } from "@/components/events/AutosaveManager"
import { useUnsavedDraftGuard } from "@/hooks/useUnsavedDraftGuard"
import { draftIsCurrent } from "@/lib/event-draft"
import { UnsavedDraftDialog } from "@/components/events/UnsavedDraftDialog"
import { CreateEventFormData, DatePollOption } from "@/types"
import { TicketData } from "@/components/events/TicketCard"
import { FileUploadData } from "@/components/misc/DragAndDropUploader"
import { EmailProps } from "@/lib/email-service"
import { z } from "zod"
import { roboto } from "@/lib/fonts"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { getEventZone, normalizeTimezone } from "@/utils/eventTime"

dayjs.extend(utc)
dayjs.extend(timezone)

// Shared dark field styling (Figma: bg #090C10, 1px #343536 border, rounded, Roboto 14px)
const fieldBase = "w-full h-12 bg-[#090C10] border border-[#343536] rounded-md text-white text-base md:text-sm placeholder:text-gray-500 focus:outline-none"
const tzFieldCls = `${roboto.className} appearance-none ${fieldBase} px-3 pr-10 cursor-pointer`
const dtFieldCls = `${roboto.className} ${fieldBase} pl-10 pr-3`

// One definition for all eight tabs — they were eight identical prop blocks, so a change to
// any of them (the mobile sizing below, for one) had to be made eight times to stay consistent.
// The smaller type and padding on a phone are what get more than two tabs on screen at once;
// the strip still scrolls, but the scroll is now a way to reach the last tab rather than the
// only way to discover there are any others.
const manageTabProps = {
	className: roboto.className,
	fontWeight: 500,
	fontSize: { base: "14px", md: "18px" },
	lineHeight: "100%",
	color: "#FFFFFF",
	borderTopRadius: "10px",
	px: { base: 3, md: 5 },
	whiteSpace: "nowrap" as const,
	_selected: {
		bg: "#FFFFFF",
		color: "#0B0B0B",
		fontWeight: 700,
		borderColor: "#FFFFFF",
	},
}

// Brighten any icon SVGs (stroke or fill based) within a container for better visibility
const iconBrighten = {
	"& [stroke]": { stroke: "#E6E6E6" },
	"& [fill]:not([fill='none'])": { fill: "#E6E6E6", fillOpacity: 1 },
} as const

const updateEventSchema = z.object({
	name: z.string().min(1, "Event name is required"),
	location: z.string().optional(),
})

// Syncs Formik's `dirty` flag up to the page, so the sticky header (rendered
// outside <Formik>) can show an unsaved-changes indicator.
// ONE mapping from a stored ticket to the form's shape, and one from a shadow draft's
// ticket. They exist because `initialValues` and the mount effect used to map tickets
// SEPARATELY, and differently — the effect wrote 5 keys over the 10 that initialValues had
// seeded. react-fast-compare counts own keys, so Formik read `dirty` on a page nobody had
// touched: the pill said "Unsaved changes" and an autosave fired ~2s after load, creating a
// shadow draft on an untouched event. That is the stale-draft trap all over again.
const mapEventTicket = (ticket: any) => ({
	id: ticket._id?.toString() || uniqueId(10),
	title: stripHtml(ticket.name),
	price: Number(ticket.price),
	// RAW, never stripHtml(). The description is written in the rich-text editor and stored as
	// HTML; seeding the form with the tags removed showed the host one run-on paragraph and,
	// on the next save, wrote that flattened text back over their markup.
	description: ticket.desc || "",
	// Pass through as-is (never `?? false`): undefined means "inherit the event setting", and
	// coercing it here would let autosave pin every ticket to OFF.
	requireApproval: ticket.requireApproval,
	memberships: ticketMemberships(ticket),
	// Carried through so the Monthly/Annual control shows what the ticket actually sells, the
	// free-months control shows what it gives, and a capped ticket keeps its cap. Dropping any
	// of them would write that loss back on the next save.
	membershipInterval: ticket.membershipInterval,
	membershipFreeMonths: ticket.membershipFreeMonths,
	quantity: ticket.quantity,
	includesPremium: ticketMemberships(ticket).includes("premium"),
})

/**
 * Formik's `initialValues` must NOT carry the banner. This page sets `enableReinitialize`,
 * so when `images` was seeded from the `uploadedImages` state every upload produced new
 * initial values, Formik called `resetForm()`, and two things broke: `dirty` was cleared (so
 * the edit never autosaved) and anything the host had typed but not yet saved was thrown
 * away. Nothing reads `values.images` — `ListingCardPreview` takes media as props,
 * `buildEventPayload` takes it from its arguments, and `onSubmit` assigns both arrays from
 * state before validation — so a stable empty array is all the type needs.
 */
const NO_MEDIA: FileUploadData[] = []

/**
 * One signature for the banner: the two url lists plus the host's arrangement across them.
 * Shared by `mediaVersion` and the seeded baseline so "has the media changed?" is a string
 * compare that cannot drift between the two.
 */
const mediaSignature = (images: FileUploadData[], videos: FileUploadData[], order: string[]) =>
	JSON.stringify([images.map((i) => i.file), videos.map((v) => v.file), order])

/** A shadow draft's tickets are already form-shaped; normalise the derived fields only. */
const mapDraftTicket = (t: any) => ({
	id: t.id || uniqueId(10),
	title: t.title,
	price: Number(t.price),
	description: t.description,
	requireApproval: t.requireApproval,
	memberships: ticketMemberships(t),
	membershipInterval: t.membershipInterval,
	membershipFreeMonths: t.membershipFreeMonths,
	quantity: t.quantity,
	includesPremium: ticketMemberships(t).includes("premium"),
})

// Reports Formik state the page header needs but sits outside Formik to read: whether the
// form is dirty, and the status it would save as. Kept as a tiny child so the heavy page
// doesn't re-render on every keystroke.
function FormDirtyWatcher({
	dirty,
	status,
	onChange,
	onStatusChange,
}: {
	dirty: boolean
	status?: string
	onChange: (dirty: boolean) => void
	onStatusChange: (status?: string) => void
}) {
	useEffect(() => {
		onChange(dirty)
	}, [dirty, onChange])
	useEffect(() => {
		onStatusChange(status)
	}, [status, onStatusChange])
	return null
}

// Page-level gate: only admins or the event owner may see the manage UI.
// A logged-in-but-unauthorized user gets a permission screen instead — the
// heavy Manage component (and its many hooks) never mounts for them.
export default function ManagePage(props: any) {
	if (!props.isAuthorized) {
		let eventName = ""
		try {
			eventName = props.event ? JSON.parse(props.event).name : ""
		} catch {}
		return <ManageAccessDenied eventName={eventName} />
	}
	return <Manage {...props} />
}

function ManageAccessDenied({ eventName }: { eventName?: string }) {
	const dispatch = useAppDispatch()

	const logoutAndSignIn = () => {
		dispatch(destroySession({}))
		signOut({ callbackUrl: "/login" })
	}

	return (
		<Flex minH="100vh" bg="#0B0B0B" align="center" justify="center" p={6}>
			<Box maxW="480px" w="100%" bg="#161616" border="1px solid #2A2D31" borderRadius="16px" p={{ base: 6, md: 10 }} textAlign="center">
				<Box w="56px" h="56px" mx="auto" mb={5} borderRadius="full" bg="#F79432" display="flex" alignItems="center" justifyContent="center">
					<LockSVG />
				</Box>
				<Heading size="md" color="white" mb={3}>Admin access required</Heading>
				<Text color="#B5B6B7" mb={2}>
					You must be signed in as an admin or the event host to manage
					{eventName ? ` "${stripHtml(eventName)}"` : " this event"}.
				</Text>
				<Text color="#7E8083" fontSize="sm" mb={6}>
					You&apos;re signed in with an account that doesn&apos;t have access to this event.
				</Text>
				<Flex direction={{ base: "column", sm: "row" }} gap={3} justify="center">
					<Button onClick={logoutAndSignIn} data-analytics-ignore="" bg="#F79432" color="black" fontWeight="bold" _hover={{ bg: "#E68422" }}>
						Log out &amp; sign in
					</Button>
					<Button as={Link} href="/" variant="outline" color="white" borderColor="#3A3D41" _hover={{ bg: "#1E1E1E" }}>
						Go to home
					</Button>
				</Flex>
			</Box>
		</Flex>
	)
}

function Manage({ event: eventProp, isAuthorized = true, pendingApprovalCount = 0 }: any) {
	const event = React.useMemo(() => JSON.parse(eventProp), [eventProp])

	// A PUBLISHED event with an autosaved shadow draft ("draft 2"): seed the form from
	// the pending edits instead of the live fields, and offer to Discard back to live.
	const isPublished = (event.status ?? "published") === "published"

	// A shadow draft is only worth seeding from while it is NEWER than the live document —
	// preferring a stale one showed the host the values the event had BEFORE somebody else's
	// edit, then republished them on the next "Update Event". The whole rule, and the slack
	// that keeps legacy drafts readable, lives in `src/lib/event-draft.ts` so this page and
	// the endpoints that vouch for a draft cannot drift on what "still current" means.
	const draftPayload: any =
		isPublished && event.draftRevision?.payload && draftIsCurrent(event.draftRevision, event.updatedAt)
			? event.draftRevision.payload
			: null
	const draftSavedAt: string | null = draftPayload ? event.draftRevision?.savedAt ?? null : null

	const [autosaveState, setAutosaveState] = useState<AutosaveState>({ status: "idle" })
	const [isDiscardingDraft, setIsDiscardingDraft] = useState(false)

	// Does the server hold edits the host hasn't published? Seeded from the draft this page
	// loaded with, then kept in step by autosave / discard / Update Event. It is what the
	// leave guard below asks about — a host who walks away from a shadow draft has changed
	// nothing a guest can see, and nothing on the way out says so.
	const [hasPendingDraft, setHasPendingDraft] = useState(!!draftPayload)

	const [activeTab, setActiveTab] = useState<"about" | "guests" | "bookings" | "waitingList" | "referralCodes" | "discussion">("about")
	const [tabIndex, setTabIndex] = useState(0)
	const [shareModal, setShareModal] = useState(false)
	const [inviteGuestsModal, setInviteGuestsModal] = useState(false)
	const [sendBlastModal, setSendBlastModal] = useState(false)
	const [showDailyViewsModal, setShowDailyViewsModal] = useState(false)
	const [feedbackFormUrl, setFeedbackFormUrl] = useState(event.feedbackFormUrl || "")
	const [isSendingThankYou, setIsSendingThankYou] = useState(false)
	const toast = useToast()
	const router = useRouter()
	const { data: session } = useSession()
	const userRole = (session?.user as any)?.role
	const isAdmin = userRole === "admin" || userRole === "super admin"

	// Public events await admin review before anyone else can open them, so outward-facing
	// actions (invite, blast, share, check-in) stay hidden until approved.
	const isPendingApproval = isPendingAdminApproval(event as any)

	// Approvable only once the host has actually published. update.ts re-stamps `pending` only
	// on a private→public transition, so a draft approved ahead of time would go live on publish
	// having never been reviewed. It also drives the PENDING APPROVAL badge, so the badge and
	// the button agree. Deliberately narrower than `isPendingApproval` above, which still gates
	// the outward-facing actions — a draft mustn't invite or blast either.
	const canApproveEvent = isAwaitingAdminReview(event as any)

	useEffect(() => {
		if (router.query.invite === "true") {
			// Don't let the deep link bypass the pending gate — just clean the URL.
			if (!isPendingApproval) setInviteGuestsModal(true)
			router.replace(`/console/events/${event._id}/manage`, undefined, { shallow: true })
		}
	}, [router.query.invite, isPendingApproval])

	// Approvals surfaces show whenever ANY ticket needs approval, not just when the
	// event-level default is on — a single flagged ticket is enough — AND whenever a request is
	// still pending, however the flags now read. `pendingApprovalCount` comes from the server and
	// is fixed for the life of the page, so the tab (and therefore every index below it) cannot
	// shift under the host while they are using it.
	const hasApprovalTickets = React.useMemo(() => showApprovalsSurface(event as any, pendingApprovalCount), [event, pendingApprovalCount])

	// Approvals is conditional, so every tab after it shifts by one when it is absent.
	// Derived rather than written down twice — a hardcoded index here silently opens the
	// wrong panel on an event that shows no Approvals tab.
	const photoRequestsTabIndex = hasApprovalTickets ? 7 : 6

	// Deep-link from the admin approval-request email opens the Approvals tab
	useEffect(() => {
		if (router.query.tab === "approvals" && hasApprovalTickets) {
			setTabIndex(6)
		}
		if (router.query.tab === "photo-requests") {
			setTabIndex(photoRequestsTabIndex)
		}
	}, [router.query.tab, hasApprovalTickets, photoRequestsTabIndex])

	const { data: analytics } = useQuery({
		queryKey: ["event-analytics", event._id],
		queryFn: async () => {
			const res = await axios.get("/api/analytics/events", { params: { eventId: event._id, groupBy: "day" } })
			return res.data.data
		},
	})

	const { data: eventBookings = [] } = useQuery({
		queryKey: ["event-bookings", event._id],
		queryFn: async () => {
			const res = await axios.post("/api/get-bookings", { eventId: event._id })
			return res.data || []
		},
	})

	// One ordered list drives BOTH the desktop tab bar and the phone section switcher, so the
	// two can't disagree about which index opens which panel.
	const manageSections = React.useMemo(() => buildManageSections(hasApprovalTickets), [hasApprovalTickets])

	// Same cache entry the Photo Requests tab reads (its panel is mounted with the page), so the
	// switcher's badge costs no extra request and moves when a request is marked handled.
	const { data: photoRequests = [] } = useQuery({
		queryKey: albumPhotoRequestsQueryKey(String(event._id)),
		queryFn: () => fetchAlbumPhotoRequests(String(event._id)),
	})

	// "Needs you" counts for the phone section switcher. Pending approvals are counted from the
	// live bookings query (approve/reject invalidate it), not the server's load-time count.
	const sectionBadges = React.useMemo(
		() => ({
			approvals: (eventBookings as any[]).filter((b) => isPendingBooking(b)).length,
			photoRequests: (photoRequests as any[]).filter((r) => r.status === "pending").length,
		}),
		[eventBookings, photoRequests],
	)

	// Per-ticket-type sold count + revenue, keyed by ticket _id (matches the `id` field on form values).
	//
	// Revenue comes from what the booking actually cost, NOT quantity × the ticket's current
	// list price. The old sum ignored discounts — three $95 tickets comped to $0 by a 100%-off
	// referral code reported "$285.00 COLLECTED" — and read prices as they are now, so raising
	// a ticket's price retroactively inflated what past buyers appeared to have paid.
	// `comped` counts tickets issued for nothing, which is otherwise invisible: a card that
	// shows "3 sold, $0.00 collected" reads like a bug rather than three comps.
	const ticketSalesSummary = React.useMemo(() => {
		const priceById = new Map<string, number>()
		;(event.tickets || []).forEach((t: any) => priceById.set(t._id?.toString(), Number(t.price)))
		const priceOf = (id: string) => priceById.get(id) ?? 0

		const byTicketId = new Map<string, { sold: number; revenue: number; onHold: number; comped: number }>()
		;(eventBookings as any[]).forEach((booking: any) => {
			if (isCancelledBooking(booking)) return
			// A pending paid request has an authorized card hold, not money in the bank.
			// Counting it as revenue would put cash on screen that may never be captured.
			const onHold = isOnHold(booking)
			const discount = describeDiscount(booking)

			apportionRevenue(booking, priceOf).forEach((row) => {
				const entry = byTicketId.get(row.ticketId) || { sold: 0, revenue: 0, onHold: 0, comped: 0 }
				if (onHold) {
					entry.onHold += row.revenue
				} else {
					entry.sold += row.quantity
					entry.revenue += row.revenue
					if (discount.comped) entry.comped += row.quantity
				}
				byTicketId.set(row.ticketId, entry)
			})
		})
		return byTicketId
	}, [eventBookings, event.tickets])

	// Sales against ticket types that no longer exist on the event. These have no card to
	// render on, so without this their money is simply absent from the page — the Jetzy Picnic
	// had $22 of real, captured revenue invisible this way. Deleting a ticket type doesn't
	// delete the bookings that referenced it.
	const removedTicketSales = React.useMemo(() => {
		const live = new Set((event.tickets || []).map((t: any) => t._id?.toString()))
		let sold = 0
		let revenue = 0
		let onHold = 0
		ticketSalesSummary.forEach((stats, ticketId) => {
			if (live.has(ticketId)) return
			sold += stats.sold
			revenue += stats.revenue
			onHold += stats.onHold
		})
		return { sold, revenue, onHold }
	}, [ticketSalesSummary, event.tickets])

	const onUpdateFeedbackLink = async () => {
		try {
			await axios.post(`/api/events/admin/update-feedback-link`, {
				eventId: event._id,
				feedbackFormUrl
			})
			toast({
				title: "Feedback link updated!",
				status: "success",
				duration: 3000,
			})
			// Refresh page to update props (and show the Send Email button)
			router.replace(router.asPath)
		} catch (error) {
			toast({
				title: "Failed to update link.",
				status: "error",
				duration: 3000,
			})
		}
	}

	const onSendThankYouEmails = async () => {
		setIsSendingThankYou(true)
		try {
			await axios.post("/api/events/admin/send-thank-you", { eventId: event._id })
			toast({
				title: "Email blast started!",
				description: "Participants will receive thank you emails shortly.",
				status: "success",
				duration: 5000,
			})
		} catch (error: any) {
			toast({
				title: "Failed to send emails.",
				description: error.response?.data?.message || "Internal server error.",
				status: "error",
				duration: 5000,
			})
		}
		setIsSendingThankYou(false)
	}

	// ===== Inline edit form (ported from update.tsx — reuse verbatim) =====
	const dispatcher = useAppDispatch()
	const formikRef = React.useRef<FormikProps<CreateEventFormData>>(null)
	const { isOpen, onOpen, onClose } = useDisclosure()
	const { isOpen: isPollModalOpen, onOpen: onPollModalOpen, onClose: onPollModalClose } = useDisclosure()
	const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure()
	const cancelRef = React.useRef<any>(null)
	// Approving is irreversible — there is no reject or un-approve endpoint — so it asks
	// first, in the same words the events list uses. Its own ref: `leastDestructiveRef` is
	// what a dialog returns focus to, and two dialogs sharing one is a focus bug.
	const { isOpen: isApproveOpen, onOpen: onApproveOpen, onClose: onApproveClose } = useDisclosure()
	const approveCancelRef = React.useRef<any>(null)

	const [uploadedImages, setUploadedImages] = useState<FileUploadData[]>([])
	const [uploadProgress, setUploadProgress] = useState(0)
	const [isUploading, setIsUploading] = useState(false)
	const [uploadedVideos, setUploadedVideos] = useState<FileUploadData[]>([])
	// Banner order across both lists, as urls. Empty = the legacy images-then-videos order.
	const [mediaOrder, setMediaOrder] = useState<string[]>([])
	const [videoUploadProgress, setVideoUploadProgress] = useState(0)
	const [isUploadingVideo, setIsUploadingVideo] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [isDeleting, setIsDeleting] = useState(false)
	const [isCloning, setIsCloning] = useState(false)
	const [isApproving, setIsApproving] = useState(false)
	const [editIndex, setEditIndex] = useState<number | null>(null)
	const [tempTicket, setTempTicket] = useState<TicketData>({ id: "", title: "", description: "", price: 0 })
	const [tempPollOption, setTempPollOption] = useState<DatePollOption>({ id: "", date: "", time: "", label: "" })
	const [pollDate, setPollDate] = useState("")
	const [pollTime, setPollTime] = useState("")
	const [editPollIndex, setEditPollIndex] = useState<number | null>(null)
	const [sendUpdateEmailCheck, setSendUpdateEmailCheck] = useState(false)
	const [isFormDirty, setIsFormDirty] = useState(false)
	// The status the form would SAVE as, which is not the status the event currently has —
	// the host can switch a published event to Draft, and that save unpublishes it.
	const [formStatus, setFormStatus] = useState<string | undefined>(undefined)
	// An image delete is IMMEDIATE and live (handleImageDelete calls /api/delete-image on the
	// click, not on Save), so the leave dialog's "guests keep seeing the published version"
	// is not the whole truth once one has been removed. The dialog says so when this is set.
	const [deletedLiveImage, setDeletedLiveImage] = useState(false)
	// What the media looked like when it was last WRITTEN — seeded from the record on mount,
	// then moved forward by each successful autosave. Not "as loaded": a host who adds a photo,
	// lets it save, then removes it is back at the seeded state but no longer at the saved one,
	// and that revert has to save too or the draft keeps a url that no longer exists.
	const [savedMediaVersion, setSavedMediaVersion] = useState<string | null>(null)

	// Initialize images, videos and tickets on mount. When a shadow draft exists, seed
	// from the autosaved payload (form-shaped) instead of the live event fields.
	useEffect(() => {
		if (draftPayload) {
			const images = (draftPayload.images || []).map((img: any) => ({ id: img?.id || uniqueId(10), file: typeof img === "string" ? img : img?.file }))
			const videos = (draftPayload.videos || []).map((v: any) => ({ id: v?.id || uniqueId(10), file: typeof v === "string" ? v : v?.file }))
			const order = Array.isArray(draftPayload.mediaOrder) ? draftPayload.mediaOrder : []
			setUploadedImages(images)
			setUploadedVideos(videos)
			setMediaOrder(order)
			setSavedMediaVersion(mediaSignature(images, videos, order))
			// Tickets are NOT set here. `initialValues` seeds them through the same mapper and
			// `enableReinitialize` applies it; writing them again with setFieldValue is what made
			// the form dirty on load. Only the media state, which lives outside Formik, belongs here.
			return
		}
		const images = (event.images || []).map((img: string) => ({ id: uniqueId(10), file: img }))
		const videos = (event.videos || []).map((v: string) => ({ id: uniqueId(10), file: v }))
		const order = Array.isArray((event as any).mediaOrder) ? (event as any).mediaOrder : []
		if (images.length > 0) setUploadedImages(images)
		if (videos.length > 0) setUploadedVideos(videos)
		setMediaOrder(order)
		// The baseline is recorded on EVERY path, including the no-media one: without it the
		// first upload on an event that had no banner would look like the seeding.
		setSavedMediaVersion(mediaSignature(images, videos, order))
	}, [event])

	const initialValues: CreateEventFormData = React.useMemo(() => {
		// Editing a published event with a shadow draft: the payload is already form-shaped.
		if (draftPayload) {
			// `payload.status` is always "draft" — autosave forces it so a shadow-draft write can
			// never publish — so it cannot carry what the host picked. `intendedStatus` does, and
			// without it the Status dropdown was the one field a draft silently forgot: set it to
			// Draft, leave, come back, and it read Published again. Absent (drafts written before
			// this) still means published, which is what those drafts were.
			const { intendedStatus, images: _draftImages, videos: _draftVideos, ...rest } = draftPayload as any
			return {
				...rest,
				tickets: (rest.tickets || []).map(mapDraftTicket),
				images: NO_MEDIA,
				status: intendedStatus === "draft" ? "draft" : "published",
				// A host's draft carries no Premium tag (the server drops it — the tag is
				// admin-only), so fall back to the live event or the switch reads off on an
				// event that is tagged.
				premiumEvent: rest.premiumEvent ?? (event.premiumEvent || false),
			} as CreateEventFormData
		}

		const extractedTimeZone = getEventZone(event?.timezone)
		const start = event.startsOn ? dayjs.utc(event.startsOn).tz(extractedTimeZone) : null
		const end = event.endsOn ? dayjs.utc(event.endsOn).tz(extractedTimeZone) : null

		return {
			name: stripHtml(event.name),
			slug: event.slug,
			desc: event.desc,
			location: event.location,
			// Seeded so re-saving an event doesn't wipe a venue name that was already stored.
			venueName: (event as any).venueName || "",
			entrance: (event as any).entrance || "",
			capacity: event.capacity,
			requireApproval: event.requireApproval,
			isPaid: event.isPaid,
			images: NO_MEDIA,
			tickets: (event.tickets || []).map(mapEventTicket),
			privacy: event.privacy,
			status: (event.status ?? "published") as "draft" | "published",
			startDate: start ? start.format("YYYY-MM-DD") : "",
			startTime: start && event.hasStartTime !== false ? start.format("HH:mm") : "",
			endDate: end ? end.format("YYYY-MM-DD") : "",
			endTime: end && event.hasEndTime !== false ? end.format("HH:mm") : "",
			timezone: normalizeTimezone(event?.timezone),
			showParticipants: event.showParticipants || false,
			benefits: event.benefits || "",
			locationDisclosedAfterBooking: event.locationDisclosedAfterBooking || false,
			showOnMobile: event.showOnMobile || false,
			premiumEvent: event.premiumEvent || false,
			datePoll: event.datePoll ? {
				isActive: event.datePoll.isActive || false,
				question: event.datePoll.question || "",
				options: event.datePoll.options || [],
			} : { isActive: false, question: "", options: [] as DatePollOption[] },
			interests: ((event.interests ?? []) as any[]).map((id: any) => id?.toString?.() ?? id),
		} as CreateEventFormData
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [event])

	// Remembers the text produced by the last selection, so focusing an untouched field can
	// be told apart from the user actually editing it.
	const lastPickedLocationRef = useRef<string>("")

	/**
	 * Forget the Google pick. Called on every keystroke in the location field — the pick only
	 * survives while the text is exactly what the pick produced.
	 *
	 * `null`, not `undefined`: `update.ts` reads an omitted coordinate as "unchanged" (an autosave
	 * built from a stale form must not wipe a real pick), so there has to be a value that means
	 * "cleared" — it `$unset`s `coordinates` on seeing it.
	 */
	const dropLocationPick = (setFieldValue: (field: string, value: any) => void) => {
		setFieldValue("venueName", "")
		setFieldValue("latitude", null)
		setFieldValue("longitude", null)
		setFieldValue("placeId", null)
		lastPickedLocationRef.current = ""
	}

	const { ref: placesRef } = usePlacesWidget({
		apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
		onPlaceSelected: (place) => {
			if (!formikRef.current) return
			// Keeps the venue name the user actually clicked — see src/lib/google-place.ts.
			const picked = buildPlaceSelection(place)
			formikRef.current.setFieldValue("location", picked.location)
			formikRef.current.setFieldValue("venueName", picked.venueName)
			formikRef.current.setFieldValue("latitude", picked.latitude)
			formikRef.current.setFieldValue("longitude", picked.longitude)
			formikRef.current.setFieldValue("placeId", picked.placeId)
			lastPickedLocationRef.current = picked.location
		},
		options: {
			fields: ["formatted_address", "geometry", "place_id", "name", "address_components"],
			types: ["establishment"],
		},
	})

	const sendEventUpdate = (eventData: EmailProps) => {
		return axios.post("/api/send-update-event-email", eventData)
			.then((response) => response.data)
			.catch((error) => {
				console.error("Error calling update event API:", error)
				throw error
			})
	}

	const mediaVersion = React.useMemo(
		// mediaOrder included: dragging changes neither array, so without it a reorder would
		// never trigger an autosave.
		() => mediaSignature(uploadedImages, uploadedVideos, mediaOrder),
		[uploadedImages, uploadedVideos, mediaOrder],
	)

	// The host has changed the banner since it was last written. Media lives outside Formik,
	// so `dirty` can never say so — and until the baseline is recorded a change cannot be
	// told apart from the page seeding itself.
	const mediaDirty = savedMediaVersion !== null && mediaVersion !== savedMediaVersion

	// A manual "Update Event" must always win over autosave. Once a manual save reaches
	// dispatch we LOCK autosave for the rest of this page's life (it only unlocks if the
	// save fails and we stay on the page). This prevents a debounced autosave from being
	// rescheduled after a successful save and reverting the event back to draft during the
	// (client-side, still-mounted) navigation. `autosaveInFlightRef` lets submit await any
	// already-running autosave before it writes.
	const [autosaveLocked, setAutosaveLocked] = useState(false)
	const autosaveLockedRef = React.useRef(false)
	const autosaveInFlightRef = React.useRef<Promise<any> | null>(null)

	// Stop the host walking away believing their edits are live. The pill's own status covers
	// the window before the ~2s autosave debounce has fired; `hasPendingDraft` covers
	// everything after it, including a draft this page was loaded with. Deliberately NOT
	// Formik's `dirty`: the mount effect seeds tickets and media with setFieldValue, so
	// reading it directly risks warning about edits nobody made. The pill is set by the same
	// AutosaveManager effect that decides whether to save at all. `autosaveLocked` is set the
	// moment a manual Update Event starts, so the guard can never fire on the navigation that
	// save performs itself.
	const leaveGuard = useUnsavedDraftGuard(
		() =>
			// An upload in flight is worth stopping for on its own, and on ANY event: leave now
			// and the file finishes uploading into a page that no longer exists, attached to
			// nothing. It is the one case here that is not about `isPublished`.
			isUploading ||
			isUploadingVideo ||
			(isPublished &&
				!autosaveLockedRef.current &&
				(hasPendingDraft || autosaveState.status === "unsaved" || autosaveState.status === "saving")),
	)
	const afterSaveUrlRef = React.useRef<string | null>(null)

	const uploadInFlight = isUploading || isUploadingVideo

	// The host has switched Status to Draft on an event that is currently published, so the
	// pending save UNPUBLISHES it — the opposite of "your changes aren't live yet".
	const willUnpublish = isPublished && formStatus === "draft"

	// "6:41 PM" for a draft saved today, "Sep 25, 6:41 PM" for an older one — a bare time on
	// a draft from last week would read as minutes ago. This session's autosave wins over the
	// timestamp the page loaded with.
	const lastAutosavedLabel = React.useMemo(() => {
		const savedAt = autosaveState.savedAt ?? (draftSavedAt ? new Date(draftSavedAt) : null)
		if (!savedAt) return null
		const d = dayjs(savedAt)
		return d.isSame(dayjs(), "day") ? d.format("h:mm A") : d.format("MMM D, h:mm A")
	}, [autosaveState.savedAt, draftSavedAt])

	// "Update Event" from the leave dialog. Runs the SAME submit the header button runs, so
	// validation is unchanged; on success it navigates to where the host was heading.
	const handlePublishAndLeave = async () => {
		afterSaveUrlRef.current = leaveGuard.pendingUrl
		try {
			await formikRef.current?.submitForm()
		} finally {
			// onSubmit reads this synchronously at its top, so it is safe to clear as soon as
			// submitForm returns — which is BEFORE the save itself finishes (the update thunk
			// is not awaited in there).
			afterSaveUrlRef.current = null
		}
	}

	// Close the dialog once the save is over rather than when submitForm returns: it returns
	// while the update is still in flight, which would drop the spinner and the dialog before
	// anything had happened. On success the page has already navigated by now; on failure the
	// host needs the form and the error toast, not a dialog on top of them.
	const wasSubmittingRef = React.useRef(false)
	useEffect(() => {
		if (wasSubmittingRef.current && !isSubmitting && leaveGuard.isOpen) leaveGuard.cancelLeave()
		wasSubmittingRef.current = isSubmitting
	}, [isSubmitting, leaveGuard])

	// Published event -> shadow draft (live untouched). Draft event -> update in place (stays draft).
	const handleAutosave = async (values: CreateEventFormData) => {
		if (autosaveLockedRef.current) return
		// `status` in the payload is the autosave mechanism's, not the host's — it must stay
		// "draft" or a shadow-draft write would publish. `intendedStatus` is the host's choice,
		// carried so reopening the page shows the Status they actually set.
		const payload = { ...buildEventPayload(values, uploadedImages, uploadedVideos, { status: "draft" }, mediaOrder), intendedStatus: values.status }
		const payloadStr = JSON.stringify(payload)
		// Captured BEFORE the request: if the host edits the banner again while this is in
		// flight, the baseline must land on what was actually written, not on what the media
		// happens to be when the response arrives.
		const savingMediaVersion = mediaSignature(uploadedImages, uploadedVideos, mediaOrder)
		const p = isPublished
			? SaveDraftRevisionApis({ id: event._id.toString(), data: { payload: payloadStr } })
			: UpdateEventApis({ id: event._id.toString(), data: { payload: payloadStr } })
		autosaveInFlightRef.current = p
		try {
			await p
			setSavedMediaVersion(savingMediaVersion)
			// Only a published event hides its autosave from guests; a draft event was
			// never live, so there is nothing to warn about on the way out.
			if (isPublished) setHasPendingDraft(true)
		} finally {
			if (autosaveInFlightRef.current === p) autosaveInFlightRef.current = null
		}
	}

	// Throw away the shadow draft and reload the live published values
	const handleDiscardDraft = async () => {
		setIsDiscardingDraft(true)
		try {
			await DiscardDraftRevisionApis({ id: event._id.toString() })
			setHasPendingDraft(false)
			leaveGuard.bypass()
			router.replace(router.asPath)
		} catch (err) {
			toast({ title: "Failed to discard changes.", status: "error", duration: 3000 })
			setIsDiscardingDraft(false)
		}
	}

	const onSubmit = async (values: CreateEventFormData) => {
		// Where to land after a successful save. Set only by the leave dialog, so a host who
		// published from there reaches the page they were actually heading for instead of
		// being dropped on My Events. Read once and cleared, so a later ordinary save from
		// the header can't inherit it. Not a parameter: Formik owns onSubmit's arguments.
		const afterSaveUrl = afterSaveUrlRef.current
		afterSaveUrlRef.current = null

		const isDraft = values.status === "draft"
		values.images = uploadedImages
		values.videos = uploadedVideos
		values.mediaOrder = mediaOrder

		// A date poll and fixed start/end dates are mutually exclusive — force the user to resolve a conflict
		const pollActive = !!(values.datePoll?.isActive && values.datePoll?.options?.length)
		const hasDates = !!(values.startDate || values.endDate)
		if (pollActive && hasDates) {
			Error("Validation Error", "Remove either the date poll or the start/end dates before saving.")
			return
		}

		// Both are limited in WORDS, so the input's own `maxLength` (a loose character backstop)
		// cannot express the rule. Checked here rather than left to the API so the host is told
		// what to shorten — an autosave refused for this reason only shows "Unsaved".
		if (!withinWordLimit(values.location, EVENT_LOCATION_WORD_LIMIT)) {
			Error("Validation Error", EVENT_FIELD_MESSAGES.locationTooLong)
			return
		}
		if (!withinWordLimit(values.entrance, EVENT_ENTRANCE_WORD_LIMIT)) {
			Error("Validation Error", EVENT_FIELD_MESSAGES.entranceTooLong)
			return
		}

		if (isDraft) {
			if (!values.name?.trim()) {
				Error("Validation Error", "Event name is required to save as draft")
				return
			}
		} else {
			const validation = updateEventSchema.safeParse(values)
			if (!validation.success) {
				const fieldErrors = validation.error.flatten().fieldErrors
				const errorMessages = Object.values(fieldErrors).flat().join("\n")
				Error("Validation Error", errorMessages || "Please fix the form errors")
				return
			}
		}

		if (values.tickets.length > 0) values.isPaid = true
		else values.isPaid = false

		setIsSubmitting(true)

		// Lock autosave (stays locked on success so it can't reschedule during navigation),
		// then let any in-flight autosave settle before the manual write lands last.
		autosaveLockedRef.current = true
		setAutosaveLocked(true)
		if (autosaveInFlightRef.current) {
			try { await autosaveInFlightRef.current } catch { /* ignore autosave failure */ }
		}

		const events = await axios.post(`/api/get-bookings`, { eventId: event._id })
			.then(response => response.data)
			.catch(error => {
				console.error("Error fetching bookings:", error)
				return []
			})

		let succeeded = false
		dispatcher(UpdateEventThunk({ data: { payload: JSON.stringify({ ...values, privacy: values.privacy }) }, id: event._id.toString() })).then((res: any) => {
			if (res?.payload?.status) {
				succeeded = true
				// The toggle is on but there's nobody booked — say so, otherwise it looks
				// identical to a successful send.
				if (sendUpdateEmailCheck && events.length === 0) {
					toast({
						title: "No update emails sent",
						description: "Nobody has booked this event yet, so there was no one to notify.",
						status: "info",
						duration: 6000,
						isClosable: true,
					})
				}
				if (sendUpdateEmailCheck && events.length > 0) {
					const changes: string[] = []
					const extractedTimeZone = getEventZone(event?.timezone)
					const oldStart = event.startsOn ? dayjs.utc(event.startsOn).tz(extractedTimeZone) : null
					const oldEnd = event.endsOn ? dayjs.utc(event.endsOn).tz(extractedTimeZone) : null

					// Every comparison must mirror how initialValues seeds the field, or it
					// reports a change on every save. `name` is seeded with stripHtml(), so
					// comparing against the raw name flagged a phantom edit for any name
					// containing markup or an entity.
					const oldName = stripHtml(event.name)
					if (values.name !== oldName) changes.push(`Event Name: ${oldName} -> ${values.name}`)
					if (values.location !== event.location) changes.push(`Location: ${event.location} -> ${values.location}`)

					// The event link changing is the single most important thing to tell an
					// attendee — every link they already hold stops working.
					if (values.slug && values.slug !== event.slug) {
						changes.push(`The event link has changed to ${eventUrl(typeof window !== "undefined" ? window.location.origin : "", values.slug)}`)
					}

					// Seeded via normalizeTimezone(), so normalise the old value the same way.
					if (values.timezone !== normalizeTimezone(event?.timezone)) {
						changes.push(`Time zone changed to ${values.timezone}`)
					}

					const oldStartDateStr = oldStart ? oldStart.format("YYYY-MM-DD") : ""
					const oldStartTimeStr = oldStart && event.hasStartTime !== false ? oldStart.format("HH:mm") : ""
					if (values.startDate !== oldStartDateStr || values.startTime !== oldStartTimeStr) {
						if (values.startDate && values.startTime) changes.push(`Start time was updated to ${values.startDate} ${values.startTime}`)
						else changes.push(`Start time was removed`)
					}
					const oldEndDateStr = oldEnd ? oldEnd.format("YYYY-MM-DD") : ""
					const oldEndTimeStr = oldEnd && event.hasEndTime !== false ? oldEnd.format("HH:mm") : ""
					if (values.endDate !== oldEndDateStr || values.endTime !== oldEndTimeStr) {
						if (values.endDate && values.endTime) changes.push(`End time was updated to ${values.endDate} ${values.endTime}`)
						else changes.push(`End time was removed`)
					}
					if (values.desc !== event.desc) changes.push("Event description was updated")
					if (values.capacity !== event.capacity) changes.push(`Event capacity was changed to ${values.capacity}`)

					// Include the ticket description — it's part of what the attendee bought.
					// Per-ticket approval is deliberately excluded: it only affects new
					// bookings, not someone who already has a place.
					const currentTickets = JSON.stringify(values.tickets.map(t => ({ title: t.title, price: t.price, description: t.description })))
					// Mirrors how initialValues seeds each field — `description` is seeded raw now, so
					// comparing against a stripped copy would report a change on every save.
					const oldTickets = JSON.stringify((event.tickets || []).map((t: any) => ({ title: stripHtml(t.name), price: Number(t.price), description: t.desc || "" })))
					if (currentTickets !== oldTickets) changes.push("Ticketing options have been revised")

					// Whether the address is visible to them, seeded as `|| false`.
					const oldDisclose = event.locationDisclosedAfterBooking || false
					if ((values.locationDisclosedAfterBooking || false) !== oldDisclose) {
						changes.push(values.locationDisclosedAfterBooking
							? "The exact location is now shared only with booked attendees"
							: "The event location is now shown publicly")
					}

					// Date poll: compare the proposed dates, ignoring vote counts, which move
					// on their own and would otherwise report a change on every save.
					const pollShape = (p: any) => JSON.stringify({
						isActive: !!p?.isActive,
						question: p?.question || "",
						options: (p?.options || []).map((o: any) => ({ date: o?.date, time: o?.time || "", label: o?.label || "" })),
					})
					if (pollShape(values.datePoll) !== pollShape(event.datePoll)) {
						changes.push(values.datePoll?.isActive
							? "The proposed dates for this event have been updated — please cast your vote"
							: "The date poll for this event has been closed")
					}

					if (changes.length > 0) {
						const uniqueUsers = Array.from(new Map(events.map((e: any) => [e.customerEmail, e])).values()) as any[]
						const origin = typeof window !== "undefined" ? window.location.origin : ""
						// Share URL so private Premium events keep their access code.
						const eventLink = eventUrl(origin, event.slug)
						const updatePromises = uniqueUsers.map((bk: any) =>
							sendEventUpdate({
								eventName: values.name,
								oldEventName: event.name,
								location: values.location,
								oldLocation: event.location,
								startDate: values.startDate,
								oldStartDate: oldStart ? oldStart.format("YYYY-MM-DD") : "",
								endDate: values.endDate,
								oldEndDate: oldEnd ? oldEnd.format("YYYY-MM-DD") : "",
								endTime: values.endTime,
								oldEndTime: oldEnd && event.hasEndTime !== false ? oldEnd.format("HH:mm") : "",
								startTime: values.startTime,
								oldStartTime: oldStart && event.hasStartTime !== false ? oldStart.format("HH:mm") : "",
								userEmail: bk.customerEmail,
								changes,
								eventLink,
							} as any))
						// Tell the host what happened. This used to log to the console only, so a
						// failing send looked identical to a successful one — the "Event updated!"
						// toast fired either way and the page navigated off.
						Promise.allSettled(updatePromises).then((results) => {
							const failed = results.filter((r) => r.status === "rejected").length
							if (failed > 0) {
								console.error("Event update emails failed:", results.filter((r) => r.status === "rejected"))
								toast({
									title: "Event saved, but some update emails failed",
									description: `${failed} of ${results.length} attendee${results.length === 1 ? "" : "s"} weren't notified.`,
									status: "warning",
									duration: 8000,
									isClosable: true,
								})
							} else {
								toast({
									title: `Update email sent to ${results.length} attendee${results.length === 1 ? "" : "s"}`,
									status: "success",
									duration: 4000,
									isClosable: true,
								})
							}
						})
					} else {
						// Nothing the email reports on actually changed, so there is nothing to
						// tell attendees. Without this the host assumes the send failed.
						toast({
							title: "No update emails sent",
							description: "Nothing changed that attendees need to be told about.",
							status: "info",
							duration: 6000,
							isClosable: true,
						})
					}
				}
				toast({ title: "Event updated!", status: "success", duration: 3000 })
				// The draft has been published and `update.ts` has $unset it, so the leave
				// guard has nothing left to warn about.
				setHasPendingDraft(false)
				leaveGuard.bypass()
				router.push(afterSaveUrl ?? ROUTES.dashboard.events.index)
			}
		}).finally(() => {
			setIsSubmitting(false)
			// Keep autosave locked on success (we're navigating away); only unlock if the
			// save failed and the user stays on the page so they can keep editing.
			if (!succeeded) {
				autosaveLockedRef.current = false
				setAutosaveLocked(false)
			}
		})
	}

	// Only switches the poll OFF — the question and the date options are kept, so turning it
	// back on in the same session restores what was there. The server does the same with the
	// votes (see the datePoll block in api/events/[eventId]/update.ts): picking a fixed date
	// must not be a way to delete what guests voted for.
	const clearDatePoll = () => {
		formikRef.current?.setFieldValue("datePoll.isActive", false)
	}

	const handleStartDateChange = (date?: string, time?: string) => {
		if (formikRef?.current) {
			if (date !== undefined) {
				formikRef.current.setFieldValue("startDate", date)
				if (date) clearDatePoll() // setting a fixed date disables the poll (mutually exclusive)
			}
			if (time !== undefined) formikRef.current.setFieldValue("startTime", time)
		}
	}

	const handleEndDateChange = (date?: string, time?: string) => {
		if (formikRef?.current) {
			if (date !== undefined) {
				formikRef.current.setFieldValue("endDate", date)
				if (date) clearDatePoll() // setting a fixed date disables the poll (mutually exclusive)
			}
			if (time !== undefined) formikRef.current.setFieldValue("endTime", time)
		}
	}

	const handleImageUpload = async (files: FileList | null) => {
		if (!files || files.length === 0 || isUploading) return
		setIsUploading(true)
		setUploadProgress(0)
		try {
			for (let i = 0; i < files.length; i++) {
				const file = files[i]
				const res = await uploadFile(file, { onProgressChange: (progress) => setUploadProgress(progress), folder: "posts" })
				setUploadedImages((prev) => [...prev, { id: uniqueId(10), file: res.url }])
			}
		} catch (error: any) {
			console.error("Error uploading file", error)
			Error("Error", "Failed to upload file")
		} finally {
			setIsUploading(false)
			setUploadProgress(0)
		}
	}

	const handleImageDelete = async (imageUrl: string) => {
		try {
			try { await deleteFile(imageUrl) } catch {}
			// The event id is required now: the endpoint used to match the url across every
			// event, which meant it could strip an image off somebody else's.
			await axios.post("/api/delete-image", { eventId: event._id, url: imageUrl })
			setUploadedImages((prev) => prev.filter((img) => img.file !== imageUrl))
			setDeletedLiveImage(true)
		} catch (error: any) {
			console.error("Error deleting image", error)
		}
	}

	const handleVideoUpload = async (files: FileList | null) => {
		if (!files || files.length === 0 || isUploadingVideo) return
		setIsUploadingVideo(true)
		setVideoUploadProgress(0)
		try {
			for (let i = 0; i < files.length; i++) {
				const file = files[i]
				const res = await uploadFile(file, { onProgressChange: (progress) => setVideoUploadProgress(progress), folder: "posts" })
				setUploadedVideos((prev) => [...prev, { id: uniqueId(10), file: res.url }])
			}
		} catch (error: any) {
			console.error("Error uploading video", error)
		} finally {
			setIsUploadingVideo(false)
			setVideoUploadProgress(0)
		}
	}

	const handleVideoDelete = async (videoUrl: string) => {
		try {
			try { await deleteFile(videoUrl) } catch {}
			setUploadedVideos((prev) => prev.filter((v) => v.file !== videoUrl))
		} catch (error: any) {
			console.error("Error deleting video", error)
		}
	}

	const handleApproveEvent = () => {
		setIsApproving(true)
		axios.post(`/api/events/${event._id}/approve`).then(() => {
			toast({ title: "Event approved successfully!", status: "success", duration: 3000 })
			onApproveClose()
			router.replace(router.asPath)
		}).catch((err) => {
			toast({ title: err?.response?.data?.message || "Failed to approve event.", status: "error", duration: 4000 })
		}).finally(() => setIsApproving(false))
	}

	const handleCloneEvent = () => {
		setIsCloning(true)
		axios.post(`/api/events/${event._id}/clone`).then((res) => {
			const newId = res?.data?.data?._id
			toast({ title: "Event cloned successfully!", status: "success", duration: 3000 })
			// Deliberate navigation — the draft is untouched and still waiting on this event.
			leaveGuard.bypass()
			if (newId) router.push(`/console/events/${newId}/manage`)
			else router.replace(router.asPath)
		}).catch((err) => {
			toast({ title: err?.response?.data?.message || "Failed to clone event.", status: "error", duration: 4000 })
		}).finally(() => setIsCloning(false))
	}

	const handleDeleteEvent = () => {
		setIsDeleting(true)
		dispatcher(DeleteEventThunk({ id: event._id.toString() })).then(() => {
			if (event.images?.length > 0) event.images.forEach((image: string) => deleteFile(image))
			toast({ title: "Event deleted successfully!", status: "success", duration: 3000 })
			onDeleteClose()
			leaveGuard.bypass()
			router.push(ROUTES.dashboard.events.index)
		}).finally(() => setIsDeleting(false))
	}

	return (
		<>
			<ConsoleLayout
				stickyHeader
				page={
					<span className="flex flex-col mt-0 md:mt-3 min-w-0">
						{/* PHONE header — one row: back, the title on ONE line, the autosave state as a
						    dot, and the ⋯ menu. The desktop breadcrumb + heading + PENDING chip below
						    are hidden under `md`; this sticky header is paid on every scroll, and on a
						    phone the old one took over a third of the screen before the tab bar. */}
						<span className="flex md:hidden items-center gap-1 min-w-0">
							<Link
								href={ROUTES.dashboard.events.index}
								aria-label="Back to My Events"
								className="-ml-2 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-white/80 hover:bg-white/10"
							>
								<ChevronLeftIcon className="w-6 h-6" />
							</Link>
							<span className={`${roboto.className} line-clamp-1 flex-1 min-w-0`} style={{ fontSize: "18px", fontWeight: 700, lineHeight: "1.25", letterSpacing: "-0.02em", color: "#FFFFFF", overflowWrap: "anywhere" }}>
								{stripHtml(event.name)}
							</span>
							{tabIndex === 0 && autosaveState.status !== "idle" && (
								<Tooltip
									hasArrow
									label={autosaveState.status === "saved" ? "Changes saved" : autosaveState.status === "saving" ? "Saving…" : autosaveState.status === "error" ? "Save failed — retrying" : "Unsaved changes"}
								>
									<Box
										as="span"
										role="status"
										aria-label={autosaveState.status === "saved" ? "Changes saved" : autosaveState.status === "saving" ? "Saving" : autosaveState.status === "error" ? "Save failed" : "Unsaved changes"}
										display="inline-flex"
										alignItems="center"
										gap="6px"
										px="8px"
										h="26px"
										borderRadius="full"
										bg="#15181C"
										border="1px solid #343536"
										flexShrink={0}
									>
										<Box as="span" w="7px" h="7px" borderRadius="full" bg={autosaveState.status === "saved" ? "#7BC47F" : autosaveState.status === "error" ? "#EC5E5E" : "#F79432"} />
										<Text as="span" className={roboto.className} fontSize="11px" color={autosaveState.status === "saved" ? "#7BC47F" : autosaveState.status === "error" ? "#EC5E5E" : "#9C9C9C"} whiteSpace="nowrap">
											{autosaveState.status === "saved" ? "Saved" : autosaveState.status === "saving" ? "Saving" : autosaveState.status === "error" ? "Retrying" : "Unsaved"}
										</Text>
									</Box>
								</Tooltip>
							)}
							<Menu placement="bottom-end">
								<MenuButton
									as={IconButton}
									size="sm"
									h="40px"
									minW="40px"
									flexShrink={0}
									aria-label="More event actions"
									icon={<EllipsisHorizontalIcon className="w-6 h-6" />}
									variant="ghost"
									color="white"
									_hover={{ bg: "whiteAlpha.100" }}
									_active={{ bg: "whiteAlpha.200" }}
								/>
								{/* Portalled: this row renders inside the layout's <h1>, whose 30px bold would
								    otherwise cascade into every menu item. */}
								<Portal>
								<MenuList bg="#1D1F24" border="1px solid #444" color="white" minW="220px" zIndex={50} fontSize="15px" fontWeight={400}>
									<MenuItem bg="transparent" h="44px" _hover={{ bg: "#333" }} _focus={{ bg: "#333" }} onClick={() => window.open(previewPath(event.slug || String(event._id)), "_blank", "noopener")}>
										Preview as a guest
									</MenuItem>
									{isAdmin && (
										<MenuItem bg="transparent" h="44px" _hover={{ bg: "#333" }} _focus={{ bg: "#333" }} onClick={() => router.push(`/console/events/${event._id}/analytics`)}>
											View Analytics
										</MenuItem>
									)}
									<MenuItem bg="transparent" h="44px" _hover={{ bg: "#333" }} _focus={{ bg: "#333" }} isDisabled={isCloning} onClick={handleCloneEvent}>
										{isCloning ? "Cloning…" : "Clone Event"}
									</MenuItem>
									<MenuItem bg="transparent" h="44px" color="#EC5E5E" _hover={{ bg: "#3A2222" }} _focus={{ bg: "#3A2222" }} onClick={onDeleteOpen}>
										Delete Event
									</MenuItem>
								</MenuList>
								</Portal>
							</Menu>
						</span>
						{/* `truncate` matters on a phone: the name here is the same name the <h1> below
						    repeats, and without it a long one wraps the breadcrumb onto a second line
						    that says nothing new. "My Events" is a real link — it was a plain span,
						    so the only way back to the list was the browser's own back button. */}
						<span className={`${roboto.className} mb-2 hidden md:block truncate`} style={{ fontSize: "16px", lineHeight: "1.4", letterSpacing: "0" }}>
							<Link href={ROUTES.dashboard.events.index} className="font-normal hover:underline" style={{ color: "rgba(255,255,255,0.8)" }}>
								My Events
							</Link>
							<span className="font-normal" style={{ color: "rgba(255,255,255,0.8)" }}> &rsaquo; </span>
							<span className="text-[#F79432] font-normal">{stripHtml(event.name)}</span>
						</span>
						{/* Title and badge are flex siblings, not inline text: as an inline span the
						    badge broke across two lines ("PENDING" / "APPROVAL") the moment the name
						    filled the row. `whiteSpace: nowrap` keeps it one chip whatever the width. */}
						<span className="hidden md:flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
							{/* Clamped because this header is `sticky top-0` at EVERY width, so its height is
							    paid on every scroll — a 150-character title at 24px wraps to roughly eight
							    lines on a phone and then stays pinned there. ONE line below `md`, two from
							    `md` up: the same title is already on this screen twice more (truncated in
							    the breadcrumb above, in full in the Event title field below), so a phone
							    loses nothing by showing less of it.

							    The clamp is in CLASSES, not the inline style, because it has to be
							    responsive — and `display` / `WebkitBoxOrient` / `WebkitLineClamp` /
							    `overflow` must therefore stay OUT of `style`, since an inline value would
							    beat the class and silently pin it back to one fixed count. */}
							<span className={`${roboto.className} line-clamp-1 md:line-clamp-2`} style={{ fontSize: "24px", fontWeight: 700, lineHeight: "1.15", letterSpacing: "-0.03em", color: "#FFFFFF", minWidth: 0, overflowWrap: "anywhere" }}>
								{stripHtml(event.name)}
							</span>
							{/* Same rule as the Approve Event button beside it: a draft isn't in the
							    queue, so it doesn't wear the badge. */}
							{canApproveEvent && (
								<Box as="span" px="10px" py="3px" borderRadius="md" fontSize="12px" fontWeight="bold" letterSpacing="0.03em" whiteSpace="nowrap" bg="#3A2A00" color="#F79432" border="1px solid #F79432">
									PENDING APPROVAL
								</Box>
							)}
						</span>
					</span> as any
				}
				component={
					/* Six equal-weight buttons wrapped onto a ragged second row and gave a destructive
					   Delete the same presence as the primary Save. The row now carries only what is
					   used while editing — Approve (when it applies), Preview, Update Event — and the
					   rest sit behind a "More" menu. The autosave pill moves above the row so it stops
					   competing with the buttons for the same line.

					   Below `md` this whole row is replaced: the actions move to the ⋯ menu in the
					   title row and the fixed bar at the bottom, and this slot holds the section
					   switcher that stands in for the tab bar. */
					<>
					<div className="md:hidden w-full">
						<ManageSectionSwitcher sections={manageSections} tabIndex={tabIndex} onChange={setTabIndex} badges={sectionBadges} />
					</div>
					<div className="hidden md:flex flex-col w-full md:w-auto items-stretch md:items-end gap-2 self-stretch md:self-end min-w-0">
						{tabIndex === 0 && (
							<div className="flex justify-end">
								<AutosaveStatusPill state={autosaveState} />
							</div>
						)}
						{/* Full width on a phone, natural width from `md` up — the same breakpoint the
						    buttons already switch size at. Not `xs:`, which is 300px here and would
						    force four buttons onto one line on every handset. */}
						<div className="flex flex-wrap md:flex-nowrap gap-2 items-center justify-end w-full md:w-auto">
						{isAdmin && canApproveEvent && (
							<Button size={{ base: "sm", md: "md" }} flexShrink={0} flexBasis={{ base: "100%", md: "auto" }} bg="#2FA84F" color="white" _hover={{ bg: "#279143" }} _active={{ bg: "#279143" }} fontWeight="bold" isLoading={isApproving} onClick={onApproveOpen}>
								Approve Event
							</Button>
						)}
						{/* Preview as a guest. Opens the REAL event page with the host's own privileges
						    suppressed, rather than a mock-up, so the two can never drift apart.
						    A new tab because the alternative is losing an in-progress edit.

						    The page it opens is the LAST SAVED version: autosave on a published event
						    writes a shadow draft and leaves the live record alone, so unsaved changes
						    are deliberately not part of the preview. The tooltip says so instead of
						    the button quietly showing stale content. */}
						<Tooltip
							label={isFormDirty ? "Opens the last saved version — save first to preview your current changes" : "See the event exactly as a guest sees it"}
							hasArrow
						>
							<Button
								size={{ base: "sm", md: "md" }}
								flex={{ base: "1 1 0", md: "0 0 auto" }}
								minW={0}
								bg="#3E3E3E"
								color="white"
								_hover={{ bg: "#323232" }}
								_active={{ bg: "#323232" }}
								fontWeight="bold"
								leftIcon={<EyeIcon className="w-5 h-5" />}
								onClick={() => window.open(previewPath(event.slug || String(event._id)), "_blank", "noopener")}
							>
								Preview
							</Button>
						</Tooltip>
						<Button size={{ base: "sm", md: "md" }} flex={{ base: "1 1 0", md: "0 0 auto" }} minW={0} bg="#F79432" color="black" _hover={{ bg: "#E68422" }} _active={{ bg: "#E68422" }} fontWeight="bold" isLoading={isSubmitting} onClick={() => formikRef.current?.submitForm()}>
							{tabIndex === 0 && isFormDirty && (
								<Box as="span" w="8px" h="8px" borderRadius="full" bg="#0B0B0B" mr="2" flexShrink={0} />
							)}
							{/* Same rule as the leave dialog: with Status switched to Draft this button
							    takes the event off the public listing, so it must not say "Update". */}
							{willUnpublish ? "Unpublish" : "Update Event"}
						</Button>
						{/* Analytics, Clone and Delete are occasional, and Delete is destructive — none
						    of them belong beside the button the host presses every few minutes. */}
						<Menu placement="bottom-end">
							<MenuButton
								as={IconButton}
								size={{ base: "sm", md: "md" }}
								flexShrink={0}
								aria-label="More event actions"
								icon={<EllipsisHorizontalIcon className="w-5 h-5" />}
								bg="#3E3E3E"
								color="white"
								_hover={{ bg: "#323232" }}
								_active={{ bg: "#323232" }}
							/>
							<MenuList bg="#1D1F24" border="1px solid #444" color="white" minW="200px">
								{isAdmin && (
									<MenuItem bg="transparent" _hover={{ bg: "#333" }} _focus={{ bg: "#333" }} onClick={() => router.push(`/console/events/${event._id}/analytics`)}>
										View Analytics
									</MenuItem>
								)}
								<MenuItem bg="transparent" _hover={{ bg: "#333" }} _focus={{ bg: "#333" }} isDisabled={isCloning} onClick={handleCloneEvent}>
									{isCloning ? "Cloning…" : "Clone Event"}
								</MenuItem>
								<MenuItem bg="transparent" color="#EC5E5E" _hover={{ bg: "#3A2222" }} _focus={{ bg: "#3A2222" }} onClick={onDeleteOpen}>
									Delete Event
								</MenuItem>
							</MenuList>
						</Menu>
						</div>
					</div>
					</>
				}
			>
				{/* INVITE GUESTS MODAL  */}
				<InviteGuestsModal inviteGuestsModal={inviteGuestsModal} setInviteGuestsModal={setInviteGuestsModal} event={event} />

				{/* SEND BLAST MODAL  */}
				<SendBlastModal sendBlastModal={sendBlastModal} setSendBlastModal={setSendBlastModal} event={event} />

				{/* SHARE MODAL  */}
				<ShareModal shareModal={shareModal} setShareModal={setShareModal} eventSlug={event.slug} isPrivate={event.privacy === "private"} />

				{/* DAILY VIEWS MODAL */}
				<DailyViewsModal
					isOpen={showDailyViewsModal}
					onClose={() => setShowDailyViewsModal(false)}
					dailyViews={analytics?.trends?.views || []}
				/>

				{/* Phone: the Approve button leaves the header with the rest of the actions, so the
				    state it acts on gets said in words. Same dialog as the desktop button. */}
				{isAdmin && canApproveEvent && (
					<Flex display={{ base: "flex", md: "none" }} direction="column" gap={3} bg="rgba(47,168,79,0.10)" border="1px solid rgba(47,168,79,0.45)" borderRadius="10px" p={4} mb={3}>
						<Box>
							<Text className={roboto.className} color="white" fontWeight={700} fontSize="15px">Awaiting your review</Text>
							<Text className={roboto.className} color="#B5B6B7" fontSize="13px" mt={1} lineHeight="140%">
								Approving puts this event live and emails the host. It can&apos;t be undone.
							</Text>
						</Box>
						<Button h="44px" bg="#2FA84F" color="white" _hover={{ bg: "#279143" }} _active={{ bg: "#279143" }} fontWeight="bold" isLoading={isApproving} onClick={onApproveOpen}>
							Approve Event
						</Button>
					</Flex>
				)}

				{event.privacy === "private" && (
					<Box bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 3, md: 4 }} mt={{ base: 0, md: 4 }}>
						<Text className={roboto.className} color="white" fontWeight={700} fontSize="14px">Private event</Text>
						<Text className={roboto.className} color="#868686" fontSize="12px" mt={1} lineHeight="140%">
							This event is hidden from the public events list. Anyone you share the link with can
							view it. Use <strong>Share Event</strong> to copy the link.
						</Text>
					</Box>
				)}

				<Tabs variant="line" index={tabIndex} onChange={setTabIndex} mt={{ base: 3, md: 6 }}>
					{/* Hidden on phones — `ManageSectionSwitcher` in the header stands in for it. Both
					    render from `manageSections`, so the indices are the same list. Approvals is
					    conditional and Photo Requests stays LAST; the TabPanels below must keep that
					    order. */}
					<TabList display={{ base: "none", md: "flex" }} position="sticky" top="var(--console-header-h, 112px)" zIndex={20} bg="#0B0B0B" borderBottom="2px solid #9C9C9C" overflowX="auto" overflowY="hidden" sx={{ scrollbarWidth: "none", "::-webkit-scrollbar": { display: "none" }, "& > button": { flexShrink: 0 } }}>
						{manageSections.map((section) => (
							<Tab key={section.key} {...manageTabProps}>
								{section.label}
							</Tab>
						))}
					</TabList>
					<TabPanels>
						<TabPanel px={0} pt={{ base: 1, md: 4 }} pb={{ base: "104px", md: 4 }}>
							<Formik
								innerRef={formikRef}
								initialValues={initialValues}
								onSubmit={onSubmit}
								enableReinitialize={true}
							>
								{({ values, setFieldValue, dirty }) => (
									<Form>
										<FormDirtyWatcher dirty={dirty} status={values.status} onChange={setIsFormDirty} onStatusChange={setFormStatus} />
										<AutosaveManager
											enabled={tabIndex === 0 && !autosaveLocked}
											mediaVersion={mediaVersion}
											mediaDirty={mediaDirty}
											canSave={(v) => !!v.name?.trim()}
											onAutosave={handleAutosave}
											onStatusChange={setAutosaveState}
										/>
										{draftPayload && (
											<Flex
												mb={{ base: 3, md: 4 }}
												px={4}
												py={3}
												borderRadius="10px"
												bg="#2A2416"
												border="1px solid #F79432"
												align={{ base: "flex-start", md: "center" }}
												justify="space-between"
												direction={{ base: "column", md: "row" }}
												gap={3}
											>
												{/* "Draft" is the event's STATUS. Unpublished edits are "changes" — the two
												    were both called draft, and a host reading "discard draft" next to a Status
												    dropdown set to Draft could not tell which one they were about to lose. */}
												<Text className={roboto.className} color="#F5C77E" fontSize={{ base: "13px", md: "14px" }} lineHeight={{ base: "140%", md: "130%" }}>
													You&rsquo;re editing unpublished changes{draftSavedAt ? ` from ${dayjs(draftSavedAt).format("MMM D, h:mm A")}` : ""}. The live event still shows the published version until you press <b>Update Event</b>.
												</Text>
												<Button
													size="sm"
													variant="outline"
													borderColor="#F79432"
													color="#F79432"
													_hover={{ bg: "#F79432", color: "black" }}
													isLoading={isDiscardingDraft}
													onClick={handleDiscardDraft}
													flexShrink={0}
													h={{ base: "40px", md: 8 }}
													alignSelf={{ base: "stretch", md: "auto" }}
												>
													Discard changes
												</Button>
											</Flex>
										)}
										{/* Phone only: stats + quick actions, which on desktop sit in the sidebar
										    beside the form — on a phone that sidebar lands below the whole form. */}
										<ManageMobileSummary
											views={analytics?.summary?.views ?? 0}
											ticketsSold={analytics?.summary?.tickets?.sold ?? 0}
											attendees={analytics?.summary?.bookings ?? 0}
											onViewsClick={() => setShowDailyViewsModal(true)}
											actionsLocked={isPendingApproval}
											lockedMessage={event.status === "draft"
												? "Quick actions unlock once you publish this event and it's approved. You'll be able to invite guests, send blasts and open the check-in portal then."
												: "Quick actions unlock once your event is approved. You'll be able to invite guests, send blasts and open the check-in portal then."}
											onInvite={() => setInviteGuestsModal(true)}
											onBlast={() => setTabIndex(5)}
											onShare={() => setShareModal(true)}
											onCheckIn={() => router.push(`/console/events/${event._id}/check-in`)}
										/>
										{/* Below `md` both columns and the two multi-group cards are
										    `display: contents`, so every MobileSection becomes a direct child of
										    this flex column — which is what lets `order` arrange them for a phone
										    (Tickets and Media up, settings down) without touching desktop. */}
										<Flex direction={{ base: "column", lg: "row" }} gap={{ base: 3, md: 6 }} align={{ base: "stretch", md: "flex-start" }}>
											{/* ===================== MAIN COLUMN ===================== */}
											<Flex display={{ base: "contents", md: "flex" }} direction="column" gap={6} flex={{ base: "1", lg: "2" }} w="full" minW={0}>
												{/* ---- Status (top; mirrors the one further down, same `status` field) ---- */}
												<Box bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }}>
													<Flex align="center" justifyContent="space-between">
														<Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight={{ base: "125%", md: "100%" }}>Status</Text>
														<Field as="select" name="status" value={values?.status} className="bg-[#090C10] block w-[130px] h-10 rounded-md border border-[#2A2D31] py-1 shadow-sm sm:text-sm sm:leading-6 p-3 text-white">
															<option value="published">Published</option>
															<option value="draft">Draft</option>
														</Field>
													</Flex>
												</Box>
												{/* ---- Basic Information ---- */}
												<Box display={{ base: "contents", md: "block" }} bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }}>
													<Heading display={{ base: "none", md: "block" }} size="md" color="white" mb={5}>Basic Information</Heading>
													<MobileSection title="Basics" summary={textSummary(values.name, "Untitled event")} defaultOpen order={1}>

													<FormControl mb={4}>
														<FormLabel className={roboto.className} color="#FFFFFF" fontSize="12px" lineHeight="1.4" fontWeight={400} mb={2}>Event title <Text as="span" color="#F79432">*</Text> <Text as="span" color="#9C9C9C">{EVENT_TITLE_LIMIT_HINT}</Text></FormLabel>
														<InputGroup>
															<Field
																as={Input}
																name="name"
																placeholder="Event title"
																className={roboto.className}
																bg="#090C10"
																color="white"
																fontSize={{ base: "16px", md: "14px" }}
																h="48px"
																border="1px solid #343536"
																_focus={{ borderColor: "#343536", boxShadow: "none" }}
																// NOT the title rule — the browser cannot express "150 excluding spaces".
																// This is only the raw backstop; `clampEventTitle` below enforces the cap.
																maxLength={EVENT_TITLE_RAW_LIMIT}
																pr="60px"
																value={values?.name}
																onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
																	const next = clampEventTitle(e.target.value)
																	// A refused keystroke writes nothing, so it cannot re-arm the autosave debounce.
																	if (next !== values.name) setFieldValue("name", next)
																}}
															/>
															<InputLeftElement h="48px" w="auto" right="3" left="auto" pointerEvents="none" fontSize="xs" color={isEventTitleOverLimit(values.name || "") ? "#F79432" : "gray.500"}>
																{eventTitleCounter(values.name || "")}
															</InputLeftElement>
														</InputGroup>
													</FormControl>

													<FormControl mb={4}>
														<EventSlugField
															value={values.slug || ""}
															onChange={(v) => setFieldValue("slug", v)}
															eventName={values.name}
															eventId={event._id?.toString()}
															originalSlug={event.slug}
															warnOnChange
														/>
													</FormControl>

													</MobileSection>
													<MobileSection title="Date & time" summary={scheduleSummary(values)} order={2}>
													<FormControl mb={4}>
														<FormLabel className={roboto.className} color="#FFFFFF" fontSize="12px" lineHeight="100%" fontWeight={400} mb={2}>Time zone</FormLabel>
														<Box position="relative">
															<TimezoneSelect className={tzFieldCls} />
															<ChevronDownIcon className="w-5 h-5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
														</Box>
													</FormControl>

													{/* Conflict: legacy event has both a poll and fixed dates — keep both editable so the user can resolve it */}
													{!!((values.startDate || values.endDate) && (values.datePoll?.isActive)) && (
														<Box mb={3} p={3} rounded="lg" bg="#3A2A12" border="1px solid #7A5A20">
															<Text fontSize="sm" color="orange.300">This event has both a date poll and fixed dates. Remove one to continue.</Text>
														</Box>
													)}

													{/* Start / End date + time with dotted connector */}
													<Flex
														gap={4}
														alignItems="stretch"
														flexWrap={{ base: "wrap", sm: "nowrap" }}
														mb={!!((values.datePoll?.isActive) && !(values.startDate || values.endDate)) ? 1 : 4}
														bg={{ base: "transparent", md: "#14161B" }}
														rounded="xl"
														p={{ base: 0, md: 3 }}
														opacity={!!((values.datePoll?.isActive) && !(values.startDate || values.endDate)) ? 0.4 : 1}
														pointerEvents={!!((values.datePoll?.isActive) && !(values.startDate || values.endDate)) ? "none" : "auto"}
													>
														{/* Left: Start/End markers + dashed connector */}
														<Flex display={{ base: "none", md: "flex" }} direction="column" gap="3" position="relative" pr="1" flexShrink={0}>
															<Box position="absolute" left="5px" top="6" bottom="6" borderLeft="1px dashed #5A5D62" />
															<Flex h="48px" align="center" gap="3">
																<Box w="11px" h="11px" rounded="full" bg="#F79432" zIndex={1} />
																<Text className={roboto.className} color="#FFFFFFCC" fontSize="14px">Start</Text>
															</Flex>
															<Flex h="48px" align="center" gap="3">
																<Box w="11px" h="11px" rounded="full" bg="#3B82F6" zIndex={1} />
																<Text className={roboto.className} color="#FFFFFFCC" fontSize="14px">End</Text>
															</Flex>
														</Flex>
														{/* Right: two rows of date + time */}
														<Flex direction="column" gap={{ base: 2, md: 3 }} flex="1" minW={0}>
															{/* Phones: the Start/End rail is hidden (its fixed-height markers fell out of
															    line once the fields wrapped), so each row names itself. */}
															<Flex display={{ base: "flex", md: "none" }} align="center" gap={2}>
																<Box w="9px" h="9px" rounded="full" bg="#F79432" />
																<Text className={roboto.className} color="#FFFFFFCC" fontSize="13px" fontWeight={500}>Starts</Text>
															</Flex>
															<Flex gap={{ base: 2, md: 3 }} flexWrap="nowrap">
																<Box position="relative" flex={{ base: "1.15 1 0", md: "1" }} minW={{ base: 0, md: "140px" }}>
																	<CalendarDaysIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
																	<DatePicker className={dtFieldCls} onChange={(date) => handleStartDateChange(date)} placeholder="Start Date" defaultDate={values.startDate} />
																</Box>
																<Box position="relative" flex={{ base: "1 1 0", md: "1" }} minW={{ base: 0, md: "120px" }}>
																	<ClockIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
																	<TimePicker className={dtFieldCls} onChange={(time) => handleStartDateChange(undefined, time)} placeholder="Start Time" defaultValue={values.startTime} />
																</Box>
															</Flex>
															<Flex display={{ base: "flex", md: "none" }} align="center" gap={2} mt={2}>
																<Box w="9px" h="9px" rounded="full" bg="#3B82F6" />
																<Text className={roboto.className} color="#FFFFFFCC" fontSize="13px" fontWeight={500}>Ends</Text>
															</Flex>
															<Flex gap={{ base: 2, md: 3 }} flexWrap="nowrap">
																<Box position="relative" flex={{ base: "1.15 1 0", md: "1" }} minW={{ base: 0, md: "140px" }}>
																	<CalendarDaysIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
																	<DatePicker className={dtFieldCls} onChange={(date) => handleEndDateChange(date)} placeholder="End Date" defaultDate={values.endDate} />
																</Box>
																<Box position="relative" flex={{ base: "1 1 0", md: "1" }} minW={{ base: 0, md: "120px" }}>
																	<ClockIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
																	<TimePicker className={dtFieldCls} onChange={(time) => handleEndDateChange(undefined, time)} placeholder="End Time" defaultValue={values.endTime} />
																</Box>
															</Flex>
														</Flex>
													</Flex>
													{!!((values.datePoll?.isActive) && !(values.startDate || values.endDate)) && (
														<Text fontSize="xs" color="orange.400" mb={3}>Remove date poll to set a fixed start/end date</Text>
													)}

													{/* ---- Date Poll (mutually exclusive with fixed dates) ---- */}
													<Box
														mb={4}
														opacity={!!((values.startDate || values.endDate) && !(values.datePoll?.isActive)) ? 0.4 : 1}
														pointerEvents={!!((values.startDate || values.endDate) && !(values.datePoll?.isActive)) ? "none" : "auto"}
													>
														<Heading size="md" color="white" mb={1}>Date Poll <Text as="span" fontSize="sm" color="gray.500" fontWeight="normal">(optional)</Text></Heading>
														{!!((values.startDate || values.endDate) && !(values.datePoll?.isActive)) && (
															<Text fontSize="xs" color="orange.400" mb={2}>Remove start/end date to enable date poll</Text>
														)}
														<Flex align="center" justifyContent="space-between" mt={3} mb="3">
															<Box>
																<Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight={{ base: "125%", md: "100%" }}>Enable Date Poll</Text>
																<Text className={roboto.className} fontSize="12px" lineHeight={{ base: "140%", md: "100%" }} color="#868686">Let attendees vote on preferred event date</Text>
															</Box>
															<Switch isChecked={values.datePoll?.isActive} colorScheme="orange" onChange={() => {
																const next = !values.datePoll?.isActive
																setFieldValue("datePoll.isActive", next)
																if (next) { // enabling the poll clears any fixed dates (mutually exclusive)
																	setFieldValue("startDate", ""); setFieldValue("startTime", "")
																	setFieldValue("endDate", ""); setFieldValue("endTime", "")
																}
															}} />
														</Flex>
														{values.datePoll?.isActive && (
															<Box>
																{(values.datePoll?.options || []).map((opt, idx) => (
																	<Flex key={opt.id} align="center" justify="space-between" bg="#2B2B2B" rounded="md" px="3" py="2" mb="2" border="1px solid #464646">
																		<Box>
																			<Text fontSize="sm" fontWeight="bold" color="white">{opt.date} {opt.time}</Text>
																			{opt.label && <Text fontSize="xs" color="gray.400">{opt.label}</Text>}
																		</Box>
																		<Flex align="center" gap={1}>
																			<Button size="xs" variant="ghost" color="orange.300" onClick={() => {
																				setEditPollIndex(idx)
																				setTempPollOption(opt)
																				setPollDate(opt.date || "")
																				setPollTime(opt.time || "")
																				onPollModalOpen()
																			}}>Edit</Button>
																			<Button size="xs" variant="ghost" color="red.400" onClick={() => {
																				const updated = [...(values.datePoll?.options || [])]
																				updated.splice(idx, 1)
																				setFieldValue("datePoll.options", updated)
																			}}>Remove</Button>
																		</Flex>
																	</Flex>
																))}
																<Button size="sm" bg="transparent" color="white" border="1px dashed #666" width="100%" mt="1" _hover={{ bg: "#1C1F24" }} onClick={() => { setEditPollIndex(null); setTempPollOption({ id: "", date: "", time: "", label: "" }); setPollDate(""); setPollTime(""); onPollModalOpen() }} leftIcon={<PlusSVG />}>
																	Add Date Option
																</Button>
															</Box>
														)}
													</Box>

													</MobileSection>
													<MobileSection title="Location" summary={textSummary(values.location, "No location")} order={3}>
													<FormControl mb={4}>
														<FormLabel className={roboto.className} color="#FFFFFF" fontSize="12px" lineHeight="100%" fontWeight={400} mb={2}>Location</FormLabel>
														<InputGroup>
															<InputLeftElement h="48px" pointerEvents="none"><LocationSVG /></InputLeftElement>
															<Field name="location">
																{({ field }: any) => (
																	<Input
																		{...field}
																		ref={placesRef}
																		id="location"
																		placeholder="Search for a place, or type the address yourself"
																		// Google's own docs require this; without it the browser's
																		// saved-form dropdown renders over the Places one.
																		autoComplete="off"
																		onFocus={() => {
																			// Suppress the stale re-query on an untouched saved value.
																			if (field.value && field.value === lastPickedLocationRef.current) suppressPlacesDropdown()
																		}}
																		onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
																			// The moment they type, they mean to search again.
																			allowPlacesDropdown()
																			field.onChange(e)
																			// Typing by hand DROPS the dropdown pick (CEO, 2026-10-01) —
																			// their words and their own link, never a map link resolved
																			// for a place they have typed over. See dropLocationPick.
																			dropLocationPick(setFieldValue)
																		}}
																		onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
																			allowPlacesDropdown()
																			field.onBlur(e)
																		}}
																		className={roboto.className} bg="#090C10" color="white" fontSize={{ base: "16px", md: "14px" }} h="48px" border="1px solid #343536" _focus={{ borderColor: "#343536", boxShadow: "none" }} pl="10" />
																)}
															</Field>
														</InputGroup>
														<LocationValuePreview value={values.location} />
														{/* Pick from the dropdown OR type it yourself — typing is not
														    second-class, it just means no map link of our own goes out. */}
														<Flex justify="space-between" gap={2} mt={1}>
															<Text fontSize="xs" color="gray.500">
																Pick a place for a map link in the ticket email, or type the address and your own directions. Any link you paste stays clickable.
															</Text>
															<Text fontSize="xs" color={withinWordLimit(values.location, EVENT_LOCATION_WORD_LIMIT) ? "gray.500" : "red.300"} whiteSpace="nowrap">
																{wordCounter(values.location, EVENT_LOCATION_WORD_LIMIT)}
															</Text>
														</Flex>
													</FormControl>

													<FormControl mb={4}>
														<FormLabel className={roboto.className} color="#FFFFFF" fontSize="12px" lineHeight="100%" fontWeight={400} mb={2}>
															Entrance <span style={{ color: "#868686" }}>(optional)</span>
														</FormLabel>
														{/* A textarea, not an input: 150 WORDS of arrival directions now, with a
														    map link often pasted into the middle of them. */}
														<Field
															as={Textarea}
															name="entrance"
															placeholder="e.g. Entrance is from Central Park South, 59th St and 6th Avenue. Map: https://..."
															maxLength={EVENT_ENTRANCE_LIMIT}
															rows={3}
															className={roboto.className} bg="#090C10" color="white" fontSize={{ base: "16px", md: "14px" }} border="1px solid #343536" _focus={{ borderColor: "#343536", boxShadow: "none" }}
														/>
														<Flex justify="space-between" gap={2} mt={1}>
															<Text fontSize="xs" color="gray.500">
																Sent in the ticket confirmation email and shown on the booking confirmation page, just below the venue. Not shown on the event page. Any link you paste stays clickable.
															</Text>
															<Text fontSize="xs" color={withinWordLimit(values.entrance, EVENT_ENTRANCE_WORD_LIMIT) ? "gray.500" : "red.300"} whiteSpace="nowrap">
																{wordCounter(values.entrance, EVENT_ENTRANCE_WORD_LIMIT)}
															</Text>
														</Flex>
													</FormControl>

													</MobileSection>
													<MobileSection title="Description" summary={textSummary(values.desc, "No description")} order={4}>
													<FormControl>
														<FormLabel className={roboto.className} color="#FFFFFF" fontSize="12px" lineHeight="100%" fontWeight={400} mb={2}>Description</FormLabel>
														<RichTextEditor value={values.desc} onChange={(val) => setFieldValue("desc", val)} placeholder="Add Description" />
														<Text fontSize="xs" color="gray.500" mt={1} textAlign="right">{countChars(stripHtml(values.desc || ""))}/500</Text>
													</FormControl>
													</MobileSection>
												</Box>

												{/* ---- Post-Event Thank You ---- */}
												<MobileSection title="Thank-you email" summary={event.feedbackFormUrl ? (event.thankYouEmailSentAt ? "Sent" : "Feedback link saved") : "No feedback link"} order={9}>
												<Box bg={{ base: "transparent", md: "#15181C" }} border={{ base: "none", md: "1px solid #343536" }} borderRadius="10px" p={{ base: 0, md: 6 }}>
													<Heading display={{ base: "none", md: "block" }} size="md" color="white" mb={2}>Post-Event Thank You</Heading>
													<Text fontSize="sm" color="#9C9C9C" mb={5}>
														Add a feedback form link (e.g. Google Forms) below. Once added, you can send a thank you email blast to all confirmed participants.
													</Text>
													<Text fontWeight="bold" mb={2} color="white">Feedback Form Link</Text>
													<Flex gap={2} direction={{ base: "column", sm: "row" }}>
														<Input
															bg="#090C10"
															borderColor="#444444"
															color="white"
															placeholder="https://forms.google.com/..."
															value={feedbackFormUrl}
															onChange={(e) => setFeedbackFormUrl(e.target.value)}
														/>
														<Button onClick={onUpdateFeedbackLink} bg="#F79432" color="black" _hover={{ bg: "#E68422" }} flexShrink={0}>Save Link</Button>
													</Flex>
													{event.feedbackFormUrl && (
														<Box mt={4} p={4} bg="#252525" rounded="xl" border="1px dashed #F79432">
															<Text color="#F79432" fontWeight="bold" mb={2}>Ready to Send?</Text>
															<Button width="full" bg="#F79432" color="black" fontWeight="bold" _hover={{ bg: "#E68422" }} isLoading={isSendingThankYou} onClick={onSendThankYouEmails}>
																Send Thank You Emails to All Participants
															</Button>
															{event.thankYouEmailSentAt && (
																<Text mt={2} fontSize="xs" color="#9C9C9C">Last sent on: {DateTime.fromISO(event.thankYouEmailSentAt).toLocaleString(DateTime.DATETIME_MED)}</Text>
															)}
														</Box>
													)}
												</Box>

												</MobileSection>

												{/* ---- Interests ---- */}
												<MobileSection
													title="Interests & benefits"
													summary={`${countSummary((values.interests || []).length, "interest")} · ${countSummary(String(values.benefits || "").split(",").map((b) => b.trim()).filter(Boolean).length, "benefit")}`}
													order={8}
												>
												<Box bg={{ base: "transparent", md: "#15181C" }} border={{ base: "none", md: "1px solid #343536" }} borderRadius="10px" p={{ base: 0, md: 6 }}>
													<InterestsSelector bare selected={values.interests ?? []} onChange={(ids) => setFieldValue("interests", ids)} />
												</Box>

												{/* ---- Event Benefits ----
												    The same control the public event page's inline editor uses, so the two
												    cannot drift. */}
												<Box bg={{ base: "transparent", md: "#15181C" }} border={{ base: "none", md: "1px solid #343536" }} borderRadius="10px" p={{ base: 0, md: 6 }} mt={{ base: 6, md: 0 }}>
													<BenefitsField value={values.benefits || ""} onChange={(next) => setFieldValue("benefits", next)} />
												</Box>

												</MobileSection>

												{/* ---- Event Options ---- */}
												<Box display={{ base: "contents", md: "block" }} bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }}>
													<Heading display={{ base: "none", md: "block" }} size="md" color="white" mb={4}>Event Options</Heading>
													<MobileSection
														title="Options"
														summary={`${values.privacy === "private" ? "Private" : "Public"} · Approval ${values.requireApproval ? "on" : "off"}${values.premiumEvent ? " · Premium" : ""}`}
														order={7}
													>

													{/* The OLD "Premium Event" toggle and its member-discount % stay removed —
													    Jetzy Premium is SOLD per ticket now, see "Includes Jetzy Premium" on each
													    ticket. The toggle below is a different thing entirely: `premiumEvent` is a
													    curation tag that badges and filters the event and touches no pricing.
													    ADMIN-ONLY: the tag is Jetzy's curation, so a host is not shown the
													    switch at all (and `update.ts` ignores the field from one). */}
													{isAdmin && (
													<Flex align="center" justifyContent="space-between" mb={4}>
														<Flex gap="3" alignItems="center" sx={{ "& > svg": { width: "24px", height: "24px" } }}>
															<Text fontSize="22px" lineHeight="24px" color="#F5C518">★</Text>
															<Box>
																<Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight={{ base: "125%", md: "100%" }}>Premium Event</Text>
																<Text className={roboto.className} fontSize="12px" lineHeight="140%" color="#868686" maxW="360px">
																	Shows a Premium badge on the listing and the event page, and makes the event findable under the Premium filter. Changes no pricing or membership.
																</Text>
															</Box>
														</Flex>
														<Switch
															name="premiumEvent"
															isChecked={!!values.premiumEvent}
															colorScheme="orange"
															onChange={() => setFieldValue("premiumEvent", !values.premiumEvent)}
														/>
													</Flex>
													)}

													<Flex align="center" justifyContent="space-between" mb={4}>
														<Flex gap="3" alignItems="center" sx={{ "& > svg": { width: "24px", height: "24px" } }}>
															<LockSVG />
															<Box>
																<Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight={{ base: "125%", md: "100%" }}>Privacy</Text>
																<Text className={roboto.className} fontSize="12px" lineHeight={{ base: "140%", md: "100%" }} color="#868686">Who can view and join this event</Text>
															</Box>
														</Flex>
														<Field as="select" id="privacy" name="privacy" value={values?.privacy} className="bg-[#090C10] block w-[110px] h-10 rounded-md border border-[#2A2D31] py-1 shadow-sm sm:text-sm sm:leading-6 p-3 text-white">
															<option value="private">Private</option>
															<option value="public">Public</option>
														</Field>
													</Flex>
													<Flex align="center" justifyContent="space-between" mb={4}>
														<Flex gap="3" alignItems="center" sx={{ "& > svg": { width: "24px", height: "24px" } }}>
															<UserTickSVG />
															<Box>
																<Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight={{ base: "125%", md: "100%" }}>Require Approval</Text>
																<Text className={roboto.className} fontSize="12px" lineHeight="140%" color="#868686" maxW="360px">
																	Default for tickets that don&apos;t set their own. Paid tickets authorize the card at checkout and are only charged when you approve.
																</Text>
															</Box>
														</Flex>
														<Switch
															name="requireApproval"
															isChecked={values.requireApproval}
															colorScheme="orange"
															onChange={() => setFieldValue("requireApproval", !values.requireApproval)}
														/>
													</Flex>
																					{/* Event-wide Capacity was REMOVED from this form. Capacity is set PER TICKET now
																					    (the "Quantity Available" field in the ticket editor), which is what the
																					    mobile app shares and what the ticket cards and checkout enforce.

																					    The stored `event.capacity` field is NOT gone: a non-zero value left on an
																					    existing event is still honoured as an overall ceiling by
																					    `src/lib/ticket-availability.ts`, so no live event silently becomes
																					    unlimited. Nothing new sets it, which is why the input is gone rather than
																					    the field. `capacity: 0` stays in this form's initial values so the
																					    outgoing payload shape is unchanged. */}
													<Flex align="center" justifyContent="space-between" mb={4}>
														<Flex gap="3" alignItems="center" sx={{ "& > svg": { width: "24px", height: "24px" } }}>
															<UserTickSVG />
															<Box>
																<Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight={{ base: "125%", md: "100%" }}>Send Update Email to Attendees</Text>
																<Text className={roboto.className} fontSize="12px" lineHeight={{ base: "140%", md: "100%" }} color="#868686">Notify booked attendees of changes on save</Text>
															</Box>
														</Flex>
														<Switch isChecked={sendUpdateEmailCheck} colorScheme="orange" onChange={(e) => setSendUpdateEmailCheck(e.target.checked)} />
													</Flex>
													<Flex align="center" justifyContent="space-between" mb={4}>
														<Flex gap="3" alignItems="center" sx={{ "& > svg": { width: "24px", height: "24px" } }}>
															<LocationSVG />
															<Box>
																<Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight={{ base: "125%", md: "100%" }}>Disclose Location After Booking</Text>
																<Text className={roboto.className} fontSize="12px" lineHeight={{ base: "140%", md: "100%" }} color="#868686">Attendees see location only in booking email</Text>
															</Box>
														</Flex>
														<Switch name="locationDisclosedAfterBooking" isChecked={values.locationDisclosedAfterBooking} colorScheme="orange" onChange={() => setFieldValue("locationDisclosedAfterBooking", !values.locationDisclosedAfterBooking)} />
													</Flex>
													<Flex align="center" justifyContent="space-between" mb={4}>
														<Flex gap="3" alignItems="center" sx={{ "& > svg": { width: "24px", height: "24px" } }}>
															<DevicePhoneMobileIcon className="text-[#B5B6B7]" />
															<Box>
																<Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight={{ base: "125%", md: "100%" }}>Show on Mobile</Text>
																<Text className={roboto.className} fontSize="12px" lineHeight={{ base: "140%", md: "100%" }} color="#868686">Display this event in the Jetzy mobile app</Text>
															</Box>
														</Flex>
														<Switch name="showOnMobile" isChecked={values.showOnMobile} colorScheme="orange" onChange={() => setFieldValue("showOnMobile", !values.showOnMobile)} />
													</Flex>
													</MobileSection>
													<MobileSection
														title="Tickets"
														summary={`${countSummary(values.tickets.length, "ticket type")} · ${Array.from(ticketSalesSummary.values()).reduce((n, t) => n + t.sold, 0)} sold`}
														order={5}
													>
													<Flex align="center" justifyContent="space-between">
														{/* The section header already says "Tickets" on a phone. */}
														<Flex display={{ base: "none", md: "flex" }} gap="3" alignItems="center" sx={{ "& > svg": { width: "24px", height: "24px" } }}>
															<TicketSVG />
															<Box>
																<Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight={{ base: "125%", md: "100%" }}>Tickets</Text>
																<Text className={roboto.className} fontSize="12px" lineHeight={{ base: "140%", md: "100%" }} color="#868686">Manage ticket types and pricing</Text>
															</Box>
														</Flex>
														<Button bg="transparent" color="#F79432" _hover={{ bg: "transparent" }} _active={{ bg: "transparent" }} size="sm" fontSize="16px" onClick={() => { setEditIndex(null); setTempTicket({ id: "", title: "", description: "", price: 0 }); onOpen() }} leftIcon={<TicketIcon className="w-5 h-5" />} p={{ base: 3, md: 0 }} w={{ base: "full", md: "auto" }} h={{ base: "44px", md: 8 }} border={{ base: "1px dashed #F79432", md: "none" }} borderRadius="10px">
															Add Tickets
														</Button>
													</Flex>
													<FieldArray name="tickets">
																{({ remove, move }) => (
															<>
																	{/* Drag order IS the stored order — `event.tickets` is an array and every
																	    reader renders it unsorted, so what the host arranges here is what a
																	    guest sees on the event page. `move` is Formik's own helper, so a
																	    reorder is ordinary form state and autosave picks it up unchanged.
																	    Ticket `_id`s are untouched, so bookings referencing them are safe. */}
																	<SortableTicketList
																		items={values.tickets.map((t, i) => String(t.id || i))}
																		onReorder={move}
																	>
																{values.tickets.map((ticket, index) => {
																	const stats = ticketSalesSummary.get(ticket.id.toString())
																	return (
																			<SortableTicketItem key={ticket.id || index} id={String(ticket.id || index)}>
																			<Box pt={{ base: 4, md: 5 }} pr={{ base: 4, md: 5 }} pb={{ base: 4, md: 5 }} pl="10" bg="#1E1E1E" borderRadius="10px" border="1px solid #343536" mt={{ base: 3, md: 4 }} position="relative">
																			<Flex align="center" gap={2} pr="6" wrap="wrap">
																				<Text className={roboto.className} fontWeight="bold" fontSize="lg" color="white">{ticket.title}</Text>
																				{ticketApprovalFlag(values as any, ticket as any) && (
																					<Badge colorScheme="orange" fontSize="0.7em" px={2} py={0.5} borderRadius="6px">Approval</Badge>
																				)}
																			</Flex>
																			{/* Through the shared EventDescription, same as the public ticket list.
																			    A plain <Text> collapses the host's line breaks into one run-on
																			    paragraph, so the preview here disagreed with what a guest sees. */}
																			<Box my="1" pr="6">
																				<EventDescription description={ticket.description} className={`${roboto.className} text-sm text-[#868686]`} />
																			</Box>
																			<Flex align="center" justify="space-between" mt="2" wrap="wrap" gap={2}>
																				<Text fontWeight="bold" fontSize={{ base: "xl", md: "2xl" }} color="#F79432">${ticket.price}</Text>
																				<Flex gap={2} wrap="wrap">
																					<Badge colorScheme="purple" fontSize="0.75em" px={2} py={1} borderRadius="6px">{stats?.sold ?? 0} sold</Badge>
																					<Badge colorScheme="green" fontSize="0.75em" px={2} py={1} borderRadius="6px">${(stats?.revenue ?? 0).toFixed(2)} collected</Badge>
																					{/* Without this, a fully comped ticket type reads "3 sold, $0.00
																					    collected" and looks like a broken number rather than three
																					    tickets deliberately given away. */}
																					{(stats?.comped ?? 0) > 0 && (
																						<Badge colorScheme="blue" fontSize="0.75em" px={2} py={1} borderRadius="6px">{stats?.comped} comped</Badge>
																					)}
																					{(stats?.onHold ?? 0) > 0 && (
																						<Badge colorScheme="yellow" fontSize="0.75em" px={2} py={1} borderRadius="6px">${(stats?.onHold ?? 0).toFixed(2)} on hold</Badge>
																					)}
																				</Flex>
																			</Flex>
																			<Box position="absolute" top="4" right="4">
																				<Menu>
																					<MenuButton as={IconButton} icon={<EllipsisHorizontalIcon className="w-6 h-6" />} variant="ghost" size="sm" color="white" _hover={{ bg: "#333" }} _active={{ bg: "#444" }} />
																					<MenuList bg="#1D1F24" border="1px solid #444" color="white">
																						<MenuItem bg="transparent" _hover={{ bg: "#333" }} onClick={() => { setEditIndex(index); setTempTicket(ticket); onOpen() }}>Edit</MenuItem>
																						<MenuItem bg="transparent" _hover={{ bg: "#333" }} onClick={() => remove(index)}>Delete</MenuItem>
																					</MenuList>
																				</Menu>
																			</Box>
																		</Box>
																		</SortableTicketItem>
																	)
																})}
																</SortableTicketList>

																{/* Money taken against ticket types that have since been deleted.
																    There is no card for those, so without this row their revenue is
																    missing from the page entirely and the totals silently don't add up.
																    Read-only — the ticket is gone and can't be edited back. */}
																{(removedTicketSales.sold > 0 || removedTicketSales.revenue > 0) && (
																	<Box p="5" bg="#15181C" borderRadius="10px" border="1px dashed #343536" mt={4}>
																		<Text className={roboto.className} fontWeight="bold" fontSize="md" color="#9C9C9C">Removed ticket types</Text>
																		<Text className={roboto.className} fontSize="xs" color="#868686" mt={1}>
																			Sales against ticket types that no longer exist on this event. Shown so the totals still add up.
																		</Text>
																		<Flex gap={2} wrap="wrap" mt={3}>
																			<Badge colorScheme="purple" fontSize="0.75em" px={2} py={1} borderRadius="6px">{removedTicketSales.sold} sold</Badge>
																			<Badge colorScheme="green" fontSize="0.75em" px={2} py={1} borderRadius="6px">${removedTicketSales.revenue.toFixed(2)} collected</Badge>
																			{removedTicketSales.onHold > 0 && (
																				<Badge colorScheme="yellow" fontSize="0.75em" px={2} py={1} borderRadius="6px">${removedTicketSales.onHold.toFixed(2)} on hold</Badge>
																			)}
																		</Flex>
																	</Box>
																)}
															</>
														)}
													</FieldArray>
													</MobileSection>
												</Box>

												{/* Status (kept) — the top one is enough on a phone */}
												<Box display={{ base: "none", md: "block" }} bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }}>
													<Flex align="center" justifyContent="space-between">
														<Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight={{ base: "125%", md: "100%" }}>Status</Text>
														<Field as="select" name="status" value={values?.status} className="bg-[#090C10] block w-[130px] h-10 rounded-md border border-[#2A2D31] py-1 shadow-sm sm:text-sm sm:leading-6 p-3 text-white">
															<option value="published">Published</option>
															<option value="draft">Draft</option>
														</Field>
													</Flex>
												</Box>
											</Flex>

											{/* ===================== SIDEBAR ===================== */}
											<Flex display={{ base: "contents", md: "flex" }} direction="column" gap={6} flex="1" w="full" maxW={{ lg: "360px" }} minW={0}>
												{/* ---- Event Media ---- */}
												<MobileSection title="Media" summary={countSummary(uploadedImages.length + uploadedVideos.length, "photo or video", "photos and videos")} order={6}>
												<Box bg={{ base: "transparent", md: "#15181C" }} border={{ base: "none", md: "1px solid #343536" }} borderRadius="10px" p={{ base: 0, md: 6 }}>
													<Heading display={{ base: "none", md: "block" }} size="md" color="white" mb={4}>Event Media</Heading>
													<MediaUploadSection
														uploadedImages={uploadedImages}
														uploadedVideos={uploadedVideos}
														onImageChange={handleImageUpload}
														onVideoChange={handleVideoUpload}
														isUploadingImage={isUploading}
														isUploadingVideo={isUploadingVideo}
														imageUploadProgress={uploadProgress}
														videoUploadProgress={videoUploadProgress}
														handleImageDelete={handleImageDelete}
														handleVideoDelete={handleVideoDelete}
														mediaOrder={mediaOrder}
														onReorder={setMediaOrder}
														maxItems={allowedMediaCount(isAdmin, uploadedImages.length + uploadedVideos.length)}
													/>
												</Box>

												{/* ---- Listing card preview ----
												    Sits under the media box on purpose: it is mostly a question about the
												    banner. Cards letterbox on black rather than crop, so a portrait poster
												    looks nothing like it does in the upload box. */}
												<Box display={{ base: "block", md: "contents" }} mt={{ base: 5, md: 0 }}>
												<ListingCardPreview
													images={uploadedImages}
													videos={uploadedVideos}
													mediaOrder={mediaOrder}
													eventId={String(event._id)}
												/>
												</Box>
												</MobileSection>

												{/* ---- Quick Actions ----
												    Hidden while the event is awaiting admin approval: guests can't open
												    the event yet, so an invite or blast would send them to the
												    "not yet approved" page. Server-side guards enforce the same rule. */}
												{isPendingApproval ? (
													<Box display={{ base: "none", md: "block" }} bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }}>
														<Heading size="md" color="white" mb={2}>Quick Actions</Heading>
														{/* Still gated on the loose flag — a draft mustn't invite or blast either — but
														    the copy has to name the step the host is actually missing. */}
														<Text className={roboto.className} color="#868686" fontSize="14px" lineHeight="150%">
															{event.status === "draft"
																? "Quick actions unlock once you publish this event and it's approved. You'll be able to invite guests, send blasts and open the check-in portal then."
																: "Quick actions unlock once your event is approved. You'll be able to invite guests, send blasts and open the check-in portal then."}
														</Text>
													</Box>
												) : (
												<Box display={{ base: "none", md: "block" }} bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }} sx={{ ...iconBrighten, "& svg": { width: "20px", height: "20px" } }}>
													<Heading size="md" color="white" mb={4}>Quick Actions</Heading>
													<Flex direction="column" gap={3}>
														<Flex as="button" type="button" align="center" gap={2} border="1px solid #FFFFFF29" borderRadius="10px" p={4} _hover={{ bg: "#FFFFFF0A" }} onClick={() => setInviteGuestsModal(true)}>
															<UserPlusSVG /><Text className={roboto.className} color="white" fontWeight={500} fontSize="16px">Invite Guests</Text>
														</Flex>
														<Flex as="button" type="button" align="center" gap={2} border="1px solid #FFFFFF29" borderRadius="10px" p={4} _hover={{ bg: "#FFFFFF0A" }} onClick={() => setTabIndex(5)}>
															<MessageSVG /><Text className={roboto.className} color="white" fontWeight={500} fontSize="16px">Send a Blast</Text>
														</Flex>
														<Flex as="button" type="button" align="center" gap={2} border="1px solid #FFFFFF29" borderRadius="10px" p={4} _hover={{ bg: "#FFFFFF0A" }} onClick={() => setShareModal(true)}>
															<ShareIcon className="w-5 h-5" /><Text className={roboto.className} color="white" fontWeight={500} fontSize="16px">Share Event</Text>
														</Flex>
														<Flex as="button" type="button" align="center" gap={2} border="1px solid #FFFFFF29" borderRadius="10px" p={4} _hover={{ bg: "#FFFFFF0A" }} onClick={() => router.push(`/console/events/${event._id}/check-in`)}>
															<TicketSVG /><Text className={roboto.className} color="white" fontWeight={500} fontSize="16px">Check In Portal</Text>
														</Flex>
													</Flex>
												</Box>
												)}

												{/* ---- Event Stats ---- */}
												<Box display={{ base: "none", md: "block" }} bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }} sx={{ ...iconBrighten, "& svg": { width: "22px", height: "22px" } }}>
													<Heading size="md" color="white" mb={4}>Event Stats</Heading>
													<Flex direction="column">
														<Flex align="center" gap={3} cursor="pointer" py={2} onClick={() => setShowDailyViewsModal(true)}>
															<EyeIcon />
															<Box>
																<Text className={roboto.className} color="#9C9C9C" fontSize="13px" lineHeight="1.2">Views</Text>
																<Text color="white" fontWeight="bold" fontSize="lg" lineHeight="1.2">{analytics?.summary?.views ?? 0}</Text>
															</Box>
														</Flex>
														<Box borderTop="1px solid #2E2E2E" my={1} />
														<Flex align="center" gap={3} py={2}>
															<TicketSVG />
															<Box>
																<Text className={roboto.className} color="#9C9C9C" fontSize="13px" lineHeight="1.2">Tickets Sold</Text>
																<Text color="white" fontWeight="bold" fontSize="lg" lineHeight="1.2">{analytics?.summary?.tickets?.sold ?? 0}</Text>
															</Box>
														</Flex>
														<Box borderTop="1px solid #2E2E2E" my={1} />
														<Flex align="center" gap={3} py={2}>
															<MultipleUsersSVG />
															<Box>
																<Text className={roboto.className} color="#9C9C9C" fontSize="13px" lineHeight="1.2">Attendees</Text>
																<Text color="white" fontWeight="bold" fontSize="lg" lineHeight="1.2">{analytics?.summary?.bookings ?? 0}</Text>
															</Box>
														</Flex>
													</Flex>
												</Box>
											</Flex>
										</Flex>

										{/* Tickets Modal — the shared editor, so the inline one on the public
										    event page is literally the same dialog. Manage keeps ownership of
										    where a saved ticket goes: into the Formik FieldArray. */}
										<FieldArray name="tickets">
											{({ push, replace }) => (
												<TicketEditorModal
													isOpen={isOpen}
													onClose={onClose}
													ticket={tempTicket}
													onTicketChange={setTempTicket}
													isEditing={editIndex !== null}
													eventRequireApproval={!!values.requireApproval}
													canManageMemberships={isAdmin}
													onSave={(normalised) => {
														if (editIndex !== null) replace(editIndex, normalised)
														else push({ ...normalised, id: uniqueId(10) })
														onClose()
													}}
												/>
											)}
										</FieldArray>

										{/* Date Poll Option Modal */}
										<Modal isOpen={isPollModalOpen} onClose={onPollModalClose} isCentered size={{ base: "full", md: "md" }}>
											<ModalOverlay />
											<ModalContent bg="#1E1E1E" color="white">
												<ModalHeader>{editPollIndex !== null ? "Edit Date Option" : "Add Date Option"}</ModalHeader>
												<ModalCloseButton />
												<ModalBody>
													<FormControl mb={4}>
														<FormLabel>Date</FormLabel>
														<DatePicker key={`poll-date-${isPollModalOpen}`} onChange={(d) => setPollDate(d)} defaultDate={pollDate} placeholder="Select date" />
													</FormControl>
													<FormControl mb={4}>
														<FormLabel>Time</FormLabel>
														<TimePicker key={`poll-time-${isPollModalOpen}`} className="bg-[#090C10] block w-full h-10 rounded-md border border-[#444] py-1.5 px-3 text-white sm:text-sm sm:leading-6" onChange={(t) => setPollTime(t)} defaultValue={pollTime} placeholder="Select time" />
													</FormControl>
													<FormControl mb={4}>
														<FormLabel>Label (optional)</FormLabel>
														<Input placeholder="e.g. Weekend option" maxLength={DATE_POLL_OPTION_LABEL_LIMIT} bg="#090C10" border="1px solid #444" color="white" value={tempPollOption.label || ""} onChange={(e) => setTempPollOption({ ...tempPollOption, label: e.target.value })} />
													</FormControl>
												</ModalBody>
												<ModalFooter>
													<Flex flexDirection="column" w="full" gap="3">
														<Button bg="#F79432" w="full" color="black" type="button" onClick={() => {
															const label = tempPollOption.label || ""
															if (pollDate) {
																const opts = [...(values.datePoll?.options || [])]
																if (editPollIndex !== null) {
																	opts[editPollIndex] = { ...opts[editPollIndex], date: pollDate, time: pollTime, label }
																} else {
																	opts.push({ id: Date.now().toString(), date: pollDate, time: pollTime, label, votes: [] })
																}
																setFieldValue("datePoll.options", opts)
																setEditPollIndex(null)
																setTempPollOption({ id: "", date: "", time: "", label: "" })
																setPollDate("")
																setPollTime("")
																onPollModalClose()
															}
														}}>{editPollIndex !== null ? "Save" : "Add"}</Button>
														<Button variant="unstyled" onClick={() => { setEditPollIndex(null); setPollDate(""); setPollTime(""); onPollModalClose() }}>Cancel</Button>
													</Flex>
												</ModalFooter>
											</ModalContent>
										</Modal>
									</Form>
								)}
							</Formik>
						</TabPanel>
						<TabPanel px={{ base: 0, md: 4 }} pt={{ base: 1, md: 4 }}>
							{/* Guests list content goes here */}
							<div className="md:bg-[#181818] rounded-xl p-0 md:p-3 flex flex-col gap-y-3">
								<GuestsList eventId={event._id} event={event} />
							</div>
						</TabPanel>
						<TabPanel px={{ base: 0, md: 4 }} pt={{ base: 1, md: 4 }}>
							<div className="md:bg-[#181818] rounded-xl p-0 md:p-3">
								{/* Performance lives behind the row's Analytics button, not under the table:
								    the tab's job is managing codes, and a permanent report below it pushed
								    that work off the screen. */}
								<ReferralCodesManager
									eventId={event._id}
									tickets={(event.tickets || []).map((t: any) => ({ _id: String(t._id), name: stripHtml(t.name || ""), price: Number(t.price) || 0 }))}
								/>
							</div>
						</TabPanel>
						<TabPanel px={{ base: 0, md: 4 }} pt={{ base: 1, md: 4 }}>
							<div className="md:bg-[#181818] rounded-xl p-0 md:p-3">
								<CustomQuestionsManager event={event} />
							</div>
						</TabPanel>
						<TabPanel px={{ base: 0, md: 4 }} pt={{ base: 1, md: 4 }}>
							<div className="md:bg-[#181818] rounded-xl p-0 md:p-3">
								<ResponsesList eventId={event._id} event={event} />
							</div>
						</TabPanel>
						<TabPanel px={{ base: 0, md: 4 }} pt={{ base: 1, md: 4 }}>
							<div className="md:bg-[#181818] rounded-xl p-0 md:p-3">
								<BlastsManager event={event} onOpenAdvanced={() => setSendBlastModal(true)} />
							</div>
						</TabPanel>
						{hasApprovalTickets && (
							<TabPanel px={{ base: 0, md: 4 }} pt={{ base: 1, md: 4 }}>
								<div className="md:bg-[#181818] rounded-xl p-0 md:p-3">
									<ApprovalRequests eventId={event._id} event={event} />
								</div>
							</TabPanel>
						)}
						<TabPanel px={{ base: 0, md: 4 }} pt={{ base: 1, md: 4 }}>
							<div className="md:bg-[#181818] rounded-xl p-0 md:p-3">
								<AlbumPhotoRequests eventId={event._id} eventName={event.name} />
							</div>
						</TabPanel>
					</TabPanels>
				</Tabs>

				{/* Phone save bar. Overview only — it is the only tab the form lives on; the other
				    tabs save their own rows, and Preview is in the header's ⋯ menu there. */}
				{tabIndex === 0 && (
					<ManageMobileActionBar
						onPreview={() => window.open(previewPath(event.slug || String(event._id)), "_blank", "noopener")}
						onSave={() => formikRef.current?.submitForm()}
						saveLabel={willUnpublish ? "Unpublish" : "Update Event"}
						isSaving={isSubmitting}
						isDirty={isFormDirty}
					/>
				)}

				{/* APPROVE EVENT CONFIRMATION — same wording as the events list's, so the two screens
				    can't drift about what approving does. */}
				<AlertDialog isOpen={isApproveOpen} leastDestructiveRef={approveCancelRef} onClose={onApproveClose} isCentered>
					<AlertDialogOverlay>
						<AlertDialogContent bg="#1E1E1E" border="1px solid #444">
							<AlertDialogHeader fontSize="lg" fontWeight="bold" color="white">Approve Event</AlertDialogHeader>
							<AlertDialogBody color="white">
								Approve &ldquo;{stripHtml(event.name)}&rdquo;? It goes live immediately and the host is emailed.
								This can&rsquo;t be undone — there is no way to un-approve an event.
							</AlertDialogBody>
							<AlertDialogFooter>
								<Button ref={approveCancelRef} onClick={onApproveClose}>Cancel</Button>
								<Button bg="#2FA84F" color="white" _hover={{ bg: "#279143" }} _active={{ bg: "#279143" }} onClick={handleApproveEvent} ml={3} isLoading={isApproving}>Approve</Button>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialogOverlay>
				</AlertDialog>

				{/* DELETE EVENT CONFIRMATION */}
				<AlertDialog isOpen={isDeleteOpen} leastDestructiveRef={cancelRef} onClose={onDeleteClose} isCentered>
					<AlertDialogOverlay>
						<AlertDialogContent bg="#1E1E1E" border="1px solid #444">
							<AlertDialogHeader fontSize="lg" fontWeight="bold" color="white">Delete Event</AlertDialogHeader>
							<AlertDialogBody color="white">Are you sure you want to delete this event? This action cannot be undone.</AlertDialogBody>
							<AlertDialogFooter>
								<Button ref={cancelRef} onClick={onDeleteClose}>Cancel</Button>
								<Button colorScheme="red" onClick={handleDeleteEvent} ml={3} isLoading={isDeleting}>Delete</Button>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialogOverlay>
				</AlertDialog>

				{/* LEAVING WITH AN UNPUBLISHED DRAFT
				    Autosave on a published event writes a shadow draft and leaves the live event
				    alone, so a host can edit, walk away, and see none of it on the event page.
				    The orange banner only tells them that on their NEXT visit — this says it on
				    the way out, while they can still act on it.

				    Three copy states, because "press Update Event" is not always a publish: the form
				    may be switched to Draft (the save UNPUBLISHES), or the event may still be in the
				    admin's review queue (no guest can see it either way). */}
				<UnsavedDraftDialog
					isOpen={leaveGuard.isOpen}
					tone={willUnpublish ? "danger" : "warning"}
					title={
						uploadInFlight
							? "An upload is still finishing"
							: willUnpublish
								? "Saving will unpublish this event"
								: isPendingApproval
									? "Your changes aren’t in the review yet"
									: "Your changes aren’t live yet"
					}
					savedLabel={lastAutosavedLabel ? `Changes saved ${lastAutosavedLabel}` : null}
					warning={
						deletedLiveImage ? (
							<>
								Photos you removed are already gone from the live event and can&rsquo;t be brought
								back — that part doesn&rsquo;t wait for <Box as="span" fontWeight={700}>Update Event</Box>.
							</>
						) : undefined
					}
					body={
						uploadInFlight ? (
							<>
								Leave now and the file won&rsquo;t be attached to this event — it finishes
								uploading with nowhere to go. It usually takes a moment.
							</>
						) : willUnpublish ? (
							<>
								You&rsquo;ve set Status to <Box as="span" color="white" fontWeight={700}>Draft</Box>.
								Saving now takes this event off the public listing — guests who have the link
								won&rsquo;t be able to see or book it. Your edits are kept either way.
							</>
						) : isPendingApproval ? (
							<>
								Nothing is lost — your changes are saved. This event is awaiting admin
								approval, and the version being reviewed is the last one you published. Press{" "}
								<Box as="span" color="white" fontWeight={700}>Update Event</Box> to include these changes.
							</>
						) : (
							<>
								Nothing is lost — your changes are saved. Guests keep seeing the
								published version until you press <Box as="span" color="white" fontWeight={700}>Update Event</Box>.
							</>
						)
					}
					/* "Leave as draft" is ambiguous when the DRAFT is the status being saved — there,
					   leaving means the event carries on being published. Say that instead. */
					leaveLabel={
						leaveGuard.isActionLeave
							? "Log out anyway"
							: uploadInFlight
								? "Leave anyway"
								: willUnpublish
									? "Leave it published"
									: "Leave unpublished"
					}
					onLeave={() => leaveGuard.confirmLeave()}
					onKeepEditing={leaveGuard.cancelLeave}
					/* No primary while an upload runs: saving then would publish the event WITHOUT
					   the file still on its way, which is the one outcome nobody wants. Nor on a
					   logout: publishing navigates to My Events, which would quietly drop the
					   logout they actually asked for. Their draft is on the server either way. */
					primary={
						uploadInFlight || leaveGuard.isActionLeave
							? undefined
							: {
									label: willUnpublish ? "Unpublish" : "Update Event",
									loadingLabel: willUnpublish ? "Unpublishing" : "Updating",
									onClick: handlePublishAndLeave,
								}
					}
					isBusy={isSubmitting}
				/>
			</ConsoleLayout>
		</>
	)
}

function SendBlastModal({ sendBlastModal, setSendBlastModal, event }: { sendBlastModal: boolean; setSendBlastModal: (sendBlastModal: boolean) => void; event: any }) {
	const [subject, setSubject] = useState("")
	const [message, setMessage] = useState("")
	const [status, setStatus] = useState<string[]>(["all"])
	const [targetType, setTargetType] = useState("invitations")
	const [emailType, setEmailType] = useState("custom")
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState("")
	const [attachments, setAttachments] = useState<BlastAttachment[]>([])
	const [uploading, setUploading] = useState(false)
	const [previewOpen, setPreviewOpen] = useState(false)
	const [greetByName, setGreetByName] = useState(true)
	const { data: session } = useSession()

	const toast = useToast({ position: "top" })

	useEffect(() => {
		if (!sendBlastModal) {
			setSubject("")
			setMessage("")
			setStatus(["all"])
			setTargetType("invitations")
			setEmailType("custom")
			setAttachments([])
			setUploading(false)
			setPreviewOpen(false)
			setGreetByName(true)
			setError("")
		}
	}, [sendBlastModal])

	const onSendBlast = async () => {
		// `status` is an array now, so `!status` would never fire. An empty body in the rich-text
		// editor is `<p><br></p>`, which is truthy - the text has to be stripped before trimming.
		if (status.length === 0 || !subject.trim() || !stripHtml(message).trim()) {
			setError("All fields are required.")
			return
		}
		setError("")
		setLoading(true)
		try {
			const res = await axios.post("/api/send-blast", {
				event,
				message,
				subject,
				status,
				targetType,
				emailType,
				// The server rebuilds this from the event record; kept correct here anyway.
				eventLink: eventUrl(process.env.NEXT_PUBLIC_URL || "", event.slug),
				attachments,
				greetByName,
			})

			if (res.status === 207) {
				toast({
					title: "Partially sent",
					description: res.data.message,
					status: "warning",
					duration: 5000,
					isClosable: true,
				})
			} else {
				toast({
					title: "Blast sent!",
					// The server names the number; the title alone said nothing about reach.
					description: res.data?.message,
					status: "success",
					duration: 3000,
					isClosable: true,
				})
			}
			setSendBlastModal(false)
		} catch (error: any) {
			toast({
				title: "Failed to send blast.",
				description: error.response?.data?.error || "An unexpected error occurred.",
				status: "error",
				duration: 5000,
				isClosable: true,
			})
		}
		setLoading(false)
	}

	return (
		<Modal isOpen={sendBlastModal} onClose={() => setSendBlastModal(false)} isCentered size={{ base: "full", md: "xl" }} scrollBehavior="inside">
			<ModalOverlay />
			<ModalContent bg="#1E1E1E" color="white">
				<ModalHeader>Send a Blast</ModalHeader>
				<ModalCloseButton />
				<ModalBody>
					<Box display="flex" flexDirection="column" gap={4}>
						<Text fontWeight="bold">Target Audience</Text>
						<Select
							mb={4}
							value={targetType}
							onChange={(e) => {
								setTargetType(e.target.value)
								// Reset status to "All" — valid first option in every target branch.
								setStatus(["all"])
							}}
							isRequired
							bg="#090C10"
							borderColor="#444444"
							color="white"
							_placeholder={{ color: "gray.400" }}
							_focus={{
								bg: "#090C10",
								borderColor: "#888",
								color: "white",
							}}
							_hover={{
								bg: "#090C10",
								borderColor: "#666",
							}}
						>
							<option style={{ backgroundColor: "#090C10", color: "white" }} value="all">
								All
							</option>
							<option style={{ backgroundColor: "#090C10", color: "white" }} value="invitations">
								Event Invitations
							</option>
							<option style={{ backgroundColor: "#090C10", color: "white" }} value="bookings">
								Event Bookings
							</option>
						</Select>

						<Text fontWeight="bold">Email Type</Text>
						<Select
							mb={4}
							value={emailType}
							onChange={(e) => setEmailType(e.target.value)}
							isRequired
							bg="#090C10"
							borderColor="#444444"
							color="white"
							_placeholder={{ color: "gray.400" }}
							_focus={{
								bg: "#090C10",
								borderColor: "#888",
								color: "white",
							}}
							_hover={{
								bg: "#090C10",
								borderColor: "#666",
							}}
						>
							<option style={{ backgroundColor: "#090C10", color: "white" }} value="custom">
								Custom Message
							</option>
							<option style={{ backgroundColor: "#090C10", color: "white" }} value="availability">
								Event Availability
							</option>
						</Select>
						<Text fontWeight="bold">Status</Text>
						{/* Checkboxes, not a dropdown: an admin needs pending AND approved in one send,
						    rather than mailing the same blast twice and splitting the history in two. */}
						<CheckboxGroup
							value={status}
							onChange={(next) => setStatus(nextBlastStatusSelection(status, next as string[]))}
						>
							<ChakraStack spacing={2} mb={4} pl={1}>
								{(targetType === "all"
									? [["all", "All"]]
									: targetType === "bookings"
										? [["all", "All"], ["pending", "Pending"], ["approved", "Approved"], ["confirmed", "Confirmed"]]
										: [["all", "All"], ["pending", "Pending"], ["accepted", "Accepted"], ["rejected", "Rejected"]]
								).map(([value, label]) => (
									<Checkbox key={value} value={value} color="gray.300" size="sm">
										{label}
									</Checkbox>
								))}
							</ChakraStack>
						</CheckboxGroup>
						<h3 className="font-bold">Subject</h3>
						<Input
							type="text"
							placeholder="Enter a Subject here..."
							value={subject}
							onChange={(e) => setSubject(e.target.value)}
							mb={2}
							isRequired
							bg="#090C10"
							borderColor="#444444"
							color="white"
							_placeholder={{ color: "gray.400" }}
						/>

						<h3 className="font-bold">Body</h3>
						{/* The same editor the event description uses, so a blast is written and re-edited
						    the same way everywhere. Quill emits HTML, which the template interpolates raw. */}
						<Box mb={3} sx={{ ".ql-container": { minHeight: "140px" } }}>
							<RichTextEditor hideImageButton value={message} onChange={(val) => setMessage(val)} placeholder="Write your message…" />
						</Box>
						{error && <Text color="red.500">{error}</Text>}

						{/* Off when the host's own message already opens with a greeting - otherwise the guest
						    reads "Hi Sarah," and then "Hi everyone!" one line later. */}
						<Checkbox isChecked={greetByName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGreetByName(e.target.checked)} mb={3} color="gray.300" size="sm">
							Greet each guest by name
						</Checkbox>
						<BlastAttachmentPicker attachments={attachments} onChange={setAttachments} onUploadingChange={setUploading} />

						<Flex gap={3}>
							<Button
								size="lg"
								variant="outline"
								borderColor="#444444"
								color="white"
								_hover={{ bg: "#2A2A2A" }}
								isDisabled={!message.trim()}
								onClick={() => setPreviewOpen(true)}
							>
								Preview
							</Button>
							{/* Uploads in flight would be sent as urls the server cannot fetch yet. */}
							<Button size="lg" bg="#F79432" color="black" _hover={{ bg: "#f78c22" }} _active={{ bg: "#e67a10" }} isLoading={loading} isDisabled={uploading} onClick={onSendBlast}>
								Send Blast
							</Button>
						</Flex>

						<BlastPreviewModal
							isOpen={previewOpen}
							onClose={() => setPreviewOpen(false)}
							subject={subject}
							message={message}
							eventName={event.name}
							eventLink={eventUrl(process.env.NEXT_PUBLIC_URL || "", event.slug)}
							event={event}
							emailType={emailType as "custom" | "availability"}
							attachments={attachments}
							greetByName={greetByName}
							targetType={targetType}
							status={status}
							hostName={(session?.user as any)?.name}
							hostEmail={(session?.user as any)?.email}
						/>
					</Box>
				</ModalBody>
			</ModalContent>
		</Modal>
	)
}

/**
 * Who received one blast, and what happened to it.
 *
 * Fetched on demand — the blast LIST deliberately excludes the recipient array, which on a big
 * event is thousands of rows. Opened from the "N didn't arrive" toggle on a history row.
 *
 * Two different failures are shown as two different things, because they mean different things
 * to a host: `Not sent` never left SendGrid (usually a malformed address), while `Bounced`
 * was accepted and then refused by the receiving server, and arrives MINUTES AFTER the send via
 * the webhook. A row can therefore read "Delivered" for a while and change later — that is
 * accurate, not a glitch.
 */
function BlastDeliveryDetail({ eventId, blastId }: { eventId: string; blastId: string }) {
	const { data, isLoading, isError } = useQuery({
		queryKey: ["blast-detail", eventId, blastId],
		queryFn: async () => {
			const res = await axios.get(`/api/events/${eventId}/blasts/${blastId}`)
			return res.data?.data
		},
	})

	if (isLoading) return <Text color="#9C9C9C" fontSize="sm" mt={3}>Loading delivery details…</Text>
	if (isError) return <Text color="#EC5E5E" fontSize="sm" mt={3}>Couldn&apos;t load delivery details.</Text>

	const recipients: BlastRecipient[] = data?.recipients || []

	// Blasts sent before per-recipient tracking existed carry no rows at all. Say so, rather
	// than rendering an empty table that reads as "nobody was mailed".
	if (recipients.length === 0) {
		return (
			<Text color="#9C9C9C" fontSize="sm" mt={3}>
				This blast was sent before per-recipient tracking was added, so there is no delivery breakdown for it.
			</Text>
		)
	}

	const problems = recipients.filter((r) => r.status !== "sent")
	const rows = problems.length > 0 ? problems : recipients

	return (
		<Box mt={3} borderTop="1px solid #434343" pt={3}>
			{problems.length > 0 ? (
				<Text color="#9C9C9C" fontSize="xs" mb={2}>
					{problems.length} of {recipients.length} didn&apos;t arrive. The rest were delivered.
				</Text>
			) : (
				<Text color="#9C9C9C" fontSize="xs" mb={2}>
					All {recipients.length} delivered.
				</Text>
			)}

			<Box display="flex" flexDirection="column" gap={2} maxH="320px" overflowY="auto">
				{rows.map((r, i) => {
					const status = (r.status || "sent") as BlastRecipientStatus
					const explanation = status === "sent" ? "" : describeDeliveryFailure(status, r.reason)
					return (
						<Box key={`${r.email}-${i}`} bg="#161616" borderRadius="md" p={3}>
							<Flex justify="space-between" align="start" gap={3} wrap="wrap">
								<Box flex="1" minW="180px">
									<Text color="white" fontSize="sm" wordBreak="break-all">
										{r.name ? `${r.name} — ` : ""}
										{r.email}
									</Text>
									{explanation && (
										<Text color="#B5B6B7" fontSize="xs" mt={1}>
											{explanation}
										</Text>
									)}
									{/* The raw server response. Kept verbatim under the plain-English line —
									    support needs the real text, the host needs the sentence above it. */}
									{r.reason && (
										<Text color="#6E6E6E" fontSize="xs" mt={1} wordBreak="break-word">
											{r.reason}
										</Text>
									)}
								</Box>
								<Badge colorScheme={BLAST_STATUS_COLOR[status] || "gray"} flexShrink={0}>
									{BLAST_STATUS_LABEL[status] || status}
								</Badge>
							</Flex>
						</Box>
					)
				})}
			</Box>
		</Box>
	)
}

function BlastsManager({ event, onOpenAdvanced }: { event: any; onOpenAdvanced: () => void }) {
	const toast = useToast({ position: "top" })
	const queryClient = useQueryClient()
	const [subject, setSubject] = useState("")
	const [message, setMessage] = useState("")
	const [sending, setSending] = useState(false)
	const [sendResult, setSendResult] = useState<{ type: "success" | "warning" | "error"; text: string } | null>(null)
	const [attachments, setAttachments] = useState<BlastAttachment[]>([])
	const [uploading, setUploading] = useState(false)
	const [previewOpen, setPreviewOpen] = useState(false)
	const [greetByName, setGreetByName] = useState(true)
	const { data: session } = useSession()

	const [editing, setEditing] = useState<any | null>(null)
	const [editSubject, setEditSubject] = useState("")
	const [editMessage, setEditMessage] = useState("")
	const [savingEdit, setSavingEdit] = useState(false)
	// Seeded from the row being edited. `|| []` matters: the field has no default, so every
	// blast sent before attachments existed carries no array at all.
	const [editAttachments, setEditAttachments] = useState<BlastAttachment[]>([])
	const [editUploading, setEditUploading] = useState(false)

	// Confirm modals (replace native window.confirm)
	const [pendingResend, setPendingResend] = useState<{ blast: any; subject: string; message: string; attachments?: BlastAttachment[] } | null>(null)
	const [resending, setResending] = useState(false)
	const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
	const [deleting, setDeleting] = useState(false)
	// Which history row has its delivery breakdown open. One at a time — each open row fetches
	// its own recipient list.
	const [expandedBlastId, setExpandedBlastId] = useState<string | null>(null)

	const { data: blasts = [], isLoading } = useQuery({
		queryKey: ["blasts", event._id],
		queryFn: async () => {
			const res = await axios.get(`/api/events/${event._id}/blasts`)
			return res.data?.data || []
		},
	})

	const refresh = () => queryClient.invalidateQueries({ queryKey: ["blasts", event._id] })

	// Client-side pagination for the Sent history
	const PAGE_SIZE = 5
	const [page, setPage] = useState(1)
	const totalPages = Math.ceil(blasts.length / PAGE_SIZE)
	const pagedBlasts = blasts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

	useEffect(() => {
		// Keep page in range after deletes/refresh
		const max = totalPages || 1
		if (page > max) setPage(max)
	}, [totalPages, page])

	// Show an inline result under the composer body; auto-dismiss after 5s.
	const flashResult = (type: "success" | "warning" | "error", text: string) => {
		setSendResult({ type, text })
		setTimeout(() => setSendResult(null), 5000)
	}

	const onSend = async () => {
		setSendResult(null)
		// `<p><br></p>` is the rich-text editor's empty state and is truthy - strip before trimming.
		if (!stripHtml(message).trim()) {
			flashResult("error", "Message is required.")
			return
		}
		setSending(true)
		try {
			const res = await axios.post("/api/send-blast", {
				event,
				subject: subject.trim() || `New message in ${event.name}`,
				message,
				status: "all",
				targetType: "all",
				emailType: "custom",
				// The server rebuilds this from the event record; kept correct here anyway.
				eventLink: eventUrl(process.env.NEXT_PUBLIC_URL || "", event.slug),
				attachments,
				greetByName,
			})
			toast({
				title: res.status === 207 ? "Partially sent" : "Blast sent!",
				description: res.data?.message,
				status: res.status === 207 ? "warning" : "success",
				duration: 4000,
			})
			setSubject("")
			setMessage("")
			setAttachments([])
			refresh()
		} catch (error: any) {
			toast({ title: "Failed to send blast.", description: error.response?.data?.error || "An unexpected error occurred.", status: "error", duration: 5000 })
		}
		setSending(false)
	}

	const openEdit = (b: any) => {
		setEditing(b)
		setEditSubject(b.subject || "")
		setEditMessage(b.message || "")
		setEditAttachments(b.attachments || [])
		// Cleared too, or opening a second blast while one was mid-upload leaves Save disabled.
		setEditUploading(false)
	}

	const onSaveEdit = async () => {
		if (!stripHtml(editMessage).trim()) {
			toast({ title: "Message is required.", status: "error", duration: 3000 })
			return
		}
		setSavingEdit(true)
		try {
			const blast = editing
			await axios.patch(`/api/events/${event._id}/blasts/${blast._id}`, {
				subject: editSubject,
				message: editMessage,
				attachments: editAttachments,
			})
			refresh()
			setEditing(null)
			// Offer to resend the edited blast to the same audience (themed modal).
			// The EDITED set, not `blast.attachments` - that is still the pre-edit list, so removing
			// an image and resending would send it anyway.
			setPendingResend({ blast, subject: editSubject, message: editMessage, attachments: editAttachments })
		} catch (error: any) {
			toast({ title: "Failed to save blast.", description: error.response?.data?.message || "An unexpected error occurred.", status: "error", duration: 5000 })
		}
		setSavingEdit(false)
	}

	const doResend = async () => {
		if (!pendingResend) return
		const { blast, subject: rSubject, message: rMessage, attachments: rAttachments } = pendingResend
		setResending(true)
		try {
			const res = await axios.post("/api/send-blast", {
				event,
				subject: rSubject.trim() || `New message in ${event.name}`,
				message: rMessage,
				status: blast.status || "all",
				targetType: blast.targetType || "all",
				emailType: blast.emailType || "custom",
				// The server rebuilds this from the event record; kept correct here anyway.
				eventLink: eventUrl(process.env.NEXT_PUBLIC_URL || "", event.slug),
				// Carried forward from the stored blast. Without this a resend silently drops the
				// pictures, and the host has no way to tell from the confirmation that it did.
				attachments: rAttachments || blast.attachments || [],
			})
			toast({ title: res.status === 207 ? "Partially sent" : "Blast re-sent!", description: res.data?.message, status: res.status === 207 ? "warning" : "success", duration: 4000 })
			refresh()
		} catch (error: any) {
			toast({ title: "Failed to re-send blast.", description: error.response?.data?.error || "An unexpected error occurred.", status: "error", duration: 5000 })
		}
		setResending(false)
		setPendingResend(null)
	}

	const doDelete = async () => {
		if (!deleteTarget) return
		setDeleting(true)
		try {
			await axios.delete(`/api/events/${event._id}/blasts/${deleteTarget._id}`)
			toast({ title: "Blast deleted.", status: "success", duration: 2500 })
			refresh()
		} catch (error: any) {
			toast({ title: "Failed to delete blast.", status: "error", duration: 4000 })
		}
		setDeleting(false)
		setDeleteTarget(null)
	}

	const targetLabel = (b: any) => {
		const where = b.targetType === "all" ? "All guests" : b.targetType === "bookings" ? "Bookings" : "Invitations"
		// A blast can now name several statuses, and the row should say which.
		const statuses = describeBlastStatuses(b.status)
		return statuses && statuses !== "All" ? `${where} · ${statuses}` : where
	}

	return (
		<Box>
			{/* Composer */}
			<Box bg="#1E1E1E" border="1px solid #434343" borderRadius="2xl" p={4} mb={6}>
				<Input
					placeholder="Subject (optional)"
					value={subject}
					onChange={(e) => setSubject(e.target.value)}
					mb={3}
					bg="#090C10"
					borderColor="#444444"
					color="white"
					_placeholder={{ color: "gray.400" }}
				/>
				{/* The same editor the event description uses, so a blast is written and re-edited
				    the same way everywhere. Quill emits HTML, which the template interpolates raw. */}
				<Box mb={3} sx={{ ".ql-container": { minHeight: "140px" } }}>
					<RichTextEditor hideImageButton value={message} onChange={(val) => setMessage(val)} placeholder="Send a blast to your guests…" />
				</Box>
				{sendResult && (
					<Text fontSize="sm" mb={3} color={sendResult.type === "success" ? "#48BB78" : sendResult.type === "warning" ? "#F79432" : "#FC8181"}>
						{sendResult.text}
					</Text>
				)}
				{/* Off when the host's own message already opens with a greeting - otherwise the guest
				    reads "Hi Sarah," and then "Hi everyone!" one line later. */}
				<Checkbox isChecked={greetByName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGreetByName(e.target.checked)} mb={3} color="gray.300" size="sm">
					Greet each guest by name
				</Checkbox>
				<BlastAttachmentPicker attachments={attachments} onChange={setAttachments} onUploadingChange={setUploading} compact />
				{/* Phones: the two send buttons share the full width, the advanced link sits under them. */}
				<Flex justify="space-between" align={{ base: "stretch", md: "center" }} direction={{ base: "column-reverse", md: "row" }} gap={{ base: 3, md: 0 }}>
					<Text as="button" type="button" onClick={onOpenAdvanced} color="#F79432" fontSize="sm" fontWeight="bold" alignSelf={{ base: "center", md: "auto" }} py={{ base: 1, md: 0 }}>
						↗ Advanced options
					</Text>
					<Flex gap={2} sx={{ "@media screen and (max-width: 47.99em)": { "& > button": { flex: 1, height: "44px" } } }}>
						<Button
							variant="outline"
							borderColor="#444444"
							color="white"
							_hover={{ bg: "#2A2A2A" }}
							isDisabled={!message.trim()}
							onClick={() => setPreviewOpen(true)}
						>
							Preview
						</Button>
						{/* Uploads in flight would be sent as urls the server cannot fetch yet. */}
						<Button bg="#F79432" color="black" _hover={{ bg: "#E68422" }} isLoading={sending} isDisabled={uploading} onClick={onSend}>
							Send to all
						</Button>
					</Flex>

				</Flex>

				<BlastPreviewModal
					isOpen={previewOpen}
					onClose={() => setPreviewOpen(false)}
					subject={subject.trim() || `New message in ${event.name}`}
					message={message}
					eventName={event.name}
					eventLink={eventUrl(process.env.NEXT_PUBLIC_URL || "", event.slug)}
					event={event}
					emailType="custom"
					attachments={attachments}
					greetByName={greetByName}
					targetType="all"
					status="all"
					hostName={(session?.user as any)?.name}
					hostEmail={(session?.user as any)?.email}
				/>
			</Box>

			{/* Sent history */}
			<Text fontWeight="bold" color="#9C9C9C" mb={3}>
				Sent
			</Text>
			{isLoading ? (
				<Text color="#9C9C9C">Loading…</Text>
			) : blasts.length === 0 ? (
				<Text color="#9C9C9C">No blasts sent yet.</Text>
			) : (
				<Box display="flex" flexDirection="column" gap={3}>
					{pagedBlasts.map((b: any) => (
						<Box key={b._id} bg="#1E1E1E" border="1px solid #434343" borderRadius="xl" p={4}>
							<Flex justify="space-between" align="start" gap={3}>
								<Box flex="1">
									<Text fontWeight="bold" color="white">
										{b.subject || "(no subject)"}
									</Text>
									<Text color="#B5B6B7" fontSize="sm" noOfLines={2} mt={1}>
										{stripHtml(b.message || "")}
									</Text>
									<Flex gap={3} mt={2} wrap="wrap" align="center">
										<Badge colorScheme="orange">{targetLabel(b)}</Badge>
										<Text color="#9C9C9C" fontSize="xs">
											{b.succeededCount}/{b.recipientCount} delivered
										</Text>
										{/* No count when there were none: the field has no default, so a blast
										    predating attachments is indistinguishable from one sent without any,
										    and "0 images" would assert something about both that we do not know. */}
										{b.attachments?.length > 0 && (
											<Text color="#9C9C9C" fontSize="xs">
												📎 {b.attachments.length} image{b.attachments.length === 1 ? "" : "s"}
											</Text>
										)}
										{/* What the guests actually saw in their inbox. Absent on blasts sent
										    before host identity existed — shown as nothing rather than
										    claiming a sender we can't vouch for. */}
										{b.sentFromName && (
											<Text color="#9C9C9C" fontSize="xs">
												from {b.sentFromName}
											</Text>
										)}
										{b.sentAt && (
											<Text color="#9C9C9C" fontSize="xs">
												{DateTime.fromISO(b.sentAt).toLocaleString(DateTime.DATETIME_MED)}
											</Text>
										)}
										{/* The way in to "who didn't get it, and why". Labelled with the
										    failure count when there is one, because that is the question a
										    host actually opens this to ask. */}
										<Text
											as="button"
											type="button"
											onClick={() => setExpandedBlastId(expandedBlastId === b._id ? null : b._id)}
											color="#F79432"
											fontSize="xs"
											fontWeight="bold"
										>
											{expandedBlastId === b._id
												? "Hide delivery details"
												: b.failedCount > 0
													? `${b.failedCount} didn't arrive — see why`
													: "Delivery details"}
										</Text>
									</Flex>

									{expandedBlastId === b._id && <BlastDeliveryDetail eventId={event._id} blastId={b._id} />}
								</Box>
								<Flex gap={2} flexShrink={0}>
									<Button size="sm" bg="#3E3E3E" color="white" _hover={{ bg: "#4A4A4A" }} onClick={() => openEdit(b)}>
										Edit
									</Button>
									<Button size="sm" bg="#351919" color="#EC5E5E" _hover={{ bg: "#451919" }} onClick={() => setDeleteTarget(b)}>
										Delete
									</Button>
								</Flex>
							</Flex>
						</Box>
					))}
				</Box>
			)}

			{totalPages > 1 && (
				<Flex align="center" justify="space-between" mt={5}>
					<Button onClick={() => setPage((p) => p - 1)} isDisabled={page <= 1} variant="outline" colorScheme="orange" size="sm">
						← Prev
					</Button>
					<Text color="#9C9C9C" fontSize="sm">
						Page {page} of {totalPages}
					</Text>
					<Button onClick={() => setPage((p) => p + 1)} isDisabled={page >= totalPages} variant="outline" colorScheme="orange" size="sm">
						Next →
					</Button>
				</Flex>
			)}

			{/* Edit modal */}
			<Modal isOpen={!!editing} onClose={() => setEditing(null)} isCentered size={{ base: "full", md: "xl" }}>
				<ModalOverlay />
				<ModalContent bg="#1E1E1E" color="white">
					<ModalHeader>Edit Blast</ModalHeader>
					<ModalCloseButton />
					<ModalBody pb={6}>
						<Text fontWeight="bold" mb={2}>
							Subject
						</Text>
						<Input
							value={editSubject}
							onChange={(e) => setEditSubject(e.target.value)}
							mb={4}
							bg="#090C10"
							borderColor="#444444"
							color="white"
							_placeholder={{ color: "gray.400" }}
							placeholder="Subject (optional)"
						/>
						<Text fontWeight="bold" mb={2}>
							Message
						</Text>
						{/* The same editor the event description uses, so a blast is written and re-edited
						    the same way everywhere. Quill emits HTML, which the template interpolates raw. */}
						<Box mb={3} sx={{ ".ql-container": { minHeight: "140px" } }}>
							<RichTextEditor hideImageButton value={editMessage} onChange={(val) => setEditMessage(val)} placeholder="Write your message…" />
						</Box>
						<Text fontWeight="bold" mb={2}>
							Images
						</Text>
						<BlastAttachmentPicker attachments={editAttachments} onChange={setEditAttachments} onUploadingChange={setEditUploading} compact />
						{/* An upload still in flight has no url for the server to fetch - same rule both
						    composers follow. */}
						<Button w="full" bg="#F79432" color="black" _hover={{ bg: "#E68422" }} isLoading={savingEdit} isDisabled={editUploading} onClick={onSaveEdit}>
							Save
						</Button>
					</ModalBody>
				</ModalContent>
			</Modal>

			{/* Resend confirm modal */}
			<Modal isOpen={!!pendingResend} onClose={() => setPendingResend(null)} isCentered>
				<ModalOverlay />
				<ModalContent bg="#1E1E1E" color="white">
					<ModalHeader>Send again?</ModalHeader>
					<ModalCloseButton />
					<ModalBody pb={6}>
						<Text color="#B5B6B7" mb={6}>
							Blast saved. Would you like to send it again to the same audience?
						</Text>
						{/* The moment of commitment - the count belongs here, not only in the editor. */}
						{(pendingResend?.attachments?.length || 0) > 0 && (
							<Text color="#B5B6B7" fontSize="sm" mt={-4} mb={6}>
								📎 {pendingResend!.attachments!.length} image
								{pendingResend!.attachments!.length === 1 ? "" : "s"} will be attached.
							</Text>
						)}
						<Flex justify="flex-end" gap={3}>
							<Button bg="#3E3E3E" color="white" _hover={{ bg: "#4A4A4A" }} onClick={() => setPendingResend(null)} isDisabled={resending}>
								Skip
							</Button>
							<Button bg="#F79432" color="black" _hover={{ bg: "#E68422" }} isLoading={resending} onClick={doResend}>
								Send again
							</Button>
						</Flex>
					</ModalBody>
				</ModalContent>
			</Modal>

			{/* Delete confirm modal */}
			<Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} isCentered>
				<ModalOverlay />
				<ModalContent bg="#1E1E1E" color="white">
					<ModalHeader>Delete Blast</ModalHeader>
					<ModalCloseButton />
					<ModalBody pb={6}>
						<Text color="#B5B6B7" mb={6}>
							Delete this blast from history? This won&apos;t affect emails already sent.
						</Text>
						<Flex justify="flex-end" gap={3}>
							<Button bg="#3E3E3E" color="white" _hover={{ bg: "#4A4A4A" }} onClick={() => setDeleteTarget(null)} isDisabled={deleting}>
								Cancel
							</Button>
							<Button bg="#351919" color="#EC5E5E" _hover={{ bg: "#451919" }} isLoading={deleting} onClick={doDelete}>
								Delete
							</Button>
						</Flex>
					</ModalBody>
				</ModalContent>
			</Modal>
		</Box>
	)
}

function CustomQuestionsManager({ event }: { event: any }) {
	const toast = useToast()
	const [questions, setQuestions] = useState<any[]>(event.questions || [])
	const [saving, setSaving] = useState(false)
	const [isModalOpen, setIsModalOpen] = useState(false)
	const [editingIndex, setEditingIndex] = useState<number | null>(null)

	// Form state for the Add/Edit modal
	const [form, setForm] = useState<any>({
		title: '', type: 'text', isRequired: false,
		responseLength: 'short', selectionType: 'single', options: [],
		platform: 'instagram', collectJobTitle: false,
		termsContentType: 'text', termsContent: '', collectSignature: false,
	})
	const [optionInput, setOptionInput] = useState('')

	const openAddModal = () => {
		setForm({ title: '', type: 'text', isRequired: false, responseLength: 'short', selectionType: 'single', options: [], platform: 'instagram', collectJobTitle: false, termsContentType: 'text', termsContent: '', collectSignature: false })
		setOptionInput('')
		setEditingIndex(null)
		setIsModalOpen(true)
	}

	const openEditModal = (idx: number) => {
		const q = questions[idx]
		setForm({ ...q, options: q.options ? [...q.options] : [] })
		setOptionInput('')
		setEditingIndex(idx)
		setIsModalOpen(true)
	}

	const saveQuestions = async (updated: any[]) => {
		setSaving(true)
		try {
			await axios.post('/api/events/admin/update-questions', { eventId: event._id, questions: updated })
			setQuestions(updated)
			toast({ title: 'Questions saved!', status: 'success', duration: 2500, isClosable: true })
		} catch {
			toast({ title: 'Failed to save questions.', status: 'error', duration: 3000, isClosable: true })
		}
		setSaving(false)
	}

	const handleSaveQuestion = () => {
		if (!form.title.trim()) { toast({ title: 'Title is required.', status: 'warning', duration: 2500 }); return }
		const q = { ...form, id: editingIndex !== null ? questions[editingIndex].id : `q_${Date.now()}` }
		const updated = editingIndex !== null
			? questions.map((existing, i) => i === editingIndex ? q : existing)
			: [...questions, q]
		setIsModalOpen(false)
		saveQuestions(updated)
	}

	const handleDelete = (idx: number) => {
		const updated = questions.filter((_, i) => i !== idx)
		saveQuestions(updated)
	}

	const addOption = () => {
		const opt = optionInput.trim()
		if (!opt) return
		setForm((f: any) => ({ ...f, options: [...(f.options || []), opt] }))
		setOptionInput('')
	}
	const removeOption = (idx: number) => setForm((f: any) => ({ ...f, options: f.options.filter((_: any, i: number) => i !== idx) }))

	const qTypeLabel: Record<string, string> = {
		text: 'Text', options: 'Options', multiple_choice: 'Multiple Choice (Checkboxes)',
		social_profile: 'Social Profile', company: 'Company', checkbox: 'Checkbox',
		terms: 'Terms', mobile: 'Mobile Number', website: 'Website',
	}

	const getTitlePlaceholder = (type: string) => {
		switch (type) {
			case 'text': return "E.g. What's your dietary preference?"
			case 'options': return "E.g. Select your t-shirt size"
			case 'multiple_choice': return "E.g. Which sessions will you attend?"
			case 'social_profile': return "E.g. Please share your social profile link"
			case 'company': return "E.g. Where do you work?"
			case 'checkbox': return "E.g. I require wheelchair access"
			case 'terms': return "E.g. I agree to the rules and regulations"
			case 'mobile': return "E.g. What's the best number to reach you?"
			case 'website': return "E.g. Share a link to your personal website"
			default: return "E.g. Enter your question"
		}
	}

	return (
		<Box color="white">
			<Flex justify="space-between" align="center" mb={4}>
				<Heading size="md" color="white">Custom Questions</Heading>
				<Button bg="#F79432" color="black" fontWeight="bold" _hover={{ bg: '#E68422' }} onClick={openAddModal} isLoading={saving}>
					+ Add Question
				</Button>
			</Flex>

			{questions.length === 0 && (
				<Text color="#9C9C9C" textAlign="center" py={8}>No custom questions yet. Click &quot;Add Question&quot; to create one.</Text>
			)}

			{questions.map((q: any, idx: number) => (
				<Flex key={q.id} bg="#1E1E1E" border="1px solid #3E3E3E" rounded="xl" p={4} mb={3} align="center" justify="space-between">
					<Box>
						<Text fontWeight="bold">{q.title}</Text>
						<Text fontSize="sm" color="#9C9C9C">{qTypeLabel[q.type] || q.type}{q.isRequired ? ' · Required' : ' · Optional'}</Text>
					</Box>
					<Flex gap={2}>
						<Button size="sm" variant="outline" colorScheme="orange" onClick={() => openEditModal(idx)}>Edit</Button>
						<Button size="sm" colorScheme="red" variant="ghost" onClick={() => handleDelete(idx)}>Delete</Button>
					</Flex>
				</Flex>
			))}

			{/* Add/Edit Modal */}
			<Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} isCentered size={{ base: "full", md: "lg" }}>
				<ModalOverlay />
				<ModalContent bg="#1E1E1E" color="white">
					<ModalHeader>{editingIndex !== null ? 'Edit Question' : 'Add Question'}</ModalHeader>
					<ModalCloseButton />
					<ModalBody pb={6}>
						<Flex direction="column" gap={4}>
							<Box>
								<Text mb={1} fontWeight="bold">Question Title</Text>
								<Input bg="#090C10" borderColor="#444" color="white" value={form.title} onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))} placeholder={getTitlePlaceholder(form.type)} />
							</Box>
							<Box>
								<Text mb={1} fontWeight="bold">Question Type</Text>
								<Select bg="#090C10" borderColor="#444" color="white" value={form.type} onChange={e => {
									const newType = e.target.value
									setForm((f: any) => {
										const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
										const autoTitle = newType === 'social_profile' ? `Add your ${cap(f.platform)}` : f.title
										const shouldAutoTitle = newType === 'social_profile' && (!f.title || /^add your /i.test(f.title))
										return { ...f, type: newType, title: shouldAutoTitle ? autoTitle : f.title }
									})
								}}>
									{Object.entries(qTypeLabel).map(([val, label]) => (
										<option key={val} value={val} style={{ backgroundColor: '#090C10' }}>{label}</option>
									))}
								</Select>
							</Box>

							{form.type === 'text' && (
								<Box>
									<Text mb={1} fontWeight="bold">Response Length</Text>
									<Select bg="#090C10" borderColor="#444" color="white" value={form.responseLength} onChange={e => setForm((f: any) => ({ ...f, responseLength: e.target.value }))}>
										<option value="short" style={{ backgroundColor: '#090C10' }}>Short Answer</option>
										<option value="multi-line" style={{ backgroundColor: '#090C10' }}>Multi-Line</option>
									</Select>
								</Box>
							)}

							{(form.type === 'options' || form.type === 'multiple_choice' || form.type === 'checkbox') && (
								<Box>
									{form.type === 'options' && (
										<>
											<Text mb={1} fontWeight="bold">Selection Type</Text>
											<Select bg="#090C10" borderColor="#444" color="white" value={form.selectionType} onChange={e => setForm((f: any) => ({ ...f, selectionType: e.target.value }))}>
												<option value="single" style={{ backgroundColor: '#090C10' }}>Single Choice</option>
												<option value="multiple" style={{ backgroundColor: '#090C10' }}>Multiple Choice</option>
											</Select>
										</>
									)}
									<Text mt={form.type === 'options' ? 3 : 0} mb={1} fontWeight="bold">Options</Text>
									<Text fontSize="sm" color="#9C9C9C" mb={2}>
										{form.type === 'checkbox'
											? 'Add checkbox options (leave empty for a single agree/disagree checkbox)'
											: form.type === 'multiple_choice'
											? 'Add options — attendees can select multiple'
											: 'Add selectable options'}
									</Text>
									<Flex gap={2} mb={2}>
										<Input bg="#090C10" borderColor="#444" color="white" value={optionInput} onChange={e => setOptionInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addOption()} placeholder="Add option..." />
										<Button onClick={addOption} bg="#3E3E3E" color="white" _hover={{ bg: '#4A4A4A' }}>Add</Button>
									</Flex>
									{(form.options || []).map((opt: string, i: number) => (
										<Flex key={i} bg="#2A2A2A" rounded="md" px={3} py={1} mb={1} justify="space-between" align="center">
											<Text fontSize="sm">{opt}</Text>
											<Button size="xs" variant="ghost" colorScheme="red" onClick={() => removeOption(i)}>✕</Button>
										</Flex>
									))}
								</Box>
							)}

							{form.type === 'social_profile' && (
								<Box>
									<Text mb={1} fontWeight="bold">Platform</Text>
									<Select bg="#090C10" borderColor="#444" color="white" value={form.platform} onChange={e => {
										const p = e.target.value
										const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
										setForm((f: any) => ({
											...f,
											platform: p,
											title: (!f.title || /^add your /i.test(f.title)) ? `Add your ${cap(p)}` : f.title,
										}))
									}}>
										{['instagram', 'twitter', 'linkedin', 'facebook', 'tiktok', 'youtube', 'github'].map(p => (
											<option key={p} value={p} style={{ backgroundColor: '#090C10' }}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
										))}
									</Select>
								</Box>
							)}

							{form.type === 'company' && (
								<Flex align="center" gap={3}>
									<Text fontWeight="bold">Collect Job Title</Text>
									<input type="checkbox" checked={form.collectJobTitle} onChange={e => setForm((f: any) => ({ ...f, collectJobTitle: e.target.checked }))} />
								</Flex>
							)}

							{form.type === 'terms' && (
								<Box>
									<Text mb={1} fontWeight="bold">Terms Content Type</Text>
									<Select bg="#090C10" borderColor="#444" color="white" value={form.termsContentType} onChange={e => setForm((f: any) => ({ ...f, termsContentType: e.target.value }))}>
										<option value="text" style={{ backgroundColor: '#090C10' }}>Text</option>
										<option value="link" style={{ backgroundColor: '#090C10' }}>Link</option>
									</Select>
									<Text mt={3} mb={1} fontWeight="bold">Terms Content</Text>
									<Textarea bg="#090C10" borderColor="#444" color="white" value={form.termsContent} onChange={e => setForm((f: any) => ({ ...f, termsContent: e.target.value }))} placeholder="Enter terms text or URL..." rows={3} />
									<Flex align="center" gap={3} mt={3}>
										<Text fontWeight="bold">Collect Signature</Text>
										<input type="checkbox" checked={form.collectSignature} onChange={e => setForm((f: any) => ({ ...f, collectSignature: e.target.checked }))} />
									</Flex>
								</Box>
							)}

							<Flex align="center" gap={3}>
								<Text fontWeight="bold">Required</Text>
								<input type="checkbox" checked={form.isRequired} onChange={e => setForm((f: any) => ({ ...f, isRequired: e.target.checked }))} />
								<Text fontSize="sm" color="#9C9C9C">Users must answer this before buying a ticket</Text>
							</Flex>

							<Button bg="#F79432" color="black" fontWeight="bold" _hover={{ bg: '#E68422' }} onClick={handleSaveQuestion} isLoading={saving}>
								{editingIndex !== null ? 'Save Changes' : 'Add Question'}
							</Button>
						</Flex>
					</ModalBody>
				</ModalContent>
			</Modal>
		</Box>
	)
}

const GUESTS_PAGE_SIZE = 10

function GuestsList({ eventId, event }: { eventId: string; event?: any }) {
	const [selectedGuest, setSelectedGuest] = useState<{ guest: any; booking: any; checkIn: any } | null>(null)
	const [page, setPage] = useState(1)
	const [deletingEmail, setDeletingEmail] = useState<string | null>(null)
	// One dialog for the table, not one per row — it is mounted once at the bottom and the
	// row only names its booking.
	const [cancelTarget, setCancelTarget] = useState<any | null>(null)
	const [cancellingRef, setCancellingRef] = useState<string | null>(null)
	const [ticketTypeFilter, setTicketTypeFilter] = useState<string>("all")
	const [searchQuery, setSearchQuery] = useState("")
	// Invited vs booked is a second axis, independent of the ticket-type filter — the two compose.
	const [audience, setAudience] = useState<GuestAudience>("all")
	const queryClient = useQueryClient()
	const toast = useToast()

	const eventTickets: any[] = event?.tickets || []
	const ticketNameById: Record<string, string> = {}
	eventTickets.forEach((t: any) => { if (t._id) ticketNameById[t._id.toString()] = t.name })

	const formatBookingTickets = (booking: any): string => {
		if (!booking?.tickets?.length) return '—'
		return booking.tickets.map((t: any) => `${ticketNameById[t.ticketId?.toString()] || 'Ticket'} ×${t.quantity}`).join(', ')
	}

	// Cancelling is the ordinary way to end a booking: the guest is emailed, any live card
	// hold is released and `cancelledBy` / `cancelledAt` are written. Delete (below) destroys
	// the record silently and stays only for cleaning up junk rows.
	const handleCancelBooking = async () => {
		const bookingRef = cancelTarget?.bookingRef
		if (!bookingRef) return
		setCancellingRef(bookingRef)
		try {
			const res = await axios.post("/api/bookings/cancel", { bookingRef })
			// The route answers 200 with `status: false` for a refusal it expects (an already
			// dead booking), so a non-throwing response is not necessarily a success.
			// NOTE: `Error` is shadowed by the toaster import in this file — don't `throw new Error`.
			if (res.data?.status === false) {
				toast({ title: res.data?.message || "Failed to cancel booking.", status: "error", duration: 6000, isClosable: true })
				return
			}
			queryClient.invalidateQueries({ queryKey: ["guests-list", eventId] })
			queryClient.invalidateQueries({ queryKey: ["event-bookings", eventId] })
			// A cancelled confirmed booking frees a seat; the Approvals "doesn't fit" badges
			// read this query and would otherwise keep showing the pre-cancellation count.
			queryClient.invalidateQueries({ queryKey: ["event-availability", eventId] })
			setCancelTarget(null)
			toast({ title: "Booking cancelled.", status: "success", duration: 5000, isClosable: true })
		} catch (err: any) {
			// The server refuses an already-dead booking with a reason worth reading.
			toast({
				title: err?.response?.data?.message || "Failed to cancel booking.",
				status: "error",
				duration: 6000,
				isClosable: true,
			})
		} finally {
			setCancellingRef(null)
		}
	}

	const handleDeleteGuest = async (email: string, guest: any, booking: any) => {
		const who = booking?.customerName || guest?.name || "this guest"
		// Deleting a request that's still awaiting approval is a decline, so the guest is
		// emailed and any card hold released. Say so before the host confirms.
		const isAwaitingApproval = isPendingBooking(booking)
		const onHold = booking?.payment?.status === "authorized" || booking?.payment?.status === "capturing"
		const message = isAwaitingApproval
			? `Decline ${who}'s request?\n\nThey'll be emailed that they weren't approved${onHold ? `, and the $${Number(booking?.payment?.amount || 0).toFixed(2)} hold on their card will be released` : ""}. This cannot be undone.`
			: `Remove ${who}? This cannot be undone.`
		if (!confirm(message)) return

		setDeletingEmail(email)
		try {
			let bookingResult: any = null
			if (booking?.bookingRef) {
				const res = await axios.post("/api/bookings/delete", { bookingRef: booking.bookingRef })
				bookingResult = res.data
			}
			if (guest?._id) {
				await axios.post("/api/guests/delete", { guestId: guest._id })
			}
			queryClient.invalidateQueries({ queryKey: ["guests-list", eventId] })
			queryClient.invalidateQueries({ queryKey: ["event-bookings", eventId] })
			// Deleting a confirmed booking frees a seat. Without this the Approvals seat counts
			// and the "doesn't fit" badges keep showing the state from before the removal.
			queryClient.invalidateQueries({ queryKey: ["event-availability", eventId] })
			if (bookingResult?.data?.rejectionEmailSent) {
				toast({ title: bookingResult.message || "Request declined.", status: "success", duration: 5000, isClosable: true })
			}
		} catch (err: any) {
			// The server refuses to delete an already-charged booking, and that reason is
			// worth showing rather than a generic failure.
			alert(err?.response?.data?.message || "Failed to delete guest.")
		} finally {
			setDeletingEmail(null)
		}
	}

	const fetchGuests = async () => {
		const res = await axios.get("/api/guests-list", { params: { eventId } })
		return res.data || []
	}

	const fetchBookings = async () => {
		const res = await axios.post("/api/get-bookings", { eventId })
		return res.data || []
	}

	const {
		data: guests = [],
		isLoading: guestsLoading,
		isError: guestsError,
	} = useQuery({
		queryKey: ["guests-list", eventId],
		queryFn: fetchGuests,
	})

	const {
		data: bookings = [],
	} = useQuery({
		queryKey: ["event-bookings", eventId],
		queryFn: fetchBookings,
	})

	const { data: checkIns = [] } = useQuery({
		queryKey: ["check-in-status", eventId],
		queryFn: () => axios.get("/api/check-in/booking-status", { params: { eventId } }).then(r => r.data?.data || []),
	})

	// One row per PERSON, joining invitations to bookings on the lowercased email — the only
	// key the two collections share. Replaces a pair of maps that kept ONE booking per address,
	// so somebody holding a confirmed booking and a pending request showed only one of them.
	const guestRows = React.useMemo(() => buildGuestRows({ invitations: guests as any[], bookings: bookings as any[] }), [guests, bookings])
	const rowByEmail = React.useMemo(() => new Map(guestRows.map((r) => [r.key, r])), [guestRows])

	// Approve / reject / partial-approve, from the same hook the Approvals tab uses, so the two
	// screens cannot offer different terms for the same decision. It shares the
	// ["event-bookings", eventId] query already fetched above rather than issuing its own.
	const approvals = useBookingApprovals({ eventId, bookings: bookings as any[] })
	const pendingRows = guestRows.filter((r) => r.pendingBookings.length > 0)
	const expiringHolds = expiringSoonBookings(pendingRows.flatMap((r) => r.pendingBookings))

	const checkInMap: Record<string, { checkedInCount: number; isFullyCheckedIn: boolean }> = {}
	;(checkIns as any[]).forEach((ci: any) => {
		checkInMap[ci.bookingId] = { checkedInCount: ci.checkedInCount, isFullyCheckedIn: ci.isFullyCheckedIn }
	})

	// Sold count + revenue per ticket type, so this shows up right here without switching to Overview.
	// Same rule as the Overview cards: revenue is what the booking actually cost, not
	// quantity × list price, or a comped ticket inflates the figure by its full face value.
	const priceOfTicket = (id: string) => Number((eventTickets.find((et: any) => et._id?.toString() === id) || {}).price) || 0
	// Same lookup, but `null` when the ticket type is gone rather than 0. Feeding a fabricated
	// 0 into `describePriceChange` invents a price drop for every deleted ticket.
	const currentPriceOfTicket = (id: string): number | null => {
		const ticket: any = eventTickets.find((et: any) => et._id?.toString() === id)
		if (!ticket) return null
		const price = Number(ticket.price)
		return Number.isFinite(price) ? price : null
	}
	const ticketStatsById: Record<string, { sold: number; revenue: number }> = {}
	;(bookings as any[]).forEach((b: any) => {
		if (b?.isDeleted || isCancelledBooking(b)) return
		apportionRevenue(b, priceOfTicket).forEach((row) => {
			const entry = ticketStatsById[row.ticketId] || { sold: 0, revenue: 0 }
			entry.sold += row.quantity
			entry.revenue += row.revenue
			ticketStatsById[row.ticketId] = entry
		})
	})

	// How many people signed up (booking created) while the event was actually live, per `createdAt`.
	const eventStart = event?.startsOn ? new Date(event.startsOn) : null
	const eventEnd = event?.endsOn ? new Date(event.endsOn) : null
	const signedUpDuringEvent = (eventStart && eventEnd)
		? (bookings as any[]).filter((b: any) => {
			if (isCancelledBooking(b) || !b.createdAt) return false
			const t = new Date(b.createdAt).getTime()
			return t >= eventStart.getTime() && t <= eventEnd.getTime()
		}).length
		: null

	const eventQuestions: any[] = event?.questions || []

	const formatAnswer = (qId: string, booking: any): string => {
		if (!booking?.customAnswers) return '—'
		const ans = booking.customAnswers.find((a: any) => a.questionId === qId)
		if (!ans || ans.answer == null) return '—'
		if (Array.isArray(ans.answer)) return ans.answer.length ? ans.answer.join(', ') : '—'
		if (typeof ans.answer === 'object') {
			const parts: string[] = []
			if (ans.answer.company) parts.push(ans.answer.company)
			if (ans.answer.jobTitle) parts.push(ans.answer.jobTitle)
			if (ans.answer.agreed !== undefined) parts.push(ans.answer.agreed ? 'Agreed' : 'Not agreed')
			if (ans.answer.signature) parts.push(`Signed: ${ans.answer.signature}`)
			return parts.join(' · ') || '—'
		}
		return String(ans.answer) || '—'
	}

	if (guestsLoading) return <Text>Loading guests...</Text>
	if (guestsError) return <Text color="red.500">Failed to load guests.</Text>

	const rawEmails = guestRows.map((r) => r.key)

	// Checked across EVERY live booking on the row. Reading a single chosen booking dropped a
	// guest from a ticket filter they legitimately matched whenever the one picked happened to
	// be their cancelled order.
	const matchesTicketFilter = (row: GuestRow) => {
		if (ticketTypeFilter === "all") return true
		return row.bookings.some(
			(b: any) => !isCancelledBooking(b) && (b.tickets || []).some((t: any) => t.ticketId?.toString() === ticketTypeFilter),
		)
	}

	const matchesSearch = (row: GuestRow) => {
		const q = searchQuery.trim().toLowerCase()
		if (!q) return true
		// Booking refs too: a host pasting a ref out of the approval email got no result.
		return (
			row.key.includes(q) ||
			(row.name || "").toLowerCase().includes(q) ||
			row.bookings.some((b: any) => (b?.bookingRef || "").toLowerCase().includes(q))
		)
	}

	const visibleRows = guestRows.filter((r) => matchesAudience(r, audience)).filter(matchesTicketFilter).filter(matchesSearch)
	const hasActiveFilters = ticketTypeFilter !== "all" || !!searchQuery.trim() || audience !== "all"
	const clearFilters = () => { setTicketTypeFilter("all"); setSearchQuery(""); setAudience("all"); setPage(1) }
	const selectedTicketName = eventTickets.find((t: any) => t._id?.toString() === ticketTypeFilter)?.name

	// Counts are over the UNFILTERED set, so a chip always says how many it would show.
	const audienceCounts: Record<GuestAudience, number> = {
		all: guestRows.length,
		needs_approval: guestRows.filter((r) => matchesAudience(r, "needs_approval")).length,
		booked: guestRows.filter((r) => matchesAudience(r, "booked")).length,
		invited_only: guestRows.filter((r) => matchesAudience(r, "invited_only")).length,
		cancelled: guestRows.filter((r) => matchesAudience(r, "cancelled")).length,
	}

	const totalPages = Math.ceil(visibleRows.length / GUESTS_PAGE_SIZE)
	const pagedRows = visibleRows.slice((page - 1) * GUESTS_PAGE_SIZE, page * GUESTS_PAGE_SIZE)

	const escapeCsv = (value: any) => {
		const str = String(value ?? '')
		return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
	}

	const handleExportCsv = () => {
		const headers = [
			'Name', 'Email', 'Guest Type', 'Booking Ref', 'Status', 'Invitation Status', 'Invited At',
			'Ticket Type', 'Amount Paid', 'Payment Status', 'Hold Expires', 'Booked At', 'Check-In',
		]
		// ONE LINE PER BOOKING, plus one for anyone invited who never booked. The table shows one
		// line per person because that is who the host is looking at; a spreadsheet has to show
		// the money, and two card holds on one address are two amounts, not one.
		const rows = visibleRows.flatMap((row: GuestRow) => {
			const invitedAt = row.invitedAt ? DateTime.fromISO(row.invitedAt).toLocaleString(DateTime.DATETIME_MED) : ''
			if (!row.bookings.length) {
				return [[
					row.name, row.email, GUEST_KIND_LABEL[row.kind], '',
					row.invitationStatus === 'accepted' ? 'Accepted — no ticket' : row.invitationStatus === 'declined' ? 'Declined' : 'Invited',
					row.invitationStatus || '', invitedAt, '', '', '', '', '', 'N/A',
				]]
			}
			return row.bookings.map((booking: any) => {
				const ci = booking?._id ? checkInMap[booking._id.toString()] : null
				const cancelled = isCancelledBooking(booking)
				const pending = isPendingBooking(booking)
				// An expired hold is not a cancellation — nobody acted, the authorization
				// simply lapsed. Flattening the three into "Cancelled" told the host the
				// guest walked away when in fact the request was left to time out.
				const deadLabel = DEAD_BOOKING_LABEL[deadBookingKind(booking) ?? 'cancelled']
				const checkInLabel = cancelled
					? deadLabel
					: pending ? 'N/A'
					: !booking?._id ? 'N/A'
					: !ci ? 'Not Checked In'
					: ci.isFullyCheckedIn ? 'Fully Checked In'
					: `Partial (${ci.checkedInCount})`
				return [
					booking.customerName || row.name || '',
					booking.customerEmail || row.email,
					GUEST_KIND_LABEL[row.kind],
					booking.bookingRef || '',
					cancelled ? deadLabel : pending ? 'Pending approval' : 'Confirmed',
					row.invitationStatus || '',
					invitedAt,
					formatBookingTickets(booking),
					Number(booking.total ?? 0).toFixed(2),
					booking?.payment?.status || '',
					booking?.payment?.authExpiresAt ? DateTime.fromISO(new Date(booking.payment.authExpiresAt).toISOString()).toLocaleString(DateTime.DATETIME_MED) : '',
					booking.createdAt ? DateTime.fromISO(booking.createdAt).toLocaleString(DateTime.DATETIME_MED) : '',
					checkInLabel,
				]
			})
		})
		const csv = [headers, ...rows].map(r => r.map(escapeCsv).join(',')).join('\n')
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
		const url = URL.createObjectURL(blob)
		const link = document.createElement('a')
		link.href = url
		const safeName = (event?.name || 'event').toString().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')
		link.setAttribute('download', `${safeName}-guests.csv`)
		document.body.appendChild(link)
		link.click()
		document.body.removeChild(link)
		URL.revokeObjectURL(url)
	}

	const AUDIENCE_CHIPS: Array<{ key: GuestAudience; label: string }> = [
		{ key: "all", label: "All" },
		{ key: "needs_approval", label: "Needs approval" },
		{ key: "booked", label: "Booked" },
		{ key: "invited_only", label: "Invited only" },
		// The filter is every DEAD booking, which includes holds that expired without the
		// host acting — labelling it "Cancelled" hid those behind a word that blames the guest.
		{ key: "cancelled", label: "Cancelled / expired" },
	]

	// Every cell of a guest row, built ONCE and laid out twice: as table cells from `md` up and as
	// a card below it. Moved here verbatim from the table so the two layouts cannot drift on what
	// a status, an amount or an action means. `mobile` only changes control sizes and puts the
	// occasional actions behind a menu.
	const guestCells = (row: GuestRow, mobile = false) => {
		const email = row.key
		const booking = row.primaryBooking
		const ci = booking?._id ? checkInMap[booking._id.toString()] : null
		// A row is struck through only when EVERY booking on it is dead — somebody
		// with a cancelled order and a live one is not a cancelled guest.
		const cancelled = row.cancelledOnly
		// Which KIND of dead. `expired` means the card hold lapsed before the
		// host approved — the guest never cancelled anything.
		const deadKind = deadBookingKind(booking) ?? 'cancelled'
		const pending = row.pendingBookings.length > 0

		/* Where this person came from. An invitation and a booking share no key
		    but the email string, so somebody who was invited AND bought is ONE
		    row that says both — not two rows that look like two people. */
		const type = (
			<Flex gap={1} align="center" flexWrap="wrap">
				<Tooltip
					hasArrow
					label={
						row.kind === "invited_and_booked"
							? "Invited by you, and has since booked."
							: row.kind === "booked"
								? "Booked directly — never sent an invite."
								: "Invited by you. No booking yet."
					}
				>
					<Badge
						colorScheme={row.kind === "invited_and_booked" ? "teal" : row.kind === "booked" ? "green" : "purple"}
						variant={row.kind === "invited" ? "outline" : "solid"}
						borderRadius="6px"
					>
						{GUEST_KIND_LABEL[row.kind]}
					</Badge>
				</Tooltip>
				{row.bookings.length > 1 && (
					<Tooltip hasArrow label={`${row.bookings.length} separate bookings on this address.`}>
						<Badge colorScheme="gray" borderRadius="6px">{row.bookings.length} bookings</Badge>
					</Tooltip>
				)}
				{/* Emailed invite vs an in-app invite to a Jetzy user. Two different
				    actions the host took; the tab used to show only the first. */}
				{row.invitationSource === 'app' && (
					<Tooltip hasArrow label="Invited through the Jetzy app, not by email.">
						<Badge colorScheme="cyan" variant="outline" borderRadius="6px">via app</Badge>
					</Tooltip>
				)}
				{row.duplicateInvitationCount > 1 && (
					<Tooltip hasArrow label={`Invited ${row.duplicateInvitationCount} times.`}>
						<Badge colorScheme="gray" variant="outline" borderRadius="6px">×{row.duplicateInvitationCount}</Badge>
					</Tooltip>
				)}
			</Flex>

		)
		const status = (
			<>
			{pending ? (
				<Flex direction="column" gap={1} align="start">
					<Badge colorScheme="yellow">Pending Approval</Badge>
					{/* How long the card hold has left — the reason this is urgent. */}
					{row.pendingBookings.map((pb: any) => (
						<HoldExpiry key={pb.bookingRef} booking={pb} />
					))}
				</Flex>
			) : cancelled ? (
				<Tooltip hasArrow label={DEAD_BOOKING_TOOLTIP[deadKind]}>
					<Badge colorScheme={DEAD_BOOKING_COLOR[deadKind]}>{DEAD_BOOKING_LABEL[deadKind]}</Badge>
				</Tooltip>
			) : row.bookings.length > 0 ? (
				<Badge colorScheme="green">Confirmed</Badge>
			) : row.invitationStatus === 'accepted' ? (
				/* An accepted invite creates NO booking. Falling back to "Purchased"
				   here, as this cell used to, told the host about a ticket sale that
				   never happened. */
				<Tooltip hasArrow label="Accepted the invitation but has not booked a ticket.">
					<Badge colorScheme="blue">Accepted — no ticket</Badge>
				</Tooltip>
			) : row.invitationStatus === 'declined' ? (
				<Badge colorScheme="red" variant="outline">Declined</Badge>
			) : row.invitationStatus === 'cancelled' ? (
				/* Written by the Jetzy backend, not by us — it is not in our schema enum,
				   but it is real and must not read as a live invitation. */
				<Badge colorScheme="gray" variant="outline">Invite cancelled</Badge>
			) : (
				<Badge colorScheme="purple" variant="outline">Invited</Badge>
			)}

			</>
		)
		/* The amount alone can't distinguish a free ticket from a $95 one
		    comped by a code. Naming the code is the point: it's the only place
		    a host can see that a guest came in on a 100%-off comp. */
		const amount = (
			<>
			{booking ? `$${Number(booking.total ?? 0).toFixed(2)}` : "—"}
			{(() => {
				if (!booking) return null
				const d = describeDiscount(booking)
				// The ticket may have been repriced since this guest bought. Nothing
				// records what they paid, but `subTotal` is pre-discount, so
				// subTotal/quantity recovers it — and a discount can't be mistaken
				// for a price change.
				const rows = booking.tickets || []
				const currentPrice = rows.length === 1 ? currentPriceOfTicket(String(rows[0]?.ticketId)) : null
				const priceChange = describePriceChange(booking, currentPrice)
				if (!d.discounted && !priceChange) return null
				return (
					<>
						{d.discounted && (
							<Badge ml={2} colorScheme={d.comped ? "blue" : "yellow"} fontSize="0.65em" borderRadius="4px" px={1.5}>
								{d.comped ? (d.code || "Comped") : `−$${d.amount.toFixed(2)}${d.code ? ` ${d.code}` : ""}`}
							</Badge>
						)}
						{priceChange && (
							<Tooltip label={`This ticket now lists at $${priceChange.current.toFixed(2)}. This guest bought it at $${priceChange.paid.toFixed(2)}.`} hasArrow>
								<Badge ml={2} colorScheme="purple" fontSize="0.65em" borderRadius="4px" px={1.5}>
									{priceChange.label}
								</Badge>
							</Tooltip>
						)}
					</>
				)
			})()}

			</>
		)
		const checkIn = (
			<>
			{cancelled
				? <Badge colorScheme={DEAD_BOOKING_COLOR[deadKind]}>{DEAD_BOOKING_LABEL[deadKind]}</Badge>
				: pending
				? <Badge colorScheme="gray">N/A</Badge>
				: !booking?._id
				? <Badge colorScheme="gray">N/A</Badge>
				: !ci
				? <Badge colorScheme="gray">Not Checked In</Badge>
				: ci.isFullyCheckedIn
				? <Badge colorScheme="green">Fully Checked In</Badge>
				: <Badge colorScheme="yellow">Partial ({ci.checkedInCount})</Badge>
			}

			</>
		)
		/* Approve / Reject, one pair per pending request. Never merged: two
		    requests are two card holds and two calls to /api/bookings/approve.

		    Gated on the row actually HOLDING a pending booking, not on the
		    ticket's current flag — a host who switches requireApproval off
		    afterwards still has live holds to resolve, and gating on the flag
		    would strand them. `showApprovalsSurface` keeps the Approvals tab
		    itself for the same reason. */
		const approvalActions = (
			<>
			{row.pendingBookings.map((pb: any) => {
				const fit = approvals.fitFor(pb)
				return (
					<Flex key={pb.bookingRef} direction="column" gap={1} mb={2} align="start">
						{row.pendingBookings.length > 1 && (
							<Text fontSize="xs" color="#9C9C9C">{pb.bookingRef}</Text>
						)}
						<ApprovalActions booking={pb} controller={approvals} size={mobile ? "sm" : "xs"} />
						{!fit.fits && (
							<Badge colorScheme="orange" fontSize="0.65em" borderRadius="4px" px={1.5}>
								Needs {bookingTicketCount(pb?.tickets)}, {fit.seatable ?? 0} left
							</Badge>
						)}
					</Flex>
				)
			})}
			</>
		)
		const viewDetails = (
			<Button
				size="sm"
				variant="ghost"
				color="#F79432"
				_hover={{ bg: '#2A2A2A' }}
				leftIcon={<EyeIcon style={{ width: 14, height: 14 }} />}
				onClick={() => setSelectedGuest({ guest: row.invitation, booking, checkIn: ci })}
			>
				View Details
			</Button>
		)
		const otherActions = (
			<>
			{/* Cancel on LIVE bookings only. A pending row keeps Approve / Reject,
			    which already releases the hold and emails the guest — a second
			    differently-worded way to decline the same request would be worse
			    than not having one here. */}
			{booking?.bookingRef && !cancelled && !pending && (
				<Button
					size="sm"
					variant="ghost"
					color="orange.300"
					_hover={{ bg: '#2A2A2A' }}
					isLoading={cancellingRef === booking.bookingRef}
					onClick={() => setCancelTarget(booking)}
					ml={1}
				>
					Cancel
				</Button>
			)}
			{/* With a real Reject button on the row, the old delete-as-decline path
			    would be a second, different way to turn somebody down. Delete is
			    offered only where there is nothing to decide. */}
			{!pending && (
				<Button
					size="sm"
					variant="ghost"
					color="red.400"
					_hover={{ bg: '#2A2A2A' }}
					isLoading={deletingEmail === email}
					onClick={() => handleDeleteGuest(email, row.invitation, booking)}
					ml={1}
				>
					{row.bookings.length === 0 ? 'Remove invite' : 'Delete'}
				</Button>
			)}
			</>
		)
		return { email, booking, ci, cancelled, pending, type, status, amount, checkIn, approvalActions, viewDetails, otherActions }
	}

	return (
		<>
			{/* Card holds lapse on their own and cannot be recovered, so the most urgent thing on
			    this tab is said before the table rather than inside a row. Same 48h threshold as
			    the Approvals tab, from the same helper. */}
			{expiringHolds.length > 0 && (
				<Box bg="rgba(247,148,50,0.12)" border="1px solid rgba(247,148,50,0.4)" borderRadius="8px" p={3} mb={3}>
					<Text color="#F79432" fontWeight={700} fontSize="sm">
						{expiringHolds.length} request{expiringHolds.length > 1 ? "s have" : " has"} a card hold expiring within 48 hours
					</Text>
					<Text color="#D6D6D6" fontSize="xs" mt={1}>
						Holds are released automatically once they lapse and cannot be recovered — approve or decline these first.
					</Text>
				</Box>
			)}

			{pendingRows.length > 0 && (
				<Text fontSize="xs" color="#9C9C9C" mb={3}>
					A request doesn&apos;t hold a spot until you approve it, so you can receive more requests than you have seats.
				</Text>
			)}

			<Flex direction="column" gap={2} mb={3}>
				{/* Invited vs booked as its own axis. The ticket-type Select below narrows within
				    whichever audience is chosen — they compose rather than replace each other. */}
				{/* Phones: one scrolling row rather than three wrapped ones. */}
				<Flex
					align="center"
					gap={2}
					flexWrap={{ base: "nowrap", md: "wrap" }}
					overflowX={{ base: "auto", md: "visible" }}
					mx={{ base: -1, md: 0 }}
					px={{ base: 1, md: 0 }}
					pb={{ base: 1, md: 0 }}
					sx={{ scrollbarWidth: "none", "::-webkit-scrollbar": { display: "none" } }}
				>
					{AUDIENCE_CHIPS.map((chip) => {
						const count = audienceCounts[chip.key]
						const active = audience === chip.key
						// A chip for a state nobody is in is noise — except All, which anchors the row,
						// and except the one currently selected. Approving the last pending request
						// while filtered to "Needs approval" would otherwise take that chip away and
						// leave an empty table with nothing highlighted to explain it.
						if (count === 0 && chip.key !== "all" && !active) return null
						return (
							<Button
								key={chip.key}
								size="xs"
								h={{ base: "36px", md: 6 }}
								px={{ base: 3.5, md: 2 }}
								fontSize={{ base: "13px", md: "xs" }}
								flexShrink={0}
								borderRadius="full"
								bg={active ? "#F79432" : "#2A2A2A"}
								color={active ? "black" : "white"}
								border="1px solid #444"
								_hover={{ bg: active ? "#e6832a" : "#3A3A3A" }}
								onClick={() => { setAudience(chip.key); setPage(1) }}
							>
								{chip.label} ({count})
							</Button>
						)
					})}
				</Flex>

				<Flex align="center" gap={3} flexWrap="wrap">
					<InputGroup size="sm" maxW={{ base: "none", md: "280px" }} flexBasis={{ base: "100%", md: "auto" }}>
						<InputLeftElement pointerEvents="none" h={{ base: 10, md: 8 }}>
							<MagnifyingGlassIcon className="w-4 h-4" style={{ color: "#9C9C9C" }} />
						</InputLeftElement>
						<Input
							placeholder="Search by name or email"
							h={{ base: 10, md: 8 }}
							fontSize={{ base: "16px", md: "sm" }}
							borderRadius={{ base: "md", md: "sm" }}
							bg="#0F1114"
							border="1px solid #343536"
							color="white"
							value={searchQuery}
							onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
						/>
					</InputGroup>

					{eventTickets.length > 0 && (
						<Select
							size="sm"
							maxW={{ base: "none", md: "280px" }}
							flex={{ base: "1 1 0", md: "initial" }}
							minW={0}
							h={{ base: 10, md: 8 }}
							fontSize={{ base: "16px", md: "sm" }}
							bg="#0F1114"
							border="1px solid #343536"
							color="white"
							value={ticketTypeFilter}
							onChange={(e) => { setTicketTypeFilter(e.target.value); setPage(1) }}
						>
							<option value="all">All ticket types</option>
							{eventTickets.map((t: any) => {
								const stats = ticketStatsById[t._id?.toString()]
								return (
									<option key={t._id?.toString()} value={t._id?.toString()}>
										{t.name} (${Number(t.price).toFixed(2)}) — {stats?.sold ?? 0} sold
									</option>
								)
							})}
						</Select>
					)}

					{hasActiveFilters && (
						<Button size="sm" variant="ghost" color="#F79432" _hover={{ bg: "#2A2A2A" }} onClick={clearFilters}>
							Clear filters
						</Button>
					)}

					{visibleRows.length > 0 && (
						<Button
							size="sm"
							variant="outline"
							borderColor="#343536"
							color="white"
							_hover={{ bg: "#2A2A2A" }}
							leftIcon={<ArrowDownTrayIcon className="w-4 h-4" />}
							onClick={handleExportCsv}
							ml="auto"
							h={{ base: 10, md: 8 }}
						>
							Export CSV
						</Button>
					)}
				</Flex>

				<Flex align="center" gap={2} flexWrap="wrap" fontSize="sm" color="#9C9C9C">
					<Text>Showing <Text as="span" color="white" fontWeight="bold">{visibleRows.length}</Text> of {rawEmails.length} guests</Text>
					{ticketTypeFilter !== "all" && (
						<>
							<Text>·</Text>
							<Badge colorScheme="purple" borderRadius="6px">{ticketStatsById[ticketTypeFilter]?.sold ?? 0} sold</Badge>
							<Badge colorScheme="green" borderRadius="6px">${(ticketStatsById[ticketTypeFilter]?.revenue ?? 0).toFixed(2)} collected</Badge>
						</>
					)}
					{signedUpDuringEvent !== null && (
						<>
							<Text>·</Text>
							<Badge colorScheme="blue" borderRadius="6px">{signedUpDuringEvent} signed up during the event</Badge>
						</>
					)}
				</Flex>
			</Flex>

			{!rawEmails.length ? (
				<Text>No guests or bookings found.</Text>
			) : !visibleRows.length ? (
				<Flex direction="column" gap={2} align="start">
					<Text color="#9C9C9C">
						No guests match{searchQuery.trim() ? ` "${searchQuery.trim()}"` : ''}{selectedTicketName ? ` for ${selectedTicketName}` : ''}
						{audience !== "all" ? ` in ${(AUDIENCE_CHIPS.find((c) => c.key === audience)?.label || "").toLowerCase()}` : ''}.
					</Text>
					<Button size="sm" variant="link" color="#F79432" onClick={clearFilters}>Clear filters</Button>
				</Flex>
			) : (
			<Box className="bg-[#181818] rounded-xl p-0 md:p-3 flex flex-col gap-y-3" overflowX="auto">
				{/* Phones: one card per guest. Nine columns of table were a sideways scroll. */}
				<Flex display={{ base: "flex", md: "none" }} direction="column" gap={3}>
					{pagedRows.map((row: GuestRow) => {
						const c = guestCells(row, true)
						const ticketsLabel = c.booking ? formatBookingTickets(c.booking) : ""
						return (
							<Box key={c.email} bg="#101010" border="1px solid #343536" borderRadius="12px" p={4} opacity={c.cancelled ? 0.6 : 1}>
								<Flex justify="space-between" align="flex-start" gap={3}>
									<Box minW={0} flex="1">
										<Text color="white" fontWeight={700} fontSize="15px" noOfLines={1} textDecoration={c.cancelled ? "line-through" : undefined}>
											{row.name || "—"}
										</Text>
										<Text color="#9C9C9C" fontSize="13px" noOfLines={1} wordBreak="break-all" textDecoration={c.cancelled ? "line-through" : undefined}>
											{row.email}
										</Text>
									</Box>
									<Box flexShrink={0} textAlign="right">{c.status}</Box>
								</Flex>
								{c.booking && (
									<Flex mt={3} gap={2} align="center" flexWrap="wrap" fontSize="13px" color="#D6D6D6">
										{ticketsLabel && <Text>{ticketsLabel}</Text>}
										{ticketsLabel && <Text color="#5A5D62">·</Text>}
										<Box>{c.amount}</Box>
									</Flex>
								)}
								<Flex mt={2} gap={2} align="center" flexWrap="wrap">
									{c.type}
									{!c.pending && c.booking?._id && !c.cancelled && c.checkIn}
								</Flex>
								{c.pending && <Box mt={3}>{c.approvalActions}</Box>}
								<Flex mt={3} pt={3} borderTop="1px solid #2A2D31" align="center" justify="space-between" gap={2}>
									<Button
										size="sm"
										h="40px"
										variant="outline"
										borderColor="#343536"
										color="#F79432"
										_hover={{ bg: '#2A2A2A' }}
										leftIcon={<EyeIcon style={{ width: 16, height: 16 }} />}
										onClick={() => setSelectedGuest({ guest: row.invitation, booking: c.booking, checkIn: c.ci })}
									>
										View details
									</Button>
									{!c.pending && (
										<Menu placement="bottom-end">
											<MenuButton
												as={IconButton}
												aria-label={`More actions for ${row.name || row.email}`}
												icon={<EllipsisHorizontalIcon className="w-5 h-5" />}
												size="sm"
												h="40px"
												minW="40px"
												variant="ghost"
												color="white"
												_hover={{ bg: "#2A2A2A" }}
												_active={{ bg: "#333" }}
												isLoading={cancellingRef === c.booking?.bookingRef || deletingEmail === c.email}
											/>
											<MenuList bg="#1D1F24" border="1px solid #444" color="white" minW="200px">
												{/* Same two actions, same guards as the row's buttons. */}
												{c.booking?.bookingRef && !c.cancelled && (
													<MenuItem bg="transparent" h="44px" color="orange.300" _hover={{ bg: "#333" }} _focus={{ bg: "#333" }} onClick={() => setCancelTarget(c.booking)}>
														Cancel booking
													</MenuItem>
												)}
												<MenuItem bg="transparent" h="44px" color="red.400" _hover={{ bg: "#3A2222" }} _focus={{ bg: "#3A2222" }} onClick={() => handleDeleteGuest(c.email, row.invitation, c.booking)}>
													{row.bookings.length === 0 ? 'Remove invite' : 'Delete guest'}
												</MenuItem>
											</MenuList>
										</Menu>
									)}
								</Flex>
							</Box>
						)
					})}
				</Flex>
				<TableContainer display={{ base: "none", md: "block" }}>
					<Table variant="simple" size="sm">
						<Thead>
							<Tr>
								<Th color="#9C9C9C">Name</Th>
								<Th color="#9C9C9C">Email</Th>
								<Th color="#9C9C9C">Type</Th>
								<Th color="#9C9C9C">Status</Th>
								<Th color="#9C9C9C">Ticket Type</Th>
								<Th color="#9C9C9C">Amount Paid</Th>
								<Th color="#9C9C9C">Invited At</Th>
								<Th color="#9C9C9C">Check-In</Th>
								<Th color="#9C9C9C"></Th>
							</Tr>
						</Thead>
						<Tbody>
							{pagedRows.map((row: GuestRow) => {
								const c = guestCells(row)
								return (
									<Tr key={c.email} opacity={c.cancelled ? 0.55 : 1}>
										<Td color="white" textDecoration={c.cancelled ? "line-through" : undefined}>{row.name || "—"}</Td>
										<Td color="white" textDecoration={c.cancelled ? "line-through" : undefined}>{row.email}</Td>
										<Td>{c.type}</Td>
										<Td color="white">{c.status}</Td>
										<Td color="white">{formatBookingTickets(c.booking)}</Td>
										<Td color="white">{c.amount}</Td>
										<Td color="white">{row.invitedAt ? DateTime.fromISO(row.invitedAt).toLocaleString(DateTime.DATETIME_MED) : "—"}</Td>
										<Td>{c.checkIn}</Td>
										<Td>
											{c.approvalActions}
											{c.viewDetails}
											{c.otherActions}
										</Td>
									</Tr>
								)
							})}
						</Tbody>
					</Table>
				</TableContainer>

				{totalPages > 1 && (
					<Flex justify={{ base: "space-between", md: "center" }} align="center" gap={2} mt={3} flexWrap={{ base: "nowrap", md: "wrap" }}>
						<Button
							size="sm"
							h={{ base: "40px", md: 8 }}
							bg="#2A2A2A" color="white" border="1px solid #444"
							_hover={{ bg: '#3A3A3A' }}
							_disabled={{ opacity: 0.4, cursor: 'not-allowed' }}
							isDisabled={page <= 1}
							onClick={() => setPage(p => p - 1)}
						>
							&lt; Prev
						</Button>
						<Text display={{ base: "block", md: "none" }} color="#9C9C9C" fontSize="sm" px={2}>
							Page <Text as="span" color="white" fontWeight="bold">{page}</Text> of {totalPages}
						</Text>
						{Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
							<Button
								key={p}
								display={{ base: "none", md: "inline-flex" }}
								size="sm"
								bg={p === page ? '#F79432' : '#2A2A2A'}
								color={p === page ? 'black' : 'white'}
								border="1px solid #444"
								_hover={{ bg: p === page ? '#e6832a' : '#3A3A3A' }}
								onClick={() => setPage(p)}
							>
								{p}
							</Button>
						))}
						<Button
							size="sm"
							bg="#2A2A2A" color="white" border="1px solid #444"
							_hover={{ bg: '#3A3A3A' }}
							_disabled={{ opacity: 0.4, cursor: 'not-allowed' }}
							isDisabled={page >= totalPages}
							h={{ base: "40px", md: 8 }}
							onClick={() => setPage(p => p + 1)}
						>
							Next &gt;
						</Button>
					</Flex>
				)}
			</Box>
			)}

			{/* Approve / reject confirmation, the SAME dialogs the Approvals tab mounts — so a
			    decision made here shows the same money, the same shortfall and the same partial
			    option it would there. */}
			<ApprovalDialogs controller={approvals} event={event} />

			{/* The host is cancelling somebody else's booking, so `asManager` — and the money
			    warning is the point of the dialog: a captured payment is not refunded. */}
			<CancelBookingDialog
				isOpen={!!cancelTarget}
				onClose={() => setCancelTarget(null)}
				onConfirm={handleCancelBooking}
				isLoading={!!cancellingRef}
				eventName={event?.name}
				guestName={cancelTarget?.customerName}
				asManager
				moneyState={bookingMoneyState(cancelTarget || undefined) as MoneyState}
				amount={bookingMoneyAmount(cancelTarget || undefined)}
			/>

			{/* Guest Detail Modal */}
			<Modal isOpen={!!selectedGuest} onClose={() => setSelectedGuest(null)} isCentered size={{ base: "full", md: "2xl" }}>
				<ModalOverlay />
				<ModalContent bg="#1E1E1E" color="white">
					<ModalHeader borderBottom="1px solid #3E3E3E">Guest Details</ModalHeader>
					<ModalCloseButton />
					<ModalBody pb={6}>
						{selectedGuest && (
							<Flex direction="column" gap={5}>
								{/* Basic info */}
								<Flex gap={6} wrap="wrap">
									<Box>
										<Text fontSize="xs" color="#9C9C9C">Name</Text>
										<Text fontWeight="semibold">{selectedGuest.booking?.customerName || selectedGuest.guest?.name || '—'}</Text>
									</Box>
									<Box>
										<Text fontSize="xs" color="#9C9C9C">Email</Text>
										<Text fontWeight="semibold">{selectedGuest.booking?.customerEmail || selectedGuest.guest?.email || '—'}</Text>
									</Box>
									<Box>
										<Text fontSize="xs" color="#9C9C9C">Status</Text>
										<Text fontWeight="semibold">{selectedGuest.guest?.status || (selectedGuest.booking ? 'Purchased' : '—')}</Text>
									</Box>
									<Box>
										<Text fontSize="xs" color="#9C9C9C">Invited At</Text>
										<Text fontWeight="semibold">{selectedGuest.guest?.invitedAt ? DateTime.fromISO(selectedGuest.guest.invitedAt).toLocaleString(DateTime.DATETIME_MED) : '—'}</Text>
									</Box>
									<Box>
										<Text fontSize="xs" color="#9C9C9C">Ticket Type</Text>
										<Text fontWeight="semibold">{formatBookingTickets(selectedGuest.booking)}</Text>
									</Box>
									<Box>
										<Text fontSize="xs" color="#9C9C9C">Amount Paid</Text>
										<Text fontWeight="semibold">{selectedGuest.booking ? `$${Number(selectedGuest.booking.total ?? 0).toFixed(2)}` : '—'}</Text>
									</Box>
								</Flex>

								{/* Questions */}
								{eventQuestions.length > 0 && (
									<Box>
										<Heading size="sm" mb={3} color="white">Questions</Heading>
										<Flex direction="column" gap={2}>
											{eventQuestions.map((q: any) => (
												<Box key={q.id} bg="#2A2A2A" rounded="lg" px={4} py={3}>
													<Text fontSize="sm" color="#F79432" fontWeight="semibold" mb={1}>{q.title}{q.isRequired ? ' *' : ''}</Text>
													<Text fontSize="sm" color="white"><AnswerText value={formatAnswer(q.id, selectedGuest.booking)} /></Text>
												</Box>
											))}
										</Flex>
									</Box>
								)}
							</Flex>
						)}
					</ModalBody>
				</ModalContent>
			</Modal>
		</>
	)
}


function ResponsesList({ eventId, event }: { eventId: string; event?: any }) {
	const [page, setPage] = useState(1)
	const questions: any[] = event?.questions || []

	const { data: bookings = [], isLoading, isError } = useQuery({
		queryKey: ["event-bookings", eventId],
		queryFn: () => axios.post("/api/get-bookings", { eventId }).then(r => r.data || []),
	})

	const formatAnswer = (qId: string, booking: any): string => {
		if (!booking?.customAnswers) return '—'
		const ans = booking.customAnswers.find((a: any) => a.questionId === qId)
		if (!ans || ans.answer == null) return '—'
		if (Array.isArray(ans.answer)) return ans.answer.length ? ans.answer.join(', ') : '—'
		if (typeof ans.answer === 'object') {
			const parts: string[] = []
			if (ans.answer.company) parts.push(ans.answer.company)
			if (ans.answer.jobTitle) parts.push(ans.answer.jobTitle)
			if (ans.answer.agreed !== undefined) parts.push(ans.answer.agreed ? 'Agreed' : 'Not agreed')
			if (ans.answer.signature) parts.push(`Signed: ${ans.answer.signature}`)
			if (ans.answer.url) parts.push(ans.answer.url)
			if (ans.answer.note) parts.push(ans.answer.note)
			return parts.join(' · ') || '—'
		}
		return String(ans.answer) || '—'
	}

	if (!questions.length) return <Text color="#9C9C9C">No custom questions for this event. Add questions in the Custom Questions tab.</Text>
	if (isLoading) return <Text>Loading responses...</Text>
	if (isError) return <Text color="red.500">Failed to load responses.</Text>

	// Only users who actually filled at least one custom answer
	const respondents = (bookings as any[]).filter(
		(b) => Array.isArray(b.customAnswers) && b.customAnswers.some((a: any) => a.answer != null && a.answer !== '' && !(Array.isArray(a.answer) && a.answer.length === 0))
	)

	if (!respondents.length) return <Text color="#9C9C9C">No responses yet — no guest has filled the custom questions.</Text>

	const totalPages = Math.ceil(respondents.length / GUESTS_PAGE_SIZE)
	const paged = respondents.slice((page - 1) * GUESTS_PAGE_SIZE, page * GUESTS_PAGE_SIZE)

	return (
		<Box overflowX="auto">
			<Text color="#9C9C9C" fontSize="sm" mb={3}>{respondents.length} guest{respondents.length === 1 ? '' : 's'} responded</Text>
			{/* Phones: a card per guest, questions down the card instead of across a table. */}
			<Flex display={{ base: "flex", md: "none" }} direction="column" gap={3}>
				{paged.map((booking: any) => (
					<Box key={booking._id || booking.bookingRef || booking.customerEmail} bg="#101010" border="1px solid #343536" borderRadius="12px" p={4}>
						<Text color="white" fontWeight={700} fontSize="15px">{booking.customerName || '—'}</Text>
						<Text color="#9C9C9C" fontSize="13px" wordBreak="break-all">{booking.customerEmail || '—'}</Text>
						<Flex direction="column" gap={3} mt={3} pt={3} borderTop="1px solid #2A2D31">
							{questions.map((q: any) => (
								<Box key={q.id}>
									<Text color="#9C9C9C" fontSize="12px">{stripHtml(q.title || '')}{q.isRequired ? ' *' : ''}</Text>
									<Box color="white" fontSize="14px" mt="2px"><AnswerText value={formatAnswer(q.id, booking)} /></Box>
								</Box>
							))}
						</Flex>
					</Box>
				))}
			</Flex>
			<TableContainer display={{ base: "none", md: "block" }}>
				<Table variant="simple" size="sm">
					<Thead>
						<Tr>
							<Th color="#9C9C9C">Name</Th>
							<Th color="#9C9C9C">Email</Th>
							{questions.map((q: any) => (
								<Th key={q.id} color="#9C9C9C">{stripHtml(q.title || '')}{q.isRequired ? ' *' : ''}</Th>
							))}
						</Tr>
					</Thead>
					<Tbody>
						{paged.map((booking: any) => (
							<Tr key={booking._id || booking.bookingRef || booking.customerEmail}>
								<Td color="white" whiteSpace="nowrap">{booking.customerName || '—'}</Td>
								<Td color="white" whiteSpace="nowrap">{booking.customerEmail || '—'}</Td>
								{questions.map((q: any) => (
									<Td key={q.id} color="white" whiteSpace="normal" maxW="260px"><AnswerText value={formatAnswer(q.id, booking)} /></Td>
								))}
							</Tr>
						))}
					</Tbody>
				</Table>
			</TableContainer>

			{totalPages > 1 && (
				<Flex justify={{ base: "space-between", md: "center" }} align="center" gap={2} mt={3} flexWrap={{ base: "nowrap", md: "wrap" }}>
					<Button
						size="sm"
						h={{ base: "40px", md: 8 }}
						bg="#2A2A2A" color="white" border="1px solid #444"
						_hover={{ bg: '#3A3A3A' }}
						_disabled={{ opacity: 0.4, cursor: 'not-allowed' }}
						isDisabled={page <= 1}
						onClick={() => setPage(p => p - 1)}
					>
						&lt; Prev
					</Button>
					<Text display={{ base: "block", md: "none" }} color="#9C9C9C" fontSize="sm" px={2}>
						Page <Text as="span" color="white" fontWeight="bold">{page}</Text> of {totalPages}
					</Text>
					{Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
						<Button
							key={p}
							display={{ base: "none", md: "inline-flex" }}
							size="sm"
							bg={p === page ? '#F79432' : '#2A2A2A'}
							color={p === page ? 'black' : 'white'}
							border="1px solid #444"
							_hover={{ bg: p === page ? '#e6832a' : '#3A3A3A' }}
							onClick={() => setPage(p)}
						>
							{p}
						</Button>
					))}
					<Button
						size="sm"
						bg="#2A2A2A" color="white" border="1px solid #444"
						_hover={{ bg: '#3A3A3A' }}
						_disabled={{ opacity: 0.4, cursor: 'not-allowed' }}
						isDisabled={page >= totalPages}
						h={{ base: "40px", md: 8 }}
						onClick={() => setPage(p => p + 1)}
					>
						Next &gt;
					</Button>
				</Flex>
			)}
		</Box>
	)
}


function InviteGuestsModal({ inviteGuestsModal, setInviteGuestsModal, event }: { inviteGuestsModal: boolean; setInviteGuestsModal: (inviteGuestsModal: boolean) => void; event: any }) {
	const [inviteMode, setInviteMode] = useState<"email" | "users">("email")

	// Email invite state
	const [emails, setEmails] = useState<string[]>([])
	const [step, setStep] = useState(1)
	const [loading, setLoading] = useState(false)
	const [message, setMessage] = useState("")
	const [emailInput, setEmailInput] = useState("")
	const [emailError, setEmailError] = useState("")

	// Jetzy user search state
	const [userQuery, setUserQuery] = useState("")
	const [userResults, setUserResults] = useState<any[]>([])
	const [searching, setSearching] = useState(false)
	const [invitingIds, setInvitingIds] = useState<string[]>([])

	const toast = useToast()

	const handleAddEmail = () => {
		const email = emailInput.trim()
		if (!email) { setEmailError("Please enter an email"); return }
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEmailError("Please enter a valid email"); return }
		if (emails.includes(email)) { setEmailError("Email already added"); return }
		setEmails([...emails, email])
		setEmailInput("")
		setEmailError("")
	}

	const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") { e.preventDefault(); handleAddEmail() }
	}

	const handleNext = () => setStep(2)
	const handleBack = () => setStep(1)

	const onSendInvitation = async () => {
		setLoading(true)
		try {
			await axios.post("/api/send-invites", {
				emails,
				message,
				subject: `Hi, Jetzy Events invite you to join ${event.name}!`,
				eventLink: `${process.env.NEXT_PUBLIC_URL}/events/${event._id}/guests/invite`,
				eventId: event._id,
			})
			setLoading(false)
			setStep(1)
			setEmails([])
			setMessage("")
			setInviteGuestsModal(false)
			toast({ title: "Invitations sent!", status: "success", duration: 3000, isClosable: true })
		} catch (error) {
			setLoading(false)
			toast({ title: "Failed to send invitations.", status: "error", duration: 3000, isClosable: true })
		}
	}

	const handleUserSearch = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!userQuery.trim()) return
		try {
			setSearching(true)
			const res = await axios.get(`/api/events/${event._id}/search-users`, {
				params: { query: userQuery, page: 1, perPage: 20 },
			})
			const data = res.data
			const docs = data?.data?.docs || data?.data?.users || data?.data?.data || data?.docs || data?.users || []
			setUserResults(docs)
		} catch (err) {
			console.error(err)
		} finally {
			setSearching(false)
		}
	}

	const handleInviteUser = async (user: any) => {
		const userId = user._id
		setInvitingIds(prev => [...prev, userId])
		try {
			const res = await axios.post(`/api/events/${event._id}/invite-jetzy-user`, {
				userId,
				userEmail: user.email || user.emailAddress || null,
				userName: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
			})

			setUserResults(prev => prev.map(u => u._id === userId ? { ...u, isInvited: true } : u))
			const { emailSent } = res.data?.data || {}
			toast({
				title: "Invitation sent!",
				description: emailSent ? "Push notification and email sent." : "Push notification sent. Email not available for this user.",
				status: "success",
				duration: 3000,
				isClosable: true,
			})
		} catch (err) {
			toast({ title: "Failed to send invitation.", status: "error", duration: 2000, isClosable: true })
		} finally {
			setInvitingIds(prev => prev.filter(id => id !== userId))
		}
	}

	useEffect(() => {
		if (!inviteGuestsModal) {
			setStep(1)
			setEmails([])
			setMessage("")
			setEmailInput("")
			setEmailError("")
			setUserQuery("")
			setUserResults([])
			setInviteMode("email")
		}
	}, [inviteGuestsModal])

	return (
		<Modal isOpen={inviteGuestsModal} onClose={() => setInviteGuestsModal(false)} isCentered size={{ base: "full", md: inviteMode === "email" && step === 2 ? "4xl" : "2xl" }}>
			<ModalOverlay />
			<ModalContent bg="#1E1E1E" color="white">
				<ModalHeader>Invite Guests</ModalHeader>
				<ModalCloseButton />
				<ModalBody>
					<Box display="flex" flexDirection="column" gap={4}>
						{/* Mode tabs */}
						<Flex gap={2} mb={2}>
							<Button
								size="sm"
								bg={inviteMode === "email" ? "#F79432" : "#383838"}
								color={inviteMode === "email" ? "black" : "white"}
								_hover={{ bg: inviteMode === "email" ? "#f78c22" : "#444" }}
								onClick={() => { setInviteMode("email"); setStep(1) }}
							>
								Email Invite
							</Button>
							<Button
								size="sm"
								bg={inviteMode === "users" ? "#F79432" : "#383838"}
								color={inviteMode === "users" ? "black" : "white"}
								_hover={{ bg: inviteMode === "users" ? "#f78c22" : "#444" }}
								onClick={() => setInviteMode("users")}
							>
								Search Jetzy Users
							</Button>
						</Flex>

						{/* Email invite flow */}
						{inviteMode === "email" && step === 1 && (
							<>
								<Text fontWeight="bold">Invite your guests by email:</Text>
								<Flex gap={2}>
									<Input
										type="email"
										placeholder="Enter your guest's email"
										value={emailInput}
										onChange={(e) => setEmailInput(e.target.value)}
										onKeyDown={handleInputKeyDown}
										isInvalid={!!emailError}
									/>
									<Button bg="#F79432" color="black" _hover={{ bg: "#f78c22" }} _active={{ bg: "#e67a10" }} onClick={handleAddEmail}>
										Add
									</Button>
								</Flex>
								{emailError && <Text color="red.500" fontSize="sm">{emailError}</Text>}
								{emails.length > 0 && (
									<Box mt={2}>
										<Text fontWeight="bold">Inviting {emails.length} Emails:</Text>
										<UnorderedList listStyleType="none" m="0" pt="2">
											{emails.map((email) => (
												<ListItem key={email} className="bg-[#383838] p-2 rounded-lg" my="2">
													<Flex align="center" justify="space-between">
														<span>{email}</span>
														<Button size="xs" colorScheme="red" variant="ghost" ml={2} onClick={() => setEmails(emails.filter((e) => e !== email))}>x</Button>
													</Flex>
												</ListItem>
											))}
										</UnorderedList>
									</Box>
								)}
								<Button size="lg" bg="#F79432" color="black" _hover={{ bg: "#f78c22" }} _active={{ bg: "#e67a10" }} mt={4} isDisabled={emails.length === 0} onClick={handleNext} width="full">
									Next
								</Button>
							</>
						)}
						{inviteMode === "email" && step === 2 && (
							<>
								<Flex align="flex-start" justify="space-between" gap={6} flexWrap="wrap">
									<Box flex="1">
										<Text mb={2}>Here are the emails you have entered:</Text>
										<UnorderedList pl={5}>
											{emails.map((email) => (<ListItem key={email}>{email}</ListItem>))}
										</UnorderedList>
									</Box>
									<Box borderWidth="1px" borderRadius="xl" p={4} flex="1" minW="300px">
										<Text fontWeight="bold" mb={2}>Hi, Jetzy Events invites you to join {event.name}.</Text>
										<Textarea rows={3} placeholder="Enter a custom message here..." value={message} onChange={(e) => setMessage(e.target.value)} mb={2} />
										<Text fontWeight="bold" mb={1}>RSVP: {process.env.NEXT_PUBLIC_URL}/{event.slug}</Text>
										<Text fontSize="sm">We will send guests an invitation link to register for the event.</Text>
									</Box>
								</Flex>
								<Flex mt={4} mb={4} justify="space-between">
									<Button onClick={handleBack}>Back</Button>
									<Button bg="#F79432" color="black" _hover={{ bg: "#f78c22" }} _active={{ bg: "#e67a10" }} isLoading={loading} onClick={onSendInvitation}>
										Send Invitations
									</Button>
								</Flex>
							</>
						)}

						{/* Jetzy user search */}
						{inviteMode === "users" && (
							<>
								<Text fontSize="sm" color="gray.400">Search Jetzy app users and invite them. They&apos;ll receive a push notification and email.</Text>
								<form onSubmit={handleUserSearch}>
									<Flex gap={2}>
										<Input
											placeholder="Search by name or username..."
											value={userQuery}
											onChange={(e) => setUserQuery(e.target.value)}
										/>
										<Button type="submit" bg="#F79432" color="black" _hover={{ bg: "#f78c22" }} isLoading={searching} minW="80px">
											Search
										</Button>
									</Flex>
								</form>
								<Box maxH="320px" overflowY="auto" display="flex" flexDirection="column" gap={2}>
									{searching ? (
										<Text color="gray.400" textAlign="center" py={4}>Searching...</Text>
									) : userResults.length === 0 && userQuery ? (
										<Text color="gray.500" textAlign="center" py={4}>No users found</Text>
									) : userResults.length === 0 ? (
										<Text color="gray.500" textAlign="center" py={4}>Search for Jetzy users to invite</Text>
									) : (
										userResults.map((user: any) => (
											<Flex key={user._id} align="center" justify="space-between" bg="#2a2a2a" p={3} borderRadius="xl" borderWidth="1px" borderColor="#3a3a3a">
												<Flex align="center" gap={3}>
													<Box w="40px" h="40px" borderRadius="full" bg="gray.700" overflow="hidden" flexShrink={0}>
														{user.image && <img src={user.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
													</Box>
													<Box>
														<Text fontWeight="medium" fontSize="sm">{user.firstName} {user.lastName}</Text>
														{user.email && <Text fontSize="xs" color="gray.500">{user.email}</Text>}
													</Box>
												</Flex>
												<Button
													size="sm"
													isLoading={invitingIds.includes(user._id)}
													isDisabled={user.isInvited || user.isMember}
													bg={user.isInvited ? "green.800" : user.isMember ? "gray.700" : "#F79432"}
													color={user.isInvited ? "green.300" : user.isMember ? "gray.400" : "black"}
													_hover={{ bg: user.isInvited || user.isMember ? undefined : "#f78c22" }}
													onClick={() => handleInviteUser(user)}
												>
													{user.isMember ? "Member" : user.isInvited ? "Invited" : "Invite"}
												</Button>
											</Flex>
										))
									)}
								</Box>
							</>
						)}
					</Box>
				</ModalBody>
			</ModalContent>
		</Modal>
	)
}

function ShareModal({ shareModal, setShareModal, eventSlug, isPrivate }: { shareModal: boolean; setShareModal: (shareModal: boolean) => void; eventSlug: string; isPrivate?: boolean }) {
	const [copied, setCopied] = useState(false)

	// One link for every event type. Private events are unlisted, not invite-only, so
	// there is no access code to append.
	const sharelink = eventUrl(process.env.NEXT_PUBLIC_URL || "", eventSlug)

	const onCopy = () => {
		navigator.clipboard.writeText(sharelink).then(() => {
			setCopied(true)
			setTimeout(() => setCopied(false), 1500)
		})
	}

	return (
		<Modal isOpen={shareModal} onClose={() => setShareModal(false)} isCentered>
			<ModalOverlay />
			<ModalContent bg="#1E1E1E" color="white">
				<ModalHeader>Share Event</ModalHeader>
				<ModalCloseButton />
				<ModalBody>
					<Box display="flex" flexDirection="column" gap={3}>
						<Text fontWeight="bold">Share the link:</Text>
						<Box w="100%" borderWidth="1px" bg="#090C10" borderColor="#444444" color="white" _placeholder={{ color: "gray.400" }} rounded="xl" p={2} wordBreak="break-all">
							{sharelink}
						</Box>
						{isPrivate && (
							<Text fontSize="12px" color="#868686" lineHeight="140%">
								This event is private, so it won&apos;t appear in the public events list — but anyone you send this link to can open it.
							</Text>
						)}
						<Button onClick={onCopy} bg="#F79432" color="black" _hover={{ bg: "#f78c22" }} _active={{ bg: "#e67a10" }} size="lg">
							{copied ? "Copied!" : "Copy"}
						</Button>
					</Box>
				</ModalBody>
			</ModalContent>
		</Modal>
	)
}

function EventDateTime({ iso }: { iso: string }) {
	const [formatted, setFormatted] = useState("")
	useEffect(() => {
		setFormatted(DateTime.fromISO(iso).setZone("America/New_York").toLocaleString(DateTime.DATETIME_MED))
	}, [iso])
	return <p className="font-semibold">{formatted}</p>
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	await ensureDbConnected()
	const authResult = await authorizedOnly(context)
	if ('redirect' in authResult) return authResult

	const eventId = context.query.eventId as string
	if (!eventId) return { notFound: true }

	// `draftRevision` is select:false (kept private); opt in here since the manage page
	// (owner/admin gated below) is the only place that renders the autosaved shadow draft.
	const event = await Events.findOne({ _id: eventId, isDeleted: false }).select("+draftRevision")
	if (!event) return { notFound: true }

	// Admin OR event owner may review approvals; others see a permission message
	const session = (authResult as any).props?.session
	const role = session?.user?.role
	const isAdmin = role === "admin" || role === "super admin"
	const uid = (session?.user as any)?._id?.toString()
	const isAuthorized = isAdmin || (event as any).ownerId?.toString() === uid

	// Unauthorized users get only the event name (for the message) — no manage data
	if (!isAuthorized) {
		return {
			props: {
				event: JSON.stringify({ _id: eventId, name: (event as any).name }),
				isAuthorized: false,
			},
		}
	}

	// Whether anything is still waiting on the host. The Approvals tab is shown for an open
	// request even when no ticket requires approval any more — the flag can be switched off while
	// requests and their card holds are live. Counted here rather than from the client's bookings
	// query so the tab, and every tab index after it, is settled on the first paint.
	const pendingApprovalCount = await Bookings.countDocuments({ eventId, status: BookingStatus.PENDING })

	return {
		props: {
			event: JSON.stringify(event),
			isAuthorized: true,
			pendingApprovalCount,
		},
	}
}

function DailyViewsModal({ isOpen, onClose, dailyViews }: { isOpen: boolean; onClose: () => void; dailyViews: any[] }) {
	return (
		<Modal isOpen={isOpen} onClose={onClose} isCentered size={{ base: "full", md: "xl" }}>
			<ModalOverlay />
			<ModalContent bg="#1E1E1E" color="white">
				<ModalHeader>Daily Event Views</ModalHeader>
				<ModalCloseButton />
				<ModalBody pb={6}>
					{dailyViews.length === 0 ? (
						<Text>No views recorded for this event yet.</Text>
					) : (
						<TableContainer maxHeight="400px" overflowY="auto">
							<Table variant="simple" colorScheme="gray">
								<Thead>
									<Tr>
										<Th color="gray.400">Date</Th>
										<Th color="gray.400" isNumeric>Views</Th>
										<Th color="gray.400" isNumeric>Unique Sessions</Th>
									</Tr>
								</Thead>
								<Tbody>
									{dailyViews.slice().reverse().map((day: any) => (
										<Tr key={day.date}>
											<Td>{DateTime.fromISO(day.date).toLocaleString(DateTime.DATE_MED)}</Td>
											<Td isNumeric>{day.views}</Td>
											<Td isNumeric>{day.uniqueViewers}</Td>
										</Tr>
									))}
								</Tbody>
							</Table>
						</TableContainer>
					)}
				</ModalBody>
			</ModalContent>
		</Modal>
	)
}

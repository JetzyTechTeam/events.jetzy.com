"use client"
import { stripHtml } from "@/utils/text";
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { ReferralCodesManager } from "@/components/console/ReferralCodesManager"
import { authorizedOnly } from "@/lib/authSession"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { GetServerSideProps } from "next"
import React, { useEffect, useState } from "react"
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
	InputRightElement,
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
} from "@chakra-ui/react"
import { DateTime } from "luxon"
import axios from "axios"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { LocationSVG, MessageSVG, UserPlusSVG, LockSVG, MultipleUsersSVG, PlusSVG, TicketSVG, UserTickSVG } from "@/assets/icons"
import { ShareIcon, EyeIcon } from "@heroicons/react/20/solid"
import { ChevronDownIcon, CalendarDaysIcon, ClockIcon, DevicePhoneMobileIcon, TicketIcon, EllipsisHorizontalIcon, MagnifyingGlassIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline"
import { MinusCircleIcon } from "@heroicons/react/24/solid"
import { useRouter } from "next/router"
import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import { destroySession } from "@Jetzy/redux/reducers/appSlice"
import { Formik, Form, Field, FormikProps, FieldArray } from "formik"
import { usePlacesWidget } from "react-google-autocomplete"
import DatePicker from "@/components/form/DatePicker"
import TimePicker from "@/components/form/TimePicker"
import RichTextEditor from "@/components/misc/RichTextEditor"
import InterestsSelector from "@/components/events/InterestsSelector"
import MediaUploadSection from "@/components/media-upload-section"
import TimezoneSelect from "@/components/timezone-select"
import { uploadFile, deleteFile } from "@/services/upload.service"
import { uniqueId } from "@/lib/utils"
import { isCancelledBooking, isPendingBooking } from "@/lib/booking-status"
import { ApprovalRequests } from "@/components/console/ApprovalRequests"
import { Error } from "@/lib/_toaster"
import { ROUTES } from "@/configs/routes"
import { useAppDispatch } from "@/redux/stores"
import { UpdateEventThunk, DeleteEventThunk } from "@/redux/reducers/eventsSlice"
import { CreateEventFormData, DatePollOption } from "@/types"
import { TicketData } from "@/components/events/TicketCard"
import { FileUploadData } from "@/components/misc/DragAndDropUploader"
import { EmailProps } from "@/lib/email-service"
import { z } from "zod"
import { Roboto } from "next/font/google"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { getEventZone, normalizeTimezone } from "@/utils/eventTime"

dayjs.extend(utc)
dayjs.extend(timezone)

const roboto = Roboto({ weight: ["400", "700"], subsets: ["latin"], display: "swap" })

// Shared dark field styling (Figma: bg #090C10, 1px #343536 border, rounded, Roboto 14px)
const fieldBase = "w-full h-12 bg-[#090C10] border border-[#343536] rounded-md text-white text-sm placeholder:text-gray-500 focus:outline-none"
const tzFieldCls = `${roboto.className} appearance-none ${fieldBase} px-3 pr-10 cursor-pointer`
const dtFieldCls = `${roboto.className} ${fieldBase} pl-10 pr-3`

// Brighten any icon SVGs (stroke or fill based) within a container for better visibility
const iconBrighten = {
	"& [stroke]": { stroke: "#E6E6E6" },
	"& [fill]:not([fill='none'])": { fill: "#E6E6E6", fillOpacity: 1 },
} as const

const updateEventSchema = z.object({
	name: z.string().min(1, "Event name is required"),
	location: z.string().optional(),
})

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

function Manage({ event: eventProp, isAuthorized = true }: any) {
	const event = React.useMemo(() => JSON.parse(eventProp), [eventProp])

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

	useEffect(() => {
		if (router.query.invite === "true") {
			setInviteGuestsModal(true)
			router.replace(`/console/events/${event._id}/manage`, undefined, { shallow: true })
		}
	}, [router.query.invite])

	// Deep-link from the admin approval-request email opens the Approvals tab
	useEffect(() => {
		if (router.query.tab === "approvals" && event.requireApproval) {
			setTabIndex(6)
		}
	}, [router.query.tab, event.requireApproval])

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

	// Per-ticket-type sold count + revenue, keyed by ticket _id (matches the `id` field on form values).
	const ticketSalesSummary = React.useMemo(() => {
		const priceById = new Map<string, number>()
		;(event.tickets || []).forEach((t: any) => priceById.set(t._id?.toString(), Number(t.price)))

		const byTicketId = new Map<string, { sold: number; revenue: number }>()
		;(eventBookings as any[]).forEach((booking: any) => {
			if (isCancelledBooking(booking)) return
			;(booking.tickets || []).forEach((t: any) => {
				const key = t.ticketId?.toString()
				if (!key) return
				const price = priceById.get(key) ?? 0
				const entry = byTicketId.get(key) || { sold: 0, revenue: 0 }
				entry.sold += t.quantity || 0
				entry.revenue += (t.quantity || 0) * price
				byTicketId.set(key, entry)
			})
		})
		return byTicketId
	}, [eventBookings, event.tickets])

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

	const [uploadedImages, setUploadedImages] = useState<FileUploadData[]>([])
	const [uploadProgress, setUploadProgress] = useState(0)
	const [isUploading, setIsUploading] = useState(false)
	const [uploadedVideos, setUploadedVideos] = useState<FileUploadData[]>([])
	const [videoUploadProgress, setVideoUploadProgress] = useState(0)
	const [isUploadingVideo, setIsUploadingVideo] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [isDeleting, setIsDeleting] = useState(false)
	const [isCloning, setIsCloning] = useState(false)
	const [editIndex, setEditIndex] = useState<number | null>(null)
	const [tempTicket, setTempTicket] = useState<TicketData>({ id: "", title: "", description: "", price: 0 })
	const [tempPollOption, setTempPollOption] = useState<DatePollOption>({ id: "", date: "", time: "", label: "" })
	const [pollDate, setPollDate] = useState("")
	const [pollTime, setPollTime] = useState("")
	const [editPollIndex, setEditPollIndex] = useState<number | null>(null)
	const [sendUpdateEmailCheck, setSendUpdateEmailCheck] = useState(false)
	const [benefitInput, setBenefitInput] = useState("")

	// Initialize images, videos and tickets on mount
	useEffect(() => {
		if (event.images && event.images.length > 0) {
			setUploadedImages(event.images.map((img: string) => ({ id: uniqueId(10), file: img })))
		}
		if (event.videos && event.videos.length > 0) {
			setUploadedVideos(event.videos.map((v: string) => ({ id: uniqueId(10), file: v })))
		}
		if (event.tickets && event.tickets.length > 0 && formikRef.current) {
			formikRef.current.setFieldValue("tickets", event.tickets.map((ticket: any) => ({
				id: ticket._id?.toString() || uniqueId(10),
				title: ticket.name,
				price: Number(ticket.price),
				description: ticket.desc,
			})))
		}
	}, [event])

	const initialValues: CreateEventFormData = React.useMemo(() => {
		const extractedTimeZone = getEventZone(event?.timezone)
		const start = event.startsOn ? dayjs.utc(event.startsOn).tz(extractedTimeZone) : null
		const end = event.endsOn ? dayjs.utc(event.endsOn).tz(extractedTimeZone) : null

		return {
			name: stripHtml(event.name),
			desc: event.desc,
			location: event.location,
			capacity: event.capacity,
			requireApproval: event.requireApproval,
			isPaid: event.isPaid,
			images: uploadedImages,
			tickets: (event.tickets || []).map((ticket: any) => ({
				id: ticket._id?.toString() || uniqueId(10),
				title: stripHtml(ticket.name),
				price: Number(ticket.price),
				description: stripHtml(ticket.desc),
			})),
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
			datePoll: event.datePoll ? {
				isActive: event.datePoll.isActive || false,
				question: event.datePoll.question || "",
				options: event.datePoll.options || [],
			} : { isActive: false, question: "", options: [] as DatePollOption[] },
			interests: ((event.interests ?? []) as any[]).map((id: any) => id?.toString?.() ?? id),
		} as CreateEventFormData
	}, [event, uploadedImages])

	const { ref: placesRef } = usePlacesWidget({
		apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
		onPlaceSelected: (place) => {
			if (formikRef.current) {
				formikRef.current?.setFieldValue("location", place.formatted_address)
				const lat = place.geometry.location.lat()
				const lng = place.geometry.location.lng()
				formikRef.current?.setFieldValue("latitude", lat)
				formikRef.current?.setFieldValue("longitude", lng)
				formikRef.current?.setFieldValue("placeId", place.place_id)
			}
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

	const onSubmit = async (values: CreateEventFormData) => {
		const isDraft = values.status === "draft"
		values.images = uploadedImages
		values.videos = uploadedVideos

		// A date poll and fixed start/end dates are mutually exclusive — force the user to resolve a conflict
		const pollActive = !!(values.datePoll?.isActive && values.datePoll?.options?.length)
		const hasDates = !!(values.startDate || values.endDate)
		if (pollActive && hasDates) {
			Error("Validation Error", "Remove either the date poll or the start/end dates before saving.")
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

		const events = await axios.post(`/api/get-bookings`, { eventId: event._id })
			.then(response => response.data)
			.catch(error => {
				console.error("Error fetching bookings:", error)
				return []
			})

		dispatcher(UpdateEventThunk({ data: { payload: JSON.stringify({ ...values, privacy: values.privacy }) }, id: event._id.toString() })).then((res: any) => {
			if (res?.payload?.status) {
				if (sendUpdateEmailCheck && events.length > 0) {
					const changes: string[] = []
					const extractedTimeZone = getEventZone(event?.timezone)
					const oldStart = event.startsOn ? dayjs.utc(event.startsOn).tz(extractedTimeZone) : null
					const oldEnd = event.endsOn ? dayjs.utc(event.endsOn).tz(extractedTimeZone) : null

					if (values.name !== event.name) changes.push(`Event Name: ${event.name} -> ${values.name}`)
					if (values.location !== event.location) changes.push(`Location: ${event.location} -> ${values.location}`)

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

					const currentTickets = JSON.stringify(values.tickets.map(t => ({ title: t.title, price: t.price })))
					const oldTickets = JSON.stringify((event.tickets || []).map((t: any) => ({ title: stripHtml(t.name), price: Number(t.price) })))
					if (currentTickets !== oldTickets) changes.push("Ticketing options have been revised")

					if (changes.length > 0) {
						const uniqueUsers = Array.from(new Map(events.map((e: any) => [e.customerEmail, e])).values()) as any[]
						const origin = typeof window !== "undefined" ? window.location.origin : ""
						const eventLink = `${origin}/${event.slug}`
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
						Promise.all(updatePromises)
							.then((results) => console.log("All event updates sent successfully:", results))
							.catch((err) => console.error("One or more event updates failed:", err))
					}
				}
				toast({ title: "Event updated!", status: "success", duration: 3000 })
				router.push(ROUTES.dashboard.events.index)
			}
		}).finally(() => {
			setIsSubmitting(false)
		})
	}

	const clearDatePoll = () => {
		formikRef.current?.setFieldValue("datePoll", { isActive: false, question: "", options: [] })
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
			await axios.post("/api/delete-image", { url: imageUrl })
			setUploadedImages((prev) => prev.filter((img) => img.file !== imageUrl))
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

	const handleCloneEvent = () => {
		setIsCloning(true)
		axios.post(`/api/events/${event._id}/clone`).then((res) => {
			const newId = res?.data?.data?._id
			toast({ title: "Event cloned successfully!", status: "success", duration: 3000 })
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
			router.push(ROUTES.dashboard.events.index)
		}).finally(() => setIsDeleting(false))
	}

	return (
		<>
			<ConsoleLayout
				page={
					<span className="flex flex-col mt-3">
						<span className={`${roboto.className} mb-7`} style={{ fontSize: "16px", lineHeight: "100%", letterSpacing: "0" }}>
							<span className="font-normal" style={{ color: "rgba(255,255,255,0.8)" }}>My Events &rsaquo; </span>
							<span className="text-[#F79432] font-normal">{stripHtml(event.name)}</span>
						</span>
						<span className={roboto.className} style={{ fontSize: "32px", fontWeight: 700, lineHeight: "100%", letterSpacing: "-0.03em", color: "#FFFFFF" }}>{stripHtml(event.name)}</span>
					</span> as any
				}
				component={
					<div className="flex flex-wrap gap-2 items-end self-end">
						{isAdmin && (
							<Button bg="#1877F2" color="white" _hover={{ bg: "#1565D8" }} _active={{ bg: "#1565D8" }} onClick={() => router.push(`/console/events/${event._id}/analytics`)} fontWeight="bold">
								View Analytics
							</Button>
						)}
						<Button bg="#F79432" color="black" _hover={{ bg: "#E68422" }} _active={{ bg: "#E68422" }} fontWeight="bold" isLoading={isSubmitting} onClick={() => formikRef.current?.submitForm()}>
							Update Event
						</Button>
						<Button bg="#3E3E3E" color="white" _hover={{ bg: "#323232" }} _active={{ bg: "#323232" }} fontWeight="bold" isLoading={isCloning} onClick={handleCloneEvent}>
							Clone
						</Button>
						<Button bg="#EC5E5E" color="white" _hover={{ bg: "#d94c4c" }} _active={{ bg: "#d94c4c" }} fontWeight="bold" onClick={onDeleteOpen}>
							Delete Event
						</Button>
					</div>
				}
			>
				{/* INVITE GUESTS MODAL  */}
				<InviteGuestsModal inviteGuestsModal={inviteGuestsModal} setInviteGuestsModal={setInviteGuestsModal} event={event} />

				{/* SEND BLAST MODAL  */}
				<SendBlastModal sendBlastModal={sendBlastModal} setSendBlastModal={setSendBlastModal} event={event} />

				{/* SHARE MODAL  */}
				<ShareModal shareModal={shareModal} setShareModal={setShareModal} eventSlug={event.slug} />

				{/* DAILY VIEWS MODAL */}
				<DailyViewsModal
					isOpen={showDailyViewsModal}
					onClose={() => setShowDailyViewsModal(false)}
					dailyViews={analytics?.trends?.views || []}
				/>

				<Tabs variant="line" index={tabIndex} onChange={setTabIndex} mt={6}>
					<TabList borderBottom="2px solid #9C9C9C" overflowX="auto" overflowY="hidden" sx={{ scrollbarWidth: "none", "::-webkit-scrollbar": { display: "none" }, "& > button": { flexShrink: 0 } }}>
						<Tab
							className={roboto.className}
							fontWeight={500}
							fontSize="18px"
							lineHeight="100%"
							color="#FFFFFF"
							borderTopRadius="10px"
							px={5}
							_selected={{
								bg: "#FFFFFF",
								color: "#0B0B0B",
								fontWeight: 700,
								borderColor: "#FFFFFF",
							}}
						>
							Overview
						</Tab>
						<Tab
							className={roboto.className}
							fontWeight={500}
							fontSize="18px"
							lineHeight="100%"
							color="#FFFFFF"
							borderTopRadius="10px"
							px={5}
							_selected={{
								bg: "#FFFFFF",
								color: "#0B0B0B",
								fontWeight: 700,
								borderColor: "#FFFFFF",
							}}
						>
							Guests
						</Tab>
						<Tab
							className={roboto.className}
							fontWeight={500}
							fontSize="18px"
							lineHeight="100%"
							color="#FFFFFF"
							borderTopRadius="10px"
							px={5}
							_selected={{
								bg: "#FFFFFF",
								color: "#0B0B0B",
								fontWeight: 700,
								borderColor: "#FFFFFF",
							}}
						>
							Referral Codes
						</Tab>
						<Tab
							className={roboto.className}
							fontWeight={500}
							fontSize="18px"
							lineHeight="100%"
							color="#FFFFFF"
							borderTopRadius="10px"
							px={5}
							_selected={{
								bg: "#FFFFFF",
								color: "#0B0B0B",
								fontWeight: 700,
								borderColor: "#FFFFFF",
							}}
						>
							Custom Questions
						</Tab>
						<Tab
							className={roboto.className}
							fontWeight={500}
							fontSize="18px"
							lineHeight="100%"
							color="#FFFFFF"
							borderTopRadius="10px"
							px={5}
							_selected={{
								bg: "#FFFFFF",
								color: "#0B0B0B",
								fontWeight: 700,
								borderColor: "#FFFFFF",
							}}
						>
							Responses
						</Tab>
						<Tab
							className={roboto.className}
							fontWeight={500}
							fontSize="18px"
							lineHeight="100%"
							color="#FFFFFF"
							borderTopRadius="10px"
							px={5}
							_selected={{
								bg: "#FFFFFF",
								color: "#0B0B0B",
								fontWeight: 700,
								borderColor: "#FFFFFF",
							}}
						>
							Blasts
						</Tab>
						{event.requireApproval && (
							<Tab
								className={roboto.className}
								fontWeight={500}
								fontSize="18px"
								lineHeight="100%"
								color="#FFFFFF"
								borderTopRadius="10px"
								px={5}
								_selected={{
									bg: "#FFFFFF",
									color: "#0B0B0B",
									fontWeight: 700,
									borderColor: "#FFFFFF",
								}}
							>
								Approvals
							</Tab>
						)}
					</TabList>
					<TabPanels>
						<TabPanel px={0}>
							<Formik
								innerRef={formikRef}
								initialValues={initialValues}
								onSubmit={onSubmit}
								enableReinitialize={true}
							>
								{({ values, setFieldValue }) => (
									<Form>
										<Flex direction={{ base: "column", lg: "row" }} gap={6} align="flex-start">
											{/* ===================== MAIN COLUMN ===================== */}
											<Flex direction="column" gap={6} flex={{ base: "1", lg: "2" }} w="full" minW={0}>
												{/* ---- Basic Information ---- */}
												<Box bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }}>
													<Heading size="md" color="white" mb={5}>Basic Information</Heading>

													<FormControl mb={4}>
														<FormLabel className={roboto.className} color="#FFFFFF" fontSize="12px" lineHeight="100%" fontWeight={400} mb={2}>Event title <Text as="span" color="#F79432">*</Text></FormLabel>
														<InputGroup>
															<Field
																as={Input}
																name="name"
																placeholder="Event title"
																className={roboto.className}
																bg="#090C10"
																color="white"
																fontSize="14px"
																h="48px"
																border="1px solid #343536"
																_focus={{ borderColor: "#343536", boxShadow: "none" }}
																maxLength={100}
																pr="60px"
																value={values?.name}
															/>
															<InputLeftElement h="48px" w="auto" right="3" left="auto" pointerEvents="none" color="gray.500" fontSize="xs">
																{values.name?.length || 0}/100
															</InputLeftElement>
														</InputGroup>
													</FormControl>

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
														bg="#14161B"
														rounded="xl"
														p="3"
														opacity={!!((values.datePoll?.isActive) && !(values.startDate || values.endDate)) ? 0.4 : 1}
														pointerEvents={!!((values.datePoll?.isActive) && !(values.startDate || values.endDate)) ? "none" : "auto"}
													>
														{/* Left: Start/End markers + dashed connector */}
														<Flex direction="column" gap="3" position="relative" pr="1" flexShrink={0}>
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
														<Flex direction="column" gap="3" flex="1" minW={0}>
															<Flex gap="3" flexWrap={{ base: "wrap", md: "nowrap" }}>
																<Box position="relative" flex="1" minW="140px">
																	<CalendarDaysIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
																	<DatePicker className={dtFieldCls} onChange={(date) => handleStartDateChange(date)} placeholder="Start Date" defaultDate={values.startDate} />
																</Box>
																<Box position="relative" flex="1" minW="120px">
																	<ClockIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
																	<TimePicker className={dtFieldCls} onChange={(time) => handleStartDateChange(undefined, time)} placeholder="Start Time" defaultValue={values.startTime} />
																</Box>
															</Flex>
															<Flex gap="3" flexWrap={{ base: "wrap", md: "nowrap" }}>
																<Box position="relative" flex="1" minW="140px">
																	<CalendarDaysIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
																	<DatePicker className={dtFieldCls} onChange={(date) => handleEndDateChange(date)} placeholder="End Date" defaultDate={values.endDate} />
																</Box>
																<Box position="relative" flex="1" minW="120px">
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
																<Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight="100%">Enable Date Poll</Text>
																<Text className={roboto.className} fontSize="12px" lineHeight="100%" color="#868686">Let attendees vote on preferred event date</Text>
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

													<FormControl mb={4}>
														<FormLabel className={roboto.className} color="#FFFFFF" fontSize="12px" lineHeight="100%" fontWeight={400} mb={2}>Location</FormLabel>
														<InputGroup>
															<InputLeftElement h="48px" pointerEvents="none"><LocationSVG /></InputLeftElement>
															<Field name="location">
																{({ field }: any) => (
																	<Input {...field} ref={placesRef} id="location" placeholder="Choose Location" className={roboto.className} bg="#090C10" color="white" fontSize="14px" h="48px" border="1px solid #343536" _focus={{ borderColor: "#343536", boxShadow: "none" }} pl="10" />
																)}
															</Field>
														</InputGroup>
													</FormControl>

													<FormControl>
														<FormLabel className={roboto.className} color="#FFFFFF" fontSize="12px" lineHeight="100%" fontWeight={400} mb={2}>Description</FormLabel>
														<RichTextEditor value={values.desc} onChange={(val) => setFieldValue("desc", val)} placeholder="Add Description" />
														<Text fontSize="xs" color="gray.500" mt={1} textAlign="right">{stripHtml(values.desc || "").length}/500</Text>
													</FormControl>
												</Box>

												{/* ---- Post-Event Thank You ---- */}
												<Box bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }}>
													<Heading size="md" color="white" mb={2}>Post-Event Thank You</Heading>
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

												{/* ---- Interests ---- */}
												<Box bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }}>
													<InterestsSelector bare selected={values.interests ?? []} onChange={(ids) => setFieldValue("interests", ids)} />
												</Box>

												{/* ---- Event Benefits ---- */}
												<Box bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }}>
													<Flex align="baseline" gap={2} mb={4}>
														<Heading size="md" color="white">Event Benefits</Heading>
														<Text className={roboto.className} fontSize="sm" color="#9C9C9C">(Max 23 chars)</Text>
													</Flex>
													{(() => {
														const addBenefit = () => {
															const v = benefitInput.trim()
															if (!v) return
															const list = (values.benefits || "").split(",").map((b: string) => b.trim()).filter(Boolean)
															setFieldValue("benefits", [...list, v].join(","))
															setBenefitInput("")
														}
														return (
															<InputGroup mb={4}>
																<Input
																	placeholder="e.g free food, free drinks etc"
																	className={roboto.className}
																	bg="#090C10"
																	color="white"
																	fontSize="sm"
																	h="48px"
																	border="1px solid #343536"
																	_focus={{ borderColor: "#343536", boxShadow: "none" }}
																	pr="70px"
																	maxLength={23}
																	value={benefitInput}
																	onChange={(e) => setBenefitInput(e.target.value)}
																	onKeyDown={(e) => {
																		if (e.key === "Enter") { e.preventDefault(); addBenefit() }
																	}}
																/>
																<InputRightElement w="auto" right="4" h="48px">
																	<Button size="sm" variant="ghost" color="#F79432" _hover={{ bg: "transparent" }} _active={{ bg: "transparent" }} p="0" onClick={addBenefit}>
																		+ Add
																	</Button>
																</InputRightElement>
															</InputGroup>
														)
													})()}
													<Flex gap={3} flexWrap="wrap">
														{(values.benefits || "").split(",").map((b: string) => b.trim()).filter(Boolean).map((b: string, idx: number) => (
															<Flex key={`${b}-${idx}`} align="center" gap={2} bg="#090C10" border="1px solid #343536" rounded="md" px="4" py="2">
																<Text className={roboto.className} fontSize="sm" color="white">{b}</Text>
																<Box
																	as="button"
																	type="button"
																	display="flex"
																	alignItems="center"
																	onClick={() => {
																		const list = (values.benefits || "").split(",").map((x: string) => x.trim()).filter(Boolean)
																		list.splice(idx, 1)
																		setFieldValue("benefits", list.join(","))
																	}}
																>
																	<MinusCircleIcon className="w-5 h-5 text-[#EC5E5E]" />
																</Box>
															</Flex>
														))}
													</Flex>
												</Box>

												{/* ---- Event Options ---- */}
												<Box bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }}>
													<Heading size="md" color="white" mb={4}>Event Options</Heading>
													<Flex align="center" justifyContent="space-between" mb={4}>
														<Flex gap="3" alignItems="center" sx={{ "& > svg": { width: "24px", height: "24px" } }}>
															<LockSVG />
															<Box>
																<Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight="100%">Privacy</Text>
																<Text className={roboto.className} fontSize="12px" lineHeight="100%" color="#868686">Who can view and join this event</Text>
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
																<Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight="100%">Require Approval</Text>
																<Text className={roboto.className} fontSize="12px" lineHeight="100%" color="#868686">{((values.tickets || []).length > 0 && (values.tickets || []).every((t: any) => Number(t.price) > 0)) ? "Available for events with a free ticket" : "Approval applies to free-ticket registrations"}</Text>
															</Box>
														</Flex>
														<Switch name="requireApproval" isDisabled={(values.tickets || []).length > 0 && (values.tickets || []).every((t: any) => Number(t.price) > 0)} isChecked={values.requireApproval && !((values.tickets || []).length > 0 && (values.tickets || []).every((t: any) => Number(t.price) > 0))} colorScheme="orange" onChange={() => setFieldValue("requireApproval", !values.requireApproval)} />
													</Flex>
													<Flex align="center" justifyContent="space-between" mb={4}>
														<Flex gap="3" alignItems="center" sx={{ "& > svg": { width: "24px", height: "24px" } }}>
															<MultipleUsersSVG />
															<Box>
																<Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight="100%">Capacity</Text>
																<Text className={roboto.className} fontSize="12px" lineHeight="100%" color="#868686">Maximum number of attendees</Text>
															</Box>
														</Flex>
														<Field as={Input} type="number" min={0} value={values.capacity ?? ""} placeholder="0" name="capacity" bg="#090C10" color="white" border="1px solid #2A2D31" w="90px" h="36px" />
													</Flex>
													<Flex align="center" justifyContent="space-between" mb={4}>
														<Flex gap="3" alignItems="center" sx={{ "& > svg": { width: "24px", height: "24px" } }}>
															<UserTickSVG />
															<Box>
																<Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight="100%">Send Update Email to Attendees</Text>
																<Text className={roboto.className} fontSize="12px" lineHeight="100%" color="#868686">Notify booked attendees of changes on save</Text>
															</Box>
														</Flex>
														<Switch isChecked={sendUpdateEmailCheck} colorScheme="orange" onChange={(e) => setSendUpdateEmailCheck(e.target.checked)} />
													</Flex>
													<Flex align="center" justifyContent="space-between" mb={4}>
														<Flex gap="3" alignItems="center" sx={{ "& > svg": { width: "24px", height: "24px" } }}>
															<LocationSVG />
															<Box>
																<Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight="100%">Disclose Location After Booking</Text>
																<Text className={roboto.className} fontSize="12px" lineHeight="100%" color="#868686">Attendees see location only in booking email</Text>
															</Box>
														</Flex>
														<Switch name="locationDisclosedAfterBooking" isChecked={values.locationDisclosedAfterBooking} colorScheme="orange" onChange={() => setFieldValue("locationDisclosedAfterBooking", !values.locationDisclosedAfterBooking)} />
													</Flex>
													<Flex align="center" justifyContent="space-between" mb={4}>
														<Flex gap="3" alignItems="center" sx={{ "& > svg": { width: "24px", height: "24px" } }}>
															<DevicePhoneMobileIcon className="text-[#B5B6B7]" />
															<Box>
																<Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight="100%">Show on Mobile</Text>
																<Text className={roboto.className} fontSize="12px" lineHeight="100%" color="#868686">Display this event in the Jetzy mobile app</Text>
															</Box>
														</Flex>
														<Switch name="showOnMobile" isChecked={values.showOnMobile} colorScheme="orange" onChange={() => setFieldValue("showOnMobile", !values.showOnMobile)} />
													</Flex>
													<Flex align="center" justifyContent="space-between">
														<Flex gap="3" alignItems="center" sx={{ "& > svg": { width: "24px", height: "24px" } }}>
															<TicketSVG />
															<Box>
																<Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight="100%">Tickets</Text>
																<Text className={roboto.className} fontSize="12px" lineHeight="100%" color="#868686">Manage ticket types and pricing</Text>
															</Box>
														</Flex>
														<Button bg="transparent" color="#F79432" _hover={{ bg: "transparent" }} _active={{ bg: "transparent" }} size="sm" fontSize="16px" onClick={() => { setEditIndex(null); setTempTicket({ id: "", title: "", description: "", price: 0 }); onOpen() }} leftIcon={<TicketIcon className="w-5 h-5" />} p="0">
															Add Tickets
														</Button>
													</Flex>
													<FieldArray name="tickets">
														{({ remove }) => (
															<>
																{values.tickets.map((ticket, index) => {
																	const stats = ticketSalesSummary.get(ticket.id.toString())
																	return (
																		<Box key={ticket.id || index} p="5" bg="#1E1E1E" borderRadius="10px" border="1px solid #343536" mt={4} position="relative">
																			<Text className={roboto.className} fontWeight="bold" fontSize="lg" color="white" pr="6">{ticket.title}</Text>
																			<Text className={roboto.className} fontSize="sm" my="1" color="#868686" pr="6">{ticket.description}</Text>
																			<Flex align="center" justify="space-between" mt="2" wrap="wrap" gap={2}>
																				<Text fontWeight="bold" fontSize="2xl" color="#F79432">${ticket.price}</Text>
																				<Flex gap={2}>
																					<Badge colorScheme="purple" fontSize="0.75em" px={2} py={1} borderRadius="6px">{stats?.sold ?? 0} sold</Badge>
																					<Badge colorScheme="green" fontSize="0.75em" px={2} py={1} borderRadius="6px">${(stats?.revenue ?? 0).toFixed(2)} collected</Badge>
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
																	)
																})}
															</>
														)}
													</FieldArray>
												</Box>

												{/* Status (kept) */}
												<Box bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }}>
													<Flex align="center" justifyContent="space-between">
														<Text className={roboto.className} color="white" fontWeight={500} fontSize="16px" lineHeight="100%">Status</Text>
														<Field as="select" name="status" value={values?.status} className="bg-[#090C10] block w-[130px] h-10 rounded-md border border-[#2A2D31] py-1 shadow-sm sm:text-sm sm:leading-6 p-3 text-white">
															<option value="published">Published</option>
															<option value="draft">Draft</option>
														</Field>
													</Flex>
												</Box>
											</Flex>

											{/* ===================== SIDEBAR ===================== */}
											<Flex direction="column" gap={6} flex="1" w="full" maxW={{ lg: "360px" }} minW={0}>
												{/* ---- Event Media ---- */}
												<Box bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }}>
													<Heading size="md" color="white" mb={4}>Event Media</Heading>
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
													/>
												</Box>

												{/* ---- Quick Actions ---- */}
												<Box bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }} sx={{ ...iconBrighten, "& svg": { width: "20px", height: "20px" } }}>
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

												{/* ---- Event Stats ---- */}
												<Box bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }} sx={{ ...iconBrighten, "& svg": { width: "22px", height: "22px" } }}>
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

										{/* Tickets Modal */}
										<FieldArray name="tickets">
											{({ push, replace }) => (
												<Modal isOpen={isOpen} onClose={onClose} isCentered>
													<ModalOverlay />
													<ModalContent bg="#1E1E1E" color="white">
														<ModalHeader>{editIndex !== null ? "Edit Ticket" : "Add Ticket"}</ModalHeader>
														<ModalCloseButton />
														<ModalBody>
															<FormControl mb={4}>
																<FormLabel>Ticket Name</FormLabel>
																<Input placeholder="Enter ticket name" bg="#090C10" border="1px solid #444" value={tempTicket.title} onChange={(e) => setTempTicket({ ...tempTicket, title: e.target.value })} />
															</FormControl>
															<FormControl mb={4}>
																<FormLabel>Description</FormLabel>
																<Textarea placeholder="Enter description" bg="#090C10" border="1px solid #444" value={tempTicket.description} onChange={(e) => setTempTicket({ ...tempTicket, description: e.target.value })} />
															</FormControl>
															<FormControl mb={4}>
																<FormLabel>Price</FormLabel>
																<Input type="number" placeholder="Enter price" bg="#090C10" border="1px solid #444" value={tempTicket.price} onChange={(e) => setTempTicket({ ...tempTicket, price: parseFloat(e.target.value) })} />
															</FormControl>
														</ModalBody>
														<ModalFooter>
															<Button bg="#F79432" color="black" mr={3} onClick={() => {
																if (!tempTicket.title.trim() || !tempTicket.description.trim()) {
																	toast({ title: "Missing required fields", description: "You need to provide a ticket title and description.", status: "error", duration: 4000, isClosable: true })
																	return
																}
																if (editIndex !== null) replace(editIndex, tempTicket)
																else push({ ...tempTicket, id: uniqueId(10) })
																onClose()
															}}>
																{editIndex !== null ? "Save Changes" : "Add Ticket"}
															</Button>
															<Button variant="ghost" color="white" _hover={{ color: "black", bg: "orange" }} onClick={onClose}>Cancel</Button>
														</ModalFooter>
													</ModalContent>
												</Modal>
											)}
										</FieldArray>

										{/* Date Poll Option Modal */}
										<Modal isOpen={isPollModalOpen} onClose={onPollModalClose} isCentered>
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
														<Input placeholder="e.g. Weekend option" bg="#090C10" border="1px solid #444" color="white" value={tempPollOption.label || ""} onChange={(e) => setTempPollOption({ ...tempPollOption, label: e.target.value })} />
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
						<TabPanel>
							{/* Guests list content goes here */}
							<div className="bg-[#181818] rounded-xl p-3 flex flex-col gap-y-3">
								<GuestsList eventId={event._id} event={event} />
							</div>
						</TabPanel>
						<TabPanel>
							<div className="bg-[#181818] rounded-xl p-3">
								<ReferralCodesManager eventId={event._id} />
							</div>
						</TabPanel>
						<TabPanel>
							<div className="bg-[#181818] rounded-xl p-3">
								<CustomQuestionsManager event={event} />
							</div>
						</TabPanel>
						<TabPanel>
							<div className="bg-[#181818] rounded-xl p-3">
								<ResponsesList eventId={event._id} event={event} />
							</div>
						</TabPanel>
						<TabPanel>
							<div className="bg-[#181818] rounded-xl p-3">
								<BlastsManager event={event} onOpenAdvanced={() => setSendBlastModal(true)} />
							</div>
						</TabPanel>
						{event.requireApproval && (
							<TabPanel>
								<div className="bg-[#181818] rounded-xl p-3">
									<ApprovalRequests eventId={event._id} event={event} />
								</div>
							</TabPanel>
						)}
					</TabPanels>
				</Tabs>

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
			</ConsoleLayout>
		</>
	)
}

function SendBlastModal({ sendBlastModal, setSendBlastModal, event }: { sendBlastModal: boolean; setSendBlastModal: (sendBlastModal: boolean) => void; event: any }) {
	const [subject, setSubject] = useState("")
	const [message, setMessage] = useState("")
	const [status, setStatus] = useState("all")
	const [targetType, setTargetType] = useState("invitations")
	const [emailType, setEmailType] = useState("custom")
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState("")

	const toast = useToast({ position: "top" })

	useEffect(() => {
		if (!sendBlastModal) {
			setSubject("")
			setMessage("")
			setStatus("all")
			setTargetType("invitations")
			setEmailType("custom")
			setError("")
		}
	}, [sendBlastModal])

	const onSendBlast = async () => {
		if (!status || !subject.trim() || !message.trim()) {
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
				eventLink: `${process.env.NEXT_PUBLIC_URL}/${event.slug}`,
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
		<Modal isOpen={sendBlastModal} onClose={() => setSendBlastModal(false)} isCentered size="xl" scrollBehavior="inside">
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
								setStatus("all")
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
						<Select
							mb={4}
							value={status}
							onChange={(e) => setStatus(e.target.value)}
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
							{targetType === "all" ? (
								<option style={{ backgroundColor: "#090C10", color: "white" }} value="all">
									All
								</option>
							) : targetType === "bookings" ? (
								<>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="all">
										All
									</option>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="pending">
										Pending
									</option>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="approved">
										Approved
									</option>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="confirmed">
										Confirmed
									</option>
								</>
							) : (
								<>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="all">
										All
									</option>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="pending">
										Pending
									</option>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="accepted">
										Accepted
									</option>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="rejected">
										Rejected
									</option>
								</>
							)}
						</Select>
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
						<Textarea
							rows={5}
							placeholder="Enter your blast message here..."
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							mb={2}
							isRequired
							bg="#090C10"
							borderColor="#444444"
							color="white"
							_placeholder={{ color: "gray.400" }}
						/>
						{error && <Text color="red.500">{error}</Text>}

						<Button size="lg" bg="#F79432" color="black" _hover={{ bg: "#f78c22" }} _active={{ bg: "#e67a10" }} isLoading={loading} onClick={onSendBlast}>
							Send Blast
						</Button>
					</Box>
				</ModalBody>
			</ModalContent>
		</Modal>
	)
}

function BlastsManager({ event, onOpenAdvanced }: { event: any; onOpenAdvanced: () => void }) {
	const toast = useToast({ position: "top" })
	const queryClient = useQueryClient()
	const [subject, setSubject] = useState("")
	const [message, setMessage] = useState("")
	const [sending, setSending] = useState(false)
	const [sendResult, setSendResult] = useState<{ type: "success" | "warning" | "error"; text: string } | null>(null)

	const [editing, setEditing] = useState<any | null>(null)
	const [editSubject, setEditSubject] = useState("")
	const [editMessage, setEditMessage] = useState("")
	const [savingEdit, setSavingEdit] = useState(false)

	// Confirm modals (replace native window.confirm)
	const [pendingResend, setPendingResend] = useState<{ blast: any; subject: string; message: string } | null>(null)
	const [resending, setResending] = useState(false)
	const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
	const [deleting, setDeleting] = useState(false)

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
		if (!message.trim()) {
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
				eventLink: `${process.env.NEXT_PUBLIC_URL}/${event.slug}`,
			})
			toast({
				title: res.status === 207 ? "Partially sent" : "Blast sent!",
				description: res.data?.message,
				status: res.status === 207 ? "warning" : "success",
				duration: 4000,
			})
			setSubject("")
			setMessage("")
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
	}

	const onSaveEdit = async () => {
		if (!editMessage.trim()) {
			toast({ title: "Message is required.", status: "error", duration: 3000 })
			return
		}
		setSavingEdit(true)
		try {
			const blast = editing
			await axios.patch(`/api/events/${event._id}/blasts/${blast._id}`, {
				subject: editSubject,
				message: editMessage,
			})
			refresh()
			setEditing(null)
			// Offer to resend the edited blast to the same audience (themed modal).
			setPendingResend({ blast, subject: editSubject, message: editMessage })
		} catch (error: any) {
			toast({ title: "Failed to save blast.", description: error.response?.data?.message || "An unexpected error occurred.", status: "error", duration: 5000 })
		}
		setSavingEdit(false)
	}

	const doResend = async () => {
		if (!pendingResend) return
		const { blast, subject: rSubject, message: rMessage } = pendingResend
		setResending(true)
		try {
			const res = await axios.post("/api/send-blast", {
				event,
				subject: rSubject.trim() || `New message in ${event.name}`,
				message: rMessage,
				status: blast.status || "all",
				targetType: blast.targetType || "all",
				emailType: blast.emailType || "custom",
				eventLink: `${process.env.NEXT_PUBLIC_URL}/${event.slug}`,
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

	const targetLabel = (b: any) => (b.targetType === "all" ? "All guests" : b.targetType === "bookings" ? "Bookings" : "Invitations")

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
				<Textarea
					rows={4}
					placeholder="Send a blast to your guests..."
					value={message}
					onChange={(e) => setMessage(e.target.value)}
					mb={3}
					bg="#090C10"
					borderColor="#444444"
					color="white"
					_placeholder={{ color: "gray.400" }}
				/>
				{sendResult && (
					<Text fontSize="sm" mb={3} color={sendResult.type === "success" ? "#48BB78" : sendResult.type === "warning" ? "#F79432" : "#FC8181"}>
						{sendResult.text}
					</Text>
				)}
				<Flex justify="space-between" align="center">
					<Text as="button" type="button" onClick={onOpenAdvanced} color="#F79432" fontSize="sm" fontWeight="bold">
						↗ Advanced options
					</Text>
					<Button bg="#F79432" color="black" _hover={{ bg: "#E68422" }} isLoading={sending} onClick={onSend}>
						Send to all
					</Button>
				</Flex>
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
										{b.message}
									</Text>
									<Flex gap={3} mt={2} wrap="wrap" align="center">
										<Badge colorScheme="orange">{targetLabel(b)}</Badge>
										<Text color="#9C9C9C" fontSize="xs">
											{b.succeededCount}/{b.recipientCount} delivered
										</Text>
										{b.sentAt && (
											<Text color="#9C9C9C" fontSize="xs">
												{DateTime.fromISO(b.sentAt).toLocaleString(DateTime.DATETIME_MED)}
											</Text>
										)}
									</Flex>
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
			<Modal isOpen={!!editing} onClose={() => setEditing(null)} isCentered size="xl">
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
						<Textarea
							rows={6}
							value={editMessage}
							onChange={(e) => setEditMessage(e.target.value)}
							mb={4}
							bg="#090C10"
							borderColor="#444444"
							color="white"
							_placeholder={{ color: "gray.400" }}
						/>
						<Button w="full" bg="#F79432" color="black" _hover={{ bg: "#E68422" }} isLoading={savingEdit} onClick={onSaveEdit}>
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
			<Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} isCentered size="lg">
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
	const [ticketTypeFilter, setTicketTypeFilter] = useState<string>("all")
	const [searchQuery, setSearchQuery] = useState("")
	const queryClient = useQueryClient()

	const eventTickets: any[] = event?.tickets || []
	const ticketNameById: Record<string, string> = {}
	eventTickets.forEach((t: any) => { if (t._id) ticketNameById[t._id.toString()] = t.name })

	const formatBookingTickets = (booking: any): string => {
		if (!booking?.tickets?.length) return '—'
		return booking.tickets.map((t: any) => `${ticketNameById[t.ticketId?.toString()] || 'Ticket'} ×${t.quantity}`).join(', ')
	}

	const handleDeleteGuest = async (email: string, guest: any, booking: any) => {
		if (!confirm(`Remove ${booking?.customerName || guest?.name || "this guest"}? This cannot be undone.`)) return
		setDeletingEmail(email)
		try {
			if (booking?.bookingRef) {
				await axios.post("/api/bookings/delete", { bookingRef: booking.bookingRef })
			}
			if (guest?._id) {
				await axios.post("/api/guests/delete", { guestId: guest._id })
			}
			queryClient.invalidateQueries({ queryKey: ["guests-list", eventId] })
			queryClient.invalidateQueries({ queryKey: ["event-bookings", eventId] })
		} catch {
			alert("Failed to delete guest.")
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

	const guestByEmail: Record<string, any> = {}
	guests.forEach((g: any) => {
		if (g.email) guestByEmail[g.email.toLowerCase()] = g
	})

	const bookingByEmail: Record<string, any> = {}
	;(bookings as any[]).forEach((b: any) => {
		if (!b.customerEmail) return
		const key = b.customerEmail.toLowerCase()
		// Prefer an active booking over a cancelled one when an email has multiple.
		const existing = bookingByEmail[key]
		if (!existing || isCancelledBooking(existing)) bookingByEmail[key] = b
	})

	const checkInMap: Record<string, { checkedInCount: number; isFullyCheckedIn: boolean }> = {}
	;(checkIns as any[]).forEach((ci: any) => {
		checkInMap[ci.bookingId] = { checkedInCount: ci.checkedInCount, isFullyCheckedIn: ci.isFullyCheckedIn }
	})

	// Sold count + revenue per ticket type, so this shows up right here without switching to Overview.
	const ticketStatsById: Record<string, { sold: number; revenue: number }> = {}
	;(bookings as any[]).forEach((b: any) => {
		if (isCancelledBooking(b)) return
		;(b.tickets || []).forEach((t: any) => {
			const key = t.ticketId?.toString()
			if (!key) return
			const price = Number((eventTickets.find((et: any) => et._id?.toString() === key) || {}).price) || 0
			const entry = ticketStatsById[key] || { sold: 0, revenue: 0 }
			entry.sold += t.quantity || 0
			entry.revenue += (t.quantity || 0) * price
			ticketStatsById[key] = entry
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

	const rawEmails = Array.from(new Set([
		...guests.map((g: any) => g.email?.toLowerCase()).filter(Boolean),
		...bookings.map((b: any) => b.customerEmail?.toLowerCase()).filter(Boolean)
	]))

	const matchesTicketFilter = (email: string) => {
		if (ticketTypeFilter === "all") return true
		const booking = bookingByEmail[email]
		if (!booking || isCancelledBooking(booking)) return false
		return (booking.tickets || []).some((t: any) => t.ticketId?.toString() === ticketTypeFilter)
	}

	const matchesSearch = (email: string) => {
		const q = searchQuery.trim().toLowerCase()
		if (!q) return true
		const guest = guestByEmail[email]
		const booking = bookingByEmail[email]
		const name = (booking?.customerName || guest?.name || "").toLowerCase()
		return email.includes(q) || name.includes(q)
	}

	const allEmails = rawEmails.filter(matchesTicketFilter).filter(matchesSearch)
	const hasActiveFilters = ticketTypeFilter !== "all" || !!searchQuery.trim()
	const clearFilters = () => { setTicketTypeFilter("all"); setSearchQuery(""); setPage(1) }
	const selectedTicketName = eventTickets.find((t: any) => t._id?.toString() === ticketTypeFilter)?.name

	const totalPages = Math.ceil(allEmails.length / GUESTS_PAGE_SIZE)
	const pagedEmails = allEmails.slice((page - 1) * GUESTS_PAGE_SIZE, page * GUESTS_PAGE_SIZE)

	const escapeCsv = (value: any) => {
		const str = String(value ?? '')
		return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
	}

	const handleExportCsv = () => {
		const headers = ['Name', 'Email', 'Status', 'Ticket Type', 'Amount Paid', 'Invited At', 'Check-In']
		const rows = allEmails.map((email: string) => {
			const guest = guestByEmail[email]
			const booking = bookingByEmail[email]
			const ci = booking?._id ? checkInMap[booking._id.toString()] : null
			const cancelled = isCancelledBooking(booking)
			const checkInLabel = cancelled
				? 'Cancelled'
				: !booking?._id ? 'N/A'
				: !ci ? 'Not Checked In'
				: ci.isFullyCheckedIn ? 'Fully Checked In'
				: `Partial (${ci.checkedInCount})`
			return [
				booking?.customerName || guest?.name || '',
				email,
				cancelled ? 'Cancelled' : (guest?.status || (booking ? 'Purchased' : '')),
				formatBookingTickets(booking),
				booking ? Number(booking.total ?? 0).toFixed(2) : '',
				guest?.invitedAt ? DateTime.fromISO(guest.invitedAt).toLocaleString(DateTime.DATETIME_MED) : '',
				checkInLabel,
			]
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

	return (
		<>
			<Flex direction="column" gap={2} mb={3}>
				<Flex align="center" gap={3} flexWrap="wrap">
					<InputGroup size="sm" maxW="280px">
						<InputLeftElement pointerEvents="none">
							<MagnifyingGlassIcon className="w-4 h-4" style={{ color: "#9C9C9C" }} />
						</InputLeftElement>
						<Input
							placeholder="Search by name or email"
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
							maxW="280px"
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

					{allEmails.length > 0 && (
						<Button
							size="sm"
							variant="outline"
							borderColor="#343536"
							color="white"
							_hover={{ bg: "#2A2A2A" }}
							leftIcon={<ArrowDownTrayIcon className="w-4 h-4" />}
							onClick={handleExportCsv}
							ml="auto"
						>
							Export CSV
						</Button>
					)}
				</Flex>

				<Flex align="center" gap={2} flexWrap="wrap" fontSize="sm" color="#9C9C9C">
					<Text>Showing <Text as="span" color="white" fontWeight="bold">{allEmails.length}</Text> of {rawEmails.length} guests</Text>
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
			) : !allEmails.length ? (
				<Flex direction="column" gap={2} align="start">
					<Text color="#9C9C9C">
						No guests match{searchQuery.trim() ? ` "${searchQuery.trim()}"` : ''}{selectedTicketName ? ` for ${selectedTicketName}` : ''}.
					</Text>
					<Button size="sm" variant="link" color="#F79432" onClick={clearFilters}>Clear filters</Button>
				</Flex>
			) : (
			<Box className="bg-[#181818] rounded-xl p-3 flex flex-col gap-y-3" overflowX="auto">
				<TableContainer>
					<Table variant="simple" size="sm">
						<Thead>
							<Tr>
								<Th color="#9C9C9C">Name</Th>
								<Th color="#9C9C9C">Email</Th>
								<Th color="#9C9C9C">Status</Th>
								<Th color="#9C9C9C">Ticket Type</Th>
								<Th color="#9C9C9C">Amount Paid</Th>
								<Th color="#9C9C9C">Invited At</Th>
								<Th color="#9C9C9C">Check-In</Th>
								<Th color="#9C9C9C"></Th>
							</Tr>
						</Thead>
						<Tbody>
							{pagedEmails.map((email: string) => {
								const guest = guestByEmail[email]
								const booking = bookingByEmail[email]
								const ci = booking?._id ? checkInMap[booking._id.toString()] : null
								const cancelled = isCancelledBooking(booking)
								const rejected = booking?.status === 'rejected'
								const pending = isPendingBooking(booking)
								return (
									<Tr key={email} opacity={cancelled ? 0.55 : 1}>
										<Td color="white" textDecoration={cancelled ? "line-through" : undefined}>{booking?.customerName || guest?.name || "—"}</Td>
										<Td color="white" textDecoration={cancelled ? "line-through" : undefined}>{email}</Td>
										<Td color="white">
											{cancelled
												? <Badge colorScheme="red">{rejected ? 'Rejected' : 'Cancelled'}</Badge>
												: pending
												? <Badge colorScheme="yellow">Pending Approval</Badge>
												: (guest?.status || (booking ? 'Purchased' : '—'))}
										</Td>
										<Td color="white">{formatBookingTickets(booking)}</Td>
										<Td color="white">{booking ? `$${Number(booking.total ?? 0).toFixed(2)}` : "—"}</Td>
										<Td color="white">{guest?.invitedAt ? DateTime.fromISO(guest.invitedAt).toLocaleString(DateTime.DATETIME_MED) : "—"}</Td>
										<Td>
											{cancelled
												? <Badge colorScheme="red">{rejected ? 'Rejected' : 'Cancelled'}</Badge>
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
										</Td>
										<Td>
											<Button
												size="sm"
												variant="ghost"
												color="#F79432"
												_hover={{ bg: '#2A2A2A' }}
												leftIcon={<EyeIcon style={{ width: 14, height: 14 }} />}
												onClick={() => setSelectedGuest({ guest, booking, checkIn: ci })}
											>
												View Details
											</Button>
											<Button
												size="sm"
												variant="ghost"
												color="red.400"
												_hover={{ bg: '#2A2A2A' }}
												isLoading={deletingEmail === email}
												onClick={() => handleDeleteGuest(email, guest, booking)}
												ml={1}
											>
												Delete
											</Button>
										</Td>
									</Tr>
								)
							})}
						</Tbody>
					</Table>
				</TableContainer>

				{totalPages > 1 && (
					<Flex justify="center" align="center" gap={2} mt={3} flexWrap="wrap">
						<Button
							size="sm"
							bg="#2A2A2A" color="white" border="1px solid #444"
							_hover={{ bg: '#3A3A3A' }}
							_disabled={{ opacity: 0.4, cursor: 'not-allowed' }}
							isDisabled={page <= 1}
							onClick={() => setPage(p => p - 1)}
						>
							&lt; Prev
						</Button>
						{Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
							<Button
								key={p}
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
							onClick={() => setPage(p => p + 1)}
						>
							Next &gt;
						</Button>
					</Flex>
				)}
			</Box>
			)}

			{/* Guest Detail Modal */}
			<Modal isOpen={!!selectedGuest} onClose={() => setSelectedGuest(null)} isCentered size="2xl">
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
													<Text fontSize="sm" color="white">{formatAnswer(q.id, selectedGuest.booking)}</Text>
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
			<TableContainer>
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
									<Td key={q.id} color="white" whiteSpace="normal" maxW="260px">{formatAnswer(q.id, booking)}</Td>
								))}
							</Tr>
						))}
					</Tbody>
				</Table>
			</TableContainer>

			{totalPages > 1 && (
				<Flex justify="center" align="center" gap={2} mt={3} flexWrap="wrap">
					<Button
						size="sm"
						bg="#2A2A2A" color="white" border="1px solid #444"
						_hover={{ bg: '#3A3A3A' }}
						_disabled={{ opacity: 0.4, cursor: 'not-allowed' }}
						isDisabled={page <= 1}
						onClick={() => setPage(p => p - 1)}
					>
						&lt; Prev
					</Button>
					{Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
						<Button
							key={p}
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
		<Modal isOpen={inviteGuestsModal} onClose={() => setInviteGuestsModal(false)} isCentered size={inviteMode === "email" && step === 2 ? "4xl" : "2xl"}>
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

function ShareModal({ shareModal, setShareModal, eventSlug }: { shareModal: boolean; setShareModal: (shareModal: boolean) => void; eventSlug: string }) {
	const [copied, setCopied] = useState(false)

	const sharelink = `${process.env.NEXT_PUBLIC_URL}/${eventSlug}`

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

	const event = await Events.findOne({ _id: eventId, isDeleted: false })
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

	return {
		props: {
			event: JSON.stringify(event),
			isAuthorized: true,
		},
	}
}

function DailyViewsModal({ isOpen, onClose, dailyViews }: { isOpen: boolean; onClose: () => void; dailyViews: any[] }) {
	return (
		<Modal isOpen={isOpen} onClose={onClose} isCentered size="xl">
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

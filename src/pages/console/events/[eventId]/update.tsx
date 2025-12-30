import React from "react"
import Head from "next/head"
import {
	Box,
	Button,
	Flex,
	FormControl,
	FormLabel,
	Input,
	Switch,
	Text,
	Textarea,
	InputGroup,
	InputLeftElement,
	useDisclosure,
	Grid,
	GridItem,
	IconButton,
	Image,
	Avatar,
	Spinner,
	Menu,
	MenuButton,
	MenuList,
	MenuItem,
} from "@chakra-ui/react"
import { Formik, Form, Field, FormikProps } from "formik"
import { GetServerSideProps } from "next"
import { useRouter } from "next/router"
import { z } from "zod"
import axios from "axios"
import ConsoleLayout from "@Jetzy/components/layout/ConsoleLayout"
import { CreateEventFormData, Pages, Roles } from "@/types"
import { usePlacesWidget } from "react-google-autocomplete"
import { ChevronDownIcon } from "@chakra-ui/icons"
import { FiPlus, FiX, FiMapPin, FiCalendar, FiClock, FiDollarSign, FiSettings, FiEdit } from "react-icons/fi"
import TimePicker from "@/components/form/TimePicker"
import DatePicker from "@/components/form/DatePicker"
import RichTextEditor from "@/components/form/RichTextEditor"
import RichTextEditorTitle from "@/components/form/RichTextEditorTitle"
import { Error, Success } from "@/lib/_toaster"
import { UpdateEventThunk } from "@/redux/reducers/eventsSlice"
import { useAppDispatch } from "@/redux/stores"
import { TicketData } from "@/components/events/TicketCard"
import { FileUploadData } from "@Jetzy/components/misc/DragAndDropUploader"
import { useEdgeStore } from "@Jetzy/lib/edgestore"
import { uniqueId } from "@/lib/utils"
import TimezoneSelect from "../../../../components/timezone-select"
import { useSession } from "next-auth/react"
import { IEvent } from "@/models/events/types"
import { EmailProps } from "@/actions/send-update-email-to-users.action"
import { Events } from "@/models/events"
import { Types } from "mongoose"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import CollapsibleSection from "@/components/events/CollapsibleSection"
import PrivacySelector from "@/components/events/PrivacySelector"
import { useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

type Props = {
	event: string
}

const updateEventSchema = z.object({
	name: z.string().min(1, "Event name is required"),
	location: z.string().optional(),
	desc: z.string().min(1, "Description is required"),
	startDate: z.string().min(1, "Start date is required"),
	startTime: z.string().min(1, "Start time is required"),
	endDate: z.string().min(1, "End date is required"),
	endTime: z.string().min(1, "End time is required"),
})

export default function UpdateEventPage({ event }: Props) {
	const eventDetails = React.useMemo(() => JSON.parse(event) as IEvent, [event])

	const dispatcher = useAppDispatch()
	const navigation = useRouter()
	const { edgestore } = useEdgeStore()
	const { data: session } = useSession()
	const router = useRouter()

	const formikRef = React.useRef<FormikProps<CreateEventFormData>>(null)

	const [uploadedImages, setUploadedImages] = React.useState<FileUploadData[]>([])
	const [uploadProgress, setUploadProgress] = React.useState(0)
	const [isUploading, setIsUploading] = React.useState(false)
	const [isSubmitting, setIsSubmitting] = React.useState(false)
	const [mainImageIndex, setMainImageIndex] = React.useState(0)

	// Ticket state (inline management)
	const [tempTicket, setTempTicket] = React.useState<TicketData>({
		id: "",
		title: "",
		description: "",
		price: 0,
		disabled: false,
	})
	const [tickets, setTickets] = React.useState<TicketData[]>([])
	const [hostImageUploading, setHostImageUploading] = React.useState(false)

	// Guest invite state
	const [invitedGuests, setInvitedGuests] = React.useState<string[]>([])
	const [guestEmail, setGuestEmail] = React.useState("")

	// --- Initialize images and tickets on mount ---
	React.useEffect(() => {
		if (eventDetails.images && eventDetails.images.length > 0) {
			const newUploadedImages: FileUploadData[] = eventDetails.images.map((img) => ({
				id: uniqueId(10),
				file: img,
			}))
			setUploadedImages(newUploadedImages)
		}

		// Handle tickets
		if (eventDetails.tickets && eventDetails.tickets.length > 0) {
			const newTickets: TicketData[] = eventDetails.tickets.map((ticket) => ({
				id: ticket._id?.toString() || uniqueId(10),
				title: ticket.name,
				price: Number(ticket.price),
				description: ticket.desc,
				disabled: ticket.disabled || false,
				dueDate: ticket.dueDate ? new Date(ticket.dueDate).toISOString().slice(0, 16) : "", // Format for datetime-local
				quantityLimit: ticket.quantityLimit,
				quantitySold: ticket.quantitySold || 0,
			}))
			setTickets(newTickets)
			// Set initial tickets in Formik state
			if (formikRef.current) {
				formikRef.current.setFieldValue("tickets", newTickets)
			}
		}
	}, [eventDetails])

	// --- Initial form values ---
	const initialValues: CreateEventFormData = {
		name: eventDetails.name,
		desc: eventDetails.desc,
		location: eventDetails.location,
		capacity: eventDetails.capacity,
		requireApproval: eventDetails.requireApproval,
		isPaid: eventDetails.isPaid,
		images: uploadedImages,
		tickets: tickets,
		privacy: eventDetails.privacy,
		interestCategory: eventDetails.interestCategory || "",
		interestSubCategory: eventDetails.interestSubCategory || "",
		startDate: dayjs(eventDetails.startsOn).tz(eventDetails.timezone?.split(") ")[1] || 'UTC').format('YYYY-MM-DD'),
		startTime: dayjs(eventDetails.startsOn).tz(eventDetails.timezone?.split(") ")[1] || 'UTC').format('HH:mm'),
		endDate: dayjs(eventDetails.endsOn).tz(eventDetails.timezone?.split(") ")[1] || 'UTC').format('YYYY-MM-DD'),
		endTime: dayjs(eventDetails.endsOn).tz(eventDetails.timezone?.split(") ")[1] || 'UTC').format('HH:mm'),
		timezone: eventDetails?.timezone || "",
		showParticipants: eventDetails.showParticipants || false,
	}

	// Fetch interest categories from API
	const { data: categoriesData } = useQuery({
		queryKey: ["interest-categories"],
		queryFn: async () => {
			const response = await axios.get("/api/interest-categories/list")
			return response.data?.data || []
		},
	})

	const categories = categoriesData || []

	const { ref } = usePlacesWidget({
		apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
		onPlaceSelected: (place) => {
			if (formikRef.current) {
				// Save venue name (establishment name) separately from address
				const venueName = place.name || ""
				const address = place.formatted_address || ""

				formikRef.current?.setFieldValue("venueName", venueName)
				formikRef.current?.setFieldValue("location", address)

				// Get the geometry location coordinates
				const lat = place.geometry.location.lat()
				const lng = place.geometry.location.lng()

				// Get the place id
				const placeId = place.place_id

				// set the location coordinates and place id
				formikRef.current?.setFieldValue("latitude", lat)
				formikRef.current?.setFieldValue("longitude", lng)
				formikRef.current?.setFieldValue("placeId", placeId)
			}
		},
		options: {
			fields: ["formatted_address", "geometry", "place_id", "name", "address_components"],
			types: ["geocode", "establishment"], // Improved: includes addresses and places for better matching
		},
	})

	const sendEventUpdate = (eventData: EmailProps) => {
		return axios
			.post("/api/send-update-event-email", eventData)
			.then((response) => response.data)
			.catch((error) => {
				console.error("Error calling update event API:", error)
				throw error
			})
	}

	const onSubmit = async (values: CreateEventFormData) => {
		const validation = updateEventSchema.safeParse(values)

		if (!validation.success) {
			const firstError = Object.values(validation.error.flatten().fieldErrors)[0]?.[0]
			Error("Validation Error", firstError || "Please fix the form errors")
			return
		}

		// Images are now optional
		// if (uploadedImages.length === 0) {
		// 	Error("Validation Error", "Please add at least one image")
		// 	return
		// }

		values.images = uploadedImages
		values.tickets = tickets

		if (values.tickets.length > 0) values.isPaid = true
		else values.isPaid = false

		// Clean up host object - if all fields are empty, set to undefined
		if (values.host && (!values.host.name?.trim() && !values.host.email?.trim() && !values.host.phone?.trim() && !values.host.image?.trim())) {
			values.host = undefined
		}

		setIsSubmitting(true)

		const nameChanged = values.name !== eventDetails.name
		const locationChanged = values.location !== eventDetails.location
		const startDateChanged = values.startDate !== new Date(eventDetails.startsOn).toISOString().slice(0, 10)
		const startTimeChanged = values.startTime !== new Date(eventDetails.startsOn).toTimeString().slice(0, 5)
		const endDateChanged = values.endDate !== new Date(eventDetails.endsOn).toISOString().slice(0, 10)
		const endTimeChanged = values.endTime !== new Date(eventDetails.endsOn).toTimeString().slice(0, 5)

		const dateTimeChanged = startDateChanged || startTimeChanged || endDateChanged || endTimeChanged

		// Fetch bookings logic (commented out in original, preserved here just in case)

		dispatcher(UpdateEventThunk({ data: { payload: JSON.stringify({ ...values, privacy: values.privacy }) }, id: eventDetails._id.toString() }))
			.then((res: any) => {
				if (res?.payload?.status) {
					Success("Success", "Event updated successfully!")
					navigation.push(`/console/events`)
				} else {
					Error("Error", res?.payload?.message || "Failed to update event")
				}
			})
			.finally(() => {
				setIsSubmitting(false)
			})
	}

	const handleStartDateChange = (date?: string, time?: string) => {
		if (formikRef?.current) {
			if (date) {
				formikRef.current.setFieldValue("startDate", date)
			}

			if (time) {
				formikRef.current.setFieldValue("startTime", time)
			}
		}
	}

	const handleEndDateChange = (date?: string, time?: string) => {
		if (formikRef?.current) {
			if (date) {
				formikRef.current.setFieldValue("endDate", date)
			}

			if (time) {
				formikRef.current.setFieldValue("endTime", time)
			}
		}
	}

	const handleImageUpload = async (files: FileList | null) => {
		if (!files || files.length === 0 || isUploading) return // Prevent multiple uploads at once

		setIsUploading(true)
		setUploadProgress(0)

		try {
			// Process each file selected
			for (let i = 0; i < files.length; i++) {
				const file = files[i]

				// Upload the current file
				const res = await edgestore.publicFiles.upload({
					file,
					onProgressChange: (progress) => {
						setUploadProgress(progress)
					},
				})

				// Add the new image data to the array
				setUploadedImages((prevImages) => [...prevImages, { id: uniqueId(10), file: res.url }])
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
			await edgestore.publicFiles.delete({ url: imageUrl })
			setUploadedImages((prevImages) => prevImages.filter((img) => img.file !== imageUrl))
		} catch (error: any) {
			console.error("Error deleting image", error)
			Error("Error", "Failed to delete image")
		}
	}

	const handleAddTicket = () => {
		if (!tempTicket.title) {
			Error("Validation Error", "Please enter a ticket name")
			return
		}
		// Ticket description is now optional
		if (tempTicket.price < 0) {
			Error("Validation Error", "Price cannot be negative")
			return
		}
		if (editTicketIndex !== null) {
			handleUpdateTicket()
		} else {
			setTickets([...tickets, { ...tempTicket, id: uniqueId(10), disabled: false }])
			setTempTicket({ id: "", title: "", description: "", price: 0, disabled: false, dueDate: "", quantityLimit: undefined })
		}
	}

	const handleToggleTicketDisabled = (ticketId: string) => {
		setTickets(tickets.map((t) => (t.id === ticketId ? { ...t, disabled: !t.disabled } : t)))
	}

	const handleRemoveTicket = (ticketId: string) => {
		setTickets(tickets.filter((t) => t.id !== ticketId))
	}

	const [editTicketIndex, setEditTicketIndex] = React.useState<number | null>(null)

	const handleEditTicket = (ticketId: string) => {
		const index = tickets.findIndex((t) => t.id === ticketId)
		if (index !== -1) {
			setTempTicket({ ...tickets[index] })
			setEditTicketIndex(index)
		}
	}

	const handleUpdateTicket = () => {
		if (!tempTicket.title) {
			Error("Validation Error", "Please enter a ticket name")
			return
		}
		if (tempTicket.price < 0) {
			Error("Validation Error", "Price cannot be negative")
			return
		}
		if (editTicketIndex !== null) {
			const updatedTickets = [...tickets]
			updatedTickets[editTicketIndex] = { ...tempTicket }
			setTickets(updatedTickets)
			setEditTicketIndex(null)
			setTempTicket({ id: "", title: "", description: "", price: 0, disabled: false, dueDate: "", quantityLimit: undefined })
		}
	}

	const handleCancelEdit = () => {
		setEditTicketIndex(null)
		setTempTicket({ id: "", title: "", description: "", price: 0, disabled: false, dueDate: "", quantityLimit: undefined })
	}

	// Access control is handled server-side in getServerSideProps

	return (
		<>
			<Head>
				<title>Edit {eventDetails.name} - Jetzy Events</title>
				<meta name="description" content={`Update details for ${eventDetails.name}`} />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout page={Pages.UpdateEvent} backBtn={`/console/events/${eventDetails._id}/manage`} maxW="max-w-4xl">
				<Box bg="#FFFFFF" borderRadius="xl" boxShadow="sm" border="1px" borderColor="#E5E7EB" overflow="hidden">
					<Formik initialValues={initialValues as CreateEventFormData} onSubmit={onSubmit} innerRef={formikRef} enableReinitialize={true}>
						{({ values, setFieldValue }) => (
							<Form>
								<Box>
									{/* Image Upload Area */}
									<Box
										position="relative"
										h="300px"
										bg="#F3F4F6"
										borderBottom="1px"
										borderColor="#E5E7EB"
										cursor="pointer"
										_hover={{ bg: "#E5E7EB" }}
										onClick={() => document.getElementById("image-upload-input")?.click()}
									>
										{uploadedImages.length > 0 ? (
											<>
												<Image
													src={uploadedImages[mainImageIndex]?.file || uploadedImages[0]?.file}
													alt="Event"
													w="100%"
													h="100%"
													objectFit="cover"
												/>
												{isUploading && (
													<Flex
														position="absolute"
														top="0"
														left="0"
														w="100%"
														h="100%"
														bg="rgba(0,0,0,0.5)"
														alignItems="center"
														justifyContent="center"
														flexDirection="column"
														gap={2}
														zIndex={2}
													>
														<Spinner size="xl" color="white" thickness="4px" />
														<Text color="white" fontWeight="600">{Math.round(uploadProgress)}%</Text>
													</Flex>
												)}
											</>
										) : (
											<Flex h="100%" alignItems="center" justifyContent="center" flexDirection="column" gap={2}>
												{isUploading ? (
													<>
														<Spinner size="xl" color="#8B5CF6" thickness="4px" />
														<Text color="#6B7280" fontWeight="600" mt={2}>{Math.round(uploadProgress)}%</Text>
													</>
												) : (
													<>
														<Text fontSize="40px">📸</Text>
														<Text fontSize="sm" color="#6B7280">
															Add photo
														</Text>
													</>
												)}
											</Flex>
										)}
										<Button
											position="absolute"
											bottom={4}
											right={4}
											size="sm"
											bg="rgba(255,255,255,0.9)"
											color="#1F2937"
											leftIcon={<FiPlus />}
											_hover={{ bg: "white" }}
											onClick={(e) => {
												e.stopPropagation()
												document.getElementById("image-upload-input")?.click()
											}}
										>
											Add
										</Button>
										<input
											id="image-upload-input"
											type="file"
											accept="image/*"
											multiple
											style={{ display: "none" }}
											onChange={(e) => handleImageUpload(e.target.files)}
										/>
									</Box>

									{/* Uploaded Images Preview */}
									{uploadedImages.length > 1 && (
										<Flex gap={2} p={3} overflowX="auto" borderBottom="1px" borderColor="#E5E7EB">
											{uploadedImages.map((img, idx) => (
												<Box key={img.id} position="relative" flexShrink={0}>
													<Image
														src={img.file}
														alt=""
														w="60px"
														h="60px"
														objectFit="cover"
														borderRadius="md"
														border={idx === mainImageIndex ? "2px solid" : "1px solid"}
														borderColor={idx === mainImageIndex ? "#8B5CF6" : "#E5E7EB"}
														cursor="pointer"
														onClick={() => setMainImageIndex(idx)}
													/>
													<IconButton
														aria-label="Delete"
														icon={<FiX />}
														size="xs"
														position="absolute"
														top="-6px"
														right="-6px"
														borderRadius="full"
														colorScheme="red"
														onClick={(e) => {
															e.stopPropagation()
															handleImageDelete(img.file)
														}}
													/>
												</Box>
											))}
										</Flex>
									)}

									<Box p={{ base: 6, md: 8 }}>
										{/* Host Profile Section */}
										<Flex alignItems="center" gap={3} mb={6} pb={4} borderBottom="1px" borderColor="#E5E7EB">
											<Avatar size="md" name={session?.user?.name || session?.user?.email || "Host"} />
											<Box flex={1}>
												<Text fontSize="16px" fontWeight="600" color="#1F2937">
													{session?.user?.name || session?.user?.email || "Your Name"}
												</Text>
												<Text fontSize="14px" color="#6B7280">
													Host — Your profile
												</Text>
											</Box>
										</Flex>

										{/* Event Name */}
										<Box mb={6}>
											<RichTextEditorTitle
												value={values.name || ""}
												onChange={(value) => setFieldValue("name", value)}
												placeholder="Event name"
												borderBottom="2px solid #E5E7EB"
												sx={{
													"& .ql-editor": {
														fontSize: "24px",
														fontWeight: "600",
													},
													"&:hover .ql-container": {
														borderBottomColor: "#D1D5DB",
													},
													"& .ql-container.ql-snow": {
														borderBottomColor: values.name ? "#8B5CF6" : "#E5E7EB",
													},
												}}
											/>
										</Box>

										{/* Date & Time */}
										<Box mb={6}>
											<Grid templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }} gap={3} mb={3}>
												<GridItem>
													<Box
														border="1px"
														borderColor="#E5E7EB"
														borderRadius="lg"
														p={3}
														_hover={{ borderColor: "#B0B0B0", bg: "#FAFAFA", boxShadow: "sm" }}
														transition="all 0.2s"
														cursor="pointer"
													>
														<Flex alignItems="center" gap={2}>
															<FiCalendar color="#6B7280" size={18} />
															<Box flex={1}>
																<Text fontSize="11px" fontWeight="600" color="#6B7280" mb={1}>
																	Start date
																</Text>
																<DatePicker
																	onChange={(date) => handleStartDateChange(date)}
																	placeholder="Date"
																	defaultDate={values.startDate}
																/>
															</Box>
														</Flex>
													</Box>
												</GridItem>
												<GridItem>
													<Box
														border="1px"
														borderColor="#E5E7EB"
														borderRadius="lg"
														p={3}
														_hover={{ borderColor: "#B0B0B0", bg: "#FAFAFA", boxShadow: "sm" }}
														transition="all 0.2s"
														cursor="pointer"
													>
														<Flex alignItems="center" gap={2}>
															<FiClock color="#6B7280" size={18} />
															<Box flex={1}>
																<Text fontSize="11px" fontWeight="600" color="#6B7280" mb={1}>
																	Start time
																</Text>
																<TimePicker
																	onChange={(time) => handleStartDateChange(undefined, time)}
																	placeholder="Time"
																	defaultValue={values.startTime}
																/>
															</Box>
														</Flex>
													</Box>
												</GridItem>
												<GridItem>
													<Box
														border="1px"
														borderColor="#E5E7EB"
														borderRadius="lg"
														p={3}
														_hover={{ borderColor: "#B0B0B0", bg: "#FAFAFA", boxShadow: "sm" }}
														transition="all 0.2s"
														cursor="pointer"
													>
														<Text fontSize="11px" fontWeight="600" color="#6B7280" mb={2}>
															Time zone
														</Text>
														<TimezoneSelect />
													</Box>
												</GridItem>
											</Grid>

											<Grid templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }} gap={3}>
												<GridItem>
													<Box
														border="1px"
														borderColor="#E5E7EB"
														borderRadius="lg"
														p={3}
														_hover={{ borderColor: "#B0B0B0", bg: "#FAFAFA", boxShadow: "sm" }}
														transition="all 0.2s"
														cursor="pointer"
													>
														<Flex alignItems="center" gap={2}>
															<FiCalendar color="#6B7280" size={18} />
															<Box flex={1}>
																<Text fontSize="11px" fontWeight="600" color="#6B7280" mb={1}>
																	End date
																</Text>
																<DatePicker
																	onChange={(date) => handleEndDateChange(date)}
																	placeholder="Date"
																	defaultDate={values.endDate}
																/>
															</Box>
														</Flex>
													</Box>
												</GridItem>
												<GridItem>
													<Box
														border="1px"
														borderColor="#E5E7EB"
														borderRadius="lg"
														p={3}
														_hover={{ borderColor: "#B0B0B0", bg: "#FAFAFA", boxShadow: "sm" }}
														transition="all 0.2s"
														cursor="pointer"
													>
														<Flex alignItems="center" gap={2}>
															<FiClock color="#6B7280" size={18} />
															<Box flex={1}>
																<Text fontSize="11px" fontWeight="600" color="#6B7280" mb={1}>
																	End time
																</Text>
																<TimePicker
																	onChange={(time) => handleEndDateChange(undefined, time)}
																	placeholder="Time"
																	defaultValue={values.endTime}
																/>
															</Box>
														</Flex>
													</Box>
												</GridItem>
												<GridItem></GridItem>
											</Grid>
										</Box>

										{/* Privacy Selector */}
										<Box mb={6}>
											<PrivacySelector
												value={values.privacy as "public" | "private"}
												onChange={(val) => setFieldValue("privacy", val)}
											/>
										</Box>

										{/* Interest Category Selector */}
										<Box mb={6}>
											<Text fontSize="13px" fontWeight="500" color="#1F2937" mb={2}>
												Interest Category
											</Text>
											<Menu>
												<MenuButton
													as={Box}
													cursor="pointer"
													border="1px"
													borderColor="#E5E7EB"
													borderRadius="lg"
													px={4}
													py={3}
													bg="#FFFFFF"
													_hover={{ borderColor: "#B0B0B0", bg: "#FAFAFA", boxShadow: "sm" }}
													transition="all 0.2s"
												>
													<Flex alignItems="center" justifyContent="space-between">
														<Text fontSize="15px" fontWeight="500" color={values.interestCategory ? "#1F2937" : "#9CA3AF"}>
															{values.interestCategory || "Select category (optional)"}
														</Text>
														<ChevronDownIcon w={5} h={5} color="#6B7280" />
													</Flex>
												</MenuButton>
												<MenuList bg="#FFFFFF" border="1px" borderColor="#E5E7EB" borderRadius="lg" boxShadow="lg" maxH="300px" overflowY="auto">
													<MenuItem
														onClick={() => {
															setFieldValue("interestCategory", "")
															setFieldValue("interestSubCategory", "")
														}}
														_hover={{ bg: "#F3F4F6" }}
														bg={!values.interestCategory ? "#F3F4F6" : "transparent"}
													>
														<Text fontSize="14px" color="#1F2937">None</Text>
													</MenuItem>
													{categories.map((category: any) => (
														<MenuItem
															key={category._id}
															onClick={() => {
																setFieldValue("interestCategory", category.name)
																setFieldValue("interestSubCategory", "")
															}}
															_hover={{ bg: "#F3F4F6" }}
															bg={values.interestCategory === category.name ? "#F3F4F6" : "transparent"}
														>
															<Text fontSize="14px" color="#1F2937">{category.name}</Text>
														</MenuItem>
													))}
												</MenuList>
											</Menu>
										</Box>

										{/* Interest SubCategory Selector */}
										{(() => {
											const selectedCategory = categories.find((cat: any) => cat.name === values.interestCategory)
											const subcategories = selectedCategory?.subcategories || []
											if (selectedCategory && subcategories.length > 0) {
												return (
													<Box mb={6}>
														<Text fontSize="13px" fontWeight="500" color="#1F2937" mb={2}>
															Interest SubCategory
														</Text>
														<Menu>
															<MenuButton
																as={Box}
																cursor="pointer"
																border="1px"
																borderColor="#E5E7EB"
																borderRadius="lg"
																px={4}
																py={3}
																bg="#FFFFFF"
																_hover={{ borderColor: "#B0B0B0", bg: "#FAFAFA", boxShadow: "sm" }}
																transition="all 0.2s"
															>
																<Flex alignItems="center" justifyContent="space-between">
																	<Text fontSize="15px" fontWeight="500" color={values.interestSubCategory ? "#1F2937" : "#9CA3AF"}>
																		{values.interestSubCategory || "Select subcategory (optional)"}
																	</Text>
																	<ChevronDownIcon w={5} h={5} color="#6B7280" />
																</Flex>
															</MenuButton>
															<MenuList bg="#FFFFFF" border="1px" borderColor="#E5E7EB" borderRadius="lg" boxShadow="lg" maxH="300px" overflowY="auto">
																<MenuItem
																	onClick={() => setFieldValue("interestSubCategory", "")}
																	_hover={{ bg: "#F3F4F6" }}
																	bg={!values.interestSubCategory ? "#F3F4F6" : "transparent"}
																>
																	<Text fontSize="14px" color="#1F2937">None</Text>
																</MenuItem>
																{subcategories.map((subcategory: any) => (
																	<MenuItem
																		key={subcategory._id}
																		onClick={() => setFieldValue("interestSubCategory", subcategory.name)}
																		_hover={{ bg: "#F3F4F6" }}
																		bg={values.interestSubCategory === subcategory.name ? "#F3F4F6" : "transparent"}
																	>
																		<Text fontSize="14px" color="#1F2937">{subcategory.name}</Text>
																	</MenuItem>
																))}
															</MenuList>
														</Menu>
													</Box>
												)
											}
											return null
										})()}

										{/* Description */}
										<Box mb={6}>
											<RichTextEditor
												value={values.desc && values.desc !== "undefined" ? values.desc : ""}
												onChange={(value) => setFieldValue("desc", value)}
												placeholder="What are the details?"
											/>
										</Box>

										{/* Host Information */}
										<CollapsibleSection icon={<FiSettings size={20} />} title="Host Information (Optional)">
											<Box>
												<Text fontSize="13px" fontWeight="500" color="#1F2937" mb={2}>
													Host Name
												</Text>
												<Input
													placeholder="Enter host name"
													value={values.host?.name || ""}
													onChange={(e) => setFieldValue("host", { ...values.host, name: e.target.value })}
													border="1px"
													borderColor="#E5E7EB"
													mb={3}
													_hover={{ borderColor: "#D1D5DB" }}
													_focus={{ borderColor: "#8B5CF6", boxShadow: "none" }}
												/>

												<Text fontSize="13px" fontWeight="500" color="#1F2937" mb={2}>
													Host Email
												</Text>
												<Input
													type="email"
													placeholder="host@example.com"
													value={values.host?.email || ""}
													onChange={(e) => setFieldValue("host", { ...values.host, email: e.target.value })}
													border="1px"
													borderColor="#E5E7EB"
													mb={3}
													_hover={{ borderColor: "#D1D5DB" }}
													_focus={{ borderColor: "#8B5CF6", boxShadow: "none" }}
												/>

												<Text fontSize="13px" fontWeight="500" color="#1F2937" mb={2}>
													Host Phone
												</Text>
												<Input
													type="tel"
													placeholder="+1 (555) 123-4567"
													value={values.host?.phone || ""}
													onChange={(e) => setFieldValue("host", { ...values.host, phone: e.target.value })}
													border="1px"
													borderColor="#E5E7EB"
													mb={3}
													_hover={{ borderColor: "#D1D5DB" }}
													_focus={{ borderColor: "#8B5CF6", boxShadow: "none" }}
												/>

												<Text fontSize="13px" fontWeight="500" color="#1F2937" mb={2}>
													Host Image
												</Text>
												<Box mb={3}>
													{values.host?.image ? (
														<Box position="relative" mb={2}>
															<Image src={values.host.image} alt="Host" width={100} height={100} borderRadius="md" objectFit="cover" />
															<IconButton
																aria-label="Remove host image"
																icon={<FiX />}
																size="sm"
																position="absolute"
																top={-2}
																right={-2}
																bg="red.500"
																color="white"
																_hover={{ bg: "red.600" }}
																onClick={async () => {
																	if (values.host?.image) {
																		try {
																			await edgestore.publicFiles.delete({ url: values.host.image })
																		} catch (error) {
																			console.error("Error deleting host image:", error)
																		}
																	}
																	setFieldValue("host", { ...values.host, image: "" })
																}}
															/>
														</Box>
													) : (
														<Box
															border="2px dashed"
															borderColor="#D1D5DB"
															borderRadius="lg"
															p={4}
															textAlign="center"
															cursor="pointer"
															_hover={{ borderColor: "#8B5CF6", bg: "#F9FAFB" }}
															onClick={() => {
																const input = document.createElement("input")
																input.type = "file"
																input.accept = "image/*"
																input.onchange = async (e: any) => {
																	const file = e.target.files?.[0]
																	if (file) {
																		setHostImageUploading(true)
																		try {
																			const res = await edgestore.publicFiles.upload({ file })
																			setFieldValue("host", { ...values.host, image: res.url })
																		} catch (error) {
																			console.error("Error uploading host image:", error)
																			Error("Error", "Failed to upload host image")
																		} finally {
																			setHostImageUploading(false)
																		}
																	}
																}
																input.click()
															}}
														>
															{hostImageUploading ? (
																<Spinner size="md" />
															) : (
																<>
																	<FiPlus size={24} color="#9CA3AF" style={{ margin: "0 auto 8px" }} />
																	<Text fontSize="13px" color="#9CA3AF">Click to upload host image</Text>
																</>
															)}
														</Box>
													)}
												</Box>
											</Box>
										</CollapsibleSection>

										{/* Collapsible Sections */}
										<CollapsibleSection icon={<FiMapPin size={20} />} title="Event location" defaultOpen={true}>
											<Box>
												<Text fontSize="13px" fontWeight="500" color="#1F2937" mb={2}>
													Event Location
												</Text>
												<InputGroup>
													<InputLeftElement pointerEvents="none" color="#9CA3AF">
														<FiMapPin size={18} />
													</InputLeftElement>
													<Input
														ref={ref as any}
														id="location"
														name="location"
														placeholder="Search for a place or address"
														defaultValue={values.location}
														border="1px"
														borderColor="#E5E7EB"
														pl="40px"
														autoComplete="off"
														_hover={{ borderColor: "#D1D5DB" }}
														_focus={{ borderColor: "#8B5CF6", boxShadow: "none" }}
													/>
												</InputGroup>
											</Box>
										</CollapsibleSection>

										<CollapsibleSection icon={<FiDollarSign size={20} />} title="Tickets">
											<Box>
												{tickets.map((ticket) => (
													<Flex
														key={ticket.id}
														bg={ticket.disabled ? "#FEF2F2" : "#F9FAFB"}
														p={3}
														borderRadius="md"
														mb={2}
														alignItems="center"
														justifyContent="space-between"
														border={ticket.disabled ? "1px" : "none"}
														borderColor={ticket.disabled ? "#FCA5A5" : "transparent"}
													>
														<Box flex={1}>
															<Flex alignItems="center" gap={2} mb={1}>
																<Text fontSize="14px" fontWeight="600" color={ticket.disabled ? "#DC2626" : "#1F2937"}>
																	{ticket.title}
																</Text>
																{ticket.disabled && (
																	<Text fontSize="11px" color="#DC2626" fontWeight="600" bg="#FEE2E2" px={2} py={0.5} borderRadius="md">
																		DISABLED
																	</Text>
																)}
																{ticket.quantityLimit && (
																	<Text fontSize="11px" color="#6B7280" bg="#F3F4F6" px={2} py={0.5} borderRadius="md">
																		{ticket.quantitySold || 0} / {ticket.quantityLimit} sold
																	</Text>
																)}
															</Flex>
															<Text fontSize="13px" color="#6B7280">
																${ticket.price.toFixed(2)} - {ticket.description}
															</Text>
															{ticket.dueDate && (
																<Text fontSize="11px" color="#6B7280" mt={1}>
																	Sales end: {dayjs(ticket.dueDate).format('MMM D, YYYY h:mm A')}
																</Text>
															)}
														</Box>
														<Flex alignItems="center" gap={2}>
															<Box>
																<Text fontSize="11px" color="#6B7280" mb={1} textAlign="center">
																	{ticket.disabled ? "Disabled" : "Enabled"}
																</Text>
																<Switch
																	colorScheme="purple"
																	isChecked={!ticket.disabled}
																	onChange={() => handleToggleTicketDisabled(String(ticket.id))}
																	size="sm"
																	isDisabled={editTicketIndex === tickets.indexOf(ticket)}
																/>
															</Box>
															<IconButton
																aria-label="Edit"
																icon={<FiEdit />}
																size="sm"
																variant="ghost"
																colorScheme="blue"
																onClick={() => handleEditTicket(String(ticket.id))}
																isDisabled={editTicketIndex === tickets.indexOf(ticket)}
															/>
															<IconButton
																aria-label="Remove"
																icon={<FiX />}
																size="sm"
																variant="ghost"
																colorScheme="red"
																onClick={() => handleRemoveTicket(String(ticket.id))}
																isDisabled={editTicketIndex === tickets.indexOf(ticket)}
															/>
														</Flex>
													</Flex>
												))}
												<Box mt={3} p={4} border="1px" borderColor="#E5E7EB" borderRadius="md" bg="#FAFAFA">
													<Text fontSize="14px" fontWeight="600" color="#1F2937" mb={3}>
														{editTicketIndex !== null ? "Edit Ticket" : "Add Ticket"}
													</Text>
													<Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={3} mb={3}>
														<Box>
															<Text fontSize="12px" fontWeight="500" color="#1F2937" mb={1}>
																Ticket Name <Text as="span" color="red">*</Text>
															</Text>
															<Input
																placeholder="e.g., General Admission"
																size="sm"
																bg="white"
																value={tempTicket.title}
																onChange={(e) => setTempTicket({ ...tempTicket, title: e.target.value })}
															/>
														</Box>
														<Box>
															<Text fontSize="12px" fontWeight="500" color="#1F2937" mb={1}>
																Price (USD)
															</Text>
															<InputGroup size="sm">
																<InputLeftElement pointerEvents="none" color="#6B7280" fontSize="14px">
																	$
																</InputLeftElement>
																<Input
																	placeholder="0.00"
																	type="number"
																	step="0.01"
																	min="0"
																	bg="white"
																	value={tempTicket.price === 0 ? "" : tempTicket.price}
																	onChange={(e) => {
																		const val = e.target.value === "" ? 0 : parseFloat(e.target.value) || 0
																		setTempTicket({ ...tempTicket, price: val })
																	}}
																/>
															</InputGroup>
														</Box>
													</Grid>
													<Box mb={3}>
														<Text fontSize="12px" fontWeight="500" color="#1F2937" mb={1}>
															Description (Optional)
														</Text>
														<Input
															placeholder="e.g., Access to all event activities (optional)"
															size="sm"
															bg="white"
															value={tempTicket.description}
															onChange={(e) =>
																setTempTicket({ ...tempTicket, description: e.target.value })
															}
														/>
													</Box>
													<Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={3} mb={3}>
														<Box>
															<Text fontSize="12px" fontWeight="500" color="#1F2937" mb={1}>
																Sales End Date (Optional)
															</Text>
															<Input
																type="datetime-local"
																size="sm"
																bg="white"
																value={tempTicket.dueDate || ""}
																onChange={(e) => setTempTicket({ ...tempTicket, dueDate: e.target.value })}
															/>
														</Box>
														<Box>
															<Text fontSize="12px" fontWeight="500" color="#1F2937" mb={1}>
																Quantity Limit (Optional)
															</Text>
															<Input
																type="number"
																placeholder="Unlimited"
																size="sm"
																bg="white"
																value={tempTicket.quantityLimit || ""}
																onChange={(e) => setTempTicket({ ...tempTicket, quantityLimit: e.target.value ? parseInt(e.target.value) : undefined })}
															/>
														</Box>
													</Grid>
													<Flex gap={2}>
														<Button
															size="sm"
															flex={1}
															bg="#8B5CF6"
															color="white"
															_hover={{ bg: "#7C3AED" }}
															onClick={handleAddTicket}
															isDisabled={!tempTicket.title}
														>
															{editTicketIndex !== null ? "Update Ticket" : "Add Ticket"}
														</Button>
														{editTicketIndex !== null && (
															<Button
																size="sm"
																flex={1}
																bg="gray.400"
																color="white"
																_hover={{ bg: "gray.500" }}
																onClick={handleCancelEdit}
															>
																Cancel
															</Button>
														)}
													</Flex>
												</Box>
											</Box>
										</CollapsibleSection>

										<CollapsibleSection icon={<FiPlus size={20} />} title="Invite guests">
											<Box>
												<Text fontSize="13px" color="#6B7280" mb={2}>
													Send event invitations to guests via email
												</Text>
												<Flex gap={2} mb={3}>
													<Input
														placeholder="Enter email address"
														type="email"
														size="sm"
														value={guestEmail}
														onChange={(e) => setGuestEmail(e.target.value)}
														onKeyPress={(e) => {
															if (e.key === "Enter" && guestEmail && guestEmail.includes("@")) {
																e.preventDefault()
																setInvitedGuests([...invitedGuests, guestEmail])
																setGuestEmail("")
															}
														}}
													/>
													<Button
														size="sm"
														bg="#8B5CF6"
														color="white"
														_hover={{ bg: "#7C3AED" }}
														isDisabled={!guestEmail || !guestEmail.includes("@")}
														onClick={() => {
															if (guestEmail && guestEmail.includes("@")) {
																setInvitedGuests([...invitedGuests, guestEmail])
																setGuestEmail("")
															}
														}}
													>
														Add
													</Button>
												</Flex>
												{invitedGuests.length > 0 && (
													<Box>
														<Text fontSize="13px" fontWeight="500" color="#1F2937" mb={2}>
															Invited ({invitedGuests.length})
														</Text>
														<Box maxH="150px" overflowY="auto">
															{invitedGuests.map((email, index) => (
																<Flex
																	key={index}
																	bg="#F9FAFB"
																	p={2}
																	borderRadius="md"
																	mb={1}
																	alignItems="center"
																	justifyContent="space-between"
																>
																	<Text fontSize="13px" color="#1F2937">
																		{email}
																	</Text>
																	<IconButton
																		aria-label="Remove"
																		icon={<FiX />}
																		size="xs"
																		variant="ghost"
																		colorScheme="red"
																		onClick={() =>
																			setInvitedGuests(invitedGuests.filter((_, i) => i !== index))
																		}
																	/>
																</Flex>
															))}
														</Box>
													</Box>
												)}
											</Box>
										</CollapsibleSection>

										<CollapsibleSection icon={<FiSettings size={20} />} title="Additional settings" borderBottom={false}>
											<Box>
												<Text fontSize="13px" fontWeight="500" color="#1F2937" mb={1}>
													Event Capacity
												</Text>
												<Text fontSize="12px" color="#6B7280" mb={2}>
													Set to 0 for unlimited capacity
												</Text>
												<Input
													placeholder="Enter number (0 for unlimited)"
													type="number"
													size="sm"
													mb={4}
													min="0"
													value={values.capacity}
													onChange={(e) => setFieldValue("capacity", parseInt(e.target.value) || 0)}
												/>
												<Flex
													alignItems="center"
													justifyContent="space-between"
													p={3}
													bg="#F9FAFB"
													borderRadius="md"
												>
													<Box>
														<Text fontSize="14px" fontWeight="500" color="#1F2937">
															Require approval
														</Text>
														<Text fontSize="12px" color="#6B7280" mt={0.5}>
															Manually approve each guest
														</Text>
													</Box>
													<Switch
														colorScheme="purple"
														isChecked={values.requireApproval}
														onChange={(e) => setFieldValue("requireApproval", e.target.checked)}
													/>
												</Flex>
											</Box>
										</CollapsibleSection>
									</Box>

									{/* Bottom Action Bar */}
									<Box p={6} borderTop="1px" borderColor="#E5E7EB" bg="#F9FAFB">
										<Button
											type="submit"
											w="full"
											bg="#8B5CF6"
											color="white"
											size="lg"
											fontSize="16px"
											fontWeight="700"
											_hover={isSubmitting || isUploading ? {} : { bg: "#7C3AED", transform: "translateY(-1px)", boxShadow: "md" }}
											_active={isSubmitting || isUploading ? {} : { transform: "translateY(0)", boxShadow: "sm" }}
											isLoading={isSubmitting || isUploading}
											isDisabled={isSubmitting || isUploading}
											loadingText="Updating Event..."
											spinnerPlacement="start"
											transition="all 0.2s"
											opacity={isSubmitting || isUploading ? 0.8 : 1}
										>
											Update Event
										</Button>
									</Box>
								</Box>
							</Form>
						)}
					</Formik>
				</Box>
			</ConsoleLayout>

			{/* Full Screen Loading Overlay */}
			{isSubmitting && (
				<Box
					position="fixed"
					top={0}
					left={0}
					right={0}
					bottom={0}
					bg="rgba(0, 0, 0, 0.75)"
					backdropFilter="blur(8px)"
					zIndex={9999}
					display="flex"
					alignItems="center"
					justifyContent="center"
					animation="fadeIn 0.3s ease-in"
				>
					<Box textAlign="center">
						<Spinner
							thickness="4px"
							speed="0.65s"
							emptyColor="gray.200"
							color="#8B5CF6"
							size="xl"
							mb={4}
						/>
						<Text fontSize="2xl" fontWeight="700" color="white">
							Updating event...
						</Text>
					</Box>
				</Box>
			)}
		</>
	)
}

export const getServerSideProps: GetServerSideProps<any, { eventId: string }> = async (context) => {
	const { getServerSession } = await import("next-auth/next")
	const { authOptions } = await import("@/pages/api/auth/[...nextauth]")

	const session = await getServerSession(context.req, context.res, authOptions)

	if (!session) {
		return {
			redirect: {
				destination: "/login",
				permanent: false,
			},
		}
	}

	// Ensure database connection is ready
	const { dbconn } = await import("@/configs/database")
	if (dbconn.readyState !== 1) {
		await dbconn.asPromise()
	}

	const { eventId } = context.params as { eventId: string }

	// Fetch event from the database
	const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false })
	if (!event) {
		return {
			notFound: true,
		}
	}

	// Check permissions: Admin or Owner
	const user = session.user as any
	const isAdmin = user.role === "admin" || user.role === "super admin"
	const isOwner = event.ownerId?.toString() === user._id || event.host?.email === user.email

	if (!isAdmin && !isOwner) {
		return {
			redirect: {
				destination: "/console/seller",
				permanent: false,
			},
		}
	}

	return {
		props: {
			event: JSON.stringify(event.toJSON()),
		},
	}
}

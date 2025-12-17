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
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalCloseButton,
	ModalBody,
	ModalFooter,
	MenuList,
	MenuItem,
	Menu,
	MenuButton,
	IconButton,
	Select,
	Image,
} from "@chakra-ui/react"
import { Formik, Form, Field, FormikProps, FieldArray } from "formik"
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { CreateEventFormData, Pages, Roles } from "@/types"
import { usePlacesWidget } from "react-google-autocomplete"
import { DescriptionSVG, DotSVG, DottedLinesSVG, LocationSVG, LockSVG, MultipleUsersSVG, PlusSVG, TicketSVG, UserTickSVG, VerticalDotsSVG } from "@/assets/icons"
import TimePicker from "@/components/form/TimePicker"
import DatePicker from "@/components/form/DatePicker"
import { Error } from "@/lib/_toaster"
import { CreateEventThunk } from "@/redux/reducers/eventsSlice"
import { useAppDispatch } from "@/redux/stores"
import { useRouter } from "next/router"
import { TicketData } from "@/components/events/TicketCard"
import { FileUploadData } from "@/components/misc/DragAndDropUploader"
import { useEdgeStore } from "@/lib/edgestore"
import { uniqueId } from "@/lib/utils"
import ImageUploadBox from "../../../components/image-upload-box"
import TimezoneSelect from "../../../components/timezone-select"
import { useSession } from "next-auth/react"
import { z } from "zod"
import { GetServerSideProps } from "next"
import { adminOnly } from "@/lib/authSession"

const initialValues = {
	name: "",
	desc: "",
	startTime: "",
	startDate: "",
	endTime: "",
	endDate: "",
	location: "",
	requireApproval: false,
	tickets: [],
	images: [],
	timezone: "",
	capacity: 0,
	privacy: "public",
	interest: "",
	subInterest: "",
	host: {
		name: "",
		image: "",
		phone: "",
		email: "",
	},
}

// Available interests/categories
const INTERESTS = [
	"Dining",
	"Nightlife",
	"Lifestyle",
	"Travels",
	"Entertainment",
	"Activities",
]

const createEventSchema = z.object({
	name: z.string().min(1, "Event name is required"),
	location: z.string().min(1, "Location is required"),
	desc: z.string().min(1, "Description is required"),
	startDate: z.string().min(1, "Start date is required"),
	startTime: z.string().min(1, "Start time is required"),
	endDate: z.string().min(1, "End date is required"),
	endTime: z.string().min(1, "End time is required"),
})

const CreateEventPage = () => {
	const { isOpen, onOpen, onClose } = useDisclosure()
	const { isOpen: isInviteOpen, onOpen: onInviteOpen, onClose: onInviteClose } = useDisclosure()
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
	const [editIndex, setEditIndex] = React.useState<number | null>(null)
	const [tempTicket, setTempTicket] = React.useState<TicketData>({
		id: "",
		title: "",
		description: "",
		price: 0,
	})
	const [invitedGuests, setInvitedGuests] = React.useState<string[]>([])
	const [guestEmail, setGuestEmail] = React.useState("")

	const { ref } = usePlacesWidget({
		apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
		onPlaceSelected: (place) => {
			if (formikRef.current) {
				formikRef.current?.setFieldValue("location", place.formatted_address)
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
			types: ["establishment"],
		},
	})

	const onSubmit = (values: CreateEventFormData) => {
		const validation = createEventSchema.safeParse(values)

		if (!validation.success) {
			const firstError = Object.values(validation.error.flatten().fieldErrors)[0]?.[0]
			Error("Validation Error", firstError || "Please fix the form errors")
			return
		}

		if (values.tickets.length === 0) {
			values.tickets = [
				{
					id: uniqueId(10),
					title: "Free Ticket",
					price: 0,
					description: "This is a free ticket",
				},
			]
		}

		values.images = uploadedImages

		if (values.tickets.length > 0) values.isPaid = true
		else values.isPaid = false

		setIsSubmitting(true)

		dispatcher(CreateEventThunk({ data: { payload: JSON.stringify({ ...values, privacy: values.privacy }) } }))
			.then((res: any) => {
				if (res?.payload?.status) {
					navigation.push(`/console/events/${res.payload.data._id}/manage`)
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

	// @ts-ignore
	if (session?.user?.role === Roles.USER) router.push("/console")

	return (
		<>
			<Head>
				<title>Create Event - Jetzy Events</title>
				<meta name="description" content="Create and publish a new event on Jetzy. Add details, tickets, and reach your audience." />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout page={Pages.CreateEvent} backBtn="/console/events" maxW="max-w-3xl">
				<Formik initialValues={initialValues as CreateEventFormData} onSubmit={onSubmit} innerRef={formikRef}>
					{({ values, setFieldValue }) => (
						<Form>
							<Box maxW="700px" mx="auto" bg="#FFFFFF" borderRadius="xl" p={{ base: 6, md: 8 }} boxShadow="sm" border="1px" borderColor="#E5E7EB">
								{/* Event Name and Timezone */}
								<Box mb={6}>
									<FormControl mb={1}>
										<FormLabel fontSize="sm" fontWeight="600" color="#1F2937" mb={2}>
											Event Name
										</FormLabel>
										<Field
											as={Input}
											id="name"
											name="name"
											placeholder="Enter event name"
											size="lg"
											bg="#FFFFFF"
											border="1px"
											borderColor="#E5E7EB"
											color="#1F2937"
											fontSize="md"
											_hover={{ borderColor: "#D1D5DB" }}
											_focus={{ borderColor: "#8B5CF6", boxShadow: "0 0 0 1px #8B5CF6" }}
											_placeholder={{ color: "#9CA3AF" }}
											value={values?.name}
										/>
									</FormControl>
									<Box mt={4}>
										<FormLabel fontSize="sm" fontWeight="600" color="#1F2937" mb={2}>
											Time Zone
										</FormLabel>
										<TimezoneSelect />
									</Box>
								</Box>

								{/* Description */}
								<FormControl mb={6}>
									<FormLabel fontSize="sm" fontWeight="600" color="#1F2937" mb={2}>
										Description
									</FormLabel>
									<Field
										as={Textarea}
										name="desc"
										placeholder="Add description"
										bg="#FFFFFF"
										border="1px"
										borderColor="#E5E7EB"
										color="#1F2937"
										fontSize="md"
										rows={4}
										value={values.desc && values.desc !== "undefined" ? values.desc : ""}
										_hover={{ borderColor: "#D1D5DB" }}
										_focus={{ borderColor: "#8B5CF6", boxShadow: "0 0 0 1px #8B5CF6" }}
										_placeholder={{ color: "#9CA3AF" }}
									/>
								</FormControl>

								{/* Host Information */}
								<Box mb={6}>
									<FormLabel fontSize="sm" fontWeight="600" color="#1F2937" mb={3}>
										Host Information (Optional)
									</FormLabel>
									<Box bg="#F9FAFB" p={4} borderRadius="md" border="1px" borderColor="#E5E7EB">
										<FormControl mb={3}>
											<FormLabel fontSize="xs" color="#6B7280" mb={1}>
												Host Name
											</FormLabel>
											<Input
												placeholder="Enter host name"
												value={values.host?.name || ""}
												onChange={(e) => setFieldValue("host", { ...values.host, name: e.target.value })}
												bg="#FFFFFF"
												border="1px"
												borderColor="#E5E7EB"
												_hover={{ borderColor: "#D1D5DB" }}
												_focus={{ borderColor: "#8B5CF6", boxShadow: "0 0 0 1px #8B5CF6" }}
											/>
										</FormControl>
										<FormControl mb={3}>
											<FormLabel fontSize="xs" color="#6B7280" mb={1}>
												Host Email
											</FormLabel>
											<Input
												type="email"
												placeholder="host@example.com"
												value={values.host?.email || ""}
												onChange={(e) => setFieldValue("host", { ...values.host, email: e.target.value })}
												bg="#FFFFFF"
												border="1px"
												borderColor="#E5E7EB"
												_hover={{ borderColor: "#D1D5DB" }}
												_focus={{ borderColor: "#8B5CF6", boxShadow: "0 0 0 1px #8B5CF6" }}
											/>
										</FormControl>
										<FormControl mb={3}>
											<FormLabel fontSize="xs" color="#6B7280" mb={1}>
												Host Phone
											</FormLabel>
											<Input
												type="tel"
												placeholder="+1 (555) 123-4567"
												value={values.host?.phone || ""}
												onChange={(e) => setFieldValue("host", { ...values.host, phone: e.target.value })}
												bg="#FFFFFF"
												border="1px"
												borderColor="#E5E7EB"
												_hover={{ borderColor: "#D1D5DB" }}
												_focus={{ borderColor: "#8B5CF6", boxShadow: "0 0 0 1px #8B5CF6" }}
											/>
										</FormControl>
										<FormControl>
											<FormLabel fontSize="xs" color="#6B7280" mb={1}>
												Host Image URL
											</FormLabel>
											<Input
												placeholder="https://example.com/image.jpg"
												value={values.host?.image || ""}
												onChange={(e) => setFieldValue("host", { ...values.host, image: e.target.value })}
												bg="#FFFFFF"
												border="1px"
												borderColor="#E5E7EB"
												_hover={{ borderColor: "#D1D5DB" }}
												_focus={{ borderColor: "#8B5CF6", boxShadow: "0 0 0 1px #8B5CF6" }}
											/>
										</FormControl>
									</Box>
								</Box>

								{/* Date and Time */}
								<Box mb={6}>
									<FormLabel fontSize="sm" fontWeight="600" color="#1F2937" mb={3}>
										Date & Time
									</FormLabel>
									<Flex gap={4} direction={{ base: "column", sm: "row" }}>
										<Box flex="1">
											<Text fontSize="xs" color="#6B7280" mb={2}>
												Start Date
											</Text>
											<DatePicker onChange={(date) => handleStartDateChange(date)} placeholder="Start Date" />
										</Box>
										<Box flex="1">
											<Text fontSize="xs" color="#6B7280" mb={2}>
												Start Time
											</Text>
											<TimePicker onChange={(time) => handleStartDateChange(undefined, time)} placeholder="Start Time" />
										</Box>
									</Flex>
									<Flex gap={4} direction={{ base: "column", sm: "row" }} mt={3}>
										<Box flex="1">
											<Text fontSize="xs" color="#6B7280" mb={2}>
												End Date
											</Text>
											<DatePicker onChange={(date) => handleEndDateChange(date)} placeholder="End Date" />
										</Box>
										<Box flex="1">
											<Text fontSize="xs" color="#6B7280" mb={2}>
												End Time
											</Text>
											<TimePicker onChange={(time) => handleEndDateChange(undefined, time)} placeholder="End Time" />
										</Box>
									</Flex>
								</Box>

								{/* Location */}
								<FormControl mb={6}>
									<FormLabel fontSize="sm" fontWeight="600" color="#1F2937" mb={2}>
										Location
									</FormLabel>
									<InputGroup>
										<InputLeftElement pointerEvents="none" color="#9CA3AF">
											<LocationSVG />
										</InputLeftElement>
										<Field
											ref={ref}
											as={Input}
											id="location"
											name="location"
											placeholder="Choose location"
											bg="#FFFFFF"
											border="1px"
											borderColor="#E5E7EB"
											color="#1F2937"
											fontSize="md"
											pl="10"
											_hover={{ borderColor: "#D1D5DB" }}
											_focus={{ borderColor: "#8B5CF6", boxShadow: "0 0 0 1px #8B5CF6" }}
											_placeholder={{ color: "#9CA3AF" }}
										/>
									</InputGroup>
								</FormControl>

								{/* Invite Guests */}
								<Box mb={6}>
									<FormLabel fontSize="sm" fontWeight="600" color="#1F2937" mb={2}>
										Invite Guests
									</FormLabel>
									<Flex gap={2} alignItems="center" flexWrap="wrap">
										{/* Display invited guests */}
										{invitedGuests.map((email, index) => (
											<Box
												key={index}
												w="40px"
												h="40px"
												borderRadius="full"
												bg="#8B5CF6"
												border="2px"
												borderColor="#FFFFFF"
												display="flex"
												alignItems="center"
												justifyContent="center"
												position="relative"
												title={email}
											>
												<Text fontSize="xs" color="#FFFFFF" fontWeight="600">
													{email.charAt(0).toUpperCase()}
												</Text>
											</Box>
										))}
										{/* Placeholder avatar circles */}
										{invitedGuests.length < 5 &&
											Array.from({ length: Math.min(5 - invitedGuests.length, 5) }).map((_, i) => (
												<Box key={i} w="40px" h="40px" borderRadius="full" bg="#F9FAFB" border="2px" borderColor="#FFFFFF" display="flex" alignItems="center" justifyContent="center">
													<Text fontSize="xs" color="#9CA3AF">
														👤
													</Text>
												</Box>
											))}
										<Box
											w="40px"
											h="40px"
											borderRadius="full"
											bg="#FFFFFF"
											border="2px"
											borderColor="#E5E7EB"
											display="flex"
											alignItems="center"
											justifyContent="center"
											cursor="pointer"
											transition="all 0.2s"
											_hover={{ borderColor: "#8B5CF6", bg: "#F9FAFB" }}
											onClick={onInviteOpen}
										>
											<Text fontSize="lg" color="#8B5CF6" fontWeight="600">
												+
											</Text>
										</Box>
									</Flex>
								</Box>

								{/* Event Options */}
								<Box mb={6}>
									<FormLabel fontSize="sm" fontWeight="600" color="#1F2937" mb={3}>
										Event Options
									</FormLabel>
									<Flex gap={4} direction={{ base: "column", sm: "row" }} mb={3}>
										<Box flex="1">
											<Text fontSize="xs" color="#6B7280" mb={2}>
												Privacy
											</Text>
											<Field
												as={Select}
												name="privacy"
												bg="#FFFFFF"
												border="1px"
												borderColor="#E5E7EB"
												color="#1F2937"
												fontSize="sm"
												value={values?.privacy}
												_hover={{ borderColor: "#D1D5DB" }}
												_focus={{ borderColor: "#8B5CF6", boxShadow: "0 0 0 1px #8B5CF6" }}
											>
												<option value="private">Private</option>
												<option value="public">Public</option>
											</Field>
										</Box>
										<Box flex="1">
											<Text fontSize="xs" color="#6B7280" mb={2}>
												Interest / Category
											</Text>
											<Field
												as={Select}
												name="interest"
												bg="#FFFFFF"
												border="1px"
												borderColor="#E5E7EB"
												color="#1F2937"
												fontSize="sm"
												value={values?.interest || ""}
												_hover={{ borderColor: "#D1D5DB" }}
												_focus={{ borderColor: "#8B5CF6", boxShadow: "0 0 0 1px #8B5CF6" }}
											>
												<option value="">None (Optional)</option>
												{INTERESTS.map((interest) => (
													<option key={interest} value={interest}>{interest}</option>
												))}
											</Field>
										</Box>
										<Box flex="1">
											<Text fontSize="xs" color="#6B7280" mb={2}>
												Capacity
											</Text>
											<Field
												as={Input}
												name="capacity"
												type="number"
												min={0}
												value={values.capacity || 0}
												placeholder="Add capacity"
												bg="#FFFFFF"
												border="1px"
												borderColor="#E5E7EB"
												color="#1F2937"
												fontSize="sm"
												_hover={{ borderColor: "#D1D5DB" }}
												_focus={{ borderColor: "#8B5CF6", boxShadow: "0 0 0 1px #8B5CF6" }}
												_placeholder={{ color: "#9CA3AF" }}
											/>
										</Box>
									</Flex>
									<Flex alignItems="center" justifyContent="space-between" p={3} bg="#FFFFFF" borderRadius="md" border="1px" borderColor="#E5E7EB">
										<Text fontSize="sm" color="#1F2937">
											Require Approval
										</Text>
										<Switch name="requireApproval" isChecked={values.requireApproval} colorScheme="purple" onChange={() => setFieldValue("requireApproval", !values.requireApproval)} />
									</Flex>
								</Box>

								{/* Tickets */}
								<Box mb={6}>
									<Flex alignItems="center" justifyContent="space-between" mb={3}>
										<FormLabel fontSize="sm" fontWeight="600" color="#1F2937" mb={0}>
											Tickets
										</FormLabel>
										<Button size="sm" bg="#FFFFFF" color="#8B5CF6" border="1px" borderColor="#8B5CF6" _hover={{ bg: "#F3F4F6" }} onClick={onOpen} leftIcon={<PlusSVG />}>
											Add Ticket
										</Button>
									</Flex>
									<FieldArray name="tickets">
										{({ remove }) => (
											<>
												{values.tickets.length === 0 ? (
													<Box p={6} bg="#F5F5F7" borderRadius="md" border="1px" borderColor="#E5E7EB" textAlign="center">
														<Text fontSize="sm" color="#9CA3AF">
															No tickets added yet
														</Text>
													</Box>
												) : (
													<Flex gap={3} flexWrap="wrap">
														{values.tickets.map((ticket, index) => (
															<Box key={index} bg="#FFFFFF" border="1px" borderColor="#E5E7EB" rounded="lg" w="48" p="4" position="relative">
																<Menu>
																	<MenuButton as={IconButton} icon={<VerticalDotsSVG />} variant="ghost" size="sm" position="absolute" top="2" right="2" color="#9CA3AF" _hover={{ bg: "#F9FAFB" }} />
																	<MenuList bg="#FFFFFF" border="1px" borderColor="#E5E7EB">
																		<MenuItem
																			onClick={() => {
																				setEditIndex(index)
																				setTempTicket(ticket)
																				onOpen()
																			}}
																		>
																			Edit
																		</MenuItem>
																		<MenuItem onClick={() => remove(index)} color="red.500">
																			Delete
																		</MenuItem>
																	</MenuList>
																</Menu>
																<Text color="#1F2937" fontWeight="600" fontSize="sm" mb={1}>
																	{ticket.title}
																</Text>
																<Text color="#6B7280" fontSize="xs" mb={2} noOfLines={2}>
																	{ticket.description}
																</Text>
																<Text color="#8B5CF6" fontWeight="bold" fontSize="md">
																	${ticket.price}
																</Text>
															</Box>
														))}
													</Flex>
												)}
											</>
										)}
									</FieldArray>
								</Box>

								{/* Images */}
								<Box mb={6}>
									<FormLabel fontSize="sm" fontWeight="600" color="#1F2937" mb={2}>
										Add Images
									</FormLabel>
									<ImageUploadBox uploadedImages={uploadedImages} onImageChange={handleImageUpload} isUploading={isUploading} uploadProgress={uploadProgress} handleImageDelete={handleImageDelete} />
								</Box>

								{/* Submit Button */}
								<Button
									type="submit"
									w="full"
									bg="#8B5CF6"
									color="white"
									size="lg"
									fontSize="md"
									fontWeight="600"
									_hover={{ bg: "#7C3AED" }}
									isLoading={isSubmitting}
									isDisabled={isSubmitting || isUploading}
									loadingText="Creating Event..."
								>
									Create Event
								</Button>
							</Box>

							{/* Tickets Modal */}
							<FieldArray name="tickets">
								{({ push, replace }) => (
									<Modal isOpen={isOpen} onClose={onClose} isCentered>
										<ModalOverlay />
										<ModalContent bg="#FFFFFF" color="#1F2937">
											<ModalHeader>{editIndex !== null ? "Edit Ticket" : "Add Ticket"}</ModalHeader>
											<ModalCloseButton />
											<ModalBody>
												<FormControl mb={4}>
													<FormLabel color="#1F2937">Ticket Name</FormLabel>
													<Input
														id="ticketTitle"
														name="ticketTitle"
														placeholder="Enter ticket name"
														bg="#FFFFFF"
														border="1px"
														borderColor="#E5E7EB"
														color="#1F2937"
														_hover={{ borderColor: "#D1D5DB" }}
														_focus={{ borderColor: "#8B5CF6", boxShadow: "0 0 0 1px #8B5CF6" }}
														value={tempTicket.title}
														onChange={(e) =>
															setTempTicket({
																...tempTicket,
																title: e.target.value,
															})
														}
													/>
												</FormControl>
												<FormControl mb={4}>
													<FormLabel color="#1F2937">Description</FormLabel>
													<Textarea
														id="ticketDescription"
														name="ticketDescription"
														placeholder="Enter description"
														bg="#FFFFFF"
														border="1px"
														borderColor="#E5E7EB"
														color="#1F2937"
														_hover={{ borderColor: "#D1D5DB" }}
														_focus={{ borderColor: "#8B5CF6", boxShadow: "0 0 0 1px #8B5CF6" }}
														value={tempTicket.description}
														onChange={(e) =>
															setTempTicket({
																...tempTicket,
																description: e.target.value,
															})
														}
													/>
												</FormControl>
												<FormControl mb={4}>
													<FormLabel color="#1F2937">Price</FormLabel>
													<Input
														id="ticketPrice"
														name="ticketPrice"
														type="number"
														placeholder="Enter price"
														bg="#FFFFFF"
														border="1px"
														borderColor="#E5E7EB"
														color="#1F2937"
														_hover={{ borderColor: "#D1D5DB" }}
														_focus={{ borderColor: "#8B5CF6", boxShadow: "0 0 0 1px #8B5CF6" }}
														value={tempTicket.price}
														onChange={(e) =>
															setTempTicket({
																...tempTicket,
																price: parseFloat(e.target.value),
															})
														}
													/>
												</FormControl>
											</ModalBody>

											<ModalFooter>
												<Flex flexDirection="column" w="full" gap="3">
													<Button
														bg="#8B5CF6"
														w="full"
														color="white"
														_hover={{ bg: "#7C3AED" }}
														mr={3}
														onClick={() => {
															if (editIndex === null && tempTicket.title) {
																push({
																	...tempTicket,
																	id: new Date().getTime().toString(),
																})
																setTempTicket({
																	id: "",
																	title: "",
																	description: "",
																	price: 0,
																})
																setEditIndex(null)
															} else if (editIndex !== null) {
																replace(editIndex, tempTicket)
																setEditIndex(null)
															}
															onClose()
														}}
													>
														{editIndex !== null ? "Update" : "Add"}
													</Button>
													<Button
														variant="outline"
														border="1px"
														borderColor="#E5E7EB"
														color="#1F2937"
														bg="#FFFFFF"
														_hover={{ bg: "#F9FAFB" }}
														onClick={() => {
															setTempTicket({
																id: "",
																title: "",
																description: "",
																price: 0,
															})
															setEditIndex(null)
															onClose()
														}}
													>
														Cancel
													</Button>
												</Flex>
											</ModalFooter>
										</ModalContent>
									</Modal>
								)}
							</FieldArray>

							{/* Invite Guest Modal */}
							<Modal isOpen={isInviteOpen} onClose={onInviteClose} isCentered size="md">
								<ModalOverlay bg="blackAlpha.600" backdropFilter="blur(10px)" />
								<ModalContent bg="#FFFFFF" color="#1F2937" borderRadius="xl" boxShadow="2xl">
									<ModalHeader borderBottom="1px" borderColor="#E5E7EB" pb={4}>
										<Flex alignItems="center" gap={3}>
											<Box w="40px" h="40px" borderRadius="lg" bg="#F3F4F6" display="flex" alignItems="center" justifyContent="center">
												<Text fontSize="xl">✉️</Text>
											</Box>
											<Box>
												<Text fontSize="lg" fontWeight="600" color="#1F2937">
													Invite Guests
												</Text>
												<Text fontSize="sm" fontWeight="normal" color="#6B7280" mt={1}>
													Send invitations to your event
												</Text>
											</Box>
										</Flex>
									</ModalHeader>
									<ModalCloseButton color="#6B7280" _hover={{ bg: "#F9FAFB" }} />

									<ModalBody py={6}>
										{/* Email Input */}
										<FormControl>
											<FormLabel fontSize="sm" fontWeight="600" color="#1F2937" mb={2}>
												Email Address
											</FormLabel>
											<Input
												placeholder="Enter guest email address"
												type="email"
												value={guestEmail}
												onChange={(e) => setGuestEmail(e.target.value)}
												bg="#FFFFFF"
												border="1px"
												borderColor="#E5E7EB"
												color="#1F2937"
												fontSize="sm"
												h="44px"
												_placeholder={{ color: "#9CA3AF" }}
												_hover={{ borderColor: "#D1D5DB" }}
												_focus={{ borderColor: "#8B5CF6", boxShadow: "0 0 0 3px rgba(139, 92, 246, 0.1)" }}
												onKeyPress={(e) => {
													if (e.key === "Enter") {
														e.preventDefault()
														if (guestEmail && guestEmail.includes("@")) {
															setInvitedGuests([...invitedGuests, guestEmail])
															setGuestEmail("")
														}
													}
												}}
											/>
											<Text fontSize="xs" color="#6B7280" mt={2}>
												Press Enter or click Send to add email
											</Text>
										</FormControl>

										{/* Invited Guests List */}
										{invitedGuests.length > 0 && (
											<Box mt={6}>
												<Text fontSize="sm" fontWeight="600" color="#1F2937" mb={3}>
													Invited Guests ({invitedGuests.length})
												</Text>
												<Box maxH="200px" overflowY="auto" border="1px" borderColor="#E5E7EB" borderRadius="lg" p={2}>
													{invitedGuests.map((email, index) => (
														<Flex key={index} alignItems="center" justifyContent="space-between" p={3} bg="#F9FAFB" borderRadius="md" mb={2} _last={{ mb: 0 }}>
															<Flex alignItems="center" gap={3}>
																<Box w="32px" h="32px" borderRadius="full" bg="#8B5CF6" display="flex" alignItems="center" justifyContent="center">
																	<Text fontSize="sm" color="#FFFFFF" fontWeight="600">
																		{email.charAt(0).toUpperCase()}
																	</Text>
																</Box>
																<Text fontSize="sm" color="#1F2937" fontWeight="500">
																	{email}
																</Text>
															</Flex>
															<Button
																size="sm"
																variant="ghost"
																color="#EF4444"
																_hover={{ bg: "#FEE2E2" }}
																onClick={() => {
																	setInvitedGuests(invitedGuests.filter((_, i) => i !== index))
																}}
															>
																Remove
															</Button>
														</Flex>
													))}
												</Box>
											</Box>
										)}
									</ModalBody>

									<ModalFooter borderTop="1px" borderColor="#E5E7EB" pt={4}>
										<Flex w="full" gap={3}>
											<Button
												flex={1}
												variant="outline"
												border="1px"
												borderColor="#E5E7EB"
												color="#1F2937"
												bg="#FFFFFF"
												h="44px"
												_hover={{ bg: "#F9FAFB" }}
												onClick={() => {
													setGuestEmail("")
													onInviteClose()
												}}
											>
												Close
											</Button>
											<Button
												flex={1}
												bg="#8B5CF6"
												color="white"
												h="44px"
												_hover={{ bg: "#7C3AED" }}
												_disabled={{ bg: "#D1D5DB", cursor: "not-allowed" }}
												isDisabled={!guestEmail || !guestEmail.includes("@")}
												onClick={() => {
													if (guestEmail && guestEmail.includes("@")) {
														setInvitedGuests([...invitedGuests, guestEmail])
														setGuestEmail("")
													}
												}}
											>
												Send Invite
											</Button>
										</Flex>
									</ModalFooter>
								</ModalContent>
							</Modal>
						</Form>
					)}
				</Formik>
			</ConsoleLayout>
		</>
	)
}

export default CreateEventPage

export const getServerSideProps: GetServerSideProps = async (context) => {
	// Check if user is admin/super admin
	const sessionResult = await adminOnly(context)
	if (!sessionResult || "redirect" in sessionResult) return sessionResult
	
	return {
		props: {
			session: sessionResult.props.session,
		},
	}
}

import React from "react"
import {
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalBody,
	ModalCloseButton,
	Box,
	Flex,
	Input,
	Textarea,
	Button,
	Text,
	Avatar,
	Menu,
	MenuButton,
	MenuList,
	MenuItem,
	InputGroup,
	InputLeftElement,
	Grid,
	GridItem,
	IconButton,
	Image,
	Spinner,
} from "@chakra-ui/react"
import { Formik, Form, Field, FormikProps } from "formik"
import { useSession } from "next-auth/react"
import { useRouter } from "next/router"
import { ChevronDownIcon } from "@chakra-ui/icons"
import { FiPlus, FiX, FiMapPin, FiCalendar, FiClock, FiDollarSign, FiSettings } from "react-icons/fi"
import { useEdgeStore } from "@/lib/edgestore"
import { CreateEventFormData } from "@/types"
import { CreateEventThunk } from "@/redux/reducers/eventsSlice"
import { useAppDispatch } from "@/redux/stores"
import { uniqueId } from "@/lib/utils"
import { Error, Success } from "@/lib/_toaster"
import DatePicker from "@/components/form/DatePicker"
import TimePicker from "@/components/form/TimePicker"
import TimezoneSelect from "@/components/timezone-select"
import CollapsibleSection from "./CollapsibleSection"
import PrivacySelector from "./PrivacySelector"
import { z } from "zod"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"

const createEventSchema = z.object({
	name: z.string().min(1, "Event name is required"),
	location: z.string().min(1, "Location is required"),
	desc: z.string().min(1, "Description is required"),
	startDate: z.string().min(1, "Start date is required"),
	startTime: z.string().min(1, "Start time is required"),
	endDate: z.string().min(1, "End date is required"),
	endTime: z.string().min(1, "End time is required"),
})

const initialValues: CreateEventFormData = {
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
	latitude: 0,
	longitude: 0,
	placeId: "",
	isPaid: false,
	showParticipants: true,
	interest: "",
	subInterest: "",
	host: {
		name: "",
		image: "",
		phone: "",
		email: "",
	},
	invitedGuests: [],
}

interface CreateEventModalProps {
	isOpen: boolean
	onClose: () => void
	onEventCreated?: () => void
}

const CreateEventModal: React.FC<CreateEventModalProps> = ({ isOpen, onClose, onEventCreated }) => {
	const { data: session } = useSession()
	const dispatcher = useAppDispatch()
	const router = useRouter()
	const { edgestore } = useEdgeStore()
	const formikRef = React.useRef<FormikProps<CreateEventFormData>>(null)

	const [uploadedImages, setUploadedImages] = React.useState<{ id: string; file: string }[]>([])
	const [uploadProgress, setUploadProgress] = React.useState(0)
	const [isUploading, setIsUploading] = React.useState(false)
	const [isSubmitting, setIsSubmitting] = React.useState(false)
	const [mainImageIndex, setMainImageIndex] = React.useState(0)
	const [tempTicket, setTempTicket] = React.useState({ id: "", title: "", description: "", price: 0 })
	const [tickets, setTickets] = React.useState<any[]>([])
	const [invitedGuests, setInvitedGuests] = React.useState<string[]>([])
	const [guestEmail, setGuestEmail] = React.useState("")
	const [hostImageUploading, setHostImageUploading] = React.useState(false)

	// Fetch interests from API
	const { data: interestsData } = useQuery({
		queryKey: ["interests"],
		queryFn: async () => {
			const response = await axios.get("/api/interests/list")
			return response.data?.data || []
		},
		enabled: isOpen,
	})

	const interests = interestsData || []
	const selectedInterest = interests.find((i: any) => i.name === formikRef.current?.values.interest)
	const subInterests = selectedInterest?.subInterests || []

	// Email validation helper
	const isValidEmail = (email: string): boolean => {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		return emailRegex.test(email.trim())
	}

	// Add guest with validation
	const handleAddGuest = () => {
		const trimmedEmail = guestEmail.trim().toLowerCase()
		
		if (!trimmedEmail) {
			Error("Validation Error", "Please enter an email address")
			return
		}
		
		if (!isValidEmail(trimmedEmail)) {
			Error("Validation Error", "Please enter a valid email address")
			return
		}
		
		if (invitedGuests.includes(trimmedEmail)) {
			Error("Duplicate Email", "This email has already been invited")
			return
		}
		
		setInvitedGuests([...invitedGuests, trimmedEmail])
		setGuestEmail("")
	}

	// Load Google Maps Script
	React.useEffect(() => {
		const loadGoogleMapsScript = () => {
			// Check if script already exists
			if (document.getElementById('google-maps-script')) {
				console.log("Google Maps script already loaded")
				return
			}

			console.log("Loading Google Maps script...")
			const script = document.createElement('script')
			script.id = 'google-maps-script'
			script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_API_KEY}&libraries=places`
			script.async = true
			script.defer = true
			script.onload = () => {
				console.log("✅ Google Maps script loaded successfully!")
			}
			script.onerror = () => {
				console.error("❌ Failed to load Google Maps script")
			}
			document.head.appendChild(script)
		}

		loadGoogleMapsScript()

		// Add CSS for autocomplete dropdown
		const style = document.createElement('style')
		style.id = 'google-places-autocomplete-fix'
		style.innerHTML = `
			.pac-container {
				z-index: 99999 !important;
				box-shadow: 0 2px 6px rgba(0,0,0,0.3);
				border-radius: 8px;
				margin-top: 4px;
			}
			.pac-item {
				padding: 8px 12px;
				cursor: pointer;
				border-top: 1px solid #e5e7eb;
			}
			.pac-item:first-child {
				border-top: none;
			}
			.pac-item:hover {
				background-color: #f3f4f6;
			}
			.pac-icon {
				margin-right: 8px;
			}
		`
		document.head.appendChild(style)
		
		return () => {
			const existingStyle = document.getElementById('google-places-autocomplete-fix')
			if (existingStyle) {
				existingStyle.remove()
			}
		}
	}, [])

	const locationInputRef = React.useRef<HTMLInputElement>(null)

	// Initialize Google Places Autocomplete
	React.useEffect(() => {
		console.log("Google API Key exists:", !!process.env.NEXT_PUBLIC_GOOGLE_API_KEY)
		
		const initAutocomplete = () => {
			console.log("Checking if Google autocomplete loaded...")
			if ((window as any).google?.maps?.places) {
				console.log("✅ Google Places API loaded successfully!")
				
				if (locationInputRef.current) {
					console.log("Initializing autocomplete on input...")
					const autocomplete = new (window as any).google.maps.places.Autocomplete(
						locationInputRef.current,
						{
							fields: ["formatted_address", "geometry", "place_id", "name", "address_components"],
						}
					)

					autocomplete.addListener("place_changed", () => {
						const place = autocomplete.getPlace()
						console.log("Place selected:", place)
						
						if (place && formikRef.current) {
							formikRef.current.setFieldValue("location", place.formatted_address || "")
							
							if (place.geometry?.location) {
								const lat = place.geometry.location.lat()
								const lng = place.geometry.location.lng()
								formikRef.current.setFieldValue("latitude", lat)
								formikRef.current.setFieldValue("longitude", lng)
							}
							
							if (place.place_id) {
								formikRef.current.setFieldValue("placeId", place.place_id)
							}
						}
					})
					
					console.log("✅ Autocomplete initialized!")
				}
			} else {
				console.log("❌ Google Places API not loaded yet, retrying...")
				setTimeout(initAutocomplete, 500)
			}
		}
		
		if (isOpen) {
			setTimeout(initAutocomplete, 1000)
		}
	}, [isOpen])

	const handleImageUpload = async (files: FileList | null) => {
		if (!files || files.length === 0 || isUploading) return

		setIsUploading(true)
		setUploadProgress(0)

		try {
			for (let i = 0; i < files.length; i++) {
				const file = files[i]
				const res = await edgestore.publicFiles.upload({
					file,
					onProgressChange: (progress) => {
						setUploadProgress(progress)
					},
				})
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
			await edgestore.publicFiles.delete({ url: imageUrl })
			setUploadedImages((prev) => prev.filter((img) => img.file !== imageUrl))
		} catch (error: any) {
			console.error("Error deleting image", error)
			Error("Error", "Failed to delete image")
		}
	}

	const handleStartDateChange = (date?: string, time?: string) => {
		if (formikRef?.current) {
			if (date) formikRef.current.setFieldValue("startDate", date)
			if (time) formikRef.current.setFieldValue("startTime", time)
		}
	}

	const handleEndDateChange = (date?: string, time?: string) => {
		if (formikRef?.current) {
			if (date) formikRef.current.setFieldValue("endDate", date)
			if (time) formikRef.current.setFieldValue("endTime", time)
		}
	}

	const onSubmit = (values: CreateEventFormData) => {
		const validation = createEventSchema.safeParse(values)

		if (!validation.success) {
			const firstError = Object.values(validation.error.flatten().fieldErrors)[0]?.[0]
			Error("Validation Error", firstError || "Please fix the form errors")
			return
		}

		if (uploadedImages.length === 0) {
			Error("Validation Error", "Please add at least one image")
			return
		}

		let finalTickets = tickets
		if (finalTickets.length === 0) {
			finalTickets = [
				{
					id: uniqueId(10),
					title: "General Admission",
					price: 0,
					description: "Free ticket for this event",
				},
			]
		}

		values.images = uploadedImages
		values.tickets = finalTickets
		values.isPaid = finalTickets.some((t) => t.price > 0)
		values.invitedGuests = invitedGuests

		setIsSubmitting(true)

		dispatcher(CreateEventThunk({ data: { payload: JSON.stringify(values) } }))
			.then((res: any) => {
				if (res?.payload?.status) {
					Success("Success", "Event created successfully!")
					onClose()
					if (onEventCreated) {
						onEventCreated()
					} else {
						router.push(`/console/events/${res.payload.data._id}/manage`)
					}
				} else {
					Error("Error", res?.payload?.message || "Failed to create event")
				}
			})
			.catch((error) => {
				Error("Error", "Failed to create event")
			})
			.finally(() => {
				setIsSubmitting(false)
			})
	}

	const handleAddTicket = () => {
		if (!tempTicket.title) {
			Error("Validation Error", "Please enter a ticket name")
			return
		}
		if (tempTicket.price < 0) {
			Error("Validation Error", "Price cannot be negative")
			return
		}
		setTickets([...tickets, { ...tempTicket, id: uniqueId(10) }])
		setTempTicket({ id: "", title: "", description: "", price: 0 })
	}

	const handleRemoveTicket = (ticketId: string) => {
		setTickets(tickets.filter((t) => t.id !== ticketId))
	}

	return (
		<>
		<Modal 
			isOpen={isOpen} 
			onClose={onClose} 
			size={{ base: "full", md: "2xl" }} 
			scrollBehavior="inside"
			closeOnOverlayClick={false}
		>
			<ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
			<ModalContent
				bg="#FFFFFF"
				maxH={{ base: "100vh", md: "90vh" }}
				my={{ base: 0, md: 4 }}
				borderRadius={{ base: 0, md: "xl" }}
			>
				<ModalHeader
					borderBottom="1px"
					borderColor="#E5E7EB"
					py={4}
					fontSize="20px"
					fontWeight="700"
					color="#1F2937"
					textAlign="center"
				>
					Create event
				</ModalHeader>
				<ModalCloseButton color="#6B7280" _hover={{ bg: "#F9FAFB" }} />

				<ModalBody p={0}>
					<Formik initialValues={initialValues} onSubmit={onSubmit} innerRef={formikRef}>
						{({ values, setFieldValue }) => (
							<Form>
								<Box>
									{/* Image Upload Area */}
									<Box
										position="relative"
										h="250px"
										bg="#F3F4F6"
										borderBottom="1px"
										borderColor="#E5E7EB"
										cursor="pointer"
										_hover={{ bg: "#E5E7EB" }}
										onClick={() => document.getElementById("image-upload-input")?.click()}
									>
										{uploadedImages.length > 0 ? (
											<Image
												src={uploadedImages[mainImageIndex]?.file || uploadedImages[0]?.file}
												alt="Event"
												w="100%"
												h="100%"
												objectFit="cover"
											/>
										) : (
											<Flex h="100%" alignItems="center" justifyContent="center" flexDirection="column" gap={2}>
												<Text fontSize="40px">📸</Text>
												<Text fontSize="sm" color="#6B7280">
													Add photo
												</Text>
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
														onClick={() => handleImageDelete(img.file)}
													/>
												</Box>
											))}
										</Flex>
									)}

									<Box p={4}>
										{/* Host Profile Section */}
										<Flex alignItems="center" gap={3} mb={4} pb={4} borderBottom="1px" borderColor="#E5E7EB">
											<Avatar size="md" name={session?.user?.name || session?.user?.email || "Host"} />
											<Box flex={1}>
												<Text fontSize="15px" fontWeight="600" color="#1F2937">
													{session?.user?.name || session?.user?.email || "Your Name"}
												</Text>
												<Text fontSize="13px" color="#6B7280">
													Host — Your profile
												</Text>
											</Box>
											<ChevronDownIcon w={5} h={5} color="#6B7280" />
										</Flex>

										{/* Event Name */}
										<Box mb={4}>
											<Field
												as={Input}
												name="name"
												placeholder="Event name"
												size="lg"
												border="none"
												borderBottom="2px"
												borderColor="#E5E7EB"
												borderRadius={0}
												px={0}
												fontSize="17px"
												fontWeight="500"
												color="#1F2937"
												_placeholder={{ color: "#9CA3AF", fontWeight: "400" }}
												_hover={{ borderColor: "#D1D5DB", bg: "#FAFAFA" }}
												_focus={{ borderColor: "#8B5CF6", boxShadow: "none", bg: "white" }}
												transition="all 0.2s"
											/>
										</Box>

										{/* Date & Time */}
										<Box mb={4}>
											<Grid templateColumns="repeat(3, 1fr)" gap={2} mb={2}>
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

											<Grid templateColumns="repeat(3, 1fr)" gap={2}>
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
																/>
															</Box>
														</Flex>
													</Box>
												</GridItem>
												<GridItem></GridItem>
											</Grid>
										</Box>

										{/* Privacy Selector */}
										<PrivacySelector
											value={values.privacy as "public" | "private"}
											onChange={(val) => setFieldValue("privacy", val)}
										/>

										{/* Interest Selector */}
										<Box mb={4}>
											<Text fontSize="13px" fontWeight="500" color="#1F2937" mb={2}>
												Interest
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
														<Text fontSize="15px" fontWeight="500" color={values.interest ? "#1F2937" : "#9CA3AF"}>
															{values.interest || "Select interest (optional)"}
														</Text>
														<ChevronDownIcon w={5} h={5} color="#6B7280" />
													</Flex>
												</MenuButton>
												<MenuList bg="#FFFFFF" border="1px" borderColor="#E5E7EB" borderRadius="lg" boxShadow="lg" maxH="300px" overflowY="auto">
													<MenuItem
														onClick={() => {
															setFieldValue("interest", "")
															setFieldValue("subInterest", "")
														}}
														_hover={{ bg: "#F3F4F6" }}
														bg={!values.interest ? "#F3F4F6" : "transparent"}
													>
														<Text fontSize="14px" color="#1F2937">None</Text>
													</MenuItem>
													{interests.map((interest: any) => (
														<MenuItem
															key={interest._id}
															onClick={() => {
																setFieldValue("interest", interest.name)
																setFieldValue("subInterest", "")
															}}
															_hover={{ bg: "#F3F4F6" }}
															bg={values.interest === interest.name ? "#F3F4F6" : "transparent"}
														>
															<Text fontSize="14px" color="#1F2937">{interest.name}</Text>
														</MenuItem>
													))}
												</MenuList>
											</Menu>
										</Box>

										{/* SubInterest Selector */}
										{selectedInterest && subInterests.length > 0 && (
											<Box mb={4}>
												<Text fontSize="13px" fontWeight="500" color="#1F2937" mb={2}>
													Sub Interest
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
															<Text fontSize="15px" fontWeight="500" color={values.subInterest ? "#1F2937" : "#9CA3AF"}>
																{values.subInterest || "Select sub interest (optional)"}
															</Text>
															<ChevronDownIcon w={5} h={5} color="#6B7280" />
														</Flex>
													</MenuButton>
													<MenuList bg="#FFFFFF" border="1px" borderColor="#E5E7EB" borderRadius="lg" boxShadow="lg" maxH="300px" overflowY="auto">
														<MenuItem
															onClick={() => setFieldValue("subInterest", "")}
															_hover={{ bg: "#F3F4F6" }}
															bg={!values.subInterest ? "#F3F4F6" : "transparent"}
														>
															<Text fontSize="14px" color="#1F2937">None</Text>
														</MenuItem>
														{subInterests.map((subInterest: any) => (
															<MenuItem
																key={subInterest._id}
																onClick={() => setFieldValue("subInterest", subInterest.name)}
																_hover={{ bg: "#F3F4F6" }}
																bg={values.subInterest === subInterest.name ? "#F3F4F6" : "transparent"}
															>
																<Text fontSize="14px" color="#1F2937">{subInterest.name}</Text>
															</MenuItem>
														))}
													</MenuList>
												</Menu>
											</Box>
										)}

										{/* Description */}
										<Box mb={4}>
											<Field
												as={Textarea}
												name="desc"
												placeholder="What are the details?"
												value={values.desc && values.desc !== "undefined" ? values.desc : ""}
												rows={4}
												border="1px"
												borderColor="#E5E7EB"
												borderRadius="lg"
												p={3}
												fontSize="15px"
												fontWeight="400"
												color="#1F2937"
												_placeholder={{ color: "#9CA3AF", fontWeight: "400" }}
												_hover={{ borderColor: "#D1D5DB", bg: "#F9FAFB" }}
												_focus={{ borderColor: "#8B5CF6", boxShadow: "none", bg: "white" }}
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
										<CollapsibleSection icon={<FiMapPin size={20} />} title="Add location">
											<Box>
												<Text fontSize="13px" fontWeight="500" color="#1F2937" mb={2}>
													Event Location
												</Text>
												<InputGroup>
													<InputLeftElement pointerEvents="none" color="#9CA3AF">
														<FiMapPin size={18} />
													</InputLeftElement>
													<Input
														ref={locationInputRef}
														id="location"
														name="location"
														placeholder="Search for a place or address"
														border="1px"
														borderColor="#E5E7EB"
														pl="40px"
														autoComplete="off"
														_hover={{ borderColor: "#D1D5DB" }}
														_focus={{ borderColor: "#8B5CF6", boxShadow: "none" }}
													/>
												</InputGroup>
												{!process.env.NEXT_PUBLIC_GOOGLE_API_KEY && (
													<Text fontSize="11px" color="#EF4444" mt={1}>
														⚠️ Google Places API key not configured
													</Text>
												)}
											</Box>
										</CollapsibleSection>

										<CollapsibleSection icon={<FiDollarSign size={20} />} title="Add tickets">
											<Box>
												{tickets.map((ticket) => (
													<Flex
														key={ticket.id}
														bg="#F9FAFB"
														p={3}
														borderRadius="md"
														mb={2}
														alignItems="center"
														justifyContent="space-between"
													>
														<Box>
															<Text fontSize="14px" fontWeight="600" color="#1F2937">
																{ticket.title}
															</Text>
															<Text fontSize="13px" color="#6B7280">
																${ticket.price.toFixed(2)}
															</Text>
														</Box>
														<IconButton
															aria-label="Remove"
															icon={<FiX />}
															size="sm"
															variant="ghost"
															colorScheme="red"
															onClick={() => handleRemoveTicket(ticket.id)}
														/>
													</Flex>
												))}
												<Box mt={3}>
													<Text fontSize="13px" fontWeight="500" color="#1F2937" mb={1}>
														Ticket Name <Text as="span" color="red">*</Text>
													</Text>
													<Input
														placeholder="e.g., General Admission"
														size="sm"
														mb={3}
														value={tempTicket.title}
														onChange={(e) => setTempTicket({ ...tempTicket, title: e.target.value })}
													/>
													<Text fontSize="13px" fontWeight="500" color="#1F2937" mb={1}>
														Description (Optional)
													</Text>
													<Input
														placeholder="e.g., Access to all event activities (optional)"
														size="sm"
														mb={3}
														value={tempTicket.description}
														onChange={(e) =>
															setTempTicket({ ...tempTicket, description: e.target.value })
														}
													/>
													<Text fontSize="13px" fontWeight="500" color="#1F2937" mb={1}>
														Price (USD)
													</Text>
													<InputGroup size="sm" mb={3}>
														<InputLeftElement pointerEvents="none" color="#6B7280" fontSize="14px">
															$
														</InputLeftElement>
														<Input
															placeholder="0.00"
															type="number"
															step="0.01"
															min="0"
															value={tempTicket.price}
															onChange={(e) =>
																setTempTicket({ ...tempTicket, price: parseFloat(e.target.value) || 0 })
															}
														/>
													</InputGroup>
													<Button
														size="sm"
														w="full"
														bg="#8B5CF6"
														color="white"
														_hover={{ bg: "#7C3AED" }}
														onClick={handleAddTicket}
														isDisabled={!tempTicket.title}
													>
														Add Ticket
													</Button>
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
															if (e.key === "Enter") {
																e.preventDefault()
																handleAddGuest()
															}
														}}
													/>
													<Button
														size="sm"
														bg="#8B5CF6"
														color="white"
														_hover={{ bg: "#7C3AED" }}
														isDisabled={!guestEmail.trim()}
														onClick={handleAddGuest}
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
													<input
														type="checkbox"
														checked={values.requireApproval}
														onChange={(e) => setFieldValue("requireApproval", e.target.checked)}
														style={{ width: "20px", height: "20px", cursor: "pointer" }}
													/>
												</Flex>
											</Box>
										</CollapsibleSection>
									</Box>
								</Box>

								{/* Fixed Bottom Button */}
								<Box p={4} borderTop="1px" borderColor="#E5E7EB" bg="#FFFFFF">
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
									loadingText="Creating your event..."
									spinnerPlacement="start"
									transition="all 0.2s"
									opacity={isSubmitting || isUploading ? 0.8 : 1}
								>
									Create event
								</Button>
								</Box>
							</Form>
						)}
					</Formik>
				</ModalBody>
			</ModalContent>
		</Modal>

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
				sx={{
					"@keyframes fadeIn": {
						from: { opacity: 0 },
						to: { opacity: 1 },
					},
					"@keyframes spin": {
						from: { transform: "rotate(0deg)" },
						to: { transform: "rotate(360deg)" },
					},
					"@keyframes pulse": {
						"0%, 100%": { transform: "scale(1)", opacity: 1 },
						"50%": { transform: "scale(1.05)", opacity: 0.8 },
					},
				}}
			>
				<Box
					textAlign="center"
					animation="pulse 2s ease-in-out infinite"
				>
					{/* Outer Ring */}
					<Box
						position="relative"
						display="inline-block"
						mb={6}
					>
						{/* Spinning Gradient Ring */}
						<Box
							w="120px"
							h="120px"
							borderRadius="full"
							border="4px solid transparent"
							borderTopColor="#8B5CF6"
							borderRightColor="#A78BFA"
							borderBottomColor="#C4B5FD"
							animation="spin 1s linear infinite"
							position="relative"
						/>
						
						{/* Inner Circle with Icon */}
						<Box
							position="absolute"
							top="50%"
							left="50%"
							transform="translate(-50%, -50%)"
							bg="white"
							w="80px"
							h="80px"
							borderRadius="full"
							display="flex"
							alignItems="center"
							justifyContent="center"
							boxShadow="0 10px 40px rgba(139, 92, 246, 0.3)"
						>
							<Spinner
								thickness="3px"
								speed="0.65s"
								color="#8B5CF6"
								size="xl"
							/>
						</Box>
					</Box>

					{/* Loading Text */}
					<Box>
						<Text
							fontSize="24px"
							fontWeight="700"
							color="white"
							mb={2}
							textShadow="0 2px 10px rgba(0,0,0,0.3)"
						>
							Creating your event...
						</Text>
						<Text
							fontSize="16px"
							fontWeight="400"
							color="rgba(255,255,255,0.8)"
							textShadow="0 1px 5px rgba(0,0,0,0.3)"
						>
							Please wait while we set everything up
						</Text>
					</Box>

					{/* Decorative Dots */}
					<Flex justifyContent="center" gap={2} mt={6}>
						{[0, 1, 2].map((i) => (
							<Box
								key={i}
								w="8px"
								h="8px"
								borderRadius="full"
								bg="white"
								animation={`pulse 1.4s ease-in-out ${i * 0.2}s infinite`}
							/>
						))}
					</Flex>
				</Box>
			</Box>
		)}
		</>
	)
}

export default CreateEventModal


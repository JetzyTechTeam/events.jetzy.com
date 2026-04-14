import React, { useState, useRef, useEffect, useCallback } from "react"
import {
	Box,
	Button,
	Input,
	VStack,
	HStack,
	Text,
	Alert,
	AlertIcon,
	AlertTitle,
	AlertDescription,
	useToast,
	Divider,
	Badge,
	Spinner,
	Card,
	CardBody,
	IconButton,
	NumberInput,
	NumberInputField,
	NumberInputStepper,
	NumberIncrementStepper,
	NumberDecrementStepper,
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalBody,
	ModalFooter,
	ModalCloseButton,
	useDisclosure,
	Flex,
	Heading,
} from "@chakra-ui/react"
import { CheckCircleIcon, CloseIcon, SearchIcon } from "@chakra-ui/icons"
import axios from "axios"
import dayjs from "dayjs"
import jsQR from "jsqr"

interface BookingInfo {
	bookingId: string
	bookingRef: string
	customerName: string
	customerEmail: string
	customerPhone: string
	totalTickets: number
	checkedInCount: number
	remainingTickets: number
	isFullyCheckedIn: boolean
	firstCheckInAt: string | null
	lastCheckInAt: string | null
	checkInHistory: Array<{
		count: number
		timestamp: string
		adminName: string
	}>
	bookingStatus: string
}

interface CheckInPortalProps {
	eventId: string
	eventName: string
}

interface GuestDetail {
	name: string
	email: string
	phone: string
}

interface EventGuest {
	id: string
	guestName: string
	guestEmail: string
	guestPhone: string
	bookingEmail: string
	checkedInAt: string
	checkedInBy: string
}

const CheckInPortal: React.FC<CheckInPortalProps> = ({ eventId, eventName }) => {
	const [identifier, setIdentifier] = useState("")
	const [bookingInfo, setBookingInfo] = useState<BookingInfo | null>(null)
	const [guestCount, setGuestCount] = useState(1)
	const [isValidating, setIsValidating] = useState(false)
	const [isCheckingIn, setIsCheckingIn] = useState(false)
	const [error, setError] = useState("")
	const [isCameraActive, setIsCameraActive] = useState(false)
	const [isScanning, setIsScanning] = useState(false)
	const [collectGuestDetails, setCollectGuestDetails] = useState(false)
	const [guestDetails, setGuestDetails] = useState<GuestDetail[]>([])
	const [guestList, setGuestList] = useState<EventGuest[]>([])
	const [isLoadingGuests, setIsLoadingGuests] = useState(false)

	const toast = useToast()
	const { isOpen, onOpen, onClose } = useDisclosure()
	const videoRef = useRef<HTMLVideoElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)

	const fetchGuestList = useCallback(async () => {
		setIsLoadingGuests(true)
		try {
			const response = await axios.get(`/api/check-in/guests?eventId=${eventId}`)
			if (response.data.status) {
				setGuestList(response.data.data.guests || [])
			}
		} catch (err: any) {
			console.error("Failed to fetch guest list:", err)
		} finally {
			setIsLoadingGuests(false)
		}
	}, [eventId])

	// Fetch guest list on mount
	useEffect(() => {
		fetchGuestList()
	}, [fetchGuestList])

	// Update guest details array when count changes
	useEffect(() => {
		if (collectGuestDetails && bookingInfo) {
			setGuestDetails((prev) => {
				const newDetails = Array.from({ length: guestCount }, (_, i) => {
					// First guest gets pre-filled with booking owner's info
					if (i === 0) {
						return {
							name: bookingInfo.customerName,
							email: bookingInfo.customerEmail,
							phone: bookingInfo.customerPhone,
						}
					}
					// Other guests keep existing data or empty
					return prev[i] || { name: "", email: "", phone: "" }
				})
				return newDetails
			})
		}
	}, [guestCount, collectGuestDetails, bookingInfo])

	// Cleanup camera on unmount
	useEffect(() => {
		const video = videoRef.current
		return () => {
			if (video && video.srcObject) {
				const stream = video.srcObject as MediaStream
				stream.getTracks().forEach((track) => track.stop())
			}
		}
	}, [])

	const handleValidate = async () => {
		if (!identifier.trim()) {
			setError("Please enter an email or booking reference")
			return
		}

		setIsValidating(true)
		setError("")
		setBookingInfo(null)

		try {
			const response = await axios.post("/api/check-in/validate", {
				eventId,
				identifier: identifier.trim(),
			})

			if (response.data.status) {
				setBookingInfo(response.data.data)
			} else {
				setError(response.data.message)
			}
		} catch (err: any) {
			const errorMsg = err.response?.data?.message || "Failed to validate booking"
			setError(errorMsg)
			toast({
				title: "Validation Error",
				description: errorMsg,
				status: "error",
				duration: 5000,
				isClosable: true,
			})
		} finally {
			setIsValidating(false)
		}
	}

	const handleCheckIn = async () => {
		if (!bookingInfo) return

		// Validate guest count
		if (guestCount < 1) {
			toast({
				title: "Invalid Guest Count",
				description: "Please enter at least 1 guest",
				status: "warning",
				duration: 3000,
			})
			return
		}

		if (guestCount > bookingInfo.remainingTickets) {
			toast({
				title: "Invalid Guest Count",
				description: `Cannot check in more than ${bookingInfo.remainingTickets} remaining guest${bookingInfo.remainingTickets > 1 ? "s" : ""}`,
				status: "warning",
				duration: 3000,
			})
			return
		}

		// Validate guest details if collection is enabled
		if (collectGuestDetails) {
			const validGuestDetails = guestDetails.filter((g) => g.name && g.email && g.phone)
			if (validGuestDetails.length > 0 && validGuestDetails.length !== guestCount) {
				toast({
					title: "Incomplete Guest Details",
					description: `Please provide details for all ${guestCount} guests or uncheck the option`,
					status: "warning",
					duration: 3000,
				})
				return
			}
		}

		setIsCheckingIn(true)

		try {
			const payload: any = {
				bookingId: bookingInfo.bookingId,
				eventId,
				count: guestCount,
			}

			// Include guest details if provided
			if (collectGuestDetails && guestDetails.length > 0) {
				const validGuestDetails = guestDetails.filter((g) => g.name && g.email && g.phone)
				if (validGuestDetails.length > 0) {
					payload.guestDetails = validGuestDetails
				}
			}

			const response = await axios.post("/api/check-in/record", payload)

			if (response.data.status) {
				toast({
					title: "Check-In Successful",
					description: `${guestCount} guest${guestCount > 1 ? "s" : ""} checked in successfully`,
					status: "success",
					duration: 5000,
					isClosable: true,
				})

				// Update booking info with new data
				setBookingInfo(response.data.data)
				// Reset states
				setGuestCount(1)
				setCollectGuestDetails(false)
				setGuestDetails([])
				// Refresh guest list
				fetchGuestList()
			} else {
				toast({
					title: "Check-In Failed",
					description: response.data.message,
					status: "error",
					duration: 5000,
					isClosable: true,
				})
			}
		} catch (err: any) {
			const errorMsg = err.response?.data?.message || "Failed to record check-in"
			toast({
				title: "Check-In Error",
				description: errorMsg,
				status: "error",
				duration: 5000,
				isClosable: true,
			})
		} finally {
			setIsCheckingIn(false)
		}
	}

	const handleReset = () => {
		setIdentifier("")
		setBookingInfo(null)
		setError("")
		setGuestCount(1)
		setCollectGuestDetails(false)
		setGuestDetails([])
	}

	const startCamera = async () => {
		try {
			console.log("Requesting camera access...")

			let stream: MediaStream | null = null

			// Try to get back camera first (environment/rear camera)
			try {
				stream = await navigator.mediaDevices.getUserMedia({
					video: {
						facingMode: { exact: "environment" },
						width: { min: 640, ideal: 1280, max: 1920 },
						height: { min: 480, ideal: 720, max: 1080 },
					},
					audio: false,
				})
				console.log("Back camera (environment) obtained")
			} catch (err) {
				console.warn("Back camera not available, trying with ideal constraint:", err)
				// Fallback to ideal if exact fails
				stream = await navigator.mediaDevices.getUserMedia({
					video: {
						facingMode: "environment",
						width: { min: 640, ideal: 1280, max: 1920 },
						height: { min: 480, ideal: 720, max: 1080 },
					},
					audio: false,
				})
			}

			console.log("Camera stream obtained:", stream)
			console.log("Video tracks:", stream.getVideoTracks())

			// Log which camera is being used
			const videoTrack = stream.getVideoTracks()[0]
			const settings = videoTrack.getSettings()
			console.log("Camera settings:", settings)
			console.log("Facing mode:", settings.facingMode || "unknown")

			// Open modal first to ensure video element is in DOM
			onOpen()

			// Wait a bit for modal to render
			await new Promise((resolve) => setTimeout(resolve, 100))

			if (videoRef.current) {
				console.log("Setting video srcObject...")
				videoRef.current.srcObject = stream

				// Wait for video to be ready
				await new Promise<void>((resolve, reject) => {
					if (!videoRef.current) {
						reject(new Error("Video ref lost"))
						return
					}

					videoRef.current.onloadedmetadata = () => {
						console.log("Video metadata loaded")
						console.log("Video dimensions:", videoRef.current?.videoWidth, "x", videoRef.current?.videoHeight)
						console.log("Video readyState:", videoRef.current?.readyState)
						resolve()
					}

					videoRef.current.onerror = (e) => {
						console.error("Video element error:", e)
						reject(e)
					}

					// Timeout fallback
					setTimeout(() => resolve(), 2000)
				})

				try {
					console.log("Attempting to play video...")
					await videoRef.current.play()
					console.log("Video playing successfully")
					console.log("Video paused?", videoRef.current.paused)
					console.log("Video ended?", videoRef.current.ended)
					setIsCameraActive(true)
				} catch (playError) {
					console.error("Play error:", playError)
					throw playError
				}
			} else {
				console.error("Video ref is null after modal open")
				throw new Error("Video element not found")
			}
		} catch (err: any) {
			console.error("Camera error:", err)
			console.error("Error name:", err.name)
			console.error("Error message:", err.message)

			let errorMessage = "Unable to access camera. "

			if (err.name === "NotAllowedError") {
				errorMessage += "Please grant camera permissions."
			} else if (err.name === "NotFoundError") {
				errorMessage += "No camera found on device."
			} else if (err.name === "NotReadableError") {
				errorMessage += "Camera is already in use."
			} else {
				errorMessage += err.message || "Unknown error."
			}

			toast({
				title: "Camera Error",
				description: errorMessage,
				status: "error",
				duration: 5000,
			})
		}
	}

	const stopCamera = () => {
		if (videoRef.current && videoRef.current.srcObject) {
			const stream = videoRef.current.srcObject as MediaStream
			stream.getTracks().forEach((track) => track.stop())
			videoRef.current.srcObject = null
		}
		setIsCameraActive(false)
		onClose()
	}

	const captureImage = async () => {
		if (!videoRef.current || !canvasRef.current) return

		const canvas = canvasRef.current
		const video = videoRef.current
		const context = canvas.getContext("2d")

		if (!context) return

		canvas.width = video.videoWidth
		canvas.height = video.videoHeight
		context.drawImage(video, 0, 0, canvas.width, canvas.height)

		setIsScanning(true)

		const scanningToast = toast({
			title: "Scanning QR Code...",
			description: "Processing ticket QR code",
			status: "loading",
			duration: null,
			isClosable: false,
		})

		try {
			const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
			const code = jsQR(imageData.data, imageData.width, imageData.height)

			toast.close(scanningToast)
			setIsScanning(false)
			stopCamera()

			if (code && code.data) {
				const identifier = code.data.trim()
				console.log("QR code decoded:", identifier)

				setIdentifier(identifier)
				setBookingInfo(null)
				setError("")

				toast({
					title: "QR Code Scanned! ✓",
					description: `Validating ${identifier}...`,
					status: "info",
					duration: 3000,
					isClosable: true,
				})

				setIsValidating(true)
				try {
					const response = await axios.post("/api/check-in/validate", {
						eventId,
						identifier,
					})

					if (response.data.status) {
						setBookingInfo(response.data.data)
						toast({
							title: "Validation Successful! ✓",
							description: `Booking found for ${identifier}`,
							status: "success",
							duration: 3000,
							isClosable: true,
						})
					} else {
						setError(response.data.message)
						toast({
							title: "Validation Failed",
							description: response.data.message,
							status: "error",
							duration: 5000,
							isClosable: true,
						})
					}
				} catch (err: any) {
					const errorMsg = err.response?.data?.message || "Failed to validate booking"
					setError(errorMsg)
					toast({
						title: "Validation Error",
						description: errorMsg,
						status: "error",
						duration: 5000,
						isClosable: true,
					})
				} finally {
					setIsValidating(false)
				}
			} else {
				toast({
					title: "No QR Code Found",
					description: "Could not detect a QR code. Please try again or enter the booking reference manually.",
					status: "error",
					duration: 6000,
					isClosable: true,
				})
			}
		} catch (error: any) {
			console.error("QR scan error:", error)
			setIsScanning(false)
			toast.close(scanningToast)
			stopCamera()
			toast({
				title: "Scan Failed",
				description: error.message || "Failed to scan QR code. Please try again.",
				status: "error",
				duration: 7000,
				isClosable: true,
			})
		}
	}

	return (
		<Box maxW="600px" mx="auto" p={4}>
			<VStack spacing={6} align="stretch">
				{/* Header */}
				<Box textAlign="center">
					<Heading size="lg" mb={2} color="white">
						Event Check-In Portal
					</Heading>
					<Text color="gray.400" fontSize="sm">
						{eventName}
					</Text>
				</Box>

				{/* Search Input */}
				<Card bg="#1E1E1E" border="1px solid #434343">
					<CardBody>
						<VStack spacing={4}>
							<Text fontWeight="bold" alignSelf="flex-start" color="white">
								Enter Email Address
							</Text>
							<Input
								placeholder="Email Address"
								value={identifier}
								onChange={(e) => setIdentifier(e.target.value)}
								onKeyPress={(e) => e.key === "Enter" && handleValidate()}
								size="lg"
								bg="#2A2A2A"
								color="white"
								border="1px solid #434343"
								_focus={{ borderColor: "#F79432" }}
								_placeholder={{ color: "gray.500" }}
							/>

							<HStack width="100%" spacing={2}>
								<Button leftIcon={<SearchIcon />} onClick={handleValidate} isLoading={isValidating} colorScheme="orange" flex={1} size="lg">
									Validate
								</Button>
								<Button onClick={startCamera} colorScheme="blue" size="lg">
									📷 Scan
								</Button>
							</HStack>

							{bookingInfo && (
								<Button onClick={handleReset} variant="ghost" size="sm" width="100%" color="white" _hover={{ bg: "#2A2A2A" }}>
									Search Another Booking
								</Button>
							)}
						</VStack>
					</CardBody>
				</Card>

				{/* Error Display */}
				{error && (
					<Alert status="error" bg="#3D1B1B" border="1px solid #E53E3E">
						<AlertIcon />
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				{/* Booking Info Display */}
				{bookingInfo && (
					<Card bg="#1E1E1E" border="1px solid #434343">
						<CardBody>
							<VStack spacing={4} align="stretch">
								<HStack justify="space-between">
									<Text fontSize="xl" fontWeight="bold" color="white">
										Booking Details
									</Text>
									<Badge colorScheme={bookingInfo.isFullyCheckedIn ? "green" : bookingInfo.checkedInCount > 0 ? "yellow" : "gray"} fontSize="sm" px={3} py={1}>
										{bookingInfo.isFullyCheckedIn ? "Fully Checked In" : bookingInfo.checkedInCount > 0 ? "Partially Checked In" : "Not Checked In"}
									</Badge>
								</HStack>

								<Divider />

								<Box>
									<Text fontSize="sm" color="gray.400">
										Name
									</Text>
									<Text fontSize="lg" fontWeight="semibold" color="white">
										{bookingInfo.customerName}
									</Text>
								</Box>

								<Box>
									<Text fontSize="sm" color="gray.400">
										Email
									</Text>
									<Text color="white">{bookingInfo.customerEmail}</Text>
								</Box>

								<Box>
									<Text fontSize="sm" color="gray.400">
										Booking Reference
									</Text>
									<Text fontFamily="mono" fontWeight="bold" color="#F79432">
										{bookingInfo.bookingRef}
									</Text>
								</Box>

								<Divider />

								{/* Ticket Status */}
								<HStack justify="space-between" p={3} bg="#2A2A2A" borderRadius="md">
									<VStack align="flex-start" spacing={0}>
										<Text fontSize="sm" color="gray.400">
											Total Tickets
										</Text>
										<Text fontSize="2xl" color="gray.300" fontWeight="bold">
											{bookingInfo.totalTickets}
										</Text>
									</VStack>
									<VStack align="flex-start" spacing={0}>
										<Text fontSize="sm" color="gray.400">
											Checked In
										</Text>
										<Text fontSize="2xl" fontWeight="bold" color="green.400">
											{bookingInfo.checkedInCount}
										</Text>
									</VStack>
									<VStack align="flex-start" spacing={0}>
										<Text fontSize="sm" color="gray.400">
											Remaining
										</Text>
										<Text fontSize="2xl" fontWeight="bold" color="orange.400">
											{bookingInfo.remainingTickets}
										</Text>
									</VStack>
								</HStack>

								{/* Check-In Action */}
								{!bookingInfo.isFullyCheckedIn && (
									<Box p={4} bg="#2A2A2A" borderRadius="md">
										<VStack spacing={4} align="stretch">
											<Box>
												<Text fontWeight="semibold" color="white" mb={2}>
													Number of Guests Checking In
												</Text>
												<NumberInput value={guestCount} onChange={(valueString) => setGuestCount(Number(valueString))} min={1} max={bookingInfo.remainingTickets} size="lg" bg="#1E1E1E">
													<NumberInputField color="white" borderColor="#434343" _focus={{ borderColor: "#F79432" }} />
													<NumberInputStepper>
														<NumberIncrementStepper color="white" borderColor="#434343" />
														<NumberDecrementStepper color="white" borderColor="#434343" />
													</NumberInputStepper>
												</NumberInput>
												<Text fontSize="sm" color="gray.400" mt={2}>
													Maximum: {bookingInfo.remainingTickets} guest{bookingInfo.remainingTickets > 1 ? "s" : ""}
												</Text>
											</Box>

											{/* Optional Guest Details Collection - Only show if more than 1 ticket */}
											{bookingInfo.totalTickets > 1 && (
												<Box>
													<HStack spacing={2} mb={2}>
														<input
															type="checkbox"
															checked={collectGuestDetails}
															onChange={(e) => {
																setCollectGuestDetails(e.target.checked)
																if (e.target.checked) {
																	// Initialize guest details array with first guest pre-filled
																	setGuestDetails(
																		Array.from({ length: guestCount }, (_, i) => {
																			if (i === 0) {
																				// First guest gets booking owner's info
																				return {
																					name: bookingInfo.customerName,
																					email: bookingInfo.customerEmail,
																					phone: bookingInfo.customerPhone,
																				}
																			}
																			// Other guests start empty
																			return {
																				name: "",
																				email: "",
																				phone: "",
																			}
																		}),
																	)
																} else {
																	setGuestDetails([])
																}
															}}
															style={{ cursor: "pointer" }}
														/>
														<Text color="white" fontSize="sm">
															Collect guest details (optional)
														</Text>
													</HStack>

													{collectGuestDetails && (
														<VStack spacing={3} align="stretch" mt={3}>
															{Array.from({ length: guestCount }).map((_, index) => (
																<Box key={index} p={3} bg="#1E1E1E" borderRadius="md" border="1px solid #434343">
																	<HStack justify="space-between" mb={2}>
																		<Text fontSize="sm" fontWeight="bold" color="white">
																			Guest {index + 1}
																		</Text>
																		{index === 0 && (
																			<Badge colorScheme="blue" fontSize="xs">
																				Booking Owner
																			</Badge>
																		)}
																	</HStack>
																	<VStack spacing={2}>
																		<Input
																			placeholder="Full Name"
																			value={guestDetails[index]?.name || ""}
																			onChange={(e) => {
																				const newDetails = [...guestDetails]
																				if (!newDetails[index]) newDetails[index] = { name: "", email: "", phone: "" }
																				newDetails[index].name = e.target.value
																				setGuestDetails(newDetails)
																			}}
																			size="sm"
																			bg="#2A2A2A"
																			color="white"
																			borderColor="#434343"
																			_focus={{ borderColor: "#F79432" }}
																			_placeholder={{ color: "gray.500" }}
																		/>
																		<Input
																			placeholder="Email Address"
																			type="email"
																			value={guestDetails[index]?.email || ""}
																			onChange={(e) => {
																				const newDetails = [...guestDetails]
																				if (!newDetails[index]) newDetails[index] = { name: "", email: "", phone: "" }
																				newDetails[index].email = e.target.value
																				setGuestDetails(newDetails)
																			}}
																			size="sm"
																			bg="#2A2A2A"
																			color="white"
																			borderColor="#434343"
																			_focus={{ borderColor: "#F79432" }}
																			_placeholder={{ color: "gray.500" }}
																		/>
																		<Input
																			placeholder="Phone Number"
																			type="tel"
																			value={guestDetails[index]?.phone || ""}
																			onChange={(e) => {
																				const newDetails = [...guestDetails]
																				if (!newDetails[index]) newDetails[index] = { name: "", email: "", phone: "" }
																				newDetails[index].phone = e.target.value
																				setGuestDetails(newDetails)
																			}}
																			size="sm"
																			bg="#2A2A2A"
																			color="white"
																			borderColor="#434343"
																			_focus={{ borderColor: "#F79432" }}
																			_placeholder={{ color: "gray.500" }}
																		/>
																	</VStack>
																</Box>
															))}
														</VStack>
													)}
												</Box>
											)}

											<Button leftIcon={<CheckCircleIcon />} onClick={handleCheckIn} isLoading={isCheckingIn} colorScheme="green" size="lg" width="100%">
												Check In {guestCount} Guest{guestCount > 1 ? "s" : ""}
											</Button>
										</VStack>
									</Box>
								)}

								{/* Check-In History */}
								{bookingInfo.checkInHistory.length > 0 && (
									<Box>
										<Text fontWeight="semibold" mb={2} color="white">
											Check-In History
										</Text>
										<VStack spacing={2} align="stretch">
											{bookingInfo.checkInHistory.map((entry, index) => (
												<Box key={index} p={2} bg="#2A2A2A" borderRadius="md" fontSize="sm">
													<HStack justify="space-between">
														<Text color="white">
															<strong>{entry.count}</strong> guest{entry.count > 1 ? "s" : ""}
														</Text>
														<Text color="gray.400">{dayjs(entry.timestamp).format("MMM DD, h:mm A")}</Text>
													</HStack>
													<Text color="gray.500" fontSize="xs">
														by {entry.adminName}
													</Text>
												</Box>
											))}
										</VStack>
									</Box>
								)}
							</VStack>
						</CardBody>
					</Card>
				)}

				{/* Guest List Section */}
				{guestList.length > 0 && (
					<Card bg="#1E1E1E" border="1px solid #434343">
						<CardBody>
							<VStack spacing={4} align="stretch">
								<HStack justify="space-between">
									<Text fontSize="xl" fontWeight="bold" color="white">
										Checked-In Guests
									</Text>
									<Badge colorScheme="blue" fontSize="sm" px={3} py={1}>
										{guestList.length} Guest{guestList.length > 1 ? "s" : ""}
									</Badge>
								</HStack>

								<Divider />

								{isLoadingGuests ? (
									<HStack justify="center" py={4}>
										<Spinner size="md" color="#F79432" />
										<Text color="gray.400">Loading guests...</Text>
									</HStack>
								) : (
									<VStack spacing={2} align="stretch" maxH="400px" overflowY="auto">
										{guestList.map((guest) => (
											<Box key={guest.id} p={3} bg="#2A2A2A" borderRadius="md">
												<HStack justify="space-between" mb={1}>
													<Text fontWeight="semibold" color="white">
														{guest.guestName}
													</Text>
													<Text fontSize="xs" color="gray.500">
														{dayjs(guest.checkedInAt).format("MMM DD, h:mm A")}
													</Text>
												</HStack>
												<Text fontSize="sm" color="gray.400">
													📧 {guest.guestEmail}
												</Text>
												<Text fontSize="sm" color="gray.400">
													📱 {guest.guestPhone}
												</Text>
												<Text fontSize="xs" color="gray.500" mt={1}>
													Booking: {guest.bookingEmail} • By: {guest.checkedInBy}
												</Text>
											</Box>
										))}
									</VStack>
								)}
							</VStack>
						</CardBody>
					</Card>
				)}
			</VStack>

			{/* Camera Modal */}
			<Modal isOpen={isOpen} onClose={stopCamera} size="full">
				<ModalOverlay />
				<ModalContent bg="#000">
					<ModalHeader color="white">Scan Email Address</ModalHeader>
					<ModalCloseButton color="white" />
					<ModalBody display="flex" flexDirection="column" alignItems="center" justifyContent="center" p={4}>
						<VStack spacing={4} width="100%" maxW="600px">
							<Box position="relative" width="100%" bg="#000" borderRadius="8px" border="2px solid #F79432" overflow="hidden">
								{!isCameraActive && (
									<Box position="absolute" top="50%" left="50%" transform="translate(-50%, -50%)" zIndex={2}>
										<Spinner size="xl" color="#F79432" />
									</Box>
								)}
								<video
									ref={videoRef}
									autoPlay
									playsInline
									muted
									style={{
										display: "block",
										width: "100%",
										height: "auto",
										minHeight: "250px",
										maxHeight: "400px",
										objectFit: "cover",
										aspectRatio: "4/3",
									}}
								/>
								<canvas ref={canvasRef} style={{ display: "none" }} />
							</Box>
							<Text color="gray.400" textAlign="center">
								Position the email address within the camera view
							</Text>
							{isCameraActive && (
								<Text color="green.400" textAlign="center" fontSize="sm">
									📹 Camera Active - Video dimensions: {videoRef.current?.videoWidth || 0} x {videoRef.current?.videoHeight || 0}
								</Text>
							)}
						</VStack>
					</ModalBody>
					<ModalFooter>
						<Button colorScheme="orange" mr={3} onClick={captureImage} isLoading={isScanning} loadingText="Scanning..." disabled={isScanning}>
							Capture & Scan
						</Button>
						<Button variant="ghost" onClick={stopCamera} disabled={isScanning}>
							Cancel
						</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>
		</Box>
	)
}

export default CheckInPortal

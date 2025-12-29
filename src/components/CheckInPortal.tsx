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
	SimpleGrid,
} from "@chakra-ui/react"
import { CheckCircleIcon, CloseIcon, SearchIcon } from "@chakra-ui/icons"
import axios from "axios"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)
import Tesseract from "tesseract.js"
import { Html5Qrcode } from "html5-qrcode"
import { useSession } from "next-auth/react"

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
	const { data: session } = useSession()
	const [identifier, setIdentifier] = useState("")
	const [bookingInfo, setBookingInfo] = useState<BookingInfo | null>(null)
	const [guestCount, setGuestCount] = useState(1)
	const [isValidating, setIsValidating] = useState(false)
	const [isCheckingIn, setIsCheckingIn] = useState(false)
	const [error, setError] = useState("")
	const [isCameraActive, setIsCameraActive] = useState(false)
	const [isScanning, setIsScanning] = useState(false)
	// Removed OCR scanning - only QR code scanning is used
	const [collectGuestDetails, setCollectGuestDetails] = useState(false)
	const [guestDetails, setGuestDetails] = useState<GuestDetail[]>([])
	const [guestList, setGuestList] = useState<EventGuest[]>([])
	const [isLoadingGuests, setIsLoadingGuests] = useState(false)
	const [qrScanResult, setQrScanResult] = useState<any>(null)
	const [isQrModalOpen, setIsQrModalOpen] = useState(false)

	const toast = useToast()
	const { isOpen, onOpen, onClose } = useDisclosure()
	const videoRef = useRef<HTMLVideoElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const qrCodeScannerRef = useRef<Html5Qrcode | null>(null)
	const qrCodeReaderRef = useRef<HTMLDivElement>(null)

	const fetchGuestList = useCallback(async () => {
		// Only fetch guest list for admin users
		// @ts-ignore
		const userRole = session?.user?.role
		const isAdmin = userRole === "admin" || userRole === "super admin"
		
		if (!isAdmin) {
			// Non-admin users don't have access to guest list
			return
		}

		setIsLoadingGuests(true)
		try {
			const response = await axios.get(`/api/check-in/guests?eventId=${eventId}`)
			if (response.data.status) {
				setGuestList(response.data.data.guests || [])
			}
		} catch (err: any) {
			// Handle 403 errors gracefully (non-admin users)
			if (err.response?.status === 403) {
				console.log("Guest list access denied (admin only)")
			} else {
				console.error("Failed to fetch guest list:", err)
			}
		} finally {
			setIsLoadingGuests(false)
		}
	}, [eventId, session])

	// Fetch guest list on mount (only for admins)
	useEffect(() => {
		if (session) {
			fetchGuestList()
		}
	}, [fetchGuestList, session])

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

	// Validate booking by identifier (email or booking ref)
	const validateBooking = async (identifier: string) => {
		if (!identifier.trim()) {
			setError("Please provide an email or booking reference")
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

	const startCamera = async () => {
		onOpen()
		setIsCameraActive(false)
		setIsScanning(false)

		// Start QR scanner
		setTimeout(() => {
			startQRScanner()
		}, 100)
	}

	const startVideoCamera = async () => {
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

			// Wait a bit for modal to render (modal should already be open)
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
		// Stop QR scanner if active
		if (qrCodeScannerRef.current) {
			qrCodeScannerRef.current
				.stop()
				.then(() => {
					console.log("QR scanner stopped")
					qrCodeScannerRef.current = null
				})
				.catch((err: any) => {
					console.error("Error stopping QR scanner:", err)
				})
		}

		// Stop video stream if active
		if (videoRef.current && videoRef.current.srcObject) {
			const stream = videoRef.current.srcObject as MediaStream
			stream.getTracks().forEach((track) => track.stop())
			videoRef.current.srcObject = null
		}
		setIsCameraActive(false)
		onClose()
	}

	// Check camera permissions
	const checkCameraPermissions = async (): Promise<boolean> => {
		try {
			// Check if permissions API is available
			if (navigator.permissions) {
				const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName })
				console.log("Camera permission status:", permissionStatus.state)
				
				if (permissionStatus.state === 'denied') {
					return false
				}
			}
			
			// Try to access camera to trigger permission prompt
			try {
				const stream = await navigator.mediaDevices.getUserMedia({ video: true })
				// If successful, stop the stream immediately (we just needed permission)
				stream.getTracks().forEach(track => track.stop())
				return true
			} catch (err: any) {
				if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
					return false
				}
				// Other errors might be temporary, allow to proceed
				return true
			}
		} catch (err) {
			console.warn("Could not check camera permissions:", err)
			// If permission API not available, try anyway
			return true
		}
	}

	// Start QR code scanner
	const startQRScanner = async () => {
		try {
			// Wait for modal and element to render
			let retries = 0
			const maxRetries = 10
			while (retries < maxRetries) {
				const element = document.getElementById("qr-reader")
				if (element && qrCodeReaderRef.current) {
					break
				}
				await new Promise((resolve) => setTimeout(resolve, 100))
				retries++
			}
			
			const element = document.getElementById("qr-reader")
			if (!element) {
				throw new Error("QR scanner element not found. Please try again.")
			}
			
			if (!qrCodeReaderRef.current) {
				throw new Error("QR reader container not available. Please refresh the page.")
			}

			// Clear any existing scanner
			if (qrCodeScannerRef.current) {
				try {
					await qrCodeScannerRef.current.stop()
				} catch (e) {
					// Ignore stop errors
					console.debug("Error stopping previous scanner:", e)
				}
				qrCodeScannerRef.current = null
			}

			// Check camera permissions first
			const hasPermission = await checkCameraPermissions()
			if (!hasPermission) {
				// Don't throw error, just show user-friendly message
				setIsCameraActive(false)
				toast({
					title: "Camera Permission Denied",
					description: "Please allow camera access to use the QR scanner.",
					status: "error",
					duration: 10000,
					isClosable: true,
				})
				
				// Show additional help toast
				setTimeout(() => {
					toast({
						title: "How to Fix Camera Permission",
						description: "1. Look for camera icon in browser address bar\n2. Click it and select 'Allow'\n3. Or go to browser Settings → Privacy → Camera\n4. Allow access for this site\n5. Refresh page and try again",
						status: "info",
						duration: 15000,
						isClosable: true,
					})
				}, 500)
				return // Exit early, don't throw error
			}

			// Check if camera is available
			let devices
			try {
				devices = await Html5Qrcode.getCameras()
			} catch (err: any) {
				if (err.name === 'NotAllowedError' || err.message?.includes('permission') || err.message?.includes('Permission denied')) {
					// Don't throw error, just show user-friendly message
					setIsCameraActive(false)
					toast({
						title: "Camera Permission Denied",
						description: "Please allow camera access to use the QR scanner.",
						status: "error",
						duration: 10000,
						isClosable: true,
					})
					
					setTimeout(() => {
						toast({
							title: "How to Fix Camera Permission",
							description: "1. Look for camera icon in browser address bar\n2. Click it and select 'Allow'\n3. Or go to browser Settings → Privacy → Camera\n4. Allow access for this site\n5. Refresh page and try again",
							status: "info",
							duration: 15000,
							isClosable: true,
						})
					}, 500)
					return // Exit early, don't throw error
				}
				throw err // Re-throw other errors
			}
			
			if (!devices || devices.length === 0) {
				throw new Error("No camera found. Please connect a camera and try again.")
			}

			console.log("Available cameras:", devices.length)

			const qrCode = new Html5Qrcode("qr-reader")
			qrCodeScannerRef.current = qrCode

			// Try to start with environment camera (back camera), fallback to any camera
			let cameraId: string | { facingMode: string } = { facingMode: "environment" }
			
			// Try to find back camera first
			const backCamera = devices.find((device: any) => 
				device.label?.toLowerCase().includes("back") || 
				device.label?.toLowerCase().includes("rear") ||
				device.label?.toLowerCase().includes("environment")
			)
			
			if (backCamera) {
				cameraId = backCamera.id
				console.log("Using back camera:", backCamera.label)
			} else if (devices.length > 0) {
				cameraId = devices[0].id
				console.log("Using camera:", devices[0].label || devices[0].id)
			}

			await qrCode.start(
				cameraId,
				{
					fps: 10,
					qrbox: { width: 250, height: 250 },
					aspectRatio: 1.0,
				},
				(qrMessage: string) => {
					// QR code detected
					console.log("QR code detected:", qrMessage)
					handleQRCodeDetected(qrMessage)
				},
				(errorMessage: string) => {
					// Ignore scanning errors (they're frequent during scanning)
					// Only log if it's not a "NotFoundException" (normal during scanning)
					if (!errorMessage.includes("NotFoundException") && 
					    !errorMessage.includes("No MultiFormat Readers")) {
						console.debug("QR scan error:", errorMessage)
					}
				}
			)

			setIsCameraActive(true)
			console.log("QR scanner started successfully")
		} catch (err: any) {
			console.error("QR scanner error:", err)
			
			// Provide more helpful error messages
			let errorMessage = "Failed to start QR scanner"
			let showPermissionHelp = false
			
			if (err.message === "PERMISSION_DENIED" || 
			    err.name === "NotAllowedError" || 
			    err.message?.includes("permission") ||
			    err.message?.includes("Permission denied")) {
				errorMessage = "Camera permission denied"
				showPermissionHelp = true
			} else if (err.name === "NotFoundError" || err.message?.includes("camera")) {
				errorMessage = "No camera found. Please connect a camera and try again."
			} else if (err.message?.includes("element")) {
				errorMessage = "Scanner element not found. Please refresh the page and try again."
			} else if (err.message) {
				errorMessage = err.message
			}
			
			if (showPermissionHelp) {
				// Show detailed permission help
				toast({
					title: "Camera Permission Denied",
					description: "Please allow camera access to use the QR scanner.",
					status: "error",
					duration: 10000,
					isClosable: true,
				})
				
				// Show additional help toast
				setTimeout(() => {
					toast({
						title: "How to Fix Camera Permission",
						description: "1. Look for camera icon in browser address bar\n2. Click it and select 'Allow'\n3. Or go to browser Settings → Privacy → Camera\n4. Allow access for this site\n5. Refresh page and try again",
						status: "info",
						duration: 15000,
						isClosable: true,
					})
				}, 500)
			} else {
				toast({
					title: "QR Scanner Error",
					description: errorMessage,
					status: "error",
					duration: 7000,
					isClosable: true,
				})
			}
			
			setIsCameraActive(false)
		}
	}

	// Handle QR code detection
	const handleQRCodeDetected = async (qrPayload: string) => {
		if (isScanning) return // Prevent multiple simultaneous scans

		setIsScanning(true)
		stopCamera() // Stop scanner after detection

		const scanningToast = toast({
			title: "Verifying QR Code...",
			description: "Processing ticket information",
			status: "loading",
			duration: null,
			isClosable: false,
		})

		try {
			// Verify QR code via API
			const response = await axios.post("/api/check-in/verify-qr", {
				qrPayload,
				eventId,
			})

			toast.close(scanningToast)

			if (response.data.status) {
				const bookingData = response.data.data
				// Set QR scan result and show popup modal
				setQrScanResult(bookingData)
				setIsQrModalOpen(true)
				
				// Reset guest count and details for new scan
				setGuestCount(1)
				setCollectGuestDetails(false)
				setGuestDetails([])
				
				// Set booking info directly from QR scan result (no need for additional validation)
				setBookingInfo({
					bookingId: bookingData.bookingId,
					bookingRef: bookingData.bookingRef,
					customerName: bookingData.customerName,
					customerEmail: bookingData.customerEmail,
					customerPhone: bookingData.customerPhone,
					totalTickets: bookingData.totalTickets,
					checkedInCount: bookingData.checkedInCount || 0,
					remainingTickets: bookingData.remainingTickets || bookingData.totalTickets,
					isFullyCheckedIn: bookingData.isFullyCheckedIn || false,
					firstCheckInAt: bookingData.firstCheckInAt,
					lastCheckInAt: bookingData.lastCheckInAt,
					checkInHistory: bookingData.checkInHistory || [],
					bookingStatus: bookingData.status,
				})
				
				toast({
					title: "QR Code Verified",
					description: "Ticket information loaded successfully",
					status: "success",
					duration: 3000,
				})
			} else {
				toast({
					title: "Invalid QR Code",
					description: response.data.message || "This QR code is not valid for this event",
					status: "error",
					duration: 5000,
				})
			}
		} catch (err: any) {
			toast.close(scanningToast)
			toast({
				title: "Verification Failed",
				description: err.response?.data?.message || err.message || "Failed to verify QR code",
				status: "error",
				duration: 5000,
			})
		} finally {
			setIsScanning(false)
		}
	}

	// Handle check-in from QR modal
	const handleQRCheckIn = async () => {
		if (!qrScanResult) return

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

		if (guestCount > qrScanResult.remainingTickets) {
			toast({
				title: "Invalid Guest Count",
				description: `Cannot check in more than ${qrScanResult.remainingTickets} remaining guest${qrScanResult.remainingTickets > 1 ? "s" : ""}`,
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
				bookingId: qrScanResult.bookingId,
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
					title: "Check-In Successful ✓",
					description: `${guestCount} guest${guestCount > 1 ? "s" : ""} checked in successfully`,
					status: "success",
					duration: 5000,
					isClosable: true,
				})

				// Update QR scan result with new data
				setQrScanResult({
					...qrScanResult,
					...response.data.data,
					isAlreadyCheckedIn: response.data.data.isFullyCheckedIn || false,
					status: response.data.data.isFullyCheckedIn ? "checked_in" : qrScanResult.status,
				})

				// Update booking info
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

	const captureImage = async () => {
		if (!videoRef.current || !canvasRef.current) return

		const canvas = canvasRef.current
		const video = videoRef.current
		const context = canvas.getContext("2d")

		if (!context) return

		canvas.width = video.videoWidth
		canvas.height = video.videoHeight
		context.drawImage(video, 0, 0, canvas.width, canvas.height)

		// Set scanning state to show loader
		setIsScanning(true)

		// Show scanning toast
		const scanningToast = toast({
			title: "Scanning Image...",
			description: "Processing ticket for booking details",
			status: "loading",
			duration: null, // Don't auto-dismiss
			isClosable: false,
		})

		try {
			// Use simpler Tesseract.recognize() approach
			Tesseract.recognize(canvas, "eng", {
				logger: (m: any) => {
					console.log("Tesseract:", m)
					// Update toast with progress
					if (m.status === "recognizing text") {
						toast.update(scanningToast, {
							title: "Reading Text...",
							description: `Progress: ${Math.round(m.progress * 100)}%`,
							status: "loading",
						})
					}
				},
			})
				.then(({ data: { text } }) => {
					console.log("Extracted text:", text)

					// Only look for email addresses
					const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
					const emailMatches = text.match(emailPattern)

					let foundEmail = null

					if (emailMatches && emailMatches[0]) {
						foundEmail = emailMatches[0].toLowerCase()
						console.log("Found email:", foundEmail)
					}

					// Close scanning toast
					toast.close(scanningToast)
					setIsScanning(false)

					// Stop camera
					stopCamera()

					if (foundEmail) {
						// Populate the input field
						setIdentifier(foundEmail)
						// Clear any previous booking info and errors
						setBookingInfo(null)
						setError("")

						toast({
							title: "Email Detected! ✓",
							description: `Validating ${foundEmail}...`,
							status: "info",
							duration: 3000,
							isClosable: true,
						})

						// Auto-validate the email
						setTimeout(async () => {
							setIsValidating(true)

							try {
								const response = await axios.post("/api/check-in/validate", {
									eventId,
									identifier: foundEmail,
								})

								if (response.data.status) {
									setBookingInfo(response.data.data)
									toast({
										title: "Validation Successful! ✓",
										description: `Booking found for ${foundEmail}`,
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
						}, 500)
					} else {
						toast({
							title: "No Email Found",
							description: "Could not find an email address in the image. Please try again or enter manually.",
							status: "error",
							duration: 6000,
							isClosable: true,
						})
					}
				})
				.catch((error: any) => {
					console.error("OCR Error:", error)
					setIsScanning(false)
					toast.close(scanningToast)
					stopCamera()
					toast({
						title: "Scan Failed",
						description: error.message || "Failed to process image. Please try again.",
						status: "error",
						duration: 7000,
						isClosable: true,
					})
				})
		} catch (error: any) {
			console.error("OCR Setup Error:", error)
			setIsScanning(false)
			toast.close(scanningToast)
			stopCamera()
			toast({
				title: "Scan Failed",
				description: error.message || "Failed to initialize scanner. Please try again.",
				status: "error",
				duration: 7000,
				isClosable: true,
			})
		}
	}

	return (
		<Box maxW="800px" mx="auto" px={{ base: 4, md: 6 }} py={4}>
			<VStack spacing={6} align="stretch">
				{/* Header */}
				<Box textAlign="center" mb={2}>
					<Heading size="lg" mb={2} color="#1F2937" fontWeight="bold">
						Check-In Portal
					</Heading>
					<Text color="#6B7280" fontSize="md" fontWeight="medium">
						{eventName}
					</Text>
				</Box>

				{/* Search Input Card */}
				<Card bg="white" borderRadius="xl" boxShadow="lg" border="1px solid #E5E7EB" transition="all 0.2s">
					<CardBody p={{ base: 5, md: 6 }}>
						<VStack spacing={5}>
							<HStack width="100%" justify="space-between" mb={1}>
								<Text fontWeight="semibold" fontSize="md" color="#1F2937">
									Scan QR Code
								</Text>
								{bookingInfo && (
									<Badge colorScheme="green" fontSize="xs" px={2} py={1} borderRadius="md">
										✓ Found
									</Badge>
								)}
							</HStack>

							{/* Manual email/booking validation removed - only QR scanning is available */}
							<Button
								onClick={startCamera}
								size="lg"
								height="56px"
								width="100%"
								bg="linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)"
								color="white"
								fontSize="md"
								fontWeight="semibold"
								borderRadius="lg"
								_hover={{ bg: "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)", transform: "translateY(-1px)", boxShadow: "md" }}
								_active={{ transform: "translateY(0)" }}
								transition="all 0.2s"
								leftIcon={<Text fontSize="xl">📸</Text>}
							>
								Scan QR Code
							</Button>

							{bookingInfo && (
								<Button onClick={handleReset} variant="ghost" size="md" width="100%" color="#6B7280" fontWeight="medium" _hover={{ bg: "#F3F4F6", color: "#1F2937" }} borderRadius="lg">
									← Search Another Booking
								</Button>
							)}
						</VStack>
					</CardBody>
				</Card>

				{/* Error Display */}
				{error && (
					<Alert status="error" bg="#FEE2E2" border="1px solid #FCA5A5" borderRadius="lg" py={4}>
						<AlertIcon color="#DC2626" />
						<AlertDescription color="#991B1B" fontWeight="medium">
							{error}
						</AlertDescription>
					</Alert>
				)}

				{/* Booking Info Display */}
				{bookingInfo && (
					<Card bg="white" borderRadius="xl" boxShadow="lg" border="1px solid #E5E7EB">
						<CardBody p={{ base: 5, md: 6 }}>
							<VStack spacing={5} align="stretch">
								<HStack justify="space-between" flexWrap="wrap" gap={2}>
									<Text fontSize="xl" fontWeight="bold" color="#1F2937">
										Booking Details
									</Text>
									<Badge
										colorScheme={bookingInfo.isFullyCheckedIn ? "green" : bookingInfo.checkedInCount > 0 ? "purple" : "gray"}
										fontSize="sm"
										px={4}
										py={2}
										borderRadius="full"
										fontWeight="semibold"
									>
										{bookingInfo.isFullyCheckedIn ? "✓ Fully Checked In" : bookingInfo.checkedInCount > 0 ? "⚡ Partial Check-In" : "⏳ Not Checked In"}
									</Badge>
								</HStack>

								<Divider borderColor="#E5E7EB" />

								<SimpleGrid columns={{ base: 1, sm: 2 }} spacing={4}>
									<Box p={4} bg="#F9FAFB" borderRadius="lg" border="1px solid #E5E7EB">
										<Text fontSize="xs" color="#6B7280" fontWeight="semibold" textTransform="uppercase" letterSpacing="wide" mb={2}>
											Guest Name
										</Text>
										<Text fontSize="lg" fontWeight="bold" color="#1F2937">
											{bookingInfo.customerName}
										</Text>
									</Box>

									<Box p={4} bg="#F9FAFB" borderRadius="lg" border="1px solid #E5E7EB">
										<Text fontSize="xs" color="#6B7280" fontWeight="semibold" textTransform="uppercase" letterSpacing="wide" mb={2}>
											Booking Reference
										</Text>
										<Text fontSize="lg" fontWeight="bold" color="#8B5CF6" fontFamily="mono">
											{bookingInfo.bookingRef}
										</Text>
									</Box>
								</SimpleGrid>

								<Box p={4} bg="#F9FAFB" borderRadius="lg" border="1px solid #E5E7EB">
									<Text fontSize="xs" color="#6B7280" fontWeight="semibold" textTransform="uppercase" letterSpacing="wide" mb={2}>
										Contact Information
									</Text>
									<VStack align="flex-start" spacing={1}>
										<Text color="#1F2937" fontSize="sm">
											📧 {bookingInfo.customerEmail}
										</Text>
										<Text color="#1F2937" fontSize="sm">
											📱 {bookingInfo.customerPhone}
										</Text>
									</VStack>
								</Box>

								<Divider borderColor="#E5E7EB" />

								{/* Ticket Status */}
								<Box p={5} bg="linear-gradient(135deg, #F9FAFB 0%, #F3F4F6 100%)" borderRadius="xl" border="1px solid #E5E7EB">
									<Text fontSize="sm" fontWeight="semibold" color="#6B7280" mb={4} textTransform="uppercase" letterSpacing="wide">
										Ticket Status
									</Text>
									<SimpleGrid columns={3} spacing={4}>
										<VStack spacing={1}>
											<Box p={3} bg="white" borderRadius="lg" boxShadow="sm" width="100%" textAlign="center">
												<Text fontSize="xs" color="#6B7280" fontWeight="medium" mb={1}>
													Total
												</Text>
												<Text fontSize="3xl" color="#1F2937" fontWeight="bold">
													{bookingInfo.totalTickets}
												</Text>
											</Box>
										</VStack>
										<VStack spacing={1}>
											<Box p={3} bg="linear-gradient(135deg, #10B981 0%, #059669 100%)" borderRadius="lg" boxShadow="sm" width="100%" textAlign="center">
												<Text fontSize="xs" color="white" fontWeight="medium" mb={1}>
													Checked In
												</Text>
												<Text fontSize="3xl" fontWeight="bold" color="white">
													{bookingInfo.checkedInCount}
												</Text>
											</Box>
										</VStack>
										<VStack spacing={1}>
											<Box p={3} bg="linear-gradient(135deg, #F59E0B 0%, #D97706 100%)" borderRadius="lg" boxShadow="sm" width="100%" textAlign="center">
												<Text fontSize="xs" color="white" fontWeight="medium" mb={1}>
													Remaining
												</Text>
												<Text fontSize="3xl" fontWeight="bold" color="white">
													{bookingInfo.remainingTickets}
												</Text>
											</Box>
										</VStack>
									</SimpleGrid>
								</Box>

								{/* Check-In Action */}
								{!bookingInfo.isFullyCheckedIn && (
									<Box p={5} bg="#F9FAFB" borderRadius="xl" border="2px solid #8B5CF6">
										<VStack spacing={5} align="stretch">
											<HStack>
												<Box bg="#8B5CF6" p={2} borderRadius="lg">
													<CheckCircleIcon color="white" boxSize={5} />
												</Box>
												<Text fontWeight="bold" fontSize="lg" color="#1F2937">
													Check-In Guests
												</Text>
											</HStack>

											<Box>
												<Text fontWeight="semibold" color="#1F2937" mb={3} fontSize="sm">
													Number of Guests Arriving
												</Text>
												<NumberInput value={guestCount} onChange={(valueString) => setGuestCount(Number(valueString))} min={1} max={bookingInfo.remainingTickets} size="lg">
													<NumberInputField
														color="#1F2937"
														bg="white"
														border="2px solid #E5E7EB"
														borderRadius="lg"
														height="56px"
														fontSize="xl"
														fontWeight="bold"
														textAlign="center"
														_hover={{ borderColor: "#D1D5DB" }}
														_focus={{
															borderColor: "#8B5CF6",
															boxShadow: "0 0 0 3px rgba(139, 92, 246, 0.1)",
														}}
													/>
													<NumberInputStepper>
														<NumberIncrementStepper color="#8B5CF6" borderColor="#E5E7EB" _hover={{ bg: "#F3F4F6" }} />
														<NumberDecrementStepper color="#8B5CF6" borderColor="#E5E7EB" _hover={{ bg: "#F3F4F6" }} />
													</NumberInputStepper>
												</NumberInput>
												<HStack justify="space-between" mt={2}>
													<Text fontSize="sm" color="#6B7280">
														Maximum: {bookingInfo.remainingTickets} guest{bookingInfo.remainingTickets > 1 ? "s" : ""}
													</Text>
													<Text fontSize="sm" fontWeight="semibold" color="#8B5CF6">
														{guestCount} selected
													</Text>
												</HStack>
											</Box>

											{/* Optional Guest Details Collection */}
											{bookingInfo.totalTickets > 1 && (
												<Box p={4} bg="white" borderRadius="lg" border="1px solid #E5E7EB">
													<HStack spacing={3} mb={3}>
														<input
															type="checkbox"
															checked={collectGuestDetails}
															onChange={(e) => {
																setCollectGuestDetails(e.target.checked)
																if (e.target.checked) {
																	setGuestDetails(
																		Array.from({ length: guestCount }, (_, i) => {
																			if (i === 0) {
																				return {
																					name: bookingInfo.customerName,
																					email: bookingInfo.customerEmail,
																					phone: bookingInfo.customerPhone,
																				}
																			}
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
															style={{
																cursor: "pointer",
																width: "20px",
																height: "20px",
																accentColor: "#8B5CF6",
															}}
														/>
														<VStack align="flex-start" spacing={0}>
															<Text color="#1F2937" fontSize="sm" fontWeight="semibold">
																Collect individual guest details
															</Text>
															<Text color="#6B7280" fontSize="xs">
																Optional: Record name, email & phone for each guest
															</Text>
														</VStack>
													</HStack>

													{collectGuestDetails && (
														<VStack spacing={3} align="stretch" mt={4}>
															{Array.from({ length: guestCount }).map((_, index) => (
																<Box key={index} p={4} bg="#F9FAFB" borderRadius="lg" border="1px solid #E5E7EB">
																	<HStack justify="space-between" mb={3}>
																		<HStack>
																			<Box bg="#8B5CF6" color="white" fontWeight="bold" fontSize="sm" w={8} h={8} borderRadius="full" display="flex" alignItems="center" justifyContent="center">
																				{index + 1}
																			</Box>
																			<Text fontSize="sm" fontWeight="semibold" color="#1F2937">
																				Guest {index + 1}
																			</Text>
																		</HStack>
																		{index === 0 && (
																			<Badge colorScheme="purple" fontSize="xs" borderRadius="md">
																				Booking Owner
																			</Badge>
																		)}
																	</HStack>
																	<VStack spacing={3}>
																		<Input
																			placeholder="Full Name"
																			value={guestDetails[index]?.name || ""}
																			onChange={(e) => {
																				const newDetails = [...guestDetails]
																				if (!newDetails[index]) newDetails[index] = { name: "", email: "", phone: "" }
																				newDetails[index].name = e.target.value
																				setGuestDetails(newDetails)
																			}}
																			size="md"
																			bg="white"
																			color="#1F2937"
																			border="1px solid #E5E7EB"
																			borderRadius="lg"
																			_hover={{ borderColor: "#D1D5DB" }}
																			_focus={{
																				borderColor: "#8B5CF6",
																				boxShadow: "0 0 0 3px rgba(139, 92, 246, 0.1)",
																			}}
																			_placeholder={{ color: "#9CA3AF" }}
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
																			size="md"
																			bg="white"
																			color="#1F2937"
																			border="1px solid #E5E7EB"
																			borderRadius="lg"
																			_hover={{ borderColor: "#D1D5DB" }}
																			_focus={{
																				borderColor: "#8B5CF6",
																				boxShadow: "0 0 0 3px rgba(139, 92, 246, 0.1)",
																			}}
																			_placeholder={{ color: "#9CA3AF" }}
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
																			size="md"
																			bg="white"
																			color="#1F2937"
																			border="1px solid #E5E7EB"
																			borderRadius="lg"
																			_hover={{ borderColor: "#D1D5DB" }}
																			_focus={{
																				borderColor: "#8B5CF6",
																				boxShadow: "0 0 0 3px rgba(139, 92, 246, 0.1)",
																			}}
																			_placeholder={{ color: "#9CA3AF" }}
																		/>
																	</VStack>
																</Box>
															))}
														</VStack>
													)}
												</Box>
											)}

											<Button
												leftIcon={<CheckCircleIcon />}
												onClick={handleCheckIn}
												isLoading={isCheckingIn}
												size="lg"
												height="60px"
												bg="linear-gradient(135deg, #10B981 0%, #059669 100%)"
												color="white"
												fontSize="lg"
												fontWeight="bold"
												borderRadius="lg"
												width="100%"
												_hover={{ transform: "translateY(-2px)", boxShadow: "xl" }}
												_active={{ transform: "translateY(0)" }}
												transition="all 0.2s"
											>
												✓ Check In {guestCount} Guest{guestCount > 1 ? "s" : ""}
											</Button>
										</VStack>
									</Box>
								)}

								{/* Check-In History */}
								{bookingInfo.checkInHistory.length > 0 && (
									<Box>
										<Text fontWeight="semibold" mb={3} color="#1F2937" fontSize="md">
											Check-In History
										</Text>
										<VStack spacing={2} align="stretch">
											{bookingInfo.checkInHistory.map((entry, index) => (
												<Box key={index} p={4} bg="#F9FAFB" borderRadius="lg" border="1px solid #E5E7EB" transition="all 0.2s" _hover={{ bg: "#F3F4F6" }}>
													<HStack justify="space-between" mb={1}>
														<HStack>
															<Box bg="#10B981" color="white" fontWeight="bold" fontSize="xs" px={2} py={1} borderRadius="md">
																{entry.count}
															</Box>
															<Text color="#1F2937" fontWeight="medium" fontSize="sm">
																guest{entry.count > 1 ? "s" : ""} checked in
															</Text>
														</HStack>
														<Text color="#6B7280" fontSize="sm">
															{dayjs(entry.timestamp).format("MMM DD, h:mm A")}
														</Text>
													</HStack>
													<Text color="#9CA3AF" fontSize="xs" mt={1}>
														👤 by {entry.adminName}
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
					<Card bg="white" borderRadius="xl" boxShadow="lg" border="1px solid #E5E7EB">
						<CardBody p={{ base: 5, md: 6 }}>
							<VStack spacing={4} align="stretch">
								<HStack justify="space-between" mb={2}>
									<HStack>
										<Box bg="#10B981" p={2} borderRadius="lg">
											<CheckCircleIcon color="white" boxSize={5} />
										</Box>
										<Text fontSize="xl" fontWeight="bold" color="#1F2937">
											Checked-In Guests
										</Text>
									</HStack>
									<Badge bg="linear-gradient(135deg, #10B981 0%, #059669 100%)" color="white" fontSize="sm" px={4} py={2} borderRadius="full" fontWeight="semibold">
										{guestList.length} Guest{guestList.length > 1 ? "s" : ""}
									</Badge>
								</HStack>

								<Divider borderColor="#E5E7EB" />

								{isLoadingGuests ? (
									<HStack justify="center" py={8}>
										<Spinner size="lg" color="#8B5CF6" thickness="4px" />
										<Text color="#6B7280" fontWeight="medium">
											Loading guests...
										</Text>
									</HStack>
								) : (
									<VStack spacing={3} align="stretch" maxH="500px" overflowY="auto" pr={2}>
										{guestList.map((guest, idx) => (
											<Box key={guest.id} p={4} bg="#F9FAFB" borderRadius="lg" border="1px solid #E5E7EB" transition="all 0.2s" _hover={{ bg: "#F3F4F6", transform: "translateX(4px)" }}>
												<HStack justify="space-between" mb={2} flexWrap="wrap" gap={2}>
													<HStack>
														<Box bg="#10B981" color="white" fontWeight="bold" fontSize="xs" w={7} h={7} borderRadius="full" display="flex" alignItems="center" justifyContent="center">
															{idx + 1}
														</Box>
														<Text fontWeight="bold" color="#1F2937" fontSize="md">
															{guest.guestName}
														</Text>
													</HStack>
													<Text fontSize="xs" color="#6B7280" fontWeight="medium">
														{dayjs(guest.checkedInAt).format("MMM DD, h:mm A")}
													</Text>
												</HStack>
												<VStack align="flex-start" spacing={1} ml={9}>
													<Text fontSize="sm" color="#6B7280">
														📧 {guest.guestEmail}
													</Text>
													<Text fontSize="sm" color="#6B7280">
														📱 {guest.guestPhone}
													</Text>
													<HStack mt={1} flexWrap="wrap">
														<Badge colorScheme="purple" fontSize="xs" borderRadius="md">
															Booking: {guest.bookingEmail}
														</Badge>
														<Badge colorScheme="gray" fontSize="xs" borderRadius="md">
															By: {guest.checkedInBy}
														</Badge>
													</HStack>
												</VStack>
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
			<Modal isOpen={isOpen} onClose={stopCamera} size="full" isCentered>
				<ModalOverlay bg="blackAlpha.900" backdropFilter="blur(10px)" />
				<ModalContent bg="white" m={{ base: 0, md: 4 }} borderRadius={{ base: 0, md: "2xl" }} maxW={{ base: "100%", md: "600px" }}>
					<ModalHeader bg="linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)" color="white" borderTopRadius={{ base: 0, md: "2xl" }} py={5}>
						<VStack spacing={1} align="flex-start">
							<Text fontSize="xl" fontWeight="bold">
								📸 Scan Ticket
							</Text>
							<Text fontSize="sm" fontWeight="normal" opacity={0.9}>
								Scan QR code to check in
							</Text>
						</VStack>
					</ModalHeader>
					<ModalCloseButton color="white" size="lg" _hover={{ bg: "whiteAlpha.200" }} borderRadius="full" />
					<ModalBody display="flex" flexDirection="column" alignItems="center" justifyContent="center" p={{ base: 4, md: 6 }} bg="#F9FAFB">
						{/* QR Code Scanner */}
						<VStack spacing={4} width="100%">
							{/* QR Scanner Container */}
							<Box position="relative" width="100%" bg="#1F2937" borderRadius="xl" border="4px solid #8B5CF6" overflow="hidden" boxShadow="2xl" minH="400px">
								{isScanning && (
									<Box position="absolute" top={0} left={0} right={0} bottom={0} bg="blackAlpha.700" zIndex={3} display="flex" alignItems="center" justifyContent="center">
										<VStack spacing={4}>
											<Spinner size="xl" color="white" thickness="4px" />
											<Text color="white" fontSize="lg" fontWeight="bold">
												Verifying QR Code...
											</Text>
										</VStack>
									</Box>
								)}
								<div
									id="qr-reader"
									ref={qrCodeReaderRef}
									style={{
										width: "100%",
										minHeight: "400px",
									}}
								/>
							</Box>
							{/* Instructions */}
							<Box p={4} bg="white" borderRadius="lg" width="100%" border="1px solid #E5E7EB">
								<Text fontSize="sm" fontWeight="semibold" color="#1F2937" mb={2}>
									📋 QR Code Tips:
								</Text>
								<VStack align="flex-start" spacing={1}>
									<Text fontSize="xs" color="#6B7280">
										• Point camera at the QR code in the email
									</Text>
									<Text fontSize="xs" color="#6B7280">
										• Ensure QR code is clearly visible
									</Text>
									<Text fontSize="xs" color="#6B7280">
										• QR code will be automatically verified
									</Text>
								</VStack>
							</Box>
						</VStack>
					</ModalBody>
					<ModalFooter bg="white" borderBottomRadius={{ base: 0, md: "2xl" }} p={{ base: 4, md: 6 }}>
						<HStack spacing={3} width="100%">
							<Button
								variant="outline"
								onClick={stopCamera}
								disabled={isScanning}
								flex={1}
								size="lg"
								height="56px"
								borderRadius="lg"
								borderColor="#E5E7EB"
								color="#6B7280"
								_hover={{ bg: "#F3F4F6", borderColor: "#D1D5DB" }}
							>
								Cancel
							</Button>
						</HStack>
					</ModalFooter>
				</ModalContent>
			</Modal>

			{/* QR Scan Result Modal */}
			<Modal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} size="lg" isCentered>
				<ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
				<ModalContent bg="white" borderRadius="2xl" maxW="600px" mx={4}>
					<ModalHeader
						bg={qrScanResult?.isAlreadyCheckedIn ? "linear-gradient(135deg, #10B981 0%, #059669 100%)" : "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)"}
						color="white"
						borderTopRadius="2xl"
						py={5}
					>
						<VStack spacing={1} align="flex-start">
							<Text fontSize="xl" fontWeight="bold">
								{qrScanResult?.isAlreadyCheckedIn ? "✓ Already Checked In" : "🎫 Ticket Details"}
							</Text>
							<Text fontSize="sm" fontWeight="normal" opacity={0.9}>
								{qrScanResult?.isAlreadyCheckedIn ? "This booking has been checked in" : "Ready for check-in"}
							</Text>
						</VStack>
					</ModalHeader>
					<ModalCloseButton color="white" size="lg" _hover={{ bg: "whiteAlpha.200" }} borderRadius="full" />
					<ModalBody p={6}>
						{qrScanResult && (
							<VStack spacing={5} align="stretch">
								{/* Already Fully Checked In Message */}
								{qrScanResult.isAlreadyCheckedIn && (
									<Alert status="success" borderRadius="lg" bg="#D1FAE5" border="2px solid #10B981">
										<AlertIcon color="#059669" />
										<VStack align="flex-start" spacing={1}>
											<AlertTitle color="#065F46" fontWeight="bold" fontSize="md">
												✓ Check-In Complete
											</AlertTitle>
											<AlertDescription color="#047857" fontSize="sm">
												All guests for this booking have been checked in.
												{qrScanResult.lastCheckInAt && (
													<Text mt={1} fontWeight="semibold">
														Last checked in: {dayjs(qrScanResult.lastCheckInAt).format("MMM DD, YYYY h:mm A")}
													</Text>
												)}
											</AlertDescription>
										</VStack>
									</Alert>
								)}

								{/* Partial Check-In Message */}
								{!qrScanResult.isAlreadyCheckedIn && qrScanResult.checkedInCount > 0 && (
									<Alert status="info" borderRadius="lg" bg="#DBEAFE" border="2px solid #3B82F6">
										<AlertIcon color="#2563EB" />
										<VStack align="flex-start" spacing={1}>
											<AlertTitle color="#1E40AF" fontWeight="bold" fontSize="md">
												⚡ Partial Check-In
											</AlertTitle>
											<AlertDescription color="#1E3A8A" fontSize="sm">
												{qrScanResult.checkedInCount} of {qrScanResult.totalTickets} guest{qrScanResult.totalTickets > 1 ? "s" : ""} checked in. {qrScanResult.remainingTickets} remaining.
												{qrScanResult.lastCheckInAt && (
													<Text mt={1} fontWeight="semibold">
														Last checked in: {dayjs(qrScanResult.lastCheckInAt).format("MMM DD, YYYY h:mm A")}
													</Text>
												)}
											</AlertDescription>
										</VStack>
									</Alert>
								)}

								{/* Event Details */}
								{qrScanResult.event && (
									<Box p={4} bg="linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)" borderRadius="lg" border="1px solid #C7D2FE">
										<Text fontSize="sm" fontWeight="semibold" color="#4F46E5" mb={3} textTransform="uppercase" letterSpacing="wide">
											Event Information
										</Text>
										<VStack align="stretch" spacing={3}>
											<Box>
												<Text fontSize="xs" color="#6366F1" fontWeight="medium" mb={1}>
													Event Name
												</Text>
												<Text fontSize="md" fontWeight="bold" color="#1F2937">
													{qrScanResult.event.name}
												</Text>
											</Box>
											{qrScanResult.event.location && (
												<Box>
													<Text fontSize="xs" color="#6366F1" fontWeight="medium" mb={1}>
														📍 Location
													</Text>
													<Text fontSize="sm" color="#1F2937">
														{qrScanResult.event.location}
													</Text>
												</Box>
											)}
											{(qrScanResult.event.startsOn || qrScanResult.event.endsOn) && (
												<Box>
													<Text fontSize="xs" color="#6366F1" fontWeight="medium" mb={1}>
														📅 Date & Time
													</Text>
													<Text fontSize="sm" color="#1F2937">
														{qrScanResult.event.startsOn && (() => {
															try {
																const eventTimezone = qrScanResult.event.timezone?.split(') ')[1] || 'UTC'
																const startDate = dayjs.utc(qrScanResult.event.startsOn).tz(eventTimezone)
																const endDate = qrScanResult.event.endsOn ? dayjs.utc(qrScanResult.event.endsOn).tz(eventTimezone) : null
																return `${startDate.format("MMM DD, YYYY h:mm A")}${endDate ? ` - ${endDate.format("h:mm A")}` : ''} ${eventTimezone}`
															} catch (e) {
																// Fallback to simple formatting if timezone parsing fails
																return dayjs(qrScanResult.event.startsOn).format("MMM DD, YYYY h:mm A")
															}
														})()}
													</Text>
												</Box>
											)}
											{qrScanResult.event.owner && (
												<>
													<Divider borderColor="#C7D2FE" />
													<Box>
														<Text fontSize="xs" color="#6366F1" fontWeight="medium" mb={2} textTransform="uppercase" letterSpacing="wide">
															Event Organizer
														</Text>
														<VStack align="flex-start" spacing={2}>
															{qrScanResult.event.owner.name && (
																<Text fontSize="sm" fontWeight="semibold" color="#1F2937">
																	👤 {qrScanResult.event.owner.name}
																</Text>
															)}
															{qrScanResult.event.owner.email && (
																<Text fontSize="sm" color="#1F2937">
																	📧 {qrScanResult.event.owner.email}
																</Text>
															)}
															{qrScanResult.event.owner.phone && (
																<Text fontSize="sm" color="#1F2937">
																	📱 {qrScanResult.event.owner.phone}
																</Text>
															)}
														</VStack>
													</Box>
												</>
											)}
										</VStack>
									</Box>
								)}

								{/* Booking Details */}
								<Box p={4} bg="#F9FAFB" borderRadius="lg" border="1px solid #E5E7EB">
									<Text fontSize="sm" fontWeight="semibold" color="#6B7280" mb={3} textTransform="uppercase" letterSpacing="wide">
										Booking Information
									</Text>
									<SimpleGrid columns={2} spacing={3}>
										<Box>
											<Text fontSize="xs" color="#6B7280" fontWeight="medium" mb={1}>
												Guest Name
											</Text>
											<Text fontSize="md" fontWeight="bold" color="#1F2937">
												{qrScanResult.customerName}
											</Text>
										</Box>
										<Box>
											<Text fontSize="xs" color="#6B7280" fontWeight="medium" mb={1}>
												Booking Reference
											</Text>
											<Text fontSize="md" fontWeight="bold" color="#8B5CF6" fontFamily="mono">
												{qrScanResult.bookingRef}
											</Text>
										</Box>
									</SimpleGrid>
									<Divider my={3} borderColor="#E5E7EB" />
									<VStack align="flex-start" spacing={2}>
										<Text fontSize="sm" color="#1F2937">
											📧 {qrScanResult.customerEmail}
										</Text>
										<Text fontSize="sm" color="#1F2937">
											📱 {qrScanResult.customerPhone}
										</Text>
									</VStack>
								</Box>

								{/* Ticket Status */}
								<Box p={4} bg="linear-gradient(135deg, #F9FAFB 0%, #F3F4F6 100%)" borderRadius="xl" border="1px solid #E5E7EB">
									<Text fontSize="sm" fontWeight="semibold" color="#6B7280" mb={3} textTransform="uppercase" letterSpacing="wide">
										Ticket Status
									</Text>
									<SimpleGrid columns={3} spacing={3}>
										<VStack spacing={1}>
											<Box p={3} bg="white" borderRadius="lg" boxShadow="sm" width="100%" textAlign="center">
												<Text fontSize="xs" color="#6B7280" fontWeight="medium" mb={1}>
													Total
												</Text>
												<Text fontSize="2xl" color="#1F2937" fontWeight="bold">
													{qrScanResult.totalTickets}
												</Text>
											</Box>
										</VStack>
										<VStack spacing={1}>
											<Box
												p={3}
												bg={qrScanResult.isAlreadyCheckedIn ? "linear-gradient(135deg, #10B981 0%, #059669 100%)" : "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)"}
												borderRadius="lg"
												boxShadow="sm"
												width="100%"
												textAlign="center"
											>
												<Text fontSize="xs" color="white" fontWeight="medium" mb={1}>
													Checked In
												</Text>
												<Text fontSize="2xl" fontWeight="bold" color="white">
													{qrScanResult.checkedInCount || 0}
												</Text>
											</Box>
										</VStack>
										<VStack spacing={1}>
											<Box p={3} bg="linear-gradient(135deg, #F59E0B 0%, #D97706 100%)" borderRadius="lg" boxShadow="sm" width="100%" textAlign="center">
												<Text fontSize="xs" color="white" fontWeight="medium" mb={1}>
													Remaining
												</Text>
												<Text fontSize="2xl" fontWeight="bold" color="white">
													{qrScanResult.remainingTickets || qrScanResult.totalTickets}
												</Text>
											</Box>
										</VStack>
									</SimpleGrid>
								</Box>

								{/* Payment & Referral Code Information */}
								{(qrScanResult.referralCode || (qrScanResult.discountAmount && qrScanResult.discountAmount > 0)) && (
									<Box p={4} bg="#F9FAFB" borderRadius="xl" border="1px solid #E5E7EB">
										<Text fontSize="sm" fontWeight="semibold" color="#6B7280" mb={3} textTransform="uppercase" letterSpacing="wide">
											Payment Information
										</Text>
										<VStack spacing={3} align="stretch">
											{qrScanResult.subTotal !== undefined && (
												<HStack justify="space-between">
													<Text fontSize="sm" color="#6B7280" fontWeight="medium">
														Subtotal:
													</Text>
													<Text fontSize="md" color="#1F2937" fontWeight="semibold">
														${qrScanResult.subTotal?.toFixed(2)}
													</Text>
												</HStack>
											)}
											{qrScanResult.referralCode && qrScanResult.discountAmount && qrScanResult.discountAmount > 0 && (
												<Box p={3} bg="#D1FAE5" borderRadius="lg" border="2px solid #10B981">
													<HStack justify="space-between" align="center">
														<VStack align="flex-start" spacing={0}>
															<Text fontSize="xs" color="#065F46" fontWeight="medium" mb={1}>
																Referral Code Applied
															</Text>
															<HStack>
																<Text fontSize="md" color="#047857" fontWeight="bold">
																	{qrScanResult.referralCode}
																</Text>
															</HStack>
														</VStack>
														<Text fontSize="lg" color="#059669" fontWeight="bold">
															-${qrScanResult.discountAmount.toFixed(2)}
														</Text>
													</HStack>
												</Box>
											)}
											{qrScanResult.total !== undefined && (
												<>
													<Divider borderColor="#E5E7EB" />
													<HStack justify="space-between">
														<Text fontSize="md" color="#1F2937" fontWeight="bold">
															Total Paid:
														</Text>
														<Text fontSize="xl" color="#8B5CF6" fontWeight="bold">
															${qrScanResult.total?.toFixed(2)}
														</Text>
													</HStack>
												</>
											)}
										</VStack>
									</Box>
								)}

								{/* Check-In Form (only if not already fully checked in and has remaining tickets) */}
								{!qrScanResult.isAlreadyCheckedIn && qrScanResult.remainingTickets > 0 && (
									<Box p={5} bg="#F9FAFB" borderRadius="xl" border="2px solid #8B5CF6">
										<VStack spacing={5} align="stretch">
											<HStack>
												<Box bg="#8B5CF6" p={2} borderRadius="lg">
													<CheckCircleIcon color="white" boxSize={5} />
												</Box>
												<Text fontWeight="bold" fontSize="lg" color="#1F2937">
													Check-In Guests
												</Text>
											</HStack>

											<Box>
												<Text fontWeight="semibold" color="#1F2937" mb={3} fontSize="sm">
													Number of Guests Arriving
												</Text>
												<NumberInput
													value={guestCount}
													onChange={(valueString) => setGuestCount(Number(valueString))}
													min={1}
													max={qrScanResult.remainingTickets}
													size="lg"
												>
													<NumberInputField
														color="#1F2937"
														bg="white"
														border="2px solid #E5E7EB"
														borderRadius="lg"
														height="56px"
														fontSize="xl"
														fontWeight="bold"
														textAlign="center"
														_hover={{ borderColor: "#D1D5DB" }}
														_focus={{
															borderColor: "#8B5CF6",
															boxShadow: "0 0 0 3px rgba(139, 92, 246, 0.1)",
														}}
													/>
													<NumberInputStepper>
														<NumberIncrementStepper color="#8B5CF6" borderColor="#E5E7EB" _hover={{ bg: "#F3F4F6" }} />
														<NumberDecrementStepper color="#8B5CF6" borderColor="#E5E7EB" _hover={{ bg: "#F3F4F6" }} />
													</NumberInputStepper>
												</NumberInput>
												<HStack justify="space-between" mt={2}>
													<Text fontSize="sm" color="#6B7280">
														Maximum: {qrScanResult.remainingTickets} guest{qrScanResult.remainingTickets > 1 ? "s" : ""}
													</Text>
													<Text fontSize="sm" fontWeight="semibold" color="#8B5CF6">
														{guestCount} selected
													</Text>
												</HStack>
											</Box>

											{/* Optional Guest Details Collection */}
											{qrScanResult.totalTickets > 1 && (
												<Box p={4} bg="white" borderRadius="lg" border="1px solid #E5E7EB">
													<HStack spacing={3} mb={3}>
														<input
															type="checkbox"
															checked={collectGuestDetails}
															onChange={(e) => {
																setCollectGuestDetails(e.target.checked)
																if (e.target.checked) {
																	setGuestDetails(
																		Array.from({ length: guestCount }, (_, i) => {
																			if (i === 0) {
																				return {
																					name: qrScanResult.customerName,
																					email: qrScanResult.customerEmail,
																					phone: qrScanResult.customerPhone,
																				}
																			}
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
															style={{
																cursor: "pointer",
																width: "20px",
																height: "20px",
																accentColor: "#8B5CF6",
															}}
														/>
														<VStack align="flex-start" spacing={0}>
															<Text color="#1F2937" fontSize="sm" fontWeight="semibold">
																Collect individual guest details
															</Text>
															<Text color="#6B7280" fontSize="xs">
																Optional: Record name, email & phone for each guest
															</Text>
														</VStack>
													</HStack>

													{collectGuestDetails && (
														<VStack spacing={3} align="stretch" mt={4}>
															{Array.from({ length: guestCount }).map((_, index) => (
																<Box key={index} p={4} bg="#F9FAFB" borderRadius="lg" border="1px solid #E5E7EB">
																	<HStack justify="space-between" mb={3}>
																		<HStack>
																			<Box bg="#8B5CF6" color="white" fontWeight="bold" fontSize="sm" w={8} h={8} borderRadius="full" display="flex" alignItems="center" justifyContent="center">
																				{index + 1}
																			</Box>
																			<Text fontSize="sm" fontWeight="semibold" color="#1F2937">
																				Guest {index + 1}
																			</Text>
																		</HStack>
																		{index === 0 && (
																			<Badge colorScheme="purple" fontSize="xs" borderRadius="md">
																				Booking Owner
																			</Badge>
																		)}
																	</HStack>
																	<VStack spacing={3}>
																		<Input
																			placeholder="Full Name"
																			value={guestDetails[index]?.name || ""}
																			onChange={(e) => {
																				const newDetails = [...guestDetails]
																				if (!newDetails[index]) newDetails[index] = { name: "", email: "", phone: "" }
																				newDetails[index].name = e.target.value
																				setGuestDetails(newDetails)
																			}}
																			size="md"
																			bg="white"
																			color="#1F2937"
																			border="1px solid #E5E7EB"
																			borderRadius="lg"
																			_hover={{ borderColor: "#D1D5DB" }}
																			_focus={{
																				borderColor: "#8B5CF6",
																				boxShadow: "0 0 0 3px rgba(139, 92, 246, 0.1)",
																			}}
																			_placeholder={{ color: "#9CA3AF" }}
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
																			size="md"
																			bg="white"
																			color="#1F2937"
																			border="1px solid #E5E7EB"
																			borderRadius="lg"
																			_hover={{ borderColor: "#D1D5DB" }}
																			_focus={{
																				borderColor: "#8B5CF6",
																				boxShadow: "0 0 0 3px rgba(139, 92, 246, 0.1)",
																			}}
																			_placeholder={{ color: "#9CA3AF" }}
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
																			size="md"
																			bg="white"
																			color="#1F2937"
																			border="1px solid #E5E7EB"
																			borderRadius="lg"
																			_hover={{ borderColor: "#D1D5DB" }}
																			_focus={{
																				borderColor: "#8B5CF6",
																				boxShadow: "0 0 0 3px rgba(139, 92, 246, 0.1)",
																			}}
																			_placeholder={{ color: "#9CA3AF" }}
																		/>
																	</VStack>
																</Box>
															))}
														</VStack>
													)}
												</Box>
											)}

											<Button
												leftIcon={<CheckCircleIcon />}
												onClick={handleQRCheckIn}
												isLoading={isCheckingIn}
												size="lg"
												height="60px"
												bg="linear-gradient(135deg, #10B981 0%, #059669 100%)"
												color="white"
												fontSize="lg"
												fontWeight="bold"
												borderRadius="lg"
												width="100%"
												_hover={{ transform: "translateY(-2px)", boxShadow: "xl" }}
												_active={{ transform: "translateY(0)" }}
												transition="all 0.2s"
											>
												✓ Check In {guestCount} Guest{guestCount > 1 ? "s" : ""}
											</Button>
										</VStack>
									</Box>
								)}
							</VStack>
						)}
					</ModalBody>
					<ModalFooter bg="white" borderBottomRadius="2xl" p={6}>
						<Button
							variant="outline"
							onClick={() => {
								setIsQrModalOpen(false)
								setQrScanResult(null)
								setGuestCount(1)
								setCollectGuestDetails(false)
								setGuestDetails([])
							}}
							flex={1}
							size="lg"
							height="56px"
							borderRadius="lg"
							borderColor="#E5E7EB"
							color="#6B7280"
							_hover={{ bg: "#F3F4F6", borderColor: "#D1D5DB" }}
						>
							Close
						</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>
		</Box>
	)
}

export default CheckInPortal

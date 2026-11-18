import React, { useCallback, useEffect, useRef, useState } from "react"
import {
	Box,
	Button,
	HStack,
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
import axios from "axios"
import jsQR from "jsqr"

/**
 * Live door scanner (2026-11-18): the camera stays on and every ticket QR it sees is checked in
 * straight away — no capture button, no confirm step. One scan = ONE guest (`/api/check-in/scan`
 * is an atomic +1), so a booking for three is the same QR scanned three times.
 *
 * THE RE-SCAN RULE (user decision): the camera sees a held-up QR many times a second, so a code that
 * was just acted on is BLOCKED until it has been out of view for `REARM_MS`. Holding it up longer
 * never seats another guest; moving it away and back does. A DIFFERENT code is acted on at once —
 * that's the next party in the queue.
 *
 * Decoding uses the native `BarcodeDetector` where the browser has one (Chrome / Android — fast), and
 * `jsQR` on a downscaled frame everywhere else (iPhone Safari).
 */

const PHONE = "@media screen and (max-width: 47.99em)"

/** How long a just-scanned QR must be out of view before the same QR counts again. */
const REARM_MS = 1000
/** Decode at most this often — fast enough to feel instant, light enough for an old phone. */
const SCAN_INTERVAL_MS = 120
/** jsQR fallback: frames are shrunk to this width first. Plenty for a QR held up to the camera. */
const MAX_DECODE_WIDTH = 640

type ResultKind = "success" | "warn" | "error"
type ScanResult = { id: number; kind: ResultKind; title: string; detail: string; at: Date }

const COLORS: Record<ResultKind, { bg: string; border: string; text: string }> = {
	success: { bg: "rgba(22,101,52,0.92)", border: "#22C55E", text: "#DCFCE7" },
	warn: { bg: "rgba(146,64,14,0.92)", border: "#F59E0B", text: "#FEF3C7" },
	error: { bg: "rgba(127,29,29,0.92)", border: "#EF4444", text: "#FEE2E2" },
}

type Props = {
	isOpen: boolean
	onClose: () => void
	eventId: string
	/** Fired after every successful check-in, so the page can refresh its counts and lists. */
	onCheckedIn?: () => void
}

/** Turns the scan endpoint's reply (or failure) into what the door staff sees. */
const describe = (data: any, message: string | undefined, ok: boolean): Omit<ScanResult, "id" | "at"> => {
	const name = data?.customerName ? String(data.customerName) : ""
	const outcome = data?.outcome as string | undefined
	if (ok && outcome === "checked_in") {
		const n = Number(data.checkedInCount) || 0
		const total = Number(data.totalTickets) || 0
		const left = Math.max(0, Number(data.remainingTickets) || 0)
		const progress = total > 1 ? ` · Guest ${n} of ${total}${left > 0 ? ` · ${left} left` : " · All in"}` : ""
		return { kind: "success", title: "Checked in ✓", detail: `${name || data?.bookingRef || "Guest"}${progress}` }
	}
	if (ok && outcome === "already_full") {
		return { kind: "warn", title: "Already checked in", detail: `${name ? `${name} · ` : ""}${message || "Everyone on this booking is already in."}` }
	}
	const titles: Record<string, string> = {
		pending: "Not approved yet",
		cancelled: "Cancelled booking",
		not_found: "Booking not found",
		not_ticket: "Not a ticket QR",
	}
	return {
		kind: "error",
		title: (outcome && titles[outcome]) || "Couldn't check in",
		detail: `${name ? `${name} · ` : ""}${message || "Please scan again."}`,
	}
}

const LiveTicketScanner: React.FC<Props> = ({ isOpen, onClose, eventId, onCheckedIn }) => {
	const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)
	const [cameraReady, setCameraReady] = useState(false)
	const [cameraError, setCameraError] = useState<string | null>(null)
	const [checking, setChecking] = useState(false)
	const [result, setResult] = useState<ScanResult | null>(null)
	const [recent, setRecent] = useState<ScanResult[]>([])
	const [attempt, setAttempt] = useState(0)

	// Everything the decode loop reads lives in refs: the loop is started once per camera session
	// and must never see stale props or state.
	const eventIdRef = useRef(eventId)
	const onCheckedInRef = useRef(onCheckedIn)
	eventIdRef.current = eventId
	onCheckedInRef.current = onCheckedIn
	const blockRef = useRef<{ code: string; lastSeen: number } | null>(null)
	const inFlightRef = useRef(false)
	const resultIdRef = useRef(0)
	const audioRef = useRef<AudioContext | null>(null)

	const feedback = useCallback((kind: ResultKind) => {
		try {
			navigator.vibrate?.(kind === "success" ? 80 : [80, 60, 80])
		} catch {}
		try {
			const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
			if (!Ctx) return
			audioRef.current = audioRef.current || new Ctx()
			const ctx = audioRef.current!
			if (ctx.state === "suspended") ctx.resume().catch(() => {})
			const osc = ctx.createOscillator()
			const gain = ctx.createGain()
			osc.frequency.value = kind === "success" ? 880 : kind === "warn" ? 520 : 220
			gain.gain.value = 0.08
			osc.connect(gain)
			gain.connect(ctx.destination)
			osc.start()
			osc.stop(ctx.currentTime + 0.12)
		} catch {}
	}, [])

	const show = useCallback(
		(r: Omit<ScanResult, "id" | "at">) => {
			const full: ScanResult = { ...r, id: ++resultIdRef.current, at: new Date() }
			setResult(full)
			setRecent((prev) => [full, ...prev].slice(0, 5))
			feedback(r.kind)
		},
		[feedback],
	)

	const checkIn = useCallback(
		async (code: string) => {
			inFlightRef.current = true
			setChecking(true)
			try {
				const { data } = await axios.post("/api/check-in/scan", { eventId: eventIdRef.current, bookingRef: code })
				show(describe(data?.data, data?.message, !!data?.status))
				if (data?.data?.outcome === "checked_in") onCheckedInRef.current?.()
			} catch (err: any) {
				const body = err?.response?.data
				show(describe(body?.data, body?.message || (err?.response ? undefined : "No connection. Please scan again."), false))
			} finally {
				inFlightRef.current = false
				setChecking(false)
			}
		},
		[show],
	)

	/** One decoded frame (or none). Applies the re-scan rule, then checks in. */
	const onFrame = useCallback(
		(code: string | null) => {
			const now = performance.now()
			const block = blockRef.current
			if (block && code === block.code) {
				// Still in view — refresh, and never count it again while it stays there.
				block.lastSeen = now
				return
			}
			if (block && now - block.lastSeen >= REARM_MS) blockRef.current = null
			if (!code || inFlightRef.current) return
			blockRef.current = { code, lastSeen: now }
			checkIn(code)
		},
		[checkIn],
	)

	// Camera + decode loop, for as long as the scanner is open.
	useEffect(() => {
		if (!isOpen || !videoEl) return
		let stopped = false
		let stream: MediaStream | null = null
		let raf = 0
		let lastTick = 0
		let decoding = false
		let wakeLock: any = null
		const canvas = document.createElement("canvas")
		const context = canvas.getContext("2d", { willReadFrequently: true } as any) as CanvasRenderingContext2D | null

		const Detector = (window as any).BarcodeDetector
		let detector: any = null

		const decode = async (): Promise<string | null> => {
			if (detector) {
				const found = await detector.detect(videoEl)
				return found?.[0]?.rawValue ? String(found[0].rawValue).trim() : null
			}
			if (!context || !videoEl.videoWidth) return null
			const scale = Math.min(1, MAX_DECODE_WIDTH / videoEl.videoWidth)
			canvas.width = Math.round(videoEl.videoWidth * scale)
			canvas.height = Math.round(videoEl.videoHeight * scale)
			context.drawImage(videoEl, 0, 0, canvas.width, canvas.height)
			const image = context.getImageData(0, 0, canvas.width, canvas.height)
			const qr = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })
			return qr?.data ? qr.data.trim() : null
		}

		const loop = (ts: number) => {
			if (stopped) return
			raf = requestAnimationFrame(loop)
			if (decoding || ts - lastTick < SCAN_INTERVAL_MS || videoEl.readyState < 2) return
			lastTick = ts
			decoding = true
			decode()
				.then((code) => !stopped && onFrame(code))
				.catch(() => !stopped && onFrame(null))
				.finally(() => {
					decoding = false
				})
		}

		const start = async () => {
			setCameraReady(false)
			setCameraError(null)
			try {
				if (Detector) {
					try {
						const formats: string[] = (await Detector.getSupportedFormats?.()) || []
						if (!formats.length || formats.includes("qr_code")) detector = new Detector({ formats: ["qr_code"] })
					} catch {
						detector = null
					}
				}
				// Back camera first; `ideal` when a device won't satisfy `exact`.
				try {
					stream = await navigator.mediaDevices.getUserMedia({
						video: { facingMode: { exact: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
						audio: false,
					})
				} catch {
					stream = await navigator.mediaDevices.getUserMedia({
						video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
						audio: false,
					})
				}
				if (stopped) {
					stream.getTracks().forEach((t) => t.stop())
					return
				}
				videoEl.srcObject = stream
				await videoEl.play().catch(() => {})
				setCameraReady(true)
				// Keep the phone awake through a queue. Best-effort; unsupported browsers just sleep.
				try {
					wakeLock = await (navigator as any).wakeLock?.request("screen")
				} catch {}
				raf = requestAnimationFrame(loop)
			} catch (err: any) {
				const name = err?.name
				setCameraError(
					name === "NotAllowedError"
						? "Camera access was blocked. Allow the camera for this site and try again."
						: name === "NotFoundError"
							? "No camera found on this device."
							: name === "NotReadableError"
								? "The camera is being used by another app."
								: "Unable to start the camera. Please try again.",
				)
			}
		}

		start()

		return () => {
			stopped = true
			cancelAnimationFrame(raf)
			stream?.getTracks().forEach((t) => t.stop())
			if (videoEl) videoEl.srcObject = null
			try {
				wakeLock?.release?.()
			} catch {}
		}
	}, [isOpen, videoEl, onFrame, attempt])

	// A fresh session each time the scanner opens.
	useEffect(() => {
		if (isOpen) return
		blockRef.current = null
		setResult(null)
		setCameraReady(false)
		setCameraError(null)
	}, [isOpen])

	const colors = result ? COLORS[result.kind] : null

	return (
		<Modal isOpen={isOpen} onClose={onClose} size="full">
			<ModalOverlay />
			<ModalContent bg="#000" color="white">
				<ModalHeader>Scan tickets</ModalHeader>
				<ModalCloseButton color="white" size="lg" />
				<ModalBody display="flex" flexDirection="column" alignItems="center" p={4} sx={{ [PHONE]: { padding: "8px 16px" } }}>
					<VStack spacing={4} width="100%" maxW="600px">
						<Box position="relative" width="100%" bg="#000" borderRadius="12px" border="2px solid #F79432" overflow="hidden">
							<video
								ref={setVideoEl}
								autoPlay
								playsInline
								muted
								style={{ display: "block", width: "100%", height: "auto", aspectRatio: "4/3", objectFit: "cover" }}
							/>
							{/* Viewfinder — where to hold the QR. Purely visual. */}
							<Box
								position="absolute"
								top="50%"
								left="50%"
								transform="translate(-50%, -50%)"
								w="58%"
								maxW="280px"
								sx={{ aspectRatio: "1 / 1" }}
								border="3px solid rgba(255,255,255,0.75)"
								borderRadius="16px"
								pointerEvents="none"
							/>
							{!cameraReady && !cameraError && (
								<Box position="absolute" inset={0} display="flex" alignItems="center" justifyContent="center">
									<Spinner size="xl" color="#F79432" />
								</Box>
							)}
							{cameraError && (
								<Box position="absolute" inset={0} display="flex" flexDirection="column" alignItems="center" justifyContent="center" gap={3} p={6} bg="rgba(0,0,0,0.85)">
									<Text textAlign="center">{cameraError}</Text>
									<Button size="sm" colorScheme="orange" onClick={() => setAttempt((n) => n + 1)}>
										Try again
									</Button>
								</Box>
							)}
							{/* The latest result, readable at arm's length. Stays until the next scan. */}
							{result && colors && (
								<Box
									key={result.id}
									position="absolute"
									left={3}
									right={3}
									bottom={3}
									bg={colors.bg}
									border={`2px solid ${colors.border}`}
									borderRadius="12px"
									px={4}
									py={3}
								>
									<Text fontSize="xl" fontWeight="bold" color="white" lineHeight="1.2">
										{result.title}
									</Text>
									<Text fontSize="md" color={colors.text} mt={1} noOfLines={2} overflowWrap="anywhere">
										{result.detail}
									</Text>
								</Box>
							)}
							{checking && (
								<Box position="absolute" top={3} right={3} bg="rgba(0,0,0,0.6)" borderRadius="full" p={2}>
									<Spinner size="sm" color="white" />
								</Box>
							)}
						</Box>

						<Text color="gray.400" textAlign="center" fontSize="sm">
							Hold the QR inside the frame — it checks in on its own. For the next guest on the same ticket, move the QR away
							and scan it again.
						</Text>

						{recent.length > 0 && (
							<VStack width="100%" spacing={2} align="stretch">
								<Text fontSize="xs" color="gray.500" textTransform="uppercase" letterSpacing="wider">
									Last scans
								</Text>
								{recent.map((r) => (
									<HStack key={r.id} justify="space-between" bg="#141414" border="1px solid #2b2b2b" borderRadius="8px" px={3} py={2} spacing={3}>
										<Box minW={0}>
											<Text fontSize="sm" fontWeight="semibold" color={COLORS[r.kind].border}>
												{r.title}
											</Text>
											<Text fontSize="xs" color="gray.400" noOfLines={1} overflowWrap="anywhere">
												{r.detail}
											</Text>
										</Box>
										<Text fontSize="xs" color="gray.500" flexShrink={0}>
											{r.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
										</Text>
									</HStack>
								))}
							</VStack>
						)}
					</VStack>
				</ModalBody>
				<ModalFooter sx={{ [PHONE]: { paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" } }}>
					<Button onClick={onClose} width="100%" maxW="600px" mx="auto" height="48px" variant="outline" color="white" borderColor="#555" _hover={{ bg: "whiteAlpha.100" }}>
						Done
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
	)
}

export default LiveTicketScanner

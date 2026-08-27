import React, { useCallback, useEffect, useMemo, useState } from "react"
import axios from "axios"
import {
	Box,
	Button,
	Flex,
	Image,
	Input,
	Modal,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalOverlay,
	Text,
	useToast,
} from "@chakra-ui/react"
import type { AlbumMedia } from "@/components/events/EventAlbums"

/**
 * "Request Unwatermarked Photos".
 *
 * The photos on the album page carry a `JetzyLifeMark` overlay; this is how a viewer asks the
 * host for the clean original of ONE of them. Per-photo by decision — a host answering "someone
 * wants some photos" has nothing to act on, whereas a named image is a request they can fill.
 *
 * Steps depend on what we already know about the viewer:
 *
 *   verified viewer   -> pick a photo -> Send request -> "Request received!"
 *   unverified viewer -> pick a photo -> email (read-only) -> code -> Verify -> "Request received!"
 *
 * Everyone who came through today's album gate is verified, so the code step is effectively
 * only for guest cookies minted before that gate existed. The email is never a free-text field:
 * the server takes the address from the session/cookie, so typing one here would be theatre.
 */
type Step = "PICK" | "EMAIL" | "CODE" | "DONE"

export function RequestUnwatermarkedDialog({
	isOpen,
	onClose,
	eventId,
	albumId,
	media,
	preselectedUrl,
	viewerEmail,
	viewerVerified,
}: {
	isOpen: boolean
	onClose: () => void
	eventId: string
	albumId: string
	media: AlbumMedia[]
	/** Set when opened from the lightbox — that photo is the one being asked for. */
	preselectedUrl?: string | null
	viewerEmail?: string
	/** UNDEFINED for a legacy guest cookie: never asked, so not proved. */
	viewerVerified?: boolean
}) {
	const toast = useToast()
	const [step, setStep] = useState<Step>("PICK")
	const [selected, setSelected] = useState<string | null>(null)
	const [code, setCode] = useState("")
	const [submitting, setSubmitting] = useState(false)
	const [resendIn, setResendIn] = useState(0)
	// Opened from the lightbox's side panel, the photo is already decided — show it rather
	// than a grid to hunt through. The grid is one click away for a change of mind.
	const [picking, setPicking] = useState(false)

	const photos = useMemo(() => media.filter((m) => m.type !== "video"), [media])

	// Reset on every open, and preselect whatever the lightbox named.
	useEffect(() => {
		if (!isOpen) return
		setCode("")
		setSubmitting(false)
		setResendIn(0)
		setSelected(preselectedUrl || null)
		setPicking(!preselectedUrl)
		setStep("PICK")
	}, [isOpen, preselectedUrl])

	useEffect(() => {
		if (resendIn <= 0) return
		const t = setTimeout(() => setResendIn((n) => n - 1), 1000)
		return () => clearTimeout(t)
	}, [resendIn])

	const fail = useCallback(
		(err: any, title: string) => {
			toast({
				title,
				description: err?.response?.data?.message || err?.message,
				status: "error",
				duration: 4000,
				isClosable: true,
			})
		},
		[toast],
	)

	// The one call that files the request. `code` is only sent on the unverified path.
	const send = useCallback(
		async (withCode?: string) => {
			if (!selected) return
			setSubmitting(true)
			try {
				await axios.post(`/api/events/${eventId}/albums/${albumId}/photo-request`, {
					mediaUrl: selected,
					...(withCode ? { code: withCode } : {}),
				})
				setStep("DONE")
			} catch (err: any) {
				// The server tells us when it still needs the address proved, rather than the
				// client guessing from a possibly-stale `verified` flag.
				if (err?.response?.data?.data?.needsVerification) {
					if (withCode) {
						fail(err, "That code didn't work")
					} else {
						setStep("EMAIL")
					}
					return
				}
				fail(err, "Couldn't send that request")
			} finally {
				setSubmitting(false)
			}
		},
		[albumId, eventId, fail, selected],
	)

	const sendCode = useCallback(async () => {
		if (!viewerEmail) return
		setSubmitting(true)
		try {
			await axios.post(`/api/events/${eventId}/albums/send-code`, { email: viewerEmail })
			setCode("")
			setResendIn(60)
			setStep("CODE")
		} catch (err: any) {
			fail(err, "Couldn't send the code")
		} finally {
			setSubmitting(false)
		}
	}, [eventId, fail, viewerEmail])

	// Verified viewers file it straight away; everyone else gets the code round trip.
	const confirm = () => (viewerVerified === true ? send() : setStep("EMAIL"))

	const title = step === "DONE" ? "Request received" : step === "CODE" ? "Enter Verification Code" : "Request Unwatermarked Photos"

	return (
		<Modal isOpen={isOpen} onClose={onClose} isCentered size={{ base: "sm", md: "lg" }} scrollBehavior="inside">
			<ModalOverlay bg="blackAlpha.700" backdropFilter="blur(8px)" />
			<ModalContent bg="#131313" color="white" border="1px solid #343536" borderRadius="12px">
				<ModalHeader>{title}</ModalHeader>
				<ModalCloseButton />
				<ModalBody>
					{step === "PICK" && (
						<>
							<Text color="#bbbbbb" fontSize="sm" mb={4}>
								{picking
									? "Pick the photo you'd like without the Jetzy Life mark. We'll pass the request on and get back to you."
									: "We'll ask for this photo without the Jetzy Life mark and get back to you."}
							</Text>
							{!picking && selected ? (
								<Box textAlign="center">
									<Box width="100%" maxW="320px" height="220px" mx="auto" borderRadius="10px" overflow="hidden" bg="black">
										<Image src={selected} alt="" width="100%" height="100%" objectFit="contain" />
									</Box>
									<Button variant="link" size="sm" color="#F79432" fontWeight="600" mt={3} onClick={() => setPicking(true)}>
										Pick a different photo
									</Button>
								</Box>
							) : photos.length === 0 ? (
								<Text color="#888" fontSize="sm">There are no photos in this album to request.</Text>
							) : (
								<Flex wrap="wrap" gap={2}>
									{photos.map((m) => {
										const isSelected = selected === m.url
										return (
											<Box
												as="button"
												type="button"
												key={m.url}
												onClick={() => setSelected(m.url)}
												width="88px"
												height="88px"
												borderRadius="8px"
												overflow="hidden"
												bg="black"
												border="2px solid"
												borderColor={isSelected ? "#F79432" : "transparent"}
												flexShrink={0}
											>
												{/* `contain`, like the tiles: a cropped thumbnail can make two
												    similar photos indistinguishable when picking one. */}
												<Image src={m.url} alt="" width="100%" height="100%" objectFit="contain" loading="lazy" />
											</Box>
										)
									})}
								</Flex>
							)}
						</>
					)}

					{step === "EMAIL" && (
						<>
							<Text color="#bbbbbb" fontSize="sm" mb={1}>
								We&apos;ll send a verification code to
							</Text>
							{/* Read-only on purpose: the server files the request against the address
							    already on the session/cookie, so an editable field would only mislead. */}
							<Input
								value={viewerEmail || ""}
								isReadOnly
								bg="#1E1E1E"
								borderColor="#343536"
								borderRadius="10px"
								color="white"
								mb={3}
							/>
							<Text fontSize="xs" color="#777">
								This confirms the request is really coming from you.
							</Text>
						</>
					)}

					{step === "CODE" && (
						<>
							<Text color="#bbbbbb" fontSize="sm" mb={1}>Enter the 6-digit code we sent to</Text>
							<Text color="white" fontSize="sm" fontWeight="600" mb={4}>{viewerEmail}</Text>
							<form
								id="photo-request-code-form"
								onSubmit={(e) => {
									e.preventDefault()
									if (code.length === 6) send(code)
								}}
							>
								<Input
									value={code}
									onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
									placeholder="123456"
									inputMode="numeric"
									autoComplete="one-time-code"
									maxLength={6}
									bg="#1E1E1E"
									borderColor="#343536"
									borderRadius="10px"
									color="white"
									fontSize="24px"
									fontWeight="bold"
									letterSpacing="8px"
									textAlign="center"
									_placeholder={{ color: "#444", letterSpacing: "8px" }}
									autoFocus
								/>
							</form>
							<Flex align="center" justify="space-between" mt={3} gap={3}>
								<Button variant="link" size="sm" color="#bbbbbb" fontWeight="500" onClick={() => setStep("EMAIL")}>
									‹ Back
								</Button>
								<Button
									variant="link"
									size="sm"
									color={resendIn > 0 ? "#666" : "#F79432"}
									fontWeight="600"
									onClick={sendCode}
									isDisabled={resendIn > 0 || submitting}
								>
									{resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
								</Button>
							</Flex>
							<Text fontSize="xs" color="#777" mt={3}>
								The code expires in 10 minutes. Can&apos;t find the email? Please check your spam folder.
							</Text>
						</>
					)}

					{step === "DONE" && (
						<Box textAlign="center" py={4}>
							{selected && (
								<Box width="140px" height="140px" mx="auto" mb={4} borderRadius="10px" overflow="hidden" bg="black">
									<Image src={selected} alt="" width="100%" height="100%" objectFit="contain" />
								</Box>
							)}
							<Text fontSize="lg" fontWeight="700" mb={2}>Request received!</Text>
							<Text color="#bbbbbb" fontSize="sm">We&apos;ll get back to you soon.</Text>
						</Box>
					)}
				</ModalBody>
				<ModalFooter>
					{step === "PICK" && (
						<Button
							size="lg"
							fontWeight="bold"
							borderRadius="12px"
							bg="#F79432"
							color="black"
							_hover={{ bg: "#e58220" }}
							width="100%"
							isDisabled={!selected}
							isLoading={submitting}
							onClick={confirm}
						>
							{viewerVerified === true ? "Send request" : "Continue"}
						</Button>
					)}
					{step === "EMAIL" && (
						<Button
							size="lg"
							fontWeight="bold"
							borderRadius="12px"
							bg="#F79432"
							color="black"
							_hover={{ bg: "#e58220" }}
							width="100%"
							isLoading={submitting}
							onClick={sendCode}
						>
							Send Verification Code
						</Button>
					)}
					{step === "CODE" && (
						<Button
							type="submit"
							form="photo-request-code-form"
							size="lg"
							fontWeight="bold"
							borderRadius="12px"
							bg="#F79432"
							color="black"
							_hover={{ bg: "#e58220" }}
							width="100%"
							isDisabled={code.length !== 6}
							isLoading={submitting}
						>
							Verify
						</Button>
					)}
					{step === "DONE" && (
						<Button
							size="lg"
							fontWeight="bold"
							borderRadius="12px"
							variant="outline"
							color="white"
							borderColor="#343536"
							_hover={{ bg: "whiteAlpha.100" }}
							width="100%"
							onClick={onClose}
						>
							Close
						</Button>
					)}
				</ModalFooter>
			</ModalContent>
		</Modal>
	)
}

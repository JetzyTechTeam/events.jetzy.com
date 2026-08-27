import React, { useCallback, useEffect, useMemo, useState } from "react"
import axios from "axios"
import {
	Box,
	Button,
	Flex,
	Icon,
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
import { FiCheck } from "react-icons/fi"
import type { AlbumMedia } from "@/components/events/EventAlbums"

/**
 * "Request Unwatermarked Photos".
 *
 * The photos on the album page carry a `JetzyLifeMark` overlay; this is how a viewer asks for
 * the clean originals. Several photos can go in one request, but each one is recorded as its
 * own row server-side — the host sends files one at a time and marks off what they have sent.
 *
 * Steps depend on what we already know about the viewer:
 *
 *   verified viewer   -> choose photos -> Send request -> "Request received!"
 *   unverified viewer -> choose photos -> email (read-only) -> code -> Verify -> "Request received!"
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
	/** Set when opened from the lightbox — that photo starts selected. */
	preselectedUrl?: string | null
	viewerEmail?: string
	/** UNDEFINED for a legacy guest cookie: never asked, so not proved. */
	viewerVerified?: boolean
}) {
	const toast = useToast()
	const [step, setStep] = useState<Step>("PICK")
	const [selected, setSelected] = useState<string[]>([])
	const [code, setCode] = useState("")
	const [submitting, setSubmitting] = useState(false)
	const [resendIn, setResendIn] = useState(0)
	// Opened from the lightbox's side panel the photo is already decided, so show it rather
	// than a grid to hunt through. The grid is one click away for adding more.
	const [picking, setPicking] = useState(false)

	const photos = useMemo(() => media.filter((m) => m.type !== "video"), [media])

	// Reset on every open, seeded with whatever the lightbox named.
	useEffect(() => {
		if (!isOpen) return
		setCode("")
		setSubmitting(false)
		setResendIn(0)
		setSelected(preselectedUrl ? [preselectedUrl] : [])
		setPicking(!preselectedUrl)
		setStep("PICK")
	}, [isOpen, preselectedUrl])

	useEffect(() => {
		if (resendIn <= 0) return
		const t = setTimeout(() => setResendIn((n) => n - 1), 1000)
		return () => clearTimeout(t)
	}, [resendIn])

	const toggle = (url: string) =>
		setSelected((cur) => (cur.includes(url) ? cur.filter((u) => u !== url) : [...cur, url]))

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
			if (selected.length === 0) return
			setSubmitting(true)
			try {
				await axios.post(`/api/events/${eventId}/albums/${albumId}/photo-request`, {
					mediaUrls: selected,
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

	const count = selected.length
	const photoWord = count === 1 ? "photo" : "photos"
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
									? "Tap the photos you'd like without the Jetzy Life mark. We'll pass the request on and get back to you."
									: "We'll ask for this photo without the Jetzy Life mark and get back to you."}
							</Text>

							{/* Single photo carried in from the lightbox: show it, don't make them
							    find it again in a grid. Adding more is one tap away. */}
							{!picking && count === 1 ? (
								<Box textAlign="center">
									<Box width="100%" maxW="320px" height="220px" mx="auto" borderRadius="10px" overflow="hidden" bg="black">
										<Image src={selected[0]} alt="" width="100%" height="100%" objectFit="contain" />
									</Box>
									<Button variant="link" size="sm" color="#F79432" fontWeight="600" mt={3} onClick={() => setPicking(true)}>
										Choose more photos
									</Button>
								</Box>
							) : photos.length === 0 ? (
								<Text color="#888" fontSize="sm">There are no photos in this album to request.</Text>
							) : (
								<>
									<Flex wrap="wrap" gap={2}>
										{photos.map((m) => {
											const isSelected = selected.includes(m.url)
											return (
												<Box
													as="button"
													type="button"
													key={m.url}
													onClick={() => toggle(m.url)}
													position="relative"
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
													<Image
														src={m.url}
														alt=""
														width="100%"
														height="100%"
														objectFit="contain"
														loading="lazy"
														opacity={isSelected ? 0.65 : 1}
													/>
													{isSelected && (
														<Flex
															position="absolute"
															top="4px"
															right="4px"
															width="20px"
															height="20px"
															borderRadius="full"
															bg="#F79432"
															align="center"
															justify="center"
														>
															<Icon as={FiCheck} color="black" boxSize="12px" />
														</Flex>
													)}
												</Box>
											)
										})}
									</Flex>
									<Text color="#8a8a8a" fontSize="xs" mt={3}>
										{count === 0 ? "Nothing selected yet." : `${count} ${photoWord} selected.`}
									</Text>
								</>
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
							{count > 0 && (
								<Flex justify="center" wrap="wrap" gap={2} mb={4}>
									{selected.slice(0, 4).map((url) => (
										<Box key={url} width="88px" height="88px" borderRadius="10px" overflow="hidden" bg="black">
											<Image src={url} alt="" width="100%" height="100%" objectFit="contain" />
										</Box>
									))}
								</Flex>
							)}
							{count > 4 && (
								<Text color="#8a8a8a" fontSize="xs" mb={3}>and {count - 4} more</Text>
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
							whiteSpace="normal"
							height="auto"
							minH="48px"
							py={3}
							lineHeight="1.3"
							isDisabled={count === 0}
							isLoading={submitting}
							onClick={confirm}
						>
							{viewerVerified === true
								? count > 1
									? `Request ${count} photos`
									: "Send request"
								: "Continue"}
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
							whiteSpace="normal"
							height="auto"
							minH="48px"
							py={3}
							lineHeight="1.3"
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

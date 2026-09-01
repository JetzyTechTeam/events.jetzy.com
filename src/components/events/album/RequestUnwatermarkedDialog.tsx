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
 *   unverified viewer -> choose photos -> email -> code -> Verify -> "Request received!"
 *
 * Everyone who came through today's album gate is verified, so the code step is effectively
 * only for guest cookies minted before that gate existed.
 *
 * The address IS editable. The cookie can carry an old or simply wrong one, and it is where the
 * host's reply goes — a field showing the wrong address with no way to correct it is worse than
 * no field, and on Safari a read-only input still raises a caret and a keyboard, so it read as
 * broken. Changing it costs a code sent to the new address (the server insists, whether or not
 * the viewer is otherwise verified), so it can only ever be an address the sender can read.
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
	// Seeded from the cookie/session, editable — see the note above.
	const [email, setEmail] = useState("")
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
		setEmail(viewerEmail || "")
		setSubmitting(false)
		setResendIn(0)
		setSelected(preselectedUrl ? [preselectedUrl] : [])
		setPicking(!preselectedUrl)
		setStep("PICK")
	}, [isOpen, preselectedUrl, viewerEmail])

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

	// The one call that files the request. `code` is only sent on the unverified path; `email`
	// always is, so the request is filed against exactly the address this dialog showed.
	const send = useCallback(
		async (withCode?: string) => {
			if (selected.length === 0) return
			setSubmitting(true)
			try {
				await axios.post(`/api/events/${eventId}/albums/${albumId}/photo-request`, {
					mediaUrls: selected,
					...(withCode ? { code: withCode } : {}),
					...(email.trim() ? { email: email.trim() } : {}),
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
		[albumId, email, eventId, fail, selected],
	)

	const sendCode = useCallback(async () => {
		const address = email.trim()
		if (!address) return
		setSubmitting(true)
		try {
			await axios.post(`/api/events/${eventId}/albums/send-code`, { email: address })
			setCode("")
			setResendIn(60)
			setStep("CODE")
		} catch (err: any) {
			fail(err, "Couldn't send the code")
		} finally {
			setSubmitting(false)
		}
	}, [email, eventId, fail])

	const emailChanged = email.trim().toLowerCase() !== (viewerEmail || "").trim().toLowerCase()
	const emailLooksValid = /^\S+@\S+\.\S+$/.test(email.trim())

	// Verified viewers file it straight away — unless they've pointed the request at another
	// address, which the server will insist on a code for either way.
	const confirm = () => (viewerVerified === true && !emailChanged ? send() : setStep("EMAIL"))

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

							{/* Where the reply goes, and the way to correct it. Without this the
							    address is only visible on the code step, which a verified viewer
							    never sees — so a wrong one could never be fixed. */}
							{(email || viewerEmail) && (
								<Flex mt={4} align="center" justify="space-between" gap={3} wrap="wrap">
									<Text color="#8a8a8a" fontSize="xs">
										We&apos;ll reply to{" "}
										<Box as="span" color="#dddddd">{email || viewerEmail}</Box>
									</Text>
									<Button variant="link" size="sm" color="#F79432" fontWeight="600" onClick={() => setStep("EMAIL")}>
										Use a different email
									</Button>
								</Flex>
							)}
						</>
					)}

					{step === "EMAIL" && (
						<>
							<Text color="#bbbbbb" fontSize="sm" mb={1}>
								We&apos;ll send a verification code to
							</Text>
							{/* Editable: this address is where the host's reply goes, and the one on the
							    cookie can be old or simply wrong. Changing it costs a code sent to the
							    new address, so it stays an address the sender can actually read. */}
							<Input
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="you@example.com"
								autoComplete="email"
								inputMode="email"
								_placeholder={{ color: "#555" }}
								bg="#1E1E1E"
								borderColor="#343536"
								borderRadius="10px"
								color="white"
								mb={3}
							/>
							<Text fontSize="xs" color="#777">
								{emailChanged
									? "The code goes to this address, and so does the host's reply."
									: "This confirms the request is really coming from you."}
							</Text>
						</>
					)}

					{step === "CODE" && (
						<>
							<Text color="#bbbbbb" fontSize="sm" mb={1}>Enter the 6-digit code we sent to</Text>
							<Text color="white" fontSize="sm" fontWeight="600" mb={4}>{email}</Text>
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
							{/* Matches the album gate's own code step — same sentence, same weight. */}
							<Text fontSize="sm" color="#F5C518" mt={3}>
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
							{viewerVerified === true && !emailChanged
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
							isDisabled={!emailLooksValid}
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

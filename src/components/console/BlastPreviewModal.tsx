import React, { useEffect, useMemo, useState } from "react"
import axios from "axios"
import {
	Box,
	Button,
	Flex,
	Modal,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalOverlay,
	Input,
	Text,
} from "@chakra-ui/react"

import { attachmentMode, blastImageContentId, formatBytes, type BlastAttachment } from "@/lib/blast-attachments"
import { normalizeTestAddress } from "@/lib/blast-test-send"
import { blastFallbackName, buildBlastHtml, personalizeBlastHtml, type BlastEmailType } from "@/lib/blast-template"

/**
 * What the guest will actually see, before anyone sees it.
 *
 * The markup comes from `buildBlastHtml` — the same function `api/send-blast.ts` calls — so this
 * cannot drift from what is sent. Before it existed the template lived only on the server and the
 * first render of a blast happened in a guest's inbox.
 *
 * TWO things are deliberately approximated, and both are stated on screen rather than faked
 * silently:
 *
 *  - The attached images are shown by their CDN url. The real email references them as `cid:`,
 *    because a remote `<img>` is blocked by Gmail until the reader clicks "Display images below"
 *    and the whole point of attaching a map is that it is seen without that step. The pixels are
 *    identical; only the reference differs.
 *  - The greeting uses the host's own name. Each guest gets their own.
 */

/** The preview swaps `cid:` for the real url, which is the one thing the browser can render. */
function withPreviewableImages(html: string, attachments: BlastAttachment[]): string {
	// Only the attached ones hold a cid, and the index must be their position among THOSE -
	// the same counter `fetchBlastAttachments` uses. Indexing the whole list would point
	// `blast-image-2` at the wrong file as soon as one entry is a link.
	const attached = attachments.filter((a) => attachmentMode(a) === "attach")
	let out = html
	attached.forEach((a, i) => {
		out = out.replace(new RegExp(`cid:${blastImageContentId(i)}`, "g"), a.url)
	})
	return out
}

export default function BlastPreviewModal({
	isOpen,
	onClose,
	subject,
	message,
	eventName,
	eventLink,
	event,
	emailType = "custom",
	attachments,
	targetType,
	status,
	hostName,
	hostEmail,
	senderLabel,
}: {
	isOpen: boolean
	onClose: () => void
	subject: string
	message: string
	eventName: string
	eventLink: string
	/** Passed straight through to `/api/send-blast` for the test send, which expects the event. */
	event: any
	emailType?: BlastEmailType
	attachments: BlastAttachment[]
	targetType: string
	status: string
	hostName?: string
	hostEmail?: string
	/** "Anna Khan via Jetzy" — resolved server-side; shown here as the From line. */
	senderLabel?: string
}) {
	const [testing, setTesting] = useState(false)
	// Seeded from the login address but editable: the person operating the console is often not
	// the person who has to approve the email, and forwarding a test by hand changes the headers
	// and the rendering, which defeats the point of it.
	const [testTo, setTestTo] = useState(hostEmail || "")
	const [testResult, setTestResult] = useState<{ type: "success" | "error"; text: string } | null>(null)

	const sampleEmail = hostEmail || "you@example.com"

	// The session can resolve after this mounts. Seed the field then, but never overwrite an
	// address the host has already typed.
	useEffect(() => {
		if (hostEmail && !testTo) setTestTo(hostEmail)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [hostEmail])
	const sampleName = (hostName || "").trim() || blastFallbackName(sampleEmail)

	const html = useMemo(() => {
		const built = buildBlastHtml({
			subject: subject || "(no subject)",
			message: message || "",
			eventName,
			eventLink,
			// The real footer is resolved server-side from the event's owner. Rendering a guess
			// here would be a preview of an email nobody sends, so this states what it is.
			footerContact: "Questions? (the footer is added when the blast is sent)",
			emailType,
			baseUrl: typeof window !== "undefined" ? window.location.origin : "",
			images: attachments
				.filter((a) => attachmentMode(a) === "attach")
				.map((a, i) => ({ contentId: blastImageContentId(i), filename: a.filename })),
			// Link-mode files render as the real anchors, exactly as the guest sees them.
			links: attachments
				.filter((a) => attachmentMode(a) === "link")
				.map((a) => ({ url: a.url, filename: a.filename, size: a.size })),
		})
		const personalized = personalizeBlastHtml(built, {
			userName: sampleName,
			userEmail: sampleEmail,
			// Shows the Cancel Booking block on an `availability` blast, which is the whole point
			// of that template — a host previewing it needs to see the button they are sending.
			bookingRef: emailType === "availability" ? "SAMPLE-REF" : undefined,
		})
		return withPreviewableImages(personalized, attachments)
	}, [subject, message, eventName, eventLink, emailType, attachments, sampleName, sampleEmail])

	// Checked as they type so the button can refuse before a round trip. The API runs the same
	// function and is the authority - this is feedback, not the gate.
	const addressCheck = normalizeTestAddress(testTo)

	const sendTest = async () => {
		if (addressCheck.error) {
			setTestResult({ type: "error", text: addressCheck.error })
			return
		}
		setTesting(true)
		setTestResult(null)
		try {
			const res = await axios.post("/api/send-blast", {
				event,
				subject,
				message,
				status,
				targetType,
				emailType,
				eventLink,
				attachments,
				testTo: addressCheck.email,
			})
			const skipped = res.data?.skippedAttachments?.length || 0
			// Names the address actually used, which may not be the one they logged in with.
			const sentTo = res.data?.sentTo || addressCheck.email
			setTestResult({
				type: "success",
				text: skipped
					? `Sent to ${sentTo}. ${skipped} image${skipped === 1 ? "" : "s"} couldn't be attached.`
					: `Sent to ${sentTo}. Check that inbox.`,
			})
		} catch (err: any) {
			setTestResult({ type: "error", text: err?.response?.data?.error || "That test didn't send." })
		} finally {
			setTesting(false)
		}
	}

	return (
		<Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside" isCentered>
			<ModalOverlay />
			<ModalContent bg="#1E1E1E" color="white">
				<ModalHeader>Preview</ModalHeader>
				<ModalCloseButton />
				<ModalBody>
					<Box bg="#090C10" border="1px solid #434343" borderRadius="lg" p={3} mb={3}>
						<Text fontSize="xs" color="gray.500">
							From
						</Text>
						<Text fontSize="sm" mb={2}>
							{senderLabel || "Jetzy"}
						</Text>
						<Text fontSize="xs" color="gray.500">
							Subject
						</Text>
						<Text fontSize="sm">{subject || "(no subject)"}</Text>
					</Box>

					{/*
					  * A SANDBOXED iframe, not `dangerouslySetInnerHTML`.
					  *
					  * `subject` and `message` are interpolated into the template unescaped — that is
					  * pre-existing behaviour hosts rely on for small bits of markup — so rendering
					  * this inline would execute host-typed script inside the console's own origin,
					  * with the admin's session sitting right there. `sandbox=""` denies everything,
					  * including scripts and same-origin access.
					  */}
					<Box border="1px solid #434343" borderRadius="lg" overflow="hidden" bg="white">
						<iframe
							title="Blast preview"
							srcDoc={html}
							sandbox=""
							style={{ width: "100%", height: "480px", border: "none", background: "white" }}
						/>
					</Box>

					{attachments.length > 0 && (
						<Box mt={3}>
							<Text fontSize="xs" color="gray.500" mb={1}>
								Files ({attachments.length})
							</Text>
							{attachments.map((a, i) => (
								<Text key={`${a.url}-${i}`} fontSize="sm" color="gray.300">
									{attachmentMode(a) === "attach" ? "🖼️" : "📎"} {a.filename} · {formatBytes(a.size)} ·{" "}
									{attachmentMode(a) === "attach" ? "in the email" : "link"}
								</Text>
							))}
						</Box>
					)}

					<Text fontSize="xs" color="gray.500" mt={3}>
						Each guest sees their own name in the greeting; this shows yours. The footer and sender name are added when
						the blast is sent.
					</Text>

					{testResult && (
						<Text fontSize="sm" mt={3} color={testResult.type === "success" ? "#48BB78" : "#FC8181"}>
							{testResult.text}
						</Text>
					)}
				</ModalBody>
				<ModalFooter display="block">
					<Text fontSize="xs" color="gray.500" mb={1}>
						Send a test to
					</Text>
					<Flex gap={3} w="100%" align="center" wrap="wrap">
						<Input
							value={testTo}
							onChange={(e) => setTestTo(e.target.value)}
							placeholder="you@example.com"
							type="email"
							flex="1"
							minW="220px"
							bg="#090C10"
							borderColor="#444444"
							color="white"
							_placeholder={{ color: "gray.500" }}
						/>
						<Button
							variant="outline"
							borderColor="#444444"
							color="white"
							_hover={{ bg: "#2A2A2A" }}
							isLoading={testing}
							isDisabled={!!addressCheck.error}
							onClick={sendTest}
						>
							Send test
						</Button>
						<Button bg="#F79432" color="black" _hover={{ bg: "#E68422" }} onClick={onClose}>
							Close
						</Button>
					</Flex>
					{/* Only once they have typed something - an empty field on open is not a mistake yet. */}
					{addressCheck.error && testTo.trim().length > 0 && (
						<Text fontSize="xs" color="#FC8181" mt={2}>
							{addressCheck.error}
						</Text>
					)}
				</ModalFooter>
			</ModalContent>
		</Modal>
	)
}

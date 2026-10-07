import React, { useRef, useState } from "react"
import { Box, Button, Flex, Image, Text } from "@chakra-ui/react"

import {
	BLAST_ATTACHMENT_MAX_COUNT,
	BLAST_LINK_MAX_COUNT,
	attachBlockedReason,
	attachmentMode,
	blastAttachmentRefusal,
	formatBytes,
	isAllowedBlastImageType,
	type BlastAttachment,
} from "@/lib/blast-attachments"
import { uploadFile } from "@/services/upload.service"

/**
 * Picks the files a blast carries, and whether each one travels IN the email or as a LINK.
 *
 * Deliberately NOT `MediaUploadSection`: that component is built around the event's
 * images/videos split and `mediaOrder`, neither of which exists here, and bending it would couple
 * the blast composer to the event media model.
 *
 * The validation runs BEFORE anything is uploaded, and it is the only validation there is:
 * probed on 2026-10-07, the uploader checks the `folder` and NOTHING else — a PDF, an mp4, a bare
 * `.exe` and a 60MB blob were all accepted and stored. The input has no `accept` filter either,
 * since any file may be linked. The same `blastAttachmentRefusal` runs again in the API, so the
 * button and the server can never disagree.
 */
export default function BlastAttachmentPicker({
	attachments,
	onChange,
	onUploadingChange,
	compact = false,
}: {
	attachments: BlastAttachment[]
	onChange: (next: BlastAttachment[]) => void
	/** Lets the composer disable Send while files are still in flight. */
	onUploadingChange?: (uploading: boolean) => void
	compact?: boolean
}) {
	const inputRef = useRef<HTMLInputElement>(null)
	const [uploading, setUploading] = useState(false)
	const [progress, setProgress] = useState(0)
	const [error, setError] = useState<string | null>(null)

	const setBusy = (busy: boolean) => {
		setUploading(busy)
		onUploadingChange?.(busy)
	}

	const asRule = (a: BlastAttachment) => ({
		filename: a.filename,
		contentType: a.contentType,
		size: a.size,
		mode: attachmentMode(a),
	})

	const attachedCount = attachments.filter((a) => attachmentMode(a) === "attach").length
	const linkedCount = attachments.length - attachedCount

	const handleFiles = async (fileList: FileList | null) => {
		if (!fileList || fileList.length === 0) return
		setError(null)

		const picked = Array.from(fileList)

		// A new file is attached when it CAN be, and linked when it cannot. The common case — a
		// small image — keeps the behaviour that displays in the body, while a PDF or an oversized
		// file lands as a link instead of being refused outright.
		const modeFor = (f: File): "attach" | "link" =>
			attachBlockedReason({ filename: f.name, contentType: f.type, size: f.size }) ? "link" : "attach"

		// Judged against what is ALREADY here, not just this batch — otherwise three files twice
		// slips past a cap of five.
		const refusal = blastAttachmentRefusal([
			...attachments.map(asRule),
			...picked.map((f) => ({ filename: f.name, contentType: f.type, size: f.size, mode: modeFor(f) })),
		])
		if (refusal) {
			setError(refusal)
			if (inputRef.current) inputRef.current.value = ""
			return
		}

		setBusy(true)
		setProgress(0)
		const added: BlastAttachment[] = []
		try {
			for (const file of picked) {
				const { url } = await uploadFile(file, {
					// "posts", not "blasts": the uploader's folder allowlist is server-side and refuses
					// anything outside it with a 500. The folder is only an S3 key prefix and nothing
					// reads it back. See UploadFolder in upload.service.ts.
					folder: "posts",
					onProgressChange: (p) => setProgress(p),
				})
				added.push({ url, filename: file.name, contentType: file.type, size: file.size, mode: modeFor(file) })
			}
			onChange([...attachments, ...added])
		} catch (err: any) {
			// Anything that did upload is kept: making the host re-pick five files because the
			// fourth failed is worse than showing them four and the reason.
			if (added.length > 0) onChange([...attachments, ...added])
			setError(err?.message || "That upload didn't go through. Try again.")
		} finally {
			setBusy(false)
			setProgress(0)
			if (inputRef.current) inputRef.current.value = ""
		}
	}

	const removeAt = (index: number) => {
		// Local only. There is no delete endpoint for an uploaded blast file, and `deleteFile` is
		// a documented no-op — removing it here means it is not SENT, which is what the host means.
		onChange(attachments.filter((_, i) => i !== index))
		setError(null)
	}

	const setMode = (index: number, mode: "attach" | "link") => {
		const next = attachments.map((a, i) => (i === index ? { ...a, mode } : a))
		// Re-checked: moving a file INTO the email can break the attached-images budget even though
		// nothing was added.
		const refusal = blastAttachmentRefusal(next.map(asRule))
		if (refusal) {
			setError(refusal)
			return
		}
		setError(null)
		onChange(next)
	}

	return (
		<Box mb={3}>
			<Flex align="center" gap={3} wrap="wrap">
				<Button
					type="button"
					size="sm"
					variant="outline"
					borderColor="#444444"
					color="#F79432"
					_hover={{ bg: "#2A2A2A" }}
					isDisabled={uploading}
					onClick={() => inputRef.current?.click()}
				>
					{uploading ? `Uploading… ${progress}%` : "Add file"}
				</Button>
				<Text fontSize="xs" color="gray.500">
					Images can show in the email ({attachedCount}/{BLAST_ATTACHMENT_MAX_COUNT}) · anything else is sent as a link (
					{linkedCount}/{BLAST_LINK_MAX_COUNT})
				</Text>
			</Flex>

			{/* No `accept` filter: any file may be LINKED, and the mode is decided per file below. */}
			<input ref={inputRef} type="file" multiple style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />

			{error && (
				<Text fontSize="sm" color="#FC8181" mt={2}>
					{error}
				</Text>
			)}

			{attachments.length > 0 && (
				<>
					<Flex gap={3} mt={3} wrap="wrap">
						{attachments.map((a, i) => {
							const mode = attachmentMode(a)
							const cannotAttach = attachBlockedReason({ filename: a.filename, contentType: a.contentType, size: a.size })
							const isImage = isAllowedBlastImageType(a.contentType)

							return (
								<Box key={`${a.url}-${i}`} position="relative" w={compact ? "104px" : "124px"}>
									{isImage ? (
										<Image
											src={a.url}
											alt={a.filename}
											w="100%"
											h={compact ? "72px" : "96px"}
											objectFit="cover"
											borderRadius="8px"
											border="1px solid #434343"
										/>
									) : (
										<Flex
											w="100%"
											h={compact ? "72px" : "96px"}
											align="center"
											justify="center"
											borderRadius="8px"
											border="1px solid #434343"
											bg="#090C10"
											fontSize="24px"
										>
											📄
										</Flex>
									)}

									<Button
										type="button"
										size="xs"
										position="absolute"
										top="-8px"
										right="-8px"
										borderRadius="full"
										bg="#1E1E1E"
										color="white"
										border="1px solid #434343"
										_hover={{ bg: "#FC8181", color: "black" }}
										onClick={() => removeAt(i)}
										aria-label={`Remove ${a.filename}`}
									>
										×
									</Button>

									<Text fontSize="10px" color="gray.500" mt={1} noOfLines={1} title={a.filename}>
										{a.filename}
									</Text>
									<Text fontSize="10px" color="gray.600">
										{formatBytes(a.size)}
									</Text>

									{/* The toggle is offered only where there is a real choice. A file that
									    cannot travel in the email states why rather than showing a dead control. */}
									{cannotAttach ? (
										<Text fontSize="10px" color="#F79432" mt={1} title={cannotAttach}>
											Link only
										</Text>
									) : (
										<Flex mt={1} gap={1}>
											{(["attach", "link"] as const).map((m) => (
												<Button
													key={m}
													type="button"
													size="xs"
													flex="1"
													minW={0}
													fontSize="10px"
													px={1}
													bg={mode === m ? "#F79432" : "#2A2A2A"}
													color={mode === m ? "black" : "gray.300"}
													_hover={{ bg: mode === m ? "#E68422" : "#3A3A3A" }}
													onClick={() => setMode(i, m)}
												>
													{m === "attach" ? "In email" : "Link"}
												</Button>
											))}
										</Flex>
									)}
								</Box>
							)
						})}
					</Flex>

					{linkedCount > 0 && (
						<Text fontSize="xs" color="gray.500" mt={2}>
							A linked file opens from a public address — anyone given the link can view it, with no sign-in.
						</Text>
					)}
				</>
			)}
		</Box>
	)
}

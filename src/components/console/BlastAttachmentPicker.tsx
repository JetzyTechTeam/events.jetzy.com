import React, { useRef, useState } from "react"
import { Box, Button, Flex, Image, Text } from "@chakra-ui/react"

import {
	BLAST_ATTACHMENT_MAX_COUNT,
	BLAST_IMAGE_ACCEPT,
	blastAttachmentRefusal,
	formatBytes,
	type BlastAttachment,
} from "@/lib/blast-attachments"
import { uploadFile } from "@/services/upload.service"

/**
 * Picks the images a blast carries.
 *
 * Deliberately NOT `MediaUploadSection`: that component is built around the event's
 * images/videos split and `mediaOrder`, neither of which exists here, and bending it would couple
 * the blast composer to the event media model.
 *
 * The validation runs BEFORE anything is uploaded. `uploadFile` performs no checks of its own
 * (nothing in this repo has ever checked `file.size`), and the input's `accept` attribute is only
 * a file-picker filter — drag-and-drop or choosing "All files" walks straight past it. The same
 * `blastAttachmentRefusal` runs again in the API, so the two can never disagree.
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

	const remaining = BLAST_ATTACHMENT_MAX_COUNT - attachments.length

	const handleFiles = async (fileList: FileList | null) => {
		if (!fileList || fileList.length === 0) return
		setError(null)

		const picked = Array.from(fileList)

		// Judged against what is ALREADY attached, not just this batch — otherwise three files
		// twice slips past a cap of five.
		const refusal = blastAttachmentRefusal([
			...attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, size: a.size })),
			...picked.map((f) => ({ filename: f.name, contentType: f.type, size: f.size })),
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
				added.push({ url, filename: file.name, contentType: file.type, size: file.size })
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
		// Local only. There is no delete endpoint for an uploaded blast image, and `deleteFile` is
		// a documented no-op — removing it here means it is not SENT, which is what the host means.
		onChange(attachments.filter((_, i) => i !== index))
		setError(null)
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
					isDisabled={uploading || remaining <= 0}
					onClick={() => inputRef.current?.click()}
				>
					{uploading ? `Uploading… ${progress}%` : "Attach image"}
				</Button>
				<Text fontSize="xs" color="gray.500">
					{remaining > 0
						? `Images only · up to ${BLAST_ATTACHMENT_MAX_COUNT} · they appear in the email and as attachments`
						: `${BLAST_ATTACHMENT_MAX_COUNT} images is the limit`}
				</Text>
			</Flex>

			<input
				ref={inputRef}
				type="file"
				multiple
				accept={BLAST_IMAGE_ACCEPT}
				style={{ display: "none" }}
				onChange={(e) => handleFiles(e.target.files)}
			/>

			{error && (
				<Text fontSize="sm" color="#FC8181" mt={2}>
					{error}
				</Text>
			)}

			{attachments.length > 0 && (
				<Flex gap={3} mt={3} wrap="wrap">
					{attachments.map((a, i) => (
						<Box key={`${a.url}-${i}`} position="relative" w={compact ? "72px" : "96px"}>
							<Image
								src={a.url}
								alt={a.filename}
								w="100%"
								h={compact ? "72px" : "96px"}
								objectFit="cover"
								borderRadius="8px"
								border="1px solid #434343"
							/>
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
						</Box>
					))}
				</Flex>
			)}
		</Box>
	)
}

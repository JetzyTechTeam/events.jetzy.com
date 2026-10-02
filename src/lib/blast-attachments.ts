/**
 * What a host may attach to a blast, and why the ceilings are where they are.
 *
 * PURE AND CLIENT-SAFE — the picker imports these constants and the API imports the same
 * validators, so the files the button accepts and the files the server accepts cannot disagree.
 * The fetching/base64 half lives in `blast-attachments-server.ts`; keep the split, the way
 * `invite-trial.ts` is split from `signup-trial.ts`, or webpack follows the server imports into
 * the browser bundle.
 *
 * IMAGES ONLY, BY DECISION. Video is excluded deliberately, not forgotten: `send-blast.ts` issues
 * one SendGrid call per recipient with no chunking, so every megabyte attached is multiplied by
 * the size of the guest list.
 *
 * The ceilings exist for the same reason. Base64 inflates the payload by roughly a third, SendGrid
 * hard-limits a single message at 30MB, and a 2,000-guest event would otherwise open 2,000
 * simultaneous connections each carrying the full attachment set from one serverless invocation.
 * These are the first file-size checks in this codebase — `uploadFile` has never had any, and
 * `MediaUploadSection` relies on the browser `accept` attribute, which is only a file-picker
 * filter and is bypassed by drag-and-drop.
 */

export const BLAST_ATTACHMENT_MAX_COUNT = 5
export const BLAST_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
export const BLAST_ATTACHMENT_TOTAL_MAX_BYTES = 10 * 1024 * 1024

/** Formats every mail client renders inline. No SVG — it carries script. */
export const BLAST_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"] as const

/** For the file input's `accept`. A filter for the picker, never the check itself. */
export const BLAST_IMAGE_ACCEPT = BLAST_IMAGE_TYPES.join(",")

/** One attached image, as it travels on the wire and is stored on the blast record. */
export interface BlastAttachment {
	/** CDN url returned by `uploadFile`. */
	url: string
	filename: string
	contentType: string
	size: number
}

export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB"
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function isAllowedBlastImageType(contentType?: string): boolean {
	if (!contentType) return false
	return (BLAST_IMAGE_TYPES as readonly string[]).includes(contentType.toLowerCase())
}

/**
 * The refusal a host is shown, or `null` when the set is fine.
 *
 * One function for both sides: the picker calls it on `File`s before uploading anything, the API
 * calls it on the `{ filename, contentType, size }` records the client sends. A client-supplied
 * size is a claim, not a fact — see `fetchBlastAttachments`, which re-measures what it downloads.
 */
export function blastAttachmentRefusal(
	files: Array<{ filename?: string; name?: string; contentType?: string; type?: string; size?: number }>,
): string | null {
	if (!files || files.length === 0) return null

	if (files.length > BLAST_ATTACHMENT_MAX_COUNT) {
		return `You can attach up to ${BLAST_ATTACHMENT_MAX_COUNT} images to a blast.`
	}

	let total = 0
	for (const file of files) {
		const name = file.filename || file.name || "That file"
		const type = file.contentType || file.type
		const size = file.size || 0

		if (!isAllowedBlastImageType(type)) {
			// Named separately because "we don't send video" is a decision a host should hear as a
			// decision, not as a generic "unsupported file".
			if (type?.startsWith("video/")) {
				return `${name} is a video. Blasts can carry images only — a video would be sent in full to every guest on your list.`
			}
			return `${name} isn't an image we can send. Use PNG, JPEG, WEBP or GIF.`
		}

		if (size > BLAST_ATTACHMENT_MAX_BYTES) {
			return `${name} is ${formatBytes(size)}. Each image must be under ${formatBytes(BLAST_ATTACHMENT_MAX_BYTES)}.`
		}

		total += size
	}

	if (total > BLAST_ATTACHMENT_TOTAL_MAX_BYTES) {
		return `Those images come to ${formatBytes(total)} together. A blast can carry ${formatBytes(
			BLAST_ATTACHMENT_TOTAL_MAX_BYTES,
		)} in total — every guest receives a full copy.`
	}

	return null
}

/**
 * The `cid:` handle an image is referenced by in the HTML.
 *
 * Derived from position rather than from the filename: two files can share a name, and a `cid`
 * collision silently makes one image render twice while the other never appears.
 */
export function blastImageContentId(index: number): string {
	return `blast-image-${index + 1}`
}

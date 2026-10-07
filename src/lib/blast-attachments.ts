/**
 * What a host may send with a blast, and why each ceiling is where it is.
 *
 * PURE AND CLIENT-SAFE — the picker imports these constants and the API imports the same
 * validators, so the files the button accepts and the files the server accepts cannot disagree.
 * The fetching/base64 half lives in `blast-attachments-server.ts`; keep the split, the way
 * `invite-trial.ts` is split from `signup-trial.ts`, or webpack follows the server imports into
 * the browser bundle.
 *
 * TWO MODES, AND THE DIFFERENCE IS WHO CARRIES THE BYTES.
 *
 *  - **attach** — the file is downloaded, base64-encoded and put in EVERY message. It displays in
 *    the body via `cid:` and is downloadable from the email. `send-blast.ts` sends one SendGrid
 *    message per recipient with NO chunking, so a megabyte here is a megabyte times the guest
 *    list. Base64 inflates ~33% and SendGrid hard-caps one message at 30MB. Hence the tight caps,
 *    and hence images only.
 *  - **link** — nothing is carried at all. The file is already on S3 with a public, unsigned url
 *    (`uploadFile` put it there before any of this runs), so the email holds an anchor. Costs
 *    nothing per recipient, which is why the type and size rules can be far looser.
 *
 * VERIFIED AGAINST THE LIVE UPLOADER (2026-10-07): it validates the `folder` and NOTHING ELSE.
 * A PDF, an mp4, a CSV, a bare `.exe` and a 60MB blob were all accepted and stored. So every
 * limit below is ours alone — there is no backend check to fall back on.
 */

/** The file is in every message (images only). */
export const BLAST_ATTACHMENT_MAX_COUNT = 5
export const BLAST_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
export const BLAST_ATTACHMENT_TOTAL_MAX_BYTES = 10 * 1024 * 1024

/**
 * The email holds only a url, so these are about what is reasonable to upload and to put in front
 * of a guest, not about message weight.
 */
export const BLAST_LINK_MAX_COUNT = 10
export const BLAST_LINK_MAX_BYTES = 50 * 1024 * 1024

/** Formats every mail client renders inline. No SVG — it carries script. */
export const BLAST_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"] as const

/** For the file input's `accept`. A filter for the picker, never the check itself. */
export const BLAST_IMAGE_ACCEPT = BLAST_IMAGE_TYPES.join(",")

/**
 * Refused in BOTH modes.
 *
 * The uploader stores anything, so without this a host could put an executable on a Jetzy-branded
 * domain and mail the link to their whole guest list. Matched on the EXTENSION, not the MIME type:
 * the browser's reported type is whatever the OS guessed and is trivially wrong, while the
 * extension is what the recipient's machine will act on when they open it.
 */
export const BLAST_BLOCKED_EXTENSIONS = [
	"exe", "bat", "cmd", "com", "scr", "pif", "msi", "msp", "cpl",
	"sh", "bash", "zsh", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh",
	"jar", "app", "dmg", "pkg", "deb", "rpm", "apk", "dll", "so",
	"html", "htm", "svg", // render as pages/script when opened from a link
] as const

export type BlastAttachmentMode = "attach" | "link"

/** One file travelling with a blast, as stored and as sent on the wire. */
export interface BlastAttachment {
	/** CDN url returned by `uploadFile`. Public and unsigned. */
	url: string
	filename: string
	contentType: string
	size: number
	/**
	 * ABSENT MEANS `"attach"`. Every blast sent before this field existed carried real
	 * attachments, so an undefined mode must not read as a link. Go through `attachmentMode`.
	 */
	mode?: BlastAttachmentMode
}

/** The ONE place the absent-means-attach rule lives. Never read `.mode` directly. */
export function attachmentMode(file: { mode?: BlastAttachmentMode }): BlastAttachmentMode {
	return file.mode === "link" ? "link" : "attach"
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

export function fileExtension(filename?: string): string {
	const name = (filename || "").trim().toLowerCase()
	const dot = name.lastIndexOf(".")
	return dot === -1 ? "" : name.slice(dot + 1)
}

export function isBlockedBlastFile(filename?: string): boolean {
	return (BLAST_BLOCKED_EXTENSIONS as readonly string[]).includes(fileExtension(filename))
}

/**
 * Can this file be ATTACHED, or must it be a link? Returns the reason it cannot, or null.
 *
 * Used by the picker to decide a new file's default mode and to disable the toggle, and by the
 * validator below. An image that is simply too big is not an error — it is a link.
 */
export function attachBlockedReason(file: { filename?: string; contentType?: string; size?: number }): string | null {
	const type = file.contentType
	const size = file.size || 0

	if (!isAllowedBlastImageType(type)) {
		return type?.startsWith("video/")
			? "Video can't be attached — send it as a link instead."
			: "Only PNG, JPEG, WEBP and GIF can be attached. Send this as a link instead."
	}
	if (size > BLAST_ATTACHMENT_MAX_BYTES) {
		return `${formatBytes(size)} is too large to attach (limit ${formatBytes(
			BLAST_ATTACHMENT_MAX_BYTES,
		)}). Send it as a link instead.`
	}
	return null
}

type FileLike = {
	filename?: string
	name?: string
	contentType?: string
	type?: string
	size?: number
	mode?: BlastAttachmentMode
}

function describe(file: FileLike) {
	return {
		name: file.filename || file.name || "That file",
		type: file.contentType || file.type,
		size: file.size || 0,
		mode: attachmentMode(file),
	}
}

/**
 * The refusal a host is shown, or `null` when the set is fine.
 *
 * One function for both sides: the picker calls it on `File`s before uploading anything, the API
 * calls it on the records the client sends. A client-supplied size is a claim, not a fact — see
 * `fetchBlastAttachments`, which re-measures what it actually downloads.
 *
 * THE TWO BUDGETS ARE SEPARATE. The attach caps are judged only against attach-mode entries, so a
 * 40MB linked PDF does not eat the 10MB that exists to keep messages small.
 */
export function blastAttachmentRefusal(files: FileLike[]): string | null {
	if (!files || files.length === 0) return null

	const all = files.map(describe)

	// Blocked outright, whichever mode — the uploader stores anything, so this is the only gate.
	for (const f of all) {
		if (isBlockedBlastFile(f.name)) {
			return `${f.name} is a file type we can't send, for everyone's safety.`
		}
	}

	const attached = all.filter((f) => f.mode === "attach")
	const linked = all.filter((f) => f.mode === "link")

	if (attached.length > BLAST_ATTACHMENT_MAX_COUNT) {
		return `You can attach up to ${BLAST_ATTACHMENT_MAX_COUNT} images. Send the rest as links.`
	}
	if (linked.length > BLAST_LINK_MAX_COUNT) {
		return `You can link up to ${BLAST_LINK_MAX_COUNT} files in one blast.`
	}

	let attachedTotal = 0
	for (const f of attached) {
		const reason = attachBlockedReason({ filename: f.name, contentType: f.type, size: f.size })
		if (reason) return `${f.name}: ${reason}`
		attachedTotal += f.size
	}

	if (attachedTotal > BLAST_ATTACHMENT_TOTAL_MAX_BYTES) {
		return `The attached images come to ${formatBytes(attachedTotal)} together. ${formatBytes(
			BLAST_ATTACHMENT_TOTAL_MAX_BYTES,
		)} is the limit — every guest receives a full copy. Send some as links instead.`
	}

	for (const f of linked) {
		if (f.size > BLAST_LINK_MAX_BYTES) {
			return `${f.name} is ${formatBytes(f.size)}. ${formatBytes(BLAST_LINK_MAX_BYTES)} is the limit for a linked file.`
		}
	}

	return null
}

/**
 * The `cid:` handle an attached image is referenced by in the HTML.
 *
 * Derived from position rather than from the filename: two files can share a name, and a `cid`
 * collision silently makes one image render twice while the other never appears.
 */
export function blastImageContentId(index: number): string {
	return `blast-image-${index + 1}`
}

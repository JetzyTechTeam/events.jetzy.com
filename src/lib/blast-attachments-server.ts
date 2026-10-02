/**
 * Turning a host's uploaded image urls into SendGrid attachment entries.
 *
 * SERVER ONLY — it fetches over the network and uses `Buffer`. The constants and the validator it
 * leans on are in the pure `blast-attachments.ts`, which the picker also imports; keep that split.
 *
 * Fetched ONCE per blast, before the recipient loop, and the same array is handed to every send.
 * Re-fetching per recipient would mean one CDN round trip per guest.
 */

import {
	BLAST_ATTACHMENT_MAX_COUNT,
	BLAST_ATTACHMENT_TOTAL_MAX_BYTES,
	blastImageContentId,
	formatBytes,
	isAllowedBlastImageType,
	type BlastAttachment,
} from "./blast-attachments"
import type { BlastInlineImage } from "./blast-template"

/** The shape SendGrid wants. `content_id` is snake_case — it ignores `contentId` silently. */
export interface SendGridAttachment {
	filename: string
	type: string
	content: string
	content_id: string
	/**
	 * `inline` puts the image in the body via `cid:` AND still lists it as an attachment in most
	 * clients, which is the behaviour asked for: the guest sees the map without clicking
	 * "Display images below", and can still save the file.
	 */
	disposition: "inline"
}

export interface FetchedBlastAttachments {
	attachments: SendGridAttachment[]
	/** Passed to `buildBlastHtml` so the body references the same cids. */
	images: BlastInlineImage[]
	/** Non-fatal problems worth logging; a blast is not failed over one unreadable image. */
	skipped: Array<{ url: string; reason: string }>
}

const FETCH_TIMEOUT_MS = 15_000

/**
 * Downloads each attachment and base64-encodes it.
 *
 * The size is re-measured from what actually arrives rather than trusted from the request body.
 * The client's `size` is what a browser reported about a file it then uploaded somewhere else;
 * nothing stops a hand-made request claiming 1KB and pointing at a 40MB file, and the ceiling
 * exists to protect a send fan-out, so it has to hold against that.
 *
 * An image that cannot be fetched is SKIPPED, not fatal. The alternative is refusing to send a
 * written blast because one picture 404'd, which is a worse outcome for the host than an email
 * that goes out with two images instead of three — and the skip is reported back so they are told.
 */
export async function fetchBlastAttachments(list: BlastAttachment[]): Promise<FetchedBlastAttachments> {
	const result: FetchedBlastAttachments = { attachments: [], images: [], skipped: [] }
	if (!list || list.length === 0) return result

	// Defensive: the route validates first, but this helper must not fan out unbounded if it is
	// ever called from somewhere that forgot to.
	const capped = list.slice(0, BLAST_ATTACHMENT_MAX_COUNT)
	let totalBytes = 0

	for (let i = 0; i < capped.length; i++) {
		const item = capped[i]
		try {
			if (!isAllowedBlastImageType(item.contentType)) {
				result.skipped.push({ url: item.url, reason: `unsupported type ${item.contentType}` })
				continue
			}

			const controller = new AbortController()
			const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
			let response: Response
			try {
				response = await fetch(item.url, { signal: controller.signal })
			} finally {
				clearTimeout(timer)
			}

			if (!response.ok) {
				result.skipped.push({ url: item.url, reason: `fetch failed (${response.status})` })
				continue
			}

			const buffer = Buffer.from(await response.arrayBuffer())

			if (totalBytes + buffer.byteLength > BLAST_ATTACHMENT_TOTAL_MAX_BYTES) {
				result.skipped.push({
					url: item.url,
					reason: `would exceed the ${formatBytes(BLAST_ATTACHMENT_TOTAL_MAX_BYTES)} total`,
				})
				continue
			}
			totalBytes += buffer.byteLength

			const contentId = blastImageContentId(result.attachments.length)
			result.attachments.push({
				filename: item.filename || `image-${result.attachments.length + 1}`,
				type: item.contentType,
				content: buffer.toString("base64"),
				content_id: contentId,
				disposition: "inline",
			})
			result.images.push({ contentId, filename: item.filename || "" })
		} catch (err: any) {
			result.skipped.push({ url: item.url, reason: err?.message || "could not be read" })
		}
	}

	return result
}

/**
 * What an album viewer may see of a photo tag — pure, client-safe.
 *
 * Tags carry email addresses the tagged person never shared with the album's audience: somebody
 * else typed them. Album links travel far (publish emails, WhatsApp, socials), and anyone through
 * the gate could read every address on the album straight out of the tags response. So:
 *
 *  - the event's admin / owner get the tag as stored — they run the event and already see the
 *    guest list;
 *  - everyone else gets the address MASKED (`s***@gmail.com`) and the tagger's address not at
 *    all, plus the flags the page needs: `isMe`, `addedByMe`, `canRemove`.
 *
 * The KEY `personEmail` stays on every row, masked, so a client rendering
 * `personName || personEmail` keeps working and never shows a full address.
 *
 * `canRemove` mirrors the DELETE route's rule (admin, owner, the tagger, the tagged person). The
 * route stays the authority; this only decides whether to draw the × at all.
 */

export interface StoredAlbumTag {
	_id: unknown
	eventId?: unknown
	albumId: unknown
	mediaUrl: string
	personEmail: string
	personName?: string
	taggedByEmail?: string
	taggedByName?: string
	notifiedAt?: Date | string
	createdAt?: Date | string
	updatedAt?: Date | string
}

export interface VisibleAlbumTag {
	_id: string
	albumId: string
	mediaUrl: string
	/** Full address for admin/owner; masked for everyone else. */
	personEmail: string
	personName?: string
	taggedByName?: string
	/** Only for admin/owner. */
	taggedByEmail?: string
	createdAt?: Date | string
	/** This tag is of the person viewing. */
	isMe: boolean
	/** The person viewing added this tag. */
	addedByMe: boolean
	/** The person viewing may remove this tag. */
	canRemove: boolean
}

const norm = (email?: string | null) => (email || "").trim().toLowerCase()

/** `sarah@gmail.com` → `s***@gmail.com`. Anything that isn't an address becomes `***`. */
export const maskEmail = (email?: string | null): string => {
	const value = (email || "").trim()
	const at = value.lastIndexOf("@")
	if (at < 1) return "***"
	return `${value[0]}***${value.slice(at)}`
}

export const tagForViewer = (tag: StoredAlbumTag, viewerEmail: string | null | undefined, canManage: boolean): VisibleAlbumTag => {
	const me = norm(viewerEmail)
	const isMe = !!me && norm(tag.personEmail) === me
	const addedByMe = !!me && norm(tag.taggedByEmail) === me

	return {
		_id: String(tag._id),
		albumId: String(tag.albumId),
		mediaUrl: tag.mediaUrl,
		// Your own address is yours to see, even unmasked.
		personEmail: canManage || isMe ? tag.personEmail : maskEmail(tag.personEmail),
		...(tag.personName ? { personName: tag.personName } : {}),
		...(tag.taggedByName ? { taggedByName: tag.taggedByName } : {}),
		...(canManage && tag.taggedByEmail ? { taggedByEmail: tag.taggedByEmail } : {}),
		...(tag.createdAt ? { createdAt: tag.createdAt } : {}),
		isMe,
		addedByMe,
		canRemove: canManage || isMe || addedByMe,
	}
}

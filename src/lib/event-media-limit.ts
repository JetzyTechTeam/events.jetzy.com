/**
 * How many banner items (photos + videos together) an event may carry.
 *
 * The cap applies to NON-ADMIN hosts only — admins stay unlimited, by decision. It is not a
 * storage rule, it is an editorial one: a public listing with a dozen banner slides reads as
 * an album, and only the first item is ever used by the cards.
 *
 * Grandfathering is deliberate. Events created before this cap existed can hold more than the
 * limit, and a flat `> LIMIT` rejection in `update.ts` would make every one of them unsavable
 * — a host could not fix a typo in the title without first deleting media. `allowedMediaCount`
 * therefore floors the allowance at whatever is already stored, so an over-limit event can be
 * kept or trimmed but never grown.
 *
 * `images` and `videos` are counted TOGETHER because that is what the banner shows; counting
 * them separately would let a host post five of each.
 */

export const EVENT_MEDIA_LIMIT = 5

export const EVENT_MEDIA_LIMIT_MESSAGE = `You can add up to ${EVENT_MEDIA_LIMIT} photos and videos in total.`

/**
 * The ceiling this save must respect. `null` means unlimited (admins).
 *
 * @param storedCount how many items the event already holds, so an over-limit legacy event
 *                    stays editable. Pass 0 (the default) when creating.
 *
 * Server-side this is the count in the database. CLIENT-SIDE, pass the count currently in the
 * form, not the one the page was served with: deleting an image on the manage form writes
 * through immediately (`/api/delete-image`), so the served figure goes stale and the form would
 * offer slots the server then refuses. Counting what is on screen also makes the allowance
 * ratchet downwards — an event on 8 can go to 7 and then cannot climb back.
 */
export const allowedMediaCount = (isAdmin: boolean, storedCount = 0): number | null => {
	if (isAdmin) return null
	return Math.max(EVENT_MEDIA_LIMIT, storedCount)
}

/** The refusal sentence for a save that would exceed the ceiling, or `null` when it fits. */
export const mediaLimitRefusal = (args: { isAdmin: boolean; nextCount: number; storedCount?: number }): string | null => {
	const allowed = allowedMediaCount(args.isAdmin, args.storedCount ?? 0)
	if (allowed === null || args.nextCount <= allowed) return null
	// An event already over the cap gets its real allowance named, or the message would quote a
	// number smaller than what it is currently holding and read as a bug.
	if (allowed > EVENT_MEDIA_LIMIT) {
		return `This event already has ${allowed} photos and videos. You can keep or remove them, but not add more.`
	}
	return EVENT_MEDIA_LIMIT_MESSAGE
}

/**
 * SendGrid unsubscribe group for PROMOTIONAL mail — SERVER ONLY (reads env).
 *
 * `SENDGRID_UNSUBSCRIBE_GROUP_ID` (25964, "Event updates & announcements"; staging and production
 * share the SendGrid account). UNSET = the feature is off: no `asm`, no Unsubscribe link. A wrong
 * id makes SendGrid refuse the send, and a footer tag without `asm` prints literally, so the two
 * are always decided together from this one value.
 *
 * With `asm` set SendGrid also adds the `List-Unsubscribe` headers Gmail/Yahoo require, and drops
 * any later message in the group to an address that unsubscribed (a `dropped` webhook event).
 *
 * PROMOTIONAL ONLY — blasts, admin Email Attendees, guest invites. Never on transactional mail:
 * see `email-footer.ts`.
 */

export function unsubscribeGroupId(): number | null {
	const raw = String(process.env.SENDGRID_UNSUBSCRIBE_GROUP_ID ?? "").trim()
	const id = Number(raw)
	return raw && Number.isInteger(id) && id > 0 ? id : null
}

/** Spread into a promotional `sgMail.send` message. Empty when the feature is off. */
export function promoMailOptions(): { asm?: { groupId: number; groupsToDisplay: number[] } } {
	const groupId = unsubscribeGroupId()
	return groupId ? { asm: { groupId, groupsToDisplay: [groupId] } } : {}
}

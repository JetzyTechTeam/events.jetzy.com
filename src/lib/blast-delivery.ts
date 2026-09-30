/**
 * What happened to one recipient of one blast — PURE, shared by the API and the console UI.
 *
 * No mongoose, no SendGrid: the Blasts tab imports the labels, so this must stay client-safe.
 * Same split, same reason, as `ticket-quantity.ts` vs `ticket-availability.ts`.
 *
 * A blast has TWO failure moments, and conflating them is why "5/7 delivered" told a host
 * nothing useful:
 *
 *  1. **Rejected at send.** SendGrid refused it outright — malformed address, or the address is
 *     on the account's suppression list. We know immediately, and `Promise.allSettled` hands us
 *     the reason.
 *  2. **Bounced after send.** SendGrid accepted it, tried to deliver, and the receiving server
 *     refused. This arrives SECONDS TO HOURS LATER over the event webhook. Until it does, the
 *     recipient legitimately reads as "sent" — which is why the status has to be updatable
 *     after the fact rather than frozen at send time.
 */

export type BlastRecipientStatus =
	/** Accepted by SendGrid. Not proof of delivery — a bounce can still arrive later. */
	| "sent"
	/** SendGrid refused it at send time. Never left the building. */
	| "failed"
	/** Accepted, then rejected by the receiving mail server. Permanent. */
	| "bounced"
	/** Accepted, then refused by the receiving server for a reason that may not be permanent. */
	| "blocked"
	/** The recipient marked it as spam. Never mail this address again. */
	| "spam_report"

export type BlastRecipient = {
	email: string
	name?: string
	status: BlastRecipientStatus
	/** Raw reason from SendGrid, kept verbatim for support. */
	reason?: string
	/** When the bounce/block/complaint arrived. Absent while the status is still `sent`/`failed`. */
	respondedAt?: string | Date
}

export const BLAST_STATUS_LABEL: Record<BlastRecipientStatus, string> = {
	sent: "Delivered",
	failed: "Not sent",
	bounced: "Bounced",
	blocked: "Blocked",
	spam_report: "Marked as spam",
}

/** Chakra colour scheme per status, so the table and the summary can't disagree. */
export const BLAST_STATUS_COLOR: Record<BlastRecipientStatus, string> = {
	sent: "green",
	failed: "red",
	bounced: "red",
	blocked: "orange",
	spam_report: "purple",
}

/**
 * Plain-English explanation of what went wrong, for a host who has never heard of an SMTP code.
 *
 * SendGrid's `reason` is a raw server response — `"550 5.1.1 The email account that you tried to
 * reach does not exist"` — which tells a host nothing actionable. This maps the common ones to a
 * sentence that says what it means AND what to do about it. The raw string is still stored and
 * still shown underneath, because support needs the real text.
 */
export const describeDeliveryFailure = (status: BlastRecipientStatus, reason?: string): string => {
	const raw = (reason || "").toLowerCase()

	if (status === "spam_report") {
		// Deliberately does NOT claim we removed them from future sends — no opt-out list is
		// built yet, and telling a host something was handled when it wasn't is worse than
		// telling them nothing. What IS true is the consequence, so the sentence states that.
		return "This person marked your email as spam. Further emails to them will usually be blocked automatically, and repeated complaints can push this event's emails into everyone's spam folder."
	}

	// Order matters: check the specific phrases before the generic ones.
	if (raw.includes("does not exist") || raw.includes("no such user") || raw.includes("user unknown") || raw.includes("recipient not found") || raw.includes("invalid")) {
		return "That mailbox doesn't exist. The address is probably mistyped, or the account has been closed."
	}
	if (raw.includes("mailbox full") || raw.includes("quota") || raw.includes("over quota")) {
		return "Their mailbox is full, so it couldn't be delivered. This one may work again later."
	}
	if (raw.includes("spam") || raw.includes("blacklist") || raw.includes("blocklist") || raw.includes("reputation")) {
		return "Their mail provider rejected it as suspected spam. Shorter messages with fewer links usually get through."
	}
	if (raw.includes("unsubscrib") || raw.includes("suppress")) {
		return "This address previously unsubscribed or bounced, so it is on the do-not-send list and was skipped."
	}
	if (raw.includes("blocked") || raw.includes("denied") || raw.includes("refused") || raw.includes("policy")) {
		return "Their mail server refused the message. This is usually a company firewall or a strict filtering policy on their side."
	}
	if (raw.includes("timed out") || raw.includes("timeout") || raw.includes("try again") || raw.includes("temporar")) {
		return "Their mail server didn't respond in time. This is usually temporary."
	}

	if (status === "bounced") return "The receiving mail server rejected it and gave no clear reason."
	if (status === "blocked") return "Their mail provider blocked it before it reached the inbox."
	if (status === "failed") return "It couldn't be sent. The address may be malformed."
	return ""
}

/** True when the address should not be mailed again without the person opting back in. */
export const isPermanentFailure = (status: BlastRecipientStatus): boolean =>
	status === "bounced" || status === "spam_report"

/** Counts for the summary line, computed from the rows so the two can never disagree. */
export const summariseRecipients = (recipients: BlastRecipient[]) => {
	const total = recipients.length
	const delivered = recipients.filter((r) => r.status === "sent").length
	const problems = total - delivered
	return { total, delivered, problems }
}

import { isTypedEmail } from "@/lib/email-list"

/**
 * A custom From typed on the admin Email Attendees page — pure / client-safe, shared by the field
 * and the routes so the two can't disagree.
 *
 * SendGrid sends ONLY from an address verified in the account (a Single Sender, or any address on
 * an authenticated domain); anything else is refused with a 403 for EVERY recipient. Nothing here
 * can check that — our API key may only send mail — so the route stops on the first refusal and
 * says why (`isUnverifiedSenderError`), and the page asks for a test send first.
 */

export const FROM_NAME_MAX = 80

/** Blank = "Jetzy". Control characters and the address-syntax characters `<>"` are refused, not repaired. */
export function normalizeFromName(raw: unknown): { name: string } | { error: string } {
	const name = String(raw ?? "").replace(/\s+/g, " ").trim()
	if (!name) return { name: "" }
	// eslint-disable-next-line no-control-regex
	if (/[\u0000-\u001f\u007f<>"]/.test(name)) return { error: 'The From name can\'t contain < > or ".' }
	if (name.length > FROM_NAME_MAX) return { error: `Keep the From name under ${FROM_NAME_MAX} characters.` }
	return { name }
}

/** Blank = the usual sender (`SENDGRID_EMAIL_SENDER`). One address, nothing else. */
export function normalizeFromEmail(raw: unknown): { email: string } | { error: string } {
	const value = String(raw ?? "").trim()
	if (!value) return { email: "" }
	if (/[\s,;<>]/.test(value) || !isTypedEmail(value)) return { error: "The From email isn't a valid email address." }
	return { email: value.toLowerCase() }
}

/** SendGrid's refusal of a From address that isn't a verified sender. */
export function isUnverifiedSenderError(err: any): boolean {
	const code = err?.code ?? err?.response?.statusCode
	const text = JSON.stringify(err?.response?.body?.errors ?? err?.message ?? "")
	return code === 403 || /verified sender|sender identity|from address does not match/i.test(text)
}

export const unverifiedSenderMessage = (email: string) =>
	`SendGrid refused to send from ${email || "that address"}: it isn't a verified sender in our SendGrid account. Use a verified address (SendGrid → Settings → Sender Authentication), or leave From email blank.`

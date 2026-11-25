import { EMAIL_FOOTER_CONTACT } from "@/lib/support"

/**
 * THE email footer — every email Jetzy sends ends with it. Pure / client-safe: the blast preview
 * renders it too.
 *
 *   Jetzy | Connecting people through experiences.
 *   Questions? Contact us at tech@jetzyapp.com
 *   205 E 42nd Street, 16th Floor, New York, NY 10017, United States
 *   Unsubscribe                         ← PROMOTIONAL emails only
 *
 * The Unsubscribe link is SendGrid's group-unsubscribe substitution tag, and it only works when
 * the message also carries `asm` (see `email-unsubscribe.ts`). It goes ONLY on promotional mail —
 * blasts, admin Email Attendees, guest invites. A group unsubscribe makes SendGrid silently drop
 * every later message carrying that group; on a ticket confirmation, login code or password reset
 * that would cut someone off from their own tickets and account.
 *
 * Never hand-write a footer in a template again: `send-grid.ts` adds this one in `sendMail`.
 */

export const JETZY_TAGLINE = "Jetzy | Connecting people through experiences."
export const JETZY_POSTAL_ADDRESS = "205 E 42nd Street, 16th Floor, New York, NY 10017, United States"

/** SendGrid replaces this with the recipient's own unsubscribe url for the message's `asm` group. */
export const UNSUBSCRIBE_URL_TAG = "<%asm_group_unsubscribe_raw_url%>"

/** Marks the footer so it is added once, however many times a message passes through a helper. */
export const EMAIL_FOOTER_MARKER = "<!-- jetzy-email-footer -->"

const LINK_STYLE = "color:#555555; text-decoration:underline;"

/** The default contact line — `tech@jetzyapp.com`. */
export const emailFooterContactLine = () =>
	`Questions? Contact us at <a href="mailto:${EMAIL_FOOTER_CONTACT}" style="${LINK_STYLE}">${EMAIL_FOOTER_CONTACT}</a>`

export function emailFooterHtml({
	unsubscribe = false,
	contactHtml,
}: {
	/** Promotional mail only, and only when the send carries `asm`. */
	unsubscribe?: boolean
	/** Replaces the contact line — a host's blast says replying reaches the host. */
	contactHtml?: string
} = {}): string {
	const contact = contactHtml?.trim() ? contactHtml : emailFooterContactLine()
	return `${EMAIL_FOOTER_MARKER}
<div style="max-width:600px; margin:24px auto 0; padding:19px 20px; border-top:1px solid #eeeeee; text-align:center; font-family:Arial,Helvetica,sans-serif;">
  <p style="font-size:13px; line-height:20px; color:#555555; margin:0 0 8px;">${JETZY_TAGLINE}</p>
  <p style="font-size:11px; line-height:18px; color:#777777; margin:0 0 9px;">${contact}</p>
  <p style="font-size:11px; line-height:18px; color:#777777; margin:0${unsubscribe ? " 0 9px" : ""};">${JETZY_POSTAL_ADDRESS}</p>${
		unsubscribe
			? `
  <p style="font-size:11px; line-height:18px; color:#777777; margin:0;"><a href="${UNSUBSCRIBE_URL_TAG}" target="_blank" style="${LINK_STYLE}">Unsubscribe</a></p>`
			: ""
	}
</div>`
}

export function emailFooterText({ unsubscribe = false }: { unsubscribe?: boolean } = {}): string {
	return [
		"--",
		JETZY_TAGLINE,
		`Questions? Contact us at ${EMAIL_FOOTER_CONTACT}`,
		JETZY_POSTAL_ADDRESS,
		...(unsubscribe ? [`Unsubscribe: ${UNSUBSCRIBE_URL_TAG}`] : []),
	].join("\n")
}

/** Footer inserted before `</body>`, or appended to a fragment. Idempotent. */
export function withFooterHtml(html: string, opts: Parameters<typeof emailFooterHtml>[0] = {}): string {
	if (!html || html.includes(EMAIL_FOOTER_MARKER)) return html
	const footer = emailFooterHtml(opts)
	const at = html.lastIndexOf("</body>")
	return at === -1 ? `${html}\n${footer}` : `${html.slice(0, at)}${footer}\n${html.slice(at)}`
}

/** Footer appended to a plain-text body. Idempotent. */
export function withFooterText(text: string, opts: { unsubscribe?: boolean } = {}): string {
	if (!text || text.includes(JETZY_POSTAL_ADDRESS)) return text
	return `${text.replace(/\s+$/, "")}\n\n${emailFooterText(opts)}`
}

/** For previews: the unsubscribe tag shown as an inert link. */
export const previewUnsubscribeLinks = (html: string) => html.split(UNSUBSCRIBE_URL_TAG).join("#")

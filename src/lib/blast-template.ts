/**
 * The blast email body — the ONE definition of it.
 *
 * This template used to live as two inline literals inside `api/send-blast.ts`, which meant the
 * only way to see a blast was to receive one: the host typed into a textarea and the first render
 * happened in a guest's inbox. A preview that rebuilt the markup would drift from what is actually
 * sent, so the template moved here and both the API and `BlastPreviewModal` call this.
 *
 * PURE AND CLIENT-SAFE. No mongoose, no sendgrid, no `process.env` reads that only exist on the
 * server — the preview imports it into the browser bundle. Values the server knows (the base url,
 * the sender address inside `footerContact`) are passed IN rather than read here, which is also
 * what lets the preview show the real footer for the real host.
 *
 * The `{{userName}}` / `{{userEmail}}` / `{{bookingRef}}` tokens survive `buildBlastHtml` and are
 * substituted per recipient by `personalizeBlastHtml`.
 *
 * The message goes through `emailBodyHtml` (`src/lib/email-body.ts`) — bare urls become links,
 * scheme-less hrefs get https, pasted `data:` pictures are dropped, spacing matches the editor.
 * Never interpolate the editor's HTML raw again: that is how typed urls arrived unclickable.
 */

import { emailBodyHtml } from "@/lib/email-body"
import { emailFooterHtml } from "@/lib/email-footer"

export type BlastEmailType = "custom" | "availability"

/** An image carried with the blast, already uploaded and assigned its `cid:` handle. */
export interface BlastInlineImage {
	/** Matches the SendGrid attachment's `content_id`, referenced as `cid:<contentId>`. */
	contentId: string
	filename: string
}

/** A file the email LINKS to rather than carries. Already on S3 with a public, unsigned url. */
export interface BlastFileLink {
	url: string
	filename: string
	/** Shown beside the name so the reader knows what they are about to open. */
	size: number
}

export interface BuildBlastHtmlArgs {
	subject: string
	message: string
	eventName: string
	/**
	 * Where "View Event Details" points. Resolved server-side from the event's slug. EMPTY = no
	 * button: an admin Email Attendees send with no event linked is a plain custom email. Event
	 * blasts always pass one.
	 */
	eventLink?: string
	/**
	 * Replaces the footer's contact line — a host-owned event's blast says replying reaches the
	 * host. Absent = the default "Questions? Contact us at tech@jetzyapp.com".
	 */
	footerContact?: string
	/**
	 * Adds the Unsubscribe link (SendGrid's group tag) to the footer. ONLY when the send carries
	 * `asm` — see `email-unsubscribe.ts`; without it the tag would print literally.
	 */
	unsubscribe?: boolean
	emailType?: BlastEmailType
	/** Base url for the cancel-booking link in the `availability` template. */
	baseUrl?: string
	/** Rendered under the message, above the CTA. Empty/absent renders nothing. */
	images?: BlastInlineImage[]
	/** Rendered as a list of anchors under the images. Empty/absent renders nothing. */
	links?: BlastFileLink[]
	/**
	 * Whether the email opens with `Hi {{userName}},`.
	 *
	 * DEFAULTS TO TRUE — what every blast sent before this option existed did. A host whose own
	 * message already opens with a greeting turns it off, rather than the guest reading "Hi
	 * Sarah," immediately followed by "Hi everyone!".
	 */
	greetByName?: boolean
}

/**
 * The attached images, shown in the body.
 *
 * They are referenced by `cid:` rather than by their CDN url on purpose: a remote `<img src>` is
 * blocked by Gmail until the reader clicks "Display images below", and the whole reason a host
 * attaches a map is that the guest must see it without taking an extra step. The same bytes also
 * ride as a real attachment, so the image is downloadable too.
 */
function imagesBlock(images?: BlastInlineImage[]): string {
	if (!images || images.length === 0) return ""
	return images
		.map(
			(img) => `
        <div style="text-align: center; margin: 25px 0;">
          <img src="cid:${img.contentId}" alt="${escapeAttribute(img.filename)}" style="max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #eee;" />
        </div>`,
		)
		.join("")
}

/**
 * The files the email links to.
 *
 * An anchor, deliberately, not an `<img>`: a remote image is blocked by Gmail until the reader
 * clicks "Display images below", whereas a link is never blocked. Nothing of the file travels
 * with the message, so this costs the send nothing however large the file is.
 */
function linksBlock(links?: BlastFileLink[]): string {
	if (!links || links.length === 0) return ""
	const rows = links
		.map(
			(file) => `
          <div style="margin-bottom: 8px;">
            <a href="${escapeAttribute(file.url)}" style="color: #F79432; text-decoration: none; font-size: 15px;">
              &#128206; ${escapeAttribute(file.filename)}
            </a>
            <span style="color: #999; font-size: 13px;">${file.size > 0 ? ` &middot; ${formatSize(file.size)}` : ""}</span>
          </div>`,
		)
		.join("")
	return `
        <div style="margin: 25px 0; padding: 16px; border: 1px solid #eee; border-radius: 8px;">
          <p style="font-size: 14px; color: #777; margin: 0 0 10px 0; font-weight: bold;">
            ${links.length === 1 ? "Download" : "Downloads"}
          </p>
          ${rows}
        </div>`
}

/** Local to the template so it stays pure — `blast-attachments.ts` has its own for the UI. */
function formatSize(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return ""
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * For the `alt` attribute only.
 *
 * `subject` and `message` are deliberately NOT escaped — they are interpolated raw, exactly as
 * they were before this file existed, because hosts rely on being able to type a little markup.
 * That pre-existing behaviour is precisely why `BlastPreviewModal` renders into a SANDBOXED
 * iframe instead of `dangerouslySetInnerHTML`. A filename is not host-authored prose, though, and
 * a quote in one would break out of the attribute.
 */
function escapeAttribute(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export function buildBlastHtml({
	subject,
	message,
	eventName,
	eventLink,
	footerContact,
	emailType = "custom",
	baseUrl = "",
	images,
	links,
	greetByName = true,
	unsubscribe = false,
}: BuildBlastHtmlArgs): string {
	// THE footer (`email-footer.ts`) — the same one every Jetzy email ends with.
	const footer = emailFooterHtml({ unsubscribe, contactHtml: footerContact })
	// Shapes the editor's HTML for an inbox. The stored message stays exactly as typed.
	const body = emailBodyHtml(message)
	// No link → no button (a plain custom email from the admin Email Attendees page).
	const cta = eventLink
		? `
        <div style="text-align: center; margin: 35px 0;">
          <a href="${eventLink}" style="background-color: #F79432; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            View Event Details
          </a>
        </div>`
		: ""
	const pictures = imagesBlock(images)
	const files = linksBlock(links)
	// Omitted entirely when off: an empty <p> would still leave a gap above the message.
	const greeting = greetByName
		? `<p style="font-size: 16px; color: #555; line-height: 1.6;">
          Hi {{userName}},
        </p>`
		: ""

	// Jetzy brand theme — matches the welcome/invitation emails: favicon logo, orange #F79432 CTA,
	// white 600px card. Moved here verbatim; do not restyle one template without the other.
	return emailType === "availability"
		? `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body>
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="https://events.jetzy.com/favicon.ico" width="50" height="50" alt="Jetzy Logo" />
        </div>
        <h1 style="color: #333; text-align: center;">${subject}</h1>
        <p style="font-size: 16px; color: #555; line-height: 1.6;">
          You are registered for <strong>${eventName}</strong> with email
        </p>
        <p style="font-size: 18px; color: #333; line-height: 1.6; font-weight: bold;">
          {{userEmail}}
        </p>
        <p style="font-size: 16px; color: #555; line-height: 1.6;">
          This event is now full.<br/>
          If you can not attend, kindly cancel to make room for people on waitlist.
        </p>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${baseUrl}/cancel-booking?bookingRef={{bookingRef}}" style="display: inline-block; padding: 14px 30px; background-color: #dc3545; color: #fff; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
            Cancel My Booking
          </a>
        </div>
        <div style="font-size: 16px; color: #555; line-height: 1.6;">
          ${body}
        </div>${pictures}${files}${cta}
        ${footer}
      </div>
    </body>
    </html>
  `
		: `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body>
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="https://events.jetzy.com/favicon.ico" width="50" height="50" alt="Jetzy Logo" />
        </div>
        <h1 style="color: #333; text-align: center;">${subject}</h1>
        ${greeting}
        <div style="font-size: 16px; color: #555; line-height: 1.6;">
          ${body}
        </div>${pictures}${files}${cta}
        ${footer}
      </div>
    </body>
    </html>
  `
}

/**
 * Per-recipient substitution. Moved verbatim from the send loop, including the regex that strips
 * the Cancel Booking block — that button only works for a target that HAS a `bookingRef`, and
 * leaving it in for an invitation recipient produced a link to `?bookingRef=` with nothing after it.
 */
export function personalizeBlastHtml(
	html: string,
	{
		userName,
		userEmail,
		bookingRef,
	}: {
		userName: string
		userEmail: string
		/** Absent for an invitation recipient, or for a booking row that somehow carries no ref. */
		bookingRef?: string
	},
): string {
	let out = html
	out = out.replace("{{userName}}", userName)
	out = out.replace("{{userEmail}}", userEmail)

	if (bookingRef) {
		out = out.replace("{{bookingRef}}", bookingRef)
	} else {
		out = out.replace(
			/<div style="text-align: center; margin-bottom: 24px;">\s*<a href="[^"]*cancel-booking[^"]*"[\s\S]*?<\/a>\s*<\/div>/g,
			"",
		)
	}

	return out
}

/** The name shown where a blast has no personalization to draw on — the preview, and a test send. */
export function blastFallbackName(email: string): string {
	return email?.split("@")[0] || "there"
}

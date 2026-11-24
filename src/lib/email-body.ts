/**
 * Makes the rich-text editor's HTML behave in an inbox the way it looked in the editor.
 *
 * PURE AND CLIENT-SAFE. Called once, inside `buildBlastHtml`, on the message of every blast-style
 * email — event blasts, the admin Email Attendees page, their test sends and the Preview — so what
 * the preview shows is what is sent. The message is STORED as typed; this runs at render time.
 *
 * What it fixes (Quill 1.3.7 output dropped into an email untouched):
 *  - A typed or pasted url is plain text — Quill never auto-links, and only some mail clients
 *    guess. Bare `http(s)://` and `www.` urls become links (via `splitLocationLinks`, the one url
 *    splitter the email templates already share), bare email addresses become `mailto:` links.
 *  - The link button stores `www.site.com` as written; in an email that is a RELATIVE link to
 *    nowhere. A scheme-less href that looks like a domain gets `https://`.
 *  - A pasted `data:` picture is removed: Gmail strips it (a broken box) and it would ride in every
 *    single copy of a blast. The composer warns about it (`bodyHasPastedImages`).
 *  - Images get `max-width:100%` so a wide one doesn't overflow a phone.
 *  - Each line is its own `<p>`: flush in the editor, ~16px margins in a mail client, so emails read
 *    double-spaced. Block tags get inline styles matching the editor (only where the tag carries
 *    no style of its own — anything the author styled is left alone).
 *
 * Not a sanitiser. The body is written by a host or admin and the template has always
 * interpolated it raw (which is why the preview iframe is sandboxed). This only reshapes it.
 */

import { splitLocationLinks } from "@/lib/event-location"

const LINK_STYLE = "color: #F79432; text-decoration: underline;"

const BLOCK_STYLES: Record<string, string> = {
	p: "margin: 0;",
	h1: "font-size: 22px; line-height: 1.3; margin: 0 0 8px 0; color: #333;",
	h2: "font-size: 19px; line-height: 1.3; margin: 0 0 8px 0; color: #333;",
	h3: "font-size: 17px; line-height: 1.3; margin: 0 0 6px 0; color: #333;",
	blockquote: "margin: 8px 0; padding: 4px 0 4px 12px; border-left: 3px solid #dddddd; color: #666;",
	ul: "margin: 4px 0 8px 0; padding-left: 24px;",
	ol: "margin: 4px 0 8px 0; padding-left: 24px;",
	li: "margin: 0 0 4px 0;",
}

const IMG_STYLE = "max-width: 100%; height: auto;"

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g

const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, "&quot;")

const decodeEntities = (s: string) =>
	s
		.replace(/&nbsp;/g, " ")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		// Last, so `&amp;lt;` decodes to the literal text `&lt;`, not to `<`.
		.replace(/&amp;/g, "&")

/** Re-escapes text, keeping a non-breaking space visible as one (the editor writes them). */
const reEscape = (s: string) => escapeText(s).replace(/ /g, "&nbsp;")

const anchor = (href: string, label: string) =>
	`<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" style="${LINK_STYLE}">${reEscape(label)}</a>`

/** Bare email addresses in a plain-text run → mailto links. */
function linkEmails(text: string): string {
	let out = ""
	let cursor = 0
	for (const match of text.matchAll(EMAIL_PATTERN)) {
		const start = match.index ?? 0
		out += reEscape(text.slice(cursor, start)) + anchor(`mailto:${match[0]}`, match[0])
		cursor = start + match[0].length
	}
	return out + reEscape(text.slice(cursor))
}

/** One run of text between tags, outside any link. */
function linkifyText(escapedText: string): string {
	const text = decodeEntities(escapedText)
	return splitLocationLinks(text)
		.map((segment) => (segment.type === "link" ? anchor(segment.href, segment.value) : linkEmails(segment.value)))
		.join("")
}

const getAttr = (tag: string, name: string): string | null => {
	const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))
	return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null
}

const hasAttr = (tag: string, name: string) => getAttr(tag, name) !== null

/** Adds attributes just before the tag's closing `>` / `/>`. */
const addAttrs = (tag: string, attrs: string) => tag.replace(/\s*(\/?)>$/, ` ${attrs}$1>`)

const setAttr = (tag: string, name: string, value: string) =>
	hasAttr(tag, name)
		? tag.replace(new RegExp(`(\\s${name}\\s*=\\s*)("[^"]*"|'[^']*'|[^\\s>]+)`, "i"), `$1"${escapeAttr(value)}"`)
		: addAttrs(tag, `${name}="${escapeAttr(value)}"`)

const removeAttr = (tag: string, name: string) => tag.replace(new RegExp(`\\s${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, "i"), "")

/** `www.site.com` / `site.com/page` with no scheme → https. Anything else is left as written. */
export function normalizeHref(raw: string): string | null {
	const href = decodeEntities(raw).trim()
	if (!href) return null
	if (/^(javascript|data|vbscript):/i.test(href)) return null
	if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("/")) return href
	if (/^www\./i.test(href) || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}([/?#:]|$)/i.test(href)) return `https://${href}`
	return href
}

function rewriteTag(tag: string): string {
	const nameMatch = tag.match(/^<\s*(\/?)\s*([a-z0-9]+)/i)
	if (!nameMatch || nameMatch[1]) return tag // closing tag, comment, doctype
	const name = nameMatch[2].toLowerCase()

	if (name === "a") {
		let out = tag
		const href = getAttr(out, "href")
		if (href !== null) {
			const fixed = normalizeHref(href)
			out = fixed ? setAttr(out, "href", fixed) : removeAttr(out, "href")
		}
		if (!hasAttr(out, "target")) out = addAttrs(out, 'target="_blank" rel="noopener noreferrer"')
		if (!hasAttr(out, "style")) out = addAttrs(out, `style="${LINK_STYLE}"`)
		return out
	}

	if (name === "img") {
		const src = (getAttr(tag, "src") || "").trim()
		if (!src || /^data:/i.test(src)) return ""
		const style = getAttr(tag, "style")
		return style !== null ? setAttr(tag, "style", `${IMG_STYLE} ${style}`) : addAttrs(tag, `style="${IMG_STYLE}"`)
	}

	const block = BLOCK_STYLES[name]
	if (block && !hasAttr(tag, "style")) return addAttrs(tag, `style="${block}"`)
	return tag
}

export function emailBodyHtml(html: string): string {
	if (!html) return ""
	const parts = html.split(/(<[^>]*>)/)
	let linkDepth = 0
	let out = ""
	for (const part of parts) {
		if (!part) continue
		if (part.startsWith("<")) {
			if (/^<\s*a[\s>]/i.test(part)) linkDepth++
			else if (/^<\s*\/\s*a\s*>/i.test(part)) linkDepth = Math.max(0, linkDepth - 1)
			out += rewriteTag(part)
			continue
		}
		out += linkDepth > 0 ? part : linkifyText(part)
	}
	return out
}

/** The body holds a pasted (`data:`) picture, which `emailBodyHtml` removes. */
export const bodyHasPastedImages = (html: string): boolean => /<img[^>]+src\s*=\s*["']?\s*data:/i.test(html || "")

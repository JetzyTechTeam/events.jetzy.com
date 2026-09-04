import React from "react"
import DOMPurify from "dompurify"
import linkifyHtml from "linkify-html"
import Linkify from "linkify-react"
import { stripHtml } from "@/utils/text"

/**
 * Host-authored description, rendered safely with clickable links.
 *
 * Shared by the event description and the ticket description. Extracted from
 * `HostedEvents.tsx` when ticket descriptions gained the same rich-text editor — two copies of
 * "sanitize, linkify, render" is exactly the kind of thing that drifts into one surface
 * escaping HTML and the other not.
 *
 * Handles BOTH shapes, which is what makes the change need no migration: descriptions written
 * before the rich-text editor are plain text with newlines, and everything since is Quill HTML.
 * The `isHtml` sniff picks the path.
 *
 * SANITIZE BEFORE LINKIFY, always. `linkifyHtml` injects anchors into the markup, so running it
 * on unsanitized input would let a crafted description keep whatever it smuggled in.
 * `DOMPurify` needs a real DOM, hence the `window` guard — on the server the markup is reduced
 * to text instead, which is safe and only affects the pre-hydration paint.
 *
 * WHAT THE HOST TYPES IS WHAT THE GUEST SEES. Blank lines used to be deleted here — Quill writes
 * one as `<p><br></p>` and `.rich-content p` gave every paragraph a margin on top of it, so a
 * single blank line rendered as a double gap. Dropping the blank paragraphs closed that gap by
 * throwing away the host's spacing: paragraphs ran together and a link typed on its own line
 * ended up on the end of the paragraph above it. The margins are gone from `.rich-content`
 * instead (it mirrors `.ql-editor` now), so the blank paragraphs are kept and mean exactly what
 * they mean in the editor.
 */

const linkifyOptions = {
	target: "_blank",
	rel: "noopener noreferrer",
	className: "text-orange-600 underline hover:text-orange-800",
}

/**
 * Quill's own links carry no `target`, so a form link a host inserted with the toolbar used to
 * navigate the guest away from the event. `linkifyHtml` only sets those attributes on the
 * anchors IT creates, so existing ones are handled here. Runs on already-sanitized markup.
 */
const openLinksInNewTab = (html: string): string =>
	html.replace(/<a\s([^>]*)>/gi, (tag, attrs: string) => {
		const withTarget = /\btarget\s*=/i.test(attrs) ? attrs : `${attrs.trim()} target="_blank"`
		const withRel = /\brel\s*=/i.test(withTarget) ? withTarget : `${withTarget} rel="noopener noreferrer"`
		return `<a ${withRel}>`
	})

/**
 * Marks the host's blank lines so CSS can give them a line's height. `p:has(> br:only-child)`
 * covers the same case, but not in every browser this portal is opened in, and a blank line
 * that silently disappears is the bug being fixed.
 */
const markBlankParagraphs = (html: string): string =>
	html.replace(/<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '<p class="rc-blank"><br></p>')

/**
 * Server-side fallback. `stripHtml` collapses `<p>A</p><p>B</p>` to "AB" — every block boundary
 * disappears — so the pre-hydration paint showed the whole description as one run-on line. Block
 * ends become newlines first, and the wrapper renders them with `whitespace-pre-wrap`.
 */
const htmlToPlainLines = (html: string): string =>
	stripHtml(html.replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/blockquote)\s*\/?\s*>/gi, "\n"))

type Props = {
	description?: string | null
	/** Tailwind sizing/colour for the wrapper, so callers can size it in context. */
	className?: string
}

const EventDescription: React.FC<Props> = ({
	description,
	className = "text-sm sm:text-base text-[#bbbbbb]",
}) => {
	if (!description) return null

	const isHtml = /<[a-z][\s\S]*>/i.test(description)

	if (isHtml) {
		if (typeof window === "undefined") {
			return (
				<div className={`${className} break-words overflow-wrap-anywhere whitespace-pre-wrap`}>
					{htmlToPlainLines(description)}
				</div>
			)
		}
		const clean = linkifyHtml(
			openLinksInNewTab(markBlankParagraphs(DOMPurify.sanitize(description))),
			linkifyOptions,
		)
		return (
			<div
				className={`${className} break-words overflow-wrap-anywhere rich-content`}
				dangerouslySetInnerHTML={{ __html: clean }}
			/>
		)
	}

	// Plain text, written before the rich-text editor existed. Rendered with the line breaks
	// intact rather than split into paragraphs: every line used to become its own `<p>` and the
	// empty ones were dropped, which lost the host's spacing exactly as the HTML path did.
	return (
		<div className={`${className} break-words overflow-wrap-anywhere whitespace-pre-wrap leading-[1.7]`}>
			<Linkify options={linkifyOptions}>{stripHtml(description)}</Linkify>
		</div>
	)
}

export default EventDescription

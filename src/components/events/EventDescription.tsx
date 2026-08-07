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
 * `DOMPurify` needs a real DOM, hence the `window` guard — on the server the text is stripped
 * instead, which is safe and only affects the pre-hydration paint.
 */

const linkifyOptions = {
	target: "_blank",
	rel: "noopener noreferrer",
	className: "text-orange-600 underline hover:text-orange-800",
}

/**
 * Quill writes an empty line as `<p><br></p>`, which still picks up the `margin-bottom` that
 * `.rich-content p` gives every paragraph — so one blank line between paragraphs rendered as a
 * double gap. Dropping the empty paragraphs is the fix; collapsing the CSS margin instead would
 * also close up the gaps that are supposed to be there.
 */
const stripEmptyParagraphs = (html: string): string =>
	html.replace(/<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "")

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
		const clean =
			typeof window !== "undefined"
				? linkifyHtml(stripEmptyParagraphs(DOMPurify.sanitize(description)), linkifyOptions)
				: stripHtml(description)
		return (
			<div
				className={`${className} break-words overflow-wrap-anywhere rich-content`}
				dangerouslySetInnerHTML={{ __html: clean }}
			/>
		)
	}

	// Plain text. Every line used to become its own `<p className="mb-2">`, including the empty
	// ones — so a blank line between paragraphs produced two margins stacked. Blank lines are
	// dropped here and the paragraph margin alone provides the separation.
	const lines = description
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)

	return (
		<div className={`${className} break-words overflow-wrap-anywhere`}>
			{lines.map((line, i) => (
				<p key={i} className="leading-[24px] mb-2 break-words overflow-wrap-anywhere">
					<Linkify options={linkifyOptions}>{stripHtml(line)}</Linkify>
				</p>
			))}
		</div>
	)
}

export default EventDescription

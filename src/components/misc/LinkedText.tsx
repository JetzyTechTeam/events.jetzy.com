import React from "react"

import { splitLocationLinks } from "@/lib/event-location"

/**
 * A host-written address or arrival note, with only the urls inside it clickable.
 *
 * Hosts paste their own shortened map link into `location` / `entrance`; the rest of the string
 * is a sentence and must stay plain text (CEO, 2026-10-01). One component for the event page and
 * the booking confirmation page, over the same `splitLocationLinks` the confirmation email uses,
 * so no two surfaces can disagree about what is a link.
 *
 * Plain markup rather than Chakra: it renders inside the Tailwind event page as well as the
 * Chakra console.
 */
export default function LinkedText({ text, linkClassName }: { text: string; linkClassName?: string }) {
	return (
		<>
			{splitLocationLinks(text || "").map((segment, index) =>
				segment.type === "link" ? (
					<a
						key={index}
						href={segment.href}
						target="_blank"
						rel="noopener noreferrer"
						className={linkClassName ?? "text-[#F79432] hover:underline break-all"}
					>
						{segment.value}
					</a>
				) : (
					<React.Fragment key={index}>{segment.value}</React.Fragment>
				),
			)}
		</>
	)
}

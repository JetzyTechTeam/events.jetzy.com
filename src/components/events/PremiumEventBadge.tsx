import React from "react"

/**
 * The PREMIUM tag shown on an event flagged with `premiumEvent`.
 *
 * One component for all four surfaces — the public listing card, the My Events row, the event
 * detail banner and the manage-page preview — so they cannot drift into three different golds.
 * Plain markup rather than Chakra so it drops into the Tailwind pages unchanged.
 *
 * Shown to EVERYONE, unlike the PRIVATE badge beside it on the listing card, which is admin-only:
 * this one is a marketing signal, not a disclosure of who may see the event.
 */
export default function PremiumEventBadge({ className = "" }: { className?: string }) {
	return (
		<span
			className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-[#F5C518] px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-black shadow-lg ${className}`}
		>
			<span aria-hidden>★</span> Premium
		</span>
	)
}

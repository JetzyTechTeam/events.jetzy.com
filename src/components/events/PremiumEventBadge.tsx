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
export default function PremiumEventBadge({
	className = "",
	variant = "pill",
	side = "left",
}: {
	className?: string
	/**
	 * `ribbon` is the corner banner the CEO asked for (2026-09-04): a gold band running
	 * diagonally across the TOP-LEFT corner of the event's artwork, on the public listing card
	 * and the My Events row alike, desktop and mobile.
	 *
	 * `pill` is the original horizontal tag, still used where there is no artwork to sit on —
	 * the event detail banner, which shares that corner with the benefits chips.
	 */
	variant?: "pill" | "ribbon"
	/**
	 * Which corner the ribbon hangs on. The listing card uses the artwork's top-LEFT (its
	 * top-right is taken by the status badge); the My Events row hangs it on the top-RIGHT of the
	 * row card itself, which is right of the title and above Manage Event.
	 */
	side?: "left" | "right"
}) {
	if (variant === "ribbon") {
		return (
			// Two nested spans, and the geometry matters.
			//
			// The OUTER one is a square with its own `overflow-hidden`: it is what crops the band
			// into a triangle at the corner. Doing the clipping here rather than on the parent is
			// deliberate — the listing card already sets `overflow-hidden` AND a hover
			// `transform`, and a transform makes descendants resolve against the card rather than
			// the viewport. Self-contained, this drops onto any `relative` box without touching it.
			//
			// The INNER one is the band: wider than the square's diagonal so it reaches both cut
			// edges, pulled left and down so that after `-rotate-45` it crosses the corner rather
			// than clipping through it. The numbers are ~0.2 / -0.3 / 1.5 of the square's side,
			// and the `sm:` set is the same ratios at the larger size.
			<span
				aria-label="Premium event"
				className={`pointer-events-none absolute top-0 z-[3] block h-[70px] w-[70px] overflow-hidden sm:h-[92px] sm:w-[92px] ${
					side === "right" ? "right-0" : "left-0"
				} ${className}`}
			>
				<span
					className={`absolute top-[14px] w-[104px] bg-[#F5C518] py-[2px] text-center text-[9px] font-extrabold uppercase leading-tight tracking-wider text-black shadow-md sm:top-[19px] sm:w-[136px] sm:py-[3px] sm:text-[11px] ${
						// Mirrored, so the text reads left-to-right DOWNWARD on the right corner and
						// upward on the left one — a ribbon rotated the wrong way for its corner
						// reads bottom-to-top, which is what the thumbnail version looked like.
						side === "right" ? "right-[-22px] rotate-45 sm:right-[-28px]" : "left-[-22px] -rotate-45 sm:left-[-28px]"
					}`}
				>
					<span aria-hidden>★</span> Premium
				</span>
			</span>
		)
	}

	return (
		<span
			className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-[#F5C518] px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-black shadow-lg ${className}`}
		>
			<span aria-hidden>★</span> Premium
		</span>
	)
}

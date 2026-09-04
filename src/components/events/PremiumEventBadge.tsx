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
	variant?: "pill" | "ribbon" | "slant"
}) {
	if (variant === "slant") {
		return (
			// The My Events row has no corner to hang a ribbon on — the tag belongs in the actions
			// column, above Manage Event (CEO, 2026-09-04) — so the diagonal is the tag itself.
			//
			// A shallow angle on purpose. The corner ribbon's 45deg would give this band a bounding
			// box roughly four times its own height, pushing every row in the list taller for one
			// label; ~12deg reads as deliberately angled and costs a few pixels.
			<span
				className={`inline-flex -rotate-12 items-center gap-1 whitespace-nowrap rounded-md bg-[#F5C518] px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-black shadow-lg ${className}`}
			>
				<span aria-hidden>★</span> Premium
			</span>
		)
	}

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
				className={`pointer-events-none absolute left-0 top-0 z-[3] block h-[70px] w-[70px] overflow-hidden sm:h-[92px] sm:w-[92px] ${className}`}
			>
				<span className="absolute left-[-22px] top-[14px] w-[104px] -rotate-45 bg-[#F5C518] py-[2px] text-center text-[9px] font-extrabold uppercase leading-tight tracking-wider text-black shadow-md sm:left-[-28px] sm:top-[19px] sm:w-[136px] sm:py-[3px] sm:text-[11px]">
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

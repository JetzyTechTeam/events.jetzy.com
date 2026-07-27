import React from "react"
import { StarIcon } from "@heroicons/react/24/solid"

type PremiumBadgeProps = {
	size?: "xs" | "sm" | "md"
	// "pill" for listing cards / profile name row, "dot" for a small avatar-corner overlay
	variant?: "pill" | "dot"
}

const SIZE_STYLES = {
	xs: { px: "6px", py: "1px", fontSize: "9px", iconClass: "w-2.5 h-2.5" },
	sm: { px: "8px", py: "2px", fontSize: "11px", iconClass: "w-3 h-3" },
	md: { px: "10px", py: "3px", fontSize: "13px", iconClass: "w-3.5 h-3.5" },
}

// Single shared "star + Premium" visual so every surface (listings, navbar, profile) stays consistent.
const PremiumBadge: React.FC<PremiumBadgeProps> = ({ size = "sm", variant = "pill" }) => {
	const s = SIZE_STYLES[size]

	if (variant === "dot") {
		return (
			<div
				className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border border-black"
				style={{ width: "16px", height: "16px", background: "#F5C518" }}
				title="Jetzy Premium subscriber"
			>
				<StarIcon className="w-2.5 h-2.5 text-black" />
			</div>
		)
	}

	return (
		<span
			className="inline-flex items-center gap-1 font-bold uppercase tracking-wide rounded-full"
			style={{
				paddingLeft: s.px,
				paddingRight: s.px,
				paddingTop: s.py,
				paddingBottom: s.py,
				fontSize: s.fontSize,
				background: "#F5C518",
				color: "#000",
			}}
		>
			<StarIcon className={s.iconClass} />
			Premium
		</span>
	)
}

export default PremiumBadge

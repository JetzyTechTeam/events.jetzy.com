import React from "react"

/**
 * Soft ambient fill for the empty bars around a letterboxed photo or video.
 *
 * Event banners have no enforced upload aspect ratio, so every frame in the product shows the
 * whole image with `object-contain` and pads the rest. Those pads were flat black, which on a
 * portrait photo in a landscape frame is two large dead slabs. This paints the SAME image
 * behind it, cover-fit and heavily blurred, so the gaps read as an out-of-focus continuation
 * of the photo instead of empty space.
 *
 * Ported from the treatment the mobile app uses, so a host sees one design in both places:
 *   deep ambient layer (cover, scale 1.14, heavy blur)
 *   mid bridge layer   (cover, scale 1.06, lighter blur, half opacity)
 *   subtle dark tint   (black at 8%)
 *   ...and the caller's own sharp media on top.
 *
 * ## How to mount it
 *
 * Render it as the **FIRST child** of the existing frame, before the sharp media. That order is
 * the whole z-index story: it is `position: absolute` with no `z-index`, so it paints under
 * every positioned sibling that follows it and under overlays with a real `z-index` (the
 * PREMIUM ribbon is `z-[3]`). Do NOT give the sharp media a `z-index` to "fix" stacking — that
 * would lift it above the ribbon.
 *
 * The one exception is a frame whose sharp media sits in normal flow rather than being
 * absolutely positioned (the My Events thumbnail). A static element paints below every
 * positioned one, so that media needs `position: relative` — nothing more.
 *
 * The frame must have `position: relative` and `overflow: hidden`. The scaled layers
 * deliberately overflow, which is what stops a blur from fading out at the frame's own edge.
 */

type Props = {
	url: string
	type: "image" | "video"
	/**
	 * Two layers is the mobile design and is what the big surfaces use. Small thumbnails pass
	 * `1`: the bridge layer is a refinement invisible at 110px, and a listing page renders a
	 * dozen of these — every blurred layer is real paint cost on a low-end phone.
	 */
	layers?: 1 | 2
	/** Blur radius of the deep layer, in px. Scale it down on small frames. */
	deepBlur?: number
	/** Blur radius of the bridge layer, in px. Ignored when `layers` is 1. */
	midBlur?: number
}

const coverLayer: React.CSSProperties = {
	position: "absolute",
	inset: 0,
	width: "100%",
	height: "100%",
	objectFit: "cover",
}

export default function MediaBackdrop({ url, type, layers = 2, deepBlur = 26, midBlur = 10 }: Props) {
	if (!url) return null

	// A video has no still to sample, so the backdrop uses the first-frame trick the cards
	// already render their video thumbnails with. It stays still while the video plays —
	// decoding the whole file a second time, on every card, to blur it is not worth the motion.
	const src = type === "video" ? `${url}#t=0.1` : url

	const layer = (scale: number, blur: number, opacity: number, key: string) => {
		const style: React.CSSProperties = {
			...coverLayer,
			transform: `scale(${scale})`,
			filter: `blur(${blur}px)`,
			opacity,
		}
		return type === "video" ? (
			// `data-media-backdrop` is load-bearing, not decoration. The banner drives playback and
			// sound with `querySelectorAll("video")` over its own subtree, and this element is the
			// FIRST child of the frame — so without a way to exclude it, the sound button unmutes
			// this blurred copy instead of the real one and the carousel starts playing it.
			<video key={key} data-media-backdrop="" src={src} muted playsInline preload="metadata" style={style} />
		) : (
			// Same URL as the sharp copy, so this is one network fetch and one decode — the
			// browser serves the second element from cache. `alt=""` plus the `aria-hidden` on
			// the wrapper keeps it out of the accessibility tree entirely.
			<img key={key} src={src} alt="" decoding="async" style={style} />
		)
	}

	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 overflow-hidden"
			// Its own clip, inheriting the frame's corners. Safari lets a filtered child escape a
			// rounded `overflow: hidden` ancestor, which shows up as blur bleeding past the card's
			// corners; clipping again here is what prevents it.
			style={{ borderRadius: "inherit" }}
		>
			{layer(1.14, deepBlur, 1, "deep")}
			{layers > 1 && layer(1.06, midBlur, 0.5, "bridge")}
			<div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.08)" }} />
		</div>
	)
}

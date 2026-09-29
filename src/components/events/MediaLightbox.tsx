import React from "react"
import type { EventMedia } from "@/lib/event-media"

/**
 * Full-screen-capable viewer for a list of event media.
 *
 * The banner crops to a 335px band and a video there plays muted, so the only way to actually
 * look at what a host uploaded was to open the file directly. This opens the item large, with
 * prev/next across the whole banner set and a real Fullscreen API control.
 *
 * Deliberately different from the banner in two ways:
 *  - video is NOT muted here. It is only ever opened by a click, and a click is the user
 *    gesture that makes unmuted playback legal — this is where "video with music" is true
 *    without fighting the autoplay policy.
 *  - no `loop`. The banner loops because it is decoration; here the viewer chose to watch it.
 *
 * Modelled on the album lightbox in `src/pages/[slug]/album/[albumId].tsx`, which predates it
 * and has no fullscreen control of its own.
 */

type Props = {
	media: EventMedia[]
	/** Index into `media`, or null when closed. */
	index: number | null
	onClose: () => void
	onIndexChange: (index: number) => void
	/** Used for the image alt text. */
	title?: string
}

const isFullscreen = () =>
	typeof document !== "undefined" &&
	!!(document.fullscreenElement || (document as any).webkitFullscreenElement)

export default function MediaLightbox({ media, index, onClose, onIndexChange, title }: Props) {
	const stageRef = React.useRef<HTMLDivElement>(null)
	const [fullscreen, setFullscreen] = React.useState(false)
	const isOpen = index !== null && index >= 0 && index < media.length
	const current = isOpen ? media[index as number] : null
	const count = media.length

	const go = React.useCallback(
		(delta: number) => {
			if (index === null || count === 0) return
			onIndexChange((index + delta + count) % count)
		},
		[index, count, onIndexChange],
	)

	// Keep our own flag in step with the browser's, which also changes when the viewer presses
	// Escape or uses the OS chrome to leave fullscreen.
	React.useEffect(() => {
		const sync = () => setFullscreen(isFullscreen())
		document.addEventListener("fullscreenchange", sync)
		document.addEventListener("webkitfullscreenchange", sync as EventListener)
		return () => {
			document.removeEventListener("fullscreenchange", sync)
			document.removeEventListener("webkitfullscreenchange", sync as EventListener)
		}
	}, [])

	React.useEffect(() => {
		if (!isOpen) return
		const onKey = (e: KeyboardEvent) => {
			// In fullscreen, Escape belongs to the browser — it exits fullscreen. Closing the
			// viewer on the same press would dump the viewer back to the page in one keystroke.
			if (e.key === "Escape") {
				if (!isFullscreen()) onClose()
				return
			}
			if (e.key === "ArrowLeft") go(-1)
			if (e.key === "ArrowRight") go(1)
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [isOpen, onClose, go])

	// Leave fullscreen when the viewer closes, or the browser keeps the page in fullscreen with
	// the ordinary event page inside it.
	React.useEffect(() => {
		if (isOpen) return
		if (isFullscreen()) {
			const exit = document.exitFullscreen || (document as any).webkitExitFullscreen
			try {
				exit?.call(document)
			} catch {
				/* leaving fullscreen is best-effort */
			}
		}
	}, [isOpen])

	// The page behind must not scroll under the overlay.
	React.useEffect(() => {
		if (!isOpen) return
		const previous = document.body.style.overflow
		document.body.style.overflow = "hidden"
		return () => {
			document.body.style.overflow = previous
		}
	}, [isOpen])

	const toggleFullscreen = () => {
		const el = stageRef.current as any
		if (!el) return
		if (isFullscreen()) {
			const exit = document.exitFullscreen || (document as any).webkitExitFullscreen
			try {
				exit?.call(document)
			} catch {
				/* best-effort */
			}
			return
		}
		if (typeof el.requestFullscreen === "function") {
			el.requestFullscreen().catch(() => {})
			return
		}
		if (typeof el.webkitRequestFullscreen === "function") {
			el.webkitRequestFullscreen()
			return
		}
		// iPhone Safari refuses element fullscreen entirely and only ever fullscreens a <video>.
		// Without this branch the button would be dead on the device most likely to want it.
		const video = el.querySelector("video") as any
		video?.webkitEnterFullscreen?.()
	}

	// Swipe, matching the album lightbox's 50px threshold.
	const touchStartX = React.useRef<number | null>(null)
	const onTouchStart = (e: React.TouchEvent) => {
		touchStartX.current = e.changedTouches[0]?.clientX ?? null
	}
	const onTouchEnd = (e: React.TouchEvent) => {
		const start = touchStartX.current
		touchStartX.current = null
		if (start === null) return
		const dx = (e.changedTouches[0]?.clientX ?? start) - start
		if (Math.abs(dx) < 50) return
		go(dx > 0 ? -1 : 1)
	}

	if (!isOpen || !current) return null

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Event media"
			className="fixed inset-0 z-[1400] flex flex-col bg-[#0B0B0B]"
			onTouchStart={onTouchStart}
			onTouchEnd={onTouchEnd}
		>
			<div className="flex items-center justify-between px-4 py-3 shrink-0">
				<button
					type="button"
					onClick={onClose}
					aria-label="Close"
					className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
				>
					Close
				</button>
				<span className="text-sm text-gray-400">
					{(index as number) + 1} of {count}
				</span>
				<button
					type="button"
					onClick={toggleFullscreen}
					aria-label={fullscreen ? "Exit full screen" : "Full screen"}
					title={fullscreen ? "Exit full screen" : "Full screen"}
					className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
				>
					{fullscreen ? "Exit full screen" : "Full screen"}
				</button>
			</div>

			{/* The stage is what goes fullscreen, so its own background has to be opaque —
			    in fullscreen nothing behind it renders. */}
			<div ref={stageRef} className="relative flex-1 min-h-0 flex items-center justify-center bg-[#0B0B0B]">
				{current.type === "video" ? (
					<video
						// `key` forces a fresh element per item: without it, stepping from one video
						// to the next reuses the node and Safari keeps playing the previous source.
						key={current.url}
						src={current.url}
						controls
						autoPlay
						playsInline
						className="max-h-full max-w-full object-contain"
					/>
				) : (
					<img
						key={current.url}
						src={current.url}
						alt={title ? `${title} banner` : "Event media"}
						className="max-h-full max-w-full object-contain"
					/>
				)}

				{count > 1 && (
					<>
						<button
							type="button"
							onClick={() => go(-1)}
							aria-label="Previous"
							className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-white hover:bg-black/80"
						>
							&#8249;
						</button>
						<button
							type="button"
							onClick={() => go(1)}
							aria-label="Next"
							className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-white hover:bg-black/80"
						>
							&#8250;
						</button>
					</>
				)}
			</div>
		</div>
	)
}

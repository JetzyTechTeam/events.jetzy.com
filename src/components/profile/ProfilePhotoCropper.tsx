import React from "react"
import Spinner from "@Jetzy/components/misc/Spinner"

/**
 * Position a profile photo before it is uploaded: drag to move, slider or pinch to zoom.
 *
 * The result is a SQUARE JPEG drawn on a canvas, and that file is what gets uploaded — the
 * alignment is baked into the image, not stored as an offset beside it. That is the only shape
 * that works here: the photo is read by the navbar, the public profile page and the mobile app,
 * each of which renders `image` with its own cover-crop and knows nothing about an offset.
 *
 * Everywhere the photo appears it is a circle, so the circle is what the person lines up against;
 * the dimmed corners are saved too, but nothing shows them.
 */

/** Side of the crop square on screen. Fits a 320px phone inside the dialog's margins. */
const VIEW = 240
const MAX_ZOOM = 4
/** Longest side of the uploaded file. Avatars render at ~130px; this leaves room for retina. */
const MAX_OUTPUT = 1024

export type CropView = { x: number; y: number; zoom: number }

type Dims = { w: number; h: number }

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(1, zoom))

/** Scale at zoom 1: the photo's SHORT side fills the square, so no gap can ever show. */
const baseScale = (dims: Dims) => VIEW / Math.min(dims.w, dims.h)

/** Keep the photo covering the square — an offset may never drag an edge inside it. */
const clampView = (view: CropView, dims: Dims): CropView => {
	const zoom = clampZoom(view.zoom)
	const scale = baseScale(dims) * zoom
	const maxX = Math.max(0, (dims.w * scale - VIEW) / 2)
	const maxY = Math.max(0, (dims.h * scale - VIEW) / 2)
	return {
		zoom,
		x: Math.min(maxX, Math.max(-maxX, view.x)),
		y: Math.min(maxY, Math.max(-maxY, view.y)),
	}
}

type Props = {
	file: File
	/** Where the person left it last time, when re-adjusting the same photo. */
	initialView?: CropView
	onCancel: () => void
	onConfirm: (cropped: File, view: CropView) => void
	/** The browser can't decode this file (e.g. HEIC on desktop) — the caller uploads it as is. */
	onUnsupported: (file: File) => void
}

export default function ProfilePhotoCropper({ file, initialView, onCancel, onConfirm, onUnsupported }: Props) {
	const [src, setSrc] = React.useState("")
	const [dims, setDims] = React.useState<Dims | null>(null)
	const [view, setViewState] = React.useState<CropView>(initialView || { x: 0, y: 0, zoom: 1 })
	const [busy, setBusy] = React.useState(false)
	const [error, setError] = React.useState<string | null>(null)
	const imageRef = React.useRef<HTMLImageElement | null>(null)

	// Gestures read the latest view without waiting for a render — pointermove outruns React.
	const viewRef = React.useRef(view)
	const setView = (next: CropView) => {
		viewRef.current = next
		setViewState(next)
	}

	const pointers = React.useRef(new Map<number, { x: number; y: number }>())
	const gesture = React.useRef<
		| { kind: "drag"; startX: number; startY: number; from: CropView }
		| { kind: "pinch"; startDistance: number; from: CropView }
		| null
	>(null)

	// Decode the file. An object URL, not a data URL — a 12MP photo as base64 is tens of megabytes.
	React.useEffect(() => {
		const url = URL.createObjectURL(file)
		const img = new Image()
		let cancelled = false
		img.onload = () => {
			if (cancelled) return
			if (!img.naturalWidth || !img.naturalHeight) return onUnsupported(file)
			const loaded = { w: img.naturalWidth, h: img.naturalHeight }
			imageRef.current = img
			setDims(loaded)
			setView(clampView(viewRef.current, loaded))
			setSrc(url)
		}
		img.onerror = () => {
			if (!cancelled) onUnsupported(file)
		}
		img.src = url
		return () => {
			cancelled = true
			URL.revokeObjectURL(url)
		}
		// `onUnsupported` is the caller's inline handler and changes identity every render.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [file])

	const startDrag = (pointer: { x: number; y: number }) => {
		gesture.current = { kind: "drag", startX: pointer.x, startY: pointer.y, from: viewRef.current }
	}

	const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!dims || busy) return
		e.currentTarget.setPointerCapture(e.pointerId)
		pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
		const active = Array.from(pointers.current.values())
		if (active.length === 2) {
			const startDistance = Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y)
			gesture.current = { kind: "pinch", startDistance: startDistance || 1, from: viewRef.current }
		} else if (active.length === 1) {
			startDrag(active[0])
		}
	}

	const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!dims || !pointers.current.has(e.pointerId)) return
		pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
		const g = gesture.current
		if (!g) return
		const active = Array.from(pointers.current.values())
		if (g.kind === "pinch" && active.length >= 2) {
			const distance = Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y)
			const zoom = clampZoom(g.from.zoom * (distance / g.startDistance))
			// Scaling the offset with the zoom keeps the point under the centre where it was.
			const ratio = zoom / g.from.zoom
			setView(clampView({ zoom, x: g.from.x * ratio, y: g.from.y * ratio }, dims))
		} else if (g.kind === "drag") {
			setView(clampView({ zoom: g.from.zoom, x: g.from.x + (e.clientX - g.startX), y: g.from.y + (e.clientY - g.startY) }, dims))
		}
	}

	const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
		pointers.current.delete(e.pointerId)
		const active = Array.from(pointers.current.values())
		// Lifting one finger of a pinch carries on as a drag from where the other finger is.
		if (active.length === 1) startDrag(active[0])
		else if (active.length === 0) gesture.current = null
	}

	const setZoom = (zoom: number) => {
		if (!dims) return
		const current = viewRef.current
		const next = clampZoom(zoom)
		const ratio = next / current.zoom
		setView(clampView({ zoom: next, x: current.x * ratio, y: current.y * ratio }, dims))
	}

	const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (!dims) return
		const step = e.shiftKey ? 20 : 5
		const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
		const move = moves[e.key]
		if (!move) return
		e.preventDefault()
		const current = viewRef.current
		setView(clampView({ zoom: current.zoom, x: current.x + move[0], y: current.y + move[1] }, dims))
	}

	const confirm = () => {
		const img = imageRef.current
		if (!img || !dims || busy) return
		setError(null)
		setBusy(true)
		const current = clampView(viewRef.current, dims)
		const scale = baseScale(dims) * current.zoom
		// The square, in the photo's own pixels. Moving the photo right (+x) shows what is LEFT
		// of its centre, hence the subtraction.
		const size = VIEW / scale
		const left = dims.w / 2 - current.x / scale - size / 2
		const top = dims.h / 2 - current.y / scale - size / 2
		// Never upscale: a small crop is saved at the pixels it has.
		const output = Math.max(1, Math.round(Math.min(MAX_OUTPUT, size)))

		const canvas = document.createElement("canvas")
		canvas.width = output
		canvas.height = output
		const ctx = canvas.getContext("2d")
		if (!ctx) {
			setBusy(false)
			return onUnsupported(file)
		}
		// JPEG has no alpha, and a transparent PNG would otherwise come out on black.
		ctx.fillStyle = "#FFFFFF"
		ctx.fillRect(0, 0, output, output)
		ctx.imageSmoothingQuality = "high"
		ctx.drawImage(img, left, top, size, size, 0, 0, output, output)
		canvas.toBlob(
			(blob) => {
				setBusy(false)
				if (!blob) return setError("We couldn't prepare that photo. Please try another one.")
				onConfirm(new File([blob], `profile-${Date.now()}.jpg`, { type: "image/jpeg" }), current)
			},
			"image/jpeg",
			0.92,
		)
	}

	const scale = dims ? baseScale(dims) * view.zoom : 1

	return (
		<div>
			<p className="mt-5 text-sm font-semibold text-white">Position your photo</p>
			<p className="mt-1 text-sm text-gray-400">Drag to move it. Zoom with the slider or by pinching.</p>

			<div className="mt-4 flex justify-center">
				<div
					role="application"
					aria-label="Photo position. Drag, or use the arrow keys, to move the photo."
					tabIndex={0}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerEnd}
					onPointerCancel={onPointerEnd}
					onKeyDown={onKeyDown}
					// `touch-none`: without it a drag here scrolls the dialog instead of moving the photo.
					className="relative touch-none select-none overflow-hidden rounded-xl bg-[#090C10] focus:outline-none focus:ring-2 focus:ring-app"
					style={{ width: VIEW, height: VIEW, cursor: dims ? "grab" : "default" }}
				>
					{src && dims ? (
						// `max-w-none`: Tailwind's preflight caps every img at 100% of its box, which would
						// squash a zoomed photo back to the square's width.
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={src}
							alt=""
							draggable={false}
							className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
							style={{
								width: dims.w * scale,
								height: dims.h * scale,
								transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px))`,
							}}
						/>
					) : (
						<span className="absolute inset-0 flex items-center justify-center">
							<Spinner />
						</span>
					)}
					{/* The circle the photo is shown in everywhere. One element: the shadow is what dims
					    the corners, clipped by the square's own `overflow-hidden`. */}
					<span
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/80"
						style={{ boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.6)" }}
					/>
				</div>
			</div>

			<div className="mx-auto mt-4 flex items-center gap-3" style={{ maxWidth: VIEW }}>
				<span aria-hidden="true" className="text-xs text-gray-400">−</span>
				<input
					type="range"
					aria-label="Zoom"
					min={1}
					max={MAX_ZOOM}
					step={0.01}
					value={view.zoom}
					disabled={!dims || busy}
					onChange={(e) => setZoom(Number(e.target.value))}
					className="h-1.5 w-full cursor-pointer accent-[#F79432]"
				/>
				<span aria-hidden="true" className="text-base text-gray-400">+</span>
			</div>

			{error && <p className="mt-4 text-sm text-red-400">{error}</p>}

			<div className="mt-6 grid grid-cols-2 gap-3">
				<button
					type="button"
					onClick={onCancel}
					disabled={busy}
					className="rounded-xl border border-[#434343] py-3 text-base font-medium text-white hover:bg-white/5"
				>
					Cancel
				</button>
				<button
					type="button"
					onClick={confirm}
					disabled={!dims || busy}
					className="flex items-center justify-center rounded-xl bg-app py-3 text-base font-semibold text-black hover:bg-app/80 disabled:opacity-60"
				>
					{busy ? <Spinner /> : "Use photo"}
				</button>
			</div>
		</div>
	)
}

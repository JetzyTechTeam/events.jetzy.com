import React, { useEffect, useRef } from "react"
import { Box, Text } from "@chakra-ui/react"

export interface HeatPoint {
	x: number
	y: number
	viewportW?: number
	viewportH?: number
	isRageClick?: boolean
}

interface Props {
	points: HeatPoint[]
	width?: number
	height?: number
	title?: string
}

export default function ClickHeatmap({ points, width = 800, height = 500, title }: Props) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null)

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const ctx = canvas.getContext("2d")
		if (!ctx) return

		ctx.clearRect(0, 0, width, height)
		ctx.fillStyle = "#0f0f0f"
		ctx.fillRect(0, 0, width, height)

		for (const p of points) {
			const vw = p.viewportW || 1440
			const vh = p.viewportH || 900
			const px = (p.x / vw) * width
			const py = (p.y / vh) * height
			const radius = 30
			const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius)
			if (p.isRageClick) {
				gradient.addColorStop(0, "rgba(239, 68, 68, 0.75)")
				gradient.addColorStop(1, "rgba(239, 68, 68, 0)")
			} else {
				gradient.addColorStop(0, "rgba(96, 165, 250, 0.55)")
				gradient.addColorStop(1, "rgba(96, 165, 250, 0)")
			}
			ctx.fillStyle = gradient
			ctx.beginPath()
			ctx.arc(px, py, radius, 0, Math.PI * 2)
			ctx.fill()
		}
	}, [points, width, height])

	return (
		<Box>
			{title && <Text fontSize="sm" fontWeight="600" mb={2} color="white">{title}</Text>}
			<Box borderRadius="md" overflow="hidden" border="1px solid" borderColor="#2a2a2a" display="inline-block">
				<canvas ref={canvasRef} width={width} height={height} style={{ display: "block", maxWidth: "100%" }} />
			</Box>
			<Text fontSize="xs" color="#9C9C9C" mt={1}>{points.length} clicks plotted. Red blobs = rage clicks.</Text>
		</Box>
	)
}

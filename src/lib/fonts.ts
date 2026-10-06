import localFont from "next/font/local"

/**
 * Roboto, self-hosted.
 *
 * Was `next/font/google`, which downloads the font from Google at BUILD time. Some Vercel build
 * machines get font URLs back without a file extension, which Next 14's Google loader can't
 * parse ("Cannot read properties of null (reading '1')"), failing the whole build at random.
 * Shipping the files removes the network from the build. Latin subset, the three weights used.
 */
export const roboto = localFont({
	src: [
		{ path: "../assets/fonts/roboto/roboto-latin-400.woff2", weight: "400", style: "normal" },
		{ path: "../assets/fonts/roboto/roboto-latin-500.woff2", weight: "500", style: "normal" },
		{ path: "../assets/fonts/roboto/roboto-latin-700.woff2", weight: "700", style: "normal" },
	],
	display: "swap",
})

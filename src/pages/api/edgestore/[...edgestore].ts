import { initEdgeStore } from "@edgestore/server"
import { createEdgeStoreNextHandler } from "@edgestore/server/adapters/next/pages"

// Check if EdgeStore environment variables are set
const accessKey = process.env.EDGE_STORE_ACCESS_KEY
const secretKey = process.env.EDGE_STORE_SECRET_KEY

if (!accessKey || !secretKey) {
	console.warn("[EdgeStore] Warning: EDGE_STORE_ACCESS_KEY or EDGE_STORE_SECRET_KEY not found in environment variables")
	console.warn("[EdgeStore] EdgeStore may not work properly without these credentials")
} else {
	console.log("[EdgeStore] Environment variables found, initializing EdgeStore...")
}

const es = initEdgeStore.create()

/**
 * This is the main router for the edgestore buckets.
 */
const edgeStoreRouter = es.router({
	publicFiles: es.imageBucket({
		maxSize: 1024 * 1024 * 10, // 10MB
		accept: ["image/*"],
	}).beforeDelete(async ({ ctx, fileInfo }) => {
		console.log("[EdgeStore] Deleting file", fileInfo.url)
		return true // allow the delete
	}),
})

const handler = createEdgeStoreNextHandler({
	router: edgeStoreRouter,
})

export default handler

/**
 * This type is used to create the type-safe client for the frontend.
 */
export type EdgeStoreRouter = typeof edgeStoreRouter

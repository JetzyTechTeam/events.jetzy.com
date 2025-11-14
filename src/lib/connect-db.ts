import { dbconn } from "@/configs/database"

/**
 * Ensure database connection for use in getServerSideProps and API routes
 * This function should be called before any database operations
 *
 * @example
 * export const getServerSideProps = async (context) => {
 *   await connectDB()
 *   const events = await Events.find()
 *   return { props: { events } }
 * }
 */
export async function connectDB(timeoutMs: number = 10000): Promise<void> {
	// readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting

	// If already connected, return immediately
	if (dbconn.readyState === 1) {
		return
	}

	// If connecting, wait for it
	if (dbconn.readyState === 2) {
		await new Promise<void>((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				reject(new Error(`Database connection timeout after ${timeoutMs}ms`))
			}, timeoutMs)

			const onConnected = () => {
				clearTimeout(timeoutId)
				dbconn.removeListener("error", onError)
				resolve()
			}

			const onError = (err: any) => {
				clearTimeout(timeoutId)
				dbconn.removeListener("connected", onConnected)
				reject(err)
			}

			dbconn.once("connected", onConnected)
			dbconn.once("error", onError)
		})
		return
	}

	// If disconnected, wait for connection using asPromise()
	if (dbconn.readyState === 0) {
		await Promise.race([dbconn.asPromise(), new Promise((_, reject) => setTimeout(() => reject(new Error(`Database connection timeout after ${timeoutMs}ms`)), timeoutMs))])
		return
	}

	// Disconnecting state - wait a bit and retry
	if (dbconn.readyState === 3) {
		await new Promise((resolve) => setTimeout(resolve, 100))
		return connectDB(timeoutMs - 100)
	}
}

/**
 * Check if database is connected
 */
export function isConnected(): boolean {
	return dbconn.readyState === 1
}

/**
 * Get current connection state as string
 */
export function getConnectionState(): string {
	const states = ["disconnected", "connected", "connecting", "disconnecting"]
	return states[dbconn.readyState] || "unknown"
}

// Legacy export for backward compatibility
export default connectDB

import { NextApiResponse } from "next"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { dbconn } from "@/configs/database"

/**
 * Check if error is a MongoDB timeout error
 */
export function isTimeoutError(error: any): boolean {
	return (
		error.name === "MongooseError" ||
		error.name === "MongooseServerSelectionError" ||
		error.message?.includes("buffering timed out") ||
		error.message?.includes("timed out") ||
		error.message?.includes("ETIMEDOUT") ||
		error.message?.includes("ECONNREFUSED") ||
		error.message?.includes("ENOTFOUND") ||
		error.message?.includes("bufferCommands") ||
		error.message?.includes("initial connection") ||
		error.code === "ETIMEDOUT" ||
		error.code === "ECONNREFUSED"
	)
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: any): boolean {
	return (
		error.code === "ENOTFOUND" ||
		error.code === "ECONNRESET" ||
		error.code === "ECONNREFUSED" ||
		error.code === "ETIMEDOUT" ||
		error.message?.includes("network") ||
		error.message?.includes("connection")
	)
}

/**
 * Ensure database connection is ready before executing queries
 * Returns true if connection is ready, throws error if timeout
 */
export async function ensureDbConnection(timeoutMs: number = 10000): Promise<boolean> {
	// readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting

	// If already connected, return immediately
	if (dbconn.readyState === 1) {
		return true
	}

	// If connecting, wait for it
	if (dbconn.readyState === 2) {
		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				reject(new Error(`Database connection timeout after ${timeoutMs}ms. Please check your network connection and try again.`))
			}, timeoutMs)

			const onConnected = () => {
				clearTimeout(timeoutId)
				dbconn.removeListener("error", onError)
				resolve(true)
			}

			const onError = (err: any) => {
				clearTimeout(timeoutId)
				dbconn.removeListener("connected", onConnected)
				reject(err)
			}

			dbconn.once("connected", onConnected)
			dbconn.once("error", onError)
		})
	}

	// If disconnected, initiate connection using asPromise()
	if (dbconn.readyState === 0) {
		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				reject(new Error(`Database connection timeout after ${timeoutMs}ms. Please check your network connection and try again.`))
			}, timeoutMs)

			dbconn
				.asPromise()
				.then(() => {
					clearTimeout(timeoutId)
					resolve(true)
				})
				.catch((err) => {
					clearTimeout(timeoutId)
					reject(err)
				})
		})
	}

	// Disconnecting state
	throw new Error("Database is disconnecting. Please try again in a moment.")
}

/**
 * Handle database errors with proper error messages and status codes
 */
export function handleDbError(res: NextApiResponse, error: any, customMessage?: string) {
	console.error("[Database Error]:", {
		name: error.name,
		message: error.message,
		code: error.code,
		stack: error.stack?.split("\n").slice(0, 3).join("\n"),
	})

	// Timeout errors
	if (isTimeoutError(error)) {
		return sendResponse(res, null, customMessage || "Database operation timed out. Please check your internet connection and try again.", false, ResCode.REQUEST_TIMEOUT || 408)
	}

	// Network errors
	if (isNetworkError(error)) {
		return sendResponse(res, null, customMessage || "Network error occurred. Please check your internet connection and try again.", false, ResCode.SERVICE_UNAVAILABLE || 503)
	}

	// Validation errors
	if (error.name === "ValidationError") {
		return sendResponse(res, null, error.message, false, ResCode.BAD_REQUEST)
	}

	// Duplicate key errors
	if (error.code === 11000) {
		const field = Object.keys(error.keyPattern || {})[0]
		return sendResponse(res, null, `Duplicate entry for ${field}`, false, ResCode.CONFLICT || 409)
	}

	// Cast errors (invalid ObjectId, etc.)
	if (error.name === "CastError") {
		return sendResponse(res, null, `Invalid ${error.path}: ${error.value}`, false, ResCode.BAD_REQUEST)
	}

	// Default internal server error
	return sendResponse(res, null, customMessage || error.message || "Internal server error", false, ResCode.INTERNAL_SERVER_ERROR)
}

/**
 * Wrap database operations with timeout and error handling
 */
export async function withDbErrorHandling<T>(
	operation: () => Promise<T>,
	options?: {
		timeoutMs?: number
		ensureConnection?: boolean
	},
): Promise<T> {
	const { timeoutMs = 15000, ensureConnection = true } = options || {}

	try {
		// Ensure connection is ready if requested (but don't wait too long)
		if (ensureConnection) {
			try {
				await Promise.race([
					ensureDbConnection(5000), // Only wait 5s for connection check
					new Promise((resolve) => setTimeout(resolve, 5000)), // Continue after 5s anyway
				])
			} catch (connError) {
				// Log but don't fail - let the operation try anyway
				console.warn("[Database] Connection check failed, attempting operation anyway:", connError)
			}
		}

		// Create a timeout promise
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(new Error(`Operation timed out after ${timeoutMs}ms. Please check your network connection and try again.`))
			}, timeoutMs)
		})

		// Race between operation and timeout
		const result = await Promise.race([operation(), timeoutPromise])

		return result
	} catch (error) {
		// Re-throw the error to be handled by the caller
		throw error
	}
}

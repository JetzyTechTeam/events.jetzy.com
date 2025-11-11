"use server"
import { createConnection } from "mongoose"

if (!process.env.NEXT_EVENTS_DB_URL) throw new Error("Add the NEXT_EVENTS_DB_URL environment variable inside .env.local to use MongoDB")

export const dbconn = createConnection(process.env.NEXT_EVENTS_DB_URL, {
	serverSelectionTimeoutMS: 30000, // Increase to 30s for network latency
	connectTimeoutMS: 30000, // Increase connection timeout to 30s
	socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
	maxPoolSize: 10, // Maintain up to 10 socket connections
	minPoolSize: 2, // Maintain at least 2 socket connections
	heartbeatFrequencyMS: 10000, // Send heartbeat every 10s
	retryWrites: true, // Retry writes on network errors
	retryReads: true, // Retry reads on network errors
})

// Handle connection events
dbconn.on("connected", () => {
	console.log("[Database] MongoDB connected successfully")
})

dbconn.on("error", (err) => {
	console.error("[Database] MongoDB connection error:", err)
})

dbconn.on("disconnected", () => {
	console.log("[Database] MongoDB disconnected")
})

// Graceful shutdown
if (typeof process !== "undefined") {
	process.on("SIGINT", async () => {
		await dbconn.close()
		console.log("[Database] MongoDB connection closed through app termination")
		process.exit(0)
	})
}

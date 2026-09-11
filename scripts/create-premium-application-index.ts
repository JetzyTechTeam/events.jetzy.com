/**
 * Creates lookup indexes for Jetzy Premium applications.
 *
 *   npx tsx scripts/create-premium-application-index.ts
 *
 * WHY
 *
 * `premium_applications` is read as { userId } / { email } (case-insensitive) for a buyer's own
 * application, and as { status } for the admin Pending/Processed queue. The connection sets
 * `autoIndex: false`, so the indexes declared on the schema never build themselves.
 *
 * Not unique — a person can legitimately end up with more than one row over time (an earlier
 * application rejected, a new one started), and every read already sorts by createdAt desc and
 * takes the newest.
 *
 * `collection.createIndex`, never `syncIndexes()` — this database is shared with the mobile app
 * and the admin portal, and syncIndexes drops indexes they created.
 *
 * RUN ONCE PER DATABASE. Test and live are separate. Safe to re-run: creating an index that
 * already exists is a no-op.
 */
import path from "path"
import dotenv from "dotenv"

dotenv.config({ path: path.join(process.cwd(), ".env.local") })
dotenv.config({ path: path.join(process.cwd(), ".env") })

async function run() {
	const { ensureDbConnected } = await import("../src/configs/database")
	const { PremiumApplications } = await import("../src/models/premium-applications")

	if (!process.env.NEXT_EVENTS_DB_URL) {
		throw new Error("NEXT_EVENTS_DB_URL is not set — refusing to run against the localhost fallback.")
	}

	console.log("Connecting to DB...")
	await ensureDbConnected()
	const collection = PremiumApplications.collection
	console.log(`Database: ${collection.conn.name}`)

	for (const spec of [{ userId: 1 as const }, { email: 1 as const }, { status: 1 as const, createdAt: -1 as const }]) {
		console.log(`Creating ${JSON.stringify(spec)} on premium_applications...`)
		const name = await collection.createIndex(spec)
		console.log(`Created (or already present): ${name}`)
	}

	console.log("Final indexes:")
	console.log((await collection.indexes()).map((i) => i.name).join(", "))

	await collection.conn.close()
	console.log("Done.")
}

run().catch((err) => {
	console.error("Failed:", err)
	process.exit(1)
})

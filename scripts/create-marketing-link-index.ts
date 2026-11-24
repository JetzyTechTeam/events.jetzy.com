/**
 * Creates the indexes for event marketing links.
 *
 *   npx tsx scripts/create-marketing-link-index.ts
 *
 * - `event-marketing-links { eventId, tag }` UNIQUE — one tag per event. Our own collection,
 *   so a unique index is safe; deleted rows keep their tag and are revived, never duplicated.
 * - `eventinteractions { eventId, marketingLinkId, interactionType }` PARTIAL on
 *   `marketingLinkId` existing — the report groups by it, and the many rows without a link
 *   cost nothing.
 *
 * `collection.createIndex`, never `syncIndexes()` — the mobile app and the admin portal share
 * this database, and syncIndexes drops anything they created.
 *
 * RUN ONCE PER DATABASE. Test and live are separate. Safe to re-run.
 */
import path from "path"
import dotenv from "dotenv"

dotenv.config({ path: path.join(process.cwd(), ".env.local") })
dotenv.config({ path: path.join(process.cwd(), ".env") })

async function run() {
	const { ensureDbConnected } = await import("../src/configs/database")
	const { MarketingLinks } = await import("../src/models/events/marketing-links")
	const { EventInteraction } = await import("../src/models/analytics/event-interaction")

	if (!process.env.NEXT_EVENTS_DB_URL) {
		throw new Error("NEXT_EVENTS_DB_URL is not set — refusing to run against the localhost fallback.")
	}
	await ensureDbConnected()

	await MarketingLinks.collection.createIndex({ eventId: 1, tag: 1 }, { unique: true })
	console.log("event-marketing-links:", (await MarketingLinks.collection.indexes()).map((i) => i.name).join(", "))

	await EventInteraction.collection.createIndex(
		{ eventId: 1, marketingLinkId: 1, interactionType: 1 },
		{ partialFilterExpression: { marketingLinkId: { $exists: true } } },
	)
	console.log("eventinteractions:", (await EventInteraction.collection.indexes()).map((i) => i.name).join(", "))

	await MarketingLinks.collection.conn.close()
}

run().catch((err) => {
	console.error("Failed:", err)
	process.exit(1)
})

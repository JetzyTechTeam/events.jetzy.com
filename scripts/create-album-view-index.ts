/**
 * Creates the lookup indexes for album page views (the gate funnel).
 *
 *   npx tsx scripts/create-album-view-index.ts
 *
 * WHY
 *
 * `event-album-views` is written on every album page load (an upsert keyed on
 * { albumId, anonId }) and read by the Albums analytics tab as { eventId }. The connection sets
 * `autoIndex: false`, so the indexes declared on the schema never build themselves — without
 * these, a write on a page visit collection-scans.
 *
 * Deliberately NOT unique. An upsert can duplicate under a race without one, but every count
 * that has to be exact groups by `anonId` anyway — whereas a unique index that failed to build
 * would throw 11000 during a page visit, which is the one place an analytics write must never
 * be visible.
 *
 * `collection.createIndex`, never `syncIndexes()` — the mobile app and the admin portal share
 * this database, and syncIndexes drops anything they created.
 *
 * RUN ONCE PER DATABASE. Test and live are separate. Safe to re-run: creating an index that
 * already exists is a no-op.
 */
import path from "path"
import dotenv from "dotenv"

// `.env.local` first — the same precedence the app uses.
dotenv.config({ path: path.join(process.cwd(), ".env.local") })
dotenv.config({ path: path.join(process.cwd(), ".env") })

/**
 * The DB modules are imported DYNAMICALLY, after dotenv has run.
 *
 * `src/configs/database.ts` reads NEXT_EVENTS_DB_URL at module scope and falls back to
 * `mongodb://localhost:27017/missing-db-url` when it is missing. A static `import` is hoisted
 * above the dotenv calls above, so the module would read an empty env and this script would
 * happily create the index on a LOCAL database while printing "Done." — which is exactly what
 * happened the first time it was run (2026-08-27).
 */
async function run() {
	const { ensureDbConnected } = await import("../src/configs/database")
	const { AlbumView } = await import("../src/models/events/album-view")

	if (!process.env.NEXT_EVENTS_DB_URL) {
		throw new Error("NEXT_EVENTS_DB_URL is not set — refusing to run against the localhost fallback.")
	}

	console.log("Connecting to DB...")
	await ensureDbConnected()
	const collection = AlbumView.collection
	console.log(`Database: ${collection.conn.name}`)

	console.log("Creating { albumId: 1, anonId: 1 } on event-album-views...")
	console.log(`Created (or already present): ${await collection.createIndex({ albumId: 1, anonId: 1 })}`)

	console.log("Creating { eventId: 1, createdAt: -1 } on event-album-views...")
	console.log(`Created (or already present): ${await collection.createIndex({ eventId: 1, createdAt: -1 })}`)

	console.log("Final indexes:")
	console.log((await collection.indexes()).map((i) => i.name).join(", "))

	// `dbconn` is its own createConnection — closing mongoose's DEFAULT connection leaves this
	// one open and the process never exits.
	await collection.conn.close()
	console.log("Done.")
}

run().catch((err) => {
	console.error("Failed:", err)
	process.exit(1)
})

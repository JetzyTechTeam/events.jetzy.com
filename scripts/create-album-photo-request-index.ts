/**
 * Creates the lookup index for unwatermarked-photo requests.
 *
 *   npx tsx scripts/create-album-photo-request-index.ts
 *
 * WHY
 *
 * `event-album-photo-requests` is read by the host's Photo Requests tab, always as
 * { eventId } sorted by createdAt desc. The connection sets `autoIndex: false`, so the index
 * declared on the schema never builds itself — without this the tab collection-scans.
 *
 * Deliberately NOT unique: a person asking twice for the same photo is legitimate, and a
 * unique index that failed to build would surface as an 11000 in front of a visitor.
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
	const { AlbumPhotoRequest } = await import("../src/models/events/album-photo-request")

	if (!process.env.NEXT_EVENTS_DB_URL) {
		throw new Error("NEXT_EVENTS_DB_URL is not set — refusing to run against the localhost fallback.")
	}

	console.log("Connecting to DB...")
	await ensureDbConnected()
	const collection = AlbumPhotoRequest.collection
	console.log(`Database: ${collection.conn.name}`)

	console.log("Creating { eventId: 1, createdAt: -1 } on event-album-photo-requests...")
	const name = await collection.createIndex({ eventId: 1, createdAt: -1 })
	console.log(`Created (or already present): ${name}`)

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

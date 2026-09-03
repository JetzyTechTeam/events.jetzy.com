/**
 * Creates the lookup indexes for Premium page views (the /premium, /subscribe and referral-link
 * open-vs-bought funnel).
 *
 *   npx tsx scripts/create-premium-view-index.ts
 *
 * WHY
 *
 * `premium_page_views` is written on every /premium and /subscribe page load (an upsert keyed
 * on { page, code, anonId }) and read by the Growth report's Page Funnel tab as { eventId } and
 * { page }. The connection sets `autoIndex: false`, so the indexes declared on the schema never
 * build themselves — without these, a write on a page visit collection-scans.
 *
 * Deliberately NOT unique — same reasoning as event-album-views: an upsert can duplicate under a
 * race without one, but every count that has to be exact groups by `anonId` anyway, whereas a
 * unique index that failed to build would throw 11000 during a page visit, which is the one
 * place an analytics write must never be visible.
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
 * The DB modules are imported DYNAMICALLY, after dotenv has run — a static `import` is hoisted
 * above the dotenv calls and would read an empty env, creating the index on the localhost
 * fallback while printing "Done."
 */
async function run() {
	const { ensureDbConnected } = await import("../src/configs/database")
	const { PremiumPageView } = await import("../src/models/events/premium-page-view")

	if (!process.env.NEXT_EVENTS_DB_URL) {
		throw new Error("NEXT_EVENTS_DB_URL is not set — refusing to run against the localhost fallback.")
	}

	console.log("Connecting to DB...")
	await ensureDbConnected()
	const collection = PremiumPageView.collection
	console.log(`Database: ${collection.conn.name}`)

	console.log("Creating { page: 1, code: 1, anonId: 1 } on premium_page_views...")
	console.log(`Created (or already present): ${await collection.createIndex({ page: 1, code: 1, anonId: 1 })}`)

	console.log("Creating { eventId: 1, createdAt: -1 } on premium_page_views...")
	console.log(`Created (or already present): ${await collection.createIndex({ eventId: 1, createdAt: -1 })}`)

	console.log("Creating { page: 1, createdAt: -1 } on premium_page_views...")
	console.log(`Created (or already present): ${await collection.createIndex({ page: 1, createdAt: -1 })}`)

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

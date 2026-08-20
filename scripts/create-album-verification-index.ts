/**
 * Creates the lookup index for album email-verification codes.
 *
 *   npx tsx scripts/create-album-verification-index.ts
 *
 * WHY
 *
 * `event-album-verifications` is read on every code send and every code check, both keyed on
 * { eventId, email }. The connection sets `autoIndex: false`, so the index declared on the
 * schema never builds itself — without this the lookups collection-scan.
 *
 * The index is deliberately NOT unique: a duplicate row is harmless (both the issue and the
 * consume path read the newest row by `createdAt`), whereas a unique index that failed to
 * build would leave upserts throwing 11000 and lock people out of albums.
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

import { ensureDbConnected } from "../src/configs/database"
import { AlbumVerification } from "../src/models/events/album-verification"
import mongoose from "mongoose"

async function run() {
	console.log("Connecting to DB...")
	await ensureDbConnected()
	const collection = AlbumVerification.collection

	console.log("Creating { eventId: 1, email: 1 } on event-album-verifications...")
	const name = await collection.createIndex({ eventId: 1, email: 1 })
	console.log(`Created (or already present): ${name}`)

	console.log("Final indexes:")
	console.log((await collection.indexes()).map((i) => i.name).join(", "))

	await mongoose.connection.close()
	console.log("Done.")
}

run().catch((err) => {
	console.error("Failed:", err)
	process.exit(1)
})

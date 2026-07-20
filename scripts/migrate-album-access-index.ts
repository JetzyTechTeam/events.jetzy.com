/**
 * One-off migration for the album guest-access change.
 *
 * Album viewing no longer requires a login — people identify with just a name + email,
 * so `userId` on event-album-access became optional and `viewerEmail` is now the dedupe key.
 * The old { albumId, userId } unique index has to go: with an optional userId, several
 * null values would collide and block legitimate guest rows.
 *
 * Also backfills viewerEmail on any pre-existing rows (resolved from the users collection)
 * so the new unique index can build.
 *
 * Run once, before/with the deploy:  npx tsx scripts/migrate-album-access-index.ts
 */
import { ensureDbConnected } from "../src/configs/database"
import { AlbumAccess } from "../src/models/events/album-access"
import mongoose from "mongoose"

const OLD_INDEX = "albumId_1_userId_1"

async function migrate() {
	console.log("Connecting to DB...")
	await ensureDbConnected()
	const collection = AlbumAccess.collection

	// 1. Backfill viewerEmail on legacy rows so the new unique index can build.
	const legacy = await collection.find({ viewerEmail: { $exists: false } }).toArray()
	console.log(`Rows missing viewerEmail: ${legacy.length}`)

	for (const row of legacy) {
		let email: string | undefined
		if (row.userId) {
			const db = mongoose.connection.db
			const user =
				(await db?.collection("event-users").findOne({ _id: row.userId })) ||
				(await db?.collection("users").findOne({ _id: row.userId }))
			email = (user as any)?.email?.toLowerCase()
		}

		if (email) {
			await collection.updateOne({ _id: row._id }, { $set: { viewerEmail: email } })
		} else {
			// No resolvable email — the row can't satisfy the new required field; drop it.
			// These are access records only (analytics), never user-facing content.
			console.log(`  dropping unresolvable row ${row._id}`)
			await collection.deleteOne({ _id: row._id })
		}
	}

	// 2. Drop the stale unique index if it's still there.
	const indexes = await collection.indexes()
	const hasOld = indexes.some((i) => i.name === OLD_INDEX)
	if (hasOld) {
		console.log(`Dropping old index ${OLD_INDEX}...`)
		await collection.dropIndex(OLD_INDEX)
		console.log("Dropped.")
	} else {
		console.log(`Old index ${OLD_INDEX} not present — nothing to drop.`)
	}

	// 3. Ensure the new index exists.
	await AlbumAccess.syncIndexes()
	console.log("Indexes synced. Final indexes:")
	console.log((await collection.indexes()).map((i) => i.name).join(", "))

	await mongoose.connection.close()
	console.log("Done.")
}

migrate().catch((err) => {
	console.error("Migration failed:", err)
	process.exit(1)
})

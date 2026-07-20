/**
 * One-off migration: allow the same person to be tagged more than once on a photo.
 *
 * The first build of photo tagging had a UNIQUE index on
 * { albumId, mediaUrl, personEmail } so a person could only be tagged once per photo
 * (it doubled as the "don't email twice" guard). Re-tagging is now allowed and emails
 * every time, so that uniqueness has to go — Mongoose won't drop an existing index by
 * itself, hence this script.
 *
 * Run once, before/with the deploy:  npx tsx scripts/migrate-album-tags-index.ts
 */
import { ensureDbConnected } from "../src/configs/database"
import { AlbumTags } from "../src/models/events/album-tags"
import mongoose from "mongoose"

const OLD_INDEX = "albumId_1_mediaUrl_1_personEmail_1"

async function migrate() {
	console.log("Connecting to DB...")
	await ensureDbConnected()
	const collection = AlbumTags.collection

	const indexes = await collection.indexes()
	const existing = indexes.find((i) => i.name === OLD_INDEX)

	if (existing?.unique) {
		console.log(`Dropping unique index ${OLD_INDEX}...`)
		await collection.dropIndex(OLD_INDEX)
		console.log("Dropped.")
	} else if (existing) {
		console.log(`${OLD_INDEX} exists and is already non-unique — nothing to do.`)
	} else {
		console.log(`${OLD_INDEX} not present — nothing to drop.`)
	}

	// Recreate it as a plain (non-unique) lookup index.
	await AlbumTags.syncIndexes()
	console.log("Indexes synced. Final indexes:")
	console.log((await collection.indexes()).map((i) => `${i.name}${i.unique ? " (unique)" : ""}`).join(", "))

	await mongoose.connection.close()
	console.log("Done.")
}

migrate().catch((err) => {
	console.error("Migration failed:", err)
	process.exit(1)
})

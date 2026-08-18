/**
 * Make referral codes unique PER EVENT instead of across all of Jetzy.
 *
 *   npx tsx scripts/migrate-referral-code-index.ts --dry-run   # look, change nothing
 *   npx tsx scripts/migrate-referral-code-index.ts             # do it
 *
 * WHY
 *
 * `code` carried a plain `unique: true` index, so one event holding JETZY-ME blocked every other
 * event from using that string — and blocked it invisibly, because a host can only see their own
 * event's codes. A code has never meant anything without the event it discounts:
 * `validateReferralCodeForEvent` has always resolved the pair. So the uniqueness moves to the
 * pair too, and one campaign string can run across many events, each with its own terms, counter
 * and limit.
 *
 * WHAT IT DOES
 *
 *   1. Reports any (eventId, code) pair that is already duplicated. There shouldn't be one — the
 *      old index made it impossible — but the new index cannot build if there is, so this refuses
 *      rather than half-migrating.
 *   2. Creates `{ eventId: 1, code: 1 }` unique.
 *   3. Drops `code_1`.
 *
 * That order matters: build the replacement BEFORE dropping the old guarantee, so a failure
 * leaves the collection protected by one index or the other, never neither.
 *
 * RUN ONCE PER DATABASE — test and live are separate, and `autoIndex: false` on the connection
 * means nothing builds itself. Never `syncIndexes()` on this collection: the mobile app and the
 * admin portal write to it and hold indexes of their own that we must not drop.
 */
import path from "path"
import dotenv from "dotenv"

// `dotenv`, not the hand-rolled loader some older scripts in this repo share: that one splits
// on a bare newline and its regex never matches a CRLF file, so on Windows every variable reads
// as unset. `.env.local` first — the same precedence the app uses.
dotenv.config({ path: path.join(process.cwd(), ".env.local") })
dotenv.config({ path: path.join(process.cwd(), ".env") })

import { createConnection, Schema } from "mongoose"

async function main() {
	const dryRun = process.argv.includes("--dry-run")

	const dbUrl = process.env.NEXT_EVENTS_DB_URL
	if (!dbUrl) {
		console.error("NEXT_EVENTS_DB_URL is not set")
		process.exit(1)
	}

	const conn = createConnection(dbUrl)
	await conn.asPromise()
	// The database name, so nobody migrates test believing it was live.
	console.log(`connected: ${conn.name}${dryRun ? "  (DRY RUN)" : ""}\n`)

	const ReferralCodes = conn.model("ReferralCodes", new Schema({}, { strict: false }), "referralcodes")
	const collection = ReferralCodes.collection

	const before = await collection.indexes()
	console.log("indexes now:")
	before.forEach((i: any) => console.log(`  ${i.name}  ${JSON.stringify(i.key)}${i.unique ? "  UNIQUE" : ""}`))

	// 1. Anything that would stop the new index building.
	const duplicates = await collection
		.aggregate([
			{ $group: { _id: { eventId: "$eventId", code: "$code" }, count: { $sum: 1 }, ids: { $push: "$_id" } } },
			{ $match: { count: { $gt: 1 } } },
		])
		.toArray()

	if (duplicates.length > 0) {
		console.error(`\n${duplicates.length} duplicate (event, code) pair(s) — the unique index cannot build:`)
		duplicates.forEach((d: any) => console.error(`  event=${d._id.eventId} code=${d._id.code} rows=${d.ids.length}`))
		console.error("\nResolve these by hand first. Nothing has been changed.")
		await conn.close()
		process.exit(1)
	}
	console.log("\nno duplicate (event, code) pairs — safe to build")

	if (dryRun) {
		console.log("\nwould create: { eventId: 1, code: 1 } UNIQUE")
		console.log("would drop:   code_1")
		await conn.close()
		return
	}

	// 2. New guarantee first.
	await collection.createIndex({ eventId: 1, code: 1 }, { unique: true, name: "eventId_1_code_1_unique" })
	console.log("created: eventId_1_code_1_unique")

	// 3. Then release the old one. A collection is never left unprotected between the two.
	const hasOld = (await collection.indexes()).some((i: any) => i.name === "code_1")
	if (hasOld) {
		await collection.dropIndex("code_1")
		console.log("dropped: code_1")
	} else {
		console.log("code_1 already absent — nothing to drop")
	}

	const after = await collection.indexes()
	console.log("\nindexes now:")
	after.forEach((i: any) => console.log(`  ${i.name}  ${JSON.stringify(i.key)}${i.unique ? "  UNIQUE" : ""}`))

	await conn.close()
	console.log("\ndone")
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})

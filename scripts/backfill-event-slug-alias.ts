/**
 * Attach a retired slug to an event, by hand.
 *
 * From now on renames record their own history (see `nextSlugHistory` in
 * src/lib/event-slug.ts), so this is only needed for links that broke BEFORE that
 * shipped — the original case being the Jetzy Picnic, whose RSVP emails went out
 * pointing at `f3Bs01E5nk` and whose url was later changed to `ExclusiveJetzyPicnic`.
 *
 *   npx tsx scripts/backfill-event-slug-alias.ts --slug ExclusiveJetzyPicnic --alias f3Bs01E5nk --dry-run
 *   npx tsx scripts/backfill-event-slug-alias.ts --slug ExclusiveJetzyPicnic --alias f3Bs01E5nk
 *
 * `--id <objectId>` works in place of `--slug`. `--dry-run` prints what it would do and
 * writes nothing — always run that first: the checks below are the whole point, and a
 * wrong alias would hijack a link that currently works.
 *
 * Also creates the `previousSlugs` index, since the connection sets `autoIndex: false`.
 */
import path from "path"
import dotenv from "dotenv"

dotenv.config({ path: path.join(process.cwd(), ".env.local") })
dotenv.config({ path: path.join(process.cwd(), ".env") })

type Args = { id?: string; slug?: string; alias?: string; dryRun: boolean }

function parseArgs(argv: string[]): Args {
	const out: Args = { dryRun: false }
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (arg === "--dry-run") out.dryRun = true
		else if (arg === "--id") out.id = argv[++i]
		else if (arg === "--slug") out.slug = argv[++i]
		else if (arg === "--alias") out.alias = argv[++i]
	}
	return out
}

const fail = (message: string): never => {
	console.error(`\n  ABORTED: ${message}\n`)
	process.exit(1)
}

async function main() {
	const args = parseArgs(process.argv.slice(2))

	if (!args.alias) fail("--alias <old-slug> is required.")
	if (!args.slug && !args.id) fail("One of --slug <current-slug> or --id <objectId> is required.")

	// Imported after dotenv: src/configs/database reads NEXT_EVENTS_DB_URL at module load.
	const { ensureDbConnected } = await import("../src/configs/database")
	const { Events } = await import("../src/models/events")
	const { escapeForRegex, validateEventSlug } = await import("../src/lib/event-slug")

	const conn = await ensureDbConnected()
	const alias = args.alias!.trim()
	const aliasRx = new RegExp(`^${escapeForRegex(alias)}$`, "i")

	// 1. The alias has to be a slug the router could actually have served.
	const check = validateEventSlug(alias)
	if (!check.ok) fail(`"${alias}" is not a usable event url: ${check.reason}`)

	// 2. Resolve the target. Case-insensitive, matching how the page looks slugs up.
	const target = args.id
		? await Events.findOne({ _id: args.id })
		: await Events.findOne({ slug: { $regex: new RegExp(`^${escapeForRegex(args.slug!)}$`, "i") } })

	if (!target) fail(`No event found for ${args.id ? `--id ${args.id}` : `--slug ${args.slug}`}.`)

	console.log("\nTarget event")
	console.log(`  name          : ${target!.name}`)
	console.log(`  _id           : ${target!._id}`)
	console.log(`  slug          : ${target!.slug}`)
	console.log(`  previousSlugs : ${JSON.stringify(target!.previousSlugs || [])}`)
	console.log(`  isDeleted     : ${target!.isDeleted}`)
	console.log(`\nAlias to add    : ${alias}`)

	// 3. Refuse if the alias is some other event's LIVE slug. That link works today; a
	// redirect would never fire for it anyway, and claiming it here just hides the clash.
	// No isDeleted filter — a soft-deleted event still holds its slug on the unique index.
	const liveOwner = await Events.findOne({ slug: { $regex: aliasRx } }).select("_id name slug isDeleted").lean()
	if (liveOwner && String(liveOwner._id) !== String(target!._id)) {
		fail(
			`"${alias}" is the current slug of another event: "${liveOwner.name}" (${liveOwner._id}` +
				`${liveOwner.isDeleted ? ", soft-deleted" : ""}). Nothing was changed.`,
		)
	}
	if (liveOwner && String(liveOwner._id) === String(target!._id)) {
		fail(`"${alias}" is this event's current slug. There is nothing to redirect.`)
	}

	// 4. Refuse if another event already claims it as a former slug — two redirects for one
	// url is ambiguous, and findEventByPreviousSlug would pick arbitrarily.
	const aliasOwner = await Events.findOne({ previousSlugs: { $regex: aliasRx } }).select("_id name slug").lean()
	if (aliasOwner && String(aliasOwner._id) !== String(target!._id)) {
		fail(`"${alias}" is already a retired slug of "${aliasOwner.name}" (${aliasOwner._id}). Nothing was changed.`)
	}

	// 5. Already done.
	if ((target!.previousSlugs || []).some((s: string) => aliasRx.test(s))) {
		console.log(`\n  No change needed — "${alias}" is already recorded on this event.\n`)
		await conn.close()
		return
	}

	if (args.dryRun) {
		console.log(`\n  DRY RUN — all checks passed. Re-run without --dry-run to write:`)
		console.log(`    previousSlugs -> ${JSON.stringify([...(target!.previousSlugs || []), alias])}`)
		console.log(`    /${alias}  =>  307  =>  /${target!.slug}\n`)
		await conn.close()
		return
	}

	await Events.updateOne({ _id: target!._id }, { $addToSet: { previousSlugs: alias } })

	// The connection runs with autoIndex disabled, so the schema-declared index on
	// previousSlugs never builds on its own. createIndex is a no-op once it exists.
	// Deliberately NOT syncIndexes() — that drops indexes it doesn't know about, and this
	// collection is shared with the mobile app and the admin portal.
	await Events.collection.createIndex({ previousSlugs: 1 })

	const after = await Events.findOne({ _id: target!._id }).select("slug previousSlugs").lean()
	console.log(`\n  Done.`)
	console.log(`    previousSlugs : ${JSON.stringify(after?.previousSlugs || [])}`)
	console.log(`    /${alias}  =>  307  =>  /${after?.slug}\n`)

	await conn.close()
}

main().catch((err) => {
	console.error("Backfill failed:", err)
	process.exit(1)
})

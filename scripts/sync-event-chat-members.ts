/**
 * Adds everyone with a live booking on an event — plus the event's host, as chat admin — to that
 * event's JetzyChat room. See `src/lib/event-chat-members.ts`.
 *
 *   npx tsx scripts/sync-event-chat-members.ts --event <eventId | slug> [--prune] [--dry-run] [--force]
 *
 * ONCE PER EVENT (JetzyChat, 2026-11-26): a host can remove people inside the chat, and an add
 * call brings a removed person back — so a second full run would undo the host's removals. Each
 * real run is recorded in `event-chat-backfills`; a second run for the same event is refused unless
 * --force. After the first run only new bookings / cancellations are sent (automatically).
 *
 * --prune: AFTER adding, removes everyone in the chat with no live booking — not chat admins (the
 * host), not Jetzy platform admins. Lists the chat first (JetzyChat's GET), so the order is always
 * add → list → remove: nobody who booked can be removed by mistake.
 *
 * Run ONLY once the product team has confirmed for that event: members with the Jetzy app start
 * receiving chat pushes. Always --dry-run first. Safe to re-run (JetzyChat ignores people already
 * in the room). Needs NEXT_EVENTS_DB_URL, and for a real run JETZYCHAT_MEMBERS_URL +
 * JETZYCHAT_MEMBERS_SECRET for the environment the database belongs to.
 */
import "dotenv/config"
import { Types } from "mongoose"

const arg = (name: string) => {
	const i = process.argv.indexOf(`--${name}`)
	return i > -1 ? process.argv[i + 1] : undefined
}

async function main() {
	const target = (arg("event") || "").trim()
	const dryRun = process.argv.includes("--dry-run")
	const prune = process.argv.includes("--prune")
	const force = process.argv.includes("--force")
	if (!target) throw new Error("Usage: --event <eventId | slug> [--dry-run]")

	const { ensureDbConnected, dbconn } = await import("../src/configs/database")
	await ensureDbConnected()
	const runs = dbconn.collection("event-chat-backfills")
	const { Events } = await import("../src/models/events")
	const chat = await import("../src/lib/event-chat-members")

	// --prune reads the chat even on a dry run, so it needs the URL + secret either way.
	if ((!dryRun || prune) && !chat.eventChatSyncEnabled()) {
		throw new Error("JETZYCHAT_MEMBERS_URL and JETZYCHAT_MEMBERS_SECRET must be set (or pass --dry-run without --prune).")
	}

	const event: any = Types.ObjectId.isValid(target)
		? await Events.findById(target).select("_id name slug").lean()
		: await Events.findOne({ slug: { $regex: `^${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } }).select("_id name slug").lean()
	if (!event) throw new Error(`No event found for "${target}"`)

	const previous: any = await runs.findOne({ eventId: String(event._id) }, { sort: { ranAt: -1 } })
	if (previous) {
		const when = new Date(previous.ranAt).toISOString()
		console.log(`⚠ Already backfilled on ${when} (${previous.added ?? "?"} sent${previous.removed ? `, ${previous.removed} removed` : ""}).`)
		if (!dryRun && !force) {
			throw new Error("Refusing to run again: it would re-add people the host removed from the chat. Pass --force only if you are sure.")
		}
	}

	const { eventName, host, members } = await chat.collectEventChatMembers(String(event._id))
	const withId = members.filter((m) => m.jetzyUserId).length
	console.log(`Event: ${eventName} (${event._id}, slug "${event.slug}")`)
	console.log(`Host (admin): ${host ? `${host.email}${host.jetzyUserId ? ` · ${host.jetzyUserId}` : " · no Jetzy account"}` : "not resolved — no admin will be set"}`)
	console.log(`Members to send: ${members.length} (${withId} with a Jetzy user id, ${members.length - withId} by email only)`)

	if (!dryRun) {
		const result = await chat.addMembersToEventChat(String(event._id), eventName, members)
		console.log(result.ok ? `Added/confirmed ${result.sent}.` : `Sent ${result.sent}, FAILED ${result.failed}: ${result.error}`)
		// Never prune after a failed add — someone who booked may not be in the chat yet.
		if (!result.ok) {
			process.exitCode = 1
			return
		}
	}

	let removedCount = 0
	if (prune) {
		const { listed, keep, remove } = await chat.findChatMembersToRemove(String(event._id))
		console.log(`Chat now lists ${listed}: keeping ${keep}, removing ${remove.length} with no live booking.`)
		remove.forEach((m) => console.log(`  - ${m.email || `(no email) ${m.jetzyUserId}`}${m.name ? ` · ${m.name}` : ""}`))
		if (!dryRun && remove.length) {
			const r = await chat.removeListedChatMembers(String(event._id), remove)
			console.log(r.ok ? `Removed ${r.sent}.` : `Removed ${r.sent}, FAILED ${r.failed}: ${r.error}`)
			removedCount = r.sent
			if (!r.ok) process.exitCode = 1
		}
	}

	if (!dryRun) {
		await runs.insertOne({ eventId: String(event._id), slug: event.slug, ranAt: new Date(), added: members.length, removed: removedCount, prune, forced: force && !!previous })
		console.log("Recorded this run — a second run for this event now needs --force.")
	}

	if (dryRun) console.log("Dry run — nothing added or removed.")
}

main()
	.catch((err) => {
		console.error(err?.message || err)
		process.exitCode = 1
	})
	.finally(() => setTimeout(() => process.exit(), 100))

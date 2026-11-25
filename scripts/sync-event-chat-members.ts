/**
 * Adds everyone with a live booking on an event — plus the event's host, as chat admin — to that
 * event's JetzyChat room. See `src/lib/event-chat-members.ts`.
 *
 *   npx tsx scripts/sync-event-chat-members.ts --event <eventId | slug> [--dry-run]
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
	if (!target) throw new Error("Usage: --event <eventId | slug> [--dry-run]")

	const { ensureDbConnected } = await import("../src/configs/database")
	await ensureDbConnected()
	const { Events } = await import("../src/models/events")
	const chat = await import("../src/lib/event-chat-members")

	if (!dryRun && !chat.eventChatSyncEnabled()) {
		throw new Error("JETZYCHAT_MEMBERS_URL and JETZYCHAT_MEMBERS_SECRET must be set (or pass --dry-run).")
	}

	const event: any = Types.ObjectId.isValid(target)
		? await Events.findById(target).select("_id name slug").lean()
		: await Events.findOne({ slug: { $regex: `^${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } }).select("_id name slug").lean()
	if (!event) throw new Error(`No event found for "${target}"`)

	const { eventName, host, members } = await chat.collectEventChatMembers(String(event._id))
	const withId = members.filter((m) => m.jetzyUserId).length
	console.log(`Event: ${eventName} (${event._id}, slug "${event.slug}")`)
	console.log(`Host (admin): ${host ? `${host.email}${host.jetzyUserId ? ` · ${host.jetzyUserId}` : " · no Jetzy account"}` : "not resolved — no admin will be set"}`)
	console.log(`Members to send: ${members.length} (${withId} with a Jetzy user id, ${members.length - withId} by email only)`)

	if (dryRun) {
		console.log("Dry run — nothing sent.")
		return
	}
	const result = await chat.addMembersToEventChat(String(event._id), eventName, members)
	console.log(result.ok ? `Sent ${result.sent}.` : `Sent ${result.sent}, FAILED ${result.failed}: ${result.error}`)
	if (!result.ok) process.exitCode = 1
}

main()
	.catch((err) => {
		console.error(err?.message || err)
		process.exitCode = 1
	})
	.finally(() => setTimeout(() => process.exit(), 100))

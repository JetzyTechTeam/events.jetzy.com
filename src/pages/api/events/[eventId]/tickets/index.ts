import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { resolveTickets } from "@/lib/event-tickets"
import { MAX_MEMBERSHIP_FREE_MONTHS } from "@/lib/premium-bundle"
import { isBelowStripeMinimum, BELOW_MIN_PRICE_MESSAGE } from "@/lib/ticket-pricing"
import { Types } from "mongoose"
import zod from "zod"

// Identical to the ticket shape in update.ts — same rules, same messages.
const schema = zod.object({
	tickets: zod.array(
		zod.object({
			id: zod.string().nonempty(),
			title: zod.string().nonempty("Give this ticket a name."),
			// Free ($0) is fine; anything between a cent and 49c is not, because Stripe
			// refuses the charge and the host would only find out at a buyer's checkout.
			price: zod
				.number({ invalid_type_error: "Enter a price, or 0 to make this ticket free." })
				.nonnegative("Price can't be negative. Use 0 to make this ticket free.")
				.refine((p) => !isBelowStripeMinimum(p), BELOW_MIN_PRICE_MESSAGE),
			description: zod.string().optional(),
			// Never `.default(false)` — preserve-on-omit, resolved in lib/event-tickets.ts.
			requireApproval: zod.boolean().optional(),
			memberships: zod.array(zod.string()).optional(),
			membershipInterval: zod.enum(["month", "year"]).optional(),
			membershipFreeMonths: zod.number().int().min(0).max(MAX_MEMBERSHIP_FREE_MONTHS).optional(),
			/** @deprecated Superseded by `memberships`; still accepted from older clients. */
			includesPremium: zod.boolean().optional(),
		}),
	),
})

/**
 * Rewrites an event's ticket list, and nothing else. Admin OR event owner.
 *
 * Exists so tickets can be edited from the event page without going through `update.ts`, which
 * is a full-document replace — a payload missing any of its other keys deletes the timezone,
 * publishes a draft, or destroys a date poll and its votes.
 *
 * The resolution itself is `src/lib/event-tickets.ts`, shared with `update.ts`: ticket `_id`s
 * and Stripe price ids survive an edit, a new price is minted only when the price actually
 * changed, and the per-ticket flags are preserve-on-omit. Bookings reference tickets by `_id`,
 * so this is the part that must never be reimplemented.
 *
 * `isPaid` is kept in step with the list, the same derivation the manage form makes on submit.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "PATCH") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "You need to be logged in to edit tickets.", false, ResCode.UNAUTHORIZED)
		}

		const userRole = (session.user as any)?.role
		const userId = (session.user as any)?._id?.toString()
		const isAdmin = userRole === "admin" || userRole === "super admin"

		const { eventId } = req.query
		if (!eventId || typeof eventId !== "string" || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Valid event ID is required", false, ResCode.BAD_REQUEST)
		}

		const validation = schema.safeParse(req.body)
		if (!validation.success) {
			return sendResponse(res, validation.error.errors, validation.error.errors?.[0]?.message || "Invalid ticket data", false, ResCode.BAD_REQUEST)
		}

		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false })
			.select("_id ownerId tickets")
			.lean()
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}
		if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Access denied. You can only edit your own events.", false, ResCode.FORBIDDEN)
		}

		const { tickets } = validation.data

		const resolvedTickets = await resolveTickets((event as any).tickets, tickets as any)

		const updated = await Events.findByIdAndUpdate(
			eventId,
			{
				$set: { tickets: resolvedTickets, isPaid: resolvedTickets.length > 0 },
				// Same rule as `update.ts` and `details.ts`: a live save supersedes an autosaved
				// shadow draft. Manage Event seeds its form from `draftRevision` when one exists,
				// so a stale draft would show the old tickets and republish them on the next save.
				$unset: { draftRevision: "" },
			},
			{ new: true },
		)
			.select("_id tickets isPaid")
			.lean()

		return sendResponse(res, updated, "Tickets updated", true, ResCode.OK)
	} catch (error: any) {
		console.error("[events/tickets] Error:", error)
		return sendResponse(res, null, "We couldn't save those tickets. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

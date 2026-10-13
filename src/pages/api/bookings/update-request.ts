import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { BookingStatus } from "@/models/events/types"
import { sessionIsAdmin, sessionUserId } from "@/lib/booking-identity"
import { bookingTicketCount } from "@/lib/booking-approval"
import {
	REQUEST_LOCK_MESSAGE,
	freeTicketEditRefusal,
	holdPlanRefusal,
	normalizeGuestName,
	requestEditMode,
	ticketRows,
} from "@/lib/booking-request-edit"
import { Types } from "mongoose"
import zod from "zod"

/**
 * A host or admin edits a PENDING approval request — the name on it, and how many tickets it
 * is for — from the Approvals interface.
 *
 * **PENDING ONLY.** This is a request editor, not a booking editor: once a request is approved
 * the money has moved, and Jetzy issues no refunds. (`update-tickets.ts` still corrects a FREE
 * booking's headcount after the fact; a paid confirmed booking stays un-editable.)
 *
 * What a quantity edit does depends on whether money is waiting behind the request — the rule
 * is `requestEditMode` in `booking-request-edit.ts`, shared with the dialog:
 *
 *  - **free**  — `tickets` is changed, up or down. No capacity check and no tracker write: a
 *    pending request holds no seat, and `approve.ts` is where the limit bites.
 *  - **hold**  — DOWN only, and `tickets` is NOT touched. The lower number is stored as
 *    `adjustedTickets` and `approve.ts` applies it through its existing partial capture. Until
 *    then the booking keeps describing exactly what the card is held for, so nothing that reads
 *    it (reject, guest cancel, hold expiry, the guest's own bookings page) has to know an edit
 *    happened. No money field is written here — not `total`, not `subTotal`, not `payment.*`.
 *  - **locked** — refused, with the reason.
 *
 * Nothing is emailed: until approval nothing has changed for the guest.
 */

const schema = zod
	.object({
		bookingRef: zod.string().nonempty(),
		// Bounded loosely here only as a paste backstop; the real rule is `normalizeGuestName`.
		customerName: zod.string().max(1000).optional(),
		tickets: zod
			.array(
				zod.object({
					ticketId: zod.string().nonempty(),
					quantity: zod.number().int().min(0).max(1000),
				}),
			)
			.nonempty("Send at least one ticket row.")
			.optional(),
	})
	.refine((body) => body.customerName !== undefined || body.tickets !== undefined, { message: "Nothing to change." })

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed.", false, ResCode.METHOD_NOT_ALLOWED)
	}

	await ensureDbConnected()

	// Session required, with no bearer-token path — a host tool, same as `update-tickets.ts`.
	const session = await getServerSession(req, res, authOptions)
	const userId = sessionUserId(session)
	if (!userId) return sendResponse(res, null, "Not authenticated.", false, ResCode.UNAUTHORIZED)
	const isAdmin = sessionIsAdmin(session)

	const parsed = schema.safeParse(req.body)
	if (!parsed.success) {
		return sendResponse(res, null, parsed.error.errors[0]?.message || "Invalid input.", false, ResCode.BAD_REQUEST)
	}
	const { bookingRef, customerName: rawName, tickets: incoming } = parsed.data

	const booking = await Bookings.findOne({ bookingRef })
	if (!booking || (booking as any).isDeleted === true) {
		return sendResponse(res, null, "Booking not found.", false, ResCode.NOT_FOUND)
	}

	const event = await Events.findById(booking.eventId)
	if (!event) return sendResponse(res, null, "Event not found.", false, ResCode.NOT_FOUND)

	if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
		return sendResponse(res, null, "Not authorized.", false, ResCode.FORBIDDEN)
	}

	if (booking.status !== BookingStatus.PENDING) {
		return sendResponse(res, null, "This request has already been decided, so it can no longer be edited.", false, ResCode.BAD_REQUEST)
	}

	const { mode, lock } = requestEditMode(booking as any)
	// A capture is in flight. Nothing about the request may move under it — not even the name,
	// which the confirmation email about to be sent is built from.
	if (lock === "in_progress") {
		return sendResponse(res, null, REQUEST_LOCK_MESSAGE.in_progress, false, ResCode.BAD_REQUEST)
	}

	const editedBy: "host" | "admin" = isAdmin ? "admin" : "host"
	const editedAt = new Date()
	const byUserId = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined

	const set: Record<string, any> = {}
	const unset: Record<string, any> = {}
	const push: Record<string, any> = {}
	const said: string[] = []

	// ---- The name ----
	if (rawName !== undefined) {
		const normalized = normalizeGuestName(rawName)
		if (!normalized.ok) return sendResponse(res, null, normalized.message, false, ResCode.BAD_REQUEST)
		if (normalized.name !== booking.customerName) {
			set.customerName = normalized.name
			push.customerNameEditHistory = { at: editedAt, by: editedBy, byUserId, from: booking.customerName, to: normalized.name }
			said.push("Name updated.")
		}
	}

	// ---- The tickets ----
	const requested = ticketRows(booking.tickets as any)
	const requestedQty = bookingTicketCount(requested)
	let plannedQty = requestedQty

	if (incoming) {
		if (mode === "locked") {
			return sendResponse(res, { lock }, REQUEST_LOCK_MESSAGE[lock!], false, ResCode.BAD_REQUEST)
		}

		if (mode === "free") {
			const refusal = freeTicketEditRefusal(requested, incoming, event.tickets as any, {
				emptyMessage: "Keep at least one ticket, or decline the request instead.",
				staleMessage: "This request changed — refresh and try again.",
			})
			if (refusal) return sendResponse(res, null, refusal, false, ResCode.BAD_REQUEST)

			const newById = new Map(incoming.map((t) => [String(t.ticketId), t.quantity]))
			const changed = requested.some((row) => newById.get(row.ticketId) !== row.quantity)
			if (changed) {
				const before = requested.map((t) => ({ ticketId: new Types.ObjectId(t.ticketId), quantity: t.quantity }))
				// Stored row order kept; a row taken to 0 is dropped, as `update-tickets.ts` does.
				const after = requested
					.map((t) => ({ ticketId: new Types.ObjectId(t.ticketId), quantity: newById.get(t.ticketId) ?? t.quantity }))
					.filter((t) => t.quantity > 0)

				// Money fields deliberately NOT recomputed — no money moved. Same reasoning as
				// `update-tickets.ts`: on an order a referral code took to $0, recomputing would
				// rewrite the subtotal that `discountAmount` was derived against.
				set.tickets = after
				set.ticketsEditedAt = editedAt
				set.ticketsEditedBy = editedBy
				push.ticketsEditHistory = { at: editedAt, by: editedBy, byUserId, from: before, to: after }
				plannedQty = after.reduce((sum, t) => sum + t.quantity, 0)
				said.push(`Request updated to ${plannedQty} ${plannedQty === 1 ? "ticket" : "tickets"}.`)
			}
			// A free request never carries a plan; clear one that somehow does.
			if ((booking as any).adjustedTickets?.length) {
				unset.adjustedTickets = ""
				unset.adjustedTicketsAt = ""
				unset.adjustedTicketsBy = ""
			}
		} else {
			// ---- A card hold: plan a LOWER quantity, never touch what the hold was sized for. ----
			const refusal = holdPlanRefusal(requested, incoming)
			if (refusal) return sendResponse(res, null, refusal, false, ResCode.BAD_REQUEST)

			const newById = new Map(incoming.map((t) => [String(t.ticketId), t.quantity]))
			const plan = requested.map((t) => ({ ticketId: new Types.ObjectId(t.ticketId), quantity: newById.get(t.ticketId) ?? t.quantity }))
			plannedQty = plan.reduce((sum, t) => sum + t.quantity, 0)

			const currentPlan = ticketRows((booking as any).adjustedTickets)
			const currentById = new Map(currentPlan.map((t) => [t.ticketId, t.quantity]))
			const samePlan = currentPlan.length > 0 && plan.every((t) => currentById.get(String(t.ticketId)) === t.quantity)

			if (plannedQty === requestedQty) {
				// Back to what the guest asked for — the plan is removed, not stored as a no-op.
				if (currentPlan.length > 0) {
					unset.adjustedTickets = ""
					unset.adjustedTicketsAt = ""
					unset.adjustedTicketsBy = ""
					said.push(`Back to the ${requestedQty} ${requestedQty === 1 ? "ticket" : "tickets"} requested.`)
				}
			} else if (!samePlan) {
				set.adjustedTickets = plan
				set.adjustedTicketsAt = editedAt
				set.adjustedTicketsBy = editedBy
				said.push(
					`Set to ${plannedQty} of the ${requestedQty} tickets requested. The card is charged for ${plannedQty === 1 ? "that one" : `those ${plannedQty}`} only when the request is approved.`,
				)
			}
		}
	}

	const update: Record<string, any> = {}
	if (Object.keys(set).length) update.$set = set
	if (Object.keys(unset).length) update.$unset = unset
	if (Object.keys(push).length) update.$push = push

	if (!Object.keys(update).length) {
		return sendResponse(res, { bookingRef, requestedTickets: requestedQty, plannedTickets: plannedQty }, "No changes.", true, ResCode.OK)
	}

	// One atomic write, refused if the request was decided — or a capture began — after it was
	// read above. `approve.ts` latches `payment.status` to "capturing" before it touches Stripe,
	// so an edit can never land on a booking whose card is being charged. (`$ne` also matches a
	// booking with no `payment` at all, which is every free request.)
	const updated = await Bookings.findOneAndUpdate(
		{ _id: booking._id, status: BookingStatus.PENDING, "payment.status": { $ne: "capturing" } },
		update,
		{ new: true },
	).select("-payment.paymentIntentId -payment.checkoutSessionId")

	if (!updated) {
		return sendResponse(res, null, "This request is already being processed — refresh and try again.", false, ResCode.BAD_REQUEST)
	}

	return sendResponse(
		res,
		{
			bookingRef,
			customerName: updated.customerName,
			tickets: updated.tickets,
			adjustedTickets: (updated as any).adjustedTickets,
			requestedTickets: bookingTicketCount(ticketRows(updated.tickets as any)),
			plannedTickets: plannedQty,
		},
		said.join(" ") || "Request updated.",
		true,
		ResCode.OK,
	)
}

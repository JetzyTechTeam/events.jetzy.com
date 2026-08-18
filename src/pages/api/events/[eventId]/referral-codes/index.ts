import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ReferralCodes } from "@/models/events/referral-codes"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Types } from "mongoose"
import zod from "zod"

// Validation schema for creating referral code
const createReferralCodeSchema = zod.object({
	code: zod.string().min(3).max(50).regex(/^\S+$/, "Code cannot contain spaces"),
	discountPercentage: zod.number().min(0).max(100),
	// Free months of Jetzy Premium on a ticket that already sells it. Whole months only —
	// Stripe's trial is a date, and half a month has no meaning on a receipt.
	freeMembershipMonths: zod.number().int().min(0).max(12).optional(),
	maxUses: zod.number().positive().optional().nullable(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		const session = await getServerSession(req, res, authOptions)

		// Verify admin authentication
		if (!session) {
			return sendResponse(res, null, "You need to be logged in to manage referral codes.", false, ResCode.UNAUTHORIZED)
		}

		const userRole = (session.user as any)?.role
		const userId = (session.user as any)?._id?.toString()
		const isAdmin = userRole === "admin" || userRole === "super admin"

		const { eventId } = req.query

		if (!eventId || typeof eventId !== "string") {
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		}

		// Verify event exists
		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false })
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		// Allow admin or event owner only
		if (!isAdmin && event.ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Access denied. Only the event owner can manage referral codes.", false, ResCode.FORBIDDEN)
		}

		// Ensure database connection
		const { dbconn } = await import("@/configs/database")
		if (dbconn.readyState !== 1) {
			await dbconn.asPromise()
		}

		// Handle POST - Create referral code
		if (req.method === "POST") {
			const body = req.body

			// Validate request body
			const validation = createReferralCodeSchema.safeParse(body)
			if (!validation.success) {
				return sendResponse(res, validation.error.errors, "Invalid referral code data", false, ResCode.BAD_REQUEST)
			}

			const { code, discountPercentage, freeMembershipMonths, maxUses } = validation.data

			// ONE lookup, in whatever state the row is in.
			//
			// Two separate traps live here, and both produced the same useless "Referral code
			// already exists" against an empty table:
			//
			//   - `code` is unique ACROSS EVENTS, so a live code on someone else's event blocks
			//     this one while being invisible from here. The host needs to be told that, not
			//     left staring at a table with nothing in it.
			//   - rows written by the mobile app or the admin portal against this shared
			//     collection can carry no `isDeleted` field at all, so a query for
			//     `isDeleted: false` missed them and so did the revive below — the insert then
			//     hit the unique index and reported a duplicate the host could not see.
			//
			// So: fetch the row by code alone, and decide from what comes back. Anything not
			// explicitly deleted counts as live.
			const upperCode = code.toUpperCase()
			const existingCode = await ReferralCodes.findOne({ code: upperCode })

			if (existingCode && existingCode.isDeleted !== true) {
				const sameEvent = String(existingCode.eventId) === String(eventId)
				// Name the event when it is somebody else's, so "it already exists" is actionable
				// rather than a dead end.
				let ownerName = ""
				if (!sameEvent) {
					const owner = await Events.findById(existingCode.eventId).select("name").lean()
					ownerName = (owner as any)?.name || ""
				}
				console.warn("[referral-codes/index] Duplicate code rejected:", {
					code: upperCode,
					requestedFor: eventId,
					heldBy: String(existingCode.eventId),
				})
				return sendResponse(
					res,
					null,
					sameEvent
						? "That code already exists on this event."
						: ownerName
							? `That code is already in use on "${ownerName}". Referral codes are unique across Jetzy — try another.`
							: "That code is already in use on another event. Referral codes are unique across Jetzy — try another.",
					false,
					ResCode.BAD_REQUEST,
				)
			}

			// A code the host DELETED still owns the string.
			//
			// Delete is a soft delete and the unique index has no partial filter, so recreating a
			// code you just removed failed while nothing on the page showed it existing. Revive
			// the row rather than inserting beside it — the index makes that the only way to hand
			// the string back.
			//
			// `usageCount` restarts at 0: this is a new offer with its own `maxUses`, and carrying
			// the old count would exhaust it immediately. Past redemptions are unaffected — the
			// stats endpoint counts them from bookings, which store the code string.
			if (existingCode) {
				existingCode.set({
					// Reassigned, because the string is unique across events and the host asking
					// for it now is the one who gets it.
					eventId: new Types.ObjectId(eventId),
					discountPercentage,
					freeMembershipMonths: freeMembershipMonths || 0,
					maxUses: maxUses || null,
					isActive: true,
					isDeleted: false,
					usageCount: 0,
					createdBy: (session.user as any)?._id || undefined,
				})
				await existingCode.save()
				console.log("[referral-codes/index] Revived a deleted code:", { code: upperCode, eventId })
				return sendResponse(res, existingCode, "Referral code created successfully", true, ResCode.OK)
			}

			// Create referral code
			const referralCode = await ReferralCodes.create({
				eventId: new Types.ObjectId(eventId),
				code: code.toUpperCase(),
				discountPercentage,
				freeMembershipMonths: freeMembershipMonths || 0,
				maxUses: maxUses || null,
				isActive: true,
				usageCount: 0,
				createdBy: (session.user as any)?._id || undefined,
			})

			return sendResponse(res, referralCode, "Referral code created successfully", true, ResCode.OK)
		}

		// Handle GET - List referral codes for event
		if (req.method === "GET") {
			const referralCodes = await ReferralCodes.find({
				eventId: new Types.ObjectId(eventId),
				isDeleted: false,
			}).sort({ createdAt: -1 })

			return sendResponse(res, referralCodes, "Referral codes retrieved successfully", true, ResCode.OK)
		}

		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	} catch (error: any) {
		console.error("[referral-codes/index] Error:", error)
		
		// Duplicate key. Reachable only as a race now — every other path is resolved above.
		if (error.code === 11000) {
			return sendResponse(res, null, "That code is already in use across Jetzy. Try another.", false, ResCode.BAD_REQUEST)
		}

		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

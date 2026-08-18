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

			// Check if code already exists (case-insensitive check will be handled by unique index)
			const existingCode = await ReferralCodes.findOne({
				code: code.toUpperCase(),
				isDeleted: false,
			})

			if (existingCode) {
				return sendResponse(res, null, "Referral code already exists", false, ResCode.BAD_REQUEST)
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
		
		// Handle duplicate key error (code already exists)
		if (error.code === 11000) {
			return sendResponse(res, null, "Referral code already exists", false, ResCode.BAD_REQUEST)
		}

		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

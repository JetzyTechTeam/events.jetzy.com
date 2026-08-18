import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { ReferralCodes } from "@/models/events/referral-codes"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Types } from "mongoose"
import zod from "zod"

// Validation schema for updating referral code
const updateReferralCodeSchema = zod.object({
	isActive: zod.boolean().optional(),
	discountPercentage: zod.number().min(0).max(100).optional(),
	freeMembershipMonths: zod.number().int().min(0).max(12).optional(),
	commissionPercentage: zod.number().min(0).max(100).optional(),
	maxUses: zod.number().positive().optional().nullable(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	await ensureDbConnected()
	try {
		const session = await getServerSession(req, res, authOptions)

		// Verify admin authentication
		if (!session) {
			return sendResponse(res, null, "You need to be logged in to manage referral codes.", false, ResCode.UNAUTHORIZED)
		}

		const userRole = (session.user as any)?.role
		const userId = (session.user as any)?._id?.toString()
		const isAdmin = userRole === "admin" || userRole === "super admin"

		const { eventId, codeId } = req.query

		if (!eventId || typeof eventId !== "string") {
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		}

		if (!codeId || typeof codeId !== "string") {
			return sendResponse(res, null, "Referral code ID is required", false, ResCode.BAD_REQUEST)
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

		// Find referral code
		const referralCode = await ReferralCodes.findOne({
			_id: new Types.ObjectId(codeId),
			eventId: new Types.ObjectId(eventId),
			isDeleted: false,
		})

		if (!referralCode) {
			return sendResponse(res, null, "Referral code not found", false, ResCode.NOT_FOUND)
		}

		// Handle PATCH - Update referral code
		if (req.method === "PATCH") {
			const body = req.body

			// Validate request body
			const validation = updateReferralCodeSchema.safeParse(body)
			if (!validation.success) {
				return sendResponse(res, validation.error.errors, "Invalid update data", false, ResCode.BAD_REQUEST)
			}

			const updateData: any = {}
			if (validation.data.isActive !== undefined) {
				updateData.isActive = validation.data.isActive
			}
			if (validation.data.discountPercentage !== undefined) {
				updateData.discountPercentage = validation.data.discountPercentage
			}
			if (validation.data.freeMembershipMonths !== undefined) {
				updateData.freeMembershipMonths = validation.data.freeMembershipMonths
			}
			if (validation.data.maxUses !== undefined) {
				updateData.maxUses = validation.data.maxUses
			}
			if (validation.data.commissionPercentage !== undefined) {
				updateData.commissionPercentage = validation.data.commissionPercentage
			}

			// Update referral code
			const updatedCode = await ReferralCodes.findByIdAndUpdate(
				codeId,
				{ $set: updateData },
				{ new: true }
			)

			return sendResponse(res, updatedCode, "Referral code updated successfully", true, ResCode.OK)
		}

		// Handle DELETE - Soft delete referral code
		if (req.method === "DELETE") {
			await ReferralCodes.findByIdAndUpdate(codeId, { $set: { isDeleted: true, isActive: false } })

			return sendResponse(res, null, "Referral code deleted successfully", true, ResCode.OK)
		}

		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	} catch (error: any) {
		console.error("[referral-codes/[codeId]] Error:", error)
		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

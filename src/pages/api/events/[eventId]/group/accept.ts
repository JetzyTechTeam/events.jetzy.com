import { NextApiRequest, NextApiResponse } from "next"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import InterestUsermodel from "@/models/interest-user"
import InterestV2model from "@/models/interest-v2"
import { Users } from "@/models/userModal"
import { Types } from "mongoose"
import crypto from "crypto"

/**
 * Generate a secure token for group invitation (same function as in create-group.ts)
 */
function generateInviteToken(interestId: string, userId: string, email: string): string {
	const secret = process.env.JWT_SECRET || "default-secret-key"
	const data = `${interestId}:${userId}:${email}:${secret}`
	return crypto.createHash("sha256").update(data).digest("hex").substring(0, 32)
}

/**
 * API endpoint to accept group invitation
 * POST /api/events/[eventId]/group/accept
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		// Ensure database connection is ready
		const { dbconn } = await import("@/configs/database")
		if (dbconn.readyState !== 1) {
			console.log("[group-accept] Database not connected, attempting to connect...")
			await dbconn.asPromise()
		}

		const { eventId } = req.query
		const { token, email, interestId } = req.body

		if (!eventId || !token || !email || !interestId) {
			return sendResponse(res, null, "Missing required parameters", false, ResCode.BAD_REQUEST)
		}

		// Verify the token
		const interest = await InterestV2model.findById(new Types.ObjectId(interestId))
		if (!interest) {
			return sendResponse(res, null, "Interest group not found", false, ResCode.NOT_FOUND)
		}

		// Find user by email
		const user = await Users.findOne({ email: email.toLowerCase().trim() })
		if (!user) {
			return sendResponse(res, null, "User not found", false, ResCode.NOT_FOUND)
		}

		// Verify token matches
		const expectedToken = generateInviteToken(interestId, user._id.toString(), email)
		if (token !== expectedToken) {
			return sendResponse(res, null, "Invalid token", false, ResCode.FORBIDDEN)
		}

		// Find InterestUser entry
		const interestUser = await InterestUsermodel.findOne({
			interestId: new Types.ObjectId(interestId),
			userId: user._id,
		})

		if (!interestUser) {
			return sendResponse(res, null, "Group invitation not found", false, ResCode.NOT_FOUND)
		}

		// Check if already accepted
		if (interestUser.status === "active") {
			return sendResponse(res, { alreadyAccepted: true }, "You have already joined this group", true, ResCode.OK)
		}

		// Update status to active
		interestUser.status = "active"
		await interestUser.save()

		return sendResponse(
			res,
			{
				groupId: interestId,
				groupName: interest.name,
				userId: user._id,
			},
			"Successfully joined the interest group",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("Error accepting group invitation:", error)
		return sendResponse(res, null, error.message || "Failed to accept group invitation", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}


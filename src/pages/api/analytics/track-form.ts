import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { WebForm, UserJourney } from "@/models/analytics"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"

const VALID = ["focus", "field_change", "submit", "abandon"]

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)
		const { sessionId, anonId, page, eventId, formName, interactionType, fieldName } = req.body

		if (!sessionId || !page || !formName || !interactionType) {
			return sendResponse(res, null, "Required fields missing", false, ResCode.BAD_REQUEST)
		}
		if (!VALID.includes(interactionType)) {
			return sendResponse(res, null, "Invalid interactionType", false, ResCode.BAD_REQUEST)
		}

		const userId = session?.user && (session.user as any)._id ? new Types.ObjectId((session.user as any)._id) : undefined
		const eventObjectId = eventId ? new Types.ObjectId(eventId) : undefined
		const timestamp = new Date()

		WebForm.create({
			sessionId,
			userId,
			anonId: anonId || undefined,
			page,
			eventId: eventObjectId,
			formName,
			interactionType,
			fieldName,
			timestamp,
		}).catch((error) => {
			console.error("[Analytics Track Form] Error:", error.message)
		})

		if (interactionType === "submit" || interactionType === "abandon") {
			UserJourney.findOneAndUpdate(
				{ sessionId },
				{
					$setOnInsert: { sessionId, userId, anonId: anonId || undefined },
					$push: {
						journey: {
							action: `form_${interactionType}`,
							page,
							eventId: eventObjectId,
							timestamp,
							metadata: { formName },
						},
					},
				},
				{ upsert: true, new: false }
			).catch((error) => {
				console.error("[Analytics Track Form] UserJourney error:", error.message)
			})
		}

		return sendResponse(res, { success: true }, "Form interaction tracked", true, ResCode.OK)
	} catch (error: any) {
		console.error("[Analytics Track Form] Error:", error.message)
		return sendResponse(res, null, "Form tracking failed", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

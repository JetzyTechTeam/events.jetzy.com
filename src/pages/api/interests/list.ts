// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import InterestV2model from "@/models/interest-v2"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		if (req.method !== "GET") {
			return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
		}

		// Get all active interests
		const interests = await InterestV2model.find({ 
			status: "active",
			isDeleted: { $ne: true }
		})
			.select("name description image type")
			.sort({ name: 1 })
			.lean()

		// Group interests by type (public/private) and organize structure
		const organizedInterests = interests.map((interest) => ({
			_id: interest._id.toString(),
			name: interest.name,
			description: interest.description || "",
			image: interest.image || "",
			type: interest.type,
			// For now, subinterests are the same as interests
			// If you have a separate subinterest model, fetch it here
			subInterests: [] as Array<{ _id: string; name: string }>,
		}))

		return sendResponse(res, organizedInterests, "Interests retrieved successfully!", true, ResCode.OK)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}


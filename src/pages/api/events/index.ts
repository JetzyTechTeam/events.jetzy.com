// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		// Check authentication status and role
		const session = await getServerSession(req, res, authOptions)
		const userRole = (session?.user as any)?.role
		const isAdmin = userRole === "admin" || userRole === "super admin"

		// Define the query based on role
		let query: any = { isDeleted: false }
		
		// If user is not admin or super admin, only show public events
		if (!isAdmin) {
			query.privacy = "public"
		}

		// Get all the events from the database
		const events = await Events.find(query).sort({ createdAt: -1 })

		return sendResponse(res, events, "Events retrieved successfully!", true, ResCode.OK)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

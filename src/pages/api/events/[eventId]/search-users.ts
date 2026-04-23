import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"

const JETZY_API = (process.env.NEXT_PUBLIC_JETZY_API_URL || "https://test.jetzy.com/api").replace(/\/$/, "")

/**
 * GET /api/events/[eventId]/search-users?query=&page=&perPage=
 * Proxies to Jetzy GET /v2/events/{eventId}/users
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	const session = await getServerSession(req, res, authOptions)
	if (!session) {
		return sendResponse(res, null, "Unauthorized. Please login.", false, ResCode.UNAUTHORIZED)
	}

	const accessToken = (session as any).accessToken
	if (!accessToken) {
		return sendResponse(res, null, "No access token.", false, ResCode.UNAUTHORIZED)
	}

	const { eventId, query = "", page = "1", perPage = "20" } = req.query as Record<string, string>

	const params = new URLSearchParams({ perPage, page })
	if (query) params.set("query", query)

	const url = `${JETZY_API}/v2/events/${eventId}/users?${params.toString()}`

	try {
		const upstream = await fetch(url, {
			headers: {
				"Content-Type": "application/json",
				"Accept": "application/json",
				"Authorization": `Bearer ${accessToken}`,
			},
		})
		const data = await upstream.json()
		return res.status(upstream.status).json(data)
	} catch (err: any) {
		console.error("[search-users] Error:", err)
		return sendResponse(res, null, err.message || "Failed to search users", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

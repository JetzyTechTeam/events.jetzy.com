import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { resolveAlbumViewer } from "@/lib/album-auth"

/**
 * Who is viewing, if anyone? Returns { identified: false } rather than a 401 — being
 * anonymous is a perfectly normal state now that albums are public.
 *
 * The client uses this to decide whether it already knows the visitor (session or guest
 * cookie) and can therefore let them tag people without showing the name+email dialog.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const viewer = await resolveAlbumViewer(req, res)

		if (!viewer) {
			return sendResponse(res, { identified: false }, "Anonymous viewer", true, ResCode.OK)
		}

		return sendResponse(
			res,
			{ identified: true, email: viewer.email, name: viewer.name, isGuest: viewer.isGuest },
			"Viewer resolved",
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("[albums/viewer] Error:", error)
		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

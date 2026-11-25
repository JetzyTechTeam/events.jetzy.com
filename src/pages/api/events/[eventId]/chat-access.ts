import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { Types } from "mongoose"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { ensureDbConnected } from "@/configs/database"
import { chatPostAllowed, signChatAccess } from "@/lib/event-chat-access"

/**
 * GET /api/events/:eventId/chat-access — may the signed-in viewer SEND in this event's chat?
 *
 * `{ canPost, reason, enforced, chatAccess?, exp? }`. `chatAccess` is the signed token the embed
 * passes to JetzyChat (`src/lib/event-chat-access.ts`); `enforced` is false while the shared secret
 * isn't configured, and then the page shows no read-only notice — JetzyChat can't enforce it yet.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })
	res.setHeader("Cache-Control", "no-store")
	await ensureDbConnected()

	const session = await getServerSession(req, res, authOptions)
	if (!session?.user?.email) return res.status(401).json({ error: "Please sign in." })

	const eventId = String(req.query.eventId || "")
	if (!Types.ObjectId.isValid(eventId)) return res.status(400).json({ error: "Invalid event." })

	try {
		const { canPost, reason } = await chatPostAllowed(session as any, eventId)
		const signed = signChatAccess({ eventId, email: session.user.email, canPost })
		return res.status(200).json({
			data: { canPost, reason, enforced: !!signed, ...(signed ? { chatAccess: signed.token, exp: signed.exp } : {}) },
		})
	} catch (error: any) {
		console.error("[chat-access] Error:", error?.message || error)
		return res.status(500).json({ error: "Couldn't check chat access." })
	}
}

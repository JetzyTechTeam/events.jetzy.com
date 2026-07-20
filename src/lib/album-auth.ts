import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { generateMagicToken, verifyMagicToken } from "@/lib/magicLink"

export const ALBUM_GUEST_COOKIE = "album_guest"
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90 // 90 days

export interface AlbumViewer {
	email: string
	name: string
	userId?: string
	/** true when identified by the lightweight name+email gate rather than a NextAuth session */
	isGuest: boolean
}

/**
 * Resolves who is viewing an album.
 *
 * Albums are intentionally low-friction: a logged-in user is never prompted, and everyone
 * else identifies with just a name + email (see /api/events/[eventId]/albums/guest-access),
 * which is remembered in a signed HttpOnly cookie. Returns null when neither is present.
 */
export async function resolveAlbumViewer(req: NextApiRequest, res: NextApiResponse): Promise<AlbumViewer | null> {
	// 1. Logged-in user wins — no prompt anywhere.
	const session = await getServerSession(req, res, authOptions)
	if (session?.user) {
		const u = session.user as any
		const email = (u.email || "").trim().toLowerCase()
		if (email) {
			return {
				email,
				name: (u.name || u.fullName || "").trim() || email,
				userId: u._id?.toString(),
				isGuest: false,
			}
		}
	}

	// 2. Otherwise fall back to the signed guest cookie.
	const raw = req.cookies?.[ALBUM_GUEST_COOKIE]
	if (!raw) return null

	const data = verifyMagicToken(raw)
	const email = (data?.email || "").trim().toLowerCase()
	if (!email) return null

	const name = [data?.firstName, data?.lastName].filter(Boolean).join(" ").trim()
	return {
		email,
		name: name || email,
		userId: data?._id?.toString(),
		isGuest: true,
	}
}

/** Issues the signed guest cookie after a successful name+email submission. */
export function setAlbumGuestCookie(res: NextApiResponse, viewer: { email: string; firstName: string; lastName: string; userId?: string }) {
	const token = generateMagicToken({
		email: viewer.email,
		firstName: viewer.firstName,
		lastName: viewer.lastName,
		_id: viewer.userId,
	})

	const parts = [
		`${ALBUM_GUEST_COOKIE}=${encodeURIComponent(token)}`,
		"Path=/",
		`Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
		"HttpOnly",
		"SameSite=Lax",
	]
	if (process.env.NODE_ENV === "production") parts.push("Secure")

	res.setHeader("Set-Cookie", parts.join("; "))
}

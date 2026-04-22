import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Types } from "mongoose"
import sendgrid from "@sendgrid/mail"

sendgrid.setApiKey((process.env.SENDGRID_API_KEY as string)?.trim())

const JETZY_API = (process.env.NEXT_PUBLIC_JETZY_API_URL || "https://test.jetzy.com/api").replace(/\/$/, "")

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	await ensureDbConnected()

	const session = await getServerSession(req, res, authOptions)
	if (!session) {
		return sendResponse(res, null, "Unauthorized. Please login.", false, ResCode.UNAUTHORIZED)
	}

	const { eventId } = req.query as { eventId: string }
	const { userId, userEmail, userName } = req.body

	if (!userId) {
		return sendResponse(res, null, "userId is required", false, ResCode.BAD_REQUEST)
	}

	const userRole = (session.user as any)?.role
	const sessionUserId = (session.user as any)?._id?.toString()
	const isAdmin = userRole === "admin" || userRole === "super admin"
	const accessToken = (session as any).accessToken

	// Ownership check
	if (!isAdmin) {
		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false }, { ownerId: 1 }).lean()
		if (!event || (event as any).ownerId?.toString() !== sessionUserId) {
			return sendResponse(res, null, "Access denied.", false, ResCode.FORBIDDEN)
		}
	}

	const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false })
		.select("name slug ownerId")
		.lean()

	if (!event) {
		return sendResponse(res, null, "Event not found.", false, ResCode.NOT_FOUND)
	}

	let pushSent = false
	let emailSent = false
	let resolvedEmail = userEmail || null

	// 1. Send push notification via JetzySocial
	if (accessToken) {
		try {
			const inviteRes = await fetch(`${JETZY_API}/v2/events/${eventId}/members/invite`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Accept": "application/json",
					"Authorization": `Bearer ${accessToken}`,
				},
				body: JSON.stringify({ userId }),
			})
			pushSent = inviteRes.ok
		} catch (err) {
			console.error("[invite-jetzy-user] Push notification failed:", err)
		}
	}

	// 2. Fetch user profile from JetzySocial if email not provided
	if (!resolvedEmail && accessToken) {
		try {
			const profileRes = await fetch(`${JETZY_API}/v2/users/${userId}`, {
				headers: {
					"Content-Type": "application/json",
					"Accept": "application/json",
					"Authorization": `Bearer ${accessToken}`,
				},
			})
			if (profileRes.ok) {
				const profileData = await profileRes.json()
				resolvedEmail = profileData?.data?.email || profileData?.data?.user?.email || profileData?.email || null
			}
		} catch (err) {
			console.error("[invite-jetzy-user] Profile fetch failed:", err)
		}
	}

	// 3. Send email via SendGrid
	if (resolvedEmail) {
		try {
			const eventLink = `${process.env.NEXT_PUBLIC_URL}/${(event as any).slug}`
			const firstName = userName?.split(" ")[0] || "there"
			await sendgrid.send({
				to: resolvedEmail,
				from: (process.env.SENDGRID_EMAIL_SENDER as string)?.trim(),
				subject: `You're invited to ${(event as any).name} on Jetzy Events!`,
				html: `
				<div style="font-family:Arial,sans-serif;background:#f9f9f9;padding:40px 0;">
					<div style="max-width:500px;margin:0 auto;background:#fff;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.07);padding:32px;">
						<h2 style="color:#F79432;text-align:center;">You're Invited!</h2>
						<p style="font-size:16px;color:#4a5568;text-align:center;">
							Hi ${firstName}, you've been invited to join <strong>${(event as any).name}</strong> on Jetzy Events.
						</p>
						<div style="text-align:center;margin:28px 0;">
							<a href="${eventLink}" target="_blank"
							   style="display:inline-block;background:#F79432;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:18px;font-weight:bold;">
								View Event &amp; RSVP
							</a>
						</div>
						<p style="font-size:13px;color:#a0aec0;text-align:center;">
							If the button does not work, copy this link:<br/>
							<a href="${eventLink}" target="_blank" style="color:#3182ce;">${eventLink}</a>
						</p>
						<hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0;">
						<p style="font-size:12px;color:#a0aec0;text-align:center;">Sent via Jetzy Events</p>
					</div>
				</div>`,
			})
			emailSent = true
		} catch (err) {
			console.error("[invite-jetzy-user] Email send failed:", err)
		}
	}

	return sendResponse(
		res,
		{ pushSent, emailSent, emailAvailable: !!resolvedEmail },
		emailSent ? "Invitation sent via push notification and email." : pushSent ? "Invitation sent via push notification. No email address available." : "Invite processed.",
		true,
		ResCode.OK
	)
}

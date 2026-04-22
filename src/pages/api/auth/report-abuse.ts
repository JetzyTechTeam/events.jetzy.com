import type { NextApiRequest, NextApiResponse } from "next"
import { EventUsers } from "@/models/eventUsersModal"
import { Users } from "@Jetzy/models/userModal"
import { ensureDbConnected } from "@/configs/database"
import { sendBlockNotificationEmail } from "@Jetzy/lib/send-grid"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()
    // Accept both GET (from email link click) and POST
    if (req.method !== "GET" && req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    try {
        const email = (req.query.email || req.body?.email) as string

        if (!email) {
            return res.redirect(302, "/report-abuse?status=error&reason=missing-email")
        }

        const decodedEmail = decodeURIComponent(email)

        // Find user in BOTH collections — block in whichever one they exist
        const eventUser = await EventUsers.findOne({ email: decodedEmail })
        const legacyUser = await Users.findOne({ email: decodedEmail })

        if (!eventUser && !legacyUser) {
            // Even if user not found, redirect gracefully — don't expose system internals
            return res.redirect(302, "/report-abuse?status=success")
        }

        const blockedAt = new Date().toISOString()

        const blockPayload = {
            $set: {
                isBlocked: true,
                blockedAt: new Date(),
                blockedReason: "User reported account was created without their consent.",
                requiresVerification: true,
            }
        }

        // Block in whichever collection(s) the user exists in
        if (eventUser) {
            await EventUsers.findOneAndUpdate({ email: decodedEmail }, blockPayload)
        }
        if (legacyUser) {
            await Users.findOneAndUpdate({ email: decodedEmail }, blockPayload, { strict: false })
        }

        // Send compliance notification to tech team
        try {
            await sendBlockNotificationEmail({ email: decodedEmail, blockedAt })
        } catch (emailError) {
            // Don't fail the whole flow if email notification fails
            console.error("Failed to send block notification email:", emailError)
        }

        // Redirect to confirmation page
        return res.redirect(302, "/report-abuse?status=success")
    } catch (error: any) {
        console.error("Error in report-abuse handler:", error.message)
        return res.redirect(302, "/report-abuse?status=error")
    }
}

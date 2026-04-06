import type { NextApiRequest, NextApiResponse } from "next"
import { EventUsers } from "@/models/eventUsersModal"
import { sendBlockNotificationEmail } from "@Jetzy/lib/send-grid"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

        // Find user in EventUsers collection
        const user = await EventUsers.findOne({ email: decodedEmail })

        if (!user) {
            // Even if user not found, redirect gracefully — don't expose system internals
            return res.redirect(302, "/report-abuse?status=success")
        }

        const blockedAt = new Date().toISOString()

        // Block and flag for compliance review
        await EventUsers.findOneAndUpdate(
            { email: decodedEmail },
            {
                $set: {
                    isBlocked: true,
                    blockedAt: new Date(),
                    blockedReason: "User reported account was created without their consent.",
                    requiresVerification: true,
                }
            }
        )

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

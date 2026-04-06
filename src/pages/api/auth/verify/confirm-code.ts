import type { NextApiRequest, NextApiResponse } from "next"
import { EventUsers } from "@/models/eventUsersModal"
import { sendAdminComplianceAlert } from "@Jetzy/lib/send-grid"
import crypto from "crypto"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    try {
        const { email, code } = req.body

        if (!email || !code) {
            return res.status(400).json({ error: "Email and code are required" })
        }

        const decodedEmail = decodeURIComponent(email).toLowerCase()

        // Find user
        const user = await EventUsers.findOne({
            email: decodedEmail,
            manualVerificationCode: code,
            manualVerificationCodeExpiresAt: { $gt: new Date() }
        })

        if (!user) {
            return res.status(400).json({ error: "Invalid or expired verification code." })
        }

        // Generate unblock token for admin
        const unblockToken = crypto.randomBytes(32).toString("hex")

        // Progress status to pending admin review
        await EventUsers.findOneAndUpdate(
            { email: decodedEmail },
            {
                $set: {
                    complianceStatus: "verified_pending_review",
                    adminUnblockToken: unblockToken,
                    manualVerificationCode: null, // Clear code
                    manualVerificationCodeExpiresAt: null
                }
            }
        )

        // Only after setting the token in DB, notify the admin
        await sendAdminComplianceAlert({ email: decodedEmail, unblockToken })

        return res.status(200).json({ success: true, message: "Email verified. Account is now under admin review." })
    } catch (error: any) {
        console.error("Error in confirm-code handler:", error.message)
        return res.status(500).json({ error: "Internal server error" })
    }
}

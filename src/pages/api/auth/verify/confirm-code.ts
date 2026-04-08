import type { NextApiRequest, NextApiResponse } from "next"
import { EventUsers } from "@/models/eventUsersModal"
import { sendAdminComplianceAlert } from "@Jetzy/lib/send-grid"
import crypto from "crypto"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    try {
        const { email, code, mode } = req.body

        if (!email || !code) {
            return res.status(400).json({ error: "Email and code are required" })
        }

        const decodedEmail = decodeURIComponent(email).toLowerCase()
        const isRecoverMode = mode === "recover"

        // Find user with matching code that hasn't expired
        const user = await EventUsers.findOne({
            email: decodedEmail,
            manualVerificationCode: code,
            manualVerificationCodeExpiresAt: { $gt: new Date() }
        })

        if (!user) {
            return res.status(400).json({ error: "Invalid or expired verification code." })
        }

        if (isRecoverMode) {
            // RECOVER MODE: User accidentally blocked themselves — unblock immediately
            await EventUsers.findOneAndUpdate(
                { email: decodedEmail },
                {
                    $set: {
                        isBlocked: false,
                        requiresVerification: false,
                        complianceStatus: "approved",
                        blockedAt: null,
                        blockedReason: null,
                        adminUnblockToken: null,
                        manualVerificationCode: null,
                        manualVerificationCodeExpiresAt: null,
                    }
                }
            )
            return res.status(200).json({ success: true, message: "Your account has been unblocked. You can now log in." })
        } else {
            // COMPLIANCE MODE: Flag for admin review (existing flow)
            const unblockToken = crypto.randomBytes(32).toString("hex")

            await EventUsers.findOneAndUpdate(
                { email: decodedEmail },
                {
                    $set: {
                        complianceStatus: "verified_pending_review",
                        adminUnblockToken: unblockToken,
                        manualVerificationCode: null,
                        manualVerificationCodeExpiresAt: null,
                    }
                }
            )

            // Notify admin for review
            await sendAdminComplianceAlert({ email: decodedEmail, unblockToken })

            return res.status(200).json({ success: true, message: "Email verified. Account is now under admin review." })
        }
    } catch (error: any) {
        console.error("Error in confirm-code handler:", error.message)
        return res.status(500).json({ error: "Internal server error" })
    }
}

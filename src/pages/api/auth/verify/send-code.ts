import type { NextApiRequest, NextApiResponse } from "next"
import { EventUsers } from "@/models/eventUsersModal"
import { sendManualVerificationEmail } from "@Jetzy/lib/send-grid"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    try {
        const { email } = req.body

        if (!email) {
            return res.status(400).json({ error: "Email is required" })
        }

        const decodedEmail = decodeURIComponent(email).toLowerCase()

        // Find user
        const user = await EventUsers.findOne({ email: decodedEmail })

        if (!user) {
            // To prevent email enumeration, we return success even if user not found
            // but we don't send any email.
            return res.status(200).json({ success: true, message: "If an account exists, a code has been sent." })
        }

        // Generate 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString()
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes

        // Save to DB
        await EventUsers.findOneAndUpdate(
            { email: decodedEmail },
            {
                $set: {
                    manualVerificationCode: code,
                    manualVerificationCodeExpiresAt: expiresAt
                }
            }
        )

        // Send email
        await sendManualVerificationEmail({ email: decodedEmail, code })

        return res.status(200).json({ success: true, message: "Verification code sent." })
    } catch (error: any) {
        console.error("Error in send-code handler:", error.message)
        return res.status(500).json({ error: "Internal server error" })
    }
}

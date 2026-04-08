import type { NextApiRequest, NextApiResponse } from "next"
import { EventUsers } from "@/models/eventUsersModal"
import { Users } from "@Jetzy/models/userModal"
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

        // Find user in BOTH collections
        const eventUser = await EventUsers.findOne({ email: decodedEmail })
        const legacyUser = !eventUser ? await Users.findOne({ email: decodedEmail }) : null

        if (!eventUser && !legacyUser) {
            // To prevent email enumeration, we return success even if user not found
            // but we don't send any email.
            return res.status(200).json({ success: true, message: "If an account exists, a code has been sent." })
        }

        // Generate 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString()
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes

        const codePayload = {
            $set: {
                manualVerificationCode: code,
                manualVerificationCodeExpiresAt: expiresAt
            }
        }

        // Save to whichever collection the user exists in
        if (eventUser) {
            await EventUsers.findOneAndUpdate({ email: decodedEmail }, codePayload)
        } else if (legacyUser) {
            await Users.findOneAndUpdate({ email: decodedEmail }, codePayload, { strict: false })
        }

        // Send email
        await sendManualVerificationEmail({ email: decodedEmail, code })

        return res.status(200).json({ success: true, message: "Verification code sent." })
    } catch (error: any) {
        console.error("Error in send-code handler:", error.message)
        return res.status(500).json({ error: "Internal server error" })
    }
}

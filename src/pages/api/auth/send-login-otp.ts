import type { NextApiRequest, NextApiResponse } from "next"
import { EventUsers } from "@/models/eventUsersModal"
import { Users } from "@Jetzy/models/userModal"
import { sendManualVerificationEmail } from "@Jetzy/lib/send-grid"

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    try {
        const { email } = req.body
        if (!email) return res.status(400).json({ error: "Email is required" })

        const decodedEmail = email.toLowerCase().trim()

        // Find user in either collection
        const eventUser = await EventUsers.findOne({ email: decodedEmail })
        const legacyUser = await Users.findOne({ email: decodedEmail })

        if (!eventUser && !legacyUser) {
            // Don't reveal if account exists — just say "if your email is registered, you'll get a code"
            return res.status(200).json({ success: true, message: "If your email is registered, you'll receive a login code shortly." })
        }

        // Check if blocked
        const user = eventUser || legacyUser
        if ((user as any).isBlocked) {
            return res.status(403).json({ error: "ACCOUNT_BLOCKED" })
        }

        const otp = generateOTP()
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

        // Store OTP in whichever collection the user actually exists in
        // IMPORTANT: Never upsert into EventUsers for legacy users — that creates ghost accounts
        if (eventUser) {
            await EventUsers.findOneAndUpdate(
                { email: decodedEmail },
                { $set: { manualVerificationCode: otp, manualVerificationCodeExpiresAt: expiresAt } }
            )
        } else if (legacyUser) {
            // Store OTP directly in the legacy Users collection where the user lives
            await Users.findOneAndUpdate(
                { email: decodedEmail },
                { $set: { manualVerificationCode: otp, manualVerificationCodeExpiresAt: expiresAt } },
                { strict: false }
            )
        }

        await sendManualVerificationEmail({ email: decodedEmail, code: otp })

        return res.status(200).json({ success: true, message: "Login code sent to your email." })
    } catch (error: any) {
        console.error("Error in send-login-otp:", error.message)
        return res.status(500).json({ error: "Internal server error" })
    }
}

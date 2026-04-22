import type { NextApiRequest, NextApiResponse } from "next"
import { EventUsers } from "@/models/eventUsersModal"
import { Users } from "@Jetzy/models/userModal"
import { ensureDbConnected } from "@/configs/database"
import { generateMagicToken } from "@/lib/magicLink"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    try {
        const { email, code } = req.body
        if (!email || !code) return res.status(400).json({ error: "Email and code are required" })

        const decodedEmail = email.toLowerCase().trim()

        const otpQuery = {
            email: decodedEmail,
            manualVerificationCode: code,
            manualVerificationCodeExpiresAt: { $gt: new Date() }
        }

        // Search BOTH collections for the OTP — it could be in either one
        let user = await EventUsers.findOne(otpQuery)
        let foundIn: "EventUsers" | "Users" = "EventUsers"

        if (!user) {
            user = await Users.findOne(otpQuery)
            foundIn = "Users"
        }

        if (!user) {
            return res.status(400).json({ error: "Invalid or expired login code. Please request a new one." })
        }

        // Clear the OTP from whichever collection it was stored in
        const clearOtp = { $set: { manualVerificationCode: null, manualVerificationCodeExpiresAt: null } }
        if (foundIn === "EventUsers") {
            await EventUsers.findOneAndUpdate({ email: decodedEmail }, clearOtp)
        } else {
            await Users.findOneAndUpdate({ email: decodedEmail }, clearOtp, { strict: false })
        }

        // Generate a magic token using the existing system — NextAuth will accept this directly
        const magicToken = generateMagicToken({ email: user.email })

        return res.status(200).json({ success: true, magicToken })
    } catch (error: any) {
        console.error("Error in verify-login-otp:", error.message)
        return res.status(500).json({ error: "Internal server error" })
    }
}

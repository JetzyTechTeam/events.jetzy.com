import type { NextApiRequest, NextApiResponse } from "next"
import { EventUsers } from "@/models/eventUsersModal"
import { Users } from "@Jetzy/models/userModal"
import { ensureDbConnected } from "@/configs/database"
import bcrypt from "bcrypt"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    try {
        const { token, email, password } = req.body
        if (!token || !email || !password) {
            return res.status(400).json({ error: "All fields are required" })
        }

        const decodedEmail = decodeURIComponent(email).toLowerCase().trim()

        // Case-insensitive, for the same reason as forgot-password: `email` has no
        // `lowercase: true` in either collection, so an account stored as `Fahad@Example.com`
        // would reject its own valid reset link as "invalid or expired".
        const emailMatch = {
            email: { $regex: `^${decodedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
        }
        const tokenMatch = {
            ...emailMatch,
            passwordResetToken: token,
            passwordResetTokenExpiresAt: { $gt: new Date() },
        }

        // Find user with valid reset token in EventUsers first
        let user = await EventUsers.findOne(tokenMatch)

        let collection: "event" | "users" = "event"
        if (!user) {
            user = await Users.findOne(tokenMatch)
            collection = "users"
        }

        if (!user) {
            return res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." })
        }

        const hashedPassword = await bcrypt.hash(password, 10)

        const updatePayload = {
            password: hashedPassword,
            passwordResetToken: null,
            passwordResetTokenExpiresAt: null,
        }

        // Only update the collection(s) where the user actually exists
        // Do NOT blindly update both — that can create ghost fields on non-existent records
        const updates = []
        const eventUserExists = await EventUsers.findOne(emailMatch)
        const legacyUserExists = await Users.findOne(emailMatch)

        if (eventUserExists) {
            updates.push(EventUsers.findByIdAndUpdate(eventUserExists._id, { $set: updatePayload }))
        }
        if (legacyUserExists) {
            updates.push(Users.findByIdAndUpdate(legacyUserExists._id, { $set: updatePayload }, { strict: false }))
        }

        await Promise.all(updates)

        return res.status(200).json({ success: true, message: "Password updated successfully." })
    } catch (error: any) {
        console.error("Error in reset-password:", error.message)
        return res.status(500).json({ error: "Internal server error" })
    }
}

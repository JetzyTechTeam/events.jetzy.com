import type { NextApiRequest, NextApiResponse } from "next"
import { EventUsers } from "@/models/eventUsersModal"
import { Users } from "@Jetzy/models/userModal"
import bcrypt from "bcrypt"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    try {
        const { token, email, password } = req.body
        if (!token || !email || !password) {
            return res.status(400).json({ error: "All fields are required" })
        }

        const decodedEmail = decodeURIComponent(email).toLowerCase().trim()

        // Find user with valid reset token in EventUsers first
        let user = await EventUsers.findOne({
            email: decodedEmail,
            passwordResetToken: token,
            passwordResetTokenExpiresAt: { $gt: new Date() }
        })

        let collection: "event" | "users" = "event"
        if (!user) {
            user = await Users.findOne({
                email: decodedEmail,
                passwordResetToken: token,
                passwordResetTokenExpiresAt: { $gt: new Date() }
            })
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
        const eventUserExists = await EventUsers.findOne({ email: decodedEmail })
        const legacyUserExists = await Users.findOne({ email: decodedEmail })

        if (eventUserExists) {
            updates.push(EventUsers.findOneAndUpdate({ email: decodedEmail }, { $set: updatePayload }))
        }
        if (legacyUserExists) {
            updates.push(Users.findOneAndUpdate({ email: decodedEmail }, { $set: updatePayload }, { strict: false }))
        }

        await Promise.all(updates)

        return res.status(200).json({ success: true, message: "Password updated successfully." })
    } catch (error: any) {
        console.error("Error in reset-password:", error.message)
        return res.status(500).json({ error: "Internal server error" })
    }
}

import type { NextApiRequest, NextApiResponse } from "next"
import { EventUsers } from "@/models/eventUsersModal"
import { Users } from "@Jetzy/models/userModal"
import crypto from "crypto"
import sgMail from "@sendgrid/mail"

sgMail.setApiKey((process.env.SENDGRID_API_KEY as string)?.trim())

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    try {
        const { email } = req.body
        if (!email) return res.status(400).json({ error: "Email is required" })

        const decodedEmail = email.toLowerCase().trim()
        const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"

        // Find user in either collection
        const eventUser = await EventUsers.findOne({ email: decodedEmail })
        const legacyUser = !eventUser ? await Users.findOne({ email: decodedEmail }) : null

        // Always return success to prevent email enumeration
        if (!eventUser && !legacyUser) {
            return res.status(200).json({ success: true })
        }

        const resetToken = crypto.randomBytes(32).toString("hex")
        const resetTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes

        // Store the reset token
        if (eventUser) {
            await EventUsers.findOneAndUpdate(
                { email: decodedEmail },
                { $set: { passwordResetToken: resetToken, passwordResetTokenExpiresAt: resetTokenExpiresAt } },
                { strict: false }
            )
        } else if (legacyUser) {
            await Users.findOneAndUpdate(
                { email: decodedEmail },
                { $set: { passwordResetToken: resetToken, passwordResetTokenExpiresAt: resetTokenExpiresAt } },
                { strict: false }
            )
        }

        const resetUrl = `${baseUrl}/auth/reset-password?token=${resetToken}&email=${encodeURIComponent(decodedEmail)}`

        // Send email
        await sgMail.send({
            to: decodedEmail,
            from: {
                email: (process.env.SENDGRID_EMAIL_SENDER as string)?.trim(),
                name: "Jetzy Account"
            },
            subject: "Reset Your Jetzy Password",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 12px;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <img src="https://events.jetzy.com/favicon.ico" width="40" height="40" />
                        <h2 style="color: #333; margin-top: 12px;">Reset Your Password</h2>
                    </div>
                    <p style="color: #555; font-size: 16px;">We received a request to reset the password for your Jetzy account.</p>
                    <div style="text-align: center; margin: 32px 0;">
                        <a href="${resetUrl}" style="background-color: #F79432; color: white; padding: 14px 32px; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 16px; display: inline-block;">
                            Reset Password
                        </a>
                    </div>
                    <p style="color: #999; font-size: 13px;">This link expires in 30 minutes. If you didn't request a reset, you can safely ignore this email.</p>
                    <p style="color: #ccc; font-size: 12px; text-align: center; margin-top: 24px;">© ${new Date().getFullYear()} Jetzy Events, Inc.</p>
                </div>
            `,
            text: `Reset your Jetzy password: ${resetUrl}\n\nThis link expires in 30 minutes.`
        })

        return res.status(200).json({ success: true })
    } catch (error: any) {
        console.error("Error in forgot-password:", error.message)
        return res.status(500).json({ error: "Internal server error" })
    }
}

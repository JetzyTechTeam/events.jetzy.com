import type { NextApiRequest, NextApiResponse } from "next"
import { EventUsers } from "@/models/eventUsersModal"
import bcrypt from "bcrypt"
import { sendAccountApprovedEmail } from "@Jetzy/lib/send-grid"

const generateRandomPassword = (length = 10) => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
    let retVal = ""
    for (let i = 0, n = charset.length; i < length; ++i) {
        retVal += charset.charAt(Math.floor(Math.random() * n))
    }
    return retVal
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Admin clicks a link from email, so GET is expected
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    try {
        const { token } = req.query

        if (!token) {
            return res.status(400).send("<h1>Error: Missing Unblock Token</h1>")
        }

        // Find user by admin unblock token
        const user = await EventUsers.findOne({ adminUnblockToken: token })

        if (!user) {
            return res.status(404).send("<h1>Error: Invalid or Expired Token</h1><p>Account may have already been unblocked or the token is incorrect.</p>")
        }

        // Generate a new temporary password
        const newPassword = generateRandomPassword()
        const hashedNewPassword = await bcrypt.hash(newPassword, 10)

        // UNBLOCK THE USER AND SET NEW PASSWORD
        await EventUsers.findOneAndUpdate(
            { adminUnblockToken: token },
            {
                $set: {
                    password: hashedNewPassword, // Reset password
                    isBlocked: false,
                    complianceStatus: "approved",
                    requiresVerification: false,
                    adminUnblockToken: null, // Clear token after success
                    blockedAt: null,
                    blockedReason: null
                }
            }
        )

        // Notify the user their account is ready
        try {
            await sendAccountApprovedEmail({ email: user.email, password: newPassword })
        } catch (emailError) {
            console.error("Failed to send approval email:", emailError)
        }

        // Success page for the admin
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(`
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; text-align: center; padding: 80px 20px; max-width: 600px; margin: 0 auto;">
                <div style="width: 80px; height: 80px; background: #e6fffa; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; border: 2px solid #38b2ac;">
                    <svg style="width: 40px; height: 40px; color: #38b2ac;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                    </svg>
                </div>
                <h1 style="color: #2d3748; font-size: 28px; font-weight: 800; margin-bottom: 16px;">Account Unblocked Successfully</h1>
                <p style="color: #4a5568; font-size: 18px; line-height: 1.6; margin-bottom: 32px;">
                    User <strong>${user.email}</strong> is now allowed to log in.<br>
                    A new temporary password (<strong>${newPassword}</strong>) has been sent to them.
                </p>
                <div style="margin-top: 32px;">
                    <a href="/" style="background: #F79432; color: white; padding: 14px 32px; text-decoration: none; border-radius: 50px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 6px rgba(247, 148, 50, 0.2); transition: all 0.2s;">
                        Go to Dashboard
                    </a>
                </div>
            </div>
        `)
    } catch (error: any) {
        console.error("Error in admin unblock handler:", error.message)
        return res.status(500).send("<h1>Internal Server Error</h1>")
    }
}

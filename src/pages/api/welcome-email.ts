import type { NextApiRequest, NextApiResponse } from "next"
import { sendWelcomeEmail } from "@Jetzy/lib/send-grid"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    try {
        const { email, firstName, lastName, password } = req.body

        if (!email) {
            return res.status(400).json({ error: "Email is required" })
        }

        await sendWelcomeEmail({ email, firstName, lastName, password })

        return res.status(200).json({ success: true })
    } catch (error) {
        console.error("Error sending welcome email:", error)
        return res.status(500).json({ error: "Internal server error" })
    }
}

import type { NextApiRequest, NextApiResponse } from "next"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    try {
        const { email } = req.body
        if (!email) return res.status(400).json({ error: "Email is required" })

        const decodedEmail = String(email).toLowerCase().trim()
        const base = process.env.NEXT_PUBLIC_EXTERNAL_API_BASE_URL || "https://test.jetzy.com"

        const r = await fetch(`${base}/api/v1/accounts/login-code/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: decodedEmail, platform: "web" }),
        })
        const body = await r.json().catch(() => ({} as any))

        if (r.ok) {
            return res.status(200).json({ success: true, message: "Login code sent to your email." })
        }

        if (r.status === 429) {
            return res.status(429).json({ error: "Too many requests. Please wait before trying again." })
        }

        return res.status(r.status || 500).json({ error: body?.message || "Failed to send code. Please try again." })
    } catch (error: any) {
        console.error("Error in send-login-otp:", error?.message || error)
        return res.status(500).json({ error: "Internal server error" })
    }
}

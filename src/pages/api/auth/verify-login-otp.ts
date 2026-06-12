import type { NextApiRequest, NextApiResponse } from "next"
import { generateMagicToken } from "@/lib/magicLink"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    try {
        const { email, code } = req.body
        if (!email || !code) return res.status(400).json({ error: "Email and code are required" })

        const decodedEmail = String(email).toLowerCase().trim()
        const base = process.env.NEXT_PUBLIC_EXTERNAL_API_BASE_URL || "https://test.jetzy.com"

        const r = await fetch(`${base}/api/v1/accounts/login-code/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: decodedEmail, code: String(code).trim() }),
        })
        const body = await r.json().catch(() => ({} as any))

        if (r.ok && body?.data?.accessToken) {
            // Embed the real backend accessToken into the HMAC-signed magic token so
            // NextAuth's authorize() can place it straight into the session. The client
            // never sees or supplies the raw token to signIn(). Name is included so
            // authorize can JIT-create the local user record if it doesn't exist yet.
            const u = body.data.user || {}
            const magicToken = generateMagicToken({
                email: decodedEmail,
                accessToken: body.data.accessToken,
                firstName: u.firstName,
                lastName: u.lastName,
            })
            return res.status(200).json({ success: true, magicToken })
        }

        if (r.status === 423) {
            return res.status(423).json({ error: "Too many attempts. Please try again later." })
        }

        if (r.status === 429) {
            return res.status(429).json({ error: "Too many requests. Please wait before trying again." })
        }

        return res.status(400).json({ error: body?.message || "Invalid or expired login code. Please request a new one." })
    } catch (error: any) {
        console.error("Error in verify-login-otp:", error?.message || error)
        return res.status(500).json({ error: "Internal server error" })
    }
}

/**
 * SendGrid Email Event Webhook
 * 
 * How to set this up:
 * 1. Go to SendGrid Dashboard → Settings → Mail Settings → Event Webhook
 * 2. Set HTTP Post URL to: https://your-domain.com/api/sendgrid-webhook
 * 3. Enable events: "Bounce", "Blocked", "Invalid Email"
 * 4. (Optional) Add a Signed Webhook secret for security
 * 
 * SendGrid will POST to this endpoint when an email bounces.
 */

import type { NextApiRequest, NextApiResponse } from "next"
import { EventUsers } from "@/models/eventUsersModal"

interface SendGridEvent {
    email: string
    event: string      // "bounce" | "blocked" | "invalid" | "deferred" | "delivered" | "open" | "click" | "unsubscribe" | "spamreport"
    timestamp: number
    type?: string      // "bounce" sub-type: "type" or "permanent"
    reason?: string
    status?: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    try {
        // SendGrid sends an array of events in a single POST
        const events: SendGridEvent[] = Array.isArray(req.body) ? req.body : [req.body]

        console.log(`[SendGrid Webhook] Received ${events.length} event(s)`)

        for (const event of events) {
            const { email, event: eventType } = event

            if (!email) continue

            // Only care about hard bounces and blocked emails
            if (eventType === "bounce" || eventType === "blocked" || eventType === "invalid") {
                console.log(`[SendGrid Webhook] ${eventType} detected for: ${email}`)

                try {
                    // Mark the user's email as bounced
                    const result = await EventUsers.findOneAndUpdate(
                        { email: email.toLowerCase() },
                        {
                            $set: {
                                emailBounced: true,
                            }
                        },
                        { new: true }
                    )

                    if (result) {
                        console.log(`[SendGrid Webhook] ✅ Marked emailBounced=true for: ${email}`)
                    } else {
                        console.log(`[SendGrid Webhook] ℹ️ No user found for bounced email: ${email}`)
                    }
                } catch (dbError: any) {
                    console.error(`[SendGrid Webhook] DB error for ${email}:`, dbError.message)
                }
            }
        }

        // Always return 200 to SendGrid — otherwise it will retry
        return res.status(200).json({ received: true })
    } catch (error: any) {
        console.error("[SendGrid Webhook] Error:", error.message)
        // Still return 200 to prevent SendGrid from retrying
        return res.status(200).json({ received: true, error: error.message })
    }
}

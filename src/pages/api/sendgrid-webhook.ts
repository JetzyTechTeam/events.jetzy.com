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
import { Blasts } from "@/models/events/blast"
import { ensureDbConnected } from "@/configs/database"
import type { BlastRecipientStatus } from "@/lib/blast-delivery"

/**
 * SendGrid event -> the status we store on a blast recipient.
 *
 * `deferred`, `delivered`, `open` and `click` are deliberately absent: a deferral is retried
 * automatically and is not a failure, and we do not track engagement.
 */
const BLAST_STATUS_BY_EVENT: Record<string, BlastRecipientStatus> = {
	bounce: "bounced",
	blocked: "blocked",
	invalid: "bounced",
	dropped: "blocked",
	spamreport: "spam_report",
}

/**
 * Attribute a bounce back to the blast that caused it.
 *
 * A blast records every recipient as `sent` the moment SendGrid ACCEPTS it — acceptance is not
 * delivery, and the bounce can land seconds or hours later. Without this the console would show
 * "Delivered" forever against an address that never received anything, which is the specific
 * thing a host is trying to find out.
 *
 * Only the MOST RECENT blast to that address is updated. An address on five past blasts bounced
 * on the one just sent; retro-marking all five would rewrite history that was true at the time.
 *
 * Matched case-insensitively — `Bookings.customerEmail` has no `lowercase: true`, so a recipient
 * row can hold `Anna@Example.com` while SendGrid reports `anna@example.com`.
 */
async function recordBlastBounce(email: string, eventType: string, reason?: string) {
	const status = BLAST_STATUS_BY_EVENT[eventType]
	if (!status) return

	const escaped = email.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	const emailMatch = { $regex: `^${escaped}$`, $options: "i" }

	const blast = await Blasts.findOne({ isDeleted: false, "recipients.email": emailMatch }).sort({ sentAt: -1 }).select("_id")
	if (!blast) return

	await Blasts.updateOne(
		{ _id: blast._id, "recipients.email": emailMatch },
		{
			$set: {
				"recipients.$[row].status": status,
				"recipients.$[row].reason": reason || "",
				"recipients.$[row].respondedAt": new Date(),
			},
		},
		{ arrayFilters: [{ "row.email": emailMatch }] },
	)
}

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
        // The bounce attribution below touches Mongo, so the connection has to be up. The
        // original handler only wrote through an already-imported model and got away without it.
        await ensureDbConnected()

        // SendGrid sends an array of events in a single POST
        const events: SendGridEvent[] = Array.isArray(req.body) ? req.body : [req.body]

        console.log(`[SendGrid Webhook] Received ${events.length} event(s)`)

        for (const event of events) {
            const { email, event: eventType, reason } = event

            if (!email) continue

            // Update the blast that mailed this address, so the host can see what happened
            // rather than a permanent "Delivered". Best-effort: a failure here must not stop the
            // bounce being recorded on the user below, and must never make us 500 at SendGrid.
            try {
                await recordBlastBounce(email, eventType, reason)
            } catch (blastError: any) {
                console.error(`[SendGrid Webhook] Could not attribute ${eventType} to a blast for ${email}:`, blastError?.message || blastError)
            }

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

import type { NextApiRequest, NextApiResponse } from "next"
import sendgrid from "@sendgrid/mail"
import { Types } from "mongoose"
import { ensureDbConnected } from "@/configs/database"
import { Events } from "@/models/events"
import { AttendeeMailings, type IAttendeeMailingRecipient } from "@/models/admin/attendee-mailings"
import { parseEventIds, parseGroups, requireAdminSession } from "@/lib/attendee-mail-server"
import { ATTENDEE_MAIL_MAX, isTypedEmail } from "@/lib/email-list"
import { guestEmailKey } from "@/lib/guest-import"
import { mailFrom, blastSenderName } from "@/lib/send-grid"
import { eventUrl } from "@/lib/event-slug"
import { blastAttachmentRefusal, type BlastAttachment } from "@/lib/blast-attachments"
import { fetchBlastAttachments } from "@/lib/blast-attachments-server"
import { blastFallbackName, buildBlastHtml, personalizeBlastHtml } from "@/lib/blast-template"
import {
	BLAST_TEST_MAX_PER_WINDOW,
	BLAST_TEST_RATE_LIMIT_MESSAGE,
	BLAST_TEST_WINDOW_MS,
	normalizeTestAddress,
} from "@/lib/blast-test-send"
import { isRateLimited } from "@/lib/rate-limit"
import { stripHtml } from "@/utils/text"

sendgrid.setApiKey((process.env.SENDGRID_API_KEY as string)?.trim())

/** Concurrent SendGrid calls per batch — the `send-invites.ts` pattern, never all at once. */
const CHUNK_SIZE = 50

/**
 * POST /api/admin/attendee-mail/send — admin only.
 *
 * Emails a list of people about a NEW event: the same layout as an event blast (greeting, the
 * admin's message, a "View Event Details" button to the promoted event), sent as "Jetzy".
 *
 * The recipient list comes from the page — attendees of the picked events plus typed and imported
 * addresses, after the admin unticked whoever they chose. It is the admin's list, so it is not
 * re-derived here; it IS re-validated (every address, de-duplicated, capped).
 *
 * `testTo` sends ONE copy to that address and records nothing, exactly like a blast test.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
	await ensureDbConnected()
	const session = await requireAdminSession(req, res)
	if (!session) return

	const userId = (session.user as any)?._id?.toString()
	const { promotedEventId, subject, message, greetByName, attachments, recipients, sourceEventIds, groups, testTo } = req.body || {}

	// Trimmed at the ENDS only, as for blasts: inner blank lines are the admin's paragraphs.
	const mailSubject = typeof subject === "string" ? subject.trim() : ""
	const mailMessage = typeof message === "string" ? message.trim() : ""
	if (!mailSubject) return res.status(400).json({ error: "Add a subject." })
	// The rich-text editor's empty state is `<p><br></p>`, which is truthy.
	if (!stripHtml(mailMessage).trim()) return res.status(400).json({ error: "Write a message." })

	if (typeof promotedEventId !== "string" || !Types.ObjectId.isValid(promotedEventId)) {
		return res.status(400).json({ error: "Pick the event this email is about." })
	}
	const promoted = await Events.findOne({ _id: new Types.ObjectId(promotedEventId), isDeleted: false }).select("name slug").lean()
	if (!promoted) return res.status(404).json({ error: "That event no longer exists." })
	const promotedName = stripHtml((promoted as any).name || "") || "Jetzy event"
	const baseUrl = process.env.NEXT_PUBLIC_URL || ""
	const promotedLink = (promoted as any).slug ? eventUrl(baseUrl, (promoted as any).slug) : `${baseUrl}/${promotedEventId}`

	const attachmentList: BlastAttachment[] = Array.isArray(attachments) ? attachments : []
	const attachmentRefusal = blastAttachmentRefusal(attachmentList)
	if (attachmentRefusal) return res.status(400).json({ error: attachmentRefusal })

	const isTestSend = typeof testTo === "string" && testTo.trim().length > 0

	// ---- Who gets it (skipped for a test) ----
	type Row = { email: string; name: string; source?: string }
	const people: Row[] = []
	if (!isTestSend) {
		const list: any[] = Array.isArray(recipients) ? recipients : []
		const seen = new Set<string>()
		const invalid: string[] = []
		for (const r of list) {
			const email = String(r?.email ?? "").trim()
			if (!isTypedEmail(email)) {
				if (email) invalid.push(email)
				continue
			}
			const key = guestEmailKey(email)
			if (seen.has(key)) continue
			seen.add(key)
			people.push({
				email: key,
				name: String(r?.name ?? "").replace(/\s+/g, " ").trim().slice(0, 100),
				source: typeof r?.source === "string" ? r.source.slice(0, 20) : undefined,
			})
		}
		if (invalid.length > 0) {
			return res.status(400).json({ error: `Not a valid email address: ${invalid.slice(0, 5).join(", ")}` })
		}
		if (people.length === 0) return res.status(400).json({ error: "Nobody is selected to receive this email." })
		if (people.length > ATTENDEE_MAIL_MAX) {
			return res.status(400).json({ error: `At most ${ATTENDEE_MAIL_MAX} people per send — split the list into two sends.` })
		}
	}

	let testAddress = ""
	if (isTestSend) {
		const normalized = normalizeTestAddress(testTo)
		if (!normalized.email) return res.status(400).json({ error: normalized.error })
		testAddress = normalized.email
		// The same per-account allowance as a blast test: one budget for "send me a copy".
		if (isRateLimited(`blast-test:${userId}`, BLAST_TEST_MAX_PER_WINDOW, BLAST_TEST_WINDOW_MS)) {
			return res.status(429).json({ error: BLAST_TEST_RATE_LIMIT_MESSAGE })
		}
	}

	try {
		const fetched = await fetchBlastAttachments(attachmentList)
		if (fetched.skipped.length > 0) console.warn("Attendee mailing attachments skipped:", fetched.skipped)

		const sender = (process.env.SENDGRID_EMAIL_SENDER as string)?.trim()
		const html = buildBlastHtml({
			subject: mailSubject,
			message: mailMessage,
			eventName: promotedName,
			eventLink: promotedLink,
			footerContact: `Questions? Contact us at <a href="mailto:${sender}" style="color: #F79432; text-decoration: none;">${sender}</a>`,
			emailType: "custom",
			baseUrl,
			images: fetched.images,
			links: fetched.links,
			greetByName: greetByName !== false,
		})
		const sendOne = (to: string, name: string) =>
			sendgrid.send({
				to,
				from: mailFrom(undefined, blastSenderName()),
				subject: mailSubject,
				html: personalizeBlastHtml(html, { userName: name || blastFallbackName(to), userEmail: to }),
				...(fetched.attachments.length > 0 ? { attachments: fetched.attachments } : {}),
			})

		if (isTestSend) {
			await sendOne(testAddress, ((session.user as any)?.name || "").trim())
			return res.status(200).json({ message: `Test sent to ${testAddress}.`, sentTo: testAddress, test: true, skippedAttachments: fetched.skipped })
		}

		const rows: IAttendeeMailingRecipient[] = []
		for (let i = 0; i < people.length; i += CHUNK_SIZE) {
			const chunk = people.slice(i, i + CHUNK_SIZE)
			const results = await Promise.allSettled(chunk.map((p) => sendOne(p.email, p.name)))
			results.forEach((r, j) => {
				const p = chunk[j]
				const base = { email: p.email, ...(p.name ? { name: p.name } : {}), ...(p.source ? { source: p.source } : {}) }
				if (r.status === "fulfilled") {
					rows.push({ ...base, status: "sent" })
				} else {
					const err: any = r.reason
					rows.push({
						...base,
						status: "failed",
						reason: err?.response?.body?.errors?.[0]?.message || err?.message || "The email could not be sent.",
					})
				}
			})
		}

		const succeeded = rows.filter((r) => r.status === "sent").length
		const failed = rows.length - succeeded

		// Recorded even when nothing went out — a send where every address failed is the one the
		// admin most needs to be able to look back at.
		try {
			const validGroups = parseGroups(groups)
			const validSources = parseEventIds(sourceEventIds)
			await AttendeeMailings.create({
				subject: mailSubject,
				message: mailMessage,
				promotedEventId: new Types.ObjectId(promotedEventId),
				promotedEventName: promotedName,
				...(validSources.length > 0 ? { sourceEventIds: validSources } : {}),
				...(validGroups.length > 0 ? { groups: validGroups } : {}),
				recipients: rows,
				recipientCount: rows.length,
				succeededCount: succeeded,
				failedCount: failed,
				...(attachmentList.length > 0 ? { attachments: attachmentList } : {}),
				greetByName: greetByName !== false,
				...(userId && Types.ObjectId.isValid(userId) ? { sentBy: new Types.ObjectId(userId) } : {}),
				sentByEmail: (session.user as any)?.email,
				sentAt: new Date(),
			})
		} catch (persistErr) {
			console.error("Failed to record attendee mailing:", persistErr)
		}

		if (succeeded === 0) {
			const reason = rows[0]?.reason
			return res.status(500).json({ error: reason || "No emails were delivered." })
		}
		if (failed > 0) {
			return res.status(207).json({ message: `Sent to ${succeeded}. ${failed} could not be sent.`, sent: succeeded, failed })
		}
		return res.status(200).json({ message: `Sent to ${succeeded} ${succeeded === 1 ? "person" : "people"}.`, sent: succeeded })
	} catch (error: any) {
		console.error("Attendee mailing error:", error?.response?.body || error)
		return res.status(500).json({ error: error?.response?.body?.errors?.[0]?.message || "Failed to send." })
	}
}

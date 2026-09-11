/**
 * Jetzy Premium APPLICATION gate — questions, then a card-setup-only Stripe session, then admin
 * review — that runs instead of an instant trial subscription when a buyer types no invite code
 * on `/premium`, `/subscribe` or the "Buy Jetzy Premium" dialog.
 *
 * Toggled by `PremiumApplicationSettings.enabled` (default OFF — an admin turns it on from
 * `/console/admin/premium-settings` once the question list reads the way they want). While off,
 * the standalone purchase flow is byte-identical to before this feature existed.
 *
 * SERVER ONLY — reaches mongoose and Stripe.
 */

import dayjs from "dayjs"
import { ensureDbConnected } from "@/configs/database"
import { PremiumApplications } from "@/models/premium-applications"
import { PremiumApplicationSettings } from "@/models/premium-application-settings"
import type { ICustomQuestion } from "@/models/events/types"
import { getStripeClient, hasEverHadMembership } from "@/lib/premium"
import { DEFAULT_TRIAL_MONTHS } from "@/lib/invite-trial"

/** Seeded once, on first read — the admin can edit or delete any of these afterward. */
export const DEFAULT_APPLICATION_QUESTIONS: ICustomQuestion[] = [
	{ id: "linkedin", title: "LinkedIn Profile", type: "social_profile", platform: "linkedin", isRequired: false },
	{ id: "instagram", title: "Instagram Handle", type: "social_profile", platform: "instagram", isRequired: false },
	{ id: "website", title: "Personal or Company Website", type: "website", isRequired: false },
]

export type PremiumApplicationSettingsShape = {
	enabled: boolean
	questions: ICustomQuestion[]
}

/**
 * The one row, created with the seed questions the first time anything reads it. Every write
 * (the admin PUT) goes through the same `{key:"default"}` filter, so a missing unique index
 * (this connection runs `autoIndex: false`) costs a table scan on a one-row collection, never a
 * duplicate.
 */
export async function getApplicationSettings(): Promise<PremiumApplicationSettingsShape> {
	await ensureDbConnected()
	let doc = await PremiumApplicationSettings.findOne({ key: "default" })
	if (!doc) {
		doc = await PremiumApplicationSettings.create({ key: "default", enabled: false, questions: DEFAULT_APPLICATION_QUESTIONS })
	}
	return { enabled: !!doc.enabled, questions: (doc.questions || []) as ICustomQuestion[] }
}

/** Whether buying Premium standalone must go through the application gate rather than checkout directly. */
export const applicationRequired = (settings: { enabled: boolean }, hasCode: boolean): boolean => settings.enabled && !hasCode

/**
 * Every question marked `isRequired` needs a non-empty answer. Mirrors the client-side check in
 * `EventCheckoutModel.tsx`'s "Additional Questions" step — re-checked here because the client
 * validation is only a courtesy.
 */
export function missingRequiredAnswers(questions: ICustomQuestion[], answers: Record<string, any>): string[] {
	return questions
		.filter((q) => q.isRequired)
		.filter((q) => {
			const value = answers[q.id]
			if (Array.isArray(value)) return value.length === 0
			if (typeof value === "object" && value !== null) return Object.values(value).every((v) => !v)
			return value === undefined || value === null || String(value).trim() === ""
		})
		.map((q) => q.title)
}

/**
 * Idempotent fulfilment for the `mode: "setup"` Checkout Session that collects the card.
 *
 * Called from BOTH the fast-path confirm route (immediate UI feedback) and the Stripe webhook
 * (the authoritative, always-fires path) — same dual-call shape as `fulfillCheckoutSessionById`
 * for ticket bookings. Safe to call twice: once the application is out of `awaiting_card` this
 * is a no-op.
 */
export async function fulfillApplicationSetupSession(sessionId: string): Promise<void> {
	await ensureDbConnected()
	const stripe = getStripeClient()
	const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["setup_intent"] })

	const applicationId = (session.metadata as any)?.applicationId
	if (!applicationId || session.mode !== "setup") return

	const application = await PremiumApplications.findById(applicationId)
	if (!application || application.status !== "awaiting_card") return // already fulfilled, or gone

	const setupIntent = session.setup_intent as import("stripe").Stripe.SetupIntent | null
	if (!setupIntent || setupIntent.status !== "succeeded") return

	const paymentMethodId = typeof setupIntent.payment_method === "string" ? setupIntent.payment_method : setupIntent.payment_method?.id

	application.setupIntentId = setupIntent.id
	application.paymentMethodId = paymentMethodId
	application.status = "under_review"
	await application.save()

	try {
		const { sendPremiumApplicationReceived, sendPremiumApplicationAdminNotice } = await import("@/lib/send-grid")
		await sendPremiumApplicationReceived({ email: application.email, name: application.name })
		await sendPremiumApplicationAdminNotice({ kind: "submitted", email: application.email, name: application.name, interval: application.interval })
	} catch (emailError) {
		console.error("[premium-application] Fulfilled but could not send the review-started emails:", emailError)
	}
}

/**
 * First-timer trial months for an application, resolved at card-setup time (not before — no
 * Stripe customer exists yet at `start.ts`) and STORED, so a later change in account history
 * can't move what the review screen already disclosed. Same "resolve once, store, never
 * re-derive" rule `startMembershipSubscription` documents for a referral-granted trial.
 */
export async function resolveApplicationTrialMonths(stripeCustomerId: string): Promise<number> {
	return (await hasEverHadMembership(stripeCustomerId, "premium")) ? 0 : DEFAULT_TRIAL_MONTHS
}

export const applicationTrialEndsOn = (months: number, from: Date = new Date()): Date => dayjs(from).add(months, "month").toDate()

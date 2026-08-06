/**
 * Mirror Full Concierge membership state to selectmember.jetzy.com.
 *
 * The money for a Concierge membership is taken in OUR Stripe account (it rides along with a
 * ticket), but the member's benefits live on SelectMember's site. So after every state change
 * we tell them what happened. They own the display; we own the billing.
 *
 * SERVER ONLY.
 *
 * ---- Best-effort, always ----
 *
 * Every function here swallows its failures. A SelectMember outage must never fail a checkout
 * or an approval: the card has already been charged by the time we call, so throwing would
 * leave money taken and a booking rolled back. The Stripe subscription is the record of truth;
 * this is a projection of it that can be re-driven from a webhook replay.
 *
 * ---- Called from the WEBHOOK, not the purchase ----
 *
 * Activation, renewal, cancellation and payment failure all arrive as `customer.subscription.*`
 * / `invoice.*` events. Syncing there covers paths a purchase-time call would miss entirely —
 * most importantly a cancel made through the Stripe billing portal, which never passes back
 * through our checkout code.
 *
 * ---- Auth ----
 *
 * Their endpoints are deliberately unauthenticated (their decision, flagged by their backend
 * dev: anyone who knows an email can flip that member's status). `SELECT_MEMBER_API_KEY` is
 * sent as `x-api-key` when set, so the shared-secret upgrade needs no code change here.
 */

import { MEMBERSHIPS } from "@/lib/memberships"

const SELECT_MEMBER_BASE = (process.env.NEXT_PUBLIC_SELECT_MEMBER_URL || "https://selectmember.jetzy.com").replace(/\/$/, "")

const SUBSCRIPTION_PATH = "/api/v1/subscription/select"

/** How we identify ourselves to them, so their logs can tell our writes from their own. */
const SOURCE = "external_portal"

/** Their site is not in the critical path — never let it hold a checkout open. */
const TIMEOUT_MS = 8000

export type SelectMemberStatus = "active" | "cancelled" | "expired" | "past_due"

type SyncArgs = {
	email: string
	status: SelectMemberStatus
	/** The Stripe subscription id. Their side stores it so the two systems can be reconciled. */
	externalSubscriptionId?: string
	startedAt?: Date
	expiresAt?: Date
}

const headers = (): Record<string, string> => {
	const apiKey = process.env.SELECT_MEMBER_API_KEY
	return {
		"Content-Type": "application/json",
		Accept: "application/json",
		...(apiKey ? { "x-api-key": apiKey } : {}),
	}
}

const request = async (path: string, init: RequestInit): Promise<{ ok: boolean; status: number; body: any }> => {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
	try {
		const response = await fetch(`${SELECT_MEMBER_BASE}${path}`, {
			...init,
			headers: headers(),
			signal: controller.signal,
		})
		const body = await response.json().catch(() => ({}))
		return { ok: response.ok, status: response.status, body }
	} finally {
		clearTimeout(timer)
	}
}

/**
 * Push a membership state change to SelectMember.
 *
 * Returns true on success and false on any failure, so callers can log the gap without
 * having to reason about which errors are retryable — none of them are, here.
 */
export async function syncSelectMembership({ email, status, externalSubscriptionId, startedAt, expiresAt }: SyncArgs): Promise<boolean> {
	const trimmed = typeof email === "string" ? email.trim() : ""
	if (!trimmed) {
		console.error("[select-member] syncSelectMembership called with no email")
		return false
	}

	const payload: Record<string, unknown> = {
		email: trimmed,
		source: SOURCE,
		status,
	}

	// Only an activation carries plan and dates. A cancellation deliberately sends the
	// minimum their contract asks for — re-asserting a plan while cancelling it invites
	// their side to resurrect a row we're trying to close.
	if (status === "active") {
		payload.plan = MEMBERSHIPS.concierge.selectMemberPlan
		if (externalSubscriptionId) payload.externalSubscriptionId = externalSubscriptionId
		if (startedAt) payload.startedAt = startedAt.toISOString()
		if (expiresAt) payload.expiresAt = expiresAt.toISOString()
	}

	try {
		const { ok, status: httpStatus, body } = await request(SUBSCRIPTION_PATH, {
			method: "PATCH",
			body: JSON.stringify(payload),
		})
		if (!ok) {
			console.error("[select-member] PATCH failed:", httpStatus, body)
			return false
		}
		console.log("[select-member] Synced:", { email: trimmed, status, externalSubscriptionId })
		return true
	} catch (error: any) {
		// Includes the AbortError from the timeout above.
		console.error("[select-member] PATCH error:", error?.message || error)
		return false
	}
}

export type SelectMembershipStatus = {
	status?: string
	plan?: string
	expiresAt?: string
	[key: string]: unknown
}

/**
 * Read a member's state from SelectMember.
 *
 * Diagnostic only — our own `conciergeSubscription` record and Stripe are the authorities for
 * anything that decides whether money moves. Returns null when the lookup fails so a caller
 * can't mistake "their site is down" for "not a member".
 */
export async function getSelectMembershipStatus(email: string): Promise<SelectMembershipStatus | null> {
	const trimmed = typeof email === "string" ? email.trim() : ""
	if (!trimmed) return null

	try {
		const { ok, status, body } = await request(`${SUBSCRIPTION_PATH}/status?email=${encodeURIComponent(trimmed)}`, {
			method: "GET",
		})
		if (!ok) {
			console.error("[select-member] GET status failed:", status, body)
			return null
		}
		return (body?.data || body) as SelectMembershipStatus
	} catch (error: any) {
		console.error("[select-member] GET status error:", error?.message || error)
		return null
	}
}

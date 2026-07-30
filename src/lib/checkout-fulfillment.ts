import Stripe from "stripe"
import { ensureDbConnected } from "@/configs/database"
import { getStripeClient } from "@/lib/stripe-client"
import { resolveEventLocation } from "@/lib/event-helpers"
import { generateQRCodeForBooking } from "@/lib/qr-generator"
import { sendTicketConfirmation, sendApprovalPending, sendAdminApprovalNotice } from "@/lib/send-grid"
import { Events } from "@/models/events"
import { Bookings } from "@/models/events/bookings"
import { BookingStatus, IBookings, IEvent } from "@/models/events/types"

/**
 * Turns a completed Stripe Checkout Session into a Booking.
 *
 * This lives in its own module because it is called from BOTH `/api/checkout/confirm`
 * (the success redirect the buyer sees) and the Stripe webhook. The webhook is the one
 * that actually guarantees correctness: with `capture_method: "manual"` a buyer who
 * closes the tab instead of returning would otherwise leave a live hold on their card
 * with no booking row anywhere in the system — invisible to the host, impossible to
 * approve, and silently released a week later after the customer has already seen a
 * pending charge. The redirect path stays because it is synchronous and the buyer is
 * watching the page.
 *
 * Every path through here is idempotent: `bookingRef` is unique and deterministic, so
 * whichever caller arrives second is a no-op. That also retro-fixes the pre-existing bug
 * where reloading /success re-created the booking and re-incremented referral usage.
 */

/** Stripe holds card authorizations for roughly this long. Some issuers are shorter. */
export const AUTH_HOLD_DAYS = 7

export type FulfillResult = {
	created: boolean
	booking: IBookings | null
	event: IEvent | null
	requiresApproval: boolean
	session: Stripe.Checkout.Session | null
	reason?: "already-exists" | "not-payable" | "no-session"
}

type SessionMetadata = {
	eventId?: string
	bookingRef?: string
	firstName?: string
	lastName?: string
	email?: string
	phone?: string
	tickets?: string
	referralCode?: string
	discountPercentage?: string
	acceptedTerms?: string
	acceptedTermsAt?: string
	requiresApproval?: string
	[key: string]: string | undefined
}

type TicketMeta = {
	id: string
	name: string
	price: number
	quantity: number
	desc?: string
	priceId?: string
}

/** Rebuild the custom-question answers that were flattened into `ans_*` metadata keys. */
const parseCustomAnswers = (metadata: SessionMetadata) => {
	const answers: Array<{ questionId: string; answer: any }> = []
	Object.keys(metadata).forEach((key) => {
		if (!key.startsWith("ans_")) return
		const val = metadata[key] as string
		try {
			answers.push({ questionId: key.replace("ans_", ""), answer: JSON.parse(val) })
		} catch {
			answers.push({ questionId: key.replace("ans_", ""), answer: val })
		}
	})
	return answers
}

const incrementReferralUsage = async (code?: string) => {
	if (!code) return
	try {
		const { ReferralCodes } = await import("@/models/events/referral-codes")
		const referralCode = await ReferralCodes.findOne({ code: code.trim().toUpperCase(), isDeleted: false })
		if (!referralCode) return
		referralCode.usageCount += 1
		await referralCode.save()
		console.log("[checkout-fulfillment] Referral code usage incremented:", code)
	} catch (error) {
		console.error("[checkout-fulfillment] Error incrementing referral usage:", error)
	}
}

export async function fulfillCheckoutSessionById(sessionId: string): Promise<FulfillResult> {
	await ensureDbConnected()
	const stripe = getStripeClient()

	const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] })
	if (!session) return { created: false, booking: null, event: null, requiresApproval: false, session: null, reason: "no-session" }

	const metadata = (session.metadata || {}) as SessionMetadata
	const bookingRef = metadata.bookingRef || `JZ-${session.client_reference_id}`
	const requiresApproval = metadata.requiresApproval === "true"

	// --- Idempotency: whichever of {webhook, /success} lost the race stops here. ---
	const existing = await Bookings.findOne({ bookingRef })
	if (existing) {
		const event = await Events.findById(existing.eventId)
		return { created: false, booking: existing, event, requiresApproval, session, reason: "already-exists" }
	}

	const pi = (typeof session.payment_intent === "string" ? null : session.payment_intent) as Stripe.PaymentIntent | null
	const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : pi?.id

	const isPaidNow = session.payment_status === "paid"
	// Manual capture leaves the session "unpaid" while the PaymentIntent sits in
	// `requires_capture`. That is a successfully authorized approval order, not a failure.
	const isAuthorized = !isPaidNow && requiresApproval && pi?.status === "requires_capture"

	if (!isPaidNow && !isAuthorized) {
		return { created: false, booking: null, event: null, requiresApproval, session, reason: "not-payable" }
	}

	let tickets: TicketMeta[] = []
	try {
		tickets = JSON.parse(metadata.tickets || "[]")
	} catch (error) {
		console.error("[checkout-fulfillment] Failed to parse ticket metadata:", error)
	}

	const customAnswers = parseCustomAnswers(metadata)
	const subtotal = tickets.reduce((acc, t) => acc + (t.price || 0) * (t.quantity || 0), 0)
	const total = session.amount_total ? session.amount_total / 100 : 0

	let discountAmount = 0
	if (metadata.referralCode && metadata.discountPercentage) {
		const discountPercent = parseFloat(metadata.discountPercentage)
		discountAmount = Math.round((subtotal * (discountPercent / 100) + Number.EPSILON) * 100) / 100
	}

	const now = new Date()
	let booking: IBookings | null = null
	try {
		booking = await Bookings.create({
			status: isPaidNow ? BookingStatus.CONFIRMED : BookingStatus.PENDING,
			eventId: metadata.eventId,
			bookingRef,
			customerName: `${metadata.firstName || ""} ${metadata.lastName || ""}`.trim(),
			customerEmail: metadata.email,
			customerPhone: metadata.phone,
			tickets: tickets.map((t) => ({ ticketId: t.id, quantity: t.quantity })),
			subTotal: subtotal,
			total,
			referralCode: metadata.referralCode || undefined,
			discountAmount,
			customAnswers,
			acceptedTerms: metadata.acceptedTerms === "true",
			acceptedTermsAt: metadata.acceptedTermsAt ? new Date(metadata.acceptedTermsAt) : undefined,
			payment: {
				provider: "stripe",
				checkoutSessionId: session.id,
				paymentIntentId,
				captureMethod: isAuthorized ? "manual" : "automatic",
				status: isAuthorized ? "authorized" : "captured",
				amount: total,
				currency: session.currency || "usd",
				...(isAuthorized
					? { authorizedAt: now, authExpiresAt: new Date(now.getTime() + AUTH_HOLD_DAYS * 24 * 60 * 60 * 1000) }
					: { capturedAt: now }),
			},
		})
	} catch (error: any) {
		// Lost the create race with the other caller — re-read and treat as already fulfilled.
		if (error?.code === 11000) {
			const raced = await Bookings.findOne({ bookingRef })
			const event = await Events.findById(metadata.eventId)
			return { created: false, booking: raced, event, requiresApproval, session, reason: "already-exists" }
		}
		throw error
	}

	const event = await Events.findById(metadata.eventId)
	if (!event) {
		console.error("[checkout-fulfillment] Booking created but event missing:", metadata.eventId)
		return { created: true, booking, event: null, requiresApproval, session }
	}

	await resolveEventLocation(event)

	const ticketSummary = tickets.map((t) => ({ name: t.name, quantity: t.quantity }))

	// ---- Approval branch: capacity is NOT consumed and no ticket is issued until the
	// host approves. Mirrors the free-events flow exactly. ----
	if (isAuthorized) {
		try {
			await sendApprovalPending({
				event,
				firstName: metadata.firstName || "",
				lastName: metadata.lastName || "",
				email: metadata.email || "",
				tickets: ticketSummary,
				eventId: String(metadata.eventId),
				payment: { amount: total, expiresAt: booking.payment?.authExpiresAt },
			})
		} catch (emailError) {
			console.error("[checkout-fulfillment] Failed to send approval-pending email:", emailError)
		}
		try {
			await sendAdminApprovalNotice({
				event,
				firstName: metadata.firstName || "",
				lastName: metadata.lastName || "",
				email: metadata.email || "",
				tickets: ticketSummary,
				eventId: String(metadata.eventId),
				kind: "request",
				amountOnHold: total,
				holdExpiresAt: booking.payment?.authExpiresAt,
			})
		} catch (adminError) {
			console.error("[checkout-fulfillment] Failed to send admin approval notice:", adminError)
		}
		// Referral usage is intentionally NOT incremented here — it is deferred to approval
		// so a declined request doesn't burn a limited-use code.
		return { created: true, booking, event, requiresApproval: true, session }
	}

	// ---- Immediate-payment branch: unchanged from the original confirm.ts behaviour. ----
	await booking.updateEventTracker()
	await incrementReferralUsage(metadata.referralCode)

	try {
		let qrCodeImageUrl: string | undefined
		try {
			qrCodeImageUrl = await generateQRCodeForBooking(bookingRef)
		} catch (qrError) {
			console.error("[checkout-fulfillment] Failed to generate QR code:", qrError)
		}
		await sendTicketConfirmation({
			event,
			firstName: metadata.firstName || "",
			lastName: metadata.lastName || "",
			email: metadata.email || "",
			phone: metadata.phone || "",
			tickets: tickets.map((t) => ({ name: t.name, price: t.price, quantity: t.quantity, desc: t.desc as string })),
			orderNumber: bookingRef,
			referralCode: metadata.referralCode,
			discountAmount: discountAmount > 0 ? discountAmount : undefined,
			discountPercentage: metadata.discountPercentage ? parseFloat(metadata.discountPercentage) : undefined,
			qrCodeImageUrl,
		})
	} catch (emailError) {
		console.error("[checkout-fulfillment] Failed to send ticket confirmation email:", emailError)
	}

	return { created: true, booking, event, requiresApproval: false, session }
}

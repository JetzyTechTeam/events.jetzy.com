import Stripe from "stripe"
import { ensureDbConnected } from "@/configs/database"
import { getStripeClient } from "@/lib/premium"
import { buildTicketPricing, type RecurringCharge } from "@/lib/ticket-pricing"
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
	referralDiscountPercentage?: string
	premiumMemberDiscount?: string
	premiumMemberDiscountPercentage?: string
	/** Ticket-only figures, stamped at session creation — see the totals block below. */
	ticketSubtotal?: string
	ticketTotal?: string
	/** "ticket+premium" on a bundled order; the subscriber the membership attaches to. */
	purpose?: string
	userId?: string
	/** Bundled AND held for approval — the subscription is created in `approve.ts`. */
	premiumPendingApproval?: string
	premiumAmount?: string
	premiumInterval?: string
	premiumPriceId?: string
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

export const incrementReferralUsage = async (code?: string) => {
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

	// `invoice.payment_intent` matters for BUNDLED tickets (`IEventTicket.includesPremium`),
	// which are `mode: "subscription"` sessions carrying the ticket as a one-time line item.
	// There `session.payment_intent` is null and the real PaymentIntent hangs off the first
	// invoice. Without this expansion `payment.paymentIntentId` is written `undefined`, which
	// orphans every capture/cancel path that looks a booking up by it.
	const session = await stripe.checkout.sessions.retrieve(sessionId, {
		expand: ["payment_intent", "invoice.payment_intent"],
	})
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

	// A bundled order pays through the subscription's first invoice, so fall back to that
	// invoice's PaymentIntent when the session has none of its own.
	const invoice = (typeof session.invoice === "string" ? null : session.invoice) as Stripe.Invoice | null
	const invoicePi = (invoice && typeof invoice.payment_intent !== "string" ? invoice.payment_intent : null) as Stripe.PaymentIntent | null
	const pi = ((typeof session.payment_intent === "string" ? null : session.payment_intent) as Stripe.PaymentIntent | null) || invoicePi
	const paymentIntentId =
		(typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id) ||
		(invoice && typeof invoice.payment_intent === "string" ? invoice.payment_intent : invoicePi?.id)

	const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id

	const isPaidNow = session.payment_status === "paid"
	// Manual capture leaves the session "unpaid" while the PaymentIntent sits in
	// `requires_capture`. That is a successfully authorized approval order, not a failure.
	// (Never true on a bundled order — subscription mode has no manual capture, which is why
	// a bundled ticket may not require approval.)
	const isAuthorized = !isPaidNow && requiresApproval && pi?.status === "requires_capture"
	// A subscription session settles as `no_payment_required` when the first invoice needed no
	// charge — a trial, or a 100%-off coupon. The ticket was still bought, so treating that as
	// "not payable" would silently drop the booking.
	const isSubscriptionSettled =
		!isPaidNow && !!subscriptionId && (session.status === "complete" || invoice?.status === "paid" || session.payment_status === "no_payment_required")

	if (!isPaidNow && !isAuthorized && !isSubscriptionSettled) {
		return { created: false, booking: null, event: null, requiresApproval, session, reason: "not-payable" }
	}

	let tickets: TicketMeta[] = []
	try {
		tickets = JSON.parse(metadata.tickets || "[]")
	} catch (error) {
		console.error("[checkout-fulfillment] Failed to parse ticket metadata:", error)
	}

	const customAnswers = parseCustomAnswers(metadata)

	// TICKET-ONLY figures.
	//
	// `session.amount_total` is the whole first invoice, so on a bundled order it includes the
	// first month of Jetzy Premium. A booking must record what the TICKET cost — otherwise the
	// receipt, My Bookings and every downstream total are inflated by the membership fee.
	// `checkout/index.ts` therefore stamps the ticket figures into metadata at session
	// creation; the `amount_total` fallback is only for sessions created before that.
	const metaSubtotal = metadata.ticketSubtotal !== undefined ? parseFloat(metadata.ticketSubtotal) : NaN
	const metaTotal = metadata.ticketTotal !== undefined ? parseFloat(metadata.ticketTotal) : NaN

	const subtotal = Number.isFinite(metaSubtotal)
		? metaSubtotal
		: tickets.reduce((acc, t) => acc + (t.price || 0) * (t.quantity || 0), 0)
	const total = Number.isFinite(metaTotal)
		? metaTotal
		: (session.amount_total ? session.amount_total / 100 : 0)

	// The Premium member discount was retired — a referral code is the only discount left.
	// `premiumMemberDiscount*` is still read so bookings created by an in-flight session from
	// before the change still record what they were actually charged.
	const premiumMemberDiscountApplied = metadata.premiumMemberDiscount === "true"
	const referralPercent = metadata.referralCode && metadata.referralDiscountPercentage ? parseFloat(metadata.referralDiscountPercentage) : 0
	const premiumPercent = premiumMemberDiscountApplied && metadata.premiumMemberDiscountPercentage ? parseFloat(metadata.premiumMemberDiscountPercentage) : 0
	const combinedDiscountFraction = 1 - (1 - premiumPercent / 100) * (1 - referralPercent / 100)
	const effectiveDiscountPercentage = Math.round(combinedDiscountFraction * 10000) / 100
	const discountAmount = combinedDiscountFraction > 0
		? Math.round((subtotal * combinedDiscountFraction + Number.EPSILON) * 100) / 100
		: 0

	// The membership this purchase started, if any. Read back from the SUBSCRIPTION rather
	// than from our own config so the receipt quotes the amount and interval Stripe will
	// actually bill — a plan price changed between checkout and fulfilment would otherwise
	// make the email wrong. Never fatal: a missing receipt line beats a lost booking.
	let recurringCharge: RecurringCharge | undefined
	if (subscriptionId) {
		try {
			const subscription = await stripe.subscriptions.retrieve(subscriptionId)
			const item = subscription.items?.data?.[0]
			const price = item?.price
			if (price?.unit_amount != null) {
				recurringCharge = {
					label: "Jetzy Premium membership",
					amount: price.unit_amount / 100,
					interval: price.recurring?.interval || "month",
					// The first period was paid on this invoice, so the next real charge is the
					// end of the current period. Naming it stops the receipt implying they're
					// about to be billed again straight away.
					firstRenewalAt: subscription.current_period_end
						? new Date(subscription.current_period_end * 1000)
						: undefined,
				}
			}
		} catch (subscriptionError) {
			console.error("[checkout-fulfillment] Couldn't read subscription for receipt:", subscriptionError)
		}
	}

	// A bundled ticket that ALSO requires approval is held in payment mode, with the first
	// membership period as a one-time line item, and the subscription is created only when the
	// host approves. Everything approve.ts needs must be stored on the booking — it works from
	// the booking document and never sees this session or its metadata.
	const premiumPendingApproval = metadata.premiumPendingApproval === "true"
	const heldPremiumAmount = premiumPendingApproval ? parseFloat(metadata.premiumAmount || "") || 0 : 0

	// What the CARD is held for or charged. Distinct from `total`, which is the ticket alone —
	// writing `total` here would tell the host "$80 on hold" when $100 is actually held.
	const chargedAmount = Math.round((total + heldPremiumAmount + Number.EPSILON) * 100) / 100

	const now = new Date()
	let booking: IBookings | null = null
	try {
		booking = await Bookings.create({
			status: isPaidNow ? BookingStatus.CONFIRMED : BookingStatus.PENDING,
			eventId: metadata.eventId,
			bookingRef,
			// Present only when the buyer was logged in at checkout. Bookings made before this
			// was carried through the metadata have none and resolve by email instead.
			...(metadata.bookerUserId ? { bookerUserId: metadata.bookerUserId } : {}),
			customerName: `${metadata.firstName || ""} ${metadata.lastName || ""}`.trim(),
			customerEmail: metadata.email,
			customerPhone: metadata.phone,
			tickets: tickets.map((t) => ({ ticketId: t.id, quantity: t.quantity })),
			subTotal: subtotal,
			total,
			referralCode: metadata.referralCode || undefined,
			discountAmount,
			premiumMemberDiscountApplied,
			// Persist the individual rates so a later email can itemise the two discounts.
			...(referralPercent > 0 ? { referralDiscountPercentage: referralPercent } : {}),
			...(premiumPercent > 0 ? { premiumMemberDiscountPercentage: premiumPercent } : {}),
			customAnswers,
			acceptedTerms: metadata.acceptedTerms === "true",
			acceptedTermsAt: metadata.acceptedTermsAt ? new Date(metadata.acceptedTermsAt) : undefined,
			payment: {
				provider: "stripe",
				checkoutSessionId: session.id,
				paymentIntentId,
				// Present only on a bundled order, so a support question about a recurring
				// charge can be traced from the booking back to the subscription that started it.
				...(subscriptionId ? { subscriptionId } : {}),
				// Held for approval, not yet started. `approve.ts` reads these to create the
				// real subscription; the price id is stored rather than re-resolved so a plan
				// price change while the request waits can't move the buyer onto a new rate.
				...(premiumPendingApproval
					? {
						premiumStatus: "pending" as const,
						premiumAmount: heldPremiumAmount,
						premiumPriceId: metadata.premiumPriceId,
						premiumInterval: metadata.premiumInterval || "month",
					}
					: {}),
				captureMethod: isAuthorized ? "manual" : "automatic",
				status: isAuthorized ? "authorized" : "captured",
				amount: chargedAmount,
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
				// The HELD amount, not the ticket total — on a bundled request the hold also
				// covers the first membership period, and quoting less would understate what
				// the guest sees on their statement.
				payment: {
					amount: chargedAmount,
					expiresAt: booking.payment?.authExpiresAt,
					...(heldPremiumAmount > 0
						? { premium: { amount: heldPremiumAmount, interval: metadata.premiumInterval || "month" } }
						: {}),
				},
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
			discountPercentage: effectiveDiscountPercentage > 0 ? effectiveDiscountPercentage : undefined,
			// Itemised, with the Total being what the TICKET cost rather than a recomputed
			// figure. A bundled order also carries the membership as a recurring line, so the
			// receipt states the renewal amount and interval — required for a subscription
			// the buyer acquired as part of a ticket purchase.
			pricing: buildTicketPricing({
				subtotal,
				referralCode: metadata.referralCode,
				referralPercentage: referralPercent,
				premiumPercentage: premiumPercent,
				total,
				...(recurringCharge ? { recurring: recurringCharge } : {}),
			}),
			qrCodeImageUrl,
		})
	} catch (emailError) {
		console.error("[checkout-fulfillment] Failed to send ticket confirmation email:", emailError)
	}

	return { created: true, booking, event, requiresApproval: false, session }
}

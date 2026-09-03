import Stripe from "stripe"
import { ensureDbConnected } from "@/configs/database"
import { getStripeClient } from "@/lib/premium"
import { MEMBERSHIPS, isMembershipKey, type MembershipKey } from "@/lib/memberships"
import { startMembershipSubscription } from "@/lib/membership-subscriptions"
import { buildTicketPricing, type RecurringCharge } from "@/lib/ticket-pricing"
import { AUTH_HOLD_DAYS } from "@/lib/ticket-approval"
import { resolveEventLocation } from "@/lib/event-helpers"
import { generateQRCodeForBooking } from "@/lib/qr-generator"
import { sendTicketConfirmation, sendApprovalPending, sendAdminApprovalNotice } from "@/lib/send-grid"
import { Events } from "@/models/events"
import { Bookings } from "@/models/events/bookings"
import { BookingStatus, IBookings, IEvent } from "@/models/events/types"
import { addEventMember } from "@/utils/eventMembership"

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

// Re-exported from `ticket-approval.ts`, which is isomorphic — the buyer-facing copy quotes
// this number and can't import it from here without pulling the models into the browser.
export { AUTH_HOLD_DAYS } from "@/lib/ticket-approval"

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
	/** "ticket+membership" on a bundled order; the account the memberships attach to. */
	purpose?: string
	membershipUserId?: string
	bookerUserId?: string
	/** The Users account behind the checkout email — set whether or not the buyer was logged in. */
	checkoutUserId?: string
	/** JSON `[{ key, amount, currency, priceId, interval }]` — what was charged for. */
	memberships?: string
	/** @deprecated Pre-Concierge single-product metadata; still read for in-flight sessions. */
	userId?: string
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

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

type MembershipLine = {
	key: MembershipKey
	amount: number
	currency?: string
	priceId: string
	interval: string
	/** Free months from a referral code. Present means nothing was charged for this line. */
	trialMonths?: number
	/** What it renews at after those months — `amount` is 0 while they run. */
	renewalAmount?: number
}

/**
 * What memberships did this session charge for?
 *
 * Reads the JSON `memberships` metadata written by `checkout/index.ts`, falling back to the
 * flat `premium*` keys used before Full Concierge existed. That fallback is not decoration:
 * sessions created minutes before a deploy are fulfilled by the new code, and a held one can
 * sit pending for days.
 *
 * Rows without a usable key or price id are dropped rather than guessed at — a bad row would
 * otherwise become a subscription for the wrong product.
 */
const parseMembershipLines = (metadata: SessionMetadata): MembershipLine[] => {
	if (metadata.memberships) {
		try {
			const parsed = JSON.parse(metadata.memberships)
			if (Array.isArray(parsed)) {
				return parsed
					.filter((row: any) => isMembershipKey(row?.key) && row?.priceId)
					.map((row: any) => ({
						key: row.key as MembershipKey,
						amount: Number(row.amount) || 0,
						currency: row.currency,
						priceId: String(row.priceId),
						interval: String(row.interval || "month"),
						...(Number(row.trialMonths) > 0
							? { trialMonths: Number(row.trialMonths), renewalAmount: Number(row.renewalAmount) || 0 }
							: {}),
					}))
			}
		} catch (error) {
			console.error("[checkout-fulfillment] Couldn't parse membership metadata:", error)
		}
	}

	if (metadata.premiumPendingApproval === "true" && metadata.premiumPriceId) {
		return [
			{
				key: "premium",
				amount: parseFloat(metadata.premiumAmount || "") || 0,
				priceId: metadata.premiumPriceId,
				interval: metadata.premiumInterval || "month",
			},
		]
	}

	return []
}

/**
 * Count one redemption against the code THIS EVENT owns.
 *
 * `eventId` is not optional in spirit: codes are unique per event now, so the same string can
 * exist on several at once and a lookup by string alone would credit whichever row Mongo
 * returned first — burning another host's `maxUses` and misreporting their campaign. It stays
 * optional in the signature only so a legacy caller degrades to the old behaviour instead of
 * silently counting nothing.
 */
export const incrementReferralUsage = async (code?: string, eventId?: string) => {
	if (!code) return
	try {
		const { ReferralCodes } = await import("@/models/events/referral-codes")
		const { Types } = await import("mongoose")
		const referralCode = await ReferralCodes.findOne({
			code: code.trim().toUpperCase(),
			isDeleted: false,
			...(eventId && Types.ObjectId.isValid(eventId) ? { eventId: new Types.ObjectId(eventId) } : {}),
		})
		if (!referralCode) return
		referralCode.usageCount += 1
		await referralCode.save()
		console.log("[checkout-fulfillment] Referral code usage incremented:", code)
	} catch (error) {
		console.error("[checkout-fulfillment] Error incrementing referral usage:", error)
	}
}

/**
 * When the card hold actually lapses.
 *
 * `AUTH_HOLD_DAYS` is an assumption — 7 days is the common default, but the real window is
 * set per payment by the card network, and Stripe publishes it as `capture_before` on the
 * charge. Their docs explicitly say to rely on that field "because these rules can change
 * without prior notice". The estimate was optimistic in both directions: some issuers
 * release sooner, and an extended authorization would run far longer.
 *
 * This is what the host sees counted down in Approvals and what the guest is told in the
 * pending email, so a wrong value here means promising a deadline that isn't real.
 *
 * Falls back to the estimate when Stripe doesn't supply one — the field is absent on
 * non-card payments and on anything not using manual capture.
 */
const resolveAuthExpiry = (pi: Stripe.PaymentIntent | null, from: Date): Date => {
	const charge = pi && typeof pi.latest_charge !== "string" ? (pi.latest_charge as Stripe.Charge | null) : null
	const captureBefore = charge?.payment_method_details?.card?.capture_before
	// Stripe timestamps are Unix seconds.
	if (captureBefore) return new Date(captureBefore * 1000)
	return new Date(from.getTime() + AUTH_HOLD_DAYS * 24 * 60 * 60 * 1000)
}

export async function fulfillCheckoutSessionById(sessionId: string): Promise<FulfillResult> {
	await ensureDbConnected()
	const stripe = getStripeClient()

	// `invoice.payment_intent` matters for BUNDLED tickets (`IEventTicket.includesPremium`),
	// which are `mode: "subscription"` sessions carrying the ticket as a one-time line item.
	// There `session.payment_intent` is null and the real PaymentIntent hangs off the first
	// invoice. Without this expansion `payment.paymentIntentId` is written `undefined`, which
	// orphans every capture/cancel path that looks a booking up by it.
	//
	// `latest_charge` is expanded so the hold deadline can be read from the charge rather than
	// assumed — see `resolveAuthExpiry`.
	//
	// `setup_intent` matters for the third session shape: a FREE ticket whose membership is also
	// free for a while. Nothing is charged, so there is no PaymentIntent at all — the card the
	// subscriptions will bill at the end of the free months hangs off the SetupIntent instead,
	// and without it those subscriptions would be created with no payment method and cancelled
	// by Stripe when the trial ended.
	const session = await stripe.checkout.sessions.retrieve(sessionId, {
		expand: [
			"payment_intent",
			"payment_intent.latest_charge",
			"invoice.payment_intent",
			"invoice.payment_intent.latest_charge",
			"setup_intent",
			// So a subscription Stripe created for us (the trial session above) can be linked to
			// the booking and its `trial_end` read for the receipt, rather than re-derived.
			"subscription",
		],
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
	// When Stripe created the subscription, its `trial_end` is the authority on when the buyer is
	// first billed — the same date the checkout page quoted them.
	const expandedSubscription = (typeof session.subscription === "string" ? null : session.subscription) as Stripe.Subscription | null
	const trialEndsFromSession = expandedSubscription?.trial_end ? new Date(expandedSubscription.trial_end * 1000) : undefined

	// The card, from whichever intent this session actually had. A paid or held order carries a
	// PaymentIntent; a free ticket giving away free months carries only a SetupIntent, and that
	// is the whole reason it was sent to Stripe at all.
	const setupIntent = (typeof session.setup_intent === "string" ? null : session.setup_intent) as Stripe.SetupIntent | null
	const savedPaymentMethodId =
		(typeof pi?.payment_method === "string" ? pi?.payment_method : pi?.payment_method?.id) ||
		(typeof setupIntent?.payment_method === "string" ? setupIntent?.payment_method : setupIntent?.payment_method?.id)

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
	// The same thing without a subscription: a completed session that Stripe decided owed
	// nothing. `api/checkout` refuses to open one of these (it routes the order to the free
	// path instead), but a session already in flight when that landed — or any future order
	// discounted to exactly $0 — would otherwise complete for the buyer and be dropped here
	// with no booking, no email and no log line, because the webhook discards this reason.
	// A completed session is the buyer having finished checkout; nothing owed is a verdict
	// Stripe reached, not a payment that failed.
	const isSettledWithoutCharge =
		!isPaidNow && !isSubscriptionSettled && session.status === "complete" && session.payment_status === "no_payment_required"

	// A setup-mode session takes no money by design — it exists to collect the card that the
	// gifted membership will be billed on once its free months run out. `payment_status` is
	// `no_payment_required` there too, so `isSettledWithoutCharge` already covers it; this
	// name exists so the branches below can tell "nothing was owed" from "nothing was ever
	// going to be charged", which is the difference between a confirmed booking and one that
	// still needs the host.
	const isSetupSession = session.mode === "setup"

	if (!isPaidNow && !isAuthorized && !isSubscriptionSettled && !isSettledWithoutCharge) {
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

	// ---- Memberships sold with this ticket ----
	//
	// A bundled order is always `mode: "payment"`: the first period of each membership rides
	// along as a one-time line item and the SUBSCRIPTIONS ARE CREATED AFTERWARDS — here for an
	// immediate purchase, in `approve.ts` for a held one. So everything needed to create them
	// has to be carried on the session and then written onto the booking, because approve.ts
	// works from the booking document and never sees this session.
	const membershipLines = parseMembershipLines(metadata)

	// What the memberships add to today's charge. Distinct from `total`, which is the ticket
	// alone — writing `total` into `payment.amount` would tell the host "$80 on hold" when
	// $100 is actually held.
	const membershipTotal = round2(membershipLines.reduce((sum, line) => sum + line.amount, 0))
	const chargedAmount = round2(total + membershipTotal)

	// A legacy in-flight session: created as `mode: "subscription"` before the bundled flow
	// moved to payment mode, so Stripe already made the subscription. Read it back for the
	// receipt rather than our own config, so the email quotes what Stripe will actually bill.
	// Never fatal: a missing receipt line beats a lost booking.
	let legacyRecurring: RecurringCharge | undefined
	if (subscriptionId) {
		try {
			const subscription = await stripe.subscriptions.retrieve(subscriptionId)
			const price = subscription.items?.data?.[0]?.price
			if (price?.unit_amount != null) {
				legacyRecurring = {
					label: MEMBERSHIPS.premium.receiptLabel,
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

	const now = new Date()
	let booking: IBookings | null = null
	try {
		booking = await Bookings.create({
			// PENDING means "awaiting the host". A session Stripe settled for nothing owed is
			// finished, not waiting on anybody, so it confirms like a paid one — leaving it
			// PENDING would park it in the Approvals tab of an event that never asked for
			// approval.
			//
			// `!requiresApproval` is the exception, and it is only reachable on a setup session:
			// a free ticket giving away free months has no money to hold, so there is no
			// authorization to read the host's decision off. Confirming it would let the guest
			// past a door the host asked to keep shut.
			status: (isPaidNow || isSettledWithoutCharge) && !requiresApproval ? BookingStatus.CONFIRMED : BookingStatus.PENDING,
			eventId: metadata.eventId,
			bookingRef,
			// Present only when the buyer was logged in at checkout. Bookings made before this
			// was carried through the metadata have none and resolve by email instead.
			...(metadata.bookerUserId ? { bookerUserId: metadata.bookerUserId } : {}),
			// The checkout email's account, logged in or not — see `checkoutUserId` on IBookings.
			...(metadata.checkoutUserId ? { checkoutUserId: metadata.checkoutUserId } : {}),
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
				// Only on a legacy subscription-mode session, so a support question about a
				// recurring charge can be traced back to the subscription that started it.
				...(subscriptionId ? { subscriptionId } : {}),
				// Every membership starts as "pending": the money has moved (or is held) but no
				// subscription exists yet. The immediate path promotes these to "active" a few
				// lines below; a held order leaves them for `approve.ts`. Storing the price id
				// rather than re-resolving it means a plan price change while a request waits
				// can't move the buyer onto a rate they were never quoted.
				...(membershipLines.length > 0
					? {
						memberships: membershipLines.map((line) => ({
							key: line.key,
							status: "pending" as const,
							amount: line.amount,
							priceId: line.priceId,
							interval: line.interval,
							// Carried onto the booking so `approve.ts`, which never sees the Stripe
							// session, grants the same free months that were quoted — and states the
							// price that follows them without re-reading Stripe.
							...(line.trialMonths ? { trialMonths: line.trialMonths, renewalAmount: line.renewalAmount } : {}),
						})),
					}
					: {}),
				// Stored only for the setup session, where it is the ONLY record of the card:
				// `approve.ts` reads the payment method off the PaymentIntent it just captured,
				// and this order never had one. Harmless elsewhere, but written only where it is
				// needed so no booking carries a duplicate of something Stripe already holds.
				...(isSetupSession && savedPaymentMethodId ? { paymentMethodId: savedPaymentMethodId } : {}),
				captureMethod: isAuthorized ? "manual" : "automatic",
				// No `status` when nothing was charged: `bookingMoneyState` reads a missing one
				// as "free", and "captured" against $0 would tell the guest money was taken and
				// is being kept. This is the same shape `api/checkout/free-events` writes, for
				// the same reason.
				...(isSettledWithoutCharge ? {} : { status: isAuthorized ? "authorized" as const : "captured" as const }),
				amount: chargedAmount,
				currency: session.currency || "usd",
				...(isAuthorized
					? { authorizedAt: now, authExpiresAt: resolveAuthExpiry(pi, now) }
					: isSettledWithoutCharge
						? {}
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
					...(membershipLines.length > 0
						? {
							memberships: membershipLines.map((line) => ({
								label: MEMBERSHIPS[line.key].label,
								receiptLabel: MEMBERSHIPS[line.key].receiptLabel,
								amount: line.amount,
								interval: line.interval,
							})),
						}
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

	// ---- Immediate-payment branch ----
	await booking.updateEventTracker()
	await incrementReferralUsage(metadata.referralCode, metadata.eventId ? String(metadata.eventId) : undefined)

	// Add the buyer as an event member — `checkoutUserId` covers guests too (their Users
	// account is created at checkout), `bookerUserId` is the fallback for older sessions.
	const memberUserId = booking.checkoutUserId || booking.bookerUserId
	if (memberUserId) {
		try {
			await addEventMember(booking.eventId, memberUserId)
		} catch (error) {
			console.error("[checkout-fulfillment] Failed to add event participant:", error)
		}
	}

	// ---- Start the memberships this charge paid for ----
	//
	// Deliberately AFTER the booking exists and never allowed to undo it. The money is already
	// taken; if a subscription can't be created the ticket is still valid and paid for, and the
	// gap is recorded per product as `status: "failed"` so it stays visible and retryable. This
	// is the cost of the payment-mode session — see `premium-bundle.ts` for why a Checkout
	// Session can no longer create these itself.
	//
	// Each product is attempted independently: a failure on one must not deny the buyer the
	// other one they just paid for.
	const recurringCharges: RecurringCharge[] = legacyRecurring ? [legacyRecurring] : []
	if (membershipLines.length > 0) {
		const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id
		const paymentMethodId = savedPaymentMethodId

		// STRIPE MAY HAVE ALREADY CREATED IT. A free ticket giving away a single membership is
		// sold through a `mode: "subscription"` session with a trial, because that is the only
		// shape whose page shows the buyer a priced summary rather than a bare card form. The
		// subscription then exists before we get here, and calling `startMembershipSubscription`
		// would sign them up a SECOND time on the same customer.
		//
		// `hasActiveMembershipSubscription` inside that function would usually catch it, but it
		// is a network round trip against a subscription created seconds ago — this is the
		// deterministic guard, and the session itself is the evidence.
		const sessionSubscriptionId =
			typeof session.subscription === "string" ? session.subscription : session.subscription?.id

		for (const line of membershipLines) {
			const row = booking.payment?.memberships?.find((m) => m.key === line.key)

			// Link what Stripe made, rather than making another. Only ever one membership on such
			// a session (that is the condition `api/checkout` requires before choosing this
			// shape), so the single line is unambiguously the one it belongs to.
			if (sessionSubscriptionId) {
				if (row) {
					row.status = "active"
					row.subscriptionId = sessionSubscriptionId
					row.lastError = undefined
				}
				// Disclosed on the receipt exactly as a self-created one is: `amount` is what
				// moved (nothing), so the RENEWAL price is what has to be stated.
				recurringCharges.push({
					label: MEMBERSHIPS[line.key].receiptLabel,
					amount: line.trialMonths ? Number(line.renewalAmount) || 0 : line.amount,
					interval: line.interval,
					...(line.trialMonths ? { trialMonths: line.trialMonths } : {}),
					...(trialEndsFromSession ? { firstRenewalAt: trialEndsFromSession } : {}),
				})
				continue
			}

			try {
				const result = await startMembershipSubscription({
					key: line.key,
					priceId: line.priceId,
					interval: line.interval,
					// Free months beat the usual "one interval already paid" trial.
					trialMonths: line.trialMonths,
					customerId: customerId || "",
					paymentMethodId,
					email: metadata.email,
					subscriberId: metadata.membershipUserId,
					metadata: { bookingRef, eventId: String(metadata.eventId) },
				})

				if (row) {
					row.status = "active"
					if (result.subscriptionId) row.subscriptionId = result.subscriptionId
					row.lastError = undefined
				}

				// Only bill-forward a line the buyer will actually be charged for again. When
				// they already had the subscription, `created` is false and there is nothing new
				// to disclose on this receipt.
				if (result.created) {
					recurringCharges.push({
						label: MEMBERSHIPS[line.key].receiptLabel,
						// On a gifted membership `amount` is 0 — money that moved — so the RENEWAL
						// price is what the receipt must state. Quoting $0/month for something that
						// will bill $20 is the disclosure failure this whole path exists to avoid.
						amount: line.trialMonths ? Number(line.renewalAmount) || 0 : line.amount,
						interval: line.interval,
						...(line.trialMonths ? { trialMonths: line.trialMonths } : {}),
						firstRenewalAt: result.firstRenewalAt,
					})
				}
			} catch (membershipError: any) {
				console.error(
					`[checkout-fulfillment] Charged but could not start ${line.key}:`,
					membershipError?.message || membershipError,
				)
				if (row) {
					row.status = "failed"
					row.lastError = String(membershipError?.message || membershipError)
				}
			}
		}

		try {
			await (booking as any).save()
		} catch (saveError) {
			console.error("[checkout-fulfillment] Couldn't record membership results on the booking:", saveError)
		}
	}

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
			// The ticket description comes from the EVENT, not the session metadata. It used to be
			// read off `t.desc`, which the client never sends under that name (it posts
			// `description`), so the receipt has always shown an empty description. Carrying it
			// through metadata is also what pushed that value past Stripe's 500-character limit
			// and broke checkout outright, so it is no longer sent at all. Same resolution
			// `bookings/approve.ts` uses.
			tickets: tickets.map((t) => {
				const eventTicket = (event as any)?.tickets?.find((row: any) => row?._id?.toString() === String(t.id))
				return {
					name: t.name,
					price: t.price,
					quantity: t.quantity,
					desc: eventTicket?.desc || (t as any).description || t.desc || "",
				}
			}),
			orderNumber: bookingRef,
			referralCode: metadata.referralCode,
			discountAmount: discountAmount > 0 ? discountAmount : undefined,
			discountPercentage: effectiveDiscountPercentage > 0 ? effectiveDiscountPercentage : undefined,
			// Itemised, with the Total being what the TICKET cost rather than a recomputed
			// figure. A bundled order also carries each membership as its own recurring line,
			// so the receipt states every renewal amount and interval — required for
			// subscriptions the buyer acquired as part of a ticket purchase.
			pricing: buildTicketPricing({
				subtotal,
				referralCode: metadata.referralCode,
				referralPercentage: referralPercent,
				premiumPercentage: premiumPercent,
				total,
				...(recurringCharges.length > 0 ? { recurring: recurringCharges } : {}),
			}),
			qrCodeImageUrl,
		})
	} catch (emailError) {
		console.error("[checkout-fulfillment] Failed to send ticket confirmation email:", emailError)
	}

	return { created: true, booking, event, requiresApproval: false, session }
}

import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { BookingStatus } from "@/models/events/types"
import { resolveEventLocation } from "@/lib/event-helpers"
import { generateQRCodeForBooking } from "@/lib/qr-generator"
import { sendTicketConfirmation } from "@/lib/send-grid"
import { notifyApprovalApproved } from "@/lib/booking-notify"
import { pricingFromBooking, type RecurringCharge } from "@/lib/ticket-pricing"
import { getStripeClient } from "@/lib/premium"
import { heldMemberships } from "@/lib/premium-eligibility"
import { MEMBERSHIPS } from "@/lib/memberships"
import { bookingMemberships } from "@/lib/booking-memberships"
import { bookingTicketCount, partialApprovalRefusal, PARTIAL_REFUSAL_MESSAGE } from "@/lib/booking-approval"
import { Types } from "mongoose"
import { startMembershipSubscription } from "@/lib/membership-subscriptions"
import { addEventMember } from "@/utils/eventMembership"
import Stripe from "stripe"
import zod from "zod"

const schema = zod.object({
	bookingRef: zod.string().nonempty(),
	/**
	 * Optional REDUCED selection — "approve 1 of the 2 they asked for".
	 *
	 * Absent means approve the request as it stands, which is every ordinary approval. Present,
	 * it may only ever SHRINK the booking: this endpoint seats fewer people, it never sells more.
	 */
	tickets: zod
		.array(zod.object({ ticketId: zod.string().nonempty(), quantity: zod.number().int().min(0) }))
		.optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed.", false, ResCode.METHOD_NOT_ALLOWED)
	}

	await ensureDbConnected()
	const session = await getServerSession(req, res, authOptions)
	const userRole = (session?.user as any)?.role
	const userId = (session?.user as any)?._id?.toString()
	if (!userId) return sendResponse(res, null, "Not authenticated.", false, ResCode.UNAUTHORIZED)

	const isAdmin = userRole === "admin" || userRole === "super admin"

	const parsed = schema.safeParse(req.body)
	if (!parsed.success) return sendResponse(res, null, "Invalid input.", false, ResCode.BAD_REQUEST)

	const { bookingRef, tickets: reducedTickets } = parsed.data
	const booking = await Bookings.findOne({ bookingRef })
	if (!booking) return sendResponse(res, null, "Booking not found.", false, ResCode.NOT_FOUND)

	if (booking.status !== BookingStatus.PENDING) {
		return sendResponse(res, null, "This booking is not awaiting approval.", false, ResCode.BAD_REQUEST)
	}

	const event = await Events.findById(booking.eventId)
	if (!event) return sendResponse(res, null, "Event not found.", false, ResCode.NOT_FOUND)

	// Ownership: admin OR owner of the event
	if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
		return sendResponse(res, null, "Not authorized.", false, ResCode.FORBIDDEN)
	}

	// ---- Partial approval: seat only part of what was asked for. ----
	//
	// Reached when the request no longer fits what's left. Without it the host's only exit is
	// Reject — losing a guest who would happily have taken the one remaining seat, and leaving
	// a card hold doing nothing until it expires.
	//
	// The server allows any VALID reduction, not only one that capacity currently forces.
	// Gating on "must not fit" here would be a race: another approval could free a seat between
	// the host seeing the button and pressing it, and the request would then fail for a reason
	// they can't act on. The UI decides when to OFFER it; this decides whether it's legal.
	const originalTickets = booking.tickets.map((t: any) => ({ ticketId: String(t.ticketId), quantity: Number(t.quantity) || 0 }))
	const originalQty = bookingTicketCount(originalTickets)
	let approvedQty = originalQty
	let isPartial = false

	if (reducedTickets) {
		const requestedQty = bookingTicketCount(reducedTickets as any)

		// Same ticket ids, no additions, and every row no larger than what was booked.
		const storedById = new Map(originalTickets.map((t) => [t.ticketId, t.quantity]))
		const sameSet =
			reducedTickets.length === originalTickets.length &&
			reducedTickets.every((row) => storedById.has(String(row.ticketId))) &&
			new Set(reducedTickets.map((r) => String(r.ticketId))).size === reducedTickets.length
		const withinOriginal = reducedTickets.every((row) => row.quantity <= (storedById.get(String(row.ticketId)) ?? 0))

		if (!sameSet || !withinOriginal) {
			return sendResponse(res, null, "That ticket selection doesn't match this request — refresh and try again.", false, ResCode.BAD_REQUEST)
		}
		if (requestedQty < 1) {
			return sendResponse(res, null, "Approve at least one ticket, or decline the request instead.", false, ResCode.BAD_REQUEST)
		}
		if (requestedQty > originalQty) {
			return sendResponse(res, null, "You can't approve more tickets than were requested.", false, ResCode.BAD_REQUEST)
		}

		if (requestedQty < originalQty) {
			// Both refusals are about money, not policy — see `booking-approval.ts`.
			const refusal = partialApprovalRefusal(originalTickets, {
				sellsMembership: bookingMemberships(booking.payment).length > 0,
				seatable: requestedQty,
			})
			if (refusal) {
				return sendResponse(res, null, PARTIAL_REFUSAL_MESSAGE[refusal], false, ResCode.BAD_REQUEST)
			}

			isPartial = true
			approvedQty = requestedQty
			booking.tickets = reducedTickets.filter((r) => r.quantity > 0).map((r) => ({
				ticketId: new Types.ObjectId(String(r.ticketId)),
				quantity: r.quantity,
			})) as any

			// Scale the money the booking RECORDS alongside the quantity. Leaving `subTotal` at
			// the two-ticket figure while `total` reflects one would put a receipt in front of
			// the guest whose lines don't add up.
			const ratio = approvedQty / originalQty
			const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
			booking.subTotal = round2((Number(booking.subTotal) || 0) * ratio)
			booking.discountAmount = round2((Number(booking.discountAmount) || 0) * ratio)
			booking.total = round2((Number(booking.total) || 0) * ratio)

			// Same audit shape the host-side quantity edit writes — one history, not two.
			const now = new Date()
			;(booking as any).ticketsEditedAt = now
			;(booking as any).ticketsEditedBy = isAdmin ? "admin" : "host"
			;(booking as any).ticketsEditHistory = [
				...(((booking as any).ticketsEditHistory as any[]) || []),
				{
					at: now,
					by: isAdmin ? "admin" : "host",
					byUserId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
					from: originalTickets.map((t) => ({ ticketId: new Types.ObjectId(t.ticketId), quantity: t.quantity })),
					to: booking.tickets,
				},
			]
		}
	}

	// Capacity check — approval consumes capacity, and this is where the decision belongs: a
	// PENDING request holds no spot, so the host can collect as many as they like and the
	// limit bites at the moment one is let in.
	//
	// Deliberately BEFORE any money moves: if we're going to refuse, refuse before capturing.
	// Capturing and then discovering the event is full would leave funds we have no refund
	// tooling to return.
	//
	// Counted from the bookings, not from `EventTracker` — that counter is missing on every
	// event this portal didn't create, and `eventTracker &&` made those approvals unlimited.
	// This booking is excluded from the count so a re-approval after a failed capture isn't
	// blocked by its own seats.
	{
		const { verifyAvailability } = await import("@/lib/ticket-availability")
		const verdict = await verifyAvailability(
			event,
			booking.tickets.map((t: any) => ({ id: String(t.ticketId), quantity: t.quantity || 0 })),
			String(booking._id),
		)
		if (!verdict.ok) {
			return sendResponse(res, null, `Cannot approve: ${verdict.reason}`, false, ResCode.BAD_REQUEST)
		}
	}

	// ---- Paid approvals: capture the card hold placed at checkout. ----
	// Free bookings have no `payment` at all, so this whole block is skipped and their
	// behaviour is unchanged.
	let amountCharged: number | undefined
	// Memberships this approval actually started, for the receipt.
	const startedMemberships: RecurringCharge[] = []
	const needsCapture = !!booking.payment?.paymentIntentId && ["authorized", "capturing", "failed"].includes(booking.payment?.status as string)
	// The captured PaymentIntent, read after the branch for the Customer and saved card it
	// carries. Undefined on a free approval, which has no hold to capture.
	let capturedPi: Stripe.PaymentIntent | undefined

	// ---- A bundled ticket held for approval ----
	// The hold covers the ticket plus the first period of every membership the ticket sells;
	// none of the subscriptions exist yet. If the buyer has acquired one of them in the
	// meantime we capture LESS and let Stripe release the difference — capturing under the
	// authorized amount is free, and nobody should pay for a membership they already own.
	//
	// Read through `bookingMemberships` so bookings held under the old single-product shape
	// (live PENDING rows exist from the week before Concierge shipped) resolve identically.
	const pendingMemberships = bookingMemberships(booking.payment).filter((row) => row.status === "pending")
	let skipKeys: string[] = []
	if (pendingMemberships.length > 0) {
		try {
			const alreadyHeld = await heldMemberships(
				booking.customerEmail,
				pendingMemberships.map((row) => row.key),
			)
			skipKeys = pendingMemberships.filter((row) => alreadyHeld.includes(row.key)).map((row) => row.key)
			if (skipKeys.length > 0) {
				console.warn("[bookings/approve] Buyer already holds", skipKeys.join(", "), "— releasing that portion:", booking.bookingRef)
			}
		} catch (membershipLookupError) {
			// Can't tell — go ahead with the full capture and create the subscriptions. Charging
			// for a membership we then create is recoverable; refusing the approval is not.
			console.error("[bookings/approve] Membership lookup failed, proceeding with full capture:", membershipLookupError)
		}
	}

	// What the capture must NOT include: the first period of anything they already hold.
	const releasedAmount =
		Math.round(
			(pendingMemberships
				.filter((row) => skipKeys.includes(row.key))
				.reduce((sum, row) => sum + (Number(row.amount) || 0), 0) +
				Number.EPSILON) *
				100,
		) / 100

	if (needsCapture) {
		const piId = booking.payment!.paymentIntentId!

		// Atomic latch so a double-click or two admins acting at once can't double-capture.
		const latched = await Bookings.findOneAndUpdate(
			{ _id: booking._id, status: BookingStatus.PENDING, "payment.status": { $in: ["authorized", "failed"] } },
			{ $set: { "payment.status": "capturing" } },
			{ new: true },
		)
		if (!latched) {
			return sendResponse(res, null, "This request is already being processed.", false, ResCode.BAD_REQUEST)
		}
		booking.payment!.status = "capturing"

		// Capture BEFORE flipping to CONFIRMED. The two orderings are not symmetric:
		// confirm-then-fail leaves a confirmed booking, a consumed seat and an emailed QR
		// with no money — actively wrong. Capture-then-fail leaves money taken with the
		// booking still PENDING/"capturing", which a retry self-heals below via the
		// `succeeded` branch.
		const stripe = getStripeClient()
		let pi: Stripe.PaymentIntent
		try {
			// Partial capture when part of the hold is no longer owed. Stripe releases the
			// uncaptured remainder at no cost. Computed by subtracting only the memberships
			// being skipped, so a buyer who holds one of two still pays for the other.
			// Two independent reasons to capture less than the hold, and they compose:
			//   - a membership the buyer turns out to already own (`releasedAmount`);
			//   - fewer tickets being seated than were asked for (`isPartial`).
			//
			// The ticket portion is scaled PROPORTIONALLY rather than by a unit price, because a
			// booking stores no per-ticket price. That is exact under any discount — but only
			// when every ticket in the order costs the same, which is why a multi-type booking
			// can't be partially approved at all (see `booking-approval.ts`).
			//
			// Capturing under the authorized amount costs nothing and is NOT a refund: Stripe
			// simply releases the difference.
			const heldAmount = Number(booking.payment!.amount) || 0
			const ticketPortion = heldAmount - releasedAmount
			const captureAmount = isPartial
				? Math.max(0, Math.round(ticketPortion * (approvedQty / originalQty) * 100))
				: Math.max(0, Math.round(ticketPortion * 100))

			pi = releasedAmount > 0 || isPartial
				? await stripe.paymentIntents.capture(piId, { amount_to_capture: captureAmount })
				: await stripe.paymentIntents.capture(piId)
		} catch (err: any) {
			const code = err?.code || err?.raw?.code
			if (code === "payment_intent_unexpected_state") {
				const current = await stripe.paymentIntents.retrieve(piId)
				if (current.status === "succeeded") {
					pi = current // already captured — idempotent, carry on
				} else if (current.status === "canceled") {
					booking.status = BookingStatus.FAILED
					booking.payment!.status = "expired"
					booking.payment!.canceledAt = new Date()
					booking.payment!.lastError = `PaymentIntent canceled (${current.cancellation_reason || "unknown"})`
					await booking.save()
					return sendResponse(
						res,
						{ bookingRef, status: booking.status, payment: { status: booking.payment!.status, amount: booking.payment!.amount } },
						"The card authorization has expired or was canceled, so this request can no longer be charged. Ask the guest to book again.",
						false,
						ResCode.BAD_REQUEST,
					)
				} else {
					booking.payment!.status = "authorized" // roll the latch back
					await booking.save()
					return sendResponse(res, null, `Payment is in an unexpected state (${current.status}).`, false, ResCode.INTERNAL_SERVER_ERROR)
				}
			} else {
				// Booking stays PENDING so it remains visible in Approvals and the host can retry.
				booking.payment!.status = "failed"
				booking.payment!.lastError = err?.message || String(err)
				await booking.save()
				return sendResponse(
					res,
					{ bookingRef, status: booking.status, payment: { status: "failed", amount: booking.payment!.amount, lastError: booking.payment!.lastError } },
					`Could not charge the card: ${err?.message || "capture failed"}`,
					false,
					ResCode.BAD_REQUEST,
				)
			}
		}

		capturedPi = pi
		amountCharged = (pi.amount_received ?? pi.amount ?? 0) / 100
		booking.payment!.status = "captured"
		booking.payment!.capturedAt = new Date()
		booking.payment!.amount = amountCharged
		booking.payment!.lastError = undefined

		// `payment.amount` is what the CARD was charged; `booking.total` is what the TICKET
		// cost. They differ only when memberships rode along, so subtracting the captured
		// membership portion leaves every non-bundled booking byte-identical to before.
		const capturedMemberships = pendingMemberships
			.filter((row) => !skipKeys.includes(row.key))
			.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
		booking.total = Math.round((amountCharged - capturedMemberships + Number.EPSILON) * 100) / 100
	}

	if (pendingMemberships.length > 0) {
		// ---- Start the memberships this approval owes ----
		// Deliberately AFTER the capture and never allowed to undo it: money that has been
		// taken is never rolled back here (same rule as the capture-before-confirm ordering
		// above). If one fails the ticket is still valid and paid; the gap is recorded against
		// that product as `status: "failed"` so it stays visible and retryable.
		//
		// Each product is attempted independently — a failure on one must not deny the guest
		// the other one they were just charged for.
		//
		// Runs OUTSIDE the capture branch, because a hold is no longer the only way a booking can
		// owe a membership: a referral code granting free months does it on a $0 ticket, and that
		// booking has no PaymentIntent at all. It used to sit inside `if (needsCapture)`, which
		// approved those requests while silently dropping the gift they were promised.
		let customerId = typeof capturedPi?.customer === "string" ? capturedPi.customer : capturedPi?.customer?.id
		const paymentMethodId =
			(typeof capturedPi?.payment_method === "string" ? capturedPi.payment_method : capturedPi?.payment_method?.id) ||
			// No hold, but a card all the same: a free ticket giving away free months is sold
			// through a setup-mode session, whose only job was to collect one. Without this the
			// membership would be created with no payment method and cancelled by Stripe at the
			// end of the free months — the exact outcome that session exists to prevent.
			booking.payment?.paymentMethodId
		// No hold, so Stripe never handed us a Customer — resolve the one the membership belongs
		// to. There may be no card either (a gift settled through the free path), in which case
		// `startMembershipSubscription` tells Stripe to cancel at trial end rather than raise an
		// invoice nobody can pay.
		if (!customerId) {
			try {
				const { resolveStripeCustomerForUser } = await import("@/lib/premium")
				const subscriberId = (booking as any).checkoutUserId || (booking as any).bookerUserId
				if (subscriberId) customerId = await resolveStripeCustomerForUser(String(subscriberId), booking.customerEmail)
			} catch (customerError: any) {
				console.error("[bookings/approve] Couldn't resolve a Stripe customer for the membership:", customerError?.message || customerError)
			}
		}
		// Normalise a legacy single-product booking onto the array before writing back, so
		// everything downstream reads one shape.
		if (pendingMemberships.length > 0 && !booking.payment!.memberships?.length) {
			booking.payment!.memberships = pendingMemberships as any
		}

		for (const pending of pendingMemberships) {
			const row = booking.payment!.memberships?.find((m) => m.key === pending.key)

			if (skipKeys.includes(pending.key)) {
				// They already have it and the hold for it was released above — nothing charged,
				// nothing to create.
				if (row) {
					row.status = "active"
					row.amount = 0
				}
				continue
			}

			try {
				const result = await startMembershipSubscription({
					key: pending.key,
					priceId: pending.priceId || "",
					interval: pending.interval,
					// STORED, not re-resolved — the referral code that granted these months may
					// have been edited or deleted while the request sat pending.
					trialMonths: pending.trialMonths,
					customerId: customerId || "",
					paymentMethodId,
					email: booking.customerEmail,
					name: booking.customerName || undefined,
					subscriberId: (booking as any).bookerUserId ? String((booking as any).bookerUserId) : undefined,
					metadata: { bookingRef, eventId: String(booking.eventId), approvedAt: new Date().toISOString() },
				})

				if (row) {
					row.status = "active"
					if (result.subscriptionId) row.subscriptionId = result.subscriptionId
					row.lastError = undefined
				}

				// Only itemise a membership this approval actually started — not one the buyer
				// already had, where nothing was charged and there is nothing new to renew.
				if (result.created) {
					startedMemberships.push({
						label: MEMBERSHIPS[pending.key].receiptLabel,
						// A gifted membership captured nothing, so `amount` is 0 and the renewal
						// price is the only truthful figure to print.
						amount: pending.trialMonths ? Number(pending.renewalAmount) || 0 : Number(pending.amount) || 0,
						interval: pending.interval || "month",
						...(pending.trialMonths ? { trialMonths: pending.trialMonths } : {}),
						// The trial end IS the first real charge date — surfaced in the receipt so
						// "Free trial ends <date>" in Stripe's portal can't be read as a free month.
						firstRenewalAt: result.firstRenewalAt,
					})
				}
			} catch (subscriptionError: any) {
				// Money is already taken and the ticket is real — confirm the booking anyway
				// and make the missing membership visible instead of silently swallowing it.
				console.error(
					`[bookings/approve] Captured but could not start ${pending.key}:`,
					subscriptionError?.message || subscriptionError,
				)
				if (row) {
					row.status = "failed"
					row.lastError = String(subscriptionError?.message || subscriptionError)
				}
				booking.payment!.lastError = `${MEMBERSHIPS[pending.key].label} not started: ${subscriptionError?.message || subscriptionError}`
			}
		}
	}

	// Confirm the booking and consume capacity
	booking.status = BookingStatus.CONFIRMED
	await booking.save()
	await booking.updateEventTracker()

	// Add the buyer as an event member — `checkoutUserId` covers guests too (their Users
	// account is created at checkout), `bookerUserId` is the fallback for older sessions.
	const memberUserId = booking.checkoutUserId || booking.bookerUserId
	if (memberUserId) {
		try {
			await addEventMember(booking.eventId, memberUserId)
		} catch (error) {
			console.error("[bookings/approve] Failed to add event participant:", error)
		}
	}

	// Referral usage was deliberately deferred from checkout so declined requests don't
	// burn a limited-use code. Now that the booking is real, count it.
	// `needsCapture` is no longer the only way a code did something: one granting free
	// membership months is spent on approval even though the ticket was $0 and nothing was
	// discounted. Without this `maxUses` would never limit the gifts on a free event.
	if ((needsCapture || pendingMemberships.length > 0) && booking.referralCode) {
		try {
			const { ReferralCodes } = await import("@/models/events/referral-codes")
			// Scoped to the booking's event: the same code string can live on several events, and
			// an unscoped lookup would burn another host's `maxUses`.
			const referralCode = await ReferralCodes.findOne({
				code: booking.referralCode.trim().toUpperCase(),
				eventId: booking.eventId,
				isDeleted: false,
			})
			if (referralCode) {
				referralCode.usageCount += 1
				await referralCode.save()
			}
		} catch (referralError) {
			console.error("Failed to increment referral usage on approval:", referralError)
		}
	}

	await resolveEventLocation(event)

	// Build ticket details from the event's ticket subdocuments
	const [firstName, ...rest] = (booking.customerName || "").split(" ")
	const lastName = rest.join(" ")
	let ticketDetails = booking.tickets.map((bt) => {
		const et = (event as any).tickets?.find((t: any) => t._id?.toString() === bt.ticketId?.toString())
		return {
			name: et?.name || "Ticket",
			price: et?.price || 0,
			quantity: bt.quantity || 1,
			desc: et?.desc || "",
		}
	})

	// Free RSVPs can be booked without an explicit ticket selection — fall back to the
	// event's ticket(s) so the confirmation lists the free ticket instead of "Tickets (0)".
	if (ticketDetails.length === 0 && Array.isArray((event as any).tickets) && (event as any).tickets.length > 0) {
		ticketDetails = (event as any).tickets.map((t: any) => ({
			name: t.name || "General Admission",
			price: t.price || 0,
			quantity: 1,
			desc: t.desc || "",
		}))
	}

	// Send the celebratory "you've got a spot" confirmation (with QR + location) to the attendee
	try {
		let qrCodeImageUrl: string | undefined
		try {
			qrCodeImageUrl = await generateQRCodeForBooking(bookingRef)
		} catch (qrError) {
			console.error("Failed to generate QR code:", qrError)
		}
		await sendTicketConfirmation({
			// Says plainly that fewer tickets were confirmed than asked for. Without it the guest
			// would read an ordinary confirmation and believe they still hold two.
			...(isPartial ? { partialApproval: { requested: originalQty, confirmed: approvedQty } } : {}),
			event,
			firstName: firstName || booking.customerName,
			lastName,
			email: booking.customerEmail,
			phone: booking.customerPhone,
			tickets: ticketDetails,
			orderNumber: bookingRef,
			qrCodeImageUrl,
			approvalContext: true,
			amountCharged,
			// Summary comes from the booking, not from the ticket rows above: those are
			// rebuilt from current event prices (bookings store no per-ticket price
			// snapshot), whereas subTotal and the discount rates are what was recorded at
			// purchase.
			//
			// `booking.total` — NOT `amountCharged` — because on a bundled approval the
			// capture also covered the first period of each membership. Those are shown on
			// their own recurring lines instead, with `dueToday` reconciling the two.
			pricing: pricingFromBooking(
				{
					subTotal: booking.subTotal,
					total: booking.total,
					referralCode: booking.referralCode,
					discountAmount: booking.discountAmount,
					referralDiscountPercentage: (booking as any).referralDiscountPercentage,
					premiumMemberDiscountPercentage: (booking as any).premiumMemberDiscountPercentage,
				},
				ticketDetails.reduce((sum, t) => sum + (t.price || 0) * (t.quantity || 0), 0),
				startedMemberships.length > 0 ? startedMemberships : undefined,
			),
		})
	} catch (emailError) {
		// Never let a mail failure undo a successful capture — money first, mail second.
		console.error("Failed to send approval confirmation email:", emailError)
	}

	// Copy the admin inbox (contact@jetzyapp.com) that the request was approved — on an
	// admin-owned event only. On a host-owned one the non-admin owner is the person who just
	// pressed Approve, and mailing them a record of their own click is noise.
	await notifyApprovalApproved({
		event: event as any,
		eventId: booking.eventId.toString(),
		firstName: firstName || booking.customerName,
		lastName,
		email: booking.customerEmail,
		tickets: ticketDetails,
		amountCharged,
	})

	return sendResponse(
		res,
		{
			bookingRef,
			status: booking.status,
			payment: booking.payment
				? { status: booking.payment.status, amount: booking.payment.amount, capturedAt: booking.payment.capturedAt }
				: undefined,
			amountCharged,
			requestedTickets: originalQty,
			approvedTickets: approvedQty,
			partial: isPartial,
		},
		amountCharged !== undefined
			? `${isPartial ? `Approved ${approvedQty} of ${originalQty} tickets. ` : "Booking approved. "}$${amountCharged.toFixed(2)} charged successfully.`
			: isPartial
				? `Approved ${approvedQty} of ${originalQty} tickets.`
				: "Booking approved and confirmed.",
		true,
		ResCode.OK,
	)
}

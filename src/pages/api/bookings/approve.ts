import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { EventTracker } from "@/models/events/event-tracker"
import { BookingStatus } from "@/models/events/types"
import { resolveEventLocation } from "@/lib/event-helpers"
import { generateQRCodeForBooking } from "@/lib/qr-generator"
import { sendTicketConfirmation, sendAdminApprovalNotice } from "@/lib/send-grid"
import { pricingFromBooking, type RecurringCharge } from "@/lib/ticket-pricing"
import { getStripeClient } from "@/lib/premium"
import { heldMemberships } from "@/lib/premium-eligibility"
import { MEMBERSHIPS } from "@/lib/memberships"
import { bookingMemberships } from "@/lib/booking-memberships"
import { startMembershipSubscription } from "@/lib/membership-subscriptions"
import { addEventMember } from "@/utils/eventMembership"
import Stripe from "stripe"
import zod from "zod"

const schema = zod.object({
	bookingRef: zod.string().nonempty(),
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

	const { bookingRef } = parsed.data
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

	// Capacity check (0 = unlimited) — approval consumes capacity.
	// Deliberately BEFORE any money moves: if we're going to refuse, refuse before
	// capturing. Capturing and then discovering the event is full would leave funds we
	// have no refund tooling to return.
	const requestedTickets = booking.tickets.reduce((sum, t) => sum + (t.quantity || 0), 0)
	const eventTracker = await EventTracker.findOne({ eventId: booking.eventId })
	if (eventTracker && eventTracker.eventCapacity > 0 && eventTracker.bookedTickets + requestedTickets > eventTracker.eventCapacity) {
		return sendResponse(res, null, "Cannot approve: event is at full capacity.", false, ResCode.BAD_REQUEST)
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
			pi = releasedAmount > 0
				? await stripe.paymentIntents.capture(piId, {
					amount_to_capture: Math.max(0, Math.round(((Number(booking.payment!.amount) || 0) - releasedAmount) * 100)),
				})
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
			typeof capturedPi?.payment_method === "string" ? capturedPi.payment_method : capturedPi?.payment_method?.id
		// No hold, so Stripe never handed us a Customer — resolve the one the membership belongs
		// to. There is no card either: `startMembershipSubscription` then tells Stripe to cancel at
		// trial end rather than raise an invoice nobody can pay.
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

	// Copy the admin inbox (contact@jetzyapp.com) that the request was approved
	try {
		await sendAdminApprovalNotice({
			event,
			firstName: firstName || booking.customerName,
			lastName,
			email: booking.customerEmail,
			tickets: ticketDetails,
			eventId: booking.eventId.toString(),
			kind: "approved",
			amountCharged,
		})
	} catch (adminError) {
		console.error("Failed to send admin approved notice:", adminError)
	}

	return sendResponse(
		res,
		{
			bookingRef,
			status: booking.status,
			payment: booking.payment
				? { status: booking.payment.status, amount: booking.payment.amount, capturedAt: booking.payment.capturedAt }
				: undefined,
			amountCharged,
		},
		amountCharged !== undefined
			? `Booking approved. $${amountCharged.toFixed(2)} charged successfully.`
			: "Booking approved and confirmed.",
		true,
		ResCode.OK,
	)
}

import { isPendingAdminApproval } from "@/lib/event-approval"
import { createOrUpdateUser } from "@/lib/user-utils"
import { sendResponse } from "@/lib/helpers"
import { uniqueId } from "@/lib/utils"
import { resolveEventLocation } from "@/lib/event-helpers"
import { sendTicketConfirmation, sendApprovalPending, sendAdminApprovalNotice } from "@/lib/send-grid"
import { generateQRCodeForBooking } from "@/lib/qr-generator"
import { buildTicketPricing } from "@/lib/ticket-pricing"
import { resolveBundlePlan, selectionMemberships } from "@/lib/premium-bundle"
import { heldMemberships } from "@/lib/premium-eligibility"
import { membershipLabelList } from "@/lib/memberships"
import { validateReferralCodeForEvent } from "@/lib/referral-validation"
import { incrementReferralUsage } from "@/lib/checkout-fulfillment"
import { ensureDbConnected } from "@/configs/database"
import { Bookings } from "@/models/events/bookings"
import { BookingStatus } from "@/models/events/types"
import { Events } from "@/models/events"
import { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"

type BodyParams = {
	tickets: Array<{
		id: string
		name: string
		price: number
		quantity: number
		isSelected: boolean
		desc: string
		eventId: string
		priceId: string
	}>
	user: {
		firstName: string
		lastName: string
		email: string
		phone: string
	}
	eventId: string
	customAnswers?: Array<{ questionId: string; answer: any }>
}

type ResolvedTicketRow = { name: string; price: number; quantity: number; desc: string }

/**
 * Re-resolve the order against the EVENT RECORD, never trusting the request body.
 *
 * This endpoint issues a booking with no payment step, so a client-supplied price is a
 * client-supplied authorization. Returns `null` when a submitted ticket id isn't on the event
 * at all — an unknown ticket must abort, not quietly contribute $0 and slip past the
 * free-order check below.
 */
const resolveOrder = (event: any, tickets: BodyParams["tickets"]): { rows: ResolvedTicketRow[]; subtotal: number } | null => {
	const eventTickets: any[] = Array.isArray(event?.tickets) ? event.tickets : []
	const rows: ResolvedTicketRow[] = []
	let subtotal = 0

	for (const ticket of tickets) {
		const stored = eventTickets.find(
			(et: any) => String(et?._id) === String(ticket.id) || (!!ticket.priceId && et?.stripeProductId === ticket.priceId),
		)
		if (!stored) return null

		const quantity = Number(ticket.quantity) || 0
		if (quantity <= 0) return null

		const price = Number(stored.price) || 0
		subtotal += price * quantity
		rows.push({ name: stored.name, price, quantity, desc: stored.desc || "" })
	}

	return { rows, subtotal: Math.round((subtotal + Number.EPSILON) * 100) / 100 }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, 405)
	}

	await ensureDbConnected()

	try {
		const tickets = JSON.parse(req.body?.tickets) as BodyParams["tickets"]
		const user = JSON.parse(req.body?.user) as BodyParams["user"]
		const eventId = req.body?.eventId as string
		const acceptedTerms = req.body?.acceptedTerms === true || req.body?.acceptedTerms === "true"
		const customAnswers: Array<{ questionId: string; answer: any }> = req.body?.customAnswers
			? JSON.parse(req.body.customAnswers)
			: []

		if (!eventId) {
			return sendResponse(res, null, "Event ID is required", false, 400)
		}

		if (!acceptedTerms) {
			return sendResponse(res, null, "You must agree to the Terms & Conditions to register.", false, 400)
		}

		const acceptedTermsAt = new Date()

		// Create or update user profile
		try {
			await createOrUpdateUser({
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email,
				phone: user.phone,
				role: "user",
				acceptedTerms: true,
				acceptedTermsAt,
			})
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : "An unknown error occurred"
			console.error("Error creating user:", errorMessage)
		}

		// Validate required custom questions
		const event = await Events.findById(eventId)
		if (!event) {
			return sendResponse(res, null, "Event not found", false, 404)
		}
		if (isPendingAdminApproval(event as any)) {
			return sendResponse(res, null, "This event is awaiting admin approval and can't be booked yet.", false, 403)
		}
		// Private events are unlisted rather than invite-only — no access code required.
		if (event.questions && event.questions.length > 0) {
			const requiredQuestions = event.questions.filter((q: any) => q.isRequired)
			for (const reqQ of requiredQuestions) {
				const ans = customAnswers.find((a: any) => a.questionId === reqQ.id)
				if (!ans || !ans.answer || (Array.isArray(ans.answer) && ans.answer.length === 0)) {
					return sendResponse(res, null, `Required question "${reqQ.title}" is missing an answer.`, false, 400)
				}
			}
		}

		// Generate booking reference
		const reference = uniqueId(20)
		const bookingRef = `JZ-${reference}`

		// ---- Pricing. This endpoint hands out a booking with no payment step, so every
		// figure below comes from the database, never from the request body. ----
		const order = resolveOrder(event, tickets)
		if (!order) {
			return sendResponse(res, null, "One of the selected tickets is no longer available.", false, 400)
		}
		const { rows: orderRows, subtotal } = order

		// A ticket that still owes a membership can never come through here: this endpoint hands
		// out a booking with no payment step, so there would be no charge to start the
		// subscription against and the buyer would get the ticket while quietly losing the
		// membership they were promised. Resolved from the EVENT record, not the request body,
		// so the flag can't be dropped by a crafted POST to dodge the fee.
		//
		// Deliberately keyed on what is still OWED, not on what the ticket sells: a buyer who
		// already holds every membership on it has nothing left to charge, and a 100%-off
		// referral code genuinely does make that order free. Rejecting those would strand them
		// at a Stripe session for $0, which Stripe refuses outright.
		const freeSelection = tickets
			.map((t) => (event.tickets || []).find((et: any) => String(et._id) === String(t.id)) as any)
			.filter(Boolean)
		const bundlePlan = resolveBundlePlan(freeSelection, await heldMemberships(user.email, selectionMemberships(freeSelection)))
		if (bundlePlan.toCharge.length > 0) {
			console.warn("[checkout/free-events] Rejected a ticket still owing a membership:", { eventId, owed: bundlePlan.toCharge })
			return sendResponse(
				res,
				null,
				`This ticket includes ${membershipLabelList(bundlePlan.toCharge)} — please complete checkout.`,
				false,
				400,
			)
		}

		// A discount can legitimately bring a paid order to exactly $0 (e.g. a 100% referral
		// code, or a member rate that cancels the price out), and those orders are routed
		// here rather than to Stripe — Stripe rejects a $0 charge, and rejects a $0
		// manual-capture authorization outright, which is what an approval order needs.
		const referralResult = await validateReferralCodeForEvent(eventId, req.body?.referralCode)
		if (!referralResult.ok) {
			return sendResponse(res, null, referralResult.message, false, 400)
		}
		const referralCodeData = referralResult.data

		const pricing = buildTicketPricing({
			subtotal,
			referralCode: referralCodeData?.code,
			referralPercentage: referralCodeData?.discountPercentage,
		})

		// The free path issues a CONFIRMED (or approval-pending) booking without charging
		// anything. Anything with money still owing must go through Stripe.
		if (pricing.total !== 0) {
			console.warn("[checkout/free-events] Rejected non-free order:", { eventId, subtotal, total: pricing.total })
			return sendResponse(res, null, "This order isn't free — please complete checkout.", false, 400)
		}

		const discountAmount = Math.round((subtotal - pricing.total + Number.EPSILON) * 100) / 100

		// Two very different orders reach this endpoint: tickets that were always $0, and a
		// priced order discounted all the way down to $0. Only the second one actually used a
		// discount. On a $0 ticket a referral code and a member rate reduce nothing, so they
		// must not be recorded as applied — and must not burn one of the code's `maxUses`.
		const discountsDidWork = subtotal > 0

		// Capture logged-in user (if any) so they can later cancel even when booking email differs
		const session = await getServerSession(req, res, authOptions)
		const bookerUserId = (session?.user as any)?._id || (session?.user as any)?.id

		// Require-Approval: create a PENDING booking that the host must approve. Capacity is
		// NOT consumed and no ticket is issued until approval. Resolved per-ticket (with the
		// event-level flag as the fallback), so one free ticket can opt out while others don't.
		const { selectionRequiresApproval } = await import("@/lib/ticket-approval")
		const requiresApproval = selectionRequiresApproval(event as any, tickets as any)

		// Create the booking record (PENDING when approval is required, otherwise CONFIRMED)
		const booking = await Bookings.create({
			status: requiresApproval ? BookingStatus.PENDING : BookingStatus.CONFIRMED,
			eventId,
			bookingRef,
			...(bookerUserId ? { bookerUserId } : {}),
			customerName: `${user.firstName} ${user.lastName}`,
			customerEmail: user.email,
			customerPhone: user.phone,
			tickets: tickets.map((ticket) => ({
				ticketId: ticket.id,
				quantity: ticket.quantity,
			})),
			subTotal: subtotal,
			total: 0,
			// Why it was free. An order discounted down to $0 records the rates so the email and
			// My Bookings can itemise it, exactly as `checkout-fulfillment.ts` does for the
			// Stripe path. The code itself is kept either way, for attribution.
			...(referralCodeData ? { referralCode: referralCodeData.code } : {}),
			discountAmount,
			...(discountsDidWork && referralCodeData ? { referralDiscountPercentage: referralCodeData.discountPercentage } : {}),
			customAnswers: customAnswers.map((a) => ({
				questionId: a.questionId,
				answer: a.answer,
			})),
			acceptedTerms: true,
			acceptedTermsAt,
		})

		// event already fetched above for validation
		if (!event) {
			return sendResponse(res, null, "Event not found", false, 404)
		}

		await resolveEventLocation(event)

		// ---- Require-Approval branch: notify attendee (pending) + admin, then stop ----
		if (requiresApproval) {
			const ticketSummary = orderRows.map((t) => ({ name: t.name, quantity: t.quantity }))
			try {
				await sendApprovalPending({
					event,
					firstName: user.firstName,
					lastName: user.lastName,
					email: user.email,
					tickets: ticketSummary,
					eventId,
				})
			} catch (emailError) {
				console.error("Failed to send approval-pending email:", emailError)
			}
			try {
				await sendAdminApprovalNotice({
					event,
					firstName: user.firstName,
					lastName: user.lastName,
					email: user.email,
					tickets: ticketSummary,
					eventId,
					kind: "request",
				})
			} catch (adminError) {
				console.error("Failed to send admin approval notice:", adminError)
			}
			return sendResponse(res, { bookingRef, pendingApproval: true }, "Request submitted for approval", true, 200)
		}

		// Update event tracker capacity (confirmed bookings only)
		await booking.updateEventTracker()

		// Confirmed only. An approval-pending booking must NOT burn a referral use — that
		// latch belongs to `bookings/approve.ts`, same as the Stripe path. Nor may a code burn
		// a use against $0 tickets, where it discounted nothing.
		if (discountsDidWork) await incrementReferralUsage(referralCodeData?.code)

		// Send confirmation email
		try {
			let qrCodeImageUrl: string | undefined
			try {
				qrCodeImageUrl = await generateQRCodeForBooking(bookingRef)
			} catch (qrError) {
				console.error("Failed to generate QR code:", qrError)
			}
			await sendTicketConfirmation({
				event,
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email,
				phone: user.phone,
				// Names and prices from the event record, so the line items can't disagree
				// with the Subtotal below them.
				tickets: orderRows,
				orderNumber: bookingRef,
				qrCodeImageUrl,
				// Shows Subtotal/Total explicitly rather than nothing at all — and itemises the
				// discounts when the order was priced but discounted down to $0.
				pricing,
			})
		} catch (emailError) {
			console.error("Failed to send free ticket confirmation email:", emailError)
			// Don't fail the request if email fails
		}

		return sendResponse(res, { bookingRef, success: true }, "Registration confirmed!", true, 200)
	} catch (error) {
		console.error("Error in free-events checkout:", error)
		return sendResponse(res, null, "An unknown error occurred", false, 500)
	}
}

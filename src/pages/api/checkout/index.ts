import { isPendingAdminApproval } from "@/lib/event-approval"
import { buildTicketPricing, isBelowStripeMinimum, STRIPE_MIN_CHARGE_USD } from "@/lib/ticket-pricing"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { uniqueId } from "@Jetzy/lib/utils"
import { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { heldMemberships } from "@/lib/premium-eligibility"
import {
	premiumAllowanceMessage,
	premiumOrderCapMessage,
	PREMIUM_TICKET_MAX_PER_ORDER,
	resolveBundlePlan,
	selectionMemberships,
	ticketMemberships,
	type BundlePlan,
} from "@/lib/premium-bundle"
import { getMembershipTicketAllowances } from "@/lib/premium-ticket-limit"
import { getMembershipPrice, hasActiveMembershipSubscription, resolveStripeCustomerForUser } from "@/lib/premium"
import { MEMBERSHIPS, membershipLabelList, type MembershipKey } from "@/lib/memberships"
import { validateReferralCodeForEvent } from "@/lib/referral-validation"
import Stripe from "stripe"

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
	referralCode?: string
	customAnswers?: any[]
}

let stripeInstance: Stripe | null = null

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	console.log("[checkout/index] Request received:", { method: req.method, bodyKeys: Object.keys(req.body || {}) })

	try {
		// Check for missing env vars early
		const missingVars = [];
		if (!process.env.NEXT_EVENTS_DB_URL) missingVars.push("NEXT_EVENTS_DB_URL");
		if (!process.env.NEXT_STRIPE_SECRET_KEY) missingVars.push("NEXT_STRIPE_SECRET_KEY");
		if (!process.env.NEXT_PUBLIC_URL) missingVars.push("NEXT_PUBLIC_URL");

		if (missingVars.length > 0) {
			console.error("[checkout/index] CRITICAL: Missing environment variables:", missingVars.join(", "));
			return res.status(500).json({
				error: {
					code: "500",
					message: `Missing environment variables: ${missingVars.join(", ")}. Please check your production environment configuration.`
				}
			});
		}

		// initialize stripe
		if (!stripeInstance) {
			stripeInstance = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)
		}
		const stripe = stripeInstance

		// Ensure database connection
		const { ensureDbConnected } = await import("@/configs/database")
		await ensureDbConnected()

		// Dynamically import models to ensure they use the connected db
		const { Events } = await import("@/models/events")
		const { createOrUpdateUser } = await import("@Jetzy/lib/user-utils")

		// Validate request method
		if (req.method !== 'POST') {
			console.warn("[checkout/index] Method not allowed:", req.method)
			return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
		}

		// Get request params
		if (!req.body?.tickets || !req.body?.user) {
			console.warn("[checkout/index] Missing parameters")
			return sendResponse(res, null, "Missing required parameters: tickets and user", false, ResCode.BAD_REQUEST)
		}

		let tickets: BodyParams["tickets"]
		let user: BodyParams["user"]
		let customAnswers: any[] = []

		try {
			// Handle both stringified and object bodies
			tickets = typeof req.body.tickets === 'string' ? JSON.parse(req.body.tickets) : req.body.tickets
			user = typeof req.body.user === 'string' ? JSON.parse(req.body.user) : req.body.user
			if (req.body.customAnswers) {
				customAnswers = typeof req.body.customAnswers === 'string' ? JSON.parse(req.body.customAnswers) : req.body.customAnswers
			}
		} catch (parseError: any) {
			console.error("[checkout/index] JSON parse error:", parseError.message)
			return sendResponse(res, null, "Invalid JSON data in request body", false, ResCode.BAD_REQUEST)
		}

		const referralCode = req.body.referralCode as string | undefined
		console.log("[checkout/index] Checkout started for:", { email: user?.email, eventId: tickets?.[0]?.eventId, referralCode })

		// Validate tickets array
		if (!Array.isArray(tickets) || tickets.length === 0) {
			console.warn("[checkout/index] Invalid tickets array")
			return sendResponse(res, null, "Invalid tickets data", false, ResCode.BAD_REQUEST)
		}

		// Validate user data
		if (!user || !user.email || !user.firstName || !user.lastName) {
			console.warn("[checkout/index] Invalid user data")
			return sendResponse(res, null, "Invalid user data", false, ResCode.BAD_REQUEST)
		}

		// Require T&C consent (agreeing to register + create a Jetzy account)
		const acceptedTerms = req.body?.acceptedTerms === true || req.body?.acceptedTerms === "true"
		if (!acceptedTerms) {
			return sendResponse(res, null, "You must agree to the Terms & Conditions to register.", false, ResCode.BAD_REQUEST)
		}
		const acceptedTermsAt = new Date()

		// create jetzy user
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
			console.error("[checkout/index] Error creating user profile:", errorMessage)
			// Non-critical error, continue
		}

		// Validate and get referral code if provided. The modal's green tick is only a
		// preview — the code can be deactivated or exhausted before submit, so re-check.
		let referralCodeData: { code: string; discountPercentage: number } | null = null
		try {
			const referralResult = await validateReferralCodeForEvent(tickets[0]?.eventId, referralCode)
			if (!referralResult.ok) {
				console.warn("[checkout/index] Referral code rejected:", referralResult.message, referralCode)
				return sendResponse(res, null, referralResult.message, false, ResCode.BAD_REQUEST)
			}
			referralCodeData = referralResult.data
			if (referralCodeData) console.log("[checkout/index] Referral code applied:", referralCodeData)
		} catch (referralError: any) {
			console.error("[checkout/index] Error validating referral code:", referralError)
			return sendResponse(res, null, "Error validating referral code", false, ResCode.INTERNAL_SERVER_ERROR)
		}

		// using price api from stripe create price for the tickets selected
		const prices = tickets.map((ticket) => {
			return {
				price: ticket.priceId,
				quantity: ticket.quantity,
			}
		})

		// generate a reference id
		const reference = uniqueId(20)

		const event = await Events.findOne({
			_id: tickets[0]?.eventId,
			isDeleted: false,
		})

		if (!event) {
			console.warn("[checkout/index] Event not found:", tickets[0]?.eventId)
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		if (isPendingAdminApproval(event as any)) {
			console.warn("[checkout/index] Blocked checkout for pending-approval event:", event._id)
			return sendResponse(res, null, "This event is awaiting admin approval and can't be booked yet.", false, ResCode.FORBIDDEN)
		}

		// Private events are unlisted rather than invite-only — no access code required.

		// Who is buying, if anyone is logged in. Resolved once and carried into the Stripe
		// metadata so the booking created at fulfilment can be linked back to the account —
		// without it, every paid booking has no `bookerUserId` and can only ever be found by
		// whatever email was typed into the form.
		const buyerSession = await getServerSession(req, res, authOptions)
		const buyerId = (buyerSession?.user as any)?._id || (buyerSession?.user as any)?.id

		// Does this order sell memberships?
		//
		// Membership is no longer a discount — a ticket can BUNDLE Jetzy Premium, Full
		// Concierge, or both. Which of them the buyer already holds is resolved from the
		// CHECKOUT EMAIL, not the session: the booking, the ticket and the account all attach
		// to that address, so it's the only identity that can't disagree with itself. See
		// `src/lib/premium-eligibility.ts`.
		//
		//   mode "none"           → ordinary paid ticket.
		//   mode "already-member" → the ticket sells memberships but the buyer holds ALL of
		//                           them already. Charge the ticket alone; a second
		//                           subscription to the same plan is a billing incident.
		//   mode "bundle"         → at least one membership still to sell. `plan.toCharge`
		//                           names exactly which, so holding one of two still pays for
		//                           the other.
		let bundlePlan: BundlePlan = { selected: [], toCharge: [], alreadyHeld: [], mode: "none" }

		// Resolve the flags from the EVENT record, not the request body — a crafted body could
		// otherwise drop the membership and buy a bundled ticket at the plain ticket price.
		const storedTicketFor = (id: string) => (event.tickets || []).find((et: any) => String(et._id) === String(id))

		try {
			const storedSelection = tickets.map((t) => storedTicketFor(t.id) as any).filter(Boolean)
			// Scope the membership lookup to what this order actually sells, so an ordinary
			// ticket never reaches out to SelectMember's API.
			bundlePlan = resolveBundlePlan(
				storedSelection,
				await heldMemberships(user.email, selectionMemberships(storedSelection)),
			)
			console.log("[checkout/index] Bundle plan:", bundlePlan)

			// ---- Membership ticket caps. The client caps too, but the body is attacker-controlled. ----
			//
			// Counted PER PRODUCT: two Premium tickets must not exhaust the buyer's Concierge
			// allowance for the same event.
			if (bundlePlan.selected.length > 0) {
				const allowances = await getMembershipTicketAllowances(String(event._id), user.email)

				for (const key of bundlePlan.selected) {
					const quantity = tickets.reduce((sum, t) => {
						if (!ticketMemberships(storedTicketFor(t.id) as any).includes(key)) return sum
						return sum + (Number(t.quantity) || 0)
					}, 0)

					if (quantity > PREMIUM_TICKET_MAX_PER_ORDER) {
						console.warn("[checkout/index] Membership per-order cap exceeded:", { key, quantity, email: user.email })
						return sendResponse(res, null, premiumOrderCapMessage(key), false, ResCode.BAD_REQUEST)
					}

					// And the cap across every order this address has placed for this event —
					// without it, three orders of two quietly reach six.
					if (quantity > allowances[key].remaining) {
						console.warn("[checkout/index] Membership per-event allowance exceeded:", {
							key,
							email: user.email,
							requested: quantity,
							...allowances[key],
						})
						return sendResponse(res, null, premiumAllowanceMessage(allowances[key].remaining, key), false, ResCode.BAD_REQUEST)
					}
				}
			}
		} catch (bundleError: any) {
			// Never guess. Charging a member for a second subscription, or handing a
			// non-member a membership they weren't billed for, are both worse than a retry.
			console.error("[checkout/index] Error resolving membership bundle plan:", bundleError)
			return sendResponse(res, null, "We couldn't verify your membership status. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
		}

		// Validate required custom questions
		if (event.questions && event.questions.length > 0) {
			const requiredQuestions = event.questions.filter(q => q.isRequired);
			for (const reqQ of requiredQuestions) {
				const ans = customAnswers.find(a => a.questionId === reqQ.id);
				if (!ans || !ans.answer || (Array.isArray(ans.answer) && ans.answer.length === 0)) {
					return sendResponse(res, null, `Required question "${reqQ.title}" is missing an answer.`, false, ResCode.BAD_REQUEST);
				}
			}
		}

		// capacity 0 = unlimited (per schema). Only enforce when capacity > 0.
		if (event.capacity > 0) {
			const { EventTracker } = await import("@/models/events/event-tracker")
			const eventTracker = await EventTracker.findOne({ eventId: event._id })

			if (eventTracker) {
				const totalTicketsRequested = tickets.reduce((sum, ticket) => sum + ticket.quantity, 0)
				const availableCapacity = event.capacity - eventTracker.bookedTickets

				if (availableCapacity < totalTicketsRequested) {
					console.info("[checkout/index] Event at capacity")
					return sendResponse(res, {
						atCapacity: true,
						availableCapacity,
						requestedTickets: totalTicketsRequested,
						eventName: event.name,
						eventId: event._id,
						isClosed: false,
					}, "Event capacity reached. Would you like to join the waiting list?", true, ResCode.OK)
				}
			}
		}

		// Does the selected ticket need host approval? Per-ticket flag wins, event-level is
		// the fallback. When it does, we authorize the card but do NOT charge it — the money
		// is captured only if/when the host approves (see api/bookings/approve.ts).
		const { selectionRequiresApproval } = await import("@/lib/ticket-approval")
		const requiresApproval = selectionRequiresApproval(event as any, tickets as any)
		const bookingRef = `JZ-${reference}`

		const eventDetails = {
			name: event?.name,
			location: event?.location,
			startsOn: event?.startsOn,
			timezone: event?.timezone,
			slug: event?.slug,
		}

		const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
		const cleanBaseUrl = baseUrl.replace(/\/$/, '')
		// The `approval` marker lets /success render the pending-approval variant before it
		// has the session back from Stripe.
		const successUrl = requiresApproval
			? `${cleanBaseUrl}/success?session_id={CHECKOUT_SESSION_ID}&approval=1`
			: `${cleanBaseUrl}/success?session_id={CHECKOUT_SESSION_ID}`
		const cancelUrl = `${cleanBaseUrl}/cancel`

		// Stripe refuses any charge under $0.50 — a manual-capture hold included — and the
		// rejection surfaces as an opaque 500 at the buyer's checkout. Catch it here with
		// real numbers. This covers both an event saved at a sub-minimum price before that
		// was validated, and a discount that drags an otherwise fine total under the floor.
		// Unit prices come from the event record rather than the request body, so the figure
		// matches what Stripe is actually being asked to charge.
		const chargeSubtotal = tickets.reduce((sum, ticket) => {
			const stored = (event.tickets || []).find((et: any) => et?.stripeProductId === ticket.priceId)
			const unitPrice = Number(stored?.price ?? ticket.price) || 0
			return sum + unitPrice * (Number(ticket.quantity) || 0)
		}, 0)
		const chargePricing = buildTicketPricing({
			subtotal: chargeSubtotal,
			referralCode: referralCodeData?.code,
			referralPercentage: referralCodeData?.discountPercentage,
		})
		if (isBelowStripeMinimum(chargePricing.total)) {
			console.warn("[checkout/index] Order below Stripe minimum:", { subtotal: chargeSubtotal, total: chargePricing.total })
			return sendResponse(
				res,
				null,
				`This order comes to $${chargePricing.total.toFixed(2)}. Payments must be at least $${STRIPE_MIN_CHARGE_USD.toFixed(2)} — please contact the host.`,
				false,
				ResCode.BAD_REQUEST,
			)
		}

		// A referral code is the only discount left — the Premium member discount was retired.
		let discountConfig: Stripe.Checkout.SessionCreateParams.Discount[] | undefined = undefined
		if (referralCodeData && referralCodeData.discountPercentage > 0) {
			try {
				// Stripe hard-limits coupon.name to 40 characters and rejects the whole call if
				// it's longer. The name embeds a host-supplied referral code, so clamp it.
				const couponName = `Referral: ${referralCodeData.code}`.slice(0, 40)

				// On a bundled order the session-level discount would otherwise apply to the
				// WHOLE charge — quietly taking the host's referral percentage off Jetzy's
				// membership revenue too. Restrict the coupon to the ticket products.
				//
				// `applies_to` takes PRODUCT ids, but `ticket.stripeProductId` actually holds a
				// PRICE id (`api/events/create.ts` calls `stripe.prices.create`), so the product
				// has to be read back off the price.
				let appliesTo: Stripe.CouponCreateParams.AppliesTo | undefined = undefined
				if (bundlePlan.toCharge.length > 0) {
					const productIds = await Promise.all(
						tickets.map(async (t) => {
							const price = await stripe.prices.retrieve(t.priceId)
							return typeof price.product === "string" ? price.product : price.product.id
						}),
					)
					appliesTo = { products: Array.from(new Set(productIds)) }
				}

				const coupon = await stripe.coupons.create({
					percent_off: referralCodeData.discountPercentage,
					duration: 'once',
					name: couponName,
					...(appliesTo ? { applies_to: appliesTo } : {}),
				})

				discountConfig = [{
					coupon: coupon.id,
				}]
			} catch (couponError: any) {
				// Never fall through to a full-price session. The buyer was promised a
				// discount; charging them in full instead is worse than making them retry.
				console.error("[checkout/index] Coupon creation failed:", couponError?.message || couponError)
				return sendResponse(res, null, "We couldn't apply your discount. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
			}
		}

		// Prepare metadata
		const metadata: Stripe.MetadataParam = {
			firstName: user.firstName,
			lastName: user.lastName,
			email: user.email,
			phone: user.phone,
			tickets: typeof req.body.tickets === 'string' ? req.body.tickets : JSON.stringify(tickets),
			eventId: tickets[0]?.eventId || "",
			eventDetails: JSON.stringify(eventDetails),
			acceptedTerms: "true",
			acceptedTermsAt: acceptedTermsAt.toISOString(),
			bookingRef,
			requiresApproval: requiresApproval ? "true" : "false",
			...(buyerId ? { bookerUserId: String(buyerId) } : {}),
		}

		if (referralCodeData) {
			metadata.referralCode = referralCodeData.code
			metadata.referralDiscountPercentage = referralCodeData.discountPercentage.toString()
		}

		// The TICKET-ONLY figures. On a bundled session Stripe's `amount_total` is the whole
		// first invoice (ticket + first month of membership), so fulfilment must never derive
		// the booking total from it — it reads these instead.
		metadata.ticketSubtotal = chargePricing.subtotal.toFixed(2)
		metadata.ticketTotal = chargePricing.total.toFixed(2)

		if (customAnswers && customAnswers.length > 0) {
			customAnswers.forEach(ans => {
				const val = typeof ans.answer === 'string' ? ans.answer : JSON.stringify(ans.answer);
				// Truncate to 500 characters to fit Stripe metadata limits safely
				metadata[`ans_${ans.questionId}`] = val.slice(0, 500);
			});
		}

		// ---- Bundled order: one payment that buys the ticket AND the first membership period ----
		//
		// ALWAYS `mode: "payment"`, with or without approval, and the subscriptions are created
		// by us afterwards — at fulfilment for an immediate purchase, at approval for a held one
		// — each with a trial covering the period this charge already paid for.
		//
		// This used to be a `mode: "subscription"` session for the immediate case, letting
		// Stripe create the subscription atomically with the charge. That cannot survive a
		// ticket selling TWO memberships: a Checkout Session creates at most ONE subscription,
		// and a single subscription carrying both products would mean cancelling either one
		// cancels both. Selling them as one-time line items is the only shape that yields two
		// independent subscriptions from one payment.
		//
		// The trade-off is deliberate: we lose atomic charge-and-subscribe, so a failure between
		// the two leaves someone charged with no membership. That risk already existed on the
		// approval path and is handled the same way — the booking stays valid, the gap is
		// recorded per product as `status: "failed"`, and money is never rolled back to fix it.
		type MembershipLine = { key: MembershipKey; amount: number; currency: string; priceId: string; interval: string }
		let membershipLines: MembershipLine[] = []
		let membershipExtras: Partial<Stripe.Checkout.SessionCreateParams> = {}

		if (bundlePlan.toCharge.length > 0) {
			try {
				// The buyer needs a durable Jetzy account and a Stripe Customer: every renewal
				// and cancellation webhook resolves them by customer id. A guest is auto-created
				// here from the email they typed — `createOrUpdateUser` ran above and matches
				// case-insensitively, so an existing account is reused.
				const { Users } = await import("@/models/userModal")
				const userDoc = await Users.findOne({ email: { $regex: `^${user.email.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } }).select("_id")

				// The TYPED EMAIL owns the membership, not the session.
				//
				// This used to read `buyerId || userDoc?._id`, which split the flow in half:
				// eligibility was checked against the typed address while the subscription was
				// created for whoever happened to be logged in. Buying a bundled ticket for
				// someone else gave THEM the ticket and YOU the membership — and because their
				// account was never activated, every repeat purchase stacked another
				// subscription onto the logged-in user's single Stripe customer.
				//
				// `createOrUpdateUser` ran earlier with this address, so the document exists.
				// `buyerId` remains only as a fallback for the case where that call failed and
				// there would otherwise be nobody to attach the subscription to.
				const subscriberId = userDoc?._id || buyerId
				if (!subscriberId) {
					console.error("[checkout/index] Bundled checkout has no user to attach the membership to:", user.email)
					return sendResponse(res, null, "We couldn't set up your membership. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
				}

				// ONE Stripe Customer per user, holding every subscription they have. That is
				// what lets the billing portal show both memberships behind a single link — and
				// exactly why every write keyed off it must name its product.
				const customerId = await resolveStripeCustomerForUser(String(subscriberId), user.email)

				// Ask STRIPE, not our own copy, whether they're already subscribed — per product.
				// `heldMemberships` above reads the `active` flags, which are only set once the
				// webhook lands, so two purchases in quick succession or any webhook delay would
				// still double-subscribe. Stripe is the source of truth for billing state; Mongo
				// is a cache that can lag.
				const stillOwed: MembershipKey[] = []
				for (const key of bundlePlan.toCharge) {
					if (await hasActiveMembershipSubscription(customerId, key)) {
						console.warn(`[checkout/index] Customer already subscribed to ${key}; not charging for it:`, customerId)
					} else {
						stillOwed.push(key)
					}
				}
				bundlePlan = {
					...bundlePlan,
					toCharge: stillOwed,
					alreadyHeld: bundlePlan.selected.filter((key) => !stillOwed.includes(key)),
					mode: stillOwed.length > 0 ? "bundle" : "already-member",
				}

				for (const key of stillOwed) {
					// A recurring price can't be a line item in payment mode, hence the inline
					// `price_data` rather than the price id. The price id is still carried in
					// metadata so the subscription created later uses the exact rate quoted here.
					const price = await getMembershipPrice(key)
					if (price.unit_amount == null) {
						throw new Error(`${MEMBERSHIPS[key].label} price has no unit_amount and can't be charged`)
					}
					membershipLines.push({
						key,
						amount: price.unit_amount / 100,
						currency: price.currency || "usd",
						priceId: price.id,
						interval: price.recurring?.interval || "month",
					})
				}

				if (membershipLines.length > 0) {
					membershipExtras = {
						// Payment mode with a Customer, because the card saved here is the one the
						// subscriptions will charge at renewal.
						customer: customerId,
						line_items: [
							...prices,
							...membershipLines.map((line) => ({
								quantity: 1,
								price_data: {
									currency: line.currency,
									unit_amount: Math.round(line.amount * 100),
									product_data: {
										name: `${MEMBERSHIPS[line.key].label} — first ${line.interval}`,
										description: requiresApproval
											? "Starts only if the host approves your request."
											: "Renews automatically. Cancel any time.",
									},
								},
							})),
						],
					}

					// Read back at fulfilment and at approval. Stored as JSON so a second product
					// needs no extra metadata keys — Stripe caps a session at 50 of them.
					metadata.purpose = "ticket+membership"
					metadata.membershipUserId = String(subscriberId)
					metadata.memberships = JSON.stringify(membershipLines)
				}
			} catch (bundleSetupError: any) {
				console.error("[checkout/index] Failed to set up the bundled membership:", bundleSetupError?.message || bundleSetupError)
				return sendResponse(res, null, "We couldn't set up your membership. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
			}
		}

		const chargesMembership = membershipLines.length > 0

		// create a checkout session
		const session = await stripe.checkout.sessions.create({
			client_reference_id: reference,
			payment_method_types: ["card"],
			line_items: prices,
			mode: "payment",
			success_url: successUrl,
			cancel_url: cancelUrl,
			metadata: metadata,
			// Stripe rejects `customer` and `customer_email` together, and a bundled order
			// must attach to a real Customer so the subscriptions are resolvable later.
			...(chargesMembership ? {} : { customer_email: user.email }),
			discounts: discountConfig,
			// Overrides line_items/customer, adding the membership lines and the Customer.
			...membershipExtras,
			// `payment_intent_data` is needed for two independent reasons — a hold, and a saved
			// card — so it is built once from both. The ordinary paid ticket (neither approval
			// nor membership) still gets no `payment_intent_data` at all, byte-identical to
			// before.
			...(requiresApproval || chargesMembership
				? {
					...(requiresApproval ? { submit_type: "book" as const } : {}),
					payment_intent_data: {
						// Approval orders authorize the card without charging it.
						...(requiresApproval
							? { capture_method: "manual" as const, description: `Approval hold — ${event.name}` }
							: {}),
						// Saves the card against the Customer so the subscriptions created after
						// this charge have something to bill at renewal. Required on EVERY bundled
						// order now, not just held ones — no subscription is created by Stripe any
						// more, so without this every membership would bill once and then die at
						// its first renewal.
						...(chargesMembership ? { setup_future_usage: "off_session" as const } : {}),
						// Duplicated from the session metadata on purpose: `payment_intent.*`
						// webhook events carry the PaymentIntent's metadata, not the session's,
						// and the expiry handler needs to find the booking from one of those.
						metadata: {
							bookingRef,
							eventId: String(event._id),
							requiresApproval: requiresApproval ? "true" : "false",
						},
					},
					...(requiresApproval
						? {
							custom_text: {
								submit: {
									message: chargesMembership
										? `You won't be charged now. We'll hold your ticket and the first period of ${membershipLabelList(
											membershipLines.map((l) => l.key),
										)} on your card, and only charge you — and start your membership — if the host approves. The hold is released automatically if your request is declined.`
										: "You won't be charged now. We'll place a temporary hold on your card and only charge you if the host approves your request. Holds are released automatically if your request is declined.",
								},
							},
						}
						: {}),
				}
				: {}),
		}).catch((stripeError: any) => {
			console.error("[checkout/index] Stripe session creation failed:", stripeError.message)
			throw new Error(`Stripe error: ${stripeError.message}`)
		})

		if (session) {
			console.log("[checkout/index] Checkout session created:", session.id, requiresApproval ? "(approval hold)" : "")
			return sendResponse(res, { ...session, requiresApproval }, "Checkout created successfully!", true, ResCode.OK)
		}

		return sendResponse(res, null, "Couldn't complete checkout.", false, ResCode.BAD_REQUEST)
	} catch (error: any) {
		console.error("[checkout/index] CRITICAL ERROR:", error.message || error)
		if (error.stack) console.error(error.stack)
		// The top-level `message` matters: the client toaster reads `err.message` and, when
		// the only message was nested under `error`, every failure here rendered as the
		// useless "Something went wrong. Please try again." `error` is kept for callers
		// that already read that shape.
		return res.status(500).json({
			status: false,
			message: error.message || "An unexpected server error occurred",
			error: {
				code: "500",
				message: error.message || "An unexpected server error occurred"
			}
		})
	}
}

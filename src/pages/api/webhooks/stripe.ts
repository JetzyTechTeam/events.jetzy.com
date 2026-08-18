import { ensureDbConnected } from "@/configs/database"
import {
	findEmailRecipientByStripeCustomerId,
	findUserByStripeCustomerId,
	getStripeClient,
	setMembershipStatusByStripeCustomerId,
	setUserMembershipStatus,
	subscriptionMembershipKey,
} from "@/lib/premium"
import { MEMBERSHIPS, type MembershipKey } from "@/lib/memberships"
import { syncSelectMembership } from "@/lib/select-member"
import {
	sendMembershipCancelled,
	sendMembershipPaymentFailed,
	sendMembershipPlanChanged,
	sendMembershipRenewed,
	sendMembershipStarted,
} from "@/lib/send-grid"
import { NextApiRequest, NextApiResponse } from "next"
import Stripe from "stripe"

/**
 * Mirror a membership state change to selectmember.jetzy.com, when the product is theirs.
 *
 * Driven from the webhook rather than only at purchase, so it also covers a cancellation made
 * in the Stripe billing portal — which never passes back through our checkout code. Silently
 * a no-op for Jetzy Premium: `selectMemberPlan` is what marks a product as theirs.
 */
const mirrorToSelectMember = async (
	key: MembershipKey,
	customerId: string,
	status: "active" | "cancelled" | "past_due",
	subscription?: Stripe.Subscription,
) => {
	if (!MEMBERSHIPS[key].selectMemberPlan) return
	const recipient = await findEmailRecipientByStripeCustomerId(customerId)
	if (!recipient?.email) {
		console.error("[webhooks/stripe] No email to mirror to SelectMember for customer:", customerId)
		return
	}
	await syncSelectMembership({
		email: recipient.email,
		status,
		externalSubscriptionId: subscription?.id,
		...(subscription?.start_date ? { startedAt: new Date(subscription.start_date * 1000) } : {}),
		...(subscription?.current_period_end ? { expiresAt: new Date(subscription.current_period_end * 1000) } : {}),
	})
}

// Stripe needs the raw, unparsed request body to verify the webhook signature.
export const config = {
	api: {
		bodyParser: false,
	},
}

function readRawBody(req: NextApiRequest): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = []
		req.on("data", (chunk) => chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk))
		req.on("end", () => resolve(Buffer.concat(chunks)))
		req.on("error", reject)
	})
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return res.status(405).json({ message: "Method not allowed" })
	}

	const signature = req.headers["stripe-signature"]
	const webhookSecret = process.env.NEXT_STRIPE_WEBHOOK_SECRET

	if (!signature || !webhookSecret) {
		console.error("[webhooks/stripe] Missing signature or NEXT_STRIPE_WEBHOOK_SECRET")
		return res.status(400).json({ message: "Webhook not configured" })
	}

	const stripe = getStripeClient()
	let event: Stripe.Event

	try {
		const rawBody = await readRawBody(req)
		event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
	} catch (error: any) {
		console.error("[webhooks/stripe] Signature verification failed:", error.message)
		return res.status(400).json({ message: `Webhook Error: ${error.message}` })
	}

	await ensureDbConnected()

	try {
		switch (event.type) {
			case "checkout.session.completed": {
				const checkoutSession = event.data.object as Stripe.Checkout.Session

				// Dispatch on what the session CONTAINS, not on its `mode`.
				//
				// A bundled ticket session is `mode: "payment"` and creates no subscription of its
				// own any more — we create those afterwards — so in practice only a standalone
				// `/subscribe` purchase reaches the subscription branch. It is kept for two
				// reasons: sessions created before that change can still be in flight, and a
				// session that somehow carries both must run BOTH branches. These used to be
				// `if (subscription) … else if (payment)`, which meant a bundled session activated
				// Premium and never created the booking: no Bookings row, no capacity consumed, no
				// QR, no ticket email, no referral increment, while the buyer was charged in full.
				const sessionMetadata = (checkoutSession.metadata || {}) as Record<string, string | undefined>

				if (checkoutSession.subscription) {
					const subscription = await stripe.subscriptions.retrieve(
						typeof checkoutSession.subscription === "string" ? checkoutSession.subscription : checkoutSession.subscription.id,
					)
					// WHICH product? Writing without asking is how a Concierge purchase would
					// overwrite the buyer's Premium record. An unknown product is left alone.
					const key = subscriptionMembershipKey(subscription)
					const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id

					// WHO does this belong to? Our own session metadata first, then the ids
					// stamped on the Stripe objects themselves.
					//
					// The metadata-only version of this missed every membership sold by ANOTHER
					// Jetzy surface against the shared Stripe account. selectmember.jetzy.com now
					// sells Jetzy Premium; its Checkout Session carries no metadata of ours, so a
					// real purchase logged "no resolvable user" and this portal went on showing
					// "Buy Jetzy Premium" to a paying member. The subscription is one Stripe
					// object away from an id in both cases — read it rather than requiring the
					// other surface to speak our metadata dialect.
					const subscriptionUserId = (subscription.metadata || {}).userId
					const userId =
						sessionMetadata.membershipUserId ||
						sessionMetadata.userId ||
						checkoutSession.client_reference_id ||
						subscriptionUserId ||
						// Last: customer metadata, then the customer's email. Both live inside
						// `findUserByStripeCustomerId`, which also links the id for next time.
						(await findUserByStripeCustomerId(customerId))?.doc?._id?.toString()

					if (!key) {
						console.error("[webhooks/stripe] Subscription for an unrecognised product, ignoring:", subscription.id)
					} else if (userId) {
						await setUserMembershipStatus(userId, key, {
							active: subscription.status === "active" || subscription.status === "trialing",
							stripeCustomerId: customerId,
							stripeSubscriptionId: subscription.id,
							status: subscription.status,
							currentPeriodEnd: new Date(subscription.current_period_end * 1000),
							cancelAtPeriodEnd: subscription.cancel_at_period_end,
						})
						await mirrorToSelectMember(key, customerId, "active", subscription)

						// Welcome the buyer — but only for a signup WE sold.
						//
						// `purpose` is stamped by `/api/subscriptions/checkout`. A subscription
						// Checkout Session reaching this branch from anywhere else is
						// selectmember.jetzy.com selling on the shared Stripe account, and they
						// send their own confirmation: a second one from us would be two receipts
						// for one purchase, worded to their customer as if we had sold it.
						//
						// A membership bought WITH A TICKET never reaches here at all — those are
						// `mode: "payment"` sessions and the subscription is created afterwards by
						// `startMembershipSubscription`, with the ticket confirmation carrying the
						// recurring terms.
						// The sale, for reporting. Recorded for EVERY subscription session, ours or not:
						// "how many members did we gain" is a different question from "did we sell
						// it", and a SelectMember sale is still a Jetzy Premium member. `source`
						// keeps the two apart. Upserted on the subscription id, so a replayed
						// webhook doesn't inflate the count.
						{
							const recipient = await findEmailRecipientByStripeCustomerId(customerId)
							const soldPrice = subscription.items.data[0]?.price
							const { recordMembershipPurchase } = await import("@/models/events/membership-purchases")
							await recordMembershipPurchase({
								key,
								source: sessionMetadata.purpose === "premium_subscription" ? "subscribe" : "external",
								email: recipient?.email || checkoutSession.customer_details?.email || undefined,
								name: recipient?.firstName,
								userId,
								stripeCustomerId: customerId,
								stripeSubscriptionId: subscription.id,
								priceId: soldPrice?.id,
								interval: soldPrice?.recurring?.interval,
								...(soldPrice?.unit_amount != null ? { amount: soldPrice.unit_amount / 100 } : {}),
								...(soldPrice?.currency ? { currency: soldPrice.currency } : {}),
								// The whole reason the code is stamped into session metadata.
								...(sessionMetadata.inviteCode ? { inviteCode: sessionMetadata.inviteCode } : {}),
								...(subscription.trial_end
									? { trialEndsAt: new Date(subscription.trial_end * 1000) }
									: {}),
							})
						}

						if (sessionMetadata.purpose === "premium_subscription") {
							const recipient = await findEmailRecipientByStripeCustomerId(customerId)
							const price = subscription.items.data[0]?.price
							if (recipient?.email && price?.unit_amount != null) {
								await sendMembershipStarted({
									...recipient,
									amount: price.unit_amount / 100,
									interval: price.recurring?.interval || "month",
									label: MEMBERSHIPS[key].label,
									// An invite code means NOTHING has been charged yet and the first
									// payment lands on a named date. The copy branches on this.
									...(subscription.trial_end ? { trialEndsOn: new Date(subscription.trial_end * 1000) } : {}),
									nextBillingDate: new Date(subscription.current_period_end * 1000),
								})
							} else {
								console.error("[webhooks/stripe] Could not send the membership welcome email:", checkoutSession.id)
							}
						} else {
							console.log("[webhooks/stripe] Subscription not sold by this app — no welcome email:", checkoutSession.id)
						}
					} else {
						// A subscription nobody owns can still bill. Loud, because the only fix is
						// manual. `client_reference_id` is single-valued and the ticket flow claims
						// it, which is why membership sessions carry `metadata.membershipUserId`.
						console.error("[webhooks/stripe] Subscription with no resolvable user:", checkoutSession.id)
					}
				}

				// Ticket purchase. The authoritative fulfilment path: without it a buyer who
				// never returns to /success would leave a live card hold — or a paid ticket —
				// with no booking row anywhere. Idempotent on bookingRef, so racing /success
				// is harmless.
				if (sessionMetadata.bookingRef) {
					const { fulfillCheckoutSessionById } = await import("@/lib/checkout-fulfillment")
					await fulfillCheckoutSessionById(checkoutSession.id)
				}
				break
			}

			// A manual-capture authorization was released. `cancellation_reason: "automatic"`
			// means Stripe expired it — the host ran out of time and the guest can never be
			// charged for this request. Our own reject/cancel flows cancel with an explicit
			// reason and have already written their status, so they fall through untouched.
			case "payment_intent.canceled": {
				const pi = event.data.object as Stripe.PaymentIntent
				const { Bookings } = await import("@/models/events/bookings")
				const { BookingStatus } = await import("@/models/events/types")

				const booking = await Bookings.findOne({ "payment.paymentIntentId": pi.id })
				if (!booking) break
				if (booking.payment?.status === "captured") break // defensive: money already taken
				if (booking.status === BookingStatus.REJECTED || booking.status === BookingStatus.CANCELLED) break

				const expired = pi.cancellation_reason === "automatic"
				if (!booking.payment) booking.payment = {}
				booking.payment.status = expired ? "expired" : "canceled"
				booking.payment.canceledAt = new Date()
				if (expired) booking.status = BookingStatus.FAILED
				await booking.save()

				if (expired) {
					try {
						const { Events } = await import("@/models/events")
						const { sendApprovalRejected, sendAdminApprovalNotice } = await import("@/lib/send-grid")
						const bookingEvent = await Events.findById(booking.eventId)
						if (bookingEvent) {
							const [firstName, ...rest] = (booking.customerName || "").split(" ")
							const lastName = rest.join(" ")
							const amount = booking.payment?.amount || booking.total || 0
							await sendApprovalRejected({
								event: bookingEvent,
								firstName,
								lastName,
								email: booking.customerEmail,
								reason: "expired",
								payment: { amount },
							})
							// The host is not looking at a screen when this fires — tell them, or
							// they silently lose a paying guest.
							await sendAdminApprovalNotice({
								event: bookingEvent,
								firstName,
								lastName,
								email: booking.customerEmail,
								eventId: String(booking.eventId),
								kind: "expired",
								amountOnHold: amount,
							})
						}
					} catch (emailError) {
						console.error("[webhooks/stripe] Failed to send hold-expiry emails:", emailError)
					}
				}
				break
			}

			case "payment_intent.payment_failed": {
				const pi = event.data.object as Stripe.PaymentIntent
				const { Bookings } = await import("@/models/events/bookings")
				await Bookings.updateOne(
					{ "payment.paymentIntentId": pi.id, "payment.status": { $in: ["authorized", "capturing"] } },
					{ $set: { "payment.status": "failed", "payment.lastError": pi.last_payment_error?.message || "payment_failed" } },
				)
				break
			}

			case "customer.subscription.updated": {
				const subscription = event.data.object as Stripe.Subscription
				const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id

				// WHICH product? One Stripe Customer holds every subscription a member has, so
				// keying only on the customer id — as this used to — makes a Concierge change
				// overwrite the Premium record and vice versa.
				const key = subscriptionMembershipKey(subscription)
				if (!key) {
					console.error("[webhooks/stripe] subscription.updated for an unrecognised product, ignoring:", subscription.id)
					break
				}

				// Read the stored flag BEFORE writing, so a cancellation can be detected as a
				// transition. With the portal set to "cancel at end of billing period" this is
				// the only signal that the member cancelled — `customer.subscription.deleted`
				// doesn't arrive until the period actually ends, up to a month later.
				const previous = await findUserByStripeCustomerId(customerId)
				const wasCancelling = !!previous?.doc?.[MEMBERSHIPS[key].userField]?.cancelAtPeriodEnd

				await setMembershipStatusByStripeCustomerId(customerId, key, {
					active: subscription.status === "active" || subscription.status === "trialing",
					stripeSubscriptionId: subscription.id,
					status: subscription.status,
					currentPeriodEnd: new Date(subscription.current_period_end * 1000),
					cancelAtPeriodEnd: subscription.cancel_at_period_end,
				})

				// Their site has to learn about a portal cancellation too — it never passes
				// through our checkout code. Still "active" until the period actually ends.
				await mirrorToSelectMember(
					key,
					customerId,
					subscription.status === "active" || subscription.status === "trialing" ? "active" : "cancelled",
					subscription,
				)

				// A PLAN CHANGE — monthly to annual, in practice.
				//
				// Detected from `previous_attributes`, which is the only signal available: the
				// interval is deliberately not stored (a copy goes stale the moment someone
				// switches in the portal), so there is nothing local to compare against. Stripe
				// sends `items` in `previous_attributes` only when the items actually changed, so
				// a trial converting or a card being updated doesn't reach this.
				//
				// The switch happens entirely inside Stripe's portal, so without this the member
				// has only their card statement to tell them what they now pay.
				const previousItems = (event.data as any)?.previous_attributes?.items?.data
				const previousPriceId = previousItems?.[0]?.price?.id
				const newPrice = subscription.items.data[0]?.price
				if (previousPriceId && newPrice?.id && previousPriceId !== newPrice.id && newPrice.unit_amount != null) {
					const recipient = await findEmailRecipientByStripeCustomerId(customerId)
					if (recipient?.email) {
						// The old rate is fetched rather than guessed: "you now pay $200/year" on
						// its own reads like a price rise nobody announced.
						let previousAmount: number | undefined
						let previousInterval: string | undefined
						try {
							const previous = await stripe.prices.retrieve(previousPriceId)
							if (previous.unit_amount != null) previousAmount = previous.unit_amount / 100
							previousInterval = previous.recurring?.interval
						} catch (priceError: any) {
							// Not worth withholding the message over — it just says less.
							console.error("[webhooks/stripe] Couldn't read the previous price for the plan-change email:", priceError?.message || priceError)
						}

						await sendMembershipPlanChanged({
							...recipient,
							amount: newPrice.unit_amount / 100,
							interval: newPrice.recurring?.interval || "month",
							...(previousAmount != null ? { previousAmount } : {}),
							...(previousInterval ? { previousInterval } : {}),
							nextBillingDate: new Date(subscription.current_period_end * 1000),
							label: MEMBERSHIPS[key].label,
						})
					}
				}

				if (!wasCancelling && subscription.cancel_at_period_end) {
					const recipient = await findEmailRecipientByStripeCustomerId(customerId)
					if (recipient) {
						await sendMembershipCancelled({
							...recipient,
							endsOn: new Date(subscription.current_period_end * 1000),
							alreadyEnded: false,
							label: MEMBERSHIPS[key].label,
						})
					}
				}
				break
			}

			case "customer.subscription.deleted": {
				const subscription = event.data.object as Stripe.Subscription
				const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id

				// Same rule as above, and the one that mattered most: without it, ending a
				// Concierge subscription revoked the member's Jetzy Premium.
				const key = subscriptionMembershipKey(subscription)
				if (!key) {
					console.error("[webhooks/stripe] subscription.deleted for an unrecognised product, ignoring:", subscription.id)
					break
				}

				// Resolve the recipient BEFORE the update — the write doesn't clear the customer
				// id, but reading first keeps this independent of that.
				const recipient = await findEmailRecipientByStripeCustomerId(customerId)

				await setMembershipStatusByStripeCustomerId(customerId, key, {
					active: false,
					status: subscription.status,
					cancelAtPeriodEnd: false,
				})

				await mirrorToSelectMember(key, customerId, "cancelled", subscription)

				if (recipient) {
					await sendMembershipCancelled({ ...recipient, alreadyEnded: true, label: MEMBERSHIPS[key].label })
				}
				break
			}

			// Renewals. `subscription_create` is the FIRST invoice — that one is the bundled
			// ticket purchase, already covered by the ticket confirmation email, so emailing
			// here too would send two receipts for one transaction.
			case "invoice.paid": {
				const invoice = event.data.object as Stripe.Invoice
				const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id
				if (!customerId || invoice.billing_reason !== "subscription_cycle") break

				// Name the product. A member of both gets two renewal notices a month, and an
				// unlabelled one tells them nothing about which card charge it explains.
				const renewedSubscription = invoice.subscription
					? await stripe.subscriptions.retrieve(
						typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription.id,
					)
					: null
				const key = renewedSubscription ? subscriptionMembershipKey(renewedSubscription) : null
				if (renewedSubscription && !key) {
					console.error("[webhooks/stripe] invoice.paid for an unrecognised product, ignoring:", renewedSubscription.id)
					break
				}

				// Push the new period end outward so their site's expiry stays in step.
				if (key && renewedSubscription) await mirrorToSelectMember(key, customerId, "active", renewedSubscription)

				const recipient = await findEmailRecipientByStripeCustomerId(customerId)
				if (!recipient) break

				const line = invoice.lines?.data?.[0]
				await sendMembershipRenewed({
					...recipient,
					amount: (invoice.amount_paid ?? 0) / 100,
					interval: line?.price?.recurring?.interval || "month",
					nextBillingDate: invoice.period_end ? new Date(invoice.period_end * 1000) : undefined,
					...(key ? { label: MEMBERSHIPS[key].label } : {}),
				})
				break
			}

			// A failed renewal. Without this the card expires, Stripe gives up retrying, and
			// the member loses access having never been told anything was wrong.
			case "invoice.payment_failed": {
				const invoice = event.data.object as Stripe.Invoice
				const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id
				if (!customerId || !invoice.subscription) break

				const failedSubscription = await stripe.subscriptions.retrieve(
					typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription.id,
				)
				const key = subscriptionMembershipKey(failedSubscription)
				if (!key) {
					console.error("[webhooks/stripe] invoice.payment_failed for an unrecognised product, ignoring:", failedSubscription.id)
					break
				}

				// Tell their site the member is behind, so benefits can be gated there while
				// Stripe retries — rather than staying "active" right up to the day it dies.
				await mirrorToSelectMember(key, customerId, "past_due", failedSubscription)

				const recipient = await findEmailRecipientByStripeCustomerId(customerId)
				if (!recipient) break

				const line = invoice.lines?.data?.[0]
				await sendMembershipPaymentFailed({
					...recipient,
					amount: (invoice.amount_due ?? 0) / 100,
					interval: line?.price?.recurring?.interval || "month",
					label: MEMBERSHIPS[key].label,
				})
				break
			}

			default:
				break
		}

		return res.status(200).json({ received: true })
	} catch (error: any) {
		console.error("[webhooks/stripe] Handler error:", error.message || error)
		return res.status(500).json({ message: "Webhook handler failed" })
	}
}

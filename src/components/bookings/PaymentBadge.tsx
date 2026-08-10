import React from "react"
import { Badge, Text, Tooltip } from "@chakra-ui/react"
import { DateTime } from "luxon"
import { holdTimeRemaining, isHoldExpired } from "@/lib/booking-status"
import { describeDiscount } from "@/lib/booking-revenue"

/**
 * Money state of a booking, rendered identically everywhere it appears — the Approvals
 * panel, the host booking table, and the guest's own booking detail. Extracted so those
 * three surfaces can never disagree about whether a card was actually charged.
 *
 * A cancelled booking whose payment is still `captured` deliberately keeps reading
 * "charged": Jetzy issues no refunds, so the money genuinely is still ours.
 */

const money = (n?: number) => `$${Number(n || 0).toFixed(2)}`

const HOUR = 60 * 60 * 1000

/** Colour-coded "expires in N days" for an outstanding card hold. */
export function HoldExpiry({ booking }: { booking: any }) {
	const remaining = holdTimeRemaining(booking)
	// No hold to expire. Said explicitly rather than left as "—", which reads as missing data:
	// a $0 order (free ticket, or comped to nothing) never had a card authorized, because
	// Stripe rejects a zero-amount authorization and those orders skip it entirely.
	if (remaining === null) return <Text color="#9C9C9C" fontSize="xs">No hold</Text>
	if (remaining <= 0) return <Badge colorScheme="red">Expired</Badge>

	const color = remaining < 24 * HOUR ? "red.300" : remaining < 72 * HOUR ? "orange.300" : "#9C9C9C"
	return (
		<Text color={color} fontWeight={remaining < 24 * HOUR ? 700 : 400}>
			{DateTime.fromISO(new Date(booking.payment.authExpiresAt).toISOString()).toRelative()}
		</Text>
	)
}

/** What is happening with this booking's money, in one badge. */
export function PaymentBadge({ booking }: { booking: any }) {
	const payment = booking?.payment

	// No payment record. Three different things land here and they must not look alike:
	//
	//   - a genuinely free ticket        -> "Free"
	//   - a paid ticket comped to zero   -> "Free · CODE", because the host approving it needs
	//                                       to know a code did that, not the ticket price
	//   - a priced booking with no       -> "Not recorded". ~238 legacy rows predate the
	//     payment sub-doc                   `payment` sub-doc; their money state is genuinely
	//                                       unknown and must never be called free or charged.
	//
	// This used to render "—" for all three, which reads as missing data — and did, when a
	// host looked at a comped request and thought the amount had failed to load.
	if (!payment?.status) {
		const total = Number(booking?.total ?? 0) || 0
		if (total > 0) {
			return (
				<Tooltip label="This booking predates payment tracking, so whether it was charged isn't recorded." hasArrow>
					<Badge colorScheme="gray">Not recorded</Badge>
				</Tooltip>
			)
		}
		const discount = describeDiscount(booking)
		return discount.comped
			? <Badge colorScheme="blue">{discount.label}</Badge>
			: <Text color="#9C9C9C">Free</Text>
	}

	switch (payment.status) {
		case "authorized":
		case "capturing":
			return isHoldExpired(booking)
				? <Badge colorScheme="red">Hold expired</Badge>
				: <Badge colorScheme="orange">{money(payment.amount)} on hold</Badge>
		case "captured":
			return <Badge colorScheme="green">{money(payment.amount)} charged</Badge>
		case "failed":
			return <Badge colorScheme="red">Charge failed</Badge>
		case "expired":
			return <Badge colorScheme="red">Hold expired</Badge>
		case "canceled":
			return <Badge colorScheme="gray">{money(payment.amount)} released</Badge>
		default:
			return <Text color="#9C9C9C">—</Text>
	}
}

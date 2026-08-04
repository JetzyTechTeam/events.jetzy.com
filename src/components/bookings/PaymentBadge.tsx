import React from "react"
import { Badge, Text } from "@chakra-ui/react"
import { DateTime } from "luxon"
import { holdTimeRemaining, isHoldExpired } from "@/lib/booking-status"

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
	if (remaining === null) return <Text color="#9C9C9C">—</Text>
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
	if (!payment?.status) return <Text color="#9C9C9C">—</Text>

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

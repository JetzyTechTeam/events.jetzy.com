import React from "react"
import { Box, Button, Flex, Tooltip } from "@chakra-ui/react"
import { isCaptureFailed, isHoldExpired, holdTimeRemaining } from "@/lib/booking-status"
import type { BookingApprovalsController } from "./useBookingApprovals"

/**
 * The Approve / Reject pair for one pending booking.
 *
 * Shared by the Approvals tab and the Guests tab so the gating rules — a lapsed hold disables
 * Approve, a failed capture relabels it "Retry charge" — exist once. Both screens showing a
 * button the other doesn't is exactly the drift this prevents.
 */

const HOUR = 60 * 60 * 1000

export function ApprovalActions({
	booking,
	controller,
	size = "sm",
}: {
	booking: any
	controller: BookingApprovalsController
	size?: "xs" | "sm"
}) {
	const expired = isHoldExpired(booking)
	const captureFailed = isCaptureFailed(booking)
	const busy = controller.isProcessing(booking?.bookingRef)

	return (
		<Flex gap={2}>
			<Tooltip
				label={expired ? "The card authorization has expired and can no longer be charged. Ask the guest to book again." : ""}
				isDisabled={!expired}
				hasArrow
			>
				<Box as="span">
					<Button
						size={size}
						colorScheme={captureFailed ? "orange" : "green"}
						isLoading={busy}
						isDisabled={expired}
						onClick={() => controller.requestApprove(booking)}
					>
						{captureFailed ? "Retry charge" : "Approve"}
					</Button>
				</Box>
			</Tooltip>
			<Button size={size} variant="outline" colorScheme="red" isDisabled={busy} onClick={() => controller.requestReject(booking)}>
				Reject
			</Button>
		</Flex>
	)
}

/** Requests whose card hold lapses within 48 hours. */
export const expiringSoonBookings = (pending: any[]) =>
	(pending || []).filter((b) => {
		const remaining = holdTimeRemaining(b)
		return remaining !== null && remaining > 0 && remaining < 48 * HOUR
	})

export default ApprovalActions

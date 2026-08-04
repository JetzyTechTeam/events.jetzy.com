import React, { useRef } from "react"
import {
	AlertDialog,
	AlertDialogBody,
	AlertDialogContent,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogOverlay,
	Box,
	Button,
	Text,
} from "@chakra-ui/react"
import { MoneyState } from "@/lib/booking-cancellation"

/**
 * Confirm dialog for cancelling a booking.
 *
 * The whole point of this component is the money warning. Jetzy issues no refunds, so a
 * guest cancelling a booking they already paid for is losing that money — that has to be
 * stated plainly and unmissably before they confirm, not buried in terms. The three money
 * states read very differently and must not be collapsed into one generic sentence:
 * a released hold means they were never charged at all.
 */

type Props = {
	isOpen: boolean
	onClose: () => void
	onConfirm: () => void
	isLoading?: boolean
	eventName?: string
	moneyState: MoneyState
	amount?: number
	/** Host/admin view: they're cancelling someone else's booking, not their own. */
	asManager?: boolean
	guestName?: string
}

const money = (n?: number) => `$${Number(n || 0).toFixed(2)}`

export default function CancelBookingDialog({
	isOpen,
	onClose,
	onConfirm,
	isLoading = false,
	eventName,
	moneyState,
	amount = 0,
	asManager = false,
	guestName,
}: Props) {
	const leastDestructiveRef = useRef<HTMLButtonElement>(null)
	const isCaptured = moneyState === "captured"
	// No payment record but a non-zero total — we can't claim it was charged or that it was
	// free, so the warning is phrased conditionally.
	const isUnknown = moneyState === "unknown"
	const showsMoneyBlock = isCaptured || isUnknown || moneyState === "hold"

	const subject = asManager
		? `${guestName ? `${guestName}'s` : "this"} booking${eventName ? ` for "${eventName}"` : ""}`
		: `your booking${eventName ? ` for "${eventName}"` : ""}`

	return (
		<AlertDialog isOpen={isOpen} onClose={onClose} leastDestructiveRef={leastDestructiveRef} isCentered>
			<AlertDialogOverlay>
				<AlertDialogContent bg="#1E1E1E" color="white" border="1px solid #444">
					<AlertDialogHeader fontSize="lg" fontWeight="bold">
						Cancel booking?
					</AlertDialogHeader>

					<AlertDialogBody>
						<Text mb={showsMoneyBlock ? 4 : 0}>
							Cancel {subject}? The {asManager ? "seat" : "seat you reserved"} will be released and made available to others.
						</Text>

						{moneyState === "hold" && (
							<Box bg="#12243B" border="1px solid #1877F2" rounded="md" px={4} py={3}>
								<Text fontSize="sm" color="#9BC4FF">
									{asManager ? "The guest has" : "You have"} not been charged. The {money(amount)} hold on the card will be
									released immediately.
								</Text>
							</Box>
						)}

						{isCaptured && (
							<Box bg="#2B1414" border="1px solid #DC2626" rounded="md" px={4} py={3}>
								<Text fontSize="sm" fontWeight="bold" color="#FCA5A5" mb={1}>
									This booking is non-refundable.
								</Text>
								<Text fontSize="sm" color="#FCA5A5">
									{money(amount)} {asManager ? "was paid and will NOT be returned to the guest." : "was paid for this booking and will NOT be returned to you."}
								</Text>
							</Box>
						)}

						{isUnknown && (
							<Box bg="#2B1414" border="1px solid #DC2626" rounded="md" px={4} py={3}>
								<Text fontSize="sm" fontWeight="bold" color="#FCA5A5" mb={1}>
									This booking is non-refundable.
								</Text>
								<Text fontSize="sm" color="#FCA5A5">
									{asManager
										? `The booking total is ${money(amount)} but there is no payment record against it. Nothing will be refunded either way — check Stripe if you need to confirm.`
										: `If a payment of ${money(amount)} was made for this booking, it will NOT be returned to you.`}
								</Text>
							</Box>
						)}
					</AlertDialogBody>

					<AlertDialogFooter gap={3}>
						<Button ref={leastDestructiveRef} onClick={onClose} variant="ghost" color="#9C9C9C" _hover={{ bg: "#2A2D31", color: "white" }}>
							Keep booking
						</Button>
						<Button colorScheme="red" onClick={onConfirm} isLoading={isLoading}>
							{isCaptured || isUnknown ? "Cancel anyway" : "Cancel booking"}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialogOverlay>
		</AlertDialog>
	)
}

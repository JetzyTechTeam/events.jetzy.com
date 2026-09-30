import React from "react"
import {
	Button,
	Flex,
	Modal,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalOverlay,
	Text,
	Box,
} from "@chakra-ui/react"

export type EditableTicketRow = {
	ticketId: string
	/** The ticket's name on the event, or a fallback when the ticket type has been deleted. */
	name: string
	quantity: number
}

/**
 * Change how many tickets a FREE booking is for.
 *
 * Offered only where `bookingMoneyState(booking) === "free"`. A paid booking gets no Edit
 * control at all — Jetzy issues no refunds, so there is no honest way to take a seat back or
 * hand one over, and that decision is still open. See `api/bookings/update-tickets.ts`.
 *
 * Only the quantities of tickets ALREADY on the booking can change; there is no way to add a
 * ticket type here, because that would mean pricing, approval and membership decisions this
 * dialog has no payment step to settle.
 */
export default function EditBookingTicketsDialog({
	isOpen,
	onClose,
	onConfirm,
	isLoading = false,
	guestName,
	rows,
}: {
	isOpen: boolean
	onClose: () => void
	onConfirm: (rows: EditableTicketRow[]) => void
	isLoading?: boolean
	guestName?: string
	rows: EditableTicketRow[]
}) {
	const [draft, setDraft] = React.useState<EditableTicketRow[]>(rows)

	// Reseed whenever a different booking is opened — the dialog stays mounted between rows.
	React.useEffect(() => {
		if (isOpen) setDraft(rows)
	}, [isOpen, rows])

	const step = (ticketId: string, delta: number) =>
		setDraft((prev) => prev.map((r) => (r.ticketId === ticketId ? { ...r, quantity: Math.max(0, r.quantity + delta) } : r)))

	const before = rows.reduce((sum, r) => sum + r.quantity, 0)
	const after = draft.reduce((sum, r) => sum + r.quantity, 0)
	const unchanged = after === before && draft.every((r, i) => r.quantity === rows[i]?.quantity)

	return (
		<Modal isOpen={isOpen} onClose={onClose} isCentered>
			<ModalOverlay />
			<ModalContent bg="#1E1E1E" color="white">
				<ModalHeader>Edit tickets</ModalHeader>
				<ModalCloseButton />
				<ModalBody>
					<Text fontSize="sm" color="#B0B0B0" mb={4}>
						{guestName ? `${guestName}'s booking.` : "This booking."} This is a free booking, so nothing is
						charged or returned — only the number of spots held changes.
					</Text>

					{draft.map((row) => (
						<Flex key={row.ticketId} align="center" justify="space-between" gap={4} mb={3}>
							<Text fontSize="sm" noOfLines={2} flex="1">
								{row.name}
							</Text>
							<Flex align="center" gap={2} bg="#090C10" borderRadius="full" p={1} flexShrink={0}>
								<Button size="sm" borderRadius="full" onClick={() => step(row.ticketId, -1)} isDisabled={row.quantity <= 0}>
									-
								</Button>
								<Text minW="28px" textAlign="center" fontWeight="semibold">
									{row.quantity}
								</Text>
								<Button size="sm" borderRadius="full" onClick={() => step(row.ticketId, 1)}>
									+
								</Button>
							</Flex>
						</Flex>
					))}

					<Box mt={4} p={3} bg="#090C10" borderRadius="md">
						<Text fontSize="sm">
							{before} → <strong>{after}</strong> {after === 1 ? "ticket" : "tickets"}
						</Text>
						{after === 0 && (
							<Text fontSize="xs" color="#F79432" mt={1}>
								A booking needs at least one ticket. Cancel it instead if the guest isn&apos;t coming.
							</Text>
						)}
						{after > before && (
							<Text fontSize="xs" color="#B0B0B0" mt={1}>
								Adding spots is refused if the ticket or the event has run out.
							</Text>
						)}
					</Box>
				</ModalBody>
				<ModalFooter>
					<Button
						bg="#F79432"
						color="black"
						mr={3}
						isLoading={isLoading}
						isDisabled={after === 0 || unchanged}
						onClick={() => onConfirm(draft)}
					>
						Save changes
					</Button>
					<Button variant="ghost" color="white" _hover={{ color: "black", bg: "orange" }} onClick={onClose}>
						Cancel
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
	)
}

import React from "react"
import {
	Box,
	Button,
	Flex,
	FormControl,
	FormLabel,
	Input,
	Modal,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalOverlay,
	Switch,
	Text,
	useToast,
} from "@chakra-ui/react"

import RichTextEditor from "@/components/misc/RichTextEditor"
import TicketMembershipToggles from "@/components/events/TicketMembershipToggles"
import { ticketMemberships, ticketMembershipInterval } from "@/lib/premium-bundle"
import { isBelowStripeMinimum, BELOW_MIN_PRICE_MESSAGE } from "@/lib/ticket-pricing"
import { blurOnWheel } from "@/lib/number-input"
import type { TicketData } from "@/components/events/TicketCard"

/**
 * Add / edit one ticket.
 *
 * Extracted out of the manage form so the inline editor on the public event page is literally
 * the same dialog rather than a lookalike — a ticket carries money, and two implementations of
 * its price and membership rules is two chances to disagree.
 *
 * The caller owns the draft (`ticket`) and decides what saving means: manage pushes/replaces
 * into a Formik `FieldArray`, the event page updates its own list. Everything that must not
 * drift — the title check, the Stripe minimum, the blank-price-is-free normalisation and the
 * tri-state approval switch — lives here.
 */
export default function TicketEditorModal({
	isOpen,
	onClose,
	ticket,
	onTicketChange,
	onSave,
	isEditing,
	eventRequireApproval,
	isSaving = false,
}: {
	isOpen: boolean
	onClose: () => void
	ticket: TicketData
	onTicketChange: (next: TicketData) => void
	/** Receives the normalised ticket; the caller decides where it goes. */
	onSave: (normalised: TicketData) => void
	isEditing: boolean
	/** The event-level default an unset per-ticket flag inherits. */
	eventRequireApproval: boolean
	isSaving?: boolean
}) {
	const toast = useToast()

	const save = () => {
		// Only the title is required — description is optional server-side (zod `.optional()`),
		// and requiring it here made tickets created without one impossible to edit.
		if (!ticket.title.trim()) {
			toast({ title: "Missing ticket name", description: "You need to provide a ticket name.", status: "error", duration: 4000, isClosable: true })
			return
		}
		// Stripe won't charge under $0.50, so a ticket priced there can never be sold — the
		// failure would only surface at the buyer's checkout.
		if (isBelowStripeMinimum(ticket.price)) {
			toast({ title: "Price too low", description: BELOW_MIN_PRICE_MESSAGE, status: "error", duration: 5000, isClosable: true })
			return
		}
		// Blank price means free. `parseFloat("")` is NaN, which would otherwise reach the
		// server and fail zod's number check.
		onSave({
			...ticket,
			title: ticket.title.trim(),
			price: Number.isFinite(ticket.price) ? ticket.price : 0,
		})
	}

	return (
		<Modal isOpen={isOpen} onClose={onClose} isCentered>
			<ModalOverlay />
			<ModalContent bg="#1E1E1E" color="white">
				<ModalHeader>{isEditing ? "Edit Ticket" : "Add Ticket"}</ModalHeader>
				<ModalCloseButton />
				<ModalBody>
					<FormControl mb={4}>
						<FormLabel>Ticket Name</FormLabel>
						<Input
							placeholder="Enter ticket name"
							bg="#090C10"
							border="1px solid #444"
							value={ticket.title}
							onChange={(e) => onTicketChange({ ...ticket, title: e.target.value })}
						/>
					</FormControl>
					<FormControl mb={4}>
						<FormLabel>Description</FormLabel>
						{/* Same editor as the event description — stores HTML, rendered publicly through
						    the shared EventDescription, which still handles older plain-text values. */}
						<RichTextEditor
							value={ticket.description}
							onChange={(val) => onTicketChange({ ...ticket, description: val })}
							placeholder="Enter description"
						/>
					</FormControl>
					<FormControl mb={4}>
						<FormLabel>Price</FormLabel>
						{/* NaN would break the controlled value, so an empty field stays empty and is
						    treated as free ($0) on save.

						    `Math.max(0, …)` is the real guard, not `min={0}` — the HTML attribute only
						    styles the spinner and fails on native form submit, which this modal never
						    does, so -5 typed or pasted here reached the server and came back as a
						    validation error the host couldn't act on. Math.max passes NaN through
						    unchanged, so the empty-field behaviour above is untouched. */}
						<Input
							type="number"
							onWheel={blurOnWheel}
							min={0}
							step="0.01"
							placeholder="Enter price (0 for free)"
							bg="#090C10"
							border="1px solid #444"
							value={Number.isFinite(ticket.price) ? ticket.price : ""}
							onChange={(e) => onTicketChange({ ...ticket, price: Math.max(0, parseFloat(e.target.value)) })}
						/>
					</FormControl>
					<FormControl mb={4}>
						<Flex align="center" justify="space-between" gap={4}>
							<Box>
								<FormLabel mb={0}>Require Approval</FormLabel>
								<Text fontSize="12px" color="#868686" mt={1} maxW="320px" lineHeight="140%">
									{ticket.requireApproval === undefined
										? `Inherits the event setting (${eventRequireApproval ? "On" : "Off"})`
										: !ticket.requireApproval
											? "Guests book this ticket instantly."
											: Number(ticket.price) > 0
												? "The card is authorized at checkout and only charged when you approve. Holds expire after 7 days."
												: "Guests request a spot; you approve or decline."}
								</Text>
							</Box>
							<Switch
								colorScheme="orange"
								isChecked={ticket.requireApproval ?? eventRequireApproval}
								onChange={(e) => onTicketChange({ ...ticket, requireApproval: e.target.checked })}
							/>
						</Flex>
					</FormControl>

					{/* Which memberships this ticket sells — either, both or neither. */}
					<TicketMembershipToggles
						value={ticketMemberships(ticket as any)}
						onChange={(memberships) =>
							onTicketChange({
								...ticket,
								memberships,
								// Kept in step so the mobile app and any older reader still see a
								// bundled Premium ticket. The array is the authority.
								includesPremium: memberships.includes("premium"),
							} as any)
						}
						requiresApproval={ticket.requireApproval ?? eventRequireApproval}
						price={Number(ticket.price)}
						interval={ticketMembershipInterval(ticket as any)}
						onIntervalChange={(membershipInterval) => onTicketChange({ ...ticket, membershipInterval } as any)}
					/>
				</ModalBody>
				<ModalFooter>
					<Button bg="#F79432" color="black" mr={3} onClick={save} isLoading={isSaving}>
						{isEditing ? "Save Changes" : "Add Ticket"}
					</Button>
					<Button variant="ghost" color="white" _hover={{ color: "black", bg: "orange" }} onClick={onClose}>
						Cancel
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
	)
}

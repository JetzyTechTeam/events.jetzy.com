import React from "react"
import {
	Badge,
	Box,
	Button,
	Flex,
	FormControl,
	FormLabel,
	Grid,
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
import { ticketMemberships, ticketMembershipInterval, ticketMembershipFreeMonths } from "@/lib/premium-bundle"
import { isBelowStripeMinimum, BELOW_MIN_PRICE_MESSAGE } from "@/lib/ticket-pricing"
import { blurOnWheel } from "@/lib/number-input"
import { ticketQuantityLimit } from "@/lib/ticket-quantity"
import type { TicketData } from "@/components/events/TicketCard"
import {
	ticketApprovalRow,
	ticketCancelButton,
	ticketField,
	ticketModalBody,
	ticketModalClose,
	ticketModalContent,
	ticketModalFooterButtons,
	ticketModalHeader,
	ticketPrimaryButton,
} from "@/components/events/ticketModalMobile"

/**
 * Add / edit one ticket — THE ticket dialog. Create Event, Manage Event and the inline editor on
 * the public event page all render this component; Create used to carry an inline duplicate,
 * which is gone, so a ticket's price and membership rules exist in one place.
 *
 * The caller owns the draft (`ticket`) and decides what saving means: manage and create push /
 * replace into a Formik `FieldArray`, the event page updates its own list. Everything that must
 * not drift — the title check, the Stripe minimum, the blank-price-is-free normalisation and the
 * tri-state approval switch — lives here.
 *
 * LAYOUT. Phones get `ticketModalMobile.ts` (one screen tall, fixed header and footer), every rule
 * of it inside a max-width media query. Desktop is set here with `md`-only props, so neither can
 * reach the other: a 2xl dialog whose header and buttons stay put while the body scrolls, the
 * fields grouped into sections, Price and Quantity side by side, Cancel left of the save button.
 */

/** Section heading — desktop only, where the wider dialog has room to group the fields. */
const SectionTitle = ({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) => (
	<Flex display={{ base: "none", md: "flex" }} align="center" gap={2} mb={3}>
		<Text fontSize="11px" fontWeight={700} color="#9C9C9C" textTransform="uppercase" letterSpacing="0.06em">
			{children}
		</Text>
		{aside}
	</Flex>
)

/** Space and a hairline between sections — desktop only. */
const sectionBreak = { borderTop: { md: "1px solid #2A2D31" }, pt: { md: 5 }, mt: { md: 1 } } as const

export default function TicketEditorModal({
	isOpen,
	onClose,
	ticket,
	onTicketChange,
	onSave,
	isEditing,
	eventRequireApproval,
	isSaving = false,
	soldCount,
	canManageMemberships,
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
	/** How many of this ticket are already booked, so the host can see what a cap would mean. */
	soldCount?: number
	/**
	 * Whether to show the Jetzy Premium / Full Concierge toggles — admin/super-admin only, by
	 * decision. No default: every caller must say explicitly, so a new call site can't leak the
	 * controls to a host by omission.
	 */
	canManageMemberships: boolean
}) {
	const toast = useToast()
	const limit = ticketQuantityLimit(ticket as any)

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
		<Modal isOpen={isOpen} onClose={onClose} isCentered size={{ base: "full", md: "2xl" }}>
			<ModalOverlay />
			{/* Phone layout (one screen tall, header + footer fixed, fields scroll) comes from
			    ticketModalMobile.ts. Every rule in it is inside a max-width media query, and every
			    layout prop below is `md`-only, so the two never meet. */}
			<ModalContent bg="#1E1E1E" color="white" maxH={{ md: "88vh" }} border={{ md: "1px solid #343536" }} {...ticketModalContent}>
				<ModalHeader borderBottom={{ md: "1px solid #343536" }} {...ticketModalHeader}>
					{isEditing ? "Edit Ticket" : "Add Ticket"}
				</ModalHeader>
				<ModalCloseButton {...ticketModalClose} />
				{/* Desktop: only this part scrolls, so the title and the buttons never leave the screen. */}
				<ModalBody overflowY={{ md: "auto" }} minH={{ md: 0 }} py={{ md: 5 }} {...ticketModalBody}>
					<SectionTitle>Ticket details</SectionTitle>
					<FormControl mb={4}>
						<FormLabel>Ticket Name</FormLabel>
						<Input
							placeholder="Enter ticket name"
							bg="#090C10"
							border="1px solid #444"
							{...ticketField}
							value={ticket.title}
							onChange={(e) => onTicketChange({ ...ticket, title: e.target.value })}
						/>
					</FormControl>
					<FormControl mb={4}>
						<FormLabel>Description</FormLabel>
						{/* Same editor as the event description — stores HTML, rendered publicly through
						    the shared EventDescription, which still handles older plain-text values.
						    `compact`: a ticket blurb is a few lines, not 400px of empty box. */}
						<RichTextEditor
							compact
							compactOnMobile
							value={ticket.description}
							onChange={(val) => onTicketChange({ ...ticket, description: val })}
							placeholder="Enter description"
						/>
					</FormControl>

					<Box {...sectionBreak}>
						<SectionTitle>Price &amp; availability</SectionTitle>
						<Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} columnGap={{ md: 4 }}>
							<FormControl mb={4}>
								<FormLabel>Price (USD)</FormLabel>
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
									// A keypad hint only: the decimal pad on a phone. The field is still
									// type="number" and its value handling is unchanged.
									inputMode="decimal"
									placeholder="0 for free"
									bg="#090C10"
									border="1px solid #444"
									{...ticketField}
									value={Number.isFinite(ticket.price) ? ticket.price : ""}
									onChange={(e) => onTicketChange({ ...ticket, price: Math.max(0, parseFloat(e.target.value)) })}
								/>
								<Text fontSize="12px" color="#868686" mt={1} lineHeight="140%">
									{Number(ticket.price) > 0 ? "Paid ticket — the buyer pays at checkout." : "Free ticket. Leave blank or 0."}
								</Text>
							</FormControl>
							<FormControl mb={4}>
								<FormLabel>Quantity Available</FormLabel>
								{/* Three states, and the field has to be able to express all of them:
								    blank = unlimited, 0 = stop selling, n = n exist. So an emptied input
								    sends `null` (an explicit clear) rather than `undefined`, which the
								    server reads as "not sent, leave it alone" — without that a host could
								    set a limit and never remove it.

								    A limit BELOW what is already sold saves: the venue shrank and the host
								    is correcting the record. It closes the ticket, it doesn't cancel
								    anyone. `Math.max(0, …)` is the real guard, as on Price above. */}
								<Input
									type="number"
									onWheel={blurOnWheel}
									min={0}
									step="1"
									inputMode="numeric"
									placeholder="Unlimited"
									bg="#090C10"
									border="1px solid #444"
									{...ticketField}
									value={limit === null ? "" : limit}
									onChange={(e) => {
										const raw = e.target.value
										onTicketChange({ ...ticket, quantity: raw === "" ? null : Math.max(0, Math.floor(Number(raw))) })
									}}
								/>
								<Text fontSize="12px" color="#868686" mt={1} lineHeight="140%">
									{limit === null
										? "Unlimited. Enter a number to cap how many of this ticket can be sold."
										: limit === 0
											? "Set to 0 — this ticket is closed and can't be booked."
											: soldCount !== undefined
												? `${soldCount} of ${limit} booked, ${Math.max(0, limit - soldCount)} left. Leave blank for unlimited.`
												: `${limit} available in total. Leave blank for unlimited.`}
								</Text>
							</FormControl>
						</Grid>
					</Box>

					<Box {...sectionBreak}>
						<SectionTitle>Approval</SectionTitle>
						<FormControl mb={4}>
							<Flex
								align="center"
								justify="space-between"
								gap={4}
								bg={{ md: "#15181C" }}
								border={{ md: "1px solid #343536" }}
								borderRadius={{ md: "10px" }}
								px={{ md: 4 }}
								py={{ md: 3 }}
								{...ticketApprovalRow}
							>
								<Box>
									<FormLabel mb={0}>Require Approval</FormLabel>
									<Text fontSize="12px" color="#868686" mt={1} maxW={{ base: "320px", md: "none" }} lineHeight="140%">
										{ticket.requireApproval === undefined
											? `Inherits the event setting (${eventRequireApproval ? "On" : "Off"})`
											: !ticket.requireApproval
												? "Guests book this ticket instantly."
												: Number(ticket.price) > 0 || ticketMemberships(ticket as any).length > 0
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
					</Box>

					{/* Which memberships this ticket sells — either, both or neither — and how each is
					    billed. Admin/super-admin only: a host can't see or touch these, on a ticket
					    they're creating or one an admin already set up. */}
					{canManageMemberships && (
						<Box {...sectionBreak} mb={2}>
							<SectionTitle
								aside={
									<Badge colorScheme="purple" fontSize="9px" borderRadius="4px">
										Admin only
									</Badge>
								}
							>
								Membership
							</SectionTitle>
							<FormLabel display={{ base: "block", md: "none" }}>Include a membership with this ticket</FormLabel>
							<TicketMembershipToggles
								value={ticketMemberships(ticket as any)}
								onChange={(memberships, patch) =>
									// One write: ticking/unticking may also reset the interval, and two
									// separate `onTicketChange` calls would each spread the old ticket.
									onTicketChange({
										...ticket,
										memberships,
										// Kept in step so the mobile app and any older reader still see a
										// bundled Premium ticket. The array is the authority.
										includesPremium: memberships.includes("premium"),
										...(patch?.interval ? { membershipInterval: patch.interval } : {}),
									} as any)
								}
								requiresApproval={ticket.requireApproval ?? eventRequireApproval}
								price={Number(ticket.price)}
								interval={ticketMembershipInterval(ticket as any)}
								onIntervalChange={(membershipInterval) => onTicketChange({ ...ticket, membershipInterval } as any)}
								freeMonths={ticketMembershipFreeMonths(ticket as any)}
								onFreeMonthsChange={(membershipFreeMonths) => onTicketChange({ ...ticket, membershipFreeMonths } as any)}
							/>
						</Box>
					)}
				</ModalBody>
				{/* JSX order is [save, cancel]: the phone rule lays it out row-reverse (Cancel left,
				    save right) and so does desktop, right-aligned — the button that commits is the
				    last thing on the row in both. */}
				<ModalFooter
					borderTop={{ md: "1px solid #343536" }}
					flexDirection={{ md: "row-reverse" }}
					justifyContent={{ md: "flex-start" }}
					gap={{ md: 3 }}
					{...ticketModalFooterButtons}
				>
					<Button bg="#F79432" color="black" _hover={{ bg: "#e0832a" }} onClick={save} isLoading={isSaving} minW={{ md: "140px" }} {...ticketPrimaryButton}>
						{isEditing ? "Save Changes" : "Add Ticket"}
					</Button>
					<Button variant="ghost" color="white" _hover={{ bg: "#2A2D31" }} onClick={onClose} {...ticketCancelButton}>
						Cancel
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
	)
}

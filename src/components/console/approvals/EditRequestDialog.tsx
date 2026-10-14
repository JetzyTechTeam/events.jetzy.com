import React from "react"
import {
	Box,
	Button,
	Flex,
	FormControl,
	FormErrorMessage,
	FormLabel,
	Input,
	Modal,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalOverlay,
	Text,
} from "@chakra-ui/react"
import { approvalCaptureCents, bookingTicketCount } from "@/lib/booking-approval"
import { bookingMembershipTotal, bookingMemberships } from "@/lib/booking-memberships"
import { MEMBERSHIPS, type MembershipKey } from "@/lib/memberships"
import {
	GUEST_NAME_LIMIT,
	REQUEST_LOCK_MESSAGE,
	freeTicketEditRefusal,
	holdPlanRefusal,
	normalizeGuestName,
	plannedTickets,
	requestEditMode,
	ticketRows,
} from "@/lib/booking-request-edit"
import type { RequestEditController } from "./useRequestEdit"

/**
 * Edit a PENDING request: the name on it, and how many tickets it is for.
 *
 * ONE editor for every screen that lists a pending request: `ApprovalDialogs` mounts it for the
 * Approvals tab and the Guests tab, and the Event Bookings table and the event page's Bookings
 * panel mount it themselves over `useRequestEdit`.
 *
 * What the quantity control does depends on whether money is waiting behind the request, and
 * the dialog says which, because the two are not the same promise:
 *
 *  - FREE — the number simply changes, up or down.
 *  - CARD HOLD — DOWN only. Stripe cannot charge above a hold and Jetzy issues no refunds, so a
 *    ticket can't be added without the guest paying again. The lower number is saved on the
 *    request and the card is charged for it only when the request is approved; the rest of the
 *    hold is released then. Until approval it can be put back up to what was asked for.
 *  - MEMBERSHIP (Premium / Concierge), free or paid — DOWN only, same saved plan. A membership
 *    is sold once per order, so fewer tickets leaves it untouched; on a hold it is charged in
 *    full and only the ticket part shrinks.
 *
 * Every rule comes from `booking-request-edit.ts`, which `api/bookings/update-request.ts`
 * enforces too — so Save is never offered for something the server would refuse.
 */

const money = (n?: number) => `$${Number(n || 0).toFixed(2)}`

type DraftRow = { ticketId: string; quantity: number }

export function EditRequestDialog({
	controller,
	eventTickets,
}: {
	/** From `useRequestEdit` — directly, or through `useBookingApprovals`, which includes it. */
	controller: RequestEditController
	/**
	 * The event's ticket types. A booking stores `ticketId` only, so these supply the names;
	 * `price` and `memberships` let the dialog refuse, before sending, an added seat on a ticket
	 * that has since become paid or bundled. The server checks that either way.
	 */
	eventTickets?: any[]
}) {
	const { editTarget, closeEdit, saveEdit, isSavingEdit } = controller
	const [name, setName] = React.useState("")
	const [draft, setDraft] = React.useState<DraftRow[]>([])

	// The request last opened is kept while the dialog animates shut. Deriving from `editTarget`
	// alone would swap a card-hold request's copy for the free-request copy on the way out.
	const lastTarget = React.useRef<any | null>(null)
	if (editTarget) lastTarget.current = editTarget
	const target = editTarget || lastTarget.current

	// Reseed whenever a different request is opened — the dialog stays mounted between rows.
	// Seeded from the PLAN, so reopening an edited request shows the number it was set to.
	React.useEffect(() => {
		if (!editTarget) return
		setName(editTarget.customerName || "")
		setDraft(plannedTickets(editTarget))
	}, [editTarget])

	const { mode, lock, hasHold, sellsMembership } = requestEditMode(target)
	// `reduce`: a hold, a membership, or both — the number can only go down.
	const reduceOnly = mode === "reduce"
	const requested = ticketRows(target?.tickets)
	// In the order of the request's own rows. A ticket type deleted since the request was made
	// still holds its seats, so it is listed under a plain label rather than hidden.
	const ticketNames = requested.map(
		(row) => (eventTickets || []).find((t: any) => String(t?._id) === row.ticketId)?.name || "Ticket",
	)
	const requestedQty = bookingTicketCount(requested)
	const planned = target ? plannedTickets(target) : []
	const draftQty = bookingTicketCount(draft)
	const requestedById = new Map(requested.map((t) => [t.ticketId, t.quantity]))
	const plannedById = new Map(planned.map((t) => [t.ticketId, t.quantity]))

	const step = (ticketId: string, delta: number) =>
		setDraft((prev) =>
			prev.map((row) => {
				if (row.ticketId !== ticketId) return row
				// A hold can't be raised and a membership ticket can't be added to, so `+` stops at
				// what was requested.
				const max = reduceOnly ? requestedById.get(ticketId) ?? row.quantity : 1000
				return { ...row, quantity: Math.max(0, Math.min(max, row.quantity + delta)) }
			}),
		)

	const normalizedName = normalizeGuestName(name)
	const nameChanged = normalizedName.ok && normalizedName.name !== (target?.customerName || "")
	const ticketsChanged = mode !== "locked" && draft.some((row) => plannedById.get(row.ticketId) !== row.quantity)

	// The same refusals the server applies, asked before the request is sent.
	const ticketRefusal = !ticketsChanged
		? null
		: reduceOnly
			? holdPlanRefusal(requested, draft)
			: freeTicketEditRefusal(requested, draft, eventTickets, {
					emptyMessage: "Keep at least one ticket, or decline the request instead.",
				})

	const held = hasHold ? Number(target?.payment?.amount) || 0 : 0
	// The membership part of the hold — charged in full whatever the ticket count. A free-months
	// row holds 0, which is right: nothing was held for it.
	const membershipRows = bookingMemberships(target?.payment)
	const membershipHeld = hasHold ? bookingMembershipTotal(target?.payment, membershipRows) : 0
	const membershipNames = membershipRows.map((row) => MEMBERSHIPS[row.key as MembershipKey]?.label || "membership").join(" and ")
	// The same function `approve.ts` captures with. Assumes every membership is still owed; one
	// the guest already holds by then is released at approval, so the real charge can be lower.
	const chargeOnApproval =
		hasHold && draftQty > 0 && draftQty < requestedQty
			? approvalCaptureCents({ held, membershipHeld, membershipKept: membershipHeld, approved: draftQty, requested: requestedQty }) / 100
			: held

	const canSave = !!editTarget && normalizedName.ok && !ticketRefusal && (nameChanged || ticketsChanged)

	const save = () => {
		if (!canSave || !normalizedName.ok) return
		saveEdit({
			...(nameChanged ? { customerName: normalizedName.name } : {}),
			...(ticketsChanged ? { tickets: draft.map((row) => ({ ticketId: row.ticketId, quantity: row.quantity })) } : {}),
		})
	}

	return (
		<Modal isOpen={!!editTarget} onClose={closeEdit} isCentered size={{ base: "full", md: "md" }} scrollBehavior="inside">
			<ModalOverlay />
			<ModalContent bg="#1E1E1E" color="white" border={{ base: "none", md: "1px solid #444" }}>
				<ModalHeader>Edit request</ModalHeader>
				<ModalCloseButton />
				<ModalBody>
					<FormControl isInvalid={!normalizedName.ok}>
						<FormLabel fontSize="sm" color="#D6D6D6">Name on the booking</FormLabel>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							maxLength={GUEST_NAME_LIMIT}
							bg="#15181C"
							borderColor="#343536"
							// 16px on a phone: iOS zooms the page for anything smaller.
							fontSize={{ base: "16px", md: "sm" }}
							h={{ base: "44px", md: "40px" }}
							autoComplete="off"
						/>
						{!normalizedName.ok && <FormErrorMessage>{normalizedName.message}</FormErrorMessage>}
					</FormControl>
					{/* The email is what tickets, sign-in and memberships follow, so it is shown and
					    not offered for editing — a changed name is a correction, a changed email
					    would be a different person. */}
					<Text fontSize="xs" color="#9C9C9C" mt={2} wordBreak="break-all">
						{target?.customerEmail ? `${target.customerEmail} · ` : ""}the email can&apos;t be changed here.
					</Text>

					<Text fontSize="sm" color="#D6D6D6" mt={6} mb={2}>
						Tickets
					</Text>

					{mode === "locked" ? (
						<Box bg="#15181C" border="1px solid #343536" borderRadius="8px" p={3}>
							{draft.map((row, i) => (
								<Flex key={row.ticketId} justify="space-between" gap={3} fontSize="sm" py={0.5}>
									<Text>{ticketNames[i] || "Ticket"}</Text>
									<Text fontWeight={600}>× {row.quantity}</Text>
								</Flex>
							))}
							<Text fontSize="xs" color="#F79432" mt={2}>
								{REQUEST_LOCK_MESSAGE[lock || "hold_gone"]}
							</Text>
						</Box>
					) : (
						<>
							{draft.map((row, i) => {
								const max = reduceOnly ? requestedById.get(row.ticketId) ?? row.quantity : 1000
								// A reduce-only request covers one ticket type, so its single row can't go
								// below 1 — that would be declining the request, which has its own button.
								const min = reduceOnly ? 1 : 0
								return (
									<Flex key={row.ticketId} align="center" justify="space-between" gap={4} mb={3}>
										<Text fontSize="sm" noOfLines={2} flex="1">
											{ticketNames[i] || "Ticket"}
										</Text>
										<Flex align="center" gap={2} bg="#090C10" borderRadius="full" p={1} flexShrink={0}>
											<Button
												size="sm"
												borderRadius="full"
												aria-label="One fewer"
												onClick={() => step(row.ticketId, -1)}
												isDisabled={row.quantity <= min}
											>
												-
											</Button>
											<Text minW="28px" textAlign="center" fontWeight="semibold">
												{row.quantity}
											</Text>
											<Button
												size="sm"
												borderRadius="full"
												aria-label="One more"
												onClick={() => step(row.ticketId, 1)}
												isDisabled={row.quantity >= max}
											>
												+
											</Button>
										</Flex>
									</Flex>
								)
							})}

							{reduceOnly ? (
								<Box bg="rgba(247,148,50,0.12)" border="1px solid rgba(247,148,50,0.4)" borderRadius="8px" p={3} mt={2}>
									<Text fontSize="sm" color="#F79432" fontWeight={700}>
										{draftQty < requestedQty
											? `${draftQty} of the ${requestedQty} tickets requested`
											: hasHold
												? `Card held for ${money(held)} · ${requestedQty} ${requestedQty === 1 ? "ticket" : "tickets"}`
												: `${requestedQty} ${requestedQty === 1 ? "ticket" : "tickets"} requested`}
									</Text>
									{/* What is held, split, so the host can see the membership is not part of
									    what shrinks. Only when there is a membership charge to separate out. */}
									{hasHold && membershipHeld > 0 && (
										<Text fontSize="xs" color="#D6D6D6" mt={2}>
											The hold covers the tickets ({money(held - membershipHeld)}) and the first period of {membershipNames} ({money(membershipHeld)}).
										</Text>
									)}
									<Text fontSize="xs" color="#D6D6D6" mt={2}>
										{hasHold
											? draftQty < requestedQty
												? `When you approve, the card is charged ${money(chargeOnApproval)} and the other ${money(held - chargeOnApproval)} of the hold is released${
														membershipHeld > 0 ? ` — the ${membershipNames} is charged in full, only the tickets go down` : ""
													}. Nothing is charged until then, and you can put the number back up to ${requestedQty} before approving.`
												: "You can approve fewer tickets than were requested — only those are charged, and the rest of the hold is released when you approve."
											: draftQty < requestedQty
												? `The request will be approved for ${draftQty} when you approve it. You can put the number back up to ${requestedQty} before then.`
												: "You can approve fewer tickets than were requested. Nothing is charged for the tickets."}
									</Text>
									{sellsMembership && (
										<Text fontSize="xs" color="#D6D6D6" mt={2}>
											This ticket comes with {membershipNames}. It is sold once per order, so approving fewer tickets doesn&apos;t
											change the membership.
										</Text>
									)}
									{hasHold && membershipHeld > 0 && draftQty < requestedQty && (
										<Text fontSize="xs" color="#9C9C9C" mt={2}>
											If the guest already holds the membership by the time you approve, that part of the hold is released too, so the
											final charge can be lower.
										</Text>
									)}
									<Text fontSize="xs" color="#D6D6D6" mt={2}>
										{hasHold
											? "Tickets can't be added: a card hold can't be raised, and payments aren't refunded once taken. A guest who wants more books again."
											: "Tickets can't be added to a membership ticket here — each person is limited in how many they can hold for an event. A guest who wants more books again."}
									</Text>
								</Box>
							) : (
								<Box bg="#15181C" border="1px solid #343536" borderRadius="8px" p={3} mt={2}>
									<Text fontSize="xs" color="#D6D6D6">
										This is a free request, so nothing is charged or returned. A request doesn&apos;t hold a spot — room is checked when
										you approve it.
									</Text>
								</Box>
							)}

							{ticketRefusal && (
								<Text fontSize="xs" color="red.300" mt={2}>
									{ticketRefusal}
								</Text>
							)}
						</>
					)}
				</ModalBody>
				<ModalFooter>
					<Button variant="ghost" color="white" _hover={{ bg: "#2A2D31" }} onClick={closeEdit} mr={3}>
						Cancel
					</Button>
					<Button bg="#F79432" color="black" _hover={{ bg: "#e0832a" }} isLoading={isSavingEdit} isDisabled={!canSave} onClick={save}>
						Save changes
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
	)
}

export default EditRequestDialog

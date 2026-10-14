import React from "react"
import {
	AlertDialog,
	AlertDialogBody,
	AlertDialogContent,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogOverlay,
	Box,
	Button,
	Flex,
	Text,
} from "@chakra-ui/react"
import { DateTime } from "luxon"
import { isCaptureFailed } from "@/lib/booking-status"
import { describeDiscount } from "@/lib/booking-revenue"
import { bookingMembershipTotal, bookingMemberships } from "@/lib/booking-memberships"
import { MEMBERSHIPS, type MembershipKey } from "@/lib/memberships"
import { approvalCaptureCents, bookingTicketCount, partialApprovalRefusal, PARTIAL_REFUSAL_MESSAGE } from "@/lib/booking-approval"
import { plannedTickets } from "@/lib/booking-request-edit"
import type { BookingApprovalsController } from "./useBookingApprovals"
import { EditRequestDialog } from "./EditRequestDialog"

/**
 * The approve and reject confirmation dialogs.
 *
 * Mounted by BOTH the Approvals tab and the Guests tab so the two screens cannot end up
 * offering different terms for the same decision.
 */

const money = (n?: number) => `$${Number(n || 0).toFixed(2)}`

/**
 * "3 × General Admission" per line, so the host sees WHAT was requested and not just a total.
 * Bookings store only `ticketId`, so the name is resolved against the event's ticket
 * sub-documents; a ticket deleted since the request was made falls back to a neutral label
 * rather than rendering "undefined".
 */
export const ticketBreakdown = (event: any, b: any): Array<{ name: string; quantity: number }> =>
	(b?.tickets || []).map((row: any) => {
		const ticket = (event?.tickets || []).find((t: any) => t?._id?.toString() === row?.ticketId?.toString())
		return { name: ticket?.name || "Ticket", quantity: row?.quantity || 0 }
	})

export function ApprovalDialogs({ controller, event }: { controller: BookingApprovalsController; event?: any }) {
	const cancelRef = React.useRef<HTMLButtonElement>(null)
	const { approveTarget, rejectTarget, closeApprove, closeReject, confirmApprove, confirmReject, fitFor, priorConfirmedFor } = controller

	// Both dialogs stay mounted and are driven by `isOpen`, rather than this component returning
	// null when nothing is selected. Chakra renders nothing into the portal while closed, so it
	// costs nothing — but unmounting on close would cut off the exit animation mid-way.

	// Gated on `payment.status`, not on the sub-doc existing: a free booking can now carry a
	// `payment` for the membership a referral code gave away, and its `amount` defaults to 0.
	// Reading that as a hold would offer to release money that was never taken.
	const rejectHoldAmount = rejectTarget?.payment?.status ? rejectTarget?.payment?.amount : undefined

	return (
		<>
			{/* Approving takes money and consumes capacity, and a first request can be for five
			    tickets as easily as one, and the row shows only a bare total — the host needs
			    to see what they're committing to before money moves and capacity is consumed.

			    The prior-bookings section is additive: when the guest already holds tickets it
			    appears as a warning on top. Informational, never a block — hosts have good
			    reasons to approve a second booking (a guest bringing more people, a group split
			    across orders). */}
			<AlertDialog isOpen={!!approveTarget} leastDestructiveRef={cancelRef} onClose={closeApprove} isCentered>
				<AlertDialogOverlay>
					<AlertDialogContent bg="#1E1E1E" border="1px solid #444">
						{(() => {
							if (!approveTarget) return null
							const prior = priorConfirmedFor(approveTarget)
							const priorQty = prior.reduce((sum, p) => sum + bookingTicketCount(p?.tickets), 0)
							// What the guest ASKED for, and what this approval is FOR. They differ once a
							// host has edited the request down: `tickets` stays what the card is held
							// for, and the lower number is read through `plannedTickets`.
							const askedQty = bookingTicketCount(approveTarget?.tickets)
							const planned = plannedTickets(approveTarget)
							const thisQty = bookingTicketCount(planned)
							const lines = ticketBreakdown(event, { tickets: planned })
							// See `rejectHoldAmount` — `payment.amount` alone no longer means money exists.
							const held = approveTarget?.payment?.status ? approveTarget?.payment?.amount : undefined
							const approveDiscount = describeDiscount(approveTarget)
							const approveMemberships = bookingMemberships(approveTarget?.payment)
							// The row's button reads "Retry charge" after a failed capture; the dialog
							// has to agree, or it looks like a different action from the one clicked.
							const retrying = isCaptureFailed(approveTarget)
							// Does the whole request still fit, and if not, may we seat part of it?
							const approveFit = fitFor(approveTarget)
							const seatable = approveFit.seatable ?? thisQty
							const shortfall = !approveFit.fits
							const refusal = shortfall ? partialApprovalRefusal(approveTarget.tickets, { seatable }) : null
							const canSeatPart = shortfall && !refusal && seatable > 0

							// How many tickets pressing the button will actually confirm, and what that
							// does to the money. Fewer than were asked for — whether the host edited
							// the request or the room ran short — means the card is charged for those
							// only: the same capture `approve.ts` makes, from the same function, so the
							// figure here is the figure taken. A membership on the hold is charged in
							// full; only the ticket part is scaled.
							const approveQty = canSeatPart ? seatable : thisQty
							const reduced = approveQty < askedQty && askedQty > 0
							const ratio = reduced ? approveQty / askedQty : 1
							const membershipHeld = held !== undefined ? bookingMembershipTotal(approveTarget?.payment, approveMemberships) : 0
							const chargeNow =
								held !== undefined && reduced
									? approvalCaptureCents({
										held: Number(held) || 0,
										membershipHeld,
										membershipKept: membershipHeld,
										approved: approveQty,
										requested: askedQty,
									}) / 100
									: held

							return (
								<>
									<AlertDialogHeader fontSize="lg" fontWeight="bold" color="white">
										{retrying ? "Retry charge" : prior.length > 0 ? "This guest already has tickets" : "Approve request"}
									</AlertDialogHeader>

									<AlertDialogBody color="white">
										<Text fontSize="sm">
											Approve <b>{approveTarget.customerName || "this guest"}</b>
											{approveTarget.customerEmail ? ` (${approveTarget.customerEmail})` : ""} for{" "}
											<b>{thisQty} ticket{thisQty === 1 ? "" : "s"}</b>?
											{/* Said at the point of no return: the guest asked for more, and this
											    approval settles the request for fewer. */}
											{thisQty < askedQty && (
												<Text as="span" color="#F79432">
													{" "}Edited down from the {askedQty} they asked for.
												</Text>
											)}
										</Text>

										{/* What was actually requested, by ticket type. */}
										{lines.length > 0 && (
											<Box bg="#15181C" border="1px solid #343536" borderRadius="8px" p={3} mt={3}>
												{lines.map((line, i) => (
													<Flex key={i} justify="space-between" gap={3} fontSize="xs" color="#D6D6D6" py={0.5}>
														<Text>{line.name}</Text>
														<Text color="white" fontWeight={600}>× {line.quantity}</Text>
													</Flex>
												))}
											</Box>
										)}

										{/* What the money actually does, itemised. A bare "will be charged $20"
										    hid the fact that a code was involved at all — a $95 ticket
										    discounted to $20 looked the same as one that cost $20. The host is
										    about to take this money; they should see how it was arrived at. */}
										<Box bg="#15181C" border="1px solid #343536" borderRadius="8px" p={3} mt={3}>
											{Number(approveTarget.subTotal ?? 0) > 0 && (
												<Flex justify="space-between" gap={3} fontSize="xs" color="#D6D6D6" py={0.5}>
													<Text>Ticket subtotal</Text>
													{/* Scaled with the quantity, as `approve.ts` scales what the booking
													    records — or the lines wouldn't add up to the charge below. */}
													<Text>{money(Number(approveTarget.subTotal) * ratio)}</Text>
												</Flex>
											)}
											{approveDiscount.discounted && (
												<Flex justify="space-between" gap={3} fontSize="xs" py={0.5} color="#F5C518">
													<Text>Discount{approveDiscount.code ? ` (${approveDiscount.code})` : ""}</Text>
													<Text>−{money(approveDiscount.amount * ratio)}</Text>
												</Flex>
											)}
											{/* A code that took nothing off still gets named — the host may be
											    approving on the strength of who referred them. */}
											{!approveDiscount.discounted && approveDiscount.code && (
												<Flex justify="space-between" gap={3} fontSize="xs" color="#D6D6D6" py={0.5}>
													<Text>Referral code</Text>
													<Text>{approveDiscount.code}</Text>
												</Flex>
											)}
											{/* Memberships sold with the ticket. Without these the arithmetic is
											    visibly wrong on a bundled order: a ticket comped to $0 by a 100%
											    code still holds the membership's first period, so the dialog would
											    read "subtotal $100, discount −$100, charged $20" and look broken.
											    `booking.total` is the TICKET; `payment.amount` is ticket +
											    membership. */}
											{approveMemberships.map((row) => (
												<Flex key={row.key} justify="space-between" gap={3} fontSize="xs" color="#D6D6D6" py={0.5}>
													{/* A membership a referral code gave away costs the guest nothing on
													    approval, so "(first month) $0.00" would read as a broken sum. Say
													    what it is instead, and what it renews at afterwards. */}
													<Text>
														{MEMBERSHIPS[row.key as MembershipKey]?.receiptLabel || row.key}{" "}
														{(row as any).trialMonths
															? `(${(row as any).trialMonths} ${(row as any).trialMonths === 1 ? "month" : "months"} free)`
															: `(first ${row.interval || "month"})`}
													</Text>
													<Text>
														{(row as any).trialMonths
															? `then ${money(Number((row as any).renewalAmount) || 0)}/${row.interval || "month"}`
															: money(Number(row.amount) || 0)}
													</Text>
												</Flex>
											))}
											<Flex justify="space-between" gap={3} fontSize="sm" fontWeight={700} pt={2} mt={1} borderTop="1px solid #343536">
												{/* Free bookings have no `payment` at all — never imply a charge
												    that will not happen. */}
												<Text>{held !== undefined ? (retrying ? "Charge now" : "Card will be charged") : "Guest pays"}</Text>
												<Text color={held !== undefined ? "#F79432" : "#9C9C9C"}>
													{money(held !== undefined ? chargeNow : Number(approveTarget.total ?? 0) * ratio)}
												</Text>
											</Flex>
											{/* The other part of the hold. Released, not refunded — it was never
											    taken — and worth a line of its own because the guest's bank shows
											    the full hold until this approval goes through. */}
											{held !== undefined && reduced && (
												<Flex justify="space-between" gap={3} fontSize="xs" color="#D6D6D6" pt={1}>
													<Text>Released from the {money(held)} hold</Text>
													<Text>{money((Number(held) || 0) - (Number(chargeNow) || 0))}</Text>
												</Flex>
											)}
										</Box>

										{/* The squeeze, explained at the point of no return. Either the host
										    can seat part of the request, or we say why they can't and leave
										    Reject as the only honest option — never a button that will fail. */}
										{shortfall && (
											<Box bg="rgba(247,148,50,0.12)" border="1px solid rgba(247,148,50,0.4)" borderRadius="8px" p={3} mt={4}>
												<Text fontSize="sm" color="#F79432" fontWeight={700}>
													{seatable > 0
														? `Only ${seatable} of these ${thisQty} tickets will fit`
														: "There are no spots left"}
												</Text>
												<Text fontSize="xs" color="#D6D6D6" mt={2}>
													{refusal
														? PARTIAL_REFUSAL_MESSAGE[refusal]
														: canSeatPart
															? `You can confirm ${seatable} now. ${
																	approveTarget?.payment?.status
																		? `The card is charged for ${seatable} only${approveMemberships.length > 0 ? " (plus the membership, in full)" : ""} — the rest of the hold is released and nothing is refunded.`
																		: "The guest is told they asked for more than was available."
																}`
															: "Decline this request, or approve it once more spots free up."}
												</Text>
											</Box>
										)}

										{prior.length > 0 && (
											<Box bg="rgba(247,148,50,0.12)" border="1px solid rgba(247,148,50,0.4)" borderRadius="8px" p={3} mt={4}>
												<Text fontSize="sm" color="#F79432" fontWeight={700}>
													Already has {priorQty} confirmed ticket{priorQty === 1 ? "" : "s"} for this event
												</Text>
												<Box mt={2}>
													{prior.map((p) => (
														<Flex key={p.bookingRef} justify="space-between" gap={3} fontSize="xs" color="#D6D6D6" py={0.5}>
															<Text>
																{bookingTicketCount(p?.tickets)} ticket{bookingTicketCount(p?.tickets) === 1 ? "" : "s"} · {p.bookingRef}
															</Text>
															<Text color="#9C9C9C">
																{p.createdAt ? DateTime.fromISO(p.createdAt).toLocaleString(DateTime.DATE_MED) : "—"}
															</Text>
														</Flex>
													))}
												</Box>
												<Text fontSize="xs" color="#D6D6D6" mt={2}>
													Approving this brings them to{" "}
													<b>{priorQty + thisQty} ticket{priorQty + thisQty === 1 ? "" : "s"}</b> in total.
												</Text>
											</Box>
										)}
									</AlertDialogBody>

									<AlertDialogFooter>
										<Button ref={cancelRef} onClick={closeApprove}>Cancel</Button>
										{/* When the request doesn't fit, the plain Approve is NOT offered — it
										    could only be refused. Either seat what fits, or cancel and reject. */}
										{canSeatPart ? (
											<Button colorScheme="orange" onClick={() => confirmApprove(seatable)} ml={3}>
												Approve {seatable} of {askedQty}
											</Button>
										) : shortfall ? null : (
											<Button colorScheme={retrying ? "orange" : "green"} onClick={() => confirmApprove()} ml={3}>
												{/* An edited request names its numbers on the button itself — it is
												    the last thing read before the card is charged for fewer. */}
												{retrying
													? "Retry charge"
													: thisQty < askedQty
														? `Approve ${thisQty} of ${askedQty}`
														: prior.length > 0
															? "Approve anyway"
															: "Approve"}
											</Button>
										)}
									</AlertDialogFooter>
								</>
							)
						})()}
					</AlertDialogContent>
				</AlertDialogOverlay>
			</AlertDialog>

			<AlertDialog isOpen={!!rejectTarget} leastDestructiveRef={cancelRef} onClose={closeReject} isCentered>
				<AlertDialogOverlay>
					<AlertDialogContent bg="#1E1E1E" border="1px solid #444">
						<AlertDialogHeader fontSize="lg" fontWeight="bold" color="white">Reject Request</AlertDialogHeader>
						<AlertDialogBody color="white">
							Reject {rejectTarget?.customerName || "this attendee"}&apos;s request?{" "}
							{rejectHoldAmount !== undefined
								? `Their ${money(rejectHoldAmount)} card hold will be released and they will not be charged. `
								: ""}
							They will be emailed that they weren&apos;t approved. This cannot be undone.
						</AlertDialogBody>
						<AlertDialogFooter>
							<Button ref={cancelRef} onClick={closeReject}>Cancel</Button>
							<Button colorScheme="red" onClick={confirmReject} ml={3}>Reject</Button>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialogOverlay>
			</AlertDialog>

			{/* Edit the name / ticket quantity of a pending request. Here rather than in each
			    table, so the Approvals tab and the Guests tab get the same editor. */}
			<EditRequestDialog controller={controller} eventTickets={event?.tickets} />
		</>
	)
}

export default ApprovalDialogs

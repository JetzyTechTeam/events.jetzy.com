import React, { useRef, useState } from "react"
import {
	Badge,
	Box,
	Button,
	Flex,
	Table,
	TableContainer,
	Tbody,
	Td,
	Text,
	Th,
	Thead,
	Tooltip,
	Tr,
	useToast,
	AlertDialog,
	AlertDialogBody,
	AlertDialogContent,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogOverlay,
} from "@chakra-ui/react"
import axios from "axios"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { DateTime } from "luxon"
import { isPendingBooking, isCancelledBooking, isHoldExpired, isCaptureFailed, holdTimeRemaining } from "@/lib/booking-status"
import { HoldExpiry, PaymentBadge } from "@/components/bookings/PaymentBadge"
import { describeDiscount } from "@/lib/booking-revenue"
import { bookingMemberships } from "@/lib/booking-memberships"
import { MEMBERSHIPS, type MembershipKey } from "@/lib/memberships"

/**
 * Approval requests for an event, split into two views:
 *
 *  - Pending    — still awaiting a decision. For paid requests this shows the amount held
 *                 on the guest's card and how long before the authorization lapses.
 *  - Processed  — everything that already resolved. This exists because a booking leaves
 *                 the pending list the moment it is approved/rejected/expired, and without
 *                 it there would be nowhere in the product that answers "was the card
 *                 actually charged?" or "did I lose this guest to an expired hold?".
 *
 * Both come from the same single query — the list is partitioned client-side rather than
 * filtered down to pending only.
 */

const money = (n?: number) => `$${Number(n || 0).toFixed(2)}`

const HOUR = 60 * 60 * 1000

const ticketCount = (b: any) => (b?.tickets || []).reduce((sum: number, t: any) => sum + (t.quantity || 0), 0)

/**
 * Key a guest by email for the "already has tickets" check.
 *
 * MUST be case-insensitive: `Bookings.customerEmail` has no `lowercase: true`, so the same
 * person booking twice can be stored as `Ali@x.com` and `ali@x.com`. An exact comparison
 * silently reports "no existing tickets" for anyone who capitalised differently.
 *
 * Returns "" for a missing address, which callers treat as "can't identify" — otherwise every
 * booking without an email would group together and be reported as the same guest.
 */
const guestKey = (email?: string | null) => (email || "").trim().toLowerCase()

/**
 * Width of the frozen Actions column. Fixed rather than auto, because the Guest column's
 * `left` offset has to equal it exactly or the two frozen columns overlap.
 */
const ACTIONS_W = "170px"

export function ApprovalRequests({
	eventId,
	event,
	// Frozen columns must be opaque or the scrolling columns show through them. This is the
	// colour of the panel the table sits on, and it differs by mount point — the console tab
	// is a solid #181818, the event page is a translucent grey over the page background — so
	// it's supplied by the caller rather than guessed at here.
	surfaceBg = "#181818",
}: {
	eventId: string
	event?: any
	surfaceBg?: string
}) {
	const toast = useToast({ position: "top" })
	const queryClient = useQueryClient()
	const [processingRef, setProcessingRef] = useState<string | null>(null)
	const [rejectTarget, setRejectTarget] = useState<any | null>(null)
	// Only set when the guest already holds tickets for this event — an ordinary first-time
	// approval stays one click, so the dialog reads as a genuine warning rather than a
	// speed bump the host learns to dismiss without reading.
	const [approveTarget, setApproveTarget] = useState<any | null>(null)
	const [showProcessed, setShowProcessed] = useState(false)
	const cancelRef = useRef<HTMLButtonElement>(null)

	const { data: bookings = [], isLoading, isError } = useQuery({
		queryKey: ["event-bookings", eventId],
		queryFn: async () => {
			const res = await axios.post("/api/get-bookings", { eventId })
			return res.data || []
		},
	})

	// Soonest-expiring first — that ordering is the entire point of showing the countdown.
	const pending = (bookings as any[])
		.filter((b) => isPendingBooking(b))
		.sort((a, b) => {
			const ax = a?.payment?.authExpiresAt ? new Date(a.payment.authExpiresAt).getTime() : Infinity
			const bx = b?.payment?.authExpiresAt ? new Date(b.payment.authExpiresAt).getTime() : Infinity
			return ax - bx
		})

	// Resolved requests that involved money, newest first.
	const processed = (bookings as any[])
		.filter((b) => !isPendingBooking(b) && b?.payment?.status)
		.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())

	const expiringSoon = pending.filter((b) => {
		const remaining = holdTimeRemaining(b)
		return remaining !== null && remaining > 0 && remaining < 48 * HOUR
	})

	// Tickets this guest ALREADY holds for this event, so the host isn't approving a second
	// booking blind. Built from the same single query the lists come from — every booking for
	// the event is already in the browser, so this needs no extra request.
	//
	// "Confirmed" is decided BY EXCLUSION, never by allowlisting BookingStatus.CONFIRMED:
	// `status` is not a closed set. `checked_in` is written by the mobile app against the
	// shared collection, and an allowlist would silently hide every guest already through
	// the door — exactly the ones a host most needs to know about.
	const confirmedByGuest = new Map<string, any[]>()
	for (const b of bookings as any[]) {
		// `/api/get-bookings` does not filter `isDeleted` (unlike bookings/mine and
		// bookings/preview), so exclude them here — a host must not be warned about, or make
		// a decision on, a booking that has been removed.
		if (b?.isDeleted) continue
		if (isPendingBooking(b) || isCancelledBooking(b)) continue
		const key = guestKey(b.customerEmail)
		if (!key) continue
		confirmedByGuest.set(key, [...(confirmedByGuest.get(key) || []), b])
	}

	/** Confirmed bookings held by the same guest, excluding the request being reviewed. */
	const priorConfirmedFor = (b: any): any[] => {
		const key = guestKey(b?.customerEmail)
		if (!key) return []
		return (confirmedByGuest.get(key) || []).filter((other) => other.bookingRef !== b.bookingRef)
	}

	const eventQuestions: any[] = event?.questions || []

	/**
	 * "3 × General Admission" per line, so the host sees WHAT was requested and not just a
	 * total. Bookings store only `ticketId`, so the name is resolved against the event's
	 * ticket sub-documents; a ticket deleted since the request was made falls back to a
	 * neutral label rather than rendering "undefined".
	 */
	const ticketBreakdown = (b: any): Array<{ name: string; quantity: number }> =>
		(b?.tickets || []).map((row: any) => {
			const ticket = (event?.tickets || []).find((t: any) => t?._id?.toString() === row?.ticketId?.toString())
			return { name: ticket?.name || "Ticket", quantity: row?.quantity || 0 }
		})

	const formatAnswer = (qId: string, booking: any): string => {
		if (!booking?.customAnswers) return "—"
		const ans = booking.customAnswers.find((a: any) => a.questionId === qId)
		if (!ans || ans.answer == null) return "—"
		if (Array.isArray(ans.answer)) return ans.answer.length ? ans.answer.join(", ") : "—"
		if (typeof ans.answer === "object") {
			const parts: string[] = []
			if (ans.answer.company) parts.push(ans.answer.company)
			if (ans.answer.jobTitle) parts.push(ans.answer.jobTitle)
			if (ans.answer.agreed !== undefined) parts.push(ans.answer.agreed ? "Agreed" : "Not agreed")
			if (ans.answer.signature) parts.push(`Signed: ${ans.answer.signature}`)
			return parts.join(" · ") || "—"
		}
		return String(ans.answer) || "—"
	}

	const act = async (bookingRef: string, action: "approve" | "reject") => {
		setProcessingRef(bookingRef)
		try {
			const res = await axios.post(`/api/bookings/${action}`, { bookingRef })
			if (res.data?.status) {
				// Say what happened to the money, not just "done" — this is the only
				// confirmation the host gets that a card was actually charged.
				const amount = res.data?.data?.amountCharged ?? res.data?.data?.releasedAmount
				const detail =
					action === "approve"
						? amount !== undefined ? `${money(amount)} charged successfully.` : undefined
						: amount !== undefined ? `The ${money(amount)} hold has been released.` : undefined

				toast({
					title: action === "approve" ? "Request approved" : "Request rejected",
					description: detail,
					status: "success",
					duration: 4000,
					isClosable: true,
				})
				queryClient.invalidateQueries({ queryKey: ["event-bookings", eventId] })
				queryClient.invalidateQueries({ queryKey: ["guests-list", eventId] })
			} else {
				toast({ title: res.data?.message || "Action failed", status: "error", duration: 8000, isClosable: true })
				// The server may have moved the booking to expired/failed — refresh either way.
				queryClient.invalidateQueries({ queryKey: ["event-bookings", eventId] })
			}
		} catch (e: any) {
			toast({ title: e?.response?.data?.message || "Action failed", status: "error", duration: 8000, isClosable: true })
			queryClient.invalidateQueries({ queryKey: ["event-bookings", eventId] })
		} finally {
			setProcessingRef(null)
		}
	}

	const confirmReject = async () => {
		if (!rejectTarget) return
		const ref = rejectTarget.bookingRef
		setRejectTarget(null)
		await act(ref, "reject")
	}

	/**
	 * Always confirm. Approving takes money and consumes capacity, and the host needs to see
	 * WHAT they're approving — a first request can be for five tickets just as easily as one,
	 * and the row only shows a bare total.
	 */
	const requestApprove = (b: any) => setApproveTarget(b)

	const confirmApprove = async () => {
		if (!approveTarget) return
		const ref = approveTarget.bookingRef
		setApproveTarget(null)
		await act(ref, "approve")
	}

	if (isLoading) return <Text color="white">Loading requests...</Text>
	if (isError) return <Text color="red.400">Failed to load requests.</Text>

	const rejectHoldAmount = rejectTarget?.payment?.amount

	return (
		<Box overflowX="auto">
			{expiringSoon.length > 0 && (
				<Box bg="rgba(247,148,50,0.12)" border="1px solid rgba(247,148,50,0.4)" borderRadius="8px" p={3} mb={4}>
					<Text color="#F79432" fontWeight={700} fontSize="sm">
						{expiringSoon.length} request{expiringSoon.length > 1 ? "s have" : " has"} a card hold expiring within 48 hours
					</Text>
					<Text color="#D6D6D6" fontSize="xs" mt={1}>
						Holds are released automatically once they lapse and cannot be recovered — approve or decline these first.
					</Text>
				</Box>
			)}

			{!pending.length ? (
				<Text color="white">No pending approval requests.</Text>
			) : (
				<TableContainer>
					<Table variant="simple" size="sm">
						{/* Actions first and frozen, Guest second and frozen.
						    Previously Actions sat last: with custom-question columns the table
						    overflows, and the host had to scroll right to reach Approve — at which
						    point the name had scrolled out of view. They were clicking a green
						    button on a row they could no longer identify, which for an action that
						    takes money is not a cosmetic problem.

						    Frozen only from `md` up. On a phone these two columns are the whole
						    viewport, so freezing them would leave nothing to scroll. */}
						<Thead>
							<Tr>
								<Th
									color="#9C9C9C"
									position={{ base: "static", md: "sticky" }}
									left={0}
									zIndex={1}
									bg={surfaceBg}
									w={ACTIONS_W}
									minW={ACTIONS_W}
								>
									Actions
								</Th>
								<Th
									color="#9C9C9C"
									position={{ base: "static", md: "sticky" }}
									left={{ base: 0, md: ACTIONS_W }}
									zIndex={1}
									bg={surfaceBg}
									minW="200px"
									borderRight="1px solid #2A2D31"
								>
									Guest
								</Th>
								<Th color="#9C9C9C">Tickets</Th>
								<Th color="#9C9C9C">Payment</Th>
								<Th color="#9C9C9C">Expires</Th>
								{eventQuestions.map((q) => (
									<Th color="#9C9C9C" key={q.id}>{q.title}</Th>
								))}
								<Th color="#9C9C9C">Requested</Th>
							</Tr>
						</Thead>
						<Tbody>
							{pending.map((b: any) => {
								const qty = ticketCount(b)
								const busy = processingRef === b.bookingRef
								const expired = isHoldExpired(b)
								const captureFailed = isCaptureFailed(b)
								// Actions, Guest, Tickets, Payment, Expires, …questions…, Requested.
								const colSpan = 6 + eventQuestions.length
								const prior = priorConfirmedFor(b)
								const priorQty = prior.reduce((sum, p) => sum + ticketCount(p), 0)

								return (
									<React.Fragment key={b.bookingRef}>
										<Tr>
											<Td
												position={{ base: "static", md: "sticky" }}
												left={0}
												zIndex={1}
												bg={surfaceBg}
												w={ACTIONS_W}
												minW={ACTIONS_W}
											>
												<Flex gap={2}>
													<Tooltip
														label={expired ? "The card authorization has expired and can no longer be charged. Ask the guest to book again." : ""}
														isDisabled={!expired}
														hasArrow
													>
														<Box as="span">
															<Button
																size="sm"
																colorScheme={captureFailed ? "orange" : "green"}
																isLoading={busy}
																isDisabled={expired}
																onClick={() => requestApprove(b)}
															>
																{captureFailed ? "Retry charge" : "Approve"}
															</Button>
														</Box>
													</Tooltip>
													<Button size="sm" variant="outline" colorScheme="red" isDisabled={busy} onClick={() => setRejectTarget(b)}>Reject</Button>
												</Flex>
											</Td>
											{/* Name and email in one cell. Email was its own column and was the
											    widest thing in the table; stacked here it stays visible while the
											    row scrolls, and the approve dialog repeats it anyway. */}
											<Td
												position={{ base: "static", md: "sticky" }}
												left={{ base: 0, md: ACTIONS_W }}
												zIndex={1}
												bg={surfaceBg}
												minW="200px"
												borderRight="1px solid #2A2D31"
											>
												<Flex align="center" gap={2} wrap="wrap">
													<Text color="white">{b.customerName || "—"}</Text>
													{/* Visible in the list itself, not only in the dialog — the host asked
													    to see this BEFORE deciding, and scanning the table is how they
													    decide. The dialog then repeats it at the point of no return. */}
													{prior.length > 0 && (
														<Badge colorScheme="yellow" fontSize="0.65em" borderRadius="4px" px={1.5}>
															Has {priorQty} ticket{priorQty === 1 ? "" : "s"}
														</Badge>
													)}
												</Flex>
												<Text color="#9C9C9C" fontSize="xs">{b.customerEmail || "—"}</Text>
											</Td>
											<Td color="white">{qty}</Td>
											<Td><PaymentBadge booking={b} /></Td>
											<Td><HoldExpiry booking={b} /></Td>
											{eventQuestions.map((q) => (
												<Td color="white" key={q.id}>{formatAnswer(q.id, b)}</Td>
											))}
											<Td color="white">{b.createdAt ? DateTime.fromISO(b.createdAt).toLocaleString(DateTime.DATETIME_MED) : "—"}</Td>
										</Tr>
										{captureFailed && (
											<Tr>
												<Td colSpan={colSpan} pt={0} borderBottom="1px solid #2A2D31">
													<Box bg="rgba(220,38,38,0.12)" border="1px solid rgba(220,38,38,0.4)" borderRadius="6px" p={2}>
														<Text color="red.300" fontSize="xs" fontWeight={700}>Charge failed — the guest has not been charged and this request is still open.</Text>
														{b.payment?.lastError && (
															<Text color="#D6D6D6" fontSize="xs" mt={1}>{b.payment.lastError}</Text>
														)}
													</Box>
												</Td>
											</Tr>
										)}
										{expired && (
											<Tr>
												<Td colSpan={colSpan} pt={0} borderBottom="1px solid #2A2D31">
													<Box bg="rgba(220,38,38,0.12)" border="1px solid rgba(220,38,38,0.4)" borderRadius="6px" p={2}>
														<Text color="red.300" fontSize="xs">
															The card hold expired before this request was reviewed. The guest was never charged and must book again.
														</Text>
													</Box>
												</Td>
											</Tr>
										)}
									</React.Fragment>
								)
							})}
						</Tbody>
					</Table>
				</TableContainer>
			)}

			{processed.length > 0 && (
				<Box mt={6}>
					<Button size="sm" variant="ghost" color="#9C9C9C" _hover={{ color: "white", bg: "#2A2D31" }} onClick={() => setShowProcessed((v) => !v)}>
						{showProcessed ? "Hide" : "Show"} processed requests ({processed.length})
					</Button>
					{showProcessed && (
						<TableContainer mt={3}>
							<Table variant="simple" size="sm">
								<Thead>
									<Tr>
										<Th color="#9C9C9C">Name</Th>
										<Th color="#9C9C9C">Email</Th>
										<Th color="#9C9C9C">Outcome</Th>
										<Th color="#9C9C9C">When</Th>
									</Tr>
								</Thead>
								<Tbody>
									{processed.map((b: any) => {
										const payment = b.payment || {}
										const when = payment.capturedAt || payment.canceledAt || b.updatedAt || b.createdAt
										return (
											<Tr key={b.bookingRef}>
												<Td color="white">{b.customerName || "—"}</Td>
												<Td color="white">{b.customerEmail || "—"}</Td>
												<Td>
													{payment.status === "captured" ? (
														<Badge colorScheme="green">Charged {money(payment.amount)}</Badge>
													) : payment.status === "expired" ? (
														<Tooltip label="Never charged. The guest must book again." hasArrow>
															<Badge colorScheme="red">Hold expired</Badge>
														</Tooltip>
													) : payment.status === "canceled" ? (
														<Badge colorScheme="gray">
															{b.status === "cancelled" ? "Cancelled" : "Declined"} — {money(payment.amount)} released
														</Badge>
													) : (
														<Badge colorScheme="gray">{payment.status}</Badge>
													)}
												</Td>
												<Td color="white">{when ? DateTime.fromISO(new Date(when).toISOString()).toLocaleString(DateTime.DATETIME_MED) : "—"}</Td>
											</Tr>
										)
									})}
								</Tbody>
							</Table>
						</TableContainer>
					)}
				</Box>
			)}

			{/* Shown on EVERY approval, not just repeat guests. A first request can be for five
			    tickets as easily as one, and the row shows only a bare total — the host needs
			    to see what they're committing to before money moves and capacity is consumed.

			    The prior-bookings section is additive: when the guest already holds tickets it
			    appears as a warning on top. Informational, never a block — hosts have good
			    reasons to approve a second booking (a guest bringing more people, a group split
			    across orders). */}
			<AlertDialog isOpen={!!approveTarget} leastDestructiveRef={cancelRef} onClose={() => setApproveTarget(null)} isCentered>
				<AlertDialogOverlay>
					<AlertDialogContent bg="#1E1E1E" border="1px solid #444">
						{(() => {
							if (!approveTarget) return null
							const prior = priorConfirmedFor(approveTarget)
							const priorQty = prior.reduce((sum, p) => sum + ticketCount(p), 0)
							const thisQty = ticketCount(approveTarget)
							const lines = ticketBreakdown(approveTarget)
							const held = approveTarget?.payment?.amount
							const approveDiscount = describeDiscount(approveTarget)
							const approveMemberships = bookingMemberships(approveTarget?.payment)
							// The row's button reads "Retry charge" after a failed capture; the dialog
							// has to agree, or it looks like a different action from the one clicked.
							const retrying = isCaptureFailed(approveTarget)

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
													<Text>{money(approveTarget.subTotal)}</Text>
												</Flex>
											)}
											{approveDiscount.discounted && (
												<Flex justify="space-between" gap={3} fontSize="xs" py={0.5} color="#F5C518">
													<Text>Discount{approveDiscount.code ? ` (${approveDiscount.code})` : ""}</Text>
													<Text>−{money(approveDiscount.amount)}</Text>
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
													<Text>{MEMBERSHIPS[row.key as MembershipKey]?.receiptLabel || row.key} (first {row.interval || "month"})</Text>
													<Text>{money(Number(row.amount) || 0)}</Text>
												</Flex>
											))}
											<Flex justify="space-between" gap={3} fontSize="sm" fontWeight={700} pt={2} mt={1} borderTop="1px solid #343536">
												{/* Free bookings have no `payment` at all — never imply a charge
												    that will not happen. */}
												<Text>{held !== undefined ? (retrying ? "Charge now" : "Card will be charged") : "Guest pays"}</Text>
												<Text color={held !== undefined ? "#F79432" : "#9C9C9C"}>
													{money(held !== undefined ? held : Number(approveTarget.total ?? 0))}
												</Text>
											</Flex>
										</Box>

										{prior.length > 0 && (
											<Box bg="rgba(247,148,50,0.12)" border="1px solid rgba(247,148,50,0.4)" borderRadius="8px" p={3} mt={4}>
												<Text fontSize="sm" color="#F79432" fontWeight={700}>
													Already has {priorQty} confirmed ticket{priorQty === 1 ? "" : "s"} for this event
												</Text>
												<Box mt={2}>
													{prior.map((p) => (
														<Flex key={p.bookingRef} justify="space-between" gap={3} fontSize="xs" color="#D6D6D6" py={0.5}>
															<Text>
																{ticketCount(p)} ticket{ticketCount(p) === 1 ? "" : "s"} · {p.bookingRef}
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
										<Button ref={cancelRef} onClick={() => setApproveTarget(null)}>Cancel</Button>
										<Button colorScheme={retrying ? "orange" : "green"} onClick={confirmApprove} ml={3}>
											{retrying ? "Retry charge" : prior.length > 0 ? "Approve anyway" : "Approve"}
										</Button>
									</AlertDialogFooter>
								</>
							)
						})()}
					</AlertDialogContent>
				</AlertDialogOverlay>
			</AlertDialog>

			<AlertDialog isOpen={!!rejectTarget} leastDestructiveRef={cancelRef} onClose={() => setRejectTarget(null)} isCentered>
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
							<Button ref={cancelRef} onClick={() => setRejectTarget(null)}>Cancel</Button>
							<Button colorScheme="red" onClick={confirmReject} ml={3}>Reject</Button>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialogOverlay>
			</AlertDialog>
		</Box>
	)
}

export default ApprovalRequests

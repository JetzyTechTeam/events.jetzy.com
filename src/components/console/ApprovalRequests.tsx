import React, { useState } from "react"
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
} from "@chakra-ui/react"
import axios from "axios"
import { useQuery } from "@tanstack/react-query"
import { DateTime } from "luxon"
import { isPendingBooking, isHoldExpired, isCaptureFailed } from "@/lib/booking-status"
import { HoldExpiry, PaymentBadge } from "@/components/bookings/PaymentBadge"
import AnswerText from "@/components/events/AnswerText"

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

import { bookingTicketCount } from "@/lib/booking-approval"
import { useBookingApprovals } from "./approvals/useBookingApprovals"
import { ApprovalDialogs, ticketBreakdown as buildTicketBreakdown } from "./approvals/ApprovalDialogs"
import { ApprovalActions, expiringSoonBookings } from "./approvals/ApprovalActions"

const money = (n?: number) => `$${Number(n || 0).toFixed(2)}`

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
	const [showProcessed, setShowProcessed] = useState(false)

	const { data: bookings = [], isLoading, isError } = useQuery({
		queryKey: ["event-bookings", eventId],
		queryFn: async () => {
			const res = await axios.post("/api/get-bookings", { eventId })
			return res.data || []
		},
	})

	// Every approval rule and side effect lives in the hook, which the Guests tab mounts too —
	// so the button offered here and the one offered there cannot disagree.
	const approvals = useBookingApprovals({ eventId, bookings: bookings as any[] })
	const { fitFor, limitedTickets, priorConfirmedFor } = approvals

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

	const expiringSoon = expiringSoonBookings(pending)

	const eventQuestions: any[] = event?.questions || []

	const ticketBreakdown = (b: any) => buildTicketBreakdown(event, b)

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
			// `url` and `note` come from a social-profile answer (and its opt-out note). Both
			// were missing here while the Responses table and the guest modal showed them, so a
			// host reviewing a request saw "—" for a question the guest had actually answered —
			// and the profile link is often the whole basis for approving them.
			if (ans.answer.url) parts.push(ans.answer.url)
			if (ans.answer.note) parts.push(ans.answer.note)
			return parts.join(" · ") || "—"
		}
		return String(ans.answer) || "—"
	}

	if (isLoading) return <Text color="white">Loading requests...</Text>
	if (isError) return <Text color="red.400">Failed to load requests.</Text>

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

			{/* What's actually left, so the host isn't ambushed mid-queue.
			    Rendered ONLY for tickets that carry a limit — on an unlimited event nothing new
			    appears at all, which is most events. */}
			{limitedTickets.length > 0 && (
				<Box bg="#15181C" border="1px solid #343536" borderRadius="8px" p={3} mb={4}>
					<Text color="#9C9C9C" fontSize="xs" fontWeight={700} textTransform="uppercase" letterSpacing="0.04em" mb={2}>
						Spots left
					</Text>
					<Flex gap={4} wrap="wrap">
						{limitedTickets.map((t) => (
							<Flex key={t.ticketId} align="center" gap={2}>
								<Text color="#D6D6D6" fontSize="sm">{t.name || "Ticket"}</Text>
								<Badge colorScheme={t.remaining === 0 ? "red" : (t.remaining ?? 0) <= 5 ? "orange" : "green"} borderRadius="4px">
									{t.remaining === 0 ? "Sold out" : `${t.remaining} left`}
								</Badge>
							</Flex>
						))}
					</Flex>
					{/* The reason a host can end up with more requests than seats, said once
					    rather than discovered at the third approval. */}
					<Text color="#9C9C9C" fontSize="xs" mt={2}>
						Requests don&apos;t hold a spot until you approve them, so you may have more requests than spots.
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
								const qty = bookingTicketCount(b?.tickets)
								const expired = isHoldExpired(b)
								const captureFailed = isCaptureFailed(b)
								// Actions, Guest, Tickets, Payment, Expires, …questions…, Requested.
								const colSpan = 6 + eventQuestions.length
								const prior = priorConfirmedFor(b)
								const priorQty = prior.reduce((sum, p) => sum + bookingTicketCount(p?.tickets), 0)
								const fit = fitFor(b)

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
												<ApprovalActions booking={b} controller={approvals} />
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
											{/* The ticket NAME, not just a count. A host running VIP and General
											    couldn't tell what they were approving without opening the dialog. */}
											<Td color="white">
												{ticketBreakdown(b).length > 0 ? (
													ticketBreakdown(b).map((line, i) => (
														<Text key={i} fontSize="sm" whiteSpace="nowrap">
															{line.quantity} &times; {line.name}
														</Text>
													))
												) : (
													<Text fontSize="sm">{qty}</Text>
												)}
												{/* Says the squeeze out loud before the host clicks a button that
												    would only be refused. */}
												{!fit.fits && fit.seatable !== null && (
													<Badge colorScheme={fit.seatable > 0 ? "orange" : "red"} fontSize="0.65em" borderRadius="4px" px={1.5} mt={1}>
														{fit.seatable > 0 ? `Needs ${qty}, ${fit.seatable} left` : "No spots left"}
													</Badge>
												)}
											</Td>
											<Td><PaymentBadge booking={b} /></Td>
											<Td><HoldExpiry booking={b} /></Td>
											{eventQuestions.map((q) => (
												<Td color="white" key={q.id} whiteSpace="normal" maxW="240px"><AnswerText value={formatAnswer(q.id, b)} /></Td>
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
										{/* Past decisions were unreadable without this — Outcome alone doesn't
										    say what was actually approved or declined. */}
										<Th color="#9C9C9C">Tickets</Th>
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
												<Td color="white">
													{ticketBreakdown(b).length > 0 ? (
														ticketBreakdown(b).map((line, i) => (
															<Text key={i} fontSize="sm" whiteSpace="nowrap">
																{line.quantity} &times; {line.name}
															</Text>
														))
													) : (
														<Text fontSize="sm">{bookingTicketCount(b?.tickets) || "—"}</Text>
													)}
												</Td>
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

			{/* The approve and reject dialogs are shared with the Guests tab, so one definition of
			    what each decision means — and of what it costs — serves both screens. */}
			<ApprovalDialogs controller={approvals} event={event} />
		</Box>
	)
}

export default ApprovalRequests

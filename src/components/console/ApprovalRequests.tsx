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
import { isPendingBooking, isHoldExpired, isCaptureFailed, holdTimeRemaining } from "@/lib/booking-status"
import { HoldExpiry, PaymentBadge } from "@/components/bookings/PaymentBadge"

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

export function ApprovalRequests({ eventId, event }: { eventId: string; event?: any }) {
	const toast = useToast({ position: "top" })
	const queryClient = useQueryClient()
	const [processingRef, setProcessingRef] = useState<string | null>(null)
	const [rejectTarget, setRejectTarget] = useState<any | null>(null)
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

	const eventQuestions: any[] = event?.questions || []

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
						<Thead>
							<Tr>
								<Th color="#9C9C9C">Name</Th>
								<Th color="#9C9C9C">Email</Th>
								<Th color="#9C9C9C">Tickets</Th>
								<Th color="#9C9C9C">Payment</Th>
								<Th color="#9C9C9C">Expires</Th>
								{eventQuestions.map((q) => (
									<Th color="#9C9C9C" key={q.id}>{q.title}</Th>
								))}
								<Th color="#9C9C9C">Requested</Th>
								<Th color="#9C9C9C" textAlign="right">Actions</Th>
							</Tr>
						</Thead>
						<Tbody>
							{pending.map((b: any) => {
								const qty = (b.tickets || []).reduce((s: number, t: any) => s + (t.quantity || 0), 0)
								const busy = processingRef === b.bookingRef
								const expired = isHoldExpired(b)
								const captureFailed = isCaptureFailed(b)
								const colSpan = 8 + eventQuestions.length

								return (
									<React.Fragment key={b.bookingRef}>
										<Tr>
											<Td color="white">{b.customerName || "—"}</Td>
											<Td color="white">{b.customerEmail || "—"}</Td>
											<Td color="white">{qty}</Td>
											<Td><PaymentBadge booking={b} /></Td>
											<Td><HoldExpiry booking={b} /></Td>
											{eventQuestions.map((q) => (
												<Td color="white" key={q.id}>{formatAnswer(q.id, b)}</Td>
											))}
											<Td color="white">{b.createdAt ? DateTime.fromISO(b.createdAt).toLocaleString(DateTime.DATETIME_MED) : "—"}</Td>
											<Td textAlign="right">
												<Flex gap={2} justify="flex-end">
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
																onClick={() => act(b.bookingRef, "approve")}
															>
																{captureFailed ? "Retry charge" : "Approve"}
															</Button>
														</Box>
													</Tooltip>
													<Button size="sm" variant="outline" colorScheme="red" isDisabled={busy} onClick={() => setRejectTarget(b)}>Reject</Button>
												</Flex>
											</Td>
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

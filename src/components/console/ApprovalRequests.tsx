import React, { useRef, useState } from "react"
import {
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
import { isPendingBooking } from "@/lib/booking-status"

/**
 * Lists PENDING (awaiting-approval) bookings for an event with Approve / Reject.
 * Shared by the console Manage page and the public event-detail admin section.
 */
export function ApprovalRequests({ eventId, event }: { eventId: string; event?: any }) {
	const toast = useToast({ position: "top" })
	const queryClient = useQueryClient()
	const [processingRef, setProcessingRef] = useState<string | null>(null)
	const [rejectTarget, setRejectTarget] = useState<any | null>(null)
	const cancelRef = useRef<HTMLButtonElement>(null)

	const { data: bookings = [], isLoading, isError } = useQuery({
		queryKey: ["event-bookings", eventId],
		queryFn: async () => {
			const res = await axios.post("/api/get-bookings", { eventId })
			return res.data || []
		},
	})

	const pending = (bookings as any[]).filter((b) => isPendingBooking(b))
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
				toast({ title: action === "approve" ? "Request approved" : "Request rejected", status: "success", duration: 3000, isClosable: true })
				queryClient.invalidateQueries({ queryKey: ["event-bookings", eventId] })
				queryClient.invalidateQueries({ queryKey: ["guests-list", eventId] })
			} else {
				toast({ title: res.data?.message || "Action failed", status: "error", duration: 4000, isClosable: true })
			}
		} catch (e: any) {
			toast({ title: e?.response?.data?.message || "Action failed", status: "error", duration: 4000, isClosable: true })
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
	if (!pending.length) return <Text color="white">No pending approval requests.</Text>

	return (
		<Box overflowX="auto">
			<TableContainer>
				<Table variant="simple" size="sm">
					<Thead>
						<Tr>
							<Th color="#9C9C9C">Name</Th>
							<Th color="#9C9C9C">Email</Th>
							<Th color="#9C9C9C">Tickets</Th>
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
							return (
								<Tr key={b.bookingRef}>
									<Td color="white">{b.customerName || "—"}</Td>
									<Td color="white">{b.customerEmail || "—"}</Td>
									<Td color="white">{qty}</Td>
									{eventQuestions.map((q) => (
										<Td color="white" key={q.id}>{formatAnswer(q.id, b)}</Td>
									))}
									<Td color="white">{b.createdAt ? DateTime.fromISO(b.createdAt).toLocaleString(DateTime.DATETIME_MED) : "—"}</Td>
									<Td textAlign="right">
										<Flex gap={2} justify="flex-end">
											<Button size="sm" colorScheme="green" isLoading={busy} onClick={() => act(b.bookingRef, "approve")}>Approve</Button>
											<Button size="sm" variant="outline" colorScheme="red" isDisabled={busy} onClick={() => setRejectTarget(b)}>Reject</Button>
										</Flex>
									</Td>
								</Tr>
							)
						})}
					</Tbody>
				</Table>
			</TableContainer>

			<AlertDialog isOpen={!!rejectTarget} leastDestructiveRef={cancelRef} onClose={() => setRejectTarget(null)} isCentered>
				<AlertDialogOverlay>
					<AlertDialogContent bg="#1E1E1E" border="1px solid #444">
						<AlertDialogHeader fontSize="lg" fontWeight="bold" color="white">Reject Request</AlertDialogHeader>
						<AlertDialogBody color="white">
							Reject {rejectTarget?.customerName || "this attendee"}&apos;s request? They will be emailed that they weren&apos;t approved. This cannot be undone.
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

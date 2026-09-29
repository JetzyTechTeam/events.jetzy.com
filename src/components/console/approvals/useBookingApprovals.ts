import React from "react"
import axios from "axios"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useToast } from "@chakra-ui/react"
import { isPendingBooking, isCancelledBooking } from "@/lib/booking-status"
import { approvalFit, bookingTicketCount, buildPartialSelection, type ApprovalFit } from "@/lib/booking-approval"
import type { EventAvailability } from "@/lib/ticket-availability"

/**
 * Every rule and side effect behind approving or rejecting a booking, in one place.
 *
 * Extracted from `ApprovalRequests.tsx` when the Guests tab gained the same controls. The two
 * tables look nothing alike — one row per booking with frozen columns and per-question columns,
 * versus one row per PERSON — so only the rules are shared, and rules are what this exports.
 * Copying `act()` into a second component would be the failure mode worth avoiding: it carries
 * the three cache invalidations that keep the pending count, the guest roster and the seat
 * counts agreeing with each other.
 *
 * `bookings` is passed IN rather than fetched here, so both mount points keep sharing the one
 * `["event-bookings", eventId]` cache entry and this hook adds no second request.
 */

const money = (n?: number) => `$${Number(n || 0).toFixed(2)}`

/**
 * Key a guest by email.
 *
 * MUST be case-insensitive: `Bookings.customerEmail` has no `lowercase: true`, so the same
 * person booking twice can be stored as `Ali@x.com` and `ali@x.com`. An exact comparison
 * silently reports "no existing tickets" for anyone who capitalised differently.
 *
 * Returns "" for a missing address, which callers treat as "can't identify" — otherwise every
 * booking without an email would group together and be reported as the same guest.
 */
export const guestKey = (email?: string | null) => (email || "").trim().toLowerCase()

export type BookingApprovalsController = {
	availability: EventAvailability | undefined
	/** Tickets that actually carry a limit — the only ones worth reporting remaining stock for. */
	limitedTickets: EventAvailability["tickets"]

	processingRef: string | null
	isProcessing: (bookingRef?: string | null) => boolean

	/** Does this request still fit, and if not how much of it does? */
	fitFor: (booking: any) => ApprovalFit
	/** Confirmed bookings held by the same guest, excluding the one being reviewed. */
	priorConfirmedFor: (booking: any) => any[]

	approveTarget: any | null
	rejectTarget: any | null
	requestApprove: (booking: any) => void
	requestReject: (booking: any) => void
	closeApprove: () => void
	closeReject: () => void
	confirmApprove: (seatable?: number) => Promise<void>
	confirmReject: () => Promise<void>
}

export function useBookingApprovals({
	eventId,
	bookings,
}: {
	eventId: string
	bookings: any[]
}): BookingApprovalsController {
	const toast = useToast({ position: "top" })
	const queryClient = useQueryClient()
	const [processingRef, setProcessingRef] = React.useState<string | null>(null)
	const [rejectTarget, setRejectTarget] = React.useState<any | null>(null)
	const [approveTarget, setApproveTarget] = React.useState<any | null>(null)

	// How many seats are actually left. The same public endpoint the event page uses, so the
	// host and the guest can never be looking at two different numbers.
	//
	// It counts every live booking EXCEPT pending ones — a request holds no seat until it is
	// approved, which is exactly the arithmetic the host needs here.
	const { data: availability } = useQuery<EventAvailability>({
		queryKey: ["event-availability", eventId],
		queryFn: async () => (await axios.get(`/api/events/${eventId}/availability`)).data,
		staleTime: 10_000,
		enabled: !!eventId,
	})

	const fitFor = (b: any): ApprovalFit => approvalFit(b?.tickets, availability)

	const limitedTickets = (availability?.tickets || []).filter((t) => t.remaining !== null)

	// Tickets this guest ALREADY holds for this event, so the host isn't approving a second
	// booking blind.
	//
	// "Confirmed" is decided BY EXCLUSION, never by allowlisting BookingStatus.CONFIRMED:
	// `status` is not a closed set. `checked_in` is written by the mobile app against the
	// shared collection, and an allowlist would silently hide every guest already through
	// the door — exactly the ones a host most needs to know about.
	const confirmedByGuest = React.useMemo(() => {
		const map = new Map<string, any[]>()
		for (const b of bookings || []) {
			// `/api/get-bookings` does not filter `isDeleted` (unlike bookings/mine and
			// bookings/preview), so exclude them here — a host must not be warned about, or make
			// a decision on, a booking that has been removed.
			if (b?.isDeleted) continue
			if (isPendingBooking(b) || isCancelledBooking(b)) continue
			const key = guestKey(b.customerEmail)
			if (!key) continue
			map.set(key, [...(map.get(key) || []), b])
		}
		return map
	}, [bookings])

	const priorConfirmedFor = (b: any): any[] => {
		const key = guestKey(b?.customerEmail)
		if (!key) return []
		return (confirmedByGuest.get(key) || []).filter((other) => other.bookingRef !== b.bookingRef)
	}

	const act = async (
		bookingRef: string,
		action: "approve" | "reject",
		/** A REDUCED ticket list — seating only part of the request. Omitted for a normal approval. */
		tickets?: Array<{ ticketId: string; quantity: number }>,
	) => {
		setProcessingRef(bookingRef)
		try {
			const res = await axios.post(`/api/bookings/${action}`, { bookingRef, ...(tickets ? { tickets } : {}) })
			if (res.data?.status) {
				// Say what happened to the money, not just "done" — this is the only
				// confirmation the host gets that a card was actually charged.
				const amount = res.data?.data?.amountCharged ?? res.data?.data?.releasedAmount
				const partial = res.data?.data?.partial
					? `${res.data.data.approvedTickets} of ${res.data.data.requestedTickets} tickets approved.`
					: undefined
				const detail =
					action === "approve"
						? [partial, amount !== undefined ? `${money(amount)} charged successfully.` : undefined].filter(Boolean).join(" ") || undefined
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
				// Seats just moved — without this the remaining count and the "doesn't fit"
				// badges keep showing the state from before this approval.
				queryClient.invalidateQueries({ queryKey: ["event-availability", eventId] })
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

	const confirmApprove = async (seatable?: number) => {
		if (!approveTarget) return
		const ref = approveTarget.bookingRef
		// Built from the SAME helper the server validates against, so the two cannot disagree
		// about what a reduced selection looks like.
		const reduced =
			seatable !== undefined && seatable < bookingTicketCount(approveTarget?.tickets)
				? buildPartialSelection(approveTarget.tickets, seatable)
				: undefined
		setApproveTarget(null)
		await act(ref, "approve", reduced)
	}

	return {
		availability,
		limitedTickets,
		processingRef,
		isProcessing: (ref) => !!ref && processingRef === ref,
		fitFor,
		priorConfirmedFor,
		approveTarget,
		rejectTarget,
		requestApprove,
		requestReject: (b: any) => setRejectTarget(b),
		closeApprove: () => setApproveTarget(null),
		closeReject: () => setRejectTarget(null),
		confirmApprove,
		confirmReject,
	}
}

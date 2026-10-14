import React from "react"
import axios from "axios"
import { useToast } from "@chakra-ui/react"
import { isPendingBooking } from "@/lib/booking-status"

/**
 * Editing a booking — the name on it, and how many tickets it is for — pending request or
 * confirmed booking alike.
 *
 * Every screen that lists bookings opens the same `EditBookingDialog` through this hook: the
 * Approvals tab and the Guests tab (via `useBookingApprovals`, which includes it), the Event
 * Bookings table and the Bookings panel on the event page (directly). The dialog reads
 * `bookingEditMode`, and the save goes to the endpoint whose rules match the booking:
 *
 *  - PENDING   → `api/bookings/update-request` (a held or membership request stores the lower
 *                number as a plan, applied at approval);
 *  - CONFIRMED → `api/bookings/update-tickets` (changed on save; quantity on free bookings only).
 *
 * Nothing is charged and nothing is emailed by a save.
 */

/** Only what actually changed is sent — an omitted key is left alone by the server. */
export type BookingEditChanges = {
	customerName?: string
	tickets?: Array<{ ticketId: string; quantity: number }>
}

export type BookingEditController = {
	/** The booking being edited, if any. */
	editTarget: any | null
	isSavingEdit: boolean
	requestEdit: (booking: any) => void
	closeEdit: () => void
	saveEdit: (changes: BookingEditChanges) => Promise<void>
}

export function useBookingEdit({
	onSettled,
}: {
	/**
	 * Called after every save attempt, successful or not, so the caller can refresh whatever
	 * it lists. On failure too: a refusal usually means the booking moved under the dialog.
	 */
	onSettled?: (saved: boolean) => void
} = {}): BookingEditController {
	const toast = useToast({ position: "top" })
	const [editTarget, setEditTarget] = React.useState<any | null>(null)
	const [isSavingEdit, setIsSavingEdit] = React.useState(false)

	const saveEdit = async (changes: BookingEditChanges) => {
		if (!editTarget) return
		const ref = editTarget.bookingRef
		const pending = isPendingBooking(editTarget)
		let saved = false
		setIsSavingEdit(true)
		try {
			const res = await axios.post(pending ? "/api/bookings/update-request" : "/api/bookings/update-tickets", { bookingRef: ref, ...changes })
			if (res.data?.status) {
				saved = true
				toast({
					title: pending ? "Request updated" : "Booking updated",
					description: res.data?.message,
					status: "success",
					duration: 5000,
					isClosable: true,
				})
				setEditTarget(null)
			} else {
				toast({ title: res.data?.message || "Could not save the changes", status: "error", duration: 8000, isClosable: true })
			}
		} catch (e: any) {
			toast({ title: e?.response?.data?.message || "Could not save the changes", status: "error", duration: 8000, isClosable: true })
		} finally {
			setIsSavingEdit(false)
			onSettled?.(saved)
		}
	}

	return {
		editTarget,
		isSavingEdit,
		requestEdit: (b: any) => setEditTarget(b),
		closeEdit: () => setEditTarget(null),
		saveEdit,
	}
}

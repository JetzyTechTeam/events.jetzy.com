import React from "react"
import axios from "axios"
import { useToast } from "@chakra-ui/react"

/**
 * Editing a pending request — the name on it, and how many tickets it is for.
 *
 * Its own hook, apart from `useBookingApprovals`, because a pending request is listed on more
 * screens than can approve one: the Approvals tab and the Guests tab (which mount the approvals
 * hook, and get this through it), but also the Event Bookings table and the Bookings panel on
 * the event page, which only list bookings. Every one of them opens the same
 * `EditRequestDialog` and posts to the same `api/bookings/update-request` — so a request can be
 * corrected wherever the host happens to be looking at it, on the same terms.
 *
 * Nothing is charged and nothing is emailed by a save: a FREE request's tickets simply change,
 * and a request with a card hold has the lower number stored beside it, to be applied when it
 * is approved.
 */

/** Only what actually changed is sent — an omitted key is left alone by the server. */
export type RequestEditChanges = {
	customerName?: string
	tickets?: Array<{ ticketId: string; quantity: number }>
}

export type RequestEditController = {
	/** The pending request being edited, if any. */
	editTarget: any | null
	isSavingEdit: boolean
	requestEdit: (booking: any) => void
	closeEdit: () => void
	saveEdit: (changes: RequestEditChanges) => Promise<void>
}

export function useRequestEdit({
	onSettled,
}: {
	/**
	 * Called after every save attempt, successful or not, so the caller can refresh whatever
	 * it lists. On failure too: a refusal usually means the request moved under the dialog.
	 */
	onSettled?: (saved: boolean) => void
} = {}): RequestEditController {
	const toast = useToast({ position: "top" })
	const [editTarget, setEditTarget] = React.useState<any | null>(null)
	const [isSavingEdit, setIsSavingEdit] = React.useState(false)

	const saveEdit = async (changes: RequestEditChanges) => {
		if (!editTarget) return
		const ref = editTarget.bookingRef
		let saved = false
		setIsSavingEdit(true)
		try {
			const res = await axios.post("/api/bookings/update-request", { bookingRef: ref, ...changes })
			if (res.data?.status) {
				saved = true
				toast({ title: "Request updated", description: res.data?.message, status: "success", duration: 5000, isClosable: true })
				setEditTarget(null)
			} else {
				toast({ title: res.data?.message || "Could not update the request", status: "error", duration: 8000, isClosable: true })
			}
		} catch (e: any) {
			toast({ title: e?.response?.data?.message || "Could not update the request", status: "error", duration: 8000, isClosable: true })
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

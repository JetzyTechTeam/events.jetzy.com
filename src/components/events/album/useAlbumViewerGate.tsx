import React, { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import axios from "axios"
import { GuestAccessModal, InterestsModal } from "@/components/events/EventAlbums"

/**
 * Album viewing gate, shared by the album page.
 *
 * Same rules as the event-page album section:
 *  - covers/metadata are public, but opening an album needs an identified viewer
 *  - unidentified  -> name + email dialog (creates/matches the account silently)
 *  - identified but never asked for interests on this event -> interests-only dialog
 *    (this is how publish-email arrivals, who are signed in by the magic link and so
 *    never see the name+email gate, still get asked)
 *  - once through, the view is recorded once per person per album
 *
 * Render `gateUi` somewhere in the page, and only reveal media when `ready` is true.
 */
export function useAlbumViewerGate(eventId: string) {
	const { data: session, status } = useSession()

	const [hasGuestAccess, setHasGuestAccess] = useState(false)
	const [needsInterests, setNeedsInterests] = useState(false)
	const [probeSettled, setProbeSettled] = useState(false)
	const [guestOpen, setGuestOpen] = useState(false)
	const [interestsOpen, setInterestsOpen] = useState(false)

	const hasAccess = !!session || hasGuestAccess

	// Who is this, and do we already have their interests for this event?
	useEffect(() => {
		if (status === "loading") return
		let cancelled = false
		axios
			.get(`/api/events/${eventId}/albums/viewer`)
			.then((res) => {
				if (cancelled) return
				const d = res.data?.data
				if (d?.identified) {
					setHasGuestAccess(true)
					setNeedsInterests(!d.hasInterests)
				}
			})
			.catch(() => { /* treat as anonymous */ })
			.finally(() => { if (!cancelled) setProbeSettled(true) })
		return () => { cancelled = true }
	}, [session, status, eventId])

	// Ask for whatever is still missing, once the probe has settled.
	useEffect(() => {
		if (status === "loading" || !probeSettled) return
		if (!hasAccess) { setGuestOpen(true); return }
		setGuestOpen(false)
		if (needsInterests) setInterestsOpen(true)
	}, [status, probeSettled, hasAccess, needsInterests])

	const ready = hasAccess && !needsInterests && probeSettled

	// Manual retry. The auto-open effect above only fires when its inputs change, so a
	// viewer who dismisses the dialog would otherwise be stuck on a page with no way back.
	const openGate = useCallback(() => {
		if (!hasAccess) { setGuestOpen(true); return }
		if (needsInterests) setInterestsOpen(true)
	}, [hasAccess, needsInterests])

	// Records the view (analytics + the one-time notice email). Server dedupes per
	// person/album; this guard just avoids repeat calls in the same tab.
	const recordAlbumAccess = useCallback((albumId: string) => {
		if (typeof window === "undefined") return
		const key = `album_access_${albumId}`
		if (sessionStorage.getItem(key)) return
		sessionStorage.setItem(key, "1")
		let isNewAccount: boolean | undefined
		try {
			const flag = sessionStorage.getItem("album_is_new_account")
			if (flag !== null) isNewAccount = flag === "1"
		} catch {}
		axios
			.post(`/api/events/${eventId}/albums/${albumId}/access`, isNewAccount === undefined ? {} : { isNewAccount })
			.catch((e) => console.error("album access notify failed", e))
	}, [eventId])

	const gateUi = (
		<>
			<GuestAccessModal
				isOpen={guestOpen}
				onClose={() => setGuestOpen(false)}
				eventId={eventId}
				onGranted={() => {
					setHasGuestAccess(true)
					// The name+email gate collects interests too.
					setNeedsInterests(false)
					setGuestOpen(false)
				}}
			/>
			<InterestsModal
				isOpen={interestsOpen}
				onClose={() => setInterestsOpen(false)}
				eventId={eventId}
				onSaved={() => {
					setNeedsInterests(false)
					setInterestsOpen(false)
				}}
			/>
		</>
	)

	return { ready, hasAccess, probeSettled, recordAlbumAccess, openGate, gateUi, session }
}

import React, { useCallback, useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import axios from "axios"
import { GuestAccessModal, InterestsModal } from "@/components/events/EventAlbums"
import { useAnalytics } from "@/hooks/useAnalytics"

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
type Stage = "landed" | "gate_shown" | "code_sent" | "identified"

export function useAlbumViewerGate(eventId: string) {
	const { data: session, status } = useSession()
	const { anonId, sessionId } = useAnalytics()

	const [hasGuestAccess, setHasGuestAccess] = useState(false)
	// Who the server says this is. Used by anything that needs to act AS the viewer (the
	// unwatermarked-photo request), so it can prefill the address and skip a second code for
	// someone whose address was proved at the gate minutes ago.
	const [viewer, setViewer] = useState<{ email?: string; name?: string; verified?: boolean } | null>(null)

	/**
	 * Gate funnel. `AlbumAccess` is only written once somebody is through, so without this the
	 * people who landed, saw the dialog and left are invisible — and they are exactly who the
	 * host needs to see. Set by `recordAlbumAccess`, which is where the page names its album.
	 */
	const trackedAlbumRef = useRef<string | null>(null)
	// Stages can fire before the page has named its album (the gate effect races the mount) and
	// before the anon id has been read out of localStorage. Dropping them there would silently
	// lose the very steps the funnel is measuring, so they queue and flush.
	const pendingRef = useRef<{ stage: Stage; email?: string }[]>([])

	const postStage = useCallback(
		(stage: Stage, email?: string) => {
			const albumId = trackedAlbumRef.current
			if (!albumId || !anonId) return false
			// Once per stage per album per tab: React re-runs effects, and a funnel that
			// double-counts one of its steps is worse than no funnel.
			const key = `album_stage_${albumId}_${stage}`
			try {
				if (sessionStorage.getItem(key)) return
				sessionStorage.setItem(key, "1")
			} catch {}
			axios
				.post(`/api/events/${eventId}/albums/${albumId}/view`, { anonId, sessionId: sessionId || undefined, stage, email })
				.catch(() => { /* instrumentation must never surface to the visitor */ })
			return true
		},
		[anonId, eventId, sessionId],
	)

	const trackStage = useCallback(
		(stage: Stage, email?: string) => {
			if (!postStage(stage, email)) pendingRef.current.push({ stage, email })
		},
		[postStage],
	)

	// Flush whatever queued up, once both the album and the anon id are known.
	useEffect(() => {
		if (!anonId || !trackedAlbumRef.current || pendingRef.current.length === 0) return
		const queued = pendingRef.current
		pendingRef.current = []
		queued.forEach(({ stage, email }) => postStage(stage, email))
		// Only `anonId` here: the other reason a stage can queue is the album not being named
		// yet, and `trackAlbumLanding` flushes that case itself.
	}, [anonId, postStage])
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
					// `verified` is UNDEFINED on cookies minted before the code gate — keep it
					// that way rather than flattening it to false.
					setViewer({ email: d.email, name: d.name, verified: d.verified })
				}
			})
			.catch(() => { /* treat as anonymous */ })
			.finally(() => { if (!cancelled) setProbeSettled(true) })
		return () => { cancelled = true }
	}, [session, status, eventId])

	// Ask for whatever is still missing, once the probe has settled.
	useEffect(() => {
		if (status === "loading" || !probeSettled) return
		if (!hasAccess) {
			setGuestOpen(true)
			trackStage("gate_shown")
			return
		}
		setGuestOpen(false)
		// Already identified when they arrived (a session, or a returning guest cookie): they
		// never see the door, so the funnel records them as through it.
		trackStage("identified")
		if (needsInterests) setInterestsOpen(true)
	}, [status, probeSettled, hasAccess, needsInterests, trackStage])

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
				onCodeSent={(email) => trackStage("code_sent", email)}
				onGranted={(granted?: { email?: string; name?: string }) => {
					setHasGuestAccess(true)
					// The name+email gate collects interests too.
					setNeedsInterests(false)
					setGuestOpen(false)
					// They just passed the emailed code, so they ARE verified — the probe
					// above ran before that and would otherwise leave this stale.
					setViewer((v) => ({ ...(v || {}), ...(granted || {}), verified: true }))
					trackStage("identified", granted?.email)
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

	/**
	 * Names the album being viewed and records the landing.
	 *
	 * Deliberately separate from `recordAlbumAccess`, which only fires once the viewer is
	 * `ready` — the whole point of the funnel is the people who never get that far.
	 */
	const trackAlbumLanding = useCallback((albumId: string) => {
		trackedAlbumRef.current = albumId
		trackStage("landed")
		// Anything the gate recorded before the album was named goes out now.
		const queued = pendingRef.current
		pendingRef.current = []
		queued.forEach(({ stage, email }) => trackStage(stage, email))
	}, [trackStage])

	return { ready, hasAccess, probeSettled, recordAlbumAccess, openGate, gateUi, session, viewer, trackAlbumLanding }
}

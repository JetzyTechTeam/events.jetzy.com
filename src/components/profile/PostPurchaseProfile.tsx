import React from "react"
import dynamic from "next/dynamic"
import { useSession } from "next-auth/react"
import { useQueryClient } from "@tanstack/react-query"
import type { JetzyProfile } from "@/lib/jetzy-profile"
import { fetchProfileStatus, profileStatusKey, type ProfileStatus } from "./ProfileGate"

const ProfileCompletionModal = dynamic(() => import("./ProfileCompletionModal"), { ssr: false })

export const POST_PURCHASE_INTRO = "You're a Jetzy Premium member! One last step."
/** After card setup on an application — nothing is active yet, so it must not say "member". */
export const APPLICATION_INTRO = "Your application is in! One last step while we review it."

/**
 * Asks for the profile straight AFTER a confirmed Jetzy Premium payment (CEO, 2026-09-22) — on
 * `/premium`, `/subscribe` and the Premium pop-up. Those doors are ungated before purchase, so this
 * is the one place a buyer there is asked.
 *
 * `prompt(onDone)` checks the profile and opens the form only if something is missing; `onDone`
 * runs once it is complete either way, which is how `/subscribe` returns to the app afterwards.
 * Fails open exactly like the gate: an unreadable profile counts as complete.
 */
export function usePostPurchaseProfile() {
	const { data: session } = useSession()
	const userId = (session?.user as any)?._id as string | undefined
	const queryClient = useQueryClient()
	const [pending, setPending] = React.useState<{ profile?: JetzyProfile; onDone?: () => void; intro: string } | null>(null)
	/**
	 * Covers the gap between "back from Stripe" and "we know whether to ask".
	 *
	 * Reading the profile is a round trip, and the dialog behind this renders its member (or
	 * "under review") card straight away — so the buyer saw that card for about a second and then had
	 * a form thrown over it. The overlay owns that moment instead, for all three doors at once.
	 */
	const [checking, setChecking] = React.useState(false)
	const promptedRef = React.useRef(false)

	const prompt = React.useCallback(async (onDone?: () => void, opts?: { intro?: string }) => {
		// One ask per page load — a return handler can run twice (React strict mode, a bfcache restore).
		if (promptedRef.current) return
		promptedRef.current = true
		setChecking(true)
		const status = await fetchProfileStatus()
		setChecking(false)
		if (status.complete) {
			onDone?.()
			return
		}
		setPending({ profile: status.profile, onDone, intro: opts?.intro || POST_PURCHASE_INTRO })
	}, [])

	const element = checking ? (
		<div className="fixed inset-0 z-[1500] flex flex-col items-center justify-center gap-3 bg-black/80" role="status" aria-live="polite">
			<span className="h-8 w-8 animate-spin rounded-full border-2 border-[#434343] border-t-app" />
			<p className="text-sm font-medium text-white">Finishing up…</p>
		</div>
	) : pending ? (
		<ProfileCompletionModal
			isOpen
			intro={pending.intro}
			initialProfile={pending.profile}
			onCompleted={(profile) => {
				queryClient.setQueryData<ProfileStatus>(profileStatusKey(userId), { complete: true, missing: [], profile })
				const done = pending.onDone
				setPending(null)
				done?.()
			}}
		/>
	) : null

	return { prompt, element }
}

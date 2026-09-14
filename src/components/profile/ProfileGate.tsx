import React from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/router"
import { useSession } from "next-auth/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { isUngatedPath, type JetzyProfile, type ProfileField } from "@/lib/jetzy-profile"

// Lazy: the Places widget and upload code are only needed by the few users who are incomplete,
// and must not weigh down every page for everybody else.
const ProfileCompletionModal = dynamic(() => import("./ProfileCompletionModal"), { ssr: false })

export type ProfileStatus = {
	complete: boolean
	missing: ProfileField[]
	profile?: JetzyProfile
	unavailable?: boolean
}

/** Keyed by user so signing out and in as somebody else can't reuse the last person's answer. */
export const profileStatusKey = (userId?: string) => ["profile-status", userId || ""]

/** `GET /api/profile`. Any failure reads as complete — the gate fails open. */
export const fetchProfileStatus = async (): Promise<ProfileStatus> => {
	try {
		const res = await fetch("/api/profile")
		const json = await res.json()
		if (!res.ok || !json?.status || !json?.data) return { complete: true, missing: [], unavailable: true }
		return json.data
	} catch {
		return { complete: true, missing: [], unavailable: true }
	}
}

export const useProfileStatus = (userId: string | undefined, enabled: boolean) =>
	useQuery({
		queryKey: profileStatusKey(userId),
		queryFn: fetchProfileStatus,
		enabled,
		staleTime: 5 * 60 * 1000,
		refetchOnWindowFocus: false,
	})

/**
 * Blocks every portal page for a signed-in person whose Jetzy profile is incomplete, until they
 * complete it. Mounted once in `_app.tsx`. See `isUngatedPath` for the pages it never blocks.
 */
export default function ProfileGate() {
	const { status, data: session } = useSession()
	const userId = (session?.user as any)?._id as string | undefined
	const { pathname } = useRouter()
	const queryClient = useQueryClient()

	const gated = status === "authenticated" && !isUngatedPath(pathname)
	const { data } = useProfileStatus(userId, gated)

	if (!gated || !data || data.complete) return null

	return (
		<ProfileCompletionModal
			isOpen
			initialProfile={data.profile}
			onCompleted={(profile) => {
				queryClient.setQueryData<ProfileStatus>(profileStatusKey(userId), { complete: true, missing: [], profile })
			}}
		/>
	)
}

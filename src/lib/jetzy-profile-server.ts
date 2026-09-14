/**
 * Server half of profile completion — the backend calls and the local mirror.
 *
 * SERVER ONLY. Never import from a component: it reaches the user models, and webpack follows
 * that into the client bundle. The pure half is `jetzy-profile.ts`.
 */
import { EventUsers } from "@/models/eventUsersModal"
import {
	dobParts,
	formatProfileLocation,
	parseDob,
	toBackendDob,
	type JetzyProfile,
	type ProfileLocation,
} from "@/lib/jetzy-profile"

/** Same base as the issuer of the session `accessToken` — never hardcode prod (see `jetzy-interests.ts`). */
export const accountsApiBase = () =>
	`${(process.env.NEXT_PUBLIC_EXTERNAL_API_BASE_URL || "https://test.jetzy.com").replace(/\/$/, "")}/api/v1`

export type ProfileInput = {
	fullName: string
	/** `MM/dd/yyyy`, the backend wire format. */
	dob: string
	gender: string
	image: string
	location: ProfileLocation
}

const TIMEOUT_MS = 8000

const backendFetch = async (token: string, path: string, init: RequestInit = {}) => {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
	try {
		const res = await fetch(`${accountsApiBase()}${path}`, {
			...init,
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
				...(init.headers || {}),
			},
			signal: controller.signal,
		})
		const json = await res.json().catch(() => null)
		if (!res.ok || json?.status === false) {
			throw Object.assign(new Error(json?.message || `Backend ${path} failed (${res.status})`), { status: res.status })
		}
		return json
	} finally {
		clearTimeout(timer)
	}
}

/**
 * `GET /accounts`, normalised. `location` arrives as `{ country, city, region }` (PUT /accounts)
 * and/or `{ longitude, latitude }` (sync_location, what mobile writes) — both are kept.
 */
export const fetchBackendProfile = async (token: string): Promise<JetzyProfile> => {
	const json = await backendFetch(token, "/accounts", { method: "GET" })
	const u = json?.data?.user || {}
	const loc = u.location || {}
	const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined)
	const coords = Array.isArray(loc.coordinates) ? loc.coordinates : []
	return {
		image: u.image || undefined,
		fullName: [u.firstName, u.lastName].filter((s: unknown) => typeof s === "string" && s.trim()).join(" ") || undefined,
		dob: u.dob || undefined,
		gender: u.gender || undefined,
		location: {
			city: loc.city || undefined,
			region: loc.region || undefined,
			country: loc.country || undefined,
			// GeoJSON order when an array comes back: [lng, lat].
			latitude: num(loc.latitude) ?? num(coords[1]),
			longitude: num(loc.longitude) ?? num(coords[0]),
		},
	}
}

/**
 * Writes the profile exactly the way mobile does.
 *
 * ORDER MATTERS: PUT /accounts first (it may replace `location` with `{country, city}`), then
 * sync_location, so the coordinates are the last thing written and can't be wiped. Coordinates
 * are NOT sent on the PUT — its docs show `[lat, lng]` while sync_location takes GeoJSON
 * `[lng, lat]`, and one writer is safer than two that disagree.
 */
export const pushProfileToBackend = async (token: string, input: ProfileInput) => {
	await backendFetch(token, "/accounts", {
		method: "PUT",
		body: JSON.stringify({
			firstName: input.fullName.trim(),
			lastName: "",
			dob: input.dob,
			gender: input.gender,
			image: input.image,
			// Omitted entirely when there is no readable place (a location mobile synced as bare
			// coordinates and the person didn't change) — an empty object must not replace it.
			...(input.location.country || input.location.city || input.location.region
				? {
						location: {
							...(input.location.country ? { country: input.location.country } : {}),
							...(input.location.city ? { city: input.location.city } : {}),
							...(input.location.region ? { region: input.location.region } : {}),
						},
					}
				: {}),
		}),
	})

	const { latitude, longitude } = input.location
	if (typeof latitude === "number" && typeof longitude === "number") {
		// Best-effort: the PUT already recorded a readable location.
		try {
			await backendFetch(token, "/onboarding/sync_location", {
				method: "POST",
				body: JSON.stringify({ location: { type: "Point", coordinates: [longitude, latitude] } }),
			})
		} catch (err: any) {
			console.warn("[profile] sync_location failed:", err?.message || err)
		}
	}
}

/**
 * The local copy, on `EventUsers` ONLY. `Users` is the backend's own `users` collection — writing
 * our flat `location` string there would overwrite the object the mobile app reads.
 */
export const mirrorProfileLocally = async (userId: string, input: ProfileInput, syncPending: boolean) => {
	const dob = parseDob(input.dob)
	const res = await EventUsers.updateOne(
		{ _id: userId },
		{
			$set: {
				firstName: input.fullName.trim(),
				lastName: "",
				image: input.image,
				gender: input.gender,
				...(dob ? { dateOfBirth: dob } : {}),
				location: formatProfileLocation(input.location),
				locationCity: input.location.city,
				locationRegion: input.location.region,
				locationCountry: input.location.country,
				latitude: input.location.latitude,
				longitude: input.location.longitude,
				...(syncPending ? { profileSyncPending: true } : {}),
			},
			...(syncPending ? {} : { $unset: { profileSyncPending: "" } }),
		},
	)
	return res.matchedCount > 0
}

export const localProfileFromDoc = (doc: any): JetzyProfile => ({
	image: doc?.image || undefined,
	fullName: [doc?.firstName, doc?.lastName].filter((s: unknown) => typeof s === "string" && s.trim()).join(" ") || undefined,
	dob: doc?.dateOfBirth ? new Date(doc.dateOfBirth).toISOString() : undefined,
	gender: doc?.gender || undefined,
	location: {
		city: doc?.locationCity || doc?.location || undefined,
		region: doc?.locationRegion || undefined,
		country: doc?.locationCountry || undefined,
		latitude: typeof doc?.latitude === "number" ? doc.latitude : undefined,
		longitude: typeof doc?.longitude === "number" ? doc.longitude : undefined,
	},
})

/**
 * A profile saved while the session had no backend token is pushed at the next login that
 * gets one. Called from NextAuth `authorize`. Best-effort in every direction — must never
 * fail a login.
 */
export const flushPendingProfile = async (token: string | null | undefined, user: any) => {
	if (!token || !user?.profileSyncPending) return
	try {
		const { year, month, day } = dobParts(user.dateOfBirth ? new Date(user.dateOfBirth).toISOString() : undefined)
		const dob = year && month && day ? toBackendDob(year, month, day) : ""
		await pushProfileToBackend(token, {
			fullName: [user.firstName, user.lastName].filter(Boolean).join(" "),
			dob,
			gender: user.gender || "",
			image: user.image || "",
			location: {
				city: user.locationCity,
				region: user.locationRegion,
				country: user.locationCountry,
				latitude: user.latitude,
				longitude: user.longitude,
			},
		})
		await EventUsers.updateOne({ _id: user._id }, { $unset: { profileSyncPending: "" } })
		console.log(`[profile] pending profile synced for ${user.email}`)
	} catch (err: any) {
		console.warn(`[profile] pending profile sync failed for ${user?.email}:`, err?.message || err)
	}
}

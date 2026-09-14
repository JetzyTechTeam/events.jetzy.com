/**
 * The Jetzy profile a person must complete before using the portal — the SAME fields, read and
 * written through the SAME backend endpoints the mobile app uses (`GET/PUT /v1/accounts`,
 * `POST /v1/onboarding/sync_location`), so a profile finished on one client is finished on both.
 *
 * Pure and isomorphic: the modal and the gate import it. Anything that touches the backend or
 * Mongo lives in `jetzy-profile-server.ts` — same split as `invite-trial.ts` / `signup-trial.ts`.
 */

export const GENDER_OPTIONS = ["Male", "Female", "Non-binary"] as const

export type ProfileField = "photo" | "name" | "dob" | "gender" | "location"

export type ProfileLocation = {
	city?: string
	region?: string
	country?: string
	latitude?: number
	longitude?: number
}

/** The profile as this portal sees it, normalised from either the backend or the local doc. */
export type JetzyProfile = {
	image?: string
	fullName?: string
	/** ISO date string. */
	dob?: string
	gender?: string
	location?: ProfileLocation
}

/**
 * The backend gives every new account a DEFAULT avatar, so `image` is never empty — a bare
 * non-empty check would call every profile "has a photo". Verified on test: a fresh account
 * reads `image: ".../assets/default-avatars/..."` with `settings.profile.hasPicture: false`.
 */
export const isDefaultAvatar = (url?: string | null): boolean => !url || /\/default-avatars\//i.test(url)

const hasCoordinates = (loc?: ProfileLocation) =>
	typeof loc?.latitude === "number" &&
	typeof loc?.longitude === "number" &&
	Number.isFinite(loc.latitude) &&
	Number.isFinite(loc.longitude)

/**
 * `location` has two shapes on the backend: `{ country, city }` from PUT /accounts and
 * `{ longitude, latitude }` from sync_location (which is what mobile writes). Either counts.
 */
export const hasLocation = (loc?: ProfileLocation) => hasCoordinates(loc) || !!(loc?.city?.trim() || loc?.country?.trim())

export const parseDob = (value?: string | null): Date | null => {
	if (!value) return null
	const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim())
	const d = mdy ? new Date(Date.UTC(+mdy[3], +mdy[1] - 1, +mdy[2])) : new Date(value)
	return Number.isNaN(d.getTime()) ? null : d
}

export const profileMissingFields = (p: JetzyProfile | null | undefined): ProfileField[] => {
	const missing: ProfileField[] = []
	if (isDefaultAvatar(p?.image)) missing.push("photo")
	if (!p?.fullName?.trim()) missing.push("name")
	const dob = parseDob(p?.dob)
	if (!dob || dob > new Date()) missing.push("dob")
	if (!p?.gender?.trim()) missing.push("gender")
	if (!hasLocation(p?.location)) missing.push("location")
	return missing
}

export const isProfileComplete = (p: JetzyProfile | null | undefined) => profileMissingFields(p).length === 0

/** The backend's DOB wire format, as mobile sends it: `MM/dd/yyyy`. */
export const toBackendDob = (year: number, month: number, day: number) =>
	`${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}`

/** Read as UTC — the backend stores midnight UTC, and local time would shift it a day west of GMT. */
export const dobParts = (value?: string | null): { year?: number; month?: number; day?: number } => {
	const d = parseDob(value)
	return d ? { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() } : {}
}

/** City / region / country + coordinates from a Google Places result. */
export const placeToProfileLocation = (place: any): ProfileLocation => {
	const components: any[] = place?.address_components || []
	const pick = (type: string) => components.find((c) => c.types?.includes(type))?.long_name as string | undefined
	const lat = place?.geometry?.location?.lat?.()
	const lng = place?.geometry?.location?.lng?.()
	return {
		city: pick("locality") || pick("postal_town") || pick("administrative_area_level_2") || place?.name,
		region: pick("administrative_area_level_1"),
		country: pick("country"),
		...(typeof lat === "number" ? { latitude: lat } : {}),
		...(typeof lng === "number" ? { longitude: lng } : {}),
	}
}

export const formatProfileLocation = (loc?: ProfileLocation) =>
	[loc?.city, loc?.region, loc?.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ")

/**
 * Pages where the gate never blocks. Auth pages (the person is mid-way into an account), the
 * verification page (it renders the form itself), legal pages, and membership management —
 * nobody may be stopped from cancelling a paid membership by a profile form.
 */
const UNGATED_PREFIXES = ["/login", "/signup", "/auth", "/post-signup", "/terms", "/privacy", "/manage-membership", "/jetzyqrsignup"]

export const isUngatedPath = (pathname: string) =>
	UNGATED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

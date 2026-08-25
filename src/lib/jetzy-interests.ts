/**
 * The Jetzy interest taxonomy — main categories and their sub-interests.
 *
 * This taxonomy lives on the Jetzy backend and is SHARED WITH THE MOBILE APP. Anything
 * created here appears in the app's interest list for every user, so the write paths guard
 * against duplicates and are rate limited.
 *
 * Not to be confused with interest GROUPS (`/v2/interests`, see
 * `src/services/interests/interestsendpoints.ts`) — those are social groups with members and
 * a feed. This file is only about the tags an event is categorised under.
 */

/**
 * Base for every interest call.
 *
 * Read and write MUST resolve the same way. `api/interests/index.ts` used to hardcode
 * `prod-api.jetzy.com` while everything else in the repo — including the issuer of the
 * `accessToken` we authenticate with (`api/auth/[...nextauth].ts`) — follows
 * `NEXT_PUBLIC_EXTERNAL_API_BASE_URL`. The two environments hold genuinely different
 * taxonomies, so reading one while writing to the other means a host creates an interest
 * and it never appears: a silent failure that looks like a broken button.
 */
export const interestsApiBase = () => `${(process.env.NEXT_PUBLIC_EXTERNAL_API_BASE_URL || "https://test.jetzy.com").replace(/\/$/, "")}/api/v1/interests`

export type InterestSubCategory = { id: string; name: string }
export type InterestCategory = { _id: string; name: string; subCategories: InterestSubCategory[] }

/**
 * Trim, collapse inner whitespace, lowercase.
 *
 * The stored taxonomy is lowercase ("agentic ai", "adventure travel") and the UI capitalises
 * it with CSS. Posting "Mobiles" would sit in the list beside "mobiles" as a separate entry,
 * which nobody can tell apart on screen.
 */
export const normalizeInterestName = (raw: unknown): string =>
	String(raw ?? "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase()

/** Case-insensitive match against the existing main categories. */
export const findDuplicateCategory = (categories: InterestCategory[], name: string): InterestCategory | undefined => {
	const target = normalizeInterestName(name)
	return categories.find((cat) => normalizeInterestName(cat.name) === target)
}

/** Case-insensitive match within ONE category — the same sub name under a different parent is fine. */
export const findDuplicateSub = (categories: InterestCategory[], categoryId: string, name: string): InterestSubCategory | undefined => {
	const target = normalizeInterestName(name)
	const parent = categories.find((cat) => cat._id === categoryId)
	return parent?.subCategories?.find((sub) => normalizeInterestName(sub.name) === target)
}

/**
 * The whole taxonomy in one page.
 *
 * `perPage=10000` matches what the picker has always requested — the list is small and the
 * component has no paging, so a second page would silently go missing.
 *
 * Response shape is `{ message, status, code, data: { data: [...], pagination } }`; the
 * double `data` is the backend's envelope, not a typo.
 */
export const fetchInterestCategories = async (token: string): Promise<InterestCategory[]> => {
	const res = await fetch(`${interestsApiBase()}/bulk-categories?perPage=10000&page=1&search=`, {
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			Accept: "application/json",
		},
	})

	if (!res.ok) {
		const body = await res.text().catch(() => "")
		throw Object.assign(new Error(`Interest lookup failed (${res.status})`), { status: res.status, body })
	}

	const json = await res.json()
	const rows = json?.data?.data
	return Array.isArray(rows) ? rows : []
}

/**
 * POST one name to `/categories` or `/sub-categories`.
 *
 * `names` is an array on both endpoints (they are bulk-capable); we create one at a time
 * because the UI does, and a partial failure inside a batch has no sensible reporting.
 *
 * **A 2xx DOES NOT MEAN CREATED.** Both endpoints answer `201 "created successfully"`
 * unconditionally and put names that already existed into `data.skipped[]`, e.g.
 *
 *   { code: 201, data: { subCategories: [], skipped: [{ _id, name: "apple" }] } }
 *
 * so `alreadyExisted` below is the only way to tell a real insert from a no-op. Note also
 * that a created sub carries `_id` while the read endpoint returns the same thing as `id` —
 * one more reason callers re-read the taxonomy and match by NAME rather than threading an
 * id through from here.
 */
export const createInterest = async (
	path: "categories" | "sub-categories",
	token: string,
	body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; message?: string; alreadyExisted: boolean; json: any }> => {
	const res = await fetch(`${interestsApiBase()}/${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify(body),
	})

	const json = await res.json().catch(() => null)
	const skipped = json?.data?.skipped
	const names = Array.isArray(body?.names) ? (body.names as string[]) : []
	const alreadyExisted = Array.isArray(skipped) && skipped.some((row: any) => names.some((n) => normalizeInterestName(row?.name) === normalizeInterestName(n)))

	return { ok: res.ok, status: res.status, message: json?.message, alreadyExisted, json }
}

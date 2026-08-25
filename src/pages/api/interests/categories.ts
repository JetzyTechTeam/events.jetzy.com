import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { createInterest, fetchInterestCategories, findDuplicateCategory, normalizeInterestName } from "@/lib/jetzy-interests"
import { clientKey, isRateLimited } from "@/lib/rate-limit"

/**
 * Create a MAIN interest category.
 *
 * Any authenticated host may create one — the Jetzy backend accepts a `role: "user"` token,
 * and a host who can't add the interest their event is about has to abandon tagging
 * altogether. But the taxonomy is shared with the mobile app, so the two things standing
 * between a typo and every app user are the duplicate check and the rate limit below.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

	const session = await getServerSession(req, res, authOptions)
	if (!session) return res.status(401).json({ error: "Unauthorized" })

	// Writes land in a list every mobile user sees, so this is not just abuse protection —
	// it is the only brake on a stuck client looping a create.
	if (isRateLimited(`interest-create:${clientKey(req)}`, 10, 10 * 60_000)) {
		return res.status(429).json({ error: "Too many interests created. Try again in a few minutes." })
	}

	const token = (session.user as any)?.accessToken
	if (!token) return res.status(401).json({ error: "Your Jetzy session has expired. Sign in again." })

	const name = normalizeInterestName(req.body?.name)
	if (!name) return res.status(400).json({ error: "Interest name is required" })

	try {
		const categories = await fetchInterestCategories(token)
		const existing = findDuplicateCategory(categories, name)
		// Name the entry rather than a bare "already exists": the point is to send the host to
		// the one that is already there instead of leaving them to invent a near-twin.
		if (existing) return res.status(409).json({ error: `"${existing.name}" already exists.` })

		// `names` is an array — the endpoint is bulk-capable; we create one at a time.
		const created = await createInterest("categories", token, { names: [name] })
		if (!created.ok) {
			// Forward the backend's status. A 401 from an expired Jetzy token must not reach the
			// host as "server error", which would send them looking in the wrong place.
			return res.status(created.status).json({ error: created.message || "Failed to create interest" })
		}

		// 201 from the backend does not mean inserted — it reports an existing name under
		// `data.skipped[]` instead. Our pre-check catches the ordinary case; this catches the
		// race between that read and this write. Either way the interest now exists, which is
		// all the caller needs to select it, so this is reported rather than treated as an error.
		return res.status(200).json({ name, alreadyExisted: created.alreadyExisted })
	} catch (error: any) {
		console.error("[interests/categories] create failed:", error?.message)
		return res.status(500).json({ error: "Failed to create interest" })
	}
}

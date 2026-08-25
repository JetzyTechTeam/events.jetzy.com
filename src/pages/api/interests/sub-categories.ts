import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { createInterest, fetchInterestCategories, findDuplicateSub, normalizeInterestName } from "@/lib/jetzy-interests"
import { clientKey, isRateLimited } from "@/lib/rate-limit"

/**
 * Create a SUB-interest under an existing main category.
 *
 * Same guards as `categories.ts` — see the note there on why a shared taxonomy needs them.
 * Duplicates are scoped to the parent: the same sub name under a different category is
 * legitimate ("apple" under both "mobiles" and "food").
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

	const session = await getServerSession(req, res, authOptions)
	if (!session) return res.status(401).json({ error: "Unauthorized" })

	// Shares one bucket with the category route on purpose: it is the same taxonomy and the
	// same person, so a per-route allowance would just double the total.
	if (isRateLimited(`interest-create:${clientKey(req)}`, 10, 10 * 60_000)) {
		return res.status(429).json({ error: "Too many interests created. Try again in a few minutes." })
	}

	const token = (session.user as any)?.accessToken
	if (!token) return res.status(401).json({ error: "Your Jetzy session has expired. Sign in again." })

	const categoryId = String(req.body?.categoryId || "").trim()
	const name = normalizeInterestName(req.body?.name)
	if (!categoryId) return res.status(400).json({ error: "A parent interest is required" })
	if (!name) return res.status(400).json({ error: "Interest name is required" })

	try {
		const categories = await fetchInterestCategories(token)
		if (!categories.some((cat) => cat._id === categoryId)) {
			return res.status(404).json({ error: "That interest category no longer exists" })
		}

		const existing = findDuplicateSub(categories, categoryId, name)
		if (existing) return res.status(409).json({ error: `"${existing.name}" already exists here.` })

		const created = await createInterest("sub-categories", token, { categoryId, names: [name] })
		if (!created.ok) {
			return res.status(created.status).json({ error: created.message || "Failed to create interest" })
		}

		// 201 from the backend does not mean inserted — it reports an existing name under
		// `data.skipped[]` instead. Our pre-check catches the ordinary case; this catches the
		// race between that read and this write. Either way the interest now exists, which is
		// all the caller needs to select it, so this is reported rather than treated as an error.
		return res.status(200).json({ name, categoryId, alreadyExisted: created.alreadyExisted })
	} catch (error: any) {
		console.error("[interests/sub-categories] create failed:", error?.message)
		return res.status(500).json({ error: "Failed to create interest" })
	}
}

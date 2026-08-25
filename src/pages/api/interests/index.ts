import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]'
import { fetchInterestCategories } from '@/lib/jetzy-interests'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== 'GET') return res.status(405).end()

	const session = await getServerSession(req, res, authOptions)
	if (!session) return res.status(401).json({ error: 'Unauthorized' })

	const token = (session.user as any).accessToken

	try {
		// The base used to be hardcoded to prod-api.jetzy.com while the accessToken above is
		// issued by NEXT_PUBLIC_EXTERNAL_API_BASE_URL, so this call was sending a test-issued
		// token to production and reading a taxonomy nothing else in the app writes to. See
		// the note on `interestsApiBase`.
		const categories = await fetchInterestCategories(token)
		return res.status(200).json(categories)
	} catch (error: any) {
		console.error('Error fetching interests:', error.message)
		return res.status(500).json({ error: 'Failed to fetch interests' })
	}
}

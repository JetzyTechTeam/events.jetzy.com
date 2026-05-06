import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]'
import axios from 'axios'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== 'GET') return res.status(405).end()

	const session = await getServerSession(req, res, authOptions)
	if (!session) return res.status(401).json({ error: 'Unauthorized' })

	const token = (session.user as any).accessToken

	try {
		const response = await axios.get(
			'https://prod-api.jetzy.com/api/v1/interests/bulk-categories?perPage=10000&page=1&search=',
			{
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
			},
		)
		const categories = response.data?.data?.data ?? []
		return res.status(200).json(categories)
	} catch (error: any) {
		console.error('Error fetching interests:', error.message)
		return res.status(500).json({ error: 'Failed to fetch interests' })
	}
}

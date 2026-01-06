import { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "./[...nextauth]"

/**
 * API endpoint to get API token for authenticated user
 * This endpoint is called after NextAuth login to get the token
 * that can be used for external API calls and passed to JetzyChat
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return res.status(405).json({ message: "Method not allowed" })
	}

	try {
		// Get NextAuth session
		const session = await getServerSession(req, res, authOptions)

		if (!session?.user) {
			return res.status(401).json({ message: "Unauthorized - Please login" })
		}

		// Get user data from session
		const userId = (session.user as any)?._id || (session.user as any)?.id
		const userEmail = session.user?.email

		if (!userId || !userEmail) {
			return res.status(400).json({ message: "Invalid session data" })
		}

		// TODO: Call external API to get token
		// For now, we'll need to determine how to get the token
		// Option 1: Call external API endpoint (requires password - not ideal)
		// Option 2: Generate token based on session (if same secret/key)
		// Option 3: Store token in database linked to user

		// For now, return error indicating token needs to be obtained differently
		return res.status(501).json({
			message: "Token retrieval not yet implemented. Need to determine token source.",
			userId,
			userEmail,
		})

		// Future implementation:
		// const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL
		// const response = await fetch(`${apiBaseUrl}/authorize`, {
		//   method: 'POST',
		//   headers: { 'Content-Type': 'application/json' },
		//   body: JSON.stringify({ email: userEmail, ... })
		// })
		// const { accessToken } = await response.json()
		// return res.status(200).json({ token: accessToken })
	} catch (error: any) {
		console.error("[get-token] Error:", error)
		return res.status(500).json({ message: "Internal server error", error: error.message })
	}
}


// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Types } from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		// Check authentication status and role
		const session = await getServerSession(req, res, authOptions)
		
		// If no session and mode is 'mine', return empty array (not an error)
		if (!session && req.query.mode === 'mine') {
			return sendResponse(res, [], "No events found", true, ResCode.OK)
		}
		
		const userRole = (session?.user as any)?.role
		const isAdmin = userRole === "admin" || userRole === "super admin"
		const userId = (session?.user as any)?._id
		const { mode } = req.query

		// Define the query based on role
		let query: any = { isDeleted: false }
		
		if (mode === 'mine' && userId) {
			// Fetch events created by the current user
			// Convert userId to ObjectId - this matches how events are created in create.ts
			const ownerIdObj = new Types.ObjectId(userId)
			const userEmail = (session?.user as any)?.email
			
			// Query by ownerId (primary) or by host email (fallback for events created before ownerId was added)
			// Also try matching as string in case of type mismatch
			const queryConditions: any[] = [
				{ ownerId: ownerIdObj },
				{ ownerId: userId } // Try as string too
			]
			
			// Add host email fallback if available
			if (userEmail) {
				queryConditions.push({ "host.email": userEmail.toLowerCase() })
			}
			
			query = { 
				isDeleted: false,
				$or: queryConditions
			}
			
			// Debug: Test direct ownerId query
			const directQuery = { isDeleted: false, ownerId: ownerIdObj }
			const directResults = await Events.find(directQuery).select('_id name ownerId').limit(5).lean()
			
			// Debug: Check recent events to see their ownerId
			const recentEvents = await Events.find({ isDeleted: false }).sort({ createdAt: -1 }).limit(5).select('_id name ownerId host').lean()
			
			console.log('[Events API - Mine Mode Debug]', {
				userId,
				userIdString: String(userId),
				ownerIdObj: ownerIdObj.toString(),
				userEmail,
				queryConditions,
				query: JSON.stringify(query, null, 2),
				directQueryResults: directResults.length,
				directResults: directResults.map((e: any) => ({
					id: e._id?.toString(),
					name: e.name,
					ownerId: e.ownerId?.toString() || 'null'
				})),
				recentEventsSample: recentEvents.map((e: any) => ({
					id: e._id?.toString(),
					name: e.name,
					ownerId: e.ownerId?.toString() || 'null',
					hostEmail: e.host?.email || 'no host'
				}))
			})
		} else if (!isAdmin) {
			// If user is not admin or super admin, only show public events
			query.privacy = "public"
		}

		// Get all the events from the database
		const events = await Events.find(query).sort({ createdAt: -1 }).lean()
		
		// Serialize events for JSON response
		const serializedEvents = events.map((event: any) => ({
			...event,
			_id: event._id.toString(),
			ownerId: event.ownerId ? event.ownerId.toString() : undefined,
			startsOn: event.startsOn ? new Date(event.startsOn).toISOString() : undefined,
			endsOn: event.endsOn ? new Date(event.endsOn).toISOString() : undefined,
			createdAt: event.createdAt ? new Date(event.createdAt).toISOString() : undefined,
			updatedAt: event.updatedAt ? new Date(event.updatedAt).toISOString() : undefined,
		}))
		
		// Debug logging for seller dashboard - log final results
		if (mode === 'mine') {
			console.log('[Events API - Mine Mode Final Results]', {
				eventsFound: serializedEvents.length,
				foundEvents: serializedEvents.map((e: any) => ({ 
					id: e._id?.toString(), 
					name: e.name, 
					ownerId: e.ownerId || 'null',
					hostEmail: e.host?.email || 'no host'
				}))
			})
		}

		return sendResponse(res, serializedEvents, "Events retrieved successfully!", true, ResCode.OK)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

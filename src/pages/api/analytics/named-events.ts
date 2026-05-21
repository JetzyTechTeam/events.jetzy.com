import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { EventInteraction, WebClick, WebForm, PageView } from "@/models/analytics"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import mongoose from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "Unauthorized", false, ResCode.UNAUTHORIZED)
		}

		const userRole = (session.user as any)?.role
		const userId = (session.user as any)?._id?.toString()
		const isAdmin = userRole === "admin" || userRole === "super admin"

		// eventId scoping (optional)
		const eventIdParam = req.query.eventId as string | undefined
		let eventObjectId: mongoose.Types.ObjectId | null = null

		if (eventIdParam) {
			const event = await Events.findOne({ _id: eventIdParam, isDeleted: false }).select("ownerId").lean()
			if (!event) return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
			if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
				return sendResponse(res, null, "Forbidden", false, ResCode.FORBIDDEN)
			}
			eventObjectId = new mongoose.Types.ObjectId(eventIdParam)
		} else if (!isAdmin) {
			return sendResponse(res, null, "Forbidden - Admin access required", false, ResCode.FORBIDDEN)
		}

		let dateFrom: Date | null = null
		let dateTo: Date | null = null
		if (req.query.dateFrom) {
			dateFrom = new Date(req.query.dateFrom as string)
			dateFrom.setHours(0, 0, 0, 0)
		}
		if (req.query.dateTo) {
			dateTo = new Date(req.query.dateTo as string)
			dateTo.setHours(23, 59, 59, 999)
		}

		const dateFilter = dateFrom || dateTo
			? { timestamp: { ...(dateFrom ? { $gte: dateFrom } : {}), ...(dateTo ? { $lte: dateTo } : {}) } }
			: {}

		const eventFilter = eventObjectId ? { eventId: eventObjectId } : {}
		const baseMatch = { ...dateFilter, ...eventFilter }

		const groupProject = (category: string, nameExpr: any) => [
			{
				$group: {
					_id: nameExpr,
					totalEvents: { $sum: 1 },
					uniqueAuthUsers: { $addToSet: "$userId" },
					uniqueAnonUsers: { $addToSet: "$anonId" },
				},
			},
			{
				$project: {
					_id: 0,
					category: { $literal: category },
					eventName: "$_id",
					totalEvents: 1,
					uniqueUsers: {
						$size: {
							$setUnion: [
								{ $filter: { input: "$uniqueAuthUsers", cond: { $ne: ["$$this", null] } } },
								{ $filter: { input: "$uniqueAnonUsers", cond: { $ne: ["$$this", null] } } },
							],
						},
					},
				},
			},
			{ $sort: { totalEvents: -1 as const } },
		]

		const queries: Promise<any[]>[] = [
			EventInteraction.aggregate([
				{ $match: baseMatch },
				...groupProject("Event Interactions", "$interactionType"),
			]),
			WebClick.aggregate([
				{ $match: { ...baseMatch, dataTrack: { $ne: null } } },
				...groupProject("CTA Clicks", "$dataTrack"),
			]),
			WebForm.aggregate([
				{ $match: baseMatch },
				{
					$group: {
						_id: { formName: "$formName", interactionType: "$interactionType" },
						totalEvents: { $sum: 1 },
						uniqueAuthUsers: { $addToSet: "$userId" },
						uniqueAnonUsers: { $addToSet: "$anonId" },
					},
				},
				{
					$project: {
						_id: 0,
						category: { $literal: "Form Events" },
						eventName: { $concat: ["$_id.formName", " / ", "$_id.interactionType"] },
						totalEvents: 1,
						uniqueUsers: {
							$size: {
								$setUnion: [
									{ $filter: { input: "$uniqueAuthUsers", cond: { $ne: ["$$this", null] } } },
									{ $filter: { input: "$uniqueAnonUsers", cond: { $ne: ["$$this", null] } } },
								],
							},
						},
					},
				},
				{ $sort: { totalEvents: -1 as const } },
			]),
		]

		// Page views only for platform-wide (no eventId scope — pageviews don't carry eventId)
		if (!eventObjectId) {
			queries.push(
				PageView.aggregate([
					{ $match: dateFilter },
					...groupProject("Page Views", "$page"),
					{ $limit: 100 } as any,
				]),
			)
		}

		const results = await Promise.all(queries)
		const [eventInteractions, ctaClicks, formEvents, pageViews = []] = results

		return sendResponse(
			res,
			{
				rows: [...eventInteractions, ...ctaClicks, ...formEvents, ...pageViews],
				summary: {
					eventInteractionsCount: eventInteractions.length,
					ctaClicksCount: ctaClicks.length,
					pageViewsCount: pageViews.length,
					formEventsCount: formEvents.length,
				},
				scoped: !!eventObjectId,
			},
			"Named events fetched",
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("[named-events] Error:", error)
		return sendResponse(res, null, error.message || "Internal server error", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { z } from "zod"

const validationSchema = z.object({
	limit: z.number().int().positive().optional(),
	page: z.number().int().positive().optional(),
	locFilter: z.string().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		// run validation
		const validation = validationSchema.safeParse({
			limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
			page: req.query.page ? parseInt(req.query.page as string) : undefined,
			locFilter: req.query.locFilter ? (req.query.locFilter as string) : undefined,
		})
		if (!validation.success) {
			return sendResponse(res, null, "Invalid query parameters", false, ResCode.BAD_REQUEST)
		}

		const { limit = 10, page = 1, locFilter = "" } = validation.data

		// calculate the skip value
		const skip = (page - 1) * limit

		//    get all the events from the database
		const events = await Events.find({ isDeleted: false, location: { $regex: locFilter, $options: "i" } })
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(limit)
			.lean()

		// gt total documents
		const totalEvents = await Events.countDocuments({ isDeleted: false, location: { $regex: locFilter, $options: "i" } })

		// calculate the total pages
		const totalPages = Math.ceil(totalEvents / limit)

		// calculate next page
		const nextPage = page < totalPages ? page + 1 : null
		// calculate previous page
		const prevPage = page > 1 ? page - 1 : null

		// format the pagination object
		const pagination = {
			total: totalEvents,
			totalPages,
			nextPage,
			prevPage,
			perPage: limit,
			currentPage: page,
		}

		return sendResponse(res, { events, ...pagination }, "Events retrieved successfully!", true, ResCode.OK)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

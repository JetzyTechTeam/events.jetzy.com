import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import InterestCategory from "@/models/interest-category"
import InterestSubCategory from "@/models/interest-subcategory"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		if (req.method !== "GET") {
			return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
		}

		// Ensure database connection
		const { dbconn } = await import("@/configs/database")
		if (dbconn.readyState !== 1) {
			await dbconn.asPromise()
		}

		// First, try to get all categories without any filters to see what's in the database
		const allCategoriesTest = await InterestCategory.find({}).limit(10).lean()
		console.log(`[interest-categories/list] Total documents in collection (no filters): ${allCategoriesTest.length}`)
		if (allCategoriesTest.length > 0) {
			console.log(`[interest-categories/list] Sample document structure:`, JSON.stringify(allCategoriesTest[0], null, 2))
		}

		// Get all categories that are not deleted (ignore status for now to get all data)
		// Try multiple query approaches
		let categories = await InterestCategory.find({
			isDeleted: { $ne: true }
		})
			.select("name description image status")
			.sort({ name: 1 })
			.lean()

		console.log(`[interest-categories/list] Found ${categories.length} categories with isDeleted filter`)

		// If no categories found with isDeleted filter, try without it
		if (categories.length === 0) {
			categories = await InterestCategory.find({})
				.select("name description image status")
				.sort({ name: 1 })
				.limit(100)
				.lean()
			console.log(`[interest-categories/list] Found ${categories.length} categories without isDeleted filter`)
		}

		// Log first category for debugging
		if (categories.length > 0) {
			console.log(`[interest-categories/list] First category sample:`, JSON.stringify(categories[0], null, 2))
		}

		// For each category, get its subcategories
		const categoriesWithSubcategories = await Promise.all(
			categories.map(async (category) => {
				// Get subcategories for this category (ignore status for now to get all data)
				const subcategories = await InterestSubCategory.find({
					categoryId: category._id,
					isDeleted: { $ne: true }
				})
					.select("name description image")
					.sort({ name: 1 })
					.lean()

				return {
					_id: category._id.toString(),
					name: category.name,
					description: category.description || "",
					image: category.image || "",
					subcategories: subcategories.map((sub) => ({
						_id: sub._id.toString(),
						name: sub.name,
						description: sub.description || "",
						image: sub.image || "",
					})),
				}
			})
		)

		console.log(`[interest-categories/list] Returning ${categoriesWithSubcategories.length} categories with subcategories`)
		
		// Log the response structure for debugging
		if (categoriesWithSubcategories.length > 0) {
			console.log(`[interest-categories/list] Sample response:`, JSON.stringify(categoriesWithSubcategories[0], null, 2))
		} else {
			console.warn(`[interest-categories/list] No categories found - returning empty array`)
			// Try to see if there are any documents at all in the collection
			const totalCount = await InterestCategory.countDocuments({})
			console.log(`[interest-categories/list] Total documents in InterestCategory collection: ${totalCount}`)
		}
		
		const responseData = {
			message: "Interest categories retrieved successfully!",
			status: true,
			code: ResCode.OK,
			data: categoriesWithSubcategories
		}
		
		console.log(`[interest-categories/list] Response structure:`, {
			hasData: !!responseData.data,
			dataLength: responseData.data?.length || 0,
			status: responseData.status
		})
		
		return sendResponse(res, categoriesWithSubcategories, "Interest categories retrieved successfully!", true, ResCode.OK)
	} catch (error: any) {
		console.log("[interest-categories/list] Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

import type { NextApiRequest, NextApiResponse } from "next"

/**
  @todo Send response to the client
*/
export const sendResponse = (res: NextApiResponse, resData?: any, msg?: string, state: boolean = false, statusCode = 200) => {
  return res.status(statusCode).json({
    // response message
    message: msg,
    // Operation status
    status: state,
    // status code
    code: statusCode,
    // Response data
    data: resData,
  })
}

export function generateRandomId(length: number, useIntegers: boolean = false): string | number {
  const characters = useIntegers ? "0123456789" : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  const charactersLength = characters.length
  let randomId = ""

  for (let i = 0; i < length; i++) {
    randomId += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return randomId
}

export function getExpirationDate(durationInHours: number, durationInMinutes: number): Date {
  // Convert hours and minutes to milliseconds
  const hoursInMilliseconds = durationInHours * 60 * 60 * 1000
  const minutesInMilliseconds = durationInMinutes * 60 * 1000

  // Calculate future date
  const futureDate = new Date(Date.now() + hoursInMilliseconds + minutesInMilliseconds)

  return futureDate
}

/**
 * Strips HTML tags and decodes HTML entities from a string
 * Useful for cleaning event names or other rich text content for use in titles, meta tags, etc.
 */
export function stripHTMLAndDecode(text: string | null | undefined): string {
	if (!text) return ""
	// First strip all HTML tags
	let cleaned = text.replace(/<[^>]*>/g, "")
	// Then decode HTML entities
	return cleaned
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/&apos;/g, "'")
		.replace(/&#x27;/g, "'")
		.replace(/&#x2F;/g, "/")
		.trim()
}
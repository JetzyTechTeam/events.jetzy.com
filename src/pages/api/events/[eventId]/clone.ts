// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { generateRandomId, sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import Stripe from "stripe"
import { ticketMemberships } from "@/lib/premium-bundle"
import { buildUniqueSlug } from "@/lib/event-slug"

// create stripe instance
const stripe = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	await ensureDbConnected()
	const session = await getServerSession(req, res, authOptions)

	try {
		// make sure user is logged-in before cloning events
		if (!session) return sendResponse(res, null, "You need to be logged in to perform this action.", false, ResCode.UNAUTHORIZED)

		// Get the event id from the request
		const { eventId } = req.query

		// Find the source event
		const source = await Events.findById(eventId)
		if (!source) return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)

		// Ownership check — admin can clone any event, user can only clone their own
		const userRole = (session.user as any)?.role
		const isAdmin = userRole === "admin" || userRole === "super admin"
		const userId = (session.user as any)?._id?.toString()
		if (!isAdmin && source.ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Forbidden. You can only clone your own events.", false, ResCode.FORBIDDEN)
		}

		// Tickets need fresh stripe prices — products can't be shared across events safely
		const sourceTickets = source.tickets ?? []
		const stripeProducts = await Promise.all(
			sourceTickets.map((ticket) =>
				stripe.prices.create({
					unit_amount: Math.round(Number(ticket.price) * 100),
					currency: "usd",
					product_data: { name: ticket.name },
				}),
			),
		)

		// Through buildUniqueSlug so the random id can't land on a slug that's already
		// spoken for — including a retired one that still holds a live redirect.
		const cloneSlug = await buildUniqueSlug(Events, generateRandomId(10) as string)

		// Build the clone — copy content, reset anything booking/state related
		const newEvent = await Events.create({
			slug: cloneSlug,
			ownerId: userId,
			name: `Copy of ${source.name}`,
			location: source.location,
			venueName: source.venueName,
			coordinates: source.coordinates,
			desc: source.desc,
			// An active date poll is mutually exclusive with fixed dates — don't copy dates when the source has a live poll
			...(!source.datePoll?.isActive && source.startsOn ? { startsOn: source.startsOn, hasStartTime: source.hasStartTime } : {}),
			...(!source.datePoll?.isActive && source.endsOn ? { endsOn: source.endsOn, hasEndTime: source.hasEndTime } : {}),
			timezone: source.timezone,
			isPaid: source.isPaid,
			privacy: source.privacy,
			images: source.images,
			videos: source.videos,
			capacity: source.capacity,
			requireApproval: source.requireApproval,
			tickets: sourceTickets.map((ticket, index) => ({
				name: ticket.name,
				desc: ticket.desc,
				price: Number(ticket.price).toFixed(2),
				stripeProductId: stripeProducts[index].id,
				// Carry per-ticket approval overrides; unset stays unset so the clone inherits.
				...(ticket.requireApproval !== undefined ? { requireApproval: ticket.requireApproval } : {}),
				// A bundled ticket stays bundled in the copy.
				memberships: ticketMemberships(ticket as any),
				includesPremium: ticketMemberships(ticket as any).includes("premium"),
			})),
			questions: source.questions,
			benefits: source.benefits,
			locationDisclosedAfterBooking: source.locationDisclosedAfterBooking,
			showOnMobile: source.showOnMobile,
			feedbackFormUrl: source.feedbackFormUrl,
			interests: source.interests,
			// reset votes on every poll option so the clone starts clean
			datePoll: source.datePoll?.isActive
				? {
						isActive: true,
						question: source.datePoll.question || "",
						options: (source.datePoll.options ?? []).map((opt) => ({
							id: opt.id,
							date: opt.date,
							time: opt.time,
							label: opt.label || "",
							votes: [],
						})),
				  }
				: undefined,
			// clones start as drafts so they can be reviewed before going live
			status: "draft",
		})

		if (!newEvent) return sendResponse(res, null, "Failed to clone event.", false, ResCode.INTERNAL_SERVER_ERROR)

		// Create event tracker for the clone
		await newEvent.createEventTracker(source.capacity ?? 0)

		return sendResponse(res, newEvent, "Event cloned successfully.", true, ResCode.CREATED)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

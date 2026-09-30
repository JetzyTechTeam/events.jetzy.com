import { Events } from "@/models/events";
import { ensureDbConnected } from "@/configs/database";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth/[...nextauth]";
import { Types } from "mongoose";
import { NextApiRequest, NextApiResponse } from "next";
import { fetchEventInvitations } from "@/lib/event-invitations";

/**
 * Every invitation for an event, any status. Backs the console Guests tab.
 *
 * Both invitation shapes are read and normalised by `fetchEventInvitations` — see that file for
 * why there are two and what used to go wrong.
 *
 * The response stays a BARE ARRAY. Its consumer reads `res.data || []`, so switching to
 * `sendResponse`'s `{ data, message, status }` wrapper would silently yield an empty guest list
 * on every event — with no type error to catch it.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return res.status(405).json({ message: "Method not allowed" });
	}
	try {
		await ensureDbConnected();

		const { eventId } = req.query;
		if (typeof eventId !== "string" || !Types.ObjectId.isValid(eventId)) {
			return res.status(400).json({ message: "Valid event ID is required" });
		}

		const session = await getServerSession(req, res, authOptions);
		const userId = (session?.user as any)?._id?.toString();
		if (!userId) return res.status(401).json({ message: "Not authenticated" });
		const userRole = (session?.user as any)?.role;
		const isAdmin = userRole === "admin" || userRole === "super admin";

		const event = await Events.findById(eventId).select("ownerId").lean();
		if (!event) return res.status(404).json({ message: "Event not found" });
		if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
			return res.status(403).json({ message: "Not authorized" });
		}

		// An event with no invitations is a 200 with an empty array, never a 404 — the tab would
		// otherwise render "Failed to load guests" for every event nobody has invited anyone to.
		const invitations = await fetchEventInvitations(eventId);
		return res.status(200).json(invitations);
	} catch (error) {
		console.log(error);
		return res.status(500).json({ message: "Something went wrong" });
	}
}

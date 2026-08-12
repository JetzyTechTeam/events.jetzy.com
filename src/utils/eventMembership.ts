import { Types } from "mongoose"
import { EventParticipants } from "@/models/events/eventParticipantsModel"

/**
 * Adds a user to an event's joined-members list. `$addToSet` makes this a no-op when
 * the user is already a participant, so callers never need to check membership first.
 * One doc per event, upserted on first member — `event` has no unique index, so this
 * relies on every caller going through here rather than creating a doc directly.
 */
export async function addEventMember(
	eventId: Types.ObjectId | string,
	userId: Types.ObjectId | string,
) {
	if (!Types.ObjectId.isValid(userId)) return

	await EventParticipants.updateOne(
		{ event: eventId, isDeleted: false },
		{ $addToSet: { participants: userId } },
		{ upsert: true },
	)
}

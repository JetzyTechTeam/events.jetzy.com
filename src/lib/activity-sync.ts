import { Types } from "mongoose";
import InterestV2model from "@/models/interestV2";
import { IEvent } from "@/models/events/types";

const CREATOR_ID = "68bf0d77773714d90918552a";
const DEFAULT_INTEREST_ID = "677cfde821ec02dfd27a368c";

/**
 * Maps an Event document to an Activity document for the interests-v2 collection.
 */
export const mapEventToActivity = (event: IEvent | any) => {
    const lowestPrice = event.tickets && event.tickets.length > 0
        ? Math.min(...event.tickets.map((t: any) => parseFloat(t.price) || 0))
        : 0;

    return {
        name: event.name,
        type: event.privacy === "private" ? "private" : "public",
        description: event.desc,
        image: event.images?.[0] || "",
        createdBy: new Types.ObjectId(CREATOR_ID),
        status: event.isDeleted ? "deleted" : "active",
        dataType: "activity" as const,
        location: {
            description: event.location,
            lat: event.coordinates?.lat,
            lng: event.coordinates?.long,
        },
        startDate: event.startsOn,
        endDate: event.endsOn,
        price: lowestPrice,
        capacity: event.capacity || 0,
        interests: [new Types.ObjectId(DEFAULT_INTEREST_ID)],
        eventId: event._id,
    };
};

/**
 * Creates or updates an activity in interests-v2 collection based on an event.
 */
export const upsertActivityFromEvent = async (event: IEvent | any) => {
    try {
        const activityData = mapEventToActivity(event);

        // Use eventId as the primary key for syncing
        const activity = await InterestV2model.findOneAndUpdate(
            { eventId: event._id },
            { $set: activityData },
            { upsert: true, new: true }
        );

        console.log(`[ActivitySync] Successfully upserted activity for event: ${event.name} (${event._id})`);
        return activity;
    } catch (error) {
        console.error(`[ActivitySync] Error upserting activity for event ${event._id}:`, error);
        throw error;
    }
};

/**
 * Marks an activity as deleted when its corresponding event is deleted.
 */
export const deleteActivityByEventId = async (eventId: string | Types.ObjectId) => {
    try {
        const result = await InterestV2model.findOneAndUpdate(
            { eventId: new Types.ObjectId(eventId.toString()) },
            { $set: { status: "deleted" } },
            { new: true }
        );

        if (result) {
            console.log(`[ActivitySync] Successfully marked activity as deleted for event: ${eventId}`);
        } else {
            console.log(`[ActivitySync] No activity found to delete for event: ${eventId}`);
        }
        return result;
    } catch (error) {
        console.error(`[ActivitySync] Error deleting activity for event ${eventId}:`, error);
        throw error;
    }
};

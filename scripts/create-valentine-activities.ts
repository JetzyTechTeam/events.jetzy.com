import { createConnection, Schema, Types } from "mongoose";

/**
 * Script to create three Valentine activities in the production database (interests-v2 collection).
 * These activities correspond to the NYC, Bay Area, and LA events.
 * 
 * Usage:
 *   npx ts-node --project scripts/tsconfig.json scripts/create-valentine-activities.ts
 *   
 * For Dry Run:
 *   DRY_RUN=true npx ts-node --project scripts/tsconfig.json scripts/create-valentine-activities.ts
 */

const PROD_DB_URL = "mongodb+srv://jetzy-prod-user:098hyG7Xb26YzVo4@prod-jetzy-cluster.mvkbz.mongodb.net/main";
const CREATOR_ID = "68bf0d77773714d90918552a";

const VALENTINE_EVENTS = [
    {
        id: "697cf23827f6f5f0d7d8c25a",
        city: "NYC",
        slug: "rOY402PFUL"
    },
    {
        id: "698643a2a2b2892a70c68c08",
        city: "Bay Area",
        slug: "5Ec6LWsSo4"
    },
    {
        id: "698a27d43c43238502823ddf",
        city: "LA",
        slug: "3qgdpurzVk"
    }
];

async function run() {
    console.log("Connecting to production database...");
    const connection = await createConnection(PROD_DB_URL).asPromise();
    console.log("Connected.");

    const Events = connection.model("Events", new Schema({}, { strict: false }), "events");
    const InterestV2 = connection.model("InterestV2", new Schema({}, { strict: false }), "interests-v2");

    console.log(`Processing ${VALENTINE_EVENTS.length} events...`);

    for (const eventInfo of VALENTINE_EVENTS) {
        const event = (await Events.findById(eventInfo.id).lean()) as any;
        if (!event) {
            console.error(`❌ Event not found: ${eventInfo.id} (${eventInfo.city})`);
            continue;
        }

        const lowestPrice = event.tickets && event.tickets.length > 0
            ? Math.min(...event.tickets.map((t: any) => t.price))
            : 0;

        const activityData = {
            name: event.name,
            type: "public",
            description: event.desc,
            image: event.images?.[0] || "",
            createdBy: new Types.ObjectId(CREATOR_ID),
            status: "active",
            dataType: "activity",
            location: {
                description: event.location,
                lat: event.coordinates?.lat,
                lng: event.coordinates?.long,
            },
            startDate: event.startsOn,
            endDate: event.endsOn,
            price: lowestPrice,
            capacity: event.capacity || 0,
            interests: [new Types.ObjectId("677cfde821ec02dfd27a368c")],
            eventId: event._id,
            createdAt: new Date(),
            updatedAt: new Date(),
            __v: 0
        };

        if (process.env.DRY_RUN === "true") {
            console.log(`\n🔍 [DRY RUN] Details for ${eventInfo.city}:`);
            console.log(JSON.stringify(activityData, null, 2));
        } else {
            try {
                // Upsert by name and eventId
                const created = (await InterestV2.findOneAndUpdate(
                    { name: activityData.name, eventId: activityData.eventId },
                    activityData,
                    { upsert: true, new: true }
                )) as any;
                console.log(`\n✅ Updated/Created activity for ${eventInfo.city}:`);
                console.log(`   Activity ID: ${created._id}`);
                console.log(`   Event ID: ${created.eventId}`);
                console.log(`   Event Link for Post: https://events.jetzy.com/event/${eventInfo.slug}`);
            } catch (err) {
                console.error(`❌ Failed to process activity for ${eventInfo.city}:`, err);
            }
        }
    }

    await connection.close();
    console.log("\nDone.");
}

run().catch(err => {
    console.error("Critical Error:", err);
    process.exit(1);
});

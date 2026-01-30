
import { createConnection, Schema, Types } from "mongoose";

async function main() {
    const prodUrl = "mongodb+srv://jetzy-prod-user:098hyG7Xb26YzVo4@prod-jetzy-cluster.mvkbz.mongodb.net/main";
    const eventId = "697cf23827f6f5f0d7d8c25a";
    const referralCode = "SHAMA100";

    console.log(`Connecting to Prod DB: ${prodUrl}`);

    try {
        const conn = createConnection(prodUrl);
        await conn.asPromise();
        console.log("Connected to Prod DB.");

        const eventsSchema = new Schema({}, { strict: false });
        const Events = conn.model("Events", eventsSchema);

        const referralCodeSchema = new Schema({}, { strict: false });
        const ReferralCodes = conn.model("ReferralCodes", referralCodeSchema);

        const event = await Events.findById(eventId);
        console.log(`Event found: ${event ? event.get('name') : "NOT FOUND"}`);

        if (event) {
            console.log(`Event Slug: ${event.get('slug')}`);
        }

        const code = await ReferralCodes.findOne({ code: referralCode, isDeleted: false });
        if (code) {
            console.log("Referral Code Found:");
            console.log(JSON.stringify(code, null, 2));

            const associatedEventId = code.get('eventId');
            if (associatedEventId.toString() === eventId) {
                console.log("✅ Referral code is correctly associated with the Valentine Event.");
            } else {
                console.log(`❌ Referral code is associated with a DIFFERENT event: ${associatedEventId}`);

                // Let's also check if that other event exists
                const otherEvent = await Events.findById(associatedEventId);
                console.log(`Other event Name: ${otherEvent ? otherEvent.get('name') : "NOT FOUND"}`);
            }
        } else {
            console.log(`❌ Referral code ${referralCode} NOT FOUND in production.`);
        }

        await conn.close();
    } catch (error) {
        console.error("Error:", error);
    } finally {
        process.exit(0);
    }
}

main();

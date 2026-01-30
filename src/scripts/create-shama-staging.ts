
import path from "path";
import fs from "fs";
import { createConnection, Schema, Types } from "mongoose";

async function main() {
    const stagingUrl = "mongodb+srv://jetzy-staging-user:7mVNQEU7Xmy6J1xc@cluster0.mvkbz.mongodb.net/test-v2?retryWrites=true&w=majority&appName=Cluster0";
    const referralCode = "SHAMA100";
    // I need to find the event ID in staging if it exists, or create a dummy one for testing

    console.log(`Connecting to Staging DB: ${stagingUrl}`);

    try {
        const conn = createConnection(stagingUrl);
        await conn.asPromise();
        console.log("Connected to Staging DB.");

        const eventsSchema = new Schema({}, { strict: false });
        const Events = conn.model("Events", eventsSchema);

        const referralCodeSchema = new Schema({
            eventId: Types.ObjectId,
            code: { type: String, unique: true },
            discountPercentage: Number,
            maxUses: Number,
            isActive: Boolean,
            usageCount: Number,
            isDeleted: { type: Boolean, default: false },
            createdAt: { type: Date, default: Date.now },
            updatedAt: { type: Date, default: Date.now }
        }, { strict: false });

        const ReferralCodes = conn.model("ReferralCodes", referralCodeSchema);

        // Try to find the event by slug in staging
        const slug = "rOY402PFUL";
        const event = await Events.findOne({ slug: slug, isDeleted: false });

        let eventId;
        if (event) {
            eventId = event._id;
            console.log(`Found event ${event.get('name')} in staging (ID: ${eventId})`);
        } else {
            console.log(`Event with slug ${slug} not found in staging. Listing some events...`);
            const someEvents = await Events.find({ isDeleted: false }).limit(5);
            someEvents.forEach(e => console.log(`- ${e.get('name')} (Slug: ${e.get('slug')}, ID: ${e._id})`));

            // If no event found, we can't create a valid referral code that works for the checkout
            return;
        }

        // Check if it already exists
        const existing = await ReferralCodes.findOne({ code: referralCode, isDeleted: false });
        if (existing) {
            console.log(`Referral code ${referralCode} already exists in staging.`);
            if (existing.get('eventId').toString() !== eventId.toString()) {
                await ReferralCodes.updateOne({ _id: existing._id }, { $set: { eventId: eventId } });
                console.log("Updated existing code to point to the correct event in staging.");
            }
        } else {
            await ReferralCodes.create({
                eventId: eventId,
                code: referralCode,
                discountPercentage: 100,
                maxUses: null,
                isActive: true,
                usageCount: 0,
                isDeleted: false
            });
            console.log(`SUCCESS! Referral code ${referralCode} created for event ${eventId} in staging.`);
        }

        await conn.close();
    } catch (error) {
        console.error("Error:", error);
    } finally {
        process.exit(0);
    }
}

main();

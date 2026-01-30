
import path from "path";
import fs from "fs";
import { createConnection, Schema, Types } from "mongoose";

async function main() {
    const prodUrl = "mongodb+srv://jetzy-prod-user:098hyG7Xb26YzVo4@prod-jetzy-cluster.mvkbz.mongodb.net/main";
    const referralCode = "SHAMA100";
    const eventId = "697cf23827f6f5f0d7d8c25a";

    console.log(`Connecting to Prod DB: ${prodUrl}`);

    try {
        const conn = createConnection(prodUrl);
        await conn.asPromise();
        console.log("Connected to Prod DB.");

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

        // Check if it already exists
        const existing = await ReferralCodes.findOne({ code: referralCode, isDeleted: false });
        if (existing) {
            console.log(`Referral code ${referralCode} already exists.`);
        } else {
            const result = await ReferralCodes.create({
                eventId: new Types.ObjectId(eventId),
                code: referralCode,
                discountPercentage: 100,
                maxUses: null,
                isActive: true,
                usageCount: 0,
                isDeleted: false
            });
            console.log(`SUCCESS! Referral code ${referralCode} created for event ${eventId}.`);
        }

        await conn.close();
    } catch (error) {
        console.error("Error creating referral code:", error);
    } finally {
        process.exit(0);
    }
}

main();


import path from "path";
import fs from "fs";
import { createConnection, Schema, Types } from "mongoose";

async function main() {
    const prodUrl = "mongodb+srv://jetzy-prod-user:098hyG7Xb26YzVo4@prod-jetzy-cluster.mvkbz.mongodb.net/main";
    const referralCode = "SHAMA100";
    const newEventId = "697cf23827f6f5f0d7d8c25a";

    console.log(`Connecting to Prod DB: ${prodUrl}`);

    try {
        const conn = createConnection(prodUrl);
        await conn.asPromise();
        console.log("Connected to Prod DB.");

        const referralCodeSchema = new Schema({}, { strict: false });
        const ReferralCodes = conn.model("ReferralCodes", referralCodeSchema);

        const result = await ReferralCodes.updateOne(
            { code: referralCode, isDeleted: false },
            { $set: { eventId: new Types.ObjectId(newEventId), updatedAt: new Date() } }
        );

        if (result.modifiedCount > 0) {
            console.log(`SUCCESS! Referral code ${referralCode} updated to point to Valentine Event (${newEventId}).`);
        } else {
            console.log(`Referral code ${referralCode} was already set to this event or not found.`);
        }

        await conn.close();
    } catch (error) {
        console.error("Error updating referral code:", error);
    } finally {
        process.exit(0);
    }
}

main();


import path from "path";
import fs from "fs";
import { createConnection, Schema, Types } from "mongoose";

async function main() {
    const prodUrl = "mongodb+srv://jetzy-prod-user:098hyG7Xb26YzVo4@prod-jetzy-cluster.mvkbz.mongodb.net/main";
    const referralCode = "SHAMA100";

    console.log(`Connecting to Prod DB: ${prodUrl}`);

    try {
        const conn = createConnection(prodUrl);
        await conn.asPromise();
        console.log("Connected to Prod DB.");

        const referralCodeSchema = new Schema({}, { strict: false });
        const ReferralCodes = conn.model("ReferralCodes", referralCodeSchema);

        const existing = await ReferralCodes.findOne({ code: referralCode, isDeleted: false });
        if (existing) {
            console.log("Referral Code Found:");
            console.log(JSON.stringify(existing, null, 2));
        } else {
            console.log(`Referral code ${referralCode} not found (might be deleted or doesn't exist).`);
        }

        await conn.close();
    } catch (error) {
        console.error("Error:", error);
    } finally {
        process.exit(0);
    }
}

main();

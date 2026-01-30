
import path from "path";
import fs from "fs";
import { createConnection, Schema } from "mongoose";

function loadEnv(filePath: string) {
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        content.split("\n").forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                let value = match[2].trim();
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                if (!process.env[key]) {
                    process.env[key] = value;
                }
            }
        });
    }
}

async function main() {
    loadEnv(path.join(process.cwd(), ".env.local"));
    const url = process.env.NEXT_EVENTS_DB_URL;
    const eventId = "697cf23827f6f5f0d7d8c25a";
    const slug = "rOY402PFUL";

    console.log(`Checking DB: ${url}`);

    try {
        const conn = createConnection(url!);
        await conn.asPromise();
        console.log("Connected.");

        const eventsSchema = new Schema({}, { strict: false });
        const Events = conn.model("Events", eventsSchema);

        const eventById = await Events.findById(eventId);
        const eventBySlug = await Events.findOne({ slug: slug });

        console.log(`Event by ID ${eventId}: ${eventById ? eventById.get('name') : "NOT FOUND"}`);
        console.log(`Event by slug ${slug}: ${eventBySlug ? eventBySlug.get('name') : "NOT FOUND"}`);

        await conn.close();
    } catch (error) {
        console.error("Error:", error);
    } finally {
        process.exit(0);
    }
}

main();


import path from "path";
import fs from "fs";
import { createConnection } from "mongoose";

async function main() {
    const prodUrl = "mongodb+srv://jetzy-prod-user:098hyG7Xb26YzVo4@prod-jetzy-cluster.mvkbz.mongodb.net/main";
    const slug = "rOY402PFUL";
    const eventName = "Valentine Event";

    console.log(`Searching in Prod DB: ${prodUrl}`);

    try {
        const conn = createConnection(prodUrl);
        await conn.asPromise();
        console.log("Connected to Prod DB.");

        // We need to define the schema manually or import it
        // For simplicity, we can use the connection's models if we can
        const { Schema } = await import("mongoose");
        const eventsSchema = new Schema({
            slug: String,
            name: String,
            isDeleted: Boolean,
            venueName: String,
            location: String
        }, { strict: false });

        const Events = conn.model("Events", eventsSchema);

        const event = await Events.findOne({
            $or: [
                { slug: slug },
                { name: { $regex: eventName, $options: 'i' } }
            ],
            isDeleted: false
        });

        if (event) {
            console.log(`SUCCESS! Event found in Prod DB: ${event.name} (Slug: ${event.slug}, ID: ${event._id})`);
        } else {
            console.log("Not found in Prod DB either.");
            // List a few events to see what's there
            const someEvents = await Events.find({ isDeleted: false }).limit(5);
            console.log("Some events in Prod DB:");
            someEvents.forEach(e => console.log(`- ${e.get('name')} (Slug: ${e.get('slug')}, ID: ${e._id})`));
        }

        await conn.close();
    } catch (error) {
        console.error("Error connecting to Prod DB:", error);
    } finally {
        process.exit(0);
    }
}

main();

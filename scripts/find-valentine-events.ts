import { createConnection } from "mongoose";

const PROD_DB_URL = "mongodb+srv://jetzy-prod-user:098hyG7Xb26YzVo4@prod-jetzy-cluster.mvkbz.mongodb.net/main";

async function findValentineEvents() {
    console.log("Connecting to production database...");
    const connection = await createConnection(PROD_DB_URL).asPromise();
    console.log("Connected.");

    const Events = connection.model("Events", new Schema({}, { strict: false }), "events");

    console.log("Searching for Valentine events...");
    const valentineEvents = await Events.find({
        name: { $regex: /valentine/i },
        isDeleted: false
    }).lean();

    console.log(`Found ${valentineEvents.length} events:`);
    valentineEvents.forEach((event: any) => {
        console.log(`- ID: ${event._id}`);
        console.log(`  Name: ${event.name}`);
        console.log(`  Description: ${event.desc}`);
        console.log(`  Slug: ${event.slug}`);
        const lowestPrice = event.tickets?.length > 0
            ? Math.min(...event.tickets.map((t: any) => t.price))
            : 0;
        console.log(`  Lowest Ticket Price: ${lowestPrice}`);
        console.log("---");
    });

    await connection.close();
}

// Inlined Schema for simplicity in the script
import { Schema } from "mongoose";

findValentineEvents().catch(err => {
    console.error("Error:", err);
    process.exit(1);
});

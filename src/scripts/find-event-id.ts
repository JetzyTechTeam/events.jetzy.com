
import path from "path";
import fs from "fs";

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
    loadEnv(path.join(process.cwd(), ".env"));

    try {
        const { ensureDbConnected } = await import("@/configs/database");
        const { Events } = await import("@/models/events");

        await ensureDbConnected();
        const eventName = "Valentine Event";
        const slug = "rOY402PFUL";

        console.log(`Searching for name "${eventName}" or slug "${slug}"...`);

        const eventsByName = await Events.find({
            name: { $regex: eventName, $options: 'i' },
            isDeleted: false
        });

        const eventsBySlug = await Events.find({
            slug: slug,
            isDeleted: false
        });

        console.log(`Events by name: ${eventsByName.length}`);
        eventsByName.forEach(e => console.log(`- ${e.name} (Slug: ${e.slug}, ID: ${e._id})`));

        console.log(`Events by slug: ${eventsBySlug.length}`);
        eventsBySlug.forEach(e => console.log(`- ${e.name} (Slug: ${e.slug}, ID: ${e._id})`));

        if (eventsByName.length === 0 && eventsBySlug.length === 0) {
            console.log("Still no luck. Checking for any event with 'Valentine'...");
            const valentine = await Events.find({ name: /Valentine/i, isDeleted: false });
            valentine.forEach(e => console.log(`- ${e.name} (Slug: ${e.slug}, ID: ${e._id})`));
        }

    } catch (error) {
        console.error("Error:", error);
    } finally {
        process.exit(0);
    }
}

main();

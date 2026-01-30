
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
        const events = await Events.find({ isDeleted: false }).limit(20).select('name slug _id');
        console.log("Recent Events:");
        events.forEach(e => {
            console.log(`- ${e.name} (Slug: ${e.slug}, ID: ${e._id})`);
        });
    } catch (error) {
        console.error("Error:", error);
    } finally {
        process.exit(0);
    }
}

main();

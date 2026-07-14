import path from "path"
import fs from "fs"
import { createConnection, Schema } from "mongoose"

function loadEnv(filePath: string) {
	if (fs.existsSync(filePath)) {
		const content = fs.readFileSync(filePath, "utf-8")
		content.split("\n").forEach((line) => {
			const match = line.match(/^([^=]+)=(.*)$/)
			if (match) {
				const key = match[1].trim()
				let value = match[2].trim()
				if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
					value = value.slice(1, -1)
				}
				if (!process.env[key]) {
					process.env[key] = value
				}
			}
		})
	}
}

async function main() {
	loadEnv(path.join(process.cwd(), ".env.local"))
	loadEnv(path.join(process.cwd(), ".env"))

	const dbUrl = process.env.NEXT_EVENTS_DB_URL
	if (!dbUrl) {
		console.error("NEXT_EVENTS_DB_URL not set in .env/.env.local")
		process.exit(1)
	}

	const slug = "fruOxwkL8H"

	try {
		const conn = createConnection(dbUrl)
		await conn.asPromise()
		console.log("Connected to DB.")

		const eventsSchema = new Schema({}, { strict: false })
		const Events = conn.model("Events", eventsSchema)

		const referralCodeSchema = new Schema({}, { strict: false })
		const ReferralCodes = conn.model("ReferralCodes", referralCodeSchema)

		const event = await Events.findOne({ slug, isDeleted: false })
		if (!event) {
			console.log(`Event NOT FOUND for slug: ${slug}`)
		} else {
			console.log("Event FOUND:")
			console.log(JSON.stringify({ id: event.get("_id").toString(), name: event.get("name"), slug: event.get("slug") }, null, 2))
		}

		const existing = await ReferralCodes.find({
			code: { $regex: /^jetzy-me$/i },
		})
		console.log(`Existing codes matching "JETZY-ME" (any case, any deletion state): ${existing.length}`)
		existing.forEach((c) => console.log(JSON.stringify(c, null, 2)))

		await conn.close()
	} catch (error) {
		console.error("Error:", error)
	} finally {
		process.exit(0)
	}
}

main()

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
				if (!process.env[key]) process.env[key] = value
			}
		})
	}
}

async function main() {
	loadEnv(path.join(process.cwd(), ".env.local"))
	loadEnv(path.join(process.cwd(), ".env"))
	const dbUrl = process.env.NEXT_EVENTS_DB_URL!
	const conn = createConnection(dbUrl)
	await conn.asPromise()
	const referralCodeSchema = new Schema({}, { strict: false })
	const ReferralCodes = conn.model("ReferralCodes", referralCodeSchema)
	const eventsSchema = new Schema({}, { strict: false })
	const Events = conn.model("Events", eventsSchema)

	const codes = await ReferralCodes.find({ code: { $regex: /^jetzy100$/i } })
	for (const c of codes) {
		const ev = await Events.findById(c.get("eventId"))
		console.log(
			JSON.stringify(
				{
					code: c.get("code"),
					eventId: c.get("eventId")?.toString(),
					eventName: ev?.get("name"),
					discountPercentage: c.get("discountPercentage"),
					maxUses: c.get("maxUses"),
					isActive: c.get("isActive"),
					isDeleted: c.get("isDeleted"),
				},
				null,
				2,
			),
		)
	}
	await conn.close()
	process.exit(0)
}
main()

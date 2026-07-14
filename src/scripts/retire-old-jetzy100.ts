import path from "path"
import fs from "fs"
import { createConnection, Schema, Types } from "mongoose"

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
	const dbUrl = process.env.NEXT_EVENTS_DB_URL
	if (!dbUrl) {
		console.error("NEXT_EVENTS_DB_URL not set")
		process.exit(1)
	}

	const oldCode = "JETZY100"
	const oldEventId = "697cf23827f6f5f0d7d8c25a" // Jetzy Valentine's Event NY
	const retiredCode = "JETZY100-OLD-VALENTINE"

	try {
		const conn = createConnection(dbUrl)
		await conn.asPromise()
		console.log("Connected to DB.")

		const referralCodeSchema = new Schema({}, { strict: false })
		const ReferralCodes = conn.model("ReferralCodes", referralCodeSchema)

		const before = await ReferralCodes.findOne({ code: oldCode, eventId: new Types.ObjectId(oldEventId) })
		if (!before) {
			console.log(`No matching record found for code=${oldCode} eventId=${oldEventId}. Aborting.`)
			await conn.close()
			process.exit(0)
		}
		console.log(`Found existing record. usageCount=${before.get("usageCount")}`)

		const result = await ReferralCodes.updateOne(
			{ code: oldCode, eventId: new Types.ObjectId(oldEventId) },
			{ $set: { code: retiredCode, isActive: false, isDeleted: true, updatedAt: new Date() } },
		)
		console.log(`Retired old code. Modified: ${result.modifiedCount}`)

		const after = await ReferralCodes.findOne({ code: retiredCode, eventId: new Types.ObjectId(oldEventId) })
		console.log(JSON.stringify(after, null, 2))

		await conn.close()
	} catch (error) {
		console.error("Error retiring old code:", error)
	} finally {
		process.exit(0)
	}
}

main()

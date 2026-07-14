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

	const code = "JETZY-ME"

	try {
		const conn = createConnection(dbUrl)
		await conn.asPromise()
		console.log("Connected to DB.")

		const referralCodeSchema = new Schema({}, { strict: false })
		const ReferralCodes = conn.model("ReferralCodes", referralCodeSchema)

		const result = await ReferralCodes.updateOne({ code, isDeleted: false }, { $set: { discountPercentage: 0, updatedAt: new Date() } })

		if (result.matchedCount === 0) {
			console.log(`Referral code ${code} not found.`)
		} else {
			console.log(`SUCCESS! Referral code ${code} discountPercentage set to 0. Modified: ${result.modifiedCount}`)
		}

		const updated = await ReferralCodes.findOne({ code, isDeleted: false })
		console.log(JSON.stringify(updated, null, 2))

		await conn.close()
	} catch (error) {
		console.error("Error updating referral code:", error)
	} finally {
		process.exit(0)
	}
}

main()

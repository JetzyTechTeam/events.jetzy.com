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

	const eventId = "6a4e08db907a0344251e0a1c" // Harvard Alumni & Friends: 2026 Summer Rooftop Soiree (slug: fruOxwkL8H)
	const code = "JETZY100"

	try {
		const conn = createConnection(dbUrl)
		await conn.asPromise()
		console.log("Connected to DB.")

		// Mirrors src/models/events/referral-codes.ts so uppercase/trim setters match production behavior
		const referralCodeSchema = new Schema(
			{
				eventId: { type: Schema.Types.ObjectId, required: true, index: true },
				code: { type: String, required: true, unique: true, index: true, uppercase: true, trim: true },
				discountPercentage: { type: Number, required: true, min: 0, max: 100 },
				commissionPercentage: { type: Number, default: 10, min: 0, max: 100 },
				isActive: { type: Boolean, default: true, index: true },
				usageCount: { type: Number, default: 0 },
				maxUses: { type: Number, required: false, default: null },
				createdBy: { type: Schema.Types.ObjectId, required: false },
				isDeleted: { type: Boolean, default: false, index: true },
			},
			{ timestamps: true },
		)

		const ReferralCodes = conn.model("ReferralCodes", referralCodeSchema)

		const existing = await ReferralCodes.findOne({ code, isDeleted: false })
		if (existing) {
			console.log(`Referral code ${code} already exists.`)
		} else {
			const result = await ReferralCodes.create({
				eventId: new Types.ObjectId(eventId),
				code,
				discountPercentage: 100,
				maxUses: null,
				isActive: true,
				usageCount: 0,
				isDeleted: false,
			})
			console.log(`SUCCESS! Referral code created: ${result.code} for event ${eventId}`)
		}

		await conn.close()
	} catch (error) {
		console.error("Error creating referral code:", error)
	} finally {
		process.exit(0)
	}
}

main()

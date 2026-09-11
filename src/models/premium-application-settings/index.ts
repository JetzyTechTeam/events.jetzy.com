import { Schema } from "mongoose"
import { dbconn } from "@/configs/database"

/**
 * Singleton config for the Premium application gate — ONE row, `key: "default"`.
 *
 * `enabled` is the kill switch for the whole questions+approval flow; while off, buying Premium
 * with no invite code goes straight to the existing instant-trial-subscription checkout
 * unchanged. `questions` reuses the event custom-question shape (`ICustomQuestion`) so the admin
 * editor and the guest-facing renderer can be modelled on the ones that already exist for events
 * — see `src/lib/premium-application.ts` for the seeded defaults (LinkedIn / Instagram / Website).
 *
 * No unique index is created for `key` (this codebase's connection runs `autoIndex: false`) —
 * every write goes through `getApplicationSettings()`'s upsert keyed on the same filter, so a
 * missing index costs a table scan on a one-row collection, never a duplicate.
 */
const questionSchema = new Schema(
	{
		id: { type: String, required: true },
		title: { type: String, required: true },
		type: {
			type: String,
			enum: ["text", "options", "multiple_choice", "social_profile", "company", "checkbox", "terms", "mobile", "website"],
			required: true,
		},
		isRequired: { type: Boolean, default: false },
		responseLength: { type: String, enum: ["short", "multi-line"], required: false },
		selectionType: { type: String, enum: ["single", "multiple"], required: false },
		options: { type: [String], required: false },
		platform: { type: String, required: false },
		collectJobTitle: { type: Boolean, required: false },
		termsContentType: { type: String, enum: ["text", "link"], required: false },
		termsContent: { type: String, required: false },
		collectSignature: { type: Boolean, required: false },
	},
	{ _id: false },
)

const settingsSchema = new Schema(
	{
		key: { type: String, default: "default" },
		enabled: { type: Boolean, default: false },
		questions: { type: [questionSchema], default: [] },
	},
	{ timestamps: true },
)

export const PremiumApplicationSettings =
	dbconn.models.PremiumApplicationSettings || dbconn.model("PremiumApplicationSettings", settingsSchema, "premium_application_settings")

import { dbconn } from "@/configs/database"
import { Model, Schema } from "mongoose"

/**
 * A support question submitted from `/support`. Delivery is by email (to the asker and to
 * ADMIN_SUPPORT_EMAIL) — this row is a record of what was sent, not a ticket-management
 * workflow. No admin UI reads `status` yet.
 */
export type SupportCategory = "event" | "premium" | "general"
export type SupportRequestStatus = "open" | "resolved"

export interface ISupportRequest {
	_id?: string
	userId: Schema.Types.ObjectId
	name: string
	email: string
	category: SupportCategory
	/** Only ever a PUBLIC event — enforced server-side in api/support/submit.ts, never trust the client. */
	eventId?: Schema.Types.ObjectId
	/** Snapshot at submit time, so the record stays meaningful if the event is later renamed or deleted. */
	eventName?: string
	eventSlug?: string
	message: string
	status: SupportRequestStatus
	createdAt?: Date
	updatedAt?: Date
}

const supportRequestSchema = new Schema<ISupportRequest>(
	{
		userId: {
			type: Schema.Types.ObjectId,
			required: true,
			index: true,
		},
		name: {
			type: String,
			required: true,
			trim: true,
		},
		email: {
			type: String,
			required: true,
			lowercase: true,
			trim: true,
		},
		category: {
			type: String,
			required: true,
		},
		eventId: {
			type: Schema.Types.ObjectId,
			required: false,
			ref: "Events",
		},
		eventName: {
			type: String,
			required: false,
		},
		eventSlug: {
			type: String,
			required: false,
		},
		message: {
			type: String,
			required: true,
			trim: true,
		},
		status: {
			type: String,
			required: true,
			default: "open",
		},
	},
	{
		timestamps: true,
	},
)

export const SupportRequest: Model<ISupportRequest> =
	dbconn.models["SupportRequest"] || dbconn.model("SupportRequest", supportRequestSchema, "support-requests")

import { Model, Schema, Types } from "mongoose"
import { dbconn } from "@/configs/database"

export interface IEventInteraction {
	_id: Types.ObjectId
	eventId: Types.ObjectId
	sessionId: string
	userId?: Types.ObjectId
	interactionType: string
	timestamp: Date
	metadata?: any
	/** Analytics anon id (localStorage UUID) — stable across tabs/sessions. Absent on old rows. */
	anonId?: string
	/** Event marketing link credited with this interaction (last touch). Absent = direct. */
	marketingLinkId?: Types.ObjectId
	createdAt: Date
	updatedAt: Date
}

const eventInteractionSchema = new Schema<IEventInteraction>(
	{
		eventId: {
			type: Schema.Types.ObjectId,
			required: true,
			index: true,
			ref: "Events",
		},
		sessionId: {
			type: String,
			required: true,
			index: true,
		},
		userId: {
			type: Schema.Types.ObjectId,
			required: false,
			index: true,
			ref: "Users",
		},
		interactionType: {
			type: String,
			required: true,
			// `checkout_submit` was accepted by the track route but missing here, so every such
			// row failed validation silently and the funnel's "Submitted" stage read 0.
			// The four checkout email-check steps — see src/lib/checkout-verification-events.ts.
			enum: [
				"view",
				"click",
				"share",
				"ticket_select",
				"booking_start",
				"checkout_submit",
				"verify_code_sent",
				"verify_code_failed",
				"email_verified",
				"verify_skipped",
				// Discussion chat link / panel — see src/lib/discussion-events.ts.
				"discussion_link_visit",
				"chat_open",
				"chat_link_shared",
				"chat_qr_opened",
			],
			index: true,
		},
		timestamp: {
			type: Date,
			default: Date.now,
			required: true,
			index: true,
		},
		metadata: {
			type: Schema.Types.Mixed,
			required: false,
		},
		// No defaults on either: absent means "recorded before this existed" / "no link".
		anonId: {
			type: String,
			required: false,
		},
		marketingLinkId: {
			type: Schema.Types.ObjectId,
			required: false,
		},
	},
	{ timestamps: true }
)

// Indexes for performance
eventInteractionSchema.index({ eventId: 1, interactionType: 1 })
eventInteractionSchema.index({ eventId: 1, timestamp: -1 })
eventInteractionSchema.index({ sessionId: 1, timestamp: -1 })
eventInteractionSchema.index({ userId: 1, timestamp: -1 })
// Built by scripts/create-marketing-link-index.ts (autoIndex is off) — partial, so the many
// rows without a link cost nothing.
eventInteractionSchema.index(
	{ eventId: 1, marketingLinkId: 1, interactionType: 1 },
	{ partialFilterExpression: { marketingLinkId: { $exists: true } } },
)

export const EventInteraction: Model<IEventInteraction> =
	dbconn.models["EventInteraction"] ||
	dbconn.model<IEventInteraction>("EventInteraction", eventInteractionSchema)


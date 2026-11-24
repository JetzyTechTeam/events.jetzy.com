import { Model, Schema, Types } from "mongoose"
import { dbconn } from "@/configs/database"

/**
 * A tracked share link for one event — `events.jetzy.com/<slug>?mk=<tag>`.
 *
 * The CEO's ask (2026-11-24): one link per channel (Facebook, Instagram, Partiful, …) so a
 * report can say how many people each brought, how far they got and who bought. The link is
 * pure attribution; it MAY also carry one of the event's referral codes, which the landing page
 * then pre-applies at checkout exactly as `?ref=` does.
 *
 * `tag` is IMMUTABLE after create — posts already carry it, same reason a referral code's text
 * can't be renamed. Delete is soft so a booking's `marketingLinkId` always resolves.
 */
export interface IMarketingLink {
	_id: Types.ObjectId
	eventId: Types.ObjectId
	tag: string
	label: string
	platform?: string
	/** One of THIS event's referral codes, pre-applied at checkout. No default. */
	referralCodeId?: Types.ObjectId
	isActive: boolean
	isDeleted: boolean
	createdBy?: Types.ObjectId
	createdAt: Date
	updatedAt: Date
}

const marketingLinkSchema = new Schema<IMarketingLink>(
	{
		eventId: { type: Schema.Types.ObjectId, required: true },
		tag: { type: String, required: true, lowercase: true, trim: true },
		label: { type: String, required: true, trim: true },
		platform: { type: String, required: false, trim: true },
		referralCodeId: { type: Schema.Types.ObjectId, required: false },
		isActive: { type: Boolean, default: true },
		isDeleted: { type: Boolean, default: false },
		createdBy: { type: Schema.Types.ObjectId, required: false },
	},
	{ timestamps: true, collection: "event-marketing-links" },
)

// autoIndex is off — built by scripts/create-marketing-link-index.ts, once per database.
// Unique per event, deleted rows included: a deleted tag is revived rather than duplicated.
marketingLinkSchema.index({ eventId: 1, tag: 1 }, { unique: true })

export const MarketingLinks: Model<IMarketingLink> =
	dbconn.models["MarketingLinks"] || dbconn.model<IMarketingLink>("MarketingLinks", marketingLinkSchema)

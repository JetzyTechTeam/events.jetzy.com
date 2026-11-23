import { Model, Schema, Types } from "mongoose"
import { dbconn } from "@/configs/database"

/**
 * One send from the admin "Email Attendees" page — past attendees told about a new event.
 *
 * Deliberately NOT the `Blasts` collection: a blast belongs to ONE event and shows on that event's
 * Blasts tab as something its host sent. These are Jetzy's own mailings, drawn from any number of
 * events, so writing them there would put them in a host's history under the wrong name.
 *
 * Written once at send time; never updated. No index script — the page reads the latest 20 by
 * `sentAt`, on a collection that grows by a handful of rows a week.
 */

export type AttendeeMailingGroup = "booked" | "pending" | "invited"

export interface IAttendeeMailingRecipient {
	email: string
	name?: string
	/** Where this person came from: "attendee" (a picked event), "added" (typed) or "imported" (file). */
	source?: string
	status: string
	reason?: string
}

export interface IAttendeeMailing {
	_id?: Types.ObjectId
	subject: string
	message: string
	/** The NEW event the email promotes — its name and link are in the email. */
	promotedEventId?: Types.ObjectId
	promotedEventName?: string
	/** The past events whose people were pulled in. */
	sourceEventIds?: Types.ObjectId[]
	groups?: AttendeeMailingGroup[]
	recipients?: IAttendeeMailingRecipient[]
	recipientCount: number
	succeededCount: number
	failedCount: number
	attachments?: Array<{ url: string; filename: string; contentType: string; size: number; mode?: "attach" | "link" }>
	greetByName?: boolean
	sentBy?: Types.ObjectId
	sentByEmail?: string
	sentAt: Date
	createdAt?: Date
	updatedAt?: Date
}

const attendeeMailingSchema = new Schema<IAttendeeMailing>(
	{
		subject: { type: String, required: true },
		message: { type: String, required: true },
		promotedEventId: { type: Schema.Types.ObjectId, ref: "Events", required: false },
		promotedEventName: { type: String, required: false },
		sourceEventIds: { type: [Schema.Types.ObjectId], required: false, default: undefined },
		groups: { type: [String], required: false, default: undefined },
		// No enum on `status`, matching `Blasts.recipients` — kept open for a later webhook update.
		recipients: {
			type: [
				{
					_id: false,
					email: { type: String, required: true },
					name: { type: String, required: false },
					source: { type: String, required: false },
					status: { type: String, required: true },
					reason: { type: String, required: false },
				},
			],
			required: false,
			default: undefined,
		},
		recipientCount: { type: Number, required: true },
		succeededCount: { type: Number, required: true },
		failedCount: { type: Number, required: true },
		// No default: absent = sent with none.
		attachments: {
			type: [
				{
					_id: false,
					url: { type: String, required: true },
					filename: { type: String, required: true },
					contentType: { type: String, required: true },
					size: { type: Number, required: true },
					mode: { type: String, required: false },
				},
			],
			required: false,
			default: undefined,
		},
		greetByName: { type: Boolean, required: false },
		sentBy: { type: Schema.Types.ObjectId, required: false },
		sentByEmail: { type: String, required: false },
		sentAt: { type: Date, default: Date.now },
	},
	{ timestamps: true },
)

export const AttendeeMailings: Model<IAttendeeMailing> =
	dbconn.models["AttendeeMailings"] ||
	dbconn.model<IAttendeeMailing>("AttendeeMailings", attendeeMailingSchema, "admin-attendee-mailings")

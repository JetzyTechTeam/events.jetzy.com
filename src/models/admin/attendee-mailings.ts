import { Model, Schema, Types } from "mongoose"
import { dbconn } from "@/configs/database"

/**
 * One send from the admin "Email Attendees" page — past attendees told about a new event.
 *
 * Deliberately NOT the `Blasts` collection: a blast belongs to ONE event and shows on that event's
 * Blasts tab as something its host sent. These are Jetzy's own mailings, drawn from any number of
 * events, so writing them there would put them in a host's history under the wrong name.
 *
 * TWO kinds of row, told apart by `status`:
 *  - SENT (status ABSENT — every row written before drafts existed is a sent email): written once
 *    at send time and NEVER updated or deleted. It is history. "Use again" copies it into the
 *    composer; it does not edit it.
 *  - DRAFT (`status: "draft"`): a half-written email, shared by every admin, updated in place by
 *    "Save draft", deleted by "Discard" and by a successful send of it.
 *
 * No index script — the page lists the latest rows of a collection that grows by a handful a week.
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

export type AttendeeMailingExtraPerson = { email: string; name?: string; source: "added" | "imported" }

export interface IAttendeeMailing {
	_id?: Types.ObjectId
	/** "draft" for a draft. ABSENT = sent (see the header). */
	status?: "draft"
	subject: string
	message: string
	/** The NEW event the email promotes — its name and link are in the email. */
	promotedEventId?: Types.ObjectId
	promotedEventName?: string
	/** The past events whose people were pulled in. */
	sourceEventIds?: Types.ObjectId[]
	groups?: AttendeeMailingGroup[]
	recipients?: IAttendeeMailingRecipient[]
	/** Sent rows only. */
	recipientCount?: number
	succeededCount?: number
	failedCount?: number
	/** Drafts only: people typed or imported, and the addresses the admin unticked. */
	extraPeople?: AttendeeMailingExtraPerson[]
	excludedEmails?: string[]
	createdBy?: Types.ObjectId
	createdByEmail?: string
	updatedBy?: Types.ObjectId
	updatedByEmail?: string
	attachments?: Array<{ url: string; filename: string; contentType: string; size: number; mode?: "attach" | "link" }>
	greetByName?: boolean
	/** SendGrid unsubscribe group the email carried. Absent = no Unsubscribe link. */
	unsubscribeGroupId?: number
	/** A custom sender typed by the admin. Absent = the usual sender, "Jetzy". */
	fromEmail?: string
	fromName?: string
	sentBy?: Types.ObjectId
	sentByEmail?: string
	sentAt?: Date
	createdAt?: Date
	updatedAt?: Date
}

const attendeeMailingSchema = new Schema<IAttendeeMailing>(
	{
		// No default and no enum: absent = sent.
		status: { type: String, required: false },
		// Required only on a sent email — a draft may be half-written.
		subject: { type: String, required: function (this: any) { return this.status !== "draft" } },
		message: { type: String, required: function (this: any) { return this.status !== "draft" } },
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
		recipientCount: { type: Number, required: false },
		succeededCount: { type: Number, required: false },
		failedCount: { type: Number, required: false },
		extraPeople: {
			type: [{ _id: false, email: { type: String, required: true }, name: { type: String, required: false }, source: { type: String, required: true } }],
			required: false,
			default: undefined,
		},
		excludedEmails: { type: [String], required: false, default: undefined },
		createdBy: { type: Schema.Types.ObjectId, required: false },
		createdByEmail: { type: String, required: false },
		updatedBy: { type: Schema.Types.ObjectId, required: false },
		updatedByEmail: { type: String, required: false },
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
		// No default: absent = sent without an Unsubscribe link.
		unsubscribeGroupId: { type: Number, required: false },
		// No default: absent = sent from the usual sender as "Jetzy".
		fromEmail: { type: String, required: false },
		fromName: { type: String, required: false },
		sentBy: { type: Schema.Types.ObjectId, required: false },
		sentByEmail: { type: String, required: false },
		// No default: a draft has not been sent. `send.ts` always writes it.
		sentAt: { type: Date, required: false },
	},
	{ timestamps: true },
)

export const AttendeeMailings: Model<IAttendeeMailing> =
	dbconn.models["AttendeeMailings"] ||
	dbconn.model<IAttendeeMailing>("AttendeeMailings", attendeeMailingSchema, "admin-attendee-mailings")

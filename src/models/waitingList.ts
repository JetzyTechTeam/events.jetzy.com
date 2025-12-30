import { Model, Schema } from "mongoose"
import { dbconn } from "@/configs/database"

export interface IWaitingList {
	_id: string
	eventId: any
	firstName: string
	lastName: string
	email: string
	phone: string
	tickets: Array<{
		ticketId: string
		quantity: number
		name: string
		price: number
	}>
	status: 'waiting' | 'notified' | 'converted' | 'approved'
	createdAt: string
	updatedAt: string
}

const waitingListSchema = new Schema<IWaitingList>(
	{
		eventId: {
			type: Schema.Types.ObjectId,
			required: true,
			index: true,
		},
		firstName: {
			type: String,
			required: true,
		},
		lastName: {
			type: String,
			required: true,
		},
		email: {
			type: String,
			required: true,
			index: true,
		},
		phone: {
			type: String,
			required: true,
		},
		tickets: [
			{
				ticketId: {
					type: String,
					required: true,
				},
				quantity: {
					type: Number,
					required: true,
				},
				name: {
					type: String,
					required: true,
				},
				price: {
					type: Number,
					required: true,
				},
			},
		],
	status: {
		type: String,
		enum: ['waiting', 'notified', 'converted', 'approved'],
		default: 'waiting',
	},
	},
	{ timestamps: true },
)

export const WaitingList: Model<IWaitingList> = dbconn.models["WaitingList"] || dbconn.model<IWaitingList>("WaitingList", waitingListSchema)

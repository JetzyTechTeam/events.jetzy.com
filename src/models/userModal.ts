

import { dbconn } from "@Jetzy/configs/database"
import { Roles } from "@Jetzy/types"
import { Schema } from "mongoose"
// Define the user schema
export const usersSchema = new Schema(
	{
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
			unique: true,
		},

		password: {
			type: String,
			required: false,
		},

		role: {
			type: String,
			required: true,
			enum: {
				values: Object.values(Roles),
				message: "Invalid status type",
			},
			default: "user",
		},
		image: {
			type: String,
			required: false,
		},
		authProvider: {
			type: String,
			default: "credentials",
		},
		firebaseUid: {
			type: String,
			required: false,
		},
		acceptedTerms: {
			type: Boolean,
			default: false,
		},
		acceptedTermsAt: {
			type: Date,
			required: false,
		},
	},
	{ timestamps: true },
)

export const Users = dbconn.models.Users || dbconn.model("Users", usersSchema, 'users')



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
			required: false,
			default: "",
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
		// Account safety fields
		isBlocked: {
			type: Boolean,
			default: false,
		},
		emailBounced: {
			type: Boolean,
			default: false,
		},
		// Password reset fields
		passwordResetToken: {
			type: String,
			required: false,
		},
		passwordResetTokenExpiresAt: {
			type: Date,
			required: false,
		},
		// Email verification (signup verify-link flow)
		emailVerified: {
			type: Boolean,
			default: true,
		},
		verifyToken: {
			type: String,
			required: false,
			index: true,
		},
		verifyTokenExpiresAt: {
			type: Date,
			required: false,
		},
	},
	{ timestamps: true },
)

export const Users = dbconn.models.Users || dbconn.model("Users", usersSchema, 'users')

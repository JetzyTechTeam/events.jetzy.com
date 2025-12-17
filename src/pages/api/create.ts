// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { Users } from "@Jetzy/models/userModal"
import { Roles } from "@Jetzy/types"
import type { NextApiRequest, NextApiResponse } from "next"
import bcrypt from "bcrypt"
import { EventUsers } from "@/models/eventUsersModal"

type Data = {
	firstName: string
	lastName: string
	email: string
	password: string
	shouldBeAJetzyMember: boolean
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
	try {
		const { firstName, lastName, email, password, shouldBeAJetzyMember } = req?.body

		// Validate required fields
		if (!firstName || !lastName || !email || !password) {
			return sendResponse(res, null, "All fields are required.", false, ResCode.BAD_REQUEST);
		}

		// Normalize email to lowercase for consistent storage
		const normalizedEmail = email.toLowerCase().trim();

		const userType = Roles.USER

		const hashPassword = await bcrypt.hash(password, 10)

		let user = null;
		const isJetzyMember = shouldBeAJetzyMember === 'true';

		if (!isJetzyMember) {
			const existingUser = await Users.findOne({ email: normalizedEmail });

			if (existingUser) {
				if (!existingUser.password || existingUser.password === "") {
					// User exists but has no password, update it
					existingUser.password = hashPassword;
					await existingUser.save({ validateModifiedOnly: true });
					return sendResponse(res, existingUser, "User account created successfully.", true, ResCode.OK);
				} else {
					// User already exists with a password
					return sendResponse(res, null, "An account with this email already exists. Please login instead.", false, ResCode.BAD_REQUEST);
				}
			}

			// Create new user
			user = await Users.create({ firstName, lastName, email: normalizedEmail, password: hashPassword, role: userType });
		} else {
			// Check if EventUser already exists
			const existingEventUser = await EventUsers.findOne({ email: normalizedEmail });
			
			if (existingEventUser) {
				if (!existingEventUser.password || existingEventUser.password === "") {
					// EventUser exists but has no password, update it
					existingEventUser.password = hashPassword;
					await existingEventUser.save({ validateModifiedOnly: true });
					return sendResponse(res, existingEventUser, "User account created successfully.", true, ResCode.OK);
				} else {
					// EventUser already exists with a password
					return sendResponse(res, null, "An account with this email already exists. Please login instead.", false, ResCode.BAD_REQUEST);
				}
			}

			// Create new EventUser
			user = await EventUsers.create({ 
				firstName,
				lastName,
				email: normalizedEmail,
				password: hashPassword,
				role: userType
			});
		}

		if (!user || user === null) return sendResponse(res, null, "Failed to create user account.", false, ResCode.INTERNAL_SERVER_ERROR)

		return sendResponse(res, user, "User account created successfully.", true, ResCode.CREATED)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

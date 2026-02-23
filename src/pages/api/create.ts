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

		const userType = Roles.USER

		console.log(`[Signup API] Hashing for ${email}: L=${password?.length}, First='${password?.[0]}', Last='${password?.[password?.length - 1]}'`)
		const hashPassword = await bcrypt.hash(password, 10)
		console.log(`[Signup API] Hash generated for ${email}: ${hashPassword.substring(0, 10)}...`)

		let user = null;
		// For QR Scanner flow, we want users to be in EventUsers for better isolation
		// Check both collections to ensure unique emails
		const existingInUsers = await Users.findOne({ email });
		const existingInEventUsers = await EventUsers.findOne({ email });
		const existingUser = existingInEventUsers || existingInUsers;

		if (existingUser) {
			if (!existingUser.password || existingUser.password === "") {
				console.log(`[Signup API] Updating password for existing social user in ${existingInEventUsers ? 'EventUsers' : 'Users'}: ${email}`)
				existingUser.password = hashPassword;
				await existingUser.save({ validateModifiedOnly: true });
				return sendResponse(res, existingUser, "User account updated successfully.", true, ResCode.OK);
			} else {
				console.log(`[Signup API] User already exists with password in database: ${email}`)
				return sendResponse(res, null, "User already exists with this email. Please log in with your existing password.", false, ResCode.CONFLICT)
			}
		}

		// Create New user in EventUsers
		user = await EventUsers.create({
			firstName,
			lastName,
			email,
			password: hashPassword,
			role: userType
		})

		if (!user || user === null) return sendResponse(res, null, "Failed to create user account.", false, ResCode.INTERNAL_SERVER_ERROR)

		return sendResponse(res, user, "User account created successfully.", true, ResCode.CREATED)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

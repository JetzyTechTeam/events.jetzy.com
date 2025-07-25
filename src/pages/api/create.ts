// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { Users } from "@Jetzy/models/userModal"
import { Roles } from "@Jetzy/types"
import type { NextApiRequest, NextApiResponse } from "next"
import bcrypt from "bcrypt"

type Data = {
	firstName: string
	lastName: string
	email: string
	password: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
	try {
		const { firstName, lastName, email, password } = req?.body

		const userType = Roles.USER

		const hashPassword = await bcrypt.hash(password, 10)
		const existingUser = await Users.findOne({ email });

		if (existingUser) {
			if (!existingUser.password || existingUser.password === "") {
				existingUser.password = hashPassword;

   		 	await existingUser.save({ validateModifiedOnly: true });
				return sendResponse(res, existingUser, "User account created successfully.", true, ResCode.OK);
			}
		}

		const user = await Users.create({ firstName, lastName, email, password: hashPassword, role: userType })
		if (!user) return sendResponse(res, null, "Failed to create user account.", false, ResCode.INTERNAL_SERVER_ERROR)

		return sendResponse(res, user, "User account created successfully.", true, ResCode.CREATED)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

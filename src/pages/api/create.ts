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
    // get the request body
    const { firstName, lastName, email, password } = req?.body
    // set the user role
    const userType = Roles.ADMIN

    // hash user password
    const hashPassword = await bcrypt.hash(password, 10)

    // check if the user already exist
    if (await Users.findOne({ role: userType }).exec()) return sendResponse(res, null, "System only support one supper admin user.", false, ResCode.UNAUTHORIZED)

    // create user account
    const user = await Users.create({ firstName, lastName, email, password: hashPassword, role: userType })
    if (!user) return sendResponse(res, null, "Failed to create user account.", false, ResCode.INTERNAL_SERVER_ERROR)

    return sendResponse(res, user, "User account created successfully.", true, ResCode.CREATED)
  } catch (error: any) {
    console.log("Error:", error.message)
    return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
  }
}


import { dbconn, ensureDbConnected } from "@Jetzy/configs/database"
import { Users } from "@Jetzy/models/userModal"
import { isValidObjectId } from "mongoose"

export const getPublicUserAction = async (id: string) => {
    try {
        await ensureDbConnected()

        if (!isValidObjectId(id)) {
            return { status: false, message: "Invalid user ID" }
        }

        const user = await Users.findById(id).select("firstName lastName image").lean() as any

        if (!user) {
            return { status: false, message: "User not found" }
        }

        return {
            status: true,
            data: {
                firstName: user.firstName,
                lastName: user.lastName,
                image: user.image || null,
                _id: user._id.toString()
            }
        }
    } catch (error: any) {
        console.error("Error in getPublicUserAction:", error)
        return { status: false, message: error.message || "Failed to fetch user" }
    }
}

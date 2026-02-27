
import { dbconn, ensureDbConnected } from "@Jetzy/configs/database"
import { Users } from "@Jetzy/models/userModal"
import { isValidObjectId } from "mongoose"

export const getPublicUserAction = async (id: string) => {
    try {
        await ensureDbConnected()

        if (!isValidObjectId(id)) {
            return { status: false, message: "Invalid user ID" }
        }

        const { EventUsers } = await import("@/models/eventUsersModal")

        let user = await Users.findById(id).select("firstName lastName image email").lean() as any

        if (!user) {
            user = await EventUsers.findById(id).select("firstName lastName image email").lean() as any
        }

        if (!user) {
            return { status: false, message: "User not found" }
        }

        // Search for image in other collection if missing in primary
        let finalImage = user.image;
        if ((!finalImage || finalImage === "") && user.email) {
            const alternativeUser = await Users.findOne({ email: user.email, image: { $exists: true, $ne: "" } }).select("image").lean() as any
                || await EventUsers.findOne({ email: user.email, image: { $exists: true, $ne: "" } }).select("image").lean() as any;

            if (alternativeUser?.image) {
                finalImage = alternativeUser.image;
            }
        }

        return {
            status: true,
            data: {
                firstName: user.firstName,
                lastName: user.lastName,
                image: finalImage || null,
                _id: user._id.toString()
            }
        }
    } catch (error: any) {
        console.error("Error in getPublicUserAction:", error)
        return { status: false, message: error.message || "Failed to fetch user" }
    }
}

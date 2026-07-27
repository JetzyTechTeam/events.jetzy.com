
import { ensureDbConnected } from "@Jetzy/configs/database"
import { Users } from "@Jetzy/models/userModal"
import { escapeRegExp } from "@Jetzy/utils/text"
import { isValidObjectId } from "mongoose"

export const getPublicUserAction = async (id: string) => {
    try {
        await ensureDbConnected()

        const { EventUsers } = await import("@/models/eventUsersModal")

        let user: any = null;

        if (isValidObjectId(id)) {
            // Standard ID lookup
            user = await Users.findById(id).select("firstName lastName image email premiumSubscription.active").lean()
            if (!user) {
                user = await EventUsers.findById(id).select("firstName lastName image email premiumSubscription.active").lean()
            }
        } else {
            // Derived Slug lookup: firstname-lastname-last3id
            if (id.length < 4) return { status: false, message: "Invalid profile handle" };

            const idSuffix = id.slice(-3).toLowerCase();
            const namePart = id.slice(0, -3).toLowerCase().replace(/[^a-z0-9]/g, "");

            console.log(`[Slug Lookup] Searching for Suffix: ${idSuffix}, Name: ${namePart}`);

            // Use $expr to search by ID suffix because _id is an ObjectId, not a string
            const searchBySuffix = {
                $expr: {
                    $regexMatch: {
                        input: { $toString: "$_id" },
                        regex: `${escapeRegExp(idSuffix)}$`,
                        options: "i"
                    }
                }
            };

            const potentialUsers = [
                ...(await Users.find(searchBySuffix).select("firstName lastName image email premiumSubscription.active").lean()),
                ...(await EventUsers.find(searchBySuffix).select("firstName lastName image email premiumSubscription.active").lean())
            ];

            console.log(`[Slug Lookup] Found ${potentialUsers.length} potential matches by suffix`);

            user = potentialUsers.find(u => {
                const derivedName = (u.firstName + u.lastName).toLowerCase().replace(/[^a-z0-9]/g, "");
                console.log(`[Slug Lookup] Checking user: ${u.firstName} ${u.lastName} -> Derived: ${derivedName}`);
                return derivedName === namePart;
            });
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
                _id: user._id.toString(),
                isPremiumSubscriber: !!user.premiumSubscription?.active,
            }
        }
    } catch (error: any) {
        console.error("Error in getPublicUserAction:", error)
        return { status: false, message: error.message || "Failed to fetch user" }
    }
}

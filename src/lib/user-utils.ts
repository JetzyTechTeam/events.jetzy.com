
import connectMongo from "@Jetzy/lib/connect-db"

export type UserData = {
    firstName: string
    lastName: string
    email: string
    phone: string
    role: string
    acceptedTerms?: boolean
    acceptedTermsAt?: Date
}

const isBoolean = {
    TRUE: true,
    FALSE: false,
}

const settings = {
    theme: "light",
    isContactsSynced: isBoolean.FALSE,
    location: {
        isSynced: isBoolean.FALSE,
    },
    isEmailNotification: isBoolean.TRUE,
    isPushNotification: isBoolean.TRUE,
    isPrivacyPolicyAccepted: isBoolean.FALSE,
    isTermsAndConditionsAccepted: isBoolean.TRUE,
    isSelfieVerified: isBoolean.FALSE,
    isInterestSelected: isBoolean.FALSE,
    isSelectMember: isBoolean.FALSE,
    profile: {
        isCompleted: isBoolean.FALSE,
        hasPicture: isBoolean.FALSE,
        isEmailVerified: isBoolean.FALSE,
        isPhoneVerified: isBoolean.FALSE,
        isPrivate: isBoolean.FALSE,
    },
    blockedUsers: [],
    isDeleted: isBoolean.FALSE,
    isDeactivated: isBoolean.FALSE,
    deactivatedAt: null,
}

/**
 * Escape a user-supplied string for safe use inside a RegExp literal.
 * Same helper, same reason, as `booking-identity.ts` and `premium-eligibility.ts`.
 */
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export async function createOrUpdateUser(userData: UserData) {
    try {
        const db = await connectMongo()

        // Case-insensitive on purpose. `users.email` has no `lowercase: true` (same trap as
        // `Bookings.customerEmail`), so an exact match missed an existing account whenever the
        // buyer typed a different capitalisation than they signed up with — and the unique
        // index is case-sensitive too, so the insert below then created a SECOND row for the
        // same person instead of failing. Every other email lookup in checkout already matches
        // this way; this was the last one that didn't.
        const userExists = await db
            .collection("users")
            .findOne({ email: { $regex: `^${escapeRegex(userData.email.trim())}$`, $options: "i" } })

        let userId

        if (userExists) {
            userId = userExists._id
            // Record latest T&C consent on the existing user when provided
            if (userData.acceptedTerms) {
                await db.collection("users").updateOne(
                    { _id: userId },
                    { $set: { acceptedTerms: true, acceptedTermsAt: userData.acceptedTermsAt || new Date() } }
                )
            }
        } else {
            const newUser = await db.collection("users").insertOne(userData)
            userId = newUser.insertedId
        }

        await db.collection("usersettings").findOneAndUpdate({ user: userId }, { $set: settings }, { upsert: true })

        return { userId, email: userData.email }
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown Error"
        console.error("[createOrUpdateUser] Error:", errorMessage)
        throw error
    }
}

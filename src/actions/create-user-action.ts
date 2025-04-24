'use server'
import connectMongo from "@Jetzy/lib/connect-db"

type UserData = {
	firstName: string
	lastName: string
	email: string
	phone: string
	role: string
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

export async function createUserAction(userData: UserData) {
	try {
		const db = await connectMongo()
		const userExists = await db.collection("users").findOne({ email: userData.email })

		let currentUser
		let userId

		if (userExists) {
			currentUser = userExists
			userId = userExists._id
		} else {
			const newUser = await db.collection("users").insertOne(userData)
			currentUser = newUser
			userId = newUser.insertedId
		}

		await db.collection("usersettings").findOneAndUpdate({ user: userId }, { $set: settings }, { upsert: true })

		return currentUser
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : "Unknown Error"
		console.error(errorMessage)
	}
}

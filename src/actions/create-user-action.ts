"use server"
import { connectDB } from "@/lib/connect-db"
import { Users } from "@/models/userModal"
import bcrypt from "bcrypt"

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
		// Ensure database connection
		await connectDB()

		const userExists = await Users.findOne({ email: userData.email })

		let currentUser
		let userId

		if (userExists) {
			currentUser = userExists
			userId = userExists._id
			console.log("User already exists:", userData.email)
		} else {
			// Generate a default password for users created via booking
			// They will need to reset it to login
			const defaultPassword = await bcrypt.hash(`temp_${Date.now()}`, 10)

			const newUser = await Users.create({
				...userData,
				password: defaultPassword,
				settings,
			})
			currentUser = newUser
			userId = newUser._id
			console.log("New user created:", userData.email, "with ID:", userId)
		}

		return currentUser
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : "Unknown Error"
		console.error("Error in createUserAction:", errorMessage)
		throw error
	}
}

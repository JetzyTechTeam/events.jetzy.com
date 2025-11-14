import { connectDB } from "@/lib/connect-db"
import { Users } from "@/models/userModal"

const settings = {
	theme: "light",
	isContactsSynced: false,
	location: {
		isSynced: false,
	},
	isEmailNotification: true,
	isPushNotification: true,
	isPrivacyPolicyAccepted: false,
	isTermsAndConditionsAccepted: true,
	isSelfieVerified: false,
	isInterestSelected: false,
	isSelectMember: false,
	profile: {
		isCompleted: false,
		hasPicture: false,
		isEmailVerified: false,
		isPhoneVerified: false,
		isPrivate: false,
	},
	blockedUsers: [],
	isDeleted: false,
	isDeactivated: false,
	deactivatedAt: null,
}

export async function getEventParticipants(email: string, orderItems: any[]) {
	// Ensure database connection
	await connectDB()

	const userExists = await Users.findOne({ email })
	let userId

	if (userExists) {
		userId = userExists._id
	} else {
		const newUser = await Users.create({
			email,
			settings,
		})
		userId = newUser._id
	}

	return {
		userId,
		eventId: orderItems[0]?.id,
		tickets: orderItems.map((item) => ({
			priceId: item.priceId,
			price: item.price,
			quantity: item.quantity,
		})),
	}
}

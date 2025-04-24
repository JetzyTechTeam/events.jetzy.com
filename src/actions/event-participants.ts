import connectMongo from "@/lib/connect-db"
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
  const db = await connectMongo();
  const userExists = await db.collection('users').findOne({ email });
  let userId;

  if (userExists) {
    userId = userExists._id;
  } else {
    const newUserResult = await db.collection('users').insertOne({ email });
    userId = newUserResult.insertedId;
  }

  await db.collection("usersettings").findOneAndUpdate(
    { user: userId },
    { $set: settings },
    { upsert: true }
  );

  return {
    userId,
    eventId: orderItems[0]?.id,
    tickets: orderItems.map((item) => ({
      priceId: item.priceId,
      price: item.price,
      quantity: item.quantity
    })),
  }
}

import connectMongo from "@Jetzy/lib/connect-db";

type UserData = {
  firstName: string
  lastName: string
  email: string
  phone: string
  role: string
}

export async function createUserAction(userData: UserData) {
  try {
    const db = await connectMongo();
    const userExists = await db.collection('users').findOne({email: userData.email})

    let currentUser;

    if (userExists) {
      currentUser = userExists;
    } else {
      const newUser = await db.collection('users').insertOne(userData)
      currentUser = newUser;
    }

    return currentUser;

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown Error';
    console.error(errorMessage)
  }
}
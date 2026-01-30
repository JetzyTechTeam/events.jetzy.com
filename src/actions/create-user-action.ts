'use server'
import { createOrUpdateUser, UserData } from "@Jetzy/lib/user-utils"

export async function createUserAction(userData: UserData) {
	try {
		return await createOrUpdateUser(userData)
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : "Unknown Error"
		console.error(errorMessage)
	}
}

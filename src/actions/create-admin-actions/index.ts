"use server"

import { CreateAdminActionParams } from "./types"

export async function createAdminAction(userData: CreateAdminActionParams) {
	try {
	} catch (error: unknown) {
		console.error(error)
		throw new Error("Failed to create admin")
	}
}

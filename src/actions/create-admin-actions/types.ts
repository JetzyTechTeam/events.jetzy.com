import { Roles } from "@Jetzy/types"

export type CreateAdminActionParams = {
	firstName: string
	lastName: string
	email: string
	password: string
	role: Roles
}

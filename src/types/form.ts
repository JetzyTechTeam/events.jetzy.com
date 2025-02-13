import { EventPrivacy } from "./const"

export type SignUpFormData = {
	firstName: string
	lastName: string
	email: string
	password: string
	confirmPassword?: string
}

export type SignInFormData = {
	email: string
	password: string
}

export type CreateEventFormData = {
	name: string
	datetime: string
	location: string
	interest: string
	privacy: EventPrivacy | string
	isPaid: boolean
	amount: number | string
	desc: string
	externalUrl?: string
	image: string
}

export type CreateTicketFormData = {
	firstName: string
	lastName: string
	email: string
	phone: string
	event: string
	quantity: number
}

export type CreateJetzyAccountFormData = {
	firstName: string
	lastName: string
	email: string
	phone: string
	role: string
}

export type CheckoutFormData = {
	tickets: string
	user: string
}

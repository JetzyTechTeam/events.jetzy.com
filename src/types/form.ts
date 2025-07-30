import { TicketData } from "@/components/events/TicketCard"
import { EventPrivacy } from "./const"
import { FileUploadData } from "@/components/misc/DragAndDropUploader"

export type SignUpFormData = {
	firstName: string
	lastName: string
	email: string
	password: string
	confirmPassword?: string
	shouldBeAJetzyMember: boolean
}

export type SignInFormData = {
	email: string
	password: string
}

export type CreateEventFormData = {
	startDate: string
	startTime: string
	endDate: string
	endTime: string
	name: string
	location: string
	longitude?: number
	latitude?: number
	placeId?: string
	capacity: number
	requireApproval: boolean
	showParticipants?: boolean
	images: FileUploadData[]
	tickets: TicketData[]
	isPaid?: boolean
	desc: string
	privacy: 'public' | 'private'
	timezone: string
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

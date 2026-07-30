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
	acceptedTerms: boolean
	location?: string
	latitude?: number
	longitude?: number
	placeId?: string
	refCode?: string
	signupSource?: string
	signupSessionId?: string
}

export type StartSignupFormData = {
	name: string
	email: string
	acceptedTerms: boolean
}

export type SignInFormData = {
	email: string
	password: string
	isJetzyMember: boolean //added
}

export type DatePollOption = {
	id: string
	date: string
	time?: string
	label?: string
	votes?: string[]
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
	videos?: FileUploadData[]
	tickets: TicketData[]
	isPaid?: boolean
	desc: string
	privacy: 'public' | 'private'
	status?: 'draft' | 'published'
	timezone: string
	feedbackFormUrl?: string
	benefits?: string
	locationDisclosedAfterBooking?: boolean
	showOnMobile?: boolean
	premium?: boolean
	premiumMemberDiscountPercentage?: number
	datePoll?: {
		isActive: boolean
		question?: string
		options: DatePollOption[]
	}
	interests?: string[]
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
	referralCode?: string
	acceptedTerms?: boolean
}

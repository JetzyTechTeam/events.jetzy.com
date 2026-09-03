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
	/** Optional invite code, same field /jetzyqrsignup collects. Blank means "no referrer". */
	refCode?: string
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
	/** Host-chosen event URL. Blank on create derives one from the name. */
	slug?: string
	location: string
	/** Venue on its own, e.g. "Mineral Springs, Central Park". Empty for a plain address. */
	venueName?: string
	/** Arrival instructions. Sent in confirmation emails only, never shown on the event page. */
	entrance?: string
	longitude?: number
	latitude?: number
	placeId?: string
	capacity: number
	requireApproval: boolean
	showParticipants?: boolean
	images: FileUploadData[]
	videos?: FileUploadData[]
	/** Banner order across images + videos, as urls. See IEvent.mediaOrder. */
	mediaOrder?: string[]
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
	/** Curation tag — badges the event as Premium. See IEvent.premiumEvent. */
	premiumEvent?: boolean
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

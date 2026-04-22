import { Model, Types } from "mongoose"
import { IBaseModelProps } from "../types"

export interface IEventTicket {
	name: string
	price: number
	desc: string
	stripeProductId: string
	_id: Types.ObjectId
	updatedAt: string
	createdAt: string
}
export interface ICustomQuestion {
	id: string;
	title: string;
	type: 'text' | 'options' | 'social_profile' | 'company' | 'checkbox' | 'terms' | 'mobile' | 'website';
	isRequired: boolean;
	responseLength?: 'short' | 'multi-line'; // For text
	selectionType?: 'single' | 'multiple'; // For options
	options?: string[]; // For options
	platform?: string; // For social_profile
	collectJobTitle?: boolean; // For company
	termsContentType?: 'text' | 'link'; // For terms
	termsContent?: string; // For terms
	collectSignature?: boolean; // For terms
}

export interface IDatePollOption {
	id: string;
	date: string;
	time: string;
	label?: string;
	votes: string[];
}

export interface IDatePoll {
	isActive: boolean;
	question?: string;
	options: IDatePollOption[];
}

export interface IEvent extends IBaseModelProps {
	name: string
	slug: string
	location: string
	venueName?: string
	showParticipants: boolean
	locationDisclosedAfterBooking?: boolean;
	datePoll?: IDatePoll;
	coordinates: {
		long: number
		lat: number
		placeId: string
	}
	desc: string
	isPaid: boolean
	images: string[]
	videos?: string[]
	startsOn?: Date
	endsOn?: Date
	capacity: number // Number of tickets available
	requireApproval: boolean // If true, user must be approved before they can attend
	timezone: string;
	tickets: IEventTicket[]
	privacy: 'public' | 'private';
	isEnded?: boolean; // UI flag to indicate if event has ended
	questions?: ICustomQuestion[];
	createEventTracker(eventCapacity: number): Promise<IEventTracker>
	getBookings(): Promise<IBookings[]>
	deleteTracker(): Promise<void>
	ownerId?: any;
	host?: {
		name?: string;
		email?: string;
		phone?: string;
	}
	feedbackFormUrl?: string;
	thankYouEmailSentAt?: Date;
	benefits?: string;
}

export enum BookingStatus {
	PENDING = "pending",
	APPROVED = "approved",
	CONFIRMED = "confirmed",
	CANCELLED = "cancelled",
	FAILED = "failed",
	REFUNDED = "refunded",
}
export interface ICustomAnswer {
	questionId: string;
	answer: any; // Can be a string, array of strings, boolean, etc. depending on question type
}

export interface IBookings extends IBaseModelProps {
	bookingRef: string
	eventId: Types.ObjectId
	event: IEvent
	tickets: Array<{
		ticketId: Types.ObjectId
		quantity: number
	}>
	status: BookingStatus
	customerName: string
	customerEmail: string
	customerPhone: string
	subTotal: number
	tax: number
	total: number
	referralCode?: string
	discountAmount?: number
	customAnswers?: ICustomAnswer[];
	updateEventTracker: () => Promise<void>
	getEvent: () => Promise<IEvent>
}

export interface IEventTracker extends IBaseModelProps {
	eventId: Types.ObjectId
	bookedTickets: number
	eventCapacity: number
}

export interface IReferralCode extends IBaseModelProps {
	eventId: Types.ObjectId
	code: string
	discountPercentage: number
	commissionPercentage: number
	isActive: boolean
	usageCount: number
	maxUses?: number
	createdBy?: Types.ObjectId
	isDeleted: boolean
}

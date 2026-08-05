import { Model, Types } from "mongoose"
import { IBaseModelProps } from "../types"

export interface IEventTicket {
	name: string
	price: number
	desc: string
	stripeProductId: string
	/** Per-ticket override. `undefined` inherits the event-level `requireApproval`. */
	requireApproval?: boolean
	/**
	 * Sells a Jetzy Premium membership with the ticket. Non-members pay ticket + monthly
	 * subscription in one Stripe session; existing members pay for the ticket alone.
	 * Mutually exclusive with `requireApproval` — no manual capture in subscription mode.
	 */
	includesPremium?: boolean
	_id: Types.ObjectId
	updatedAt: string
	createdAt: string
}
export interface ICustomQuestion {
	id: string;
	title: string;
	type: 'text' | 'options' | 'multiple_choice' | 'social_profile' | 'company' | 'checkbox' | 'terms' | 'mobile' | 'website';
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
	time?: string;
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
	hasStartTime?: boolean
	hasEndTime?: boolean
	capacity: number // Number of tickets available
	requireApproval: boolean // If true, user must be approved before they can attend
	timezone: string;
	tickets: IEventTicket[]
	privacy: 'public' | 'private';
	adminApprovalStatus?: 'pending' | 'approved';
	showOnMobile?: boolean;
	/** Arrival instructions shown in confirmation emails only, never on the event page. */
	entrance?: string;
	/** @deprecated The member-discount model was retired; membership is sold per ticket via `IEventTicket.includesPremium`. */
	premiumMemberDiscountPercentage?: number;
	/** @deprecated No longer generated or enforced — private events are unlisted, not invite-only. */
	privateAccessCode?: string;
	/** @deprecated The "Premium Event" concept was retired — no hosting gate, no badge, no discount. */
	premium?: boolean;
	status?: 'draft' | 'published';
	// Shadow "draft 2" of a published event: autosaved edits not yet committed to the live event
	draftRevision?: { payload: any; savedAt: string | Date } | null;
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
	interests?: Types.ObjectId[] | string[];
}

export enum BookingStatus {
	PENDING = "pending",
	APPROVED = "approved",
	CONFIRMED = "confirmed",
	CANCELLED = "cancelled",
	REJECTED = "rejected",
	FAILED = "failed",
	REFUNDED = "refunded",
}
export interface ICustomAnswer {
	questionId: string;
	answer: any; // Can be a string, array of strings, boolean, etc. depending on question type
}

/**
 * Lifecycle of the money attached to a booking. Deliberately separate from
 * `BookingStatus`: "awaiting host approval" and "funds are held" are orthogonal.
 * A free pending booking has no `payment` at all.
 */
export type BookingPaymentStatus =
	| "authorized"  // card authorized (manual capture), not charged
	| "capturing"   // capture in flight — crash-recovery marker, never a resting state
	| "captured"    // money taken
	| "canceled"    // hold released by us (reject / guest cancel)
	| "expired"     // authorization lapsed at Stripe, can never be captured
	| "failed"      // capture attempt failed; booking stays PENDING so the host can retry

export interface IBookingPayment {
	provider?: string
	checkoutSessionId?: string
	paymentIntentId?: string
	/** Set only when the ticket bundled a Jetzy Premium membership. */
	subscriptionId?: string
	captureMethod?: "automatic" | "manual"
	status?: BookingPaymentStatus
	/** Major units (dollars), matching `booking.total`. */
	amount?: number
	currency?: string
	authorizedAt?: Date
	/** Optimistic: Stripe holds are ~7 days, shorter on some issuers. The
	 *  `payment_intent.canceled` webhook is the authoritative expiry signal. */
	authExpiresAt?: Date
	capturedAt?: Date
	canceledAt?: Date
	lastError?: string
}

export interface IBookings extends IBaseModelProps {
	bookingRef: string
	eventId: Types.ObjectId
	event: IEvent
	bookerUserId?: Types.ObjectId
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
	premiumMemberDiscountApplied?: boolean
	/** Rates behind `discountAmount`; undefined on bookings predating the split. */
	referralDiscountPercentage?: number
	premiumMemberDiscountPercentage?: number
	customAnswers?: ICustomAnswer[];
	/** Absent on free bookings and on every booking made before paid approval shipped. */
	payment?: IBookingPayment
	acceptedTerms?: boolean
	acceptedTermsAt?: Date
	/** Set on cancellation; undefined on bookings cancelled before this was tracked. */
	cancelledAt?: Date
	cancelledBy?: "guest" | "host" | "admin"
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

export interface IBlast extends IBaseModelProps {
	eventId: Types.ObjectId
	subject: string
	message: string
	targetType: "all" | "bookings" | "invitations"
	status: string
	emailType: "custom" | "availability"
	recipientCount: number
	succeededCount: number
	failedCount: number
	sentBy?: Types.ObjectId
	sentAt: Date
	isDeleted: boolean
}

import { Model, Types } from "mongoose"
import { IBaseModelProps } from "../types"
import type { MembershipKey } from "@/lib/memberships"

export interface IEventTicket {
	name: string
	price: number
	desc: string
	stripeProductId: string
	/** Per-ticket override. `undefined` inherits the event-level `requireApproval`. */
	requireApproval?: boolean
	/**
	 * Memberships sold with this ticket. A buyer who doesn't already hold one pays the ticket
	 * plus its first period; existing members pay for the ticket alone. Resolve with
	 * `ticketMemberships()` from `@/lib/premium-bundle` — never read this field directly.
	 */
	memberships?: MembershipKey[]
	/** @deprecated Superseded by `memberships`; still the fallback for tickets saved before it. */
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
	/** Slugs this event used before it was renamed — each one redirects to `slug`. */
	previousSlugs?: string[]
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

export type BookingMembershipStatus =
	| "pending"  // held / paid for, subscription not created yet
	| "active"   // subscription exists (or the buyer already had one)
	| "failed"   // money taken but the subscription could not be created — someone is owed one

/**
 * One membership sold with this booking.
 *
 * Every subscription this repo creates is created AFTER the money moves — immediately for a
 * straight purchase, at approval for a held one — so everything needed to create it has to be
 * recorded here. `approve.ts` and the fulfilment path both work from the booking document and
 * never see the Stripe Checkout Session or its metadata.
 *
 * `priceId` is stored rather than re-resolved on purpose: a plan price change while a request
 * sits pending must not silently move the buyer onto a rate they were never quoted.
 */
export interface IBookingMembership {
	key: MembershipKey
	status: BookingMembershipStatus
	/** Major units — the first period, the membership's share of `payment.amount`. */
	amount?: number
	priceId?: string
	interval?: string
	subscriptionId?: string
	lastError?: string
}

export interface IBookingPayment {
	provider?: string
	checkoutSessionId?: string
	paymentIntentId?: string
	/**
	 * Memberships sold with this booking, one entry per product. The authority — read this,
	 * not the `premium*` fields below.
	 */
	memberships?: IBookingMembership[]
	/** @deprecated First subscription created. Superseded by `memberships[].subscriptionId`. */
	subscriptionId?: string
	/** @deprecated Superseded by `memberships`; still read for bookings taken before it. */
	premiumStatus?: BookingMembershipStatus
	/** @deprecated Major units, the membership portion of `amount`. */
	premiumAmount?: number
	/** @deprecated */
	premiumPriceId?: string
	/** @deprecated */
	premiumInterval?: string
	captureMethod?: "automatic" | "manual"
	status?: BookingPaymentStatus
	/**
	 * Major units. What the CARD is held for or charged — ticket plus any membership
	 * portion. Deliberately not the same as `booking.total`, which is the ticket alone.
	 */
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
	/**
	 * The Users account behind the CHECKOUT EMAIL, whether or not the buyer was logged in.
	 * `createOrUpdateUser` runs on every checkout and always resolves (or creates) this
	 * account, so unlike `bookerUserId` — which is only ever the logged-in session's own id —
	 * this is present for guest checkouts too. Used to add the attendee as an event member.
	 */
	checkoutUserId?: Types.ObjectId
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

export interface IEventParticipants extends IBaseModelProps {
	event: Types.ObjectId
	participants: Types.ObjectId[]
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

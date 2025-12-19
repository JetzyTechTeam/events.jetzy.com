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

export interface IFeaturedGuest {
	name: string
	title: string
	image?: string
	_id?: Types.ObjectId
}

export interface IEvent extends IBaseModelProps {
	name: string
	slug: string
	location: string
	showParticipants: boolean
	featuredGuests?: IFeaturedGuest[]
	coordinates: {
		long: number
		lat: number
		placeId: string
	}
	desc: string
	isPaid: boolean
	images: string[]
	startsOn: Date
	endsOn: Date
	capacity: number // Number of tickets available
	requireApproval: boolean // If true, user must be approved before they can attend
	timezone: string;
	tickets: IEventTicket[]
	privacy: 'public' | 'private';
	interest?: string;
	subInterest?: string;
	host?: {
		name: string;
		image?: string;
		phone?: string;
		email?: string;
	};
	eventUsersCreated?: boolean;
	eventGroupCreated?: boolean;
	createdBy?: Types.ObjectId;
	createEventTracker(eventCapacity: number): Promise<IEventTracker>
	getBookings(): Promise<IBookings[]>
	deleteTracker(): Promise<void>
}

export enum BookingStatus {
	PENDING = "pending",
	APPROVED = "approved",
	CONFIRMED = "confirmed",
	CHECKED_IN = "checked_in",
	CANCELLED = "cancelled",
	FAILED = "failed",
	REFUNDED = "refunded",
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
	qrCodeToken?: string
	qrCodeImageUrl?: string
	updateEventTracker: () => Promise<void>
	getEvent: () => Promise<IEvent>
}

export interface IEventTracker extends IBaseModelProps {
	eventId: Types.ObjectId
	bookedTickets: number
	eventCapacity: number
}

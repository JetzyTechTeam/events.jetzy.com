import { Types } from "mongoose"
import { IBaseModelProps } from "../types"

export interface IEventTicket {
	name: string
	price: number
	desc: string
	priceId: string
	bookingLimits: number
	_id: Types.ObjectId
	updatedAt: string
	createdAt: string
}
export interface IEvent extends IBaseModelProps {
	name: string
	slug: string
	location: string
	desc: string
	isPaid: boolean
	images: string[]
	startsOn: string
	endsOn: string
	tickets: IEventTicket[]
}

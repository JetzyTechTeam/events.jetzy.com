import Stripe from "stripe"
import { CreateTicketInterfaceResponse } from "./response"

interface RequestState<D = any> {
	isLoading: boolean
	isFetching?: boolean
	data?: D
	dataList?: Array<D>
}
export interface AppSliceState {
	isActive: boolean
	user: any
}

export interface ICheckoutSliceState {
	isLoading: boolean
	session: Stripe.Response<Stripe.Checkout.Session> | null
	tickets: Array<{
		id: number
		name: string
		price: number
		quantity: number
		isSelected: boolean
		desc: string
	}>
	showCheckout: boolean
	formData?: {
		firstName: string
		lastName: string
		email: string
		phone: string
	}
}

export interface AuthSliceState<T = any> extends RequestState<T> {}

export interface EventSliceState<T = any> extends RequestState<T> {}
export interface TicketSliceState<T = any> extends RequestState<T> {
	ticket?: CreateTicketInterfaceResponse
}

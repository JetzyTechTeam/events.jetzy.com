import { POST } from "@Jetzy/configs/api"
import { CheckoutFormData, RequestParams, ServerResponse } from "@Jetzy/types"
import Stripe from "stripe"

const endpoints = {
	create: "public:/checkout",
}

export const CreateCheckoutSessionApi = async (params: RequestParams<CheckoutFormData>): Promise<ServerResponse<Stripe.Response<Stripe.Checkout.Session>, any>> => {
	return await POST(endpoints.create, params?.data)
}

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { HYDRATE } from "next-redux-wrapper"
import { AppState } from "../stores"
import { CheckoutFormData, ICheckoutSliceState, RequestParams } from "@Jetzy/types"
import { CreateCheckoutSessionApi } from "@Jetzy/services/checkout"
import { ServerErrors, Success } from "@Jetzy/lib/_toaster"

export const CreateCheckoutSessionThunk = createAsyncThunk("checkouts/create", async (params: RequestParams<CheckoutFormData>) => {
	return await CreateCheckoutSessionApi(params)
})

// Initial state
const initialState: ICheckoutSliceState = {
	session: null,
	isLoading: false,
	tickets: [],
	showCheckout: false,
	formData: {
		firstName: "",
		lastName: "",
		email: "",
		phone: "",
	},
}

// Actual Slice
export const checkoutSlice = createSlice({
	name: "checkout",
	initialState,
	reducers: {
		// Action to set the authentication status
		toggleCheckoutForm(state, action) {
			state.showCheckout = action.payload
		},
		setSelectedTickets(state, action) {
			state.tickets = action.payload
		},

		// Special reducer for hydrating the state. Special case for next-redux-wrapper
		extraReducers: {
			// @ts-ignore
			[HYDRATE]: (state, action) => {
				return {
					...state,
					...action.payload,
				}
			},
		},
	},

	extraReducers(builder) {
		builder.addCase(CreateCheckoutSessionThunk.pending, (state) => {
			state.isLoading = true
		})

		builder.addCase(CreateCheckoutSessionThunk.fulfilled, (state, action) => {
			state.isLoading = false
			state.session = action.payload?.data

			if (action?.payload?.status) {
				Success("Checkout", "Please complete your payment to confirm your booking.")
			}
		})
		builder.addCase(CreateCheckoutSessionThunk.rejected, (state, action) => {
			state.isLoading = false

			ServerErrors("Sorry, something went wrong on our end! Please try again in a few minutes.", action?.error)
		})
	},
})

export const { toggleCheckoutForm, setSelectedTickets } = checkoutSlice.actions

export const getCheckoutStore = (state: AppState) => state.checkout
export default checkoutSlice

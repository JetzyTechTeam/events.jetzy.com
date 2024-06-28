import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { HYDRATE } from "next-redux-wrapper"
import {
	TicketSliceState,
	RequestParams,
	CreateTicketFormData,
	TicketInterface,
	CreateTicketInterfaceResponse,
} from "@Jetzy/types"
import { ServerErrors, Success } from "@Jetzy/lib/_toaster"
import { AppState } from "../stores"
import { CreateTicketApi } from "@Jetzy/services/tickets/ticketsapis"

export const CreateTicketThunk = createAsyncThunk(
	"tickets/createTicket",
	async (params: RequestParams<CreateTicketFormData>, thunkApi) => {
		return await CreateTicketApi(params)
	},
)

// Initial state
const initialState: TicketSliceState<CreateTicketInterfaceResponse> = {
	isLoading: false,
	data: undefined,
}

// Actual Slice
export const ticketSlice = createSlice({
	name: "tickets",
	initialState,
	reducers: {
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
		builder.addCase(CreateTicketThunk.pending, (state) => {
			state.isLoading = true
		})

		builder.addCase(CreateTicketThunk.fulfilled, (state, action) => {
			state.isLoading = false
			state.ticket = action.payload?.data

			if (action.payload?.status) {
				Success("Ticket created.", "Ticket created successfully!")
				state.data = action.payload?.data
			}
		})

		builder.addCase(CreateTicketThunk.rejected, (state, action) => {
			state.isLoading = false
			ServerErrors("Couldn't create ticket.", action.error)
		})
	},
})

export const {} = ticketSlice.actions
export const getTicketState = (state: AppState) => state?.tickets
export default ticketSlice

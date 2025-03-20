import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { HYDRATE } from "next-redux-wrapper"
import { CreateEventFormData, EventInterface, EventSliceState, RequestParams, UserInterface } from "@Jetzy/types"
import { ServerErrors, Success } from "@Jetzy/lib/_toaster"
import { AppState } from "../stores"
import { CreateEventApis, DeleteEventApis, DeleteTicketApis, FetchEventApis, ListEventsApis, UpdateTicketApis } from "@Jetzy/services/events/eventsapis"
import { UpdateEventApis } from "../../services/events/eventsapis"

export const CreateEventThunk = createAsyncThunk("event/createEvent", async (params: RequestParams<{ payload: string }>, thunkApi) => {
	const res = await CreateEventApis(params)
	if (res?.status) {
		thunkApi.dispatch(ListEventsThunk())
	}
	return res
})

export const ListEventsThunk = createAsyncThunk("event/listEvents", async () => {
	return await ListEventsApis()
})

export const FetchEventThunk = createAsyncThunk("event/fetchEvent", async (params: RequestParams) => {
	return await FetchEventApis(params)
})

export const UpdateEventThunk = createAsyncThunk("event/updateEvent", async (params: RequestParams<{ payload: string }>) => {
	return await UpdateEventApis(params)
})

export const DeleteEventThunk = createAsyncThunk("event/deleteEvent", async (params: RequestParams, thunkApi) => {
	const res = await DeleteEventApis(params)
	if (res?.status) thunkApi.dispatch(ListEventsThunk())

	return res
})

export const DeleteTicketThunk = createAsyncThunk("event/deleteTicket", async (params: RequestParams<{ eventId: string; ticketId: string }>) => {
	return await DeleteTicketApis(params)
})

export const UpdateTicketThunk = createAsyncThunk(
	"event/updateTicket",
	async (params: RequestParams<{ payload: { title: string; description: string }; params: { eventId: string; ticketId: string } }>) => {
		return await UpdateTicketApis(params)
	},
)

// Initial state
const initialState: EventSliceState<EventInterface> = {
	isLoading: false,
	data: undefined,
}

// Actual Slice
export const eventSlice = createSlice({
	name: "events",
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
		builder.addCase(CreateEventThunk.pending, (state) => {
			state.isLoading = true
		})

		builder.addCase(CreateEventThunk.fulfilled, (state, action) => {
			state.isLoading = false
			state.data = action.payload?.data

			if (action?.payload?.status) {
				Success("Event created", "Event created successfully.")
			}
		})
		builder.addCase(CreateEventThunk.rejected, (state, action) => {
			state.isLoading = false

			ServerErrors("Failed to create event.", action?.error)
		})

		// --------------------- [Fetch Events ] ---------------------

		builder.addCase(ListEventsThunk.pending, (state) => {
			state.isFetching = true
		})

		builder.addCase(ListEventsThunk.fulfilled, (state, action) => {
			state.isFetching = false
			state.dataList = action.payload?.data
		})

		builder.addCase(ListEventsThunk.rejected, (state, action) => {
			state.isFetching = false

			//   ServerErrors("Failed to fetch events.", action?.error)
		})

		// --------------------- [Fetch Event ] ---------------------

		builder.addCase(FetchEventThunk.pending, (state) => {
			state.isFetching = true
		})

		builder.addCase(FetchEventThunk.fulfilled, (state, action) => {
			state.isFetching = false
			state.data = action.payload?.data
		})

		builder.addCase(FetchEventThunk.rejected, (state, action) => {
			state.isFetching = false

			ServerErrors("Failed to fetch event.", action?.error)
		})

		// --------------------- [Update Event ] ---------------------

		builder.addCase(UpdateEventThunk.pending, (state) => {
			state.isLoading = true
		})

		builder.addCase(UpdateEventThunk.fulfilled, (state, action) => {
			state.isLoading = false
			state.data = action.payload?.data

			if (action?.payload?.status) {
				Success("Event updated", "Event updated successfully.")
			}
		})

		builder.addCase(UpdateEventThunk.rejected, (state, action) => {
			state.isLoading = false

			ServerErrors("Failed to update event.", action?.error)
		})

		// --------------------- [Delete Event ] ---------------------

		builder.addCase(DeleteEventThunk.pending, (state) => {
			state.isLoading = true
		})

		builder.addCase(DeleteEventThunk.fulfilled, (state, action) => {
			state.isLoading = false
			state.data = action.payload?.data

			if (action?.payload?.status) {
				Success("Event deleted", "Event deleted successfully.")
			}
		})

		builder.addCase(DeleteEventThunk.rejected, (state, action) => {
			state.isLoading = false

			ServerErrors("Failed to delete event.", action?.error)
		})

		// --------------------- [Delete Ticket ] ---------------------

		builder.addCase(DeleteTicketThunk.pending, (state) => {
			state.isLoading = true
		})

		builder.addCase(DeleteTicketThunk.fulfilled, (state, action) => {
			state.isLoading = false
			state.data = action.payload?.data

			if (action?.payload?.status) {
				Success("Ticket deleted", "Ticket deleted successfully.")
			}
		})

		builder.addCase(DeleteTicketThunk.rejected, (state, action) => {
			state.isLoading = false

			ServerErrors("Failed to delete ticket.", action?.error)
		})

		// --------------------- [Update Ticket ] ---------------------

		builder.addCase(UpdateTicketThunk.pending, (state) => {
			state.isLoading = true
		})

		builder.addCase(UpdateTicketThunk.fulfilled, (state, action) => {
			state.isLoading = false
			state.data = action.payload?.data

			if (action?.payload?.status) {
				Success("Ticket updated", "Ticket updated successfully.")
			}
		})

		builder.addCase(UpdateTicketThunk.rejected, (state, action) => {
			state.isLoading = false

			ServerErrors("Failed to update ticket.", action?.error)
		})
	},
})

export const {} = eventSlice.actions
export const getEventState = (state: AppState) => state?.events
export default eventSlice

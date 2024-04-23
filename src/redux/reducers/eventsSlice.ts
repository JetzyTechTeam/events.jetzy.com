import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { HYDRATE } from "next-redux-wrapper"
import { CreateEventFormData, EventInterface, EventSliceState, RequestParams, UserInterface } from "@Jetzy/types"
import { ServerErrors, Success } from "@Jetzy/lib/_toaster"
import { AppState } from "../stores"
import { CreateEventApis } from "@Jetzy/services/events/eventsapis"

export const CreateEventThunk = createAsyncThunk("event/createEvent", async (params: RequestParams<CreateEventFormData>) => {
  return await CreateEventApis(params)
})

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
        Success("Event created successfully.")
      }
    })
    builder.addCase(CreateEventThunk.rejected, (state, action) => {
      state.isLoading = false

      ServerErrors("Failed to create event.", action?.error)
    })
  },
})

export const {} = eventSlice.actions
export const getEventState = (state: AppState) => state?.events
export default eventSlice

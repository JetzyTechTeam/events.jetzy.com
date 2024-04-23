import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { HYDRATE } from "next-redux-wrapper"
import { CreateEventFormData, EventInterface, EventSliceState, RequestParams, UserInterface } from "@Jetzy/types"
import { ServerErrors, Success } from "@Jetzy/lib/_toaster"
import { AppState } from "../stores"
import { CreateEventApis, FetchEventApis, ListEventsApis } from "@Jetzy/services/events/eventsapis"

export const CreateEventThunk = createAsyncThunk("event/createEvent", async (params: RequestParams<CreateEventFormData>, thunkApi) => {
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
  },
})

export const {} = eventSlice.actions
export const getEventState = (state: AppState) => state?.events
export default eventSlice

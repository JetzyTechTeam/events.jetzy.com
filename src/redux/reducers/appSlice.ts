import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { HYDRATE } from "next-redux-wrapper"
import { AppState } from "../stores"
import { AppSliceState } from "@Jetzy/types"

// Initial state
const initialState: AppSliceState = {
  isActive: false,
  user: null,
}

// Actual Slice
export const appSlice = createSlice({
  name: "app",
  initialState,
  reducers: {
    // Action to set the authentication status
    setAuthUser(state, action) {
      state.user = action?.payload
    },

    LOGIN(state, action) {
      state.isActive = true

      state.user = action?.payload?.user

      // save user session in local storage
      sessionStorage?.setItem("api_token", action?.payload?.accessToken)
      sessionStorage?.setItem("user", JSON.stringify(action?.payload?.user))
    },

    destroySession(state, action) {
      state.isActive = false

      sessionStorage?.clear()
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

  extraReducers(builder) {},
})

export const { setAuthUser, destroySession, LOGIN } = appSlice.actions

export const getAuthUser = (state: AppState) => state?.app?.user
export const isActive = (state: AppState) => state?.app?.isActive
export const getAppState = (state: AppState) => state?.app

export default appSlice

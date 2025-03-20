import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { HYDRATE } from "next-redux-wrapper"
import { AuthSliceState, RequestParams, SignUpFormData, UserInterface } from "@Jetzy/types"
import { CreateAccountApi } from "@Jetzy/services/auth/authapis"
import { ServerErrors, Success } from "@Jetzy/lib/_toaster"
import { AppState } from "../stores"

export const CreateUserAccountThunk = createAsyncThunk("auth/createUserAccount", async (params: RequestParams<SignUpFormData>) => {
  return await CreateAccountApi(params)
})

// Initial state
const initialState: AuthSliceState<UserInterface> = {
  isLoading: false,
  data: undefined,
}

// Actual Slice
export const authSlice = createSlice({
  name: "auth",
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
    builder.addCase(CreateUserAccountThunk.pending, (state) => {
      state.isLoading = true
    })

    builder.addCase(CreateUserAccountThunk.fulfilled, (state, action) => {
      state.isLoading = false
      state.data = action.payload?.data

      if (action?.payload?.status) {
        Success("User account created successfully.")
      }
    })
    builder.addCase(CreateUserAccountThunk.rejected, (state, action) => {
      state.isLoading = false

      ServerErrors("Failed to create user account.", action?.error)
    })
  },
})

export const {} = authSlice.actions
export const getAuthState = (state: AppState) => state?.auth
export default authSlice

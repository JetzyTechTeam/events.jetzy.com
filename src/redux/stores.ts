import { configureStore, ThunkAction, Action } from "@reduxjs/toolkit"
import { createWrapper } from "next-redux-wrapper"
import appSlice from "./reducers/appSlice"
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux"
import authSlice from "./reducers/authSlice"
import eventSlice from "./reducers/eventsSlice"
import ticketSlice from "./reducers/ticketsSlice"

const makeStore = () =>
  configureStore({
    reducer: {
      [appSlice?.name]: appSlice.reducer,
      [authSlice?.name]: authSlice.reducer,
      [eventSlice?.name]: eventSlice.reducer,
      [ticketSlice?.name]: ticketSlice.reducer,
    },
    devTools: true,
  })
export type AppStore = ReturnType<typeof makeStore>
export type AppState = ReturnType<AppStore["getState"]>
export type AppThunk<ReturnType = void> = ThunkAction<ReturnType, AppState, unknown, Action>

export const ReduxStore = makeStore()

export type AppDispatch = typeof ReduxStore.dispatch
export const useAppDispatch: () => AppDispatch = useDispatch
export const useAppSelector: TypedUseSelectorHook<AppState> = useSelector

export const wrapper = createWrapper<AppStore>(makeStore)
export default wrapper

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

export interface AuthSliceState<T = any> extends RequestState<T> {}

export interface EventSliceState<T = any> extends RequestState<T> {}
export interface TicketSliceState<T = any> extends RequestState<T> {
  ticket?: CreateTicketInterfaceResponse
}

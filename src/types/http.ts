import { AxiosResponse } from "axios"

export interface RequestParams<D = undefined> {
  id?: string
  param?: string
  data?: D
  pager?: {
    perPage: string | number
    page: string | number
  }
}

export interface ServerResponse<T = any, D = any> extends AxiosResponse<T, D> {
  message: string
}

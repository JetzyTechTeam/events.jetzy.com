import { GET, POST } from "@Jetzy/configs/api"
import { CreateEventFormData, EventInterface, RequestParams, ServerResponse } from "@Jetzy/types"
import { eventEndPoints } from "./eventsendpoints"

export const CreateEventApis = async (params: RequestParams<CreateEventFormData>): Promise<ServerResponse<EventInterface, any>> => {
  return await POST(eventEndPoints.create, params?.data)
}

export const ListEventsApis = async (): Promise<ServerResponse<EventInterface[], any>> => {
  return await GET(eventEndPoints.list)
}

export const FetchEventApis = async (params: RequestParams): Promise<ServerResponse<EventInterface, any>> => {
  return await GET(eventEndPoints.fetch.replace(":slug", params?.id as string))
}

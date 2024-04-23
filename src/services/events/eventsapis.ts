import { POST } from "@Jetzy/configs/api"
import { CreateEventFormData, EventInterface, RequestParams, ServerResponse } from "@Jetzy/types"
import { eventEndPoints } from "./eventsendpoints"

export const CreateEventApis = async (params: RequestParams<CreateEventFormData>): Promise<ServerResponse<EventInterface, any>> => {
  return await POST(eventEndPoints.create, params?.data)
}

import { DROP, GET, POST, PUT } from "@Jetzy/configs/api"
import { CreateTicketFormData, CreateTicketInterfaceResponse, EventInterface, RequestParams, ServerResponse } from "@Jetzy/types"
import { ticketsEndPoints } from "./ticketsendpoints"

export const CreateTicketApi = async (params: RequestParams<CreateTicketFormData>): Promise<ServerResponse<CreateTicketInterfaceResponse, any>> => {
  return await POST(ticketsEndPoints.create, params?.data)
}

import { DROP, GET, POST, PUT } from "@Jetzy/configs/api"
import { CreateEventFormData, EventInterface, RequestParams, ServerResponse } from "@Jetzy/types"
import { eventEndPoints } from "./eventsendpoints"

export const CreateEventApis = async (params: RequestParams<{ payload: string }>): Promise<ServerResponse<EventInterface, any>> => {
	return await POST(eventEndPoints.create, params?.data)
}

export const ListEventsApis = async (params: { lat?: number; long?: number } = {}): Promise<ServerResponse<EventInterface[], any>> => {
	// If coordinates are provided, we use the external V2 API (Mobile Flow)
	if (params?.lat && params?.long) {
		console.log('📍 [API] Switching to External V2 Events API for location:', params.lat, params.long);
		return await GET("external:/v2/events", { params })
	}
	// Default flow (Local Database)
	return await GET(eventEndPoints.list)
}


export const FetchEventApis = async (params: RequestParams): Promise<ServerResponse<EventInterface, any>> => {
	return await GET(eventEndPoints.fetch.replace(":slug", params?.id as string))
}

export const DeleteEventApis = async (params: RequestParams): Promise<ServerResponse<EventInterface, any>> => {
	return await DROP(eventEndPoints.delete.replace(":eventId", params?.id as string))
}

export const UpdateEventApis = async (params: RequestParams<{ payload: string }>): Promise<ServerResponse<EventInterface, any>> => {
	return await PUT(eventEndPoints.update.replace(":eventId", params?.id as string), params?.data)
}

// Autosave the in-progress edit of a published event into its shadow draft ("draft 2")
export const SaveDraftRevisionApis = async (params: RequestParams<{ payload: string }>): Promise<ServerResponse<any, any>> => {
	return await POST(eventEndPoints.draftRevision.replace(":eventId", params?.id as string), params?.data)
}

// Discard the shadow draft and revert to the live published event
export const DiscardDraftRevisionApis = async (params: RequestParams): Promise<ServerResponse<any, any>> => {
	return await DROP(eventEndPoints.draftRevision.replace(":eventId", params?.id as string))
}

export const DeleteTicketApis = async (params: RequestParams<{ eventId: string; ticketId: string }>): Promise<ServerResponse<EventInterface, any>> => {
	return await DROP(eventEndPoints.tickets.delete.replace(":eventId", params?.data?.eventId as string).replace(":ticketId", params?.data?.ticketId as string))
}

export const UpdateTicketApis = async (
	params: RequestParams<{ payload: { title: string; description: string }; params: { eventId: string; ticketId: string } }>,
): Promise<ServerResponse<EventInterface, any>> => {
	return await PUT(eventEndPoints.tickets.update.replace(":eventId", params?.data?.params.eventId as string).replace(":ticketId", params?.data?.params.ticketId as string), params?.data?.payload)
}

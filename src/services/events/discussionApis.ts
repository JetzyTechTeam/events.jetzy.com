import { DROP, GET, POST, PUT } from "@Jetzy/configs/api"
import { RequestParams, ServerResponse } from "@Jetzy/types"
import { discussionEndpoints } from "./discussionEndpoints"
import type {
	CreateDiscussionPostData,
	UpdateDiscussionPostData,
	CreateDiscussionCommentData,
	ReplyToCommentData,
	DiscussionPostWithAuthor,
	DiscussionCommentWithAuthor,
} from "@Jetzy/types/discussion"

// ========== DISCUSSION POSTS ==========

export const CreateDiscussionPostApi = async (params: RequestParams<CreateDiscussionPostData>): Promise<ServerResponse<DiscussionPostWithAuthor, any>> => {
	return await POST(discussionEndpoints.posts.create, params?.data, {
		headers: {
			"Content-Type": "application/json"
		}
	})
}

export const ListDiscussionPostsApi = async (params: RequestParams<{ eventId: string; sort?: string; tags?: string; page?: number; limit?: number; search?: string }>): Promise<ServerResponse<any, any>> => {
	const queryParams = new URLSearchParams()
	if (params?.data?.eventId) queryParams.append("eventId", params.data.eventId)
	if (params?.data?.sort) queryParams.append("sort", params.data.sort)
	if (params?.data?.tags) queryParams.append("tags", params.data.tags)
	if (params?.data?.page) queryParams.append("page", params.data.page.toString())
	if (params?.data?.limit) queryParams.append("limit", params.data.limit.toString())
	if (params?.data?.search) queryParams.append("search", params.data.search)

	return await GET(`${discussionEndpoints.posts.list}?${queryParams.toString()}`)
}

export const GetDiscussionPostApi = async (params: RequestParams<{ postId: string }>): Promise<ServerResponse<DiscussionPostWithAuthor, any>> => {
	return await GET(`${discussionEndpoints.posts.get}?postId=${params?.data?.postId}`)
}

export const UpdateDiscussionPostApi = async (params: RequestParams<UpdateDiscussionPostData>): Promise<ServerResponse<DiscussionPostWithAuthor, any>> => {
	return await PUT(discussionEndpoints.posts.update, params?.data, {
		headers: {
			"Content-Type": "application/json"
		}
	})
}

export const DeleteDiscussionPostApi = async (params: RequestParams<{ postId: string }>): Promise<ServerResponse<any, any>> => {
	return await DROP(`${discussionEndpoints.posts.delete}?postId=${params?.data?.postId}`)
}

export const PinDiscussionPostApi = async (params: RequestParams<{ postId: string; isPinned: boolean }>): Promise<ServerResponse<DiscussionPostWithAuthor, any>> => {
	return await POST(discussionEndpoints.posts.pin, params?.data)
}

export const LockDiscussionPostApi = async (params: RequestParams<{ postId: string; isLocked: boolean }>): Promise<ServerResponse<DiscussionPostWithAuthor, any>> => {
	return await POST(discussionEndpoints.posts.lock, params?.data)
}

export const ReactToDiscussionPostApi = async (params: RequestParams<{ postId: string; reactionType: "like" | "helpful" }>): Promise<ServerResponse<DiscussionPostWithAuthor, any>> => {
	return await POST(discussionEndpoints.posts.react, params?.data)
}

// ========== DISCUSSION COMMENTS ==========

export const CreateDiscussionCommentApi = async (params: RequestParams<CreateDiscussionCommentData>): Promise<ServerResponse<DiscussionCommentWithAuthor, any>> => {
	return await POST(discussionEndpoints.comments.create, params?.data, {
		headers: {
			"Content-Type": "application/json"
		}
	})
}

export const GetDiscussionCommentsApi = async (params: RequestParams<{ postId: string }>): Promise<ServerResponse<DiscussionCommentWithAuthor[], any>> => {
	return await GET(`${discussionEndpoints.comments.get}?postId=${params?.data?.postId}`)
}

export const ReplyToDiscussionCommentApi = async (params: RequestParams<ReplyToCommentData>): Promise<ServerResponse<DiscussionCommentWithAuthor, any>> => {
	return await POST(discussionEndpoints.comments.reply, params?.data)
}

export const EditDiscussionCommentApi = async (params: RequestParams<{ commentId: string; newComment: string; images?: string[] }>): Promise<ServerResponse<DiscussionCommentWithAuthor, any>> => {
	return await PUT(discussionEndpoints.comments.edit, params?.data, {
		headers: {
			"Content-Type": "application/json"
		}
	})
}

export const DeleteDiscussionCommentApi = async (params: RequestParams<{ commentId: string }>): Promise<ServerResponse<any, any>> => {
	return await DROP(`${discussionEndpoints.comments.delete}?commentId=${params?.data?.commentId}`)
}

export const ReactToDiscussionCommentApi = async (params: RequestParams<{ commentId: string }>): Promise<ServerResponse<DiscussionCommentWithAuthor, any>> => {
	return await POST(discussionEndpoints.comments.react, params?.data)
}

// ========== TICKET CHECK ==========

export const CheckEventTicketApi = async (params: RequestParams<{ eventId: string }>): Promise<ServerResponse<{ hasTicket: boolean; isAuthenticated: boolean; bookingId?: string | null }, any>> => {
	return await GET(`/api/events/${params?.data?.eventId}/check-ticket`)
}

// ========== REACTIONS & VIEWS ==========

export const GetPostReactionsApi = async (params: RequestParams<{ postId: string; reactionType: "like" | "helpful" }>): Promise<ServerResponse<any[], any>> => {
	return await GET(`${discussionEndpoints.posts.whoReacted}?postId=${params?.data?.postId}&reactionType=${params?.data?.reactionType}`)
}

export const GetCommentReactionsApi = async (params: RequestParams<{ commentId: string }>): Promise<ServerResponse<any[], any>> => {
	return await GET(`${discussionEndpoints.comments.whoReacted}?commentId=${params?.data?.commentId}`)
}

export const GetPostViewersApi = async (params: RequestParams<{ postId: string }>): Promise<ServerResponse<any[], any>> => {
	return await GET(`${discussionEndpoints.posts.whoViewed}?postId=${params?.data?.postId}`)
}


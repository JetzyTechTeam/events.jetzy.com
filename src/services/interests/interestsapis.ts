import { GET, POST, PUT, DROP } from "@Jetzy/configs/api"
import { RequestParams, ServerResponse } from "@Jetzy/types"
import { interestEndPoints } from "./interestsendpoints"

export const CreateInterestGroupApi = async (params: RequestParams<any>): Promise<ServerResponse<any, any>> => {
    return await POST(interestEndPoints.create, params.data)
}

export const ListInterestsApi = async (params?: RequestParams<{ page?: number; limit?: number; type?: string; search?: string; category?: string; membershipStatus?: string }>): Promise<ServerResponse<any, any>> => {
    let url = interestEndPoints.list + "?"
    if (params?.data) {
        const q = new URLSearchParams(params.data as any).toString()
        url += q
    }
    return await GET(url)
}

export const GetInterestDetailsApi = async (params: RequestParams<{ interestId: string; includeMembers?: boolean; includeActivity?: boolean }>): Promise<ServerResponse<any, any>> => {
    let url = interestEndPoints.details.replace(":interestId", params.data?.interestId as string)
    const query: any = {}
    if (params.data?.includeMembers) query.includeMembers = params.data.includeMembers
    if (params.data?.includeActivity) query.includeActivity = params.data.includeActivity

    if (Object.keys(query).length > 0) {
        url += "?" + new URLSearchParams(query).toString()
    }

    return await GET(url)
}

export const UpdateInterestGroupApi = async (params: RequestParams<{ interestId: string; data: any }>): Promise<ServerResponse<any, any>> => {
    return await PUT(interestEndPoints.update.replace(":interestId", params.data?.interestId as string), params.data?.data)
}

export const HideInterestGroupApi = async (params: RequestParams<{ interestId: string }>): Promise<ServerResponse<any, any>> => {
    return await POST(interestEndPoints.hide.replace(":interestId", params.data?.interestId as string), {})
}

export const UnhideInterestGroupApi = async (params: RequestParams<{ interestId: string }>): Promise<ServerResponse<any, any>> => {
    return await DROP(interestEndPoints.hide.replace(":interestId", params.data?.interestId as string))
}

export const DeleteInterestGroupApi = async (params: RequestParams<{ interestId: string }>): Promise<ServerResponse<any, any>> => {
    return await DROP(interestEndPoints.delete.replace(":interestId", params.data?.interestId as string))
}

export const JoinInterestApi = async (params: RequestParams<{ interestId: string }>): Promise<ServerResponse<any, any>> => {
    return await POST(interestEndPoints.join.replace(":interestId", params.data?.interestId as string), {})
}

export const InvitationResponseApi = async (params: RequestParams<{ interestId: string; action: 'accept' | 'reject' }>): Promise<ServerResponse<any, any>> => {
    const url = interestEndPoints.invitationAction
        .replace(":interestId", params.data?.interestId as string)
        .replace(":action", params.data?.action as string)
    return await POST(url, {})
}

export const GetInterestMembersApi = async (params: RequestParams<{ interestId: string; page?: number; limit?: number; role?: string; search?: string }>): Promise<ServerResponse<any, any>> => {
    let url = interestEndPoints.members.replace(":interestId", params.data?.interestId as string) + "?"
    if (params.data) {
        const { interestId, ...rest } = params.data
        const q = new URLSearchParams(rest as any).toString()
        url += q
    }
    return await GET(url)
}

export const InviteMembersApi = async (params: RequestParams<{ interestId: string; userId?: string; users?: string[]; message?: string }>): Promise<ServerResponse<any, any>> => {
    const body: any = { message: params.data?.message }
    if (params.data?.userId) body.userId = params.data.userId
    if (params.data?.users) body.users = params.data.users
    return await POST(interestEndPoints.invite.replace(":interestId", params.data?.interestId as string), body)
}

export const RemoveMemberApi = async (params: RequestParams<{ interestId: string; users: string[] }>): Promise<ServerResponse<any, any>> => {
    return await POST(interestEndPoints.removeMember.replace(":interestId", params.data?.interestId as string), { users: params.data?.users })
}

export const GetUsersToInviteApi = async (params: RequestParams<{ interestId: string; query?: string; page?: number; perPage?: number }>): Promise<ServerResponse<any, any>> => {
    let url = interestEndPoints.listUsersToInvite.replace(":interestId", params.data?.interestId as string) + "?"
    const { interestId, ...rest } = params.data || {}
    const q = new URLSearchParams(rest as any).toString()
    url += q
    return await GET(url)
}

export const GetJoinRequestsApi = async (params: RequestParams<{ interestId: string }>): Promise<ServerResponse<any, any>> => {
    return await GET(interestEndPoints.requests.replace(":interestId", params.data?.interestId as string))
}

export const JoinRequestActionApi = async (params: RequestParams<{ interestId: string; userId: string; action: 'accept' | 'reject' }>): Promise<ServerResponse<any, any>> => {
    const url = interestEndPoints.requestAction
        .replace(":interestId", params.data?.interestId as string)
        .replace(":userId", params.data?.userId as string)
    return await POST(url, { action: params.data?.action })
}

export const GetInterestFeedApi = async (params: RequestParams<{ interestId: string; page?: number; perPage?: number; sort?: string; ts?: number }>): Promise<ServerResponse<any, any>> => {
    let url = interestEndPoints.feed.replace(":interestId", params.data?.interestId as string) + "?"
    const { interestId, ...rest } = params.data || {}
    const q = new URLSearchParams(rest as any).toString()
    url += q
    return await GET(url)
}

export const CreatePostApi = async (params: RequestParams<{ content: string; description?: string; media?: any[]; interest?: string[]; interestIds?: string[]; privacy?: string; tags?: string[]; location?: any }>): Promise<ServerResponse<any, any>> => {
    return await POST(interestEndPoints.createPost, params.data)
}

export const DeletePostApi = async (params: RequestParams<{ postId: string }>): Promise<ServerResponse<any, any>> => {
    return await DROP(interestEndPoints.deletePost.replace(":postId", params.data?.postId as string))
}

export const LikePostApi = async (params: RequestParams<{ postId: string; reactionType: string }>): Promise<ServerResponse<any, any>> => {
    return await POST(interestEndPoints.likePost.replace(":postId", params.data?.postId as string), { reactionType: params.data?.reactionType })
}

export const GetPostCommentsApi = async (params: RequestParams<{ postId: string; page?: number; perPage?: number; limit?: number; sortBy?: string; includeReplies?: boolean; maxDepth?: number }>): Promise<ServerResponse<any, any>> => {
    let url = interestEndPoints.getPostComments.replace(":postId", params.data?.postId as string) + "?"
    const { postId, ...rest } = params.data || {}
    const q = new URLSearchParams(rest as any).toString()
    url += q
    return await GET(url)
}

export const CreateCommentApi = async (params: RequestParams<{ postId: string; content: string; image?: string }>): Promise<ServerResponse<any, any>> => {
    return await POST(interestEndPoints.createComment.replace(":postId", params.data?.postId as string), {
        content: params.data?.content,
        image: params.data?.image
    })
}

export const DeleteCommentApi = async (params: RequestParams<{ commentId: string }>): Promise<ServerResponse<any, any>> => {
    return await DROP(interestEndPoints.deleteComment.replace(":commentId", params.data?.commentId as string))
}


export const ReactToCommentApi = async (params: RequestParams<{ commentId: string; type: string }>): Promise<ServerResponse<any, any>> => {
    return await POST(interestEndPoints.reactToComment, params.data)
}

export const GetCommentReactionsApi = async (params: RequestParams<{ commentId: string; page?: number; perPage?: number }>): Promise<ServerResponse<any, any>> => {
    let url = interestEndPoints.getCommentReactions + "?"
    if (params.data) {
        const q = new URLSearchParams(params.data as any).toString()
        url += q
    }
    return await GET(url)
}

export const UpdateCommentApi = async (params: RequestParams<{ commentId: string; content: string }>): Promise<ServerResponse<any, any>> => {
    return await PUT(interestEndPoints.updateComment, params.data)
}

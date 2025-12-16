export type DiscussionSortType = "recent" | "popular" | "trending" | "oldest"

export type ReactionType = "like" | "helpful"

export interface CreateDiscussionPostData {
	eventId: string
	title: string
	content: string
	images?: string[]
	tags?: string[]
}

export interface UpdateDiscussionPostData {
	postId: string
	title?: string
	content?: string
	images?: string[]
	tags?: string[]
}

export interface CreateDiscussionCommentData {
	discussionPostId: string
	comment: string
	images?: string[]
}

export interface ReplyToCommentData {
	commentId: string
	reply: string
	images?: string[]
}

export interface DiscussionPostWithAuthor {
	_id: string
	eventId: string
	userId: {
		_id: string
		firstName: string
		lastName: string
		email: string
	}
	title: string
	content: string
	images?: string[]
	attachments?: string[]
	isPinned: boolean
	isLocked: boolean
	tags?: string[]
	reactions: {
		likes: string[]
		helpful: string[]
	}
	viewCount: number
	commentCount: number
	lastActivityAt: Date
	createdAt: Date
	updatedAt: Date
}

export interface DiscussionCommentWithAuthor {
	_id: string
	eventId: string
	discussionPostId: string
	userId: {
		_id: string
		firstName: string
		lastName: string
		email: string
	}
	comment: string
	parentCommentId?: string | null
	images?: string[]
	reactions: {
		likes: string[]
	}
	isEdited: boolean
	editedAt?: Date
	isDeleted: boolean
	createdAt: Date
	updatedAt: Date
}

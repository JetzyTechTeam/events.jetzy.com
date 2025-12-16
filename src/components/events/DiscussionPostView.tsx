import React, { useState, useMemo } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useSession } from "next-auth/react"
import {
	Box,
	Button,
	Flex,
	Heading,
	Text,
	Badge,
	Icon,
	Stack,
	Textarea,
	useToast,
	IconButton,
	Menu,
	MenuButton,
	MenuList,
	MenuItem,
	Spinner as ChakraSpinner,
	Divider,
	SimpleGrid,
} from "@chakra-ui/react"
import Image from "next/image"
import {
	FiThumbsUp,
	FiMessageCircle,
	FiEye,
	FiClock,
	FiMoreVertical,
	FiEdit,
	FiTrash2,
	FiLock,
	FiUnlock,
	FiMoreHorizontal,
	FiShare2,
	FiSend,
} from "react-icons/fi"
import { BsPinAngle, BsPinAngleFill } from "react-icons/bs"
import { AiFillBulb, AiOutlineBulb } from "react-icons/ai"
import { Avatar, Input } from "@chakra-ui/react"
import {
	GetDiscussionPostApi,
	GetDiscussionCommentsApi,
	ReactToDiscussionPostApi,
	PinDiscussionPostApi,
	LockDiscussionPostApi,
	DeleteDiscussionPostApi,
	CreateDiscussionCommentApi,
	ReplyToDiscussionCommentApi,
	EditDiscussionCommentApi,
	DeleteDiscussionCommentApi,
	ReactToDiscussionCommentApi,
} from "@/services/events/discussionApis"
import type { DiscussionPostWithAuthor, DiscussionCommentWithAuthor } from "@/types/discussion"
import { useRouter } from "next/router"

interface DiscussionPostViewProps {
	postId: string
	eventId: string
	isModalView?: boolean
}

interface CommentItemProps {
	comment: DiscussionCommentWithAuthor
	groupedComments: Record<string, DiscussionCommentWithAuthor[]>
	currentUserId: string | undefined
	onReply: (commentId: string, text: string) => void
	onEdit: (commentId: string, text: string) => void
	onDelete: (commentId: string) => void
	onReact: (commentId: string) => void
	isLocked: boolean
}

const CommentItem: React.FC<CommentItemProps> = ({ comment, groupedComments, currentUserId, onReply, onEdit, onDelete, onReact, isLocked }) => {
	const [replyText, setReplyText] = useState("")
	const [editText, setEditText] = useState(comment.comment)
	const [showReply, setShowReply] = useState(false)
	const [isEditing, setIsEditing] = useState(false)
	const { data: session } = useSession()

	const isAuthor = currentUserId === comment.userId._id
	const hasLiked = comment.reactions.likes.includes(currentUserId || "")

	const handleReplySubmit = () => {
		if (replyText.trim()) {
			onReply(comment._id, replyText)
			setReplyText("")
			setShowReply(false)
		}
	}

	const handleEditSubmit = () => {
		if (editText.trim() && editText !== comment.comment) {
			onEdit(comment._id, editText)
			setIsEditing(false)
		}
	}

	if (comment.isDeleted) {
		return (
			<Box p={2} bg="#F0F2F5" borderRadius="lg" mb={2}>
				<Text color="#65676B" fontSize="sm" fontStyle="italic">
					[Comment deleted]
				</Text>
			</Box>
		)
	}

	return (
		<Box mb={2}>
			<Flex gap={2} align="start">
				<Avatar size="sm" name={`${comment.userId.firstName} ${comment.userId.lastName}`} src="" />
				
				<Box flex="1">
					<Box bg="#F0F2F5" borderRadius="2xl" px={3} py={2} width="fit-content" mb={1} maxW="100%">
						<Text fontWeight="600" fontSize="sm" color="#1C1E21">
							{comment.userId.firstName} {comment.userId.lastName}
						</Text>
						
						{isEditing ? (
							<Box mt={2} minW="200px">
								<Textarea
									value={editText}
									onChange={(e) => setEditText(e.target.value)}
									bg="white"
									size="sm"
									mb={2}
								/>
								<Flex gap={2}>
									<Button size="xs" colorScheme="blue" onClick={handleEditSubmit}>Save</Button>
									<Button size="xs" variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
								</Flex>
							</Box>
						) : (
							<Text color="#1C1E21" fontSize="sm" whiteSpace="pre-wrap">
								{comment.comment}
							</Text>
						)}
					</Box>

					{/* Interaction Actions */}
					<Flex gap={3} fontSize="xs" color="#65676B" fontWeight="600" px={2} mb={2} align="center">
						<Text 
							cursor="pointer" 
							_hover={{ textDecoration: "underline" }} 
							color={hasLiked ? "#1877F2" : "inherit"}
							onClick={() => onReact(comment._id)}
						>
							Like
						</Text>
						{!isLocked && (
							<Text cursor="pointer" _hover={{ textDecoration: "underline" }} onClick={() => setShowReply(!showReply)}>
								Reply
							</Text>
						)}
						<Text fontWeight="normal" color="#65676B">
							{new Date(comment.createdAt).toLocaleDateString(undefined, { hour: '2-digit', minute: '2-digit' })}
						</Text>
						{comment.reactions.likes.length > 0 && (
							<Flex align="center" gap={1} ml={1}>
								<Box bg="#1877F2" borderRadius="full" p="2px">
									<Icon as={FiThumbsUp} color="white" boxSize="8px" />
								</Box>
								<Text color="#65676B">{comment.reactions.likes.length}</Text>
							</Flex>
						)}
					</Flex>

					{showReply && !isLocked && (
						<Flex gap={2} mb={3} align="center">
							<Avatar size="xs" src={session?.user?.image || ""} name={session?.user?.name || "User"} />
							<Input
								placeholder="Write a reply..."
								value={replyText}
								onChange={(e) => setReplyText(e.target.value)}
								size="sm"
								borderRadius="full"
								bg="#F0F2F5"
								border="none"
								_focus={{ bg: "#E4E6EB", boxShadow: "none" }}
								onKeyPress={(e) => e.key === 'Enter' && handleReplySubmit()}
							/>
						</Flex>
					)}
				</Box>

				{isAuthor && (
					<Menu>
						<MenuButton as={IconButton} icon={<FiMoreHorizontal />} size="xs" variant="ghost" borderRadius="full" />
						<MenuList>
							<MenuItem icon={<FiEdit />} onClick={() => setIsEditing(true)}>Edit</MenuItem>
							<MenuItem icon={<FiTrash2 />} color="red.500" onClick={() => onDelete(comment._id)}>Delete</MenuItem>
						</MenuList>
					</Menu>
				)}
			</Flex>

			{/* Nested Replies */}
			{groupedComments[comment._id]?.length > 0 && (
				<Box pl={10} mt={1}>
					<Stack spacing={2}>
						{groupedComments[comment._id].map((reply) => (
							<CommentItem
								key={reply._id}
								comment={reply}
								groupedComments={groupedComments}
								currentUserId={currentUserId}
								onReply={onReply}
								onEdit={onEdit}
								onDelete={onDelete}
								onReact={onReact}
								isLocked={isLocked}
							/>
						))}
					</Stack>
				</Box>
			)}
		</Box>
	)
}

const DiscussionPostView: React.FC<DiscussionPostViewProps> = ({ postId, eventId, isModalView = false }) => {
	const { data: session } = useSession()
	const router = useRouter()
	const toast = useToast()
	const [newComment, setNewComment] = useState("")

	const currentUserId = (session?.user as any)?._id

	// Fetch post
	const { data: postResponse, isLoading: isLoadingPost, refetch: refetchPost } = useQuery({
		queryKey: ["discussionPost", postId],
		queryFn: async () => await GetDiscussionPostApi({ data: { postId } }),
		enabled: !!postId,
	})

	// Fetch comments
	const { data: commentsResponse, isLoading: isLoadingComments, refetch: refetchComments } = useQuery({
		queryKey: ["discussionComments", postId],
		queryFn: async () => await GetDiscussionCommentsApi({ data: { postId } }),
		enabled: !!postId,
	})

	const post: DiscussionPostWithAuthor | null = postResponse?.data || null
	const comments: DiscussionCommentWithAuthor[] = commentsResponse?.data || []

	// Group comments by parent
	const groupedComments = useMemo(() => {
		return comments.reduce((acc: Record<string, DiscussionCommentWithAuthor[]>, comment) => {
			const parentId = comment.parentCommentId || "root"
			if (!acc[parentId]) acc[parentId] = []
			acc[parentId].push(comment)
			return acc
		}, {})
	}, [comments])

	// Mutations
	const reactToPostMutation = useMutation({
		mutationFn: (reactionType: "like" | "helpful") => ReactToDiscussionPostApi({ data: { postId, reactionType } }),
		onSuccess: () => refetchPost(),
	})

	const pinPostMutation = useMutation({
		mutationFn: (isPinned: boolean) => PinDiscussionPostApi({ data: { postId, isPinned } }),
		onSuccess: () => {
			refetchPost()
			toast({ title: "Post updated", status: "success", duration: 2000 })
		},
	})

	const lockPostMutation = useMutation({
		mutationFn: (isLocked: boolean) => LockDiscussionPostApi({ data: { postId, isLocked } }),
		onSuccess: () => {
			refetchPost()
			toast({ title: "Post updated", status: "success", duration: 2000 })
		},
	})

	const deletePostMutation = useMutation({
		mutationFn: () => DeleteDiscussionPostApi({ data: { postId } }),
		onSuccess: () => {
			toast({ title: "Post deleted", status: "success", duration: 2000 })
			if (!isModalView) {
				router.push(`/console/events/${eventId}/manage`)
			}
		},
	})

	const createCommentMutation = useMutation({
		mutationFn: (comment: string) => CreateDiscussionCommentApi({ data: { discussionPostId: postId, comment } }),
		onSuccess: () => {
			refetchComments()
			refetchPost()
			setNewComment("")
			toast({ title: "Comment added", status: "success", duration: 2000 })
		},
	})

	const replyToCommentMutation = useMutation({
		mutationFn: ({ commentId, reply }: { commentId: string; reply: string }) => ReplyToDiscussionCommentApi({ data: { commentId, reply } }),
		onSuccess: () => {
			refetchComments()
			refetchPost()
			toast({ title: "Reply added", status: "success", duration: 2000 })
		},
	})

	const editCommentMutation = useMutation({
		mutationFn: ({ commentId, newComment }: { commentId: string; newComment: string }) => EditDiscussionCommentApi({ data: { commentId, newComment } }),
		onSuccess: () => {
			refetchComments()
			toast({ title: "Comment updated", status: "success", duration: 2000 })
		},
	})

	const deleteCommentMutation = useMutation({
		mutationFn: (commentId: string) => DeleteDiscussionCommentApi({ data: { commentId } }),
		onSuccess: () => {
			refetchComments()
			refetchPost()
			toast({ title: "Comment deleted", status: "success", duration: 2000 })
		},
	})

	const reactToCommentMutation = useMutation({
		mutationFn: (commentId: string) => ReactToDiscussionCommentApi({ data: { commentId } }),
		onSuccess: () => refetchComments(),
	})

	if (isLoadingPost) {
		return (
			<Flex justify="center" align="center" h="400px">
				<ChakraSpinner size="xl" color="#1877F2" />
			</Flex>
		)
	}

	if (!post) {
		return (
			<Box p={6} textAlign="center">
				<Text>Post not found</Text>
			</Box>
		)
	}

	const isAuthor = currentUserId === post.userId._id
	const hasLiked = post.reactions.likes.includes(currentUserId || "")
	const hasMarkedHelpful = post.reactions.helpful.includes(currentUserId || "")

	return (
		<Box 
			bg="white" 
			borderRadius={isModalView ? "none" : "2xl"} 
			border={isModalView ? "none" : "1px solid #E5E7EB"} 
			p={isModalView ? { base: 4, md: 6 } : { base: 4, md: 6 }}
			boxShadow={isModalView ? "none" : "sm"}
		>
			{/* Post Header */}
			<Flex justify="space-between" align="start" mb={4}>
				<Flex align="center" gap={3}>
					<Avatar name={`${post.userId.firstName} ${post.userId.lastName}`} src="" size="md" />
					<Box>
						<Heading size="md" color="#1C1E21">
							{post.userId.firstName} {post.userId.lastName}
						</Heading>
						<Flex align="center" gap={2} fontSize="sm" color="#65676B">
							<Text>{new Date(post.createdAt).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })}</Text>
							{post.isPinned && (
								<>
									<Text>·</Text>
									<Icon as={BsPinAngleFill} color="#1877F2" />
									<Text color="#1877F2" fontWeight="600">Pinned</Text>
								</>
							)}
							{post.isLocked && (
								<>
									<Text>·</Text>
									<Icon as={FiLock} color="#E41E3F" />
								</>
							)}
						</Flex>
					</Box>
				</Flex>

				{(isAuthor || currentUserId) && (
					<Menu>
						<MenuButton as={IconButton} icon={<FiMoreHorizontal />} variant="ghost" />
						<MenuList>
							<MenuItem icon={post.isPinned ? <BsPinAngle /> : <BsPinAngleFill />} onClick={() => pinPostMutation.mutate(!post.isPinned)}>
								{post.isPinned ? "Unpin" : "Pin"} Post
							</MenuItem>
							<MenuItem icon={post.isLocked ? <FiUnlock /> : <FiLock />} onClick={() => lockPostMutation.mutate(!post.isLocked)}>
								{post.isLocked ? "Unlock" : "Lock"} Discussion
							</MenuItem>
							<MenuItem icon={<FiTrash2 />} color="red.500" onClick={() => window.confirm("Delete this post?") && deletePostMutation.mutate()}>
								Delete Post
							</MenuItem>
						</MenuList>
					</Menu>
				)}
			</Flex>

		{/* Post Content */}
		<Box mb={4}>
			<Text color="#1C1E21" fontSize="md" whiteSpace="pre-wrap">
				{post.content}
			</Text>
		</Box>

		{/* Images */}
		{post.images && post.images.length > 0 && (
			<Box mb={4} borderRadius="lg" overflow="hidden">
				{post.images.length === 1 ? (
					<Box position="relative" w="full" h="500px">
						<Image 
							src={post.images[0]} 
							alt="Post image" 
							fill
							style={{ objectFit: "contain", backgroundColor: "#F0F2F5" }}
						/>
					</Box>
				) : (
					<SimpleGrid columns={post.images.length === 2 ? 2 : 2} spacing={2}>
						{post.images.map((img: string, idx: number) => (
							<Box key={idx} position="relative" w="full" h="300px">
								<Image 
									src={img} 
									alt={`Post image ${idx + 1}`} 
									fill
									style={{ objectFit: "cover" }}
								/>
							</Box>
						))}
					</SimpleGrid>
				)}
			</Box>
		)}

		{/* Tags */}
			{post.tags && post.tags.length > 0 && (
				<Flex gap={2} mb={4}>
					{post.tags.map((tag, idx) => (
						<Text key={idx} color="#1877F2" fontSize="sm" fontWeight="medium">
							#{tag}
						</Text>
					))}
				</Flex>
			)}

			{/* Engagement Stats */}
			<Flex justify="space-between" align="center" py={2} borderBottom="1px solid #CED0D4" fontSize="sm" color="#65676B">
				<Flex align="center" gap={1}>
					{post.reactions.likes.length > 0 && (
						<Flex align="center" gap={1}>
							<Box bg="#1877F2" borderRadius="full" p="2px">
								<Icon as={FiThumbsUp} color="white" boxSize="12px" />
							</Box>
							<Text>{post.reactions.likes.length}</Text>
						</Flex>
					)}
				</Flex>
				<Flex gap={3}>
					<Text>{post.commentCount} Comments</Text>
					<Text>{post.viewCount} Views</Text>
				</Flex>
			</Flex>

			{/* Action Buttons */}
			<Flex py={1} borderBottom="1px solid #CED0D4" mb={4}>
				<Button
					flex="1"
					variant="ghost"
					leftIcon={<FiThumbsUp />}
					color={hasLiked ? "#1877F2" : "#65676B"}
					fontWeight="600"
					onClick={() => reactToPostMutation.mutate("like")}
					_hover={{ bg: "#F0F2F5" }}
				>
					Like
				</Button>
				<Button
					flex="1"
					variant="ghost"
					leftIcon={<FiMessageCircle />}
					color="#65676B"
					fontWeight="600"
					_hover={{ bg: "#F0F2F5" }}
					onClick={() => document.getElementById("commentInput")?.focus()}
				>
					Comment
				</Button>
			<Button
				flex="1"
				variant="ghost"
				leftIcon={<FiShare2 />}
				color="#65676B"
				fontWeight="600"
				_hover={{ bg: "#F0F2F5" }}
				onClick={async () => {
					const postUrl = `${window.location.origin}/console/events/${eventId}/discussion/${postId}`
					try {
						if (navigator.share) {
							await navigator.share({
								title: post.title,
								text: post.content.slice(0, 100) + "...",
								url: postUrl,
							})
						} else {
							await navigator.clipboard.writeText(postUrl)
							toast({
								title: "Link copied!",
								description: "Post link has been copied to clipboard",
								status: "success",
								duration: 2000,
								isClosable: true,
							})
						}
					} catch (error) {
						toast({
							title: "Share Post",
							description: postUrl,
							status: "info",
							duration: 5000,
							isClosable: true,
						})
					}
				}}
			>
				Share
			</Button>
			</Flex>

			{/* Comments Section */}
			<Box>
				{/* New Comment Input */}
				{session && !post.isLocked && (
					<Flex gap={2} mb={4} align="flex-start">
						<Avatar size="sm" name={session.user?.name || "User"} src={session.user?.image || ""} mt={1} />
						<Box flex="1" position="relative">
							<Textarea
								id="commentInput"
								placeholder="Write a comment..."
								value={newComment}
								onChange={(e) => setNewComment(e.target.value)}
								bg="#F0F2F5"
								border="none"
								borderRadius="2xl"
								_focus={{ bg: "#F0F2F5", boxShadow: "none" }}
								minH="40px"
								py={2}
								resize="none"
								fontSize="sm"
								onKeyPress={(e) => {
									if (e.key === 'Enter' && !e.shiftKey) {
										e.preventDefault();
										if (newComment.trim()) createCommentMutation.mutate(newComment);
									}
								}}
								pr="40px"
							/>
							<IconButton
								aria-label="Send comment"
								icon={<FiSend />}
								size="sm"
								variant="ghost"
								color={newComment.trim() ? "#1877F2" : "#BEC3C9"}
								position="absolute"
								right={2}
								bottom={1.5}
								onClick={() => newComment.trim() && createCommentMutation.mutate(newComment)}
								isDisabled={!newComment.trim() || createCommentMutation.isPending}
								borderRadius="full"
								_hover={{ bg: "transparent" }}
							/>
						</Box>
					</Flex>
				)}

				{post.isLocked && (
					<Box p={3} bg="#F0F2F5" borderRadius="lg" mb={4}>
						<Flex align="center" gap={2}>
							<Icon as={FiLock} color="#65676B" />
							<Text color="#65676B" fontWeight="medium" fontSize="sm">
								This discussion is locked. No new comments can be added.
							</Text>
						</Flex>
					</Box>
				)}

				{/* Comments List */}
				{isLoadingComments ? (
					<Flex justify="center" py={8}>
						<ChakraSpinner color="#1877F2" />
					</Flex>
				) : groupedComments["root"]?.length > 0 ? (
					<Stack spacing={2}>
						{groupedComments["root"].map((comment) => (
							<CommentItem
								key={comment._id}
								comment={comment}
								groupedComments={groupedComments}
								currentUserId={currentUserId}
								onReply={(commentId, text) => replyToCommentMutation.mutate({ commentId, reply: text })}
								onEdit={(commentId, text) => editCommentMutation.mutate({ commentId, newComment: text })}
								onDelete={(commentId) => window.confirm("Delete this comment?") && deleteCommentMutation.mutate(commentId)}
								onReact={(commentId) => reactToCommentMutation.mutate(commentId)}
								isLocked={post.isLocked}
							/>
						))}
					</Stack>
				) : (
					<Box py={8} textAlign="center" color="#9CA3AF">
						<Icon as={FiMessageCircle} boxSize={10} mb={2} />
						<Text>No comments yet.</Text>
					</Box>
				)}
			</Box>
		</Box>
	)
}

export default DiscussionPostView

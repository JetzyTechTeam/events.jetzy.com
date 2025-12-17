import React, { useState, useMemo, useRef } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useSession } from "next-auth/react"
import { useEdgeStore } from "@/lib/edgestore"
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
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalBody,
	ModalCloseButton,
	VStack,
	HStack,
	useDisclosure,
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
	FiImage,
	FiX,
	FiSmile,
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

// Helper function to check if URL is a video
const isVideoUrl = (url: string): boolean => {
	const videoExtensions = [".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".3gp"]
	return videoExtensions.some((ext) => url.toLowerCase().includes(ext))
}

interface DiscussionPostViewProps {
	postId: string
	eventId: string
	isModalView?: boolean
	onClose?: () => void
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
							<>
								<Text color="#1C1E21" fontSize="sm" whiteSpace="pre-wrap">
									{comment.comment}
								</Text>
								
								{/* Comment Images */}
								{comment.images && comment.images.length > 0 && (
									<Box mt={2}>
										{comment.images.length === 1 ? (
											<Box position="relative" borderRadius="md" overflow="hidden" maxW="300px">
												{isVideoUrl(comment.images[0]) ? (
													<video 
														src={comment.images[0]} 
														controls 
														style={{ width: "100%", maxHeight: "200px", objectFit: "contain" }}
													/>
												) : (
													<Image 
														src={comment.images[0]} 
														alt="Comment image" 
														width={300}
														height={200}
														style={{ objectFit: "cover", borderRadius: "8px" }}
													/>
												)}
											</Box>
										) : (
											<SimpleGrid columns={2} spacing={1} maxW="300px">
												{comment.images.slice(0, 4).map((img: string, idx: number) => (
													<Box key={idx} position="relative" w="full" h="100px" borderRadius="md" overflow="hidden">
														{isVideoUrl(img) ? (
															<video 
																src={img} 
																style={{ width: "100%", height: "100%", objectFit: "cover" }}
															/>
														) : (
															<Image 
																src={img} 
																alt={`Comment image ${idx + 1}`} 
																fill
																style={{ objectFit: "cover" }}
															/>
														)}
													</Box>
												))}
											</SimpleGrid>
										)}
									</Box>
								)}
							</>
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
	const [commentImages, setCommentImages] = useState<string[]>([])
	const [uploadingImages, setUploadingImages] = useState(false)
	const [commentFeeling, setCommentFeeling] = useState<string>("")
	const [commentActivity, setCommentActivity] = useState<string>("")
	const commentFileInputRef = React.useRef<HTMLInputElement>(null)
	const { edgestore } = useEdgeStore()
	const { isOpen: isFeelingModalOpen, onOpen: onFeelingModalOpen, onClose: onFeelingModalClose } = useDisclosure()

	const currentUserId = (session?.user as any)?._id
	
	// Feelings/Activities data
	const FEELINGS = [
		{ emoji: "😊", label: "happy" },
		{ emoji: "😔", label: "sad" },
		{ emoji: "😍", label: "loved" },
		{ emoji: "😎", label: "cool" },
		{ emoji: "😢", label: "crying" },
		{ emoji: "😡", label: "angry" },
		{ emoji: "🤗", label: "blessed" },
		{ emoji: "😴", label: "tired" },
	]
	
	const ACTIVITIES = [
		{ emoji: "✈️", label: "traveling" },
		{ emoji: "🍽️", label: "eating" },
		{ emoji: "📖", label: "reading" },
		{ emoji: "🎵", label: "listening to music" },
		{ emoji: "🏋️", label: "working out" },
		{ emoji: "🎮", label: "playing games" },
	]

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
			if (isModalView && onClose) {
				onClose()
			} else if (!isModalView) {
				router.push(`/console/events/${eventId}/manage`)
			}
		},
	})

	const handleCommentImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files
		if (!files || files.length === 0) return

		setUploadingImages(true)
		try {
			const uploadPromises = Array.from(files).map(async (file) => {
				if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
					throw new Error("Only images and videos are allowed")
				}
				if (file.size > 10 * 1024 * 1024) {
					throw new Error("File size must be less than 10MB")
				}
				const res = await edgestore.publicFiles.upload({ file })
				return res.url
			})

			const uploadedUrls = await Promise.all(uploadPromises)
			setCommentImages([...commentImages, ...uploadedUrls])
			toast({ title: "Images uploaded", status: "success", duration: 2000 })
		} catch (error: any) {
			toast({ title: "Upload failed", description: error.message, status: "error", duration: 3000 })
		} finally {
			setUploadingImages(false)
			if (commentFileInputRef.current) {
				commentFileInputRef.current.value = ""
			}
		}
	}

	const createCommentMutation = useMutation({
		mutationFn: ({ comment, images }: { comment: string; images?: string[] }) => {
			// Add feeling/activity to comment
			let finalComment = comment
			if (commentFeeling || commentActivity) {
				const feelingText = commentFeeling ? `${commentFeeling}` : ""
				const activityText = commentActivity ? `${commentActivity}` : ""
				const separator = commentFeeling && commentActivity ? " · " : ""
				finalComment = `${comment}\n${feelingText}${separator}${activityText}`
			}
			return CreateDiscussionCommentApi({ data: { discussionPostId: postId, comment: finalComment, images } })
		},
		onSuccess: () => {
			refetchComments()
			refetchPost()
			setNewComment("")
			setCommentImages([])
			setCommentFeeling("")
			setCommentActivity("")
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
		<>
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

		{/* Images/Videos */}
		{post.images && post.images.length > 0 && (
			<Box mb={4} borderRadius="lg" overflow="hidden">
				{post.images.length === 1 ? (
					<Box position="relative" w="full">
						{isVideoUrl(post.images[0]) ? (
							<video 
								src={post.images[0]} 
								controls 
								style={{ width: "100%", maxHeight: "600px", objectFit: "contain", backgroundColor: "#000" }}
							/>
						) : (
							<Box position="relative" w="full" h="500px">
								<Image 
									src={post.images[0]} 
									alt="Post image" 
									fill
									style={{ objectFit: "contain", backgroundColor: "#F0F2F5" }}
								/>
							</Box>
						)}
					</Box>
				) : (
					<SimpleGrid columns={post.images.length === 2 ? 2 : 2} spacing={2}>
						{post.images.map((img: string, idx: number) => (
							<Box key={idx} position="relative" w="full" h="300px">
								{isVideoUrl(img) ? (
									<video 
										src={img} 
										controls
										style={{ width: "100%", height: "100%", objectFit: "cover" }}
									/>
								) : (
									<Image 
										src={img} 
										alt={`Post image ${idx + 1}`} 
										fill
										style={{ objectFit: "cover" }}
									/>
								)}
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
					<Box mb={4}>
						<Flex gap={2} align="flex-start">
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
											if (newComment.trim()) createCommentMutation.mutate({ comment: newComment, images: commentImages });
										}
									}}
									pr="80px"
								/>
								<Flex position="absolute" right={2} bottom={1.5} gap={1}>
									<IconButton
										aria-label="Add image"
										icon={<FiImage />}
										size="sm"
										variant="ghost"
										color="#65676B"
										onClick={() => commentFileInputRef.current?.click()}
										isLoading={uploadingImages}
										borderRadius="full"
										_hover={{ bg: "transparent", color: "#1877F2" }}
									/>
									<IconButton
										aria-label="Send comment"
										icon={<FiSend />}
										size="sm"
										variant="ghost"
										color={newComment.trim() ? "#1877F2" : "#BEC3C9"}
										onClick={() => newComment.trim() && createCommentMutation.mutate({ comment: newComment, images: commentImages })}
										isDisabled={!newComment.trim() || createCommentMutation.isPending || uploadingImages}
										borderRadius="full"
										_hover={{ bg: "transparent" }}
									/>
								</Flex>
							</Box>
						</Flex>
						
						{/* Hidden File Input */}
						<input
							ref={commentFileInputRef}
							type="file"
							accept="image/*,video/*"
							multiple
							style={{ display: "none" }}
							onChange={handleCommentImageUpload}
						/>
						
						{/* Feeling/Activity Icons - Facebook Style */}
						<Flex gap={1} mt={1} ml={10} align="center">
							<IconButton
								aria-label="Emoji"
								icon={<Text fontSize="lg">😊</Text>}
								size="xs"
								variant="ghost"
								color="#65676B"
								borderRadius="full"
								onClick={onFeelingModalOpen}
								_hover={{ bg: "#F0F2F5" }}
								minW="auto"
								h="auto"
								p={1}
							/>
							<IconButton
								aria-label="Camera"
								icon={<Text fontSize="lg">📷</Text>}
								size="xs"
								variant="ghost"
								color="#65676B"
								borderRadius="full"
								onClick={() => commentFileInputRef.current?.click()}
								_hover={{ bg: "#F0F2F5" }}
								minW="auto"
								h="auto"
								p={1}
							/>
							<IconButton
								aria-label="GIF"
								icon={<Text fontSize="xs" fontWeight="bold">GIF</Text>}
								size="xs"
								variant="ghost"
								color="#65676B"
								borderRadius="full"
								_hover={{ bg: "#F0F2F5" }}
								minW="auto"
								h="auto"
								p={1}
							/>
							<IconButton
								aria-label="Sticker"
								icon={<Text fontSize="lg">🎨</Text>}
								size="xs"
								variant="ghost"
								color="#65676B"
								borderRadius="full"
								onClick={onFeelingModalOpen}
								_hover={{ bg: "#F0F2F5" }}
								minW="auto"
								h="auto"
								p={1}
							/>
							{(commentFeeling || commentActivity) && (
								<Text fontSize="xs" color="#65676B" ml={2}>
									{commentFeeling && <Text as="span" mr={1}>{commentFeeling}</Text>}
									{commentActivity && <Text as="span">{commentActivity}</Text>}
								</Text>
							)}
						</Flex>
						
						{/* Image Preview */}
						{commentImages.length > 0 && (
							<Flex gap={2} mt={2} ml={10} flexWrap="wrap">
								{commentImages.map((url, index) => (
									<Box key={index} position="relative" w="80px" h="80px" borderRadius="md" overflow="hidden">
										<Image 
											src={url} 
											alt={`Upload ${index + 1}`} 
											fill
											style={{ objectFit: "cover" }}
										/>
										<IconButton
											aria-label="Remove image"
											icon={<FiX />}
											size="xs"
											position="absolute"
											top={1}
											right={1}
											bg="blackAlpha.700"
											color="white"
											borderRadius="full"
											_hover={{ bg: "blackAlpha.800" }}
											onClick={() => setCommentImages(commentImages.filter((_, i) => i !== index))}
										/>
									</Box>
								))}
							</Flex>
						)}
					</Box>
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
		
		{/* Feeling/Activity Modal for Comments */}
		<Modal isOpen={isFeelingModalOpen} onClose={onFeelingModalClose} isCentered size="md" scrollBehavior="inside">
			<ModalOverlay bg="blackAlpha.600" backdropFilter="blur(5px)" />
			<ModalContent borderRadius="xl" maxH="70vh">
				<ModalHeader>How are you feeling?</ModalHeader>
				<ModalCloseButton />
				<ModalBody pb={6}>
					<VStack spacing={4} align="stretch">
						{/* Feelings Section */}
						<Box>
							<Text fontSize="md" fontWeight="600" mb={2} color="#1C1E21">
								Feelings
							</Text>
							<SimpleGrid columns={2} spacing={2}>
								{FEELINGS.map((item) => (
									<Button
										key={item.label}
										variant="ghost"
										justifyContent="flex-start"
										onClick={() => {
											setCommentFeeling(`${item.emoji} ${item.label}`)
											onFeelingModalClose()
										}}
										_hover={{ bg: "#F0F2F5" }}
										py={2}
										h="auto"
									>
										<Flex align="center" gap={2}>
											<Text fontSize="xl">{item.emoji}</Text>
											<Text fontSize="sm" textTransform="capitalize">{item.label}</Text>
										</Flex>
									</Button>
								))}
							</SimpleGrid>
						</Box>
						
						<Divider />
						
						{/* Activities Section */}
						<Box>
							<Text fontSize="md" fontWeight="600" mb={2} color="#1C1E21">
								What are you doing?
							</Text>
							<SimpleGrid columns={2} spacing={2}>
								{ACTIVITIES.map((item) => (
									<Button
										key={item.label}
										variant="ghost"
										justifyContent="flex-start"
										onClick={() => {
											setCommentActivity(`${item.emoji} ${item.label}`)
											onFeelingModalClose()
										}}
										_hover={{ bg: "#F0F2F5" }}
										py={2}
										h="auto"
									>
										<Flex align="center" gap={2}>
											<Text fontSize="xl">{item.emoji}</Text>
											<Text fontSize="sm" textTransform="capitalize">{item.label}</Text>
										</Flex>
									</Button>
								))}
							</SimpleGrid>
						</Box>
					</VStack>
				</ModalBody>
			</ModalContent>
		</Modal>
		</>
	)
}

export default DiscussionPostView

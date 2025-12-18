import React, { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useSession } from "next-auth/react"
import { Avatar } from "@chakra-ui/react"
import {
	Box,
	Button,
	Flex,
	Heading,
	Input,
	InputGroup,
	InputLeftElement,
	Select,
	Stack,
	Text,
	Badge,
	Icon,
	useDisclosure,
	Divider,
	Spinner as ChakraSpinner,
	Modal,
	ModalOverlay,
	ModalContent,
	ModalBody,
	ModalCloseButton,
	SimpleGrid,
	useToast,
	Menu,
	MenuButton,
	MenuList,
	MenuItem,
	IconButton,
} from "@chakra-ui/react"
import { FiSearch, FiPlus, FiMessageCircle, FiThumbsUp, FiEye, FiClock, FiShare2, FiMoreHorizontal, FiEdit, FiTrash2 } from "react-icons/fi"
import { BsPinAngle, BsHandThumbsUpFill } from "react-icons/bs"
import Image from "next/image"
import { ListDiscussionPostsApi, ReactToDiscussionPostApi, DeleteDiscussionPostApi, CheckEventTicketApi } from "@/services/events/discussionApis"
import type { DiscussionPostWithAuthor } from "@/types/discussion"
import CreateDiscussionModal from "./CreateDiscussionModal"
import DiscussionPostView from "./DiscussionPostView"
import { useRouter } from "next/router"
import LoginModal from "@/components/misc/LoginModal"

interface DiscussionBoardProps {
	eventId: string
}

// Helper function to check if URL is a video
const isVideoUrl = (url: string): boolean => {
	const videoExtensions = [".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".3gp"]
	return videoExtensions.some((ext) => url.toLowerCase().includes(ext))
}

// FeedPostCard Component
const FeedPostCard = ({
	post,
	onClick,
	onLikeSuccess,
	onDeleteSuccess,
	eventId
}: {
	post: DiscussionPostWithAuthor,
	onClick: (id: string, editMode?: boolean) => void,
	onLikeSuccess: () => void,
	onDeleteSuccess: () => void,
	eventId: string
}) => {
	const { data: session } = useSession()
	const toast = useToast()
	const router = useRouter()
	const currentUserId = (session?.user as any)?._id
	const hasLiked = post.reactions.likes.includes(currentUserId || "")
	const isAuthor = currentUserId === post.userId._id
	// @ts-ignore
	const userRole = session?.user?.role
	const isAdmin = userRole === "admin" || userRole === "super admin"

	const handlePostClick = async () => {
		if (!session || !session.user) {
			toast({
				title: "Please login or signup first",
				description: "You need to be logged in to view post details.",
				status: "warning",
				duration: 3000,
				isClosable: true,
			})
			return
		}
		onClick(post._id)
	}

	const reactMutation = useMutation({
		mutationFn: () => ReactToDiscussionPostApi({ data: { postId: post._id, reactionType: "like" } }),
		onSuccess: () => {
			onLikeSuccess()
		},
	})

	const deleteMutation = useMutation({
		mutationFn: () => DeleteDiscussionPostApi({ data: { postId: post._id } }),
		onSuccess: () => {
			toast({ title: "Post deleted", status: "success", duration: 2000 })
			onDeleteSuccess()
		},
		onError: (error: any) => {
			toast({ title: "Delete failed", description: error.message, status: "error", duration: 3000 })
		},
	})

	const handleLike = (e: React.MouseEvent) => {
		e.stopPropagation()
		reactMutation.mutate()
	}

	const handleShare = async (e: React.MouseEvent) => {
		e.stopPropagation()

		const postUrl = `${window.location.origin}/console/events/${post.eventId}/discussion/${post._id}`

		try {
			if (navigator.share) {
				// Use native share if available (mobile devices)
				await navigator.share({
					title: post.title,
					text: post.content.slice(0, 100) + "...",
					url: postUrl,
				})
			} else {
				// Fallback to copy to clipboard
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
			// If both fail, show the URL in a toast
			toast({
				title: "Share Post",
				description: postUrl,
				status: "info",
				duration: 5000,
				isClosable: true,
			})
		}
	}

	const getRelativeTime = (date: Date) => {
		const now = new Date()
		const diffMs = now.getTime() - new Date(date).getTime()
		const diffMins = Math.floor(diffMs / 60000)
		const diffHours = Math.floor(diffMs / 3600000)
		const diffDays = Math.floor(diffMs / 86400000)

		if (diffMins < 1) return "Just now"
		if (diffMins < 60) return `${diffMins}m ago`
		if (diffHours < 24) return `${diffHours}h ago`
		if (diffDays < 7) return `${diffDays}d ago`
		return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
	}

	return (
		<Box
			bg="white"
			borderRadius="lg"
			boxShadow="sm"
			overflow="hidden"
			cursor="pointer"
			onClick={handlePostClick}
			_hover={{ boxShadow: "md" }}
			transition="all 0.2s"
		>
			<Box p={4}>
				{/* Post Header */}
				<Flex align="center" gap={3} mb={3}>
					<Avatar
						size="md"
						name={`${post.userId.firstName} ${post.userId.lastName}`}
						src=""
					/>
					<Box flex="1">
						<Flex align="center" gap={2}>
							<Text fontWeight="600" color="#1C1E21">
								{post.userId.firstName} {post.userId.lastName}
							</Text>
							{post.isPinned && (
								<Flex align="center" gap={1} color="#65676B" fontSize="xs">
									<Icon as={BsPinAngle} /> Pinned
								</Flex>
							)}
						</Flex>
						<Flex align="center" gap={1} fontSize="xs" color="#65676B">
							<Text>{getRelativeTime(post.lastActivityAt)}</Text>
							<Text>·</Text>
							<Icon as={FiClock} />
						</Flex>
					</Box>
					{(isAuthor || isAdmin) && (
						<Menu>
							<MenuButton
								as={IconButton}
								icon={<FiMoreHorizontal />}
								variant="ghost"
								size="sm"
								borderRadius="full"
								onClick={(e) => e.stopPropagation()}
								aria-label="Post options"
							/>
							<MenuList onClick={(e) => e.stopPropagation()}>
								{isAuthor && (
									<MenuItem
										icon={<FiEdit />}
										onClick={(e) => {
											e.stopPropagation()
											// Open post in edit mode
											onClick(post._id, true)
										}}
									>
										Edit Post
									</MenuItem>
								)}
								{(isAuthor || isAdmin) && (
									<MenuItem
										icon={<FiTrash2 />}
										color="red.500"
										onClick={(e) => {
											e.stopPropagation()
											if (window.confirm("Are you sure you want to delete this post? This action cannot be undone.")) {
												deleteMutation.mutate()
											}
										}}
										isDisabled={deleteMutation.isPending}
									>
										Delete Post
									</MenuItem>
								)}
							</MenuList>
						</Menu>
					)}
				</Flex>

				{/* Post Content */}
				<Box mb={3}>
					<Text color="#1C1E21" fontSize="md" noOfLines={4} whiteSpace="pre-wrap">
						{post.content}
					</Text>
				</Box>

				{/* Images/Videos */}
				{post.images && post.images.length > 0 && (
					<Box mb={3} borderRadius="lg" overflow="hidden">
						{post.images.length === 1 ? (
							<Box position="relative" w="full">
								{isVideoUrl(post.images[0]) ? (
									<video
										src={post.images[0]}
										controls
										style={{ width: "100%", maxHeight: "500px", objectFit: "contain", backgroundColor: "#000" }}
									/>
								) : (
									<Box position="relative" w="full" h="400px">
										<Image
											src={post.images[0]}
											alt="Post image"
											fill
											style={{ objectFit: "cover" }}
										/>
									</Box>
								)}
							</Box>
						) : (
							<SimpleGrid columns={2} spacing={1}>
								{post.images.slice(0, 4).map((img: string, idx: number) => (
									<Box key={idx} position="relative" w="full" h="200px">
										{isVideoUrl(img) ? (
											<video
												src={img}
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
										{idx === 3 && (post.images?.length || 0) > 4 && (
											<Flex
												position="absolute"
												top={0}
												left={0}
												right={0}
												bottom={0}
												bg="blackAlpha.600"
												align="center"
												justify="center"
											>
												<Text color="white" fontSize="2xl" fontWeight="bold">
													+{(post.images?.length || 0) - 4}
												</Text>
											</Flex>
										)}
									</Box>
								))}
							</SimpleGrid>
						)}
					</Box>
				)}

				{/* Tags */}
				{post.tags && post.tags.length > 0 && (
					<Flex gap={2} mb={3} flexWrap="wrap">
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
								<Box bg="#1877F2" borderRadius="full" p="3px" display="flex" alignItems="center" justifyContent="center">
									<Icon as={BsHandThumbsUpFill} color="white" boxSize="10px" />
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
				<Flex pt={1} mx={-2}>
					<Button
						flex="1"
						variant="ghost"
						leftIcon={<FiThumbsUp />}
						color={hasLiked ? "#1877F2" : "#65676B"}
						fontWeight="600"
						_hover={{ bg: "#F0F2F5" }}
						onClick={handleLike}
						isLoading={reactMutation.isPending}
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
						onClick={(e) => {
							e.stopPropagation()
							if (!session || !session.user) {
								toast({
									title: "Please login or signup first",
									description: "You need to be logged in to view post details and comment.",
									status: "warning",
									duration: 3000,
									isClosable: true,
								})
								return
							}
							onClick(post._id)
						}}
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
						onClick={handleShare}
					>
						Share
					</Button>
				</Flex>
			</Box>
		</Box>
	)
}

// Main DiscussionBoard Component
const DiscussionBoard: React.FC<DiscussionBoardProps> = ({ eventId }) => {
	const { data: session } = useSession()
	const router = useRouter()
	const { isOpen, onOpen, onClose } = useDisclosure()
	const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
	const [openInEditMode, setOpenInEditMode] = useState(false)
	const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)

	const [sortBy, setSortBy] = useState<string>("recent")
	const [searchQuery, setSearchQuery] = useState("")
	const [page, setPage] = useState(1)

	const {
		data: discussionData,
		isLoading,
		refetch,
	} = useQuery({
		queryKey: ["discussionPosts", eventId, sortBy, searchQuery, page],
		queryFn: async () => {
			const response = await ListDiscussionPostsApi({
				data: {
					eventId,
					sort: sortBy,
					search: searchQuery || undefined,
					page,
					limit: 20,
				},
			})
			return response
		},
		enabled: !!eventId,
	})

	const posts = discussionData?.data?.posts || []
	const pagination = discussionData?.data?.pagination
	// Check if user is logged in (ticket requirement removed)
	const canPost = !!session && !!session.user

	const handlePostClick = (postId: string, editMode: boolean = false) => {
		setSelectedPostId(postId)
		setOpenInEditMode(editMode)
	}

	const handleClosePostModal = () => {
		setSelectedPostId(null)
		setOpenInEditMode(false)
		// Refetch to update comment counts/likes if changed in modal
		refetch()
	}

	const toast = useToast()

	const handleCreatePostClick = () => {
		if (!session || !session.user) {
			setIsLoginModalOpen(true)
			return
		}
		onOpen()
	}

	return (
		<Box bg="#F0F2F5" minH="500px" p={{ base: 2, md: 4 }}>
			{/* Header with Create Post */}
			<Box maxW="680px" mx="auto" mb={6}>

				{/* Facebook-style Create Post Input - Always visible */}
				<Box bg="white" borderRadius="lg" boxShadow="sm" p={4} mb={4}>
					{session && session.user ? (
						<>
							<Flex gap={3} align="center">
								<Avatar
									size="md"
									name={session.user?.name || "User"}
									src={session.user?.image || ""}
								/>
								<Button
									flex="1"
									bg="#F0F2F5"
									color="#65676B"
									borderRadius="full"
									justifyContent="flex-start"
									pl={4}
									h="40px"
									_hover={{ bg: "#E4E6EB" }}
									onClick={handleCreatePostClick}
									fontWeight="normal"
									fontSize="md"
								>
									What's on your mind, {session.user?.name?.split(' ')[0]}?
								</Button>
							</Flex>
							<Divider my={3} />
						</>
					) : null}
					<Flex justify="space-between" px={2}>
						<Button
							flex="1"
							variant="ghost"
							leftIcon={<Icon as={FiPlus} color="#E41E3F" boxSize={6} />}
							color="#65676B"
							_hover={{ bg: "#F0F2F5" }}
							onClick={handleCreatePostClick}
						>
							Create Post
						</Button>
					</Flex>
				</Box>

				{/* Search and Sort */}
				<Box bg="white" borderRadius="lg" boxShadow="sm" p={3} mb={4}>
					<Flex gap={3}>
						<InputGroup flex="1">
							<InputLeftElement pointerEvents="none">
								<FiSearch color="#65676B" />
							</InputLeftElement>
							<Input
								placeholder="Search posts..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								bg="#F0F2F5"
								border="none"
								borderRadius="full"
								_focus={{ bg: "#E4E6EB", boxShadow: "none" }}
							/>
						</InputGroup>
						<Select
							value={sortBy}
							onChange={(e) => setSortBy(e.target.value)}
							w="150px"
							bg="#F0F2F5"
							border="none"
							borderRadius="lg"
							cursor="pointer"
							_focus={{ bg: "#E4E6EB" }}
						>
							<option value="recent">Recent</option>
							<option value="popular">Popular</option>
							<option value="trending">Trending</option>
						</Select>
					</Flex>
				</Box>

				{/* Posts Feed */}
				{isLoading ? (
					<Flex justify="center" align="center" h="200px">
						<ChakraSpinner size="xl" color="#1877F2" />
					</Flex>
				) : posts.length === 0 ? (
					<Box bg="white" borderRadius="lg" boxShadow="sm" p={8} textAlign="center">
						<Icon as={FiMessageCircle} boxSize={12} color="#65676B" mb={4} />
						<Text fontSize="lg" fontWeight="medium" color="#65676B">
							No posts yet
						</Text>
						<Text fontSize="sm" color="#65676B">
							Be the first to start the conversation!
						</Text>
					</Box>
				) : (
					<Stack spacing={4}>
						{posts.map((post: DiscussionPostWithAuthor) => (
							<FeedPostCard
								key={post._id}
								post={post}
								onClick={handlePostClick}
								onLikeSuccess={refetch}
								onDeleteSuccess={refetch}
								eventId={eventId}
							/>
						))}
					</Stack>
				)}

				{/* Pagination */}
				{pagination && pagination.pages > 1 && (
					<Flex justify="center" align="center" gap={2} mt={6}>
						<Button
							onClick={() => setPage((p) => Math.max(1, p - 1))}
							isDisabled={page === 1}
							size="sm"
							variant="outline"
							bg="white"
						>
							Previous
						</Button>
						<Text color="#65676B" fontSize="sm">
							Page {page} of {pagination.pages}
						</Text>
						<Button
							onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
							isDisabled={page === pagination.pages}
							size="sm"
							variant="outline"
							bg="white"
						>
							Next
						</Button>
					</Flex>
				)}
			</Box>

			{/* Create Discussion Modal */}
			<CreateDiscussionModal
				isOpen={isOpen}
				onClose={onClose}
				eventId={eventId}
				onSuccess={() => {
					refetch()
					// Refetch ticket check after successful post creation
					if (session) {
						// The ticket check will be refetched automatically when needed
					}
				}}
			/>

			{/* Post Detail Modal */}
			<Modal isOpen={!!selectedPostId} onClose={handleClosePostModal} size="2xl" isCentered scrollBehavior="inside">
				<ModalOverlay bg="blackAlpha.600" backdropFilter="blur(5px)" />
				<ModalContent borderRadius="xl" maxH="90vh">
					<ModalCloseButton zIndex={10} />
					<ModalBody p={0}>
						{selectedPostId && (
							<DiscussionPostView
								postId={selectedPostId}
								eventId={eventId}
								isModalView={true}
								onClose={handleClosePostModal}
								openInEditMode={openInEditMode}
							/>
						)}
					</ModalBody>
				</ModalContent>
			</Modal>

			{/* Login Modal */}
			<LoginModal
				isOpen={isLoginModalOpen}
				onClose={() => setIsLoginModalOpen(false)}
			/>
		</Box>
	)
}

export default DiscussionBoard

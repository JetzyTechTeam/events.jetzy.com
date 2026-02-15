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

const parseMentions = (content: string) => {
	const mentionRegex = /@\s?\[([^\]]+)\]\(([^)]+)\)/g;
	const parts = [];
	let lastIndex = 0;
	let match;

	while ((match = mentionRegex.exec(content)) !== null) {
		if (match.index > lastIndex) {
			parts.push({ type: 'text', content: content.substring(lastIndex, match.index) });
		}
		const name = match[1];
		const userId = match[2];

		parts.push({ type: 'mention', userId, name });
		lastIndex = match.index + match[0].length;
	}

	if (lastIndex < content.length) {
		parts.push({ type: 'text', content: content.substring(lastIndex) });
	}

	return parts.length > 0 ? parts : [{ type: 'text', content }];
}

const RenderContent = ({ content, noOfLines }: { content: string, noOfLines?: number }) => {
	const parts = parseMentions(content);
	return (
		<Text color="white" fontSize="md" noOfLines={noOfLines} whiteSpace="pre-wrap">
			{parts.map((part, idx) => (
				part.type === 'mention' ? (
					<Box as="span" key={idx} color="blue.500" fontWeight="600">
						@{part.name}
					</Box>
				) : (
					<Box as="span" key={idx}>{part.content}</Box>
				)
			))}
		</Text>
	);
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
	const currentUserId = (session?.user as any)?._id
	const hasLiked = (post.reactions?.like || (post.reactions as any)?.likes || []).includes(currentUserId || "")
	const isAuthor = currentUserId === post.userId?._id
	// @ts-ignore
	const userRole = session?.user?.role
	const isAdmin = userRole === "admin" || userRole === "super admin"

	const router = useRouter()
	const handlePostClick = async () => {
		if (!session || !session.user) {
			const currentPath = window.location.pathname + window.location.search
			router.push(`/login?_cb=${encodeURIComponent(currentPath)}`)
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
			// Always copy to clipboard as requested
			await navigator.clipboard.writeText(postUrl)
			toast({
				title: "Link copied!",
				description: "Post link has been copied to clipboard",
				status: "success",
				duration: 2000,
				isClosable: true,
			})
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
			bg="#2b2b2b" // Dark background like tickets
			borderRadius="lg"
			border="1px solid"
			borderColor="transparent"
			overflow="hidden"
			cursor="pointer"
			onClick={handlePostClick}
			_hover={{ borderColor: "#jetzy" }} // Suggestion: hover border color
			transition="all 0.2s"
		>
			<Box p={{ base: 3, md: 4 }}>
				{/* Post Header */}
				<Flex align="center" gap={3} mb={3}>
					<Avatar
						size="md"
						name={post.userId ? `${post.userId.firstName} ${post.userId.lastName}` : "Deleted User"}
						src=""
					/>
					<Box flex="1">
						<Flex align="center" gap={2}>
							<Text fontWeight="600" color="white">
								{post.userId ? `${post.userId.firstName} ${post.userId.lastName}` : "Deleted User"}
							</Text>
							{post.isPinned && (
								<Flex align="center" gap={1} color="#bbbbbb" fontSize="xs">
									<Icon as={BsPinAngle} /> Pinned
								</Flex>
							)}
						</Flex>
						<Flex align="center" gap={1} fontSize="xs" color="#bbbbbb">
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
								color="white"
								_hover={{ bg: "whiteAlpha.200" }}
								onClick={(e) => e.stopPropagation()}
								aria-label="Post options"
							/>
							<MenuList onClick={(e) => e.stopPropagation()} bg="#1E1E1E" borderColor="#434343" color="white">
								{isAuthor && (
									<MenuItem
										icon={<FiEdit />}
										bg="#1E1E1E"
										_hover={{ bg: "whiteAlpha.100" }}
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
										color="red.400"
										bg="#1E1E1E"
										_hover={{ bg: "whiteAlpha.100" }}
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
					<RenderContent content={post.content} noOfLines={4} />
				</Box>

				{/* Images/Videos */}
				{post.images && post.images.length > 0 && post.images[0] && post.images[0].trim() !== "" && (
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
								{post.images.slice(0, 4).filter((img: string) => img && img.trim() !== "").map((img: string, idx: number) => (
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
										{idx === 3 && post.images && post.images.length > 4 && (
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
													+{post.images.length - 4}
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
							<Text key={idx} color="#jetzy" fontSize="sm" fontWeight="medium">
								#{tag}
							</Text>
						))}
					</Flex>
				)}

				{/* Engagement Stats */}
				<Flex justify="space-between" align="center" py={2} borderBottom="1px solid #434343" fontSize="sm" color="#bbbbbb">
					<Flex align="center" gap={1}>
						{(post.reactions?.like?.length || (post.reactions as any)?.likes?.length || 0) > 0 && (
							<Flex align="center" gap={1}>
								<Box bg="#jetzy" borderRadius="full" p="3px" display="flex" alignItems="center" justifyContent="center">
									<Icon as={BsHandThumbsUpFill} color="white" boxSize="10px" />
								</Box>
								<Text>{post.reactions?.like?.length || (post.reactions as any)?.likes?.length || 0}</Text>
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
						color={hasLiked ? "#1877F2" : "#bbbbbb"}
						fontWeight="600"
						_hover={{ bg: "whiteAlpha.100", color: "white" }}
						onClick={handleLike}
						isLoading={reactMutation.isPending}
					>
						Like
					</Button>
					<Button
						flex="1"
						variant="ghost"
						leftIcon={<FiMessageCircle />}
						color="#bbbbbb"
						fontWeight="600"
						_hover={{ bg: "whiteAlpha.100", color: "white" }}
						onClick={(e) => {
							e.stopPropagation()
							if (!session || !session.user) {
								const currentPath = window.location.pathname + window.location.search
								router.push(`/login?_cb=${encodeURIComponent(currentPath)}`)
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
						color="#bbbbbb"
						fontWeight="600"
						_hover={{ bg: "whiteAlpha.100", color: "white" }}
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
	const { isOpen, onOpen, onClose } = useDisclosure()
	const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
	const [openInEditMode, setOpenInEditMode] = useState(false)
	const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
	const router = useRouter()

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

	const handlePostClick = (postId: string, editMode: boolean = false) => {
		setSelectedPostId(postId)
		setOpenInEditMode(editMode)
	}

	const handleClosePostModal = () => {
		setSelectedPostId(null)
		setOpenInEditMode(false)

		// Clean up query param without refreshing
		const { postId, ...rest } = router.query
		router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true })

		refetch()
	}

	// Deep linking support
	React.useEffect(() => {
		if (router.query.postId && typeof router.query.postId === "string") {
			const postId = router.query.postId
			setSelectedPostId(postId)
		}
	}, [router.query.postId])

	const handleCreatePostClick = () => {
		if (!session || !session.user) {
			const currentPath = window.location.pathname + window.location.search
			router.push(`/login?_cb=${encodeURIComponent(currentPath)}`)
			return
		}
		onOpen()
	}

	return (
		<div
			className="max-w-4xl mx-auto bg-[#5656561e] border border-[#434343] rounded-2xl shadow-2xl overflow-hidden mt-8"
			id="discussion-section"
		>
			<div className="px-2 py-4 sm:p-8">
				{/* Header Section */}
				<div className="flex flex-col sm:flex-row justify-between items-center mb-6 space-y-4 sm:space-y-0">
					<div className="text-center sm:text-left">
						<h2 className="text-xl sm:text-2xl font-bold text-white">Discussion</h2>
						<p className="text-[#bbbbbb] text-sm sm:text-base">
							Join the conversation.
						</p>
					</div>
				</div>

				{/* Create Post Input */}
				<Box bg="#2b2b2b" borderRadius="lg" p={{ base: 3, md: 4 }} mb={6}>
					<Flex gap={3} align="center">
						<Avatar
							size="md"
							name={(session?.user as any)?.name || (session?.user as any)?.fullName || "Guest"}
							src={session?.user?.image || ""}
						/>
						<Button
							flex="1"
							bg="#1E1E1E"
							color="#bbbbbb"
							borderRadius="full"
							justifyContent="flex-start"
							pl={4}
							h="40px"
							_hover={{ bg: "black" }}
							onClick={handleCreatePostClick}
							fontWeight="normal"
							fontSize="md"
							overflow="hidden"
						>
							<Text isTruncated>
								{(session?.user as any)?.name || (session?.user as any)?.fullName
									? `What's on your mind, ${((session?.user as any)?.name || (session?.user as any)?.fullName).split(' ')[0]}?`
									: "What's on your mind? Login to join the conversation."
								}
							</Text>
						</Button>
					</Flex>
					<Divider my={3} borderColor="#434343" />
					<Flex justify="space-between" px={2}>
						<Button
							flex="1"
							variant="ghost"
							leftIcon={<Icon as={FiPlus} color="white" boxSize={6} />}
							color="#bbbbbb"
							_hover={{ bg: "whiteAlpha.100", color: "white" }}
							onClick={handleCreatePostClick}
						>
							Create Post
						</Button>
					</Flex>
				</Box>

				{/* Search and Sort */}
				<Box bg="#2b2b2b" borderRadius="lg" p={{ base: 3, md: 4 }} mb={6}>
					<Flex gap={3}>
						<InputGroup flex="1">
							<InputLeftElement pointerEvents="none">
								<FiSearch color="#bbbbbb" />
							</InputLeftElement>
							<Input
								placeholder="Search posts..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								bg="#1E1E1E"
								border="none"
								color="white"
								borderRadius="full"
								_focus={{ bg: "black", boxShadow: "none" }}
							/>
						</InputGroup>
						<Select
							value={sortBy}
							onChange={(e) => setSortBy(e.target.value)}
							w="150px"
							bg="#1E1E1E"
							border="none"
							color="white"
							borderRadius="lg"
							cursor="pointer"
							_focus={{ bg: "black" }}
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
						<ChakraSpinner size="xl" color="#jetzy" />
					</Flex>
				) : posts.length === 0 ? (
					<Box bg="#2b2b2b" borderRadius="lg" p={8} textAlign="center">
						<Icon as={FiMessageCircle} boxSize={12} color="#bbbbbb" mb={4} />
						<Text fontSize="lg" fontWeight="medium" color="white">
							No posts yet
						</Text>
						<Text fontSize="sm" color="#bbbbbb">
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
							bg="transparent"
							color="white"
							_hover={{ bg: "whiteAlpha.100" }}
							borderColor="#434343"
						>
							Previous
						</Button>
						<Text color="#bbbbbb" fontSize="sm">
							Page {page} of {pagination.pages}
						</Text>
						<Button
							onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
							isDisabled={page === pagination.pages}
							size="sm"
							variant="outline"
							bg="transparent"
							color="white"
							_hover={{ bg: "whiteAlpha.100" }}
							borderColor="#434343"
						>
							Next
						</Button>
					</Flex>
				)}

				{/* Create Discussion Modal */}
				<CreateDiscussionModal
					isOpen={isOpen}
					onClose={onClose}
					eventId={eventId}
					onSuccess={() => {
						refetch()
					}}
				/>

				{/* Post Detail Modal */}
				<Modal isOpen={!!selectedPostId} onClose={handleClosePostModal} size="2xl" isCentered scrollBehavior="inside">
					<ModalOverlay bg="blackAlpha.600" backdropFilter="blur(5px)" />
					<ModalContent borderRadius="xl" maxH="90vh" bg="#1E1E1E">
						<ModalCloseButton zIndex={10} color="white" />
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
			</div>
		</div>
	)
}

export default DiscussionBoard

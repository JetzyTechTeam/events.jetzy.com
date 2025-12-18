import React, { useState, useMemo, useRef, useEffect } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useSession } from "next-auth/react"
import { useEdgeStore } from "@/lib/edgestore"
import dynamic from "next/dynamic"
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
	ModalFooter,
	ModalCloseButton,
	VStack,
	HStack,
	useDisclosure,
	Tabs,
	TabList,
	TabPanels,
	Tab,
	TabPanel,
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

// Dynamic import for EmojiPicker to avoid SSR issues
const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false })
import { BsPinAngle, BsPinAngleFill, BsHandThumbsUpFill } from "react-icons/bs"
import { AiFillBulb, AiOutlineBulb } from "react-icons/ai"
import { Avatar, Input } from "@chakra-ui/react"
import {
	GetDiscussionPostApi,
	GetDiscussionCommentsApi,
	ReactToDiscussionPostApi,
	PinDiscussionPostApi,
	LockDiscussionPostApi,
	DeleteDiscussionPostApi,
	UpdateDiscussionPostApi,
	CreateDiscussionCommentApi,
	ReplyToDiscussionCommentApi,
	EditDiscussionCommentApi,
	DeleteDiscussionCommentApi,
	ReactToDiscussionCommentApi,
	CheckEventTicketApi,
} from "@/services/events/discussionApis"
import type { DiscussionPostWithAuthor, DiscussionCommentWithAuthor } from "@/types/discussion"
import { useRouter } from "next/router"
import LoginModal from "@/components/misc/LoginModal"

// Helper function to check if URL is a video
const isVideoUrl = (url: string): boolean => {
	const videoExtensions = [".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".3gp"]
	return videoExtensions.some((ext) => url.toLowerCase().includes(ext))
}

// Feelings and Activities data
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
	onEdit: (commentId: string, text: string, images?: string[]) => void
	onDelete: (commentId: string) => void
	onReact: (commentId: string) => void
	isLocked: boolean
	onLoginRequired?: () => void
}

const CommentItem: React.FC<CommentItemProps> = ({ comment, groupedComments, currentUserId, onReply, onEdit, onDelete, onReact, isLocked, onLoginRequired }) => {
	const [replyText, setReplyText] = useState("")
	const [editText, setEditText] = useState(comment.comment)
	const [showReply, setShowReply] = useState(false)
	const [isEditing, setIsEditing] = useState(false)
	const [replyImages, setReplyImages] = useState<string[]>([])
	const [replyFeeling, setReplyFeeling] = useState<string>("")
	const [replyActivity, setReplyActivity] = useState<string>("")
	const [uploadingReplyImages, setUploadingReplyImages] = useState(false)
	const [editImages, setEditImages] = useState<string[]>([])
	const [editFeeling, setEditFeeling] = useState<string>("")
	const [editActivity, setEditActivity] = useState<string>("")
	const [uploadingEditImages, setUploadingEditImages] = useState(false)
	const replyFileInputRef = useRef<HTMLInputElement>(null)
	const editFileInputRef = useRef<HTMLInputElement>(null)
	const { data: session } = useSession()
	const { edgestore } = useEdgeStore()
	const { isOpen: isReplyFeelingModalOpen, onOpen: onReplyFeelingModalOpen, onClose: onReplyFeelingModalClose } = useDisclosure()
	const { isOpen: isEditFeelingModalOpen, onOpen: onEditFeelingModalOpen, onClose: onEditFeelingModalClose } = useDisclosure()

	const isAuthor = currentUserId === comment.userId._id
	const hasLiked = comment.reactions.likes.includes(currentUserId || "")
	// Check if user is logged in (ticket requirement removed)
	const canReply = !!session && !!session.user

	const handleReplyImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files
		if (!files || files.length === 0) return

		setUploadingReplyImages(true)
		try {
			const uploadPromises = Array.from(files).map(async (file) => {
				if (file.size > 10 * 1024 * 1024) {
					throw new Error("File size must be less than 10MB")
				}
				const res = await edgestore.publicFiles.upload({ file })
				return res.url
			})

			const urls = await Promise.all(uploadPromises)
			setReplyImages((prev) => [...prev, ...urls])
		} catch (error: any) {
			console.error("Upload error:", error)
		} finally {
			setUploadingReplyImages(false)
		}
	}

	const toast = useToast()

	const handleReplySubmit = () => {
		if (!session || !session.user) {
			toast({
				title: "Please login or signup first",
				description: "You need to be logged in to reply to comments.",
				status: "warning",
				duration: 3000,
				isClosable: true,
			})
			return
		}
		if (!canReply) {
			if (onLoginRequired) {
				onLoginRequired()
			}
			return
		}
		if (replyText.trim() || replyImages.length > 0 || replyFeeling || replyActivity) {
			let finalReply = replyText
			if (replyFeeling || replyActivity) {
				const feelingText = replyFeeling ? `${replyFeeling}` : ""
				const activityText = replyActivity ? `${replyActivity}` : ""
				const separator = replyFeeling && replyActivity ? " · " : ""
				finalReply = `${replyText}\n${feelingText}${separator}${activityText}`
			}
			onReply(comment._id, finalReply)
			setReplyText("")
			setReplyImages([])
			setReplyFeeling("")
			setReplyActivity("")
			setShowReply(false)
		}
	}

	const handleEditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files
		if (!files || files.length === 0) return

		setUploadingEditImages(true)
		try {
			const uploadPromises = Array.from(files).map(async (file) => {
				if (file.size > 10 * 1024 * 1024) {
					throw new Error("File size must be less than 10MB")
				}
				const res = await edgestore.publicFiles.upload({ file })
				return res.url
			})

			const urls = await Promise.all(uploadPromises)
			setEditImages((prev) => [...prev, ...urls])
		} catch (error: any) {
			console.error("Upload error:", error)
		} finally {
			setUploadingEditImages(false)
		}
	}

	const handleEditSubmit = () => {
		if (editText.trim()) {
			let finalComment = editText
			if (editFeeling || editActivity) {
				const feelingText = editFeeling ? `${editFeeling}` : ""
				const activityText = editActivity ? `${editActivity}` : ""
				const separator = editFeeling && editActivity ? " · " : ""
				finalComment = `${editText}\n${feelingText}${separator}${activityText}`
			}
			onEdit(comment._id, finalComment, editImages)
			setIsEditing(false)
			setEditImages([])
			setEditFeeling("")
			setEditActivity("")
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
							<Box mt={2} minW="300px" bg="#F8F9FA" p={3} borderRadius="lg" border="1px solid" borderColor="gray.200">
								<Textarea
									value={editText}
									onChange={(e) => setEditText(e.target.value)}
									bg="white"
									size="sm"
									mb={2}
									minH="80px"
									_focus={{ borderColor: "blue.500" }}
								/>
								
								{/* Edit Actions */}
								<Flex gap={2} mb={2} align="center">
									<IconButton
										aria-label="Add images"
										icon={<Text fontSize="md">📷</Text>}
										size="xs"
										variant="ghost"
										color={editImages.length > 0 ? "#1877F2" : "#65676B"}
										onClick={() => editFileInputRef.current?.click()}
										isLoading={uploadingEditImages}
										_hover={{ bg: "#E4E6EB" }}
									/>
									<IconButton
										aria-label="Add feeling/activity"
										icon={<Text fontSize="md">😊</Text>}
										size="xs"
										variant="ghost"
										color={editFeeling || editActivity ? "#1877F2" : "#65676B"}
										onClick={onEditFeelingModalOpen}
										_hover={{ bg: "#E4E6EB" }}
									/>
								</Flex>
								
								{/* Hidden File Input */}
								<input
									ref={editFileInputRef}
									type="file"
									accept="image/*,video/*"
									multiple
									style={{ display: "none" }}
									onChange={handleEditImageUpload}
								/>
								
								{/* Selected Feeling/Activity Display */}
								{(editFeeling || editActivity) && (
									<Flex mb={2} gap={1} flexWrap="wrap">
										{editFeeling && (
											<Badge colorScheme="blue" fontSize="xs" px={2} py={1} borderRadius="full" display="flex" alignItems="center" gap={0.5}>
												{editFeeling}
												<IconButton
													aria-label="Remove feeling"
													icon={<FiX />}
													size="xs"
													variant="ghost"
													color="blue.600"
													onClick={() => setEditFeeling("")}
													h="12px"
													minW="12px"
												/>
											</Badge>
										)}
										{editActivity && (
											<Badge colorScheme="green" fontSize="xs" px={2} py={1} borderRadius="full" display="flex" alignItems="center" gap={0.5}>
												{editActivity}
												<IconButton
													aria-label="Remove activity"
													icon={<FiX />}
													size="xs"
													variant="ghost"
													color="green.600"
													onClick={() => setEditActivity("")}
													h="12px"
													minW="12px"
												/>
											</Badge>
										)}
									</Flex>
								)}
								
								{/* Image Preview */}
								{editImages.length > 0 && (
									<Flex gap={1} mb={2} flexWrap="wrap">
										{editImages.map((url, index) => (
											<Box key={index} position="relative" w="60px" h="60px" borderRadius="md" overflow="hidden" border="1px solid #E4E6EB">
												<Image 
													src={url} 
													alt={`Edit ${index + 1}`} 
													fill
													style={{ objectFit: "cover" }}
												/>
												<IconButton
													aria-label="Remove image"
													icon={<FiX />}
													size="xs"
													position="absolute"
													top={0.5}
													right={0.5}
													bg="blackAlpha.700"
													color="white"
													borderRadius="full"
													_hover={{ bg: "blackAlpha.800" }}
													onClick={() => setEditImages(editImages.filter((_, i) => i !== index))}
													h="18px"
													minW="18px"
												/>
											</Box>
										))}
									</Flex>
								)}
								
								<Flex gap={2}>
									<Button size="xs" colorScheme="blue" onClick={handleEditSubmit} isLoading={uploadingEditImages}>Save</Button>
									<Button 
										size="xs" 
										variant="ghost" 
										onClick={() => {
											setIsEditing(false)
											setEditImages([])
											setEditFeeling("")
											setEditActivity("")
										}}
									>
										Cancel
									</Button>
								</Flex>
								
								{/* Feeling/Activity Modal for Edit Comment */}
								<Modal isOpen={isEditFeelingModalOpen} onClose={onEditFeelingModalClose} isCentered size="md">
									<ModalOverlay bg="blackAlpha.600" backdropFilter="blur(5px)" />
									<ModalContent borderRadius="xl">
										<ModalHeader borderBottom="1px solid" borderColor="gray.100" pb={3}>
											<Text fontSize="md" fontWeight="bold">Add Expression</Text>
										</ModalHeader>
										<ModalCloseButton mt={1} />
										<ModalBody py={3}>
											{(editFeeling || editActivity) && (
												<Box p={2} bg="#E7F3FF" borderRadius="lg" border="1px solid #1877F2" mb={3}>
													<Text fontSize="xs" fontWeight="600" color="#1877F2" mb={1}>Selected:</Text>
													<Flex gap={1} flexWrap="wrap">
														{editFeeling && (
															<Badge colorScheme="blue" fontSize="xs" px={2} py={1} borderRadius="full">
																{editFeeling}
																<IconButton
																	aria-label="Remove"
																	icon={<FiX />}
																	size="xs"
																	variant="ghost"
																	color="blue.600"
																	onClick={() => setEditFeeling("")}
																	h="14px"
																	minW="14px"
																	ml={0.5}
																/>
															</Badge>
														)}
														{editActivity && (
															<Badge colorScheme="green" fontSize="xs" px={2} py={1} borderRadius="full">
																{editActivity}
																<IconButton
																	aria-label="Remove"
																	icon={<FiX />}
																	size="xs"
																	variant="ghost"
																	color="green.600"
																	onClick={() => setEditActivity("")}
																	h="14px"
																	minW="14px"
																	ml={0.5}
																/>
															</Badge>
														)}
													</Flex>
												</Box>
											)}
											
											<Tabs colorScheme="blue" variant="soft-rounded" size="sm" isFitted>
												<TabList mb={2} p={0.5} bg="gray.50" borderRadius="full">
													<Tab _selected={{ color: "white", bg: "blue.500" }} borderRadius="full" fontSize="xs">😊 Emojis</Tab>
													<Tab _selected={{ color: "white", bg: "blue.500" }} borderRadius="full" fontSize="xs">💭 Feelings</Tab>
													<Tab _selected={{ color: "white", bg: "blue.500" }} borderRadius="full" fontSize="xs">🎯 Activities</Tab>
												</TabList>
												
												<TabPanels>
													<TabPanel p={0}>
														<Box display="flex" justifyContent="center">
															<EmojiPicker
																onEmojiClick={(emojiData: any) => {
																	setEditFeeling((prev) => prev ? `${prev} ${emojiData.emoji}` : emojiData.emoji)
																}}
																width="100%"
																height="250px"
																searchDisabled={false}
																skinTonesDisabled
															/>
														</Box>
													</TabPanel>
													
													<TabPanel p={0} maxH="250px" overflowY="auto">
														<SimpleGrid columns={2} spacing={1}>
															{FEELINGS.map((item) => (
																<Button
																	key={item.label}
																	variant="ghost"
																	justifyContent="flex-start"
																	onClick={() => setEditFeeling(`${item.emoji} ${item.label}`)}
																	bg={editFeeling?.includes(item.label) ? "#E7F3FF" : "transparent"}
																	_hover={{ bg: "#F0F2F5" }}
																	py={3}
																	h="auto"
																	size="sm"
																>
																	<Flex align="center" gap={2}>
																		<Text fontSize="xl">{item.emoji}</Text>
																		<Text fontSize="xs" textTransform="capitalize">{item.label}</Text>
																	</Flex>
																</Button>
															))}
														</SimpleGrid>
													</TabPanel>
													
													<TabPanel p={0} maxH="250px" overflowY="auto">
														<SimpleGrid columns={2} spacing={1}>
															{ACTIVITIES.map((item) => (
																<Button
																	key={item.label}
																	variant="ghost"
																	justifyContent="flex-start"
																	onClick={() => setEditActivity(`${item.emoji} ${item.label}`)}
																	bg={editActivity?.includes(item.label) ? "#D4EDDA" : "transparent"}
																	_hover={{ bg: "#F0F2F5" }}
																	py={3}
																	h="auto"
																	size="sm"
																>
																	<Flex align="center" gap={2}>
																		<Text fontSize="xl">{item.emoji}</Text>
																		<Text fontSize="xs" textTransform="capitalize">{item.label}</Text>
																	</Flex>
																</Button>
															))}
														</SimpleGrid>
													</TabPanel>
												</TabPanels>
											</Tabs>
										</ModalBody>
										<ModalFooter borderTop="1px solid" borderColor="gray.100" pt={2} pb={2}>
											<Button size="xs" variant="ghost" mr={2} onClick={onEditFeelingModalClose}>Cancel</Button>
											<Button size="xs" colorScheme="blue" onClick={onEditFeelingModalClose}>Done</Button>
										</ModalFooter>
									</ModalContent>
								</Modal>
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
						<Box mb={3}>
							<Flex gap={2} align="flex-start">
								<Avatar size="xs" src={session?.user?.image || ""} name={session?.user?.name || "User"} mt={1} />
								<Box flex="1">
									<Flex gap={2} align="center">
										<Box flex="1" position="relative">
											<Textarea
												placeholder="Write a reply..."
												value={replyText}
												onChange={(e) => setReplyText(e.target.value)}
												bg="#F0F2F5"
												border="none"
												borderRadius="2xl"
												_focus={{ bg: "#F0F2F5", boxShadow: "none" }}
												minH="36px"
												py={1.5}
												px={3}
												resize="none"
												fontSize="sm"
												onKeyPress={(e) => {
													if (e.key === 'Enter' && !e.shiftKey) {
														e.preventDefault();
														handleReplySubmit();
													}
												}}
											/>
										</Box>
										
										{/* Send Button */}
										<IconButton
											aria-label="Send reply"
											icon={<FiSend />}
											size="sm"
											variant="ghost"
											color={(replyText.trim() || replyImages.length > 0 || replyFeeling || replyActivity) ? "#1877F2" : "#BEC3C9"}
											onClick={handleReplySubmit}
											isDisabled={(!replyText.trim() && replyImages.length === 0 && !replyFeeling && !replyActivity) || uploadingReplyImages}
											borderRadius="full"
											_hover={{ bg: "#E4E6EB" }}
										/>
									</Flex>
									
									{/* Icons Row - BELOW the input */}
									<Flex gap={2} mt={1} align="center" pl={2}>
										<IconButton
											aria-label="Feeling/Activity"
											icon={<Text fontSize="md">😊</Text>}
											size="xs"
											variant="ghost"
											color={replyFeeling || replyActivity ? "#1877F2" : "#65676B"}
											borderRadius="full"
											onClick={onReplyFeelingModalOpen}
											_hover={{ bg: "#E4E6EB" }}
											minW="auto"
											h="auto"
											p={1}
										/>
										<IconButton
											aria-label="Add image"
											icon={<Text fontSize="md">📷</Text>}
											size="xs"
											variant="ghost"
											color={replyImages.length > 0 ? "#1877F2" : "#65676B"}
											onClick={() => replyFileInputRef.current?.click()}
											isLoading={uploadingReplyImages}
											borderRadius="full"
											_hover={{ bg: "#E4E6EB" }}
											minW="auto"
											h="auto"
											p={1}
										/>
									</Flex>
									
									{/* Hidden File Input */}
									<input
										ref={replyFileInputRef}
										type="file"
										accept="image/*,video/*"
										multiple
										style={{ display: "none" }}
										onChange={handleReplyImageUpload}
									/>
									
									{/* Selected Feeling/Activity Display */}
									{(replyFeeling || replyActivity) && (
										<Flex mt={2} align="center" gap={2} flexWrap="wrap" pl={2}>
											{replyFeeling && (
												<Badge 
													colorScheme="blue" 
													fontSize="xs" 
													px={2} 
													py={1} 
													borderRadius="full" 
													display="flex" 
													alignItems="center" 
													gap={1}
												>
													{replyFeeling}
													<IconButton
														aria-label="Remove feeling"
														icon={<FiX />}
														size="xs"
														variant="ghost"
														color="blue.600"
														onClick={() => setReplyFeeling("")}
														h="14px"
														minW="14px"
														ml={0.5}
													/>
												</Badge>
											)}
											{replyActivity && (
												<Badge 
													colorScheme="green" 
													fontSize="xs" 
													px={2} 
													py={1} 
													borderRadius="full" 
													display="flex" 
													alignItems="center" 
													gap={1}
												>
													{replyActivity}
													<IconButton
														aria-label="Remove activity"
														icon={<FiX />}
														size="xs"
														variant="ghost"
														color="green.600"
														onClick={() => setReplyActivity("")}
														h="14px"
														minW="14px"
														ml={0.5}
													/>
												</Badge>
											)}
										</Flex>
									)}
									
									{/* Image Preview */}
									{replyImages.length > 0 && (
										<Flex gap={2} mt={2} flexWrap="wrap" pl={2}>
											{replyImages.map((url, index) => (
												<Box key={index} position="relative" w="80px" h="80px" borderRadius="lg" overflow="hidden" border="1px solid #E4E6EB">
													<Image 
														src={url} 
														alt={`Reply image ${index + 1}`} 
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
														onClick={() => setReplyImages(replyImages.filter((_, i) => i !== index))}
													/>
												</Box>
											))}
										</Flex>
									)}
								</Box>
							</Flex>
							
							{/* Feeling/Activity Modal for Reply */}
							<Modal isOpen={isReplyFeelingModalOpen} onClose={onReplyFeelingModalClose} isCentered size="lg">
								<ModalOverlay bg="blackAlpha.600" backdropFilter="blur(5px)" />
								<ModalContent borderRadius="xl">
									<ModalHeader borderBottom="1px solid" borderColor="gray.100" pb={4}>
										<Text fontSize="lg" fontWeight="bold">Add Expression</Text>
									</ModalHeader>
									<ModalCloseButton mt={1.5} />
									<ModalBody py={4}>
										{/* Current Selection Display */}
										{(replyFeeling || replyActivity) && (
											<Box p={3} bg="#E7F3FF" borderRadius="lg" border="1px solid #1877F2" mb={4}>
												<Text fontSize="sm" fontWeight="600" color="#1877F2" mb={2}>
													Selected:
												</Text>
												<Flex gap={2} flexWrap="wrap">
													{replyFeeling && (
														<Badge colorScheme="blue" fontSize="sm" px={3} py={1.5} borderRadius="full" display="flex" alignItems="center" gap={1}>
															{replyFeeling}
															<IconButton
																aria-label="Remove feeling"
																icon={<FiX />}
																size="xs"
																variant="ghost"
																color="blue.600"
																onClick={() => setReplyFeeling("")}
																ml={1}
																h="18px"
																minW="18px"
															/>
														</Badge>
													)}
													{replyActivity && (
														<Badge colorScheme="green" fontSize="sm" px={3} py={1.5} borderRadius="full" display="flex" alignItems="center" gap={1}>
															{replyActivity}
															<IconButton
																aria-label="Remove activity"
																icon={<FiX />}
																size="xs"
																variant="ghost"
																color="green.600"
																onClick={() => setReplyActivity("")}
																ml={1}
																h="18px"
																minW="18px"
															/>
														</Badge>
													)}
												</Flex>
											</Box>
										)}
										
										<Tabs colorScheme="blue" variant="soft-rounded" isFitted>
											<TabList mb={4} p={1} bg="gray.50" borderRadius="full">
												<Tab _selected={{ color: "white", bg: "blue.500" }} borderRadius="full" fontWeight="600">😊 Emojis</Tab>
												<Tab _selected={{ color: "white", bg: "blue.500" }} borderRadius="full" fontWeight="600">💭 Feelings</Tab>
												<Tab _selected={{ color: "white", bg: "blue.500" }} borderRadius="full" fontWeight="600">🎯 Activities</Tab>
											</TabList>
											
											<TabPanels>
												{/* Emoji Picker Tab */}
												<TabPanel p={0}>
													<Box display="flex" justifyContent="center">
														<EmojiPicker
															onEmojiClick={(emojiData: any) => {
																setReplyFeeling((prev) => prev ? `${prev} ${emojiData.emoji}` : emojiData.emoji)
															}}
															width="100%"
															height="350px"
															searchDisabled={false}
															skinTonesDisabled
														/>
													</Box>
												</TabPanel>
												
												{/* Feelings Tab */}
												<TabPanel p={0} maxH="350px" overflowY="auto">
													<SimpleGrid columns={2} spacing={2}>
														{FEELINGS.map((item) => (
															<Button
																key={item.label}
																variant="ghost"
																justifyContent="flex-start"
																onClick={() => setReplyFeeling(`${item.emoji} ${item.label}`)}
																bg={replyFeeling?.includes(item.label) ? "#E7F3FF" : "transparent"}
																_hover={{ bg: "#F0F2F5" }}
																py={6}
																h="auto"
																border="1px solid"
																borderColor={replyFeeling?.includes(item.label) ? "blue.200" : "transparent"}
															>
																<Flex align="center" gap={3}>
																	<Text fontSize="3xl">{item.emoji}</Text>
																	<Text fontSize="md" textTransform="capitalize" fontWeight="500">{item.label}</Text>
																</Flex>
															</Button>
														))}
													</SimpleGrid>
												</TabPanel>
												
												{/* Activities Tab */}
												<TabPanel p={0} maxH="350px" overflowY="auto">
													<SimpleGrid columns={2} spacing={2}>
														{ACTIVITIES.map((item) => (
															<Button
																key={item.label}
																variant="ghost"
																justifyContent="flex-start"
																onClick={() => setReplyActivity(`${item.emoji} ${item.label}`)}
																bg={replyActivity?.includes(item.label) ? "#D4EDDA" : "transparent"}
																_hover={{ bg: "#F0F2F5" }}
																py={6}
																h="auto"
																border="1px solid"
																borderColor={replyActivity?.includes(item.label) ? "green.200" : "transparent"}
															>
																<Flex align="center" gap={3}>
																	<Text fontSize="3xl">{item.emoji}</Text>
																	<Text fontSize="md" textTransform="capitalize" fontWeight="500">{item.label}</Text>
																</Flex>
															</Button>
														))}
													</SimpleGrid>
												</TabPanel>
											</TabPanels>
										</Tabs>
									</ModalBody>
									<ModalFooter borderTop="1px solid" borderColor="gray.100">
										<Button variant="ghost" mr={3} onClick={onReplyFeelingModalClose}>
											Cancel
										</Button>
										<Button
											colorScheme="blue"
											onClick={onReplyFeelingModalClose}
											px={8}
										>
											Done
										</Button>
									</ModalFooter>
								</ModalContent>
							</Modal>
						</Box>
					)}
				</Box>

				{(isAuthor || isAdmin) && (
					<Menu>
						<MenuButton as={IconButton} icon={<FiMoreHorizontal />} size="xs" variant="ghost" borderRadius="full" />
						<MenuList>
							{isAuthor && (
								<MenuItem 
									icon={<FiEdit />} 
									onClick={() => {
										setEditText(comment.comment)
										setEditImages(comment.images || [])
										setEditFeeling("")
										setEditActivity("")
										setIsEditing(true)
									}}
								>
									Edit
								</MenuItem>
							)}
							{(isAuthor || isAdmin) && (
								<MenuItem icon={<FiTrash2 />} color="red.500" onClick={() => onDelete(comment._id)}>Delete</MenuItem>
							)}
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

const DiscussionPostView: React.FC<DiscussionPostViewProps> = ({ postId, eventId, isModalView = false, onClose, openInEditMode = false }) => {
	const { data: session } = useSession()
	const router = useRouter()
	const toast = useToast()
	const [newComment, setNewComment] = useState("")
	const [commentImages, setCommentImages] = useState<string[]>([])
	const [uploadingImages, setUploadingImages] = useState(false)
	const [commentFeeling, setCommentFeeling] = useState<string>("")
	const [commentActivity, setCommentActivity] = useState<string>("")
	const [isEditingPost, setIsEditingPost] = useState(false)
	const [editPostContent, setEditPostContent] = useState("")
	const [editPostImages, setEditPostImages] = useState<string[]>([])
	const [editPostFeeling, setEditPostFeeling] = useState<string>("")
	const [editPostActivity, setEditPostActivity] = useState<string>("")
	const [uploadingEditImages, setUploadingEditImages] = useState(false)
	const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
	const commentFileInputRef = React.useRef<HTMLInputElement>(null)
	const editPostFileInputRef = React.useRef<HTMLInputElement>(null)
	const { isOpen: isEditPostFeelingModalOpen, onOpen: onEditPostFeelingModalOpen, onClose: onEditPostFeelingModalClose } = useDisclosure()
	const { edgestore } = useEdgeStore()
	const { isOpen: isFeelingModalOpen, onOpen: onFeelingModalOpen, onClose: onFeelingModalClose } = useDisclosure()

	const currentUserId = (session?.user as any)?._id
	// Check if user is admin or super admin
	// @ts-ignore
	const isAdmin = session?.user?.role === "admin" || session?.user?.role === "super admin"
	
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
	// Check if user is logged in (ticket requirement removed)
	const canComment = !!session && !!session.user

	// Auto-enter edit mode if requested
	useEffect(() => {
		if (openInEditMode && post && !isEditingPost) {
			setEditPostContent(post.content)
			setEditPostImages(post.images || [])
			setEditPostFeeling("")
			setEditPostActivity("")
			setIsEditingPost(true)
		}
	}, [openInEditMode, post, isEditingPost])

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

	const updatePostMutation = useMutation({
		mutationFn: ({ content, images }: { content: string; images?: string[] }) => {
			console.log("🔄 Updating post with:", { postId, content, images })
			console.log("📸 Images count:", images?.length || 0)
			return UpdateDiscussionPostApi({ data: { postId, content, images } })
		},
		onSuccess: () => {
			refetchPost()
			setIsEditingPost(false)
			setEditPostImages([])
			setEditPostFeeling("")
			setEditPostActivity("")
			toast({ title: "Post updated", status: "success", duration: 2000 })
		},
		onError: (error: any) => {
			console.error("❌ Update post error:", error)
			toast({ title: "Update failed", description: error.message, status: "error", duration: 3000 })
		},
	})

	const handleEditPostImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files
		if (!files || files.length === 0) return

		setUploadingEditImages(true)
		try {
			const uploadPromises = Array.from(files).map(async (file) => {
				if (file.size > 10 * 1024 * 1024) {
					throw new Error("File size must be less than 10MB")
				}
				const res = await edgestore.publicFiles.upload({ file })
				return res.url
			})

			const urls = await Promise.all(uploadPromises)
			setEditPostImages((prev) => [...prev, ...urls])
		} catch (error: any) {
			toast({ title: "Upload failed", description: error.message, status: "error", duration: 3000 })
		} finally {
			setUploadingEditImages(false)
		}
	}

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
		mutationFn: ({ commentId, newComment, images }: { commentId: string; newComment: string; images?: string[] }) => {
			console.log("🔄 Updating comment with:", { commentId, newComment, images })
			console.log("📸 Comment images count:", images?.length || 0)
			return EditDiscussionCommentApi({ data: { commentId, newComment, images } })
		},
		onSuccess: () => {
			refetchComments()
			toast({ title: "Comment updated", status: "success", duration: 2000 })
		},
		onError: (error: any) => {
			console.error("❌ Update comment error:", error)
			toast({ title: "Update failed", description: error.message, status: "error", duration: 3000 })
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
			pt={isModalView ? 12 : { base: 4, md: 6 }}
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

				{(isAuthor || isAdmin) && (
					<Menu>
						<MenuButton as={IconButton} icon={<FiMoreHorizontal />} variant="ghost" />
						<MenuList>
							{isAuthor && (
								<MenuItem 
									icon={<FiEdit />} 
									onClick={() => {
										setEditPostContent(post.content)
										setEditPostImages(post.images || [])
										// Extract feeling/activity from content if exists
										setEditPostFeeling("")
										setEditPostActivity("")
										setIsEditingPost(true)
									}}
								>
									Edit Post
								</MenuItem>
							)}
							{(isAuthor || isAdmin) && (
								<MenuItem icon={<FiTrash2 />} color="red.500" onClick={() => window.confirm("Delete this post?") && deletePostMutation.mutate()}>
									Delete Post
								</MenuItem>
							)}
							{isAdmin && (
								<>
									<MenuItem icon={post.isPinned ? <BsPinAngle /> : <BsPinAngleFill />} onClick={() => pinPostMutation.mutate(!post.isPinned)}>
										{post.isPinned ? "Unpin" : "Pin"} Post
									</MenuItem>
									<MenuItem icon={post.isLocked ? <FiUnlock /> : <FiLock />} onClick={() => lockPostMutation.mutate(!post.isLocked)}>
										{post.isLocked ? "Unlock" : "Lock"} Discussion
									</MenuItem>
								</>
							)}
						</MenuList>
					</Menu>
				)}
			</Flex>

		{/* Post Content */}
		<Box mb={4}>
			{isEditingPost ? (
				<Box bg="#F8F9FA" p={4} borderRadius="lg" border="1px solid" borderColor="gray.200">
					<Textarea
						value={editPostContent}
						onChange={(e) => setEditPostContent(e.target.value)}
						bg="white"
						border="1px solid"
						borderColor="gray.300"
						borderRadius="lg"
						minH="150px"
						fontSize="md"
						mb={3}
						_focus={{ borderColor: "blue.500", boxShadow: "0 0 0 1px #1877F2" }}
						placeholder="What's on your mind?"
					/>
					
					{/* Edit Actions Icons */}
					<Flex gap={2} mb={3} align="center">
						<IconButton
							aria-label="Add images"
							icon={<Text fontSize="lg">📷</Text>}
							size="sm"
							variant="ghost"
							color={editPostImages.length > 0 ? "#1877F2" : "#65676B"}
							onClick={() => editPostFileInputRef.current?.click()}
							isLoading={uploadingEditImages}
							_hover={{ bg: "#E4E6EB" }}
						/>
						<IconButton
							aria-label="Add feeling/activity"
							icon={<Text fontSize="lg">😊</Text>}
							size="sm"
							variant="ghost"
							color={editPostFeeling || editPostActivity ? "#1877F2" : "#65676B"}
							onClick={onEditPostFeelingModalOpen}
							_hover={{ bg: "#E4E6EB" }}
						/>
						<Text fontSize="xs" color="gray.500" ml={2}>
							{editPostImages.length > 0 && `${editPostImages.length} image(s)`}
						</Text>
					</Flex>
					
					{/* Hidden File Input */}
					<input
						ref={editPostFileInputRef}
						type="file"
						accept="image/*,video/*"
						multiple
						style={{ display: "none" }}
						onChange={handleEditPostImageUpload}
					/>
					
					{/* Selected Feeling/Activity Display */}
					{(editPostFeeling || editPostActivity) && (
						<Flex mb={3} gap={2} flexWrap="wrap">
							{editPostFeeling && (
								<Badge 
									colorScheme="blue" 
									fontSize="sm" 
									px={3} 
									py={1.5} 
									borderRadius="full" 
									display="flex" 
									alignItems="center" 
									gap={1}
								>
									{editPostFeeling}
									<IconButton
										aria-label="Remove feeling"
										icon={<FiX />}
										size="xs"
										variant="ghost"
										color="blue.600"
										onClick={() => setEditPostFeeling("")}
										h="16px"
										minW="16px"
										ml={1}
									/>
								</Badge>
							)}
							{editPostActivity && (
								<Badge 
									colorScheme="green" 
									fontSize="sm" 
									px={3} 
									py={1.5} 
									borderRadius="full" 
									display="flex" 
									alignItems="center" 
									gap={1}
								>
									{editPostActivity}
									<IconButton
										aria-label="Remove activity"
										icon={<FiX />}
										size="xs"
										variant="ghost"
										color="green.600"
										onClick={() => setEditPostActivity("")}
										h="16px"
										minW="16px"
										ml={1}
									/>
								</Badge>
							)}
						</Flex>
					)}
					
					{/* Image Preview */}
					{editPostImages.length > 0 && (
						<SimpleGrid columns={editPostImages.length === 1 ? 1 : 2} spacing={2} mb={3}>
							{editPostImages.map((url, index) => (
								<Box key={index} position="relative" w="full" h="200px" borderRadius="lg" overflow="hidden" border="1px solid #E4E6EB">
									{isVideoUrl(url) ? (
										<video 
											src={url} 
											style={{ width: "100%", height: "100%", objectFit: "cover" }}
										/>
									) : (
										<Image 
											src={url} 
											alt={`Edit image ${index + 1}`} 
											fill
											style={{ objectFit: "cover" }}
										/>
									)}
									<IconButton
										aria-label="Remove image"
										icon={<FiX />}
										size="sm"
										position="absolute"
										top={2}
										right={2}
										bg="blackAlpha.700"
										color="white"
										borderRadius="full"
										_hover={{ bg: "blackAlpha.800" }}
										onClick={() => setEditPostImages(editPostImages.filter((_, i) => i !== index))}
									/>
								</Box>
							))}
						</SimpleGrid>
					)}
					
					<Flex gap={2}>
						<Button
							size="sm"
							colorScheme="blue"
							onClick={() => {
								let finalContent = editPostContent
								if (editPostFeeling || editPostActivity) {
									const feelingText = editPostFeeling ? `${editPostFeeling}` : ""
									const activityText = editPostActivity ? `${editPostActivity}` : ""
									const separator = editPostFeeling && editPostActivity ? " · " : ""
									finalContent = `${editPostContent}\n${feelingText}${separator}${activityText}`
								}
								updatePostMutation.mutate({ content: finalContent, images: editPostImages })
							}}
							isLoading={updatePostMutation.isPending}
							isDisabled={!editPostContent.trim()}
						>
							Save Changes
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={() => {
								setIsEditingPost(false)
								setEditPostContent("")
								setEditPostImages([])
								setEditPostFeeling("")
								setEditPostActivity("")
							}}
						>
							Cancel
						</Button>
					</Flex>
				</Box>
			) : (
				<Text color="#1C1E21" fontSize="md" whiteSpace="pre-wrap">
					{post.content}
				</Text>
			)}
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

			{/* Action Buttons - Facebook Style */}
			<Flex py={1} borderBottom="1px solid #CED0D4" mb={4} justify="space-between">
				<Button
					flex="1"
					variant="ghost"
					leftIcon={hasLiked ? <Icon as={FiThumbsUp} fill="#1877F2" color="#1877F2" /> : <FiThumbsUp />}
					color={hasLiked ? "#1877F2" : "#65676B"}
					fontWeight="600"
					onClick={() => reactToPostMutation.mutate("like")}
					_hover={{ bg: "#F0F2F5" }}
					height="36px"
					fontSize="md"
					borderRadius="md"
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
					height="36px"
					fontSize="md"
					borderRadius="md"
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
					height="36px"
					fontSize="md"
					borderRadius="md"
				>
					Share
				</Button>
			</Flex>

			{/* Comments Section */}
			<Box>
				{/* New Comment Input - Always visible */}
				{!post.isLocked && (
					<Box mb={4}>
						<Flex gap={2} align="flex-start">
							{session && session.user ? (
								<Avatar size="sm" name={session.user?.name || "User"} src={session.user?.image || ""} mt={1} />
							) : (
								<Avatar size="sm" name="Guest" mt={1} bg="gray.300" />
							)}
							<Box flex="1">
								<Flex gap={2} align="center">
									<Box flex="1" position="relative">
										<Textarea
											id="commentInput"
											placeholder={session && session.user ? "Write a comment..." : "Login to write a comment..."}
											value={newComment}
											onChange={(e) => {
												if (!session || !session.user) {
													setIsLoginModalOpen(true)
													return
												}
												setNewComment(e.target.value)
											}}
											onClick={() => {
												if (!session || !session.user) {
													setIsLoginModalOpen(true)
												}
											}}
											bg="#F0F2F5"
											border="none"
											borderRadius="2xl"
											_focus={{ bg: "#F0F2F5", boxShadow: "none" }}
											minH="40px"
											py={2}
											px={3}
											resize="none"
											fontSize="sm"
											onKeyPress={(e) => {
												if (e.key === 'Enter' && !e.shiftKey) {
													e.preventDefault();
													if (!session || !session.user) {
														setIsLoginModalOpen(true)
														return
													}
													if (newComment.trim() || commentImages.length > 0 || commentFeeling || commentActivity) {
														createCommentMutation.mutate({ comment: newComment, images: commentImages });
													}
												}
											}}
											onFocus={() => {
												if (!session || !session.user) {
													// Don't prevent focus, but show login modal if they try to type
												}
											}}
										/>
									</Box>
									
									{/* Send Button - Always visible on the right */}
									<IconButton
										aria-label="Send comment"
										icon={<FiSend />}
										size="md"
										variant="ghost"
										color={(newComment.trim() || commentImages.length > 0 || commentFeeling || commentActivity) ? "#1877F2" : "#BEC3C9"}
										onClick={() => {
											if (!session || !session.user) {
												setIsLoginModalOpen(true)
												return
											}
											if (newComment.trim() || commentImages.length > 0 || commentFeeling || commentActivity) {
												createCommentMutation.mutate({ comment: newComment, images: commentImages });
											}
										}}
										isDisabled={(!newComment.trim() && commentImages.length === 0 && !commentFeeling && !commentActivity) || createCommentMutation.isPending || uploadingImages}
										borderRadius="full"
										_hover={{ bg: "#E4E6EB" }}
									/>
								</Flex>
								
								{/* Icons Row - BELOW the input (Facebook style) */}
								<Flex gap={2} mt={1} align="center" pl={2}>
									<IconButton
										aria-label="Feeling/Activity"
										icon={<Text fontSize="lg">😊</Text>}
										size="xs"
										variant="ghost"
										color={commentFeeling || commentActivity ? "#1877F2" : "#65676B"}
										borderRadius="full"
										onClick={() => {
											if (!session || !session.user) {
												setIsLoginModalOpen(true)
												return
											}
											onFeelingModalOpen()
										}}
										_hover={{ bg: "#E4E6EB" }}
										minW="auto"
										h="auto"
										p={1}
									/>
									<IconButton
										aria-label="Add image"
										icon={<Text fontSize="lg">📷</Text>}
										size="xs"
										variant="ghost"
										color={commentImages.length > 0 ? "#1877F2" : "#65676B"}
										onClick={() => {
											if (!session || !session.user) {
												setIsLoginModalOpen(true)
												return
											}
											commentFileInputRef.current?.click()
										}}
										isLoading={uploadingImages}
										borderRadius="full"
										_hover={{ bg: "#E4E6EB" }}
										minW="auto"
										h="auto"
										p={1}
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
						
						{/* Selected Feeling/Activity Display */}
						{(commentFeeling || commentActivity) && (
							<Flex ml={10} mt={2} align="center" gap={2} flexWrap="wrap">
								{commentFeeling && (
									<Badge 
										colorScheme="blue" 
										fontSize="xs" 
										px={3} 
										py={1.5} 
										borderRadius="full" 
										display="flex" 
										alignItems="center" 
										gap={1}
									>
										{commentFeeling}
										<IconButton
											aria-label="Remove feeling"
											icon={<FiX />}
											size="xs"
											variant="ghost"
											color="blue.600"
											onClick={() => setCommentFeeling("")}
											h="16px"
											minW="16px"
											ml={1}
										/>
									</Badge>
								)}
								{commentActivity && (
									<Badge 
										colorScheme="green" 
										fontSize="xs" 
										px={3} 
										py={1.5} 
										borderRadius="full" 
										display="flex" 
										alignItems="center" 
										gap={1}
									>
										{commentActivity}
										<IconButton
											aria-label="Remove activity"
											icon={<FiX />}
											size="xs"
											variant="ghost"
											color="green.600"
											onClick={() => setCommentActivity("")}
											h="16px"
											minW="16px"
											ml={1}
										/>
									</Badge>
								)}
							</Flex>
						)}
						
						{/* Image Preview */}
						{commentImages.length > 0 && (
							<Flex gap={2} mt={2} ml={10} flexWrap="wrap">
								{commentImages.map((url, index) => (
									<Box key={index} position="relative" w="100px" h="100px" borderRadius="lg" overflow="hidden" border="1px solid #E4E6EB">
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
								onEdit={(commentId, text, images) => editCommentMutation.mutate({ commentId, newComment: text, images })}
								onDelete={(commentId) => window.confirm("Delete this comment?") && deleteCommentMutation.mutate(commentId)}
								onReact={(commentId) => reactToCommentMutation.mutate(commentId)}
								isLocked={post.isLocked}
								onLoginRequired={() => setIsLoginModalOpen(true)}
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
		
		{/* Feeling/Activity/Emoji Picker Modal for Comments */}
		<Modal isOpen={isFeelingModalOpen} onClose={onFeelingModalClose} isCentered size="lg">
			<ModalOverlay bg="blackAlpha.600" backdropFilter="blur(5px)" />
			<ModalContent borderRadius="xl">
				<ModalHeader borderBottom="1px solid" borderColor="gray.100" pb={4}>
					<Text fontSize="lg" fontWeight="bold">Add Expression</Text>
				</ModalHeader>
				<ModalCloseButton mt={1.5} />
				<ModalBody py={4}>
					{/* Current Selection Display */}
					{(commentFeeling || commentActivity) && (
						<Box p={3} bg="#E7F3FF" borderRadius="lg" border="1px solid #1877F2" mb={4}>
							<Text fontSize="sm" fontWeight="600" color="#1877F2" mb={2}>
								Selected:
							</Text>
							<Flex gap={2} flexWrap="wrap">
								{commentFeeling && (
									<Badge colorScheme="blue" fontSize="sm" px={3} py={1.5} borderRadius="full" display="flex" alignItems="center" gap={1}>
										{commentFeeling}
										<IconButton
											aria-label="Remove feeling"
											icon={<FiX />}
											size="xs"
											variant="ghost"
											color="blue.600"
											onClick={() => setCommentFeeling("")}
											ml={1}
											h="18px"
											minW="18px"
										/>
									</Badge>
								)}
								{commentActivity && (
									<Badge colorScheme="green" fontSize="sm" px={3} py={1.5} borderRadius="full" display="flex" alignItems="center" gap={1}>
										{commentActivity}
										<IconButton
											aria-label="Remove activity"
											icon={<FiX />}
											size="xs"
											variant="ghost"
											color="green.600"
											onClick={() => setCommentActivity("")}
											ml={1}
											h="18px"
											minW="18px"
										/>
									</Badge>
								)}
							</Flex>
						</Box>
					)}
					
					<Tabs colorScheme="blue" variant="soft-rounded" isFitted>
						<TabList mb={4} p={1} bg="gray.50" borderRadius="full">
							<Tab _selected={{ color: "white", bg: "blue.500" }} borderRadius="full" fontWeight="600">😊 Emojis</Tab>
							<Tab _selected={{ color: "white", bg: "blue.500" }} borderRadius="full" fontWeight="600">💭 Feelings</Tab>
							<Tab _selected={{ color: "white", bg: "blue.500" }} borderRadius="full" fontWeight="600">🎯 Activities</Tab>
						</TabList>
						
						<TabPanels>
							{/* Emoji Picker Tab */}
							<TabPanel p={0}>
								<Box display="flex" justifyContent="center">
									<EmojiPicker
										onEmojiClick={(emojiData: any) => {
											// Add emoji to comment feeling
											setCommentFeeling((prev) => prev ? `${prev} ${emojiData.emoji}` : emojiData.emoji)
										}}
										width="100%"
										height="350px"
										searchDisabled={false}
										skinTonesDisabled
									/>
								</Box>
							</TabPanel>
							
							{/* Feelings Tab */}
							<TabPanel p={0} maxH="350px" overflowY="auto">
								<SimpleGrid columns={2} spacing={2}>
									{FEELINGS.map((item) => (
										<Button
											key={item.label}
											variant="ghost"
											justifyContent="flex-start"
											onClick={() => setCommentFeeling(`${item.emoji} ${item.label}`)}
											bg={commentFeeling?.includes(item.label) ? "#E7F3FF" : "transparent"}
											_hover={{ bg: "#F0F2F5" }}
											py={6}
											h="auto"
											border="1px solid"
											borderColor={commentFeeling?.includes(item.label) ? "blue.200" : "transparent"}
										>
											<Flex align="center" gap={3}>
												<Text fontSize="3xl">{item.emoji}</Text>
												<Text fontSize="md" textTransform="capitalize" fontWeight="500">{item.label}</Text>
											</Flex>
										</Button>
									))}
								</SimpleGrid>
							</TabPanel>
							
							{/* Activities Tab */}
							<TabPanel p={0} maxH="350px" overflowY="auto">
								<SimpleGrid columns={2} spacing={2}>
									{ACTIVITIES.map((item) => (
										<Button
											key={item.label}
											variant="ghost"
											justifyContent="flex-start"
											onClick={() => setCommentActivity(`${item.emoji} ${item.label}`)}
											bg={commentActivity?.includes(item.label) ? "#D4EDDA" : "transparent"}
											_hover={{ bg: "#F0F2F5" }}
											py={6}
											h="auto"
											border="1px solid"
											borderColor={commentActivity?.includes(item.label) ? "green.200" : "transparent"}
										>
											<Flex align="center" gap={3}>
												<Text fontSize="3xl">{item.emoji}</Text>
												<Text fontSize="md" textTransform="capitalize" fontWeight="500">{item.label}</Text>
											</Flex>
										</Button>
									))}
								</SimpleGrid>
							</TabPanel>
						</TabPanels>
					</Tabs>
				</ModalBody>
				<ModalFooter borderTop="1px solid" borderColor="gray.100">
					<Button variant="ghost" mr={3} onClick={onFeelingModalClose}>
						Cancel
					</Button>
					<Button
						colorScheme="blue"
						onClick={onFeelingModalClose}
						px={8}
					>
						Done
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
		
		{/* Feeling/Activity/Emoji Picker Modal for Edit Post */}
		<Modal isOpen={isEditPostFeelingModalOpen} onClose={onEditPostFeelingModalClose} isCentered size="lg">
			<ModalOverlay bg="blackAlpha.600" backdropFilter="blur(5px)" />
			<ModalContent borderRadius="xl">
				<ModalHeader borderBottom="1px solid" borderColor="gray.100" pb={4}>
					<Text fontSize="lg" fontWeight="bold">Add Expression</Text>
				</ModalHeader>
				<ModalCloseButton mt={1.5} />
				<ModalBody py={4}>
					{/* Current Selection Display */}
					{(editPostFeeling || editPostActivity) && (
						<Box p={3} bg="#E7F3FF" borderRadius="lg" border="1px solid #1877F2" mb={4}>
							<Text fontSize="sm" fontWeight="600" color="#1877F2" mb={2}>
								Selected:
							</Text>
							<Flex gap={2} flexWrap="wrap">
								{editPostFeeling && (
									<Badge colorScheme="blue" fontSize="sm" px={3} py={1.5} borderRadius="full" display="flex" alignItems="center" gap={1}>
										{editPostFeeling}
										<IconButton
											aria-label="Remove feeling"
											icon={<FiX />}
											size="xs"
											variant="ghost"
											color="blue.600"
											onClick={() => setEditPostFeeling("")}
											ml={1}
											h="18px"
											minW="18px"
										/>
									</Badge>
								)}
								{editPostActivity && (
									<Badge colorScheme="green" fontSize="sm" px={3} py={1.5} borderRadius="full" display="flex" alignItems="center" gap={1}>
										{editPostActivity}
										<IconButton
											aria-label="Remove activity"
											icon={<FiX />}
											size="xs"
											variant="ghost"
											color="green.600"
											onClick={() => setEditPostActivity("")}
											ml={1}
											h="18px"
											minW="18px"
										/>
									</Badge>
								)}
							</Flex>
						</Box>
					)}
					
					<Tabs colorScheme="blue" variant="soft-rounded" isFitted>
						<TabList mb={4} p={1} bg="gray.50" borderRadius="full">
							<Tab _selected={{ color: "white", bg: "blue.500" }} borderRadius="full" fontWeight="600">😊 Emojis</Tab>
							<Tab _selected={{ color: "white", bg: "blue.500" }} borderRadius="full" fontWeight="600">💭 Feelings</Tab>
							<Tab _selected={{ color: "white", bg: "blue.500" }} borderRadius="full" fontWeight="600">🎯 Activities</Tab>
						</TabList>
						
						<TabPanels>
							{/* Emoji Picker Tab */}
							<TabPanel p={0}>
								<Box display="flex" justifyContent="center">
									<EmojiPicker
										onEmojiClick={(emojiData: any) => {
											setEditPostFeeling((prev) => prev ? `${prev} ${emojiData.emoji}` : emojiData.emoji)
										}}
										width="100%"
										height="350px"
										searchDisabled={false}
										skinTonesDisabled
									/>
								</Box>
							</TabPanel>
							
							{/* Feelings Tab */}
							<TabPanel p={0} maxH="350px" overflowY="auto">
								<SimpleGrid columns={2} spacing={2}>
									{FEELINGS.map((item) => (
										<Button
											key={item.label}
											variant="ghost"
											justifyContent="flex-start"
											onClick={() => setEditPostFeeling(`${item.emoji} ${item.label}`)}
											bg={editPostFeeling?.includes(item.label) ? "#E7F3FF" : "transparent"}
											_hover={{ bg: "#F0F2F5" }}
											py={6}
											h="auto"
											border="1px solid"
											borderColor={editPostFeeling?.includes(item.label) ? "blue.200" : "transparent"}
										>
											<Flex align="center" gap={3}>
												<Text fontSize="3xl">{item.emoji}</Text>
												<Text fontSize="md" textTransform="capitalize" fontWeight="500">{item.label}</Text>
											</Flex>
										</Button>
									))}
								</SimpleGrid>
							</TabPanel>
							
							{/* Activities Tab */}
							<TabPanel p={0} maxH="350px" overflowY="auto">
								<SimpleGrid columns={2} spacing={2}>
									{ACTIVITIES.map((item) => (
										<Button
											key={item.label}
											variant="ghost"
											justifyContent="flex-start"
											onClick={() => setEditPostActivity(`${item.emoji} ${item.label}`)}
											bg={editPostActivity?.includes(item.label) ? "#D4EDDA" : "transparent"}
											_hover={{ bg: "#F0F2F5" }}
											py={6}
											h="auto"
											border="1px solid"
											borderColor={editPostActivity?.includes(item.label) ? "green.200" : "transparent"}
										>
											<Flex align="center" gap={3}>
												<Text fontSize="3xl">{item.emoji}</Text>
												<Text fontSize="md" textTransform="capitalize" fontWeight="500">{item.label}</Text>
											</Flex>
										</Button>
									))}
								</SimpleGrid>
							</TabPanel>
						</TabPanels>
					</Tabs>
				</ModalBody>
				<ModalFooter borderTop="1px solid" borderColor="gray.100">
					<Button variant="ghost" mr={3} onClick={onEditPostFeelingModalClose}>
						Cancel
					</Button>
					<Button
						colorScheme="blue"
						onClick={onEditPostFeelingModalClose}
						px={8}
					>
						Done
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
			{/* Login Modal */}
			<LoginModal
				isOpen={isLoginModalOpen}
				onClose={() => setIsLoginModalOpen(false)}
			/>
		</>
	)
}

export default DiscussionPostView

import React, { useState, useRef, useEffect, useMemo } from "react"
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
import axios from "axios"
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
	FiFlag,
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
	GetPostReactionsApi,
	GetCommentReactionsApi,
	GetPostViewersApi,
	ReportDiscussionPostApi,
	ReportDiscussionCommentApi,
} from "@/services/events/discussionApis"
import type { DiscussionPostWithAuthor, DiscussionCommentWithAuthor } from "@/types/discussion"
import { useRouter } from "next/router"
import LoginModal from "@/components/misc/LoginModal"
import ReactionsListModal from "@/components/events/ReactionsListModal"

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

const RenderContent = ({ content }: { content: string }) => {
	const parts = parseMentions(content);
	return (
		<Text color="white" fontSize="sm" whiteSpace="pre-wrap">
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

interface DiscussionPostViewProps {
	postId: string
	eventId: string
	isModalView?: boolean
	commentsOnly?: boolean
	onClose?: () => void
	openInEditMode?: boolean
}

interface CommentItemProps {
	comment: DiscussionCommentWithAuthor
	groupedComments: Record<string, DiscussionCommentWithAuthor[]>
	currentUserId: string | undefined
	onReply: (commentId: string, text: string) => void
	onEdit: (commentId: string, text: string, images?: string[]) => void
	onDelete: (commentId: string) => void
	onReact: (commentId: string) => void
	onShowCommentLikes: (commentId: string) => void
	onReport: (commentId: string) => void
	isLocked: boolean
	onLoginRequired?: () => void
}

const CommentItem: React.FC<CommentItemProps> = ({ comment, groupedComments, currentUserId, onReply, onEdit, onDelete, onReact, onShowCommentLikes, onReport, isLocked, onLoginRequired }) => {
	const [replyText, setReplyText] = useState("")
	const [editText, setEditText] = useState(comment.comment)
	const [showReply, setShowReply] = useState(false)
	const [isEditing, setIsEditing] = useState(false)
	const [replyImages, setReplyImages] = useState<string[]>([])
	const [replyFeeling, setReplyFeeling] = useState<string>("")
	const [replyActivity, setReplyActivity] = useState<string>("")
	const [uploadingReplyImages, setUploadingReplyImages] = useState(false)
	const isReplySubmitting = useRef(false)

	const [editImages, setEditImages] = useState<string[]>([])
	const [editFeeling, setEditFeeling] = useState<string>("")
	const [editActivity, setEditActivity] = useState<string>("")
	const [uploadingEditImages, setUploadingEditImages] = useState(false)

	const replyFileInputRef = useRef<HTMLInputElement>(null)

	// Tagging states for reply
	const [mentionSearch, setMentionSearch] = useState("")
	const [showMentionDropdown, setShowMentionDropdown] = useState(false)
	const [cursorPosition, setCursorPosition] = useState(0)
	const [participants, setParticipants] = useState<any[]>([])

	useEffect(() => {
		if (showReply && comment.eventId) {
			axios.get(`/api/events/${comment.eventId}/participants`)
				.then(res => setParticipants(res.data?.data || []))
				.catch(err => console.error("Error fetching participants:", err))
		}
	}, [showReply, comment.eventId])

	const filteredParticipants = useMemo(() => {
		let results = participants;
		if (mentionSearch) {
			results = participants.filter((p: any) =>
				p.name.toLowerCase().includes(mentionSearch.toLowerCase()) ||
				p.email.toLowerCase().includes(mentionSearch.toLowerCase())
			)
		}

		// Check if mentionSearch triggers email format
		if (mentionSearch && mentionSearch.includes('@') && mentionSearch.includes('.')) {
			// Check if already in results
			const requestEmail = mentionSearch.toLowerCase();
			const exists = results.some((p: any) => p.email.toLowerCase() === requestEmail);
			if (!exists) {
				// Add a "Invite <email>" option
				return [...results, {
					id: `email:${requestEmail}`,
					name: "Guest",
					email: requestEmail,
					isExternal: true
				}]
			}
		}

		return results;
	}, [participants, mentionSearch])

	const handleReplyContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		const value = e.target.value
		const pos = e.target.selectionStart
		setReplyText(value)
		setCursorPosition(pos)

		const textBeforeCursor = value.substring(0, pos)
		const words = textBeforeCursor.split(/\s/)
		const lastWord = words[words.length - 1]

		if (lastWord.startsWith("@")) {
			setMentionSearch(lastWord.substring(1))
			setShowMentionDropdown(true)
		} else {
			setShowMentionDropdown(false)
		}
	}

	const handleSelectMention = (participant: any) => {
		const textBeforeCursor = replyText.substring(0, cursorPosition)
		const textAfterCursor = replyText.substring(cursorPosition)

		const words = textBeforeCursor.split(/\s/)

		let mentionText = `@[${participant.name}](${participant.id}) `;
		if (participant.isExternal) {
			mentionText = `@[${participant.email}](${participant.email}) `;
		}

		words[words.length - 1] = mentionText

		const newContent = words.join(" ") + textAfterCursor
		setReplyText(newContent)
		setShowMentionDropdown(false)

		// Focus back on textarea
		setTimeout(() => {
			const textarea = document.getElementById(`reply-textarea-${comment._id}`) as HTMLTextAreaElement
			if (textarea) {
				textarea.focus()
				const newPos = words.join(" ").length
				textarea.setSelectionRange(newPos, newPos)
			}
		}, 10)
	}

	const editFileInputRef = useRef<HTMLInputElement>(null)
	const { data: session } = useSession()
	const { edgestore } = useEdgeStore()
	const router = useRouter()
	const { isOpen: isReplyFeelingModalOpen, onOpen: onReplyFeelingModalOpen, onClose: onReplyFeelingModalClose } = useDisclosure()
	const { isOpen: isEditFeelingModalOpen, onOpen: onEditFeelingModalOpen, onClose: onEditFeelingModalClose } = useDisclosure()

	const isAuthor = currentUserId === comment.userId?._id
	const hasLiked = (comment.reactions?.like || (comment.reactions as any)?.likes || []).some((id: any) => id?.toString() === (currentUserId || ""))
	// Check if user is logged in (ticket requirement removed)
	const canReply = !!session && !!session.user
	// @ts-ignore
	const userRole = session?.user?.role
	const isAdmin = userRole === "admin" || userRole === "super admin"

	const handleReplyImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files
		if (!files || files.length === 0) return

		setUploadingReplyImages(true)
		try {
			const uploadPromises = Array.from(files).map(async (file) => {
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
		if (isReplySubmitting.current) return
		if (!session || !session.user) {
			const currentPath = window.location.pathname + window.location.search
			router.push(`/login?_cb=${encodeURIComponent(currentPath)}`)
			return
		}
		if (!canReply) {
			if (onLoginRequired) {
				onLoginRequired()
			}
			return
		}
		if (replyText.trim() || replyImages.length > 0 || replyFeeling || replyActivity) {
			isReplySubmitting.current = true
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
			// Reset after a short delay to allow the mutation to fire
			setTimeout(() => { isReplySubmitting.current = false }, 1000)
		}
	}

	const handleEditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files
		if (!files || files.length === 0) return

		setUploadingEditImages(true)
		try {
			const uploadPromises = Array.from(files).map(async (file) => {
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
			<Box p={2} bg="#2b2b2b" borderRadius="lg" mb={2}>
				<Text color="#bbbbbb" fontSize="sm" fontStyle="italic">
					[Comment deleted]
				</Text>
			</Box>
		)
	}

	return (
		<Box mb={2} overflow="hidden">
			<Flex gap={2} align="start" minW={0}>
				<Avatar size="sm" name={comment.userId ? (`${comment.userId.firstName || ""} ${comment.userId.lastName || ""}`.trim() || comment.userId.email?.split("@")[0] || "User") : "Deleted User"} src={comment.userId?.image || ""} />

				<Box flex="1" minW={0}>
					<Box bg="#2b2b2b" borderRadius="2xl" px={{ base: 2, md: 3 }} py={{ base: 1.5, md: 2 }} width="fit-content" mb={1} maxW="100%">
						<Text fontWeight="600" fontSize="sm" color="white">
							{comment.userId ? (`${comment.userId.firstName || ""} ${comment.userId.lastName || ""}`.trim() || comment.userId.email?.split("@")[0] || "User") : "Deleted User"}
						</Text>

						{isEditing ? (
							<Box mt={2} minW="300px" bg="#1E1E1E" p={3} borderRadius="lg" border="1px solid" borderColor="#434343">
								<Textarea
									value={editText}
									onChange={(e) => setEditText(e.target.value)}
									bg="#2b2b2b"
									color="white"
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
										color={editImages.length > 0 ? "#1877F2" : "#bbbbbb"}
										onClick={() => editFileInputRef.current?.click()}
										isLoading={uploadingEditImages}
										_hover={{ bg: "whiteAlpha.100" }}
									/>
									<IconButton
										aria-label="Add feeling/activity"
										icon={<Text fontSize="md">😊</Text>}
										size="xs"
										variant="ghost"
										color={editFeeling || editActivity ? "#1877F2" : "#bbbbbb"}
										onClick={onEditFeelingModalOpen}
										_hover={{ bg: "whiteAlpha.100" }}
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
									<ModalContent borderRadius="xl" bg="#1E1E1E">
										<ModalHeader borderBottom="1px solid" borderColor="#434343" pb={3} color="white">
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
																	bg={editFeeling?.includes(item.label) ? "#3a3a3a" : "transparent"}
																	_hover={{ bg: "#2b2b2b" }}
																	color="white"
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
								<RenderContent content={comment.comment} />

								{/* Comment Images */}
								{comment.images && comment.images.length > 0 && (
									<Box mt={2}>
										{comment.images.length === 1 ? (
											<Box position="relative" borderRadius="md" overflow="hidden" maxW="100%" display="flex">
												{comment.images && comment.images.length > 0 && comment.images[0] && comment.images[0].trim() !== "" && (
													<>
														{isVideoUrl(comment.images[0]) ? (
															<video
																src={comment.images[0]}
																controls
																style={{ width: "100%", maxHeight: "300px", objectFit: "contain", backgroundColor: "#000", borderRadius: "8px" }}
															/>
														) : (
															<Image
																src={comment.images[0]}
																alt="Comment image"
																width={0}
																height={0}
																sizes="100vw"
																style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '400px', objectFit: "contain", borderRadius: "8px" }}
															/>
														)}
													</>
												)}
											</Box>
										) : (
											<SimpleGrid columns={2} spacing={1} maxW="300px">
												{comment.images.slice(0, 4).map((img: string, idx: number) => (
													<Box key={idx} position="relative" w="full" h="100px" borderRadius="md" overflow="hidden" bg="black">
														{isVideoUrl(img) ? (
															<video
																src={img}
																style={{ width: "100%", height: "100%", objectFit: "contain" }}
															/>
														) : (
															<Image
																src={img}
																alt={`Comment image ${idx + 1}`}
																fill
																sizes="(max-width: 768px) 50vw, 33vw"
																style={{ objectFit: "contain" }}
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

					<Flex gap={3} fontSize="xs" color="#bbbbbb" fontWeight="600" px={2} mb={2} align="center">
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
						<Text fontWeight="normal" color="#bbbbbb">
							{new Date(comment.createdAt).toLocaleDateString(undefined, { hour: '2-digit', minute: '2-digit' })}
						</Text>
						<Text
							cursor="pointer"
							_hover={{ textDecoration: "underline" }}
							color="red.400"
							onClick={() => window.confirm("Report this comment? It will be hidden for everyone.") && onReport(comment._id)}
						>
							Report
						</Text>
						{(comment.reactions?.like?.length || (comment.reactions as any)?.likes?.length || 0) > 0 && (
							<Flex
								align="center"
								gap={1}
								ml={1}
								cursor="pointer"
								_hover={{ opacity: 0.8 }}
								onClick={() => onShowCommentLikes(comment._id)}
							>
								<Box bg="#1877F2" borderRadius="full" p="2px">
									<Icon as={FiThumbsUp} color="white" boxSize="8px" />
								</Box>
								<Text color="#65676B">{comment.reactions?.like?.length || (comment.reactions as any)?.likes?.length || 0}</Text>
							</Flex>
						)}
					</Flex>

					{showReply && !isLocked && (
						<Box mb={3}>
							<Flex gap={2} align="flex-start">
								<Avatar size="xs" src={session?.user?.image || ""} name={(session?.user as any)?.name || (session?.user as any)?.fullName || "User"} mt={1} />
								<Box flex="1">
									<Flex gap={2} align="center">
										<Box flex="1" position="relative">
											<Textarea
												id={`reply-textarea-${comment._id}`}
												placeholder="Write a reply..."
												value={replyText}
												onChange={handleReplyContentChange}
												bg="#2b2b2b"
												color="white"
												border="none"
												borderRadius="2xl"
												_focus={{ bg: "#2b2b2b", boxShadow: "none" }}
												minH="36px"
												py={1.5}
												px={3}
												resize="none"
												fontSize="sm"
												onKeyDown={(e) => {
													if (e.key === 'Enter' && !e.shiftKey) {
														if (!showMentionDropdown) {
															e.preventDefault();
															if (!session || !session.user) {
																const currentPath = window.location.pathname + window.location.search
																router.push(`/login?_cb=${encodeURIComponent(currentPath)}`)
																return
															}
															handleReplySubmit();
														}
													}
												}}
											/>
											{showMentionDropdown && filteredParticipants.length > 0 && (
												<Box
													position="absolute"
													bottom="100%"
													left="0"
													width="100%"
													maxH="150px"
													overflowY="auto"
													bg="gray.800"
													boxShadow="xl"
													borderRadius="md"
													zIndex="10"
													border="1px solid"
													borderColor="gray.700"
													mb="1"
												>
													<VStack align="stretch" spacing="0">
														{filteredParticipants.map((p: any) => (
															<Box
																key={p.id}
																p="2"
																cursor="pointer"
																_hover={{ bg: "gray.700" }}
																onClick={() => handleSelectMention(p)}
																borderBottom="1px solid"
																borderColor="gray.700"
															>
																<HStack spacing="2">
																	<Avatar size="2xs" name={p.name} />
																	<VStack align="start" spacing="0">
																		<Text fontSize="xs" fontWeight="bold">{p.name}</Text>
																		<Text fontSize="2xs" color="gray.400">{p.email}</Text>
																	</VStack>
																</HStack>
															</Box>
														))}
													</VStack>
												</Box>
											)}
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

				<Menu>
					<MenuButton as={IconButton} icon={<FiMoreHorizontal />} size="xs" variant="ghost" borderRadius="full" color="white" aria-label="More options" />
					<MenuList bg="#1E1E1E" border="1px solid" borderColor="#434343">
						{isAuthor && (
							<MenuItem
								bg="#1E1E1E"
								color="white"
								_hover={{ bg: "#2b2b2b" }}
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
							<MenuItem
								bg="#1E1E1E"
								color="red.500"
								_hover={{ bg: "#2b2b2b" }}
								icon={<FiTrash2 />}
								onClick={() => onDelete(comment._id)}
							>
								Delete
							</MenuItem>
						)}
						<MenuItem
							bg="#1E1E1E"
							color="white"
							_hover={{ bg: "#2b2b2b" }}
							icon={<FiFlag />}
							onClick={() => window.confirm("Report this comment? It will be hidden for everyone.") && onReport(comment._id)}
						>
							Report
						</MenuItem>
					</MenuList>
				</Menu>
			</Flex>

			{/* Nested Replies — flatten all descendants to avoid infinite nesting */}
			{groupedComments[comment._id]?.length > 0 && (() => {
				const collectDescendants = (parentId: string): DiscussionCommentWithAuthor[] => {
					const children = groupedComments[parentId] || []
					return children.flatMap(child => [child, ...collectDescendants(child._id)])
				}
				const allReplies = collectDescendants(comment._id)
				return (
					<Box pl={{ base: 6, md: 10 }} mt={1} overflowX="hidden">
						<Stack spacing={2}>
							{allReplies.map((reply) => (
								<CommentItem
									key={reply._id}
									comment={reply}
									groupedComments={{}}
									currentUserId={currentUserId}
									onReply={onReply}
									onEdit={onEdit}
									onDelete={onDelete}
									onReact={onReact}
									onShowCommentLikes={onShowCommentLikes}
									onReport={onReport}
									isLocked={isLocked}
								/>
							))}
						</Stack>
					</Box>
				)
			})()}
		</Box>
	)
}

const DiscussionPostView: React.FC<DiscussionPostViewProps> = ({ postId, eventId, isModalView = false, commentsOnly = false, onClose, openInEditMode = false }) => {
	const { data: session } = useSession()
	const router = useRouter()
	const toast = useToast()
	const [newComment, setNewComment] = useState("")
	const [commentImages, setCommentImages] = useState<string[]>([])
	const [uploadingImages, setUploadingImages] = useState(false)
	const [commentFeeling, setCommentFeeling] = useState<string>("")
	const [commentActivity, setCommentActivity] = useState<string>("")

	// Tagging states for new comment
	const [mentionSearch, setMentionSearch] = useState("")
	const [showMentionDropdown, setShowMentionDropdown] = useState(false)
	const [cursorPosition, setCursorPosition] = useState(0)

	// Fetch participants for tagging
	const { data: participants = [] } = useQuery({
		queryKey: ["event-participants", eventId],
		queryFn: async () => {
			const res = await axios.get(`/api/events/${eventId}/participants`)
			return res.data?.data || []
		},
		enabled: !!eventId
	})

	const filteredParticipants = useMemo(() => {
		let results = participants;
		if (mentionSearch) {
			results = participants.filter((p: any) =>
				p.name.toLowerCase().includes(mentionSearch.toLowerCase()) ||
				p.email.toLowerCase().includes(mentionSearch.toLowerCase())
			)
		}

		// Check if mentionSearch triggers email format
		if (mentionSearch && mentionSearch.includes('@') && mentionSearch.includes('.')) {
			// Check if already in results
			const requestEmail = mentionSearch.toLowerCase();
			const exists = results.some((p: any) => p.email.toLowerCase() === requestEmail);
			if (!exists) {
				// Add a "Invite <email>" option
				return [...results, {
					id: `email:${requestEmail}`,
					name: "Guest",
					email: requestEmail,
					isExternal: true
				}]
			}
		}

		return results;
	}, [participants, mentionSearch])

	const [isEditingPost, setIsEditingPost] = useState(false)
	const [editPostContent, setEditPostContent] = useState("")
	const [editPostImages, setEditPostImages] = useState<string[]>([])
	const [editPostFeeling, setEditPostFeeling] = useState<string>("")
	const [editPostActivity, setEditPostActivity] = useState<string>("")

	// Reactions and viewers modal states
	const [showLikesModal, setShowLikesModal] = useState(false)
	const [showViewersModal, setShowViewersModal] = useState(false)
	const [showCommentLikesModal, setShowCommentLikesModal] = useState(false)
	const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null)
	const [likesList, setLikesList] = useState<any[]>([])
	const [viewersList, setViewersList] = useState<any[]>([])
	const [commentLikesList, setCommentLikesList] = useState<any[]>([])
	const [loadingReactions, setLoadingReactions] = useState(false)
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
	const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

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

	const reportPostMutation = useMutation({
		mutationFn: () => ReportDiscussionPostApi({ data: { postId } }),
		onSuccess: () => {
			toast({ title: "Post reported and hidden", status: "success", duration: 2000 })
			if (isModalView && onClose) {
				onClose()
			} else if (!isModalView) {
				router.push(`/console/events/${eventId}/manage`)
			}
		},
	})

	const reportCommentMutation = useMutation({
		mutationFn: (commentId: string) => ReportDiscussionCommentApi({ data: { commentId } }),
		onSuccess: () => {
			refetchComments()
			refetchPost()
			toast({ title: "Comment reported and hidden", status: "success", duration: 2000 })
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
	})

	const liveUpdatePostImagesMutation = useMutation({
		mutationFn: (newImages: string[]) => {
			let finalContent = editPostContent
			if (editPostFeeling || editPostActivity) {
				const feelingText = editPostFeeling ? `${editPostFeeling}` : ""
				const activityText = editPostActivity ? `${editPostActivity}` : ""
				const separator = editPostFeeling && editPostActivity ? " · " : ""
				finalContent = `${editPostContent}\n${feelingText}${separator}${activityText}`
			}
			return UpdateDiscussionPostApi({ data: { postId, content: finalContent, images: newImages } })
		},
		onSuccess: () => {
			refetchPost()
			toast({ title: "Images updated", status: "success", duration: 1000 })
		},
		onError: (error: any) => {
			console.error("❌ Live update post images error:", error)
			toast({ title: "Live update failed", description: error.message, status: "error", duration: 3000 })
		}
	})

	const handleEditPostImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files
		if (!files || files.length === 0) return

		setUploadingEditImages(true)
		try {
			const uploadPromises = Array.from(files).map(async (file) => {
				const res = await edgestore.publicFiles.upload({ file })
				return res.url
			})

			const urls = await Promise.all(uploadPromises)
			const newImages = [...editPostImages, ...urls];
			setEditPostImages(newImages)
			// Immediate update as requested
			liveUpdatePostImagesMutation.mutate(newImages);
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

	// Handlers for reactions and viewers modals
	const handleShowLikes = async () => {
		setLoadingReactions(true)
		setShowLikesModal(true)
		try {
			const response = await GetPostReactionsApi({ data: { postId, reactionType: "like" } })
			setLikesList(response.data || [])
		} catch (error) {
			console.error("Error fetching likes:", error)
		} finally {
			setLoadingReactions(false)
		}
	}

	const handleShowViewers = async () => {
		setLoadingReactions(true)
		setShowViewersModal(true)
		try {
			const response = await GetPostViewersApi({ data: { postId } })
			setViewersList(response.data || [])
		} catch (error) {
			console.error("Error fetching viewers:", error)
		} finally {
			setLoadingReactions(false)
		}
	}

	const handleShowCommentLikes = async (commentId: string) => {
		setLoadingReactions(true)
		setSelectedCommentId(commentId)
		setShowCommentLikesModal(true)
		try {
			const response = await GetCommentReactionsApi({ data: { commentId } })
			setCommentLikesList(response.data || [])
		} catch (error) {
			console.error("Error fetching comment likes:", error)
		} finally {
			setLoadingReactions(false)
		}
	}

	const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		if (!session || !session.user) {
			setIsLoginModalOpen(true)
			return
		}

		const value = e.target.value
		const pos = e.target.selectionStart
		setNewComment(value)
		setCursorPosition(pos)

		const textBeforeCursor = value.substring(0, pos)
		const words = textBeforeCursor.split(/\s/)
		const lastWord = words[words.length - 1]

		if (lastWord.startsWith("@")) {
			setMentionSearch(lastWord.substring(1))
			setShowMentionDropdown(true)
		} else {
			setShowMentionDropdown(false)
		}
	}

	const handleSelectMention = (participant: any) => {
		const textBeforeCursor = newComment.substring(0, cursorPosition)
		const textAfterCursor = newComment.substring(cursorPosition)

		const words = textBeforeCursor.split(/\s/)

		let mentionText = `@[${participant.name}](${participant.id}) `;
		if (participant.isExternal) {
			mentionText = `@[${participant.email}](${participant.email}) `;
		}

		words[words.length - 1] = mentionText

		const newContent = words.join(" ") + textAfterCursor
		setNewComment(newContent)
		setShowMentionDropdown(false)

		// Focus back on textarea
		setTimeout(() => {
			const textarea = document.getElementById("commentInput") as HTMLTextAreaElement
			if (textarea) {
				textarea.focus()
				const newPos = words.join(" ").length
				textarea.setSelectionRange(newPos, newPos)
			}
		}, 10)
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

	if (isLoadingPost && !commentsOnly) {
		return (
			<Flex justify="center" align="center" h="400px">
				<ChakraSpinner size="xl" color="#1877F2" />
			</Flex>
		)
	}

	if (!post && !commentsOnly) {
		return (
			<Box p={6} textAlign="center">
				<Text>Post not found</Text>
			</Box>
		)
	}

	const isAuthor = currentUserId === post?.userId?._id
	const hasLiked = (post?.reactions?.like || (post?.reactions as any)?.likes || []).some((id: any) => id?.toString() === (currentUserId || ""))
	const hasMarkedHelpful = (post?.reactions?.helpful || []).some((id: any) => id?.toString() === (currentUserId || ""))

	return (
		<>
			<Box
				bg={isModalView ? "transparent" : "#1E1E1E"}
				borderRadius={isModalView ? "none" : "2xl"}
				border={isModalView ? "none" : "1px solid #434343"}
				p={commentsOnly ? { base: 2, md: 3 } : { base: 2, md: 6 }}
				pt={isModalView ? { base: 10, md: 12 } : { base: 4, md: 6 }}
				boxShadow={isModalView ? "none" : "sm"}
			>
				{!commentsOnly && post && (
				<>
				{/* Post Header */}
				<Flex justify="space-between" align="start" mb={4}>
					<Flex align="center" gap={3}>
						<Avatar name={post.userId ? (`${post.userId.firstName || ""} ${post.userId.lastName || ""}`.trim() || post.userId.email?.split("@")[0] || "User") : "Deleted User"} src={post.userId?.image || ""} size="md" />
						<Box>
							<Heading size="md" color="white">
								{post.userId ? (`${post.userId.firstName || ""} ${post.userId.lastName || ""}`.trim() || post.userId.email?.split("@")[0] || "User") : "Deleted User"}
							</Heading>
							<Flex align="center" gap={2} fontSize="sm" color="#bbbbbb">
								<Text>{new Date(post.createdAt).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })}</Text>
								{post.isPinned && (
									<>
										<Text>·</Text>
										<Icon as={BsPinAngleFill} color="#1877F2" />
										<Text color="#1877F2" fontWeight="600">Pinned</Text>
									</>
								)}
								{post?.isLocked && (
									<>
										<Text>·</Text>
										<Icon as={FiLock} color="#E41E3F" />
									</>
								)}
							</Flex>
						</Box>
					</Flex>

					<Menu>
						<MenuButton as={IconButton} icon={<FiMoreHorizontal />} variant="ghost" color="white" aria-label="More options" />
						<MenuList bg="#1E1E1E" border="1px solid" borderColor="#434343">
							{isAuthor && (
								<MenuItem
									bg="#1E1E1E"
									color="white"
									_hover={{ bg: "#2b2b2b" }}
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
								<MenuItem
									bg="#1E1E1E"
									color="red.500"
									_hover={{ bg: "#2b2b2b" }}
									icon={<FiTrash2 />}
									onClick={() => window.confirm("Delete this post?") && deletePostMutation.mutate()}
								>
									Delete Post
								</MenuItem>
							)}
							{isAdmin && (
								<>
									<MenuItem
										bg="#1E1E1E"
										color="white"
										_hover={{ bg: "#2b2b2b" }}
										icon={post.isPinned ? <BsPinAngle /> : <BsPinAngleFill />}
										onClick={() => pinPostMutation.mutate(!post.isPinned)}
									>
										{post.isPinned ? "Unpin" : "Pin"} Post
									</MenuItem>
									<MenuItem
										bg="#1E1E1E"
										color="white"
										_hover={{ bg: "#2b2b2b" }}
										icon={post?.isLocked ? <FiUnlock /> : <FiLock />}
										onClick={() => lockPostMutation.mutate(!post?.isLocked)}
									>
										{post?.isLocked ? "Unlock" : "Lock"} Discussion
									</MenuItem>
								</>
							)}
							<MenuItem
								bg="#1E1E1E"
								color="white"
								_hover={{ bg: "#2b2b2b" }}
								icon={<FiFlag />}
								onClick={() => window.confirm("Report this post? It will be hidden for everyone.") && reportPostMutation.mutate()}
							>
								Report Post
							</MenuItem>
						</MenuList>
					</Menu>
				</Flex>

				{/* Post Content */}
				<Box mb={4}>
					{isEditingPost ? (
						<Box bg="#1E1E1E" p={4} borderRadius="lg" border="1px solid" borderColor="#434343">
							<Textarea
								value={editPostContent}
								onChange={(e) => setEditPostContent(e.target.value)}
								bg="#2b2b2b"
								color="white"
								border="1px solid"
								borderColor="#434343"
								borderRadius="lg"
								minH="150px"
								fontSize="md"
								mb={3}
								_focus={{ borderColor: "blue.500", boxShadow: "0 0 0 1px #jetzy" }}
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
								<Box mb={3}>
									{editPostImages.length === 1 ? (
										<Box position="relative" w="full" bg="#000" borderRadius="lg" overflow="hidden" display="flex" justifyContent="center">
											{isVideoUrl(editPostImages[0]) ? (
												<video
													src={editPostImages[0]}
													controls
													style={{ width: "100%", maxHeight: "500px", objectFit: "contain", backgroundColor: "#000" }}
												/>
											) : (
												<Image
													src={editPostImages[0]}
													alt="Edit image 1"
													width={0}
													height={0}
													sizes="100vw"
													style={{ width: '100%', height: 'auto', maxHeight: '500px', objectFit: "contain" }}
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
												onClick={() => {
													setEditPostImages([])
													liveUpdatePostImagesMutation.mutate([]);
												}}
											/>
										</Box>
									) : (
										<SimpleGrid columns={editPostImages.length === 2 ? 2 : 2} spacing={2}>
											{editPostImages.map((url, index) => (
												<Box key={index} position="relative" w="full" h="200px" borderRadius="lg" overflow="hidden" border="1px solid #E4E6EB" bg="black">
													{isVideoUrl(url) ? (
														<video
															src={url}
															style={{ width: "100%", height: "100%", objectFit: "contain" }}
														/>
													) : (
														<Image
															src={url}
															alt={`Edit image ${index + 1}`}
															fill
															style={{ objectFit: "contain" }}
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
														onClick={() => {
															const newImages = editPostImages.filter((_, i) => i !== index);
															setEditPostImages(newImages);
															liveUpdatePostImagesMutation.mutate(newImages);
														}}
													/>
												</Box>
											))}
										</SimpleGrid>
									)}
								</Box>
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
						<RenderContent content={post.content} />
					)}
				</Box>

				{/* Images/Videos */}
				{post.images && post.images.length > 0 && post.images[0] && post.images[0].trim() !== "" && (
					<Box mb={4} borderRadius="lg" overflow="hidden">
						{post.images.filter((img: string) => img && img.trim() !== "").length === 1 ? (
							<Box position="relative" w="full" bg="#000" display="flex" justifyContent="center">
								{isVideoUrl(post.images[0]) ? (
									<video
										src={post.images[0]}
										controls
										style={{ width: "100%", maxHeight: "600px", objectFit: "contain", backgroundColor: "#000" }}
									/>
								) : (
									<Image
										src={post.images[0]}
										alt="Post image"
										width={0}
										height={0}
										sizes="100vw"
										style={{ width: '100%', height: 'auto', maxHeight: '600px', objectFit: "contain", cursor: 'zoom-in' }}
										onClick={() => setLightboxSrc(post.images![0])}
									/>
								)}
							</Box>
						) : (
							<SimpleGrid columns={post.images.filter((img: string) => img && img.trim() !== "").length === 2 ? 2 : 2} spacing={2}>
								{post.images.filter((img: string) => img && img.trim() !== "").map((img: string, idx: number) => (
									<Box key={idx} position="relative" w="full" h="300px" bg="#000">
										{isVideoUrl(img) ? (
											<video
												src={img}
												controls
												style={{ width: "100%", height: "100%", objectFit: "contain" }}
											/>
										) : (
											<Image
												src={img}
												alt={`Post image ${idx + 1}`}
												fill
												sizes="(max-width: 768px) 100vw, 50vw"
												style={{ objectFit: "contain", cursor: 'zoom-in' }}
												onClick={() => setLightboxSrc(img)}
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
				<Flex justify="space-between" align="center" py={2} borderBottom="1px solid #434343" fontSize="sm" color="#bbbbbb">
					<Flex align="center" gap={1}>
						{(post.reactions?.like?.length || (post.reactions as any)?.likes?.length || 0) > 0 && (
							<Flex
								align="center"
								gap={1}
								cursor="pointer"
								_hover={{ opacity: 0.8 }}
								onClick={handleShowLikes}
							>
								<Box bg="#jetzy" borderRadius="full" p="3px" display="flex" alignItems="center" justifyContent="center">
									<Icon as={BsHandThumbsUpFill} color="white" boxSize="10px" />
								</Box>
								<Text>{post.reactions?.like?.length || (post.reactions as any)?.likes?.length || 0}</Text>
							</Flex>
						)}
					</Flex>
					<Flex gap={3}>
						<Text>{post.commentCount} Comments</Text>
						{isAdmin && (
							<Text
								cursor="pointer"
								_hover={{ textDecoration: "underline" }}
								onClick={handleShowViewers}
							>
								{post.viewCount} Views
							</Text>
						)}
					</Flex>
				</Flex>

				{/* Action Buttons - Facebook Style */}
				<Flex py={1} borderBottom="1px solid #434343" mb={4} justify="space-between">
					<Button
						flex="1"
						variant="ghost"
						leftIcon={hasLiked ? <Icon as={FiThumbsUp} fill="#1877F2" color="#1877F2" /> : <FiThumbsUp />}
						color={hasLiked ? "#1877F2" : "#bbbbbb"}
						fontWeight="600"
						onClick={() => reactToPostMutation.mutate("like")}
						_hover={{ bg: "whiteAlpha.100", color: "white" }}
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
						color="#bbbbbb"
						fontWeight="600"
						_hover={{ bg: "whiteAlpha.100", color: "white" }}
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
						color="#bbbbbb"
						fontWeight="600"
						_hover={{ bg: "whiteAlpha.100", color: "white" }}
						onClick={async () => {
							const postUrl = `${window.location.origin}/console/events/${eventId}/discussion/${postId}`
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
					<Button
						flex="1"
						variant="ghost"
						leftIcon={<FiFlag />}
						color="red.400"
						fontWeight="600"
						_hover={{ bg: "whiteAlpha.100", color: "red.300" }}
						onClick={() => window.confirm("Report this post? It will be hidden for everyone.") && reportPostMutation.mutate()}
						height="36px"
						fontSize="md"
						borderRadius="md"
					>
						Report
					</Button>
				</Flex>
				</>
				)} {/* end !commentsOnly */}

				{/* Comments Section */}
				<Box>
					{/* New Comment Input - Always visible */}
					{!post?.isLocked && (
						<Box mb={4}>
							<Flex gap={2} align="flex-start">
								{session && session.user ? (
									<Avatar size="sm" name={session.user?.name || (session.user as any)?.fullName || "User"} src={session.user?.image || ""} mt={1} />
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
												onChange={handleCommentChange}
												onClick={() => {
													if (!session || !session.user) {
														const currentPath = window.location.pathname + window.location.search
														router.push(`/login?_cb=${encodeURIComponent(currentPath)}`)
													}
												}}
												bg="#2b2b2b"
												border="none"
												borderRadius="2xl"
												_focus={{ bg: "#2b2b2b", boxShadow: "none" }}
												color="white"
												minH="40px"
												py={2}
												px={3}
												resize="none"
												fontSize="sm"
												onKeyDown={(e) => {
													// Allow Enter to submit if dropdown is NOT open
													if (e.key === 'Enter' && !e.shiftKey) {
														if (!showMentionDropdown) {
															e.preventDefault();
															if (createCommentMutation.isPending) return;
															if (!session || !session.user) {
																const currentPath = window.location.pathname + window.location.search
																router.push(`/login?_cb=${encodeURIComponent(currentPath)}`)
																return
															}
															if (newComment.trim() || commentImages.length > 0 || commentFeeling || commentActivity) {
																createCommentMutation.mutate({ comment: newComment, images: commentImages });
															}
														}
													}
												}}
												onFocus={() => {
													if (!session || !session.user) {
														// Don't prevent focus, but show login modal if they try to type
													}
												}}
											/>
											{showMentionDropdown && filteredParticipants.length > 0 && (
												<Box
													position="absolute"
													bottom="100%"
													left="0"
													width="100%"
													maxH="200px"
													overflowY="auto"
													bg="#2b2b2b"
													boxShadow="xl"
													borderRadius="lg"
													zIndex="10"
													border="1px solid"
													borderColor="#434343"
													mb="2"
												>
													<VStack align="stretch" spacing="0">
														{filteredParticipants.map((p: any) => (
															<Box
																key={p.id}
																p="3"
																cursor="pointer"
																_hover={{ bg: "#3a3a3a" }}
																onClick={() => handleSelectMention(p)}
																borderBottom="1px solid"
																borderColor="#434343"
															>
																<HStack spacing="3">
																	<Avatar size="xs" name={p.name} />
																	<VStack align="start" spacing="0">
																		<Text fontSize="sm" fontWeight="bold" color="white">{p.name}</Text>
																		<Text fontSize="xs" color="#bbbbbb">{p.email}</Text>
																	</VStack>
																</HStack>
															</Box>
														))}
													</VStack>
												</Box>
											)}
										</Box>

										{/* Send Button - Always visible on the right */}
										<IconButton
											aria-label="Send comment"
											icon={<FiSend />}
											size="md"
											variant="ghost"
											color={(newComment.trim() || commentImages.length > 0 || commentFeeling || commentActivity) ? "#jetzy" : "#bbbbbb"}
											onClick={() => {
												if (!session || !session.user) {
													const currentPath = window.location.pathname + window.location.search
													router.push(`/login?_cb=${encodeURIComponent(currentPath)}`)
													return
												}
												if (newComment.trim() || commentImages.length > 0 || commentFeeling || commentActivity) {
													createCommentMutation.mutate({ comment: newComment, images: commentImages });
												}
											}}
											isDisabled={(!newComment.trim() && commentImages.length === 0 && !commentFeeling && !commentActivity) || createCommentMutation.isPending || uploadingImages}
											borderRadius="full"
											_hover={{ bg: "whiteAlpha.100" }}
										/>
									</Flex>

									{/* Icons Row - BELOW the input (Facebook style) */}
									<Flex gap={2} mt={1} align="center" pl={2}>
										<IconButton
											aria-label="Feeling/Activity"
											icon={<Text fontSize="lg">😊</Text>}
											size="xs"
											variant="ghost"
											color={commentFeeling || commentActivity ? "#1877F2" : "#bbbbbb"}
											borderRadius="full"
											onClick={() => {
												if (!session || !session.user) {
													const currentPath = window.location.pathname + window.location.search
													router.push(`/login?_cb=${encodeURIComponent(currentPath)}`)
													return
												}
												onFeelingModalOpen()
											}}
											_hover={{ bg: "whiteAlpha.100" }}
											minW="auto"
											h="auto"
											p={1}
										/>
										<IconButton
											aria-label="Add image"
											icon={<Text fontSize="lg">📷</Text>}
											size="xs"
											variant="ghost"
											color={commentImages.length > 0 ? "#1877F2" : "#bbbbbb"}
											onClick={() => {
												if (!session || !session.user) {
													const currentPath = window.location.pathname + window.location.search
													router.push(`/login?_cb=${encodeURIComponent(currentPath)}`)
													return
												}
												commentFileInputRef.current?.click()
											}}
											isLoading={uploadingImages}
											borderRadius="full"
											_hover={{ bg: "whiteAlpha.100" }}
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

					{post?.isLocked && (
						<Box p={3} bg="#3a3a3a" borderRadius="lg" mb={4}>
							<Flex align="center" gap={2}>
								<Icon as={FiLock} color="#bbbbbb" />
								<Text color="#bbbbbb" fontWeight="medium" fontSize="sm">
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
									onShowCommentLikes={handleShowCommentLikes}
									onReport={(commentId) => reportCommentMutation.mutate(commentId)}
									isLocked={post?.isLocked ?? false}
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
				<ModalContent borderRadius="xl" bg="#1E1E1E">
					<ModalHeader borderBottom="1px solid" borderColor="#434343" pb={4} color="white">
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
												bg={commentFeeling?.includes(item.label) ? "#3a3a3a" : "transparent"}
												_hover={{ bg: "#2b2b2b" }}
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
												bg={commentActivity?.includes(item.label) ? "#3a3a3a" : "transparent"}
												_hover={{ bg: "#2b2b2b" }}
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
				<ModalContent borderRadius="xl" bg="#1E1E1E">
					<ModalHeader borderBottom="1px solid" borderColor="#434343" pb={4} color="white">
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
												bg={editPostFeeling?.includes(item.label) ? "#3a3a3a" : "transparent"}
												_hover={{ bg: "#2b2b2b" }}
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
												bg={editPostActivity?.includes(item.label) ? "#3a3a3a" : "transparent"}
												_hover={{ bg: "#2b2b2b" }}
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

			{/* Reactions and Viewers Modals */}
			<ReactionsListModal
				isOpen={showLikesModal}
				onClose={() => setShowLikesModal(false)}
				users={likesList}
				title="People who liked this"
				isLoading={loadingReactions}
			/>

			<ReactionsListModal
				isOpen={showViewersModal}
				onClose={() => setShowViewersModal(false)}
				users={viewersList}
				title="People who viewed this"
				isLoading={loadingReactions}
				extraContent={
					<Box bg="#2b2b2b" p={3} borderRadius="lg" mb={2}>
						<Flex justify="space-between" align="center" mb={1}>
							<Text color="#bbbbbb" fontSize="sm">Authenticated Views:</Text>
							<Text color="white" fontWeight="bold">{viewersList.length}</Text>
						</Flex>
						<Flex justify="space-between" align="center">
							<Text color="#bbbbbb" fontSize="sm">Unauthenticated Views:</Text>
							<Text color="white" fontWeight="bold">
								{Math.max(0, (post?.viewCount || 0) - viewersList.length)}
							</Text>
						</Flex>
					</Box>
				}
			/>

			<ReactionsListModal
				isOpen={showCommentLikesModal}
				onClose={() => setShowCommentLikesModal(false)}
				users={commentLikesList}
				title="People who liked this comment"
				isLoading={loadingReactions}
			/>

			{/* Login Modal */}
			<LoginModal
				isOpen={isLoginModalOpen}
				onClose={() => setIsLoginModalOpen(false)}
			/>

			{/* Image lightbox */}
			{lightboxSrc && (
				<Box
					position="fixed"
					inset={0}
					zIndex={9999}
					bg="blackAlpha.900"
					display="flex"
					alignItems="center"
					justifyContent="center"
					onClick={() => setLightboxSrc(null)}
				>
					<IconButton
						aria-label="Close"
						icon={<FiX />}
						position="absolute"
						top={4}
						right={4}
						color="white"
						bg="whiteAlpha.200"
						borderRadius="full"
						size="lg"
						_hover={{ bg: "whiteAlpha.400" }}
						onClick={() => setLightboxSrc(null)}
					/>
					<img
						src={lightboxSrc}
						alt="Full size"
						style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }}
						onClick={(e) => e.stopPropagation()}
					/>
				</Box>
			)}
		</>
	)
}

export default DiscussionPostView

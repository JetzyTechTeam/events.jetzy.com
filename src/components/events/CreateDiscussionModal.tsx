import React, { useState, useRef, useMemo, useEffect } from "react"
import {
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalBody,
	ModalCloseButton,
	ModalFooter,
	Button,
	Input,
	Textarea,
	FormControl,
	FormLabel,
	Stack,
	useToast,
	Flex,
	Tag,
	TagLabel,
	TagCloseButton,
	Text,
	Box,
	Divider,
	Avatar,
	Image,
	IconButton,
	useDisclosure,
	SimpleGrid,
	VStack,
	HStack,
	Icon,
	Spinner,
	Tabs,
	TabList,
	TabPanels,
	Tab,
	TabPanel,
	Badge,
} from "@chakra-ui/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useSession } from "next-auth/react"
import { CreateDiscussionPostApi, CheckEventTicketApi } from "@/services/events/discussionApis"
import axios from "axios"
import { FiPlus, FiSmile, FiImage, FiHash, FiX, FiFile, FiVideo } from "react-icons/fi"
import { useEdgeStore } from "@/lib/edgestore"
import dynamic from "next/dynamic"

// Dynamic import for EmojiPicker to avoid SSR issues
const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false })

interface CreateDiscussionModalProps {
	isOpen: boolean
	onClose: () => void
	eventId: string
	onSuccess: () => void
}

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
	{ emoji: "🤩", label: "excited" },
	{ emoji: "🥳", label: "celebrating" },
	{ emoji: "😌", label: "grateful" },
	{ emoji: "🤔", label: "thoughtful" },
]

const ACTIVITIES = [
	{ emoji: "✈️", label: "traveling" },
	{ emoji: "🍽️", label: "eating" },
	{ emoji: "📖", label: "reading" },
	{ emoji: "🎵", label: "listening to music" },
	{ emoji: "🏋️", label: "working out" },
	{ emoji: "🎮", label: "playing games" },
	{ emoji: "📺", label: "watching" },
	{ emoji: "🎨", label: "creating art" },
	{ emoji: "💼", label: "working" },
	{ emoji: "🛍️", label: "shopping" },
	{ emoji: "🎉", label: "partying" },
	{ emoji: "🧘", label: "relaxing" },
]

const CreateDiscussionModal: React.FC<CreateDiscussionModalProps> = ({ isOpen, onClose, eventId, onSuccess }) => {
	const { data: session } = useSession()
	const toast = useToast()
	const { edgestore } = useEdgeStore()
	const fileInputRef = useRef<HTMLInputElement>(null)

	const [content, setContent] = useState("")
	const [tags, setTags] = useState<string[]>([])
	const [tagInput, setTagInput] = useState("")
	const [media, setMedia] = useState<{ url: string; isVideo: boolean }[]>([])
	const [uploadingImages, setUploadingImages] = useState(false)
	const [feeling, setFeeling] = useState<string>("")
	const [activity, setActivity] = useState<string>("")

	// Tagging states
	const [mentionSearch, setMentionSearch] = useState("")
	const [showMentionDropdown, setShowMentionDropdown] = useState(false)
	const [cursorPosition, setCursorPosition] = useState(0)

	const { data: participants = [] } = useQuery({
		queryKey: ["event-participants", eventId],
		queryFn: async () => {
			const res = await axios.get(`/api/events/${eventId}/participants`)
			return res.data?.data || []
		},
		enabled: !!eventId && isOpen
	})

	const filteredParticipants = useMemo(() => {
		if (!mentionSearch) return participants
		return participants.filter((p: any) =>
			p.name.toLowerCase().includes(mentionSearch.toLowerCase()) ||
			p.email.toLowerCase().includes(mentionSearch.toLowerCase())
		)
	}, [participants, mentionSearch])

	// Modals
	const { isOpen: isTagModalOpen, onOpen: onTagModalOpen, onClose: onTagModalClose } = useDisclosure()
	const { isOpen: isFeelingModalOpen, onOpen: onFeelingModalOpen, onClose: onFeelingModalClose } = useDisclosure()

	// Check if user is logged in (ticket requirement removed)
	const canPost = !!session && !!session.user

	const createMutation = useMutation({
		mutationFn: async ({ postContent, postTags, postImages, postFeeling, postActivity }: {
			postContent: string
			postTags: string[]
			postImages: string[]
			postFeeling: string
			postActivity: string
		}) => {
			// Build content with feeling/activity
			let finalContent = postContent.trim()
			if (postFeeling || postActivity) {
				const feelingText = postFeeling ? `feeling ${postFeeling}` : ""
				const activityText = postActivity ? `${postActivity}` : ""
				const separator = postFeeling && postActivity ? " · " : ""

				if (finalContent) {
					// If there's content, append feeling/activity
					finalContent = `${finalContent}\n\n${feelingText}${separator}${activityText}`
				} else {
					// If no content, just use feeling/activity
					finalContent = `${feelingText}${separator}${activityText}`.trim()
				}
			}

			// Generate title from content or use default
			// If there's content, use first 50 characters
			// If no content but images, use a default title
			let autoTitle = "Post"
			if (finalContent) {
				autoTitle = finalContent.slice(0, 50).trim() + (finalContent.length > 50 ? "..." : "")
			} else if (postImages.length > 0) {
				autoTitle = `Image Post (${postImages.length} ${postImages.length === 1 ? 'image' : 'images'})`
			}

			const postData = {
				eventId,
				title: autoTitle,
				content: finalContent || "", // Allow empty content if images are present
				tags: postTags.length > 0 ? postTags : undefined,
				images: postImages, // Pass images array directly
			}

			console.log("[CreateDiscussionModal] Sending post data:", postData)

			return await CreateDiscussionPostApi({
				data: postData,
			})
		},
		onSuccess: () => {
			toast({
				title: "Post Created",
				status: "success",
				duration: 3000,
				isClosable: true,
			})
			handleClose()
			onSuccess()
		},
		onError: (error: any) => {
			toast({
				title: "Error",
				description: error.response?.data?.message || "Failed to create post",
				status: "error",
				duration: 3000,
				isClosable: true,
			})
		},
	})

	const handleClose = () => {
		setContent("")
		setTags([])
		setTagInput("")
		setMedia([])
		setFeeling("")
		setActivity("")
		onClose()
	}

	const handleAddTag = () => {
		const trimmedTag = tagInput.trim().toLowerCase()
		if (trimmedTag && !tags.includes(trimmedTag) && tags.length < 5) {
			setTags([...tags, trimmedTag])
			setTagInput("")
		}
	}

	const handleRemoveTag = (tagToRemove: string) => {
		setTags(tags.filter((tag) => tag !== tagToRemove))
	}

	const handleKeyPress = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault()
			handleAddTag()
		}
	}

	const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		const value = e.target.value
		const pos = e.target.selectionStart
		setContent(value)
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
		const textBeforeCursor = content.substring(0, cursorPosition)
		const textAfterCursor = content.substring(cursorPosition)

		const words = textBeforeCursor.split(/\s/)
		words[words.length - 1] = `@[${participant.name}](${participant.id}) `

		const newContent = words.join(" ") + textAfterCursor
		setContent(newContent)
		setShowMentionDropdown(false)

		// Focus back on textarea
		setTimeout(() => {
			const textarea = document.getElementById("post-content-textarea") as HTMLTextAreaElement
			if (textarea) {
				textarea.focus()
				const newPos = words.join(" ").length
				textarea.setSelectionRange(newPos, newPos)
			}
		}, 10)
	}

	const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files
		if (!files || files.length === 0) {
			console.log("[CreateDiscussionModal] No files selected")
			return
		}

		console.log("[CreateDiscussionModal] Starting upload for", files.length, "files")
		setUploadingImages(true)
		try {
			const uploadPromises = Array.from(files).map(async (file) => {
				console.log("[CreateDiscussionModal] Uploading file:", file.name, file.type, file.size)

				if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
					throw new Error("Only images and videos are allowed")
				}

				const res = await edgestore.publicFiles.upload({ file })
				console.log("[CreateDiscussionModal] Upload complete:", res.url)
				return { url: res.url, isVideo: file.type.startsWith("video/") }
			})

			const uploaded = await Promise.all(uploadPromises)
			console.log("[CreateDiscussionModal] All uploads complete:", uploaded)

			const newMedia = [...media, ...uploaded]
			setMedia(newMedia)
			console.log("[CreateDiscussionModal] Media state updated:", newMedia)

			toast({
				title: "Images uploaded successfully",
				status: "success",
				duration: 2000,
			})
		} catch (error: any) {
			console.error("[CreateDiscussionModal] Upload error:", error)
			toast({
				title: "Upload failed",
				description: error.message || "Failed to upload images",
				status: "error",
				duration: 3000,
			})
		} finally {
			setUploadingImages(false)
			if (fileInputRef.current) {
				fileInputRef.current.value = ""
			}
		}
	}

	const handleRemoveImage = (index: number) => {
		setMedia(media.filter((_, i) => i !== index))
	}

	const handleSelectFeeling = (emoji: string, label: string) => {
		setFeeling(`${emoji} ${label}`)
	}

	const handleSelectActivity = (emoji: string, label: string) => {
		setActivity(`${emoji} ${label}`)
	}

	const handleEmojiClick = (emojiData: any) => {
		// Add emoji to feeling
		setFeeling((prev) => prev ? `${prev} ${emojiData.emoji}` : emojiData.emoji)
	}

	const handleSubmit = () => {
		console.log("[CreateDiscussionModal] Submit clicked", {
			contentLength: content.trim().length,
			mediaCount: media.length,
			media,
			tags,
			feeling,
			activity,
		})

		if (!session || !session.user) {
			toast({
				title: "Please login or signup first",
				description: "You need to be logged in to create a post.",
				status: "warning",
				duration: 3000,
				isClosable: true,
			})
			return
		}

		if (!canPost) {
			toast({
				title: "Please login first",
				description: "You need to be logged in to create posts.",
				status: "warning",
				duration: 4000,
				isClosable: true,
			})
			return
		}

		// Allow posting if there's content, images, feeling, or activity
		if (!content.trim() && media.length === 0 && !feeling && !activity) {
			toast({
				description: "Please enter some content, add images, or select a feeling/activity for your post",
				status: "warning",
				duration: 3000,
				isClosable: true,
			})
			return
		}

		createMutation.mutate({
			postContent: content,
			postTags: tags,
			postImages: media.map(m => m.url),
			postFeeling: feeling,
			postActivity: activity,
		})
	}

	return (
		<Modal isOpen={isOpen} onClose={handleClose} isCentered size="lg">
			<ModalOverlay bg="blackAlpha.600" backdropFilter="blur(5px)" />
			<ModalContent
				bg="#1E1E1E"
				borderRadius="xl"
				boxShadow="xl"
				mx={{ base: 4, md: 0 }}
			>
				<ModalHeader
					textAlign="center"
					borderBottom="1px solid #434343"
					py={4}
					color="white"
					fontSize="xl"
					fontWeight="bold"
				>
					Create Post
				</ModalHeader>
				<ModalCloseButton
					color="#bbbbbb"
					bg="#2b2b2b"
					borderRadius="full"
					size="sm"
					top={3}
					right={3}
					_hover={{ bg: "#3a3a3a" }}
				/>

				<ModalBody py={4}>
					<Stack spacing={4}>
						{/* User Info */}
						<Flex align="center" gap={3}>
							<Avatar
								size="md"
								name={(session?.user as any)?.name || (session?.user as any)?.fullName || "User"}
								src={session?.user?.image || ""}
							/>
							<Box>
								<Text fontWeight="600" color="white">
									{(session?.user as any)?.name || (session?.user as any)?.fullName || "User"}
								</Text>
							</Box>
						</Flex>

						{/* Content Input */}
						<FormControl>
							<Box position="relative">
								<Textarea
									id="post-content-textarea"
									placeholder="What's on your mind?"
									value={content}
									onChange={handleContentChange}
									minH="150px"
									bg="gray.800"
									border="none"
									_focus={{ ring: "2px", ringColor: "orange.400" }}
									borderRadius="xl"
									fontSize="md"
									onKeyDown={(e) => {
										// Allow Enter to submit if there's content OR images OR feeling/activity
										if (e.key === 'Enter' && !e.shiftKey && (content.trim() || media.length > 0 || feeling || activity)) {
											// If mention dropdown is NOT open, allow submission
											if (!showMentionDropdown) {
												e.preventDefault()
												handleSubmit()
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
										maxH="200px"
										overflowY="auto"
										bg="gray.800"
										boxShadow="xl"
										borderRadius="lg"
										zIndex="10"
										border="1px solid"
										borderColor="gray.700"
										mb="2"
									>
										<VStack align="stretch" spacing="0">
											{filteredParticipants.map((p: any) => (
												<Box
													key={p.id}
													p="3"
													cursor="pointer"
													_hover={{ bg: "gray.700" }}
													onClick={() => handleSelectMention(p)}
													borderBottom="1px solid"
													borderColor="gray.700"
												>
													<HStack spacing="3">
														<Avatar size="xs" name={p.name} />
														<VStack align="start" spacing="0">
															<Text fontSize="sm" fontWeight="bold">{p.name}</Text>
															<Text fontSize="xs" color="gray.400">{p.email}</Text>
														</VStack>
													</HStack>
												</Box>
											))}
										</VStack>
									</Box>
								)}
							</Box>
						</FormControl>

						{/* Feeling/Activity Display */}
						{(feeling || activity) && (
							<Flex gap={2} flexWrap="wrap" align="center">
								{feeling && (
									<Tag size="md" borderRadius="full" bg="#FFF3CD" color="#856404">
										<TagLabel>{feeling}</TagLabel>
										<TagCloseButton onClick={() => setFeeling("")} />
									</Tag>
								)}
								{activity && (
									<Tag size="md" borderRadius="full" bg="#D1ECF1" color="#0C5460">
										<TagLabel>{activity}</TagLabel>
										<TagCloseButton onClick={() => setActivity("")} />
									</Tag>
								)}
							</Flex>
						)}

						{/* Tags Display */}
						{tags.length > 0 && (
							<Flex gap={2} flexWrap="wrap">
								{tags.map((tag) => (
									<Tag key={tag} size="md" borderRadius="full" bg="#E7F3FF" color="#1877F2">
										<TagLabel>#{tag}</TagLabel>
										<TagCloseButton onClick={() => handleRemoveTag(tag)} />
									</Tag>
								))}
							</Flex>
						)}

						{/* Media Preview */}
						{media.length > 0 && (
							<Box>
								{media.length === 1 ? (
									<Box position="relative" borderRadius="lg" overflow="hidden" bg="black" minH="120px" display="flex" justifyContent="center" alignItems="center">
										{media[0].isVideo ? (
											<video src={media[0].url} controls style={{ maxHeight: 400, maxWidth: "100%", borderRadius: 8 }} />
										) : (
											<Image src={media[0].url} alt="Upload 1" maxH="400px" w="auto" maxW="100%" objectFit="contain" />
										)}
										<IconButton
											aria-label="Remove"
											icon={<FiX />}
											size="sm"
											position="absolute"
											top={2}
											right={2}
											bg="blackAlpha.700"
											color="white"
											borderRadius="full"
											_hover={{ bg: "blackAlpha.800" }}
											onClick={() => handleRemoveImage(0)}
										/>
									</Box>
								) : (
									<SimpleGrid columns={2} spacing={2}>
										{media.map((item, index) => (
											<Box key={index} position="relative" borderRadius="lg" overflow="hidden" h="200px" bg="black" display="flex" alignItems="center" justifyContent="center">
												{item.isVideo ? (
													<video src={item.url} controls style={{ maxHeight: "100%", maxWidth: "100%", borderRadius: 8 }} />
												) : (
													<Image src={item.url} alt={`Upload ${index + 1}`} w="full" h="full" objectFit="contain" />
												)}
												<IconButton
													aria-label="Remove"
													icon={<FiX />}
													size="sm"
													position="absolute"
													top={2}
													right={2}
													bg="blackAlpha.700"
													color="white"
													borderRadius="full"
													_hover={{ bg: "blackAlpha.800" }}
													onClick={() => handleRemoveImage(index)}
												/>
											</Box>
										))}
									</SimpleGrid>
								)}
							</Box>
						)}

						{/* Add to Your Post Box */}
						<Flex
							justify="space-between"
							align="center"
							border="1px solid #434343"
							borderRadius="lg"
							p={3}
							mt={2}
						>
							<Text fontWeight="600" fontSize="sm" color="white">Add to your post</Text>
							<Flex gap={1}>
								<Button
									size="sm"
									variant="ghost"
									borderRadius="full"
									color="#45BD62"
									title="Photo/Video"
									onClick={() => fileInputRef.current?.click()}
									isLoading={uploadingImages}
								>
									<FiImage size={20} />
								</Button>
								<Button
									size="sm"
									variant="ghost"
									borderRadius="full"
									color="#F7B928"
									title="Feeling/Activity"
									onClick={onFeelingModalOpen}
								>
									<FiSmile size={20} />
								</Button>
								<Button
									size="sm"
									variant="ghost"
									borderRadius="full"
									color="#E41E3F"
									onClick={onTagModalOpen}
									title="Tag"
								>
									<FiHash size={20} />
								</Button>
							</Flex>
						</Flex>

						{/* Hidden File Input */}
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*,video/*"
							multiple
							style={{ display: "none" }}
							onChange={handleImageUpload}
						/>

						{/* Submit Button */}
						<Button
							onClick={handleSubmit}
							isLoading={createMutation.isPending}
							bg="#1877F2"
							color="white"
							size="lg"
							_hover={{ bg: "#166FE5" }}
							_active={{ transform: "scale(0.98)" }}
							isDisabled={!content.trim() && media.length === 0 && !feeling && !activity}
							w="full"
						>
							Post
						</Button>
					</Stack>
				</ModalBody>
			</ModalContent>

			{/* Tag Modal */}
			<Modal isOpen={isTagModalOpen} onClose={onTagModalClose} isCentered size="md">
				<ModalOverlay bg="blackAlpha.600" backdropFilter="blur(5px)" />
				<ModalContent borderRadius="xl" bg="#1E1E1E">
					<ModalHeader color="white">Add Tags</ModalHeader>
					<ModalCloseButton color="#bbbbbb" />
					<ModalBody pb={6}>
						<VStack spacing={4} align="stretch">
							<Text fontSize="sm" color="#bbbbbb">
								Add up to 5 tags to help others find your post
							</Text>
							<HStack>
								<Input
									placeholder="Enter a tag..."
									value={tagInput}
									onChange={(e) => setTagInput(e.target.value)}
									onKeyPress={handleKeyPress}
									flex="1"
									color="white"
									bg="#2b2b2b"
									border="none"
									_placeholder={{ color: "#bbbbbb" }}
								/>
								<Button
									onClick={handleAddTag}
									colorScheme="blue"
									isDisabled={!tagInput.trim() || tags.length >= 5}
								>
									Add
								</Button>
							</HStack>

							{tags.length > 0 && (
								<Box>
									<Text fontSize="sm" fontWeight="600" mb={2} color="white">
										Current Tags ({tags.length}/5)
									</Text>
									<Flex gap={2} flexWrap="wrap">
										{tags.map((tag) => (
											<Tag key={tag} size="md" borderRadius="full" bg="#E7F3FF" color="#1877F2">
												<TagLabel>#{tag}</TagLabel>
												<TagCloseButton onClick={() => handleRemoveTag(tag)} />
											</Tag>
										))}
									</Flex>
								</Box>
							)}

							<Button onClick={onTagModalClose} w="full" mt={4}>
								Done
							</Button>
						</VStack>
					</ModalBody>
				</ModalContent>
			</Modal>

			{/* Feeling/Activity/Emoji Picker Modal */}
			<Modal isOpen={isFeelingModalOpen} onClose={onFeelingModalClose} isCentered size="lg">
				<ModalOverlay bg="blackAlpha.600" backdropFilter="blur(5px)" />
				<ModalContent borderRadius="xl" bg="#1E1E1E">
					<ModalHeader borderBottom="1px solid" borderColor="#434343" pb={4} color="white">
						<Text fontSize="lg" fontWeight="bold">Add Expression</Text>
					</ModalHeader>
					<ModalCloseButton mt={1.5} color="#bbbbbb" />
					<ModalBody py={4}>
						{/* Current Selection Display */}
						{(feeling || activity) && (
							<Box p={3} bg="#E7F3FF" borderRadius="lg" border="1px solid #1877F2" mb={4}>
								<Text fontSize="sm" fontWeight="600" color="#1877F2" mb={2}>
									Selected:
								</Text>
								<Flex gap={2} flexWrap="wrap">
									{feeling && (
										<Badge colorScheme="blue" fontSize="sm" px={3} py={1.5} borderRadius="full" display="flex" alignItems="center" gap={1}>
											{feeling}
											<IconButton
												aria-label="Remove feeling"
												icon={<FiX />}
												size="xs"
												variant="ghost"
												color="blue.600"
												onClick={() => setFeeling("")}
												ml={1}
												h="18px"
												minW="18px"
											/>
										</Badge>
									)}
									{activity && (
										<Badge colorScheme="green" fontSize="sm" px={3} py={1.5} borderRadius="full" display="flex" alignItems="center" gap={1}>
											{activity}
											<IconButton
												aria-label="Remove activity"
												icon={<FiX />}
												size="xs"
												variant="ghost"
												color="green.600"
												onClick={() => setActivity("")}
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
											onEmojiClick={handleEmojiClick}
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
												onClick={() => handleSelectFeeling(item.emoji, item.label)}
												bg={feeling?.includes(item.label) ? "#3a3a3a" : "transparent"}
												_hover={{ bg: "#2b2b2b" }}
												color="white"
												py={6}
												h="auto"
												border="1px solid"
												borderColor={feeling?.includes(item.label) ? "blue.200" : "transparent"}
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
												onClick={() => handleSelectActivity(item.emoji, item.label)}
												bg={activity?.includes(item.label) ? "#3a3a3a" : "transparent"}
												_hover={{ bg: "#2b2b2b" }}
												color="white"
												py={6}
												h="auto"
												border="1px solid"
												borderColor={activity?.includes(item.label) ? "green.200" : "transparent"}
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
		</Modal >
	)
}

export default CreateDiscussionModal

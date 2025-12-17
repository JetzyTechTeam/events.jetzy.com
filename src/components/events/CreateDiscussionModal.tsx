import React, { useState, useRef } from "react"
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
	const [images, setImages] = useState<string[]>([])
	const [uploadingImages, setUploadingImages] = useState(false)
	const [feeling, setFeeling] = useState<string>("")
	const [activity, setActivity] = useState<string>("")

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
			let finalContent = postContent
			if (postFeeling || postActivity) {
				const feelingText = postFeeling ? `feeling ${postFeeling}` : ""
				const activityText = postActivity ? `${postActivity}` : ""
				const separator = postFeeling && postActivity ? " · " : ""
				finalContent = `${postContent}\n\n${feelingText}${separator}${activityText}`
			}

			// Generate title from first 50 characters of content
			const autoTitle = finalContent.slice(0, 50).trim() + (finalContent.length > 50 ? "..." : "")

			const postData = {
				eventId,
				title: autoTitle || "Post",
				content: finalContent,
				tags: postTags.length > 0 ? postTags : undefined,
				images: postImages.length > 0 ? postImages : undefined,
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
		setImages([])
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
				
				// Validate file type
				if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
					throw new Error("Only images and videos are allowed")
				}

				// Validate file size (max 10MB)
				if (file.size > 10 * 1024 * 1024) {
					throw new Error("File size must be less than 10MB")
				}

				const res = await edgestore.publicFiles.upload({ file })
				console.log("[CreateDiscussionModal] Upload complete:", res.url)
				return res.url
			})

			const uploadedUrls = await Promise.all(uploadPromises)
			console.log("[CreateDiscussionModal] All uploads complete:", uploadedUrls)
			
			const newImages = [...images, ...uploadedUrls]
			setImages(newImages)
			console.log("[CreateDiscussionModal] Images state updated:", newImages)

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
		setImages(images.filter((_, i) => i !== index))
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
			imagesCount: images.length,
			images: images,
			tags: tags,
			feeling: feeling,
			activity: activity,
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

		if (!content.trim()) {
			toast({
				description: "Please enter some content for your post",
				status: "warning",
				duration: 3000,
				isClosable: true,
			})
			return
		}

		// Pass current state values as parameters to avoid stale closure
		createMutation.mutate({
			postContent: content,
			postTags: tags,
			postImages: images,
			postFeeling: feeling,
			postActivity: activity,
		})
	}

	return (
		<Modal isOpen={isOpen} onClose={handleClose} isCentered size="lg">
			<ModalOverlay bg="blackAlpha.600" backdropFilter="blur(5px)" />
			<ModalContent
				bg="white"
				borderRadius="xl"
				boxShadow="xl"
				mx={{ base: 4, md: 0 }}
			>
				<ModalHeader 
					textAlign="center" 
					borderBottom="1px solid #E5E7EB" 
					py={4} 
					color="#1C1E21"
					fontSize="xl"
					fontWeight="bold"
				>
					Create Post
				</ModalHeader>
				<ModalCloseButton 
					color="#65676B" 
					bg="#E4E6EB" 
					borderRadius="full" 
					size="sm" 
					top={3} 
					right={3}
					_hover={{ bg: "#D8DADF" }}
				/>

				<ModalBody py={4}>
					<Stack spacing={4}>
						{/* User Info */}
						<Flex align="center" gap={3}>
							<Avatar 
								size="md" 
								name={session?.user?.name || "User"} 
								src={session?.user?.image || ""} 
							/>
							<Box>
								<Text fontWeight="600" color="#1C1E21">
									{session?.user?.name || "User"}
								</Text>
								<Flex align="center" gap={1}>
									<Box bg="#E4E6EB" px={2} py="2px" borderRadius="md" fontSize="xs" fontWeight="600" color="#1C1E21">
										Public
									</Box>
								</Flex>
							</Box>
						</Flex>

						{/* Content Input */}
						<Box>
							<Textarea
								placeholder="What's on your mind?"
								value={content}
								onChange={(e) => setContent(e.target.value)}
								variant="unstyled"
								fontSize="xl"
								minH="150px"
								resize="none"
								p={1}
								_placeholder={{ color: "#65676B" }}
							/>
						</Box>

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

						{/* Images Preview */}
						{images.length > 0 && (
							<SimpleGrid columns={images.length === 1 ? 1 : 2} spacing={2}>
								{images.map((url, index) => (
									<Box key={index} position="relative" borderRadius="lg" overflow="hidden">
										<Image src={url} alt={`Upload ${index + 1}`} w="full" h="200px" objectFit="cover" />
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
											onClick={() => handleRemoveImage(index)}
										/>
									</Box>
								))}
							</SimpleGrid>
						)}

						{/* Add to Your Post Box */}
						<Flex 
							justify="space-between" 
							align="center" 
							border="1px solid #CED0D4" 
							borderRadius="lg" 
							p={3}
							mt={2}
						>
							<Text fontWeight="600" fontSize="sm" color="#1C1E21">Add to your post</Text>
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
							isDisabled={!content.trim()}
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
				<ModalContent borderRadius="xl">
					<ModalHeader>Add Tags</ModalHeader>
					<ModalCloseButton />
					<ModalBody pb={6}>
						<VStack spacing={4} align="stretch">
							<Text fontSize="sm" color="#65676B">
								Add up to 5 tags to help others find your post
							</Text>
							<HStack>
								<Input
									placeholder="Enter a tag..."
									value={tagInput}
									onChange={(e) => setTagInput(e.target.value)}
									onKeyPress={handleKeyPress}
									flex="1"
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
									<Text fontSize="sm" fontWeight="600" mb={2}>
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
				<ModalContent borderRadius="xl">
					<ModalHeader borderBottom="1px solid" borderColor="gray.100" pb={4}>
						<Text fontSize="lg" fontWeight="bold">Add Expression</Text>
					</ModalHeader>
					<ModalCloseButton mt={1.5} />
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
												bg={feeling?.includes(item.label) ? "#E7F3FF" : "transparent"}
												_hover={{ bg: "#F0F2F5" }}
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
												bg={activity?.includes(item.label) ? "#D4EDDA" : "transparent"}
												_hover={{ bg: "#F0F2F5" }}
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
		</Modal>
	)
}

export default CreateDiscussionModal

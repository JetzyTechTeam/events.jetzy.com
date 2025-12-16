import React, { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import axios from "axios"
import { useSession } from "next-auth/react"
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Textarea, useDisclosure, useToast } from "@chakra-ui/react"
import Spinner from "../misc/Spinner"

export type CommentType = {
	_id: string
	userId: { email: string }
	createdAt: string
	comment: string
	parentCommentId: string | "root"
}

export type UserType = {
	name?: string | null | undefined
	email?: string | null | undefined
	image?: string | null | undefined
}

type CommentItemProps = {
	comment: CommentType
	groupedComments: Record<string, CommentType[]>
	replyingTo: string | null
	setReplyingTo: React.Dispatch<React.SetStateAction<string | null>>
	replyTextMap: Record<string, string>
	setReplyTextMap: React.Dispatch<React.SetStateAction<Record<string, string>>>
	replyMutation: any
	editCommentId: string | null
	setEditCommentId: React.Dispatch<React.SetStateAction<string | null>>
	editTextMap: Record<string, string>
	setEditTextMap: React.Dispatch<React.SetStateAction<Record<string, string>>>
	editMutation: any
	deleteMutation: any
	currentUser: UserType | null
}

const CommentItem: React.FC<CommentItemProps> = ({
	comment,
	groupedComments,
	replyingTo,
	setReplyingTo,
	replyTextMap,
	setReplyTextMap,
	replyMutation,
	editCommentId,
	setEditCommentId,
	editTextMap,
	setEditTextMap,
	editMutation,
	deleteMutation,
	currentUser,
}) => {
	const toast = useToast()

	const isEditing = editCommentId === comment._id

	const handleEditSave = () => {
		const newText = editTextMap[comment._id]?.trim()
		if (!newText) {
			toast({
				title: "Empty comment",
				description: "Comment cannot be empty.",
				status: "warning",
				duration: 3000,
				isClosable: true,
			})
			return
		}
		editMutation.mutate({ commentId: comment._id, newComment: newText })
	}

	const handleDelete = () => {
		if (window.confirm("Are you sure you want to delete this comment? This action cannot be undone.")) {
			deleteMutation.mutate(comment._id)
		}
	}

	return (
		<div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
			<div className="mb-2 flex justify-between items-start">
				<div>
					<h3 className="text-[15px] text-gray-900 font-medium">{comment.userId.email}</h3>
					<p className="text-xs text-gray-500">
						{new Date(comment.createdAt).toLocaleDateString("en-US", {
							year: "numeric",
							month: "long",
							day: "numeric",
						})}
					</p>
				</div>
				{currentUser?.email === comment.userId.email && (
					<div className="flex gap-2">
						<Button
							size="xs"
							variant="ghost"
							color="#8B5CF6"
							_hover={{ bg: "#8B5CF6", color: "white" }}
							onClick={() => {
								if (isEditing) {
									setEditCommentId(null)
									setEditTextMap((prev) => ({ ...prev, [comment._id]: "" }))
								} else {
									setEditCommentId(comment._id)
									setEditTextMap((prev) => ({
										...prev,
										[comment._id]: comment.comment,
									}))
									setReplyingTo(null) // Close reply if editing
								}
							}}
						>
							{isEditing ? "Cancel" : "Edit"}
						</Button>
						<Button size="xs" variant="ghost" color="red.500" _hover={{ bg: "red.500", color: "white" }} onClick={handleDelete} isLoading={deleteMutation.isLoading}>
							Delete
						</Button>
					</div>
				)}
			</div>

			{isEditing ? (
				<>
					<Textarea
						size="sm"
						value={editTextMap[comment._id] || ""}
						onChange={(e) =>
							setEditTextMap((prev) => ({
								...prev,
								[comment._id]: e.target.value,
							}))
						}
						bg="white"
						color="#1F2937"
						borderColor="#E5E7EB"
						_focus={{ borderColor: "#8B5CF6", boxShadow: "0 0 0 1px #8B5CF6" }}
						borderRadius="lg"
					/>
					<div className="flex gap-2 mt-2">
						<Button size="xs" bg="#8B5CF6" color="white" _hover={{ bg: "#7C3AED" }} onClick={handleEditSave} isLoading={editMutation.isLoading}>
							Save
						</Button>
						<Button
							size="xs"
							variant="outline"
							color="#6B7280"
							borderColor="#E5E7EB"
							_hover={{ color: "#1F2937", borderColor: "#D1D5DB" }}
							onClick={() => {
								setEditCommentId(null)
								setEditTextMap((prev) => ({ ...prev, [comment._id]: "" }))
							}}
						>
							Cancel
						</Button>
					</div>
				</>
			) : (
				<>
					<p className="text-sm text-gray-600">{comment.comment}</p>

					<Button
						variant="unstyled"
						size="xs"
						color="#8B5CF6"
						mt="2"
						fontWeight="semibold"
						_hover={{ color: "#7C3AED" }}
						onClick={() => setReplyingTo(replyingTo === comment._id ? null : comment._id)}
					>
						Reply
					</Button>

					{replyingTo === comment._id && (
						<div className="mt-2 space-y-2">
							<Textarea
								placeholder="Write your reply..."
								size="sm"
								value={replyTextMap[comment._id] || ""}
								onChange={(e) =>
									setReplyTextMap((prev) => ({
										...prev,
										[comment._id]: e.target.value,
									}))
								}
								bg="white"
								color="#1F2937"
								borderColor="#E5E7EB"
								_focus={{ borderColor: "#8B5CF6", boxShadow: "0 0 0 1px #8B5CF6" }}
								borderRadius="lg"
							/>
							<div className="flex gap-2">
								<Button
									size="xs"
									bg="#8B5CF6"
									color="white"
									_hover={{ bg: "#7C3AED" }}
									onClick={() => {
										replyMutation.mutate({
											commentId: comment._id,
											reply: replyTextMap[comment._id],
										})
									}}
									isLoading={replyMutation.isLoading}
								>
									Submit
								</Button>
								<Button
									size="xs"
									variant="outline"
									color="#6B7280"
									borderColor="#E5E7EB"
									_hover={{ color: "#1F2937", borderColor: "#D1D5DB" }}
									onClick={() => {
										setReplyingTo(null)
										setReplyTextMap((prev) => ({
											...prev,
											[comment._id]: "",
										}))
									}}
								>
									Cancel
								</Button>
							</div>
						</div>
					)}
				</>
			)}

			{groupedComments[comment._id]?.length > 0 && (
				<div className="pl-4 mt-3 space-y-3 border-l-2 border-primary-purple/30">
					{groupedComments[comment._id].map((reply) => (
						<CommentItem
							key={reply._id}
							comment={reply}
							groupedComments={groupedComments}
							replyingTo={replyingTo}
							setReplyingTo={setReplyingTo}
							replyTextMap={replyTextMap}
							setReplyTextMap={setReplyTextMap}
							replyMutation={replyMutation}
							editCommentId={editCommentId}
							setEditCommentId={setEditCommentId}
							editTextMap={editTextMap}
							setEditTextMap={setEditTextMap}
							editMutation={editMutation}
							deleteMutation={deleteMutation}
							currentUser={currentUser}
						/>
					))}
				</div>
			)}
		</div>
	)
}

const CommentsSection = ({ eventId, currentUser }: { eventId: string; currentUser: UserType | null }) => {
	const { isOpen, onOpen, onClose } = useDisclosure()
	const [comment, setComment] = React.useState("")
	const [replyingTo, setReplyingTo] = useState<string | null>(null)
	const [replyTextMap, setReplyTextMap] = useState<Record<string, string>>({})
	const [editCommentId, setEditCommentId] = useState<string | null>(null)
	const [editTextMap, setEditTextMap] = useState<Record<string, string>>({})
	const toast = useToast()

	const { data: session } = useSession()

	const {
		data: comments = [],
		isLoading,
		refetch,
	} = useQuery({
		queryKey: ["eventComments", eventId],
		queryFn: async () => {
			const response = await axios.get(`/api/events/comments/get?eventId=${eventId}`)
			return response.data
		},
		enabled: !!eventId,
	})

	const commentMutation = useMutation({
		mutationKey: ["postComment"],
		mutationFn: async (comment: string) => {
			const response = await axios.post("/api/events/comments/create", {
				comment,
				eventId,
			})
			return response.data
		},
		onSuccess: () => {
			setComment("")
			onClose()
			refetch()
			toast({
				title: "Comment Posted.",
				description: "Your comment has been successfully posted.",
				status: "success",
				duration: 3000,
				isClosable: true,
			})
		},
		onError: (err) => {
			console.error("Error posting comment:", err)
			toast({
				title: "Error Posting Comment.",
				description: "There was an error posting your comment.",
				status: "error",
				duration: 3000,
				isClosable: true,
			})
		},
	})

	const replyMutation = useMutation({
		mutationKey: ["postReply"],
		mutationFn: async ({ commentId, reply }: { commentId: string; reply: string }) => {
			const response = await axios.post("/api/events/comments/reply", {
				eventId,
				commentId,
				reply,
			})
			return response.data
		},
		onSuccess: (_data, variables) => {
			const { commentId } = variables
			setReplyTextMap((prev) => ({ ...prev, [commentId]: "" }))
			setReplyingTo(null)
			refetch()
			toast({
				title: "Reply Posted.",
				description: "Your reply has been successfully posted.",
				status: "success",
				duration: 3000,
				isClosable: true,
			})
		},
		onError: (err) => {
			console.error("Error posting reply:", err)
			toast({
				title: "Error Posting Reply.",
				description: "There was an error posting your reply.",
				status: "error",
				duration: 3000,
				isClosable: true,
			})
		},
	})

	const editMutation = useMutation({
		mutationKey: ["editComment"],
		mutationFn: async ({ commentId, newComment }: { commentId: string; newComment: string }) => {
			const response = await axios.put("/api/events/comments/edit", {
				eventId,
				commentId,
				newComment,
			})
			return response.data
		},
		onSuccess: () => {
			setEditCommentId(null)
			setEditTextMap({})
			refetch()
			toast({
				title: "Comment Edited.",
				description: "Your comment has been successfully updated.",
				status: "success",
				duration: 3000,
				isClosable: true,
			})
		},
		onError: (err) => {
			console.error("Error editing comment:", err)
			toast({
				title: "Error Editing Comment.",
				description: "There was an error updating your comment.",
				status: "error",
				duration: 3000,
				isClosable: true,
			})
		},
	})

	const deleteMutation = useMutation({
		mutationKey: ["deleteComment"],
		mutationFn: async (commentId: string) => {
			const response = await axios.delete(`/api/events/comments/delete?eventId=${eventId}&commentId=${commentId}`)
			return response.data
		},
		onSuccess: () => {
			refetch()
			toast({
				title: "Comment Deleted.",
				description: "The comment has been deleted.",
				status: "success",
				duration: 3000,
				isClosable: true,
			})
		},
		onError: (err) => {
			console.error("Error deleting comment:", err)
			toast({
				title: "Error Deleting Comment.",
				description: "There was an error deleting the comment.",
				status: "error",
				duration: 3000,
				isClosable: true,
			})
		},
	})

	const groupedComments = React.useMemo(() => {
		return comments.reduce((acc: Record<string, CommentType[]>, comment: CommentType) => {
			const parentId = comment.parentCommentId || "root"
			if (!acc[parentId]) acc[parentId] = []
			acc[parentId].push(comment)
			return acc
		}, {})
	}, [comments])

	return (
		<div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
			<div className="flex items-center justify-between mb-6">
				<h1 className="font-bold text-2xl text-gray-900">Comments</h1>
				{session ? (
					<Button 
                        size="sm"
                        colorScheme="purple"
                        onClick={onOpen}
                    >
						Write a comment
					</Button>
				) : (
					<p className="text-gray-500 bg-gray-100 p-2 rounded-lg text-sm">Login to comment</p>
				)}
			</div>

			{isLoading ? (
				<div className="flex justify-center items-center h-20">
					<Spinner />
				</div>
			) : (
				<div className="space-y-5">
					{groupedComments["root"]?.length > 0 ? (
                        groupedComments["root"].map((comment: CommentType) => (
                            <CommentItem
                                key={comment._id}
                                comment={comment}
                                groupedComments={groupedComments}
                                replyingTo={replyingTo}
                                setReplyingTo={setReplyingTo}
                                replyTextMap={replyTextMap}
                                setReplyTextMap={setReplyTextMap}
                                replyMutation={replyMutation}
                                editCommentId={editCommentId}
                                setEditCommentId={setEditCommentId}
                                editTextMap={editTextMap}
                                setEditTextMap={setEditTextMap}
                                editMutation={editMutation}
                                deleteMutation={deleteMutation}
                                currentUser={currentUser}
                            />
                        ))
                    ) : (
                        <p className="text-gray-500 text-center py-4">No comments yet. Be the first to start the discussion!</p>
                    )}
				</div>
			)}

			<Modal isCentered isOpen={isOpen} onClose={onClose}>
				<ModalOverlay backdropFilter="blur(4px)" />
				<ModalContent bg="white">
					<ModalHeader color="#1F2937">Write a Comment</ModalHeader>
					<ModalBody>
						<Textarea
							value={comment}
							placeholder="Enter your comment here..."
							onChange={(e) => setComment(e.target.value)}
							bg="white"
							color="#1F2937"
							border="2px solid #E5E7EB"
							_focus={{ borderColor: "#8B5CF6", boxShadow: "0 0 0 1px #8B5CF6" }}
						/>
					</ModalBody>

					<ModalFooter display="flex" flexDirection="column" gap="3">
						<Button bg="#8B5CF6" color="white" _hover={{ bg: "#7C3AED" }} w="full" onClick={() => comment.trim() && commentMutation.mutate(comment)} isLoading={commentMutation.isPending}>
							Post
						</Button>
						<Button variant="ghost" w="full" color="#6B7280" onClick={onClose}>
							Cancel
						</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>
		</div>
	)
}

export default CommentsSection

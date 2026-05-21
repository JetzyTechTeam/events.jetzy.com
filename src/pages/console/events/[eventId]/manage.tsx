"use client"
import { stripHtml } from "@/utils/text";
import DOMPurify from "dompurify";
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { ReferralCodesManager } from "@/components/console/ReferralCodesManager"
import { authorizedOnly } from "@/lib/authSession"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { GetServerSideProps } from "next"
import React, { useEffect, useState } from "react"
import {
	Button,
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalBody,
	ModalCloseButton,
	Input,
	Text,
	Textarea,
	useToast,
	Box,
	UnorderedList,
	ListItem,
	Flex,
	Heading,
	Tabs,
	TabList,
	Tab,
	TabPanels,
	TabPanel,
	Select,
	Table,
	Thead,
	Tbody,
	Tr,
	Th,
	Td,
	TableContainer,
	Badge,
} from "@chakra-ui/react"
import { DateTime } from "luxon"
import axios from "axios"
import { useQuery } from "@tanstack/react-query"
import Image from "next/image"
import { DateTimeSVG, LocationSVG, MessageSVG, UserPlusSVG } from "@/assets/icons"
import { ShareIcon, EyeIcon } from "@heroicons/react/20/solid"
import { useRouter } from "next/router"
import { useSession } from "next-auth/react"

export default function Manage({ event }: any) {
	event = JSON.parse(event)

	const [activeTab, setActiveTab] = useState<"about" | "guests" | "bookings" | "waitingList" | "referralCodes" | "discussion">("about")
	const [shareModal, setShareModal] = useState(false)
	const [inviteGuestsModal, setInviteGuestsModal] = useState(false)
	const [sendBlastModal, setSendBlastModal] = useState(false)
	const [showDailyViewsModal, setShowDailyViewsModal] = useState(false)
	const [feedbackFormUrl, setFeedbackFormUrl] = useState(event.feedbackFormUrl || "")
	const [isSendingThankYou, setIsSendingThankYou] = useState(false)
	const toast = useToast()
	const router = useRouter()
	const { data: session } = useSession()
	const userRole = (session?.user as any)?.role
	const isAdmin = userRole === "admin" || userRole === "super admin"

	useEffect(() => {
		if (router.query.invite === "true") {
			setInviteGuestsModal(true)
			router.replace(`/console/events/${event._id}/manage`, undefined, { shallow: true })
		}
	}, [router.query.invite])

	const { data: analytics } = useQuery({
		queryKey: ["event-analytics", event._id],
		queryFn: async () => {
			const res = await axios.get("/api/analytics/events", { params: { eventId: event._id, groupBy: "day" } })
			return res.data.data
		},
	})

	const onUpdateFeedbackLink = async () => {
		try {
			await axios.post(`/api/events/admin/update-feedback-link`, {
				eventId: event._id,
				feedbackFormUrl
			})
			toast({
				title: "Feedback link updated!",
				status: "success",
				duration: 3000,
			})
			// Refresh page to update props (and show the Send Email button)
			router.replace(router.asPath)
		} catch (error) {
			toast({
				title: "Failed to update link.",
				status: "error",
				duration: 3000,
			})
		}
	}

	const onSendThankYouEmails = async () => {
		setIsSendingThankYou(true)
		try {
			await axios.post("/api/events/admin/send-thank-you", { eventId: event._id })
			toast({
				title: "Email blast started!",
				description: "Participants will receive thank you emails shortly.",
				status: "success",
				duration: 5000,
			})
		} catch (error: any) {
			toast({
				title: "Failed to send emails.",
				description: error.response?.data?.message || "Internal server error.",
				status: "error",
				duration: 5000,
			})
		}
		setIsSendingThankYou(false)
	}

	return (
		<>
			<ConsoleLayout
				page={stripHtml(event.name) as any}
				component={
					<div className="flex gap-2">
						{isAdmin && (
							<Button bg="#1877F2" color="white" _hover={{ bg: "#1565D8" }} _active={{ bg: "#1565D8" }} onClick={() => router.push(`/console/events/${event._id}/analytics`)} fontWeight="bold">
								View Analytics
							</Button>
						)}
						<Button bg="#F79432" color="black" _hover={{ bg: "#E68422" }} _active={{ bg: "#E68422" }} onClick={() => router.push(`/console/events/${event._id}/check-in`)} fontWeight="bold">
							Check-In Portal
						</Button>
						<Button bg="#3E3E3E" color="white" _hover={{ bg: "#323232" }} _active={{ bg: "#323232" }} onClick={() => router.push(`/console/events/${event._id}/update`)}>
							Edit Event
						</Button>
					</div>
				}
			>
				{/* INVITE GUESTS MODAL  */}
				<InviteGuestsModal inviteGuestsModal={inviteGuestsModal} setInviteGuestsModal={setInviteGuestsModal} event={event} />

				{/* SEND BLAST MODAL  */}
				<SendBlastModal sendBlastModal={sendBlastModal} setSendBlastModal={setSendBlastModal} event={event} />

				{/* SHARE MODAL  */}
				<ShareModal shareModal={shareModal} setShareModal={setShareModal} eventSlug={event.slug} />

				{/* DAILY VIEWS MODAL */}
				<DailyViewsModal
					isOpen={showDailyViewsModal}
					onClose={() => setShowDailyViewsModal(false)}
					dailyViews={analytics?.trends?.views || []}
				/>

				<Tabs variant="line">
					<TabList borderBottom="2px solid #9C9C9C">
						<Tab
							fontWeight="bold"
							color="#9C9C9C"
							_selected={{
								color: "#F79432",
								borderBottom: "2px solid #F79432",
							}}
						>
							Overview
						</Tab>
						<Tab
							fontWeight="bold"
							color="#9C9C9C"
							_selected={{
								color: "#F79432",
								borderBottom: "2px solid #F79432",
							}}
						>
							Guests
						</Tab>
						<Tab
							fontWeight="bold"
							color="#9C9C9C"
							_selected={{
								color: "#F79432",
								borderBottom: "2px solid #F79432",
							}}
						>
							Referral Codes
						</Tab>
						<Tab
							fontWeight="bold"
							color="#9C9C9C"
							_selected={{
								color: "#F79432",
								borderBottom: "2px solid #F79432",
							}}
						>
							Custom Questions
						</Tab>
					</TabList>
					<TabPanels>
						<TabPanel>
							<div className="flex items-center justify-between gap-x-5 mb-10">
								<div
									className="bg-[#1E1E1E] border border-[#434343] rounded-2xl p-4 w-full cursor-pointer hover:shadow-xl transition-all duration-300 flex items-center gap-x-2"
									onClick={() => setInviteGuestsModal(true)}
								>
									<UserPlusSVG />
									<p className="font-bold text-[#9C9C9C]">Invite Guests</p>
								</div>
								<div
									className="bg-[#1E1E1E] border border-[#434343] rounded-2xl p-4 w-full cursor-pointer hover:shadow-xl transition-all duration-300 flex items-center gap-x-2"
									onClick={() => setSendBlastModal(true)}
								>
									<MessageSVG />
									<p className="font-bold text-[#9C9C9C]">Send a Blast</p>
								</div>
								<div
									className="bg-[#1E1E1E] border border-[#434343] rounded-2xl p-4 w-full cursor-pointer hover:shadow-xl transition-all duration-300 flex items-center gap-x-2"
									onClick={() => setShareModal(true)}
								>
									<ShareIcon className="w-6 h-6 text-[#949494]" />
									<p className="font-bold text-[#9C9C9C]">Share Event</p>
								</div>

								{/* Total Views Block */}
								<div
									className="bg-[#1E1E1E] border border-[#434343] rounded-2xl p-4 w-full cursor-pointer hover:shadow-xl transition-all duration-300 flex items-center gap-x-2"
									onClick={() => setShowDailyViewsModal(true)}
								>
									<EyeIcon className="w-6 h-6 text-[#949494]" />
									<div className="flex flex-col">
										<p className="font-bold text-[#9C9C9C]">Total Views</p>
										<p className="text-xl font-bold text-white">{analytics?.summary?.views || 0}</p>
									</div>
								</div>
							</div>
							<div className="flex h-full gap-x-5">
								<div className="w-[250px] h-[200px] relative rounded-2xl overflow-hidden">
									<Image 
										src={event.images[0]} 
										alt={stripHtml(event.name)} 
										fill
										className="object-cover object-top"
									/>
								</div>
								<div className="w-full">
									<div className="p-3 flex flex-col gap-y-3 border-b border-[#585858] pb-10">
										<h4 className="font-bold">When</h4>
										{event.datePoll?.isActive ? (
											<div>
												<p className="font-semibold flex gap-x-2 items-center" style={{ color: "#F79432" }}>
													<DateTimeSVG stroke="#F79432" />
													Date to be determined via poll
												</p>
												{event.datePoll.options?.length > 0 && (
													<ul className="mt-2 text-sm list-disc pl-4" style={{ color: "#B5B6B7" }}>
														{event.datePoll.options.map((opt: any, i: number) => (
															<li key={i}>{opt.date} {opt.time}{opt.label ? ` — ${opt.label}` : ""}</li>
														))}
													</ul>
												)}
											</div>
										) : event.startsOn ? (
											<p className="font-semibold flex gap-x-2 items-center">
												<DateTimeSVG stroke="#fff" />
												{DateTime.fromISO(event.startsOn).toLocal().toFormat("EEE LLL dd yyyy hh:mm:ss a")} {event.timezone}
											</p>
										) : (
											<p className="font-semibold" style={{ color: "#B5B6B7" }}>Date to be decided</p>
										)}
									</div>
									<div className="py-10 px-3 flex flex-col gap-y-3 border-b border-[#585858]">
										<h4 className="font-bold">Where</h4>
										<p className="font-semibold flex gap-x-2 items-center">
											<LocationSVG stroke="#fff" />
											{event.location}
										</p>
									</div>
									<div className="p-3 flex flex-col gap-y-3">
										<h4 className="font-bold">Description</h4>
										<div
											className="font-semibold text-[#B5B6B7] rich-content"
											dangerouslySetInnerHTML={{
												__html: typeof window !== "undefined"
													? DOMPurify.sanitize(event.desc)
													: stripHtml(event.desc)
											}}
										/>
									</div>

									{/* Post-Event Section */}
									<div className="mt-10 p-6 bg-[#181818] rounded-2xl border border-[#3E3E3E]">
										<h3 className="text-xl font-bold mb-4 text-[#F79432]">Post-Event Thank You</h3>
										<p className="text-sm text-[#9C9C9C] mb-6">
											Add a feedback form link (e.g. Google Forms) below. Once added, you can send a thank you email blast to all confirmed participants.
										</p>

										<Flex gap={4} direction="column">
											<Box>
												<Text fontWeight="bold" mb={2} color="white">Feedback Form Link</Text>
												<Flex gap={2}>
													<Input
														bg="#090C10"
														borderColor="#444444"
														color="white"
														placeholder="https://forms.google.com/..."
														value={feedbackFormUrl}
														onChange={(e) => setFeedbackFormUrl(e.target.value)}
													/>
													<Button
														onClick={onUpdateFeedbackLink}
														bg="#3E3E3E"
														color="white"
														_hover={{ bg: "#4A4A4A" }}
													>
														Save Link
													</Button>
												</Flex>
											</Box>

											{event.feedbackFormUrl && (
												<Box mt={4} p={4} bg="#252525" rounded="xl" border="1px dashed #F79432">
													<Text color="#F79432" fontWeight="bold" mb={2}>Ready to Send?</Text>
													<Button
														width="full"
														bg="#F79432"
														color="black"
														fontWeight="bold"
														_hover={{ bg: "#E68422" }}
														isLoading={isSendingThankYou}
														onClick={onSendThankYouEmails}
													>
														Send Thank You Emails to All Participants
													</Button>
													{event.thankYouEmailSentAt && (
														<Text mt={2} fontSize="xs" color="#9C9C9C">
															Last sent on: {DateTime.fromISO(event.thankYouEmailSentAt).toLocaleString(DateTime.DATETIME_MED)}
														</Text>
													)}
												</Box>
											)}
										</Flex>
									</div>
								</div>
							</div>
						</TabPanel>
						<TabPanel>
							{/* Guests list content goes here */}
							<div className="bg-[#181818] rounded-xl p-3 flex flex-col gap-y-3">
								<GuestsList eventId={event._id} event={event} />
							</div>
						</TabPanel>
						<TabPanel>
							<div className="bg-[#181818] rounded-xl p-3">
								<ReferralCodesManager eventId={event._id} />
							</div>
						</TabPanel>
						<TabPanel>
							<div className="bg-[#181818] rounded-xl p-3">
								<CustomQuestionsManager event={event} />
							</div>
						</TabPanel>
					</TabPanels>
				</Tabs>
			</ConsoleLayout>
		</>
	)
}

function SendBlastModal({ sendBlastModal, setSendBlastModal, event }: { sendBlastModal: boolean; setSendBlastModal: (sendBlastModal: boolean) => void; event: any }) {
	const [subject, setSubject] = useState("")
	const [message, setMessage] = useState("")
	const [status, setStatus] = useState("")
	const [targetType, setTargetType] = useState("invitations")
	const [emailType, setEmailType] = useState("custom")
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState("")

	const toast = useToast()

	useEffect(() => {
		if (!sendBlastModal) {
			setSubject("")
			setMessage("")
			setStatus("")
			setTargetType("invitations")
			setEmailType("custom")
			setError("")
		}
	}, [sendBlastModal])

	const onSendBlast = async () => {
		if (!status || !subject.trim() || !message.trim()) {
			setError("All fields are required.")
			return
		}
		setError("")
		setLoading(true)
		try {
			await axios.post("/api/send-blast", {
				event,
				message,
				subject,
				status,
				targetType,
				emailType,
				eventLink: `${process.env.NEXT_PUBLIC_URL}/${event.slug}`,
			})

			toast({
				title: "Blast sent!",
				status: "success",
				duration: 3000,
				isClosable: true,
			})
		} catch (error) {
			toast({
				title: "Failed to send blast.",
				status: "error",
				duration: 3000,
				isClosable: true,
			})
		}
		setLoading(false)
		setSendBlastModal(false)
	}

	return (
		<Modal isOpen={sendBlastModal} onClose={() => setSendBlastModal(false)} isCentered size="xl">
			<ModalOverlay />
			<ModalContent bg="#1E1E1E" color="white">
				<ModalHeader>Send a Blast</ModalHeader>
				<ModalCloseButton />
				<ModalBody>
					<Box display="flex" flexDirection="column" gap={4}>
						<Text fontWeight="bold">Target Audience</Text>
						<Select
							mb={4}
							placeholder="Select target audience"
							value={targetType}
							onChange={(e) => setTargetType(e.target.value)}
							isRequired
							bg="#090C10"
							borderColor="#444444"
							color="white"
							_placeholder={{ color: "gray.400" }}
							_focus={{
								bg: "#090C10",
								borderColor: "#888",
								color: "white",
							}}
							_hover={{
								bg: "#090C10",
								borderColor: "#666",
							}}
						>
							<option style={{ backgroundColor: "#090C10", color: "white" }} value="invitations">
								Event Invitations
							</option>
							<option style={{ backgroundColor: "#090C10", color: "white" }} value="bookings">
								Event Bookings
							</option>
						</Select>

						<Text fontWeight="bold">Email Type</Text>
						<Select
							mb={4}
							placeholder="Select email type"
							value={emailType}
							onChange={(e) => setEmailType(e.target.value)}
							isRequired
							bg="#090C10"
							borderColor="#444444"
							color="white"
							_placeholder={{ color: "gray.400" }}
							_focus={{
								bg: "#090C10",
								borderColor: "#888",
								color: "white",
							}}
							_hover={{
								bg: "#090C10",
								borderColor: "#666",
							}}
						>
							<option style={{ backgroundColor: "#090C10", color: "white" }} value="custom">
								Custom Message
							</option>
							<option style={{ backgroundColor: "#090C10", color: "white" }} value="availability">
								Event Availability
							</option>
						</Select>
						<Text fontWeight="bold">Status</Text>
						<Select
							mb={4}
							placeholder="Select a Status"
							value={status}
							onChange={(e) => setStatus(e.target.value)}
							isRequired
							bg="#090C10"
							borderColor="#444444"
							color="white"
							_placeholder={{ color: "gray.400" }}
							_focus={{
								bg: "#090C10",
								borderColor: "#888",
								color: "white",
							}}
							_hover={{
								bg: "#090C10",
								borderColor: "#666",
							}}
						>
							{targetType === "bookings" ? (
								<>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="all">
										All Bookings
									</option>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="pending">
										Pending
									</option>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="approved">
										Approved
									</option>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="confirmed">
										Confirmed
									</option>
								</>
							) : (
								<>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="pending">
										Pending
									</option>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="accepted">
										Accepted
									</option>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="rejected">
										Rejected
									</option>
								</>
							)}
						</Select>
						<h3 className="font-bold">Subject</h3>
						<Input
							type="text"
							placeholder="Enter a Subject here..."
							value={subject}
							onChange={(e) => setSubject(e.target.value)}
							mb={2}
							isRequired
							bg="#090C10"
							borderColor="#444444"
							color="white"
							_placeholder={{ color: "gray.400" }}
						/>

						<h3 className="font-bold">Body</h3>
						<Textarea
							rows={5}
							placeholder="Enter your blast message here..."
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							mb={2}
							isRequired
							bg="#090C10"
							borderColor="#444444"
							color="white"
							_placeholder={{ color: "gray.400" }}
						/>
						{error && <Text color="red.500">{error}</Text>}

						<Button size="lg" bg="#F79432" color="black" _hover={{ bg: "#f78c22" }} _active={{ bg: "#e67a10" }} isLoading={loading} onClick={onSendBlast}>
							Send Blast
						</Button>
					</Box>
				</ModalBody>
			</ModalContent>
		</Modal>
	)
}

function CustomQuestionsManager({ event }: { event: any }) {
	const toast = useToast()
	const [questions, setQuestions] = useState<any[]>(event.questions || [])
	const [saving, setSaving] = useState(false)
	const [isModalOpen, setIsModalOpen] = useState(false)
	const [editingIndex, setEditingIndex] = useState<number | null>(null)

	// Form state for the Add/Edit modal
	const [form, setForm] = useState<any>({
		title: '', type: 'text', isRequired: false,
		responseLength: 'short', selectionType: 'single', options: [],
		platform: 'instagram', collectJobTitle: false,
		termsContentType: 'text', termsContent: '', collectSignature: false,
	})
	const [optionInput, setOptionInput] = useState('')

	const openAddModal = () => {
		setForm({ title: '', type: 'text', isRequired: false, responseLength: 'short', selectionType: 'single', options: [], platform: 'instagram', collectJobTitle: false, termsContentType: 'text', termsContent: '', collectSignature: false })
		setOptionInput('')
		setEditingIndex(null)
		setIsModalOpen(true)
	}

	const openEditModal = (idx: number) => {
		const q = questions[idx]
		setForm({ ...q, options: q.options ? [...q.options] : [] })
		setOptionInput('')
		setEditingIndex(idx)
		setIsModalOpen(true)
	}

	const saveQuestions = async (updated: any[]) => {
		setSaving(true)
		try {
			await axios.post('/api/events/admin/update-questions', { eventId: event._id, questions: updated })
			setQuestions(updated)
			toast({ title: 'Questions saved!', status: 'success', duration: 2500, isClosable: true })
		} catch {
			toast({ title: 'Failed to save questions.', status: 'error', duration: 3000, isClosable: true })
		}
		setSaving(false)
	}

	const handleSaveQuestion = () => {
		if (!form.title.trim()) { toast({ title: 'Title is required.', status: 'warning', duration: 2500 }); return }
		const q = { ...form, id: editingIndex !== null ? questions[editingIndex].id : `q_${Date.now()}` }
		const updated = editingIndex !== null
			? questions.map((existing, i) => i === editingIndex ? q : existing)
			: [...questions, q]
		setIsModalOpen(false)
		saveQuestions(updated)
	}

	const handleDelete = (idx: number) => {
		const updated = questions.filter((_, i) => i !== idx)
		saveQuestions(updated)
	}

	const addOption = () => {
		const opt = optionInput.trim()
		if (!opt) return
		setForm((f: any) => ({ ...f, options: [...(f.options || []), opt] }))
		setOptionInput('')
	}
	const removeOption = (idx: number) => setForm((f: any) => ({ ...f, options: f.options.filter((_: any, i: number) => i !== idx) }))

	const qTypeLabel: Record<string, string> = {
		text: 'Text', options: 'Options', multiple_choice: 'Multiple Choice (Checkboxes)',
		social_profile: 'Social Profile', company: 'Company', checkbox: 'Checkbox',
		terms: 'Terms', mobile: 'Mobile Number', website: 'Website',
	}

	const getTitlePlaceholder = (type: string) => {
		switch (type) {
			case 'text': return "E.g. What's your dietary preference?"
			case 'options': return "E.g. Select your t-shirt size"
			case 'multiple_choice': return "E.g. Which sessions will you attend?"
			case 'social_profile': return "E.g. Please share your social profile link"
			case 'company': return "E.g. Where do you work?"
			case 'checkbox': return "E.g. I require wheelchair access"
			case 'terms': return "E.g. I agree to the rules and regulations"
			case 'mobile': return "E.g. What's the best number to reach you?"
			case 'website': return "E.g. Share a link to your personal website"
			default: return "E.g. Enter your question"
		}
	}

	return (
		<Box color="white">
			<Flex justify="space-between" align="center" mb={4}>
				<Heading size="md" color="white">Custom Questions</Heading>
				<Button bg="#F79432" color="black" fontWeight="bold" _hover={{ bg: '#E68422' }} onClick={openAddModal} isLoading={saving}>
					+ Add Question
				</Button>
			</Flex>

			{questions.length === 0 && (
				<Text color="#9C9C9C" textAlign="center" py={8}>No custom questions yet. Click &quot;Add Question&quot; to create one.</Text>
			)}

			{questions.map((q: any, idx: number) => (
				<Flex key={q.id} bg="#1E1E1E" border="1px solid #3E3E3E" rounded="xl" p={4} mb={3} align="center" justify="space-between">
					<Box>
						<Text fontWeight="bold">{q.title}</Text>
						<Text fontSize="sm" color="#9C9C9C">{qTypeLabel[q.type] || q.type}{q.isRequired ? ' · Required' : ' · Optional'}</Text>
					</Box>
					<Flex gap={2}>
						<Button size="sm" variant="outline" colorScheme="orange" onClick={() => openEditModal(idx)}>Edit</Button>
						<Button size="sm" colorScheme="red" variant="ghost" onClick={() => handleDelete(idx)}>Delete</Button>
					</Flex>
				</Flex>
			))}

			{/* Add/Edit Modal */}
			<Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} isCentered size="lg">
				<ModalOverlay />
				<ModalContent bg="#1E1E1E" color="white">
					<ModalHeader>{editingIndex !== null ? 'Edit Question' : 'Add Question'}</ModalHeader>
					<ModalCloseButton />
					<ModalBody pb={6}>
						<Flex direction="column" gap={4}>
							<Box>
								<Text mb={1} fontWeight="bold">Question Title</Text>
								<Input bg="#090C10" borderColor="#444" color="white" value={form.title} onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))} placeholder={getTitlePlaceholder(form.type)} />
							</Box>
							<Box>
								<Text mb={1} fontWeight="bold">Question Type</Text>
								<Select bg="#090C10" borderColor="#444" color="white" value={form.type} onChange={e => {
									const newType = e.target.value
									setForm((f: any) => {
										const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
										const autoTitle = newType === 'social_profile' ? `Add your ${cap(f.platform)}` : f.title
										const shouldAutoTitle = newType === 'social_profile' && (!f.title || /^add your /i.test(f.title))
										return { ...f, type: newType, title: shouldAutoTitle ? autoTitle : f.title }
									})
								}}>
									{Object.entries(qTypeLabel).map(([val, label]) => (
										<option key={val} value={val} style={{ backgroundColor: '#090C10' }}>{label}</option>
									))}
								</Select>
							</Box>

							{form.type === 'text' && (
								<Box>
									<Text mb={1} fontWeight="bold">Response Length</Text>
									<Select bg="#090C10" borderColor="#444" color="white" value={form.responseLength} onChange={e => setForm((f: any) => ({ ...f, responseLength: e.target.value }))}>
										<option value="short" style={{ backgroundColor: '#090C10' }}>Short Answer</option>
										<option value="multi-line" style={{ backgroundColor: '#090C10' }}>Multi-Line</option>
									</Select>
								</Box>
							)}

							{(form.type === 'options' || form.type === 'multiple_choice' || form.type === 'checkbox') && (
								<Box>
									{form.type === 'options' && (
										<>
											<Text mb={1} fontWeight="bold">Selection Type</Text>
											<Select bg="#090C10" borderColor="#444" color="white" value={form.selectionType} onChange={e => setForm((f: any) => ({ ...f, selectionType: e.target.value }))}>
												<option value="single" style={{ backgroundColor: '#090C10' }}>Single Choice</option>
												<option value="multiple" style={{ backgroundColor: '#090C10' }}>Multiple Choice</option>
											</Select>
										</>
									)}
									<Text mt={form.type === 'options' ? 3 : 0} mb={1} fontWeight="bold">Options</Text>
									<Text fontSize="sm" color="#9C9C9C" mb={2}>
										{form.type === 'checkbox'
											? 'Add checkbox options (leave empty for a single agree/disagree checkbox)'
											: form.type === 'multiple_choice'
											? 'Add options — attendees can select multiple'
											: 'Add selectable options'}
									</Text>
									<Flex gap={2} mb={2}>
										<Input bg="#090C10" borderColor="#444" color="white" value={optionInput} onChange={e => setOptionInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addOption()} placeholder="Add option..." />
										<Button onClick={addOption} bg="#3E3E3E" color="white" _hover={{ bg: '#4A4A4A' }}>Add</Button>
									</Flex>
									{(form.options || []).map((opt: string, i: number) => (
										<Flex key={i} bg="#2A2A2A" rounded="md" px={3} py={1} mb={1} justify="space-between" align="center">
											<Text fontSize="sm">{opt}</Text>
											<Button size="xs" variant="ghost" colorScheme="red" onClick={() => removeOption(i)}>✕</Button>
										</Flex>
									))}
								</Box>
							)}

							{form.type === 'social_profile' && (
								<Box>
									<Text mb={1} fontWeight="bold">Platform</Text>
									<Select bg="#090C10" borderColor="#444" color="white" value={form.platform} onChange={e => {
										const p = e.target.value
										const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
										setForm((f: any) => ({
											...f,
											platform: p,
											title: (!f.title || /^add your /i.test(f.title)) ? `Add your ${cap(p)}` : f.title,
										}))
									}}>
										{['instagram', 'twitter', 'linkedin', 'facebook', 'tiktok', 'youtube', 'github'].map(p => (
											<option key={p} value={p} style={{ backgroundColor: '#090C10' }}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
										))}
									</Select>
								</Box>
							)}

							{form.type === 'company' && (
								<Flex align="center" gap={3}>
									<Text fontWeight="bold">Collect Job Title</Text>
									<input type="checkbox" checked={form.collectJobTitle} onChange={e => setForm((f: any) => ({ ...f, collectJobTitle: e.target.checked }))} />
								</Flex>
							)}

							{form.type === 'terms' && (
								<Box>
									<Text mb={1} fontWeight="bold">Terms Content Type</Text>
									<Select bg="#090C10" borderColor="#444" color="white" value={form.termsContentType} onChange={e => setForm((f: any) => ({ ...f, termsContentType: e.target.value }))}>
										<option value="text" style={{ backgroundColor: '#090C10' }}>Text</option>
										<option value="link" style={{ backgroundColor: '#090C10' }}>Link</option>
									</Select>
									<Text mt={3} mb={1} fontWeight="bold">Terms Content</Text>
									<Textarea bg="#090C10" borderColor="#444" color="white" value={form.termsContent} onChange={e => setForm((f: any) => ({ ...f, termsContent: e.target.value }))} placeholder="Enter terms text or URL..." rows={3} />
									<Flex align="center" gap={3} mt={3}>
										<Text fontWeight="bold">Collect Signature</Text>
										<input type="checkbox" checked={form.collectSignature} onChange={e => setForm((f: any) => ({ ...f, collectSignature: e.target.checked }))} />
									</Flex>
								</Box>
							)}

							<Flex align="center" gap={3}>
								<Text fontWeight="bold">Required</Text>
								<input type="checkbox" checked={form.isRequired} onChange={e => setForm((f: any) => ({ ...f, isRequired: e.target.checked }))} />
								<Text fontSize="sm" color="#9C9C9C">Users must answer this before buying a ticket</Text>
							</Flex>

							<Button bg="#F79432" color="black" fontWeight="bold" _hover={{ bg: '#E68422' }} onClick={handleSaveQuestion} isLoading={saving}>
								{editingIndex !== null ? 'Save Changes' : 'Add Question'}
							</Button>
						</Flex>
					</ModalBody>
				</ModalContent>
			</Modal>
		</Box>
	)
}

const GUESTS_PAGE_SIZE = 10

function GuestsList({ eventId, event }: { eventId: string; event?: any }) {
	const [selectedGuest, setSelectedGuest] = useState<{ guest: any; booking: any; checkIn: any } | null>(null)
	const [page, setPage] = useState(1)

	const fetchGuests = async () => {
		const res = await axios.get("/api/guests-list", { params: { eventId } })
		return res.data || []
	}

	const fetchBookings = async () => {
		const res = await axios.post("/api/get-bookings", { eventId })
		return res.data || []
	}

	const {
		data: guests = [],
		isLoading: guestsLoading,
		isError: guestsError,
	} = useQuery({
		queryKey: ["guests-list", eventId],
		queryFn: fetchGuests,
	})

	const {
		data: bookings = [],
	} = useQuery({
		queryKey: ["event-bookings", eventId],
		queryFn: fetchBookings,
	})

	const { data: checkIns = [] } = useQuery({
		queryKey: ["check-in-status", eventId],
		queryFn: () => axios.get("/api/check-in/booking-status", { params: { eventId } }).then(r => r.data?.data || []),
	})

	const guestByEmail: Record<string, any> = {}
	guests.forEach((g: any) => {
		if (g.email) guestByEmail[g.email.toLowerCase()] = g
	})

	const bookingByEmail: Record<string, any> = {}
	;(bookings as any[]).forEach((b: any) => {
		if (b.customerEmail) bookingByEmail[b.customerEmail.toLowerCase()] = b
	})

	const checkInMap: Record<string, { checkedInCount: number; isFullyCheckedIn: boolean }> = {}
	;(checkIns as any[]).forEach((ci: any) => {
		checkInMap[ci.bookingId] = { checkedInCount: ci.checkedInCount, isFullyCheckedIn: ci.isFullyCheckedIn }
	})

	const eventQuestions: any[] = event?.questions || []

	const formatAnswer = (qId: string, booking: any): string => {
		if (!booking?.customAnswers) return '—'
		const ans = booking.customAnswers.find((a: any) => a.questionId === qId)
		if (!ans || ans.answer == null) return '—'
		if (Array.isArray(ans.answer)) return ans.answer.length ? ans.answer.join(', ') : '—'
		if (typeof ans.answer === 'object') {
			const parts: string[] = []
			if (ans.answer.company) parts.push(ans.answer.company)
			if (ans.answer.jobTitle) parts.push(ans.answer.jobTitle)
			if (ans.answer.agreed !== undefined) parts.push(ans.answer.agreed ? 'Agreed' : 'Not agreed')
			if (ans.answer.signature) parts.push(`Signed: ${ans.answer.signature}`)
			return parts.join(' · ') || '—'
		}
		return String(ans.answer) || '—'
	}

	if (guestsLoading) return <Text>Loading guests...</Text>
	if (guestsError) return <Text color="red.500">Failed to load guests.</Text>

	const allEmails = Array.from(new Set([
		...guests.map((g: any) => g.email?.toLowerCase()).filter(Boolean),
		...bookings.map((b: any) => b.customerEmail?.toLowerCase()).filter(Boolean)
	]))

	if (!allEmails.length) return <Text>No guests or bookings found.</Text>

	const totalPages = Math.ceil(allEmails.length / GUESTS_PAGE_SIZE)
	const pagedEmails = allEmails.slice((page - 1) * GUESTS_PAGE_SIZE, page * GUESTS_PAGE_SIZE)

	return (
		<>
			<Box className="bg-[#181818] rounded-xl p-3 flex flex-col gap-y-3" overflowX="auto">
				<TableContainer>
					<Table variant="simple" size="sm">
						<Thead>
							<Tr>
								<Th color="#9C9C9C">Name</Th>
								<Th color="#9C9C9C">Email</Th>
								<Th color="#9C9C9C">Status</Th>
								<Th color="#9C9C9C">Invited At</Th>
								<Th color="#9C9C9C">Check-In</Th>
								<Th color="#9C9C9C"></Th>
							</Tr>
						</Thead>
						<Tbody>
							{pagedEmails.map((email: string) => {
								const guest = guestByEmail[email]
								const booking = bookingByEmail[email]
								const ci = booking?._id ? checkInMap[booking._id.toString()] : null
								return (
									<Tr key={email}>
										<Td color="white">{booking?.customerName || guest?.name || "—"}</Td>
										<Td color="white">{email}</Td>
										<Td color="white">{guest?.status || (booking ? 'Purchased' : '—')}</Td>
										<Td color="white">{guest?.invitedAt ? DateTime.fromISO(guest.invitedAt).toLocaleString(DateTime.DATETIME_MED) : "—"}</Td>
										<Td>
											{!booking?._id
												? <Badge colorScheme="gray">N/A</Badge>
												: !ci
												? <Badge colorScheme="gray">Not Checked In</Badge>
												: ci.isFullyCheckedIn
												? <Badge colorScheme="green">Fully Checked In</Badge>
												: <Badge colorScheme="yellow">Partial ({ci.checkedInCount})</Badge>
											}
										</Td>
										<Td>
											<Button
												size="sm"
												variant="ghost"
												color="#F79432"
												_hover={{ bg: '#2A2A2A' }}
												leftIcon={<EyeIcon style={{ width: 14, height: 14 }} />}
												onClick={() => setSelectedGuest({ guest, booking, checkIn: ci })}
											>
												View Details
											</Button>
										</Td>
									</Tr>
								)
							})}
						</Tbody>
					</Table>
				</TableContainer>

				{totalPages > 1 && (
					<Flex justify="center" align="center" gap={2} mt={3} flexWrap="wrap">
						<Button
							size="sm"
							bg="#2A2A2A" color="white" border="1px solid #444"
							_hover={{ bg: '#3A3A3A' }}
							_disabled={{ opacity: 0.4, cursor: 'not-allowed' }}
							isDisabled={page <= 1}
							onClick={() => setPage(p => p - 1)}
						>
							&lt; Prev
						</Button>
						{Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
							<Button
								key={p}
								size="sm"
								bg={p === page ? '#F79432' : '#2A2A2A'}
								color={p === page ? 'black' : 'white'}
								border="1px solid #444"
								_hover={{ bg: p === page ? '#e6832a' : '#3A3A3A' }}
								onClick={() => setPage(p)}
							>
								{p}
							</Button>
						))}
						<Button
							size="sm"
							bg="#2A2A2A" color="white" border="1px solid #444"
							_hover={{ bg: '#3A3A3A' }}
							_disabled={{ opacity: 0.4, cursor: 'not-allowed' }}
							isDisabled={page >= totalPages}
							onClick={() => setPage(p => p + 1)}
						>
							Next &gt;
						</Button>
					</Flex>
				)}
			</Box>

			{/* Guest Detail Modal */}
			<Modal isOpen={!!selectedGuest} onClose={() => setSelectedGuest(null)} isCentered size="2xl">
				<ModalOverlay />
				<ModalContent bg="#1E1E1E" color="white">
					<ModalHeader borderBottom="1px solid #3E3E3E">Guest Details</ModalHeader>
					<ModalCloseButton />
					<ModalBody pb={6}>
						{selectedGuest && (
							<Flex direction="column" gap={5}>
								{/* Basic info */}
								<Flex gap={6} wrap="wrap">
									<Box>
										<Text fontSize="xs" color="#9C9C9C">Name</Text>
										<Text fontWeight="semibold">{selectedGuest.booking?.customerName || selectedGuest.guest?.name || '—'}</Text>
									</Box>
									<Box>
										<Text fontSize="xs" color="#9C9C9C">Email</Text>
										<Text fontWeight="semibold">{selectedGuest.booking?.customerEmail || selectedGuest.guest?.email || '—'}</Text>
									</Box>
									<Box>
										<Text fontSize="xs" color="#9C9C9C">Status</Text>
										<Text fontWeight="semibold">{selectedGuest.guest?.status || (selectedGuest.booking ? 'Purchased' : '—')}</Text>
									</Box>
									<Box>
										<Text fontSize="xs" color="#9C9C9C">Invited At</Text>
										<Text fontWeight="semibold">{selectedGuest.guest?.invitedAt ? DateTime.fromISO(selectedGuest.guest.invitedAt).toLocaleString(DateTime.DATETIME_MED) : '—'}</Text>
									</Box>
								</Flex>

								{/* Questions */}
								{eventQuestions.length > 0 && (
									<Box>
										<Heading size="sm" mb={3} color="white">Questions</Heading>
										<Flex direction="column" gap={2}>
											{eventQuestions.map((q: any) => (
												<Box key={q.id} bg="#2A2A2A" rounded="lg" px={4} py={3}>
													<Text fontSize="sm" color="#F79432" fontWeight="semibold" mb={1}>{q.title}{q.isRequired ? ' *' : ''}</Text>
													<Text fontSize="sm" color="white">{formatAnswer(q.id, selectedGuest.booking)}</Text>
												</Box>
											))}
										</Flex>
									</Box>
								)}
							</Flex>
						)}
					</ModalBody>
				</ModalContent>
			</Modal>
		</>
	)
}


function InviteGuestsModal({ inviteGuestsModal, setInviteGuestsModal, event }: { inviteGuestsModal: boolean; setInviteGuestsModal: (inviteGuestsModal: boolean) => void; event: any }) {
	const [inviteMode, setInviteMode] = useState<"email" | "users">("email")

	// Email invite state
	const [emails, setEmails] = useState<string[]>([])
	const [step, setStep] = useState(1)
	const [loading, setLoading] = useState(false)
	const [message, setMessage] = useState("")
	const [emailInput, setEmailInput] = useState("")
	const [emailError, setEmailError] = useState("")

	// Jetzy user search state
	const [userQuery, setUserQuery] = useState("")
	const [userResults, setUserResults] = useState<any[]>([])
	const [searching, setSearching] = useState(false)
	const [invitingIds, setInvitingIds] = useState<string[]>([])

	const toast = useToast()

	const handleAddEmail = () => {
		const email = emailInput.trim()
		if (!email) { setEmailError("Please enter an email"); return }
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEmailError("Please enter a valid email"); return }
		if (emails.includes(email)) { setEmailError("Email already added"); return }
		setEmails([...emails, email])
		setEmailInput("")
		setEmailError("")
	}

	const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") { e.preventDefault(); handleAddEmail() }
	}

	const handleNext = () => setStep(2)
	const handleBack = () => setStep(1)

	const onSendInvitation = async () => {
		setLoading(true)
		try {
			await axios.post("/api/send-invites", {
				emails,
				message,
				subject: `Hi, Jetzy Events invite you to join ${event.name}!`,
				eventLink: `${process.env.NEXT_PUBLIC_URL}/events/${event._id}/guests/invite`,
				eventId: event._id,
			})
			setLoading(false)
			setStep(1)
			setEmails([])
			setMessage("")
			setInviteGuestsModal(false)
			toast({ title: "Invitations sent!", status: "success", duration: 3000, isClosable: true })
		} catch (error) {
			setLoading(false)
			toast({ title: "Failed to send invitations.", status: "error", duration: 3000, isClosable: true })
		}
	}

	const handleUserSearch = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!userQuery.trim()) return
		try {
			setSearching(true)
			const res = await axios.get(`/api/events/${event._id}/search-users`, {
				params: { query: userQuery, page: 1, perPage: 20 },
			})
			const data = res.data
			const docs = data?.data?.docs || data?.data?.users || data?.data?.data || data?.docs || data?.users || []
			setUserResults(docs)
		} catch (err) {
			console.error(err)
		} finally {
			setSearching(false)
		}
	}

	const handleInviteUser = async (user: any) => {
		const userId = user._id
		setInvitingIds(prev => [...prev, userId])
		try {
			const res = await axios.post(`/api/events/${event._id}/invite-jetzy-user`, {
				userId,
				userEmail: user.email || user.emailAddress || null,
				userName: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
			})

			setUserResults(prev => prev.map(u => u._id === userId ? { ...u, isInvited: true } : u))
			const { emailSent } = res.data?.data || {}
			toast({
				title: "Invitation sent!",
				description: emailSent ? "Push notification and email sent." : "Push notification sent. Email not available for this user.",
				status: "success",
				duration: 3000,
				isClosable: true,
			})
		} catch (err) {
			toast({ title: "Failed to send invitation.", status: "error", duration: 2000, isClosable: true })
		} finally {
			setInvitingIds(prev => prev.filter(id => id !== userId))
		}
	}

	useEffect(() => {
		if (!inviteGuestsModal) {
			setStep(1)
			setEmails([])
			setMessage("")
			setEmailInput("")
			setEmailError("")
			setUserQuery("")
			setUserResults([])
			setInviteMode("email")
		}
	}, [inviteGuestsModal])

	return (
		<Modal isOpen={inviteGuestsModal} onClose={() => setInviteGuestsModal(false)} isCentered size={inviteMode === "email" && step === 2 ? "4xl" : "2xl"}>
			<ModalOverlay />
			<ModalContent bg="#1E1E1E" color="white">
				<ModalHeader>Invite Guests</ModalHeader>
				<ModalCloseButton />
				<ModalBody>
					<Box display="flex" flexDirection="column" gap={4}>
						{/* Mode tabs */}
						<Flex gap={2} mb={2}>
							<Button
								size="sm"
								bg={inviteMode === "email" ? "#F79432" : "#383838"}
								color={inviteMode === "email" ? "black" : "white"}
								_hover={{ bg: inviteMode === "email" ? "#f78c22" : "#444" }}
								onClick={() => { setInviteMode("email"); setStep(1) }}
							>
								Email Invite
							</Button>
							<Button
								size="sm"
								bg={inviteMode === "users" ? "#F79432" : "#383838"}
								color={inviteMode === "users" ? "black" : "white"}
								_hover={{ bg: inviteMode === "users" ? "#f78c22" : "#444" }}
								onClick={() => setInviteMode("users")}
							>
								Search Jetzy Users
							</Button>
						</Flex>

						{/* Email invite flow */}
						{inviteMode === "email" && step === 1 && (
							<>
								<Text fontWeight="bold">Invite your guests by email:</Text>
								<Flex gap={2}>
									<Input
										type="email"
										placeholder="Enter your guest's email"
										value={emailInput}
										onChange={(e) => setEmailInput(e.target.value)}
										onKeyDown={handleInputKeyDown}
										isInvalid={!!emailError}
									/>
									<Button bg="#F79432" color="black" _hover={{ bg: "#f78c22" }} _active={{ bg: "#e67a10" }} onClick={handleAddEmail}>
										Add
									</Button>
								</Flex>
								{emailError && <Text color="red.500" fontSize="sm">{emailError}</Text>}
								{emails.length > 0 && (
									<Box mt={2}>
										<Text fontWeight="bold">Inviting {emails.length} Emails:</Text>
										<UnorderedList listStyleType="none" m="0" pt="2">
											{emails.map((email) => (
												<ListItem key={email} className="bg-[#383838] p-2 rounded-lg" my="2">
													<Flex align="center" justify="space-between">
														<span>{email}</span>
														<Button size="xs" colorScheme="red" variant="ghost" ml={2} onClick={() => setEmails(emails.filter((e) => e !== email))}>x</Button>
													</Flex>
												</ListItem>
											))}
										</UnorderedList>
									</Box>
								)}
								<Button size="lg" bg="#F79432" color="black" _hover={{ bg: "#f78c22" }} _active={{ bg: "#e67a10" }} mt={4} isDisabled={emails.length === 0} onClick={handleNext} width="full">
									Next
								</Button>
							</>
						)}
						{inviteMode === "email" && step === 2 && (
							<>
								<Flex align="flex-start" justify="space-between" gap={6} flexWrap="wrap">
									<Box flex="1">
										<Text mb={2}>Here are the emails you have entered:</Text>
										<UnorderedList pl={5}>
											{emails.map((email) => (<ListItem key={email}>{email}</ListItem>))}
										</UnorderedList>
									</Box>
									<Box borderWidth="1px" borderRadius="xl" p={4} flex="1" minW="300px">
										<Text fontWeight="bold" mb={2}>Hi, Jetzy Events invites you to join {event.name}.</Text>
										<Textarea rows={3} placeholder="Enter a custom message here..." value={message} onChange={(e) => setMessage(e.target.value)} mb={2} />
										<Text fontWeight="bold" mb={1}>RSVP: {process.env.NEXT_PUBLIC_URL}/{event.slug}</Text>
										<Text fontSize="sm">We will send guests an invitation link to register for the event.</Text>
									</Box>
								</Flex>
								<Flex mt={4} mb={4} justify="space-between">
									<Button onClick={handleBack}>Back</Button>
									<Button bg="#F79432" color="black" _hover={{ bg: "#f78c22" }} _active={{ bg: "#e67a10" }} isLoading={loading} onClick={onSendInvitation}>
										Send Invitations
									</Button>
								</Flex>
							</>
						)}

						{/* Jetzy user search */}
						{inviteMode === "users" && (
							<>
								<Text fontSize="sm" color="gray.400">Search Jetzy app users and invite them. They&apos;ll receive a push notification and email.</Text>
								<form onSubmit={handleUserSearch}>
									<Flex gap={2}>
										<Input
											placeholder="Search by name or username..."
											value={userQuery}
											onChange={(e) => setUserQuery(e.target.value)}
										/>
										<Button type="submit" bg="#F79432" color="black" _hover={{ bg: "#f78c22" }} isLoading={searching} minW="80px">
											Search
										</Button>
									</Flex>
								</form>
								<Box maxH="320px" overflowY="auto" display="flex" flexDirection="column" gap={2}>
									{searching ? (
										<Text color="gray.400" textAlign="center" py={4}>Searching...</Text>
									) : userResults.length === 0 && userQuery ? (
										<Text color="gray.500" textAlign="center" py={4}>No users found</Text>
									) : userResults.length === 0 ? (
										<Text color="gray.500" textAlign="center" py={4}>Search for Jetzy users to invite</Text>
									) : (
										userResults.map((user: any) => (
											<Flex key={user._id} align="center" justify="space-between" bg="#2a2a2a" p={3} borderRadius="xl" borderWidth="1px" borderColor="#3a3a3a">
												<Flex align="center" gap={3}>
													<Box w="40px" h="40px" borderRadius="full" bg="gray.700" overflow="hidden" flexShrink={0}>
														{user.image && <img src={user.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
													</Box>
													<Box>
														<Text fontWeight="medium" fontSize="sm">{user.firstName} {user.lastName}</Text>
														{user.email && <Text fontSize="xs" color="gray.500">{user.email}</Text>}
													</Box>
												</Flex>
												<Button
													size="sm"
													isLoading={invitingIds.includes(user._id)}
													isDisabled={user.isInvited || user.isMember}
													bg={user.isInvited ? "green.800" : user.isMember ? "gray.700" : "#F79432"}
													color={user.isInvited ? "green.300" : user.isMember ? "gray.400" : "black"}
													_hover={{ bg: user.isInvited || user.isMember ? undefined : "#f78c22" }}
													onClick={() => handleInviteUser(user)}
												>
													{user.isMember ? "Member" : user.isInvited ? "Invited" : "Invite"}
												</Button>
											</Flex>
										))
									)}
								</Box>
							</>
						)}
					</Box>
				</ModalBody>
			</ModalContent>
		</Modal>
	)
}

function ShareModal({ shareModal, setShareModal, eventSlug }: { shareModal: boolean; setShareModal: (shareModal: boolean) => void; eventSlug: string }) {
	const [copied, setCopied] = useState(false)

	const sharelink = `${process.env.NEXT_PUBLIC_URL}/${eventSlug}`

	const onCopy = () => {
		navigator.clipboard.writeText(sharelink).then(() => {
			setCopied(true)
			setTimeout(() => setCopied(false), 1500)
		})
	}

	return (
		<Modal isOpen={shareModal} onClose={() => setShareModal(false)} isCentered>
			<ModalOverlay />
			<ModalContent bg="#1E1E1E" color="white">
				<ModalHeader>Share Event</ModalHeader>
				<ModalCloseButton />
				<ModalBody>
					<Box display="flex" flexDirection="column" gap={3}>
						<Text fontWeight="bold">Share the link:</Text>
						<Box w="100%" borderWidth="1px" bg="#090C10" borderColor="#444444" color="white" _placeholder={{ color: "gray.400" }} rounded="xl" p={2} wordBreak="break-all">
							{sharelink}
						</Box>
						<Button onClick={onCopy} bg="#F79432" color="black" _hover={{ bg: "#f78c22" }} _active={{ bg: "#e67a10" }} size="lg">
							{copied ? "Copied!" : "Copy"}
						</Button>
					</Box>
				</ModalBody>
			</ModalContent>
		</Modal>
	)
}

function EventDateTime({ iso }: { iso: string }) {
	const [formatted, setFormatted] = useState("")
	useEffect(() => {
		setFormatted(DateTime.fromISO(iso).setZone("America/New_York").toLocaleString(DateTime.DATETIME_MED))
	}, [iso])
	return <p className="font-semibold">{formatted}</p>
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	await ensureDbConnected()
	const authResult = await authorizedOnly(context)
	if ('redirect' in authResult) return authResult

	const eventId = context.query.eventId as string
	if (!eventId) return { notFound: true }

	const event = await Events.findOne({ _id: eventId, isDeleted: false })
	if (!event) return { notFound: true }

	return {
		props: {
			event: JSON.stringify(event),
		},
	}
}

function DailyViewsModal({ isOpen, onClose, dailyViews }: { isOpen: boolean; onClose: () => void; dailyViews: any[] }) {
	return (
		<Modal isOpen={isOpen} onClose={onClose} isCentered size="xl">
			<ModalOverlay />
			<ModalContent bg="#1E1E1E" color="white">
				<ModalHeader>Daily Event Views</ModalHeader>
				<ModalCloseButton />
				<ModalBody pb={6}>
					{dailyViews.length === 0 ? (
						<Text>No views recorded for this event yet.</Text>
					) : (
						<TableContainer maxHeight="400px" overflowY="auto">
							<Table variant="simple" colorScheme="gray">
								<Thead>
									<Tr>
										<Th color="gray.400">Date</Th>
										<Th color="gray.400" isNumeric>Views</Th>
										<Th color="gray.400" isNumeric>Unique Sessions</Th>
									</Tr>
								</Thead>
								<Tbody>
									{dailyViews.slice().reverse().map((day: any) => (
										<Tr key={day.date}>
											<Td>{DateTime.fromISO(day.date).toLocaleString(DateTime.DATE_MED)}</Td>
											<Td isNumeric>{day.views}</Td>
											<Td isNumeric>{day.uniqueViewers}</Td>
										</Tr>
									))}
								</Tbody>
							</Table>
						</TableContainer>
					)}
				</ModalBody>
			</ModalContent>
		</Modal>
	)
}

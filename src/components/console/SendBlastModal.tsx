import { useState, useEffect } from "react"
import { Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, useToast } from "@chakra-ui/react"
import { FiSend } from "react-icons/fi"
import axios from "axios"

interface SendBlastModalProps {
	sendBlastModal: boolean
	setSendBlastModal: (sendBlastModal: boolean) => void
	event: any
}

export function SendBlastModal({ sendBlastModal, setSendBlastModal, event }: SendBlastModalProps) {
	const [targetAudience, setTargetAudience] = useState<"all" | "bookings_only" | "invited_only">("all")
	const [emailType, setEmailType] = useState<"invitation" | "reminder" | "update" | "announcement">("update")
	const [status, setStatus] = useState<"all" | "pending" | "accepted" | "rejected">("all")
	const [subject, setSubject] = useState("")
	const [message, setMessage] = useState("")
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState("")
	const toast = useToast()

	const onSendBlast = async () => {
		if (!subject.trim() || !message.trim()) {
			setError("Subject and message are required")
			return
		}

		setLoading(true)
		setError("")
		try {
			await axios.post("/api/send-blast", {
				targetAudience,
				emailType,
				status,
				subject,
				message,
				eventId: event._id,
			})
			setLoading(false)
			setSendBlastModal(false)
			setSubject("")
			setMessage("")
			toast({
				title: "Blast email sent successfully!",
				status: "success",
				duration: 3000,
				isClosable: true,
			})
		} catch (error) {
			setLoading(false)
			setError("Failed to send blast email. Please try again.")
		}
	}

	useEffect(() => {
		if (!sendBlastModal) {
			setSubject("")
			setMessage("")
			setError("")
			setTargetAudience("all")
			setEmailType("update")
			setStatus("all")
		}
	}, [sendBlastModal])

	return (
		<Modal isOpen={sendBlastModal} onClose={() => setSendBlastModal(false)} isCentered size="2xl">
			<ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
			<ModalContent
				bg="white"
				color="#1F2937"
				mx={{ base: 4, md: 0 }}
				maxH={{ base: "90vh", md: "auto" }}
				overflowY={{ base: "auto", md: "visible" }}
				borderRadius="2xl"
				border="1px solid #E5E7EB"
				boxShadow="xl"
			>
				<ModalHeader fontSize={{ base: "lg", md: "xl" }} borderBottom="1px solid #E5E7EB" pb={4}>
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
							<FiSend className="text-white text-lg" />
						</div>
						<span>Send Blast Email</span>
					</div>
				</ModalHeader>
				<ModalCloseButton color="#6B7280" _hover={{ bg: "#F3F4F6" }} />
				<ModalBody pb={6} pt={6}>
					<div className="flex flex-col gap-4">
						{/* Target Audience */}
						<div>
							<label className="block text-sm font-semibold text-gray-700 mb-2">Target Audience</label>
							<select
								value={targetAudience}
								onChange={(e) => setTargetAudience(e.target.value as any)}
								className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm md:text-base transition-all focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500"
							>
								<option value="all">All (Bookings + Invited)</option>
								<option value="bookings_only">Bookings Only</option>
								<option value="invited_only">Invited Only</option>
							</select>
						</div>

						{/* Email Type */}
						<div>
							<label className="block text-sm font-semibold text-gray-700 mb-2">Email Type</label>
							<select
								value={emailType}
								onChange={(e) => setEmailType(e.target.value as any)}
								className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm md:text-base transition-all focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500"
							>
								<option value="invitation">Invitation</option>
								<option value="reminder">Reminder</option>
								<option value="update">Update</option>
								<option value="announcement">Announcement</option>
							</select>
						</div>

						{/* Status Filter */}
						{targetAudience === "invited_only" && (
							<div>
								<label className="block text-sm font-semibold text-gray-700 mb-2">Status Filter</label>
								<select
									value={status}
									onChange={(e) => setStatus(e.target.value as any)}
									className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm md:text-base transition-all focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500"
								>
									<option value="all">All</option>
									<option value="pending">Pending</option>
									<option value="accepted">Accepted</option>
									<option value="rejected">Rejected</option>
								</select>
							</div>
						)}

						{/* Subject */}
						<div>
							<label className="block text-sm font-semibold text-gray-700 mb-2">Subject</label>
							<input
								type="text"
								placeholder="Enter email subject"
								value={subject}
								onChange={(e) => setSubject(e.target.value)}
								className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm md:text-base transition-all focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500"
							/>
						</div>

						{/* Message */}
						<div>
							<label className="block text-sm font-semibold text-gray-700 mb-2">Message</label>
							<textarea
								rows={5}
								placeholder="Enter your message here..."
								value={message}
								onChange={(e) => setMessage(e.target.value)}
								className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm md:text-base transition-all focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500 resize-none"
							/>
						</div>

						{/* Error Message */}
						{error && (
							<div className="bg-red-50 border border-red-200 rounded-xl p-3">
								<p className="text-red-600 text-sm">{error}</p>
							</div>
						)}

						{/* Submit Button */}
						<button
							onClick={onSendBlast}
							disabled={loading}
							className={`w-full py-3 rounded-xl font-semibold text-sm md:text-base transition-all flex items-center justify-center gap-2 ${
								loading
									? "bg-gray-300 text-gray-500 cursor-not-allowed"
									: "bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700 shadow-lg shadow-purple-500/30"
							}`}
						>
							<FiSend className="text-lg" />
							{loading ? "Sending..." : "Send Blast"}
						</button>
					</div>
				</ModalBody>
			</ModalContent>
		</Modal>
	)
}

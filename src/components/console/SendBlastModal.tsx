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
	const [step, setStep] = useState<"configure" | "preview">("configure")
	const [targetAudience, setTargetAudience] = useState<"all" | "bookings_only" | "invited_only" | "waiting_list" | "custom">("all")
	const [emailType, setEmailType] = useState<"invitation" | "reminder" | "update" | "announcement" | "custom">("update")
	const [status, setStatus] = useState<"all" | "pending" | "accepted" | "declined">("all")
	const [recipientCount, setRecipientCount] = useState<number | null>(null)
	const [subject, setSubject] = useState("")
	const [message, setMessage] = useState("")
	const [customEmails, setCustomEmails] = useState("")
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState("")
	const toast = useToast()

	// Fetch recipient count when settings change
	useEffect(() => {
		if (sendBlastModal && event?._id) {
			if (targetAudience === "custom") {
				// Count custom emails
				const emails = customEmails
					.split(/[,\n]/)
					.map(e => e.trim())
					.filter(e => e && e.includes("@"))
				setRecipientCount(emails.length)
			} else {
				fetchRecipientCount()
			}
		}
	}, [targetAudience, status, customEmails, sendBlastModal, event])

	const fetchRecipientCount = async () => {
		try {
			const response = await axios.get(`/api/events/blast/recipients-count`, {
				params: {
					eventId: event._id,
					targetAudience,
					status,
				},
			})
			setRecipientCount(response.data.data.count)
		} catch (error) {
			console.error("Failed to fetch recipient count", error)
			setRecipientCount(null)
		}
	}

	const onSendBlast = async () => {
		if (!subject.trim() || !message.trim()) {
			setError("Subject and message are required")
			return
		}

		if (recipientCount === 0) {
			setError("No recipients found for the selected audience")
			return
		}

		setLoading(true)
		setError("")
		try {
			// Parse custom emails if target is custom
			let customEmailsList: string[] = []
			if (targetAudience === "custom") {
				customEmailsList = customEmails
					.split(/[,\n]/)
					.map(e => e.trim())
					.filter(e => e && e.includes("@"))
				
				if (customEmailsList.length === 0) {
					setError("Please enter at least one valid email address")
					setLoading(false)
					return
				}
			}

			const response = await axios.post("/api/events/blast/send", {
				targetAudience,
				emailType,
				status,
				subject,
				message,
				customEmails: customEmailsList.length > 0 ? customEmailsList : undefined,
				eventId: event._id,
			})
			setLoading(false)
			setSendBlastModal(false)
			setSubject("")
			setMessage("")
			toast({
				title: `Blast email sent to ${response.data.data.sentCount} recipients!`,
				status: "success",
				duration: 5000,
				isClosable: true,
			})
		} catch (error: any) {
			setLoading(false)
			const errorMsg = error.response?.data?.message || "Failed to send blast email. Please try again."
			setError(errorMsg)
			toast({
				title: "Failed to send blast email",
				description: errorMsg,
				status: "error",
				duration: 5000,
				isClosable: true,
			})
		}
	}

	useEffect(() => {
		if (!sendBlastModal) {
			setStep("configure")
			setSubject("")
			setMessage("")
			setCustomEmails("")
			setError("")
			setTargetAudience("all")
			setEmailType("update")
			setStatus("all")
		}
	}, [sendBlastModal])

	const handlePreview = () => {
		if (!subject.trim() || !message.trim()) {
			setError("Subject and message are required")
			return
		}

		if (recipientCount === 0 || recipientCount === null) {
			setError("No recipients found for the selected audience")
			return
		}

		setError("")
		setStep("preview")
	}

	const handleBack = () => {
		setStep("configure")
		setError("")
	}

	// Get button config for preview
	const getButtonConfig = () => {
		const configs = {
			invitation: { text: "View Event & RSVP", color: "#8B5CF6", emoji: "🎉" },
			reminder: { text: "View Event Details", color: "#F59E0B", emoji: "⏰" },
			update: { text: "See What Changed", color: "#3B82F6", emoji: "📢" },
			announcement: { text: "Read More", color: "#10B981", emoji: "📣" },
			custom: { text: "View Event", color: "#8B5CF6", emoji: "✉️" },
		}
		return configs[emailType]
	}

	const buttonConfig = getButtonConfig()

	return (
		<Modal isOpen={sendBlastModal} onClose={() => setSendBlastModal(false)} isCentered size={step === "preview" ? "4xl" : "2xl"}>
			<ModalOverlay bg="blackAlpha.400" backdropFilter="blur(10px)" />
			<ModalContent
				bg="white"
				color="#1F2937"
				mx={{ base: 4, md: 0 }}
				maxH={{ base: "90vh", md: "90vh" }}
				overflowY="auto"
				borderRadius="2xl"
				border="1px solid #E5E7EB"
				boxShadow="xl"
			>
				<ModalHeader fontSize={{ base: "lg", md: "xl" }} borderBottom="1px solid #E5E7EB" pb={4}>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
								<FiSend className="text-white text-lg" />
							</div>
							<span>{step === "configure" ? "Configure Blast Email" : "Preview & Send"}</span>
						</div>
						{/* Step Indicator */}
						<div className="flex items-center gap-2 text-sm">
							<span className={`px-3 py-1 rounded-lg ${step === "configure" ? "bg-blue-100 text-blue-700 font-semibold" : "bg-gray-100 text-gray-600"}`}>
								1. Configure
							</span>
							<span className="text-gray-400">→</span>
							<span className={`px-3 py-1 rounded-lg ${step === "preview" ? "bg-blue-100 text-blue-700 font-semibold" : "bg-gray-100 text-gray-600"}`}>
								2. Preview
							</span>
						</div>
					</div>
				</ModalHeader>
				<ModalCloseButton color="#6B7280" _hover={{ bg: "#F3F4F6" }} />
				<ModalBody pb={6} pt={6}>
					{step === "configure" ? (
					<div className="flex flex-col gap-4">
						{/* Target Audience */}
						<div>
							<label className="block text-sm font-semibold text-gray-700 mb-2">Target Audience</label>
							<select
								value={targetAudience}
								onChange={(e) => setTargetAudience(e.target.value as any)}
								className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm md:text-base transition-all focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500"
							>
								<option value="all">All (Bookings + Invited + Waiting List)</option>
								<option value="bookings_only">Bookings Only (Confirmed Attendees)</option>
								<option value="invited_only">Invited Guests Only</option>
								<option value="waiting_list">Waiting List Only</option>
								<option value="custom">✏️ Custom (Enter specific emails)</option>
							</select>
							{recipientCount !== null && targetAudience !== "custom" && (
								<p className="text-sm text-gray-600 mt-2">
									📧 Will send to <strong>{recipientCount}</strong> recipient{recipientCount !== 1 ? 's' : ''}
								</p>
							)}
						</div>

						{/* Custom Emails Input */}
						{targetAudience === "custom" && (
							<div>
								<label className="block text-sm font-semibold text-gray-700 mb-2">
									Custom Email Addresses
								</label>
								<textarea
									rows={4}
									placeholder="Enter email addresses (comma or line-separated)&#10;Example:&#10;email1@example.com, email2@example.com&#10;email3@example.com"
									value={customEmails}
									onChange={(e) => setCustomEmails(e.target.value)}
									className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm md:text-base transition-all focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500 resize-none font-mono"
								/>
								{recipientCount !== null && recipientCount > 0 && (
									<p className="text-sm text-green-600 mt-2">
										✅ Found <strong>{recipientCount}</strong> valid email{recipientCount !== 1 ? 's' : ''}
									</p>
								)}
								{customEmails && recipientCount === 0 && (
									<p className="text-sm text-red-600 mt-2">
										⚠️ No valid email addresses found
									</p>
								)}
							</div>
						)}

						{/* Email Type */}
						<div>
							<label className="block text-sm font-semibold text-gray-700 mb-2">Email Type</label>
							<select
								value={emailType}
								onChange={(e) => setEmailType(e.target.value as any)}
								className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm md:text-base transition-all focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500"
							>
								<option value="invitation">🎉 Invitation (Join us for this event)</option>
								<option value="reminder">⏰ Reminder (Don't forget about this event)</option>
								<option value="update">📢 Update (Important event information)</option>
								<option value="announcement">📣 Announcement (General news)</option>
								<option value="custom">✏️ Custom (Write your own)</option>
							</select>
							<p className="text-xs text-gray-500 mt-1">
								{emailType === "invitation" && "Link: View Event & RSVP"}
								{emailType === "reminder" && "Link: View Event Details"}
								{emailType === "update" && "Link: See What Changed"}
								{emailType === "announcement" && "Link: Read More"}
								{emailType === "custom" && "Link: View Event"}
							</p>
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
									<option value="all">All Statuses</option>
									<option value="pending">Pending Only</option>
									<option value="accepted">Accepted Only</option>
									<option value="declined">Declined Only</option>
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

						{/* Preview Button */}
						<button
							onClick={handlePreview}
							disabled={!subject.trim() || !message.trim() || recipientCount === 0}
							className={`w-full py-3 rounded-xl font-semibold text-sm md:text-base transition-all flex items-center justify-center gap-2 ${
								!subject.trim() || !message.trim() || recipientCount === 0
									? "bg-gray-300 text-gray-500 cursor-not-allowed"
									: "bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 shadow-lg shadow-blue-500/30"
							}`}
						>
							<span>Preview Email</span>
							<span>→</span>
						</button>
					</div>
					) : (
					<div className="flex flex-col gap-4">
						{/* Preview Section */}
						<div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
							<h3 className="text-lg font-bold text-gray-800 mb-4">📧 Email Preview</h3>
							
							{/* Email Preview Container */}
							<div className="bg-white border border-gray-300 rounded-lg shadow-sm overflow-hidden">
								{/* Email Header */}
								<div className="bg-gray-100 px-4 py-3 border-b border-gray-300">
									<p className="text-xs text-gray-600 mb-1"><strong>To:</strong> {recipientCount} recipient{recipientCount !== 1 ? 's' : ''}</p>
									<p className="text-xs text-gray-600 mb-1"><strong>From:</strong> Jetzy Events</p>
									<p className="text-sm text-gray-800"><strong>Subject:</strong> {subject}</p>
								</div>
								
								{/* Email Body Preview */}
								<div className="p-6 max-h-96 overflow-y-auto" style={{ fontFamily: 'Arial, sans-serif', backgroundColor: '#f9fafb' }}>
									<div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
										<div style={{ background: `linear-gradient(135deg, ${buttonConfig.color} 0%, ${buttonConfig.color}dd 100%)`, padding: '40px 20px', borderRadius: '12px 12px 0 0', textAlign: 'center' }}>
											<h1 style={{ color: 'white', margin: 0, fontSize: '28px', fontWeight: 700 }}>{buttonConfig.emoji} {subject}</h1>
										</div>
										
										<div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '0 0 12px 12px', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)' }}>
											<div style={{ marginBottom: '25px' }}>
												<p style={{ color: '#6B7280', fontSize: '16px', margin: 0 }}>Message from Event Host:</p>
											</div>

											<div style={{ background: '#F9FAFB', padding: '20px', borderRadius: '8px', margin: '20px 0', borderLeft: `4px solid ${buttonConfig.color}` }}>
												<p style={{ color: '#1F2937', fontSize: '16px', margin: 0, whiteSpace: 'pre-wrap' }}>{message}</p>
											</div>

											<div style={{ background: 'linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%)', padding: '25px', borderRadius: '12px', margin: '25px 0' }}>
												<h2 style={{ color: '#1F2937', margin: '0 0 20px 0', fontSize: '24px', fontWeight: 700 }}>{event.name}</h2>
												
												<div style={{ marginBottom: '12px' }}>
													<span style={{ color: '#6B7280', fontSize: '14px', fontWeight: 600 }}>📅 Date & Time</span>
													<p style={{ color: '#1F2937', fontSize: '16px', margin: '5px 0 0 0' }}>Event Date</p>
												</div>
												
												<div>
													<span style={{ color: '#6B7280', fontSize: '14px', fontWeight: 600 }}>📍 Location</span>
													<p style={{ color: '#1F2937', fontSize: '16px', margin: '5px 0 0 0' }}>{event.location || 'Event Location'}</p>
												</div>
											</div>

											<div style={{ textAlign: 'center', margin: '35px 0 25px 0' }}>
												<a style={{ background: `linear-gradient(135deg, ${buttonConfig.color} 0%, ${buttonConfig.color}dd 100%)`, color: 'white', padding: '16px 40px', textDecoration: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '16px', display: 'inline-block' }}>
													{buttonConfig.text}
												</a>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>

						{/* Error Message */}
						{error && (
							<div className="bg-red-50 border border-red-200 rounded-xl p-3">
								<p className="text-red-600 text-sm">{error}</p>
							</div>
						)}

						{/* Action Buttons */}
						<div className="flex gap-3">
							<button
								onClick={handleBack}
								disabled={loading}
								className="flex-1 py-3 rounded-xl font-semibold text-sm md:text-base transition-all flex items-center justify-center gap-2 bg-gray-100 text-gray-700 hover:bg-gray-200"
							>
								← Back
							</button>
							<button
								onClick={onSendBlast}
								disabled={loading}
								className={`flex-1 py-3 rounded-xl font-semibold text-sm md:text-base transition-all flex items-center justify-center gap-2 ${
									loading
										? "bg-gray-300 text-gray-500 cursor-not-allowed"
										: "bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700 shadow-lg shadow-purple-500/30"
								}`}
							>
								<FiSend className="text-lg" />
								{loading ? "Sending..." : `Send to ${recipientCount} recipient${recipientCount !== 1 ? 's' : ''}`}
							</button>
						</div>
					</div>
					)}
				</ModalBody>
			</ModalContent>
		</Modal>
	)
}

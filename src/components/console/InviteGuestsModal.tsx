import { useState, useEffect } from "react"
import { Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, useToast } from "@chakra-ui/react"
import { FiUserPlus } from "react-icons/fi"
import axios from "axios"
import SafeHTML from "../misc/SafeHTML"

interface InviteGuestsModalProps {
	inviteGuestsModal: boolean
	setInviteGuestsModal: (inviteGuestsModal: boolean) => void
	event: any
}

export function InviteGuestsModal({ inviteGuestsModal, setInviteGuestsModal, event }: InviteGuestsModalProps) {
	const [emails, setEmails] = useState<string[]>([])
	const [step, setStep] = useState(1)
	const [loading, setLoading] = useState(false)
	const [message, setMessage] = useState("")
	const [emailInput, setEmailInput] = useState("")
	const [emailError, setEmailError] = useState("")
	const toast = useToast()

	const handleAddEmail = () => {
		const email = emailInput.trim()
		if (!email) {
			setEmailError("Please enter an email")
			return
		}
		// Simple email validation
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			setEmailError("Please enter a valid email")
			return
		}
		if (emails.includes(email)) {
			setEmailError("Email already added")
			return
		}
		setEmails([...emails, email])
		setEmailInput("")
		setEmailError("")
	}

	const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault()
			handleAddEmail()
		}
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
			toast({
				title: "Invitations sent!",
				status: "success",
				duration: 3000,
				isClosable: true,
			})
		} catch (error) {
			setLoading(false)
			toast({
				title: "Failed to send invitations.",
				status: "error",
				duration: 3000,
				isClosable: true,
			})
		}
	}

	useEffect(() => {
		if (!inviteGuestsModal) {
			setStep(1)
			setEmails([])
			setMessage("")
			setEmailInput("")
			setEmailError("")
		}
	}, [inviteGuestsModal])

	return (
		<Modal isOpen={inviteGuestsModal} onClose={() => setInviteGuestsModal(false)} isCentered size={step === 2 ? "4xl" : "2xl"}>
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
						<div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
							<FiUserPlus className="text-white text-lg" />
						</div>
						<span>{step === 1 ? "Invite Guests" : "Review Invited Emails"}</span>
					</div>
				</ModalHeader>
				<ModalCloseButton color="#6B7280" _hover={{ bg: "#F3F4F6" }} />
				<ModalBody pb={6} pt={6}>
					<div className="flex flex-col gap-4">
						{step === 1 && (
							<>
								<p className="font-semibold text-sm md:text-base text-gray-700">Invite your guests by email:</p>
								<div className="flex gap-2 flex-col sm:flex-row">
									<input
										type="email"
										placeholder="Enter your guest's email"
										value={emailInput}
										onChange={(e) => setEmailInput(e.target.value)}
										onKeyDown={handleInputKeyDown}
										className={`flex-1 px-4 py-2.5 bg-gray-50 border ${
											emailError ? "border-red-300 focus:border-red-500 focus:ring-red-500" : "border-gray-200 focus:border-purple-500 focus:ring-purple-500"
										} rounded-xl text-sm md:text-base transition-all focus:outline-none focus:ring-2`}
									/>
									<button
										onClick={handleAddEmail}
										className="bg-gradient-to-r from-purple-500 to-purple-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:from-purple-600 hover:to-purple-700 transition-all shadow-lg shadow-purple-500/30 text-sm md:text-base w-full sm:w-auto"
									>
										Add
									</button>
								</div>
								{emailError && <p className="text-red-500 text-sm">{emailError}</p>}
								{emails.length > 0 && (
									<div className="mt-2">
										<p className="font-semibold text-sm md:text-base text-gray-700 mb-2">
											Inviting {emails.length} Email{emails.length > 1 ? "s" : ""}:
										</p>
										<div className="space-y-2">
											{emails.map((email) => (
												<div key={email} className="bg-gradient-to-r from-purple-50 to-purple-100/50 p-3 rounded-xl border border-purple-200">
													<div className="flex items-center justify-between gap-2">
														<span className="break-words text-sm sm:text-base text-gray-700">{email}</span>
														<button
															onClick={() => setEmails(emails.filter((e) => e !== email))}
															className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg px-2 py-1 transition-all text-xs font-semibold"
														>
															Remove
														</button>
													</div>
												</div>
											))}
										</div>
									</div>
								)}
								<button
									disabled={emails.length === 0}
									onClick={handleNext}
									className={`mt-4 w-full py-3 rounded-xl font-semibold text-sm md:text-base transition-all ${
										emails.length === 0
											? "bg-gray-200 text-gray-400 cursor-not-allowed"
											: "bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700 shadow-lg shadow-purple-500/30"
									}`}
								>
									Next
								</button>
							</>
						)}
						{step === 2 && (
							<>
								<div className="flex flex-col lg:flex-row gap-6">
									<div className="flex-1 min-w-0">
										<p className="mb-2 text-sm md:text-base text-gray-700 font-medium">Here are the emails you have entered:</p>
										<ul className="pl-5 list-disc text-sm md:text-base space-y-1 text-gray-600">
											{emails.map((email) => (
												<li key={email} className="break-words">
													{email}
												</li>
											))}
										</ul>
									</div>
									<div className="flex-1 border border-gray-200 rounded-2xl p-5 bg-gradient-to-br from-purple-50 to-white">
										<p className="font-bold mb-3 text-sm md:text-base text-gray-800">
											Hi, Jetzy Events invites you to join <SafeHTML html={event.name} />.
										</p>
										<textarea
											rows={3}
											placeholder="Enter a custom message here..."
											value={message}
											onChange={(e) => setMessage(e.target.value)}
											className="w-full mb-3 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm md:text-base focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500 transition-all resize-none"
										/>
										<p className="font-semibold mb-2 text-xs md:text-sm text-purple-600 break-words">
											RSVP: {process.env.NEXT_PUBLIC_URL}/{event.slug}
										</p>
										<p className="text-xs md:text-sm text-gray-500">We will send guests an invitation link to register for the event.</p>
									</div>
								</div>
								<div className="flex flex-col sm:flex-row mt-4 gap-2 justify-between">
									<button
										onClick={handleBack}
										className="px-6 py-2.5 border border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-all text-sm md:text-base w-full sm:w-auto"
									>
										Back
									</button>
									<button
										onClick={onSendInvitation}
										disabled={loading}
										className={`px-6 py-2.5 rounded-xl font-semibold transition-all text-sm md:text-base w-full sm:w-auto ${
											loading
												? "bg-gray-300 text-gray-500 cursor-not-allowed"
												: "bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700 shadow-lg shadow-purple-500/30"
										}`}
									>
										{loading ? "Sending..." : "Send Invitations"}
									</button>
								</div>
							</>
						)}
					</div>
				</ModalBody>
			</ModalContent>
		</Modal>
	)
}

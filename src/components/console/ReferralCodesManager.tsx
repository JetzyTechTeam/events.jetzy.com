"use client"
import { Box, Text, Button, Input, Table, Thead, Tbody, Tr, Th, Td, Badge, IconButton, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, ModalFooter, useDisclosure, useToast, FormControl, FormLabel, NumberInput, NumberInputField, NumberInputStepper, NumberIncrementStepper, NumberDecrementStepper, Flex, Switch } from "@chakra-ui/react"
import { FiPlus, FiEdit2, FiTrash2, FiCopy, FiBarChart2, FiShare2 } from "react-icons/fi"
import { useState, useEffect } from "react"
import { premiumShareLink, shareableReason } from "@/lib/referral-share"
import axios from "axios"
import ReferralPerformance from "@/components/analytics/ReferralPerformance"

interface ReferralCode {
	_id: string
	code: string
	discountPercentage: number
	/** Free months of Jetzy Premium this code grants on a ticket that already sells it. */
	freeMembershipMonths?: number
	isActive: boolean
	usageCount: number
	maxUses?: number | null
	createdAt: string
}

interface ReferralCodesManagerProps {
	eventId: string
}

export function ReferralCodesManager({ eventId }: ReferralCodesManagerProps) {
	const [codes, setCodes] = useState<ReferralCode[]>([])
	const [loading, setLoading] = useState(true)
	const [creating, setCreating] = useState(false)
	const [updating, setUpdating] = useState<string | null>(null)
	const [deleting, setDeleting] = useState<string | null>(null)
	const { isOpen, onOpen, onClose } = useDisclosure()
	const [editingCode, setEditingCode] = useState<ReferralCode | null>(null)
	const toast = useToast()

	// Form state
	const [formData, setFormData] = useState({
		code: "",
		discountPercentage: 10,
		// One number, not a tickbox plus a count — two fields can disagree and then the code
		// no longer says what the buyer gets. 0 means the code grants no membership months.
		freeMembershipMonths: 0,
		maxUses: null as number | null,
		isActive: true,
	})

	// Stats Modal State
	const { isOpen: isStatsOpen, onOpen: onStatsOpen, onClose: onStatsClose } = useDisclosure()
	const [selectedStatsCode, setSelectedStatsCode] = useState<ReferralCode | null>(null)
	// Performance for ONE code — who came in on it, what they paid. Behind a button rather than
	// under the table: this tab's job is managing codes, and a permanent report below them
	// pushed that work off the screen.
	const [analyticsCode, setAnalyticsCode] = useState<ReferralCode | null>(null)
	// The code being shared as a standalone Jetzy Premium link — see `shareableReason` for when
	// that is allowed at all.
	const [sharingCode, setSharingCode] = useState<ReferralCode | null>(null)
	const [statsData, setStatsData] = useState<{ totalSales: number; verifiedUsageCount: number; code: string; commissionPercentage: number } | null>(null)
	const [statsLoading, setStatsLoading] = useState(false)
	const [commissionRate, setCommissionRate] = useState<string>("10")
	const [savingCommission, setSavingCommission] = useState(false)

	useEffect(() => {
		if (eventId) {
			fetchCodes()
		}
	}, [eventId])

	const fetchCodes = async () => {
		if (!eventId) {
			setLoading(false)
			return
		}
		try {
			setLoading(true)
			const response = await axios.get(`/api/events/${eventId}/referral-codes`)
			if (response.data && response.data.status) {
				setCodes(response.data.data || [])
			} else {
				setCodes([])
			}
		} catch (error: any) {
			console.error("Failed to fetch referral codes:", error)
			setCodes([])
			toast({
				title: "Error",
				description: error.response?.data?.message || "Failed to load referral codes",
				status: "error",
				duration: 3000,
			})
		} finally {
			setLoading(false)
		}
	}

	const handleCreate = async () => {
		try {
			setCreating(true)
			const response = await axios.post(`/api/events/${eventId}/referral-codes`, {
				code: formData.code,
				discountPercentage: formData.discountPercentage,
				freeMembershipMonths: formData.freeMembershipMonths || 0,
				maxUses: formData.maxUses || null,
			})

			if (response.data.status) {
				toast({
					title: "Success",
					description: "Referral code created successfully",
					status: "success",
					duration: 3000,
				})
				onClose()
				resetForm()
				fetchCodes()
			} else {
				throw new Error(response.data.message || "Failed to create referral code")
			}
		} catch (error: any) {
			console.error("Failed to create referral code:", error)
			toast({
				title: "Error",
				description: error.response?.data?.message || error.message || "Failed to create referral code",
				status: "error",
				duration: 3000,
			})
		} finally {
			setCreating(false)
		}
	}

	const handleUpdate = async (codeId: string, updates: { isActive?: boolean; discountPercentage?: number; freeMembershipMonths?: number; maxUses?: number | null }) => {
		try {
			setUpdating(codeId)
			const response = await axios.patch(`/api/events/${eventId}/referral-codes/${codeId}`, updates)

			if (response.data.status) {
				toast({
					title: "Success",
					description: "Referral code updated successfully",
					status: "success",
					duration: 3000,
				})
				fetchCodes()
			} else {
				throw new Error(response.data.message || "Failed to update referral code")
			}
		} catch (error: any) {
			console.error("Failed to update referral code:", error)
			toast({
				title: "Error",
				description: error.response?.data?.message || error.message || "Failed to update referral code",
				status: "error",
				duration: 3000,
			})
		} finally {
			setUpdating(null)
		}
	}

	const handleDelete = async (codeId: string) => {
		if (!confirm("Are you sure you want to delete this referral code?")) {
			return
		}

		try {
			setDeleting(codeId)
			const response = await axios.delete(`/api/events/${eventId}/referral-codes/${codeId}`)

			if (response.data.status) {
				toast({
					title: "Success",
					description: "Referral code deleted successfully",
					status: "success",
					duration: 3000,
				})
				fetchCodes()
			} else {
				throw new Error(response.data.message || "Failed to delete referral code")
			}
		} catch (error: any) {
			console.error("Failed to delete referral code:", error)
			toast({
				title: "Error",
				description: error.response?.data?.message || error.message || "Failed to delete referral code",
				status: "error",
				duration: 3000,
			})
		} finally {
			setDeleting(null)
		}
	}

	/**
	 * The shareable link. `window.location.origin` rather than an env var: whoever is looking at
	 * this page is already on the host we want the link to point at, staging or production.
	 */
	const premiumLinkFor = (code: ReferralCode) =>
		typeof window === "undefined"
			? ""
			: premiumShareLink(window.location.origin, code.code, eventId)

	const handleCopyLink = (code: ReferralCode) => {
		navigator.clipboard.writeText(premiumLinkFor(code))
		toast({
			title: "Link copied",
			description: "Anyone who opens it gets the free months applied at checkout.",
			status: "success",
			duration: 2500,
		})
	}

	const handleCopyCode = (code: string) => {
		navigator.clipboard.writeText(code)
		toast({
			title: "Copied!",
			description: "Referral code copied to clipboard",
			status: "success",
			duration: 2000,
		})
	}

	const resetForm = () => {
		setFormData({
			code: "",
			discountPercentage: 10,
			freeMembershipMonths: 0,
			maxUses: null,
			isActive: true,
		})
		setEditingCode(null)
	}

	// The CODE ITSELF is never editable — bookings store the string, not the id, so renaming one
	// would orphan every redemption already recorded against it. Everything else is fair game.
	const handleOpenEdit = (code: ReferralCode) => {
		setEditingCode(code)
		setFormData({
			code: code.code,
			discountPercentage: code.discountPercentage,
			freeMembershipMonths: code.freeMembershipMonths || 0,
			maxUses: code.maxUses ?? null,
			isActive: code.isActive,
		})
		onOpen()
	}

	const handleSaveEdit = async () => {
		if (!editingCode) return
		await handleUpdate(editingCode._id, {
			discountPercentage: formData.discountPercentage,
			freeMembershipMonths: formData.freeMembershipMonths || 0,
			maxUses: formData.maxUses || null,
		})
		onClose()
		resetForm()
	}

	const handleOpenStats = async (code: ReferralCode) => {
		setSelectedStatsCode(code)
		setStatsData(null)
		setCommissionRate("10")
		onStatsOpen()

		try {
			setStatsLoading(true)
			const response = await axios.get(`/api/events/${eventId}/referral-codes/${code._id}/stats`)
			if (response.data.status) {
				const data = response.data.data
				setStatsData(data)
				setCommissionRate(data.commissionPercentage?.toString() || "10")
				// Log to console for debugging
				console.log("Stats data:", data)
			}
		} catch (error: any) {
			console.error("Failed to fetch stats:", error)
			toast({
				title: "Error",
				description: "Failed to load usage statistics",
				status: "error",
				duration: 3000,
			})
		} finally {
			setStatsLoading(false)
		}
	}

	const handleUpdateCommission = async () => {
		if (!selectedStatsCode) return

		try {
			setSavingCommission(true)
			const percentage = parseFloat(commissionRate)

			if (isNaN(percentage) || percentage < 0 || percentage > 100) {
				toast({
					title: "Invalid Percentage",
					description: "Please enter a valid percentage between 0 and 100",
					status: "warning",
					duration: 3000,
				})
				return
			}

			const response = await axios.patch(`/api/events/${eventId}/referral-codes/${selectedStatsCode._id}`, {
				commissionPercentage: percentage
			})

			if (response.data.status) {
				toast({
					title: "Success",
					description: "Commission rate saved successfully",
					status: "success",
					duration: 3000,
				})
				// Update local stats data
				if (statsData) {
					setStatsData({
						...statsData,
						commissionPercentage: percentage
					})
				}
			} else {
				throw new Error(response.data.message || "Failed to update commission rate")
			}
		} catch (error: any) {
			console.error("Failed to update commission rate:", error)
			toast({
				title: "Error",
				description: error.response?.data?.message || "Failed to save commission rate",
				status: "error",
				duration: 3000,
			})
		} finally {
			setSavingCommission(false)
		}
	}

	const handleOpenCreate = () => {
		resetForm()
		onOpen()
	}

	return (
		<Box bg="#1E1E1E" borderRadius="2xl" border="1px solid #434343" p={0} mb={4} overflow="hidden">
			<Box p={4} borderBottom="1px solid #434343">
				<Flex justify="space-between" align="center">
					<Text fontSize="xl" fontWeight="bold" color="white">Referral Codes</Text>
					<Button
						leftIcon={<FiPlus />}
						bg="#F79432"
						color="black"
						_hover={{ bg: "#E68422" }}
						_active={{ bg: "#D57618" }}
						size="sm"
						onClick={handleOpenCreate}
					>
						Create Code
					</Button>
				</Flex>
			</Box>

			<Box p={4}>
				{loading ? (
					<Text>Loading...</Text>
				) : codes.length === 0 ? (
					<Box textAlign="center" py={8}>
						<Text color="#9C9C9C" mb={4}>No referral codes created yet</Text>
						<Button bg="#F79432" color="black" _hover={{ bg: "#E68422" }} onClick={handleOpenCreate}>Create Your First Code</Button>
					</Box>
				) : (
					<Table variant="simple">
						<Thead>
							<Tr>
								<Th>Code</Th>
								<Th>Discount</Th>
								<Th>Free Premium</Th>
								<Th>Status</Th>
								<Th>Usage</Th>
								<Th>Max Uses</Th>
								<Th>Actions</Th>
							</Tr>
						</Thead>
						<Tbody>
							{codes.map((code) => (
								<Tr key={code._id}>
									<Td>
										<Flex align="center" gap={2}>
											<Text fontFamily="mono" fontWeight="semibold">{code.code}</Text>
											<IconButton
												aria-label="Copy code"
												icon={<FiCopy />}
												size="xs"
												variant="ghost"
												onClick={() => handleCopyCode(code.code)}
											/>
										</Flex>
									</Td>
									<Td>{code.discountPercentage}%</Td>
									<Td>{code.freeMembershipMonths ? `${code.freeMembershipMonths} ${code.freeMembershipMonths === 1 ? "month" : "months"}` : "—"}</Td>
									<Td>
										<Switch
											isChecked={code.isActive}
											onChange={(e) => handleUpdate(code._id, { isActive: e.target.checked })}
											isDisabled={updating === code._id}
											colorScheme="green"
										/>
									</Td>
									<Td>{code.usageCount}</Td>
									<Td>{code.maxUses == null ? "Unlimited" : `${code.maxUses} (${code.maxUses - code.usageCount} remaining)`}</Td>
									<Td>
										<Flex gap={2}>
											{/* Sharing gives a membership away with no ticket behind it, so the
											    button is only live on a code that can actually carry that — free
											    months set, and a usage limit to cap what a forwarded link can
											    cost. The reason is on the button itself rather than hidden in a
											    tooltip nobody hovers. */}
											<Button
												size="sm"
												variant="ghost"
												color={shareableReason(code) ? "#6B6B6B" : "#F5C518"}
												_hover={{ bg: shareableReason(code) ? "transparent" : "rgba(245, 197, 24, 0.1)" }}
												leftIcon={<FiShare2 />}
												onClick={() => {
													const reason = shareableReason(code)
													if (reason) {
														toast({ title: "Can't share this code yet", description: reason, status: "info", duration: 6000 })
														return
													}
													setSharingCode(code)
												}}
											>
												Share
											</Button>
											<Button
												size="sm"
												variant="ghost"
												color="#F79432"
												_hover={{ bg: "rgba(247, 148, 50, 0.1)" }}
												leftIcon={<FiBarChart2 />}
												onClick={() => setAnalyticsCode(code)}
											>
												Analytics
											</Button>
											<Button
												size="sm"
												variant="ghost"
												color="#F79432"
												_hover={{ bg: "rgba(247, 148, 50, 0.1)" }}
												onClick={() => handleOpenStats(code)}
											>
												Stats
											</Button>
											<IconButton
												aria-label="Edit code"
												icon={<FiEdit2 />}
												size="sm"
												variant="ghost"
												color="#F79432"
												_hover={{ bg: "rgba(247, 148, 50, 0.1)" }}
												onClick={() => handleOpenEdit(code)}
												isDisabled={updating === code._id}
											/>
											<IconButton
												aria-label="Delete code"
												icon={<FiTrash2 />}
												size="sm"
												colorScheme="red"
												variant="ghost"
												onClick={() => handleDelete(code._id)}
												isLoading={deleting === code._id}
											/>
										</Flex>
									</Td>
								</Tr>
							))}
						</Tbody>
					</Table>
				)}
			</Box>

			{/* Create/Edit Modal */}
			<Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered>
				<ModalOverlay />
				<ModalContent bg="#1E1E1E" color="white" border="1px solid #434343">
					<ModalHeader>{editingCode ? "Edit Referral Code" : "Create Referral Code"}</ModalHeader>
					<ModalCloseButton />
					<ModalBody>
						<Box>
							<FormControl isRequired mb={4}>
								<FormLabel>Code</FormLabel>
								<Input
									value={formData.code}
									onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase().replace(/\s/g, "") })}
									placeholder="ABC-123"
									fontFamily="mono"
									textTransform="uppercase"
									maxLength={50}
									color="white"
									bg="#101010"
									border="1px solid #434343"
									_focus={{ borderColor: "#F79432" }}
									isReadOnly={!!editingCode}
									opacity={editingCode ? 0.6 : 1}
								/>
								<Text fontSize="xs" color="gray.400" mt={1}>
									{editingCode
										? "The code itself can't be changed — bookings are recorded against the text of it. Delete it and create a new one to rename."
										: "Letters, numbers, and special characters allowed (no spaces). Codes are matched case-insensitively."}
								</Text>
							</FormControl>

							<FormControl isRequired mb={4}>
								<FormLabel>Discount Percentage</FormLabel>
								<NumberInput
									value={formData.discountPercentage}
									onChange={(_, value) => setFormData({ ...formData, discountPercentage: isNaN(value) ? 0 : value })}
									min={0}
									max={100}
									bg="#101010"
									color="white"
									borderColor="#434343"
								>
									<NumberInputField border="1px solid #434343" _focus={{ borderColor: "#F79432" }} />
									<NumberInputStepper>
										<NumberIncrementStepper color="white" />
										<NumberDecrementStepper color="white" />
									</NumberInputStepper>
								</NumberInput>
								<Text fontSize="xs" color="gray.400" mt={1}>
									Discount percentage (0-100%)
								</Text>
							</FormControl>

							<FormControl mb={4}>
								<FormLabel>Free Months of Jetzy Premium</FormLabel>
								<NumberInput
									value={formData.freeMembershipMonths}
									onChange={(_, value) => setFormData({ ...formData, freeMembershipMonths: isNaN(value) ? 0 : value })}
									min={0}
									max={12}
									bg="#101010"
									color="white"
									borderColor="#434343"
								>
									<NumberInputField border="1px solid #434343" _focus={{ borderColor: "#F79432" }} />
									<NumberInputStepper>
										<NumberIncrementStepper color="white" />
										<NumberDecrementStepper color="white" />
									</NumberInputStepper>
								</NumberInput>
								<Text fontSize="xs" color="gray.400" mt={1}>
									0 for none. Only applies to tickets that already include Jetzy Premium — the buyer gets those months free, then the
									membership renews at the normal rate until they cancel. It never applies to Full Concierge.
								</Text>
							</FormControl>

							<FormControl mb={4}>
								<FormLabel>Maximum Uses (Optional)</FormLabel>
								<NumberInput
									value={formData.maxUses || ""}
									onChange={(_, value) => setFormData({ ...formData, maxUses: isNaN(value) ? null : value })}
									min={1}
									bg="#101010"
									color="white"
									borderColor="#434343"
								>
									<NumberInputField placeholder="Leave empty for unlimited" border="1px solid #434343" _focus={{ borderColor: "#F79432" }} />
									<NumberInputStepper>
										<NumberIncrementStepper color="white" />
										<NumberDecrementStepper color="white" />
									</NumberInputStepper>
								</NumberInput>
								<Text fontSize="xs" color="gray.400" mt={1}>
									Leave empty for unlimited uses
								</Text>
							</FormControl>
						</Box>
					</ModalBody>

					<ModalFooter>
						<Button
							variant="ghost"
							mr={3}
							onClick={() => {
								onClose()
								resetForm()
							}}
							color="white"
							_hover={{ bg: "#333" }}
						>
							Cancel
						</Button>
						<Button
							bg="#F79432"
							color="black"
							_hover={{ bg: "#E68422" }}
							onClick={editingCode ? handleSaveEdit : handleCreate}
							isLoading={editingCode ? updating === editingCode._id : creating}
							isDisabled={
								!formData.code ||
								formData.discountPercentage < 0 ||
								formData.discountPercentage > 100 ||
								formData.freeMembershipMonths < 0 ||
								formData.freeMembershipMonths > 12
							}
						>
							{editingCode ? "Save changes" : "Create"}
						</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>

			{/* The Premium link. Everything a host needs to decide whether to send it: what the
			    recipient gets, how many are left, and the fact that the same allowance is shared
			    with ticket redemptions. */}
			<Modal isOpen={!!sharingCode} onClose={() => setSharingCode(null)} size="xl" isCentered>
				<ModalOverlay />
				<ModalContent bg="#1E1E1E" color="white" border="1px solid #434343">
					<ModalHeader>Share Jetzy Premium</ModalHeader>
					<ModalCloseButton />
					<ModalBody pb={6}>
						{sharingCode && (
							<>
								<Text fontSize="sm" color="#D6D6D6">
									Anyone who opens this link gets{" "}
									<Text as="span" color="#F5C518" fontWeight={700}>
										{sharingCode.freeMembershipMonths} month{sharingCode.freeMembershipMonths === 1 ? "" : "s"} of Jetzy Premium free
									</Text>{" "}
									— no ticket needed. They pay nothing until the free months end, then the membership renews at the
									normal price unless they cancel.
								</Text>

								<Box bg="#101010" border="1px solid #2a2a2a" borderRadius="md" p={3} mt={4}>
									<Text fontSize="xs" fontFamily="mono" color="#9C9C9C" wordBreak="break-all">
										{premiumLinkFor(sharingCode)}
									</Text>
								</Box>

								<Flex gap={3} mt={4} align="center" wrap="wrap">
									<Button bg="#F79432" color="black" _hover={{ bg: "#E68422" }} leftIcon={<FiCopy />} onClick={() => handleCopyLink(sharingCode)}>
										Copy link
									</Button>
									<Text fontSize="xs" color="#9C9C9C">
										{Math.max(0, (sharingCode.maxUses || 0) - sharingCode.usageCount)} of {sharingCode.maxUses} uses left
									</Text>
								</Flex>

								{/* One code, two jobs, one counter — a host who doesn't know that will
								    wonder where their ticket discounts went. */}
								<Text fontSize="xs" color="#9C9C9C" mt={4}>
									This is the same allowance the code uses for ticket discounts on this event. Every membership claimed
									here leaves one fewer use for everything else, and the link stops working when the limit is reached or
									the code is switched off.
								</Text>
							</>
						)}
					</ModalBody>
				</ModalContent>
			</Modal>

			{/* Performance for one code — the buyers, the money, and the CSV to hand over. */}
			<Modal isOpen={!!analyticsCode} onClose={() => setAnalyticsCode(null)} size="5xl" isCentered scrollBehavior="inside">
				<ModalOverlay />
				<ModalContent bg="#1E1E1E" color="white" border="1px solid #434343">
					<ModalHeader>
						Performance: <span style={{ fontFamily: "monospace" }}>{analyticsCode?.code}</span>
					</ModalHeader>
					<ModalCloseButton />
					<ModalBody pb={6}>
						{analyticsCode && (
							<ReferralPerformance
								eventId={eventId}
								code={analyticsCode.code}
								showEventColumn={false}
								title="Bookings made with this code"
							/>
						)}
					</ModalBody>
				</ModalContent>
			</Modal>

			{/* Stats Modal */}
			<Modal isOpen={isStatsOpen} onClose={onStatsClose} size="lg" isCentered>
				<ModalOverlay />
				<ModalContent bg="#1E1E1E" color="white" border="1px solid #434343">
					<ModalHeader>Referral Stats: {selectedStatsCode?.code}</ModalHeader>
					<ModalCloseButton />
					<ModalBody pb={6}>
						{statsLoading ? (
							<Flex justify="center" py={8}>
								<Text>Loading statistics...</Text>
							</Flex>
						) : statsData ? (
							<Box>
								<Flex gap={4} mb={6}>
									<Box flex={1} bg="#101010" p={4} borderRadius="xl" border="1px solid #333">
										<Text fontSize="sm" color="gray.400" mb={1}>Total Bookings</Text>
										<Text fontSize="2xl" fontWeight="bold">{statsData!.verifiedUsageCount}</Text>
									</Box>
									<Box flex={1} bg="#101010" p={4} borderRadius="xl" border="1px solid #333">
										<Text fontSize="sm" color="gray.400" mb={1}>Total Sales Generated</Text>
										<Text fontSize="2xl" fontWeight="bold" color="#F79432">
											${statsData!.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
										</Text>
									</Box>
								</Flex>

								<Box bg="#252525" p={4} borderRadius="xl" border="1px solid #434343">
									<Text fontWeight="bold" mb={4} fontSize="lg">Commission Calculator</Text>
									<FormControl mb={4}>
										<FormLabel color="gray.400">Commission Percentage</FormLabel>
										<Flex gap={2} align="center">
											<NumberInput
												value={commissionRate}
												onChange={(value) => setCommissionRate(value)}
												min={0}
												max={100}
												bg="#101010"
												borderColor="#434343"
												color="white"
												flex={1}
											>
												<NumberInputField border="1px solid #434343" _focus={{ borderColor: "#F79432" }} />
											</NumberInput>
											<Text>%</Text>
											<Button
												size="sm"
												bg="#F79432"
												color="black"
												_hover={{ bg: "#E68422" }}
												onClick={handleUpdateCommission}
												isLoading={savingCommission}
											>
												Save
											</Button>
										</Flex>
									</FormControl>

									<Box pt={4} borderTop="1px solid #434343">
										<Flex justify="space-between" align="center">
											<Text color="gray.400">Total Owed</Text>
											<Text fontSize="2xl" fontWeight="bold" color="#F79432">
												${((statsData!.totalSales * (parseFloat(commissionRate) || 0)) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
											</Text>
										</Flex>
									</Box>
								</Box>
							</Box>
						) : (
							<Text textAlign="center" color="gray.400">No data available</Text>
						)}
					</ModalBody>
				</ModalContent>
			</Modal>
		</Box>
	)
}

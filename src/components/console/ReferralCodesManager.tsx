"use client"
import { Box, Text, Button, Input, Table, Thead, Tbody, Tr, Th, Td, Badge, IconButton, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, ModalFooter, useDisclosure, useToast, FormControl, FormLabel, NumberInput, NumberInputField, NumberInputStepper, NumberIncrementStepper, NumberDecrementStepper, Flex, Switch } from "@chakra-ui/react"
import { FiPlus, FiEdit2, FiTrash2, FiCopy } from "react-icons/fi"
import { useState, useEffect } from "react"
import axios from "axios"

interface ReferralCode {
	_id: string
	code: string
	discountPercentage: number
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
		maxUses: null as number | null,
		isActive: true,
	})

	// Stats Modal State
	const { isOpen: isStatsOpen, onOpen: onStatsOpen, onClose: onStatsClose } = useDisclosure()
	const [selectedStatsCode, setSelectedStatsCode] = useState<ReferralCode | null>(null)
	const [statsData, setStatsData] = useState<{ totalSales: number; verifiedUsageCount: number; code: string } | null>(null)
	const [statsLoading, setStatsLoading] = useState(false)
	const [commissionRate, setCommissionRate] = useState<string>("10")

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

	const handleUpdate = async (codeId: string, updates: { isActive?: boolean; discountPercentage?: number; maxUses?: number | null }) => {
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
			maxUses: null,
			isActive: true,
		})
		setEditingCode(null)
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
				setStatsData(response.data.data)
				// Log to console for debugging
				console.log("Stats data:", response.data.data)
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
					<ModalHeader>Create Referral Code</ModalHeader>
					<ModalCloseButton />
					<ModalBody>
						<Box>
							<FormControl isRequired mb={4}>
								<FormLabel>Code</FormLabel>
								<Input
									value={formData.code}
									onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
									placeholder="ABC123"
									fontFamily="mono"
									textTransform="uppercase"
									maxLength={50}
									color="white"
									bg="#101010"
									border="1px solid #434343"
									_focus={{ borderColor: "#F79432" }}
								/>
								<Text fontSize="xs" color="gray.400" mt={1}>
									Only uppercase letters and numbers allowed
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
						<Button variant="ghost" mr={3} onClick={onClose} color="white" _hover={{ bg: "#333" }}>
							Cancel
						</Button>
						<Button bg="#F79432" color="black" _hover={{ bg: "#E68422" }} onClick={handleCreate} isLoading={creating} isDisabled={!formData.code || formData.discountPercentage < 0 || formData.discountPercentage > 100}>
							Create
						</Button>
					</ModalFooter>
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

"use client"
import { Box, Text, Button, Input, Table, Thead, Tbody, Tr, Th, Td, Badge, IconButton, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, ModalFooter, useDisclosure, useToast, FormControl, FormLabel, NumberInput, NumberInputField, NumberInputStepper, NumberIncrementStepper, NumberDecrementStepper, Flex, Switch, Checkbox, Radio, RadioGroup, Stack, useBreakpointValue } from "@chakra-ui/react"
import { FiPlus, FiEdit2, FiTrash2, FiCopy, FiBarChart2, FiShare2, FiTrendingUp } from "react-icons/fi"
import { useState, useEffect } from "react"
import { premiumShareLink, shareableReason } from "@/lib/referral-share"
import { liveScopedTicketIds, referralAppliesToAllTickets } from "@/lib/referral-ticket-scope"
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
	/** Absent or empty = every ticket. See `src/lib/referral-ticket-scope.ts`. */
	ticketIds?: string[]
	createdAt: string
}

/** One labelled line inside a mobile card — the phone stand-in for a table cell. */
function CardRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<Flex justify="space-between" align="flex-start" gap={3}>
			<Text fontSize="xs" color="#9C9C9C" flexShrink={0}>
				{label}
			</Text>
			<Box fontSize="sm" textAlign="right" minW={0}>
				{children}
			</Box>
		</Flex>
	)
}

export interface ReferralTicketOption {
	_id: string
	name: string
	price: number
}

interface ReferralCodesManagerProps {
	eventId: string
	/** The event's tickets, so a code can be limited to some of them. */
	tickets?: ReferralTicketOption[]
}

export function ReferralCodesManager({ eventId, tickets = [] }: ReferralCodesManagerProps) {
	// `isCentered` takes no responsive value, and a full-screen dialog must not be centered.
	const isDesktopModal = useBreakpointValue({ base: false, md: true }) ?? true
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
		// "all" = works on every ticket (stored as no `ticketIds`); "specific" = only `ticketIds`.
		ticketScope: "all" as "all" | "specific",
		ticketIds: [] as string[],
	})

	// What the Tickets column says for a code. A scoped code whose tickets have all been deleted
	// works on NOTHING — it never falls back to every ticket — so it's called out in red.
	const ticketScopeLabel = (code: ReferralCode): { text: string; broken?: boolean } => {
		if (referralAppliesToAllTickets(code)) return { text: "All tickets" }
		const live = liveScopedTicketIds(code, tickets)
		if (live.length === 0) return { text: "No tickets (deleted)", broken: true }
		const names = live.map((id) => tickets.find((t) => t._id === id)?.name || "Ticket")
		return { text: names.join(", ") }
	}

	// The table (lg and up) and the cards (below it) render the SAME strings — a code reads
	// differently on a phone and a laptop the moment either side re-derives one of these.
	const freePremiumLabel = (code: ReferralCode) =>
		code.freeMembershipMonths ? `${code.freeMembershipMonths} ${code.freeMembershipMonths === 1 ? "month" : "months"}` : "—"

	const maxUsesLabel = (code: ReferralCode) =>
		code.maxUses == null ? "Unlimited" : `${code.maxUses} (${code.maxUses - code.usageCount} remaining)`

	const toggleTicket = (ticketId: string) =>
		setFormData((prev) => ({
			...prev,
			ticketIds: prev.ticketIds.includes(ticketId) ? prev.ticketIds.filter((id) => id !== ticketId) : [...prev.ticketIds, ticketId],
		}))

	/** `[]` = every ticket — sent explicitly so an edit can widen a scoped code back to all. */
	const submittedTicketIds = () => (formData.ticketScope === "specific" ? formData.ticketIds : [])

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
				ticketIds: submittedTicketIds(),
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

	const handleUpdate = async (codeId: string, updates: { isActive?: boolean; discountPercentage?: number; freeMembershipMonths?: number; maxUses?: number | null; ticketIds?: string[] }) => {
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
			ticketScope: "all",
			ticketIds: [],
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
			ticketScope: referralAppliesToAllTickets(code) ? "all" : "specific",
			// Only ids still on the event — a deleted ticket can't be re-ticked, so it isn't shown.
			ticketIds: liveScopedTicketIds(code, tickets),
		})
		onOpen()
	}

	const handleSaveEdit = async () => {
		if (!editingCode) return
		await handleUpdate(editingCode._id, {
			discountPercentage: formData.discountPercentage,
			freeMembershipMonths: formData.freeMembershipMonths || 0,
			maxUses: formData.maxUses || null,
			ticketIds: submittedTicketIds(),
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

	// The table's five controls in a single row. The cards lay the same five out as 3 + 2, so
	// the markup differs by surface — but every handler, and the share gate above, is shared.
	// Sharing gives a membership away with no ticket behind it, so it is only allowed on a code
	// that can actually carry that — free months set, and a usage limit to cap what a forwarded
	// link can cost. The gate lives here, once: the table and the cards lay the buttons out
	// differently, but neither gets its own copy of this, which is the thing that must not drift.
	const handleShareClick = (code: ReferralCode) => {
		const reason = shareableReason(code)
		if (reason) {
			// The reason goes on screen rather than into a tooltip nobody hovers.
			toast({ title: "Can't share this code yet", description: reason, status: "info", duration: 6000 })
			return
		}
		setSharingCode(code)
	}

	const codeActions = (code: ReferralCode) => (
		<>
			<Button
				size="sm"
				variant="ghost"
				color={shareableReason(code) ? "#6B6B6B" : "#F5C518"}
				_hover={{ bg: shareableReason(code) ? "transparent" : "rgba(245, 197, 24, 0.1)" }}
				leftIcon={<FiShare2 />}
				onClick={() => handleShareClick(code)}
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
				leftIcon={<FiTrendingUp />}
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
		</>
	)

	return (
		<Box bg="#1E1E1E" borderRadius="2xl" border="1px solid #434343" p={0} mb={4} overflow="hidden">
			<Box p={{ base: 3, md: 4 }} borderBottom="1px solid #434343">
				<Flex justify="space-between" align="center" gap={3} wrap="wrap">
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

			<Box p={{ base: 3, md: 4 }}>
				{loading ? (
					<Text>Loading...</Text>
				) : codes.length === 0 ? (
					<Box textAlign="center" py={8}>
						<Text color="#9C9C9C" mb={4}>No referral codes created yet</Text>
						<Button bg="#F79432" color="black" _hover={{ bg: "#E68422" }} onClick={handleOpenCreate}>Create Your First Code</Button>
					</Box>
				) : (
					<>
					{/* Below md the eight columns squash to a couple of characters each, so the
					    same rows are rendered as cards instead. The table is untouched from lg up. */}
					<Stack display={{ base: "flex", lg: "none" }} spacing={3}>
						{codes.map((code) => {
							const scope = ticketScopeLabel(code)
							return (
								<Box key={code._id} bg="#101010" border="1px solid #434343" borderRadius="xl" p={{ base: 2.5, md: 3 }}>
									<Flex align="center" justify="space-between" gap={2} mb={3}>
										<Flex align="center" gap={1} minW={0}>
											<Text fontFamily="mono" fontWeight="semibold" noOfLines={1}>{code.code}</Text>
											<IconButton
												aria-label="Copy code"
												icon={<FiCopy />}
												size="xs"
												variant="ghost"
												color="#9C9C9C"
												_hover={{ color: "white", bg: "#2a2a2a" }}
												onClick={() => handleCopyCode(code.code)}
											/>
										</Flex>
										<Switch
											isChecked={code.isActive}
											onChange={(e) => handleUpdate(code._id, { isActive: e.target.checked })}
											isDisabled={updating === code._id}
											colorScheme="green"
										/>
									</Flex>

									<Stack spacing={2} pb={3} borderBottom="1px solid #2a2a2a">
										<CardRow label="Discount">{code.discountPercentage}%</CardRow>
										<CardRow label="Free Premium">{freePremiumLabel(code)}</CardRow>
										<CardRow label="Tickets">
											<Text fontSize="sm" color={scope.broken ? "red.300" : undefined} title={scope.text}>
												{scope.text}
											</Text>
										</CardRow>
										<CardRow label="Usage">{code.usageCount}</CardRow>
										<CardRow label="Max uses">{maxUsesLabel(code)}</CardRow>
									</Stack>

									{/* Laid out as a deliberate 3 + 2 rather than left to wrap — wrapping
								    put Stats alone on a second line beside the icon buttons, which
								    reads as a mistake. Same five controls, same handlers. */}
									<Stack spacing={2} mt={3}>
										<Flex gap={2}>
											<Button
												size="sm"
												flex={1}
												px={2}
												fontSize="xs"
												variant="ghost"
												color={shareableReason(code) ? "#6B6B6B" : "#F5C518"}
												_hover={{ bg: shareableReason(code) ? "transparent" : "rgba(245, 197, 24, 0.1)" }}
												leftIcon={<FiShare2 />}
												onClick={() => handleShareClick(code)}
											>
												Share
											</Button>
											<Button
												size="sm"
												flex={1}
												px={2}
												fontSize="xs"
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
												flex={1}
												px={2}
												fontSize="xs"
												variant="ghost"
												color="#F79432"
												_hover={{ bg: "rgba(247, 148, 50, 0.1)" }}
												leftIcon={<FiTrendingUp />}
												onClick={() => handleOpenStats(code)}
											>
												Stats
											</Button>
										</Flex>
										<Flex gap={2}>
											<Button
												size="sm"
												flex={1}
												fontSize="xs"
												variant="ghost"
												color="#F79432"
												_hover={{ bg: "rgba(247, 148, 50, 0.1)" }}
												leftIcon={<FiEdit2 />}
												onClick={() => handleOpenEdit(code)}
												isDisabled={updating === code._id}
											>
												Edit
											</Button>
											<Button
												size="sm"
												flex={1}
												fontSize="xs"
												colorScheme="red"
												variant="ghost"
												leftIcon={<FiTrash2 />}
												onClick={() => handleDelete(code._id)}
												isLoading={deleting === code._id}
											>
												Delete
											</Button>
										</Flex>
									</Stack>
								</Box>
							)
						})}
					</Stack>

					<Box display={{ base: "none", lg: "block" }}>
					<Table variant="simple">
						<Thead>
							<Tr>
								<Th>Code</Th>
								<Th>Discount</Th>
								<Th>Free Premium</Th>
								<Th>Tickets</Th>
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
												color="#9C9C9C"
												_hover={{ color: "white", bg: "#2a2a2a" }}
												onClick={() => handleCopyCode(code.code)}
											/>
										</Flex>
									</Td>
									<Td>{code.discountPercentage}%</Td>
									<Td>{freePremiumLabel(code)}</Td>
									<Td maxW="220px">
										{(() => {
											const scope = ticketScopeLabel(code)
											return (
												<Text fontSize="sm" color={scope.broken ? "red.300" : undefined} noOfLines={2} title={scope.text}>
													{scope.text}
												</Text>
											)
										})()}
									</Td>
									<Td>
										<Switch
											isChecked={code.isActive}
											onChange={(e) => handleUpdate(code._id, { isActive: e.target.checked })}
											isDisabled={updating === code._id}
											colorScheme="green"
										/>
									</Td>
									<Td>{code.usageCount}</Td>
									<Td>{maxUsesLabel(code)}</Td>
									<Td>
										<Flex gap={2}>
											{codeActions(code)}
										</Flex>
									</Td>
								</Tr>
							))}
						</Tbody>
					</Table>
					</Box>
					</>
				)}
			</Box>

			{/* Create/Edit Modal. Full-screen on a phone: the form is five controls tall, so a
			    boxed dialog inside Chakra's margins leaves the footer buttons off-screen. */}
			<Modal isOpen={isOpen} onClose={onClose} size={{ base: "full", md: "lg" }} isCentered={isDesktopModal} scrollBehavior="inside">
				<ModalOverlay />
				<ModalContent bg="#1E1E1E" color="white" border="1px solid #434343" m={{ base: 0, md: 4 }} borderRadius={{ base: 0, md: "md" }}>
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
								<FormLabel>Applies To</FormLabel>
								<RadioGroup
									value={formData.ticketScope}
									onChange={(value) => setFormData({ ...formData, ticketScope: value as "all" | "specific" })}
								>
									<Stack direction={{ base: "column", md: "row" }} spacing={{ base: 2, md: 6 }}>
										<Radio value="all" colorScheme="orange">All tickets</Radio>
										<Radio value="specific" colorScheme="orange" isDisabled={tickets.length === 0}>Specific tickets</Radio>
									</Stack>
								</RadioGroup>
								{formData.ticketScope === "specific" && (
									<Stack mt={3} spacing={2} bg="#101010" border="1px solid #434343" borderRadius="md" p={3} maxH={{ base: "40vh", md: "200px" }} overflowY="auto">
										{tickets.map((ticket) => (
											<Checkbox
												key={ticket._id}
												colorScheme="orange"
												isChecked={formData.ticketIds.includes(ticket._id)}
												onChange={() => toggleTicket(ticket._id)}
											>
												{ticket.name}{" "}
												<Text as="span" color="gray.400" fontSize="sm">
													{ticket.price > 0 ? `$${ticket.price.toFixed(2)}` : "Free"}
												</Text>
											</Checkbox>
										))}
									</Stack>
								)}
								<Text fontSize="xs" color="gray.400" mt={1}>
									{formData.ticketScope === "specific"
										? "The discount and free months only apply to the tickets ticked here. Other tickets in the same order pay full price, and the code is refused if none of these are in the order."
										: "The code works on every ticket of this event, including ones you add later."}
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

					<ModalFooter flexDirection={{ base: "column-reverse", md: "row" }} gap={{ base: 2, md: 0 }}>
						<Button
							variant="ghost"
							mr={{ base: 0, md: 3 }}
							width={{ base: "100%", md: "auto" }}
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
							width={{ base: "100%", md: "auto" }}
							_hover={{ bg: "#E68422" }}
							onClick={editingCode ? handleSaveEdit : handleCreate}
							isLoading={editingCode ? updating === editingCode._id : creating}
							isDisabled={
								!formData.code ||
								formData.discountPercentage < 0 ||
								formData.discountPercentage > 100 ||
								formData.freeMembershipMonths < 0 ||
								formData.freeMembershipMonths > 12 ||
								(formData.ticketScope === "specific" && formData.ticketIds.length === 0)
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
			<Modal isOpen={!!sharingCode} onClose={() => setSharingCode(null)} size={{ base: "full", md: "xl" }} isCentered={isDesktopModal} scrollBehavior="inside">
				<ModalOverlay />
				<ModalContent bg="#1E1E1E" color="white" border="1px solid #434343" m={{ base: 0, md: 4 }} borderRadius={{ base: 0, md: "md" }}>
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
			<Modal isOpen={!!analyticsCode} onClose={() => setAnalyticsCode(null)} size={{ base: "full", md: "5xl" }} isCentered={isDesktopModal} scrollBehavior="inside">
				<ModalOverlay />
				<ModalContent bg="#1E1E1E" color="white" border="1px solid #434343" m={{ base: 0, md: 4 }} borderRadius={{ base: 0, md: "md" }}>
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
			<Modal isOpen={isStatsOpen} onClose={onStatsClose} size={{ base: "full", md: "lg" }} isCentered={isDesktopModal} scrollBehavior="inside">
				<ModalOverlay />
				<ModalContent bg="#1E1E1E" color="white" border="1px solid #434343" m={{ base: 0, md: 4 }} borderRadius={{ base: 0, md: "md" }}>
					<ModalHeader>Referral Stats: {selectedStatsCode?.code}</ModalHeader>
					<ModalCloseButton />
					<ModalBody pb={6}>
						{statsLoading ? (
							<Flex justify="center" py={8}>
								<Text>Loading statistics...</Text>
							</Flex>
						) : statsData ? (
							<Box>
								<Flex gap={4} mb={6} direction={{ base: "column", md: "row" }}>
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
										<Flex gap={2} align="center" wrap="wrap">
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

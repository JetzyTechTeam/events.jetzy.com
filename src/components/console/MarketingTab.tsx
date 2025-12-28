import React, { useState, useEffect } from "react"
import { Box, Flex, Text, Button, Input, Table, Thead, Tbody, Tr, Th, Td, Badge, useToast, Spinner, Card, CardBody, Stat, StatLabel, StatNumber, StatHelpText, Avatar, VStack, HStack, Tooltip, Collapse, IconButton, Select } from "@chakra-ui/react"
import { FiCopy, FiTrendingUp, FiUsers, FiDollarSign, FiLink, FiChevronDown, FiChevronUp, FiUser, FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { http_client as api } from "@/configs/api"
import { DateTime } from "luxon"

interface MarketingTabProps {
	eventId: string
	eventSlug: string
}

export default function MarketingTab({ eventId, eventSlug }: MarketingTabProps) {
	const [stats, setStats] = useState<any>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [campaignName, setCampaignName] = useState("")
	const [generatedLink, setGeneratedLink] = useState("")
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(10)
	const toast = useToast()

	const fetchStats = React.useCallback(async (page: number, limit: number) => {
		setIsLoading(true)
		try {
			console.log('[MarketingTab] Fetching stats for eventId:', eventId, 'page:', page, 'limit:', limit)
			const statsRes = await fetch(`/api/console/seller/stats?eventId=${eventId}&page=${page}&limit=${limit}`, {
				method: 'GET',
				credentials: 'include',
				headers: {
					'Content-Type': 'application/json',
				}
			})
			
			if (!statsRes.ok) {
				const errorText = await statsRes.text()
				console.error('[MarketingTab] Stats API failed:', statsRes.status, errorText)
				setStats({
					totalViews: 0,
					totalSales: 0,
					totalRevenue: 0,
					breakdown: [],
					pagination: {
						currentPage: 1,
						itemsPerPage: limit,
						totalItems: 0,
						totalPages: 0,
						hasNextPage: false,
						hasPreviousPage: false
					}
				})
				return
			}
			
			const res = await statsRes.json()
			console.log('[MarketingTab] Stats API response:', res)
			
			if (res?.status && res?.data) {
				// Set stats with defaults if data is missing
				setStats(res.data || {
					totalViews: 0,
					totalSales: 0,
					totalRevenue: 0,
					breakdown: [],
					pagination: {
						currentPage: 1,
						itemsPerPage: limit,
						totalItems: 0,
						totalPages: 0,
						hasNextPage: false,
						hasPreviousPage: false
					}
				})
			} else {
				// API returned unsuccessful response - set defaults
				setStats({
					totalViews: 0,
					totalSales: 0,
					totalRevenue: 0,
					breakdown: [],
					pagination: {
						currentPage: 1,
						itemsPerPage: limit,
						totalItems: 0,
						totalPages: 0,
						hasNextPage: false,
						hasPreviousPage: false
					}
				})
			}
		} catch (error: any) {
			console.error("[MarketingTab] Failed to fetch marketing stats:", error)
			// Set defaults on error - no toast needed as empty data is valid
			setStats({
				totalViews: 0,
				totalSales: 0,
				totalRevenue: 0,
				breakdown: [],
				pagination: {
					currentPage: 1,
					itemsPerPage: itemsPerPage,
					totalItems: 0,
					totalPages: 0,
					hasNextPage: false,
					hasPreviousPage: false
				}
			})
		} finally {
			setIsLoading(false)
		}
	}, [eventId])

	useEffect(() => {
		if (eventId) {
			fetchStats(currentPage, itemsPerPage)
		}
	}, [eventId, currentPage, itemsPerPage, fetchStats])

	const generateLink = () => {
		if (!campaignName.trim()) {
			toast({ title: "Please enter a campaign name", status: "warning" })
			return
		}
		
		// Use NEXT_PUBLIC_URL from environment, fallback to window.location.origin for client-side
		const baseUrl = process.env.NEXT_PUBLIC_URL || (typeof window !== 'undefined' ? window.location.origin : '')
		if (!baseUrl) {
			toast({ title: "Unable to generate link", description: "Base URL not configured", status: "error" })
			return
		}
		
		const code = campaignName.trim().replace(/\s+/g, "-").toLowerCase()
		// Route is /[slug], not /events/[slug]
		const cleanBaseUrl = baseUrl.replace(/\/$/, '') // Remove trailing slash
		const link = `${cleanBaseUrl}/${eventSlug}?ref=${code}`
		setGeneratedLink(link)
	}

	const copyToClipboard = () => {
		navigator.clipboard.writeText(generatedLink)
		toast({ title: "Link copied!", status: "success" })
	}

	// Get pagination info from API response
	const breakdown = stats?.breakdown || []
	const pagination = stats?.pagination || {
		currentPage: 1,
		itemsPerPage: itemsPerPage,
		totalItems: 0,
		totalPages: 0,
		hasNextPage: false,
		hasPreviousPage: false
	}
	const totalPages = pagination.totalPages || 0
	const startIndex = pagination.currentPage ? ((pagination.currentPage - 1) * pagination.itemsPerPage) : 0

	// Reset to page 1 when items per page changes
	useEffect(() => {
		setCurrentPage(1)
	}, [itemsPerPage])

	if (isLoading && !stats) {
		return <Flex justify="center" py={10}><Spinner /></Flex>
	}

	return (
		<Box>
			<Text fontSize="xl" fontWeight="bold" mb={6}>Marketing & Tracking</Text>

			{/* Link Generator */}
			<Box bg="white" p={6} borderRadius="lg" border="1px solid" borderColor="gray.200" mb={8}>
				<Text fontSize="lg" fontWeight="bold" mb={4}>Create Tracking Link</Text>
				<Flex gap={4} direction={{ base: "column", md: "row" }} align="flex-end">
					<Box flex="1">
						<Text fontSize="sm" mb={2} fontWeight="500">Campaign Name</Text>
						<Text fontSize="xs" mb={2} color="gray.500">Create a unique identifier for your marketing campaign (e.g., social-media-promo, email-newsletter, partner-outreach)</Text>
						<Input 
							placeholder="Enter campaign identifier..." 
							value={campaignName}
							onChange={(e) => setCampaignName(e.target.value)}
						/>
					</Box>
					<Button colorScheme="blue" onClick={generateLink} leftIcon={<FiLink />}>
						Generate Link
					</Button>
				</Flex>

				{generatedLink && (
					<Box mt={4} p={4} bg="gray.50" borderRadius="md" border="1px dashed" borderColor="gray.300">
						<Flex justify="space-between" align="center">
							<Text fontFamily="monospace" color="blue.600" fontWeight="bold">{generatedLink}</Text>
							<Button size="sm" onClick={copyToClipboard} leftIcon={<FiCopy />}>Copy</Button>
						</Flex>
					</Box>
				)}
			</Box>

			{/* Stats Overview */}
			<Flex gap={4} mb={8} direction={{ base: "column", md: "row" }}>
				<Card flex="1">
					<CardBody>
						<Stat>
							<StatLabel display="flex" alignItems="center" gap={2}><FiUsers /> Total Views</StatLabel>
							<StatNumber>{stats?.totalViews || 0}</StatNumber>
							<StatHelpText>Unique Visitors</StatHelpText>
						</Stat>
					</CardBody>
				</Card>
				<Card flex="1">
					<CardBody>
						<Stat>
							<StatLabel display="flex" alignItems="center" gap={2}><FiTrendingUp /> Total Sales</StatLabel>
							<StatNumber>{stats?.totalSales || 0}</StatNumber>
							<StatHelpText>Tickets Sold</StatHelpText>
						</Stat>
					</CardBody>
				</Card>
				<Card flex="1">
					<CardBody>
						<Stat>
							<StatLabel display="flex" alignItems="center" gap={2}><FiDollarSign /> Total Revenue</StatLabel>
							<StatNumber>${stats?.totalRevenue?.toFixed(2) || "0.00"}</StatNumber>
							<StatHelpText>Gross Revenue</StatHelpText>
						</Stat>
					</CardBody>
				</Card>
			</Flex>

			{/* Detailed Breakdown */}
			<Box bg="white" borderRadius="lg" border="1px solid" borderColor="gray.200" overflow="hidden">
				<Box p={4} borderBottom="1px solid" borderColor="gray.200">
					<Flex justify="space-between" align="center">
						<Text fontWeight="bold">Performance by Source</Text>
						{(stats?.pagination?.totalItems > 0 || breakdown.length > 0) && (
							<Flex align="center" gap={2}>
								<Text fontSize="sm" color="gray.600">Items per page:</Text>
								<Select
									size="sm"
									value={itemsPerPage}
									onChange={(e) => setItemsPerPage(Number(e.target.value))}
									width="80px"
								>
									<option value={5}>5</option>
									<option value={10}>10</option>
									<option value={20}>20</option>
									<option value={50}>50</option>
								</Select>
							</Flex>
						)}
					</Flex>
				</Box>
				<Box overflowX="auto">
					<Table variant="simple">
						<Thead bg="gray.50">
							<Tr>
								<Th>Source (Ref Code)</Th>
								<Th isNumeric>Views</Th>
								<Th isNumeric>Unique Visitors</Th>
								<Th>Logged-in Users</Th>
								<Th isNumeric>Sales</Th>
								<Th isNumeric>Tickets Sold</Th>
								<Th isNumeric>Revenue</Th>
							</Tr>
						</Thead>
						<Tbody>
							{breakdown.length > 0 ? (
								breakdown.map((row: any, i: number) => (
									<Tr key={i}>
										<Td fontWeight="bold" color="blue.600">{row.referralCode}</Td>
										<Td isNumeric>{row.views}</Td>
										<Td isNumeric>{row.uniqueVisitors}</Td>
										<LoggedInUsersCell row={row} />
										<Td isNumeric>{row.sales}</Td>
										<Td isNumeric>{row.ticketsSold || 0}</Td>
										<Td isNumeric>${row.revenue.toFixed(2)}</Td>
									</Tr>
								))
							) : (
								<Tr>
									<Td colSpan={7} textAlign="center" py={8} color="gray.500">
										No tracking data available yet.
									</Td>
								</Tr>
							)}
						</Tbody>
					</Table>
				</Box>
				
				{/* Pagination Controls */}
				{pagination.totalItems > 0 && totalPages > 1 && (
					<Box p={4} borderTop="1px solid" borderColor="gray.200">
						<Flex justify="space-between" align="center" flexWrap="wrap" gap={4}>
							<Text fontSize="sm" color="gray.600">
								Showing {startIndex + 1} to {Math.min(startIndex + pagination.itemsPerPage, pagination.totalItems)} of {pagination.totalItems} sources
							</Text>
							<Flex gap={2} align="center">
								<Button
									size="sm"
									onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
									disabled={!pagination.hasPreviousPage}
									leftIcon={<FiChevronLeft />}
									variant="outline"
								>
									Previous
								</Button>
								<Flex gap={1}>
									{Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
										// Show first page, last page, current page, and pages around current
										if (
											page === 1 ||
											page === totalPages ||
											(page >= pagination.currentPage - 1 && page <= pagination.currentPage + 1)
										) {
											return (
												<Button
													key={page}
													size="sm"
													onClick={() => setCurrentPage(page)}
													colorScheme={pagination.currentPage === page ? "blue" : "gray"}
													variant={pagination.currentPage === page ? "solid" : "outline"}
													minW="40px"
												>
													{page}
												</Button>
											)
										} else if (
											page === pagination.currentPage - 2 ||
											page === pagination.currentPage + 2
										) {
											return (
												<Text key={page} px={2} color="gray.500">
													...
												</Text>
											)
										}
										return null
									})}
								</Flex>
								<Button
									size="sm"
									onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
									disabled={!pagination.hasNextPage}
									rightIcon={<FiChevronRight />}
									variant="outline"
								>
									Next
								</Button>
							</Flex>
						</Flex>
					</Box>
				)}
			</Box>
		</Box>
	)
}

// Professional component for displaying logged-in users
const LoggedInUsersCell = ({ row }: { row: any }) => {
	const [isExpanded, setIsExpanded] = useState(false)
	
	if (!row.loggedInUserDetails || row.loggedInUserDetails.length === 0) {
		return (
			<Td>
				<Text fontSize="sm" color="gray.400" fontStyle="italic">No logged-in users</Text>
			</Td>
		)
	}

	const userCount = row.identifiedUsers || row.loggedInUserDetails.length
	const hasMultipleUsers = userCount > 1

	return (
		<Td>
			<VStack align="flex-start" spacing={2}>
				<HStack spacing={2}>
					<Badge 
						colorScheme="purple" 
						fontSize="sm" 
						px={2} 
						py={1}
						borderRadius="md"
						fontWeight="semibold"
					>
						{userCount} {userCount === 1 ? 'User' : 'Users'}
					</Badge>
					{hasMultipleUsers && (
						<IconButton
							aria-label={isExpanded ? "Collapse users" : "Expand users"}
							icon={isExpanded ? <FiChevronUp /> : <FiChevronDown />}
							size="xs"
							variant="ghost"
							onClick={() => setIsExpanded(!isExpanded)}
						/>
					)}
				</HStack>
				
				{hasMultipleUsers ? (
					<Collapse in={isExpanded} animateOpacity>
						<VStack align="flex-start" spacing={2} mt={2} pl={2} borderLeft="2px solid" borderColor="purple.200">
							{row.loggedInUserDetails.map((user: any, idx: number) => (
								<UserBadge key={idx} user={user} />
							))}
						</VStack>
					</Collapse>
				) : (
					<UserBadge user={row.loggedInUserDetails[0]} />
				)}
			</VStack>
		</Td>
	)
}

// Professional user badge component
const UserBadge = ({ user }: { user: { name: string; email: string } }) => {
	return (
		<Tooltip label={user.email} placement="top" hasArrow>
			<HStack
				spacing={2}
				p={2}
				bg="purple.50"
				borderRadius="md"
				border="1px solid"
				borderColor="purple.100"
				_hover={{ bg: "purple.100", borderColor: "purple.200" }}
				transition="all 0.2s"
				cursor="pointer"
				maxW="250px"
			>
				<Avatar size="xs" name={user.name} bg="purple.500" color="white" />
				<VStack align="flex-start" spacing={0} flex="1" minW={0}>
					<Text fontSize="sm" fontWeight="medium" color="gray.700" noOfLines={1}>
						{user.name}
					</Text>
					<Text fontSize="xs" color="gray.500" noOfLines={1}>
						{user.email}
					</Text>
				</VStack>
			</HStack>
		</Tooltip>
	)
}


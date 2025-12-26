import React, { useState, useEffect } from "react"
import { Box, Flex, Text, Button, Input, Table, Thead, Tbody, Tr, Th, Td, Badge, useToast, Spinner, Card, CardBody, Stat, StatLabel, StatNumber, StatHelpText, Avatar, VStack, HStack, Tooltip, Collapse, IconButton } from "@chakra-ui/react"
import { FiCopy, FiTrendingUp, FiUsers, FiDollarSign, FiLink, FiChevronDown, FiChevronUp, FiUser } from "react-icons/fi"
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
	const toast = useToast()

	const fetchStats = async () => {
		setIsLoading(true)
		try {
			console.log('[MarketingTab] Fetching stats for eventId:', eventId)
			const statsRes = await fetch(`/api/console/seller/stats?eventId=${eventId}`, {
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
					breakdown: []
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
					breakdown: []
				})
			} else {
				// API returned unsuccessful response - set defaults
				setStats({
					totalViews: 0,
					totalSales: 0,
					totalRevenue: 0,
					breakdown: []
				})
			}
		} catch (error: any) {
			console.error("[MarketingTab] Failed to fetch marketing stats:", error)
			// Set defaults on error - no toast needed as empty data is valid
			setStats({
				totalViews: 0,
				totalSales: 0,
				totalRevenue: 0,
				breakdown: []
			})
		} finally {
			setIsLoading(false)
		}
	}

	useEffect(() => {
		if (eventId) {
			fetchStats()
		}
	}, [eventId])

	const generateLink = () => {
		if (!campaignName.trim()) {
			toast({ title: "Please enter a campaign name", status: "warning" })
			return
		}
		
		const baseUrl = window.location.origin
		const code = campaignName.trim().replace(/\s+/g, "-").toLowerCase()
		// Route is /[slug], not /events/[slug]
		const link = `${baseUrl}/${eventSlug}?ref=${code}`
		setGeneratedLink(link)
	}

	const copyToClipboard = () => {
		navigator.clipboard.writeText(generatedLink)
		toast({ title: "Link copied!", status: "success" })
	}

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
						<Text fontSize="sm" mb={2} fontWeight="500">Campaign Name (e.g. twitter-promo, newsletter)</Text>
						<Input 
							placeholder="Enter campaign name..." 
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
					<Text fontWeight="bold">Performance by Source</Text>
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
								<Th isNumeric>Revenue</Th>
								<Th isNumeric>Conversion</Th>
							</Tr>
						</Thead>
						<Tbody>
							{stats?.breakdown?.length > 0 ? (
								stats.breakdown.map((row: any, i: number) => (
									<Tr key={i}>
										<Td fontWeight="bold" color="blue.600">{row.referralCode}</Td>
										<Td isNumeric>{row.views}</Td>
										<Td isNumeric>{row.uniqueVisitors}</Td>
										<LoggedInUsersCell row={row} />
										<Td isNumeric>{row.sales}</Td>
										<Td isNumeric>${row.revenue.toFixed(2)}</Td>
										<Td isNumeric>
											{row.views > 0 
												? ((row.sales / row.views) * 100).toFixed(1) + "%" 
												: "0%"}
										</Td>
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


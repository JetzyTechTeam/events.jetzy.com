import React, { useState } from "react"
import { GetServerSideProps } from "next"
import Head from "next/head"
import { Box, Flex, Text, Table, Thead, Tbody, Tr, Th, Td, TableContainer, Badge, Spinner, Center, Input } from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import Pagination from "@/components/misc/Pagination"
import { adminOnly } from "@/lib/authSession"
import { SUPPORT_CATEGORIES, SupportCategoryKey } from "@/lib/support"
import { Pages } from "@/types"

/**
 * ADMIN ONLY. Everyone who has emailed us through /support — the email already went to
 * ADMIN_SUPPORT_EMAIL, this is the searchable record of it.
 */

type SupportRow = {
	_id: string
	name: string
	email: string
	category: SupportCategoryKey
	eventName?: string
	message: string
	createdAt: string
}

const CATEGORY_COLORS: Record<string, string> = {
	event: "blue",
	premium: "purple",
	general: "gray",
}

const PER_PAGE = 20

export default function SupportRequestsPage() {
	const [page, setPage] = useState(1)
	const [category, setCategory] = useState<"" | SupportCategoryKey>("")
	const [search, setSearch] = useState("")

	const { data, isLoading, isError } = useQuery({
		queryKey: ["supportRequests", page, category, search],
		queryFn: async () => {
			const res = await axios.get("/api/support/list", {
				params: { page, limit: PER_PAGE, category: category || undefined, search: search || undefined },
			})
			return res.data?.data
		},
	})

	const items: SupportRow[] = data?.items || []
	const pagination = data?.pagination || { total: 0, page: 1, limit: PER_PAGE, totalPages: 0 }

	return (
		<>
			<Head><title>Support Requests | Jetzy Events</title></Head>
			<ConsoleLayout page={Pages.SupportRequests}>
				<Flex gap={2} mb={4} wrap="wrap" align="center">
					<button
						onClick={() => {
							setCategory("")
							setPage(1)
						}}
						className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${category === ""
							? "bg-white text-black"
							: "bg-[#1E1E1E] text-[#A7A7A7] border border-[#444444] hover:bg-[#2A2A2A]"
							}`}
					>
						All
					</button>
					{SUPPORT_CATEGORIES.map(({ key, label }) => (
						<button
							key={key}
							onClick={() => {
								setCategory(key)
								setPage(1)
							}}
							className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${category === key
								? "bg-white text-black"
								: "bg-[#1E1E1E] text-[#A7A7A7] border border-[#444444] hover:bg-[#2A2A2A]"
								}`}
						>
							{label}
						</button>
					))}
					<Input
						value={search}
						onChange={(e) => {
							setSearch(e.target.value)
							setPage(1)
						}}
						placeholder="Search name, email, event, message"
						maxW="320px"
						ml={{ base: 0, md: "auto" }}
						bg="#1E1E1E"
						borderColor="#444"
					/>
				</Flex>

				{isLoading ? (
					<Center py={20}><Spinner color="#F79432" size="lg" /></Center>
				) : isError ? (
					<Box bg="#1E1E1E" border="1px solid #444" rounded="lg" p={8} textAlign="center">
						<Text color="#FCA5A5">Couldn&apos;t load support requests. Please refresh and try again.</Text>
					</Box>
				) : items.length === 0 ? (
					<Box bg="#1E1E1E" border="1px solid #444" rounded="lg" p={10} textAlign="center">
						<Text color="#9C9C9C">No support requests yet.</Text>
					</Box>
				) : (
					<>
						<TableContainer bg="#1E1E1E" border="1px solid #444" rounded="lg">
							<Table size="sm" variant="simple">
								<Thead>
									<Tr>
										<Th color="#9C9C9C">Date</Th>
										<Th color="#9C9C9C">From</Th>
										<Th color="#9C9C9C">Category</Th>
										<Th color="#9C9C9C">Event</Th>
										<Th color="#9C9C9C">Message</Th>
									</Tr>
								</Thead>
								<Tbody>
									{items.map((row) => (
										<Tr key={row._id}>
											<Td whiteSpace="nowrap" color="#9C9C9C" fontSize="xs">
												{new Date(row.createdAt).toLocaleString()}
											</Td>
											<Td>
												<Text fontWeight="semibold">{row.name}</Text>
												<Text fontSize="xs" color="#9C9C9C">{row.email}</Text>
											</Td>
											<Td>
												<Badge colorScheme={CATEGORY_COLORS[row.category] || "gray"}>
													{SUPPORT_CATEGORIES.find((c) => c.key === row.category)?.label || row.category}
												</Badge>
											</Td>
											<Td maxW="180px">
												<Text fontSize="sm" noOfLines={2}>{row.eventName || "—"}</Text>
											</Td>
											<Td maxW="360px">
												<Text fontSize="sm" whiteSpace="pre-wrap">{row.message}</Text>
											</Td>
										</Tr>
									))}
								</Tbody>
							</Table>
						</TableContainer>
						<Pagination
							totalItems={pagination.total}
							perPageItems={pagination.limit}
							pageNo={pagination.page}
							onPageChange={setPage}
						/>
					</>
				)}
			</ConsoleLayout>
		</>
	)
}

export const getServerSideProps: GetServerSideProps = async (context) => {
	const authResult = await adminOnly(context)
	if ("redirect" in authResult) return authResult
	return { props: {} }
}

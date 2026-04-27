import React from "react"
import { Flex, Button, Text } from "@chakra-ui/react"

interface PaginationProps {
	totalItems: number
	perPageItems: number
	pageNo: number
	onPageChange: (page: number) => void
}

const Pagination: React.FC<PaginationProps> = ({ totalItems, perPageItems, pageNo, onPageChange }) => {
	const totalPages = Math.ceil(totalItems / perPageItems)

	if (totalPages <= 1) return null

	const getPageNumbers = (): (number | "...")[] => {
		if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)

		const pages: (number | "...")[] = [1]
		if (pageNo > 3) pages.push("...")
		for (let i = Math.max(2, pageNo - 1); i <= Math.min(totalPages - 1, pageNo + 1); i++) {
			pages.push(i)
		}
		if (pageNo < totalPages - 2) pages.push("...")
		pages.push(totalPages)
		return pages
	}

	return (
		<Flex align="center" justify="center" mt={8} gap={2} flexWrap="wrap">
			<Button
				onClick={() => onPageChange(pageNo - 1)}
				isDisabled={pageNo <= 1}
				colorScheme={pageNo <= 1 ? "gray" : "teal"}
				size="sm"
			>
				Previous
			</Button>

			{getPageNumbers().map((p, i) =>
				p === "..." ? (
					<Text key={`ellipsis-${i}`} color="gray.400" px={1} alignSelf="center">…</Text>
				) : (
					<Button
						key={p}
						onClick={() => onPageChange(p as number)}
						colorScheme="teal"
						variant={pageNo === p ? "solid" : "outline"}
						size="sm"
						minW="36px"
					>
						{p}
					</Button>
				)
			)}

			<Button
				onClick={() => onPageChange(pageNo + 1)}
				isDisabled={pageNo >= totalPages}
				colorScheme={pageNo >= totalPages ? "gray" : "teal"}
				size="sm"
			>
				Next
			</Button>
		</Flex>
	)
}

export default Pagination

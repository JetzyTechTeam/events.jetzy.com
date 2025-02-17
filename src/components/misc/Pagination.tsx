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

	return (
		<Flex align="center" justify="center" mt={8} color={"gray.200"}>
			<Button onClick={() => onPageChange(pageNo - 1)} isDisabled={pageNo <= 1} mr={4} colorScheme={pageNo <= 1 ? "gray" : "teal"}>
				Previous
			</Button>
			<Text fontSize="md">
				Showing {perPageItems} of {totalItems} in Page {pageNo}
			</Text>
			<Button onClick={() => onPageChange(pageNo + 1)} isDisabled={pageNo >= totalPages} ml={4} colorScheme={pageNo >= totalPages ? "gray" : "teal"}>
				Next
			</Button>
		</Flex>
	)
}

export default Pagination

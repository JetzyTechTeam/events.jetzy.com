import React from "react"
import { Button, Flex, HStack, IconButton, Select, Text } from "@chakra-ui/react"
import { FiChevronLeft, FiChevronRight, FiChevronsLeft, FiChevronsRight } from "react-icons/fi"

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

interface TablePaginationProps {
	page: number
	pageSize: number
	total: number
	onPageChange: (page: number) => void
	onPageSizeChange?: (size: number) => void
	pageSizeOptions?: number[]
	isLoading?: boolean
	/** What a row is, for "Showing 1–10 of 105 events". */
	noun?: string
}

/** Page numbers to show around the current one, with "…" gaps: 1 … 4 5 [6] 7 8 … 11 */
const pageWindow = (page: number, totalPages: number): Array<number | "gap"> => {
	if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
	const pages: Array<number | "gap"> = [1]
	const start = Math.max(2, page - 1)
	const end = Math.min(totalPages - 1, page + 1)
	if (start > 2) pages.push("gap")
	for (let p = start; p <= end; p++) pages.push(p)
	if (end < totalPages - 1) pages.push("gap")
	pages.push(totalPages)
	return pages
}

const navBtn = {
	size: "sm" as const,
	bg: "#1a1a1a",
	color: "white",
	border: "1px solid",
	borderColor: "#2a2a2a",
	_hover: { bg: "#262626" },
	_disabled: { opacity: 0.35, cursor: "not-allowed" },
}

export default function TablePagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = PAGE_SIZE_OPTIONS, isLoading, noun = "rows" }: TablePaginationProps) {
	const totalPages = Math.max(1, Math.ceil(total / pageSize))
	const from = total === 0 ? 0 : (page - 1) * pageSize + 1
	const to = Math.min(total, page * pageSize)
	const go = (p: number) => onPageChange(Math.min(totalPages, Math.max(1, p)))

	return (
		<Flex justify="space-between" align="center" mt={4} gap={3} wrap="wrap">
			<HStack spacing={3} color="#9C9C9C" fontSize="sm">
				<Text>
					Showing <Text as="span" color="white" fontWeight="semibold">{from.toLocaleString()}–{to.toLocaleString()}</Text> of{" "}
					<Text as="span" color="white" fontWeight="semibold">{total.toLocaleString()}</Text> {noun}
				</Text>
				{onPageSizeChange && (
					<HStack spacing={2}>
						<Text whiteSpace="nowrap">Rows per page</Text>
						<Select
							size="sm"
							w="76px"
							value={pageSize}
							onChange={(e) => onPageSizeChange(Number(e.target.value))}
							bg="#0f0f0f"
							color="white"
							borderColor="#2a2a2a"
							focusBorderColor="#F79432"
							sx={{ "> option": { bg: "#1a1a1a", color: "white" } }}
							aria-label="Rows per page"
						>
							{pageSizeOptions.map((n) => (
								<option key={n} value={n}>{n}</option>
							))}
						</Select>
					</HStack>
				)}
			</HStack>

			{totalPages > 1 && (
				<HStack spacing={1}>
					<IconButton {...navBtn} aria-label="First page" icon={<FiChevronsLeft />} onClick={() => go(1)} isDisabled={page <= 1 || isLoading} />
					<IconButton {...navBtn} aria-label="Previous page" icon={<FiChevronLeft />} onClick={() => go(page - 1)} isDisabled={page <= 1 || isLoading} />
					{pageWindow(page, totalPages).map((p, i) =>
						p === "gap" ? (
							<Text key={`gap-${i}`} color="#6b6b6b" px={1}>…</Text>
						) : (
							<Button
								key={p}
								{...navBtn}
								minW="32px"
								px={2}
								onClick={() => go(p)}
								isDisabled={isLoading}
								aria-current={p === page ? "page" : undefined}
								{...(p === page ? { bg: "#F79432", color: "black", borderColor: "#F79432", _hover: { bg: "#E68422" } } : {})}
							>
								{p}
							</Button>
						)
					)}
					<IconButton {...navBtn} aria-label="Next page" icon={<FiChevronRight />} onClick={() => go(page + 1)} isDisabled={page >= totalPages || isLoading} />
					<IconButton {...navBtn} aria-label="Last page" icon={<FiChevronsRight />} onClick={() => go(totalPages)} isDisabled={page >= totalPages || isLoading} />
				</HStack>
			)}
		</Flex>
	)
}

import React from "react"
import { Box, Flex, Table, TableContainer, Tbody, Td, Text, Th, Thead, Tr, Tooltip, Icon } from "@chakra-ui/react"
import { FiInfo } from "react-icons/fi"

/** Below Chakra's `md` (768px). Every phone rule on the analytics pages sits inside this query. */
export const PHONE = "@media screen and (max-width: 47.99em)"

/**
 * How an analytics table behaves on a phone when it STAYS a table (time series, wide person
 * lists): the column that says what the row is gets frozen and may wrap, and cells are
 * tightened, so the numbers can be swiped under a name that never leaves the screen. The table
 * scrolls inside its own box; the page does not.
 *
 * `nameColumn` is 1-based: pass 2 where the first column is a rank or a date and the second
 * is the name. `background` must be the colour of the panel the table sits on - a frozen cell
 * is opaque, or the numbers scrolling under it would show through. Nothing here applies from
 * tablet width up.
 */
export const phoneTableSx = (nameColumn = 1, background = "#1a1a1a") => ({
	[PHONE]: {
		"& th, & td": { paddingLeft: "8px", paddingRight: "8px" },
		[`& th:nth-of-type(${nameColumn}), & td:nth-of-type(${nameColumn})`]: {
			position: "sticky",
			left: 0,
			zIndex: 2,
			background,
			whiteSpace: "normal",
			overflowWrap: "anywhere",
			minWidth: "132px",
			maxWidth: "160px",
		},
		// the header cell of that column is frozen both ways where the header is sticky too
		[`& th:nth-of-type(${nameColumn})`]: { zIndex: 3 },
	},
})

/** Dark table styling shared by every analytics table: sticky header, row hover, muted borders. */
export const darkTableSx = {
	"& th": {
		color: "#9C9C9C",
		borderColor: "#2a2a2a",
		bg: "#1a1a1a",
		position: "sticky",
		top: 0,
		zIndex: 1,
		fontSize: "11px",
		letterSpacing: "0.04em",
		whiteSpace: "nowrap",
	},
	"& td": { borderColor: "#2a2a2a", color: "white", fontSize: "sm" },
	"& tbody tr:hover td": { bg: "#202020" },
	"& tbody tr:last-of-type td": { borderBottom: "none" },
	// Phones: freeze the first column (see phoneTableSx). A table whose name is in another
	// column spreads `phoneTableSx(n)` after this, which replaces the whole block.
	...phoneTableSx(1),
}

interface AnalyticsPanelProps {
	title: string
	subtitle?: React.ReactNode
	actions?: React.ReactNode
	children: React.ReactNode
	mb?: number
}

export function AnalyticsPanel({ title, subtitle, actions, children, mb = 6 }: AnalyticsPanelProps) {
	return (
		<Box bg="#1a1a1a" color="white" p={{ base: 4, md: 6 }} borderRadius="lg" border="1px solid" borderColor="#2a2a2a" mb={mb}>
			<Flex justify="space-between" align={{ base: "flex-start", md: "center" }} mb={4} gap={3} wrap="wrap">
				<Box>
					<Text fontSize="lg" fontWeight="bold" color="white">{title}</Text>
					{subtitle && <Text fontSize="sm" color="#9C9C9C" mt={0.5}>{subtitle}</Text>}
				</Box>
				{actions}
			</Flex>
			{children}
		</Box>
	)
}

/** Small (i) icon with a tooltip, for explaining how a column is calculated. */
export function InfoTip({ label }: { label: string }) {
	return (
		<Tooltip label={label} hasArrow placement="top" bg="#2a2a2a" color="white" fontSize="xs" maxW="280px">
			<Box as="span" display="inline-flex" ml={1} verticalAlign="middle" cursor="help" color="#6b6b6b" _hover={{ color: "#9C9C9C" }}>
				<Icon as={FiInfo} boxSize="12px" />
			</Box>
		</Tooltip>
	)
}

export interface StatRow {
	label: string
	value: React.ReactNode
	share?: number | null
	help: string
	tone?: "good" | "warn" | "bad"
}

const toneColor = { good: "#4ade80", warn: "#fbbf24", bad: "#f87171" }

/**
 * Metric / Value / Share / What it means — the overview's numbers laid out so an admin can read
 * what each one counts without guessing.
 */
export function StatTable({ rows, showShare = false }: { rows: StatRow[]; showShare?: boolean }) {
	return (
		// Phones: "What it means" is a hidden column there, so the explanation an admin needs was
		// simply gone. It sits under the metric's name instead. No frozen column - with two or
		// three columns the table fits once the label is allowed to wrap.
		<TableContainer sx={{ ...darkTableSx, [PHONE]: { "& th, & td": { paddingLeft: "8px", paddingRight: "8px" }, "& td:first-of-type": { whiteSpace: "normal" } } }}>
			<Table variant="simple" size="sm">
				<Thead>
					<Tr>
						<Th>Metric</Th>
						<Th isNumeric>Value</Th>
						{showShare && <Th isNumeric>Share</Th>}
						<Th display={{ base: "none", md: "table-cell" }}>What it means</Th>
					</Tr>
				</Thead>
				<Tbody>
					{rows.map((r) => (
						<Tr key={r.label}>
							<Td fontWeight="medium">
								{r.label}
								<Text display={{ base: "block", md: "none" }} fontSize="11px" fontWeight="normal" color="#9C9C9C" lineHeight="1.35" mt="2px">{r.help}</Text>
							</Td>
							<Td isNumeric fontWeight="semibold" color={r.tone ? `${toneColor[r.tone]} !important` : undefined}>{r.value}</Td>
							{showShare && <Td isNumeric color="#9C9C9C !important">{r.share === null || r.share === undefined ? "—" : `${r.share.toFixed(1)}%`}</Td>}
							<Td display={{ base: "none", md: "table-cell" }} color="#9C9C9C !important" whiteSpace="normal" fontSize="xs !important">{r.help}</Td>
						</Tr>
					))}
				</Tbody>
			</Table>
		</TableContainer>
	)
}

/** Trigger a CSV download in the browser. Values are quoted; a BOM keeps Excel on UTF-8. */
export function downloadCsv(filename: string, header: string[], rows: Array<Array<string | number | null | undefined>>) {
	const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`
	const csv = "﻿" + [header.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n")
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = filename
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}

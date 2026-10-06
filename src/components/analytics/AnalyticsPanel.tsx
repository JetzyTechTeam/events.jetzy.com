import React from "react"
import { Box, Flex, Table, TableContainer, Tbody, Td, Text, Th, Thead, Tr, Tooltip, Icon } from "@chakra-ui/react"
import { FiInfo } from "react-icons/fi"

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
		<TableContainer sx={darkTableSx}>
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
							<Td fontWeight="medium">{r.label}</Td>
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

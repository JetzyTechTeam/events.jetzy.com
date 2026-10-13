import React from "react"
import { Box, Flex, Text } from "@chakra-ui/react"

export interface PhoneStatRow {
	key: string | number
	/** What the row is about — a form, a referrer, an album. Wraps rather than truncating. */
	title: React.ReactNode
	/** The one badge the table row carries (a rate, a type, a device), kept top-right. */
	badge?: React.ReactNode
	/** The table's numeric columns, each said with its own column header. */
	stats: Array<{ label: string; value: React.ReactNode }>
}

/**
 * A small analytics table, laid out for a phone.
 *
 * The console's analytics pages are full of three-to-five column tables — a name and a few
 * numbers. On a phone those scroll sideways and the name leaves the screen with the first
 * swipe. This renders the same rows as a list: the name on its own line, then the numbers
 * underneath, each labelled with the column header it came from.
 *
 * It is shown BELOW `md` only (`display={{ base: "block", md: "none" }}`); the caller keeps
 * its table for `md` up with the opposite rule. It decides nothing — every value and badge is
 * handed in already built, so the table and this list cannot disagree about a number.
 */
export default function PhoneStatRows({ rows }: { rows: PhoneStatRow[] }) {
	return (
		<Box display={{ base: "block", md: "none" }}>
			{rows.map((row, i) => (
				<Box key={row.key} py={3} borderTop={i === 0 ? "none" : "1px solid #2a2a2a"}>
					<Flex justify="space-between" align="flex-start" gap={3}>
						<Box flex="1" minW={0} color="white" fontSize="14px" lineHeight="1.35" overflowWrap="anywhere">
							{row.title}
						</Box>
						{row.badge && <Box flexShrink={0}>{row.badge}</Box>}
					</Flex>
					<Flex mt={1.5} columnGap={4} rowGap={1} wrap="wrap">
						{row.stats.map((s) => (
							<Text key={s.label} fontSize="12px" color="#9C9C9C">
								{s.label}{" "}
								<Text as="span" color="white" fontWeight={600} fontSize="13px">
									{s.value}
								</Text>
							</Text>
						))}
					</Flex>
				</Box>
			))}
		</Box>
	)
}

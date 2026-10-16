import React from "react"
import { Box, Flex, Text } from "@chakra-ui/react"
import { IconType } from "react-icons"

interface MetricsCardProps {
	title: string
	value: string | number
	icon?: IconType
	iconColor?: string
	bgColor?: string
	subtitle?: string
	dark?: boolean
	/**
	 * Below 768px only: drops the icon bubble and uses a 20px value, so the tile works at half
	 * the width of a phone ("$12,340.00" at 24px beside a 36px icon does not fit). Off by
	 * default; nothing changes from tablet width up either way.
	 */
	compactOnMobile?: boolean
}

const PHONE = "@media screen and (max-width: 47.99em)"

export default function MetricsCard({ title, value, icon: Icon, iconColor = "#1877F2", bgColor, subtitle, dark = false, compactOnMobile = false }: MetricsCardProps) {
	// Custom bgColor (light accent tile) forces light-mode text for readability, even in dark theme
	const effectiveDark = dark && !bgColor
	const cardBg = bgColor || (dark ? "#1a1a1a" : "#F0F2F5")
	const valueColor = effectiveDark ? "white" : "#1C1E21"
	const labelColor = effectiveDark ? "#9C9C9C" : "#65676B"
	const iconBg = effectiveDark ? "#2a2a2a" : "white"
	const borderProps = effectiveDark ? { border: "1px solid", borderColor: "#2a2a2a" } : {}
	return (
		<Box
			p={4}
			bg={cardBg}
			borderRadius="md"
			{...borderProps}
			sx={compactOnMobile ? { [PHONE]: { padding: "12px", "& .metric-icon": { display: "none" }, "& .metric-value": { fontSize: "20px", lineHeight: 1.25 }, "& p": { overflowWrap: "anywhere" } } } : undefined}
		>
			<Flex align="center" gap={3}>
				{Icon && (
					<Box className="metric-icon" p={2} bg={iconBg} borderRadius="full">
						<Icon color={iconColor} size={20} />
					</Box>
				)}
				<Box flex="1">
					<Text className="metric-value" fontSize="2xl" fontWeight="bold" color={valueColor}>
						{value}
					</Text>
					<Text fontSize="xs" color={labelColor} fontWeight="600" textTransform="uppercase">
						{title}
					</Text>
					{subtitle && (
						<Text fontSize="xs" color={labelColor} mt={1}>
							{subtitle}
						</Text>
					)}
				</Box>
			</Flex>
		</Box>
	)
}


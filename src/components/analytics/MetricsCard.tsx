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
}

export default function MetricsCard({ title, value, icon: Icon, iconColor = "#1877F2", bgColor = "#F0F2F5", subtitle }: MetricsCardProps) {
	return (
		<Box p={4} bg={bgColor} borderRadius="md">
			<Flex align="center" gap={3}>
				{Icon && (
					<Box p={2} bg="white" borderRadius="full">
						<Icon color={iconColor} size={20} />
					</Box>
				)}
				<Box flex="1">
					<Text fontSize="2xl" fontWeight="bold" color="#1C1E21">
						{value}
					</Text>
					<Text fontSize="xs" color="#65676B" fontWeight="600" textTransform="uppercase">
						{title}
					</Text>
					{subtitle && (
						<Text fontSize="xs" color="#65676B" mt={1}>
							{subtitle}
						</Text>
					)}
				</Box>
			</Flex>
		</Box>
	)
}


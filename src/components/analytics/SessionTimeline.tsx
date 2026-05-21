import React from "react"
import { Box, Flex, Text, Badge, Tooltip } from "@chakra-ui/react"
import { FiEye, FiMousePointer, FiArrowDown, FiEdit, FiZap, FiAlertTriangle } from "react-icons/fi"

export interface TimelineStep {
	type: "page_view" | "click" | "scroll" | "form" | "event_interaction"
	timestamp: string | Date
	page?: string
	timeSpent?: number
	pageTitle?: string
	elementText?: string
	elementTag?: string
	dataTrack?: string
	href?: string
	isRageClick?: boolean
	maxDepthPct?: number
	milestones?: number[]
	formName?: string
	interactionType?: string
	fieldName?: string
	eventId?: string | null
	metadata?: any
}

const ICON_BY_TYPE: Record<string, any> = {
	page_view: FiEye,
	click: FiMousePointer,
	scroll: FiArrowDown,
	form: FiEdit,
	event_interaction: FiZap,
}

const COLOR_BY_TYPE: Record<string, string> = {
	page_view: "blue",
	click: "purple",
	scroll: "teal",
	form: "orange",
	event_interaction: "pink",
}

function describe(step: TimelineStep): string {
	switch (step.type) {
		case "page_view":
			return `${step.pageTitle || step.page}${step.timeSpent ? ` · ${step.timeSpent}s` : ""}`
		case "click":
			return `${step.isRageClick ? "[RAGE] " : ""}Click: ${step.dataTrack || step.elementText || step.elementTag || "element"}${step.href ? ` → ${step.href}` : ""}`
		case "scroll":
			return `Scrolled to ${step.maxDepthPct}% on ${step.page}`
		case "form":
			return `Form "${step.formName}" — ${step.interactionType}${step.fieldName ? ` (${step.fieldName})` : ""}`
		case "event_interaction":
			return `Event ${step.interactionType}`
		default:
			return JSON.stringify(step)
	}
}

export default function SessionTimeline({ steps }: { steps: TimelineStep[] }) {
	if (!steps || steps.length === 0) {
		return (
			<Box p={4} textAlign="center" color="#9C9C9C">
				No journey steps recorded.
			</Box>
		)
	}

	return (
		<Box position="relative" pl={6}>
			<Box position="absolute" left="11px" top={0} bottom={0} width="2px" bg="#2a2a2a" />
			{steps.map((step, idx) => {
				const Icon = ICON_BY_TYPE[step.type] || FiZap
				const color = COLOR_BY_TYPE[step.type] || "gray"
				const time = new Date(step.timestamp)
				return (
					<Flex key={idx} mb={4} align="flex-start" position="relative">
						<Box
							position="absolute"
							left="-20px"
							top="2px"
							w="24px"
							h="24px"
							borderRadius="full"
							bg={`${color}.500`}
							color="white"
							display="flex"
							alignItems="center"
							justifyContent="center"
							boxShadow="0 0 0 3px #1a1a1a"
						>
							<Icon size={12} />
						</Box>
						<Box ml={4} flex="1">
							<Flex align="center" gap={2} mb={1}>
								<Badge colorScheme={color} fontSize="xs">{step.type.replace("_", " ")}</Badge>
								{step.isRageClick && (
									<Tooltip label="Rage click detected">
										<Badge colorScheme="red" fontSize="xs"><FiAlertTriangle style={{ display: "inline" }} /> rage</Badge>
									</Tooltip>
								)}
								<Text fontSize="xs" color="#9C9C9C">{time.toLocaleTimeString()}</Text>
							</Flex>
							<Text fontSize="sm" color="white">{describe(step)}</Text>
							{step.page && step.type !== "page_view" && (
								<Text fontSize="xs" color="#9C9C9C" mt={0.5}>on {step.page}</Text>
							)}
						</Box>
					</Flex>
				)
			})}
		</Box>
	)
}

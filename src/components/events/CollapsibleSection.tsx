import React from "react"
import { Box, Flex, Text, Collapse, useDisclosure } from "@chakra-ui/react"
import { ChevronDownIcon } from "@chakra-ui/icons"

interface CollapsibleSectionProps {
	icon: React.ReactNode
	title: string
	children: React.ReactNode
	defaultOpen?: boolean
	borderBottom?: boolean
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ icon, title, children, defaultOpen = false, borderBottom = true }) => {
	const { isOpen, onToggle } = useDisclosure({ defaultIsOpen: defaultOpen })

	return (
		<Box 
			borderBottom={borderBottom ? "1px" : "none"} 
			borderColor="#E5E7EB" 
			py={3}
			bg={isOpen ? "#FAFAFA" : "transparent"}
			transition="background 0.2s"
		>
			<Flex
				alignItems="center"
				justifyContent="space-between"
				cursor="pointer"
				onClick={onToggle}
				_hover={{ bg: isOpen ? "#F3F4F6" : "#F9FAFB" }}
				px={3}
				py={2}
				borderRadius="md"
				transition="all 0.2s"
			>
				<Flex alignItems="center" gap={3}>
					<Box color="#6B7280">{icon}</Box>
					<Text fontSize="15px" fontWeight="600" color="#1F2937">
						{title}
					</Text>
				</Flex>
				<ChevronDownIcon
					w={5}
					h={5}
					color="#6B7280"
					transform={isOpen ? "rotate(180deg)" : "rotate(0deg)"}
					transition="transform 0.2s"
				/>
			</Flex>
			<Collapse in={isOpen} animateOpacity>
				<Box mt={3} px={3}>
					{children}
				</Box>
			</Collapse>
		</Box>
	)
}

export default CollapsibleSection


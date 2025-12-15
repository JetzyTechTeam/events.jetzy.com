import React from "react"
import {
	Box,
	Flex,
	Text,
	Menu,
	MenuButton,
	MenuList,
	MenuItem,
	useDisclosure,
} from "@chakra-ui/react"
import { ChevronDownIcon } from "@chakra-ui/icons"
import { LockSVG } from "@/assets/icons"
import { FiGlobe, FiUsers, FiLock } from "react-icons/fi"

interface PrivacySelectorProps {
	value: "public" | "private"
	onChange: (value: "public" | "private") => void
}

const PrivacySelector: React.FC<PrivacySelectorProps> = ({ value, onChange }) => {
	const privacyOptions = [
		{
			value: "private" as const,
			icon: <FiLock size={20} />,
			label: "Private",
			description: "Only people who are invited",
		},
		{
			value: "public" as const,
			icon: <FiGlobe size={20} />,
			label: "Public",
			description: "Anyone on Jetzy",
		},
	]

	const selectedOption = privacyOptions.find((opt) => opt.value === value) || privacyOptions[1]

	return (
		<Box mb={4}>
			<Menu>
				<MenuButton
					as={Box}
					cursor="pointer"
					border="1px"
					borderColor="#E5E7EB"
					borderRadius="lg"
					px={4}
					py={3}
					bg="#FFFFFF"
					_hover={{ borderColor: "#B0B0B0", bg: "#FAFAFA", boxShadow: "sm" }}
					transition="all 0.2s"
				>
					<Flex alignItems="center" justifyContent="space-between">
						<Flex alignItems="center" gap={3}>
							<Box color="#6B7280">
								<LockSVG />
							</Box>
							<Text fontSize="15px" fontWeight="500" color="#1F2937">
								Who can see it?
							</Text>
						</Flex>
						<ChevronDownIcon w={5} h={5} color="#6B7280" />
					</Flex>
				</MenuButton>
				<MenuList
					bg="#FFFFFF"
					border="1px"
					borderColor="#E5E7EB"
					boxShadow="lg"
					borderRadius="lg"
					p={2}
					minW="300px"
				>
					{privacyOptions.map((option) => (
						<MenuItem
							key={option.value}
							onClick={() => onChange(option.value)}
							bg={value === option.value ? "#F3F4F6" : "transparent"}
							borderRadius="md"
							px={3}
							py={3}
							_hover={{ bg: "#F9FAFB" }}
							mb={1}
						>
							<Flex alignItems="center" gap={3} flex={1}>
								<Box
									w="40px"
									h="40px"
									borderRadius="full"
									bg="#F3F4F6"
									display="flex"
									alignItems="center"
									justifyContent="center"
									color="#1F2937"
								>
									{option.icon}
								</Box>
								<Box flex={1}>
									<Text fontSize="15px" fontWeight="600" color="#1F2937" mb={0.5}>
										{option.label}
									</Text>
									<Text fontSize="13px" color="#6B7280">
										{option.description}
									</Text>
								</Box>
								<Box
									w="20px"
									h="20px"
									borderRadius="full"
									border="2px"
									borderColor={value === option.value ? "#8B5CF6" : "#D1D5DB"}
									display="flex"
									alignItems="center"
									justifyContent="center"
								>
									{value === option.value && (
										<Box w="10px" h="10px" borderRadius="full" bg="#8B5CF6" />
									)}
								</Box>
							</Flex>
						</MenuItem>
					))}
				</MenuList>
			</Menu>
		</Box>
	)
}

export default PrivacySelector


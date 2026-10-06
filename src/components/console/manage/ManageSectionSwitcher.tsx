import React from "react"
import {
	Box,
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerOverlay,
	Flex,
	Text,
	useDisclosure,
} from "@chakra-ui/react"
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/24/outline"
import { Roboto } from "next/font/google"
import type { ManageSection, ManageSectionKey } from "./manageSections"

const roboto = Roboto({ weight: ["400", "700"], subsets: ["latin"], display: "swap" })

/**
 * Phone-only replacement for the Manage Event tab bar. Eight tabs in a horizontal strip left
 * half of them off-screen with nothing saying they existed; this names the section you are in
 * and lists every section, with what needs attention, one tap away.
 *
 * Badges are "needs you" counts (pending approvals, unhandled photo requests) — never totals,
 * which would read as a to-do list that isn't one.
 */
export function ManageSectionSwitcher({
	sections,
	tabIndex,
	onChange,
	badges = {},
}: {
	sections: ManageSection[]
	tabIndex: number
	onChange: (index: number) => void
	badges?: Partial<Record<ManageSectionKey, number>>
}) {
	const { isOpen, onOpen, onClose } = useDisclosure()
	const current = sections.find((s) => s.index === tabIndex) ?? sections[0]
	const CurrentIcon = current.icon
	// Anything needing attention in a section the host isn't looking at — the dot on the
	// switcher is the only sign of it while the sheet is closed.
	const attentionElsewhere = sections.some((s) => s.index !== tabIndex && (badges[s.key] ?? 0) > 0)

	const select = (index: number) => {
		onClose()
		if (index === tabIndex) return
		onChange(index)
		// Switching from deep inside a long panel would otherwise land mid-way down the next.
		if (typeof window !== "undefined") window.scrollTo({ top: 0 })
	}

	return (
		<>
			<Flex
				as="button"
				type="button"
				display={{ base: "flex", md: "none" }}
				w="full"
				h="44px"
				px={3}
				align="center"
				gap={2}
				bg="#15181C"
				border="1px solid #343536"
				borderRadius="10px"
				color="white"
				onClick={onOpen}
				aria-haspopup="dialog"
				aria-label={`Section: ${current.label}. Change section`}
			>
				<CurrentIcon className="w-5 h-5 text-[#F79432] flex-shrink-0" />
				<Text className={roboto.className} fontSize="15px" fontWeight={500} flex="1" textAlign="left" noOfLines={1}>
					{current.label}
				</Text>
				{attentionElsewhere && <Box w="8px" h="8px" borderRadius="full" bg="#EC5E5E" flexShrink={0} aria-hidden />}
				<ChevronDownIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
			</Flex>

			<Drawer isOpen={isOpen} onClose={onClose} placement="bottom">
				<DrawerOverlay bg="blackAlpha.700" />
				<DrawerContent
					bg="#15181C"
					color="white"
					borderTopRadius="16px"
					borderTop="1px solid #343536"
					pb="calc(12px + env(safe-area-inset-bottom, 0px))"
				>
					<Box w="40px" h="4px" borderRadius="full" bg="#4A4D52" mx="auto" mt={2.5} mb={1} aria-hidden />
					<Text className={roboto.className} px={5} pt={2} pb={1} fontSize="12px" color="#9C9C9C" textTransform="uppercase" letterSpacing="0.06em">
						Manage event
					</Text>
					<DrawerBody px={2} py={1}>
						{sections.map((s) => {
							const Icon = s.icon
							const active = s.index === tabIndex
							const badge = badges[s.key] ?? 0
							return (
								<Flex
									key={s.key}
									as="button"
									type="button"
									w="full"
									h="52px"
									px={3}
									align="center"
									gap={3}
									borderRadius="10px"
									bg={active ? "rgba(247,148,50,0.12)" : "transparent"}
									_active={{ bg: "#1E2126" }}
									onClick={() => select(s.index)}
									aria-current={active ? "page" : undefined}
								>
									<Icon className={`w-5 h-5 flex-shrink-0 ${active ? "text-[#F79432]" : "text-[#B5B6B7]"}`} />
									<Text className={roboto.className} flex="1" textAlign="left" fontSize="15px" fontWeight={active ? 700 : 400} color={active ? "#F79432" : "white"}>
										{s.label}
									</Text>
									{badge > 0 && (
										<Flex minW="22px" h="22px" px="7px" align="center" justify="center" borderRadius="full" bg="#EC5E5E" fontSize="12px" fontWeight={700} color="white">
											{badge > 99 ? "99+" : badge}
										</Flex>
									)}
									{active && <CheckIcon className="w-5 h-5 text-[#F79432] flex-shrink-0" />}
								</Flex>
							)
						})}
					</DrawerBody>
				</DrawerContent>
			</Drawer>
		</>
	)
}

import React from "react"
import { Box, Flex, SimpleGrid, Text } from "@chakra-ui/react"
import { MegaphoneIcon, QrCodeIcon, ShareIcon, UserPlusIcon } from "@heroicons/react/24/outline"
import { Roboto } from "next/font/google"

const roboto = Roboto({ weight: ["400", "700"], subsets: ["latin"], display: "swap" })

/**
 * Phone-only "at a glance" strip at the top of Manage Event's Overview. On desktop the stats
 * and quick actions sit in the sidebar beside the form; on a phone that sidebar lands BELOW the
 * whole form, so the things a host opens the page for were the furthest thing from them.
 *
 * Same numbers, same handlers and the same pending-approval copy as the sidebar cards — this is
 * a second placement of them, not a second implementation.
 */
export function ManageMobileSummary({
	views,
	ticketsSold,
	attendees,
	onViewsClick,
	actionsLocked,
	lockedMessage,
	onInvite,
	onBlast,
	onShare,
	onCheckIn,
}: {
	views: number
	ticketsSold: number
	attendees: number
	onViewsClick: () => void
	/** True while the event awaits approval (or is a draft): outward-facing actions are hidden. */
	actionsLocked: boolean
	lockedMessage: string
	onInvite: () => void
	onBlast: () => void
	onShare: () => void
	onCheckIn: () => void
}) {
	const stats = [
		{ label: "Views", value: views, onClick: onViewsClick },
		{ label: "Tickets sold", value: ticketsSold },
		{ label: "Attendees", value: attendees },
	]
	const actions = [
		{ label: "Invite", icon: UserPlusIcon, onClick: onInvite },
		{ label: "Blast", icon: MegaphoneIcon, onClick: onBlast },
		{ label: "Share", icon: ShareIcon, onClick: onShare },
		{ label: "Check-in", icon: QrCodeIcon, onClick: onCheckIn },
	]

	return (
		<Box display={{ base: "block", md: "none" }} mb={3}>
			<SimpleGrid columns={3} spacing={2}>
				{stats.map((s) => (
					<Flex
						key={s.label}
						as={s.onClick ? "button" : "div"}
						{...(s.onClick ? { type: "button", onClick: s.onClick } : {})}
						direction="column"
						align="flex-start"
						justify="center"
						minH="64px"
						px={3}
						py={2}
						bg="#15181C"
						border="1px solid #343536"
						borderRadius="10px"
						textAlign="left"
					>
						<Text color="white" fontWeight={700} fontSize="20px" lineHeight="1.15">
							{s.value}
						</Text>
						<Text className={roboto.className} color="#9C9C9C" fontSize="12px" lineHeight="1.2" mt="2px">
							{s.label}
						</Text>
					</Flex>
				))}
			</SimpleGrid>

			{actionsLocked ? (
				<Box mt={2} px={3} py={2.5} bg="#15181C" border="1px solid #343536" borderRadius="10px">
					<Text className={roboto.className} color="#9C9C9C" fontSize="13px" lineHeight="1.4">
						{lockedMessage}
					</Text>
				</Box>
			) : (
				<SimpleGrid columns={4} spacing={2} mt={2}>
					{actions.map((a) => {
						const Icon = a.icon
						return (
							<Flex
								key={a.label}
								as="button"
								type="button"
								direction="column"
								align="center"
								justify="center"
								gap={1}
								minH="60px"
								bg="#15181C"
								border="1px solid #343536"
								borderRadius="10px"
								_active={{ bg: "#1E2126" }}
								onClick={a.onClick}
							>
								<Icon className="w-5 h-5 text-[#F79432]" />
								<Text className={roboto.className} color="white" fontSize="12px" fontWeight={500}>
									{a.label}
								</Text>
							</Flex>
						)
					})}
				</SimpleGrid>
			)}
		</Box>
	)
}

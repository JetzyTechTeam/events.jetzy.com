import React from "react"
import {
	AlertDialog,
	AlertDialogBody,
	AlertDialogContent,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogOverlay,
	Box,
	Button,
	Flex,
	Text,
} from "@chakra-ui/react"
import { ClockIcon } from "@heroicons/react/24/outline"
import { Roboto } from "next/font/google"

const roboto = Roboto({ weight: ["400", "700"], subsets: ["latin"], display: "swap" })

/**
 * Shown when the host navigates away from an event form holding work that is saved but not
 * published. One component for Create Event and Manage Event, so the two screens can never
 * disagree about what leaving means — the same rule `BenefitsField` follows.
 *
 * `primary` is optional: Manage Event offers to publish right here, Create Event does not
 * (a half-filled form would only fail validation, and its draft is already recoverable from
 * My Events).
 */
export interface UnsavedDraftDialogProps {
	isOpen: boolean
	title: string
	/** Body copy. A node, not a string — every caller emphasises a word or two. */
	body: React.ReactNode
	/** Small line under the title, e.g. when the draft was last saved. */
	savedLabel?: string | null
	/** Amber = "not live yet". Red = this save removes something from guests. */
	tone?: "warning" | "danger"
	leaveLabel: string
	onLeave: () => void
	onKeepEditing: () => void
	primary?: { label: string; loadingLabel?: string; onClick: () => void }
	isBusy?: boolean
}

export function UnsavedDraftDialog({
	isOpen,
	title,
	body,
	savedLabel,
	tone = "warning",
	leaveLabel,
	onLeave,
	onKeepEditing,
	primary,
	isBusy = false,
}: UnsavedDraftDialogProps) {
	const keepEditingRef = React.useRef<any>(null)
	const danger = tone === "danger"

	return (
		<AlertDialog isOpen={isOpen} leastDestructiveRef={keepEditingRef} onClose={onKeepEditing} isCentered motionPreset="slideInBottom">
			<AlertDialogOverlay bg="blackAlpha.700" backdropFilter="blur(2px)">
				<AlertDialogContent bg="#161616" border="1px solid #2A2D31" borderRadius="16px" mx={4} maxW="460px" overflow="hidden">
					{/* Icon + heading share a row: the coloured mark carries the state, so the
					    sentence underneath can stay plain. */}
					<AlertDialogHeader pt={6} px={6} pb={0}>
						<Flex align="flex-start" gap={3}>
							<Flex flexShrink={0} w="40px" h="40px" borderRadius="full" bg={danger ? "#3A1B1B" : "#3A2A00"} align="center" justify="center">
								<ClockIcon className="w-5 h-5" style={{ color: danger ? "#F87171" : "#F79432" }} />
							</Flex>
							<Box minW={0}>
								<Text className={roboto.className} fontSize="18px" fontWeight={700} lineHeight="1.3" color="white">
									{title}
								</Text>
								{savedLabel && (
									<Text className={roboto.className} fontSize="12px" fontWeight={400} color="#7E8083" mt={1}>
										{savedLabel}
									</Text>
								)}
							</Box>
						</Flex>
					</AlertDialogHeader>

					<AlertDialogBody px={6} pt={4} pb={5}>
						<Text className={roboto.className} fontSize="14px" lineHeight="1.6" color="#B5B6B7">
							{body}
						</Text>
					</AlertDialogBody>

					{/* Stacked full-width on a phone — three buttons on one line is what wrapped the
					    primary onto a ragged second row. `order` puts the primary first in the stack
					    and last in the desktop row, with a flex spacer pushing the leave action away
					    from Keep editing so it can't be hit by accident. */}
					<AlertDialogFooter px={6} pt={0} pb={6} display="flex" flexDirection={{ base: "column", sm: "row" }} alignItems="stretch" gap={2} whiteSpace="nowrap">
						<Button
							ref={keepEditingRef}
							onClick={onKeepEditing}
							isDisabled={isBusy}
							variant="ghost"
							color="#B5B6B7"
							fontWeight={600}
							px={3}
							flexShrink={0}
							order={{ base: 3, sm: 1 }}
							_hover={{ bg: "#232629", color: "white" }}
						>
							Keep editing
						</Button>
						<Box flex="1" display={{ base: "none", sm: "block" }} order={{ sm: 2 }} />
						<Button
							onClick={onLeave}
							isDisabled={isBusy}
							variant="outline"
							color="white"
							borderColor="#3A3D41"
							fontWeight={600}
							flexShrink={0}
							order={{ base: 2, sm: 3 }}
							_hover={{ bg: "#232629", borderColor: "#4A4D51" }}
						>
							{leaveLabel}
						</Button>
						{primary && (
							/* Destructive variants are red: an orange "primary" on a button that takes
							   the event off the public listing reads as the safe way out. */
							<Button
								onClick={primary.onClick}
								isLoading={isBusy}
								loadingText={primary.loadingLabel ?? "Saving"}
								bg={danger ? "#DC2626" : "#F79432"}
								color={danger ? "white" : "black"}
								fontWeight="bold"
								flexShrink={0}
								order={{ base: 1, sm: 4 }}
								_hover={{ bg: danger ? "#B91C1C" : "#E68422" }}
								_active={{ bg: danger ? "#991B1B" : "#D97913" }}
							>
								{primary.label}
							</Button>
						)}
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialogOverlay>
		</AlertDialog>
	)
}

export default UnsavedDraftDialog

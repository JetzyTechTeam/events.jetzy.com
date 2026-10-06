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
import { roboto } from "@/lib/fonts"

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
	/**
	 * A second, sharper paragraph under the body, for something the main copy would otherwise
	 * overstate — an upload still running, or photos already deleted from the live event.
	 * Rendered in amber so it reads as a consequence, not as more reassurance.
	 */
	warning?: React.ReactNode
}

export function UnsavedDraftDialog({
	isOpen,
	title,
	body,
	savedLabel,
	tone = "warning",
	warning,
	leaveLabel,
	onLeave,
	onKeepEditing,
	primary,
	isBusy = false,
}: UnsavedDraftDialogProps) {
	const keepEditingRef = React.useRef<any>(null)
	const danger = tone === "danger"
	// Create Event has no primary action in this dialog (a half-finished form could only fail
	// validation), so "Keep editing" carries the emphasis there instead.
	const keepEditingIsPrimary = !primary

	return (
		/* `closeOnEsc` / `closeOnOverlayClick` follow `isBusy`: the buttons disable themselves
		   while a save is in flight, but Escape and a backdrop tap did not, so the dialog could
		   be dismissed mid-publish and leave the host with no sign of what was happening. */
		<AlertDialog
			isOpen={isOpen}
			leastDestructiveRef={keepEditingRef}
			onClose={onKeepEditing}
			isCentered
			motionPreset="slideInBottom"
			closeOnEsc={!isBusy}
			closeOnOverlayClick={!isBusy}
		>
			<AlertDialogOverlay bg="blackAlpha.700" backdropFilter="blur(2px)">
				<AlertDialogContent bg="#161616" border="1px solid #2A2D31" borderRadius="16px" mx={4} maxW="520px" overflow="hidden">
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
						{warning && (
							<Box mt={3} px={3} py={2} borderRadius="8px" bg="#2A2000" border="1px solid #5A4510">
								<Text className={roboto.className} fontSize="13px" lineHeight="1.5" color="#F5C77E">
									{warning}
								</Text>
							</Box>
						)}
					</AlertDialogBody>

					{/* Stacked full-width on a phone — three buttons on one line is what wrapped the
					    primary onto a ragged second row. `order` puts the primary first in the stack
					    and last in the desktop row, with a flex spacer pushing the leave action away
					    from Keep editing so it can't be hit by accident.

					    `flexWrap` is the safety net, and it is not optional: Chakra's footer aligns
					    to flex-end, so three no-shrink buttons wider than the panel overflow to the
					    LEFT, where `overflow: hidden` on the content clips the first one's label.
					    Wrapping drops a button to its own row instead of amputating it. */}
					<AlertDialogFooter
						px={6}
						pt={0}
						pb={6}
						display="flex"
						flexDirection={{ base: "column", sm: "row" }}
						alignItems="stretch"
						justifyContent="flex-end"
						flexWrap={{ base: "nowrap", sm: "wrap" }}
						gap={2}
						whiteSpace="nowrap"
					>
						{/* Every button gets a real surface. As a ghost this read as body text, which
						    on the Create dialog — where it is one of only two actions — left the panel
						    looking like it had a single button.

						    With no `primary` in the footer, Keep editing IS the encouraged action, so
						    it takes the orange. Where a primary exists it steps back to the neutral
						    fill, because two orange buttons name no winner. */}
						<Button
							ref={keepEditingRef}
							onClick={onKeepEditing}
							isDisabled={isBusy}
							bg={keepEditingIsPrimary ? "#F79432" : "#242628"}
							color={keepEditingIsPrimary ? "black" : "white"}
							border="1px solid"
							borderColor={keepEditingIsPrimary ? "#F79432" : "#3A3D41"}
							fontWeight={keepEditingIsPrimary ? "bold" : 600}
							px={4}
							flexShrink={0}
							/* Primary on top on a phone, whichever button is carrying it: with no
							   `primary` in the footer that is this one, and stacking it last would
							   put Create's main action at the bottom while Manage's sits at the top. */
							order={{ base: keepEditingIsPrimary ? 1 : 3, sm: 1 }}
							_hover={{
								bg: keepEditingIsPrimary ? "#E68422" : "#2E3135",
								borderColor: keepEditingIsPrimary ? "#E68422" : "#4A4D51",
							}}
							_active={{ bg: keepEditingIsPrimary ? "#D97913" : "#1E2023" }}
						>
							Keep editing
						</Button>
						<Box flex="1" display={{ base: "none", sm: "block" }} order={{ sm: 2 }} />
						<Button
							onClick={onLeave}
							isDisabled={isBusy}
							/* Outlined, not filled: on Manage it sits beside a filled "Keep editing"
							   and two identical surfaces would name no difference between staying
							   and leaving. */
							bg="transparent"
							color="white"
							border="1px solid"
							borderColor="#3A3D41"
							fontWeight={600}
							px={4}
							flexShrink={0}
							order={{ base: 2, sm: 3 }}
							_hover={{ bg: "#232629", borderColor: "#4A4D51" }}
							_active={{ bg: "#1E2023" }}
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
								px={4}
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

import React from "react"
import { Box, Button, Flex } from "@chakra-ui/react"
import { EyeIcon } from "@heroicons/react/20/solid"

/**
 * Phone-only save bar for the event forms (Manage Event and Create Event), fixed to the bottom
 * of the window — where a thumb is, and where it stays reachable however far down the form the
 * host has scrolled. On desktop the same buttons live in the page itself; these call the same
 * handlers. Preview is optional (there is nothing to preview before an event exists), and
 * `leading` holds whatever should sit beside the save button instead — Create's autosave pill.
 *
 * Mount it OUTSIDE any transformed or `overflow`-clipping ancestor: a transform makes
 * `position: fixed` resolve against that ancestor instead of the viewport.
 */
export function ManageMobileActionBar({
	onPreview,
	onSave,
	saveLabel,
	isSaving,
	isDirty = false,
	isDisabled = false,
	leading,
}: {
	onPreview?: () => void
	onSave: () => void
	saveLabel: string
	isSaving: boolean
	isDirty?: boolean
	isDisabled?: boolean
	leading?: React.ReactNode
}) {
	return (
		<Flex
			display={{ base: "flex", md: "none" }}
			position="fixed"
			left={0}
			right={0}
			bottom={0}
			zIndex={40}
			gap={3}
			align="center"
			px={4}
			pt={3}
			pb="calc(12px + env(safe-area-inset-bottom, 0px))"
			bg="rgba(11,11,11,0.96)"
			borderTop="1px solid #2A2D31"
			boxShadow="0 -8px 24px rgba(0,0,0,0.45)"
			sx={{ backdropFilter: "blur(8px)" }}
		>
			{leading}
			{onPreview && (
				<Button
					flex="1"
					h="48px"
					bg="#2A2D31"
					color="white"
					_hover={{ bg: "#323232" }}
					_active={{ bg: "#323232" }}
					fontWeight="bold"
					leftIcon={<EyeIcon className="w-5 h-5" />}
					onClick={onPreview}
				>
					Preview
				</Button>
			)}
			<Button
				flex="1.4"
				h="48px"
				bg="#F79432"
				color="black"
				_hover={{ bg: "#E68422" }}
				_active={{ bg: "#E68422" }}
				fontWeight="bold"
				isLoading={isSaving}
				isDisabled={isDisabled}
				onClick={onSave}
			>
				{isDirty && <Box as="span" w="8px" h="8px" borderRadius="full" bg="#0B0B0B" mr="2" flexShrink={0} />}
				{saveLabel}
			</Button>
		</Flex>
	)
}

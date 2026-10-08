import React, { useState } from "react"
import { Box, Flex, Text, type BoxProps } from "@chakra-ui/react"
import { ChevronDownIcon } from "@heroicons/react/24/outline"
import { roboto } from "@/lib/fonts"

/**
 * A collapsible card BELOW `md`, and nothing at all from `md` up.
 *
 * From `md` both wrappers are `display: contents`, so they generate no box: the children sit in
 * their parent exactly as if this component weren't there, margins and flex/gap included. That
 * is what keeps the desktop Manage Event page byte-for-byte unchanged.
 *
 * Collapsing HIDES the body, it never unmounts it. The Overview form holds uncontrolled pickers
 * (`defaultDate`), a Google Places widget bound to a ref and a Quill editor that owns its DOM —
 * unmounting any of them on collapse would lose state or break the binding, and there must only
 * ever be ONE instance of each field.
 */
export function MobileSection({
	title,
	summary,
	defaultOpen = false,
	order,
	children,
}: {
	title: string
	/** One line shown beside the title while collapsed — what is set, at a glance. */
	summary?: React.ReactNode
	defaultOpen?: boolean
	/** Flex `order` on phones, where the Overview flattens into one column. */
	order?: BoxProps["order"]
	children: React.ReactNode
}) {
	const [open, setOpen] = useState(defaultOpen)

	return (
		<Box
			display={{ base: "block", md: "contents" }}
			order={order}
			bg="#15181C"
			border="1px solid #343536"
			borderRadius="10px"
			minW={0}
		>
			<Flex
				as="button"
				type="button"
				display={{ base: "flex", md: "none" }}
				w="full"
				minH="56px"
				px={4}
				py={3}
				align="center"
				gap={3}
				textAlign="left"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
			>
				<Box flex="1" minW={0}>
					<Text className={roboto.className} color="white" fontSize="15px" fontWeight={500} lineHeight="1.3">
						{title}
					</Text>
					{!open && summary ? (
						<Text className={roboto.className} color="#9C9C9C" fontSize="13px" lineHeight="1.3" mt="2px" noOfLines={1}>
							{summary}
						</Text>
					) : null}
				</Box>
				<ChevronDownIcon
					className="w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200"
					style={{ transform: open ? "rotate(180deg)" : undefined }}
				/>
			</Flex>
			<Box
				display={{ base: open ? "block" : "none", md: "contents" }}
				px={4}
				pb={4}
				pt={1}
				// Phones only: the last field's own bottom margin would stack on the card padding.
				// Scoped by media query because the selector still matches through `contents`.
				sx={{ "@media screen and (max-width: 47.99em)": { "& > :last-child": { marginBottom: 0 } } }}
			>
				{children}
			</Box>
		</Box>
	)
}

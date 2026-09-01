import React, { useState } from "react"
import { Box, Button, Flex, Heading, Input, InputGroup, InputRightElement, Text } from "@chakra-ui/react"
import { MinusCircleIcon } from "@heroicons/react/24/solid"
import { Roboto } from "next/font/google"

const roboto = Roboto({ subsets: ["latin"], weight: ["400", "500", "700"] })

/**
 * The "Event Benefits" chips — the orange labels shown over the event banner.
 *
 * Extracted from the manage form so the inline editor on the public event page is literally the
 * same control rather than a lookalike. The stored value is a single comma-separated string
 * (that is what `benefits` is on the event), and the split/join lives here so no caller has to
 * know that.
 *
 * 23 characters is the cap because the chips render over the banner image; longer ones wrap and
 * cover the artwork.
 */
export const MAX_BENEFIT_LENGTH = 23

export default function BenefitsField({
	value,
	onChange,
	heading = "Event Benefits",
}: {
	/** Comma-separated, exactly as stored on the event. */
	value: string
	onChange: (next: string) => void
	heading?: string
}) {
	const [benefitInput, setBenefitInput] = useState("")

	const list = (value || "")
		.split(",")
		.map((b) => b.trim())
		.filter(Boolean)

	const addBenefit = () => {
		const v = benefitInput.trim()
		if (!v) return
		onChange([...list, v].join(","))
		setBenefitInput("")
	}

	const removeBenefit = (idx: number) => {
		const next = [...list]
		next.splice(idx, 1)
		onChange(next.join(","))
	}

	return (
		<>
			<Flex align="baseline" gap={2} mb={4}>
				<Heading size="md" color="white">{heading}</Heading>
				<Text className={roboto.className} fontSize="sm" color="#9C9C9C">(Max {MAX_BENEFIT_LENGTH} chars)</Text>
			</Flex>
			<InputGroup mb={4}>
				<Input
					placeholder="e.g free food, free drinks etc"
					className={roboto.className}
					bg="#090C10"
					color="white"
					fontSize="sm"
					h="48px"
					border="1px solid #343536"
					_focus={{ borderColor: "#343536", boxShadow: "none" }}
					pr="70px"
					maxLength={MAX_BENEFIT_LENGTH}
					value={benefitInput}
					onChange={(e) => setBenefitInput(e.target.value)}
					onKeyDown={(e) => {
						// Enter adds a chip; it must never reach the surrounding form, which on the
						// manage page would submit the whole event.
						if (e.key === "Enter") {
							e.preventDefault()
							addBenefit()
						}
					}}
				/>
				<InputRightElement w="auto" right="4" h="48px">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						color="#F79432"
						_hover={{ bg: "transparent" }}
						_active={{ bg: "transparent" }}
						p="0"
						onClick={addBenefit}
					>
						+ Add
					</Button>
				</InputRightElement>
			</InputGroup>
			<Flex gap={3} flexWrap="wrap">
				{list.map((b, idx) => (
					<Flex key={`${b}-${idx}`} align="center" gap={2} bg="#090C10" border="1px solid #343536" rounded="md" px="4" py="2">
						<Text className={roboto.className} fontSize="sm" color="white">{b}</Text>
						<Box as="button" type="button" display="flex" alignItems="center" onClick={() => removeBenefit(idx)}>
							<MinusCircleIcon className="w-5 h-5 text-[#EC5E5E]" />
						</Box>
					</Flex>
				))}
			</Flex>
		</>
	)
}

import React, { useState } from "react"
import { Box, Button, Flex, Heading, Input, InputGroup, InputRightElement, Text } from "@chakra-ui/react"
import { MinusCircleIcon } from "@heroicons/react/24/solid"
import { roboto } from "@/lib/fonts"
import { MAX_BENEFIT_COUNT, MAX_BENEFIT_LENGTH, benefitChips } from "@/lib/event-field-limits"

/**
 * The "Event Benefits" chips — the orange labels shown over the event banner.
 *
 * Extracted from the manage form so the inline editor on the public event page is literally the
 * same control rather than a lookalike. The stored value is a single comma-separated string
 * (that is what `benefits` is on the event), and the split/join lives here so no caller has to
 * know that.
 *
 * 23 characters is the cap because the chips render over the banner image; longer ones wrap and
 * cover the artwork. The number itself lives in `@/lib/event-field-limits` so the API routes can
 * read it without importing a Chakra component; re-exported here because this is where callers
 * have always imported it from.
 */
export { MAX_BENEFIT_LENGTH } from "@/lib/event-field-limits"

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

	// `benefitChips` is the same split the API validates with, so the count on screen and the
	// count the server enforces can never disagree.
	const list = benefitChips(value)
	const isFull = list.length >= MAX_BENEFIT_COUNT

	const addBenefit = () => {
		const v = benefitInput.trim()
		// Guarded here as well as by hiding the input, or the Enter key would walk past the limit.
		if (!v || isFull) return
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
				<Text className={roboto.className} fontSize="sm" color="#9C9C9C">
					(Max {MAX_BENEFIT_LENGTH} chars &middot; {list.length} of {MAX_BENEFIT_COUNT})
				</Text>
			</Flex>
			{/* At the limit the control is REPLACED, not disabled — an Add button that doesn't
			    respond reads as a broken page. A host over the limit (legacy or mobile-written data)
			    still sees every chip below and can remove them. */}
			{isFull ? (
				<Text className={roboto.className} fontSize="sm" color="#9C9C9C" mb={4}>
					You&apos;ve added the maximum of {MAX_BENEFIT_COUNT}. Remove one to add another.
				</Text>
			) : (
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
			)}
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

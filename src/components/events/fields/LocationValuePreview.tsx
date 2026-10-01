import { Text } from "@chakra-ui/react"
import React from "react"

/**
 * A wrapped, read-only echo of what is in the location input.
 *
 * The location field has to stay an `<Input>` — Google's Places Autocomplete binds to an
 * `HTMLInputElement` and will not attach to a textarea, so turning it into one (as Entrance is)
 * would cost the dropdown, `venueName` and the coordinates that `locationWasPicked` reads. But a
 * 48px single-line box holding up to 150 words shows roughly ten of them: a host who pastes an
 * address plus their own map link cannot read back what they just typed, which is where a
 * truncated or duplicated url goes unnoticed.
 *
 * So the input keeps the picker and this line underneath carries the readability. It renders only
 * once the value is long enough to be clipped — echoing a short address under the box it is
 * already fully visible in is noise.
 */

/** Below this the value fits the input on any reasonable form width, so there is nothing to echo. */
const CLIPPED_AT = 70

export default function LocationValuePreview({ value, label = "Full text" }: { value?: string; label?: string }) {
	const text = (value || "").trim()
	if (text.length <= CLIPPED_AT) return null

	return (
		<Text
			fontSize="xs"
			color="gray.400"
			mt={1}
			px={3}
			py={2}
			bg="#090C10"
			border="1px solid #343536"
			borderRadius="6px"
			// A pasted maps.app.goo.gl link is one unbroken token and would otherwise push the
			// box wider than the form.
			whiteSpace="pre-wrap"
			wordBreak="break-word"
		>
			<Text as="span" color="gray.500">
				{label}:{" "}
			</Text>
			{text}
		</Text>
	)
}

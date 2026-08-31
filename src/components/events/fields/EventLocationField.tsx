import React, { useRef } from "react"
import { Input, InputGroup, InputLeftElement } from "@chakra-ui/react"
import { usePlacesWidget } from "react-google-autocomplete"
import { Roboto } from "next/font/google"

import { allowPlacesDropdown, buildPlaceSelection, suppressPlacesDropdown, type PlaceSelection } from "@/lib/google-place"
import { LocationSVG } from "@Jetzy/assets/icons"

const roboto = Roboto({ weight: ["400", "700"], subsets: ["latin"], display: "swap" })

/**
 * The Google Places location input, shared by the manage form and the inline editor on the
 * public event page so the two cannot pick locations differently.
 *
 * Two behaviours here are load-bearing and were bugs before:
 *
 *  - `autoComplete="off"` is required by Google's own docs. Without it the browser's saved-form
 *    dropdown renders on top of the Places one.
 *  - Re-focusing a saved value must NOT fire a fresh `types: ["establishment"]` search, which
 *    returns unrelated businesses on the same street. `lastPicked` remembers the text the last
 *    selection produced, so an untouched field can be told apart from one being edited.
 *
 * `buildPlaceSelection` keeps the venue name the user actually clicked — writing
 * `formatted_address` alone (the old behaviour) discarded it.
 */
export default function EventLocationField({
	value,
	onPick,
	onTextChange,
	placeholder = "Choose Location",
	id = "location",
}: {
	value: string
	/** A real selection from the dropdown: location, venueName and coordinates together. */
	onPick: (picked: PlaceSelection) => void
	/** Free typing, before any selection is made. */
	onTextChange: (text: string) => void
	placeholder?: string
	id?: string
}) {
	const lastPicked = useRef<string>("")

	const { ref: placesRef } = usePlacesWidget({
		apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
		onPlaceSelected: (place) => {
			const picked = buildPlaceSelection(place)
			lastPicked.current = picked.location
			onPick(picked)
		},
		options: {
			fields: ["formatted_address", "geometry", "place_id", "name", "address_components"],
			types: ["establishment"],
		},
	})

	return (
		<InputGroup>
			<InputLeftElement h="48px" pointerEvents="none"><LocationSVG /></InputLeftElement>
			<Input
				ref={placesRef as any}
				id={id}
				value={value}
				placeholder={placeholder}
				// Google's own docs require this; without it the browser's saved-form dropdown
				// renders over the Places one.
				autoComplete="off"
				onFocus={() => {
					// Suppress the stale re-query on an untouched saved value.
					if (value && value === lastPicked.current) suppressPlacesDropdown()
				}}
				onChange={(e) => {
					// The moment they type, they mean to search again.
					allowPlacesDropdown()
					onTextChange(e.target.value)
				}}
				onBlur={() => allowPlacesDropdown()}
				className={roboto.className}
				bg="#090C10"
				color="white"
				fontSize="14px"
				h="48px"
				border="1px solid #343536"
				_focus={{ borderColor: "#343536", boxShadow: "none" }}
				pl="10"
			/>
		</InputGroup>
	)
}

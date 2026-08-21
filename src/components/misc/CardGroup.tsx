import { EventInterface } from "@Jetzy/types"
import React from "react"
import EventListingCard, { EventCardItem } from "@/components/events/EventListingCard"

interface CardGroupProps {
	items: EventInterface[]
}

/**
 * Dashboard event grid.
 *
 * Renders the same card as the public listing (`EventListingCard`). It used to be a separate
 * Tailwind card with its own image treatment, stats layout and Edit button, so an admin saw
 * two different cards for the same event depending which page they were on, and every change
 * had to be made twice.
 */
const CardGroup: React.FC<CardGroupProps> = ({ items }) => {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
			{items?.map((item) => (
				<EventListingCard key={item?._id.toString()} event={item as unknown as EventCardItem} />
			))}
		</div>
	)
}

export default CardGroup

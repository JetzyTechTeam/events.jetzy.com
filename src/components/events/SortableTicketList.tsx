import React from "react"
import { Box, Flex } from "@chakra-ui/react"
import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
	TouchSensor,
	closestCenter,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core"
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

/**
 * Drag-to-reorder for the ticket list on the create and manage event forms.
 *
 * The ORDER IS THE DATA. `event.tickets` is a Mongoose sub-document array, so Mongo preserves
 * its order, `api/events/[eventId]/update.ts` writes it back in exactly the order the payload
 * arrived, and both the public event page and the console tickets page render it unsorted.
 * Nothing anywhere sorts tickets. So this component doesn't persist anything of its own — it
 * just lets the host change the array, and everything downstream already follows.
 *
 * Only the MECHANISM lives here, not the card. The two forms render nearly identical ticket
 * cards, but manage adds sold / collected / on-hold badges that create has no data for. Sharing
 * the card would mean one component branching on which page it's on; sharing the drag wrapper
 * shares exactly the part that would otherwise drift.
 */

type SortableTicketListProps = {
	/** Stable, unique ids in current display order. `ticket.id` in both forms. */
	items: string[]
	/** Formik `FieldArray`'s `move` — the reorder is ordinary form state, so autosave follows. */
	onReorder: (from: number, to: number) => void
	children: React.ReactNode
}

export const SortableTicketList: React.FC<SortableTicketListProps> = ({ items, onReorder, children }) => {
	const sensors = useSensors(
		// 8px of travel before a drag starts, so a click on Edit or Delete inside the card
		// isn't swallowed as a drag.
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		// Press and hold on touch. Without a delay, dragging competes with page scroll on a
		// phone and neither one works reliably.
		useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	)

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event
		if (!over || active.id === over.id) return

		const from = items.indexOf(String(active.id))
		const to = items.indexOf(String(over.id))
		// -1 means the id vanished mid-drag (a concurrent delete). Reordering against a stale
		// index would move the wrong ticket, so do nothing.
		if (from === -1 || to === -1) return

		onReorder(from, to)
	}

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragEnd={handleDragEnd}
			modifiers={[restrictToVerticalAxis, restrictToParentElement]}
		>
			<SortableContext items={items} strategy={verticalListSortingStrategy}>
				{children}
			</SortableContext>
		</DndContext>
	)
}

type SortableTicketItemProps = {
	id: string
	children: React.ReactNode
}

/**
 * One draggable row. The handle is a dedicated grip rather than the whole card, so the Edit and
 * Delete menu inside it stays clickable and text stays selectable.
 */
export const SortableTicketItem: React.FC<SortableTicketItemProps> = ({ id, children }) => {
	const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })

	return (
		<Box
			ref={setNodeRef}
			position="relative"
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
				// Lifted card sits above its neighbours while it moves.
				zIndex: isDragging ? 10 : undefined,
				opacity: isDragging ? 0.85 : 1,
			}}
		>
			<Flex
				ref={setActivatorNodeRef}
				{...attributes}
				{...listeners}
				aria-label="Reorder ticket"
				position="absolute"
				// Sits opposite the card's own top-right actions menu.
				top="4"
				left="2"
				zIndex={2}
				align="center"
				justify="center"
				w="6"
				h="8"
				color="#868686"
				cursor={isDragging ? "grabbing" : "grab"}
				_hover={{ color: "white" }}
				// `touch-none` stops the browser claiming the gesture as a scroll once the
				// press-and-hold has started a drag.
				sx={{ touchAction: "none" }}
			>
				<GripIcon />
			</Flex>
			{children}
		</Box>
	)
}

const GripIcon = () => (
	<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
		<circle cx="2" cy="2" r="1.5" />
		<circle cx="8" cy="2" r="1.5" />
		<circle cx="2" cy="8" r="1.5" />
		<circle cx="8" cy="8" r="1.5" />
		<circle cx="2" cy="14" r="1.5" />
		<circle cx="8" cy="14" r="1.5" />
	</svg>
)

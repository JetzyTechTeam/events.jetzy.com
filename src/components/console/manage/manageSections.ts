import type { ComponentType, SVGProps } from "react"
import {
	PencilSquareIcon,
	UsersIcon,
	TagIcon,
	QuestionMarkCircleIcon,
	ClipboardDocumentListIcon,
	MegaphoneIcon,
	CheckBadgeIcon,
	PhotoIcon,
} from "@heroicons/react/24/outline"

export type ManageSectionKey =
	| "overview"
	| "guests"
	| "referralCodes"
	| "customQuestions"
	| "responses"
	| "blasts"
	| "approvals"
	| "photoRequests"

export interface ManageSection {
	key: ManageSectionKey
	label: string
	icon: ComponentType<SVGProps<SVGSVGElement>>
	/** The Chakra `Tabs` index this section's panel sits at. */
	index: number
}

/**
 * The Manage Event sections, in TAB ORDER. The desktop `TabList` and the mobile section
 * switcher both render from this list, so the two can never disagree about which index opens
 * which panel — and the `TabPanels` in manage.tsx must keep the same order.
 *
 * Approvals is conditional and sits BEFORE Photo Requests, so its presence shifts Photo
 * Requests from 6 to 7. That is why indices are assigned here, by position, and never written
 * down anywhere else.
 */
export function buildManageSections(hasApprovalTickets: boolean): ManageSection[] {
	const ordered: Array<Omit<ManageSection, "index"> | null> = [
		{ key: "overview", label: "Overview", icon: PencilSquareIcon },
		{ key: "guests", label: "Guests", icon: UsersIcon },
		{ key: "referralCodes", label: "Referral Codes", icon: TagIcon },
		{ key: "customQuestions", label: "Custom Questions", icon: QuestionMarkCircleIcon },
		{ key: "responses", label: "Responses", icon: ClipboardDocumentListIcon },
		{ key: "blasts", label: "Blasts", icon: MegaphoneIcon },
		hasApprovalTickets ? { key: "approvals", label: "Approvals", icon: CheckBadgeIcon } : null,
		{ key: "photoRequests", label: "Photo Requests", icon: PhotoIcon },
	]
	return ordered
		.filter((s): s is Omit<ManageSection, "index"> => s !== null)
		.map((s, index) => ({ ...s, index }))
}

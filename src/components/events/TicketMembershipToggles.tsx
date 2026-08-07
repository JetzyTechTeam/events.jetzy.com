import React from "react"
import { Box, Checkbox, Flex, FormControl, FormLabel, Text } from "@chakra-ui/react"
import { MEMBERSHIPS, MEMBERSHIP_KEYS, type MembershipKey } from "@/lib/memberships"
import { bundleApprovalNotice, bundleFreeTicketMessage } from "@/lib/premium-bundle"

/**
 * "Which memberships does this ticket sell?" — the host-side control.
 *
 * One shared component because the create form and the manage form had already been kept in
 * sync by hand once, and this is now a set rather than a single switch. Two copies of a
 * checkbox group that decides what a buyer's card is charged is exactly the kind of drift
 * that ends up selling a membership on one form and not the other.
 *
 * Checkboxes, not a switch: either, both or neither is valid.
 */

type Props = {
	value: MembershipKey[]
	onChange: (next: MembershipKey[]) => void
	/** Resolved per-ticket approval flag — changes what the buyer is told, not what is sold. */
	requiresApproval: boolean
	/** The ticket's price. A membership can't be started off a free registration. */
	price: number
}

const TicketMembershipToggles: React.FC<Props> = ({ value, onChange, requiresApproval, price }) => {
	const selected = value || []
	const toggle = (key: MembershipKey, checked: boolean) =>
		// Rebuilt from MEMBERSHIP_KEYS so the stored order is always canonical, whatever order
		// the host ticked them in.
		onChange(MEMBERSHIP_KEYS.filter((k) => (k === key ? checked : selected.includes(k))))

	return (
		<FormControl mb={4}>
			<Box>
				<FormLabel mb={0}>For premium members only</FormLabel>
				<Text fontSize="12px" color="#868686" mt={1} maxW="320px" lineHeight="140%">
					Non-members pay this ticket price + Jetzy Premium subscription (renews monthly). Existing members
					pay the ticket price only.
				</Text>
				{/* Persistent guidance, deliberately separate from the red validation error below:
				    one tells the host the rule up front, the other fires when they've broken it. */}
				<Text fontSize="12px" color="#868686" mt={2} maxW="320px" lineHeight="140%">
					Note: Tickets including Jetzy Premium must have a price. Free tickets cannot initiate premium
					subscriptions.
				</Text>
			</Box>

			<Flex direction="column" gap={2} mt={3}>
				{MEMBERSHIP_KEYS.map((key) => (
					<Checkbox
						key={key}
						colorScheme="yellow"
						isChecked={selected.includes(key)}
						onChange={(e) => toggle(key, e.target.checked)}
					>
						<Text fontSize="14px">{MEMBERSHIPS[key].label}</Text>
					</Checkbox>
				))}
			</Flex>

			{selected.length > 0 && requiresApproval && (
				<Text fontSize="12px" color="#F5C518" mt={2} maxW="320px" lineHeight="140%">
					{bundleApprovalNotice(selected)}
				</Text>
			)}

			{selected.length > 0 && !(Number(price) > 0) && (
				<Text fontSize="12px" color="#FC8181" mt={2} maxW="320px" lineHeight="140%">
					{bundleFreeTicketMessage(selected)}
				</Text>
			)}
		</FormControl>
	)
}

export default TicketMembershipToggles

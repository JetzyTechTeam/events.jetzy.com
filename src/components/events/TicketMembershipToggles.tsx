import React from "react"
import { Box, Checkbox, Flex, FormControl, FormLabel, Text } from "@chakra-ui/react"
import { HOST_SELECTABLE_MEMBERSHIP_KEYS, MEMBERSHIPS, MEMBERSHIP_KEYS, type MembershipKey } from "@/lib/memberships"
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
	/** Billing interval sold with this ticket. Undefined means monthly. */
	interval?: string
	onIntervalChange?: (next: string) => void
}

const TicketMembershipToggles: React.FC<Props> = ({ value, onChange, requiresApproval, price, interval, onIntervalChange }) => {
	const chosenInterval = interval === "year" ? "year" : "month"
	// Only Jetzy Premium has an annual price; Full Concierge is monthly only, and a ticket set
	// to annual resolves it at its own default. So the choice is only meaningful — and only
	// offered — when Premium is on the ticket.
	const showInterval = !!onIntervalChange && (value || []).includes("premium")
	const selected = value || []
	const toggle = (key: MembershipKey, checked: boolean) =>
		// Rebuilt from MEMBERSHIP_KEYS — not from the visible list — so the stored order is
		// canonical AND a membership that is currently withheld from new tickets is preserved
		// rather than silently stripped the next time the host edits an existing one.
		onChange(MEMBERSHIP_KEYS.filter((k) => (k === key ? checked : selected.includes(k))))

	// Anything already on this ticket stays visible even while withheld, so its state is never
	// hidden from the host — they can still see it and still turn it off.
	const visibleKeys = MEMBERSHIP_KEYS.filter((key) => HOST_SELECTABLE_MEMBERSHIP_KEYS.includes(key) || selected.includes(key))

	// Nothing to offer and nothing already set — render nothing rather than an empty control.
	if (visibleKeys.length === 0) return null

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
				{visibleKeys.map((key) => (
					<Checkbox
						key={key}
						colorScheme="yellow"
						isChecked={selected.includes(key)}
						onChange={(e) => toggle(key, e.target.checked)}
					>
						<Text fontSize="14px">
							{MEMBERSHIPS[key].label}
							{!HOST_SELECTABLE_MEMBERSHIP_KEYS.includes(key) && (
								<Text as="span" fontSize="12px" color="#868686" ml={2}>
									(already on this ticket — not yet available for new tickets)
								</Text>
							)}
						</Text>
					</Checkbox>
				))}
			</Flex>

			{showInterval && (
				<Box mt={3}>
					<FormLabel mb={1} fontSize="13px">Billed</FormLabel>
					<Flex gap={2}>
						{(["month", "year"] as const).map((option) => (
							<Box
								key={option}
								as="button"
								type="button"
								onClick={() => onIntervalChange?.(option)}
								px={3}
								py={1.5}
								borderRadius="8px"
								border="2px solid"
								borderColor={chosenInterval === option ? "#F5C518" : "#343536"}
								bg={chosenInterval === option ? "rgba(245,197,24,0.12)" : "transparent"}
								color="white"
								fontSize="13px"
								fontWeight={600}
							>
								{option === "month" ? "Monthly" : "Annual"}
							</Box>
						))}
					</Flex>
					{/* An annual bundle is a much larger authorization than a monthly one, and on an
					    approval ticket it is HELD on the card for up to 7 days before anyone decides.
					    The host is choosing that, so say it here rather than letting them discover it
					    from a buyer's complaint. */}
					{chosenInterval === "year" && (
						<Text fontSize="12px" color="#F5C518" mt={2} maxW="320px" lineHeight="140%">
							The buyer pays this ticket plus a full year of Jetzy Premium up front
							{requiresApproval ? ", authorized on their card while the request is pending" : ""}.
						</Text>
					)}
				</Box>
			)}

			{selected.length > 0 && requiresApproval && (
				<Text fontSize="12px" color="#F5C518" mt={2} maxW="320px" lineHeight="140%">
					{bundleApprovalNotice(selected, chosenInterval)}
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

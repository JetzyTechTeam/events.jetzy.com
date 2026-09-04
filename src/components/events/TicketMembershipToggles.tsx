import React from "react"
import { Box, Checkbox, Flex, FormControl, FormLabel, Input, Text } from "@chakra-ui/react"
import { MEMBERSHIPS, MEMBERSHIP_KEYS, membershipLabelList, type MembershipKey } from "@/lib/memberships"
import {
	MAX_MEMBERSHIP_FREE_MONTHS,
	bundleApprovalNotice,
	bundleFreeTicketNotice,
	bundleFreeTrialTicketNotice,
	freeMonthsLabel,
} from "@/lib/premium-bundle"
import { blurOnWheel } from "@/lib/number-input"

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
	/** Free months given with no code typed. Undefined/0 means none. */
	freeMonths?: number
	onFreeMonthsChange?: (next: number) => void
}

const TicketMembershipToggles: React.FC<Props> = ({
	value,
	onChange,
	requiresApproval,
	price,
	interval,
	onIntervalChange,
	freeMonths,
	onFreeMonthsChange,
}) => {
	const chosenInterval = interval === "year" ? "year" : "month"
	// Only Jetzy Premium has an annual price; Full Concierge is monthly only, and a ticket set
	// to annual resolves it at its own default. So the choice is only meaningful — and only
	// offered — when Premium is on the ticket.
	const showInterval = !!onIntervalChange && (value || []).includes("premium")
	const selected = value || []
	const chosenFreeMonths = Math.min(Math.max(Math.floor(Number(freeMonths) || 0), 0), MAX_MEMBERSHIP_FREE_MONTHS)
	const showFreeMonths = !!onFreeMonthsChange && selected.length > 0
	const toggle = (key: MembershipKey, checked: boolean) =>
		// Rebuilt from MEMBERSHIP_KEYS rather than from the ticked order, so what is stored is
		// always canonical whichever order the host clicked them in.
		onChange(MEMBERSHIP_KEYS.filter((k) => (k === key ? checked : selected.includes(k))))

	// Name what the ticket actually sells. Two products can be on one ticket, so this sentence
	// cannot say "Jetzy Premium" — a Concierge ticket described as selling Premium is a
	// misstatement to the host about what their buyers' cards will be charged for. With nothing
	// ticked yet there is no product to name, so it describes the control instead.
	const sellingLabel = membershipLabelList(selected) || "the membership"

	return (
		<FormControl mb={4}>
			<Box>
				<FormLabel mb={0}>Include a membership with this ticket</FormLabel>
				<Text fontSize="12px" color="#868686" mt={1} maxW="320px" lineHeight="140%">
					Non-members pay this ticket price + {sellingLabel}, which then renews until cancelled. Existing
					members pay the ticket price only.
				</Text>
				{/* A free ticket is allowed here. The membership is charged in its own right, so a
				    $0 ticket simply means the non-member pays for the membership alone. The specific
				    consequence is spelled out below, only once the price is actually 0. */}
				<Text fontSize="12px" color="#868686" mt={2} maxW="320px" lineHeight="140%">
					Note: The ticket may be free. Non-members are still taken to checkout to pay for the
					membership.
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
						<Text fontSize="14px">
							{MEMBERSHIPS[key].label}
							{/* Only Premium is sold at two intervals. Said here because the Billed
							    control below appears whenever Premium is ticked, and a host who has
							    both on one ticket would otherwise read "Annual" as applying to both. */}
							{key === "concierge" && (
								<Text as="span" fontSize="12px" color="#868686" ml={2}>
									(billed monthly)
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
							The buyer pays this ticket plus a full year of {MEMBERSHIPS.premium.label} up front
							{/* Annual applies to Premium alone. If Concierge is on the same ticket the
							    buyer is also charged its first month, and leaving that out understates
							    what is taken — or held — at checkout. */}
							{selected.includes("concierge") ? `, plus the first month of ${MEMBERSHIPS.concierge.label}` : ""}
							{requiresApproval ? ", authorized on their card while the request is pending" : ""}.
						</Text>
					)}
				</Box>
			)}

			{/* Free months given to EVERY buyer of this ticket, with no code typed. The other
			    source of the same gift is a referral code, and the larger of the two wins — said
			    here so a host running both doesn't expect them to add up. */}
			{showFreeMonths && (
				<Box mt={3}>
					<FormLabel mb={1} fontSize="13px">
						Free months included
					</FormLabel>
					<Input
						type="number"
						min={0}
						max={MAX_MEMBERSHIP_FREE_MONTHS}
						step={1}
						// Same guard the price and capacity inputs use: a scroll over a focused
						// number field silently changes it, and here that changes what buyers pay.
						onWheel={blurOnWheel}
						value={chosenFreeMonths === 0 ? "" : String(chosenFreeMonths)}
						placeholder="0"
						maxW="120px"
						bg="#1C1E21"
						borderColor="#343536"
						color="white"
						onChange={(e) => {
							const next = Math.floor(Number(e.target.value))
							onFreeMonthsChange?.(Number.isFinite(next) && next > 0 ? Math.min(next, MAX_MEMBERSHIP_FREE_MONTHS) : 0)
						}}
					/>
					<Text fontSize="12px" color="#868686" mt={2} maxW="320px" lineHeight="140%">
						{chosenFreeMonths > 0
							? `Every buyer gets ${freeMonthsLabel(chosenFreeMonths)} of ${sellingLabel} free — no code needed — then it renews at the normal rate. A referral code that also gives free months doesn't add to this; whichever offer is larger applies.`
							: `Leave blank to charge for ${sellingLabel} from the start.`}
					</Text>
				</Box>
			)}

			{selected.length > 0 && requiresApproval && (
				<Text fontSize="12px" color="#F5C518" mt={2} maxW="320px" lineHeight="140%">
					{bundleApprovalNotice(selected, chosenInterval)}
				</Text>
			)}

			{/* Informational, not an error — a $0 bundled ticket saves and sells fine. It says what
			    that combination actually does, because "free ticket" and "charged for a membership"
			    read as a contradiction until you know the membership is the thing being sold. */}
			{selected.length > 0 && !(Number(price) > 0) && (
				<Text fontSize="12px" color="#F5C518" mt={2} maxW="320px" lineHeight="140%">
					{/* With free months on a $0 ticket nothing is charged at checkout at all, so
					    "non-members will be charged for the membership only" would be false. The
					    buyer is still sent to Stripe — for a card, not for money. */}
					{chosenFreeMonths > 0 ? bundleFreeTrialTicketNotice(selected, chosenFreeMonths) : bundleFreeTicketNotice(selected)}
				</Text>
			)}
		</FormControl>
	)
}

export default TicketMembershipToggles

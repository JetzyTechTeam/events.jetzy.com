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
import { planPriceForInterval, useMembershipPlans } from "@/hooks/usePremiumPlan"

/**
 * "Which memberships does this ticket sell, and how is each billed?" — the host-side control.
 *
 * One shared component (rendered only by `TicketEditorModal`, which every ticket form uses), so
 * the rules that decide what a buyer's card is charged exist once.
 *
 * Checkboxes, not a switch: either, both or neither is valid.
 *
 * BILLING SITS INSIDE EACH MEMBERSHIP'S OWN ROW. A ticket carries ONE `membershipInterval`, but
 * not every membership is sold at every interval: checkout resolves each membership with
 * `findMembershipPriceForInterval(key, interval) || getMembershipPrice(key)`, so a ticket set to
 * annual still bills a monthly-only membership (Full Concierge today) monthly. A single
 * "Billed: Monthly / Annual" control under both checkboxes read as applying to both, and hosts
 * believed they were selling annual Concierge. Now the choice appears only on a membership that
 * actually offers it, and a monthly-only one says so in its own row.
 *
 * Which intervals a membership offers comes from its LIVE prices (`useMembershipPlans`), not from
 * a hardcoded "Premium only": when another membership gets an annual price, the option appears
 * for it without a code change. Displayed amounts go through `planPriceForInterval`, the same
 * resolver the buyer's checkout disclosure uses, so the host and the buyer see one figure.
 */

type Props = {
	value: MembershipKey[]
	/**
	 * `patch.interval` rides on the same call when ticking or unticking changes what the interval
	 * may be. Two separate callbacks would each spread the caller's stale ticket, and the second
	 * write would undo the first.
	 */
	onChange: (next: MembershipKey[], patch?: { interval?: string }) => void
	/** Resolved per-ticket approval flag — changes what the buyer is told, not what is sold. */
	requiresApproval: boolean
	/** The ticket's price. */
	price: number
	/** Billing interval sold with this ticket. Undefined means monthly. */
	interval?: string
	onIntervalChange?: (next: string) => void
	/** Free months given with no code typed. Undefined/0 means none. */
	freeMonths?: number
	onFreeMonthsChange?: (next: number) => void
}

const money = (n: number) =>
	n.toLocaleString("en-US", { style: "currency", currency: "usd", minimumFractionDigits: Number.isInteger(n) ? 0 : 2 })

const ALL_KEYS = [...MEMBERSHIP_KEYS] as MembershipKey[]

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
	const selected = value || []
	const chosenFreeMonths = Math.min(Math.max(Math.floor(Number(freeMonths) || 0), 0), MAX_MEMBERSHIP_FREE_MONTHS)
	const showFreeMonths = !!onFreeMonthsChange && selected.length > 0

	const { plans, isLoading: plansLoading } = useMembershipPlans(ALL_KEYS)
	const planOf = (key: MembershipKey) => plans[ALL_KEYS.indexOf(key)]
	/** True / false once the price is known; `null` while loading or when it couldn't be read. */
	const offersAnnual = (key: MembershipKey): boolean | null => {
		const plan = planOf(key)
		if (!plan || (plan.amount == null && !(plan.prices || []).length)) return null
		return (plan.prices || []).some((p) => p.interval === "year") || plan.interval === "year"
	}
	/** What checkout will bill this membership at, given the ticket's interval — the server's own fallback. */
	const resolvedFor = (key: MembershipKey) => {
		const plan = planOf(key)
		const known = offersAnnual(key)
		// Unknown price: assume the ticket's setting, which is what the server tries first.
		if (!plan || known === null) return { interval: chosenInterval, amount: null as number | null, label: null as string | null }
		return planPriceForInterval(plan, chosenInterval)
	}

	const toggle = (key: MembershipKey, checked: boolean) => {
		// Rebuilt from MEMBERSHIP_KEYS rather than from the ticked order, so what is stored is
		// always canonical whichever order the host clicked them in.
		const next = ALL_KEYS.filter((k) => (k === key ? checked : selected.includes(k)))
		// Annual chosen, and nothing left on the ticket can be billed annually → back to monthly,
		// so a stale "year" doesn't sit on a ticket that can't use it. Only when every remaining
		// price is KNOWN to be monthly-only; an unread price changes nothing.
		const nothingAnnualLeft = next.every((k) => offersAnnual(k) === false)
		onChange(next, chosenInterval === "year" && nothingAnnualLeft ? { interval: "month" } : undefined)
	}

	// Name what the ticket actually sells. Two products can be on one ticket, so this sentence
	// cannot say "Jetzy Premium". With nothing ticked there is no product to name.
	const sellingLabel = membershipLabelList(selected) || "the membership"

	// Per-membership billing, resolved — for the summary line, the approval notice and the
	// checkout box. Mixed only when two memberships really are billed differently.
	const resolvedIntervals = Object.fromEntries(selected.map((key) => [key, resolvedFor(key).interval])) as Partial<
		Record<MembershipKey, string>
	>
	const billedDifferently = selected.length > 1 && new Set(Object.values(resolvedIntervals)).size > 1

	// "What a non-member pays at checkout". Every figure from the plan, never written down; if
	// any membership's price is unknown the total is left out rather than understated.
	const lines = selected.map((key) => {
		const resolved = resolvedFor(key)
		return { key, ...resolved }
	})
	const allPricesKnown = lines.every((line) => line.amount != null)
	const ticketPrice = Number(price) > 0 ? Number(price) : 0
	const dueToday = allPricesKnown
		? ticketPrice + (chosenFreeMonths > 0 ? 0 : lines.reduce((sum, line) => sum + (line.amount || 0), 0))
		: null

	const segment = (option: "month" | "year", key: MembershipKey) => {
		const plan = planOf(key)
		const label = plan ? planPriceForInterval(plan, option).label : null
		const active = chosenInterval === option
		return (
			<Box
				key={option}
				as="button"
				type="button"
				onClick={() => onIntervalChange?.(option)}
				flex={{ md: "0 0 auto" }}
				px={3}
				py={2}
				borderRadius="8px"
				border="2px solid"
				borderColor={active ? "#F5C518" : "#343536"}
				bg={active ? "rgba(245,197,24,0.12)" : "transparent"}
				color="white"
				textAlign="left"
				sx={{ "@media screen and (max-width: 47.99em)": { flex: "1 1 0", minHeight: "48px" } }}
			>
				<Text fontSize="13px" fontWeight={700}>
					{option === "month" ? "Monthly" : "Annual"}
				</Text>
				{/* The amount, never a placeholder — absent until the real figure is known. */}
				{label && (
					<Text fontSize="12px" color="#B5B6B7">
						{label}
					</Text>
				)}
			</Box>
		)
	}

	const billingFor = (key: MembershipKey) => {
		if (plansLoading) {
			return (
				<Text fontSize="12px" color="#9C9C9C">
					Loading prices…
				</Text>
			)
		}
		const annual = offersAnnual(key)
		// Offers annual — or the price couldn't be read, in which case the choice stays available
		// (without amounts) rather than hiding a setting the ticket may already carry.
		if (annual !== false && onIntervalChange) {
			const otherMonthlyOnly = selected.filter((k) => k !== key && offersAnnual(k) === false)
			return (
				<Box>
					<Text fontSize="12px" color="#9C9C9C" mb={1.5}>
						Billing
					</Text>
					<Flex gap={2}>{(["month", "year"] as const).map((option) => segment(option, key))}</Flex>
					{chosenInterval === "year" && (
						<Text fontSize="12px" color="#F5C518" mt={2} lineHeight="140%">
							A full year of {MEMBERSHIPS[key].label} is charged up front
							{requiresApproval ? ", authorized on the card while the request is pending" : ""}.
							{otherMonthlyOnly.length > 0 ? ` This applies to ${MEMBERSHIPS[key].label} only — ${membershipLabelList(otherMonthlyOnly)} stays monthly.` : ""}
						</Text>
					)}
				</Box>
			)
		}
		const monthly = planOf(key) ? planPriceForInterval(planOf(key)!, "month") : null
		return (
			<Box>
				<Box
					as="span"
					display="inline-block"
					px={2.5}
					py={1}
					borderRadius="full"
					border="1px solid #343536"
					bg="#090C10"
					fontSize="12px"
					fontWeight={600}
				>
					Monthly only{monthly?.label ? ` · ${monthly.label}` : ""}
				</Box>
				<Text fontSize="12px" color="#9C9C9C" mt={1.5} lineHeight="140%">
					Annual billing isn&apos;t offered for this membership
					{chosenInterval === "year" && selected.some((k) => offersAnnual(k)) ? ", so it stays monthly even though the ticket is set to annual" : ""}.
				</Text>
			</Box>
		)
	}

	return (
		<FormControl>
			<Text fontSize="12px" color="#868686" lineHeight="140%">
				Non-members pay this ticket price plus {sellingLabel}, which then renews until cancelled. Members who already hold it pay
				the ticket price only. The ticket itself may be free — non-members are still taken to checkout for the membership.
			</Text>

			<Flex direction="column" gap={2} mt={3}>
				{ALL_KEYS.map((key) => {
					const checked = selected.includes(key)
					const plan = planOf(key)
					// Every interval on sale, for the row's at-a-glance price.
					const priceSummary = (plan?.prices || []).length
						? (plan!.prices || []).map((p) => p.label).filter(Boolean).join(" · ")
						: plan?.label || ""
					return (
						<Box
							key={key}
							borderRadius="10px"
							border="1px solid"
							borderColor={checked ? "rgba(245,197,24,0.55)" : "#343536"}
							bg={checked ? "rgba(245,197,24,0.06)" : "#15181C"}
							px={3}
							py={2.5}
						>
							<Flex align="center" justify="space-between" gap={3} wrap="wrap">
								<Checkbox
									colorScheme="yellow"
									isChecked={checked}
									onChange={(e) => toggle(key, e.target.checked)}
									// Phones only: a taller row, so the box is not a 16px target.
									sx={{ "@media screen and (max-width: 47.99em)": { paddingTop: "6px", paddingBottom: "6px" } }}
								>
									<Text fontSize="14px" fontWeight={600}>
										{MEMBERSHIPS[key].label}
									</Text>
								</Checkbox>
								{priceSummary && (
									<Text fontSize="12px" color="#9C9C9C">
										{priceSummary}
									</Text>
								)}
							</Flex>
							{checked && (
								<Box mt={2.5} pl={{ base: 0, md: 6 }}>
									{billingFor(key)}
								</Box>
							)}
						</Box>
					)
				})}
			</Flex>

			{/* Two memberships billed differently, said in one line — the thing hosts got wrong. */}
			{billedDifferently && (
				<Text fontSize="12px" color="#F5C518" mt={2} lineHeight="140%">
					Billing:{" "}
					{selected.map((key) => `${MEMBERSHIPS[key].label} ${resolvedIntervals[key] === "year" ? "yearly" : "monthly"}`).join(" · ")}.
				</Text>
			)}

			{/* Free months given to EVERY buyer of this ticket, with no code typed. The other
			    source of the same gift is a referral code, and the larger of the two wins — said
			    here so a host running both doesn't expect them to add up. */}
			{showFreeMonths && (
				<Box mt={4}>
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
						bg="#090C10"
						borderColor="#444"
						color="white"
						sx={{ "@media screen and (max-width: 47.99em)": { height: "48px" } }}
						onChange={(e) => {
							const next = Math.floor(Number(e.target.value))
							onFreeMonthsChange?.(Number.isFinite(next) && next > 0 ? Math.min(next, MAX_MEMBERSHIP_FREE_MONTHS) : 0)
						}}
					/>
					<Text fontSize="12px" color="#868686" mt={2} lineHeight="140%">
						{chosenFreeMonths > 0
							? `Every buyer gets ${freeMonthsLabel(chosenFreeMonths)} of ${sellingLabel} free — no code needed — then it renews at the normal rate. A referral code that also gives free months doesn't add to this; whichever offer is larger applies.`
							: `Leave blank to charge for ${sellingLabel} from the start.`}
					</Text>
				</Box>
			)}

			{/* What a non-member is actually charged — the same resolver as the buyer's disclosure. */}
			{selected.length > 0 && !plansLoading && (
				<Box mt={4} bg="#090C10" border="1px solid #343536" borderRadius="10px" p={3}>
					<Text fontSize="11px" color="#9C9C9C" fontWeight={700} textTransform="uppercase" letterSpacing="0.04em" mb={2}>
						What a non-member pays at checkout
					</Text>
					<Flex justify="space-between" gap={3} fontSize="13px" py={0.5}>
						<Text color="#D6D6D6">Ticket</Text>
						<Text>{ticketPrice > 0 ? money(ticketPrice) : "Free"}</Text>
					</Flex>
					{lines.map((line) => (
						<Flex key={line.key} justify="space-between" gap={3} fontSize="13px" py={0.5}>
							<Text color="#D6D6D6">
								{MEMBERSHIPS[line.key].label}{" "}
								<Text as="span" color="#9C9C9C">
									({chosenFreeMonths > 0 ? `${freeMonthsLabel(chosenFreeMonths)} free` : `first ${line.interval === "year" ? "year" : "month"}`})
								</Text>
							</Text>
							<Text textAlign="right">
								{chosenFreeMonths > 0
									? `$0, then ${line.label || "the normal rate"}`
									: line.amount != null
										? money(line.amount)
										: "—"}
							</Text>
						</Flex>
					))}
					{dueToday != null && (
						<Flex justify="space-between" gap={3} fontSize="13px" fontWeight={700} pt={2} mt={1} borderTop="1px solid #343536">
							<Text>{requiresApproval ? "Held on the card at checkout" : "Due at checkout"}</Text>
							<Text color="#F5C518">{money(dueToday)}</Text>
						</Flex>
					)}
					<Text fontSize="12px" color="#9C9C9C" mt={2} lineHeight="140%">
						Then {selected.map((key) => `${MEMBERSHIPS[key].label} renews ${resolvedFor(key).label ? `at ${resolvedFor(key).label}` : resolvedIntervals[key] === "year" ? "yearly" : "monthly"}`).join("; ")} until cancelled.
					</Text>
				</Box>
			)}

			{selected.length > 0 && requiresApproval && (
				<Text fontSize="12px" color="#F5C518" mt={3} lineHeight="140%">
					{bundleApprovalNotice(selected, resolvedIntervals)}
				</Text>
			)}

			{/* Informational, not an error — a $0 bundled ticket saves and sells fine. It says what
			    that combination actually does, because "free ticket" and "charged for a membership"
			    read as a contradiction until you know the membership is the thing being sold. */}
			{selected.length > 0 && !(Number(price) > 0) && (
				<Text fontSize="12px" color="#F5C518" mt={2} lineHeight="140%">
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

import React from "react"
import { CheckIcon } from "@heroicons/react/24/solid"
import Spinner from "@/components/misc/Spinner"
import { trialEndsOn } from "@/lib/invite-trial"

/**
 * What Jetzy Premium gets you.
 *
 * Defined HERE rather than in the paywall modal, which is the only thing that imports this
 * component — putting it there and importing it back would be a circular dependency.
 */
export const PREMIUM_BENEFITS = [
	"Access to invite-only events and experiences",
	"Curated networking with fellow members",
	"Personalized match recommendations",
	"Member-only pricing and exclusive discounts",
	"The ability to host Premium Events with other members",
]

/**
 * The Basic-vs-Premium plan cards.
 *
 * ONE component, rendered by both `/subscribe` and the paywall modal. They used to be
 * different things entirely — a full-page comparison on one, a bullet list on the other — so
 * what a buyer saw depended on which door they came through, and the two drifted the moment
 * either was edited. The benefits list had already diverged once for exactly that reason.
 *
 * Presentational only. Both callers already fetch the plan and own their subscribe mutation,
 * so this takes them as props rather than fetching anything itself; that also keeps the modal
 * from firing a second request for a price the page has already loaded.
 */

export type PlanInfo = {
	name?: string
	unitAmount?: number | null
	currency?: string
	interval?: string
}

/** One billing interval the membership is sold at. */
export type PlanPriceOption = {
	id: string
	interval: string
	/** Formatted, e.g. "$200/year". Null while unknown — never a placeholder. */
	label: string | null
	amount: number | null
}

/** "Monthly" / "Annual" for the toggle; anything unrecognised falls back to the raw interval. */
const INTERVAL_LABELS: Record<string, string> = { month: "Monthly", year: "Annual", week: "Weekly", day: "Daily" }

/** "Month" / "Year" — the pills read "$20/Month", matching selectmember.jetzy.com's card. */
const PERIOD_LABELS: Record<string, string> = { month: "Month", year: "Year" }

/** "$200" out of "$200/year" — the toggle shows the period on its own line. */
const amountOnly = (label: string | null) => (label ? label.split("/")[0] : null)

/**
 * The struck-through "was" figure is MARKETING COPY, not a price anyone was ever charged.
 *
 * $400/yr and $40/mo are simply twice the real amounts. It exists because
 * selectmember.jetzy.com's card shows it and the CEO asked for the two to match; nothing in
 * Stripe backs it, and no member has ever been billed at that rate. Kept as one constant, said
 * plainly, so it can be changed or removed in a single edit rather than hunted through JSX.
 */
export const COMPARE_AT_MULTIPLIER = 2
const DISCOUNT_BADGE = "50% Off"

/** Whole dollars drop the cents, matching `priceLabel` in `usePremiumPlan`. */
const money = (dollars: number | null): string | null =>
	dollars == null
		? null
		: dollars.toLocaleString("en-US", {
				style: "currency",
				currency: "usd",
				minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
		  })

/**
 * "US$20" — the trial panel's wording, verbatim from the copy the CEO supplied.
 *
 * The currency is spelled out there and nowhere else on this card, so it is a formatter of its
 * own rather than a change to `money`, which every other price on the page goes through.
 */
const usd = (dollars: number | null): string | null => {
	const formatted = money(dollars)
	return formatted == null ? null : `US${formatted}`
}

/**
 * How many months of the monthly rate the annual price gives away.
 *
 * $200/year against $20/month is twelve months for the price of ten, so: two. Derived rather
 * than written down — a hardcoded "2 months free" is a claim about Stripe's prices that stops
 * being true the moment either one moves. Returns 0 when it can't be computed, and every caller
 * drops the sentence rather than half-writing it.
 */
const monthsFreeOnAnnual = (monthly: number | null | undefined, annual: number | null | undefined): number =>
	monthly && annual != null ? Math.max(0, Math.round((monthly * 12 - annual) / monthly)) : 0

/** "Sep 18, 2026" — the renewal date, in the member state. */
const renewalDate = (value?: string | null): string | null => {
	if (!value) return null
	const date = new Date(value)
	return Number.isNaN(date.getTime())
		? null
		: date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

type Props = {
	plan?: PlanInfo | null
	planLoading?: boolean
	/**
	 * Every interval on sale. With two or more the card shows a Monthly/Annual selector in place
	 * of the single price. Omitted or single — the card renders exactly as it always has, which
	 * is what keeps the paywall modal unchanged.
	 */
	prices?: PlanPriceOption[]
	selectedInterval?: string
	onIntervalChange?: (interval: string) => void
	/** True when the viewer already subscribes — the Premium card becomes a confirmation. */
	isPremium?: boolean
	/**
	 * What the member is on RIGHT NOW, from `useCurrentMembershipPlan`. Drives the member state:
	 * the current price, the renewal line, and whether a switch is offered at all.
	 */
	currentPlan?: {
		interval: string | null
		amount: number | null
		label: string | null
		renewsAt: string | null
		cancelAtPeriodEnd: boolean
		/** `"trialing"` is the one that changes what this card must say. */
		status?: string | null
		/** When the free period ends. */
		trialEnd?: string | null
		/** No card means the trial ENDS rather than converting. */
		hasPaymentMethod?: boolean
		canSwitch: boolean
	} | null
	/** Opens Stripe's plan-switching flow. Omit and no switch button renders. */
	onSwitchInterval?: () => void
	/** Opens the ordinary billing portal — cancel, card, invoices. */
	onManageBilling?: () => void
	/** A portal session is being created; disables both member buttons. */
	billingPending?: boolean
	/**
	 * Invite code (a free-trial code, e.g. `jetzy-me`). Optional in every sense: omit these
	 * props and no field renders, which is how the card looked before trials existed.
	 */
	inviteCode?: string
	onInviteCodeChange?: (code: string) => void
	/** Set once the server has accepted it — e.g. "2 months free, then $20/month from Oct 18". */
	inviteAccepted?: string | null
	/** Why it was refused. Shown under the field. */
	inviteError?: string | null
	inviteChecking?: boolean
	/**
	 * The accepted trial behind that code, FOR THE INTERVAL CURRENTLY SELECTED.
	 *
	 * When it is set the card leads with $0 rather than the rate, because $0 is what the buyer is
	 * about to be charged — leaving "$20 /Month" as the headline made the card disagree with
	 * checkout, and the free month only appeared in a small line under the field that people
	 * scrolled past.
	 *
	 * Null while none applies, while one is still being checked, and while one was refused: the
	 * card must never show $0 for a code the server has not accepted. `chargesFrom` is when the
	 * first real invoice lands; without it the date is computed from `months`.
	 */
	trial?: { months: number; label: string; chargesFrom?: string | null } | null
	/** Disables the Premium CTA (in-flight mutation, or status still loading). */
	premiumDisabled?: boolean
	/** Shows a spinner in place of the Premium CTA label. */
	premiumPending?: boolean
	onChooseFree: () => void
	/**
	 * Drop the Jetzy Basic card and show Premium alone.
	 *
	 * For a shared referral link, where the recipient was sent a specific offer rather than a
	 * choice of plans — putting "Continue with Free" beside it invites them to decline something
	 * they were given. Everywhere else the comparison is what makes the price legible, so this
	 * defaults off.
	 *
	 * A MEMBER never sees it either, regardless of this prop: the comparison exists to help
	 * someone decide, and they have decided. Sitting a "Free, forever — $0" card beside an active
	 * paid membership reads as an offer to downgrade, which it isn't; the button only navigates.
	 */
	hideFreePlan?: boolean
	onChoosePremium: () => void
	freeCtaLabel?: string
	premiumCtaLabel?: string
	subscribedCtaLabel?: string
}

const BASIC_BENEFITS = [
	// Connecting with people is the point of Jetzy, so it leads — opening on events reads as
	// an events listing rather than the social product it is.
	"Connect with people wherever you are",
	"Discover and RSVP to events",
	"Chat with hosts and attendees",
	"Standard ticket pricing",
]

const PlanComparison: React.FC<Props> = ({
	plan,
	planLoading = false,
	prices,
	selectedInterval,
	onIntervalChange,
	isPremium = false,
	currentPlan,
	onSwitchInterval,
	onManageBilling,
	inviteCode,
	onInviteCodeChange,
	inviteAccepted,
	inviteError,
	inviteChecking = false,
	trial,
	billingPending = false,
	premiumDisabled = false,
	premiumPending = false,
	onChooseFree,
	onChoosePremium,
	hideFreePlan = false,
	freeCtaLabel = "Continue with Free",
	premiumCtaLabel = "Get Premium",
	subscribedCtaLabel = "You're subscribed — Continue",
}) => {
	// A choice only exists with two or more intervals. One price behaves exactly as before.
	const options = prices && prices.length > 1 ? prices : []
	const chosen = options.find((p) => p.interval === selectedInterval) || options[0]

	// The selected interval wins when there's a choice; otherwise the plan's own (the product
	// default), which is what the paywall modal and every pre-annual caller relies on.
	const interval = chosen?.interval || plan?.interval || "month"
	const planAmount = plan?.unitAmount != null ? plan.unitAmount / 100 : null
	const amount = chosen ? chosen.amount : planAmount
	const formattedPrice = chosen ? amountOnly(chosen.label) : money(planAmount)

	// "or $20/month" under the headline price — the interval NOT currently selected. Shown only
	// when there is genuinely another one on sale, so a single-price product is unchanged.
	const alternate = options.find((p) => p.interval !== interval)

	// ---- The annual pitch, for somebody still choosing ----
	//
	// Off `options` (what is on sale) rather than the member's own plan, which is what the trial
	// panel further down uses — a legacy $10/month member must not be quoted a saving computed
	// against today's $20.
	const monthlyOption = options.find((p) => p.interval === "month")
	const annualOption = options.find((p) => p.interval === "year")
	const annualMonthsFreeOnSale = monthsFreeOnAnnual(monthlyOption?.amount, annualOption?.amount)

	// ---- An accepted invite code, priced ----
	//
	// `amount != null` is part of the condition, not an afterthought: with no known rate there is
	// no "then $20/Month from ..." to write, and a bare $0 with nothing after it would be the whole
	// disclosure. Better to show the ordinary price than to say free and not say for how long.
	const trialApplied = !isPremium && !!trial && trial.months > 0 && amount != null
	const trialChargesOn = renewalDate(
		trial?.chargesFrom ||
			(trial ? trialEndsOn({ months: trial.months, intervals: [], label: trial.label }).toISOString() : null),
	)

	// A member is not buying. Everything below the current-plan block is the member state.
	const memberInterval = currentPlan?.interval || null
	const memberRenewal = renewalDate(currentPlan?.renewsAt)
	// The switch target is whichever interval they are NOT on — annual, in practice, since the
	// server only sets `canSwitch` for monthly members.
	const switchTarget = memberInterval ? options.find((p) => p.interval !== memberInterval) : undefined
	// Offered DURING a trial too. It was briefly hidden there, which was over-cautious: since the
	// portal configuration carries `trial_update_behavior: "continue_trial"`, switching keeps the
	// free period and simply changes what is charged when it ends. Before that setting the same
	// click would have ended the trial and billed on the spot, which is presumably why it felt
	// unsafe.
	const showSwitch = !!(isPremium && currentPlan?.canSwitch && switchTarget && onSwitchInterval)

	// A trial is only worth describing while it is running, and only when we know the date it
	// ends — an unnamed "your trial" answers none of the questions a member actually has.
	const trialEndsOnLabel = currentPlan?.status === "trialing" ? renewalDate(currentPlan?.trialEnd || currentPlan?.renewsAt) : null
	const onTrial = !!trialEndsOnLabel
	/** With a card the trial converts and they get charged; without one Stripe simply ends it. */
	const trialConverts = !!currentPlan?.hasPaymentMethod
	const memberRate = currentPlan?.label || formattedPrice

	// ---- The annual pitch inside the trial panel ----
	//
	// Every figure in it is derived, never written down: the annual price, the twelve-months-of-
	// monthly it is compared against, and the number of months that difference buys. A hardcoded
	// "2 months free — $200 instead of $240" is a claim about Stripe's prices that stops being
	// true the moment either one moves.
	const memberAmount = currentPlan?.amount ?? null
	const annualAmount = switchTarget?.amount ?? null
	const annualCompareAt = memberInterval === "month" && memberAmount != null ? memberAmount * 12 : null
	const annualMonthsFree = memberInterval === "month" ? monthsFreeOnAnnual(memberAmount, annualAmount) : 0
	// Only when we can state it in full. A half-priced sentence with a missing figure in it is
	// worse than no sentence.
	const showAnnualPitch = showSwitch && annualAmount != null && annualCompareAt != null && annualMonthsFree > 0

	// What the switch is WORTH, rather than what it costs. "Switch to $200/year" stated a price to
	// a member already paying one and gave them no reason to press it.
	//
	// Computed off `annualMonthsFreeOnSale` — the prices ON SALE ($20/month against $200/year) —
	// and NOT off `annualMonthsFree`, which is the member's own rate. That is deliberate and it is
	// what makes the button read "Get 2 more free months" for everyone: the two months are a
	// property of what annual costs, not of what any one member happens to pay. The paragraph in
	// the trial panel still uses the member's own figures, because it names exact amounts and a
	// legacy $10/month member must not be quoted a saving against today's $20.
	//
	// Still derived, never written down: a hardcoded "2" is a claim about Stripe's prices that
	// stops being true the moment either moves. The fallback is unreachable in practice — with no
	// annual price there is no switch target and the button doesn't render at all — but it is
	// there so the button can never promise "0 more free months".
	const switchLabel =
		switchTarget?.interval === "year" && annualMonthsFreeOnSale > 0
			? `Get ${annualMonthsFreeOnSale} more free month${annualMonthsFreeOnSale === 1 ? "" : "s"} by switching to yearly`
			: `Switch to ${switchTarget?.label}`

	// Members never see the comparison — see `hideFreePlan`.
	const showFreePlan = !hideFreePlan && !isPremium

	return (
		<div className={showFreePlan ? "grid gap-6 sm:grid-cols-2" : "grid gap-6 max-w-md mx-auto"}>
			{/* Free tier — no Stripe object backs this, it's just "not subscribed" */}
			{showFreePlan && (
			<div className="bg-[#1E1E1E] border-2 border-[#2b2b2b] rounded-2xl p-6 flex flex-col">
				<h2 className="text-xl font-bold mb-1">Jetzy Basic</h2>
				<p className="text-sm text-gray-400 mb-4">Free, forever</p>
				<p className="text-3xl font-bold mb-6">$0</p>
				<ul className="space-y-3 text-sm text-gray-300 flex-1 mb-6 text-left">
					{BASIC_BENEFITS.map((benefit) => (
						<li key={benefit} className="flex gap-2">
							<CheckIcon className="w-5 h-5 text-jetzy shrink-0" /> {benefit}
						</li>
					))}
				</ul>
				<button
					onClick={onChooseFree}
					className="bg-[#2b2b2b] hover:bg-[#343434] text-white font-bold px-6 py-3 rounded-full transition-colors"
				>
					{freeCtaLabel}
				</button>
			</div>
			)}

			{/* Premium tier — backed by the real Stripe subscription product */}
			<div className="bg-[#1E1E1E] border-2 border-jetzy rounded-2xl p-6 flex flex-col relative">
				<span className="absolute -top-3 right-6 bg-jetzy text-black text-xs font-bold px-3 py-1 rounded-full">
					BEST DEAL
				</span>
				<h2 className="text-xl font-bold mb-1">{plan?.name || "Jetzy Premium"}</h2>
				{!isPremium && <p className="text-sm text-gray-400 mb-4">Billed {interval}ly</p>}

				{/* ---- MEMBER STATE ---- what they pay now, not what they could buy. ---- */}
				{isPremium ? (
					onTrial ? (
						/* ---- ON A FREE TRIAL ----
						   Leading with "$20 /month" here was reading as a charge that had already
						   happened: someone who was just given a free month saw a large price and a
						   date and concluded they had paid. The free period is the headline, the
						   date is the answer to the only question they have, and the rate is what
						   comes after — in that order. */
						<div className="mb-6">
							<p className="text-2xl font-bold" style={{ color: "#F5C518" }}>
								Free until {trialEndsOnLabel}
							</p>
							<div
								className="mt-3 rounded-xl p-3 text-sm"
								style={{ background: "rgba(245,197,24,0.10)", border: "1px solid rgba(245,197,24,0.45)", color: "#F5C518" }}
							>
								{trialConverts ? (
									/* Wording supplied by the CEO and reproduced verbatim; only the date, the
									   rate and the annual figures are substituted. */
									<>
										<p className="font-semibold">Your free trial is active.</p>
										<p className="mt-2 font-normal">
											Enjoy Jetzy Premium free until {trialEndsOnLabel}. Cancel anytime before your trial ends, and you
											won&apos;t be charged.
										</p>
										<p className="mt-2 font-normal">
											After your free trial, your membership will continue at{" "}
											{usd(memberAmount) || (memberRate ? amountOnly(memberRate) : "the usual rate")}/
											{memberInterval || interval}.
										</p>
										{/* The switch button below raises exactly one question, so it is answered
										    next to it rather than left to be discovered. */}
										{showAnnualPitch && (
											<p className="mt-2 font-normal">
												Switch to yearly and your free trial stays active until {trialEndsOnLabel} — you&apos;ll then be
												charged {usd(annualAmount)}/year instead of {usd(annualCompareAt)}. That&apos;s {annualMonthsFree}{" "}
												month{annualMonthsFree === 1 ? "" : "s"} free.
											</p>
										)}
									</>
								) : (
									/* Kept short on purpose: this member never entered a card, and
									   explaining the mechanics of that is not what they came for. */
									<>
										<p className="font-semibold">Your free trial is active.</p>
										<p className="mt-1 font-normal">
											You can use Jetzy Premium free until {trialEndsOnLabel}. To keep it after that, add a card.
										</p>
									</>
								)}
							</div>
						</div>
					) : (
					<div className="mb-6">
						<p className="text-3xl font-bold" style={{ color: "#F5C518" }}>
							{currentPlan?.label ? amountOnly(currentPlan.label) : formattedPrice || "—"}
							<span className="text-sm text-gray-400 font-normal">
								{" "}
								/{PERIOD_LABELS[memberInterval || interval] || memberInterval || interval}
							</span>
						</p>
						{/* Says which it is — "renews" and "cancels" are opposite facts and a member
						    who has already cancelled must not read a renewal date as a charge to come. */}
						<p className="text-sm mt-1" style={{ color: "#F5C518" }}>
							{currentPlan?.cancelAtPeriodEnd
								? memberRenewal
									? `Cancels ${memberRenewal}`
									: "Cancels at the end of this period"
								: memberRenewal
									? `Active — renews ${memberRenewal}`
									: "Active"}
						</p>
						{switchTarget?.label && (
							<p className="text-sm text-gray-400 mt-1">or {switchTarget.label}</p>
						)}
					</div>
					)
				) : (
					<>
						{/* Interval selector, only when there is genuinely a choice. Each option carries
						    its own price: the buyer is choosing between two amounts, so showing one and
						    making them tap to discover the other would hide half the decision. */}
						{options.length > 0 && !planLoading && (
							<div className="grid grid-cols-2 gap-2 mb-5" role="group" aria-label="Billing interval">
								{options.map((option) => {
									const active = option.interval === interval
									return (
										<button
											key={option.id}
											type="button"
											onClick={() => onIntervalChange?.(option.interval)}
											aria-pressed={active}
											className={`rounded-xl border-2 px-3 py-2 text-center transition-colors ${
												active ? "border-jetzy bg-jetzy/10" : "border-[#2b2b2b] hover:border-[#3a3a3a]"
											}`}
										>
											<span
												className="block text-sm font-semibold"
												style={{ color: active ? "#F5C518" : "#9CA3AF" }}
											>
												{INTERVAL_LABELS[option.interval] || option.interval}
											</span>
											<span className="block text-xs" style={{ color: active ? "#F5C518" : "#6B7280" }}>
												{option.amount != null
													? `${money(option.amount)}/${PERIOD_LABELS[option.interval] || option.interval}`
													: "—"}
											</span>
										</button>
									)
								})}
							</div>
						)}

						{/* Never a placeholder figure — the price is a disclosure, so it's a spinner until
						    the real number is known. */}
						{planLoading ? (
							<div className="mb-6">
								<Spinner />
							</div>
						) : (
							<div className="mb-6">
								{/* Compare-at.
								    Ordinarily marketing copy — see COMPARE_AT_MULTIPLIER. With a trial code
								    applied it becomes the REAL rate ($20, $200), struck through, because that
								    is the figure the code is actually waiving; $40 struck above $0 would be
								    crediting the code with a discount nobody was ever charged. */}
								{amount != null && (
									<p className="text-lg text-gray-500 line-through">
										{money(trialApplied ? amount : amount * COMPARE_AT_MULTIPLIER)}
									</p>
								)}
								<p className="text-3xl font-bold flex items-baseline gap-2 flex-wrap">
									<span style={{ color: "#F5C518" }}>{trialApplied ? money(0) : formattedPrice || "—"}</span>
									<span className="text-sm text-gray-400 font-normal">
										/{PERIOD_LABELS[interval] || interval}
									</span>
									{amount != null && (
										<span className="text-sm font-semibold text-green-500 capitalize">
											{trialApplied ? trial!.label : DISCOUNT_BADGE}
										</span>
									)}
								</p>
								{/* The terms, where the price is read.
								    $0 is only half the deal, and the card-network requirement is that the
								    amount and the date are disclosed BEFORE purchase. This does not replace
								    the green line under the invite field — that one confirms the code was
								    accepted; this one prices it. */}
								{trialApplied && (
									<p className="text-sm text-gray-300 mt-1">
										Then {money(amount)}/{PERIOD_LABELS[interval] || interval}
										{trialChargesOn ? ` from ${trialChargesOn}` : ""}. Cancel any time.
									</p>
								)}
								{/* The annual option, sold rather than merely listed.
								    "or $200/year — 50% Off" stated the price and left the buyer to work
								    out that twelve months at the monthly rate would be $240. Saying what
								    the saving actually is, is the whole pitch. Falls back to the plain
								    line whenever the figures aren't there to say it honestly, or when
								    annual is already the selected plan and the alternate is monthly. */}
								{alternate?.amount != null &&
									(alternate.interval === "year" && annualMonthsFreeOnSale > 0 ? (
										<div className="mt-1 text-sm">
											<p className="text-gray-300">
												{money(alternate.amount)}/{PERIOD_LABELS[alternate.interval] || alternate.interval} — Save Even More
											</p>
											<p className="font-semibold text-green-500">
												{DISCOUNT_BADGE} + {annualMonthsFreeOnSale} Additional Month
												{annualMonthsFreeOnSale === 1 ? "" : "s"} Free
											</p>
										</div>
									) : (
										<p className="text-sm text-gray-400 mt-1 flex items-baseline gap-2">
											<span>
												or {money(alternate.amount)}/{alternate.interval}
											</span>
											<span className="font-semibold text-green-500">{DISCOUNT_BADGE}</span>
										</p>
									))}
							</div>
						)}
					</>
				)}

				{/* Invite code — ABOVE the benefits, and visibly its own thing.

				    It sat under the benefit list in the same grey as the rest of the form, where a
				    buyer holding a code scrolled past it and paid full price. A code changes what is
				    charged today AND when the first payment lands, so it has to be seen before the
				    decision rather than found after it. The tint is the same yellow every other
				    membership disclosure on this site uses. */}
				{!isPremium && onInviteCodeChange && (
					<div
						className="mb-6 text-left rounded-xl p-3"
						style={{ background: "rgba(245,197,24,0.10)", border: "1px solid rgba(245,197,24,0.45)" }}
					>
						<label htmlFor="premium-invite-code" className="block text-xs font-semibold mb-1.5" style={{ color: "#F5C518" }}>
							Have an invite code? <span className="font-normal text-gray-400">(optional)</span>
						</label>
						<input
							id="premium-invite-code"
							type="text"
							value={inviteCode || ""}
							onChange={(e) => onInviteCodeChange(e.target.value)}
							placeholder="Enter your invite code"
							autoComplete="off"
							className="w-full rounded-lg bg-[#141414] border-2 border-[#3a3320] px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-jetzy focus:outline-none"
						/>
						{inviteChecking && <p className="text-xs text-gray-400 mt-1.5">Checking…</p>}
						{!inviteChecking && inviteError && <p className="text-xs text-red-400 mt-1.5">{inviteError}</p>}
						{!inviteChecking && !inviteError && inviteAccepted && (
							<p className="text-xs mt-1.5 font-semibold" style={{ color: "#22C55E" }}>
								{inviteAccepted}
							</p>
						)}
					</div>
				)}

				<ul className="space-y-3 text-sm text-gray-300 flex-1 mb-6 text-left">
					<li className="flex gap-2">
						<CheckIcon className="w-5 h-5 shrink-0" style={{ color: "#F5C518" }} /> Everything in Basic
					</li>
					{PREMIUM_BENEFITS.map((benefit) => (
						<li key={benefit} className="flex gap-2">
							<CheckIcon className="w-5 h-5 shrink-0" style={{ color: "#F5C518" }} /> {benefit}
						</li>
					))}
				</ul>

				{isPremium ? (
					<div className="flex flex-col gap-3">
						{/* Offered only to a monthly member, and only when we can name the subscription
						    to pin the flow to — `canSwitch` is decided server-side. An annual member
						    gets Manage alone: moving off annual mid-term leaves an unused credit on
						    their Stripe customer, and nothing here pays that back in cash. */}
						{showSwitch && (
							<button
								onClick={onSwitchInterval}
								disabled={billingPending}
								className="bg-jetzy text-black font-bold text-sm leading-snug px-6 py-3 rounded-full hover:opacity-90 transition-colors disabled:opacity-50"
							>
								{billingPending ? <Spinner /> : switchLabel}
							</button>
						)}
						{/* A trial with no card on file ENDS. Saying so and offering nothing would leave
						    a member watching their membership lapse with no way to stop it — the
						    billing portal's payment-method page is exactly that way, so it gets its
						    own label and the primary position. */}
						{onManageBilling && onTrial && !trialConverts && (
							<button
								onClick={onManageBilling}
								disabled={billingPending}
								className="bg-jetzy text-black font-bold px-6 py-3 rounded-full transition-colors hover:opacity-90 disabled:opacity-50"
							>
								{billingPending ? <Spinner /> : "Add a card to keep it"}
							</button>
						)}
						{onManageBilling && (
							<button
								onClick={onManageBilling}
								disabled={billingPending}
								className={`font-bold px-6 py-3 rounded-full transition-colors disabled:opacity-50 ${
									showSwitch || (onTrial && !trialConverts)
										? "border-2 border-[#2b2b2b] text-white hover:border-[#3a3a3a]"
										: "bg-jetzy text-black hover:opacity-90"
								}`}
							>
								Manage in Stripe
							</button>
						)}
						{/* Kept for the callers that own where "done" goes — /subscribe returns the
						    mobile app to its deep link from here. */}
						<button
							onClick={onChooseFree}
							className={`font-bold px-6 py-3 rounded-full transition-colors ${
								onManageBilling ? "bg-[#2b2b2b] hover:bg-[#343434] text-white" : "bg-jetzy text-black"
							}`}
						>
							{subscribedCtaLabel}
						</button>
					</div>
				) : (
					<button
						disabled={premiumDisabled || premiumPending}
						onClick={onChoosePremium}
						className="bg-jetzy text-black font-bold px-6 py-3 rounded-full hover:opacity-90 transition-colors disabled:opacity-50"
					>
						{premiumPending ? <Spinner /> : premiumCtaLabel}
					</button>
				)}
			</div>
		</div>
	)
}

export default PlanComparison

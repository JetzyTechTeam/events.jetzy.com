import React from "react"
import { CheckIcon } from "@heroicons/react/24/solid"
import Spinner from "@/components/misc/Spinner"

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

type Props = {
	plan?: PlanInfo | null
	planLoading?: boolean
	/** True when the viewer already subscribes — the Premium card becomes a confirmation. */
	isPremium?: boolean
	/** Disables the Premium CTA (in-flight mutation, or status still loading). */
	premiumDisabled?: boolean
	/** Shows a spinner in place of the Premium CTA label. */
	premiumPending?: boolean
	onChooseFree: () => void
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
	isPremium = false,
	premiumDisabled = false,
	premiumPending = false,
	onChooseFree,
	onChoosePremium,
	freeCtaLabel = "Continue with Free",
	premiumCtaLabel = "Subscribe Now",
	subscribedCtaLabel = "You're subscribed — Continue",
}) => {
	const interval = plan?.interval || "month"
	const formattedPrice =
		plan?.unitAmount != null
			? (plan.unitAmount / 100).toLocaleString("en-US", { style: "currency", currency: plan.currency || "usd" })
			: null

	return (
		<div className="grid gap-6 sm:grid-cols-2">
			{/* Free tier — no Stripe object backs this, it's just "not subscribed" */}
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

			{/* Premium tier — backed by the real Stripe subscription product */}
			<div className="bg-[#1E1E1E] border-2 border-jetzy rounded-2xl p-6 flex flex-col relative">
				<span className="absolute -top-3 right-6 bg-jetzy text-black text-xs font-bold px-3 py-1 rounded-full">
					BEST DEAL
				</span>
				<h2 className="text-xl font-bold mb-1">{plan?.name || "Jetzy Premium"}</h2>
				<p className="text-sm text-gray-400 mb-4">Billed {interval}ly</p>

				{/* Never a placeholder figure — the price is a disclosure, so it's a spinner until
				    the real number is known. */}
				{planLoading ? (
					<div className="mb-6">
						<Spinner />
					</div>
				) : (
					<p className="text-3xl font-bold mb-6" style={{ color: "#F5C518" }}>
						{formattedPrice || "—"}
						<span className="text-sm text-gray-400 font-normal"> / {interval}</span>
					</p>
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
					<button
						onClick={onChooseFree}
						className="bg-jetzy text-black font-bold px-6 py-3 rounded-full transition-colors"
					>
						{subscribedCtaLabel}
					</button>
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

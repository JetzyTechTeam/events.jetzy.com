import React from "react"
import { PREMIUM_BENEFITS } from "./PlanComparison"

/**
 * Replaces the buy-Premium card once a buyer has an application `awaiting_card` or
 * `under_review` (see `src/lib/premium-application.ts`). Mirrors the CEO's "Application Under
 * Review" screen: the free-first-period promise up front, the perks they're waiting for, and a
 * plain "what happens next" timeline so a rejected/approved outcome isn't a surprise.
 */

export type ApplicationForReview = {
	status: "awaiting_card" | "under_review"
	trialMonths?: number
	interval?: "month" | "year"
}

export default function PremiumApplicationReview({
	application,
	onResumeCardSetup,
	resuming,
}: {
	application: ApplicationForReview
	onResumeCardSetup?: () => void
	resuming?: boolean
}) {
	if (application.status === "awaiting_card") {
		return (
			<div className="w-full max-w-md mx-auto bg-[#141414] border border-[#2b2b2b] rounded-2xl p-6 text-center">
				<h2 className="text-lg font-bold text-white mb-2">Finish setting up your card</h2>
				<p className="text-sm text-gray-400 mb-4">
					We have your application, but card setup wasn&apos;t completed. Nothing has been charged — pick up where you left off.
				</p>
				<button
					onClick={onResumeCardSetup}
					disabled={resuming}
					className="bg-jetzy text-black font-bold px-6 py-3 rounded-full hover:opacity-90 transition-colors disabled:opacity-50"
				>
					{resuming ? "Please wait…" : "Continue to Secure Card Setup →"}
				</button>
			</div>
		)
	}

	const periodLabel = application.trialMonths && application.trialMonths > 0 ? `${application.trialMonths}-month` : "first-period"

	return (
		<div className="w-full max-w-md mx-auto bg-[#141414] border border-[#2b2b2b] rounded-2xl p-6">
			<div className="text-center mb-4">
				<span className="text-xs font-bold px-2 py-1 rounded-full bg-[#2b2b2b] text-gray-400">⏱ APPLICATION UNDER REVIEW</span>
			</div>
			<h2 className="text-xl font-bold text-white text-center mb-4">Your Jetzy Premium application is under review</h2>
			<p className="text-sm text-gray-400 text-center mb-4">
				Thank you for your interest in Jetzy Premium. Our team is reviewing your profile and will update you via email once your membership has been approved.
			</p>

			<div className="bg-[#1f1a0d] border border-[#3a2f12] rounded-lg p-4 mb-4">
				<p className="text-sm font-bold text-[#F5C518] mb-1">Your First Month is 100% Free Once Approved</p>
				<span className="inline-block text-xs font-bold px-2 py-1 rounded bg-green-900 text-green-400 mb-2">$0.00 DUE TODAY</span>
				<p className="text-xs text-gray-400">
					Your payment card has been securely saved with Stripe for future billing, but you will not be charged today. Your {periodLabel} free trial will start only on the day your membership is approved.
				</p>
			</div>

			<div className="mb-4">
				<div className="flex items-center justify-between mb-2">
					<p className="text-sm font-bold text-white">JETZY PREMIUM PERKS</p>
					<span className="text-xs text-gray-500">Included with Membership</span>
				</div>
				<ul className="space-y-1 text-sm text-gray-300">
					{PREMIUM_BENEFITS.map((benefit) => (
						<li key={benefit} className="flex gap-2">
							<span className="text-[#F5C518]">✓</span> {benefit}
						</li>
					))}
				</ul>
			</div>

			<div>
				<div className="flex items-center justify-between mb-2">
					<p className="text-sm font-bold text-white">What happens next?</p>
					<span className="text-xs text-gray-500">⚡ Avg. response ~24 hrs</span>
				</div>
				<div className="space-y-3">
					<div className="flex items-start justify-between gap-2">
						<div className="flex gap-2">
							<span className="text-[#F5C518]">⏳</span>
							<div>
								<p className="text-sm text-white font-medium">Review in progress</p>
								<p className="text-xs text-gray-500">Our membership committee reviews profiles within 24-48 hours to maintain our community quality.</p>
							</div>
						</div>
						<span className="text-xs shrink-0 px-2 py-1 rounded-full bg-[#2b2b2b] text-[#F5C518]">CURRENT STEP</span>
					</div>
					<div className="flex gap-2">
						<span className="text-gray-500">📧</span>
						<div>
							<p className="text-sm text-gray-300 font-medium">Email Notification</p>
							<p className="text-xs text-gray-500">You will receive an email confirmation at your registered address once a decision is made.</p>
						</div>
					</div>
					<div className="flex gap-2">
						<span className="text-gray-500">✓</span>
						<div>
							<p className="text-sm text-gray-300 font-medium">Membership Active</p>
							<p className="text-xs text-gray-500">Immediate access to curated networking, invite-only experiences, and VIP event tickets worldwide.</p>
						</div>
					</div>
				</div>
			</div>

			<p className="text-xs text-gray-500 text-center mt-4">
				🔒 Billing transparency: Cancel anytime in your Jetzy account settings before your free trial concludes. Zero early cancellation fees.
			</p>
		</div>
	)
}

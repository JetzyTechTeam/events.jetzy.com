import { Text } from "@chakra-ui/react"
import { AnalyticsPanel, StatTable } from "@/components/analytics/AnalyticsPanel"
import { hasCheckoutVerificationData, type CheckoutVerificationStats } from "@/lib/checkout-verification-events"

/**
 * The checkout email check, as plain rows — used on the main analytics page (all events) and
 * the per-event analytics page. No chart, by request: one line per fact, with what it means.
 * Numbers come from `getCheckoutVerificationStats` via the analytics APIs.
 */
export default function CheckoutVerificationPanel({
	stats,
	subtitle,
	mb,
}: {
	stats: CheckoutVerificationStats | null
	subtitle: string
	mb?: number
}) {
	const n = (v: number) => v.toLocaleString()
	const shareOfSent = (v: number) => (stats && stats.codeSent > 0 ? (v / stats.codeSent) * 100 : null)

	return (
		<AnalyticsPanel title="Email check at checkout" subtitle={subtitle} mb={mb}>
			{!stats || !hasCheckoutVerificationData(stats) ? (
				<Text fontSize="sm" color="#9C9C9C">
					Nobody has reached the email check in this period. It has been recorded since 24 Nov 2026.
				</Text>
			) : (
				<StatTable
					showShare
					rows={[
						{
							label: "Got an email code",
							value: n(stats.codeSent),
							share: stats.codeSent > 0 ? 100 : null,
							help: "Entered their email at checkout and were sent a 6-digit code.",
						},
						{
							label: "Verified their email",
							value: n(stats.verified),
							share: shareOfSent(stats.verified),
							help: "Typed the code correctly and carried on to book.",
							tone: "good",
						},
						{
							label: "Got a code but didn't verify",
							value: n(stats.neverVerified),
							share: shareOfSent(stats.neverVerified),
							help: "Stopped at the code step — left, or the email never arrived (check spam).",
							tone: stats.neverVerified > 0 ? "bad" : undefined,
						},
						{
							label: "Already signed in — no code needed",
							value: n(stats.alreadySignedIn),
							share: null,
							help: "Signed in as the email they booked with (or an admin booking for a guest), so they skipped the code.",
						},
						{
							label: "Wrong codes typed",
							value: n(stats.wrongCodeAttempts),
							share: null,
							help: "Every attempt with a code that didn't work.",
							tone: stats.wrongCodeAttempts > 0 ? "warn" : undefined,
						},
						{
							label: "Asked for a new code",
							value: n(stats.resends),
							share: null,
							help: "Pressed Resend. Many of these usually means the email was slow or went to spam.",
							tone: stats.resends > 0 ? "warn" : undefined,
						},
					]}
				/>
			)}
		</AnalyticsPanel>
	)
}

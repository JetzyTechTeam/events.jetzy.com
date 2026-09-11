import axios from "axios"
import { useQuery } from "@tanstack/react-query"
import type { ApplicationQuestion } from "@/components/premium/PremiumApplicationQuestions"

/**
 * The Premium application gate's public settings (whether it's on, and which questions to ask)
 * and the signed-in buyer's own latest application, if any.
 *
 * Shared by `/premium`, `/subscribe` and `PremiumPaywallModal` so the three doors can't disagree
 * about whether a code-less buyer should see the questionnaire.
 */

export type PremiumApplication = {
	_id: string
	status: "awaiting_card" | "under_review" | "approved" | "rejected"
	interval: "month" | "year"
	trialMonths?: number
}

export function usePremiumApplicationSettings() {
	return useQuery({
		queryKey: ["premium-application-settings"],
		queryFn: async () => (await axios.get("/api/premium/applications/settings")).data?.data as { enabled: boolean; questions: ApplicationQuestion[] },
		staleTime: 60_000,
	})
}

export function useMyPremiumApplication(enabled: boolean) {
	return useQuery({
		queryKey: ["premium-application-mine"],
		queryFn: async () => (await axios.get("/api/premium/applications/mine")).data?.data as PremiumApplication | null,
		enabled,
	})
}

/** A buyer whose application is still open must not be sent through checkout a second time. */
export const applicationBlocksCheckout = (application: PremiumApplication | null | undefined): boolean =>
	!!application && (application.status === "awaiting_card" || application.status === "under_review")

/** Whether buying with the given code (or lack of one) must go through the questions gate first. */
export const applicationRequiredForPurchase = (
	settings: { enabled: boolean } | undefined,
	hasCode: boolean,
	application: PremiumApplication | null | undefined,
): boolean => !!settings?.enabled && !hasCode && !applicationBlocksCheckout(application)

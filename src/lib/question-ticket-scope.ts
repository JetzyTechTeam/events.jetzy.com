/**
 * Which tickets a custom question is asked for. Pure and isomorphic — the checkout modal shows
 * and requires exactly the questions both checkout endpoints enforce.
 *
 * Same rule as a referral code's `ticketIds` (`referral-ticket-scope.ts`, reused here):
 *   - `ticketIds` absent or empty = EVERY ticket — every question written before scoping existed.
 *   - A non-empty list → the question is asked when ANY selected ticket is on it.
 *   - A list whose tickets were all deleted is asked for NOTHING — never widened back to "all".
 */
import {
	liveScopedTicketIds,
	referralAppliesToAllTickets,
	resolveReferralTicketIds,
	selectionHasEligibleTicket,
} from "@/lib/referral-ticket-scope"

type ScopedQuestion = { ticketIds?: string[] | null }

export const questionAppliesToAllTickets = (q: ScopedQuestion | null | undefined): boolean => referralAppliesToAllTickets(q)

export const questionAppliesToSelection = (q: ScopedQuestion | null | undefined, ticketIds: Array<string | undefined | null>): boolean =>
	// An all-tickets question applies even when no ticket ids are known (an old booking row).
	!!q && (questionAppliesToAllTickets(q) || selectionHasEligibleTicket(q, ticketIds))

/** The questions to show and require for this selection of ticket ids. */
export const questionsForSelection = <Q extends ScopedQuestion>(questions: Q[] | null | undefined, ticketIds: Array<string | undefined | null>): Q[] =>
	(questions || []).filter((q) => questionAppliesToSelection(q, ticketIds))

/** Scoped ticket ids that still exist on the event — empty for an all-tickets question. */
export const liveQuestionTicketIds = (q: ScopedQuestion | null | undefined, eventTickets: Array<{ _id?: any }> | undefined): string[] =>
	liveScopedTicketIds(q, eventTickets)

/** Server: the host's submitted ids → what is stored (`undefined` = all tickets). */
export const resolveQuestionTicketIds = resolveReferralTicketIds

/** Answers keep only questions that applied to the order (an answer typed before the tickets changed is dropped). */
export const answersForQuestions = <A extends { questionId?: string }>(answers: A[] | null | undefined, questions: Array<{ id: string }>): A[] => {
	const ids = new Set(questions.map((q) => String(q.id)))
	return (answers || []).filter((a) => ids.has(String(a?.questionId)))
}

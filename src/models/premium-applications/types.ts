import { Types } from "mongoose"
import type { ICustomQuestion } from "@/models/events/types"

export type PremiumApplicationStatus = "awaiting_card" | "under_review" | "approved" | "rejected"

export interface IPremiumApplicationAnswer {
	questionId: string
	answer: any
}

export interface IPremiumApplication {
	_id: Types.ObjectId
	userId?: Types.ObjectId
	email: string
	name?: string
	interval: "month" | "year"
	answers: IPremiumApplicationAnswer[]
	status: PremiumApplicationStatus
	stripeCustomerId?: string
	setupIntentId?: string
	paymentMethodId?: string
	trialMonths?: number
	stripeSubscriptionId?: string
	reviewedAt?: Date
	reviewedBy?: Types.ObjectId
	rejectionReason?: string
	createdAt: string
	updatedAt: string
}

// Re-exported so callers of the application module don't have to reach into `models/events`
// for a type that has nothing to do with events — the shape (and its mongoose subdocument
// schema) is reused verbatim, not duplicated, for consistency with the event custom-questions
// editor this admin UI is modelled on.
export type { ICustomQuestion }

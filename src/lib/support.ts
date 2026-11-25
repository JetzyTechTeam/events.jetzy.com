/**
 * Pure constants for the /support form. No mongoose import here — this file is safe to pull
 * into the client bundle, unlike support-request.ts / send-grid.ts.
 */
export const SUPPORT_CATEGORIES = [
	{ key: "event", label: "Event" },
	{ key: "premium", label: "Premium / Membership" },
	{ key: "general", label: "General" },
] as const

export type SupportCategoryKey = (typeof SUPPORT_CATEGORIES)[number]["key"]

export const isSupportCategory = (value: unknown): value is SupportCategoryKey =>
	SUPPORT_CATEGORIES.some((c) => c.key === value)

/** tech@jetzyapp.com by default — override with ADMIN_SUPPORT_EMAIL. */
export const ADMIN_SUPPORT_EMAIL = (process.env.ADMIN_SUPPORT_EMAIL as string)?.trim() || "tech@jetzyapp.com"

/**
 * The "Questions? Contact us at …" address in every email footer. Deliberately NOT the sender
 * (`SENDGRID_EMAIL_SENDER`, now reservations@jetzy.com) — that mailbox is a sending identity,
 * not where guest questions are answered. Rendered by `email-footer.ts`.
 */
export const EMAIL_FOOTER_CONTACT = "tech@jetzyapp.com"


/**
 * Validation + normalisation for the answers to the Premium application questions.
 *
 * Pure and isomorphic — no server imports — so the questionnaire (inline errors) and
 * `api/premium/applications/start.ts` (authoritative check) run the exact same rules.
 *
 * It cannot prove an account EXISTS; there is no API for that. What it stops is a name, a
 * sentence or junk landing in a profile field, which is the actual failure ("Fahad Zaman" was
 * accepted as an Instagram handle). Values are stored NORMALISED so an admin can click them.
 */

import type { ICustomQuestion } from "@/models/events/types"

export type AnswerCheck = { ok: true; value: any } | { ok: false; message: string }

const HOST_TLD = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i

/** Parse a URL, adding `https://` when the buyer typed a bare `site.com/path`. */
const parseUrl = (raw: string): URL | null => {
	const trimmed = raw.trim()
	if (!trimmed || /\s/.test(trimmed)) return null
	// A scheme other than http(s) — `javascript:`, `mailto:`, `ftp:` — is refused, not "fixed".
	const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
	if (hasScheme && !/^https?:\/\//i.test(trimmed)) return null
	try {
		const url = new URL(hasScheme ? trimmed : `https://${trimmed}`)
		if (url.protocol !== "https:" && url.protocol !== "http:") return null
		if (!HOST_TLD.test(url.hostname)) return null
		return url
	} catch {
		return null
	}
}

const hostIs = (url: URL, domain: string) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)

const INSTAGRAM_RESERVED = new Set(["p", "reel", "reels", "explore", "accounts", "stories", "tv", "direct", "about", "legal", "developer"])
const HANDLE = /^[A-Za-z0-9._]{1,30}$/

type Platform = { domains: string[]; label: string }
const PLATFORMS: Record<string, Platform> = {
	facebook: { domains: ["facebook.com", "fb.com"], label: "Facebook" },
	tiktok: { domains: ["tiktok.com"], label: "TikTok" },
	youtube: { domains: ["youtube.com", "youtu.be"], label: "YouTube" },
	twitter: { domains: ["twitter.com", "x.com"], label: "X (Twitter)" },
}

const firstSegment = (url: URL): string => url.pathname.split("/").filter(Boolean)[0] || ""

function checkInstagram(raw: string): AnswerCheck {
	const bad: AnswerCheck = { ok: false, message: "Enter your Instagram username, like @yourname, or your profile link." }
	const trimmed = raw.trim()
	let handle = ""

	if (/instagram\.com/i.test(trimmed)) {
		const url = parseUrl(trimmed)
		if (!url || !hostIs(url, "instagram.com")) return bad
		handle = firstSegment(url)
		if (INSTAGRAM_RESERVED.has(handle.toLowerCase())) return bad
	} else {
		handle = trimmed.replace(/^@/, "")
	}

	// No spaces, no "@@", not just dots — "Fahad Zaman" fails here.
	if (!HANDLE.test(handle) || /^\.+$/.test(handle)) return bad
	return { ok: true, value: `https://www.instagram.com/${handle}` }
}

function checkLinkedIn(raw: string): AnswerCheck {
	const bad: AnswerCheck = { ok: false, message: "Enter your LinkedIn profile link, like linkedin.com/in/yourname." }
	const url = parseUrl(raw)
	if (!url || !hostIs(url, "linkedin.com")) return bad
	const [kind, slug] = url.pathname.split("/").filter(Boolean)
	if (!["in", "company", "school", "pub"].includes((kind || "").toLowerCase()) || !slug) return bad
	return { ok: true, value: `https://www.linkedin.com/${kind.toLowerCase()}/${slug}` }
}

function checkKnownPlatform(raw: string, platform: Platform): AnswerCheck {
	const bad: AnswerCheck = { ok: false, message: `Enter your ${platform.label} username or profile link.` }
	const trimmed = raw.trim()
	// A handle, with or without the @. Anything with a dot or slash must be a real link instead.
	if (/^@?[A-Za-z0-9_]{1,50}$/.test(trimmed)) return { ok: true, value: trimmed.replace(/^@/, "") }
	const url = parseUrl(trimmed)
	if (!url || !platform.domains.some((d) => hostIs(url, d))) return bad
	return { ok: true, value: url.toString() }
}

function checkWebsite(raw: string, message = "Enter a valid website, like yourwebsite.com."): AnswerCheck {
	const url = parseUrl(raw)
	if (!url) return { ok: false, message }
	return { ok: true, value: url.toString().replace(/\/$/, "") }
}

function checkPhone(raw: string): AnswerCheck {
	const digits = raw.replace(/[\s\-().]/g, "").replace(/^\+/, "")
	if (!/^\d{7,15}$/.test(digits)) return { ok: false, message: "Enter a valid phone number." }
	return { ok: true, value: raw.trim() }
}

const isEmpty = (value: unknown): boolean =>
	value === undefined || value === null || (typeof value === "string" && value.trim() === "")

/** Check ONE answer against its question. Empty is not this function's business — callers skip it. */
export function normalizeAnswer(question: ICustomQuestion, raw: unknown): AnswerCheck {
	if (typeof raw !== "string") return { ok: true, value: raw }

	if (question.type === "website") return checkWebsite(raw)
	if (question.type === "mobile") return checkPhone(raw)

	if (question.type === "social_profile") {
		const platform = (question.platform || "").toLowerCase()
		if (platform.includes("instagram")) return checkInstagram(raw)
		if (platform.includes("linkedin")) return checkLinkedIn(raw)
		const known = Object.entries(PLATFORMS).find(([key]) => platform.includes(key))
		const alias = platform === "x" ? PLATFORMS.twitter : known?.[1]
		if (alias) return checkKnownPlatform(raw, alias)
		return checkWebsite(raw, "Enter a valid profile link, like https://…")
	}

	return { ok: true, value: raw.trim() }
}

/**
 * Validate every answered question. `values` carries the NORMALISED answers (only ones that
 * passed), `errors` maps question id to a message. Unanswered questions are skipped — whether one
 * is required is `missingRequiredAnswers`' job.
 */
export function validateApplicationAnswers(
	questions: ICustomQuestion[],
	answers: Record<string, any>,
): { errors: Record<string, string>; values: Record<string, any> } {
	const errors: Record<string, string> = {}
	const values: Record<string, any> = {}

	for (const question of questions) {
		const raw = answers[question.id]
		if (isEmpty(raw)) continue
		const result = normalizeAnswer(question, raw)
		if (result.ok) values[question.id] = result.value
		else errors[question.id] = result.message
	}
	return { errors, values }
}

/** True only for a value that is safe to put in an `href`. */
export const isHttpUrl = (value: unknown): value is string => typeof value === "string" && /^https?:\/\/\S+$/i.test(value)

/** "https://www.instagram.com/foo" → "@foo"; anything else → the hostname + path, trimmed. */
export function displayProfileValue(value: string): string {
	try {
		const url = new URL(value)
		if (hostIs(url, "instagram.com")) return `@${firstSegment(url)}`
		return `${url.hostname.replace(/^www\./, "")}${url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "")}`
	} catch {
		return value
	}
}

import React from "react"
import axios from "axios"
import { Error as ErrorToast } from "@/lib/_toaster"

/**
 * Step 2 of the Premium application: the admin-configured questions (LinkedIn / Instagram /
 * Website by default — see `src/lib/premium-application.ts`), then "Continue to Secure Card
 * Setup", which starts the application row and redirects to the Stripe `mode: "setup"` session
 * that collects (but never charges) a card.
 *
 * Same visual language as `PlanComparison` (dark card, `bg-jetzy` gold pill buttons) so the
 * questionnaire reads as the next step of the same purchase, not a different page.
 */

export type ApplicationQuestion = {
	id: string
	title: string
	type: "text" | "options" | "multiple_choice" | "social_profile" | "company" | "checkbox" | "terms" | "mobile" | "website"
	isRequired?: boolean
	responseLength?: "short" | "multi-line"
	selectionType?: "single" | "multiple"
	options?: string[]
	platform?: string
	collectJobTitle?: boolean
	termsContentType?: "text" | "link"
	termsContent?: string
	collectSignature?: boolean
}

const placeholderFor = (q: ApplicationQuestion): string => {
	if (q.type === "website") return "https://yourwebsite.com"
	if (q.type === "social_profile") {
		const platform = (q.platform || "").toLowerCase()
		if (platform.includes("linkedin")) return "https://linkedin.com/in/username"
		if (platform.includes("instagram")) return "@yourhandle or https://instagram.com/username"
		return "https://…"
	}
	if (q.type === "mobile") return "Phone number"
	return "Your answer"
}

function QuestionField({ question, value, onChange }: { question: ApplicationQuestion; value: any; onChange: (v: any) => void }) {
	const inputClass =
		"w-full p-3 bg-[#090C10] border border-[#2b2b2b] rounded-lg focus:outline-none focus:border-[#F5C518] text-white placeholder-gray-500"

	if (question.type === "options" || question.type === "multiple_choice") {
		const opts = question.options || []
		if (question.selectionType === "multiple") {
			const selected: string[] = Array.isArray(value) ? value : []
			return (
				<div className="space-y-2">
					{opts.map((opt) => (
						<label key={opt} className="flex items-center gap-2 text-gray-300 text-sm">
							<input
								type="checkbox"
								checked={selected.includes(opt)}
								onChange={(e) => onChange(e.target.checked ? [...selected, opt] : selected.filter((o) => o !== opt))}
							/>
							{opt}
						</label>
					))}
				</div>
			)
		}
		return (
			<select className={inputClass} value={value || ""} onChange={(e) => onChange(e.target.value)}>
				<option value="">Select…</option>
				{opts.map((opt) => (
					<option key={opt} value={opt}>{opt}</option>
				))}
			</select>
		)
	}

	if (question.type === "checkbox") {
		return (
			<label className="flex items-center gap-2 text-gray-300 text-sm">
				<input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
				{question.title}
			</label>
		)
	}

	if (question.type === "company") {
		const v = value || {}
		return (
			<div className="space-y-2">
				<input className={inputClass} placeholder="Company name" value={v.company || ""} onChange={(e) => onChange({ ...v, company: e.target.value })} />
				{question.collectJobTitle && (
					<input className={inputClass} placeholder="Job title" value={v.jobTitle || ""} onChange={(e) => onChange({ ...v, jobTitle: e.target.value })} />
				)}
			</div>
		)
	}

	if (question.type === "terms") {
		const v = value || {}
		return (
			<div className="space-y-2">
				{question.termsContent && <p className="text-xs text-gray-400">{question.termsContent}</p>}
				<label className="flex items-center gap-2 text-gray-300 text-sm">
					<input type="checkbox" checked={!!v.agreed} onChange={(e) => onChange({ ...v, agreed: e.target.checked })} />
					I agree
				</label>
				{question.collectSignature && (
					<input className={inputClass} placeholder="Type your name as signature" value={v.signature || ""} onChange={(e) => onChange({ ...v, signature: e.target.value })} />
				)}
			</div>
		)
	}

	if (question.type === "text" && question.responseLength === "multi-line") {
		return <textarea rows={3} className={`${inputClass} resize-none`} placeholder={placeholderFor(question)} value={value || ""} onChange={(e) => onChange(e.target.value)} />
	}

	return (
		<input
			type={question.type === "mobile" ? "tel" : question.type === "website" || question.type === "social_profile" ? "url" : "text"}
			className={inputClass}
			placeholder={placeholderFor(question)}
			value={value || ""}
			onChange={(e) => onChange(e.target.value)}
		/>
	)
}

export default function PremiumApplicationQuestions({
	open,
	onClose,
	onBack,
	questions,
	interval,
	returnTo,
}: {
	open: boolean
	onClose: () => void
	onBack?: () => void
	questions: ApplicationQuestion[]
	interval?: string
	returnTo: string
}) {
	const [answers, setAnswers] = React.useState<Record<string, any>>({})
	const [submitting, setSubmitting] = React.useState(false)
	const [error, setError] = React.useState<string | null>(null)

	if (!open) return null

	const hasAnyProfile = questions.some((q) => q.type === "social_profile" || q.type === "website") && Object.values(answers).some((v) => v && String(v).trim())

	const submit = async () => {
		const missing = questions.filter((q) => q.isRequired).filter((q) => {
			const v = answers[q.id]
			if (Array.isArray(v)) return v.length === 0
			return v === undefined || v === null || String(v).trim() === ""
		})
		if (missing.length > 0) {
			setError(`Please answer: ${missing.map((q) => q.title).join(", ")}`)
			return
		}
		setError(null)
		setSubmitting(true)
		try {
			const startRes = await axios.post("/api/premium/applications/start", { interval: interval === "year" ? "year" : "month", answers })
			const applicationId = startRes.data?.data?.applicationId
			const checkoutRes = await axios.post("/api/premium/applications/checkout", { applicationId, returnTo })
			const url = checkoutRes.data?.data?.url
			if (url) {
				window.location.href = url
			} else {
				setError("Could not start card setup. Please try again.")
			}
		} catch (err: any) {
			const message = err?.response?.data?.message || "Could not submit your application. Please try again."
			setError(message)
			ErrorToast("Error", message)
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
			<div className="w-full max-w-md bg-[#141414] border border-[#2b2b2b] rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-2">
						<span className="text-xs font-bold px-2 py-1 rounded-full bg-[#2b2b2b] text-[#F5C518]">★ EXCLUSIVE MEMBERSHIP REVIEW</span>
						<span className="text-xs px-2 py-1 rounded-full border border-[#2b2b2b] text-gray-400">STEP 2 OF 3</span>
					</div>
					<button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
				</div>

				<h2 className="text-xl font-bold text-white mb-1">Help us get to know you</h2>
				<p className="text-sm text-gray-400 mb-4">
					Jetzy Premium is an exclusive community. Share your social or professional profiles so our
					team can better understand your background and review your membership request.
				</p>

				<div className="bg-[#1f1a0d] border border-[#3a2f12] rounded-lg p-3 mb-4">
					<p className="text-xs text-[#F5C518] font-bold mb-1">⚡ FAST-TRACK REVIEW SIGNAL</p>
					<p className="text-xs text-gray-400">The more information you provide, the better we can understand your profile and the higher your chance of becoming part of the Jetzy Premium community.</p>
				</div>

				<div className="space-y-4 mb-4">
					{questions.map((q) => (
						<div key={q.id}>
							<div className="flex items-center justify-between mb-1">
								<label className="text-sm text-white font-medium">{q.title}</label>
								<span className="text-xs text-gray-500">{q.isRequired ? "Required" : "Optional"}</span>
							</div>
							<QuestionField question={q} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
						</div>
					))}
				</div>

				{!hasAnyProfile && questions.length > 0 && (
					<p className="flex items-center gap-1 text-xs text-green-500 mb-4">
						✓ At least one profile is recommended. Your first month will remain completely free upon approval.
					</p>
				)}

				{error && <p className="text-sm text-red-400 mb-4">{error}</p>}

				<button
					onClick={submit}
					disabled={submitting}
					className="w-full bg-jetzy text-black font-bold px-6 py-3 rounded-full hover:opacity-90 transition-colors disabled:opacity-50 mb-2"
				>
					{submitting ? "Please wait…" : "Continue to Secure Card Setup →"}
				</button>
				{onBack && (
					<button onClick={onBack} disabled={submitting} className="w-full text-gray-400 hover:text-white text-sm py-2">
						← Back
					</button>
				)}

				<p className="flex items-center gap-1 text-xs text-gray-500 mt-2">
					🔒 Your information is kept strictly confidential and reviewed only by the Jetzy membership committee.
				</p>
			</div>
		</div>
	)
}

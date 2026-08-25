import React from "react"
import { signIn } from "next-auth/react"
import axios from "axios"
import Spinner from "@Jetzy/components/misc/Spinner"

/**
 * Email + 6-digit code, in place of sending someone to /login.
 *
 * Only ever shown on a shared referral link. Somebody who arrives from an email about a free
 * membership and is asked to invent a password does not come back, so the account is made for
 * them: the code proves the address, the server mints a magic token, and NextAuth creates the
 * record on sign-in. No password is ever chosen, and none is needed afterwards — they can sign in
 * the same way any time.
 *
 * The dialog owns proving the address and nothing else. What happens next — re-checking the offer
 * against the now-known account, then Stripe — belongs to the page, which already has that path
 * for people returning from login.
 */

const RESEND_SECONDS = 60

export default function EmailVerifyDialog({
	open,
	eventId,
	referralCode,
	months,
	onClose,
	onVerified,
}: {
	open: boolean
	/** The event the shared code belongs to. Both endpoints are scoped by it. */
	eventId: string
	referralCode: string
	/** Free months, so the dialog can say what is being claimed. */
	months?: number
	onClose: () => void
	/** Fired once the session exists. The page takes it from here. */
	onVerified: () => void
}) {
	const [step, setStep] = React.useState<"email" | "code">("email")
	const [email, setEmail] = React.useState("")
	const [otp, setOtp] = React.useState("")
	const [error, setError] = React.useState<string | null>(null)
	const [busy, setBusy] = React.useState(false)
	const [cooldown, setCooldown] = React.useState(0)

	React.useEffect(() => {
		if (!open) {
			setStep("email")
			setOtp("")
			setError(null)
			setBusy(false)
		}
	}, [open])

	// Counts the resend cooldown down so the button explains itself rather than just failing.
	React.useEffect(() => {
		if (cooldown <= 0) return
		const timer = setTimeout(() => setCooldown((n) => n - 1), 1000)
		return () => clearTimeout(timer)
	}, [cooldown])

	if (!open) return null

	const sendCode = async () => {
		setBusy(true)
		setError(null)
		try {
			await axios.post("/api/premium/send-code", { email: email.trim(), event: eventId, code: referralCode })
			setStep("code")
			setCooldown(RESEND_SECONDS)
		} catch (err: any) {
			setError(err?.response?.data?.message || "We couldn't send that code. Please try again.")
		} finally {
			setBusy(false)
		}
	}

	const verify = async () => {
		setBusy(true)
		setError(null)
		try {
			const { data } = await axios.post("/api/premium/verify-code", { email: email.trim(), event: eventId, otp: otp.trim() })
			const magicToken = data?.data?.magicToken
			if (!magicToken) throw new Error("no token")

			// The account is created here if it didn't exist — NextAuth's authorize does it from
			// the token. `redirect: false` because the page continues on its own.
			const result = await signIn("credentials", { magicToken, redirect: false })
			if (result?.error) throw new Error(result.error)

			onVerified()
		} catch (err: any) {
			setError(err?.response?.data?.message || "That code didn't work. Check it and try again.")
			setBusy(false)
		}
	}

	const offer = months && months > 0 ? `${months} month${months === 1 ? "" : "s"} free` : "your free months"

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true" aria-label="Confirm your email">
			<div className="w-full max-w-md rounded-2xl border border-[#2b2b2b] bg-[#141414] p-6 text-white">
				<div className="flex items-start justify-between gap-4">
					<h2 className="text-lg font-bold">{step === "email" ? "Confirm your email" : "Enter your code"}</h2>
					<button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white">
						✕
					</button>
				</div>

				{step === "email" ? (
					<>
						<p className="mt-2 text-sm text-gray-400">
							We&apos;ll email you a 6-digit code to claim <span style={{ color: "#F5C518" }}>{offer}</span> of Jetzy Premium. No password needed.
						</p>
						<label htmlFor="premium-verify-email" className="mt-5 block text-xs text-gray-400">
							Email address
						</label>
						<input
							id="premium-verify-email"
							type="email"
							inputMode="email"
							autoComplete="email"
							autoFocus
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && email.trim() && !busy) sendCode()
							}}
							placeholder="you@example.com"
							className="mt-1 w-full rounded-xl border-2 border-[#2b2b2b] bg-[#0f0f0f] px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-jetzy focus:outline-none"
						/>
						{error && <p className="mt-2 text-sm text-red-400">{error}</p>}
						<button
							onClick={sendCode}
							disabled={busy || !email.trim()}
							className="mt-5 w-full rounded-full bg-jetzy px-6 py-3 font-bold text-black transition-colors hover:opacity-90 disabled:opacity-50"
						>
							{busy ? <Spinner /> : "Send code"}
						</button>
					</>
				) : (
					<>
						<p className="mt-2 text-sm text-gray-400">
							We sent a code to <span className="text-white">{email.trim()}</span>. It expires in 10 minutes.
						</p>
						<label htmlFor="premium-verify-otp" className="mt-5 block text-xs text-gray-400">
							6-digit code
						</label>
						<input
							id="premium-verify-otp"
							type="text"
							inputMode="numeric"
							autoComplete="one-time-code"
							autoFocus
							maxLength={6}
							value={otp}
							onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
							onKeyDown={(e) => {
								if (e.key === "Enter" && otp.trim().length >= 4 && !busy) verify()
							}}
							placeholder="123456"
							className="mt-1 w-full rounded-xl border-2 border-[#2b2b2b] bg-[#0f0f0f] px-3 py-2.5 text-center text-xl tracking-[0.5em] text-white placeholder:tracking-normal placeholder:text-gray-500 focus:border-jetzy focus:outline-none"
						/>
						{error && <p className="mt-2 text-sm text-red-400">{error}</p>}
						<button
							onClick={verify}
							disabled={busy || otp.trim().length < 4}
							className="mt-5 w-full rounded-full bg-jetzy px-6 py-3 font-bold text-black transition-colors hover:opacity-90 disabled:opacity-50"
						>
							{busy ? <Spinner /> : "Confirm and continue"}
						</button>
						<div className="mt-4 flex items-center justify-between text-xs">
							<button
								onClick={() => {
									setStep("email")
									setOtp("")
									setError(null)
								}}
								className="text-gray-400 underline underline-offset-2 hover:text-white"
							>
								Use a different email
							</button>
							<button
								onClick={sendCode}
								disabled={busy || cooldown > 0}
								className="text-gray-400 underline underline-offset-2 hover:text-white disabled:no-underline disabled:opacity-50"
							>
								{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	)
}

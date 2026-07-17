import React from "react"
import { GetServerSideProps } from "next"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/router"
import { ErrorMessage, Field, Form, Formik } from "formik"
import { AiOutlineEye, AiOutlineEyeInvisible } from "react-icons/ai"
import { signIn } from "next-auth/react"
import { unauthorizedOnly } from "@Jetzy/lib/authSession"
import { ROUTES } from "@Jetzy/configs/routes"
import { completeSignupValidation } from "@Jetzy/lib/validator/authValidtor"
import Logo from "@Jetzy/assets/logo/logo.png"
import Spinner from "@Jetzy/components/misc/Spinner"

type ValidationState =
	| { kind: "loading" }
	| { kind: "invalid"; reason: string }
	| { kind: "valid"; email: string; firstName?: string }

export default function VerifySignupPage() {
	const router = useRouter()
	const [state, setState] = React.useState<ValidationState>({ kind: "loading" })
	const [submitting, setSubmitting] = React.useState(false)
	const [submitError, setSubmitError] = React.useState<string | null>(null)
	const [showPassword, setShowPassword] = React.useState(false)
	const [showConfirm, setShowConfirm] = React.useState(false)

	const [resendEmail, setResendEmail] = React.useState("")
	const [resending, setResending] = React.useState(false)
	const [resendNote, setResendNote] = React.useState<string | null>(null)

	const token = typeof router.query.token === "string" ? router.query.token : ""
	// Only accept same-origin relative paths (starts with a single "/") to avoid an
	// open redirect — _cb rides in on an email link and is attacker-craftable.
	const rawCb = typeof router.query._cb === "string" ? router.query._cb : ""
	const cb = rawCb.startsWith("/") && !rawCb.startsWith("//") ? rawCb : ""

	React.useEffect(() => {
		if (!router.isReady) return
		if (!token) {
			setState({ kind: "invalid", reason: "Missing verification token." })
			return
		}

		;(async () => {
			try {
				const res = await fetch(`/api/auth/verify-token?token=${encodeURIComponent(token)}`)
				const json = await res.json()
				if (res.ok && json?.status && json?.data?.email) {
					setState({ kind: "valid", email: json.data.email, firstName: json.data.firstName })
				} else {
					setState({ kind: "invalid", reason: json?.message || "Invalid or expired link." })
				}
			} catch {
				setState({ kind: "invalid", reason: "Could not validate link. Please try again." })
			}
		})()
	}, [router.isReady, token])

	const handleSubmit = async (values: { password: string; confirmPassword: string }) => {
		if (state.kind !== "valid") return
		setSubmitting(true)
		setSubmitError(null)

		try {
			const res = await fetch("/api/auth/complete-signup", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token, password: values.password }),
			})
			const json = await res.json()
			if (!res.ok || !json?.status) {
				setSubmitError(json?.message || "Could not finish signup.")
				setSubmitting(false)
				return
			}

			const signInRes = await signIn("credentials", {
				email: state.email,
				password: values.password,
				redirect: false,
			})

			if (signInRes?.error || !signInRes?.ok) {
				setSubmitError("Account created, but auto-login failed. Please log in manually.")
				router.push(cb ? `${ROUTES.login}?_cb=${encodeURIComponent(cb)}` : ROUTES.login)
				return
			}

			router.push(cb || ROUTES.home)
		} catch (err: any) {
			setSubmitError(err?.message || "Network error.")
			setSubmitting(false)
		}
	}

	const handleResend = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!resendEmail.trim()) return
		setResending(true)
		setResendNote(null)
		try {
			await fetch("/api/auth/resend-verification", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: resendEmail.trim() }),
			})
			setResendNote("If an unverified account exists for that email, a new link was sent.")
		} catch {
			setResendNote("Could not send. Try again.")
		} finally {
			setResending(false)
		}
	}

	return (
		<div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
			<div className="sm:mx-auto sm:w-full sm:max-w-sm">
				<Image className="mx-auto h-20 w-auto" src={Logo} alt="Jetzy Life" />
				<h2 className="mt-10 text-center text-2xl font-bold leading-9 tracking-tight">
					{state.kind === "valid"
						? "Choose a password"
						: state.kind === "loading"
						? "Verifying..."
						: "Link unavailable"}
				</h2>
			</div>

			<div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm bg-[#1E1E1E] p-5 rounded-lg">
				{state.kind === "loading" && (
					<div className="flex justify-center py-8">
						<Spinner />
					</div>
				)}

				{state.kind === "invalid" && (
					<div className="space-y-4">
						<p className="text-sm text-gray-300">{state.reason}</p>
						<p className="text-sm text-gray-400">Enter your email to receive a new verification link:</p>
						<form onSubmit={handleResend} className="space-y-3">
							<input
								type="email"
								required
								value={resendEmail}
								onChange={(e) => setResendEmail(e.target.value)}
								placeholder="you@example.com"
								className="bg-[#1E1E1E] dark-autofill text-white block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-app focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3"
							/>
							<button
								type="submit"
								disabled={resending}
								className="flex w-full justify-center rounded-md bg-app disabled:bg-app/50 px-3 py-1.5 text-sm font-semibold leading-6 text-black shadow-sm hover:bg-app/50 p-3"
							>
								{resending ? <Spinner /> : "Send new link"}
							</button>
							{resendNote && <p className="text-xs text-gray-400">{resendNote}</p>}
						</form>
						<p className="mt-6 text-center text-sm text-gray-500">
							<Link href={ROUTES.login} className="text-app hover:underline">
								Back to login
							</Link>
						</p>
					</div>
				)}

				{state.kind === "valid" && (
					<>
						<p className="text-sm text-gray-300 mb-4">
							Verified <span className="text-white font-semibold">{state.email}</span>. Pick a password to sign in.
						</p>
						<Formik
							initialValues={{ password: "", confirmPassword: "" }}
							onSubmit={handleSubmit}
							validationSchema={completeSignupValidation}
						>
							{({ values, handleChange }) => (
								<Form className="space-y-6">
									<div>
										<label htmlFor="password" className="block text-sm font-medium leading-6">
											Password
										</label>
										<div className="mt-2 relative">
											<Field
												id="password"
												name="password"
												value={values?.password}
												onChange={handleChange}
												type={showPassword ? "text" : "password"}
												autoComplete="new-password"
												className="bg-[#1E1E1E] dark-autofill text-white block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-app focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3 pr-10"
											/>
											<button
												type="button"
												onClick={() => setShowPassword(!showPassword)}
												className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
											>
												{showPassword ? <AiOutlineEyeInvisible size={20} /> : <AiOutlineEye size={20} />}
											</button>
										</div>
										<ErrorMessage name="password" component="span" className="text-red-500 block mt-1 text-xs" />
									</div>

									<div>
										<label htmlFor="confirmPassword" className="block text-sm font-medium leading-6">
											Confirm Password
										</label>
										<div className="mt-2 relative">
											<Field
												id="confirmPassword"
												name="confirmPassword"
												value={values?.confirmPassword}
												onChange={handleChange}
												type={showConfirm ? "text" : "password"}
												autoComplete="new-password"
												className="bg-[#1E1E1E] dark-autofill text-white block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-app focus:ring-2 focus:ring-inset focus:ring-app sm:text-sm sm:leading-6 p-3 pr-10"
											/>
											<button
												type="button"
												onClick={() => setShowConfirm(!showConfirm)}
												className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
											>
												{showConfirm ? <AiOutlineEyeInvisible size={20} /> : <AiOutlineEye size={20} />}
											</button>
										</div>
										<ErrorMessage name="confirmPassword" component="span" className="text-red-500 block mt-1 text-xs" />
									</div>

									{submitError && <p className="text-red-500 text-sm">{submitError}</p>}

									<button
										disabled={submitting}
										type="submit"
										className="flex w-full justify-center rounded-md bg-app disabled:bg-app/50 px-3 py-1.5 text-sm font-semibold leading-6 text-black shadow-sm hover:bg-app/50 p-3"
									>
										{submitting ? <Spinner /> : "Finish & sign in"}
									</button>
								</Form>
							)}
						</Formik>
					</>
				)}
			</div>
		</div>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	return unauthorizedOnly(context)
}



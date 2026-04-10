import React, { useState, useEffect } from "react"
import Head from "next/head"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/router"
import { signIn } from "next-auth/react"
import Logo from "@Jetzy/assets/logo/logo.png"

type Step = "EMAIL" | "CODE"

export default function LoginOTPPage() {
    const router = useRouter()
    const { email: queryEmail } = router.query

    const [step, setStep] = useState<Step>("EMAIL")
    const [email, setEmail] = useState("")
    const [code, setCode] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState("")
    const [message, setMessage] = useState("")

    useEffect(() => {
        if (queryEmail) setEmail(decodeURIComponent(queryEmail as string))
    }, [queryEmail])

    const handleSendCode = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")
        setIsLoading(true)
        try {
            const res = await fetch("/api/auth/send-login-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim() }),
            })
            const data = await res.json()
            if (res.ok) {
                setStep("CODE")
                setMessage("Check your inbox — a login code has been sent.")
            } else {
                if (data.error === "ACCOUNT_BLOCKED") {
                    setError("Your email didn't verify. Kindly input your correct email address.")
                } else {
                    setError(data.error || "Failed to send code. Please try again.")
                }
            }
        } catch {
            setError("Something went wrong. Please try again.")
        } finally {
            setIsLoading(false)
        }
    }

    const handleVerifyCode = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")
        setIsLoading(true)
        try {
            const res = await fetch("/api/auth/verify-login-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim(), code: code.trim() }),
            })
            const data = await res.json()

            if (!res.ok) {
                setError(data.error || "Incorrect code. Please try again.")
                setIsLoading(false)
                return
            }

            // Use the returned magic token to sign in via NextAuth
            const result = await signIn("credentials", {
                magicToken: data.magicToken,
                redirect: false,
            })

            if (result?.error) {
                setError("Login failed. Please try requesting a new code.")
                setIsLoading(false)
            } else {
                router.push("/")
            }
        } catch {
            setError("Something went wrong. Please try again.")
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-black flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <Head>
                <title>Login with Code | Jetzy</title>
            </Head>

            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <Image className="mx-auto h-20 w-auto" src={Logo} alt="Jetzy" />
                <h2 className="mt-6 text-center text-2xl font-bold text-white">
                    {step === "EMAIL" ? "Sign in without a password" : "Enter your login code"}
                </h2>
                <p className="mt-2 text-center text-sm text-gray-400">
                    {step === "EMAIL"
                        ? "We'll send a one-time code to your email."
                        : `We sent a 6-digit code to ${email}`}
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-[#1E1E1E] py-8 px-6 shadow rounded-2xl border border-[#434343]">

                    {step === "EMAIL" && (
                        <form className="space-y-5" onSubmit={handleSendCode}>
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                                    Email address
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="block w-full px-3 py-2.5 bg-black border border-[#434343] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#F79432] focus:border-[#F79432] text-sm"
                                    placeholder="you@example.com"
                                />
                            </div>
                            {error && <p className="text-red-400 text-sm">{error}</p>}
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-2.5 bg-[#F79432] text-white font-semibold rounded-full hover:bg-[#e8842a] transition-colors text-sm disabled:opacity-50"
                            >
                                {isLoading ? "Sending..." : "Send Login Code"}
                            </button>
                            <p className="text-center text-sm text-gray-500">
                                Know your password?{" "}
                                <Link href="/login" className="text-[#F79432] hover:underline">
                                    Sign in instead
                                </Link>
                            </p>
                        </form>
                    )}

                    {step === "CODE" && (
                        <form className="space-y-5" onSubmit={handleVerifyCode}>
                            {message && <p className="text-green-400 text-sm text-center">{message}</p>}
                            <input
                                type="text"
                                maxLength={6}
                                required
                                value={code}
                                autoFocus
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                                className="block w-full text-center tracking-[0.5em] text-3xl font-bold px-3 py-5 bg-black border border-[#434343] rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-[#F79432] focus:border-[#F79432]"
                                placeholder="000000"
                            />
                            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                            <button
                                type="submit"
                                disabled={isLoading || code.length !== 6}
                                className="w-full py-3 bg-[#F79432] text-white font-semibold rounded-full hover:bg-[#e8842a] transition-colors disabled:opacity-50 text-sm"
                            >
                                {isLoading ? "Signing you in..." : "Verify & Sign In"}
                            </button>
                            <div className="flex flex-col items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleSendCode}
                                    disabled={isLoading}
                                    className="text-sm text-gray-400 hover:text-[#F79432] transition-colors"
                                >
                                    Didn&apos;t receive it? Resend code
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setStep("EMAIL"); setCode(""); setError(""); }}
                                    className="text-sm text-gray-500 hover:text-white transition-colors"
                                >
                                    ← Use a different email
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}

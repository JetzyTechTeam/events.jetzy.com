import React, { useState, useEffect } from "react"
import Head from "next/head"
import Image from "next/image"
import { useRouter } from "next/router"
import Logo from "@Jetzy/assets/logo/logo.png"

type Step = "EMAIL" | "CODE" | "SUCCESS"

export default function VerifyPage() {
    const router = useRouter()
    const { email: queryEmail, mode } = router.query
    const isRecoverMode = mode === "recover"

    const [step, setStep] = useState<Step>("EMAIL")
    const [email, setEmail] = useState("")
    const [code, setCode] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState("")
    const [message, setMessage] = useState("")

    useEffect(() => {
        if (queryEmail) setEmail(decodeURIComponent(queryEmail as string))
    }, [queryEmail])

    const handleSendCode = async (e?: React.FormEvent) => {
        e?.preventDefault()
        setError("")
        setIsLoading(true)
        try {
            const res = await fetch("/api/auth/verify/send-code", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim() }),
            })
            const data = await res.json()
            if (res.ok) {
                setStep("CODE")
                setMessage("A 6-digit code has been sent to your email.")
            } else {
                setError(data.error || "Failed to send code.")
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
            const res = await fetch("/api/auth/verify/confirm-code", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim(), code: code.trim(), mode: isRecoverMode ? "recover" : "compliance" }),
            })
            const data = await res.json()
            if (res.ok) {
                setStep("SUCCESS")
            } else {
                setError(data.error || "Invalid code. Please try again.")
            }
        } catch {
            setError("Something went wrong. Please try again.")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <Head>
                <title>{isRecoverMode ? "Recover Your Account" : "Verify Your Account"} | Jetzy</title>
            </Head>

            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <Image className="mx-auto h-20 w-auto" src={Logo} alt="Jetzy" />
                <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                    {isRecoverMode ? "Recover Your Account" : "Verify Your Email"}
                </h2>
                <p className="mt-2 text-center text-sm text-gray-500">
                    {isRecoverMode
                        ? "Enter your email and we'll send you a code to prove it's really you."
                        : "Enter your email to receive a verification code."}
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-6 shadow rounded-2xl">

                    {/* Step 1: Email */}
                    {step === "EMAIL" && (
                        <form className="space-y-5" onSubmit={handleSendCode}>
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                                    Your Email Address
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-[#F79432] focus:border-[#F79432] text-sm text-gray-900"
                                    placeholder="you@example.com"
                                />
                            </div>
                            {error && <p className="text-red-600 text-sm">{error}</p>}
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-2.5 px-4 bg-[#F79432] text-white font-semibold rounded-full hover:bg-[#e8842a] transition-colors text-sm"
                            >
                                {isLoading ? "Sending..." : "Send Verification Code"}
                            </button>
                        </form>
                    )}

                    {/* Step 2: Enter Code */}
                    {step === "CODE" && (
                        <form className="space-y-5" onSubmit={handleVerifyCode}>
                            <div className="text-center mb-2">
                                <p className="text-sm text-gray-600">We sent a 6-digit code to</p>
                                <p className="font-bold text-gray-900">{email}</p>
                                {message && <p className="text-green-600 text-sm mt-1">{message}</p>}
                            </div>
                            <input
                                type="text"
                                maxLength={6}
                                required
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                                className="block w-full text-center tracking-[0.5em] text-2xl font-bold px-3 py-4 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-[#F79432] focus:border-[#F79432] text-gray-900"
                                placeholder="000000"
                            />
                            {error && <p className="text-red-600 text-sm text-center">{error}</p>}
                            <button
                                type="submit"
                                disabled={isLoading || code.length !== 6}
                                className="w-full py-3 bg-[#F79432] text-white font-semibold rounded-full hover:bg-[#e8842a] transition-colors disabled:opacity-50 text-sm"
                            >
                                {isLoading ? "Verifying..." : "Confirm Code"}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setStep("EMAIL"); setCode(""); setError(""); }}
                                className="w-full text-sm text-gray-400 hover:text-[#F79432] underline"
                            >
                                Use a different email
                            </button>
                        </form>
                    )}

                    {/* Step 3: Success */}
                    {step === "SUCCESS" && (
                        <div className="text-center space-y-5">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100">
                                <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">
                                {isRecoverMode ? "Account Recovered!" : "Identity Verified!"}
                            </h3>
                            <p className="text-sm text-gray-500">
                                {isRecoverMode
                                    ? "Your account has been successfully unblocked. You can now log in."
                                    : "Thank you. Our team will review your request and unblock your account shortly. You'll receive an email once it's done."}
                            </p>
                            <button
                                onClick={() => router.push("/login")}
                                className="w-full py-2.5 bg-[#F79432] text-white font-semibold rounded-full hover:bg-[#e8842a] transition-colors text-sm"
                            >
                                Go to Login
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

import React, { useState, useEffect } from "react"
import Head from "next/head"
import Image from "next/image"
import { useRouter } from "next/router"
import Logo from "@Jetzy/assets/logo/logo.png"

type Step = "EMAIL" | "CODE" | "SUCCESS"

export default function VerifyCompliancePage() {
    const router = useRouter()
    const { email: queryEmail } = router.query

    const [step, setStep] = useState<Step>("EMAIL")
    const [email, setEmail] = useState("")
    const [code, setCode] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState("")
    const [message, setMessage] = useState("")

    useEffect(() => {
        if (queryEmail) {
            setEmail(decodeURIComponent(queryEmail as string))
        }
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
                setMessage("Verification code sent to your email.")
            } else {
                setError(data.error || "Failed to send code.")
            }
        } catch (err) {
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
                body: JSON.stringify({ email: email.trim(), code: code.trim() }),
            })
            const data = await res.json()

            if (res.ok) {
                setStep("SUCCESS")
            } else {
                setError(data.error || "Invalid verification code.")
            }
        } catch (err) {
            setError("Something went wrong. Please try again.")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <Head>
                <title>Account Verification | Jetzy</title>
            </Head>

            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <Image className="mx-auto h-20 w-auto" src={Logo} alt="Jetzy Life" />
                <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                    Mandatory Verification
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    Prove your identity to reactivate your account.
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
                    {step === "EMAIL" && (
                        <form className="space-y-6" onSubmit={handleSendCode}>
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                                    Email address
                                </label>
                                <div className="mt-1">
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-[#F79432] focus:border-[#F79432] sm:text-sm text-gray-900"
                                        placeholder="Enter your registered email"
                                    />
                                </div>
                                <p className="mt-2 text-xs text-gray-500">
                                    If you previously entered the wrong email, please correct it above.
                                </p>
                            </div>

                            {error && <p className="text-red-600 text-sm">{error}</p>}

                            <div>
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#F79432] hover:bg-[#e8842a] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#F79432]"
                                >
                                    {isLoading ? "Sending..." : "Send Verification Code"}
                                </button>
                            </div>
                        </form>
                    )}

                    {step === "CODE" && (
                        <form className="space-y-6" onSubmit={handleVerifyCode}>
                            <div>
                                <label htmlFor="code" className="block text-sm font-medium text-gray-700 text-center mb-4">
                                    We sent a 6-digit code to <br />
                                    <span className="font-bold text-gray-900">{email}</span>
                                </label>
                                <div className="mt-1">
                                    <input
                                        id="code"
                                        name="code"
                                        type="text"
                                        maxLength={6}
                                        required
                                        value={code}
                                        onChange={(e) => setCode(e.target.value)}
                                        className="appearance-none block w-full text-center tracking-[0.5em] text-2xl px-3 py-4 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-[#F79432] focus:border-[#F79432] text-gray-900"
                                        placeholder="000000"
                                    />
                                </div>
                            </div>

                            {message && <p className="text-green-600 text-sm text-center font-medium">{message}</p>}
                            {error && <p className="text-red-600 text-sm text-center">{error}</p>}

                            <div className="flex flex-col space-y-3">
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-base font-bold text-white bg-[#F79432] hover:bg-[#e8842a] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#F79432]"
                                >
                                    {isLoading ? "Verifying..." : "Verify Code"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStep("EMAIL")}
                                    className="text-sm font-semibold text-[#F79432] hover:text-[#e8842a] underline"
                                >
                                    Edit Email / Fix Typo
                                </button>
                            </div>
                        </form>
                    )}

                    {step === "SUCCESS" && (
                        <div className="text-center space-y-6">
                            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                                <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-medium text-gray-900">Email Verified!</h3>
                            <p className="text-sm text-gray-500">
                                Your account is now being reviewed by our compliance team. 
                                We will send you an email once your account has been unblocked.
                            </p>
                            <div className="pt-4">
                                <button
                                    onClick={() => router.push("/login")}
                                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#F79432] hover:bg-[#e8842a]"
                                >
                                    Go back to Login
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

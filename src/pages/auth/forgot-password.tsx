import React, { useState } from "react"
import Head from "next/head"
import Image from "next/image"
import Link from "next/link"
import Logo from "@Jetzy/assets/logo/logo.png"

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState("")
    const [sent, setSent] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")
        setIsLoading(true)
        try {
            const res = await fetch("/api/auth/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim() }),
            })
            const data = await res.json()
            if (res.ok) {
                setSent(true)
            } else {
                setError(data.error || "Something went wrong. Please try again.")
            }
        } catch {
            setError("Something went wrong. Please try again.")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-black flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <Head>
                <title>Forgot Password | Jetzy</title>
            </Head>

            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <Image className="mx-auto h-20 w-auto" src={Logo} alt="Jetzy" />
                <h2 className="mt-6 text-center text-2xl font-bold text-white">
                    {sent ? "Check your email" : "Forgot your password?"}
                </h2>
                <p className="mt-2 text-center text-sm text-gray-400">
                    {sent
                        ? "If that email is registered, a reset link has been sent."
                        : "Enter your email and we'll send you a link to reset your password."}
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-[#1E1E1E] py-8 px-6 shadow rounded-2xl border border-[#434343]">
                    {!sent ? (
                        <form className="space-y-5" onSubmit={handleSubmit}>
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
                                {isLoading ? "Sending..." : "Send Reset Link"}
                            </button>
                            <p className="text-center text-sm text-gray-500">
                                Remembered it?{" "}
                                <Link href="/login" className="text-[#F79432] hover:underline">
                                    Back to login
                                </Link>
                            </p>
                        </form>
                    ) : (
                        <div className="text-center space-y-5">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-900/40">
                                <svg className="h-8 w-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <p className="text-gray-400 text-sm">Check your inbox and click the link to reset your password. The link expires in 30 minutes.</p>
                            <Link href="/login" className="block w-full py-2.5 bg-[#F79432] text-white font-semibold rounded-full hover:bg-[#e8842a] transition-colors text-sm text-center">
                                Back to Login
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

import React, { useState } from "react"
import Head from "next/head"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/router"
import Logo from "@Jetzy/assets/logo/logo.png"

export default function ResetPasswordPage() {
    const router = useRouter()
    const { token, email } = router.query

    const [password, setPassword] = useState("")
    const [confirm, setConfirm] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState("")
    const [done, setDone] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")

        if (password !== confirm) {
            setError("Passwords do not match.")
            return
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters.")
            return
        }

        setIsLoading(true)
        try {
            const res = await fetch("/api/auth/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, email, password }),
            })
            const data = await res.json()
            if (res.ok) {
                setDone(true)
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
                <title>Reset Password | Jetzy</title>
            </Head>

            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <Image className="mx-auto h-20 w-auto" src={Logo} alt="Jetzy" />
                <h2 className="mt-6 text-center text-2xl font-bold text-white">
                    {done ? "Password Updated!" : "Set a new password"}
                </h2>
                <p className="mt-2 text-center text-sm text-gray-400">
                    {done ? "You can now log in with your new password." : "Choose a strong password for your account."}
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-[#1E1E1E] py-8 px-6 shadow rounded-2xl border border-[#434343]">
                    {!done ? (
                        <form className="space-y-5" onSubmit={handleSubmit}>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">New Password</label>
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full px-3 py-2.5 bg-black border border-[#434343] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#F79432] focus:border-[#F79432] text-sm"
                                    placeholder="Minimum 8 characters"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Confirm Password</label>
                                <input
                                    type="password"
                                    required
                                    value={confirm}
                                    onChange={(e) => setConfirm(e.target.value)}
                                    className="block w-full px-3 py-2.5 bg-black border border-[#434343] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#F79432] focus:border-[#F79432] text-sm"
                                    placeholder="Re-enter password"
                                />
                            </div>
                            {error && <p className="text-red-400 text-sm">{error}</p>}
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-2.5 bg-[#F79432] text-white font-semibold rounded-full hover:bg-[#e8842a] transition-colors text-sm disabled:opacity-50"
                            >
                                {isLoading ? "Updating..." : "Update Password"}
                            </button>
                        </form>
                    ) : (
                        <div className="text-center space-y-5">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-900/40">
                                <svg className="h-8 w-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <Link href="/login" className="block w-full py-2.5 bg-[#F79432] text-white font-semibold rounded-full hover:bg-[#e8842a] transition-colors text-sm text-center">
                                Go to Login
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

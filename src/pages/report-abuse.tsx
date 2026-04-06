import React, { useEffect, useState } from "react"
import Head from "next/head"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/router"
import LogoImage from "@Jetzy/assets/qrscanner signup/jetzy logo 2.png"
import BgImage from "@Jetzy/assets/qrscanner signup/Rectangle background.png"

export default function ReportAbusePage() {
    const router = useRouter()
    const { status } = router.query
    const isSuccess = status !== "error"
    const [countdown, setCountdown] = useState(10)

    useEffect(() => {
        if (!isSuccess) return
        const timer = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timer)
                    router.push("/jetzyqrsignup")
                    return 0
                }
                return prev - 1
            })
        }, 1000)
        return () => clearInterval(timer)
    }, [isSuccess, router])

    return (
        <div className="relative min-h-screen w-full font-sans text-gray-900 overflow-hidden flex flex-col items-center bg-gradient-to-br from-[#fdf2f8] via-[#f5f3ff] to-[#f0f9ff]">
            <Head>
                <title>{isSuccess ? "Report Received | Jetzy" : "Error | Jetzy"}</title>
            </Head>

            {/* Background */}
            <div className="absolute inset-0 z-0 opacity-10 pointer-events-none">
                <Image src={BgImage} alt="Background" fill className="object-cover" priority />
            </div>

            {/* Header */}
            <header className="relative z-20 w-full bg-white pt-[13px] pb-[13px] shadow-sm flex justify-center items-center border-b border-gray-50">
                <div className="relative h-[89px] w-[90px]">
                    <Image src={LogoImage} alt="Jetzy Logo" fill className="object-contain" priority />
                </div>
            </header>

            {/* Main */}
            <main className="relative z-10 flex flex-col items-center justify-center p-4 sm:p-6 w-full max-w-none flex-1 mb-10">
                <div className="bg-white rounded-[20px] shadow-xl p-8 sm:p-14 flex flex-col items-center w-full max-w-[648px] transition-all duration-500 animate-in fade-in slide-in-from-bottom-4">

                    {isSuccess ? (
                        <>
                            {/* Success Icon */}
                            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
                                <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>

                            <h1 className="text-[28px] sm:text-[32px] font-semibold text-center mb-4 text-[#1A1A1A] tracking-[-0.02em] leading-tight">
                                Thank You for Reporting
                            </h1>

                            <p className="text-gray-500 text-center text-[16px] sm:text-[17px] font-normal leading-relaxed mb-6 max-w-[460px]">
                                We have received your report and <strong>the account has been blocked</strong>. Our compliance team has been notified and will review the account.
                            </p>

                            <div className="bg-green-50 border border-green-200 rounded-xl px-6 py-4 text-center mb-8 w-full max-w-[460px]">
                                <p className="text-green-700 text-sm leading-relaxed">
                                    ✅ Account flagged for compliance review<br />
                                    ✅ Our engineering team has been notified<br />
                                    ✅ Login has been blocked for this account
                                </p>
                            </div>

                            <p className="text-gray-400 text-sm mb-6 text-center">
                                Redirecting to signup in <span className="font-bold text-[#f99839]">{countdown}s</span>...
                            </p>

                            <Link
                                href="/jetzyqrsignup"
                                className="w-full max-w-[460px] h-[60px] rounded-full bg-[#f99839] text-[15px] font-bold text-white shadow-lg shadow-orange-200 hover:bg-[#faac5a] transition-all active:scale-[0.98] flex items-center justify-center"
                            >
                                Create a New Account
                            </Link>
                        </>
                    ) : (
                        <>
                            {/* Error Icon */}
                            <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-6">
                                <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </div>

                            <h1 className="text-[28px] sm:text-[32px] font-semibold text-center mb-4 text-[#1A1A1A] tracking-[-0.02em] leading-tight">
                                Something Went Wrong
                            </h1>

                            <p className="text-gray-500 text-center text-[16px] sm:text-[17px] font-normal leading-relaxed mb-8 max-w-[460px]">
                                We were unable to process your request. The link may have expired or is invalid. Please contact us at{" "}
                                <a href="mailto:marketing@jetzy.com" className="text-[#f99839] font-semibold">marketing@jetzy.com</a>.
                            </p>

                            <Link
                                href="/jetzyqrsignup"
                                className="w-full max-w-[460px] h-[60px] rounded-full bg-[#f99839] text-[15px] font-bold text-white shadow-lg shadow-orange-200 hover:bg-[#faac5a] transition-all active:scale-[0.98] flex items-center justify-center"
                            >
                                Go to Signup
                            </Link>
                        </>
                    )}
                </div>
            </main>

            <footer className="relative z-10 mt-auto py-8 text-center w-full">
                <p className="text-xs text-gray-500">
                    &copy; {new Date().getFullYear()} Jetzy Events, Inc. All rights reserved.
                </p>
            </footer>
        </div>
    )
}

import React, { useState, useEffect } from "react"
import Head from "next/head"
import Image from "next/image"
import { useRouter } from "next/router"
import { useSignup } from "@Jetzy/hooks/useSignup"
import { unauthorizedOnly } from "@Jetzy/lib/authSession"
import { GetServerSideProps } from "next"
import { FcGoogle } from "react-icons/fc"
import { AiFillApple } from "react-icons/ai"
import Spinner from "@Jetzy/components/misc/Spinner"

// Image Assets
import BgImage from "@Jetzy/assets/qrscanner signup/Rectangle background.png"
import HeroImage from "@Jetzy/assets/qrscanner signup/Rectangle 6002.png"
import LogoImage from "@Jetzy/assets/qrscanner signup/jetzy logo 2.png"
import SuccessIllustration from "@Jetzy/assets/qrscanner signup/Email campaign-pana 1.png"

type ViewState = "SIGNUP" | "SUCCESS"

const generateSecurePassword = () => {
    const length = 10
    const charset = {
        upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        lower: "abcdefghijklmnopqrstuvwxyz",
        numbers: "0123456789",
        special: "!@#$%^&*"
    }

    // Ensure at least one of each
    let password = ""
    password += charset.upper[Math.floor(Math.random() * charset.upper.length)]
    password += charset.lower[Math.floor(Math.random() * charset.lower.length)]
    password += charset.numbers[Math.floor(Math.random() * charset.numbers.length)]
    password += charset.special[Math.floor(Math.random() * charset.special.length)]

    const all = Object.values(charset).join("")
    for (let i = password.length; i < length; i++) {
        password += all[Math.floor(Math.random() * all.length)]
    }

    // Shuffle
    return password.split('').sort(() => 0.5 - Math.random()).join('')
}

export default function JetzyQRSignup() {
    const [view, setView] = useState<ViewState>("SIGNUP")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState("")
    const [isEditing, setIsEditing] = useState(false)
    const { isLoading, handleGoogleLogin, handleAppleLogin, handleEmailSignup, status, session } = useSignup({ disableAutoRedirect: true })
    const navigate = useRouter()

    // Handle social login success
    useEffect(() => {
        if (status === 'authenticated' && session && view === "SIGNUP" && !isEditing) {
            const userEmail = session.user?.email || ""
            if (userEmail) {
                setEmail(userEmail)
                // Trigger welcome email for social users too
                fetch("/api/welcome-email", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email: userEmail,
                        firstName: session.user?.name?.split(" ")[0] || "New",
                        lastName: session.user?.name?.split(" ")[1] || "Social User"
                    }),
                }).catch(err => console.error("Failed to send welcome email to social user:", err))
            }
            setView("SUCCESS")
        }
    }, [status, session, view, isEditing])

    const onSignupSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")

        if (!email || !email.includes("@")) {
            setError("Please enter a valid email address.")
            return
        }

        try {
            setIsEditing(false)
            const newPassword = generateSecurePassword()
            setPassword(newPassword)

            const res: any = await handleEmailSignup({
                email,
                password: newPassword,
                confirmPassword: newPassword,
                firstName: "New",
                lastName: "User",
                shouldBeAJetzyMember: false
            })

            // Check if payload status is true (success) or if it's an existing user flow
            if (res?.payload?.status) {
                setView("SUCCESS")
                // Call the welcome email API instead of server action
                fetch("/api/welcome-email", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, firstName: "New", lastName: "User", password: newPassword }),
                }).catch(err => console.error("Failed to send welcome email:", err))
            } else {
                // Handle specific error messages if needed
                setError(res?.payload?.message || "Something went wrong. Please try again.")
            }
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred.")
        }
    }

    const handleResend = async () => {
        if (email && password) {
            fetch("/api/welcome-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, firstName: "New", lastName: "User", password }),
            }).then(() => {
                alert("Welcome email resent to " + email)
            }).catch(err => {
                console.error("Failed to resend welcome email:", err)
                alert("Failed to resend email. Please try again later.")
            })
        }
    }

    const handleEditEmail = () => {
        setIsEditing(true)
        setView("SIGNUP")
    }

    return (
        <div className="relative min-h-screen w-full font-sans text-gray-900 overflow-hidden flex flex-col items-center bg-gradient-to-br from-[#fdf2f8] via-[#f5f3ff] to-[#f0f9ff]">
            <Head>
                <title>Welcome to Jetzy | Signup</title>
            </Head>

            {/* Background Image (Subtle overlay) */}
            <div className="absolute inset-0 z-0 opacity-10 pointer-events-none">
                <Image src={BgImage} alt="Background" fill className="object-cover" priority />
            </div>

            {/* Header with Logo */}
            <header className="relative z-20 w-full bg-white pt-[13px] pb-[13px] shadow-sm flex justify-center items-center border-b border-gray-50">
                <div className="relative h-[89px] w-[90px]">
                    <Image src={LogoImage} alt="Jetzy Logo" fill className="object-contain" priority />
                </div>
            </header>

            {/* Main Container */}
            <main className="relative z-10 flex flex-col items-center justify-center p-4 sm:p-6 w-full max-w-none flex-1 mb-10">
                {view === "SIGNUP" ? (
                    <div className="bg-white rounded-[20px] shadow-xl overflow-hidden w-full max-w-[648px] md:min-h-[828px] transition-all duration-500 animate-in fade-in slide-in-from-bottom-4 flex flex-col">
                        {/* Hero Image Container (Padding 8px) */}
                        <div className="p-2 w-full pb-0">
                            <div className="relative w-full aspect-[632/245] max-w-[632px] overflow-hidden rounded-[10px] mx-auto">
                                <Image src={HeroImage} alt="Travel Destinations" fill className="object-cover" priority />
                            </div>
                        </div>

                        {/* Form Content (Gap 20px - handled by mt-5/mb-5) */}
                        <div className="px-6 sm:px-12 py-8 flex flex-col items-center flex-1">
                            <h1 className="text-2xl sm:text-3xl font-bold text-center mb-1 text-[#1A1A1A]">Welcome to Jetzy</h1>
                            <p className="text-gray-500 text-center text-[14px] sm:text-[15px] mb-8 px-2 sm:px-6 leading-relaxed">
                                Create your Jetzy account in seconds and unlock a seamless travel experience.
                            </p>

                            {/* Email Form */}
                            <form onSubmit={onSignupSubmit} className="w-full flex flex-col items-center gap-1 mb-8">
                                <div className="w-full max-w-[559px]">
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="Enter your email address"
                                        className="w-full h-[64px] rounded-full border border-gray-200 bg-white px-6 text-[15px] focus:border-orange-300 focus:ring-4 focus:ring-orange-50/50 outline-none transition-all text-center placeholder:text-gray-400 shadow-sm"
                                        required
                                    />
                                    {error && <p className="text-red-500 text-xs mt-2 text-center">{error}</p>}
                                </div>
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full max-w-[559px] h-[64px] rounded-full bg-[#f99839] text-[15px] font-bold text-white shadow-lg shadow-orange-200 hover:bg-[#faac5a] transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center mt-3"
                                >
                                    {isLoading ? <Spinner /> : "Create My Jetzy Account"}
                                </button>
                            </form>

                            {/* Separator */}
                            <div className="w-full flex items-center gap-4 mb-8 text-[14px] font-medium text-gray-300 max-w-[559px]">
                                <div className="h-px flex-1 bg-gray-200"></div>
                                <span className="text-gray-400">Or</span>
                                <div className="h-px flex-1 bg-gray-200"></div>
                            </div>

                            {/* Social Buttons */}
                            <div className="w-full space-y-4 mb-10 max-w-[559px]">
                                <button
                                    onClick={() => { setIsEditing(false); handleGoogleLogin(); }}
                                    className="flex w-full items-center justify-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-3.5 text-[15px] font-semibold text-[#1A1A1A] hover:bg-gray-50 transition-colors shadow-sm"
                                >
                                    <FcGoogle className="h-6 w-6" />
                                    <span>Signup with Google</span>
                                </button>
                                <button
                                    onClick={() => { setIsEditing(false); handleAppleLogin(); }}
                                    className="flex w-full items-center justify-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-3.5 text-[15px] font-semibold text-[#1A1A1A] hover:bg-gray-50 transition-colors shadow-sm"
                                >
                                    <AiFillApple className="h-6 w-6 text-black" />
                                    <span>Signup with Apple</span>
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white rounded-[20px] shadow-xl p-6 sm:p-14 flex flex-col items-center w-full max-w-[648px] md:min-h-[828px] transition-all duration-500 animate-in zoom-in-95 flex-1">
                        <h1 className="text-[28px] sm:text-[32px] font-semibold text-center mb-4 text-[#1A1A1A] tracking-[-0.02em] leading-tight">
                            Check Your Email
                        </h1>
                        <p className="text-gray-500 text-center text-[16px] sm:text-[18px] font-normal tracking-[-0.01em] mb-8 max-w-[480px] leading-relaxed px-2 sm:px-4">
                            We&apos;ve sent you a temporary password to get started. Open your inbox and log in to begin your Jetzy experience.
                        </p>

                        {/* Success Illustration */}
                        <div className="relative w-full max-w-[577px] aspect-[577/385] h-auto mb-8">
                            <Image src={SuccessIllustration} alt="Email Sent" fill className="object-contain" />
                        </div>

                        <div className="w-full flex flex-col items-center mt-auto mb-6">
                            <div className="text-center mb-8 w-full max-w-[369px]">
                                <p className="text-[16px] sm:text-[18px] text-gray-400 font-normal tracking-[-0.01em] leading-relaxed text-center">
                                    Didn&apos;t receive it? Check your spam folder or resend the email.
                                </p>
                            </div>

                            <button
                                onClick={handleResend}
                                className="w-full max-w-[558px] h-[73px] rounded-full bg-[#f99839] text-[18px] font-bold text-white shadow-lg shadow-orange-100 hover:bg-[#faac5a] transition-all active:scale-[0.98] flex items-center justify-center mb-4"
                            >
                                Resend Email
                            </button>
                            <button
                                onClick={handleEditEmail}
                                className="w-full max-w-[558px] h-[73px] rounded-full border border-[#161616] text-[18px] font-bold text-gray-600 hover:bg-gray-50 transition-all active:scale-[0.98] flex items-center justify-center"
                            >
                                Edit Email
                            </button>
                        </div>
                    </div>
                )}
            </main>

            <footer className="relative z-10 mt-auto py-8 text-center w-full">
                <p className="text-xs text-gray-500">
                    By creating an account, you agree to our Terms of Service and Privacy Policy.
                </p>
            </footer>
        </div>
    )
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
    return unauthorizedOnly(context)
}

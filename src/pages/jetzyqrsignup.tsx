import React, { useState } from "react"
import Head from "next/head"
import Image from "next/image"
import { useRouter } from "next/router"
import { useSignup } from "@Jetzy/hooks/useSignup"
import { GetServerSideProps } from "next"
import { FcGoogle } from "react-icons/fc"
import { AiFillApple } from "react-icons/ai"
import { HiLocationMarker } from "react-icons/hi"
import Spinner from "@Jetzy/components/misc/Spinner"
import { usePlacesWidget } from "react-google-autocomplete"
import { VerifyReferralCodeApi } from "@Jetzy/services/auth/authapis"
import { isSignupTrialCode, signupTrialOffer } from "@/lib/invite-trial"
import { useAnalytics } from "@/contexts/AnalyticsContext"

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

    let password = ""
    password += charset.upper[Math.floor(Math.random() * charset.upper.length)]
    password += charset.lower[Math.floor(Math.random() * charset.lower.length)]
    password += charset.numbers[Math.floor(Math.random() * charset.numbers.length)]
    password += charset.special[Math.floor(Math.random() * charset.special.length)]

    const all = Object.values(charset).join("")
    for (let i = password.length; i < length; i++) {
        password += all[Math.floor(Math.random() * all.length)]
    }

    return password.split('').sort(() => 0.5 - Math.random()).join('')
}

export default function JetzyQRSignup() {
    const { isLoading, handleGoogleLogin, handleAppleLogin, handleEmailSignup, status, session } = useSignup({ disableAutoRedirect: true })
    const navigate = useRouter()
    const { sessionId } = useAnalytics()

    // Signup attribution — stamped on the EventUsers record so the QR signup
    // analytics page can tell these apart from /signup accounts.
    const SIGNUP_SOURCE = "jetzyqrsignup"

    const [view, setView] = useState<ViewState>("SIGNUP")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState("")
    const [isEditing, setIsEditing] = useState(false)
    const [isGoogleLoading, setIsGoogleLoading] = useState(false)
    const [isAppleLoading, setIsAppleLoading] = useState(false)
    const [inviteCode, setInviteCode] = useState("")
    const [isVerifyingCode, setIsVerifyingCode] = useState(false)

    // Location state
    const [locationText, setLocationText] = useState("")
    const [locationData, setLocationData] = useState<{
        lat: number | null
        lng: number | null
        placeId: string
    }>({ lat: null, lng: null, placeId: "" })

    const isAnyLoading = isLoading || isGoogleLoading || isAppleLoading || isVerifyingCode

    // Google Places Autocomplete — allows both dropdown selection AND manual typing
    const { ref: locationRef } = usePlacesWidget<HTMLInputElement>({
        apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
        onPlaceSelected: (place) => {
            const address = place.formatted_address || place.name || ""
            const lat = place.geometry?.location?.lat() ?? null
            const lng = place.geometry?.location?.lng() ?? null
            const placeId = place.place_id || ""

            setLocationText(address)
            setLocationData({ lat, lng, placeId })
        },
        options: {
            fields: ["formatted_address", "geometry", "place_id", "name", "address_components"],
            // No `types` restriction — allow cities, addresses, landmarks, anything
        },
    })

    const validateEmail = (email: string) => {
        return String(email)
            .toLowerCase()
            .match(
                /^(([^<>()[\]\\.,;:\s@"]+(.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
            );
    };

    const onSignupSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")

        if (!email || !validateEmail(email)) {
            setError("Please enter a valid email address (e.g., name@domain.com).")
            return
        }

        if (!locationText.trim()) {
            setError("Please enter your address.")
            return
        }

        // Optional invite code — validate live only when provided
        // A membership invite code isn't a referral code — the backend has never heard of it,
        // so verifying it there would reject a valid code and stop the signup.
        if (inviteCode.trim() && !isSignupTrialCode(inviteCode)) {
            setIsVerifyingCode(true)
            const ok = await VerifyReferralCodeApi(inviteCode.trim())
            setIsVerifyingCode(false)
            if (!ok) {
                setError("Invalid invite code. Please check and try again, or leave it blank.")
                return
            }
        }

        createAccount()
    }

    const createAccount = async () => {
        try {
            setIsEditing(false)
            const newPassword = generateSecurePassword()
            setPassword(newPassword)

            // No name is collected on this form — derive one from the email
            // local-part (e.g. "foo@bar.com" -> "foo") so emails greet the user
            // properly instead of "Hi New".
            const derivedName = email.split("@")[0]?.trim() || "Traveler"

            const res: any = await handleEmailSignup({
                email,
                password: newPassword,
                confirmPassword: newPassword,
                firstName: derivedName,
                lastName: "",
                shouldBeAJetzyMember: false,
                acceptedTerms: true,
                skipToast: true, // Suppress global unprofessional-looking alert
                // Location data
                location: locationText,
                ...(locationData.lat !== null && { latitude: locationData.lat }),
                ...(locationData.lng !== null && { longitude: locationData.lng }),
                ...(locationData.placeId && { placeId: locationData.placeId }),
                refCode: inviteCode.trim() || "",
                signupSource: SIGNUP_SOURCE,
                ...(sessionId && { signupSessionId: sessionId }),
            })

            // Redux thunk returns the action object. If it failed, it has `error`. 
            // If it used `rejectWithValue`, it's in `payload`.
            if (res?.meta?.requestStatus === "fulfilled" && res?.payload?.status) {
                setView("SUCCESS")
                fetch("/api/welcome-email", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, firstName: derivedName, lastName: "", password: newPassword }),
                }).catch(err => console.error("Failed to send welcome email:", err))
            } else {
                // Extract error message from thunk result
                // Thunk error is often in res.error.message or res.payload.message
                const errorMessage = res?.payload?.message || res?.error?.message || "Something went wrong. Please try again."
                
                if (errorMessage.toLowerCase().includes("already a member")) {
                    setError("You are already a member! Please log in to your account.")
                } else {
                    setError(errorMessage)
                }
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
                        {/* Hero Image */}
                        <div className="p-2 w-full pb-0">
                            <div className="relative w-full aspect-[632/245] max-w-[632px] overflow-hidden rounded-[10px] mx-auto">
                                <Image src={HeroImage} alt="Travel Destinations" fill className="object-cover" priority />
                            </div>
                        </div>

                        {/* Form Content */}
                        <div className="px-6 sm:px-12 py-8 flex flex-col items-center flex-1">
                            <h1 className="text-2xl sm:text-3xl font-bold text-center mb-1 text-[#1A1A1A]">Welcome to Jetzy</h1>
                            <p className="text-gray-500 text-center text-[14px] sm:text-[15px] mb-8 px-2 sm:px-6 leading-relaxed">
                                Jetzy is an &quot;invite-only&quot; social club where you can access VIP perks and exclusive discounts of up to 70% for travel &amp; leisure.
                            </p>

                            {/* Signup Form */}
                            <form onSubmit={onSignupSubmit} className="w-full flex flex-col items-center gap-1 mb-8">
                                {/* Invite Code Field (optional) — first box */}
                                <div className="w-full max-w-[559px]">
                                    <input
                                        id="signup-invite-code"
                                        type="text"
                                        value={inviteCode}
                                        onChange={(e) => setInviteCode(e.target.value)}
                                        placeholder="Enter your invite code (optional)"
                                        className="w-full h-[64px] rounded-full border border-gray-200 bg-white px-6 text-[15px] focus:border-orange-300 focus:ring-4 focus:ring-orange-50/50 outline-none transition-all text-center placeholder:text-gray-400 shadow-sm"
                                        autoComplete="off"
                                    />
                                    {/* A membership code is worth something concrete — say so before
                                        they submit, from the same table the server grants from. */}
                                    {signupTrialOffer(inviteCode) && (
                                        <p className="mt-2 text-center text-sm font-semibold text-green-600">
                                            ✓ {signupTrialOffer(inviteCode)?.label} of Jetzy Premium, added to your new account.
                                        </p>
                                    )}
                                </div>

                                <div className="w-full max-w-[559px]">
                                    {/* Email Field */}
                                    <input
                                        id="signup-email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="Enter your email address"
                                        className="w-full h-[64px] rounded-full border border-gray-200 bg-white px-6 text-[15px] focus:border-orange-300 focus:ring-4 focus:ring-orange-50/50 outline-none transition-all text-center placeholder:text-gray-400 shadow-sm"
                                        required
                                    />
                                </div>

                                {/* Location Field */}
                                <div className="w-full max-w-[559px] relative">
                                    <input
                                        id="signup-location"
                                        ref={locationRef}
                                        type="text"
                                        value={locationText}
                                        onChange={(e) => {
                                            setLocationText(e.target.value)
                                            // Reset coords if user types manually (no autocomplete selected)
                                            setLocationData({ lat: null, lng: null, placeId: "" })
                                        }}
                                        placeholder="Enter your location"
                                        className="w-full h-[64px] rounded-full border border-gray-200 bg-white px-6 text-[15px] focus:border-orange-300 focus:ring-4 focus:ring-orange-50/50 outline-none transition-all text-center placeholder:text-gray-400 shadow-sm"
                                        autoComplete="off"
                                    />
                                </div>

                                {error && (
                                    <div className="w-full max-w-[559px] bg-red-50 border border-red-100 rounded-lg p-3 animate-in fade-in zoom-in-95">
                                        <p className="text-red-600 text-[13px] sm:text-[14px] font-medium text-center leading-relaxed">
                                            {error}
                                        </p>
                                    </div>
                                )}

                                <button
                                    id="signup-submit"
                                    type="submit"
                                    disabled={isAnyLoading}
                                    className="w-full max-w-[559px] h-[64px] rounded-full bg-[#f99839] text-[15px] font-bold text-white shadow-lg shadow-orange-200 hover:bg-[#faac5a] transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center mt-1"
                                >
                                    {isAnyLoading ? <Spinner /> : "Create My Jetzy Account"}
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
                                    id="signup-google"
                                    disabled={isAnyLoading}
                                    onClick={async () => {
                                        setIsEditing(false);
                                        setIsGoogleLoading(true);
                                        const res = await handleGoogleLogin({ skipToast: true, signupSource: SIGNUP_SOURCE, signupSessionId: sessionId || undefined });
                                        setIsGoogleLoading(false);
                                        if (!res.success) {
                                            setError(res.error || "Google signup failed. Please try again.");
                                        }
                                    }}
                                    className="flex w-full items-center justify-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-3.5 text-[15px] font-semibold text-[#1A1A1A] hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
                                >
                                    {isGoogleLoading ? <Spinner /> : (
                                        <>
                                            <FcGoogle className="h-6 w-6" />
                                            <span>Signup with Google</span>
                                        </>
                                    )}
                                </button>
                                <button
                                    id="signup-apple"
                                    disabled={isAnyLoading}
                                    onClick={async () => {
                                        setIsEditing(false);
                                        setIsAppleLoading(true);
                                        const res = await handleAppleLogin({ skipToast: true, signupSource: SIGNUP_SOURCE, signupSessionId: sessionId || undefined });
                                        setIsAppleLoading(false);
                                        if (!res.success) {
                                            setError(res.error || "Apple signup failed. Please try again.");
                                        }
                                    }}
                                    className="flex w-full items-center justify-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-3.5 text-[15px] font-semibold text-[#1A1A1A] hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
                                >
                                    {isAppleLoading ? <Spinner /> : (
                                        <>
                                            <AiFillApple className="h-6 w-6 text-black" />
                                            <span>Signup with Apple</span>
                                        </>
                                    )}
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
                            Check your inbox for your welcome email. Download the Jetzy app and log in with your email address &mdash; the first time, use &quot;Forgot Password&quot; to set your password.
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
                                id="resend-email"
                                onClick={handleResend}
                                className="w-full max-w-[558px] h-[73px] rounded-full bg-[#f99839] text-[18px] font-bold text-white shadow-lg shadow-orange-100 hover:bg-[#faac5a] transition-all active:scale-[0.98] flex items-center justify-center mb-4"
                            >
                                Resend Email
                            </button>
                            <button
                                id="edit-email"
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
    return { props: {} }
}


import React, { useState } from "react"
import { GetServerSideProps } from "next"
import Head from "next/head"
import Image from "next/image"
import { getPublicUserAction } from "@Jetzy/actions/get-public-user-action"
import { FiShare2, FiDownload, FiCheck, FiCopy } from "react-icons/fi"
import { FaApple, FaGooglePlay } from "react-icons/fa"
import Logo from "@Jetzy/assets/logo/logo.png"
import { toast } from "react-toastify"

interface ProfilePageProps {
    user: {
        firstName: string
        lastName: string
        image?: string
        _id: string
    } | null
    baseUrl: string
}

export default function UserProfilePage({ user, baseUrl }: ProfilePageProps) {
    const [copied, setCopied] = useState(false)

    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black text-white p-6">
                <div className="text-center">
                    <h1 className="text-4xl font-bold mb-4">User Not Found</h1>
                    <p className="text-gray-400">The profile you are looking for does not exist or has been removed.</p>
                </div>
            </div>
        )
    }

    const profileUrl = `${baseUrl}/profile/${user._id}`
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(profileUrl)}`

    const APP_STORE_LINK = "https://apps.apple.com/us/app/jetzy-connect-travel-enjoy/id1019546379"
    const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.icreon.travelconnect"

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `${user.firstName} ${user.lastName}'s Jetzy Profile`,
                    url: profileUrl,
                })
            } catch (err) {
                console.log("Error sharing", err)
            }
        } else {
            copyToClipboard()
        }
    }

    const copyToClipboard = () => {
        navigator.clipboard.writeText(profileUrl)
        setCopied(true)
        toast.success("Link copied to clipboard!")
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white font-sans selection:bg-app/30">
            <Head>
                <title>{`${user.firstName} ${user.lastName} | Jetzy Profile`}</title>
                <meta name="description" content={`Connect with ${user.firstName} on Jetzy`} />
            </Head>

            {/* Background Gradient Orbs */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-app/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px]" />
            </div>

            <div className="relative z-10 max-w-lg mx-auto px-6 py-12 flex flex-col items-center">
                {/* Logo */}
                <div className="mb-12">
                    <Image src={Logo} alt="Jetzy" width={120} height={40} className="object-contain" priority />
                </div>

                {/* Profile Card */}
                <div className="w-full bg-[#161616] rounded-3xl p-8 border border-white/5 shadow-2xl backdrop-blur-sm relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <div className="relative z-10 flex flex-col items-center">
                        {/* Profile Image */}
                        <div className="relative w-32 h-32 mb-6 p-1 rounded-full bg-gradient-to-tr from-app to-purple-500 shadow-xl shadow-app/20">
                            <div className="w-full h-full rounded-full overflow-hidden bg-[#222]">
                                {user.image ? (
                                    <Image
                                        src={user.image}
                                        alt={`${user.firstName} ${user.lastName}`}
                                        fill
                                        className="object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-4xl font-bold bg-[#222] text-white/20">
                                        {user.firstName[0]}{user.lastName[0]}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Name */}
                        <h1 className="text-3xl font-bold text-center mb-1 tracking-tight">
                            {user.firstName} {user.lastName}
                        </h1>
                        <p className="text-gray-400 text-sm mb-8">Jetzy Member</p>

                        {/* QR Code Section */}
                        <div className="w-full mb-8 p-6 bg-white rounded-2xl flex flex-col items-center shadow-inner">
                            <div className="relative w-48 h-48 mb-4">
                                <img id="qr-code-img" src={qrCodeUrl} alt="QR Code" className="w-full h-full object-contain" />
                            </div>
                            <button
                                onClick={() => {
                                    const link = document.createElement('a');
                                    link.href = qrCodeUrl;
                                    link.download = `jetzy-profile-qr-${user.firstName}.png`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    toast.success("QR Code download started!");
                                }}
                                className="text-app text-xs font-bold uppercase tracking-widest hover:underline flex items-center gap-1"
                            >
                                <FiDownload /> Download QR Code
                            </button>
                        </div>

                        {/* Connect Button */}
                        <button
                            onClick={() => toast.info(`To connect with ${user.firstName}, please download the Jetzy app using the links below!`)}
                            className="w-full py-4 bg-app hover:bg-app/90 text-black font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-app/20 mb-4"
                        >
                            Connect with Member
                        </button>

                        {/* Share Button */}
                        <button
                            onClick={handleShare}
                            className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] border border-white/10"
                        >
                            {copied ? <FiCheck className="text-app" /> : <FiShare2 />}
                            {copied ? "Link Copied" : "Share Profile Link"}
                        </button>
                    </div>
                </div>

                {/* Download Apps Section */}
                <div className="mt-12 w-full text-center">
                    <p className="text-gray-400 text-sm mb-6 uppercase tracking-widest font-medium">Experience Jetzy</p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <a
                            href={APP_STORE_LINK}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-3 px-6 py-3 bg-[#161616] hover:bg-[#222] rounded-xl border border-white/10 transition-colors group"
                        >
                            <FaApple className="text-2xl group-hover:text-app transition-colors" />
                            <div className="text-left">
                                <p className="text-[10px] uppercase leading-none opacity-50">Download on</p>
                                <p className="text-sm font-bold leading-tight">App Store</p>
                            </div>
                        </a>
                        <a
                            href={PLAY_STORE_LINK}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-3 px-6 py-3 bg-[#161616] hover:bg-[#222] rounded-xl border border-white/10 transition-colors group"
                        >
                            <FaGooglePlay className="text-xl group-hover:text-app transition-colors" />
                            <div className="text-left">
                                <p className="text-[10px] uppercase leading-none opacity-50">Get it on</p>
                                <p className="text-sm font-bold leading-tight">Google Play</p>
                            </div>
                        </a>
                    </div>
                </div>

                {/* Footer */}
                <footer className="mt-16 text-gray-600 text-[10px] uppercase tracking-[0.2em]">
                    &copy; {new Date().getFullYear()} Jetzy Life Inc.
                </footer>
            </div>
        </div>
    )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
    const { id } = context.params as { id: string }
    const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"

    const result = await getPublicUserAction(id)

    return {
        props: {
            user: result.status ? result.data : null,
            baseUrl,
        },
    }
}

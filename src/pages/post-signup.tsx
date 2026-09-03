import React from "react"
import { useRouter } from "next/router"
import Image from "next/image"
import QRCode from "react-qr-code"
import Logo from "@Jetzy/assets/logo/logo.png"

const APP_STORE_LINK = "https://apps.apple.com/us/app/jetzy-connect-travel-enjoy/id1019546379"
const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.icreon.travelconnect"
const DOWNLOAD_LINK = "https://jetzyapp.com/download.html"

export default function PostSignupPage() {
	const router = useRouter()
	// Free months waiting behind the verification link, put here by /signup when an invite code
	// was used. Read from the URL so a refresh doesn't drop it.
	const trialMonths = Number(router.query.trial) || 0

	return (
		<div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
			<div className="w-full max-w-md text-center">
				<Image className="mx-auto h-20 w-auto" src={Logo} alt="Jetzy Life" />
				<h1 className="mt-8 text-3xl font-bold leading-tight">You&apos;re in!</h1>
				<p className="mt-3 text-base text-gray-300">
					Check your inbox for the verification link. Meanwhile, get the Jetzy app.
				</p>

				{/* What the invite code is worth, stated where the person is actually looking.
				    Deliberately "waiting" rather than "active": the membership is created when the
				    link is followed, and telling someone they already have it would be a lie for as
				    long as the email sits unopened. */}
				{trialMonths > 0 && (
					<div
						className="mt-6 rounded-2xl p-4 text-left"
						style={{ background: "rgba(245,197,24,0.10)", border: "1px solid rgba(245,197,24,0.45)" }}
					>
						<p className="font-semibold" style={{ color: "#F5C518" }}>
							🎁 {trialMonths} month{trialMonths === 1 ? "" : "s"} of Jetzy Premium are waiting
						</p>
						<p className="mt-1 text-sm text-gray-300">
							Your invite code adds them the moment you verify your email. Nothing to
							cancel — the membership simply ends after {trialMonths === 1 ? "the month" : `the ${trialMonths} months`}{" "}
							unless you choose to keep it.
						</p>
					</div>
				)}

				<div className="mt-8 bg-white p-6 rounded-2xl inline-block">
					<QRCode value={DOWNLOAD_LINK} size={200} />
				</div>
				<p className="mt-3 text-sm text-gray-400">Scan with your phone camera</p>

				<div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center items-center">
					<a
						href={APP_STORE_LINK}
						target="_blank"
						rel="noopener noreferrer"
						style={{ width: 160, height: 48, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
					>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src="/email/appstore-badge.svg"
							alt="Download on the App Store"
							style={{ width: "100%", height: "100%", objectFit: "contain" }}
						/>
					</a>
					<a
						href={PLAY_STORE_LINK}
						target="_blank"
						rel="noopener noreferrer"
						style={{ width: 160, height: 48, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
					>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src="/email/googleplay-badge.png"
							alt="Get it on Google Play"
							style={{ width: "100%", height: "100%", objectFit: "contain" }}
						/>
					</a>
				</div>
			</div>
		</div>
	)
}

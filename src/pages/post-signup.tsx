import React from "react"
import Image from "next/image"
import QRCode from "react-qr-code"
import Logo from "@Jetzy/assets/logo/logo.png"

const APP_STORE_LINK = "https://apps.apple.com/us/app/jetzy-connect-travel-enjoy/id1019546379"
const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.icreon.travelconnect"
const DOWNLOAD_LINK = "https://jetzyapp.com/download.html"

export default function PostSignupPage() {
	return (
		<div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
			<div className="w-full max-w-md text-center">
				<Image className="mx-auto h-20 w-auto" src={Logo} alt="Jetzy Life" />
				<h1 className="mt-8 text-3xl font-bold leading-tight">You&apos;re in!</h1>
				<p className="mt-3 text-base text-gray-300">
					Check your inbox for the verification link. Meanwhile, get the Jetzy app.
				</p>

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
